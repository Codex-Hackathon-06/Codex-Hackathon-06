import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildGenerationPrompt,
  suggestPuzzleCount,
  validatePuzzlePack,
} from "../packages/content-schema/src/index.js";

const fixtureUrl = new URL(
  "../content/sample-lectures/puppy-poop.room.json",
  import.meta.url,
);
const schemaUrl = new URL(
  "../packages/content-schema/puzzle-pack.schema.json",
  import.meta.url,
);

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

const clone = (value) => structuredClone(value);
const placementsOf = (puzzle) =>
  Array.isArray(puzzle.solution) ? puzzle.solution : puzzle.solution.placements;

test("suggestPuzzleCount allocates one puzzle per six minutes within demo limits", () => {
  assert.equal(suggestPuzzleCount(0), 3);
  assert.equal(suggestPuzzleCount(6 * 60), 3);
  assert.equal(suggestPuzzleCount(18 * 60), 3);
  assert.equal(suggestPuzzleCount(18 * 60 + 1), 4);
  assert.equal(suggestPuzzleCount(24 * 60 + 1), 5);
  assert.equal(suggestPuzzleCount(30 * 60), 5);
  assert.equal(suggestPuzzleCount(60 * 60), 5);
  assert.throws(() => suggestPuzzleCount(-1), RangeError);
  assert.throws(() => suggestPuzzleCount(Number.NaN), TypeError);
});

test("the puppy-poop sample is a valid five-puzzle safe room", async () => {
  const pack = await loadFixture();
  const result = validatePuzzlePack(pack);

  assert.equal(pack.room.declaredPuzzleCount, 5);
  assert.equal(pack.puzzles.length, 5);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("validatePuzzlePack reports item and slot reference failures", async () => {
  const pack = clone(await loadFixture());
  pack.puzzles[0].candidateItemIds[0] = "missing-item";
  placementsOf(pack.puzzles[0])[0].slotId = "missing-slot";

  const result = validatePuzzlePack(pack);
  const codes = new Set(result.errors.map((error) => error.code));

  assert.equal(result.valid, false);
  assert.equal(codes.has("UNKNOWN_ITEM_REF"), true);
  assert.equal(codes.has("UNKNOWN_SLOT_REF"), true);
});

test("validatePuzzlePack rejects the legacy object-shaped solution", async () => {
  const pack = clone(await loadFixture());
  pack.puzzles[0].solution = {
    placements: pack.puzzles[0].solution,
  };

  const result = validatePuzzlePack(pack);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === "INVALID_SOLUTION"),
    true,
  );
});

test("the JSON Schema requires array solutions and ordered staged hints", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const puzzleProperties = schema.$defs.puzzle.properties;

  assert.equal(puzzleProperties.solution.type, "array");
  assert.deepEqual(
    puzzleProperties.hints.prefixItems.map(
      (entry) => entry.allOf[1].properties.type.const,
    ),
    ["OBSERVATION", "CONCEPT", "DIRECTION"],
  );
  assert.equal(
    schema.$defs.feedback.required.includes("wrongSlot"),
    true,
  );
});

test("validatePuzzlePack rejects empty segments and evidence without a real segment", async () => {
  const pack = clone(await loadFixture());
  pack.video.segments = [];

  const result = validatePuzzlePack(pack);
  const codes = new Set(result.errors.map((error) => error.code));

  assert.equal(result.valid, false);
  assert.equal(codes.has("EMPTY_SEGMENTS"), true);
  assert.equal(codes.has("UNKNOWN_SEGMENT_REF"), true);
});

test("validatePuzzlePack requires hints in observation-concept-direction order", async () => {
  const pack = clone(await loadFixture());
  [pack.puzzles[0].hints[0], pack.puzzles[0].hints[1]] = [
    pack.puzzles[0].hints[1],
    pack.puzzles[0].hints[0],
  ];

  const result = validatePuzzlePack(pack);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === "INVALID_HINT_SEQUENCE"),
    true,
  );
});

test("validatePuzzlePack requires dedicated feedback for every distractor", async () => {
  const pack = clone(await loadFixture());
  const puzzle = pack.puzzles.find((candidate) => {
    const solutionIds = new Set(
      placementsOf(candidate).map((placement) => placement.itemId),
    );
    return candidate.candidateItemIds.some((itemId) => !solutionIds.has(itemId));
  });

  assert.ok(puzzle, "fixture must include at least one distractor item");
  const solutionIds = new Set(
    placementsOf(puzzle).map((placement) => placement.itemId),
  );
  const distractorId = puzzle.candidateItemIds.find(
    (itemId) => !solutionIds.has(itemId),
  );
  delete puzzle.feedback.byItemId[distractorId];

  const result = validatePuzzlePack(pack);
  const missingFeedback = result.errors.find(
    (error) =>
      error.code === "MISSING_DISTRACTOR_FEEDBACK" &&
      error.path.endsWith(distractorId),
  );

  assert.equal(result.valid, false);
  assert.ok(missingFeedback);
});

