import { normalizeKey, stripNikud } from "./rules/normalization.ts";

export interface EntityResolutionRecord {
  id?: string;
  canonical_name: string;
  entity_type: string;
  entity_types?: string[];
  aliases?: string[];
  description?: string | null;
  attributes?: Record<string, unknown> | null;
  structured_fields?: Record<string, unknown> | null;
}

export function applyEntityOverrides<T extends EntityResolutionRecord>(
  record: T,
  overrides: Record<string, unknown>,
): T {
  const result = {
    ...record,
    attributes: { ...(record.attributes || {}) },
    structured_fields: { ...(record.structured_fields || {}) },
  } as T;

  for (const [path, value] of Object.entries(overrides)) {
    if (path === "canonical_name" || path === "entity_type" || path === "description") {
      (result as Record<string, unknown>)[path] = value;
      continue;
    }

    const separator = path.indexOf(".");
    if (separator === -1) continue;
    const root = path.slice(0, separator);
    const field = path.slice(separator + 1);
    if (root === "attributes" || root === "structured_fields") {
      const target = result[root] as Record<string, unknown>;
      target[field] = value;
    }
  }

  return result;
}

export function resolveExtractionCandidate<
  B extends EntityResolutionRecord & { id: string },
  M extends EntityResolutionRecord & { id: string },
>(
  input: EntityResolutionRecord,
  branchCandidates: B[],
  mainCandidates: M[],
): B | M | null {
  // The active Branch is the current extraction context. Prefer an existing
  // Branch identity before falling back to a Main entity/overlay.
  const branchMatch = resolveEntityCandidate(input, branchCandidates);
  if (branchMatch?.id) {
    return branchCandidates.find((candidate) => candidate.id === branchMatch.id) || null;
  }

  const mainMatch = resolveEntityCandidate(input, mainCandidates);
  if (mainMatch?.id) {
    return mainCandidates.find((candidate) => candidate.id === mainMatch.id) || null;
  }

  return null;
}

interface NamedCandidate {
  record: EntityResolutionRecord;
  nameScore: number;
  contextScore: number;
}

function normalizeText(value: string): string {
  return stripNikud(value).trim().toLowerCase();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function meaningfulValues(record: EntityResolutionRecord): string[] {
  const values: string[] = [];

  const append = (value: unknown, key?: string) => {
    if (value == null || key === "name") return;
    if (typeof value === "string") {
      if (value.trim()) values.push(value);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      values.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => append(item, key));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
        append(childValue, childKey);
      });
    }
  };

  append(record.description);
  append(record.attributes || {});
  append(record.structured_fields || {});
  return values;
}

function contextTokens(record: EntityResolutionRecord): Set<string> {
  const result = new Set<string>();
  meaningfulValues(record).forEach((value) => {
    tokens(value).forEach((token) => result.add(token));
  });
  return result;
}

function fieldValues(record: EntityResolutionRecord): Map<string, string> {
  const result = new Map<string, string>();
  const addFields = (fields: Record<string, unknown> | null | undefined) => {
    Object.entries(fields || {}).forEach(([key, value]) => {
      if (key === "name" || value == null || typeof value === "object") return;
      const normalized = normalizeText(String(value));
      if (normalized) result.set(key, normalized);
    });
  };

  addFields(record.attributes);
  addFields(record.structured_fields);
  return result;
}

/**
 * Returns true when the available descriptions/attributes contradict one
 * another strongly enough that a name-only match would be unsafe.
 */
export function hasConflictingEntityContext(
  left: EntityResolutionRecord,
  right: EntityResolutionRecord,
): boolean {
  const leftDescription = left.description?.trim();
  const rightDescription = right.description?.trim();
  if (leftDescription && rightDescription) {
    const sharedDescriptionTokens = [...tokens(leftDescription)].filter((token) => tokens(rightDescription).has(token));
    if (sharedDescriptionTokens.length === 0) return true;
  }

  const leftFields = fieldValues(left);
  const rightFields = fieldValues(right);
  for (const [key, leftValue] of leftFields) {
    const rightValue = rightFields.get(key);
    if (rightValue && leftValue !== rightValue) return true;
  }

  const leftContext = contextTokens(left);
  const rightContext = contextTokens(right);
  return leftContext.size > 0 && rightContext.size > 0 &&
    [...leftContext].every((token) => !rightContext.has(token));
}

function contextSimilarity(left: EntityResolutionRecord, right: EntityResolutionRecord): number {
  let score = 0;
  const leftTokens = contextTokens(left);
  const rightTokens = contextTokens(right);
  score += [...leftTokens].filter((token) => rightTokens.has(token)).length;

  const leftDescription = left.description?.trim();
  const rightDescription = right.description?.trim();
  if (leftDescription && rightDescription && normalizeText(leftDescription) === normalizeText(rightDescription)) {
    score += 10;
  }

  const leftFields = fieldValues(left);
  const rightFields = fieldValues(right);
  for (const [key, leftValue] of leftFields) {
    if (rightFields.get(key) === leftValue) score += 5;
  }
  return score;
}

function isWordPrefix(left: string, right: string): boolean {
  const shortName = normalizeText(left);
  const longName = normalizeText(right);
  if (!shortName || shortName === longName) return false;
  return longName.startsWith(`${shortName} `) ||
    longName.startsWith(`${shortName}'`) ||
    longName.startsWith(`${shortName}\"`);
}

function nameScore(input: string, candidate: EntityResolutionRecord): number {
  const inputKey = normalizeKey(input);
  const candidateNames = [candidate.canonical_name, ...(candidate.aliases || [])];
  if (candidateNames.some((name) => normalizeKey(name) === inputKey)) return 100;
  if (candidateNames.some((name) => isWordPrefix(input, name) || isWordPrefix(name, input))) return 80;
  return 0;
}

/**
 * Resolve an extracted entity to an existing entity only when identity is
 * unambiguous. A matching name is a candidate signal, never a foreign key.
 * Ambiguous or contradictory candidates intentionally return null so callers
 * can create a new UUID instead of silently merging two entities.
 */
export function resolveEntityCandidate(
  input: EntityResolutionRecord,
  candidates: EntityResolutionRecord[],
): EntityResolutionRecord | null {
  const typeCandidates = candidates.filter((candidate) =>
    candidate.entity_type === input.entity_type || candidate.entity_types?.includes(input.entity_type),
  );

  const namedCandidates: NamedCandidate[] = typeCandidates
    .map((record) => ({
      record,
      nameScore: nameScore(input.canonical_name, record),
      contextScore: contextSimilarity(input, record),
    }))
    .filter((candidate) => candidate.nameScore > 0);

  if (namedCandidates.length === 0) return null;

  // Prefer exact canonical/alias matches over prefix expansion.
  const exactMatches = namedCandidates.filter((candidate) => candidate.nameScore === 100);
  const matches = exactMatches.length > 0 ? exactMatches : namedCandidates;
  const compatible = matches.filter((candidate) => !hasConflictingEntityContext(input, candidate.record));
  if (compatible.length === 0) return null;

  if (compatible.length === 1) {
    // A unique exact name is safe only when it does not contradict context.
    // With several same-name candidates, require positive context evidence.
    if (matches.length === 1 || compatible[0].contextScore > 0) return compatible[0].record;
    return null;
  }

  const ranked = [...compatible].sort((left, right) => right.contextScore - left.contextScore);
  const [best, second] = ranked;
  if (best.contextScore > 0 && best.contextScore > second.contextScore) return best.record;
  return null;
}
