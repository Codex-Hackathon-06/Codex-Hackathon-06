import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectItem,
  createInitialState,
  navigate,
  resetState,
  revealAnswer,
  showHint,
  tryUseItem,
} from "../packages/game-engine/src/runtime.js";

const fixtureUrl = new URL(
  "../content/sample-lectures/puppy-poop.room.json",
  import.meta.url,
);
const pack = JSON.parse(await readFile(fixtureUrl, "utf8"));

function hintsFor(state, puzzleId, count) {
  let nextState = state;
  for (let index = 0; index < count; index += 1) {
    nextState = showHint(pack, nextState, puzzleId);
  }
  return nextState;
}

test("initial and reset states start with no revealed answers", () => {
  const initial = createInitialState(pack);
  assert.deepEqual(initial.answerRevealedPuzzleIds, []);
  assert.deepEqual(initial.consumedItemIds, []);
  assert.equal(initial.exitUnlocked, false);

  const progressed = {
    ...initial,
    answerRevealedPuzzleIds: ["puzzle-1"],
  };
  assert.deepEqual(resetState(pack).answerRevealedPuzzleIds, []);
  assert.deepEqual(resetState(pack).consumedItemIds, []);
  assert.equal(resetState(pack).exitUnlocked, false);
  assert.notDeepEqual(progressed.answerRevealedPuzzleIds, []);
});

test("only the first two hints are exposed even when the schema keeps three", () => {
  const puzzle = pack.puzzles.find((entry) => entry.id === "puzzle-1");
  let state = navigate(pack, createInitialState(pack), puzzle.viewId);

  state = showHint(pack, state, puzzle.id);
  assert.equal(state.hintLevelByPuzzle[puzzle.id], 1);
  assert.equal(state.overlay.title, "힌트 1/2");
  assert.equal(state.overlay.body, puzzle.hints[0].text);

  state = showHint(pack, state, puzzle.id);
  assert.equal(state.hintLevelByPuzzle[puzzle.id], 2);
  assert.equal(state.overlay.title, "힌트 2/2");
  assert.equal(state.overlay.body, puzzle.hints[1].text);

  state = showHint(pack, state, puzzle.id);
  assert.equal(state.hintLevelByPuzzle[puzzle.id], 2);
  assert.equal(state.overlay.title, "힌트 2/2");
  assert.equal(state.overlay.body, puzzle.hints[1].text);
  assert.notEqual(state.overlay.body, puzzle.hints[2].text);
});

test("answer reveal requires two hints and the puzzle's current view", () => {
  const puzzle = pack.puzzles.find((entry) => entry.id === "puzzle-1");
  let state = navigate(pack, createInitialState(pack), puzzle.viewId);

  const beforeHints = revealAnswer(pack, state, puzzle.id);
  assert.equal(beforeHints, state);

  state = hintsFor(state, puzzle.id, 1);
  const afterOneHint = revealAnswer(pack, state, puzzle.id);
  assert.equal(afterOneHint, state);

  state = hintsFor(state, puzzle.id, 1);
  const wrongView = navigate(pack, state, "desk");
  assert.equal(revealAnswer(pack, wrongView, puzzle.id), wrongView);

  state = revealAnswer(pack, state, puzzle.id);
  assert.deepEqual(state.answerRevealedPuzzleIds, [puzzle.id]);
  assert.equal(state.overlay.type, "ANSWER");
  assert.equal(state.overlay.title, puzzle.explanation.title);
  assert.equal(state.overlay.body, puzzle.explanation.body);
  assert.deepEqual(
    state.overlay.evidence.map((segment) => segment.id),
    puzzle.explanation.evidenceSegmentIds,
  );

  state = revealAnswer(pack, state, puzzle.id);
  assert.deepEqual(state.answerRevealedPuzzleIds, [puzzle.id]);
});

test("answer reveal preserves the existing prerequisite and solved-puzzle guards", () => {
  const lockedPuzzle = pack.puzzles.find((entry) => entry.id === "puzzle-3");
  let lockedState = navigate(
    pack,
    createInitialState(pack),
    lockedPuzzle.viewId,
  );
  lockedState = hintsFor(lockedState, lockedPuzzle.id, 2);
  lockedState = revealAnswer(pack, lockedState, lockedPuzzle.id);
  assert.equal(lockedState.overlay.type, "LOCKED");
  assert.deepEqual(lockedState.answerRevealedPuzzleIds, []);

  const puzzle = pack.puzzles.find((entry) => entry.id === "puzzle-1");
  let solvedState = navigate(pack, createInitialState(pack), "desk");
  solvedState = collectItem(pack, solvedState, "book-ji");
  solvedState = navigate(pack, solvedState, puzzle.viewId);
  solvedState = hintsFor(solvedState, puzzle.id, 2);
  solvedState = tryUseItem(
    pack,
    solvedState,
    "book-ji",
    "bookshelf-slot-1",
  );
  assert.equal(solvedState.solvedPuzzleIds.includes(puzzle.id), true);
  assert.equal(revealAnswer(pack, solvedState, puzzle.id), solvedState);
  assert.deepEqual(solvedState.answerRevealedPuzzleIds, []);
});
