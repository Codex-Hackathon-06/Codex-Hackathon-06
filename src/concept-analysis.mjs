import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { lectureAnalysisSchema } from "./concept-schema.mjs";
import { writeJsonAtomic } from "./transcript.mjs";
import { missingOpenAIApiKeyError, resolveOpenAIApiKey } from "./env.mjs";

const DEFAULT_MODEL = process.env.OPENAI_CONCEPT_MODEL || "gpt-5.6-terra";
const SCHEMA_VERSION = "2.0";

const SYSTEM_PROMPT = `당신은 한국어 강의 내용을 학습용 방탈출 게임의 재료로 구조화하는 교육 설계자다.

규칙:
1. 제공된 TranscriptChunk만 근거로 사용하고 외부 지식을 사실처럼 추가하지 않는다.
2. 모든 개념·사례·혼동 포인트에는 실제 근거 chunk ID를 1개 이상 연결한다.
3. 핵심 개념은 강의의 중심 주장과 반복적으로 설명된 원리를 우선한다.
4. 사례는 개념이 실제 상황에서 어떻게 적용되는지 보여주는 강의 속 예시를 선택한다.
5. 혼동 포인트는 강의에서 명시한 구분이면 explicit, 근거로부터 교육적으로 도출한 오개념이면 pedagogical_inference로 표시한다.
6. concept ID는 concept-01 형식, example ID는 example-01 형식, confusion ID는 confusion-01 형식으로 중복 없이 만든다.
7. 모든 ID 참조는 생성한 항목의 ID와 정확히 일치해야 한다.
8. 게임은 방 하나로 설계하고 그 안에 정확히 3개 단계(개념 발견, 사례 적용, 종합 판단)를 순서대로 둔다.
9. 마지막 종합 판단 단계에는 앞 단계의 핵심 개념을 recurrenceConceptIds로 다시 등장시킨다.
10. 각 단계에는 플레이어가 조사할 수 있는 공간 오브젝트 ID를 1개 이상 연결한다.
11. 결과 문장은 자연스러운 한국어로 작성한다.`;

export function validateTranscriptChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("Transcript chunks must be a non-empty array");
  }
  const ids = new Set();
  let previousStart = -1;
  for (const [index, chunk] of chunks.entries()) {
    if (!chunk || typeof chunk.id !== "string" || !chunk.id) {
      throw new Error(`Transcript chunk ${index} has no valid id`);
    }
    if (ids.has(chunk.id)) throw new Error(`Duplicate transcript chunk id: ${chunk.id}`);
    ids.add(chunk.id);
    if (!Number.isFinite(chunk.startMs) || !Number.isFinite(chunk.endMs)) {
      throw new Error(`Transcript chunk ${chunk.id} has invalid timestamps`);
    }
    if (chunk.startMs < previousStart || chunk.endMs < chunk.startMs) {
      throw new Error(`Transcript chunk ${chunk.id} is out of timestamp order`);
    }
    if (typeof chunk.text !== "string" || !chunk.text.trim()) {
      throw new Error(`Transcript chunk ${chunk.id} has no text`);
    }
    previousStart = chunk.startMs;
  }
  return chunks;
}

export function compactTranscript(chunks) {
  validateTranscriptChunks(chunks);
  return chunks
    .map((chunk) => `[${chunk.id}|${chunk.startMs}-${chunk.endMs}] ${chunk.text.trim()}`)
    .join("\n");
}

export function transcriptSha256(chunks) {
  return createHash("sha256").update(JSON.stringify(chunks)).digest("hex");
}

export function extractResponseText(response) {
  if (response?.status === "incomplete") {
    throw new Error(`OpenAI response was incomplete: ${JSON.stringify(response.incomplete_details ?? {})}`);
  }
  const refusals = [];
  const texts = [];
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      } else if (content.type === "refusal") {
        refusals.push(content.refusal ?? "Model refused the request");
      }
    }
  }
  if (refusals.length > 0) throw new Error(`OpenAI refused concept extraction: ${refusals.join(" ")}`);
  if (texts.length === 0) throw new Error("OpenAI response did not contain output_text");
  return texts.join("");
}

