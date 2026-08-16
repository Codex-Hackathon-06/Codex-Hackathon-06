export type TranscriptSource = "batch" | "realtime";

export type TranscriptChunk = {
  id: string;
  startMs: number;
  endMs: number;
  rawText: string;
  text: string;
  language: "ko";
  isFinal: boolean;
  source: TranscriptSource;
};

export type LiveState =
  | "Idle"
  | "Requesting Permission"
  | "Connecting"
  | "Listening"
  | "Finalizing"
  | "Analyzing"
  | "Grounding"
  | "Ready"
  | "Stopped"
  | "Error";

export type LiveClientCommand = { type: "start" } | { type: "stop" };

export type LiveServerEvent =
  | { type: "state"; state: LiveState; detail?: string }
  | { type: "transcript"; chunk: TranscriptChunk }
  | {
      type: "session_complete";
      sessionId: string;
      directory: string;
      chunksPath: string;
      srtPath: string;
      sessionPath: string;
      chunks: TranscriptChunk[];
    }
  | {
      type: "analysis_progress";
      stage: "cache_hit" | "analyzing" | "grounding" | "complete";
      label: string;
      detail?: string;
    }
  | {
      type: "analysis_complete";
      sessionId: string;
      status: "analyzed" | "cache-hit";
      outputPath: string;
      rawOutputPath: string;
      analysis: GameGeneratorInput;
    }
  | {
      type: "analysis_error";
      code: string;
      message: string;
      sessionId: string;
      chunksPath: string;
      directory: string;
    }
  | { type: "error"; code: string; message: string; recoverable?: boolean };

export type LiveSessionManifest = {
  version: 1;
  sessionId: string;
  source: "realtime";
  timelineOrigin: "listening_start";
  model: "gpt-live-transcribe";
  sessionType: "transcription";
  connectionIntent: "transcription";
  turnSegmentation: "client_interval";
  commitIntervalMs: number;
  language: "ko";
  sampleRate: 24000;
  startedAt: string;
  stoppedAt: string;
  chunkCount: number;
};

export type GameHandoff = {
  version: 1;
  sessionId: string;
  outputPath: string;
  createdAt: string;
  gameInput: GameGeneratorInput;
};

export type GameRuntimeContext = {
  sessionId: string;
  outputPath: string;
  onComplete: (result: unknown) => void;
};

export type PipelineStage =
  | "hashing"
  | "cache_hit"
  | "extracting_audio"
  | "transcribing"
  | "normalizing"
  | "ready_for_concepts"
  | "complete";

export type PipelineProgress = {
  stage: PipelineStage;
  label: string;
  detail?: string;
};

export type TranscriptCacheManifest = {
  version: 1;
  sourceSha256: string;
  sourceFileName: string;
  sourceSizeBytes: number;
  audioFileName: string;
  model: "whisper-1";
  language: "ko";
  createdAt: string;
};

export type EvidenceReference = {
  chunkId: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type CoreConcept = {
  id: string;
  name: string;
  definition: string;
  whyImportant: string;
  importanceScore: number;
  difficulty: "introductory" | "intermediate" | "advanced";
  prerequisiteConceptIds: string[];
  relatedConceptIds: string[];
  evidence: EvidenceReference[];
};

export type LectureExample = {
  id: string;
  title: string;
  situation: string;
  explanation: string;
  conceptIds: string[];
  evidence: EvidenceReference[];
};

export type ConceptConfusion = {
  id: string;
  title: string;
  conceptIds: string[];
  mistakenBelief: string;
  correctDistinction: string;
  diagnosticQuestion: string;
  basis: "explicit" | "pedagogical_inference";
  evidence: EvidenceReference[];
};

export type GameGeneratorInput = {
  version: "2.0";
  generatedAt: string;
  model: string;
  source: {
    transcriptSha256: string;
    language: "ko";
    durationMs: number;
    chunkCount: number;
  };
  validation: {
    normalizationWarnings: string[];
  };
  lecture: {
    title: string;
    summary: string;
    learningObjectives: string[];
  };
  coreConcepts: CoreConcept[];
  examples: LectureExample[];
  confusions: ConceptConfusion[];
  conceptSequence: Array<{
    fromConceptId: string;
    toConceptId: string;
    relationship: string;
  }>;
  roomBlueprint: {
    format: "single_room";
    room: {
      title: string;
      story: string;
      goal: string;
      theme: string;
      stages: Array<{
        id: string;
        type: "concept_discovery" | "case_application" | "synthesis_judgment";
        title: string;
        goal: string;
        objectIds: string[];
        conceptIds: string[];
        exampleIds: string[];
        confusionIds: string[];
        recurrenceConceptIds: string[];
      }>;
    };
  };
};
