import {
  applyPuzzleInput,
  closeOverlay,
  collectItem,
  createInitialState,
  exitRoom,
  getInventoryItems,
  getPuzzleControlOrder,
  getPuzzleInput,
  getView,
  getVisibleItems,
  isViewUnlocked,
  navigate,
  revealAnswer,
  resetState,
  selectInventoryItem,
  showHint,
  submitPuzzleAnswer,
  tryUseExitItem,
  tryUseItem,
  tryUseViewUnlockItem,
} from "../../packages/game-engine/src/runtime.js";
import {
  getAssetMode,
  getExitDoorAsset,
  getItemAsset,
  getOverviewObjectAsset,
  setAssetMode,
  UI_ASSETS,
} from "./asset-catalog.js";

const ROOM_PACK_URL = "../../content/sample-lectures/coding-agents.room.json";
const VISIBLE_HINT_LIMIT = 2;

const elements = {
  appShell: document.querySelector("#app-shell"),
  assetModeSelect: document.querySelector("#asset-mode-select"),
  backButton: document.querySelector("#back-button"),
  gameScene: document.querySelector("#game-scene"),
  inventoryList: document.querySelector("#inventory-list"),
  lectureTitle: document.querySelector("#lecture-title"),
  missionTitle: document.querySelector("#mission-title"),
  missionCopy: document.querySelector("#mission-copy"),
  sceneEyebrow: document.querySelector("#scene-eyebrow"),
  sceneInstruction: document.querySelector("#scene-instruction"),
  sceneLocation: document.querySelector("#scene-location"),
  progressCount: document.querySelector("#progress-count"),
  progressTotal: document.querySelector("#progress-total"),
  progressBar: document.querySelector("#progress-bar"),
  resetButton: document.querySelector("#reset-button"),
  selectionStatus: document.querySelector("#selection-status"),
  modal: document.querySelector("#game-modal"),
  modalClose: document.querySelector("#modal-close"),
  modalKicker: document.querySelector("#modal-kicker"),
  modalTitle: document.querySelector("#modal-title"),
  modalBody: document.querySelector("#modal-body"),
  modalEvidence: document.querySelector("#modal-evidence"),
  modalPrimary: document.querySelector("#modal-primary"),
  modalSecondary: document.querySelector("#modal-secondary"),
  modalSymbol: document.querySelector("#modal-symbol"),
  toastRegion: document.querySelector("#toast-region"),
  storyIntroDialog: document.querySelector("#story-intro-dialog"),
  storyIntroTitle: document.querySelector("#story-intro-title"),
  storyIntroBody: document.querySelector("#story-intro-body"),
  storyPuzzleTotal: document.querySelector("#story-puzzle-total"),
  storyStartButton: document.querySelector("#story-start-button"),
  exitEndingDialog: document.querySelector("#exit-ending-dialog"),
  exitEndingSummary: document.querySelector("#exit-ending-summary"),
  exitSolvedCount: document.querySelector("#exit-solved-count"),
  exitPuzzleTotal: document.querySelector("#exit-puzzle-total"),
};

const viewPresentation = {
  bookshelf: {
    eyebrow: "AGENT FEATURES · 01",
    description: "강의에서 강조한 코딩 에이전트의 특징만 골라 기능 스위치를 켜세요.",
  },
  wall: {
    eyebrow: "SWE-BENCH · 02",
    description: "강의 속 데이터로 식을 계산하고 숫자키패드 자물쇠를 여세요.",
  },
  drawer: {
    eyebrow: "TERMINAL-BENCH · 03",
    description: "태스크를 이루는 다섯 구성요소를 강의에서 나온 순서대로 맞추세요.",
  },
  desk: {
    eyebrow: "REXBENCH · 04",
    description: "평가 지표 문자키패드를 해독하고 금고 손잡이·기어·전원 코어를 조립하세요.",
  },
};

let pack = null;
let state = null;
let activeHintPuzzleId = null;
let toastTimer = null;
let dialDrag = null;
let completionReported = false;

