import type { NormalizedFieldObservation } from "./field-provenance.ts";

const HEBREW_TEEN_AGES: Record<string, number> = {
  "אחת עשרה": 11,
  "אחד עשר": 11,
  "שתים עשרה": 12,
  "שנים עשר": 12,
  "שלוש עשרה": 13,
  "שלושה עשר": 13,
  "ארבע עשרה": 14,
  "ארבעה עשר": 14,
  "חמש עשרה": 15,
  "חמישה עשר": 15,
  "שש עשרה": 16,
  "שישה עשר": 16,
  "שבע עשרה": 17,
  "שבעה עשר": 17,
  "שמונה עשרה": 18,
  "שמונה עשר": 18,
  "תשע עשרה": 19,
  "תשעה עשר": 19,
};

// Hebrew cardinal words used for ages. Both the feminine forms (used with "בת")
// and the masculine forms (used with "בן") are accepted for every value.
const HEBREW_ONES: Record<string, number> = {
  "אחת": 1, "אחד": 1,
  "שתיים": 2, "שתים": 2, "שניים": 2, "שנים": 2, "שתי": 2, "שני": 2,
  "שלוש": 3, "שלושה": 3,
  "ארבע": 4, "ארבעה": 4,
  "חמש": 5, "חמישה": 5,
  "שש": 6, "שישה": 6, "ששה": 6,
  "שבע": 7, "שבעה": 7,
  "שמונה": 8,
  "תשע": 9, "תשעה": 9,
  "עשר": 10, "עשרה": 10,
};

const HEBREW_TENS: Record<string, number> = {
  "עשרים": 20,
  "שלושים": 30,
  "ארבעים": 40,
  "חמישים": 50,
  "שישים": 60, "ששים": 60,
  "שבעים": 70,
  "שמונים": 80,
  "תשעים": 90,
};

// The trailing word of a Hebrew teen ("שבע עשרה" = 17, "שמונה עשר" = 18).
const HEBREW_TEEN_SUFFIX = new Set(["עשרה", "עשר"]);

/**
 * Parses an unambiguous Hebrew age phrase (already stripped of a leading
 * "בת"/"בן") into a number. Returns null unless every token is a known cardinal
 * word forming one of: a single ones word (1-10), a single tens word, a teen
 * ("<ones> עשרה/עשר"), or a tens+ones combination in either order
 * ("עשרים וחמש" or "חמש ועשרים"). Any unknown token fails the whole phrase, so
 * descriptive prose can never become an age.
 */
