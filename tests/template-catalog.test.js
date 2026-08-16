import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_TEMPLATES,
  getPuzzleTemplate,
  ITEM_PLACEMENT_TEMPLATES,
  PUZZLE_TEMPLATE_CATALOG,
  recommendPuzzleTemplate,
} from "../packages/content-schema/src/index.js";

test("the template catalog maps all nine templates to executable kinds", () => {
  assert.equal(Object.keys(PUZZLE_TEMPLATE_CATALOG).length, 9);
  assert.deepEqual(ITEM_PLACEMENT_TEMPLATES, [
    "MISSING_TOKEN",
    "ORDER_ITEMS",
    "KEY_TO_LOCK",
    "MATCH_ITEM",
    "FINAL_SAFE",
  ]);
  assert.deepEqual(CONTROL_TEMPLATES, [
    "NUMERIC_KEYPAD",
    "SYMBOL_KEYPAD",
    "MULTI_DIAL",
    "SWITCH_BANK",
  ]);
  assert.equal(getPuzzleTemplate("NUMERIC_KEYPAD").kind, "KEYPAD");
  assert.equal(getPuzzleTemplate("MULTI_DIAL").kind, "DIAL_LOCK");
  assert.equal(getPuzzleTemplate("not-a-template"), null);
});

test("recommendPuzzleTemplate selects control templates from answer semantics", () => {
  assert.equal(
    recommendPuzzleTemplate({ answerType: "numeric calculation" }),
    "NUMERIC_KEYPAD",
  );
  assert.equal(
    recommendPuzzleTemplate({ answerType: "symbolic formula" }),
    "SYMBOL_KEYPAD",
  );
  assert.equal(
    recommendPuzzleTemplate({ taskType: "multi-select" }),
    "SWITCH_BANK",
  );
  assert.equal(
    recommendPuzzleTemplate({ taskType: "ordered classification" }),
    "MULTI_DIAL",
  );
});

test("recommendPuzzleTemplate respects room availability and final-safe rules", () => {
  assert.equal(
    recommendPuzzleTemplate(
      { answerType: "numeric" },
      ["MISSING_TOKEN", "MATCH_ITEM"],
    ),
    "MATCH_ITEM",
  );
  assert.equal(
    recommendPuzzleTemplate(
      { taskType: "multi-select" },
      [{ template: "SWITCH_BANK" }],
    ),
    "SWITCH_BANK",
  );
  assert.equal(recommendPuzzleTemplate({ isFinal: true }), "FINAL_SAFE");
  assert.equal(
    recommendPuzzleTemplate({ isFinal: true }, ["NUMERIC_KEYPAD"]),
    null,
  );
  assert.equal(recommendPuzzleTemplate({}, []), null);
});
