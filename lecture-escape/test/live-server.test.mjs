import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import WebSocket from "ws";
import { createLiveServer } from "../src/live-server.mjs";

class FakeLiveSession extends EventEmitter {
  constructor() {
    super();
    this.state = "Idle";
  }

  snapshot() {
    return { state: this.state, chunks: [] };
  }

  async start() {
    this.state = "Listening";
    this.emit("message", { type: "state", state: "Listening", detail: "test listening" });
  }

  async stop() {
    this.state = "Stopped";
    const result = {
      sessionId: "session-test",
      directory: "/tmp/lecscape/session-test",
      chunksPath: "/tmp/lecscape/session-test/transcript.chunks.json",
      srtPath: "/tmp/lecscape/session-test/transcript.srt",
      sessionPath: "/tmp/lecscape/session-test/session.json",
    };
    this.emit("message", { type: "state", state: "Stopped", detail: "saved" });
    this.emit("message", { type: "session_complete", ...result, chunks: [] });
    return result;
  }
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/live`);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function collectUntil(socket, predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for server event: ${JSON.stringify(messages)}`));
    }, timeoutMs);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
      messages.push(message);
      if (predicate(message, messages)) {
        cleanup();
        resolve(messages);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
    };
    socket.on("message", onMessage);
  });
}

test("stopping live capture automatically runs concept analysis and becomes Ready", async () => {
  let receivedOptions;
  const server = createLiveServer({
    host: "127.0.0.1",
    port: 0,
    apiKey: "test-key",
    LiveSessionImpl: FakeLiveSession,
    runConceptPipelineImpl: async (options) => {
      receivedOptions = options;
      options.onProgress({ stage: "analyzing", label: "핵심 개념·사례 분석", detail: "1개 청크" });
      options.onProgress({ stage: "grounding", label: "영상 근거 연결" });
      options.onProgress({ stage: "complete", label: "게임 생성기 입력 완료" });
      return {
        status: "analyzed",
        outputPath: options.outputPath,
        rawOutputPath: options.rawOutputPath,
        result: {
          lecture: { title: "테스트 강의", summary: "요약", learningObjectives: [] },
          coreConcepts: [{ name: "핵심 개념", definition: "정의" }],
        },
      };
    },
  });
  const address = await server.listen();
  const socket = await connectClient(address.port);
  try {
    const listening = collectUntil(socket, (message) => message.type === "state" && message.state === "Listening");
    socket.send(JSON.stringify({ type: "start" }));
    await listening;

    const ready = collectUntil(socket, (message) => message.type === "state" && message.state === "Ready");
    socket.send(JSON.stringify({ type: "stop" }));
    const messages = await ready;

    assert.equal(receivedOptions.inputPath, "/tmp/lecscape/session-test/transcript.chunks.json");
    assert.equal(receivedOptions.outputPath, "/tmp/lecscape/session-test/game-generator.input.json");
    assert.ok(messages.some((message) => message.type === "state" && message.state === "Finalizing"));
    assert.ok(messages.some((message) => message.type === "state" && message.state === "Analyzing"));
    assert.ok(messages.some((message) => message.type === "state" && message.state === "Grounding"));
    assert.ok(messages.some((message) => message.type === "analysis_complete"));
    assert.ok(messages.some((message) => message.type === "session_complete"));

    const replaySocket = new WebSocket(`ws://127.0.0.1:${address.port}/live`);
    const replay = collectUntil(replaySocket, (message) => message.type === "analysis_complete");
    await new Promise((resolve, reject) => {
      replaySocket.once("open", resolve);
      replaySocket.once("error", reject);
    });
    const replayMessages = await replay;
    assert.equal(replayMessages.find((message) => message.type === "analysis_complete").sessionId, "session-test");
    replaySocket.close();
  } finally {
    socket.close();
    await server.close();
  }
});

test("analysis failure reports the saved transcript path", async () => {
  const server = createLiveServer({
    host: "127.0.0.1",
    port: 0,
    apiKey: "test-key",
    LiveSessionImpl: FakeLiveSession,
    runConceptPipelineImpl: async () => {
      throw new Error("analysis unavailable");
    },
  });
  const address = await server.listen();
  const socket = await connectClient(address.port);
  try {
    const listening = collectUntil(socket, (message) => message.type === "state" && message.state === "Listening");
    socket.send(JSON.stringify({ type: "start" }));
    await listening;

    const failed = collectUntil(socket, (message) => message.type === "analysis_error");
    socket.send(JSON.stringify({ type: "stop" }));
    const messages = await failed;
    const error = messages.find((message) => message.type === "analysis_error");
    assert.equal(error.code, "ANALYSIS_FAILED");
    assert.equal(error.chunksPath, "/tmp/lecscape/session-test/transcript.chunks.json");
    assert.ok(messages.some((message) => message.type === "state" && message.state === "Stopped"));
  } finally {
    socket.close();
    await server.close();
  }
});
