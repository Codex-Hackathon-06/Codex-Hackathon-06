import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectItem,
  createInitialState,
  exitRoom,
  getInventoryItems,
  getVisibleItems,
  isViewUnlocked,
  navigate,
  resetState,
  tryUseExitItem,
  tryUseItem,
  tryUseViewUnlockItem,
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

test("a puzzle reward is consumed to unlock the next close-up before navigation", () => {
  const lockedPack = structuredClone(pack);
  const wallView = lockedPack.room.views.find((view) => view.id === "wall");
  wallView.unlock = {
    itemId: "key-fertilizer",
    lockedMessage: "벽면 장치가 잠겨 있어 열리지 않습니다.",
    unlockedMessage: "거름 열쇠가 맞물리며 벽면 장치가 열렸습니다.",
  };

  let state = createInitialState(lockedPack);
  assert.equal(isViewUnlocked(lockedPack, state, "overview"), true);
  assert.equal(isViewUnlocked(lockedPack, state, "bookshelf"), true);
  assert.equal(isViewUnlocked(lockedPack, state, "wall"), false);
  assert.equal(isViewUnlocked(lockedPack, state, "missing-view"), false);
  assert.deepEqual(state.unlockedViewIds, [
    "overview",
    "bookshelf",
    "drawer",
    "desk",
  ]);

  state = navigate(lockedPack, state, "desk");
  state = collectItem(lockedPack, state, "book-ji");
  state = navigate(lockedPack, state, "bookshelf");
  state = tryUseItem(
    lockedPack,
    state,
    "book-ji",
    "bookshelf-slot-1",
  );
  assert.equal(state.solvedPuzzleIds.includes("puzzle-1"), true);

  state = collectItem(lockedPack, state, "key-fertilizer");
  state = collectItem(lockedPack, state, "safe-token-1");
  assert.equal(
    getInventoryItems(lockedPack, state).some(
      (item) => item.id === "key-fertilizer",
    ),
    true,
  );
  assert.equal(
    tryUseViewUnlockItem(
      lockedPack,
      state,
      "key-fertilizer",
      "wall",
    ),
    state,
  );

  const blocked = navigate(lockedPack, state, "wall");
  assert.equal(blocked.currentViewId, "bookshelf");
  assert.equal(blocked.overlay.type, "LOCKED");
  assert.equal(blocked.overlay.body, wallView.unlock.lockedMessage);

  state = navigate(lockedPack, blocked, "overview");
  const wrongItem = tryUseViewUnlockItem(
    lockedPack,
    state,
    "safe-token-1",
    "wall",
  );
  assert.equal(wrongItem, state);

  const notInInventory = tryUseViewUnlockItem(
    lockedPack,
    state,
    "key-rain",
    "wall",
  );
  assert.equal(notInInventory, state);
  assert.equal(
    tryUseViewUnlockItem(lockedPack, state, "key-fertilizer", "missing-view"),
    state,
  );

  state = tryUseViewUnlockItem(
    lockedPack,
    state,
    "key-fertilizer",
    "wall",
  );
  assert.equal(state.overlay.type, "VIEW_UNLOCKED");
  assert.equal(state.overlay.body, wallView.unlock.unlockedMessage);
  assert.equal(state.selectedItemId, null);
  assert.equal(isViewUnlocked(lockedPack, state, "wall"), true);
  assert.equal(state.unlockedViewIds.filter((id) => id === "wall").length, 1);
  assert.equal(state.consumedItemIds.includes("key-fertilizer"), true);
  assert.equal(
    getInventoryItems(lockedPack, state).some(
      (item) => item.id === "key-fertilizer",
    ),
    false,
  );

  assert.equal(
    tryUseViewUnlockItem(lockedPack, state, "key-fertilizer", "wall"),
    state,
  );
  state = navigate(lockedPack, state, "wall");
  assert.equal(state.currentViewId, "wall");

  const reset = resetState(lockedPack);
  assert.equal(isViewUnlocked(lockedPack, reset, "wall"), false);
  assert.equal(reset.consumedItemIds.includes("key-fertilizer"), false);
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

  assert.equal(state.escaped, false);
  assert.equal(state.exitUnlocked, false);
  assert.equal(state.solvedPuzzleIds.length, 5);
  assert.equal(state.overlay.type, "EXPLANATION");
  assert.equal(getVisibleItems(pack, state, "desk").some((item) => item.id === "exit-key"), true);

  assert.equal(exitRoom(pack, state), state);
  assert.equal(
    tryUseExitItem(pack, state, "exit-key", "exit-door"),
    state,
  );

  state = collectItem(pack, state, "exit-key");
  assert.equal(
    tryUseExitItem(pack, state, "exit-key", "wrong-door"),
    state,
  );
  state = tryUseExitItem(pack, state, "exit-key", "exit-door");
  assert.equal(state.exitUnlocked, true);
  assert.equal(state.overlay.type, "EXIT_UNLOCKED");
  assert.deepEqual(state.consumedItemIds, ["exit-key"]);
  assert.equal(
    getInventoryItems(pack, state).some((item) => item.id === "exit-key"),
    false,
  );

  state = exitRoom(pack, state);
  assert.equal(state.escaped, true);
  assert.equal(state.overlay.type, "ENDING");
});
