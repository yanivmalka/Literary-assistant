export interface FieldEvidenceReference {
  quote: string | null;
  chunk_position: number | null;
  chunk_id: string | null;
  page: number | null;
  position_start: number | null;
  position_end: number | null;
}

export interface NormalizedFieldObservation {
  value: unknown;
  evidence: FieldEvidenceReference[];
  confidence: number | null;
  inferred: boolean;
  inference_note: string | null;
}

export type FieldObservationMap = Record<string, NormalizedFieldObservation[]>;
export type FieldEvidenceMap = Record<string, FieldEvidenceReference[]>;
export type FieldConfidenceMap = Record<string, number>;
export type FieldInferenceMap = Record<string, boolean>;
export type FieldInferenceNoteMap = Record<string, string | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeReference(
  value: unknown,
  chunkLookup: Map<number, { id: string; page: number | null }>,
): FieldEvidenceReference | null {
  if (!isRecord(value)) return null;
  const position = Number.isInteger(value.chunk_position) ? value.chunk_position as number : null;
  const chunk = position === null ? undefined : chunkLookup.get(position);
  const page = finiteNumber(value.page) ?? chunk?.page ?? null;
  return {
    quote: typeof value.quote === "string" && value.quote.trim() ? value.quote.trim() : null,
    chunk_position: position,
    chunk_id: chunk?.id ?? null,
    page,
    position_start: finiteNumber(value.start_offset),
    position_end: finiteNumber(value.end_offset),
  };
}

function normalizeEvidence(
  value: unknown,
  chunkLookup: Map<number, { id: string; page: number | null }>,
): FieldEvidenceReference[] {
  if (!Array.isArray(value)) return [];
  const references = value
    .map((item) => typeof item === "string"
      ? normalizeReference({ quote: item }, chunkLookup)
      : normalizeReference(item, chunkLookup))
    .filter((item): item is FieldEvidenceReference => item !== null);
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = JSON.stringify(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeObservation(
  value: unknown,
  chunkLookup: Map<number, { id: string; page: number | null }>,
): NormalizedFieldObservation | null {
  if (!isRecord(value) || !("value" in value)) return null;
  const evidence = normalizeEvidence(value.evidence, chunkLookup);
  return {
    value: value.value,
    evidence,
    confidence: finiteNumber(value.confidence),
    inferred: value.inferred === true,
    inference_note: typeof value.inference_note === "string" && value.inference_note.trim()
      ? value.inference_note.trim()
      : null,
  };
}

function observationKey(observation: NormalizedFieldObservation): string {
  return JSON.stringify({
    value: observation.value,
    evidence: observation.evidence,
    confidence: observation.confidence,
    inferred: observation.inferred,
    inference_note: observation.inference_note,
  });
}

export function normalizeFieldObservationMap(
  value: unknown,
  chunkLookup: Map<number, { id: string; page: number | null }>,
): FieldObservationMap {
  if (!isRecord(value)) return {};
  const result: FieldObservationMap = {};
  for (const [field, rawObservations] of Object.entries(value)) {
    const values = Array.isArray(rawObservations) ? rawObservations : [rawObservations];
    const observations = values
      .map((raw) => normalizeObservation(raw, chunkLookup))
      .filter((item): item is NormalizedFieldObservation => item !== null);
    const seen = new Set<string>();
    const unique = observations.filter((observation) => {
      const key = observationKey(observation);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length > 0) result[field] = unique;
  }
  return result;
}

/**
 * Orders observations so explicit facts (`inferred === false`) precede inferred
 * ones, then higher confidence first, then original order. Age has its own
 * dedicated ordering (see character-age.ts) and is not passed through here.
 */
export function prioritizeExplicitObservations(
  observations: NormalizedFieldObservation[],
): NormalizedFieldObservation[] {
  return observations
    .map((observation, index) => ({ observation, index }))
    .sort((left, right) => {
      const leftInferred = left.observation.inferred ? 1 : 0;
      const rightInferred = right.observation.inferred ? 1 : 0;
      if (leftInferred !== rightInferred) return leftInferred - rightInferred;
      const leftConfidence = typeof left.observation.confidence === "number" ? left.observation.confidence : -1;
      const rightConfidence = typeof right.observation.confidence === "number" ? right.observation.confidence : -1;
      if (leftConfidence !== rightConfidence) return rightConfidence - leftConfidence;
      return left.index - right.index;
    })
    .map(({ observation }) => observation);
}

export function mergeFieldObservationMaps(
  target: FieldObservationMap,
  incoming: FieldObservationMap,
): FieldObservationMap {
  for (const [field, observations] of Object.entries(incoming)) {
    const existing = target[field] ?? [];
    const combined = [...existing, ...observations];
    const seen = new Set<string>();
    target[field] = combined.filter((observation) => {
      const key = observationKey(observation);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return target;
}

export function deriveFieldProvenance(
  observations: FieldObservationMap,
): {
  field_evidence: FieldEvidenceMap;
  field_confidence: FieldConfidenceMap;
  field_inferred: FieldInferenceMap;
  field_inference_notes: FieldInferenceNoteMap;
} {
  const field_evidence: FieldEvidenceMap = {};
  const field_confidence: FieldConfidenceMap = {};
  const field_inferred: FieldInferenceMap = {};
  const field_inference_notes: FieldInferenceNoteMap = {};

  for (const [field, values] of Object.entries(observations)) {
    const primary = values[0];
    if (!primary) continue;
    field_evidence[field] = values.flatMap((observation) => observation.evidence);
    if (primary.confidence !== null) field_confidence[field] = primary.confidence;
    field_inferred[field] = primary.inferred;
    field_inference_notes[field] = primary.inference_note;
  }

  return { field_evidence, field_confidence, field_inferred, field_inference_notes };
}

export function normalizeLegacyFieldEvidence(
  value: Record<string, string[]> | undefined,
): FieldEvidenceMap {
  const result: FieldEvidenceMap = {};
  for (const [field, quotes] of Object.entries(value ?? {})) {
    result[field] = (quotes ?? [])
      .filter((quote): quote is string => typeof quote === "string" && quote.trim().length > 0)
      .map((quote) => ({
        quote: quote.trim(),
        chunk_position: null,
        chunk_id: null,
        page: null,
        position_start: null,
        position_end: null,
      }));
  }
  return result;
}