test("validatePuzzlePack rejects duplicate distractor feedback and empty wrong-slot feedback", async () => {
  const pack = clone(await loadFixture());
  const puzzle = pack.puzzles[3];
  const feedback = puzzle.feedback;
  const solutionIds = new Set(
    placementsOf(puzzle).map((placement) => placement.itemId),
  );
  const [firstDistractorId, secondDistractorId] =
    puzzle.candidateItemIds.filter((itemId) => !solutionIds.has(itemId));
  feedback.byItemId[secondDistractorId] =
    feedback.byItemId[firstDistractorId];
  feedback.wrongSlot = "   ";

  const result = validatePuzzlePack(pack);
  const codes = new Set(result.errors.map((error) => error.code));

  assert.equal(result.valid, false);
  assert.equal(codes.has("DUPLICATE_DISTRACTOR_FEEDBACK"), true);
  assert.equal(codes.has("INVALID_WRONG_SLOT_FEEDBACK"), true);
});

test("validatePuzzlePack rejects a solution item awarded by the same or a future puzzle", async () => {
  const makeDeadlock = async (rewardItemId) => {
    const pack = clone(await loadFixture());
    pack.puzzles[0].candidateItemIds = [rewardItemId];
    pack.puzzles[0].solution = [
      { slotId: "bookshelf-slot-1", itemId: rewardItemId },
    ];
    pack.puzzles[0].feedback.byItemId = {};
    return validatePuzzlePack(pack);
  };

  const samePuzzleResult = await makeDeadlock("safe-token-1");
  const futurePuzzleResult = await makeDeadlock("safe-token-2");

  for (const result of [samePuzzleResult, futurePuzzleResult]) {
    assert.equal(result.valid, false);
    assert.equal(
      result.errors.some((error) => error.code === "UNAVAILABLE_SOLUTION_ITEM"),
      true,
    );
  }
});

test("validatePuzzlePack enforces the final-safe reward chain", async () => {
  const pack = clone(await loadFixture());
  const finalPuzzle = pack.puzzles.find(
    (puzzle) => puzzle.id === pack.completion.finalPuzzleId,
  );
  const finalTokenId = placementsOf(finalPuzzle)[0].itemId;
  const sourcePuzzle = pack.puzzles.find((puzzle) =>
    puzzle.rewards.some((reward) => reward.itemId === finalTokenId),
  );
  sourcePuzzle.rewards = sourcePuzzle.rewards.filter(
    (reward) => reward.itemId !== finalTokenId,
  );

  const result = validatePuzzlePack(pack);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === "INVALID_SAFE_TOKEN_REWARD"),
    true,
  );
});

test("buildGenerationPrompt fixes a 30-minute lecture at five item-placement puzzles", () => {
  const input = {
    video: {
      videoId: "video-1",
      title: "강아지똥 작품 이해",
      durationSec: 30 * 60,
      segments: [{ id: "segment-1", text: "작품의 핵심 내용" }],
    },
  };
  const capabilities = {
    roomId: "lecture-room",
    views: ["bookshelf-view", "desk-view"],
    targets: [
      {
        id: "desk-safe",
        viewId: "desk-view",
        slotIds: ["safe-slot-1"],
      },
    ],
    allowedAssets: ["book", "concept-token"],
  };

  const prompt = buildGenerationPrompt(input, capabilities);

  assert.match(prompt, /퍼즐은 정확히 5개/);
  assert.match(prompt, /FINAL_SAFE/);
  assert.match(prompt, /ITEM_PLACEMENT/);
  assert.match(prompt, /correctOptionIndex/);
  assert.match(prompt, /"roomId": "lecture-room"/);
  assert.match(prompt, /"id": "segment-1"/);
});

test("buildGenerationPrompt rejects capabilities without fixed slot IDs", () => {
  assert.throws(
    () =>
      buildGenerationPrompt(
        { video: { durationSec: 30 * 60 } },
        { targets: [{ id: "desk-safe", viewId: "desk-view" }] },
      ),
    /slotId/,
  );
});
