import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  LIVE_TRANSCRIPTION_MODEL,
  OpenAIRealtimeTranscription,
  TRANSCRIPTION_SESSION_INTENT,
} from "../src/realtime-openai.mjs";

class FakeWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances = [];

  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open");
    });
  }

  send(data) {
    const event = JSON.parse(data);
    this.sent.push(event);
    if (event.type === "session.update") {
      queueMicrotask(() => this.emit("message", Buffer.from(JSON.stringify({ type: "session.updated" }))));
    }
  }

  close() {
    this.readyState = 3;
  }
}

test("configures the documented Korean 24kHz transcription session", async () => {
  FakeWebSocket.instances.length = 0;
  const client = new OpenAIRealtimeTranscription({
    apiKey: "server-only-key",
    prompt: "강의 용어",
    keywords: ["LecScape", "MCP"],
    WebSocketImpl: FakeWebSocket,
  });
  client.on("error", () => {});
  await client.connect();

  const socket = FakeWebSocket.instances[0];
  const connectedUrl = new URL(socket.url);
  assert.equal(connectedUrl.searchParams.get("intent"), TRANSCRIPTION_SESSION_INTENT);
  assert.equal(connectedUrl.searchParams.has("model"), false);
  assert.equal(socket.options.headers.Authorization, "Bearer server-only-key");
  const update = socket.sent[0];
  assert.equal(update.type, "session.update");
  assert.equal(update.session.type, "transcription");
  assert.deepEqual(update.session.audio.input.format, { type: "audio/pcm", rate: 24_000 });
  assert.equal(update.session.audio.input.transcription.model, LIVE_TRANSCRIPTION_MODEL);
  assert.deepEqual(update.session.audio.input.transcription.languages, ["ko"]);
  assert.equal(update.session.audio.input.transcription.delay, "low");
  assert.equal(update.session.audio.input.turn_detection, null);

  client.appendPcm(Buffer.from([1, 2, 3]));
  client.commit();
  assert.deepEqual(socket.sent.at(-2), { type: "input_audio_buffer.append", audio: "AQID" });
  assert.deepEqual(socket.sent.at(-1), { type: "input_audio_buffer.commit" });
  assert.equal(client.commit(), false);
  assert.equal(socket.sent.at(-1).type, "input_audio_buffer.commit");
});

test("rejects before opening a socket when the API key is absent", async () => {
  const client = new OpenAIRealtimeTranscription({ apiKey: "", WebSocketImpl: FakeWebSocket });
  await assert.rejects(client.connect(), (error) => error.code === "OPENAI_API_KEY_MISSING");
});

test("rejects immediately when the Realtime API refuses session setup", async () => {
  class RejectingWebSocket extends FakeWebSocket {
    send(data) {
      const event = JSON.parse(data);
      this.sent.push(event);
      queueMicrotask(() => this.emit("message", Buffer.from(JSON.stringify({
        type: "error",
        error: { code: "invalid_session", message: "bad configuration" },
      }))));
    }
  }
  const client = new OpenAIRealtimeTranscription({
    apiKey: "test-key",
    WebSocketImpl: RejectingWebSocket,
  });
  await assert.rejects(client.connect(), (error) => {
    assert.equal(error.code, "invalid_session");
    assert.equal(error.message, "bad configuration");
    return true;
  });
});
