import {
  closeOverlay,
  collectItem,
  createInitialState,
  getInventoryItems,
  getView,
  getVisibleItems,
  navigate,
  resetState,
  selectInventoryItem,
  showHint,
  tryUseItem,
} from "../../packages/game-engine/src/runtime.js";

const DATA_URL = "../../content/sample-lectures/puppy-poop.room.json";

const elements = {
  appShell: document.querySelector("#app-shell"),
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
};

const viewPresentation = {
  bookshelf: {
    eyebrow: "서가 기록 · 01",
    description: "책등과 문구 사이에 숨은 빈칸을 관찰하세요. 다른 장소에서 찾은 책이 필요할 수 있어요.",
    artClass: "bookshelf",
  },
  wall: {
    eyebrow: "사건 기록 · 02",
    description: "흩어진 사건 카드를 모아 이야기의 변화 과정을 다시 연결하세요.",
    artClass: "wall",
  },
  drawer: {
    eyebrow: "잠금 장치 · 03",
    description: "민들레 문양의 자물쇠입니다. 강아지똥이 맡은 역할을 나타내는 열쇠를 찾아보세요.",
    artClass: "drawer",
  },
  desk: {
    eyebrow: "기록자의 자리 · 04",
    description: "작품의 메시지를 완성하고, 모은 개념 토큰으로 마지막 금고를 여세요.",
    artClass: "desk",
  },
};

let pack = null;
let state = null;
let activeHintPuzzleId = null;
let toastTimer = null;

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

