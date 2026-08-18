// ============================================
// Gemini Client with Multi-Model Fallback
// Executes requests against Gemini API with automatic fallback
// to alternative models on transient failures.
// ============================================

import {
  GEMINI_MODELS,
  GEMINI_API_BASE,
  MODEL_COOLDOWN_MS,
  COOLDOWN_FAILURE_THRESHOLD,
  isRetriableError,
} from "./gemini-config.ts";

// ============================================
// Types
// ============================================

export interface GeminiRequestPayload {
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig?: Record<string, unknown>;
}

export interface GeminiCallResult {
  success: true;
  data: Record<string, unknown>;
  modelUsed: string;
  latencyMs: number;
  fallbackChain: FallbackAttempt[];
}

export interface GeminiCallError {
  success: false;
  error: string;
  status: number;
  details?: string;
  modelUsed: string | null;
  isRetriable: boolean;
  fallbackChain: FallbackAttempt[];
}

export interface FallbackAttempt {
  model: string;
  status: number | null;
  error?: string;
  skipped?: boolean;
  reason?: string;
  timestampMs: number;
}

// ============================================
// In-Memory Cooldown Tracker
// Simple per-isolate cooldown. Each Deno edge function isolate
// maintains its own cooldown state. This is intentionally simple:
// no shared state across isolates, no persistence.
// ============================================

interface CooldownEntry {
  failureCount: number;
  cooldownUntil: number; // Unix timestamp ms
}

const cooldownMap = new Map<string, CooldownEntry>();

function isModelInCooldown(modelId: string): boolean {
  const entry = cooldownMap.get(modelId);
  if (!entry) return false;

  if (Date.now() >= entry.cooldownUntil) {
    // Cooldown expired, reset
    cooldownMap.delete(modelId);
    return false;
  }

  return false; // Disabled: Edge Function isolates don't persist state between invocations
}

function recordModelFailure(modelId: string): void {
  const entry = cooldownMap.get(modelId);
  if (entry) {
    entry.failureCount++;
    entry.cooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
  } else {
    cooldownMap.set(modelId, {
      failureCount: 1,
      cooldownUntil: Date.now() + MODEL_COOLDOWN_MS,
    });
  }
}

/** Exposed for testing: reset all cooldowns */
export function resetCooldowns(): void {
  cooldownMap.clear();
}

/** Exposed for testing: manually set cooldown */
export function setCooldown(modelId: string, failureCount: number, cooldownUntil: number): void {
  cooldownMap.set(modelId, { failureCount, cooldownUntil });
}

// ============================================
// Main Fallback Execution Engine
// ============================================

/**
 * Calls the Gemini API with automatic model fallback.
 *
 * Tries models in priority order (from GEMINI_MODELS config).
 * On retriable errors (429, 5xx, timeout, model unavailable),
 * falls back to the next model.
 * On non-retriable errors (401, 403, 400), fails immediately.
 *
 * @param payload - The Gemini API request body
 * @param apiKey - The Gemini API key
 * @param options - Optional overrides
 * @returns GeminiCallResult on success, GeminiCallError on failure
 */
export async function callGeminiWithFallback(
  payload: GeminiRequestPayload,
  apiKey: string,
  options?: {
    /** Override the timeout per request (ms). Default: 30000 */
    timeoutMs?: number;
  }
): Promise<GeminiCallResult | GeminiCallError> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const fallbackChain: FallbackAttempt[] = [];
  const modelsToTry = GEMINI_MODELS.slice().sort((a, b) => a.priority - b.priority);

  for (const modelConfig of modelsToTry) {
    const modelId = modelConfig.id;

    // Note: Cooldown is not used in serverless edge functions (no persistent state between invocations)

    const url = `${GEMINI_API_BASE}/${modelId}:generateContent?key=${apiKey}`;
    const startTime = Date.now();

    try {
      console.log(`[Gemini Fallback] Trying model: ${modelId}`);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        // Success
        const data = await response.json();
        console.log(
          `[Gemini Fallback] Success with ${modelId} (${latencyMs}ms)`
        );

        fallbackChain.push({
          model: modelId,
          status: response.status,
          timestampMs: Date.now(),
        });

        return {
          success: true,
          data,
          modelUsed: modelId,
          latencyMs,
          fallbackChain,
        };
      }

      // Request failed - determine if retriable
      const errorText = await response.text().catch(() => "");
      const status = response.status;
      const retriable = isRetriableError(status, errorText);

      fallbackChain.push({
        model: modelId,
        status,
        error: errorText.slice(0, 200),
        reason: retriable ? "retriable error" : "non-retriable error",
        timestampMs: Date.now(),
      });

      if (!retriable) {
        // Non-retriable error: stop immediately, no fallback
        console.log(
          `[Gemini Fallback] Non-retriable error from ${modelId} (HTTP ${status}). Stopping.`
        );
        return {
          success: false,
          error: `Gemini error (HTTP ${status})`,
          status,
          details: errorText.slice(0, 500),
          modelUsed: modelId,
          isRetriable: false,
          fallbackChain,
        };
      }

      // Retriable error: try next model. Only cooldown on transient errors (429/5xx), not permanent ones (404)
      console.log(
        `[Gemini Fallback] Retriable error from ${modelId} (HTTP ${status}). Falling back.`
      );
      if (status === 429 || status >= 500) {
        recordModelFailure(modelId);
      }
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      // Determine if this is a timeout or network error (retriable)
      const isTimeout =
        err instanceof DOMException && err.name === "AbortError";
      const isNetworkError =
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("network") ||
        errorMessage.includes("connection");
      const retriable = isTimeout || isNetworkError;

      fallbackChain.push({
        model: modelId,
        status: null,
        error: isTimeout ? `Timeout after ${timeoutMs}ms` : errorMessage.slice(0, 200),
        reason: retriable ? "timeout/network error" : "unexpected error",
        timestampMs: Date.now(),
      });

      if (!retriable) {
        console.error(
          `[Gemini Fallback] Unexpected error with ${modelId} (${latencyMs}ms): ${errorMessage}`
        );
        return {
          success: false,
          error: `Unexpected error: ${errorMessage}`,
          status: 500,
          modelUsed: modelId,
          isRetriable: false,
          fallbackChain,
        };
      }

      console.log(
        `[Gemini Fallback] ${isTimeout ? "Timeout" : "Network error"} with ${modelId} (${latencyMs}ms). Falling back.`
      );
      recordModelFailure(modelId);
    }
  }

  // All models exhausted
  console.error("[Gemini Fallback] All models exhausted. No available model.");
  return {
    success: false,
    error: "All Gemini models unavailable. Please try again later.",
    status: 503,
    modelUsed: null,
    isRetriable: true,
    fallbackChain,
  };
}
