import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildGameGeneratorInput,
  compactTranscript,
  createConceptAnalysis,
  extractResponseText,
  normalizeEvidenceChunkIds,
  runConceptPipeline,
  validateTranscriptChunks,
} from "../src/concept-analysis.mjs";

const chunks = [
  { id: "seg-0001", startMs: 0, endMs: 3000, text: "첫 번째 개념을 설명합니다." },
  { id: "seg-0002", startMs: 3000, endMs: 6000, text: "두 번째 개념과 차이를 설명합니다." },
  { id: "seg-0003", startMs: 6000, endMs: 9000, text: "두 개념을 적용한 사례입니다." },
];

function analysisFixture() {
  return {
    lectureTitle: "테스트 강의",
    lectureSummary: "두 개념과 적용 사례를 설명한다.",
    learningObjectives: ["첫 개념 설명", "둘째 개념 구분", "사례 적용"],
    coreConcepts: [
      {
        id: "concept-01",
        name: "첫 개념",
        definition: "첫 번째 핵심 원리",
        whyImportant: "다른 개념의 기반",
        importanceScore: 5,
        difficulty: "introductory",
        prerequisiteConceptIds: [],
        relatedConceptIds: ["concept-02"],
        evidenceChunkIds: ["seg-0001"],
      },
      {
        id: "concept-02",
        name: "둘째 개념",
        definition: "두 번째 핵심 원리",
        whyImportant: "사례 적용에 필요",
        importanceScore: 4,
        difficulty: "intermediate",
        prerequisiteConceptIds: ["concept-01"],
        relatedConceptIds: ["concept-01"],
        evidenceChunkIds: ["seg-0002"],
      },
    ],
    examples: [
      {
        id: "example-01",
        title: "적용 사례",
        situation: "두 원리를 적용한다.",
        explanation: "원리의 차이를 이용한다.",
        conceptIds: ["concept-01", "concept-02"],
        evidenceChunkIds: ["seg-0003"],
      },
    ],
    confusions: [
      {
        id: "confusion-01",
        title: "두 개념 혼동",
        conceptIds: ["concept-01", "concept-02"],
        mistakenBelief: "둘은 같다.",
        correctDistinction: "적용 조건이 다르다.",
        diagnosticQuestion: "어떤 조건에서 둘째 개념을 쓰는가?",
        basis: "explicit",
        evidenceChunkIds: ["seg-0002"],
      },
    ],
    conceptSequence: [
      { fromConceptId: "concept-01", toConceptId: "concept-02", relationship: "선행 개념" },
    ],
    roomBlueprint: {
      room1: {
        goal: "개념 연결",
        mechanic: "concept_clustering",
        primaryConceptIds: ["concept-01", "concept-02"],
      },
      room2: {
        goal: "사례 적용",
        mechanic: "evidence_elimination",
        primaryExampleIds: ["example-01"],
      },
      room3: {
        goal: "종합 판단",
        mechanic: "synthesis_judgment",
        primaryConceptIds: ["concept-01", "concept-02"],
        primaryConfusionIds: ["confusion-01"],
        recurrenceConceptIds: ["concept-01"],
      },
    },
  };
}

function responseFor(analysis) {
  return {
    id: "resp_test",
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(analysis) }],
      },
    ],
  };
}

test("compacts chunks while preserving IDs and millisecond ranges", () => {
  const compact = compactTranscript(chunks);
  assert.match(compact, /\[seg-0001\|0-3000\] 첫 번째 개념/);
  assert.match(compact, /\[seg-0003\|6000-9000\] 두 개념/);
});

test("rejects duplicate or unordered transcript chunks", () => {
  assert.throws(
    () => validateTranscriptChunks([chunks[0], { ...chunks[1], id: "seg-0001" }]),
    /Duplicate/,
  );
  assert.throws(
    () => validateTranscriptChunks([chunks[1], chunks[0]]),
    /out of timestamp order/,
  );
});

test("hydrates trusted evidence from transcript chunks", () => {
  const result = buildGameGeneratorInput(analysisFixture(), chunks, {
    model: "test-model",
    generatedAt: "2026-08-16T00:00:00.000Z",
  });
  assert.equal(result.coreConcepts[0].evidence[0].startMs, 0);
  assert.equal(result.coreConcepts[0].evidence[0].text, chunks[0].text);
  assert.equal(result.examples[0].evidence[0].chunkId, "seg-0003");
  assert.equal("evidenceChunkIds" in result.coreConcepts[0], false);
  assert.equal(result.source.durationMs, 9000);
  assert.equal(result.version, "2.0");
  assert.equal(result.roomBlueprint.format, "single_room");
  assert.deepEqual(
    result.roomBlueprint.room.stages.map((stage) => stage.type),
    ["concept_discovery", "case_application", "synthesis_judgment"],
  );
});

test("repairs merged transcript and array reference IDs", () => {
  assert.deepEqual(
    normalizeEvidenceChunkIds(
      ["seg-0001\":{\"seg-0002", "seg-0002"],
      new Set(chunks.map((chunk) => chunk.id)),
    ),
    ["seg-0001", "seg-0002"],
  );

  const merged = analysisFixture();
  merged.coreConcepts[1].evidenceChunkIds = ["seg-0001\":{\"seg-0002"];
  merged.examples[0].conceptIds = ["concept-01 / concept-02"];
  const result = buildGameGeneratorInput(merged, chunks);
  assert.deepEqual(
    result.coreConcepts[1].evidence.map((evidence) => evidence.chunkId),
    ["seg-0001", "seg-0002"],
  );
  assert.deepEqual(result.examples[0].conceptIds, ["concept-01", "concept-02"]);
});

