// ============================================
// AI Abstraction Layer — Error Types
// ============================================

/**
 * Thrown when no AI provider is configured or available for a task.
 * The system should handle this gracefully (skip the stage, report to user).
 */
export class AIProviderUnavailableError extends Error {
  public readonly providerType: 'embedding' | 'completion'
  public readonly configuredProvider: string | undefined

  constructor(providerType: 'embedding' | 'completion', configuredProvider?: string) {
    const message = configuredProvider
      ? `AI provider '${configuredProvider}' for ${providerType} is not available`
      : `No AI provider configured for ${providerType}`
    super(message)
    this.name = 'AIProviderUnavailableError'
    this.providerType = providerType
    this.configuredProvider = configuredProvider
  }
}

/**
 * Thrown when an AI provider API call times out.
 */
export class AIProviderTimeoutError extends Error {
  public readonly provider: string
  public readonly timeoutMs: number

  constructor(provider: string, timeoutMs: number) {
    super(`AI provider '${provider}' timed out after ${timeoutMs}ms`)
    this.name = 'AIProviderTimeoutError'
    this.provider = provider
    this.timeoutMs = timeoutMs
  }
}

/**
 * Thrown when an AI provider returns a rate limit error.
 */
export class AIProviderRateLimitError extends Error {
  public readonly provider: string
  public readonly retryAfterMs?: number

  constructor(provider: string, retryAfterMs?: number) {
    super(`AI provider '${provider}' rate limit exceeded${retryAfterMs ? `. Retry after ${retryAfterMs}ms` : ''}`)
    this.name = 'AIProviderRateLimitError'
    this.provider = provider
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Thrown when an AI provider returns an unexpected response.
 */
export class AIProviderResponseError extends Error {
  public readonly provider: string
  public readonly statusCode?: number

  constructor(provider: string, message: string, statusCode?: number) {
    super(`AI provider '${provider}' error: ${message}`)
    this.name = 'AIProviderResponseError'
    this.provider = provider
    this.statusCode = statusCode
  }
}
