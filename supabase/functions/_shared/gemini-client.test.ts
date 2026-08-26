import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { callGeminiWithFallback, getCandidateSafetyBlockReason, resetCooldowns } from "./gemini-client.ts";
import { GEMINI_MODELS, DEFAULT_MODEL } from "./gemini-config.ts";

const MODEL_1 = "gemini-3.5-flash";
const MODEL_2 = "gemini-3.5-flash-lite";
const MODEL_3 = "gemini-3.6-flash";

function mockSuccess(text = "ok"): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 10 } }), { status: 200 });
}
function mockError(status: number, body = ""): Response {
  return new Response(body || `Error ${status}`, { status });
}
// A 2xx response whose only candidate carries a given finishReason and no text
// parts — the shape Gemini returns for a candidate-level safety block (e.g.
// PROHIBITED_CONTENT) or an unfinished MAX_TOKENS cutoff with zero output so far.
function mockCandidateFinish(finishReason: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason }], usageMetadata: { totalTokenCount: 10 } }),
    { status: 200 },
  );
}
// A 2xx response with a MAX_TOKENS finish that still carries partial answer
// text — this must be treated as a normal (if truncated) success, not a safety
// block: getGeminiResponseText finds real text, so the fallback loop never
// reaches the safety-block check at all.
function mockMaxTokensWithText(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "MAX_TOKENS" }], usageMetadata: { totalTokenCount: 500 } }),
    { status: 200 },
  );
}

let originalFetch: typeof globalThis.fetch;
let fetchCalls: string[] = [];

function getModelFromUrl(url: string): string {
  const match = url.match(/models\/([^:]+):generateContent/);
  return match ? match[1] : "";
}

function mockFetch(handler: (model: string, url: string) => Response) {
  originalFetch = globalThis.fetch;
  fetchCalls = [];
  globalThis.fetch = (input: any, _init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    fetchCalls.push(url);
    const model = getModelFromUrl(url);
    return Promise.resolve(handler(model, url));
  };
}
function restore() { globalThis.fetch = originalFetch; fetchCalls = []; }

const KEY = "test-key";
const PAYLOAD = { contents: [{ parts: [{ text: "test" }] }] };

Deno.test("Test 1: Primary model succeeds", async () => {
  resetCooldowns();
  mockFetch((model) => model === MODEL_1 ? mockSuccess() : mockError(500));
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success); if (r.success) assertEquals(r.modelUsed, MODEL_1);
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 2: Primary 429 -> fallback to second", async () => {
  resetCooldowns();
  mockFetch((model) => {
    if (model === MODEL_1) return mockError(429);
    if (model === MODEL_2) return mockSuccess();
    return mockError(500);
  });
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success); if (r.success) assertEquals(r.modelUsed, MODEL_2);
    assertEquals(fetchCalls.length, 2);
  } finally { restore(); }
});

Deno.test("Test 3: First two fail -> third succeeds", async () => {
  resetCooldowns();
  mockFetch((model) => {
    if (model === MODEL_1) return mockError(503);
    if (model === MODEL_2) return mockError(429);
    if (model === MODEL_3) return mockSuccess();
    return mockError(500);
  });
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success); if (r.success) assertEquals(r.modelUsed, MODEL_3);
    assertEquals(fetchCalls.length, 3);
  } finally { restore(); }
});

Deno.test("Test 4: All models fail -> 503", async () => {
  resetCooldowns();
  mockFetch(() => mockError(503));
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(!r.success);
    if (!r.success) { assertEquals(r.status, 503); assertEquals(r.modelUsed, null); }
    assertEquals(fetchCalls.length, 3);
  } finally { restore(); }
});

Deno.test("Test 5: 401 -> no fallback", async () => {
  resetCooldowns();
  mockFetch(() => mockError(401, "Invalid key"));
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(!r.success);
    if (!r.success) { assertEquals(r.status, 401); assertEquals(r.isRetriable, false); }
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 6: 400 -> no fallback", async () => {
  resetCooldowns();
  mockFetch(() => mockError(400, "Bad request"));
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(!r.success);
    if (!r.success) { assertEquals(r.status, 400); assertEquals(r.isRetriable, false); }
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 7: 403 -> no fallback", async () => {
  resetCooldowns();
  mockFetch(() => mockError(403));
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(!r.success);
    if (!r.success) assertEquals(r.isRetriable, false);
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 8: 500 -> fallback to second", async () => {
  resetCooldowns();
  mockFetch((model) => model === MODEL_1 ? mockError(500) : mockSuccess());
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success); if (r.success) assertEquals(r.modelUsed, MODEL_2);
  } finally { restore(); }
});

