// ============================================
// Gemini Model Configuration
// Central configuration for all Gemini models and fallback behavior.
// ============================================

export interface GeminiModelConfig {
  /** Model identifier as used in the Gemini API URL */
  id: string;
  /** Priority order (lower = higher priority) */
  priority: number;
}

export type GeminiModelProfile =
  | "sub-base"
  | "sub-base-2"
  | "sub-base-locations"
  | "sub-base-c-characters";

/**
 * Ordered list of Gemini models used by the active extraction behavior.
 * Keep this export unchanged for callers that use the current behavior.
 */
export const GEMINI_MODELS: GeminiModelConfig[] = [
  { id: "gemini-3.5-flash", priority: 1 },
  { id: "gemini-3.5-flash-lite", priority: 2 },
  { id: "gemini-2.5-flash", priority: 3 },
];

/**
 * Model profiles are intentionally separate so they can evolve independently.
 * The sub-base-2 profile currently mirrors the sub-base profile exactly;
 * change only that profile when developing its extraction model or fallback chain.
 */
export const GEMINI_MODEL_PROFILES: Record<GeminiModelProfile, GeminiModelConfig[]> = {
  "sub-base": GEMINI_MODELS,
  "sub-base-2": [
    { id: "gemini-3.5-flash", priority: 1 },
    { id: "gemini-3.5-flash-lite", priority: 2 },
    { id: "gemini-2.5-flash", priority: 3 },
  ],
  "sub-base-locations": [
    { id: "gemini-3.5-flash", priority: 1 },
    { id: "gemini-3.5-flash-lite", priority: 2 },
    { id: "gemini-2.5-flash", priority: 3 },
  ],
  // Model A is intentionally isolated from the legacy profiles. "gemini-2.5-flash-lite"
  // is not a real Gemini model ID (it 404s) and was never used anywhere else in this
  // codebase; every other profile falls back to "gemini-3.5-flash", a model that is
  // already proven to work, so Model A does the same instead of inventing a new ID.
  "sub-base-c-characters": [
    { id: "gemini-3.5-flash-lite", priority: 1 },
    { id: "gemini-3.5-flash", priority: 2 },
  ],
};

export const DEFAULT_MODEL_PROFILE: GeminiModelProfile = "sub-base";

/** Default model to use (highest priority) */
export const DEFAULT_MODEL = GEMINI_MODELS[0].id;

export function isGeminiModelProfile(value: unknown): value is GeminiModelProfile {
  return value === "sub-base"
    || value === "sub-base-2"
    || value === "sub-base-locations"
    || value === "sub-base-c-characters";
}

/** Base URL for Gemini API */
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Cooldown duration in milliseconds.
 * When a model fails with a retriable error, it's marked unavailable for this period.
 */
export const MODEL_COOLDOWN_MS = 60_000; // 1 minute

/**
 * Maximum number of failures before a model enters cooldown.
 * A single 429/5xx is enough to trigger immediate fallback within a request,
 * but the cooldown marker prevents future requests from retrying a known-bad model.
 */
export const COOLDOWN_FAILURE_THRESHOLD = 1;

/**
 * HTTP status codes and error conditions that trigger fallback to the next model.
 * These represent transient/availability issues, not client-side errors.
 */
export const RETRIABLE_STATUS_CODES = new Set([
  429, // Rate limit / quota exceeded
  500, // Internal server error
  502, // Bad gateway
  503, // Service unavailable
  504, // Gateway timeout
]);

/**
 * Error messages (partial match) that indicate model unavailability.
 * Used when the HTTP status alone isn't sufficient to determine retriability.
 */
export const RETRIABLE_ERROR_PATTERNS = [
  "model not found",
  "model is not available",
  "no longer available",
  "is not available",
  "resource exhausted",
  "quota exceeded",
  "temporarily unavailable",
  "deadline exceeded",
  "timeout",
  "overloaded",
];

/**
 * HTTP status codes that should NOT trigger fallback.
 * These indicate issues with the request itself, not model availability.
 */
export const NON_RETRIABLE_STATUS_CODES = new Set([
  400, // Bad request (malformed input)
  401, // Unauthorized (invalid API key)
  403, // Forbidden (permission issue)
  404, // Not found (but only for non-model resources)
]);

/**
 * Determines whether an error is retriable (should trigger fallback).
 */
export function isRetriableError(status: number, errorBody?: string): boolean {
  // Explicit non-retriable codes
  if (NON_RETRIABLE_STATUS_CODES.has(status)) {
    // Special case: 404 with "model not found" IS retriable
    if (status === 404 && errorBody) {
      const lower = errorBody.toLowerCase();
      if (RETRIABLE_ERROR_PATTERNS.some((p) => lower.includes(p))) {
        return true;
      }
    }
    return false;
  }

  // Explicit retriable codes
  if (RETRIABLE_STATUS_CODES.has(status)) {
    return true;
  }

  // Check error body for retriable patterns
  if (errorBody) {
    const lower = errorBody.toLowerCase();
    return RETRIABLE_ERROR_PATTERNS.some((p) => lower.includes(p));
  }

  return false;
}
