const HINT_TYPES = new Set(["OBSERVATION", "CONCEPT", "DIRECTION"]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

/**
 * Validates the executable references and learning-content guarantees of a
 * PuzzlePack. It never throws for malformed pack data; callers receive all
 * discovered errors and can show or log them together.
 *
 * @param {unknown} pack
 * @returns {{valid: boolean, errors: Array<{code: string, path: string, message: string}>}}
 */
export function validatePuzzlePack(pack) {
  const errors = [];

  const addError = (code, path, message) => {
    errors.push({ code, path, message });
  };

  const requireString = (value, path) => {
    if (!isNonEmptyString(value)) {
      addError("INVALID_STRING", path, "must be a non-empty string");
      return false;
    }
    return true;
  };

  if (!isRecord(pack)) {
    addError("INVALID_PACK", "$", "must be an object");
    return { valid: false, errors };
  }

  requireString(pack.schemaVersion, "$.schemaVersion");

  const room = isRecord(pack.room) ? pack.room : pack;
  const video = isRecord(pack.video) ? pack.video : null;
  const roomId = isRecord(pack.room) ? room.id : pack.roomId;
  const sourceVideoId = video?.id ?? pack.sourceVideoId;
  const declaredPuzzleCount = isRecord(pack.room)
    ? room.declaredPuzzleCount
    : pack.declaredPuzzleCount;

  requireString(roomId, isRecord(pack.room) ? "$.room.id" : "$.roomId");
  requireString(
    sourceVideoId,
    video ? "$.video.id" : "$.sourceVideoId",
  );

  const items = Array.isArray(pack.items) ? pack.items : [];
  const puzzles = Array.isArray(pack.puzzles) ? pack.puzzles : [];

  if (!Array.isArray(pack.items)) {
    addError("INVALID_ITEMS", "$.items", "must be an array");
  }
  if (!Array.isArray(pack.puzzles)) {
    addError("INVALID_PUZZLES", "$.puzzles", "must be an array");
  }
  if (puzzles.length < 3 || puzzles.length > 5) {
    addError("INVALID_PUZZLE_COUNT", "$.puzzles", "must contain 3 to 5 puzzles");
  }
  if (!Number.isInteger(declaredPuzzleCount)) {
    addError(
      "INVALID_DECLARED_COUNT",
      isRecord(pack.room) ? "$.room.declaredPuzzleCount" : "$.declaredPuzzleCount",
      "must be an integer",
    );
  } else if (declaredPuzzleCount !== puzzles.length) {
    addError(
      "PUZZLE_COUNT_MISMATCH",
      isRecord(pack.room) ? "$.room.declaredPuzzleCount" : "$.declaredPuzzleCount",
      `declares ${declaredPuzzleCount} but contains ${puzzles.length} puzzles`,
    );
  }

  const segmentById = collectUniqueRecords(
    Array.isArray(video?.segments) ? video.segments : [],
    "$.video.segments",
    "segment",
    addError,
  );
  if (video && !Array.isArray(video.segments)) {
    addError("INVALID_SEGMENTS", "$.video.segments", "must be an array");
  } else if (video && video.segments.length === 0) {
    addError(
      "EMPTY_SEGMENTS",
      "$.video.segments",
      "must contain at least one evidence segment",
    );
  }
  for (let segmentIndex = 0; segmentIndex < (video?.segments?.length ?? 0); segmentIndex += 1) {
    const segment = video.segments[segmentIndex];
    const segmentPath = `$.video.segments[${segmentIndex}]`;
    if (!isRecord(segment)) continue;
    if (!Number.isFinite(segment.startSec) || segment.startSec < 0) {
      addError(
        "INVALID_SEGMENT_TIME",
        `${segmentPath}.startSec`,
        "must be a non-negative finite number",
      );
    }
    if (
      !Number.isFinite(segment.endSec) ||
      segment.endSec < 0 ||
      (Number.isFinite(segment.startSec) && segment.endSec <= segment.startSec)
    ) {
      addError(
        "INVALID_SEGMENT_TIME",
        `${segmentPath}.endSec`,
        "must be a finite number greater than startSec",
      );
    }
    requireString(segment.text, `${segmentPath}.text`);
  }

  const viewById = collectUniqueRecords(
    Array.isArray(room.views) ? room.views : [],
    isRecord(pack.room) ? "$.room.views" : "$.views",
    "view",
    addError,
  );
  if (isRecord(pack.room) && !Array.isArray(room.views)) {
    addError("INVALID_VIEWS", "$.room.views", "must be an array");
  }
  if (
    isRecord(pack.room) &&
    isNonEmptyString(room.initialViewId) &&
    !viewById.has(room.initialViewId)
  ) {
    addError(
      "UNKNOWN_VIEW_REF",
      "$.room.initialViewId",
      `references unknown view ${room.initialViewId}`,
    );
  }
  for (let viewIndex = 0; viewIndex < (room.views?.length ?? 0); viewIndex += 1) {
    const view = room.views[viewIndex];
    const viewPath = `$.room.views[${viewIndex}]`;
    if (!isRecord(view)) continue;
    if (
      isNonEmptyString(view.backToViewId) &&
      !viewById.has(view.backToViewId)
    ) {
      addError(
        "UNKNOWN_VIEW_REF",
        `${viewPath}.backToViewId`,
        `references unknown view ${view.backToViewId}`,
      );
    }
    if (hasOwn(view, "navigation") && !Array.isArray(view.navigation)) {
      addError("INVALID_NAVIGATION", `${viewPath}.navigation`, "must be an array");
      continue;
    }
    for (let navIndex = 0; navIndex < (view.navigation?.length ?? 0); navIndex += 1) {
      const targetViewId = view.navigation[navIndex]?.targetViewId;
      if (!viewById.has(targetViewId)) {
        addError(
          "UNKNOWN_VIEW_REF",
          `${viewPath}.navigation[${navIndex}].targetViewId`,
          `references unknown view ${String(targetViewId)}`,
        );
      }
    }
  }

  const itemById = collectUniqueRecords(items, "$.items", "item", addError);
  const puzzleById = collectUniqueRecords(
    puzzles,
    "$.puzzles",
    "puzzle",
    addError,
  );

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    const path = `$.items[${itemIndex}]`;
    if (!isRecord(item)) continue;

    requireString(item.label, `${path}.label`);
    requireString(item.assetKey, `${path}.assetKey`);
    requireString(item.description, `${path}.description`);

    if (!isRecord(item.source)) {
      addError("INVALID_ITEM_SOURCE", `${path}.source`, "must be an object");
      continue;
    }

    const sourceType = item.source.type;
    if (sourceType !== "SCENE" && sourceType !== "PUZZLE_REWARD") {
      addError(
        "INVALID_ITEM_SOURCE_TYPE",
        `${path}.source.type`,
        "must be SCENE or PUZZLE_REWARD",
      );
    }
    requireString(item.source.viewId, `${path}.source.viewId`);
    if (sourceType === "PUZZLE_REWARD") {
      const sourcePuzzleId = item.source.puzzleId;
      requireString(sourcePuzzleId, `${path}.source.puzzleId`);
      if (isNonEmptyString(sourcePuzzleId) && !puzzleById.has(sourcePuzzleId)) {
        addError(
          "UNKNOWN_PUZZLE_REF",
          `${path}.source.puzzleId`,
          `references unknown puzzle ${sourcePuzzleId}`,
        );
      }
    }
    if (
      viewById.size > 0 &&
      isNonEmptyString(item.source.viewId) &&
      !viewById.has(item.source.viewId)
    ) {
      addError(
        "UNKNOWN_VIEW_REF",
        `${path}.source.viewId`,
        `references unknown view ${item.source.viewId}`,
      );
    }
  }

  const seenOrders = new Map();
  const dependencyGraph = new Map();

  for (let puzzleIndex = 0; puzzleIndex < puzzles.length; puzzleIndex += 1) {
    const puzzle = puzzles[puzzleIndex];
    const path = `$.puzzles[${puzzleIndex}]`;
    if (!isRecord(puzzle)) continue;

    requireString(puzzle.template, `${path}.template`);
    const interaction = puzzle.kind ?? puzzle.interaction;
    const interactionPath = hasOwn(puzzle, "kind")
      ? `${path}.kind`
      : `${path}.interaction`;
    requireString(interaction, interactionPath);
    if (interaction !== "ITEM_PLACEMENT") {
      addError(
        "UNSUPPORTED_INTERACTION",
        interactionPath,
        "must be ITEM_PLACEMENT",
      );
    }
    requireString(puzzle.viewId, `${path}.viewId`);
    if (viewById.size > 0 && !viewById.has(puzzle.viewId)) {
      addError(
        "UNKNOWN_VIEW_REF",
        `${path}.viewId`,
        `references unknown view ${String(puzzle.viewId)}`,
      );
    }
    const targetObjectId = isRecord(puzzle.target)
      ? puzzle.target.id
      : puzzle.targetObjectId;
    requireString(
      targetObjectId,
      isRecord(puzzle.target) ? `${path}.target.id` : `${path}.targetObjectId`,
    );
    if (hasOwn(puzzle, "learningObjective")) {
      requireString(puzzle.learningObjective, `${path}.learningObjective`);
    }
    requireString(puzzle.prompt, `${path}.prompt`);

    if (!Number.isInteger(puzzle.order) || puzzle.order < 1) {
      addError("INVALID_PUZZLE_ORDER", `${path}.order`, "must be a positive integer");
    } else if (seenOrders.has(puzzle.order)) {
      addError(
        "DUPLICATE_PUZZLE_ORDER",
        `${path}.order`,
        `duplicates order used by ${seenOrders.get(puzzle.order)}`,
      );
    } else {
      seenOrders.set(puzzle.order, puzzle.id);
    }

    const requiredIds = Array.isArray(puzzle.requiresPuzzleIds)
      ? puzzle.requiresPuzzleIds
      : [];
    if (!Array.isArray(puzzle.requiresPuzzleIds)) {
      addError(
        "INVALID_REQUIREMENTS",
        `${path}.requiresPuzzleIds`,
        "must be an array",
      );
    }
    dependencyGraph.set(isNonEmptyString(puzzle.id) ? puzzle.id : `#${puzzleIndex}`, requiredIds);
    validateReferenceList({
      values: requiredIds,
      path: `${path}.requiresPuzzleIds`,
      known: puzzleById,
      refCode: "UNKNOWN_PUZZLE_REF",
      selfId: puzzle.id,
      selfCode: "SELF_PUZZLE_REF",
      addError,
    });

    const candidateIds = Array.isArray(puzzle.candidateItemIds)
      ? puzzle.candidateItemIds
      : [];
    if (!Array.isArray(puzzle.candidateItemIds) || candidateIds.length === 0) {
      addError(
        "INVALID_CANDIDATES",
        `${path}.candidateItemIds`,
        "must be a non-empty array",
      );
    }
    validateReferenceList({
      values: candidateIds,
      path: `${path}.candidateItemIds`,
      known: itemById,
      refCode: "UNKNOWN_ITEM_REF",
      addError,
    });

    const slots = Array.isArray(puzzle.slots) ? puzzle.slots : [];
    if (!Array.isArray(puzzle.slots) || slots.length === 0) {
      addError("INVALID_SLOTS", `${path}.slots`, "must be a non-empty array");
    }
    const slotById = collectUniqueRecords(
      slots,
      `${path}.slots`,
      "slot",
      addError,
    );

    const placements = Array.isArray(puzzle.solution) ? puzzle.solution : [];
    const solutionPath = `${path}.solution`;
    if (!Array.isArray(puzzle.solution) || placements.length === 0) {
      addError(
        "INVALID_SOLUTION",
        solutionPath,
        "must be a non-empty array",
      );
    }

    const solutionItemIds = new Set();
    const occupiedSlotIds = new Set();
    for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
      const placement = placements[placementIndex];
      const placementPath = `${solutionPath}[${placementIndex}]`;
      if (!isRecord(placement)) {
        addError("INVALID_PLACEMENT", placementPath, "must be an object");
        continue;
      }

      if (!itemById.has(placement.itemId)) {
        addError(
          "UNKNOWN_ITEM_REF",
          `${placementPath}.itemId`,
          `references unknown item ${String(placement.itemId)}`,
        );
      } else if (
        !isItemAvailableBeforePuzzle(
          itemById.get(placement.itemId),
          puzzle,
          puzzleById,
        )
      ) {
        addError(
          "UNAVAILABLE_SOLUTION_ITEM",
          `${placementPath}.itemId`,
          `item ${placement.itemId} cannot be collected before puzzle ${String(puzzle.id)}`,
        );
      }
      if (!candidateIds.includes(placement.itemId)) {
        addError(
          "SOLUTION_ITEM_NOT_CANDIDATE",
          `${placementPath}.itemId`,
          "must also appear in candidateItemIds",
        );
      }
      if (solutionItemIds.has(placement.itemId)) {
        addError(
          "DUPLICATE_SOLUTION_ITEM",
          `${placementPath}.itemId`,
          "cannot be used in more than one solution slot",
        );
      }
      solutionItemIds.add(placement.itemId);

      if (!slotById.has(placement.slotId)) {
        addError(
          "UNKNOWN_SLOT_REF",
          `${placementPath}.slotId`,
          `references unknown slot ${String(placement.slotId)}`,
        );
      }
      if (occupiedSlotIds.has(placement.slotId)) {
        addError(
          "DUPLICATE_SOLUTION_SLOT",
          `${placementPath}.slotId`,
          "cannot have more than one solution item",
        );
      }
      occupiedSlotIds.add(placement.slotId);
    }

    if (slotById.size > 0 && occupiedSlotIds.size !== slotById.size) {
      addError(
        "INCOMPLETE_SOLUTION",
        solutionPath,
        "must provide exactly one solution placement for every slot",
      );
    }

    validateFeedback({
      feedback: puzzle.feedback,
      candidateIds,
      solutionItemIds,
      path: `${path}.feedback`,
      addError,
    });
    validateHints(puzzle.hints, `${path}.hints`, addError);
    validateExplanation(
      puzzle.explanation,
      `${path}.explanation`,
      segmentById,
      addError,
    );

    const rewards = Array.isArray(puzzle.rewards) ? puzzle.rewards : [];
    if (!Array.isArray(puzzle.rewards)) {
      addError("INVALID_REWARDS", `${path}.rewards`, "must be an array");
    }
    for (let rewardIndex = 0; rewardIndex < rewards.length; rewardIndex += 1) {
      const reward = rewards[rewardIndex];
      const rewardPath = `${path}.rewards[${rewardIndex}]`;
      if (!isRecord(reward)) {
        addError("INVALID_REWARD", rewardPath, "must be an object");
        continue;
      }
      requireString(reward.type, `${rewardPath}.type`);
      if (reward.type !== "REVEAL_ITEM" && reward.type !== "UNLOCK_EXIT") {
        addError(
          "UNSUPPORTED_REWARD_TYPE",
          `${rewardPath}.type`,
          "must be REVEAL_ITEM or UNLOCK_EXIT",
        );
      }
      if (reward.type === "REVEAL_ITEM" && !itemById.has(reward.itemId)) {
        addError(
          "UNKNOWN_ITEM_REF",
          `${rewardPath}.itemId`,
          `references unknown item ${String(reward.itemId)}`,
        );
      }
      if (reward.type === "REVEAL_ITEM" && itemById.has(reward.itemId)) {
        const rewardItem = itemById.get(reward.itemId);
        if (
          rewardItem.source?.type !== "PUZZLE_REWARD" ||
          rewardItem.source?.puzzleId !== puzzle.id
        ) {
          addError(
            "REWARD_SOURCE_MISMATCH",
            `${rewardPath}.itemId`,
            `item ${reward.itemId} must declare ${String(puzzle.id)} as its reward source`,
          );
        }
      }
      if (reward.type === "UNLOCK_EXIT") {
        requireString(reward.objectId, `${rewardPath}.objectId`);
      }
    }
  }

  const expectedOrders = Array.from({ length: puzzles.length }, (_, index) => index + 1);
  if (
    puzzles.length > 0 &&
    expectedOrders.some((order) => !seenOrders.has(order))
  ) {
    addError(
      "NON_SEQUENTIAL_PUZZLE_ORDER",
      "$.puzzles",
      `orders must contain every integer from 1 to ${puzzles.length}`,
    );
  }

  detectDependencyCycles(dependencyGraph, puzzleById, addError);
  validateCompletion(pack, puzzles, puzzleById, itemById, addError);

  return { valid: errors.length === 0, errors };
}

