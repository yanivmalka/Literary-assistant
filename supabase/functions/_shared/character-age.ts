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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAgeText(value: string): string {
  return value
    .normalize("NFKC")
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

  const hebrewAge = HEBREW_TEEN_AGES[core];
  return hebrewAge === undefined ? null : String(hebrewAge);
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
