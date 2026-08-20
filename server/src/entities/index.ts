// ============================================
// Entities Module — Public API
// ============================================

export { findDuplicates, mergeEntities } from './deduplicator.js'
export type { MergeSuggestion } from './deduplicator.js'
export { detectContradictions, detectContradictionsForEntity, resolveContradiction } from './contradictions.js'
export { default as entityRoutes } from './routes.js'
