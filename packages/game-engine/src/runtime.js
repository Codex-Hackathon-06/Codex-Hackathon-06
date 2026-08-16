/**
 * Creates one play session. Randomized values are materialized in the state so
 * subsequent renders never reshuffle them. Pass { seed } or { rng } when a
 * reproducible session is needed (for tests, replay links, or demos).
 */
export function createInitialState(pack, options = {}) {
  const random = resolveSessionRandom(options);

  return {
    currentViewId: pack.room.initialViewId,
    unlockedViewIds: pack.room.views
      .filter((view) => !view.unlock)
      .map((view) => view.id),
    collectedItemIds: [],
    consumedItemIds: [],
    placements: {},
    puzzleInputs: Object.fromEntries(
      pack.puzzles
        .filter((puzzle) => isControlPuzzle(puzzle))
        .map((puzzle) => [
          puzzle.id,
          createDefaultPuzzleInput(puzzle, random, { randomizeDials: true }),
        ]),
    ),
    controlOrderByPuzzleId: Object.fromEntries(
      pack.puzzles
        .filter((puzzle) => puzzle.kind === "TOGGLE_PANEL")
        .map((puzzle) => [
          puzzle.id,
          shuffleOnce(
            (puzzle.control?.switches ?? []).map((control) => control.id),
            random,
          ),
        ]),
    ),
    solvedPuzzleIds: [],
    selectedItemId: null,
    hintLevelByPuzzle: {},
    answerRevealedPuzzleIds: [],
    overlay: null,
    exitUnlocked: false,
    escaped: false,
  };
}

export function getView(pack, viewId) {
  return pack.room.views.find((view) => view.id === viewId) ?? null;
}

export function isViewUnlocked(pack, state, viewId) {
  const view = getView(pack, viewId);
  if (!view) {
    return false;
  }

  return !view.unlock || (state.unlockedViewIds ?? []).includes(viewId);
}

export function getPuzzle(pack, puzzleId) {
  return pack.puzzles.find((puzzle) => puzzle.id === puzzleId) ?? null;
}

export function getPuzzleForSlot(pack, slotId) {
  return pack.puzzles.find((puzzle) =>
    puzzle.slots?.some((slot) => slot.id === slotId),
  ) ?? null;
}

export function getItem(pack, itemId) {
  return pack.items.find((item) => item.id === itemId) ?? null;
}

export function isPuzzleAvailable(puzzle, state) {
  return (puzzle.requiresPuzzleIds ?? []).every((id) =>
    state.solvedPuzzleIds.includes(id),
  );
}

function isControlPuzzle(puzzle) {
  return ["KEYPAD", "DIAL_LOCK", "TOGGLE_PANEL"].includes(puzzle.kind);
}

function resolveSessionRandom(options) {
  if (typeof options === "function") {
    return options;
  }

  if (typeof options?.rng === "function") {
    return options.rng;
  }

  if (options && Object.hasOwn(options, "seed")) {
    return createSeededRandom(options.seed);
  }

  return Math.random;
}

