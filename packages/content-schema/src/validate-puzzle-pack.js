import { getPuzzleTemplate, PUZZLE_KINDS } from "./template-catalog.js";

const HINT_TYPES = new Set(["OBSERVATION", "CONCEPT", "DIRECTION"]);
const PUZZLE_KIND_VALUES = new Set(Object.values(PUZZLE_KINDS));

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
    if (hasOwn(view, "unlock")) {
      if (!isRecord(view.unlock)) {
        addError(
          "INVALID_VIEW_UNLOCK",
          `${viewPath}.unlock`,
          "must be an object",
        );
      } else {
        requireString(view.unlock.itemId, `${viewPath}.unlock.itemId`);
        requireString(
          view.unlock.lockedMessage,
          `${viewPath}.unlock.lockedMessage`,
        );
        requireString(
          view.unlock.unlockedMessage,
          `${viewPath}.unlock.unlockedMessage`,
        );
      }
    }
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
    if (!PUZZLE_KIND_VALUES.has(interaction)) {
      addError(
        "UNSUPPORTED_INTERACTION",
        interactionPath,
        `must be one of ${[...PUZZLE_KIND_VALUES].join(", ")}`,
      );
    }
    const templateDefinition = getPuzzleTemplate(puzzle.template);
    if (!templateDefinition && isNonEmptyString(puzzle.template)) {
      addError(
        "UNSUPPORTED_TEMPLATE",
        `${path}.template`,
        `unknown puzzle template ${puzzle.template}`,
      );
    } else if (
      templateDefinition &&
      PUZZLE_KIND_VALUES.has(interaction) &&
      templateDefinition.kind !== interaction
    ) {
      addError(
        "TEMPLATE_KIND_MISMATCH",
        `${path}.template`,
        `${puzzle.template} requires kind ${templateDefinition.kind}`,
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

    if (interaction === PUZZLE_KINDS.ITEM_PLACEMENT) {
      validateItemPlacementPuzzle({
        puzzle,
        path,
        itemById,
        puzzleById,
        addError,
      });
    } else if (interaction === PUZZLE_KINDS.KEYPAD) {
      validateKeypadPuzzle(puzzle, path, addError);
    } else if (interaction === PUZZLE_KINDS.DIAL_LOCK) {
      validateDialLockPuzzle(puzzle, path, addError);
    } else if (interaction === PUZZLE_KINDS.TOGGLE_PANEL) {
      validateTogglePanelPuzzle(puzzle, path, addError);
    }
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
  validateViewUnlocks({
    views: Array.isArray(room.views) ? room.views : [],
    items,
    puzzles,
    itemById,
    puzzleById,
    addError,
  });
  validateCompletion(pack, puzzles, puzzleById, itemById, addError);

  return { valid: errors.length === 0, errors };
}

function validateItemPlacementPuzzle({
  puzzle,
  path,
  itemById,
  puzzleById,
  addError,
}) {
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
    addError("INVALID_SOLUTION", solutionPath, "must be a non-empty array");
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

  validateItemFeedback({
    feedback: puzzle.feedback,
    candidateIds,
    solutionItemIds,
    path: `${path}.feedback`,
    addError,
  });
}

function validateKeypadPuzzle(puzzle, path, addError) {
  const controlPath = `${path}.control`;
  const solutionPath = `${path}.solution`;
  const control = puzzle.control;
  if (!isRecord(control)) {
    addError("INVALID_CONTROL", controlPath, "must be an object");
  }
  const keys = Array.isArray(control?.keys) ? control.keys : [];
  validateUniqueStringArray(keys, `${controlPath}.keys`, "key", addError, {
    requireNonEmpty: true,
  });
  if (!Array.isArray(control?.keys) || keys.length === 0) {
    addError(
      "INVALID_KEYPAD_KEYS",
      `${controlPath}.keys`,
      "must be a non-empty array of unique keys",
    );
  }
  if (!Number.isInteger(control?.maxLength) || control.maxLength < 1) {
    addError(
      "INVALID_KEYPAD_MAX_LENGTH",
      `${controlPath}.maxLength`,
      "must be a positive integer",
    );
  }

  const value = puzzle.solution?.value;
  if (!isRecord(puzzle.solution) || !isNonEmptyString(value)) {
    addError(
      "INVALID_KEYPAD_SOLUTION",
      `${solutionPath}.value`,
      "must be a non-empty string",
    );
  } else if (
    Number.isInteger(control?.maxLength) &&
    !canComposeWithKeys(value, keys, control.maxLength)
  ) {
    addError(
      "UNENTERABLE_KEYPAD_SOLUTION",
      `${solutionPath}.value`,
      "must be enterable with the provided keys within maxLength presses",
    );
  }

  validateControlFeedback({
    feedback: puzzle.feedback,
    path: `${path}.feedback`,
    answer: isNonEmptyString(value) ? value : null,
    addError,
  });
}

function validateDialLockPuzzle(puzzle, path, addError) {
  const controlPath = `${path}.control`;
  const control = puzzle.control;
  if (!isRecord(control)) {
    addError("INVALID_CONTROL", controlPath, "must be an object");
  }
  const dials = Array.isArray(control?.dials) ? control.dials : [];
  if (!Array.isArray(control?.dials) || dials.length === 0) {
    addError(
      "INVALID_DIALS",
      `${controlPath}.dials`,
      "must be a non-empty array",
    );
  }
  const dialById = collectUniqueRecords(
    dials,
    `${controlPath}.dials`,
    "control",
    addError,
  );
  for (let index = 0; index < dials.length; index += 1) {
    const dial = dials[index];
    const dialPath = `${controlPath}.dials[${index}]`;
    if (!isRecord(dial)) continue;
    if (!isNonEmptyString(dial.label)) {
      addError("INVALID_CONTROL_LABEL", `${dialPath}.label`, "must be a non-empty string");
    }
    if (!Array.isArray(dial.options) || dial.options.length === 0) {
      addError(
        "INVALID_DIAL_OPTIONS",
        `${dialPath}.options`,
        "must be a non-empty array of unique options",
      );
    } else {
      validateUniqueStringArray(
        dial.options,
        `${dialPath}.options`,
        "option",
        addError,
        { requireNonEmpty: true },
      );
    }
  }

  const valuesByControlId = puzzle.solution?.valuesByControlId;
  if (!isRecord(puzzle.solution) || !isRecord(valuesByControlId)) {
    addError(
      "INVALID_DIAL_SOLUTION",
      `${path}.solution.valuesByControlId`,
      "must be an object keyed by dial id",
    );
  } else {
    for (const [dialId, dial] of dialById) {
      if (!hasOwn(valuesByControlId, dialId)) {
        addError(
          "MISSING_CONTROL_SOLUTION",
          `${path}.solution.valuesByControlId.${dialId}`,
          `must provide a solution for dial ${dialId}`,
        );
      } else if (!dial.options?.includes(valuesByControlId[dialId])) {
        addError(
          "INVALID_CONTROL_SOLUTION",
          `${path}.solution.valuesByControlId.${dialId}`,
          `must be one of the options for dial ${dialId}`,
        );
      }
    }
    for (const dialId of Object.keys(valuesByControlId)) {
      if (!dialById.has(dialId)) {
        addError(
          "UNKNOWN_CONTROL_REF",
          `${path}.solution.valuesByControlId.${dialId}`,
          "does not match a dial id",
        );
      }
    }
  }

  validateControlFeedback({
    feedback: puzzle.feedback,
    path: `${path}.feedback`,
    controlIds: new Set(dialById.keys()),
    addError,
  });
}

function validateTogglePanelPuzzle(puzzle, path, addError) {
  const controlPath = `${path}.control`;
  const control = puzzle.control;
  if (!isRecord(control)) {
    addError("INVALID_CONTROL", controlPath, "must be an object");
  }
  const switches = Array.isArray(control?.switches) ? control.switches : [];
  if (!Array.isArray(control?.switches) || switches.length === 0) {
    addError(
      "INVALID_SWITCHES",
      `${controlPath}.switches`,
      "must be a non-empty array",
    );
  }
  const switchById = collectUniqueRecords(
    switches,
    `${controlPath}.switches`,
    "control",
    addError,
  );
  for (let index = 0; index < switches.length; index += 1) {
    const control = switches[index];
    const switchPath = `${controlPath}.switches[${index}]`;
    if (!isRecord(control)) continue;
    if (!isNonEmptyString(control.label)) {
      addError("INVALID_CONTROL_LABEL", `${switchPath}.label`, "must be a non-empty string");
    }
    if (hasOwn(control, "description") && !isNonEmptyString(control.description)) {
      addError(
        "INVALID_CONTROL_DESCRIPTION",
        `${switchPath}.description`,
        "must be a non-empty string when provided",
      );
    }
  }

  const selectedControlIds = Array.isArray(puzzle.solution?.selectedControlIds)
    ? puzzle.solution.selectedControlIds
    : [];
  if (
    !isRecord(puzzle.solution) ||
    !Array.isArray(puzzle.solution.selectedControlIds) ||
    selectedControlIds.length === 0
  ) {
    addError(
      "INVALID_TOGGLE_SOLUTION",
      `${path}.solution.selectedControlIds`,
      "must be a non-empty array",
    );
  }
  validateReferenceList({
    values: selectedControlIds,
    path: `${path}.solution.selectedControlIds`,
    known: switchById,
    refCode: "UNKNOWN_CONTROL_REF",
    addError,
  });

  const solutionControlIds = new Set(selectedControlIds);
  validateControlFeedback({
    feedback: puzzle.feedback,
    path: `${path}.feedback`,
    controlIds: new Set(switchById.keys()),
    solutionControlIds,
    requireDistractorControlFeedback: true,
    addError,
  });
}

function validateUniqueStringArray(
  values,
  path,
  label,
  addError,
  { requireNonEmpty = false } = {},
) {
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const valuePath = `${path}[${index}]`;
    if (typeof value !== "string" || (requireNonEmpty && value.length === 0)) {
      addError("INVALID_CONTROL_VALUE", valuePath, `must be a valid ${label} string`);
      continue;
    }
    if (seen.has(value)) {
      addError("DUPLICATE_CONTROL_VALUE", valuePath, `duplicates ${label} ${value}`);
    }
    seen.add(value);
  }
}

