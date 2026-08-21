export type ExtractionMode = 'bootstrap' | 'branch';

export interface ExtractionModeRequest {
  extraction_mode?: ExtractionMode;
  target_branch_id?: string | null;
  use_main?: boolean;
}

export type ExtractionValidationResult = {
  ok: true;
  mode: ExtractionMode;
  branchId: string | null;
} | {
  ok: false;
  error: string;
};

/** Mirrors the handler's JSON cleanup and fallback object extraction without I/O. */
export function parseExtractionJson<T>(responseText: string): T | null {
  try {
    let jsonText = responseText.trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    return JSON.parse(jsonText) as T;
  } catch {
    try {
      const start = responseText.indexOf('{');
      const end = responseText.lastIndexOf('}');
      if (start !== -1 && end > start) return JSON.parse(responseText.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
    return null;
  }
}

type NormalizedExtractionBucket =
  | 'characters'
  | 'locations'
  | 'objects'
  | 'abilities'
  | 'magic_abilities'
  | 'organizations'
  | 'events'
  | 'relationships'

function normalizeExtractionType(value: unknown): NormalizedExtractionBucket | null {
  const rawType = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  switch (rawType) {
    case 'character':
    case 'person':
    case 'people':
      return 'characters'
    case 'location':
    case 'place':
    case 'places':
      return 'locations'
    case 'object':
    case 'item':
    case 'artifact':
      return 'objects'
    case 'ability':
    case 'skill':
    case 'power':
      return 'abilities'
    case 'magic_ability':
    case 'magical_ability':
    case 'magic_power':
    case 'spell':
      return 'magic_abilities'
    case 'organization':
    case 'group':
    case 'faction':
      return 'organizations'
    case 'event':
      return 'events'
    case 'relationship':
      return 'relationships'
    default:
      return null
  }
}

function mergeExtractionBuckets(
  target: Record<string, unknown[]>,
  source: Record<string, unknown[]>,
): void {
  for (const [key, values] of Object.entries(source)) {
    target[key] = [...(target[key] || []), ...values]
  }
}

function normalizeGenericEntityList(items: unknown[]): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {}

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const bucket = normalizeExtractionType(
      record.entity_type ?? record.entityType ?? record.kind ?? record.category ?? record.type,
    )
    if (bucket) (grouped[bucket] ||= []).push(item)
  }

  return grouped
}

/**
 * Normalize common model wrappers into the extraction contract expected by
 * the persistence pipeline. Models sometimes wrap the JSON in `result`,
 * `data`, or an `entities` array even when the prompt asks for top-level
 * arrays. Returning null for an unknown shape prevents silent zero-entity
 * successes.
 */
export function normalizeExtractionPayload<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) {
    const grouped = normalizeGenericEntityList(payload)
    return Object.keys(grouped).length > 0 ? grouped as T : null
  }

  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const wrapperKeys = ['result', 'data', 'extraction', 'output', 'response', 'knowledge']

  for (const wrapperKey of wrapperKeys) {
    if (record[wrapperKey] && typeof record[wrapperKey] === 'object') {
      const wrapped = normalizeExtractionPayload<Record<string, unknown[]>>(record[wrapperKey])
      if (wrapped) return wrapped as T
    }
  }

  const aliases: Record<string, string[]> = {
    characters: ['characters', 'character', 'people', 'persons'],
    locations: ['locations', 'location', 'places', 'place'],
    objects: ['objects', 'object', 'items', 'artifacts'],
    abilities: ['abilities', 'ability', 'skills'],
    magic_abilities: ['magic_abilities', 'magicAbilities', 'magical_abilities'],
    organizations: ['organizations', 'organization', 'groups'],
    events: ['events', 'event'],
    relationships: ['relationships', 'relationship'],
  }
  const normalized: Record<string, unknown[]> = {}
  let recognized = false

  for (const [targetKey, sourceKeys] of Object.entries(aliases)) {
    const sourceKey = sourceKeys.find((key) => key in record)
    if (!sourceKey) continue
    const value = record[sourceKey]
    normalized[targetKey] = Array.isArray(value) ? value : value == null ? [] : [value]
    recognized = true
  }

  const genericEntities = record.entities ?? record.entity_list ?? record.knowledge_entities
  if (Array.isArray(genericEntities)) {
    const grouped = normalizeGenericEntityList(genericEntities)
    mergeExtractionBuckets(normalized, grouped)
    recognized = recognized || Object.keys(grouped).length > 0
  } else if (genericEntities && typeof genericEntities === 'object') {
    const grouped = normalizeExtractionPayload<Record<string, unknown[]>>(genericEntities)
    if (grouped) {
      mergeExtractionBuckets(normalized, grouped)
      recognized = true
    }
  }

  return recognized ? normalized as T : null
}

/** Validates the same Main/Branch combinations accepted by the Edge Function. */
export function validateExtractionMode(request: ExtractionModeRequest): ExtractionValidationResult {
  const mode = request.extraction_mode;
  const hasBranchId = Boolean(request.target_branch_id);
  const useMain = mode === 'bootstrap' || (request.use_main === true && !mode);

  if (mode === 'bootstrap' && hasBranchId) {
    return { ok: false, error: "extraction_mode='bootstrap' cannot specify target_branch_id." };
  }
  if (mode === 'branch' && !hasBranchId) {
    return { ok: false, error: "extraction_mode='branch' requires target_branch_id." };
  }
  if (!mode) {
    if (useMain && hasBranchId) {
      return { ok: false, error: 'cannot specify both use_main=true and target_branch_id.' };
    }
    if (!useMain && !hasBranchId) {
      return { ok: false, error: 'must specify either use_main=true or target_branch_id.' };
    }
  }

  return {
    ok: true,
    mode: mode || (useMain ? 'bootstrap' : 'branch'),
    branchId: hasBranchId ? request.target_branch_id! : null,
  };
}
