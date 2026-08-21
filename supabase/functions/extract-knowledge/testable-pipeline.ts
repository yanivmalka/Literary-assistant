import {
  isCanonicalExtractionPayload,
  referenceName,
  sourceReferencesToLegacyFields,
} from '../_shared/extraction-contract.ts';

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

function canonicalEntityToLegacy(entity: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof entity.name === 'string' ? entity.name.trim() : ''
  const type = typeof entity.type === 'string' ? entity.type.trim() : ''
  if (!name || !type) return null

  const attributes = entity.attributes && typeof entity.attributes === 'object'
    ? entity.attributes as Record<string, unknown>
    : {}
  const provenance = sourceReferencesToLegacyFields(
    Array.isArray(entity.source_references) ? entity.source_references : undefined,
    Array.isArray(entity.evidence) ? entity.evidence.filter((item): item is string => typeof item === 'string') : undefined,
    Array.isArray(entity.chunk_positions) ? entity.chunk_positions.filter((item): item is number => typeof item === 'number') : undefined,
  )

  return {
    ...entity,
    ...attributes,
    name,
    type,
    aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
    evidence: provenance.evidence || [],
    chunk_positions: provenance.chunk_positions || [],
  }
}

function canonicalRelationshipToLegacy(relationship: Record<string, unknown>): Record<string, unknown> | null {
  const source = referenceName(relationship.source ?? relationship.character_a)
  const target = referenceName(relationship.target ?? relationship.character_b)
  const type = typeof (relationship.type ?? relationship.relationship_type) === 'string'
    ? String(relationship.type ?? relationship.relationship_type).trim()
    : ''
  if (!source || !target || !type) return null

  const provenance = sourceReferencesToLegacyFields(
    Array.isArray(relationship.source_references) ? relationship.source_references : undefined,
    Array.isArray(relationship.evidence) ? relationship.evidence.filter((item): item is string => typeof item === 'string') : undefined,
    Array.isArray(relationship.chunk_positions) ? relationship.chunk_positions.filter((item): item is number => typeof item === 'number') : undefined,
  )

  return {
    ...relationship,
    character_a: source,
    character_b: target,
    relationship_type: type,
    evidence: provenance.evidence || [],
    chunk_positions: provenance.chunk_positions || [],
  }
}

function canonicalEventToLegacy(event: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof event.name === 'string' ? event.name.trim() : ''
  const description = typeof event.description === 'string' ? event.description.trim() : ''
  if (!name && !description) return null

  const participants = Array.isArray(event.participants)
    ? event.participants.map(referenceName).filter(Boolean)
    : []
  const location = referenceName(event.location) || null
  const provenance = sourceReferencesToLegacyFields(
    Array.isArray(event.source_references) ? event.source_references : undefined,
    Array.isArray(event.evidence) ? event.evidence.filter((item): item is string => typeof item === 'string') : undefined,
    Array.isArray(event.chunk_positions) ? event.chunk_positions.filter((item): item is number => typeof item === 'number') : undefined,
  )

  return {
    ...event,
    name: name || description,
    description: description || name,
    participants,
    location,
    what_happened: description || name,
    evidence: provenance.evidence || [],
    chunk_positions: provenance.chunk_positions || [],
  }
}

function normalizeCanonicalPayload(record: Record<string, unknown>): Record<string, unknown[]> | null {
  if (!isCanonicalExtractionPayload(record)) return null

  const grouped: Record<string, unknown[]> = {}
  for (const entity of record.entities) {
    const legacy = canonicalEntityToLegacy(entity as unknown as Record<string, unknown>)
    if (!legacy) continue
    const type = String(legacy.type).toLowerCase().replace(/[\\s-]+/g, '_')
    const bucket = normalizeExtractionType(type)
    if (bucket && bucket !== 'events' && bucket !== 'relationships') (grouped[bucket] ||= []).push(legacy)
  }

  const relationships = Array.isArray(record.relationships)
    ? record.relationships.map((item) => canonicalRelationshipToLegacy(item as unknown as Record<string, unknown>)).filter(Boolean)
    : []
  const events = Array.isArray(record.events)
    ? record.events.map((item) => canonicalEventToLegacy(item as unknown as Record<string, unknown>)).filter(Boolean)
    : []
  if (relationships.length > 0) grouped.relationships = relationships as unknown[]
  if (events.length > 0) grouped.events = events as unknown[]

  return Object.keys(grouped).length > 0 ? grouped : null
}

/**
 * Normalize the canonical schema_version=2 payload and legacy model payloads
 * into the persistence contract. Invalid items are retained for explicit
 * validation rather than silently discarded.
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

  const canonical = normalizeCanonicalPayload(record)
  if (canonical) return canonical as T

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

export interface ExtractionValidationResult {
  valid: boolean;
  errors: string[];
  itemCount: number;
}

/** Validates the normalized extraction contract before any database writes. */
export function validateExtractionPayload(payload: unknown): ExtractionValidationResult {
  const errors: string[] = []
  let itemCount = 0
  if (!payload || typeof payload !== 'object') return { valid: false, errors: ['payload must be an object'], itemCount }

  const record = payload as Record<string, unknown>
  for (const bucket of ['characters', 'locations', 'objects', 'abilities', 'magic_abilities', 'organizations']) {
    const items = record[bucket]
    if (items == null) continue
    if (!Array.isArray(items)) {
      errors.push(`${bucket} must be an array`)
      continue
    }
    items.forEach((item, index) => {
      itemCount++
      const name = item && typeof item === 'object' ? (item as Record<string, unknown>).name : null
      if (typeof name !== 'string' || !name.trim()) errors.push(`${bucket}[${index}].name is required`)
    })
  }

  const relationships = record.relationships
  if (relationships != null) {
    if (!Array.isArray(relationships)) errors.push('relationships must be an array')
    else relationships.forEach((item, index) => {
      itemCount++
      const value = item as Record<string, unknown>
      const source = value.character_a
      const target = value.character_b
      const type = value.relationship_type
      if (typeof source !== 'string' || !source.trim()) errors.push(`relationships[${index}].source is required`)
      if (typeof target !== 'string' || !target.trim()) errors.push(`relationships[${index}].target is required`)
      if (typeof type !== 'string' || !type.trim()) errors.push(`relationships[${index}].type is required`)
    })
  }

  const events = record.events
  if (events != null) {
    if (!Array.isArray(events)) errors.push('events must be an array')
    else events.forEach((item, index) => {
      itemCount++
      const value = item as Record<string, unknown>
      const name = value.name
      const description = value.description ?? value.what_happened
      if ((typeof name !== 'string' || !name.trim()) && (typeof description !== 'string' || !description.trim())) {
        errors.push(`events[${index}].name or description is required`)
      }
    })
  }

  return { valid: errors.length === 0 && itemCount > 0, errors, itemCount }
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