function canComposeWithKeys(value, keys, maxPresses) {
  if (!isNonEmptyString(value) || keys.length === 0) return false;
  const fewestPresses = Array(value.length + 1).fill(Number.POSITIVE_INFINITY);
  fewestPresses[0] = 0;
  for (let start = 0; start < value.length; start += 1) {
    if (!Number.isFinite(fewestPresses[start])) continue;
    for (const key of keys) {
      if (
        typeof key === "string" &&
        key.length > 0 &&
        value.startsWith(key, start)
      ) {
        const end = start + key.length;
        fewestPresses[end] = Math.min(
          fewestPresses[end],
          fewestPresses[start] + 1,
        );
      }
    }
  }
  return fewestPresses[value.length] <= maxPresses;
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

function validateItemFeedback({ feedback, candidateIds, solutionItemIds, path, addError }) {
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

function validateControlFeedback({
  feedback,
  path,
  answer = null,
  controlIds = new Set(),
  solutionControlIds = new Set(),
  requireDistractorControlFeedback = false,
  addError,
}) {
  if (!isRecord(feedback)) {
    addError("INVALID_FEEDBACK", path, "must be an object");
    return;
  }
  if (!isNonEmptyString(feedback.defaultWrongAnswer)) {
    addError(
      "MISSING_DEFAULT_FEEDBACK",
      `${path}.defaultWrongAnswer`,
      "must be a non-empty string",
    );
  }

  for (const property of ["byAnswer", "byControlId"]) {
    if (hasOwn(feedback, property) && !isRecord(feedback[property])) {
      addError(
        "INVALID_CONTROL_FEEDBACK",
        `${path}.${property}`,
        "must be an object when provided",
      );
      continue;
    }
    if (!isRecord(feedback[property])) continue;
    for (const [key, text] of Object.entries(feedback[property])) {
      if (!isNonEmptyString(text)) {
        addError(
          "INVALID_CONTROL_FEEDBACK",
          `${path}.${property}.${key}`,
          "must be a non-empty string",
        );
      }
    }
  }

  if (isRecord(feedback.byAnswer) && answer !== null && hasOwn(feedback.byAnswer, answer)) {
    addError(
      "FEEDBACK_FOR_SOLUTION_ANSWER",
      `${path}.byAnswer.${answer}`,
      "must not label the solution answer as incorrect",
    );
  }

  const byControlId = isRecord(feedback.byControlId)
    ? feedback.byControlId
    : {};
  for (const controlId of Object.keys(byControlId)) {
    if (!controlIds.has(controlId)) {
      addError(
        "FEEDBACK_FOR_UNKNOWN_CONTROL",
        `${path}.byControlId.${controlId}`,
        "does not match a control id",
      );
    }
    if (solutionControlIds.has(controlId)) {
      addError(
        "FEEDBACK_FOR_SOLUTION_CONTROL",
        `${path}.byControlId.${controlId}`,
        "must not label a selected solution control as incorrect",
      );
    }
  }

  if (!requireDistractorControlFeedback) return;

  const feedbackOwnerByText = new Map();
  for (const controlId of controlIds) {
    if (solutionControlIds.has(controlId)) continue;
    if (!hasOwn(byControlId, controlId) || !isNonEmptyString(byControlId[controlId])) {
      addError(
        "MISSING_DISTRACTOR_FEEDBACK",
        `${path}.byControlId.${controlId}`,
        `must explain why switch ${controlId} is not part of the solution`,
      );
      continue;
    }
    const normalizedText = byControlId[controlId].trim();
    if (feedbackOwnerByText.has(normalizedText)) {
      addError(
        "DUPLICATE_DISTRACTOR_FEEDBACK",
        `${path}.byControlId.${controlId}`,
        `must differ from feedback for ${feedbackOwnerByText.get(normalizedText)}`,
      );
    } else {
      feedbackOwnerByText.set(normalizedText, controlId);
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

function validateViewUnlocks({
  views,
  items,
  puzzles,
  itemById,
  puzzleById,
  addError,
}) {
  for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
    const view = views[viewIndex];
    if (!isRecord(view) || !hasOwn(view, "unlock") || !isRecord(view.unlock)) {
      continue;
    }

    const unlockPath = `$.room.views[${viewIndex}].unlock`;
    const unlockItemId = view.unlock.itemId;
    if (!isNonEmptyString(unlockItemId)) continue;

    const unlockItem = itemById.get(unlockItemId);
    if (!unlockItem) {
      addError(
        "UNKNOWN_UNLOCK_ITEM",
        `${unlockPath}.itemId`,
        `references unknown item ${unlockItemId}`,
      );
      continue;
    }

    const sourcePuzzleId = unlockItem.source?.puzzleId;
    const sourcePuzzle = puzzleById.get(sourcePuzzleId);
    const isDeclaredReward =
      unlockItem.source?.type === "PUZZLE_REWARD" &&
      sourcePuzzle &&
      Array.isArray(sourcePuzzle.rewards) &&
      sourcePuzzle.rewards.some(
        (reward) =>
          reward?.type === "REVEAL_ITEM" && reward.itemId === unlockItemId,
      );
    if (!isDeclaredReward) {
      addError(
        "INVALID_VIEW_UNLOCK_REWARD",
        `${unlockPath}.itemId`,
        `item ${unlockItemId} must be a PUZZLE_REWARD revealed by a puzzle`,
      );
      continue;
    }

    const unlockItemIndex = items.indexOf(unlockItem);
    const unlockItemPath = `$.items[${unlockItemIndex}]`;
    if (unlockItem.source.viewId !== sourcePuzzle.viewId) {
      addError(
        "VIEW_UNLOCK_SOURCE_VIEW_MISMATCH",
        `${unlockItemPath}.source.viewId`,
        `must match source puzzle ${sourcePuzzle.id} viewId ${String(sourcePuzzle.viewId)} so ${unlockItemId} can be collected before unlocking ${String(view.id)}`,
      );
    }
    if (unlockItem.consumedOnUse !== true) {
      addError(
        "VIEW_UNLOCK_ITEM_NOT_CONSUMABLE",
        `${unlockItemPath}.consumedOnUse`,
        `must be true so view unlock item ${unlockItemId} is consumed after use`,
      );
    }

    const firstPuzzleInView = puzzles
      .filter(
        (puzzle) =>
          isRecord(puzzle) &&
          puzzle.viewId === view.id &&
          Number.isInteger(puzzle.order),
      )
      .sort((left, right) => left.order - right.order)[0];
    if (!firstPuzzleInView) {
      addError(
        "VIEW_UNLOCK_WITHOUT_PUZZLE",
        unlockPath,
        `view ${String(view.id)} has no puzzle to unlock`,
      );
      continue;
    }

    if (sourcePuzzle.order !== firstPuzzleInView.order - 1) {
      addError(
        "VIEW_UNLOCK_NOT_PREVIOUS_REWARD",
        `${unlockPath}.itemId`,
        `item ${unlockItemId} must be revealed by the puzzle immediately before ${firstPuzzleInView.id}`,
      );
    }
  }
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

  const finalPuzzlePath = `$.puzzles[${puzzles.indexOf(finalPuzzle)}]`;
  const finalCandidateIds = Array.isArray(finalPuzzle.candidateItemIds)
    ? finalPuzzle.candidateItemIds
    : [];
  const finalPlacements = Array.isArray(finalPuzzle.solution)
    ? finalPuzzle.solution
    : [];
  const finalSolutionIds = new Set(
    finalPlacements.map((placement) => placement?.itemId),
  );

  if (finalCandidateIds.length < 2) {
    addError(
      "FINAL_SAFE_TOO_FEW_ITEMS",
      `${finalPuzzlePath}.candidateItemIds`,
      "must contain at least two physical assembly items",
    );
  }

  const requiredRewardIds = new Set();
  for (const requiredPuzzleId of requiredPuzzleIds) {
    const requiredPuzzle = puzzleById.get(requiredPuzzleId);
    if (!requiredPuzzle || requiredPuzzle.id === finalPuzzleId) continue;
    for (const reward of Array.isArray(requiredPuzzle.rewards)
      ? requiredPuzzle.rewards
      : []) {
      if (reward?.type === "REVEAL_ITEM") {
        requiredRewardIds.add(reward.itemId);
      }
    }
  }

  for (let candidateIndex = 0; candidateIndex < finalCandidateIds.length; candidateIndex += 1) {
    const itemId = finalCandidateIds[candidateIndex];
    if (!requiredRewardIds.has(itemId)) {
      addError(
        "INVALID_SAFE_TOKEN_REWARD",
        `${finalPuzzlePath}.candidateItemIds[${candidateIndex}]`,
        `item ${String(itemId)} must be revealed by a required preceding puzzle`,
      );
    }
  }

  if (
    finalCandidateIds.length !== finalSolutionIds.size ||
    finalCandidateIds.some((itemId) => !finalSolutionIds.has(itemId)) ||
    [...finalSolutionIds].some((itemId) => !finalCandidateIds.includes(itemId))
  ) {
    addError(
      "FINAL_SAFE_TOKEN_MISMATCH",
      `${finalPuzzlePath}.solution`,
      "candidateItemIds and solution itemIds must match exactly",
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
