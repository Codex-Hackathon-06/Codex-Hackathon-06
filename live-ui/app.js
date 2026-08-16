const statusElement = document.querySelector("#status");
const detailElement = document.querySelector("#detail");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const transcriptElement = document.querySelector("#transcript");
const emptyElement = document.querySelector("#empty");
const countElement = document.querySelector("#count");
const noticeElement = document.querySelector("#notice");
const noticeTitle = document.querySelector("#notice-title");
const noticeMessage = document.querySelector("#notice-message");
const analysisCard = document.querySelector("#analysis-card");
const analysisTitle = document.querySelector("#analysis-title");
const analysisSummary = document.querySelector("#analysis-summary");
const conceptList = document.querySelector("#concept-list");
const analysisPath = document.querySelector("#analysis-path");
const gameStartButton = document.querySelector("#game-start");
const chunks = new Map();

let socket;
let reconnectTimer;
let latestAnalysisMessage;

const stateLabels = {
  Idle: "대기 중",
  "Requesting Permission": "권한 확인 중",
  Connecting: "연결 중",
  Listening: "기록 중",
  Finalizing: "기록 마무리 중",
  Analyzing: "개념 정리 중",
  Grounding: "근거 연결 중",
  Ready: "준비 완료",
  Stopped: "종료됨",
  Error: "오류",
  Disconnected: "연결 끊김",
};

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function setState(state, detail) {
  statusElement.textContent = stateLabels[state] ?? state;
  statusElement.dataset.state = state;
  if (detail) detailElement.textContent = detail;
  const active = [
    "Requesting Permission",
    "Connecting",
    "Listening",
    "Finalizing",
    "Analyzing",
    "Grounding",
  ].includes(state);
  startButton.disabled = active;
  stopButton.disabled = !["Requesting Permission", "Connecting", "Listening"].includes(state);
}

function renderChunks() {
  const sorted = [...chunks.values()].sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
  transcriptElement.replaceChildren(...sorted.map((chunk) => {
    const item = document.createElement("li");
    item.className = chunk.isFinal ? "final" : "partial";
    item.dataset.id = chunk.id;
    const time = document.createElement("time");
    time.textContent = formatTime(chunk.startMs);
    const text = document.createElement("p");
    text.textContent = chunk.text || "…";
    const badge = document.createElement("span");
    badge.textContent = chunk.isFinal ? "FINAL" : "LIVE";
    item.append(time, text, badge);
    return item;
  }));
  emptyElement.hidden = sorted.length > 0;
  countElement.textContent = `${sorted.filter((chunk) => chunk.isFinal).length}개 문장 기록됨`;
  transcriptElement.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showError(message) {
  noticeElement.hidden = false;
  noticeTitle.textContent = message.code === "SCREEN_RECORDING_PERMISSION_REQUIRED"
    ? "시스템 오디오 권한 승인이 필요합니다"
    : "실시간 STT를 시작하지 못했습니다";
  noticeMessage.textContent = message.code === "SCREEN_RECORDING_PERMISSION_REQUIRED"
    ? "시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 기록에서 터미널을 허용한 뒤 서버를 다시 실행하세요. 그동안 기존 배치 STT 결과로 데모를 계속할 수 있습니다."
    : `${message.message} 기존 배치 STT 경로는 그대로 사용할 수 있습니다.`;
}

function showAnalysisError(message) {
  noticeElement.hidden = false;
  noticeTitle.textContent = "개념 생성에 실패했습니다";
  noticeMessage.textContent = `${message.message} 전사본은 ${message.chunksPath}에 안전하게 저장되었습니다.`;
}

function renderAnalysis(message) {
  latestAnalysisMessage = message;
  const result = message.analysis;
  analysisTitle.textContent = result.lecture.title;
  analysisSummary.textContent = result.lecture.summary;
  conceptList.replaceChildren(...result.coreConcepts.map((concept) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = concept.name;
    const definition = document.createElement("span");
    definition.textContent = concept.definition;
    item.append(name, definition);
    return item;
  }));
  analysisPath.textContent = `게임 입력: ${message.outputPath}`;
  gameStartButton.hidden = false;
  analysisCard.hidden = false;
  analysisCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/live`);
  socket.addEventListener("open", () => {
    clearTimeout(reconnectTimer);
    if (statusElement.dataset.state === "Disconnected") setState("Idle", "서버에 다시 연결됐습니다.");
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      setState(message.state, message.detail);
      if (message.state !== "Error") noticeElement.hidden = true;
    } else if (message.type === "transcript") {
      chunks.set(message.chunk.id, message.chunk);
      renderChunks();
    } else if (message.type === "session_complete") {
      detailElement.textContent = `저장 위치: ${message.directory}`;
    } else if (message.type === "analysis_progress") {
      detailElement.textContent = [message.label, message.detail].filter(Boolean).join(" · ");
    } else if (message.type === "analysis_complete") {
      renderAnalysis(message);
    } else if (message.type === "analysis_error") {
      setState("Stopped", "전사본은 저장되었지만 개념 생성에 실패했습니다.");
      showAnalysisError(message);
    } else if (message.type === "error") {
      setState("Error", message.message);
      showError(message);
    }
  });
  socket.addEventListener("close", () => {
    setState("Disconnected", "로컬 서버 연결을 다시 시도하고 있습니다.");
    reconnectTimer = setTimeout(connect, 1500);
  });
}

startButton.addEventListener("click", () => {
  chunks.clear();
  renderChunks();
  analysisCard.hidden = true;
  conceptList.replaceChildren();
  gameStartButton.hidden = true;
  latestAnalysisMessage = undefined;
  noticeElement.hidden = true;
  socket.send(JSON.stringify({ type: "start" }));
});

stopButton.addEventListener("click", () => {
  stopButton.disabled = true;
  detailElement.textContent = "마지막 발화를 마무리한 뒤 핵심 개념을 자동 생성합니다.";
  socket.send(JSON.stringify({ type: "stop" }));
});

gameStartButton.addEventListener("click", () => {
  if (!latestAnalysisMessage) return;
  try {
    saveGameHandoff(sessionStorage, latestAnalysisMessage);
    location.assign("/game");
  } catch (error) {
    noticeElement.hidden = false;
    noticeTitle.textContent = "게임 데이터를 넘기지 못했습니다";
    noticeMessage.textContent = error.message;
  }
});

connect();
import { saveGameHandoff } from "/game-handoff.js";
