/**
 * Legacy bootstrap sentinel constant.
 * 
 * DEPRECATED: Bootstrap entities are no longer created. Main layer initialization is implicit:
 * - Empty Main layer: has zero knowledge_entities with layer='main' (excluding any legacy bootstrap rows)
 * - Initialized Main: has one or more real knowledge_entities with layer='main'
 * 
 * This constant is retained only for backward compatibility with projects that may have
 * legacy bootstrap rows in their database. These rows are filtered out in hasMainEntities()
 * and entity reads, and will be deleted by migration 111.
 */
export const LEGACY_BOOTSTRAP_CANONICAL_NAME = '__bootstrap__'

export interface CanonicalEntityRecord {
  canonical_name?: string | null
}

/**
 * Check if an entity is a legacy bootstrap marker.
 * @deprecated Only used for filtering legacy bootstrap rows from production projects.
 */
export function isLegacyBootstrapEntity(entity: CanonicalEntityRecord): boolean {
  return entity.canonical_name === LEGACY_BOOTSTRAP_CANONICAL_NAME
}

/**
 * Filter out legacy bootstrap entities from a collection.
 * @deprecated Used only for backward compatibility with projects containing bootstrap rows.
 */
export function filterLegacyBootstrapEntities<T extends CanonicalEntityRecord>(entities: T[]): T[] {
  return entities.filter(entity => !isLegacyBootstrapEntity(entity))
}
