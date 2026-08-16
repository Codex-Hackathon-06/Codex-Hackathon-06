import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { LiveSession, PCM_FRAME_BYTES } from "../src/live-session.mjs";

class FakeChild extends EventEmitter {
  constructor({ permissionError = false } = {}) {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    queueMicrotask(() => {
      if (permissionError) {
        this.stderr.write(`${JSON.stringify({
          type: "permission_required",
          code: "SCREEN_RECORDING_PERMISSION_REQUIRED",
          message: "권한 필요",
        })}\n`);
      } else {
        this.stderr.write(`${JSON.stringify({ type: "ready" })}\n`);
        this.stdout.write(Buffer.alloc(PCM_FRAME_BYTES, 4));
      }
    });
  }

  kill() {
    queueMicrotask(() => this.emit("exit", 0, "SIGTERM"));
    return true;
  }
}

class FakeRealtimeClient extends EventEmitter {
  constructor() {
    super();
    this.frames = [];
    this.commits = 0;
    this.closed = false;
  }
  async connect() {}
  appendPcm(frame) { this.frames.push(frame); }
  commit() { this.commits += 1; }
  close() { this.closed = true; }
}

test("reports a missing server API key without spawning the helper", async () => {
  let spawned = false;
  const session = new LiveSession({ apiKey: "", spawnImpl: () => { spawned = true; } });
  const messages = [];
  session.on("message", (message) => messages.push(message));
  await assert.rejects(session.start(), (error) => error.code === "OPENAI_API_KEY_MISSING");
  assert.equal(spawned, false);
  assert.equal(session.state, "Error");
  assert.equal(messages.at(-1).type, "error");
});

test("captures, assembles and persists only final realtime chunks", async () => {
  const outputsRoot = await mkdtemp(join(tmpdir(), "lecscape-live-session-"));
  const client = new FakeRealtimeClient();
  let realtimeOptions;
  let commitTick;
  let timerCleared = false;
  let now = 0;
  const session = new LiveSession({
    apiKey: "test-key",
    outputsRoot,
    spawnImpl: () => new FakeChild(),
    clientFactory: (options) => {
      realtimeOptions = options;
      return client;
    },
    now: () => now,
    delay: async () => {},
    stopInitialWaitMs: 0,
    setIntervalImpl: (callback, milliseconds) => {
      assert.equal(milliseconds, 5_000);
      commitTick = callback;
      return { timer: true };
    },
    clearIntervalImpl: () => {
      timerCleared = true;
    },
  });
  const states = [];
  session.on("message", (message) => {
    if (message.type === "state") states.push(message.state);
  });

  await session.start();
  assert.equal("sessionModel" in realtimeOptions, false);
  assert.equal(realtimeOptions.transcriptionModel, "gpt-live-transcribe");
  assert.equal(client.frames.length, 1);
  assert.equal(client.frames[0].length, 4_800);
  commitTick();
  assert.equal(client.commits, 1);
  now = 100;
  client.emit("event", { type: "input_audio_buffer.speech_started", item_id: "item-1" });
  now = 300;
  client.emit("event", {
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "item-1",
    delta: "실시간 ",
  });
  now = 900;
  client.emit("event", {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-1",
    transcript: "실시간 자막입니다.",
  });

  const result = await session.stop();
  const chunks = JSON.parse(await readFile(result.chunksPath, "utf8"));
  assert.deepEqual(states, ["Requesting Permission", "Connecting", "Listening", "Stopped"]);
  assert.equal(client.commits, 2);
  assert.equal(timerCleared, true);
  assert.equal(client.closed, true);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].id, "seg-0001");
  assert.equal(chunks[0].text, "실시간 자막입니다.");
  assert.equal(chunks[0].isFinal, true);
});

test("surfaces macOS permission errors and closes the helper", async () => {
  const session = new LiveSession({
    apiKey: "test-key",
    spawnImpl: () => new FakeChild({ permissionError: true }),
    helperReadyTimeoutMs: 100,
  });
  const messages = [];
  session.on("message", (message) => messages.push(message));
  await assert.rejects(
    session.start(),
    (error) => error.code === "SCREEN_RECORDING_PERMISSION_REQUIRED",
  );
  assert.equal(session.state, "Error");
  assert.equal(messages.at(-1).code, "SCREEN_RECORDING_PERMISSION_REQUIRED");
});

test("moves to Error when the audio helper exits unexpectedly", async () => {
  const child = new FakeChild();
  const session = new LiveSession({
    apiKey: "test-key",
    spawnImpl: () => child,
    clientFactory: () => new FakeRealtimeClient(),
  });
  session.on("message", () => {});
  await session.start();
  child.emit("exit", 1, null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.state, "Error");
});

test("moves to Error on a Realtime WebSocket failure", async () => {
  const client = new FakeRealtimeClient();
  const session = new LiveSession({
    apiKey: "test-key",
    spawnImpl: () => new FakeChild(),
    clientFactory: () => client,
  });
  session.on("message", () => {});
  await session.start();
  const error = new Error("socket lost");
  error.code = "OPENAI_SOCKET_LOST";
  client.emit("error", error);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.state, "Error");
});

test("stop timeout saves completed chunks and drops an unfinished partial", async () => {
  const outputsRoot = await mkdtemp(join(tmpdir(), "lecscape-live-timeout-"));
  const client = new FakeRealtimeClient();
  const session = new LiveSession({
    apiKey: "test-key",
    outputsRoot,
    spawnImpl: () => new FakeChild(),
    clientFactory: () => client,
    delay: async () => {},
    stopInitialWaitMs: 0,
    stopFlushTimeoutMs: 0,
  });
  session.on("message", () => {});
  await session.start();
  client.emit("event", {
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "unfinished",
    delta: "미완성",
  });
  const result = await session.stop();
  const chunks = JSON.parse(await readFile(result.chunksPath, "utf8"));
  assert.deepEqual(chunks, []);
  assert.equal(session.state, "Stopped");
});