function getViewKey(viewId) {
  const normalized = String(viewId ?? "").toLowerCase();
  return Object.keys(viewPresentation).find((key) => normalized.includes(key)) ?? "desk";
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

function totalPuzzles() {
  return pack.room.declaredPuzzleCount ?? pack.puzzles.length;
}

function render() {
  if (!pack || !state) return;

  const currentView = getView(pack, state.currentViewId);
  const overviewId = pack.room.initialViewId;
  const onOverview = state.currentViewId === overviewId || currentView?.kind === "OVERVIEW";

  elements.appShell.dataset.view = onOverview ? "overview" : getViewKey(state.currentViewId);
  elements.gameScene.setAttribute("aria-busy", "false");
  elements.backButton.classList.toggle("is-hidden", onOverview);
  elements.sceneLocation.textContent = currentView?.label ?? "알 수 없는 장소";
  elements.sceneInstruction.textContent = onOverview
    ? "빛나는 가구를 눌러 가까이 살펴보세요"
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

  const presentation = viewPresentation[getViewKey(currentView?.id)];
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
  const objectMarkup = navigation
    .map((entry) => {
      const target = getView(pack, entry.targetViewId);
      const viewKey = getViewKey(entry.targetViewId);
      const label = entry.label ?? `${target?.label ?? "장소"} 살펴보기`;
      return `
        <button
          class="room-object object-${safeCssKey(viewKey)}"
          type="button"
          data-view-id="${escapeHtml(entry.targetViewId)}"
          aria-label="${escapeHtml(label)}"
        >
          <span class="inspect-dot" aria-hidden="true">＋</span>
        </button>
      `;
    })
    .join("");

  return `
    <div class="room-overview" aria-label="${escapeHtml(pack.room.title ?? "강의실 방 전체")}">
      <div class="room-window" aria-hidden="true"></div>
      <div class="room-light" aria-hidden="true"></div>
      ${objectMarkup}
      <div class="overview-caption">
        <span aria-hidden="true">◎</span>
        네 곳을 자유롭게 오가며 아이템과 단서를 찾으세요
      </div>
    </div>
  `;
}

function renderCloseup(view) {
  const viewKey = getViewKey(view?.id);
  const presentation = viewPresentation[viewKey];
  const visibleItems = getVisibleItems(pack, state, view.id);
  const puzzles = pack.puzzles.filter((puzzle) => puzzle.viewId === view.id);

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
    <div class="closeup-scene">
      <section class="closeup-visual" aria-label="${escapeHtml(view.label)} 관찰 영역">
        <div class="closeup-label">
          <p>${escapeHtml(presentation.eyebrow)}</p>
          <h2>${escapeHtml(view.label)}</h2>
          <span>${escapeHtml(presentation.description)}</span>
        </div>
        <div class="furniture-art ${escapeHtml(presentation.artClass)}" aria-hidden="true"></div>
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
  const slots = puzzle.slots
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
        ${placedItem ? escapeHtml(glyphFor(placedItem)) : locked ? "⌁" : "+"}
      </span>
      <span class="scene-slot-label">${escapeHtml(slotLabel)}</span>
    </button>
  `;
}

function renderCollectible(item) {
  const rect = Array.isArray(item.source.rect) ? item.source.rect : null;
  const positionStyle = rect
    ? `left:${Math.max(3, Math.min(88, rect[0] * 100))}%;top:${Math.max(18, Math.min(78, rect[1] * 100))}%;`
    : "";

  return `
    <button
      class="collectible-item"
      type="button"
      data-collect-item-id="${escapeHtml(item.id)}"
      style="${positionStyle}"
      aria-label="${escapeHtml(item.label)} 수집하기. ${escapeHtml(item.description)}"
      title="${escapeHtml(item.description)}"
    >
      <span class="item-glyph" data-asset="${escapeHtml(item.assetKey)}" aria-hidden="true">
        ${escapeHtml(glyphFor(item))}
      </span>
      <small>${escapeHtml(item.label)}</small>
    </button>
  `;
}

function renderPuzzleCard(puzzle) {
  const solved = isSolved(puzzle.id);
  const available = isAvailable(puzzle);
  const hintLevel = state.hintLevelByPuzzle[puzzle.id] ?? 0;
  const nextHint = Math.min(hintLevel + 1, puzzle.hints.length);
  const status = solved ? "해결 완료" : available ? "아이템 배치" : "선행 단서 필요";
  const placedCount = puzzle.solution.filter(
    (placement) => state.placements[placement.slotId] === placement.itemId,
  ).length;

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

  const actionButton = solved
    ? `<button class="hint-button" type="button" data-explanation-id="${escapeHtml(puzzle.id)}">해설 다시 보기</button>`
    : `<button class="hint-button" type="button" data-hint-puzzle-id="${escapeHtml(puzzle.id)}" ${available ? "" : "disabled"}>
         ${lightbulbIcon()} 힌트 ${nextHint}/${puzzle.hints.length}
       </button>`;

  return `
    <article class="puzzle-card ${solved ? "is-solved" : ""} ${available ? "" : "is-locked"}">
      <div class="puzzle-meta">
        <span class="puzzle-index">PUZZLE ${String(puzzle.order).padStart(2, "0")}</span>
        <span class="puzzle-state">${status}</span>
      </div>
      <h3>${escapeHtml(puzzle.prompt)}</h3>
      <p class="learning-objective">${escapeHtml(puzzle.target?.label ?? puzzle.learningObjective ?? "단서를 알맞게 연결하세요.")}</p>
      <div class="placement-guide ${solved ? "is-complete" : ""}">
        <span class="placement-guide-icon" aria-hidden="true">↖</span>
        <div class="placement-guide-copy">
          <strong>${solved ? "장면 속 장치가 완성됐어요" : "왼쪽 가구의 빈칸에 놓으세요"}</strong>
          <small>${placedCount}/${puzzle.solution.length}개 배치됨</small>
        </div>
        <div class="placement-dots" aria-label="${placedCount}/${puzzle.solution.length}개 배치 완료">
          ${puzzle.solution
            .map(
              (placement) =>
                `<span class="${state.placements[placement.slotId] === placement.itemId ? "is-filled" : ""}"></span>`,
            )
            .join("")}
        </div>
      </div>
      ${message}
      <div class="puzzle-card-actions">
        <span class="candidate-note">후보 아이템 ${puzzle.candidateItemIds.length}개</span>
        ${actionButton}
      </div>
    </article>
  `;
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
              ${escapeHtml(glyphFor(item))}
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

function requestHint(puzzleId) {
  activeHintPuzzleId = puzzleId;
  state = showHint(pack, state, puzzleId);
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

function openStateOverlay() {
  if (!state.overlay) return;
  openModal(state.overlay);
}

function openModal(overlay) {
  const type = overlay.type ?? "WRONG";
  const modalKind = ["EXPLANATION", "ENDING"].includes(type)
    ? "success"
    : type === "HINT"
      ? "hint"
      : "wrong";
  const modalText = {
    WRONG: { kicker: "오답 피드백", symbol: "!", primary: "다시 관찰하기" },
    LOCKED: { kicker: "아직 잠겨 있어요", symbol: "⌁", primary: "다른 장소 살펴보기" },
    HINT: { kicker: "단계형 힌트", symbol: "?", primary: "힌트 적용하기" },
    EXPLANATION: { kicker: "정답 해설", symbol: "✓", primary: "다음 단서 찾기" },
    ENDING: { kicker: "모든 기록 복원 완료", symbol: "✦", primary: "방 둘러보기" },
  }[type] ?? { kicker: "관찰 기록", symbol: "·", primary: "계속하기" };

  elements.modal.dataset.kind = modalKind;
  elements.modalKicker.textContent = modalText.kicker;
  elements.modalSymbol.textContent = modalText.symbol;
  elements.modalTitle.textContent = overlay.title;
  elements.modalBody.innerHTML = `<p>${escapeHtml(overlay.body).replaceAll("\n", "<br>")}</p>`;
  elements.modalPrimary.textContent = modalText.primary;

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
  const canShowNextHint = type === "HINT" && hintPuzzle && currentHintLevel < hintPuzzle.hints.length;
  elements.modalSecondary.classList.toggle("is-hidden", !canShowNextHint);
  elements.modalSecondary.textContent = canShowNextHint ? "다음 단계 힌트" : "";

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

function bindEvents() {
  elements.gameScene.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-id]");
    if (viewButton) {
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

    const explanationButton = event.target.closest("[data-explanation-id]");
    if (explanationButton) {
      showPuzzleExplanation(explanationButton.dataset.explanationId);
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
    state = selectInventoryItem(pack, state, item.dataset.inventoryItemId);
    item.classList.add("is-selected");
  });

  elements.gameScene.addEventListener("dragover", (event) => {
    const slot = event.target.closest("[data-slot-id]");
    if (!slot || slot.disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    slot.classList.add("is-dragover");
  });

  elements.gameScene.addEventListener("dragleave", (event) => {
    event.target.closest("[data-slot-id]")?.classList.remove("is-dragover");
  });

  elements.gameScene.addEventListener("drop", (event) => {
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
    closeModal();
    render();
    showToast("게임을 처음 상태로 되돌렸습니다.");
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
    state = closeOverlay(state);
    state = showHint(pack, state, activeHintPuzzleId);
    render();
    openStateOverlay();
  });
}

async function initialize() {
  bindEvents();
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`게임 데이터 요청 실패 (${response.status})`);
    }
    pack = await response.json();
    state = createInitialState(pack);

    elements.lectureTitle.textContent = `${pack.video.title} · ${formatTime(pack.video.durationSec)}`;
    document.title = `${pack.room.title} | 강의실 탈출`;
    render();
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

initialize();
