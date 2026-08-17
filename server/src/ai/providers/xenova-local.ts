// ============================================
// Xenova/Transformers.js Local Embedding Provider
// Runs entirely locally — zero API calls, zero cost.
// Uses ONNX runtime via @xenova/transformers.
// This is the DEFAULT embedding provider for development.
// ============================================

import type { EmbeddingProvider } from '../types.js'

/**
 * Local embedding provider using @xenova/transformers.
 * Loads the model on first use and caches it for subsequent calls.
 * Supports multilingual models (can be swapped for Hebrew-optimized model).
 */
export class XenovaLocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'xenova-local'
  private model: string
  private dimensions: number
  private pipeline: unknown | null = null
  private loading: Promise<void> | null = null

  constructor(model: string, dimensions: number) {
    this.model = model
    this.dimensions = dimensions
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if @xenova/transformers is importable
      await import('@xenova/transformers')
      return true
    } catch {
      return false
    }
  }

  getDimensions(): number {
    return this.dimensions
  }

  getModelName(): string {
    return this.model
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text])
    return embeddings[0]
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.ensureLoaded()

    const pipelineFn = this.pipeline as (texts: string[], options: Record<string, unknown>) => Promise<{ tolist(): number[][] }>
    const output = await pipelineFn(texts, { pooling: 'mean', normalize: true })
    return output.tolist()
  }

  private async ensureLoaded(): Promise<void> {
    if (this.pipeline) return
    if (this.loading) {
      await this.loading
      return
    }

    this.loading = (async () => {
      const { pipeline } = await import('@xenova/transformers')
      this.pipeline = await pipeline('feature-extraction', this.model)
    })()

    await this.loading
  }
}

/**
 * Known local embedding models and their dimensions.
 * When adding a new model, add its dimension count here.
 */
export const KNOWN_LOCAL_MODELS: Record<string, number> = {
  'Xenova/all-MiniLM-L6-v2': 384,
  'Xenova/multilingual-e5-small': 384,
  'Xenova/multilingual-e5-base': 768,
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2': 384,
}

/**
 * Resolve dimensions for a model name.
 * Returns the known dimension or falls back to a default.
 */
export function resolveModelDimensions(model: string, fallback: number = 384): number {
  return KNOWN_LOCAL_MODELS[model] ?? fallback
}
