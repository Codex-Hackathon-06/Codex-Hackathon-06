import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { audioAppendEvent, LIVE_SAMPLE_RATE } from "./realtime-chunks.mjs";

export const LIVE_TRANSCRIPTION_MODEL = "gpt-live-transcribe";
export const TRANSCRIPTION_SESSION_INTENT = "transcription";

function apiError(event) {
  const error = new Error(event?.error?.message ?? "OpenAI Realtime API returned an error");
  error.code = event?.error?.code ?? "OPENAI_REALTIME_ERROR";
  return error;
}

export class OpenAIRealtimeTranscription extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey;
    this.transcriptionModel = options.transcriptionModel ?? LIVE_TRANSCRIPTION_MODEL;
    this.prompt = options.prompt;
    this.keywords = options.keywords ?? [];
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.url = options.url
      ?? `wss://api.openai.com/v1/realtime?intent=${TRANSCRIPTION_SESSION_INTENT}`;
    this.socket = null;
    this.uncommittedAudioBytes = 0;
  }

  async connect() {
    if (!this.apiKey) {
      const error = new Error("OPENAI_API_KEY is not set");
      error.code = "OPENAI_API_KEY_MISSING";
      throw error;
    }
    if (this.socket) throw new Error("Realtime transcription is already connected");

    const socket = new this.WebSocketImpl(this.url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    this.socket = socket;

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error("Timed out while connecting to OpenAI Realtime transcription");
        error.code = "OPENAI_REALTIME_CONNECT_TIMEOUT";
        reject(error);
        socket.close();
      }, 15_000);

      const cleanup = () => {
        clearTimeout(timeout);
      };
      socket.once("open", () => {
        const transcription = {
          model: this.transcriptionModel,
          languages: ["ko"],
          delay: "low",
        };
        if (this.prompt) transcription.prompt = this.prompt;
        if (this.keywords.length > 0) transcription.keywords = this.keywords;
        socket.send(JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: LIVE_SAMPLE_RATE },
                transcription,
                turn_detection: null,
              },
            },
          },
        }));
      });

      socket.on("message", (data) => {
        let event;
        try {
          event = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (event.type === "session.updated") {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        } else if (event.type === "error") {
          const error = apiError(event);
          if (!settled) {
            settled = true;
            cleanup();
            reject(error);
          } else {
            this.emit("error", error);
          }
        } else {
          this.emit("event", event);
        }
      });
      socket.on("error", (error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        } else {
          this.emit("error", error);
        }
      });
      socket.on("close", (code, reason) => {
        if (!settled) {
          settled = true;
          cleanup();
          const error = new Error(`OpenAI Realtime socket closed before session setup (${code})`);
          error.code = "OPENAI_REALTIME_CLOSED_DURING_CONNECT";
          reject(error);
        } else {
          this.emit("close", { code, reason: reason.toString() });
        }
      });
    });
  }

  appendPcm(pcm) {
    this.send(audioAppendEvent(pcm));
    this.uncommittedAudioBytes += pcm.length;
  }

  commit() {
    if (this.uncommittedAudioBytes === 0) return false;
    this.send({ type: "input_audio_buffer.commit" });
    this.uncommittedAudioBytes = 0;
    return true;
  }

  send(event) {
    if (!this.socket || this.socket.readyState !== this.WebSocketImpl.OPEN) {
      const error = new Error("OpenAI Realtime socket is not open");
      error.code = "OPENAI_REALTIME_NOT_CONNECTED";
      throw error;
    }
    this.socket.send(JSON.stringify(event));
  }

  close() {
    if (!this.socket) return;
    if (this.socket.readyState === this.WebSocketImpl.OPEN
      || this.socket.readyState === this.WebSocketImpl.CONNECTING) {
      this.socket.close(1000, "LecScape session complete");
    }
    this.socket = null;
    this.uncommittedAudioBytes = 0;
  }
}
