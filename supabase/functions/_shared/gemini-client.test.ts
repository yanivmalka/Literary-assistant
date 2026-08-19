import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { callGeminiWithFallback, resetCooldowns } from "./gemini-client.ts";
import { GEMINI_MODELS, DEFAULT_MODEL } from "./gemini-config.ts";

const MODEL_1 = "gemini-3.5-flash";
const MODEL_2 = "gemini-3.5-flash-lite";
const MODEL_3 = "gemini-2.5-flash";

function mockSuccess(text = "ok"): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 10 } }), { status: 200 });
}
function mockError(status: number, body = ""): Response {
  return new Response(body || `Error ${status}`, { status });
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

Deno.test("Config: correct model order", () => {
  assertEquals(DEFAULT_MODEL, "gemini-3.5-flash");
  assertEquals(GEMINI_MODELS[0].id, "gemini-3.5-flash");
  assertEquals(GEMINI_MODELS[1].id, "gemini-3.5-flash-lite");
  assertEquals(GEMINI_MODELS[2].id, "gemini-2.5-flash");
});
