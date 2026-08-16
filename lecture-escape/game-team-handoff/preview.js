import { mountGame } from "./integration/game-runtime.js";

const root = document.querySelector("#game-root");

try {
  const response = await fetch("./game-generator.sample.json");
  if (!response.ok) throw new Error(`샘플 입력을 읽지 못했습니다 (${response.status})`);
  const gameInput = await response.json();
  await mountGame(root, gameInput, {
    sessionId: "sample-session",
    outputPath: "game-generator.sample.json",
    onComplete(result) {
      console.log("LecScape game complete", result);
    },
  });
} catch (error) {
  root.textContent = error.message;
}
