// ============================================
// HuggingFace Inference API Provider
// Free tier — used for completion (entity extraction, Q&A).
// Can also serve as fallback embedding provider.
// OPTIONAL dependency — system works without it.
// ============================================

import type { CompletionProvider, CompletionOptions, CompletionResult, EmbeddingProvider } from '../types.js'
import { AIProviderRateLimitError, AIProviderResponseError, AIProviderTimeoutError } from '../errors.js'

const HF_INFERENCE_URL = 'https://api-inference.huggingface.co/models'
const DEFAULT_TIMEOUT_MS = 60000

/**
 * HuggingFace Inference API for text completion.
 * Uses the free tier — rate-limited but zero cost.
 */
export class HuggingFaceCompletionProvider implements CompletionProvider {
  readonly name = 'huggingface'
  private model: string
  private apiKey: string

  constructor(model: string, apiKey: string) {
    this.model = model
    this.apiKey = apiKey
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.apiKey && this.model)
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
    if (!this.apiKey) {
      throw new AIProviderResponseError('huggingface', 'No API key configured')
    }

    const fullPrompt = options?.systemPrompt
      ? `<s>[INST] ${options.systemPrompt}\n\n${prompt} [/INST]`
      : `<s>[INST] ${prompt} [/INST]`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(`${HF_INFERENCE_URL}/${this.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: {
            max_new_tokens: options?.maxTokens ?? 1024,
            temperature: options?.temperature ?? 0.3,
            return_full_text: false,
          },
        }),
        signal: controller.signal,
      })

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        throw new AIProviderRateLimitError('huggingface', retryAfter ? parseInt(retryAfter) * 1000 : undefined)
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new AIProviderResponseError('huggingface', errorText, response.status)
      }

      const data = await response.json() as Array<{ generated_text: string }>
      const text = data[0]?.generated_text || ''

      return { text }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderTimeoutError('huggingface', DEFAULT_TIMEOUT_MS)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

/**
 * HuggingFace Inference API for embeddings.
 * Can be used as alternative to local embeddings when a specific model is needed.
 * Requires API key.
 */
export class HuggingFaceEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'huggingface'
  private model: string
  private apiKey: string
  private dims: number

  constructor(model: string, apiKey: string, dimensions: number) {
    this.model = model
    this.apiKey = apiKey
    this.dims = dimensions
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.apiKey && this.model)
  }

  getDimensions(): number {
    return this.dims
  }

  getModelName(): string {
    return this.model
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text])
    return results[0]
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new AIProviderResponseError('huggingface', 'No API key configured')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(`${HF_INFERENCE_URL}/${this.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: texts,
        }),
        signal: controller.signal,
      })

      if (response.status === 429) {
        throw new AIProviderRateLimitError('huggingface')
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new AIProviderResponseError('huggingface', errorText, response.status)
      }

      const data = await response.json() as number[][]
      return data
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderTimeoutError('huggingface', DEFAULT_TIMEOUT_MS)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}
