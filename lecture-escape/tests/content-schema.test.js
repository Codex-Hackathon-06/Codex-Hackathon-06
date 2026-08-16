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
const controlFixtureUrl = new URL(
  "../content/sample-lectures/coding-agents.room.json",
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
  const itemPuzzleProperties =
    schema.$defs.itemPlacementPuzzle.allOf[1].properties;
  const commonPuzzleProperties = schema.$defs.puzzleCommon.properties;

  assert.equal(itemPuzzleProperties.solution.type, "array");
  assert.deepEqual(
    commonPuzzleProperties.hints.prefixItems.map(
      (entry) => entry.allOf[1].properties.type.const,
    ),
    ["OBSERVATION", "CONCEPT", "DIRECTION"],
  );
  assert.equal(
    schema.$defs.itemFeedback.required.includes("wrongSlot"),
    true,
  );
  assert.deepEqual(schema.$defs.viewUnlock.required, [
    "itemId",
    "lockedMessage",
    "unlockedMessage",
  ]);
  assert.equal(
    schema.$defs.view.properties.unlock.$ref,
    "#/$defs/viewUnlock",
  );
  assert.equal(schema.$defs.puzzle.oneOf.length, 4);
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

test("validatePuzzlePack enforces physical view unlock rewards from the immediately previous puzzle", async () => {
  const source = JSON.parse(await readFile(controlFixtureUrl, "utf8"));
  const unknownItemPack = clone(source);
  unknownItemPack.room.views.find(({ id }) => id === "wall").unlock.itemId =
    "missing-access-item";
  const wrongPuzzlePack = clone(source);
  wrongPuzzlePack.room.views.find(({ id }) => id === "wall").unlock.itemId =
    "drawer-key";
  const missingRewardPack = clone(source);
  missingRewardPack.puzzles[0].rewards = [];

  const unknownResult = validatePuzzlePack(unknownItemPack);
  const wrongPuzzleResult = validatePuzzlePack(wrongPuzzlePack);
  const missingRewardResult = validatePuzzlePack(missingRewardPack);

  assert.equal(
    unknownResult.errors.some(({ code }) => code === "UNKNOWN_UNLOCK_ITEM"),
    true,
  );
  assert.equal(
    wrongPuzzleResult.errors.some(
      ({ code }) => code === "VIEW_UNLOCK_NOT_PREVIOUS_REWARD",
    ),
    true,
  );
  assert.equal(
    missingRewardResult.errors.some(
      ({ code }) => code === "INVALID_VIEW_UNLOCK_REWARD",
    ),
    true,
  );
});

test("validatePuzzlePack rejects unlock items placed outside their reward view or not consumable", async () => {
  const source = JSON.parse(await readFile(controlFixtureUrl, "utf8"));
  const unlockItemIndex = source.items.findIndex(
    ({ id }) => id === "wall-access-card",
  );
  const wrongSourceViewPack = clone(source);
  wrongSourceViewPack.items[unlockItemIndex].source.viewId = "desk";
  const notConsumedPack = clone(source);
  notConsumedPack.items[unlockItemIndex].consumedOnUse = false;
  const missingConsumedFlagPack = clone(source);
  delete missingConsumedFlagPack.items[unlockItemIndex].consumedOnUse;

  const wrongSourceViewResult = validatePuzzlePack(wrongSourceViewPack);
  const notConsumedResult = validatePuzzlePack(notConsumedPack);
  const missingConsumedFlagResult = validatePuzzlePack(missingConsumedFlagPack);
  const sourceViewError = wrongSourceViewResult.errors.find(
    ({ code }) => code === "VIEW_UNLOCK_SOURCE_VIEW_MISMATCH",
  );

  assert.deepEqual(sourceViewError, {
    code: "VIEW_UNLOCK_SOURCE_VIEW_MISMATCH",
    path: `$.items[${unlockItemIndex}].source.viewId`,
    message:
      "must match source puzzle puzzle-1 viewId bookshelf so wall-access-card can be collected before unlocking wall",
  });
  for (const result of [notConsumedResult, missingConsumedFlagResult]) {
    assert.equal(
      result.errors.some(
        ({ code, path }) =>
          code === "VIEW_UNLOCK_ITEM_NOT_CONSUMABLE" &&
          path === `$.items[${unlockItemIndex}].consumedOnUse`,
      ),
      true,
    );
  }
});

test("validatePuzzlePack requires at least two final-safe parts and exact candidate-solution parity", async () => {
  const source = JSON.parse(await readFile(controlFixtureUrl, "utf8"));
  const tooSmallPack = clone(source);
  const tooSmallFinal = tooSmallPack.puzzles.at(-1);
  tooSmallFinal.candidateItemIds = ["safe-handle"];
  tooSmallFinal.slots = [tooSmallFinal.slots[0]];
  tooSmallFinal.solution = [tooSmallFinal.solution[0]];

  const mismatchPack = clone(source);
  mismatchPack.puzzles.at(-1).candidateItemIds.pop();

  const tooSmallResult = validatePuzzlePack(tooSmallPack);
  const mismatchResult = validatePuzzlePack(mismatchPack);

  assert.equal(
    tooSmallResult.errors.some(({ code }) => code === "FINAL_SAFE_TOO_FEW_ITEMS"),
    true,
  );
  assert.equal(
    mismatchResult.errors.some(({ code }) => code === "FINAL_SAFE_TOKEN_MISMATCH"),
    true,
  );
});

test("buildGenerationPrompt fixes a 30-minute lecture at five mixed-template puzzles", () => {
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
        template: "FINAL_SAFE",
        slotIds: ["safe-slot-1", "safe-slot-2"],
      },
      {
        id: "formula-keypad",
        viewId: "desk-view",
        template: "NUMERIC_KEYPAD",
        controlIds: ["formula-keypad-control"],
      },
    ],
    allowedAssets: ["book", "concept-token"],
  };

  const prompt = buildGenerationPrompt(input, capabilities);

  assert.match(prompt, /퍼즐은 정확히 5개/);
  assert.match(prompt, /P2는 \[P1\].*P3는 \[P2\]/s);
  assert.match(prompt, /FINAL_SAFE/);
  assert.match(prompt, /ITEM_PLACEMENT/);
  assert.match(prompt, /NUMERIC_KEYPAD/);
  assert.match(prompt, /다음 room\.views 항목의 unlock\.itemId/);
  assert.match(prompt, /조립 부품을 최소 2개/);
  assert.match(prompt, /candidateItemIds와 solution의 itemId 집합은 정확히 같아야/);
  assert.match(prompt, /controlIds/);
  assert.match(prompt, /correctOptionIndex/);
  assert.match(prompt, /"roomId": "lecture-room"/);
  assert.match(prompt, /"id": "segment-1"/);
});