function createSeededRandom(seed) {
  const source = String(seed ?? "");
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIndex(length, random) {
  if (length <= 1) {
    return 0;
  }

  const sample = Number(random());
  const normalized = Number.isFinite(sample)
    ? ((sample % 1) + 1) % 1
    : 0;
  return Math.floor(normalized * length);
}

function shuffleOnce(values, random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function createDefaultPuzzleInput(
  puzzle,
  random = Math.random,
  { randomizeDials = false } = {},
) {
  if (puzzle.kind === "KEYPAD") {
    return { value: "" };
  }

  if (puzzle.kind === "DIAL_LOCK") {
    const dials = puzzle.control?.dials ?? [];
    const valuesByControlId = Object.fromEntries(
      dials.map((dial) => [
        dial.id,
        dial.options[
          randomizeDials ? randomIndex(dial.options.length, random) : 0
        ],
      ]),
    );

    if (randomizeDials) {
      const startsSolved = dials.every(
        (dial) =>
          valuesByControlId[dial.id] ===
          puzzle.solution?.valuesByControlId?.[dial.id],
      );
      const adjustableDial = dials.find((dial) => dial.options.length > 1);
      if (startsSolved && adjustableDial) {
        const solutionIndex = adjustableDial.options.indexOf(
          puzzle.solution.valuesByControlId[adjustableDial.id],
        );
        valuesByControlId[adjustableDial.id] =
          adjustableDial.options[
            (solutionIndex + 1) % adjustableDial.options.length
          ];
      }
    }

    return { valuesByControlId };
  }

  if (puzzle.kind === "TOGGLE_PANEL") {
    return { selectedControlIds: [] };
  }

  return null;
}

export function getPuzzleInput(pack, state, puzzleId) {
  const puzzle = getPuzzle(pack, puzzleId);
  if (!puzzle || !isControlPuzzle(puzzle)) {
    return null;
  }

  return state.puzzleInputs?.[puzzleId] ?? createDefaultPuzzleInput(puzzle);
}

/**
 * Returns the stable presentation order chosen for this session. Consumers can
 * map these ids back to puzzle.control.switches without mutating pack content.
 */
export function getPuzzleControlOrder(pack, state, puzzleId) {
  const puzzle = getPuzzle(pack, puzzleId);
  if (!puzzle || puzzle.kind !== "TOGGLE_PANEL") {
    return [];
  }

  const sourceIds = (puzzle.control?.switches ?? []).map((control) => control.id);
  const stored = state.controlOrderByPuzzleId?.[puzzleId];
  if (
    !Array.isArray(stored) ||
    stored.length !== sourceIds.length ||
    stored.some((id) => !sourceIds.includes(id))
  ) {
    return sourceIds;
  }

  return [...stored];
}

export function isItemPlaced(state, itemId) {
  return Object.values(state.placements).includes(itemId);
}

export function isItemVisible(pack, state, item) {
  if (state.collectedItemIds.includes(item.id) || isItemPlaced(state, item.id)) {
    return false;
  }

  if (item.source.type === "SCENE") {
    return true;
  }

  if (item.source.type === "PUZZLE_REWARD") {
    return state.solvedPuzzleIds.includes(item.source.puzzleId);
  }

  return false;
}

export function getVisibleItems(pack, state, viewId = state.currentViewId) {
  return pack.items.filter(
    (item) => item.source.viewId === viewId && isItemVisible(pack, state, item),
  );
}

export function getInventoryItems(pack, state) {
  const consumedItemIds = new Set(state.consumedItemIds ?? []);
  return state.collectedItemIds
    .filter(
      (itemId) =>
        !isItemPlaced(state, itemId) && !consumedItemIds.has(itemId),
    )
    .map((itemId) => getItem(pack, itemId))
    .filter(Boolean);
}

export function navigate(pack, state, viewId) {
  const view = getView(pack, viewId);
  if (!view) {
    return state;
  }

  if (!isViewUnlocked(pack, state, viewId)) {
    return {
      ...state,
      overlay: {
        type: "LOCKED",
        title: `${view.label ?? "장소"} 잠김`,
        body:
          view.unlock.lockedMessage ??
          "이 장소는 잠겨 있습니다. 필요한 키나 부품을 먼저 찾아보세요.",
      },
    };
  }

  return {
    ...state,
    currentViewId: viewId,
    selectedItemId: null,
  };
}

export function tryUseViewUnlockItem(pack, state, itemId, viewId) {
  const view = getView(pack, viewId);
  const currentView = getView(pack, state.currentViewId);
  const itemInInventory = getInventoryItems(pack, state).some(
    (item) => item.id === itemId,
  );

  if (
    !view?.unlock ||
    currentView?.kind !== "OVERVIEW" ||
    view.unlock.itemId !== itemId ||
    itemInInventory === false ||
    isViewUnlocked(pack, state, viewId)
  ) {
    return state;
  }

  const item = getItem(pack, itemId);
  return {
    ...state,
    consumedItemIds: [...new Set([...(state.consumedItemIds ?? []), itemId])],
    unlockedViewIds: [...new Set([...(state.unlockedViewIds ?? []), viewId])],
    selectedItemId: null,
    overlay: {
      type: "VIEW_UNLOCKED",
      title: `${view.label ?? "장소"} 잠금 해제`,
      body:
        view.unlock.unlockedMessage ??
        `${item?.label ?? "해금 아이템"}를 사용해 ${view.label ?? "장소"}에 접근할 수 있습니다.`,
    },
  };
}

export function collectItem(pack, state, itemId) {
  const item = getItem(pack, itemId);
  if (!item || item.source.viewId !== state.currentViewId) {
    return state;
  }

  if (!isItemVisible(pack, state, item)) {
    return state;
  }

  return {
    ...state,
    collectedItemIds: [...state.collectedItemIds, itemId],
    selectedItemId: itemId,
    overlay: {
      type: "PICKUP",
      title: `${item.label} 획득`,
      body: item.pickupText ?? item.description,
    },
  };
}

export function selectInventoryItem(pack, state, itemId) {
  const inInventory = getInventoryItems(pack, state).some((item) => item.id === itemId);
  if (!inInventory) {
    return state;
  }

  return {
    ...state,
    selectedItemId: state.selectedItemId === itemId ? null : itemId,
  };
}

function evidenceFor(pack, puzzle) {
  const ids = new Set(puzzle.explanation?.evidenceSegmentIds ?? []);
  return pack.video.segments.filter((segment) => ids.has(segment.id));
}

function lockedPuzzleState(state) {
  return {
    ...state,
    overlay: {
      type: "LOCKED",
      title: "아직 풀 수 없는 퍼즐",
      body: "다른 장소를 더 관찰해 필요한 단서를 먼저 찾아보세요.",
    },
  };
}

function blockedInteractionState(puzzle, state) {
  if (
    puzzle.viewId !== state.currentViewId ||
    state.solvedPuzzleIds.includes(puzzle.id)
  ) {
    return state;
  }

  if (!isPuzzleAvailable(puzzle, state)) {
    return lockedPuzzleState(state);
  }

  return null;
}

function completePuzzle(pack, state, puzzle, changes = {}) {
  return {
    ...state,
    ...changes,
    solvedPuzzleIds: state.solvedPuzzleIds.includes(puzzle.id)
      ? state.solvedPuzzleIds
      : [...state.solvedPuzzleIds, puzzle.id],
    overlay: {
      type: "EXPLANATION",
      title: puzzle.explanation.title,
      body: puzzle.explanation.body,
      evidence: evidenceFor(pack, puzzle),
    },
  };
}

function dialCycleDirection(direction) {
  if (
    direction === -1 ||
    direction === "-1" ||
    direction === "PREVIOUS" ||
    direction === "BACKWARD"
  ) {
    return -1;
  }

  if (
    direction === 1 ||
    direction === "1" ||
    direction === "NEXT" ||
    direction === "FORWARD"
  ) {
    return 1;
  }

  return 0;
}

export function applyPuzzleInput(pack, state, puzzleId, action) {
  const puzzle = getPuzzle(pack, puzzleId);
  if (!puzzle || !isControlPuzzle(puzzle) || !action) {
    return state;
  }

  const blockedState = blockedInteractionState(puzzle, state);
  if (blockedState) {
    return blockedState;
  }

  const input = getPuzzleInput(pack, state, puzzleId);
  let nextInput = input;

  if (puzzle.kind === "KEYPAD") {
    if (action.type === "PRESS") {
      const key = String(action.key ?? "");
      const isAllowedKey = puzzle.control.keys.some(
        (candidate) => String(candidate) === key,
      );
      const maxLength = puzzle.control.maxLength;

      if (!isAllowedKey || input.value.length + key.length > maxLength) {
        return state;
      }

      nextInput = { value: `${input.value}${key}` };
    } else if (action.type === "BACKSPACE") {
      nextInput = { value: input.value.slice(0, -1) };
    } else if (action.type === "CLEAR") {
      nextInput = { value: "" };
    } else {
      return state;
    }
  }

  if (puzzle.kind === "DIAL_LOCK") {
    if (action.type !== "CYCLE") {
      return state;
    }

    const dial = puzzle.control.dials.find(
      (candidate) => candidate.id === action.controlId,
    );
    const direction = dialCycleDirection(action.direction);
    if (!dial || direction === 0 || dial.options.length === 0) {
      return state;
    }

    const currentValue = input.valuesByControlId[dial.id];
    const currentIndex = Math.max(0, dial.options.indexOf(currentValue));
    const nextIndex =
      (currentIndex + direction + dial.options.length) % dial.options.length;
    nextInput = {
      valuesByControlId: {
        ...input.valuesByControlId,
        [dial.id]: dial.options[nextIndex],
      },
    };
  }

  if (puzzle.kind === "TOGGLE_PANEL") {
    if (action.type !== "TOGGLE") {
      return state;
    }

    const controlExists = puzzle.control.switches.some(
      (control) => control.id === action.controlId,
    );
    if (!controlExists) {
      return state;
    }

    const selected = new Set(input.selectedControlIds);
    if (selected.has(action.controlId)) {
      selected.delete(action.controlId);
    } else {
      selected.add(action.controlId);
    }
    nextInput = { selectedControlIds: [...selected] };
  }

  return {
    ...state,
    puzzleInputs: {
      ...(state.puzzleInputs ?? {}),
      [puzzleId]: nextInput,
    },
  };
}

function isCorrectPuzzleInput(puzzle, input) {
  if (puzzle.kind === "KEYPAD") {
    return input.value === puzzle.solution.value;
  }

  if (puzzle.kind === "DIAL_LOCK") {
    const controlIds = puzzle.control.dials.map((dial) => dial.id);
    const solutionIds = Object.keys(puzzle.solution.valuesByControlId);
    return (
      controlIds.length === solutionIds.length &&
      controlIds.every(
        (controlId) =>
          input.valuesByControlId[controlId] ===
          puzzle.solution.valuesByControlId[controlId],
      )
    );
  }

  if (puzzle.kind === "TOGGLE_PANEL") {
    const selected = new Set(input.selectedControlIds);
    const expected = new Set(puzzle.solution.selectedControlIds);
    return (
      selected.size === expected.size &&
      [...selected].every((controlId) => expected.has(controlId))
    );
  }

  return false;
}

function wrongAnswerFeedback(puzzle, input) {
  if (puzzle.kind === "KEYPAD") {
    return (
      puzzle.feedback.byAnswer?.[input.value] ??
      puzzle.feedback.defaultWrongAnswer
    );
  }

  if (puzzle.kind === "DIAL_LOCK") {
    const wrongControlIds = puzzle.control.dials
      .map((dial) => dial.id)
      .filter(
        (controlId) =>
          input.valuesByControlId[controlId] !==
          puzzle.solution.valuesByControlId[controlId],
      );
    const specific = wrongControlIds
      .map((controlId) => puzzle.feedback.byControlId?.[controlId])
      .find(Boolean);
    return specific ?? puzzle.feedback.defaultWrongAnswer;
  }

  if (puzzle.kind === "TOGGLE_PANEL") {
    const selected = new Set(input.selectedControlIds);
    const expected = new Set(puzzle.solution.selectedControlIds);
    const wrongControlIds = puzzle.control.switches
      .map((control) => control.id)
      .filter((controlId) => selected.has(controlId) !== expected.has(controlId));
    const specific = wrongControlIds
      .map((controlId) => puzzle.feedback.byControlId?.[controlId])
      .find(Boolean);
    return specific ?? puzzle.feedback.defaultWrongAnswer;
  }

  return puzzle.feedback.defaultWrongAnswer;
}

export function submitPuzzleAnswer(pack, state, puzzleId) {
  const puzzle = getPuzzle(pack, puzzleId);
  if (!puzzle || !isControlPuzzle(puzzle)) {
    return state;
  }

  const blockedState = blockedInteractionState(puzzle, state);
  if (blockedState) {
    return blockedState;
  }

  const input = getPuzzleInput(pack, state, puzzleId);
  if (isCorrectPuzzleInput(puzzle, input)) {
    return completePuzzle(pack, state, puzzle);
  }

  return {
    ...state,
    overlay: {
      type: "WRONG",
      title: "정답을 다시 확인하세요",
      body: wrongAnswerFeedback(puzzle, input),
    },
  };
}

export function tryUseItem(pack, state, itemId, slotId) {
  const puzzle = getPuzzleForSlot(pack, slotId);
  const item = getItem(pack, itemId);

  if (!puzzle || !item || !getInventoryItems(pack, state).some((entry) => entry.id === itemId)) {
    return state;
  }

  if (puzzle.viewId !== state.currentViewId) {
    return state;
  }

  if (!isPuzzleAvailable(puzzle, state)) {
    return lockedPuzzleState(state);
  }

  if (state.solvedPuzzleIds.includes(puzzle.id)) {
    return state;
  }

  if (state.placements[slotId]) {
    return {
      ...state,
      overlay: {
        type: "WRONG",
        title: "이미 채워진 자리",
        body: "다른 빈 슬롯을 확인하세요.",
      },
    };
  }

  const expected = puzzle.solution.find((placement) => placement.slotId === slotId);
  if (!expected || expected.itemId !== itemId) {
    return {
      ...state,
      overlay: {
        type: "WRONG",
        title: "단서를 다시 연결해 보세요",
        body:
          puzzle.feedback.byItemId?.[itemId] ??
          puzzle.feedback.wrongSlot ??
          puzzle.feedback.defaultWrongItem,
      },
    };
  }

  const placements = { ...state.placements, [slotId]: itemId };
  const solved = puzzle.solution.every(
    (placement) => placements[placement.slotId] === placement.itemId,
  );

  if (solved) {
    return completePuzzle(pack, state, puzzle, {
      placements,
      selectedItemId: null,
    });
  }

  return {
    ...state,
    placements,
    selectedItemId: null,
    overlay: {
      type: "PARTIAL",
      title: "올바른 위치입니다",
      body: "남은 아이템도 알맞은 슬롯에 배치하세요.",
    },
  };
}

export function showHint(pack, state, puzzleId) {
  const puzzle = getPuzzle(pack, puzzleId);
  if (!puzzle || puzzle.hints.length === 0) {
    return state;
  }

  const availableHintCount = Math.min(puzzle.hints.length, 2);
  const previous = state.hintLevelByPuzzle[puzzleId] ?? 0;
  const nextLevel = Math.min(previous + 1, availableHintCount);
  const hint = puzzle.hints[nextLevel - 1];

  return {
    ...state,
    hintLevelByPuzzle: {
      ...state.hintLevelByPuzzle,
      [puzzleId]: nextLevel,
    },
    overlay: {
      type: "HINT",
      title: `힌트 ${nextLevel}/${availableHintCount}`,
      body: typeof hint === "string" ? hint : hint.text,
    },
  };
}

export function revealAnswer(pack, state, puzzleId) {
  const puzzle = getPuzzle(pack, puzzleId);
  if (!puzzle || (state.hintLevelByPuzzle[puzzleId] ?? 0) < 2) {
    return state;
  }

  const blockedState = blockedInteractionState(puzzle, state);
  if (blockedState) {
    return blockedState;
  }

  return {
    ...state,
    answerRevealedPuzzleIds: state.answerRevealedPuzzleIds.includes(puzzleId)
      ? state.answerRevealedPuzzleIds
      : [...state.answerRevealedPuzzleIds, puzzleId],
    overlay: {
      type: "ANSWER",
      title: puzzle.explanation.title,
      body: puzzle.explanation.body,
      evidence: evidenceFor(pack, puzzle),
    },
  };
}

export function tryUseExitItem(pack, state, itemId, objectId) {
  const finalPuzzleSolved = state.solvedPuzzleIds.includes(
    pack.completion.finalPuzzleId,
  );
  const isExitItem = itemId === pack.completion.exitItemId;
  const isExitObject = objectId === pack.completion.exitObjectId;
  const itemInInventory = getInventoryItems(pack, state).some(
    (item) => item.id === itemId,
  );

  if (
    !finalPuzzleSolved ||
    !isExitItem ||
    !isExitObject ||
    !itemInInventory ||
    state.exitUnlocked
  ) {
    return state;
  }

  const item = getItem(pack, itemId);
  return {
    ...state,
    consumedItemIds: [...new Set([...(state.consumedItemIds ?? []), itemId])],
    selectedItemId: null,
    exitUnlocked: true,
    overlay: {
      type: "EXIT_UNLOCKED",
      title: "출구 잠금 해제",
      body: `${item?.label ?? "출구 아이템"}를 인식했습니다. 이제 출구 문을 열 수 있습니다.`,
    },
  };
}

export function exitRoom(pack, state) {
  if (!state.exitUnlocked || state.escaped) {
    return state;
  }

  const finalPuzzle = getPuzzle(pack, pack.completion.finalPuzzleId);
  return {
    ...state,
    escaped: true,
    overlay: {
      type: "ENDING",
      title: "탈출 성공",
      body: finalPuzzle
        ? `${finalPuzzle.explanation.body}\n\n강의의 핵심 단서를 모두 연결하고 출구를 열었습니다.`
        : "강의의 핵심 단서를 모두 연결하고 출구를 열었습니다.",
      evidence: finalPuzzle ? evidenceFor(pack, finalPuzzle) : [],
    },
  };
}

export function closeOverlay(state) {
  return { ...state, overlay: null };
}

export function clearSelection(state) {
  return { ...state, selectedItemId: null };
}

export function resetState(pack, options = {}) {
  return createInitialState(pack, options);
}
