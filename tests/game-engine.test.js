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
  "./fixtures/item-placement-room.json",
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
  assert.deepEqual(getVisibleItems(pack, state, "desk").map((item) => item.id).includes("book-hap"), true);

  state = collectItem(pack, state, "book-hap");
  assert.equal(getInventoryItems(pack, state).length, 0);

  state = take(state, "desk", "book-hap");
  assert.equal(getInventoryItems(pack, state).some((item) => item.id === "book-hap"), true);
  assert.equal(getVisibleItems(pack, state, "desk").some((item) => item.id === "book-hap"), false);
});

test("a wrong item keeps inventory and shows concept feedback", () => {
  let state = createInitialState(pack);
  state = take(state, "bookshelf", "book-han");
  state = tryUseItem(pack, state, "book-han", "bookshelf-slot-1");

  assert.equal(state.placements["bookshelf-slot-1"], undefined);
  assert.equal(getInventoryItems(pack, state).some((item) => item.id === "book-han"), true);
  assert.equal(state.overlay.type, "WRONG");
  assert.match(state.overlay.body, /강의에서 쓰인 용어/);
});

test("an inventory item cannot solve a puzzle from another close-up", () => {
  let state = createInitialState(pack);
  state = take(state, "desk", "book-hap");

  const unchanged = tryUseItem(pack, state, "book-hap", "bookshelf-slot-1");

  assert.equal(unchanged, state);
  assert.deepEqual(state.solvedPuzzleIds, []);
  assert.deepEqual(state.placements, {});
});

test("a puzzle reward is consumed to unlock the next close-up before navigation", () => {
  const lockedPack = structuredClone(pack);
  const wallView = lockedPack.room.views.find((view) => view.id === "wall");
  wallView.unlock = {
    itemId: "key-chloroplast",
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
  state = collectItem(lockedPack, state, "book-hap");
  state = navigate(lockedPack, state, "bookshelf");
  state = tryUseItem(
    lockedPack,
    state,
    "book-hap",
    "bookshelf-slot-1",
  );
  assert.equal(state.solvedPuzzleIds.includes("puzzle-1"), true);

  state = collectItem(lockedPack, state, "key-chloroplast");
  state = collectItem(lockedPack, state, "safe-token-1");
  assert.equal(
    getInventoryItems(lockedPack, state).some(
      (item) => item.id === "key-chloroplast",
    ),
    true,
  );
  assert.equal(
    tryUseViewUnlockItem(
      lockedPack,
      state,
      "key-chloroplast",
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
    "key-mitochondria",
    "wall",
  );
  assert.equal(notInInventory, state);
  assert.equal(
    tryUseViewUnlockItem(lockedPack, state, "key-chloroplast", "missing-view"),
    state,
  );

  state = tryUseViewUnlockItem(
    lockedPack,
    state,
    "key-chloroplast",
    "wall",
  );
  assert.equal(state.overlay.type, "VIEW_UNLOCKED");
  assert.equal(state.overlay.body, wallView.unlock.unlockedMessage);
  assert.equal(state.selectedItemId, null);
  assert.equal(isViewUnlocked(lockedPack, state, "wall"), true);
  assert.equal(state.unlockedViewIds.filter((id) => id === "wall").length, 1);
  assert.equal(state.consumedItemIds.includes("key-chloroplast"), true);
  assert.equal(
    getInventoryItems(lockedPack, state).some(
      (item) => item.id === "key-chloroplast",
    ),
    false,
  );

  assert.equal(
    tryUseViewUnlockItem(lockedPack, state, "key-chloroplast", "wall"),
    state,
  );
  state = navigate(lockedPack, state, "wall");
  assert.equal(state.currentViewId, "wall");

  const reset = resetState(lockedPack);
  assert.equal(isViewUnlocked(lockedPack, reset, "wall"), false);
  assert.equal(reset.consumedItemIds.includes("key-chloroplast"), false);
});

test("the five-puzzle fixture can be completed end to end", () => {
  let state = createInitialState(pack);

  state = take(state, "desk", "book-hap");
  state = go(state, "bookshelf");
  state = tryUseItem(pack, state, "book-hap", "bookshelf-slot-1");
  assert.deepEqual(state.solvedPuzzleIds, ["puzzle-1"]);

  state = take(state, "bookshelf", "event-light");
  state = take(state, "wall", "event-split");
  state = take(state, "desk", "event-sugar");
  state = go(state, "wall");
  state = tryUseItem(pack, state, "event-light", "wall-slot-1");
  state = tryUseItem(pack, state, "event-split", "wall-slot-2");
  state = tryUseItem(pack, state, "event-sugar", "wall-slot-3");
  assert.equal(state.solvedPuzzleIds.includes("puzzle-2"), true);

  state = take(state, "bookshelf", "key-chloroplast");
  state = go(state, "drawer");
  state = tryUseItem(pack, state, "key-chloroplast", "drawer-key-slot");
  assert.equal(state.solvedPuzzleIds.includes("puzzle-3"), true);

  state = take(state, "drawer", "message-energy");
  state = go(state, "desk");
  state = tryUseItem(pack, state, "message-energy", "desk-message-slot");
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