export async function createConceptAnalysis(options) {
  const apiKey = resolveOpenAIApiKey(options.apiKey);
  if (!apiKey) {
    throw missingOpenAIApiKeyError();
  }
  const model = options.model ?? DEFAULT_MODEL;
  const body = {
    model,
    store: false,
    reasoning: { effort: options.reasoningEffort ?? "low" },
    max_output_tokens: 12_000,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `다음 TranscriptChunk를 분석하라. 대괄호 안에는 chunk ID와 startMs-endMs가 있다.\n\n${compactTranscript(options.chunks)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "lecture_game_analysis",
        strict: true,
        schema: lectureAnalysisSchema,
      },
    },
  };

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal ?? AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI concept extraction failed (${response.status}): ${text}`);
  }
  const raw = await response.json();
  const analysis = JSON.parse(extractResponseText(raw));
  return { raw, analysis, model };
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) throw new Error(`${label} contains a missing or duplicate id: ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function normalizeKnownReferences(values, validIds, pattern, label, kind = "id", options = {}) {
  const normalized = [];
  for (const value of values) {
    const candidates = validIds.has(value)
      ? [value]
      : typeof value === "string"
        ? (value.match(pattern) ?? [value])
        : [value];

    for (const candidate of candidates) {
      if (!validIds.has(candidate)) {
        if (options.dropUnknown) {
          options.warnings?.push(`${label}: removed unknown ${kind} ${candidate}`);
          continue;
        }
        throw new Error(`${label} references unknown ${kind}: ${candidate}`);
      }
      if (!normalized.includes(candidate)) normalized.push(candidate);
    }
  }
  return normalized;
}

export function normalizeEvidenceChunkIds(chunkIds, validChunkIds) {
  return normalizeKnownReferences(
    chunkIds,
    validChunkIds,
    /seg-\d+/g,
    "evidence",
    "transcript chunk",
  );
}

function evidenceFor(chunkIds, chunkMap, label) {
  const uniqueIds = normalizeEvidenceChunkIds(chunkIds, new Set(chunkMap.keys()));
  if (uniqueIds.length === 0) throw new Error(`${label} has no evidence chunks`);
  return uniqueIds.map((chunkId) => {
    const chunk = chunkMap.get(chunkId);
    if (!chunk) throw new Error(`${label} references unknown transcript chunk: ${chunkId}`);
    return {
      chunkId,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      text: chunk.text,
    };
  });
}

export function buildGameGeneratorInput(analysis, chunks, options = {}) {
  validateTranscriptChunks(chunks);
  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const conceptIds = assertUniqueIds(analysis.coreConcepts, "coreConcepts");
  const exampleIds = assertUniqueIds(analysis.examples, "examples");
  const confusionIds = assertUniqueIds(analysis.confusions, "confusions");

  const conceptPattern = /concept-\d+/g;
  const examplePattern = /example-\d+/g;
  const confusionPattern = /confusion-\d+/g;
  const normalizationWarnings = [];
  const normalizeConceptIds = (values, label, referenceOptions) =>
    normalizeKnownReferences(
      values,
      conceptIds,
      conceptPattern,
      label,
      "id",
      { ...referenceOptions, warnings: normalizationWarnings },
    );
  const normalizedConcepts = analysis.coreConcepts.map((concept) => ({
    ...concept,
    prerequisiteConceptIds: normalizeConceptIds(
      concept.prerequisiteConceptIds,
      `${concept.id}.prerequisiteConceptIds`,
      { dropUnknown: true },
    ),
    relatedConceptIds: normalizeConceptIds(
      concept.relatedConceptIds,
      `${concept.id}.relatedConceptIds`,
      { dropUnknown: true },
    ),
  }));
  const normalizedExamples = analysis.examples.map((example) => ({
    ...example,
    conceptIds: normalizeConceptIds(example.conceptIds, `${example.id}.conceptIds`),
  }));
  const normalizedConfusions = analysis.confusions.map((confusion) => ({
    ...confusion,
    conceptIds: normalizeConceptIds(confusion.conceptIds, `${confusion.id}.conceptIds`),
  }));

  for (const link of analysis.conceptSequence) {
    normalizeKnownReferences(
      [link.fromConceptId, link.toConceptId],
      conceptIds,
      /^(?:concept-\d+)$/g,
      "conceptSequence",
    );
  }
  const suppliedBlueprint = analysis.roomBlueprint;
  let singleRoomBlueprint = suppliedBlueprint;
  if (!suppliedBlueprint?.room && suppliedBlueprint?.room1 && suppliedBlueprint?.room2 && suppliedBlueprint?.room3) {
    const benchmarkTheme = /벤치마크|SWE-bench|Terminal-Bench|RE-Bench/i.test(analysis.lectureTitle);
    singleRoomBlueprint = {
      format: "single_room",
      room: {
        title: benchmarkTheme ? "벤치마크 통제실" : `${analysis.lectureTitle} 탈출실`,
        story: benchmarkTheme
          ? "잘못 설정된 코딩 에이전트 평가 시스템을 복구하고 통제실에서 탈출한다."
          : "방 안의 단서를 조사해 강의의 핵심 원리를 복구하고 출구를 연다.",
        goal: "개념을 발견하고 사례에 적용한 뒤 종합 판단하여 하나의 방을 탈출한다.",
        theme: benchmarkTheme ? "ai_benchmark_control_room" : "lecture_escape_room",
        stages: [
          {
            id: "stage-01",
            type: "concept_discovery",
            title: "핵심 개념 잠금 해제",
            goal: suppliedBlueprint.room1.goal,
            objectIds: ["terminal", "concept-board"],
            conceptIds: suppliedBlueprint.room1.primaryConceptIds,
            exampleIds: [],
            confusionIds: [],
            recurrenceConceptIds: [],
          },
          {
            id: "stage-02",
            type: "case_application",
            title: "사례 판별 장치 복구",
            goal: suppliedBlueprint.room2.goal,
            objectIds: ["evidence-board", "benchmark-drawer"],
            conceptIds: [],
            exampleIds: suppliedBlueprint.room2.primaryExampleIds,
            confusionIds: [],
            recurrenceConceptIds: [],
          },
          {
            id: "stage-03",
            type: "synthesis_judgment",
            title: "출구 제어판 승인",
            goal: suppliedBlueprint.room3.goal,
            objectIds: ["result-monitor", "exit-panel"],
            conceptIds: suppliedBlueprint.room3.primaryConceptIds,
            exampleIds: [],
            confusionIds: suppliedBlueprint.room3.primaryConfusionIds,
            recurrenceConceptIds: suppliedBlueprint.room3.recurrenceConceptIds,
          },
        ],
      },
    };
    normalizationWarnings.push("roomBlueprint: migrated legacy three-room layout to single-room stages");
  }

  if (singleRoomBlueprint?.format !== "single_room" || !singleRoomBlueprint.room) {
    throw new Error("roomBlueprint must use the single_room format");
  }
  if (!Array.isArray(singleRoomBlueprint.room.stages) || singleRoomBlueprint.room.stages.length !== 3) {
    throw new Error("single room must contain exactly three cognitive stages");
  }
  assertUniqueIds(singleRoomBlueprint.room.stages, "roomBlueprint.room.stages");
  const normalizedStages = singleRoomBlueprint.room.stages.map((stage) => {
    if (!Array.isArray(stage.objectIds) || stage.objectIds.length === 0) {
      throw new Error(`${stage.id}.objectIds must contain at least one object`);
    }
    return {
      ...stage,
      conceptIds: normalizeConceptIds(stage.conceptIds, `${stage.id}.conceptIds`),
      exampleIds: normalizeKnownReferences(
        stage.exampleIds,
        exampleIds,
        examplePattern,
        `${stage.id}.exampleIds`,
      ),
      confusionIds: normalizeKnownReferences(
        stage.confusionIds,
        confusionIds,
        confusionPattern,
        `${stage.id}.confusionIds`,
      ),
      recurrenceConceptIds: normalizeConceptIds(
        stage.recurrenceConceptIds,
        `${stage.id}.recurrenceConceptIds`,
      ),
    };
  });
  const stageByType = new Map(normalizedStages.map((stage) => [stage.type, stage]));
  if (stageByType.size !== 3
    || !stageByType.has("concept_discovery")
    || !stageByType.has("case_application")
    || !stageByType.has("synthesis_judgment")) {
    throw new Error("single room requires concept_discovery, case_application, and synthesis_judgment stages");
  }
  if (stageByType.get("concept_discovery").conceptIds.length === 0) {
    throw new Error("concept_discovery stage requires conceptIds");
  }
  if (stageByType.get("case_application").exampleIds.length === 0) {
    throw new Error("case_application stage requires exampleIds");
  }
  const synthesisStage = stageByType.get("synthesis_judgment");
  if (synthesisStage.conceptIds.length === 0
    || synthesisStage.confusionIds.length === 0
    || synthesisStage.recurrenceConceptIds.length === 0) {
    throw new Error("synthesis_judgment stage requires concept, confusion, and recurrence references");
  }
  const normalizedRoomBlueprint = {
    format: "single_room",
    room: {
      ...singleRoomBlueprint.room,
      stages: normalizedStages,
    },
  };

  const attachEvidence = (item) => {
    const { evidenceChunkIds, ...rest } = item;
    return { ...rest, evidence: evidenceFor(evidenceChunkIds, chunkMap, item.id) };
  };
  const durationMs = Math.max(...chunks.map((chunk) => chunk.endMs));
  return {
    version: SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    model: options.model ?? DEFAULT_MODEL,
    source: {
      transcriptSha256: transcriptSha256(chunks),
      language: "ko",
      durationMs,
      chunkCount: chunks.length,
    },
    validation: {
      normalizationWarnings,
    },
    lecture: {
      title: analysis.lectureTitle,
      summary: analysis.lectureSummary,
      learningObjectives: analysis.learningObjectives,
    },
    coreConcepts: normalizedConcepts.map(attachEvidence),
    examples: normalizedExamples.map(attachEvidence),
    confusions: normalizedConfusions.map(attachEvidence),
    conceptSequence: analysis.conceptSequence,
    roomBlueprint: normalizedRoomBlueprint,
  };
}

export async function runConceptPipeline(options) {
  const inputPath = resolve(options.inputPath);
  await access(inputPath);
  const chunks = validateTranscriptChunks(JSON.parse(await readFile(inputPath, "utf8")));
  const model = options.model ?? DEFAULT_MODEL;
  const outputPath = resolve(options.outputPath ?? join(dirname(inputPath), "game-generator.input.json"));
  const rawOutputPath = resolve(options.rawOutputPath ?? join(dirname(outputPath), "lecture.analysis.raw.json"));

  if (!options.force) {
    try {
      const cached = JSON.parse(await readFile(outputPath, "utf8"));
      if (cached.version === SCHEMA_VERSION
        && cached.source?.transcriptSha256 === transcriptSha256(chunks)
        && cached.model === model) {
        options.onProgress?.({ stage: "cache_hit", label: "분석 캐시 불러오기", detail: outputPath });
        return { status: "cache-hit", outputPath, rawOutputPath, result: cached };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  options.onProgress?.({ stage: "analyzing", label: "핵심 개념·사례 분석", detail: `${chunks.length}개 청크` });
  let raw;
  let analysis;
  if (options.rawResponsePath) {
    raw = JSON.parse(await readFile(resolve(options.rawResponsePath), "utf8"));
    analysis = JSON.parse(extractResponseText(raw));
  } else {
    ({ raw, analysis } = await createConceptAnalysis({
      chunks,
      apiKey: options.apiKey,
      model,
      reasoningEffort: options.reasoningEffort,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    }));
  }

  // Persist the paid API result before local grounding/validation so a failed
  // post-processing step can be retried offline with --raw-response.
  await mkdir(dirname(rawOutputPath), { recursive: true });
  await writeJsonAtomic(rawOutputPath, raw);

  options.onProgress?.({ stage: "grounding", label: "영상 근거 연결" });
  const result = buildGameGeneratorInput(analysis, chunks, { model });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJsonAtomic(outputPath, result);
  options.onProgress?.({ stage: "complete", label: "게임 생성기 입력 완료", detail: outputPath });
  return { status: "analyzed", outputPath, rawOutputPath, result };
}

export { DEFAULT_MODEL };