function isItemAvailableBeforePuzzle(item, puzzle, puzzleById) {
  if (item.source?.type === "SCENE") return true;
  if (item.source?.type !== "PUZZLE_REWARD") return false;

  const sourcePuzzle = puzzleById.get(item.source.puzzleId);
  if (
    !sourcePuzzle ||
    !Number.isInteger(sourcePuzzle.order) ||
    !Number.isInteger(puzzle.order) ||
    sourcePuzzle.order >= puzzle.order
  ) {
    return false;
  }

  return (
    Array.isArray(sourcePuzzle.rewards) &&
    sourcePuzzle.rewards.some(
      (reward) =>
        reward?.type === "REVEAL_ITEM" && reward.itemId === item.id,
    )
  );
}

function collectUniqueRecords(values, path, label, addError) {
  const result = new Map();

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const itemPath = `${path}[${index}]`;
    if (!isRecord(value)) {
      addError(`INVALID_${label.toUpperCase()}`, itemPath, "must be an object");
      continue;
    }
    if (!isNonEmptyString(value.id)) {
      addError("INVALID_ID", `${itemPath}.id`, "must be a non-empty string");
      continue;
    }
    if (result.has(value.id)) {
      addError(
        "DUPLICATE_ID",
        `${itemPath}.id`,
        `duplicates ${label} id ${value.id}`,
      );
      continue;
    }
    result.set(value.id, value);
  }

  return result;
}

