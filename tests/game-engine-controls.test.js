import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPuzzleInput,
  createInitialState,
  getPuzzleControlOrder,
  getPuzzleForSlot,
  getPuzzleInput,
  getVisibleItems,
  navigate,
  submitPuzzleAnswer,
} from "../packages/game-engine/src/runtime.js";

const explanation = (title, segmentId) => ({
  title,
  body: `${title} 해설`,
  evidenceSegmentIds: [segmentId],
});

const controlPack = {
  room: {
    initialViewId: "keypad-view",
    views: [
      { id: "keypad-view" },
      { id: "dial-view" },
      { id: "toggle-view" },
    ],
  },
  video: {
    segments: [
      { id: "seg-keypad", text: "6 곱하기 7은 42입니다." },
      { id: "seg-dial", text: "계획 다음에는 구현과 검증을 진행합니다." },
      { id: "seg-toggle", text: "린트와 테스트를 함께 확인합니다." },
    ],
  },
  items: [
    {
      id: "keypad-reward",
      label: "첫 번째 토큰",
      source: {
        type: "PUZZLE_REWARD",
        puzzleId: "keypad-puzzle",
        viewId: "dial-view",
      },
    },
  ],
  completion: { finalPuzzleId: "toggle-puzzle" },
  puzzles: [
    {
      id: "keypad-puzzle",
      kind: "KEYPAD",
      viewId: "keypad-view",
      requiresPuzzleIds: [],
      control: {
        keys: ["1", "2", "3", "4"],
        maxLength: 2,
      },
      solution: { value: "42" },
      feedback: {
        byAnswer: { "13": "두 수를 더하지 말고 곱해 보세요." },
        defaultWrongAnswer: "계산 결과를 다시 확인하세요.",
      },
      explanation: explanation("정답: 42", "seg-keypad"),
    },
    {
      id: "dial-puzzle",
      kind: "DIAL_LOCK",
      viewId: "dial-view",
      requiresPuzzleIds: ["keypad-puzzle"],
      control: {
        dials: [
          { id: "phase", label: "단계", options: ["계획", "구현"] },
          { id: "scope", label: "범위", options: ["파일", "프로젝트"] },
        ],
      },
      solution: {
        valuesByControlId: { phase: "구현", scope: "프로젝트" },
      },
      feedback: {
        byControlId: { scope: "범위 다이얼은 프로젝트로 맞추세요." },
        defaultWrongAnswer: "다이얼 조합을 다시 확인하세요.",
      },
      explanation: explanation("정답: 구현·프로젝트", "seg-dial"),
    },
    {
      id: "toggle-puzzle",
      kind: "TOGGLE_PANEL",
      viewId: "toggle-view",
      requiresPuzzleIds: ["dial-puzzle"],
      control: {
        switches: [
          { id: "lint", label: "린트" },
          { id: "test", label: "테스트", description: "회귀 테스트" },
          { id: "deploy", label: "배포" },
        ],
      },
      solution: { selectedControlIds: ["lint", "test"] },
      feedback: {
        byControlId: { deploy: "검증 단계에서는 아직 배포하지 않습니다." },
        defaultWrongAnswer: "필요한 검증 항목만 켜세요.",
      },
      explanation: explanation("정답: 린트·테스트", "seg-toggle"),
    },
  ],
};

function createControlState(options = { rng: () => 0 }) {
  return createInitialState(controlPack, options);
}

function press(state, key) {
  return applyPuzzleInput(controlPack, state, "keypad-puzzle", {
    type: "PRESS",
    key,
  });
}

function solveKeypad() {
  let state = createControlState();
  state = press(state, "4");
  state = press(state, "2");
  return submitPuzzleAnswer(controlPack, state, "keypad-puzzle");
}

function solveDial() {
  let state = navigate(controlPack, solveKeypad(), "dial-view");
  state = applyPuzzleInput(controlPack, state, "dial-puzzle", {
    type: "CYCLE",
    controlId: "phase",
    direction: 1,
  });
  state = applyPuzzleInput(controlPack, state, "dial-puzzle", {
    type: "CYCLE",
    controlId: "scope",
    direction: "-1",
  });
  return submitPuzzleAnswer(controlPack, state, "dial-puzzle");
}

