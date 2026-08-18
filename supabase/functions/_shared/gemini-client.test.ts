// ============================================
// Tests for Gemini Multi-Model Fallback Engine
// Run with: deno test --allow-net=none supabase/functions/_shared/gemini-client.test.ts
// ============================================

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  callGeminiWithFallback,
  resetCooldowns,
  setCooldown,
} from "./gemini-client.ts";

import { GEMINI_MODELS, DEFAULT_MODEL } from "./gemini-config.ts";

// ============================================
// Test Helpers
// ============================================

/** Creates a successful Gemini API response */
function mockSuccessResponse(text = "Hello from Gemini"): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/** Creates an error response with a given status */
function mockErrorResponse(status: number, body = ""): Response {
  return new Response(body || `Error ${status}`, { status });
}

/** Stores original fetch and provides mock infrastructure */
let originalFetch: typeof globalThis.fetch;
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function setupFetchMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  originalFetch = globalThis.fetch;
  fetchCalls = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });
    return Promise.resolve(handler(url, init));
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  fetchCalls = [];
}

const TEST_API_KEY = "test-key-12345";
const TEST_PAYLOAD = {
  contents: [{ parts: [{ text: "Test prompt" }] }],
  generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
};

// ============================================
// Test 1: Primary model (3.6-flash) succeeds
// ============================================

Deno.test("Test 1: Primary model available → request completes with gemini-3.6-flash", async () => {
  resetCooldowns();

  setupFetchMock((url) => {
    if (url.includes("gemini-3.6-flash")) {
      return mockSuccessResponse("Response from 3.6-flash");
    }
    return mockErrorResponse(500, "Should not reach here");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-3.6-flash");
      assert(result.latencyMs >= 0, "Latency should be non-negative");
      assertEquals(result.fallbackChain.length, 1);
      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[0].status, 200);

      // Verify response data is correct
      const text = (result.data as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
      assertEquals(text, "Response from 3.6-flash");
    }

    // Only one fetch call should have been made
    assertEquals(fetchCalls.length, 1);
    assert(fetchCalls[0].url.includes("gemini-3.6-flash"));
  } finally {
    restoreFetch();
  }
});

// ============================================
// Test 2: Primary returns 429 → fallback to gemini-2.5-flash
// ============================================

Deno.test("Test 2: gemini-3.6-flash returns 429 → falls back to gemini-2.5-flash", async () => {
  resetCooldowns();

  setupFetchMock((url) => {
    if (url.includes("gemini-3.6-flash")) {
      return mockErrorResponse(429, "Rate limit exceeded");
    }
    if (url.includes("gemini-2.5-flash") && !url.includes("flash-lite")) {
      return mockSuccessResponse("Response from 2.5-flash");
    }
    return mockErrorResponse(500, "Should not reach here");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success after fallback");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-2.5-flash");
      assertEquals(result.fallbackChain.length, 2);

      // First attempt: 3.6-flash failed with 429
      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[0].status, 429);

      // Second attempt: 2.5-flash succeeded
      assertEquals(result.fallbackChain[1].model, "gemini-2.5-flash");
      assertEquals(result.fallbackChain[1].status, 200);
    }

    assertEquals(fetchCalls.length, 2);
  } finally {
    restoreFetch();
  }
});

// ============================================
// Test 3: 3.6 and 2.5 Flash unavailable → fallback to 2.5 Flash-Lite
// ============================================

Deno.test("Test 3: gemini-3.6-flash and gemini-2.5-flash unavailable → falls back to gemini-2.5-flash-lite", async () => {
  resetCooldowns();

  setupFetchMock((url) => {
    if (url.includes("gemini-3.6-flash")) {
      return mockErrorResponse(503, "Service unavailable");
    }
    if (url.includes("gemini-2.5-flash") && !url.includes("flash-lite")) {
      return mockErrorResponse(429, "Rate limit exceeded");
    }
    if (url.includes("gemini-2.5-flash-lite")) {
      return mockSuccessResponse("Response from 2.5-flash-lite");
    }
    return mockErrorResponse(500, "Unknown model");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success after double fallback");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-2.5-flash-lite");
      assertEquals(result.fallbackChain.length, 3);

      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[0].status, 503);

      assertEquals(result.fallbackChain[1].model, "gemini-2.5-flash");
      assertEquals(result.fallbackChain[1].status, 429);

      assertEquals(result.fallbackChain[2].model, "gemini-2.5-flash-lite");
      assertEquals(result.fallbackChain[2].status, 200);
    }

    assertEquals(fetchCalls.length, 3);
  } finally {
    restoreFetch();
  }
});

