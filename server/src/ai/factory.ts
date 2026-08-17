// ============================================
// AI Provider Factory
// Returns configured providers or null if unavailable.
// Null means "gracefully skip this AI-dependent stage."
// ============================================

import type { EmbeddingProvider, CompletionProvider, AIConfig, AIStatus } from './types.js'
import { loadAIConfig, isProviderConfigured } from './config.js'
import { XenovaLocalEmbeddingProvider, resolveModelDimensions } from './providers/xenova-local.js'
import { HuggingFaceCompletionProvider, HuggingFaceEmbeddingProvider } from './providers/huggingface.js'

let cachedConfig: AIConfig | null = null
let cachedEmbeddingProvider: EmbeddingProvider | null = null
let cachedCompletionProvider: CompletionProvider | null = null

function getConfig(): AIConfig {
  if (!cachedConfig) {
    cachedConfig = loadAIConfig()
  }
  return cachedConfig
}

/**
 * Get the configured embedding provider.
 * Returns null if no provider is configured or available.
 * Default: xenova-local (zero cost, runs locally).
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (cachedEmbeddingProvider) return cachedEmbeddingProvider

  const config = getConfig()
  if (!isProviderConfigured(config, 'embedding')) return null

  switch (config.embedding.provider) {
    case 'xenova-local': {
      const dimensions = resolveModelDimensions(config.embedding.model)
      cachedEmbeddingProvider = new XenovaLocalEmbeddingProvider(config.embedding.model, dimensions)
      break
    }
    case 'huggingface': {
      const apiKey = config.completion.apiKey || ''
      // HuggingFace embedding models typically produce 384 or 768 dims
      const dimensions = resolveModelDimensions(config.embedding.model, 384)
      cachedEmbeddingProvider = new HuggingFaceEmbeddingProvider(config.embedding.model, apiKey, dimensions)
      break
    }
    default:
      // Unknown provider — not available
      return null
  }

  return cachedEmbeddingProvider
}

/**
 * Get the configured completion provider.
 * Returns null if no provider is configured or available.
 * Used for entity extraction, Q&A, attribute extraction.
 */
export function getCompletionProvider(): CompletionProvider | null {
  if (cachedCompletionProvider) return cachedCompletionProvider

  const config = getConfig()
  if (!isProviderConfigured(config, 'completion')) return null

  switch (config.completion.provider) {
    case 'huggingface': {
      const apiKey = config.completion.apiKey || ''
      if (!apiKey) return null
      cachedCompletionProvider = new HuggingFaceCompletionProvider(config.completion.model, apiKey)
      break
    }
    // Future providers go here:
    // case 'openai': { ... }
    // case 'anthropic': { ... }
    default:
      return null
  }

  return cachedCompletionProvider
}

/**
 * Get the full AI subsystem status.
 * Used by the /api/ai/status endpoint.
 */
export async function getAIStatus(): Promise<AIStatus> {
  const config = getConfig()
  const embeddingProvider = getEmbeddingProvider()
  const completionProvider = getCompletionProvider()

  let embeddingAvailable = false
  let embeddingError: string | undefined
  if (embeddingProvider) {
    try {
      embeddingAvailable = await embeddingProvider.isAvailable()
    } catch (e) {
      embeddingError = e instanceof Error ? e.message : 'Unknown error'
    }
  } else {
    embeddingError = 'No embedding provider configured'
  }

  let completionAvailable = false
  let completionError: string | undefined
  if (completionProvider) {
    try {
      completionAvailable = await completionProvider.isAvailable()
    } catch (e) {
      completionError = e instanceof Error ? e.message : 'Unknown error'
    }
  } else {
    completionError = 'No completion provider configured'
  }

  return {
    embedding: {
      provider: config.embedding.provider || 'none',
      model: config.embedding.model || 'none',
      dimensions: embeddingProvider?.getDimensions() ?? 0,
      available: embeddingAvailable,
      error: embeddingError,
    },
    completion: {
      provider: config.completion.provider || 'none',
      model: config.completion.model || 'none',
      available: completionAvailable,
      error: completionError,
    },
  }
}

/**
 * Clear cached providers (useful for testing or config changes).
 */
export function resetProviderCache(): void {
  cachedConfig = null
  cachedEmbeddingProvider = null
  cachedCompletionProvider = null
}
