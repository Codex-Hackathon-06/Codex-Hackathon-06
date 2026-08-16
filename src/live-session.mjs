import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  PCM_FRAME_BYTES,
  PcmFrameBuffer,
  RealtimeTranscriptAssembler,
} from "./realtime-chunks.mjs";
import {
  LIVE_TRANSCRIPTION_MODEL,
  OpenAIRealtimeTranscription,
} from "./realtime-openai.mjs";
import { writeLiveSession } from "./live-output.mjs";
import { missingOpenAIApiKeyError, resolveOpenAIApiKey } from "./env.mjs";

const HELPER_READY_TIMEOUT_MS = 60_000;
const STOP_FLUSH_TIMEOUT_MS = 5_000;
const CLIENT_COMMIT_INTERVAL_MS = 5_000;
const MAX_BUFFERED_FRAMES = 50;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function withCode(error, code) {
  if (!error.code) error.code = code;
  return error;
}

export class LiveSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiKey = resolveOpenAIApiKey(options.apiKey);
    this.helperPath = resolve(options.helperPath ?? "work/bin/lecscape-system-audio");
    this.outputsRoot = resolve(options.outputsRoot ?? "outputs/live");
    this.prompt = options.prompt;
    this.keywords = options.keywords ?? [];
    this.transcriptionModel = options.transcriptionModel ?? LIVE_TRANSCRIPTION_MODEL;
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.clientFactory = options.clientFactory ?? ((clientOptions) => new OpenAIRealtimeTranscription(clientOptions));
    this.now = options.now ?? (() => performance.now());
    this.delay = options.delay ?? delay;
    this.helperReadyTimeoutMs = options.helperReadyTimeoutMs ?? HELPER_READY_TIMEOUT_MS;
    this.stopFlushTimeoutMs = options.stopFlushTimeoutMs ?? STOP_FLUSH_TIMEOUT_MS;
    this.stopInitialWaitMs = options.stopInitialWaitMs ?? 750;
    this.commitIntervalMs = options.commitIntervalMs ?? CLIENT_COMMIT_INTERVAL_MS;
    this.setIntervalImpl = options.setIntervalImpl ?? setInterval;
    this.clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
    this.state = "Idle";
    this.child = null;
    this.client = null;
    this.assembler = null;
    this.framer = null;
    this.queuedFrames = [];
    this.clientReady = false;
    this.stopping = false;
    this.sentAudio = false;
    this.startedAt = null;
    this.commitTimer = null;
  }

  emitMessage(type, payload = {}) {
    const message = { type, ...payload };
    this.emit("message", message);
    return message;
  }

  setState(state, detail) {
    this.state = state;
    this.emitMessage("state", { state, detail });
  }

  snapshot() {
    return {
      state: this.state,
      chunks: this.assembler?.chunks() ?? [],
    };
  }

  async start() {
    if (!new Set(["Idle", "Stopped", "Error"]).has(this.state)) {
      const error = new Error(`Cannot start while session state is ${this.state}`);
      error.code = "LIVE_SESSION_ALREADY_ACTIVE";
      throw error;
    }
    if (!this.apiKey) {
      const error = missingOpenAIApiKeyError();
      this.reportError(error);
      throw error;
    }

    this.stopping = false;
    this.clientReady = false;
    this.sentAudio = false;
    this.queuedFrames = [];
    this.startedAt = null;
    this.assembler = new RealtimeTranscriptAssembler({ now: this.now, startedAt: this.now() });
    this.framer = new PcmFrameBuffer();
    this.setState("Requesting Permission", "macOS 시스템 오디오 권한 확인 중");

    try {
      await this.startHelper();
      this.setState("Connecting", `전사 전용 세션 → ${this.transcriptionModel}`);
      this.client = this.clientFactory({
        apiKey: this.apiKey,
        transcriptionModel: this.transcriptionModel,
        prompt: this.prompt,
        keywords: this.keywords,
      });
      this.client.on("event", (event) => this.handleRealtimeEvent(event));
      this.client.on("error", (error) => {
        if (!this.stopping) this.fail(error);
      });
      await this.client.connect();
      this.startedAt = new Date();
      this.assembler.startedAt = this.now();
      this.clientReady = true;
      for (const frame of this.queuedFrames.splice(0)) this.sendFrame(frame);
      this.startCommitTimer();
      this.setState("Listening", "강의를 00:00부터 재생하세요");
      return this.snapshot();
    } catch (error) {
      await this.cleanup();
      this.reportError(error);
      throw error;
    }
  }

  startHelper() {
    return new Promise((resolveReady, rejectReady) => {
      let settled = false;
      const settleReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveReady();
      };
      const settleError = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        rejectReady(error);
      };
      const timeout = setTimeout(() => {
        settleError(withCode(new Error("시스템 오디오 helper가 준비되지 않았습니다."), "HELPER_READY_TIMEOUT"));
      }, this.helperReadyTimeoutMs);

      const child = this.spawnImpl(this.helperPath, [], { stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      const decoder = new StringDecoder("utf8");
      let stderrBuffer = "";

      child.stdout.on("data", (data) => {
        for (const frame of this.framer.push(data)) {
          if (this.clientReady) this.sendFrame(frame);
          else {
            this.queuedFrames.push(frame);
            if (this.queuedFrames.length > MAX_BUFFERED_FRAMES) this.queuedFrames.shift();
          }
        }
      });
      child.stderr.on("data", (data) => {
        stderrBuffer += decoder.write(data);
        let newline;
        while ((newline = stderrBuffer.indexOf("\n")) >= 0) {
          const line = stderrBuffer.slice(0, newline).trim();
          stderrBuffer = stderrBuffer.slice(newline + 1);
          if (!line) continue;
          let status;
          try {
            status = JSON.parse(line);
          } catch {
            continue;
          }
          if (status.type === "ready") settleReady();
          else if (status.type === "permission_required") {
            settleError(withCode(new Error(status.message), status.code));
          } else if (status.type === "error") {
            const error = withCode(new Error(status.message), status.code ?? "CAPTURE_ERROR");
            if (!settled) settleError(error);
            else if (!this.stopping) this.fail(error);
          }
        }
      });
      child.once("error", (error) => settleError(withCode(error, "HELPER_SPAWN_FAILED")));
      child.once("exit", (code, signal) => {
        this.child = null;
        if (this.stopping) return;
        const error = withCode(
          new Error(`시스템 오디오 helper가 종료됐습니다 (${signal ?? code}).`),
          "HELPER_EXITED",
        );
        if (!settled) settleError(error);
        else this.fail(error);
      });
    });
  }

  sendFrame(frame) {
    if (!this.clientReady || !this.client) return;
    this.client.appendPcm(frame);
    this.sentAudio = true;
  }

  startCommitTimer() {
    this.clearCommitTimer();
    this.commitTimer = this.setIntervalImpl(() => {
      if (!this.clientReady || !this.client || this.stopping) return;
      try {
        this.client.commit();
      } catch (error) {
        this.fail(error);
      }
    }, this.commitIntervalMs);
  }

  clearCommitTimer() {
    if (!this.commitTimer) return;
    this.clearIntervalImpl(this.commitTimer);
    this.commitTimer = null;
  }

  handleRealtimeEvent(event) {
    const chunk = this.assembler.processEvent(event);
    if (chunk) this.emitMessage("transcript", { chunk });
  }

  async stop() {
    if (!new Set(["Requesting Permission", "Connecting", "Listening"]).has(this.state)) {
      return null;
    }
    this.stopping = true;
    this.clearCommitTimer();
    if (this.child) this.child.kill("SIGTERM");
    for (const frame of this.framer?.flush() ?? []) {
      if (this.clientReady) this.sendFrame(frame);
    }

    if (this.clientReady && this.client && this.sentAudio) {
      try {
        this.client.commit();
      } catch {
        // A VAD turn may already have committed the buffer.
      }
      const deadline = Date.now() + this.stopFlushTimeoutMs;
      await this.delay(this.stopInitialWaitMs);
      while (this.assembler.hasPending() && Date.now() < deadline) await this.delay(100);
    }

    this.client?.close();
    this.client = null;
    this.clientReady = false;
    const stoppedAt = new Date();
    const result = await writeLiveSession({
      outputsRoot: this.outputsRoot,
      chunks: this.assembler.finalChunks(),
      startedAt: this.startedAt,
      stoppedAt,
      model: this.transcriptionModel,
      commitIntervalMs: this.commitIntervalMs,
    });
    this.setState("Stopped", `${result.sessionId} · ${result.chunksPath}`);
    this.emitMessage("session_complete", { ...result, chunks: this.assembler.finalChunks() });
    return result;
  }

  async cleanup() {
    this.stopping = true;
    this.clearCommitTimer();
    if (this.child) this.child.kill("SIGTERM");
    this.child = null;
    this.client?.close();
    this.client = null;
    this.clientReady = false;
  }

  reportError(error) {
    this.setState("Error", error.message);
    this.emitMessage("error", {
      code: error.code ?? "LIVE_SESSION_ERROR",
      message: error.message,
      recoverable: true,
    });
  }

  async fail(error) {
    if (this.state === "Error" || this.stopping) return;
    await this.cleanup();
    this.reportError(error);
  }
}

export { PCM_FRAME_BYTES };
