import { normalizeKey } from "./rules/normalization.ts";

export interface BatchEntityRecord {
  canonical_name: string;
  entity_type: string;
  entity_types: string[];
  description: string | null;
  attributes: Record<string, unknown>;
  structured_fields: Record<string, unknown>;
  aliases: string[];
  evidence: string[];
  chunk_positions: number[];
}

function mergeValue(existing: unknown, incoming: unknown): unknown {
  if (incoming === null || incoming === undefined) return existing;
  if (existing === null || existing === undefined) return incoming;

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return [...new Set([...existing, ...incoming])];
  }

  if (typeof existing === "object" && typeof incoming === "object" &&
      !Array.isArray(existing) && !Array.isArray(incoming)) {
    return { ...(existing as Record<string, unknown>), ...(incoming as Record<string, unknown>) };
  }

  return existing;
}

function mergeFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = mergeValue(merged[key], value);
  }
  return merged;
}

export function mergeBatchEntity<T extends BatchEntityRecord>(
  existing: T,
  incoming: T,
): T {
  const canonicalName = incoming.canonical_name.length > existing.canonical_name.length
    ? incoming.canonical_name
    : existing.canonical_name;

  return {
    ...existing,
    canonical_name: canonicalName,
    entity_types: [...new Set([...existing.entity_types, ...incoming.entity_types])],
    description: existing.description || incoming.description,
    attributes: mergeFields(existing.attributes, incoming.attributes),
    structured_fields: mergeFields(existing.structured_fields, incoming.structured_fields),
    aliases: [...new Set([
      ...existing.aliases,
      ...incoming.aliases,
      ...(canonicalName !== existing.canonical_name ? [existing.canonical_name] : []),
      ...(canonicalName !== incoming.canonical_name ? [incoming.canonical_name] : []),
    ])],
    evidence: [...new Set([...existing.evidence, ...incoming.evidence])],
    chunk_positions: [...new Set([...existing.chunk_positions, ...incoming.chunk_positions])],
  } as T;
}

/** Collapse same-type observations with the same normalized name in one batch. */
export function deduplicateBatchEntities<T extends BatchEntityRecord>(entities: T[]): T[] {
  const byIdentity = new Map<string, T>();

  for (const entity of entities) {
    const key = `${entity.entity_type}:${normalizeKey(entity.canonical_name)}`;
    const current = byIdentity.get(key);
    byIdentity.set(key, current ? mergeBatchEntity(current, entity) : entity);
  }

  return [...byIdentity.values()];
}
