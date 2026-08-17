// ============================================
// AI Abstraction Layer — Configuration
// Loads provider settings from environment variables.
// All providers are OPTIONAL. Missing config = provider unavailable.
// ============================================

import type { AIConfig } from './types.js'

/**
 * Load AI configuration from environment variables.
 * Missing values result in empty strings — the factory handles unavailability.
 */
export function loadAIConfig(): AIConfig {
  return {
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER || 'xenova-local',
      model: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    },
    completion: {
      provider: process.env.COMPLETION_PROVIDER || '',
      model: process.env.COMPLETION_MODEL || '',
      apiKey: process.env.HUGGINGFACE_API_KEY || process.env.OPENAI_API_KEY || '',
    },
  }
}

/**
 * Validates that the minimum required configuration exists for a provider type.
 */
export function isProviderConfigured(config: AIConfig, type: 'embedding' | 'completion'): boolean {
  if (type === 'embedding') {
    return !!(config.embedding.provider && config.embedding.model)
  }
  if (type === 'completion') {
    return !!(config.completion.provider && config.completion.model)
  }
  return false
}