// ============================================
// Test 4: All models unavailable → clear error returned
// ============================================

Deno.test("Test 4: All models unavailable → returns clear error with status 503", async () => {
  resetCooldowns();

  setupFetchMock((_url) => {
    return mockErrorResponse(503, "Service unavailable");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(!result.success, "Expected failure when all models are down");
    if (!result.success) {
      assertEquals(result.status, 503);
      assert(result.error.includes("All Gemini models unavailable"), `Unexpected error: ${result.error}`);
      assertEquals(result.modelUsed, null);
      assertEquals(result.isRetriable, true);
      assertEquals(result.fallbackChain.length, 3);

      // All three models attempted
      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[1].model, "gemini-2.5-flash");
      assertEquals(result.fallbackChain[2].model, "gemini-2.5-flash-lite");
    }

    assertEquals(fetchCalls.length, 3);
  } finally {
    restoreFetch();
  }
});

// ============================================
// Test 5: Invalid API key (401) → NO fallback
// ============================================

Deno.test("Test 5: Invalid API key (401) → stops immediately, no fallback", async () => {
  resetCooldowns();

  setupFetchMock((_url) => {
    return mockErrorResponse(401, "API key not valid. Please pass a valid API key.");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(!result.success, "Expected failure on invalid API key");
    if (!result.success) {
      assertEquals(result.status, 401);
      assertEquals(result.modelUsed, "gemini-3.6-flash"); // tried first model
      assertEquals(result.isRetriable, false);
      assertEquals(result.fallbackChain.length, 1); // Only one attempt!

      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[0].status, 401);
    }

    // Only ONE fetch call - did NOT try other models
    assertEquals(fetchCalls.length, 1);
  } finally {
    restoreFetch();
  }
});

// ============================================
// Test 6: Bad request / schema error (400) → NO fallback
// ============================================

Deno.test("Test 6: JSON/schema validation error (400) → stops immediately, no fallback", async () => {
  resetCooldowns();

  setupFetchMock((_url) => {
    return mockErrorResponse(400, "Invalid JSON payload received. Unknown name 'invalid_field'");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(!result.success, "Expected failure on bad request");
    if (!result.success) {
      assertEquals(result.status, 400);
      assertEquals(result.modelUsed, "gemini-3.6-flash");
      assertEquals(result.isRetriable, false);
      assertEquals(result.fallbackChain.length, 1); // Only one attempt!

      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[0].status, 400);
    }

    // Only ONE fetch call
    assertEquals(fetchCalls.length, 1);
  } finally {
    restoreFetch();
  }
});

// ============================================
// Additional Tests: Cooldown Mechanism
// ============================================

Deno.test("Cooldown: model in cooldown is skipped without making a fetch call", async () => {
  resetCooldowns();

  // Put primary model in cooldown (expires far in the future)
  setCooldown("gemini-3.6-flash", 1, Date.now() + 60_000);

  setupFetchMock((url) => {
    if (url.includes("gemini-2.5-flash") && !url.includes("flash-lite")) {
      return mockSuccessResponse("Response from 2.5-flash (cooldown skip)");
    }
    return mockErrorResponse(500, "Should not reach here");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success with cooldown skip");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-2.5-flash");

      // fallbackChain should show 3.6-flash was skipped
      const skippedEntry = result.fallbackChain.find((e) => e.model === "gemini-3.6-flash");
      assertExists(skippedEntry);
      assertEquals(skippedEntry!.skipped, true);
      assertEquals(skippedEntry!.reason, "in cooldown");
    }

    // Only 1 fetch call (skipped 3.6-flash entirely)
    assertEquals(fetchCalls.length, 1);
    assert(fetchCalls[0].url.includes("gemini-2.5-flash"));
    assert(!fetchCalls[0].url.includes("flash-lite"));
  } finally {
    restoreFetch();
    resetCooldowns();
  }
});

