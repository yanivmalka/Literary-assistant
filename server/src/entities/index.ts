// ============================================
// Entities Module — Public API
// ============================================

export { extractEntitiesFromVersion, saveExtractedEntities } from './extractor.js'
export { findDuplicates, mergeEntities } from './deduplicator.js'
export type { MergeSuggestion } from './deduplicator.js'
export { extractAttributesForEntity, extractAttributesForProject } from './attributes.js'
export { detectContradictions, detectContradictionsForEntity, resolveContradiction } from './contradictions.js'
export { default as entityRoutes } from './routes.js'
