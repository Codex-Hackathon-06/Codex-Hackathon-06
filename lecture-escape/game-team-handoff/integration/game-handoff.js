export const GAME_HANDOFF_STORAGE_KEY = "lecscape.game-handoff.v1";

export function createGameHandoff(message) {
  if (!message?.sessionId || !message?.analysis?.roomBlueprint?.room) {
    throw new Error("게임에 전달할 강의 분석 데이터가 올바르지 않습니다.");
  }
  return {
    version: 1,
    sessionId: message.sessionId,
    outputPath: message.outputPath,
    createdAt: new Date().toISOString(),
    gameInput: message.analysis,
  };
}

export function saveGameHandoff(storage, message) {
  const handoff = createGameHandoff(message);
  storage.setItem(GAME_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
  return handoff;
}

export function loadGameHandoff(storage) {
  const serialized = storage.getItem(GAME_HANDOFF_STORAGE_KEY);
  if (!serialized) return null;
  const handoff = JSON.parse(serialized);
  if (handoff?.version !== 1 || !handoff.sessionId || !handoff.gameInput?.roomBlueprint?.room) {
    throw new Error("저장된 게임 데이터 형식을 읽을 수 없습니다.");
  }
  return handoff;
}
