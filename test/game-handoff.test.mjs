import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_HANDOFF_STORAGE_KEY,
  createGameHandoff,
  loadGameHandoff,
  saveGameHandoff,
} from "../live-ui/game-handoff.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function analysisMessage() {
  return {
    sessionId: "session-01",
    outputPath: "/outputs/session-01/game-generator.input.json",
    analysis: {
      lecture: { title: "강의", summary: "요약" },
      coreConcepts: [],
      roomBlueprint: {
        format: "single_room",
        room: { title: "테스트 방", story: "스토리", stages: [] },
      },
    },
  };
}

test("stores and restores the complete game-generator handoff", () => {
  const storage = memoryStorage();
  const saved = saveGameHandoff(storage, analysisMessage());
  const loaded = loadGameHandoff(storage);
  assert.equal(saved.version, 1);
  assert.equal(loaded.sessionId, "session-01");
  assert.equal(loaded.gameInput.roomBlueprint.room.title, "테스트 방");
  assert.ok(storage.getItem(GAME_HANDOFF_STORAGE_KEY));
});

test("rejects an analysis result without a playable room blueprint", () => {
  const message = analysisMessage();
  delete message.analysis.roomBlueprint;
  assert.throws(() => createGameHandoff(message), /올바르지 않습니다/);
});

test("returns null when no game handoff has been saved", () => {
  assert.equal(loadGameHandoff(memoryStorage()), null);
});
