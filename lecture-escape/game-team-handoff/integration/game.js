import { loadGameHandoff } from "./game-handoff.js";
import { mountGame } from "./game-runtime.js";

const root = document.querySelector("#game-root");

try {
  const handoff = loadGameHandoff(sessionStorage);
  if (!handoff) {
    root.innerHTML = `<section class="game-empty">
      <p class="eyebrow">NO GAME DATA</p>
      <h1>먼저 강의 분석을 완료해주세요.</h1>
      <p>실시간 STT 화면에서 개념 생성을 완료한 뒤 게임 시작 버튼을 눌러주세요.</p>
      <a class="primary-link" href="/">강의 분석으로 이동</a>
    </section>`;
  } else {
    await mountGame(root, handoff.gameInput, {
      sessionId: handoff.sessionId,
      outputPath: handoff.outputPath,
      onComplete(result) {
        window.dispatchEvent(new CustomEvent("lecscape:game-complete", { detail: result }));
      },
    });
  }
} catch (error) {
  root.innerHTML = `<section class="game-empty">
    <p class="eyebrow">GAME LOAD ERROR</p>
    <h1>게임 데이터를 불러오지 못했습니다.</h1>
    <p></p>
    <a class="primary-link" href="/">강의 분석으로 이동</a>
  </section>`;
  root.querySelector("p:not(.eyebrow)").textContent = error.message;
}
