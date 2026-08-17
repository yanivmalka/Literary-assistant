// ============================================
// AI Abstraction Layer — Public API
// ============================================

export type {
  AIProvider,
  EmbeddingProvider,
  CompletionProvider,
  CompletionOptions,
  CompletionResult,
  ExtractedEntity,
  EntityType,
  AIConfig,
  AIStatus,
} from './types.js'

export {
  getEmbeddingProvider,
  getCompletionProvider,
  getAIStatus,
  resetProviderCache,
} from './factory.js'

export {
  loadAIConfig,
  isProviderConfigured,
} from './config.js'

export {
  AIProviderUnavailableError,
  AIProviderTimeoutError,
  AIProviderRateLimitError,
  AIProviderResponseError,
} from './errors.js'
