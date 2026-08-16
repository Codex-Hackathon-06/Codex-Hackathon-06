export function createInitialState(pack) {
  return {
    currentViewId: pack.room.initialViewId,
    collectedItemIds: [],
    placements: {},
    solvedPuzzleIds: [],
    selectedItemId: null,
    hintLevelByPuzzle: {},
    overlay: null,
    escaped: false,
  };
}

export function getView(pack, viewId) {
  return pack.room.views.find((view) => view.id === viewId) ?? null;
}

export function getPuzzle(pack, puzzleId) {
  return pack.puzzles.find((puzzle) => puzzle.id === puzzleId) ?? null;
}

export function getPuzzleForSlot(pack, slotId) {
  return pack.puzzles.find((puzzle) =>
    puzzle.slots.some((slot) => slot.id === slotId),
  ) ?? null;
}

export function getItem(pack, itemId) {
  return pack.items.find((item) => item.id === itemId) ?? null;
}

export function isPuzzleAvailable(puzzle, state) {
  return puzzle.requiresPuzzleIds.every((id) => state.solvedPuzzleIds.includes(id));
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
  return state.collectedItemIds
    .filter((itemId) => !isItemPlaced(state, itemId))
    .map((itemId) => getItem(pack, itemId))
    .filter(Boolean);
}

export function navigate(pack, state, viewId) {
  if (!getView(pack, viewId)) {
    return state;
  }

  return {
    ...state,
    currentViewId: viewId,
    selectedItemId: null,
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
  const ids = new Set(puzzle.explanation.evidenceSegmentIds);
  return pack.video.segments.filter((segment) => ids.has(segment.id));
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
    return {
      ...state,
      overlay: {
        type: "LOCKED",
        title: "아직 풀 수 없는 퍼즐",
        body: "다른 장소를 더 관찰해 필요한 단서를 먼저 찾아보세요.",
      },
    };
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

  const solvedPuzzleIds = solved
    ? [...state.solvedPuzzleIds, puzzle.id]
    : state.solvedPuzzleIds;
  const escaped = solved && puzzle.id === pack.completion.finalPuzzleId;

  return {
    ...state,
    placements,
    solvedPuzzleIds,
    selectedItemId: null,
    escaped,
    overlay: solved
      ? {
          type: escaped ? "ENDING" : "EXPLANATION",
          title: escaped ? "탈출 성공" : puzzle.explanation.title,
          body: escaped
            ? `${puzzle.explanation.body}\n\n강의의 핵심 단서를 모두 연결했습니다.`
            : puzzle.explanation.body,
          evidence: evidenceFor(pack, puzzle),
        }
      : {
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

  const previous = state.hintLevelByPuzzle[puzzleId] ?? 0;
  const nextLevel = Math.min(previous + 1, puzzle.hints.length);
  const hint = puzzle.hints[nextLevel - 1];

  return {
    ...state,
    hintLevelByPuzzle: {
      ...state.hintLevelByPuzzle,
      [puzzleId]: nextLevel,
    },
    overlay: {
      type: "HINT",
      title: `힌트 ${nextLevel}/${puzzle.hints.length}`,
      body: typeof hint === "string" ? hint : hint.text,
    },
  };
}

export function closeOverlay(state) {
  return { ...state, overlay: null };
}

export function clearSelection(state) {
  return { ...state, selectedItemId: null };
}

export function resetState(pack) {
  return createInitialState(pack);
}
