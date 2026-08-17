// ============================================
// AI Abstraction Layer — Type Definitions
// All providers are optional. The system must function
// (at reduced capability) even with no AI provider available.
// ============================================

/**
 * Base interface for all AI providers.
 */
export interface AIProvider {
  /** Human-readable provider name */
  readonly name: string
  /** Check if the provider is currently available and configured */
  isAvailable(): Promise<boolean>
}

/**
 * Embedding provider interface.
 * Generates vector embeddings from text.
 * The dimensions and model are NOT hard-coded — they come from the provider config.
 */
export interface EmbeddingProvider extends AIProvider {
  /** Generate embedding vector for a single text */
  generateEmbedding(text: string): Promise<number[]>
  /** Generate embeddings for multiple texts (batch) */
  generateEmbeddings(texts: string[]): Promise<number[][]>
  /** The number of dimensions this model produces (e.g. 384, 768, 1024) */
  getDimensions(): number
  /** The model identifier (stored alongside embeddings for staleness detection) */
  getModelName(): string
}

/**
 * Completion/chat provider interface.
 * Used for entity extraction, Q&A, and other text generation tasks.
 */
export interface CompletionProvider extends AIProvider {
  /** Generate a completion for the given prompt */
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult>
}

/**
 * Options for completion requests.
 */
export interface CompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Temperature (0-1, lower = more deterministic) */
  temperature?: number
  /** System prompt / instruction */
  systemPrompt?: string
  /** Whether to expect JSON output */
  expectJson?: boolean
}

/**
 * Result from a completion request.
 */
export interface CompletionResult {
  text: string
  /** Token usage if available */
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/**
 * Structured entity as extracted by AI from text.
 */
export interface ExtractedEntity {
  name: string
  type: EntityType
  aliases?: string[]
  attributes?: Record<string, string>
  context?: string
}

/**
 * Entity types the system can recognize.
 */
export type EntityType =
  | 'character'
  | 'location'
  | 'country'
  | 'continent'
  | 'region'
  | 'object'
  | 'ability'
  | 'magic_system'
  | 'event'

/**
 * Provider configuration loaded from environment.
 */
export interface AIConfig {
  embedding: {
    provider: string       // 'xenova-local' | 'huggingface' | 'openai' | ...
    model: string          // model identifier
  }
  completion: {
    provider: string       // 'huggingface' | 'openai' | 'anthropic' | ...
    model: string          // model identifier
    apiKey?: string        // API key if required
  }
}

/**
 * Status of the AI subsystem.
 */
export interface AIStatus {
  embedding: {
    provider: string
    model: string
    dimensions: number
    available: boolean
    error?: string
  }
  completion: {
    provider: string
    model: string
    available: boolean
    error?: string
  }
}
