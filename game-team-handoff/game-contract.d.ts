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

export type RoomStage = {
  id: string;
  type: "concept_discovery" | "case_application" | "synthesis_judgment";
  title: string;
  goal: string;
  objectIds: string[];
  conceptIds: string[];
  exampleIds: string[];
  confusionIds: string[];
  recurrenceConceptIds: string[];
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
  validation: { normalizationWarnings: string[] };
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
      stages: RoomStage[];
    };
  };
};

export type GameCompletionResult = {
  escaped: boolean;
  wrongConceptIds: string[];
  hintCount: number;
  answerRevealCount: number;
  completedAt: string;
};

export type GameRuntimeContext = {
  sessionId: string;
  outputPath: string;
  onComplete: (result: GameCompletionResult) => void;
};

export declare function mountGame(
  root: HTMLElement,
  gameInput: GameGeneratorInput,
  context: GameRuntimeContext,
): Promise<void>;