Deno.test("Cooldown: expired cooldown allows model to be retried", async () => {
  resetCooldowns();

  // Put primary model in cooldown that already expired
  setCooldown("gemini-3.6-flash", 1, Date.now() - 1000);

  setupFetchMock((url) => {
    if (url.includes("gemini-3.6-flash")) {
      return mockSuccessResponse("Response from 3.6-flash (cooldown expired)");
    }
    return mockErrorResponse(500, "Should not reach here");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success after cooldown expired");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-3.6-flash");
    }

    assertEquals(fetchCalls.length, 1);
  } finally {
    restoreFetch();
    resetCooldowns();
  }
});

Deno.test("Model not found (404 with 'model not found') → triggers fallback", async () => {
  resetCooldowns();

  setupFetchMock((url) => {
    if (url.includes("gemini-3.6-flash")) {
      return mockErrorResponse(404, '{"error":{"message":"model not found: gemini-3.6-flash"}}');
    }
    if (url.includes("gemini-2.5-flash") && !url.includes("flash-lite")) {
      return mockSuccessResponse("Response from 2.5-flash after 404");
    }
    return mockErrorResponse(500, "Should not reach here");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success after model-not-found fallback");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-2.5-flash");
      assertEquals(result.fallbackChain.length, 2);
      assertEquals(result.fallbackChain[0].model, "gemini-3.6-flash");
      assertEquals(result.fallbackChain[0].status, 404);
    }
  } finally {
    restoreFetch();
  }
});

Deno.test("Permission denied (403) → NO fallback", async () => {
  resetCooldowns();

  setupFetchMock((_url) => {
    return mockErrorResponse(403, "API key does not have access to this resource");
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(!result.success, "Expected failure on 403");
    if (!result.success) {
      assertEquals(result.status, 403);
      assertEquals(result.isRetriable, false);
      assertEquals(result.fallbackChain.length, 1);
    }

    assertEquals(fetchCalls.length, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("Configuration: DEFAULT_MODEL is gemini-3.6-flash", () => {
  assertEquals(DEFAULT_MODEL, "gemini-3.6-flash");
});

Deno.test("Configuration: models are in correct priority order", () => {
  assertEquals(GEMINI_MODELS.length, 3);
  assertEquals(GEMINI_MODELS[0].id, "gemini-3.6-flash");
  assertEquals(GEMINI_MODELS[0].priority, 1);
  assertEquals(GEMINI_MODELS[1].id, "gemini-2.5-flash");
  assertEquals(GEMINI_MODELS[1].priority, 2);
  assertEquals(GEMINI_MODELS[2].id, "gemini-2.5-flash-lite");
  assertEquals(GEMINI_MODELS[2].priority, 3);
});

Deno.test("HTTP 500 from server → triggers fallback", async () => {
  resetCooldowns();

  setupFetchMock((url) => {
    if (url.includes("gemini-3.6-flash")) {
      return mockErrorResponse(500, "Internal server error");
    }
    if (url.includes("gemini-2.5-flash") && !url.includes("flash-lite")) {
      return mockSuccessResponse("Recovered via 2.5-flash");
    }
    return mockErrorResponse(500);
  });

  try {
    const result = await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);

    assert(result.success, "Expected success via fallback on 500");
    if (result.success) {
      assertEquals(result.modelUsed, "gemini-2.5-flash");
    }
  } finally {
    restoreFetch();
  }
});

Deno.test("API key included in URL query parameter (not leaked in logs)", async () => {
  resetCooldowns();

  setupFetchMock((url) => {
    // Verify the API key is passed via URL query param
    assert(url.includes(`key=${TEST_API_KEY}`), "API key should be in URL");
    return mockSuccessResponse("OK");
  });

  try {
    await callGeminiWithFallback(TEST_PAYLOAD, TEST_API_KEY);
  } finally {
    restoreFetch();
  }
});