function validateReferenceList({
  values,
  path,
  known,
  refCode,
  selfId,
  selfCode,
  addError,
}) {
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const itemPath = `${path}[${index}]`;
    if (!isNonEmptyString(value)) {
      addError("INVALID_ID", itemPath, "must be a non-empty string");
      continue;
    }
    if (seen.has(value)) {
      addError("DUPLICATE_REF", itemPath, `duplicates reference ${value}`);
    }
    seen.add(value);
    if (!known.has(value)) {
      addError(refCode, itemPath, `references unknown id ${value}`);
    }
    if (selfCode && value === selfId) {
      addError(selfCode, itemPath, "cannot reference itself");
    }
  }
}

function validateFeedback({ feedback, candidateIds, solutionItemIds, path, addError }) {
  if (!isRecord(feedback)) {
    addError("INVALID_FEEDBACK", path, "must be an object");
    return;
  }
  if (!isNonEmptyString(feedback.defaultWrongItem)) {
    addError(
      "MISSING_DEFAULT_FEEDBACK",
      `${path}.defaultWrongItem`,
      "must be a non-empty string",
    );
  }
  if (!isNonEmptyString(feedback.wrongSlot)) {
    addError(
      "INVALID_WRONG_SLOT_FEEDBACK",
      `${path}.wrongSlot`,
      "must be a non-empty string",
    );
  }
  if (!isRecord(feedback.byItemId)) {
    addError("INVALID_ITEM_FEEDBACK", `${path}.byItemId`, "must be an object");
    return;
  }

  const distractorIds = candidateIds.filter((itemId) => !solutionItemIds.has(itemId));
  const feedbackOwnerByText = new Map();
  for (const itemId of distractorIds) {
    if (!hasOwn(feedback.byItemId, itemId) || !isNonEmptyString(feedback.byItemId[itemId])) {
      addError(
        "MISSING_DISTRACTOR_FEEDBACK",
        `${path}.byItemId.${itemId}`,
        `must explain why distractor ${itemId} is incorrect`,
      );
      continue;
    }

    const normalizedText = feedback.byItemId[itemId].trim();
    if (feedbackOwnerByText.has(normalizedText)) {
      addError(
        "DUPLICATE_DISTRACTOR_FEEDBACK",
        `${path}.byItemId.${itemId}`,
        `must differ from feedback for ${feedbackOwnerByText.get(normalizedText)}`,
      );
    } else {
      feedbackOwnerByText.set(normalizedText, itemId);
    }
  }

  for (const itemId of Object.keys(feedback.byItemId)) {
    if (!candidateIds.includes(itemId)) {
      addError(
        "FEEDBACK_FOR_UNKNOWN_CANDIDATE",
        `${path}.byItemId.${itemId}`,
        "does not match a candidate item",
      );
    }
    if (solutionItemIds.has(itemId)) {
      addError(
        "FEEDBACK_FOR_SOLUTION_ITEM",
        `${path}.byItemId.${itemId}`,
        "must not label a solution item as incorrect",
      );
    }
  }
}