test("control inputs are materialized once and slot lookup skips puzzles without slots", () => {
  const state = createControlState();

  assert.deepEqual(getPuzzleInput(controlPack, state, "keypad-puzzle"), {
    value: "",
  });
  assert.deepEqual(getPuzzleInput(controlPack, state, "dial-puzzle"), {
    valuesByControlId: { phase: "계획", scope: "파일" },
  });
  assert.deepEqual(getPuzzleInput(controlPack, state, "toggle-puzzle"), {
    selectedControlIds: [],
  });
  assert.equal(getPuzzleInput(controlPack, state, "missing"), null);
  assert.equal(getPuzzleForSlot(controlPack, "missing-slot"), null);
});

test("dial defaults and switch order are seeded, valid, stable, and not pre-solved", () => {
  const first = createControlState({ seed: "session-alpha" });
  const replay = createControlState({ seed: "session-alpha" });
  const dialInput = getPuzzleInput(controlPack, first, "dial-puzzle");

  assert.deepEqual(first.puzzleInputs, replay.puzzleInputs);
  assert.deepEqual(first.controlOrderByPuzzleId, replay.controlOrderByPuzzleId);

  for (const dial of controlPack.puzzles[1].control.dials) {
    assert.equal(
      dial.options.includes(dialInput.valuesByControlId[dial.id]),
      true,
    );
  }
  assert.notDeepEqual(
    dialInput.valuesByControlId,
    controlPack.puzzles[1].solution.valuesByControlId,
  );

  const firstOrder = getPuzzleControlOrder(
    controlPack,
    first,
    "toggle-puzzle",
  );
  assert.deepEqual(
    [...firstOrder].sort(),
    controlPack.puzzles[2].control.switches.map((control) => control.id).sort(),
  );
  assert.deepEqual(
    getPuzzleControlOrder(controlPack, first, "toggle-puzzle"),
    firstOrder,
  );
  assert.deepEqual(getPuzzleControlOrder(controlPack, first, "dial-puzzle"), []);
});

test("a randomized dial cannot accidentally start on the complete solution", () => {
  const state = createControlState({ rng: () => 0.999999 });
  const input = getPuzzleInput(controlPack, state, "dial-puzzle");

  assert.notDeepEqual(
    input.valuesByControlId,
    controlPack.puzzles[1].solution.valuesByControlId,
  );
  assert.equal(
    controlPack.puzzles[1].control.dials[0].options.includes(
      input.valuesByControlId.phase,
    ),
    true,
  );
});

test("control actions guard the current view, requirements, and solved puzzles", () => {
  const initial = createControlState();
  const wrongView = navigate(controlPack, initial, "toggle-view");
  assert.equal(
    applyPuzzleInput(controlPack, wrongView, "keypad-puzzle", {
      type: "PRESS",
      key: "4",
    }),
    wrongView,
  );
  assert.equal(
    submitPuzzleAnswer(controlPack, wrongView, "keypad-puzzle"),
    wrongView,
  );

  const dialView = navigate(controlPack, initial, "dial-view");
  const locked = applyPuzzleInput(controlPack, dialView, "dial-puzzle", {
    type: "CYCLE",
    controlId: "phase",
    direction: 1,
  });
  assert.equal(locked.overlay.type, "LOCKED");
  assert.deepEqual(
    getPuzzleInput(controlPack, locked, "dial-puzzle"),
    getPuzzleInput(controlPack, initial, "dial-puzzle"),
  );
  assert.equal(
    submitPuzzleAnswer(controlPack, dialView, "dial-puzzle").overlay.type,
    "LOCKED",
  );

  const solved = solveKeypad();
  assert.equal(
    applyPuzzleInput(controlPack, solved, "keypad-puzzle", {
      type: "CLEAR",
    }),
    solved,
  );
  assert.equal(submitPuzzleAnswer(controlPack, solved, "keypad-puzzle"), solved);
});

