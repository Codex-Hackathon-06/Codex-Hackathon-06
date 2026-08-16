import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectItem,
  createInitialState,
  getInventoryItems,
  getVisibleItems,
  navigate,
  tryUseItem,
} from "../packages/game-engine/src/runtime.js";

const fixtureUrl = new URL(
  "../content/sample-lectures/puppy-poop.room.json",
  import.meta.url,
);
const pack = JSON.parse(await readFile(fixtureUrl, "utf8"));

function go(state, viewId) {
  return navigate(pack, state, viewId);
}

function take(state, viewId, itemId) {
  return collectItem(pack, go(state, viewId), itemId);
}

test("scene items become collectible only from their current view", () => {
  let state = createInitialState(pack);
  assert.deepEqual(getVisibleItems(pack, state, "desk").map((item) => item.id).includes("book-ji"), true);

  state = collectItem(pack, state, "book-ji");
  assert.equal(getInventoryItems(pack, state).length, 0);

  state = take(state, "desk", "book-ji");
  assert.equal(getInventoryItems(pack, state).some((item) => item.id === "book-ji"), true);
  assert.equal(getVisibleItems(pack, state, "desk").some((item) => item.id === "book-ji"), false);
});

test("a wrong item keeps inventory and shows concept feedback", () => {
  let state = createInitialState(pack);
  state = take(state, "bookshelf", "book-gi");
  state = tryUseItem(pack, state, "book-gi", "bookshelf-slot-1");

  assert.equal(state.placements["bookshelf-slot-1"], undefined);
  assert.equal(getInventoryItems(pack, state).some((item) => item.id === "book-gi"), true);
  assert.equal(state.overlay.type, "WRONG");
  assert.match(state.overlay.body, /작품 제목/);
});

test("an inventory item cannot solve a puzzle from another close-up", () => {
  let state = createInitialState(pack);
  state = take(state, "desk", "book-ji");

  const unchanged = tryUseItem(pack, state, "book-ji", "bookshelf-slot-1");

  assert.equal(unchanged, state);
  assert.deepEqual(state.solvedPuzzleIds, []);
  assert.deepEqual(state.placements, {});
});

test("the five-puzzle fixture can be completed end to end", () => {
  let state = createInitialState(pack);

  state = take(state, "desk", "book-ji");
  state = go(state, "bookshelf");
  state = tryUseItem(pack, state, "book-ji", "bookshelf-slot-1");
  assert.deepEqual(state.solvedPuzzleIds, ["puzzle-1"]);

  state = take(state, "bookshelf", "event-rejected");
  state = take(state, "wall", "event-meeting");
  state = take(state, "desk", "event-nourish");
  state = go(state, "wall");
  state = tryUseItem(pack, state, "event-rejected", "wall-slot-1");
  state = tryUseItem(pack, state, "event-meeting", "wall-slot-2");
  state = tryUseItem(pack, state, "event-nourish", "wall-slot-3");
  assert.equal(state.solvedPuzzleIds.includes("puzzle-2"), true);

  state = take(state, "bookshelf", "key-fertilizer");
  state = go(state, "drawer");
  state = tryUseItem(pack, state, "key-fertilizer", "drawer-key-slot");
  assert.equal(state.solvedPuzzleIds.includes("puzzle-3"), true);

  state = take(state, "drawer", "message-help");
  state = go(state, "desk");
  state = tryUseItem(pack, state, "message-help", "desk-message-slot");
  assert.equal(state.solvedPuzzleIds.includes("puzzle-4"), true);

  state = take(state, "bookshelf", "safe-token-1");
  state = take(state, "wall", "safe-token-2");
  state = take(state, "drawer", "safe-token-3");
  state = take(state, "desk", "safe-token-4");
  state = tryUseItem(pack, state, "safe-token-1", "safe-slot-1");
  state = tryUseItem(pack, state, "safe-token-2", "safe-slot-2");
  state = tryUseItem(pack, state, "safe-token-3", "safe-slot-3");
  state = tryUseItem(pack, state, "safe-token-4", "safe-slot-4");

  assert.equal(state.escaped, true);
  assert.equal(state.solvedPuzzleIds.length, 5);
  assert.equal(state.overlay.type, "ENDING");
  assert.equal(getVisibleItems(pack, state, "desk").some((item) => item.id === "exit-key"), true);
});