test("buildGenerationPrompt rejects capabilities without fixed slot IDs", () => {
  assert.throws(
    () =>
      buildGenerationPrompt(
        { video: { durationSec: 30 * 60 } },
        {
          targets: [
            {
              id: "desk-safe",
              viewId: "desk-view",
              template: "FINAL_SAFE",
            },
          ],
        },
      ),
    /slotId/,
  );
});

test("validatePuzzlePack accepts keypad, dial, toggle, and final-safe branches", async () => {
  const pack = JSON.parse(await readFile(controlFixtureUrl, "utf8"));
  const result = validatePuzzlePack(pack);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    pack.puzzles.map(({ kind }) => kind),
    ["TOGGLE_PANEL", "KEYPAD", "DIAL_LOCK", "KEYPAD", "ITEM_PLACEMENT"],
  );
  assert.deepEqual(
    pack.puzzles.map(({ requiresPuzzleIds }) => requiresPuzzleIds),
    [
      [],
      ["puzzle-1"],
      ["puzzle-2"],
      ["puzzle-3"],
      ["puzzle-1", "puzzle-2", "puzzle-3", "puzzle-4"],
    ],
  );
  const precedingRewards = pack.puzzles
    .slice(0, -1)
    .flatMap(({ rewards }) =>
      rewards
        .filter(({ type }) => type === "REVEAL_ITEM")
        .map(({ itemId }) => itemId),
    );
  const unlockChain = pack.room.views
    .filter(({ unlock }) => unlock)
    .map(({ id, unlock }) => [id, unlock.itemId]);
  assert.deepEqual(unlockChain, [
    ["wall", "wall-access-card"],
    ["drawer", "drawer-key"],
    ["desk", "desk-power-fuse"],
  ]);
  assert.deepEqual(precedingRewards, [
    "wall-access-card",
    "drawer-key",
    "desk-power-fuse",
    "safe-handle",
    "safe-gear",
    "safe-power-core",
  ]);
  assert.equal(
    pack.items
      .filter(({ id }) => id !== "exit-key")
      .every(({ consumedOnUse }) => consumedOnUse === true),
    true,
  );
  assert.deepEqual(
    new Set(pack.puzzles.at(-1).solution.map(({ itemId }) => itemId)),
    new Set(pack.puzzles[3].rewards.map(({ itemId }) => itemId)),
  );
});

test("validatePuzzlePack enforces control answers and toggle distractor feedback", async () => {
  const pack = JSON.parse(await readFile(controlFixtureUrl, "utf8"));
  const keypad = pack.puzzles.find(({ template }) => template === "NUMERIC_KEYPAD");
  const toggle = pack.puzzles.find(({ template }) => template === "SWITCH_BANK");
  const dial = pack.puzzles.find(({ template }) => template === "MULTI_DIAL");

  keypad.solution.value = "75X0";
  delete toggle.feedback.byControlId["feature-text-only"];
  dial.solution.valuesByControlId["terminal-1"] = "UNKNOWN";

  const result = validatePuzzlePack(pack);
  const codes = new Set(result.errors.map(({ code }) => code));

  assert.equal(result.valid, false);
  assert.equal(codes.has("UNENTERABLE_KEYPAD_SOLUTION"), true);
  assert.equal(codes.has("MISSING_DISTRACTOR_FEEDBACK"), true);
  assert.equal(codes.has("INVALID_CONTROL_SOLUTION"), true);
});

test("buildGenerationPrompt accepts controlIds and rejects mismatched capability IDs", () => {
  const lecture = { video: { durationSec: 12 * 60 } };
  assert.doesNotThrow(() =>
    buildGenerationPrompt(lecture, {
      targets: [
        {
          id: "switch-panel",
          viewId: "wall",
          template: "SWITCH_BANK",
          controlIds: ["switch-a", "switch-b"],
        },
      ],
    }),
  );
  assert.throws(
    () =>
      buildGenerationPrompt(lecture, {
        targets: [
          {
            id: "switch-panel",
            viewId: "wall",
            template: "SWITCH_BANK",
            slotIds: ["wrong-kind-of-id"],
          },
        ],
      }),
    /controlId/,
  );
});
