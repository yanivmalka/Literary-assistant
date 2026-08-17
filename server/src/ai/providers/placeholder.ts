// ============================================
// Placeholder Providers for Future Paid Services
// These stubs exist to document the extension points.
// Implementing OpenAI, Anthropic, Gemini, etc. follows
// the same EmbeddingProvider / CompletionProvider interfaces.
// ============================================

import type { CompletionProvider, CompletionOptions, CompletionResult, EmbeddingProvider } from '../types.js'
import { AIProviderUnavailableError } from '../errors.js'

/**
 * Placeholder for OpenAI embedding provider.
 * NOT IMPLEMENTED — exists to show where future integration goes.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai'

  async isAvailable(): Promise<boolean> {
    return false
  }

  getDimensions(): number {
    // text-embedding-3-small: 1536, text-embedding-3-large: 3072
    return 1536
  }

  getModelName(): string {
    return 'text-embedding-3-small'
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new AIProviderUnavailableError('embedding', 'openai')
  }

  async generateEmbeddings(_texts: string[]): Promise<number[][]> {
    throw new AIProviderUnavailableError('embedding', 'openai')
  }
}

/**
 * Placeholder for OpenAI completion provider.
 * NOT IMPLEMENTED — exists to show where future integration goes.
 */
export class OpenAICompletionProvider implements CompletionProvider {
  readonly name = 'openai'

  async isAvailable(): Promise<boolean> {
    return false
  }

  async complete(_prompt: string, _options?: CompletionOptions): Promise<CompletionResult> {
    throw new AIProviderUnavailableError('completion', 'openai')
  }
}

/**
 * Placeholder for Anthropic completion provider.
 */
export class AnthropicCompletionProvider implements CompletionProvider {
  readonly name = 'anthropic'

  async isAvailable(): Promise<boolean> {
    return false
  }

  async complete(_prompt: string, _options?: CompletionOptions): Promise<CompletionResult> {
    throw new AIProviderUnavailableError('completion', 'anthropic')
  }
}
