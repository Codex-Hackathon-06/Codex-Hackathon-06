import assert from "node:assert/strict";
import test from "node:test";
import {
  chunksToSrt,
  cleanTranscriptText,
  normalizeTranscription,
  streamBatchTranscript,
} from "../src/transcript.mjs";

test("normalizes verbose_json segments into the shared chunk contract", () => {
  const chunks = normalizeTranscription({
    language: "ko",
    segments: [
      { id: 0, start: 0.125, end: 2.75, text: "  안녕하세요.   LecScape입니다.  " },
      { id: 1, start: 2.75, end: 4, text: "두 번째 문장입니다." },
    ],
  });
  assert.deepEqual(chunks[0], {
    id: "seg-0001",
    startMs: 125,
    endMs: 2750,
    rawText: "안녕하세요.   LecScape입니다.",
    text: "안녕하세요. LecScape입니다.",
    language: "ko",
    isFinal: true,
    source: "batch",
  });
  assert.equal(chunks.length, 2);
});

test("rejects malformed segment timestamps", () => {
  assert.throws(
    () => normalizeTranscription({ segments: [{ start: 3, end: 2, text: "오류" }] }),
    /Invalid timestamps/,
  );
});

test("writes valid SRT timestamps", () => {
  const srt = chunksToSrt([
    { startMs: 3_723_004, endMs: 3_725_120, text: "테스트" },
  ]);
  assert.match(srt, /01:02:03,004 --> 01:02:05,120/);
  assert.match(srt, /테스트/);
});

test("batch adapter emits the same chunk objects in order", async () => {
  const input = [{ id: "a" }, { id: "b" }];
  const output = [];
  for await (const chunk of streamBatchTranscript(input)) output.push(chunk);
  assert.deepEqual(output, input);
});

test("display cleanup does not alter raw content beyond whitespace", () => {
  assert.equal(cleanTranscriptText(" A   B\n  C "), "A B\nC");
});

