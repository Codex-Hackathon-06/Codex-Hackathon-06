const RUNTIME_INPUT_KEY = "lecscape.runtime-input.v1";

function assertGameInput(gameInput) {
  if (!gameInput?.roomBlueprint?.room || !Array.isArray(gameInput.coreConcepts)) {
    throw new Error("게임 생성 입력 형식이 올바르지 않습니다.");
  }
}

export async function mountGame(root, gameInput, context = {}) {
  assertGameInput(gameInput);

  sessionStorage.setItem(
    RUNTIME_INPUT_KEY,
    JSON.stringify({
      version: 1,
      sessionId: context.sessionId ?? null,
      gameInput,
    }),
  );

  root.replaceChildren();

  const frame = document.createElement("iframe");
  frame.className = "lecture-room-game-frame";
  frame.title = gameInput.roomBlueprint.room.title ?? "강의실 탈출 게임";
  frame.src = "/apps/web/?demo=coding-agents&handoff=1";
  frame.allow = "fullscreen";
  root.append(frame);

  let completed = false;
  const receiveCompletion = (event) => {
    if (event.source !== frame.contentWindow || event.data?.type !== "lecscape:game-complete") {
      return;
    }
    if (completed) return;
    completed = true;
    window.removeEventListener("message", receiveCompletion);
    context.onComplete?.(event.data.result);
  };

  window.addEventListener("message", receiveCompletion);
}