function parseHebrewAgeWords(core: string): number | null {
  const exactTeen = HEBREW_TEEN_AGES[core];
  if (exactTeen !== undefined) return exactTeen;

  const words = core
    .split(" ")
    .map((word) => (word.startsWith("ו") ? word.slice(1) : word)) // drop leading vav ("וחמש" -> "חמש")
    .filter((word) => word.length > 0);
  if (words.length === 0 || words.length > 2) return null;

  if (words.length === 1) {
    const ones = HEBREW_ONES[words[0]];
    if (ones !== undefined) return ones;
    const tens = HEBREW_TENS[words[0]];
    return tens ?? null;
  }

  const [first, second] = words;

  // Teen: "<ones 1-9> עשרה/עשר"
  if (HEBREW_TEEN_SUFFIX.has(second)) {
    const ones = HEBREW_ONES[first];
    if (ones !== undefined && ones >= 1 && ones <= 9) return 10 + ones;
    return null;
  }

  // Tens + ones: "עשרים וחמש"
  if (HEBREW_TENS[first] !== undefined && HEBREW_ONES[second] !== undefined) {
    const ones = HEBREW_ONES[second];
    if (ones >= 1 && ones <= 9) return HEBREW_TENS[first] + ones;
    return null;
  }

  // Ones + tens: "חמש ועשרים"
  if (HEBREW_ONES[first] !== undefined && HEBREW_TENS[second] !== undefined) {
    const ones = HEBREW_ONES[first];
    if (ones >= 1 && ones <= 9) return HEBREW_TENS[second] + ones;
    return null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAgeText(value: string): string {
  return value
    .normalize("NFKC")
    // Strip Hebrew combining points/accents before any lexical parsing.
    // Deliberately excludes punctuation such as U+05BE maqaf, which the
    // dash-normalization step below turns into a word separator.
    .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, "")
    .trim()
    .replace(/[\u05BE\u2010-\u2015\u2212\u002D]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Converts only unambiguous age values to the canonical ASCII representation.
 * Deliberately does not parse arbitrary Hebrew prose, so descriptions cannot
 * become persisted age values by accident.
 */
export function normalizeCharacterAge(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 130 ? String(value) : null;
  }
  if (typeof value !== "string") return null;

  const normalized = normalizeAgeText(value);
  if (!normalized) return null;

  const wrapped = normalized.match(/^(?:בת|בן) (.+)$/);
  const core = wrapped ? wrapped[1] : normalized;

  if (/^[0-9]+$/.test(core)) {
    const numericAge = Number(core);
    return Number.isInteger(numericAge) && numericAge >= 0 && numericAge <= 130
      ? String(numericAge)
      : null;
  }

  const hebrewAge = parseHebrewAgeWords(core);
  if (hebrewAge === null) return null;
  return Number.isInteger(hebrewAge) && hebrewAge >= 0 && hebrewAge <= 130
    ? String(hebrewAge)
    : null;
}

function ageObservationSortKey(
  observation: { value?: unknown; inferred?: unknown; confidence?: unknown },
  index: number,
): [number, number, number, number] {
  const normalizedAge = normalizeCharacterAge(observation.value);
  const confidence = typeof observation.confidence === "number" && Number.isFinite(observation.confidence)
    ? observation.confidence
    : -1;
  return [
    normalizedAge === null ? 1 : 0,
    observation.inferred === true ? 1 : 0,
    -confidence,
    index,
  ];
}

/** Normalizes raw C age observations while retaining their evidence objects. */
export function normalizeCharacterAgeObservationMap(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = { ...value };
  const rawAgeObservations = value.age;
  if (rawAgeObservations === undefined) return result;

  const observations = Array.isArray(rawAgeObservations) ? rawAgeObservations : [rawAgeObservations];
  const normalized = observations.map((observation) => {
    if (!isRecord(observation) || !("value" in observation)) return observation;
    return {
      ...observation,
      // Null keeps the original evidence available to provenance while making
      // the rejected compound value impossible to sync as a canonical value.
      value: normalizeCharacterAge(observation.value),
    };
  });

  result.age = normalized
    .map((observation, index) => ({ observation, index }))
    .sort((left, right) => {
      const leftRecord = isRecord(left.observation) ? left.observation : {};
      const rightRecord = isRecord(right.observation) ? right.observation : {};
      const leftKey = ageObservationSortKey(leftRecord, left.index);
      const rightKey = ageObservationSortKey(rightRecord, right.index);
      for (let i = 0; i < leftKey.length; i++) {
        if (leftKey[i] !== rightKey[i]) return leftKey[i] - rightKey[i];
      }
      return 0;
    })
    .map(({ observation }) => observation);

  return result;
}

/**
 * Keeps C attributes and nested character_fields aligned with the canonical
 * age format. Existing evidence is not copied into description or field value.
 */
export function normalizeSubBaseCCharacterAttributes(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = { ...(input || {}) };
  const observations = normalizeCharacterAgeObservationMap(attributes.character_field_observations);
  const primaryObservation = Array.isArray(observations.age)
    ? observations.age.find((observation) => isRecord(observation) && normalizeCharacterAge(observation.value) !== null)
    : undefined;
  const primaryAge = isRecord(primaryObservation) ? normalizeCharacterAge(primaryObservation.value) : null;

  const directAge = attributes.age === undefined ? null : normalizeCharacterAge(attributes.age);
  if (attributes.age !== undefined) {
    if (directAge === null) delete attributes.age;
    else attributes.age = directAge;
  }

  if (isRecord(attributes.character_fields)) {
    const characterFields = { ...attributes.character_fields };
    const nestedAge = characterFields.age === undefined ? null : normalizeCharacterAge(characterFields.age);
    if (characterFields.age !== undefined) {
      if (nestedAge === null) delete characterFields.age;
      else characterFields.age = nestedAge;
    }
    if (characterFields.age === undefined) {
      const fallbackAge = directAge ?? primaryAge;
      if (fallbackAge !== null) characterFields.age = fallbackAge;
    }
    attributes.character_fields = characterFields;
  } else if (attributes.age === undefined && primaryAge !== null) {
    attributes.age = primaryAge;
  }

  if (isRecord(attributes.character_field_observations)) {
    attributes.character_field_observations = observations;
  }
  return attributes;
}

/** Reorders normalized age observations so provenance and value sync share one primary. */
export function prioritizeCharacterAgeObservations(
  observations: NormalizedFieldObservation[],
): NormalizedFieldObservation[] {
  return observations
    .map((observation, index) => ({ observation, index }))
    .sort((left, right) => {
      const leftKey = ageObservationSortKey(left.observation, left.index);
      const rightKey = ageObservationSortKey(right.observation, right.index);
      for (let i = 0; i < leftKey.length; i++) {
        if (leftKey[i] !== rightKey[i]) return leftKey[i] - rightKey[i];
      }
      return 0;
    })
    .map(({ observation }) => observation);
}
