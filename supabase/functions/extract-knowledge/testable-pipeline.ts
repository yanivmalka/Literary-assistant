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

/**
 * Normalize common model wrappers into the extraction contract expected by
 * the persistence pipeline. Models sometimes wrap the JSON in `result`,
 * `data`, or an `entities` array even when the prompt asks for top-level
 * arrays. Returning null for an unknown shape prevents silent zero-entity
 * successes.
 */
export function normalizeExtractionPayload<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) {
    const grouped: Record<string, unknown[]> = {}
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const rawType = String(record.entity_type ?? record.type ?? '').toLowerCase()
      const type = rawType === 'character' || rawType === 'person' || rawType === 'people'
        ? 'characters'
        : rawType === 'location' || rawType === 'place' || rawType === 'places'
          ? 'locations'
          : rawType === 'object' || rawType === 'item' || rawType === 'artifact'
            ? 'objects'
            : rawType === 'ability' || rawType === 'skill'
              ? 'abilities'
              : rawType === 'magic_ability' || rawType === 'magical_ability'
                ? 'magic_abilities'
                : rawType === 'organization' || rawType === 'group'
                  ? 'organizations'
                  : null
      if (type) (grouped[type] ||= []).push(item)
    }
    return Object.keys(grouped).length > 0 ? grouped as T : null
  }

  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const wrapperKeys = ['result', 'data', 'extraction', 'output', 'response', 'knowledge']
  for (const wrapperKey of wrapperKeys) {
    if (record[wrapperKey] && typeof record[wrapperKey] === 'object') {
      const wrapped = normalizeExtractionPayload<T>(record[wrapperKey])
      if (wrapped) return wrapped
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

  const entityList = record.entities
  if (Array.isArray(entityList)) {
    const grouped = normalizeExtractionPayload<Record<string, unknown[]>>(entityList)
    if (grouped) {
      for (const [key, values] of Object.entries(grouped)) {
        normalized[key] = [...(normalized[key] || []), ...values]
      }
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
