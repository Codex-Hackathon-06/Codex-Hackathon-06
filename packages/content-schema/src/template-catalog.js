export const PUZZLE_KINDS = Object.freeze({
  ITEM_PLACEMENT: "ITEM_PLACEMENT",
  KEYPAD: "KEYPAD",
  DIAL_LOCK: "DIAL_LOCK",
  TOGGLE_PANEL: "TOGGLE_PANEL",
});

const defineTemplate = (definition) =>
  Object.freeze({
    ...definition,
    learningUses: Object.freeze([...definition.learningUses]),
  });

/**
 * The executable puzzle templates supported by the demo. `capabilityKey`
 * describes the IDs a room target must expose before a generator can select
 * that template.
 */
export const PUZZLE_TEMPLATE_CATALOG = Object.freeze({
  MISSING_TOKEN: defineTemplate({
    id: "MISSING_TOKEN",
    kind: PUZZLE_KINDS.ITEM_PLACEMENT,
    capabilityKey: "slotIds",
    learningUses: ["TERM_RECALL", "MISSING_CONCEPT"],
  }),
  ORDER_ITEMS: defineTemplate({
    id: "ORDER_ITEMS",
    kind: PUZZLE_KINDS.ITEM_PLACEMENT,
    capabilityKey: "slotIds",
    learningUses: ["SEQUENCE", "PROCESS"],
  }),
  KEY_TO_LOCK: defineTemplate({
    id: "KEY_TO_LOCK",
    kind: PUZZLE_KINDS.ITEM_PLACEMENT,
    capabilityKey: "slotIds",
    learningUses: ["CASE_APPLICATION", "CAUSE_EFFECT"],
  }),
  MATCH_ITEM: defineTemplate({
    id: "MATCH_ITEM",
    kind: PUZZLE_KINDS.ITEM_PLACEMENT,
    capabilityKey: "slotIds",
    learningUses: ["MATCHING", "MISCONCEPTION"],
  }),
  FINAL_SAFE: defineTemplate({
    id: "FINAL_SAFE",
    kind: PUZZLE_KINDS.ITEM_PLACEMENT,
    capabilityKey: "slotIds",
    learningUses: ["SYNTHESIS"],
  }),
  NUMERIC_KEYPAD: defineTemplate({
    id: "NUMERIC_KEYPAD",
    kind: PUZZLE_KINDS.KEYPAD,
    capabilityKey: "controlIds",
    learningUses: ["CALCULATION", "NUMERIC_ANSWER"],
  }),
  SYMBOL_KEYPAD: defineTemplate({
    id: "SYMBOL_KEYPAD",
    kind: PUZZLE_KINDS.KEYPAD,
    capabilityKey: "controlIds",
    learningUses: ["FORMULA", "SYMBOLIC_ANSWER"],
  }),
  MULTI_DIAL: defineTemplate({
    id: "MULTI_DIAL",
    kind: PUZZLE_KINDS.DIAL_LOCK,
    capabilityKey: "controlIds",
    learningUses: ["ORDERED_CLASSIFICATION", "MULTI_PART_ANSWER"],
  }),
  SWITCH_BANK: defineTemplate({
    id: "SWITCH_BANK",
    kind: PUZZLE_KINDS.TOGGLE_PANEL,
    capabilityKey: "controlIds",
    learningUses: ["MULTI_SELECT", "TRUE_FALSE_SET"],
  }),
});

export const PUZZLE_TEMPLATE_IDS = Object.freeze(
  Object.keys(PUZZLE_TEMPLATE_CATALOG),
);

// Concise aliases for consumers that do not need the package-specific prefix.
export const TEMPLATE_CATALOG = PUZZLE_TEMPLATE_CATALOG;
export const TEMPLATE_IDS = PUZZLE_TEMPLATE_IDS;

export const ITEM_PLACEMENT_TEMPLATES = Object.freeze(
  PUZZLE_TEMPLATE_IDS.filter(
    (template) =>
      PUZZLE_TEMPLATE_CATALOG[template].kind === PUZZLE_KINDS.ITEM_PLACEMENT,
  ),
);

export const CONTROL_TEMPLATES = Object.freeze(
  PUZZLE_TEMPLATE_IDS.filter(
    (template) =>
      PUZZLE_TEMPLATE_CATALOG[template].kind !== PUZZLE_KINDS.ITEM_PLACEMENT,
  ),
);

export function getPuzzleTemplate(template) {
  return PUZZLE_TEMPLATE_CATALOG[template] ?? null;
}

/**
 * Recommends a template ID from lightweight lecture-analysis metadata.
 * Callers may restrict the decision to the templates their room exposes.
 *
 * @param {object} analysis
 * @param {string[]} [availableTemplates]
 * @returns {string|null}
 */
export function recommendPuzzleTemplate(
  analysis = {},
  availableTemplates = PUZZLE_TEMPLATE_IDS,
) {
  const available = new Set(
    Array.isArray(availableTemplates)
      ? availableTemplates
          .map((entry) =>
            typeof entry === "string" ? entry : entry?.template,
          )
          .filter((id) => PUZZLE_TEMPLATE_CATALOG[id])
      : [],
  );
  if (available.size === 0) return null;
  if (analysis.isFinal) {
    return available.has("FINAL_SAFE") ? "FINAL_SAFE" : null;
  }

  const normalized = [
    analysis.answerType,
    analysis.taskType,
    analysis.learningUse,
    analysis.responseType,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toUpperCase();

  const ranked = [
        ...(/FORMULA|SYMBOL|SYMBOLIC|EQUATION_EXPRESSION|기호|공식/.test(normalized)
          ? ["SYMBOL_KEYPAD"]
          : []),
        ...(/NUMBER|NUMERIC|CALCULATION|ARITHMETIC|MATH|EQUATION|숫자|계산|수식/.test(normalized)
          ? ["NUMERIC_KEYPAD"]
          : []),
        ...(analysis.selectionMode === "multiple" ||
        /MULTI[_ -]?SELECT|TRUE[_ -]?FALSE|PROPERTY_SET|복수|다중/.test(normalized)
          ? ["SWITCH_BANK"]
          : []),
        ...(analysis.useDials ||
        /ORDERED[_ -]?CLASSIFICATION|MULTI[_ -]?PART|DIAL|다이얼/.test(normalized)
          ? ["MULTI_DIAL"]
          : []),
        ...(analysis.requiresOrdering || /SEQUENCE|PROCESS|ORDER|순서|과정/.test(normalized)
          ? [analysis.useDials ? "MULTI_DIAL" : "ORDER_ITEMS"]
          : []),
        ...(/TERM|MISSING|RECALL|용어|빈칸/.test(normalized) ? ["MISSING_TOKEN"] : []),
        ...(/CASE|CAUSE_EFFECT|KEY/.test(normalized) ? ["KEY_TO_LOCK"] : []),
        ...(/MATCH|MISCONCEPTION|CLASSIFICATION/.test(normalized)
          ? ["MATCH_ITEM"]
          : []),
        "MATCH_ITEM",
        "MISSING_TOKEN",
        "NUMERIC_KEYPAD",
        "MULTI_DIAL",
        "SWITCH_BANK",
      ];

  return ranked.find((template) => available.has(template)) ?? [...available][0];
}

export const recommendTemplate = recommendPuzzleTemplate;