const DIAL_DRAG_DEGREES_PER_STEP = 42;
const DIAL_DRAG_PIXELS_PER_STEP = 28;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeCssKey(value) {
  return String(value ?? "generic")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function assetDescriptorMarkup(
  descriptor,
  { className = "", decorative = true, alt = descriptor?.alt ?? "" } = {},
) {
  if (
    !descriptor ||
    !["image", "model"].includes(descriptor.kind) ||
    typeof descriptor.src !== "string" ||
    descriptor.src.length === 0
  ) {
    return "";
  }

  const safeClasses = String(className)
    .split(/\s+/)
    .filter(Boolean)
    .map(safeCssKey)
    .join(" ");
  const classAttribute = safeClasses ? ` class="${escapeHtml(safeClasses)}"` : "";
  const accessibleAttribute = decorative
    ? 'aria-hidden="true"'
    : `role="img" aria-label="${escapeHtml(alt || descriptor.alt || "에셋")}"`;

  if (descriptor.kind === "image") {
    const pixelArtAttribute = descriptor.pixelArt ? ' data-pixel-art="true"' : "";
    return `<img${classAttribute} data-asset-kind="image"${pixelArtAttribute} src="${escapeHtml(descriptor.src)}" alt="${decorative ? "" : escapeHtml(alt || descriptor.alt)}" ${decorative ? 'aria-hidden="true"' : ""} />`;
  }

  const poster =
    typeof descriptor.poster === "string" && descriptor.poster.length > 0
      ? descriptor.poster
      : null;
  const posterAttribute = poster ? ` poster="${escapeHtml(poster)}"` : "";
  const fallbackMarkup = poster
    ? `<img class="asset-model-poster" slot="poster" src="${escapeHtml(poster)}" alt="" aria-hidden="true" />`
    : '<span class="asset-model-placeholder" data-model-placeholder aria-hidden="true"><span>3D MODEL</span></span>';

  return `<model-viewer${classAttribute} data-asset-kind="model" data-has-poster="${poster ? "true" : "false"}" src="${escapeHtml(descriptor.src)}"${posterAttribute} camera-controls auto-rotate ${accessibleAttribute}>${fallbackMarkup}</model-viewer>`;
}

function getViewKey(viewId) {
  const normalized = String(viewId ?? "").toLowerCase();
  return Object.keys(viewPresentation).find((key) => normalized.includes(key)) ?? "desk";
}

function presentationFor(viewId) {
  return viewPresentation[getViewKey(viewId)];
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function rectStyle(rect, fallback = [0.2, 0.2, 0.6, 0.5]) {
  const source = Array.isArray(rect) && rect.length === 4 ? rect : fallback;
  const [x, y, width, height] = source.map((value, index) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback[index];
    return Math.max(0, Math.min(1, numeric));
  });
  return `left:${x * 100}%;top:${y * 100}%;width:${width * 100}%;height:${height * 100}%;`;
}

function glyphFor(item) {
  if (item.displayText) return item.displayText;
  const asset = String(item.assetKey ?? "");
  if (asset.includes("key")) return "⌁";
  if (asset.includes("token")) return "●";
  if (asset.includes("card")) return "▤";
  if (asset.includes("book")) return "책";
  return "?";
}

function itemGlyphContent(item) {
  const asset = getItemAsset(item?.assetKey);
  if (!asset) return escapeHtml(glyphFor(item));
  return `
    ${assetDescriptorMarkup(asset, { className: "item-asset-image" })}
    ${item?.displayText ? `<span class="item-asset-code">${escapeHtml(item.displayText)}</span>` : ""}
  `;
}

function applyUiAssetVariables() {
  for (const [name, assetUrl] of Object.entries(UI_ASSETS)) {
    document.documentElement.style.setProperty(`--asset-${name}`, `url("${assetUrl}")`);
  }
}

function itemById(itemId) {
  return pack.items.find((item) => item.id === itemId) ?? null;
}

function puzzleById(puzzleId) {
  return pack.puzzles.find((puzzle) => puzzle.id === puzzleId) ?? null;
}

function isSolved(puzzleId) {
  return state.solvedPuzzleIds.includes(puzzleId);
}

function isAvailable(puzzle) {
  return puzzle.requiresPuzzleIds.every((puzzleId) => isSolved(puzzleId));
}

function getViewAccess(viewId) {
  const targetView = getView(pack, viewId);
  const unlock = targetView?.unlock ?? null;
  const locked = !isViewUnlocked(pack, state, viewId);
  const inventoryItems = getInventoryItems(pack, state);
  const unlockItem = unlock ? itemById(unlock.itemId) : null;
  const itemReady = Boolean(
    locked && unlock && inventoryItems.some((item) => item.id === unlock.itemId),
  );

  return {
    locked,
    unlockable: Boolean(unlock),
    unlockItemId: unlock?.itemId ?? null,
    unlockItemLabel: unlockItem?.label ?? "",
    itemReady,
    selectedItemReady: itemReady && state.selectedItemId === unlock?.itemId,
    message:
      unlock?.lockedMessage ??
      `${targetView?.label ?? "이 장소"}은 잠겨 있습니다. 필요한 아이템을 먼저 찾아보세요.`,
  };
}

function totalPuzzles() {
  return pack.room.declaredPuzzleCount ?? pack.puzzles.length;
}

function showStoryIntro() {
  if (!pack || !elements.storyIntroDialog) return;
  elements.appShell.classList.remove("is-ending", "is-escaped");
  elements.storyIntroTitle.textContent = pack.room.title ?? "기억이 잠든 강의실";
  elements.storyIntroBody.textContent = `${pack.video.title} 강의가 끝난 뒤 기록 보관실이 잠겼습니다. ${pack.room.theme ?? "방 안의 단서와 물건을 연결해"} 마지막 키카드로 출구를 여세요.`;
  elements.storyPuzzleTotal.textContent = totalPuzzles();
  if (!elements.storyIntroDialog.open) elements.storyIntroDialog.showModal();
}

function showEscapeEnding() {
  elements.exitSolvedCount.textContent = state.solvedPuzzleIds.length;
  elements.exitPuzzleTotal.textContent = totalPuzzles();
  elements.exitEndingSummary.textContent = `${pack.video.title}의 핵심 단서를 모두 복원하고 키카드로 마지막 출구를 열었습니다. 어두웠던 통제실이 밝은 복도로 이어집니다.`;
  elements.appShell.classList.remove("is-escaped");
  elements.appShell.classList.add("is-ending");
  if (!elements.exitEndingDialog.open) elements.exitEndingDialog.showModal();
  if (!completionReported && window.parent !== window) {
    completionReported = true;
    window.parent.postMessage(
      {
        type: "lecscape:game-complete",
        result: {
          escaped: true,
          wrongConceptIds: [],
          hintCount: Object.values(state.hintLevelByPuzzle).reduce((sum, count) => sum + count, 0),
          answerRevealCount: state.answerRevealedPuzzleIds.length,
          completedAt: new Date().toISOString(),
        },
      },
      window.location.origin,
    );
  }
}

function render() {
  if (!pack || !state) return;

  elements.appShell.dataset.assetMode = getAssetMode();
  elements.appShell.dataset.stateCurrentViewId = state.currentViewId;
  elements.appShell.dataset.stateSolvedCount = String(state.solvedPuzzleIds.length);
  elements.appShell.dataset.stateInventoryCount = String(
    getInventoryItems(pack, state).length,
  );

  const currentView = getView(pack, state.currentViewId);
  const overviewId = pack.room.initialViewId;
  const onOverview = state.currentViewId === overviewId || currentView?.kind === "OVERVIEW";

  elements.appShell.dataset.view = onOverview ? "overview" : getViewKey(state.currentViewId);
  elements.gameScene.setAttribute("aria-busy", "false");
  elements.backButton.classList.toggle("is-hidden", onOverview);
  elements.sceneLocation.textContent = currentView?.label ?? "알 수 없는 장소";
  const currentPuzzles = pack.puzzles.filter((puzzle) => puzzle.viewId === currentView?.id);
  const hasControlPuzzle = currentPuzzles.some((puzzle) => puzzle.kind !== "ITEM_PLACEMENT");
  elements.sceneInstruction.textContent = onOverview
    ? "빛나는 가구를 눌러 가까이 살펴보세요"
    : hasControlPuzzle
      ? "장치의 버튼·다이얼·스위치를 직접 조작하세요"
      : "물건을 수집하고 인벤토리에서 빈칸으로 옮기세요";

  updateMission(currentView, onOverview);
  updateProgress();
  renderInventory();
  elements.gameScene.innerHTML = onOverview ? renderOverview(currentView) : renderCloseup(currentView);
}

function updateMission(currentView, onOverview) {
  if (onOverview) {
    elements.sceneEyebrow.textContent = "기록 보관실 · 01";
    elements.missionTitle.textContent = pack.room.title ?? "기억이 잠든 강의실";
    elements.missionCopy.textContent =
      pack.room.theme ?? "공간을 관찰하고 강의 속 단서를 찾아 마지막 금고를 여세요.";
    return;
  }

  const presentation = presentationFor(currentView?.id);
  elements.sceneEyebrow.textContent = presentation.eyebrow;
  elements.missionTitle.textContent = currentView?.label ?? "확대 관찰";
  elements.missionCopy.textContent = presentation.description;
}

function updateProgress() {
  const solvedCount = state.solvedPuzzleIds.length;
  const total = totalPuzzles();
  elements.progressCount.textContent = solvedCount;
  elements.progressTotal.textContent = total;
  elements.progressBar.style.width = `${Math.min(100, (solvedCount / Math.max(1, total)) * 100)}%`;
}

function renderOverview(view) {
  const navigation = view?.navigation ?? [];
  const exitDoorId = pack.completion?.exitObjectId ?? "exit-door";
  const exitUnlocked = Boolean(state.exitUnlocked);
  const exitItemReady = getInventoryItems(pack, state).some(
    (item) => item.id === pack.completion?.exitItemId,
  );
  const solvedCount = state.solvedPuzzleIds.length;
  const exitAsset = getExitDoorAsset(exitUnlocked);
  const objectMarkup = navigation
    .map((entry) => {
      const target = getView(pack, entry.targetViewId);
      const viewKey = getViewKey(entry.targetViewId);
      const label = entry.label ?? `${target?.label ?? "장소"} 살펴보기`;
      const objectAsset = getOverviewObjectAsset(entry.targetViewId);
      const access = getViewAccess(entry.targetViewId);
      const explicitlyUnlocked = access.unlockable && !access.locked;
      const accessIcon = access.locked
        ? UI_ASSETS.locked
        : explicitlyUnlocked
          ? UI_ASSETS.unlocked
          : UI_ASSETS.zoom;
      return `
        <button
          class="room-object object-${safeCssKey(viewKey)} ${access.locked ? "is-access-locked" : ""} ${explicitlyUnlocked ? "is-access-unlocked" : ""} ${access.itemReady ? "can-accept-unlock-item" : ""} ${access.selectedItemReady ? "is-selected-unlock-target" : ""}"
          type="button"
          data-view-id="${escapeHtml(entry.targetViewId)}"
          data-view-lock-state="${access.locked ? "locked" : "unlocked"}"
          ${access.unlockItemId ? `data-unlock-item-id="${escapeHtml(access.unlockItemId)}"` : ""}
          aria-disabled="${access.locked}"
          aria-label="${escapeHtml(access.locked ? `${label}, 잠김` : explicitlyUnlocked ? `${label}, 잠금 해제됨` : label)}"
        >
          ${assetDescriptorMarkup(objectAsset, { className: "room-object-asset" })}
          <span class="inspect-dot" aria-hidden="true"><img src="${escapeHtml(accessIcon)}" alt="" /></span>
          ${access.locked ? '<span class="room-object-lock" aria-hidden="true">LOCKED</span>' : ""}
          ${access.itemReady ? `<span class="room-object-unlock-hint" aria-hidden="true">${escapeHtml(access.unlockItemLabel)} 사용</span>` : ""}
        </button>
      `;
    })
    .join("");

  return `
    <div class="room-overview" aria-label="${escapeHtml(pack.room.title ?? "강의실 방 전체")}">
      ${objectMarkup}
      <button
        class="room-exit-door ${exitUnlocked ? "is-unlocked" : "is-locked"} ${exitItemReady ? "can-accept-keycard" : ""}"
        type="button"
        data-exit-door-id="${escapeHtml(exitDoorId)}"
        aria-label="출구 문, ${exitUnlocked ? "열림" : exitItemReady ? "키카드 드롭 대기" : `잠김, 퍼즐 ${solvedCount}/${totalPuzzles()} 해결`}"
      >
        <span class="exit-sign">EXIT</span>
        ${assetDescriptorMarkup(exitAsset, { className: "exit-door-asset" })}
        <img class="exit-lock-icon" src="${escapeHtml(exitUnlocked ? UI_ASSETS.unlocked : UI_ASSETS.locked)}" alt="" aria-hidden="true" />
        <span class="door-state">
          <strong>${exitUnlocked ? "출구 열림" : exitItemReady ? "키카드 대기" : "출구 잠김"}</strong>
          <small>${exitUnlocked ? "문을 눌러 탈출하세요" : exitItemReady ? "인벤토리에서 문으로 드래그" : `${solvedCount}/${totalPuzzles()} 퍼즐 해결`}</small>
        </span>
      </button>
      <div class="overview-caption">
        <span aria-hidden="true">◎</span>
        퍼즐 보상 아이템을 다음 가구에 사용해 순서대로 잠금을 푸세요
      </div>
    </div>
  `;
}

function renderCloseup(view) {
  const viewKey = getViewKey(view?.id);
  const presentation = presentationFor(view?.id);
  const visibleItems = getVisibleItems(pack, state, view.id);
  const puzzles = pack.puzzles.filter((puzzle) => puzzle.viewId === view.id);
  const objectAsset = getOverviewObjectAsset(view.id);
  const anySolved = puzzles.some((puzzle) => isSolved(puzzle.id));
  const hasVisibleReward = visibleItems.some(
    (item) => item.source.type === "PUZZLE_REWARD",
  );

  const itemMarkup = visibleItems.length
    ? visibleItems.map(renderCollectible).join("")
    : '<p class="no-items-note">지금 보이는 새 아이템은 없습니다. 다른 장소를 살펴보거나 퍼즐을 해결해 보세요.</p>';

  const puzzleMarkup = puzzles.length
    ? puzzles.map(renderPuzzleCard).join("")
    : '<div class="locked-message"><span>·</span>이 장소에는 배치 퍼즐이 없습니다. 숨은 아이템을 찾아보세요.</div>';
  const targetMarkup = puzzles.length
    ? puzzles.map(renderScenePuzzle).join("")
    : "";

  return `
    <div class="closeup-scene view-${safeCssKey(viewKey)} ${anySolved ? "has-solved-device" : ""} ${hasVisibleReward ? "has-visible-reward" : ""}">
      <section class="closeup-visual" aria-label="${escapeHtml(view.label)} 관찰 영역">
        <div class="closeup-mode-badge">
          <img src="${escapeHtml(UI_ASSETS.zoom)}" alt="" aria-hidden="true" />
          ${escapeHtml(view.label)} 확대 관찰
        </div>
        <div class="closeup-label">
          <p>${escapeHtml(presentation.eyebrow)}</p>
          <h2>${escapeHtml(view.label)}</h2>
          <span>${escapeHtml(presentation.description)}</span>
        </div>
        ${assetDescriptorMarkup(objectAsset, {
          className: `closeup-object-asset asset-${safeCssKey(viewKey)}`,
          decorative: false,
        })}
        ${viewKey === "drawer" ? `<div class="drawer-device-state ${anySolved ? "is-open" : "is-closed"}" aria-live="polite"><strong>${anySolved ? "서랍 열림" : "서랍 잠김"}</strong><span>${anySolved ? "열린 서랍 안의 보상 물품을 확인하세요." : "다이얼을 맞춘 뒤 ‘정답 확인’을 누르세요."}</span></div>` : ""}
        <div class="scene-targets-layer" aria-label="가구에 설치된 퍼즐 장치">
          ${targetMarkup}
        </div>
        <div class="collectibles-layer" aria-label="수집 가능한 아이템">
          ${itemMarkup}
        </div>
      </section>

      <aside class="puzzle-panel" aria-label="이 장소의 퍼즐">
        <div class="puzzle-panel-header">
          <strong>관찰 기록</strong>
          <span>${puzzles.length ? `${puzzles.length}개의 퍼즐 요소` : "퍼즐 없음"}</span>
        </div>
        ${puzzleMarkup}
      </aside>
    </div>
  `;
}

function renderScenePuzzle(puzzle) {
  const solved = isSolved(puzzle.id);
  const available = isAvailable(puzzle);
  const targetClass = `target-${safeCssKey(puzzle.template)}`;
  const stateClass = solved ? "is-solved" : available ? "is-active" : "is-locked";
  const targetLabel = puzzle.target?.label ?? `퍼즐 ${puzzle.order}`;

  if (puzzle.kind !== "ITEM_PLACEMENT") {
    return `
      <section
        class="scene-puzzle-target scene-control-target ${targetClass} ${stateClass}"
        style="${rectStyle(puzzle.target?.rect)}"
        aria-label="${escapeHtml(targetLabel)}"
      >
        <div class="scene-control-heading">
          <span class="scene-target-number">${String(puzzle.order).padStart(2, "0")}</span>
          <span class="scene-target-label">${escapeHtml(targetLabel)}</span>
          <span class="scene-target-status">${solved ? "완료" : available ? "조작 가능" : "잠김"}</span>
        </div>
        ${renderPuzzleControls(puzzle, solved, available)}
      </section>
    `;
  }

  const slots = (puzzle.slots ?? [])
    .map((slot) => renderSceneSlot(puzzle, slot, solved, available))
    .join("");

  return `
    <div
      class="scene-puzzle-target ${targetClass} ${stateClass}"
      style="${rectStyle(puzzle.target?.rect)}"
      aria-hidden="true"
    >
      <span class="scene-target-number">${String(puzzle.order).padStart(2, "0")}</span>
      <span class="scene-target-label">${escapeHtml(targetLabel)}</span>
      <span class="scene-target-status">${solved ? "완료" : available ? "배치 가능" : "잠김"}</span>
    </div>
    ${slots}
  `;
}

function renderPuzzleControls(puzzle, solved, available) {
  const disabled = solved || !available;
  const input = getPuzzleInput(pack, state, puzzle.id);

  if (puzzle.kind === "KEYPAD") {
    const value = input?.value ?? "";
    return `
      <div class="keypad-device" data-control-kind="keypad">
        <output class="keypad-display" aria-label="현재 입력값">${escapeHtml(value || "—")}</output>
        <div class="keypad-grid">
          ${puzzle.control.keys
            .map(
              (key) => `
                <button
                  type="button"
                  data-control-action="PRESS"
                  data-puzzle-id="${escapeHtml(puzzle.id)}"
                  data-key="${escapeHtml(key)}"
                  ${disabled ? "disabled" : ""}
                >${escapeHtml(key)}</button>
              `,
            )
            .join("")}
          <button type="button" class="keypad-function" data-control-action="BACKSPACE" data-puzzle-id="${escapeHtml(puzzle.id)}" ${disabled ? "disabled" : ""} aria-label="한 글자 지우기">⌫</button>
          <button type="button" class="keypad-function" data-control-action="CLEAR" data-puzzle-id="${escapeHtml(puzzle.id)}" ${disabled ? "disabled" : ""}>CLR</button>
        </div>
        ${renderSubmitButton(puzzle, solved, available)}
      </div>
    `;
  }

  if (puzzle.kind === "DIAL_LOCK") {
    return `
      <div class="dial-device" data-control-kind="dial-lock">
        ${puzzle.control.dials
          .map((dial) => {
            const current = input?.valuesByControlId?.[dial.id] ?? dial.options[0];
            const currentIndex = Math.max(0, dial.options.indexOf(current));
            const dialAngle = currentIndex * (360 / Math.max(1, dial.options.length));
            return `
              <div class="dial-control" data-dial-row="${escapeHtml(dial.id)}">
                <span class="dial-label">${escapeHtml(dial.label)}</span>
                <button class="dial-step dial-step-previous" type="button" data-control-action="CYCLE" data-puzzle-id="${escapeHtml(puzzle.id)}" data-control-id="${escapeHtml(dial.id)}" data-direction="-1" ${disabled ? "disabled" : ""} aria-label="${escapeHtml(dial.label)}번 다이얼 이전 값">‹</button>
                <button
                  class="dial-knob"
                  type="button"
                  id="dial-${escapeHtml(dial.id)}"
                  data-dial-knob
                  data-puzzle-id="${escapeHtml(puzzle.id)}"
                  data-control-id="${escapeHtml(dial.id)}"
                  data-option-count="${dial.options.length}"
                  aria-label="${escapeHtml(dial.label)}번 다이얼, 현재 ${escapeHtml(current)}. 드래그하거나 방향키로 돌리세요."
                  aria-valuemin="0"
                  aria-valuemax="${Math.max(0, dial.options.length - 1)}"
                  aria-valuenow="${currentIndex}"
                  aria-valuetext="${escapeHtml(current)}"
                  role="slider"
                  style="--dial-angle:${dialAngle}deg;--dial-drag-angle:0deg"
                  ${disabled ? "disabled" : ""}
                >
                  <span class="dial-knob-face" aria-hidden="true"><span class="dial-pointer"></span></span>
                </button>
                <output class="dial-value" for="dial-${escapeHtml(dial.id)}">${escapeHtml(current)}</output>
                <button class="dial-step dial-step-next" type="button" data-control-action="CYCLE" data-puzzle-id="${escapeHtml(puzzle.id)}" data-control-id="${escapeHtml(dial.id)}" data-direction="1" ${disabled ? "disabled" : ""} aria-label="${escapeHtml(dial.label)}번 다이얼 다음 값">›</button>
              </div>
            `;
          })
          .join("")}
        ${renderSubmitButton(puzzle, solved, available)}
      </div>
    `;
  }

  if (puzzle.kind === "TOGGLE_PANEL") {
    const selected = new Set(input?.selectedControlIds ?? []);
    const switchById = new Map(puzzle.control.switches.map((control) => [control.id, control]));
    const randomizedOrder = getPuzzleControlOrder(pack, state, puzzle.id);
    const switches = randomizedOrder.length === puzzle.control.switches.length
      ? randomizedOrder.map((controlId) => switchById.get(controlId)).filter(Boolean)
      : puzzle.control.switches;
    return `
      <div class="switch-device" data-control-kind="toggle-panel">
        <div class="switch-grid">
          ${switches
            .map((control) => {
              const isSelected = selected.has(control.id);
              return `
                <button
                  type="button"
                  class="switch-control ${isSelected ? "is-on" : ""}"
                  data-control-action="TOGGLE"
                  data-puzzle-id="${escapeHtml(puzzle.id)}"
                  data-control-id="${escapeHtml(control.id)}"
                  aria-pressed="${isSelected}"
                  title="${escapeHtml(control.description ?? control.label)}"
                  ${disabled ? "disabled" : ""}
                >
                  <span class="switch-light" aria-hidden="true"></span>
                  <span>${escapeHtml(control.label)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
        ${renderSubmitButton(puzzle, solved, available)}
      </div>
    `;
  }

  return "";
}

function renderSubmitButton(puzzle, solved, available) {
  const canCheckAnswer = !solved && available;
  const label = solved ? "해결 완료" : canCheckAnswer ? "정답 확인" : "잠김";
  return `
    <button
      type="button"
      class="control-submit ${canCheckAnswer ? "is-answer-check" : ""}"
      data-submit-puzzle-id="${escapeHtml(puzzle.id)}"
      data-submit-label="${canCheckAnswer ? "answer-check" : solved ? "solved" : "locked"}"
      data-puzzle-kind="${escapeHtml(puzzle.kind)}"
      aria-label="${escapeHtml(canCheckAnswer ? `${puzzle.prompt} 정답 확인` : label)}"
      ${solved || !available ? "disabled" : ""}
    >${label}</button>
  `;
}

function renderSceneSlot(puzzle, slot, solved, available) {
  const placedItemId = state.placements[slot.id];
  const placedItem = placedItemId ? itemById(placedItemId) : null;
  const slotLabel = placedItem?.label ?? slot.label ?? "빈 슬롯";
  const disabled = solved || !available || Boolean(placedItem);
  const locked = !available && !solved;

  return `
    <button
      class="scene-puzzle-slot ${placedItem ? "is-filled" : ""} ${locked ? "is-locked" : ""}"
      type="button"
      style="${rectStyle(slot.rect, puzzle.target?.rect)}"
      data-slot-id="${escapeHtml(slot.id)}"
      data-puzzle-id="${escapeHtml(puzzle.id)}"
      ${disabled ? "disabled" : ""}
      aria-label="${escapeHtml(puzzle.target?.label ?? puzzle.prompt)}: ${escapeHtml(slotLabel)}${placedItem ? `, ${placedItem.label} 배치됨` : ", 아이템을 놓을 수 있음"}"
      title="${escapeHtml(placedItem ? `${placedItem.label} 배치 완료` : `${slot.label ?? "빈칸"}에 아이템 놓기`)}"
    >
      <span class="scene-slot-glyph" data-asset="${escapeHtml(placedItem?.assetKey ?? "empty")}" aria-hidden="true">
        ${placedItem ? itemGlyphContent(placedItem) : locked ? "⌁" : "+"}
      </span>
      <span class="scene-slot-label">${escapeHtml(slotLabel)}</span>
    </button>
  `;
}

function renderCollectible(item) {
  const rect = Array.isArray(item.source.rect) ? item.source.rect : null;
  const isPuzzleReward = item.source.type === "PUZZLE_REWARD";
  const positionStyle = rect
    ? `left:${Math.max(3, Math.min(88, rect[0] * 100))}%;top:${Math.max(18, Math.min(78, rect[1] * 100))}%;`
    : "";

  return `
    <button
      class="collectible-item ${isPuzzleReward ? "is-puzzle-reward" : ""}"
      type="button"
      data-collect-item-id="${escapeHtml(item.id)}"
      data-item-source="${isPuzzleReward ? "puzzle-reward" : "scene"}"
      style="${positionStyle}"
      aria-label="${escapeHtml(item.label)} 수집하기. ${escapeHtml(item.description)}"
      title="${escapeHtml(item.description)}"
    >
      <span class="item-glyph" data-asset="${escapeHtml(item.assetKey)}" aria-hidden="true">
        ${itemGlyphContent(item)}
      </span>
      <small>${escapeHtml(item.label)}</small>
    </button>
  `;
}

function renderPuzzleCard(puzzle) {
  const solved = isSolved(puzzle.id);
  const available = isAvailable(puzzle);
  const hintLevel = state.hintLevelByPuzzle[puzzle.id] ?? 0;
  const hintLimit = Math.min(VISIBLE_HINT_LIMIT, puzzle.hints.length);
  const nextHint = Math.min(hintLevel + 1, hintLimit);
  const answerRevealed = state.answerRevealedPuzzleIds?.includes(puzzle.id) ?? false;
  const interaction = puzzleInteractionSummary(puzzle, solved);
  const status = solved ? "해결 완료" : available ? interaction.status : "선행 단서 필요";

  let message = "";
  if (!available) {
    const names = puzzle.requiresPuzzleIds
      .filter((puzzleId) => !isSolved(puzzleId))
      .map((puzzleId) => `퍼즐 ${puzzleById(puzzleId)?.order ?? puzzleId}`)
      .join(", ");
    message = `<div class="locked-message"><span>⌁</span><div>${escapeHtml(names)}을 먼저 해결하면 잠금이 풀립니다.</div></div>`;
  } else if (solved) {
    message = `<div class="solved-message"><span>✓</span><div>${escapeHtml(puzzle.explanation.body)}</div></div>`;
  }

  let actionButton = `<button class="hint-button" type="button" disabled>힌트 사용 불가</button>`;
  if (solved) {
    actionButton = `<button class="hint-button" type="button" data-explanation-id="${escapeHtml(puzzle.id)}">해설 다시 보기</button>`;
  } else if (hintLevel >= hintLimit && hintLimit > 0) {
    actionButton = `
      <button class="hint-button answer-button" type="button" data-reveal-answer-id="${escapeHtml(puzzle.id)}" ${available ? "" : "disabled"}>
        ${answerRevealed ? "정답 다시 보기" : "정답 공개"}
      </button>`;
  } else {
    actionButton = `
      <button class="hint-button" type="button" data-hint-puzzle-id="${escapeHtml(puzzle.id)}" ${available ? "" : "disabled"}>
        ${lightbulbIcon()} 힌트 ${nextHint}/${hintLimit}
      </button>`;
  }

  const panelSubmitButton =
    puzzle.kind !== "ITEM_PLACEMENT" && available && !solved
      ? `
        <button
          class="panel-answer-submit"
          type="button"
          data-submit-puzzle-id="${escapeHtml(puzzle.id)}"
          data-puzzle-kind="${escapeHtml(puzzle.kind)}"
        >
          <span>${puzzle.kind === "DIAL_LOCK" ? "다이얼을 모두 맞췄나요?" : "답을 모두 입력했나요?"}</span>
          <strong>정답 확인</strong>
        </button>`
      : "";

  return `
    <article class="puzzle-card ${solved ? "is-solved" : ""} ${available ? "" : "is-locked"}">
      <div class="puzzle-meta">
        <span class="puzzle-index">PUZZLE ${String(puzzle.order).padStart(2, "0")}</span>
        <span class="puzzle-state">${status}</span>
      </div>
      <h3>${escapeHtml(puzzle.prompt)}</h3>
      <p class="learning-objective">${escapeHtml(puzzle.target?.label ?? puzzle.learningObjective ?? "단서를 알맞게 연결하세요.")}</p>
      <div class="placement-guide ${solved ? "is-complete" : ""}">
        <span class="placement-guide-icon" aria-hidden="true">${interaction.icon}</span>
        <div class="placement-guide-copy">
          <strong>${solved ? "장면 속 장치가 열렸어요" : interaction.guide}</strong>
          <small>${escapeHtml(interaction.progress)}</small>
        </div>
        ${interaction.dots}
      </div>
      ${panelSubmitButton}
      ${message}
      <div class="puzzle-card-actions">
        <span class="candidate-note">${escapeHtml(interaction.note)}</span>
        ${actionButton}
      </div>
    </article>
  `;
}

function puzzleInteractionSummary(puzzle, solved) {
  if (puzzle.kind === "ITEM_PLACEMENT") {
    const solution = Array.isArray(puzzle.solution) ? puzzle.solution : [];
    const placedCount = solution.filter(
      (placement) => state.placements[placement.slotId] === placement.itemId,
    ).length;
    return {
      status: "아이템 배치",
      icon: "↖",
      guide: "왼쪽 가구의 빈칸에 놓으세요",
      progress: `${placedCount}/${solution.length}개 배치됨`,
      note: `후보 아이템 ${(puzzle.candidateItemIds ?? []).length}개`,
      dots: `
        <div class="placement-dots" aria-label="${placedCount}/${solution.length}개 배치 완료">
          ${solution
            .map(
              (placement) =>
                `<span class="${state.placements[placement.slotId] === placement.itemId ? "is-filled" : ""}"></span>`,
            )
            .join("")}
        </div>
      `,
    };
  }

  const input = getPuzzleInput(pack, state, puzzle.id);
  if (puzzle.kind === "KEYPAD") {
    return {
      status: "키패드 입력",
      icon: "#",
      guide: "왼쪽 장치의 키를 눌러 답을 입력하세요",
      progress: solved ? "정답 입력 완료" : `입력 ${(input?.value ?? "").length}/${puzzle.control.maxLength}자리`,
      note: puzzle.template === "NUMERIC_KEYPAD" ? "숫자키패드 템플릿" : "문자·기호키패드 템플릿",
      dots: "",
    };
  }

  if (puzzle.kind === "DIAL_LOCK") {
    return {
      status: "다이얼 조정",
      icon: "↻",
      guide: "각 다이얼을 맞춘 뒤 ‘정답 확인’을 누르세요",
      progress: `${puzzle.control.dials.length}개 다이얼 조정`,
      note: "다중 다이얼 템플릿",
      dots: "",
    };
  }

  const selectedCount = input?.selectedControlIds?.length ?? 0;
  return {
    status: "스위치 선택",
    icon: "⌁",
    guide: "맞는 설명의 스위치만 켜세요",
    progress: `${selectedCount}개 스위치 켜짐`,
    note: "스위치 뱅크 템플릿",
    dots: "",
  };
}

function renderInventory() {
  const items = getInventoryItems(pack, state);
  if (items.length === 0) {
    elements.inventoryList.innerHTML = `
      <div class="inventory-empty">
        <span aria-hidden="true">＋</span>
        방 안의 물건을 눌러 수집하세요
      </div>
    `;
  } else {
    elements.inventoryList.innerHTML = items
      .map((item) => {
        const selected = item.id === state.selectedItemId;
        return `
          <button
            class="inventory-item ${selected ? "is-selected" : ""}"
            type="button"
            draggable="true"
            data-inventory-item-id="${escapeHtml(item.id)}"
            aria-pressed="${selected}"
            title="${escapeHtml(item.inventoryDescription ?? item.description)}"
          >
            <span class="item-glyph" data-asset="${escapeHtml(item.assetKey)}" aria-hidden="true">
              ${itemGlyphContent(item)}
            </span>
            <span class="inventory-item-copy">
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.inventoryDescription ?? item.description)}</small>
            </span>
          </button>
        `;
      })
      .join("");
  }

  const selectedItem = itemById(state.selectedItemId);
  elements.selectionStatus.classList.toggle("has-selection", Boolean(selectedItem));
  elements.selectionStatus.querySelector("span:last-child").textContent = selectedItem
    ? `${selectedItem.label} 선택됨`
    : "선택한 아이템 없음";
}

function lightbulbIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18h6M10 22h4M8.2 14.6A6 6 0 1 1 15.8 14.6c-.8.6-.8 1.4-.8 1.4H9s0-.8-.8-1.4Z" />
    </svg>
  `;
}

function goToView(viewId) {
  const nextState = navigate(pack, state, viewId);
  if (nextState === state) return;
  state = nextState;
  render();
  elements.gameScene.focus({ preventScroll: true });
}

function collect(itemId) {
  const previousCollected = state.collectedItemIds.length;
  state = collectItem(pack, state, itemId);
  if (state.collectedItemIds.length === previousCollected) return;

  const pickup = state.overlay;
  if (pickup?.type === "PICKUP") {
    showToast(pickup.body || `${itemById(itemId)?.label ?? "아이템"}을 획득했습니다.`);
    state = closeOverlay(state);
  }
  render();
}

function selectItem(itemId) {
  state = selectInventoryItem(pack, state, itemId);
  renderInventory();
  elements.gameScene.querySelectorAll(".scene-puzzle-slot:not(:disabled)").forEach((slot) => {
    slot.classList.toggle("has-selection", Boolean(state.selectedItemId));
  });
  updateSelectedViewUnlockTarget();
}

function updateSelectedViewUnlockTarget() {
  elements.gameScene.querySelectorAll("[data-view-id][data-unlock-item-id]").forEach((target) => {
    target.classList.toggle(
      "is-selected-unlock-target",
      target.dataset.viewLockState === "locked" &&
        target.dataset.unlockItemId === state.selectedItemId,
    );
  });
}

function useViewUnlockItem(itemId, viewId) {
  const access = getViewAccess(viewId);
  if (!access.locked) return true;

  const nextState = tryUseViewUnlockItem(pack, state, itemId, viewId);
  if (nextState === state) {
    showToast(access.message, "notice");
    return false;
  }

  const unlockedMessage = nextState.overlay?.body;
  state = nextState.overlay ? closeOverlay(nextState) : nextState;
  render();
  if (unlockedMessage) showToast(unlockedMessage);
  return true;
}

function useItem(itemId, slotId) {
  if (!itemId) {
    showToast("먼저 인벤토리에서 사용할 아이템을 선택하세요.", "notice");
    return;
  }

  const previousSolvedCount = state.solvedPuzzleIds.length;
  const previousPlacements = Object.keys(state.placements).length;
  state = tryUseItem(pack, state, itemId, slotId);
  render();

  const placed = Object.keys(state.placements).length > previousPlacements;
  const solved = state.solvedPuzzleIds.length > previousSolvedCount;
  if (state.overlay?.type === "PARTIAL") {
    showToast(state.overlay.body);
    state = closeOverlay(state);
    return;
  }

  if (state.overlay) {
    openStateOverlay();
  } else if (placed && !solved) {
    showToast("올바른 위치입니다. 남은 슬롯도 채워 보세요.");
  }
}

function changePuzzleControl(control) {
  const puzzleId = control.dataset.puzzleId;
  const actionType = control.dataset.controlAction;
  let action = { type: actionType };

  if (actionType === "PRESS") {
    action = { ...action, key: control.dataset.key };
  } else if (actionType === "CYCLE") {
    action = {
      ...action,
      controlId: control.dataset.controlId,
      direction: Number(control.dataset.direction),
    };
  } else if (actionType === "TOGGLE") {
    action = { ...action, controlId: control.dataset.controlId };
  }

  state = applyPuzzleInput(pack, state, puzzleId, action);
  render();
  if (state.overlay) openStateOverlay();
}

function cycleDial(puzzleId, controlId, direction, steps = 1) {
  const stepCount = Math.max(1, Math.min(20, Math.abs(steps)));
  const normalizedDirection = direction < 0 ? -1 : 1;
  for (let index = 0; index < stepCount; index += 1) {
    state = applyPuzzleInput(pack, state, puzzleId, {
      type: "CYCLE",
      controlId,
      direction: normalizedDirection,
    });
  }
  render();
  if (state.overlay) openStateOverlay();
}

function pointerAngle(event, rect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
}

function normalizedAngleDelta(delta) {
  let normalized = delta;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function beginDialDrag(event, knob) {
  if (event.button !== 0 || knob.disabled) return;
  const rect = knob.getBoundingClientRect();
  dialDrag = {
    pointerId: event.pointerId,
    knob,
    puzzleId: knob.dataset.puzzleId,
    controlId: knob.dataset.controlId,
    startX: event.clientX,
    startY: event.clientY,
    lastAngle: pointerAngle(event, rect),
    totalAngle: 0,
    rect,
  };
  knob.classList.add("is-dragging");
  try {
    knob.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events used by smoke tests have no native capture target.
  }
  event.preventDefault();
}

function updateDialDrag(event) {
  if (!dialDrag || dialDrag.pointerId !== event.pointerId) return;
  const nextAngle = pointerAngle(event, dialDrag.rect);
  dialDrag.totalAngle += normalizedAngleDelta(nextAngle - dialDrag.lastAngle);
  dialDrag.lastAngle = nextAngle;
  const linearDelta = event.clientX - dialDrag.startX - (event.clientY - dialDrag.startY);
  const previewAngle =
    Math.abs(dialDrag.totalAngle) >= 8 ? dialDrag.totalAngle : linearDelta * 1.35;
  dialDrag.knob.style.setProperty("--dial-drag-angle", `${previewAngle}deg`);
  event.preventDefault();
}

function finishDialDrag(event, cancelled = false) {
  if (!dialDrag || dialDrag.pointerId !== event.pointerId) return;
  const activeDrag = dialDrag;
  dialDrag = null;
  activeDrag.knob.classList.remove("is-dragging");
  activeDrag.knob.style.setProperty("--dial-drag-angle", "0deg");
  if (activeDrag.knob.hasPointerCapture?.(event.pointerId)) {
    activeDrag.knob.releasePointerCapture(event.pointerId);
  }
  if (cancelled) return;

  const linearDelta = event.clientX - activeDrag.startX - (event.clientY - activeDrag.startY);
  const angularSteps = Math.round(activeDrag.totalAngle / DIAL_DRAG_DEGREES_PER_STEP);
  const linearSteps = Math.round(linearDelta / DIAL_DRAG_PIXELS_PER_STEP);
  let steps = Math.abs(angularSteps) >= Math.abs(linearSteps) ? angularSteps : linearSteps;
  const travel = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
  if (steps === 0 && travel >= 8) {
    const directionHint = Math.abs(activeDrag.totalAngle) >= 5 ? activeDrag.totalAngle : linearDelta;
    steps = directionHint < 0 ? -1 : 1;
  }
  if (steps === 0) return;

  cycleDial(activeDrag.puzzleId, activeDrag.controlId, Math.sign(steps), steps);
}

function submitControlPuzzle(puzzleId) {
  const wasSolved = state.solvedPuzzleIds.includes(puzzleId);
  state = submitPuzzleAnswer(pack, state, puzzleId);
  const justSolved = !wasSolved && state.solvedPuzzleIds.includes(puzzleId);
  render();
  if (state.overlay) openStateOverlay(justSolved ? puzzleId : null);
}

function inspectExitDoor() {
  if (state.escaped) {
    showEscapeEnding();
    return;
  }

  if (!state.exitUnlocked) {
    const hasKeycard = getInventoryItems(pack, state).some(
      (item) => item.id === pack.completion.exitItemId,
    );
    showToast(
      hasKeycard
        ? "비상구 키카드를 인벤토리에서 이 문으로 드래그하세요."
        : `출구가 잠겨 있습니다. 퍼즐 ${state.solvedPuzzleIds.length}/${totalPuzzles()}를 해결하고 키카드를 회수하세요.`,
      "notice",
    );
    return;
  }

  const nextState = exitRoom(pack, state);
  if (nextState === state) return;
  state = closeOverlay(nextState);
  render();
  showEscapeEnding();
}

function useExitItem(itemId) {
  const nextState = tryUseExitItem(
    pack,
    state,
    itemId,
    pack.completion.exitObjectId,
  );
  if (nextState === state) {
    showToast("이 문에는 최종 금고에서 얻은 비상구 키카드가 필요합니다.", "notice");
    return;
  }

  state = nextState;
  render();
  showToast(state.overlay?.body ?? "키카드를 사용해 출구 잠금을 해제했습니다.");
  state = closeOverlay(state);
}

function requestHint(puzzleId) {
  activeHintPuzzleId = puzzleId;
  state = showHint(pack, state, puzzleId);
  render();
  openStateOverlay();
}

function requestAnswer(puzzleId) {
  activeHintPuzzleId = puzzleId;
  const nextState = revealAnswer(pack, state, puzzleId);
  if (nextState === state) {
    showToast("힌트 1/2와 2/2를 먼저 확인해야 정답을 볼 수 있습니다.", "notice");
    return;
  }

  state = nextState;
  render();
  openStateOverlay();
}

function showPuzzleExplanation(puzzleId) {
  const puzzle = puzzleById(puzzleId);
  if (!puzzle) return;
  const evidenceIds = new Set(puzzle.explanation.evidenceSegmentIds);
  openModal({
    type: "EXPLANATION",
    title: puzzle.explanation.title,
    body: puzzle.explanation.body,
    evidence: pack.video.segments.filter((segment) => evidenceIds.has(segment.id)),
  });
}

function openStateOverlay(sourcePuzzleId = null) {
  if (!state.overlay) return;
  openModal(state.overlay, sourcePuzzleId);
}

function openModal(overlay, sourcePuzzleId = null) {
  const type = overlay.type ?? "WRONG";
  const sourcePuzzle = sourcePuzzleId ? puzzleById(sourcePuzzleId) : null;
  const opensDrawerReward =
    type === "EXPLANATION" &&
    sourcePuzzle?.kind === "DIAL_LOCK" &&
    getViewKey(sourcePuzzle.viewId) === "drawer";
  const modalKind = ["EXPLANATION", "ENDING", "ANSWER"].includes(type)
    ? "success"
    : type === "HINT"
      ? "hint"
      : "wrong";
  const modalText = {
    WRONG: { kicker: "오답 피드백", symbol: "!", primary: "다시 관찰하기" },
    LOCKED: { kicker: "아직 잠겨 있어요", symbol: "⌁", primary: "다른 장소 살펴보기" },
    HINT: { kicker: "단계형 힌트", symbol: "?", primary: "힌트 적용하기" },
    ANSWER: { kicker: "정답 공개", symbol: "✓", primary: "직접 풀어보기" },
    EXPLANATION: { kicker: "정답 해설", symbol: "✓", primary: "다음 단서 찾기" },
    ENDING: { kicker: "모든 기록 복원 완료", symbol: "✦", primary: "방 둘러보기" },
  }[type] ?? { kicker: "관찰 기록", symbol: "·", primary: "계속하기" };

  elements.modal.dataset.kind = modalKind;
  elements.modalKicker.textContent = modalText.kicker;
  elements.modalSymbol.textContent = modalText.symbol;
  elements.modalTitle.textContent = overlay.title;
  elements.modalBody.innerHTML = `<p>${escapeHtml(overlay.body).replaceAll("\n", "<br>")}</p>`;
  elements.modalPrimary.textContent = opensDrawerReward
    ? "서랍 보상 확인하기"
    : modalText.primary;
  elements.modalPrimary.dataset.followup = opensDrawerReward
    ? "drawer-reward"
    : "continue";

  const evidence = Array.isArray(overlay.evidence) ? overlay.evidence : [];
  elements.modalEvidence.classList.toggle("is-hidden", evidence.length === 0);
  elements.modalEvidence.innerHTML = evidence
    .map(
      (segment) => `
        <span class="evidence-chip" title="${escapeHtml(segment.text)}">
          영상 ${formatTime(segment.startSec)}–${formatTime(segment.endSec)}
        </span>
      `,
    )
    .join("");

  const hintPuzzle = activeHintPuzzleId ? puzzleById(activeHintPuzzleId) : null;
  const currentHintLevel = hintPuzzle ? state.hintLevelByPuzzle[hintPuzzle.id] ?? 0 : 0;
  const hintLimit = hintPuzzle ? Math.min(VISIBLE_HINT_LIMIT, hintPuzzle.hints.length) : 0;
  const canShowNextHint = type === "HINT" && hintPuzzle && currentHintLevel <= hintLimit;
  elements.modalSecondary.classList.toggle("is-hidden", !canShowNextHint);
  elements.modalSecondary.textContent = canShowNextHint
    ? currentHintLevel < hintLimit
      ? `힌트 ${currentHintLevel + 1}/${hintLimit} 보기`
      : "정답 공개"
    : "";

  if (!elements.modal.open) elements.modal.showModal();
}

function closeModal() {
  if (elements.modal.open) elements.modal.close();
  if (state?.overlay) state = closeOverlay(state);
  activeHintPuzzleId = null;
}

function showToast(message, kind = "success") {
  clearTimeout(toastTimer);
  elements.toastRegion.innerHTML = `<div class="toast" data-kind="${escapeHtml(kind)}">${escapeHtml(message)}</div>`;
  toastTimer = window.setTimeout(() => {
    elements.toastRegion.innerHTML = "";
  }, 3200);
}

function renderError(error) {
  elements.gameScene.setAttribute("aria-busy", "false");
  elements.gameScene.innerHTML = `
    <div class="error-state" role="alert">
      <span class="error-state-symbol" aria-hidden="true">!</span>
      <h2>게임 데이터를 불러오지 못했습니다</h2>
      <p>${escapeHtml(error.message)}<br />저장소 루트에서 정적 서버를 실행한 뒤 다시 열어 주세요.</p>
    </div>
  `;
}

async function changeAssetMode(mode) {
  if (!elements.assetModeSelect) return;

  elements.assetModeSelect.disabled = true;
  try {
    await setAssetMode(mode);
    const activeMode = getAssetMode();
    elements.assetModeSelect.value = activeMode;
    elements.appShell.dataset.assetMode = activeMode;
    render();
    showToast(`${activeMode.toUpperCase()} 에셋 모드로 전환했습니다.`);
  } finally {
    elements.assetModeSelect.disabled = false;
  }
}

function bindEvents() {
  elements.gameScene.addEventListener("pointerdown", (event) => {
    const knob = event.target.closest("[data-dial-knob]");
    if (knob) beginDialDrag(event, knob);
  });
  elements.gameScene.addEventListener("pointermove", updateDialDrag);
  elements.gameScene.addEventListener("pointerup", (event) => finishDialDrag(event));
  elements.gameScene.addEventListener("pointercancel", (event) => finishDialDrag(event, true));
  elements.gameScene.addEventListener("keydown", (event) => {
    const knob = event.target.closest("[data-dial-knob]");
    if (!knob || knob.disabled) return;
    const direction = ["ArrowLeft", "ArrowDown"].includes(event.key)
      ? -1
      : ["ArrowRight", "ArrowUp"].includes(event.key)
        ? 1
        : 0;
    if (direction === 0) return;
    event.preventDefault();
    cycleDial(knob.dataset.puzzleId, knob.dataset.controlId, direction);
  });

  elements.gameScene.addEventListener("click", (event) => {
    const exitDoor = event.target.closest("[data-exit-door-id]");
    if (exitDoor) {
      if (!state.exitUnlocked && state.selectedItemId) {
        useExitItem(state.selectedItemId);
        return;
      }
      inspectExitDoor();
      return;
    }

    const viewButton = event.target.closest("[data-view-id]");
    if (viewButton) {
      const access = getViewAccess(viewButton.dataset.viewId);
      if (access.locked) {
        if (state.selectedItemId) {
          useViewUnlockItem(state.selectedItemId, viewButton.dataset.viewId);
        } else {
          showToast(access.message, "notice");
        }
        return;
      }
      goToView(viewButton.dataset.viewId);
      return;
    }

    const collectible = event.target.closest("[data-collect-item-id]");
    if (collectible) {
      collect(collectible.dataset.collectItemId);
      return;
    }

    const hintButton = event.target.closest("[data-hint-puzzle-id]");
    if (hintButton) {
      requestHint(hintButton.dataset.hintPuzzleId);
      return;
    }

    const answerButton = event.target.closest("[data-reveal-answer-id]");
    if (answerButton) {
      requestAnswer(answerButton.dataset.revealAnswerId);
      return;
    }

    const explanationButton = event.target.closest("[data-explanation-id]");
    if (explanationButton) {
      showPuzzleExplanation(explanationButton.dataset.explanationId);
      return;
    }

    const control = event.target.closest("[data-control-action]");
    if (control && !control.disabled) {
      changePuzzleControl(control);
      return;
    }

    const submitButton = event.target.closest("[data-submit-puzzle-id]");
    if (submitButton && !submitButton.disabled) {
      submitControlPuzzle(submitButton.dataset.submitPuzzleId);
      return;
    }

    const slot = event.target.closest("[data-slot-id]");
    if (slot && !slot.disabled) {
      useItem(state.selectedItemId, slot.dataset.slotId);
    }
  });

  elements.inventoryList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-inventory-item-id]");
    if (item) selectItem(item.dataset.inventoryItemId);
  });

  elements.inventoryList.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-inventory-item-id]");
    if (!item) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.dataset.inventoryItemId);
    if (state.selectedItemId !== item.dataset.inventoryItemId) {
      state = selectInventoryItem(pack, state, item.dataset.inventoryItemId);
    }
    item.classList.add("is-selected");
    updateSelectedViewUnlockTarget();
  });

  elements.inventoryList.addEventListener("dragend", () => {
    elements.gameScene.querySelectorAll(".is-dragover").forEach((target) => {
      target.classList.remove("is-dragover");
    });
  });

  elements.gameScene.addEventListener("dragover", (event) => {
    const exitDoor = event.target.closest("[data-exit-door-id]");
    if (exitDoor && !state.exitUnlocked) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      exitDoor.classList.add("is-dragover");
      return;
    }
    const viewTarget = event.target.closest("[data-view-id][data-unlock-item-id]");
    if (viewTarget?.dataset.viewLockState === "locked") {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      viewTarget.classList.toggle(
        "is-dragover",
        viewTarget.dataset.unlockItemId === state.selectedItemId,
      );
      return;
    }
    const slot = event.target.closest("[data-slot-id]");
    if (!slot || slot.disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    slot.classList.add("is-dragover");
  });

  elements.gameScene.addEventListener("dragleave", (event) => {
    event.target.closest("[data-slot-id]")?.classList.remove("is-dragover");
    event.target.closest("[data-exit-door-id]")?.classList.remove("is-dragover");
    event.target.closest("[data-view-id]")?.classList.remove("is-dragover");
  });

  elements.gameScene.addEventListener("drop", (event) => {
    const exitDoor = event.target.closest("[data-exit-door-id]");
    if (exitDoor && !state.exitUnlocked) {
      event.preventDefault();
      exitDoor.classList.remove("is-dragover");
      const itemId = event.dataTransfer.getData("text/plain") || state.selectedItemId;
      useExitItem(itemId);
      return;
    }
    const viewTarget = event.target.closest("[data-view-id][data-unlock-item-id]");
    if (viewTarget?.dataset.viewLockState === "locked") {
      event.preventDefault();
      viewTarget.classList.remove("is-dragover");
      const itemId = event.dataTransfer.getData("text/plain") || state.selectedItemId;
      useViewUnlockItem(itemId, viewTarget.dataset.viewId);
      return;
    }
    const slot = event.target.closest("[data-slot-id]");
    if (!slot || slot.disabled) return;
    event.preventDefault();
    slot.classList.remove("is-dragover");
    const itemId = event.dataTransfer.getData("text/plain") || state.selectedItemId;
    useItem(itemId, slot.dataset.slotId);
  });

  elements.backButton.addEventListener("click", () => {
    const current = getView(pack, state.currentViewId);
    goToView(current?.backToViewId ?? pack.room.initialViewId);
  });

  document.querySelector(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    if (pack) goToView(pack.room.initialViewId);
  });

  elements.resetButton.addEventListener("click", () => {
    if (!pack) return;
    const shouldReset = window.confirm("수집한 아이템과 퍼즐 진행도를 모두 초기화할까요?");
    if (!shouldReset) return;
    state = resetState(pack);
    elements.appShell.classList.remove("is-ending", "is-escaped");
    closeModal();
    render();
    showStoryIntro();
  });


  elements.assetModeSelect?.addEventListener("change", () => {
    changeAssetMode(elements.assetModeSelect.value);
  });

  elements.modalClose.addEventListener("click", closeModal);
  elements.modalPrimary.addEventListener("click", closeModal);
  elements.modal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModal();
  });
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });
  elements.modalSecondary.addEventListener("click", () => {
    if (!activeHintPuzzleId) return;
    const currentHintLevel = state.hintLevelByPuzzle[activeHintPuzzleId] ?? 0;
    state = closeOverlay(state);
    if (currentHintLevel >= VISIBLE_HINT_LIMIT) {
      requestAnswer(activeHintPuzzleId);
      return;
    }
    state = showHint(pack, state, activeHintPuzzleId);
    render();
    openStateOverlay();
  });

  elements.storyIntroDialog.addEventListener("cancel", (event) => event.preventDefault());
  elements.storyIntroDialog.addEventListener("close", () => {
    elements.gameScene.focus({ preventScroll: true });
  });
  elements.exitEndingDialog.addEventListener("cancel", (event) => event.preventDefault());
  elements.exitEndingDialog.addEventListener("close", () => {
    if (elements.exitEndingDialog.returnValue === "replay") {
      state = resetState(pack);
      elements.appShell.classList.remove("is-ending", "is-escaped");
      closeModal();
      render();
      showStoryIntro();
      return;
    }
    elements.appShell.classList.remove("is-ending");
    elements.appShell.classList.add("is-escaped");
    elements.gameScene.focus({ preventScroll: true });
  });
}

async function loadRoom() {
  completionReported = false;
  elements.gameScene.setAttribute("aria-busy", "true");
  elements.gameScene.innerHTML = `
    <div class="loading-state">
      <div class="loading-orbit" aria-hidden="true"><span></span></div>
      <p>강의의 기억을 방 안에 배치하고 있어요</p>
      <small>잠시만 기다려 주세요</small>
    </div>
  `;

  try {
    const response = await fetch(ROOM_PACK_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`게임 데이터 요청 실패 (${response.status})`);
    }
    pack = await response.json();
    state = createInitialState(pack);

    elements.lectureTitle.textContent = `${pack.video.title} · ${formatTime(pack.video.durationSec)}`;
    document.title = `${pack.room.title} | 강의실 탈출`;
    closeModal();
    render();
    showStoryIntro();
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

async function initialize() {
  applyUiAssetVariables();
  await setAssetMode("2d");
  const initialAssetMode = getAssetMode();
  if (elements.assetModeSelect) elements.assetModeSelect.value = initialAssetMode;
  elements.appShell.dataset.assetMode = initialAssetMode;
  bindEvents();
  await loadRoom();
}

initialize();