function validateHints(hints, path, addError) {
  if (!Array.isArray(hints) || hints.length !== 3) {
    addError("INVALID_HINTS", path, "must contain exactly three staged hints");
    return;
  }

  const types = new Set();
  const levels = new Set();
  const expectedSequence = [
    { level: 1, type: "OBSERVATION" },
    { level: 2, type: "CONCEPT" },
    { level: 3, type: "DIRECTION" },
  ];
  for (let index = 0; index < hints.length; index += 1) {
    const hint = hints[index];
    const hintPath = `${path}[${index}]`;
    if (!isRecord(hint)) {
      addError("INVALID_HINT", hintPath, "must be an object");
      continue;
    }
    const expected = expectedSequence[index];
    if (hint.level !== expected.level || hint.type !== expected.type) {
      addError(
        "INVALID_HINT_SEQUENCE",
        hintPath,
        `must be level ${expected.level} with type ${expected.type}`,
      );
    }
    if (!Number.isInteger(hint.level) || hint.level < 1 || hint.level > 3) {
      addError("INVALID_HINT_LEVEL", `${hintPath}.level`, "must be 1, 2, or 3");
    }
    levels.add(hint.level);
    if (!HINT_TYPES.has(hint.type)) {
      addError(
        "INVALID_HINT_TYPE",
        `${hintPath}.type`,
        "must be OBSERVATION, CONCEPT, or DIRECTION",
      );
    }
    types.add(hint.type);
    if (!isNonEmptyString(hint.text)) {
      addError("INVALID_HINT_TEXT", `${hintPath}.text`, "must be a non-empty string");
    }
  }

  for (const level of [1, 2, 3]) {
    if (!levels.has(level)) {
      addError("MISSING_HINT_LEVEL", path, `must include level ${level}`);
    }
  }
  for (const type of HINT_TYPES) {
    if (!types.has(type)) {
      addError("MISSING_HINT_TYPE", path, `must include ${type}`);
    }
  }
}

