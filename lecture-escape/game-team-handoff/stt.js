import { saveGameHandoff } from "./integration/game-handoff.js";

const elements = {
  title: document.querySelector("#stt-title"),
  summary: document.querySelector("#stt-summary"),
  progress: document.querySelector("#stt-progress-bar"),
  concepts: document.querySelector("#concept-list"),
  error: document.querySelector("#stt-error"),
  start: document.querySelector("#start-game"),
};

let analysis = null;

function renderAnalysis(result) {
  elements.title.textContent = result.lecture.title;
  elements.summary.textContent = result.lecture.summary;
  elements.progress.style.width = "100%";
  elements.concepts.replaceChildren(
    ...result.coreConcepts.map((concept) => {
      const article = document.createElement("article");
      const title = document.createElement("h3");
      const definition = document.createElement("p");
      title.textContent = concept.name;
      definition.textContent = concept.definition;
      article.append(title, definition);
      return article;
    }),
  );
  elements.start.disabled = false;
}

async function initialize() {
  try {
    const response = await fetch("/game-team-handoff/game-generator.sample.json", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`분석 데이터 요청 실패 (${response.status})`);
    analysis = await response.json();
    renderAnalysis(analysis);
  } catch (error) {
    elements.error.hidden = false;
    elements.error.textContent = error.message;
  }
}

elements.start.addEventListener("click", () => {
  if (!analysis) return;
  saveGameHandoff(sessionStorage, {
    sessionId: crypto.randomUUID(),
    outputPath: "game-generator.sample.json",
    analysis,
  });
  window.location.assign("/game");
});

initialize();