Deno.test("Test 9: 404 model not found -> fallback", async () => {
  resetCooldowns();
  mockFetch((model) => {
    if (model === MODEL_1) return mockError(404, '{"error":{"message":"model not found"}}');
    return mockSuccess();
  });
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success); if (r.success) assertEquals(r.modelUsed, MODEL_2);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// Candidate-level safety block (PROHIBITED_CONTENT / SAFETY) detection
// ---------------------------------------------------------------------------

Deno.test("Test 10: candidate-level PROHIBITED_CONTENT stops the fallback chain immediately", async () => {
  resetCooldowns();
  mockFetch((model) => {
    if (model === MODEL_1) return mockCandidateFinish("PROHIBITED_CONTENT");
    // MODEL_2 would succeed if reached — asserting it is never called is the point.
    return mockSuccess();
  });
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(!r.success);
    if (!r.success) {
      assertEquals(r.status, 422);
      assertEquals(r.modelUsed, MODEL_1);
      assertEquals(r.isRetriable, false);
    }
    // Must not fall back to a second model: a candidate-level safety block is
    // just as deterministic for this request as a prompt-level block.
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 11: candidate-level SAFETY finish is also treated as a safety block", async () => {
  resetCooldowns();
  mockFetch((model) => model === MODEL_1 ? mockCandidateFinish("SAFETY") : mockSuccess());
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(!r.success);
    if (!r.success) assertEquals(r.status, 422);
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 12: a MAX_TOKENS finish with real text is a normal success, not a safety block", async () => {
  resetCooldowns();
  mockFetch((model) => model === MODEL_1 ? mockMaxTokensWithText("partial answer text") : mockSuccess());
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success);
    if (r.success) {
      assertEquals(r.modelUsed, MODEL_1);
      const candidates = (r.data as { candidates?: Array<{ finishReason?: string }> }).candidates;
      assertEquals(candidates?.[0]?.finishReason, "MAX_TOKENS");
    }
    // Real (even truncated) text means the fallback loop never treats this as
    // an unusable response, so it never reaches the safety-block check.
    assertEquals(fetchCalls.length, 1);
  } finally { restore(); }
});

Deno.test("Test 13: existing 429/5xx/404 fallback behavior is unaffected by safety-block detection", async () => {
  // Re-assert the pre-existing transient-error fallback scenarios (Tests 2/3/8/9)
  // still hold now that the empty-response branch also checks candidate-level
  // finish reasons — a plain retriable HTTP error never reaches that check at all.
  resetCooldowns();
  mockFetch((model) => {
    if (model === MODEL_1) return mockError(429);
    if (model === MODEL_2) return mockSuccess();
    return mockError(500);
  });
  try {
    const r = await callGeminiWithFallback(PAYLOAD, KEY);
    assert(r.success); if (r.success) assertEquals(r.modelUsed, MODEL_2);
    assertEquals(fetchCalls.length, 2);
  } finally { restore(); }
});

Deno.test("getCandidateSafetyBlockReason: detects PROHIBITED_CONTENT on the first candidate", () => {
  const data = { candidates: [{ finishReason: "PROHIBITED_CONTENT" }] };
  assertEquals(getCandidateSafetyBlockReason(data), "PROHIBITED_CONTENT");
});

Deno.test("getCandidateSafetyBlockReason: detects SAFETY on the first candidate", () => {
  const data = { candidates: [{ finishReason: "SAFETY" }] };
  assertEquals(getCandidateSafetyBlockReason(data), "SAFETY");
});

Deno.test("getCandidateSafetyBlockReason: returns null for STOP", () => {
  const data = { candidates: [{ finishReason: "STOP" }] };
  assertEquals(getCandidateSafetyBlockReason(data), null);
});

Deno.test("getCandidateSafetyBlockReason: returns null for MAX_TOKENS", () => {
  const data = { candidates: [{ finishReason: "MAX_TOKENS" }] };
  assertEquals(getCandidateSafetyBlockReason(data), null);
});

Deno.test("getCandidateSafetyBlockReason: returns null with no candidates", () => {
  assertEquals(getCandidateSafetyBlockReason({ candidates: [] }), null);
  assertEquals(getCandidateSafetyBlockReason({}), null);
});

Deno.test("Config: correct model order", () => {
  assertEquals(DEFAULT_MODEL, "gemini-3.5-flash");
  assertEquals(GEMINI_MODELS[0].id, "gemini-3.5-flash");
  assertEquals(GEMINI_MODELS[1].id, "gemini-3.5-flash-lite");
  assertEquals(GEMINI_MODELS[2].id, "gemini-3.6-flash");
});

Deno.test("Config: the dead gemini-2.5-flash model is no longer in the fallback chain", () => {
  const ids = GEMINI_MODELS.map((m) => m.id);
  assert(!ids.includes("gemini-2.5-flash"));
});