function validateExplanation(explanation, path, segmentById, addError) {
  if (!isRecord(explanation)) {
    addError("INVALID_EXPLANATION", path, "must be an object");
    return;
  }
  if (!isNonEmptyString(explanation.title)) {
    addError("INVALID_EXPLANATION_TITLE", `${path}.title`, "must be a non-empty string");
  }
  if (!isNonEmptyString(explanation.body)) {
    addError("INVALID_EXPLANATION_BODY", `${path}.body`, "must be a non-empty string");
  }
  if (
    !Array.isArray(explanation.evidenceSegmentIds) ||
    explanation.evidenceSegmentIds.length === 0 ||
    explanation.evidenceSegmentIds.some((id) => !isNonEmptyString(id))
  ) {
    addError(
      "INVALID_EVIDENCE",
      `${path}.evidenceSegmentIds`,
      "must contain at least one segment id",
    );
  } else {
    for (let index = 0; index < explanation.evidenceSegmentIds.length; index += 1) {
      const segmentId = explanation.evidenceSegmentIds[index];
      if (!segmentById.has(segmentId)) {
        addError(
          "UNKNOWN_SEGMENT_REF",
          `${path}.evidenceSegmentIds[${index}]`,
          `references unknown segment ${segmentId}`,
        );
      }
    }
  }
}