test("keypad supports press, backspace, clear, max length, and answer-specific feedback", () => {
  let state = createControlState();
  state = press(state, "1");
  state = press(state, "3");

  const tooLong = press(state, "4");
  assert.equal(tooLong, state);

  state = submitPuzzleAnswer(controlPack, state, "keypad-puzzle");
  assert.equal(state.overlay.type, "WRONG");
  assert.match(state.overlay.body, /더하지 말고 곱/);
  assert.deepEqual(getPuzzleInput(controlPack, state, "keypad-puzzle"), {
    value: "13",
  });

  state = applyPuzzleInput(controlPack, state, "keypad-puzzle", {
    type: "BACKSPACE",
  });
  state = submitPuzzleAnswer(controlPack, state, "keypad-puzzle");
  assert.equal(state.overlay.body, "계산 결과를 다시 확인하세요.");

  state = applyPuzzleInput(controlPack, state, "keypad-puzzle", {
    type: "CLEAR",
  });
  state = press(state, "4");
  state = press(state, "2");
  state = submitPuzzleAnswer(controlPack, state, "keypad-puzzle");

  assert.deepEqual(state.solvedPuzzleIds, ["keypad-puzzle"]);
  assert.equal(state.overlay.type, "EXPLANATION");
  assert.deepEqual(state.overlay.evidence.map((segment) => segment.id), [
    "seg-keypad",
  ]);
  assert.equal(
    getVisibleItems(controlPack, state, "dial-view").some(
      (item) => item.id === "keypad-reward",
    ),
    true,
  );
});

test("dial lock cycles in both directions and preserves wrong input", () => {
  let state = navigate(controlPack, solveKeypad(), "dial-view");
  state = applyPuzzleInput(controlPack, state, "dial-puzzle", {
    type: "CYCLE",
    controlId: "phase",
    direction: 1,
  });

  state = submitPuzzleAnswer(controlPack, state, "dial-puzzle");
  assert.equal(state.overlay.type, "WRONG");
  assert.equal(state.overlay.body, "범위 다이얼은 프로젝트로 맞추세요.");
  assert.deepEqual(getPuzzleInput(controlPack, state, "dial-puzzle"), {
    valuesByControlId: { phase: "구현", scope: "파일" },
  });

  state = applyPuzzleInput(controlPack, state, "dial-puzzle", {
    type: "CYCLE",
    controlId: "scope",
    direction: -1,
  });
  assert.equal(
    getPuzzleInput(controlPack, state, "dial-puzzle").valuesByControlId.scope,
    "프로젝트",
  );

  state = submitPuzzleAnswer(controlPack, state, "dial-puzzle");
  assert.deepEqual(state.solvedPuzzleIds, ["keypad-puzzle", "dial-puzzle"]);
  assert.equal(state.overlay.type, "EXPLANATION");
});

test("toggle panel compares an exact set without escaping at final-puzzle solve", () => {
  let state = navigate(controlPack, solveDial(), "toggle-view");
  for (const controlId of ["lint", "test", "deploy"]) {
    state = applyPuzzleInput(controlPack, state, "toggle-puzzle", {
      type: "TOGGLE",
      controlId,
    });
  }

  state = submitPuzzleAnswer(controlPack, state, "toggle-puzzle");
  assert.equal(state.overlay.type, "WRONG");
  assert.equal(state.overlay.body, "검증 단계에서는 아직 배포하지 않습니다.");
  assert.deepEqual(
    getPuzzleInput(controlPack, state, "toggle-puzzle").selectedControlIds,
    ["lint", "test", "deploy"],
  );

  state = applyPuzzleInput(controlPack, state, "toggle-puzzle", {
    type: "TOGGLE",
    controlId: "deploy",
  });
  state = submitPuzzleAnswer(controlPack, state, "toggle-puzzle");

  assert.equal(state.escaped, false);
  assert.equal(state.exitUnlocked, false);
  assert.deepEqual(state.solvedPuzzleIds, [
    "keypad-puzzle",
    "dial-puzzle",
    "toggle-puzzle",
  ]);
  assert.equal(state.overlay.type, "EXPLANATION");
  assert.equal(state.overlay.body, "정답: 린트·테스트 해설");
  assert.deepEqual(state.overlay.evidence.map((segment) => segment.id), [
    "seg-toggle",
  ]);
});
