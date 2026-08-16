import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PCM_FRAME_BYTES,
  PcmFrameBuffer,
  RealtimeTranscriptAssembler,
  audioAppendEvent,
} from "../src/realtime-chunks.mjs";
import { writeLiveSession } from "../src/live-output.mjs";

test("frames PCM into exact 100ms chunks and flushes the remainder", () => {
  const framer = new PcmFrameBuffer();
  const input = Buffer.alloc(PCM_FRAME_BYTES * 2 + 17, 7);
  const frames = framer.push(input);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].length, 4_800);
  assert.equal(framer.flush()[0].length, 17);
  assert.equal(framer.flush().length, 0);
});

test("encodes PCM as an OpenAI input_audio_buffer append event", () => {
  const event = audioAppendEvent(Buffer.from([1, 2, 3]));
  assert.deepEqual(event, { type: "input_audio_buffer.append", audio: "AQID" });
});

test("assembles partial and completed events with stable chunk IDs", () => {
  let now = 1_000;
  const assembler = new RealtimeTranscriptAssembler({ now: () => now, startedAt: 1_000 });
  assembler.processEvent({ type: "input_audio_buffer.speech_started", item_id: "item-a" });
  now = 1_250;
  const partial = assembler.processEvent({
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "item-a",
    delta: "안녕",
  });
  now = 1_900;
  assembler.processEvent({ type: "input_audio_buffer.speech_stopped", item_id: "item-a" });
  const final = assembler.processEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-a",
    transcript: "안녕하세요.",
  });

  assert.equal(partial.id, "seg-0001");
  assert.equal(partial.isFinal, false);
  assert.equal(final.id, partial.id);
  assert.equal(final.isFinal, true);
  assert.equal(final.startMs, 0);
  assert.equal(final.endMs, 900);
  assert.deepEqual(assembler.finalChunks(), [final]);
});

test("matches out-of-order completion events by item_id", () => {
  let now = 0;
  const assembler = new RealtimeTranscriptAssembler({ now: () => now, startedAt: 0 });
  assembler.processEvent({ type: "input_audio_buffer.speech_started", item_id: "first" });
  now = 1_000;
  assembler.processEvent({ type: "input_audio_buffer.speech_started", item_id: "second" });
  now = 1_100;
  assembler.processEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "second",
    transcript: "둘째",
  });
  now = 1_200;
  assembler.processEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "first",
    transcript: "첫째",
  });

  const chunks = assembler.finalChunks();
  assert.deepEqual(chunks.map((chunk) => chunk.text), ["첫째", "둘째"]);
  assert.equal(new Set(chunks.map((chunk) => chunk.id)).size, 2);
  assert.ok(chunks[1].startMs >= chunks[0].startMs);
});

test("persists only final chunks with SRT and session metadata", async () => {
  const outputsRoot = await mkdtemp(join(tmpdir(), "lecscape-live-"));
  const result = await writeLiveSession({
    outputsRoot,
    sessionId: "test-session",
    startedAt: new Date("2026-08-16T00:00:00.000Z"),
    stoppedAt: new Date("2026-08-16T00:01:00.000Z"),
    chunks: [
      { id: "seg-0001", startMs: 0, endMs: 1_000, rawText: "완료", text: "완료", language: "ko", isFinal: true, source: "realtime" },
      { id: "seg-0002", startMs: 1_000, endMs: 2_000, rawText: "중간", text: "중간", language: "ko", isFinal: false, source: "realtime" },
    ],
  });
  const chunks = JSON.parse(await readFile(result.chunksPath, "utf8"));
  const session = JSON.parse(await readFile(result.sessionPath, "utf8"));
  const srt = await readFile(result.srtPath, "utf8");
  assert.equal(chunks.length, 1);
  assert.equal(session.timelineOrigin, "listening_start");
  assert.equal(session.model, "gpt-live-transcribe");
  assert.equal(session.sessionType, "transcription");
  assert.equal(session.connectionIntent, "transcription");
  assert.equal(session.turnSegmentation, "client_interval");
  assert.equal(session.commitIntervalMs, 5_000);
  assert.equal(session.sampleRate, 24_000);
  assert.match(srt, /완료/);
});
