// ============================================
// Gemini Client with Multi-Model Fallback
// Executes requests against Gemini API with automatic fallback
// to alternative models on transient failures.
// ============================================

import {
  GEMINI_MODELS,
  type GeminiModelConfig,
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

function isModelInCooldown(modelId: string): boolean {
  const entry = cooldownMap.get(modelId);
  if (!entry) return false;

  if (Date.now() >= entry.cooldownUntil) {
    cooldownMap.delete(modelId);
    return false;
  }

  return entry.failureCount >= COOLDOWN_FAILURE_THRESHOLD;
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
// Rate-limit Backoff
// ============================================

/**
 * A 429 can be caused by a short request-rate window or by exhausted quota.
 * Do not blindly replay the same request: wait briefly, then let the existing
 * model fallback chain make one bounded alternative attempt.
 */
const MAX_429_BACKOFF_MS = 5_000;
const DEFAULT_429_BACKOFF_MS = 500;

function parseRetryDelayMs(response: Response, errorText: string): number | null {
  const retryAfter = response.headers.get("retry-after")?.trim();

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }

    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
  }

  // Gemini may return google.rpc.RetryInfo in the JSON error body instead of
  // an HTTP Retry-After header, for example: { "retryDelay": "2s" }.
  const retryDelayMatch = errorText.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
  if (retryDelayMatch) {
    const seconds = Number(retryDelayMatch[1]);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }
  }

  return null;
}

function get429BackoffMs(response: Response, errorText: string): number {
  const retryDelayMs = parseRetryDelayMs(response, errorText);
  if (retryDelayMs !== null) {
    return Math.min(retryDelayMs, MAX_429_BACKOFF_MS);
  }

  // Small jitter prevents concurrent edge invocations from retrying together.
  return DEFAULT_429_BACKOFF_MS + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Main Fallback Execution Engine
// ============================================

/**
 * Calls the Gemini API with automatic model fallback.
 *
 * Tries models in priority order (from GEMINI_MODELS config).
 * On 429, waits for a bounded Retry-After/retryDelay interval (or a short
 * jittered delay) before falling back to the next model. Other retriable
 * errors (5xx, timeout, model unavailable) fall back immediately.
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
    /** Select a server-side allowlisted model profile. */
    models?: GeminiModelConfig[];
  }
): Promise<GeminiCallResult | GeminiCallError> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const fallbackChain: FallbackAttempt[] = [];
  const modelsToTry = (options?.models ?? GEMINI_MODELS)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
    const modelId = modelsToTry[modelIndex].id;

    if (isModelInCooldown(modelId)) {
      fallbackChain.push({
        model: modelId,
        status: null,
        skipped: true,
        reason: "model cooldown",
        timestampMs: Date.now(),
      });
      console.log(`[Gemini Fallback] Skipping model in cooldown: ${modelId}`);
      continue;
    }

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
        const data = await response.json();
        const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }).candidates || [];
        const hasText = candidates.some((candidate) =>
          (candidate.content?.parts || []).some((part) =>
            typeof part.text === "string" && part.text.trim().length > 0,
          ),
        );

        // A successful HTTP response can still be unusable (for example when
        // the model is blocked or returns only metadata/thought parts). Treat
        // that as a retriable model failure so another configured model gets
        // a chance instead of returning an empty extraction as success.
        if (!hasText) {
          const reason = "Model returned no text candidate";
          console.warn(`[Gemini Fallback] ${reason}: ${modelId}`);
          fallbackChain.push({
            model: modelId,
            status: response.status,
            error: reason,
            reason: "empty model response",
            timestampMs: Date.now(),
          });
          recordModelFailure(modelId);
          continue;
        }

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
      if (status === 429 && modelIndex < modelsToTry.length - 1) {
        const backoffMs = get429BackoffMs(response, errorText);
        console.warn(
          `[Gemini Fallback] Rate limited by ${modelId}. Waiting ${backoffMs}ms before trying the next model.`
        );
        await sleep(backoffMs);
      }

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
