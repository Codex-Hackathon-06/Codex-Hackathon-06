import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWhisperTranscription } from "../src/openai.mjs";

test("sends the documented Whisper timestamp request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lecscape-openai-"));
  const audioPath = join(directory, "audio.mp3");
  await writeFile(audioPath, "fake mp3 bytes");

  let captured;
  const response = await createWhisperTranscription({
    audioPath,
    apiKey: "test-key",
    prompt: "강의 용어: LecScape",
    async fetchImpl(url, init) {
      captured = { url, init };
      return new Response(
        JSON.stringify({ language: "ko", segments: [{ start: 0, end: 1, text: "테스트" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(captured.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(captured.init.headers.Authorization, "Bearer test-key");
  assert.equal(captured.init.body.get("model"), "whisper-1");
  assert.equal(captured.init.body.get("language"), "ko");
  assert.equal(captured.init.body.get("response_format"), "verbose_json");
  assert.equal(captured.init.body.get("timestamp_granularities[]"), "segment");
  assert.equal(captured.init.body.get("prompt"), "강의 용어: LecScape");
  assert.equal(response.segments.length, 1);
});

test("fails before network access when the API key is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lecscape-openai-"));
  const audioPath = join(directory, "audio.mp3");
  await writeFile(audioPath, "fake mp3 bytes");
  await assert.rejects(
    createWhisperTranscription({ audioPath, apiKey: "" }),
    (error) => error.code === "OPENAI_API_KEY_MISSING",
  );
});