function detectDependencyCycles(graph, knownPuzzles, addError) {
  const state = new Map();

  const visit = (id, trail) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      addError(
        "CYCLIC_PUZZLE_DEPENDENCY",
        "$.puzzles",
        `dependency cycle detected: ${[...trail, id].join(" -> ")}`,
      );
      return;
    }

    state.set(id, "visiting");
    for (const dependencyId of graph.get(id) ?? []) {
      if (knownPuzzles.has(dependencyId)) visit(dependencyId, [...trail, id]);
    }
    state.set(id, "done");
  };

  for (const id of graph.keys()) visit(id, []);
}

function validateCompletion(pack, puzzles, puzzleById, itemById, addError) {
  if (!isRecord(pack.completion)) {
    addError("INVALID_COMPLETION", "$.completion", "must be an object");
    return;
  }

  const { finalPuzzleId, exitItemId, effect } = pack.completion;
  const finalPuzzle = puzzleById.get(finalPuzzleId);
  if (!finalPuzzle) {
    addError(
      "UNKNOWN_FINAL_PUZZLE",
      "$.completion.finalPuzzleId",
      `references unknown puzzle ${String(finalPuzzleId)}`,
    );
  }
  if (!itemById.has(exitItemId)) {
    addError(
      "UNKNOWN_EXIT_ITEM",
      "$.completion.exitItemId",
      `references unknown item ${String(exitItemId)}`,
    );
  }
  if (effect !== "UNLOCK_EXIT") {
    addError(
      "INVALID_COMPLETION_EFFECT",
      "$.completion.effect",
      "must be UNLOCK_EXIT",
    );
  }
  if (!finalPuzzle) return;

  if (finalPuzzle.template !== "FINAL_SAFE") {
    addError(
      "FINAL_PUZZLE_NOT_SAFE",
      `$.puzzles[${puzzles.indexOf(finalPuzzle)}].template`,
      "the final puzzle must use FINAL_SAFE",
    );
  }
  const highestOrder = Math.max(...puzzles.map((puzzle) => puzzle?.order ?? 0));
  if (finalPuzzle.order !== highestOrder || finalPuzzle.order !== puzzles.length) {
    addError(
      "FINAL_PUZZLE_NOT_LAST",
      "$.completion.finalPuzzleId",
      "must reference the last ordered puzzle",
    );
  }

  const precedingPuzzles = puzzles.filter(
    (puzzle) => isRecord(puzzle) && puzzle.id !== finalPuzzleId,
  );
  const requiredPuzzleIds = Array.isArray(finalPuzzle.requiresPuzzleIds)
    ? finalPuzzle.requiresPuzzleIds
    : [];
  for (const puzzle of precedingPuzzles) {
    if (!requiredPuzzleIds.includes(puzzle.id)) {
      addError(
        "FINAL_SAFE_MISSING_REQUIREMENT",
        `$.puzzles[${puzzles.indexOf(finalPuzzle)}].requiresPuzzleIds`,
        `must require preceding puzzle ${puzzle.id}`,
      );
    }
  }

  const finalPlacements = Array.isArray(finalPuzzle.solution)
    ? finalPuzzle.solution
    : [];
  const finalItemIds = new Set(
    finalPlacements.map((placement) => placement?.itemId),
  );
  const safeRewardIds = new Set();
  for (const puzzle of precedingPuzzles) {
    const qualifyingRewards = (Array.isArray(puzzle.rewards) ? puzzle.rewards : []).filter(
      (reward) => reward?.type === "REVEAL_ITEM" && finalItemIds.has(reward.itemId),
    );
    if (qualifyingRewards.length !== 1) {
      addError(
        "INVALID_SAFE_TOKEN_REWARD",
        `$.puzzles[${puzzles.indexOf(puzzle)}].rewards`,
        `must reveal exactly one item used by final safe ${finalPuzzleId}`,
      );
    } else {
      safeRewardIds.add(qualifyingRewards[0].itemId);
    }
  }

  if (
    finalItemIds.size !== precedingPuzzles.length ||
    safeRewardIds.size !== precedingPuzzles.length ||
    [...finalItemIds].some((itemId) => !safeRewardIds.has(itemId))
  ) {
    addError(
      "FINAL_SAFE_TOKEN_MISMATCH",
      `$.puzzles[${puzzles.indexOf(finalPuzzle)}].solution`,
      "must use exactly one unique reward token from every preceding puzzle",
    );
  }

  const revealsExitItem = (Array.isArray(finalPuzzle.rewards) ? finalPuzzle.rewards : []).some(
    (reward) => reward?.type === "REVEAL_ITEM" && reward.itemId === exitItemId,
  );
  if (!revealsExitItem) {
    addError(
      "FINAL_SAFE_MISSING_EXIT_REWARD",
      `$.puzzles[${puzzles.indexOf(finalPuzzle)}].rewards`,
      `must reveal completion exit item ${String(exitItemId)}`,
    );
  }
}