test("drops unknown optional concept graph references and records a warning", () => {
  const withGhostRelation = analysisFixture();
  withGhostRelation.coreConcepts[1].relatedConceptIds = ["concept-01", "concept-13"];
  const result = buildGameGeneratorInput(withGhostRelation, chunks);

  assert.deepEqual(result.coreConcepts[1].relatedConceptIds, ["concept-01"]);
  assert.ok(result.validation.normalizationWarnings.includes(
    "concept-02.relatedConceptIds: removed unknown id concept-13",
  ));
});

test("accepts a native single-room blueprint", () => {
  const singleRoom = analysisFixture();
  singleRoom.roomBlueprint = {
    format: "single_room",
    room: {
      title: "테스트 통제실",
      story: "단서를 찾아 출구를 연다.",
      goal: "세 단계 잠금을 해제한다.",
      theme: "test_control_room",
      stages: [
        {
          id: "stage-01",
          type: "concept_discovery",
          title: "개념 발견",
          goal: "개념을 연결한다.",
          objectIds: ["terminal"],
          conceptIds: ["concept-01", "concept-02"],
          exampleIds: [],
          confusionIds: [],
          recurrenceConceptIds: [],
        },
        {
          id: "stage-02",
          type: "case_application",
          title: "사례 적용",
          goal: "사례를 판별한다.",
          objectIds: ["evidence-board"],
          conceptIds: [],
          exampleIds: ["example-01"],
          confusionIds: [],
          recurrenceConceptIds: [],
        },
        {
          id: "stage-03",
          type: "synthesis_judgment",
          title: "종합 판단",
          goal: "출구를 연다.",
          objectIds: ["exit-panel"],
          conceptIds: ["concept-02"],
          exampleIds: [],
          confusionIds: ["confusion-01"],
          recurrenceConceptIds: ["concept-01"],
        },
      ],
    },
  };

  const result = buildGameGeneratorInput(singleRoom, chunks);
  assert.equal(result.roomBlueprint.room.title, "테스트 통제실");
  assert.equal(result.validation.normalizationWarnings.length, 0);
});

test("rejects hallucinated concept or transcript references", () => {
  const badConcept = analysisFixture();
  badConcept.examples[0].conceptIds = ["concept-99"];
  assert.throws(() => buildGameGeneratorInput(badConcept, chunks), /unknown id/);

  const badChunk = analysisFixture();
  badChunk.confusions[0].evidenceChunkIds = ["seg-9999"];
  assert.throws(() => buildGameGeneratorInput(badChunk, chunks), /unknown transcript chunk/);
});

test("sends a strict Responses API structured-output request", async () => {
  let captured;
  const expected = analysisFixture();
  const result = await createConceptAnalysis({
    chunks,
    apiKey: "test-key",
    async fetchImpl(url, init) {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify(responseFor(expected)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.body.model, "gpt-5.6-terra");
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.reasoning.effort, "low");
  assert.equal(captured.body.text.format.type, "json_schema");
  assert.equal(captured.body.text.format.strict, true);
  assert.deepEqual(
    captured.body.text.format.schema.properties.roomBlueprint.required,
    ["format", "room"],
  );
  assert.match(captured.body.input[1].content, /seg-0001/);
  assert.deepEqual(result.analysis, expected);
});

test("extracts output text and reports incomplete responses", () => {
  assert.equal(extractResponseText(responseFor({ ok: true })), JSON.stringify({ ok: true }));
  assert.throws(
    () => extractResponseText({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
    /incomplete/,
  );
});

test("writes game-generator JSON and reuses a matching cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lecscape-concepts-"));
  const inputPath = join(directory, "transcript.chunks.json");
  const rawResponsePath = join(directory, "saved-response.json");
  const outputPath = join(directory, "nested", "game-generator.input.json");
  await writeFile(inputPath, JSON.stringify(chunks));
  await writeFile(rawResponsePath, JSON.stringify(responseFor(analysisFixture())));

  const first = await runConceptPipeline({ inputPath, rawResponsePath, outputPath });
  const second = await runConceptPipeline({ inputPath, rawResponsePath, outputPath });
  assert.equal(first.status, "analyzed");
  assert.equal(second.status, "cache-hit");
  const saved = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(saved.coreConcepts.length, 2);
});

test("persists the raw API response before grounding fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lecscape-concepts-failure-"));
  const inputPath = join(directory, "transcript.chunks.json");
  const rawResponsePath = join(directory, "source-response.json");
  const rawOutputPath = join(directory, "nested", "lecture.analysis.raw.json");
  const badAnalysis = analysisFixture();
  badAnalysis.coreConcepts[0].evidenceChunkIds = ["seg-9999"];
  await writeFile(inputPath, JSON.stringify(chunks));
  await writeFile(rawResponsePath, JSON.stringify(responseFor(badAnalysis)));

  await assert.rejects(
    runConceptPipeline({ inputPath, rawResponsePath, rawOutputPath }),
    /unknown transcript chunk/,
  );
  const savedRaw = JSON.parse(await readFile(rawOutputPath, "utf8"));
  assert.equal(savedRaw.id, "resp_test");
});
