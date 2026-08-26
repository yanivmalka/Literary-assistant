// Regression tests for parseGeminiCandidate (supabase/functions/ask-question/index.ts),
// added to fix silent MAX_TOKENS truncation of QA answers (Test 3 of the E2E audit:
// combined sword + fire-rune question returned a mid-sentence cut-off answer that was
// persisted/returned identically to a normal STOP completion).
//
// index.ts calls Deno.serve(...) at module scope, so importing it directly would start
// a real HTTP listener (see qa-prompt-unchanged.test.ts / hybrid-search.test.ts, which
// work around the same constraint). Here, as in hybrid-search.test.ts, Deno.serve is
// stubbed to a no-op before the dynamic import and restored immediately after; the real
// request handler passed to it is never invoked by these tests.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// deno-lint-ignore no-explicit-any
const originalServe = (Deno as any).serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown: async () => {} });

const { parseGeminiCandidate } = await import("./index.ts");

// deno-lint-ignore no-explicit-any
(Deno as any).serve = originalServe;

function geminiResponse(finishReason: string, text: string): Record<string, unknown> {
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        finishReason,
      },
    ],
  };
}

Deno.test("parseGeminiCandidate: a normal STOP response is returned unchanged and not flagged truncated", () => {
  const data = geminiResponse("STOP", "The sword and the fire-rune are linked in Chapter 4.");

  const result = parseGeminiCandidate(data);

  assertEquals(result.answer, "The sword and the fire-rune are linked in Chapter 4.");
  assertEquals(result.finishReason, "STOP");
  assertEquals(result.truncated, false);
});

Deno.test("parseGeminiCandidate: a MAX_TOKENS response is detected as truncated rather than a complete answer", () => {
  const data = geminiResponse(
    "MAX_TOKENS",
    "The sword draws its power from the fire-rune etched into its hilt, which was forged",
  );

  const result = parseGeminiCandidate(data);

  // The partial text is still surfaced (callers may choose to show/log it),
  // but it must be explicitly distinguishable from a normal completion.
  assertEquals(
    result.answer,
    "The sword draws its power from the fire-rune etched into its hilt, which was forged",
  );
  assertEquals(result.finishReason, "MAX_TOKENS");
  assertEquals(result.truncated, true);
});

Deno.test("parseGeminiCandidate: a response with no finishReason is not misclassified as truncated", () => {
  const data: Record<string, unknown> = {
    candidates: [{ content: { parts: [{ text: "Answer with no finishReason field." }] } }],
  };

  const result = parseGeminiCandidate(data);

  assertEquals(result.answer, "Answer with no finishReason field.");
  assertEquals(result.finishReason, null);
  assertEquals(result.truncated, false);
});

Deno.test("parseGeminiCandidate: an empty candidates array yields an empty, non-truncated answer", () => {
  const result = parseGeminiCandidate({ candidates: [] });

  assertEquals(result.answer, "");
  assertEquals(result.finishReason, null);
  assertEquals(result.truncated, false);
});

// Golden-string regression: confirms the QA generationConfig actually bounds
// Gemini's thinking via thinkingConfig.thinkingLevel rather than only raising
// maxOutputTokens again — a live E2E run showed 2048 alone was not enough to
// stop MAX_TOKENS truncation, because unset thinkingConfig lets the model
// apply its own default thinking level out of the same maxOutputTokens pool
// as the visible answer. Every model in the fallback chain (gemini-3.5-flash,
// gemini-3.5-flash-lite, gemini-3.6-flash) is Gemini 3.x, which is controlled
// via thinkingLevel, not the Gemini 2.5-series thinkingBudget (a token count) —
// per Google's docs, thinkingBudget is only accepted on Gemini 3.x for
// backwards compatibility and isn't guaranteed to bound thinking-token use.
Deno.test("ask-question's QA generationConfig sets maxOutputTokens: 2048 and thinkingConfig.thinkingLevel (not the Gemini 2.5-only thinkingBudget)", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  const configBlockMatch = source.match(
    /generationConfig:\s*\{[\s\S]*?thinkingConfig:\s*\{[\s\S]*?\},\s*\},/,
  );
  if (!configBlockMatch) {
    throw new Error("Could not locate the QA generationConfig block in index.ts");
  }
  const configBlock = configBlockMatch[0];

  assertEquals(configBlock.includes("maxOutputTokens: 2048"), true);
  assertEquals(configBlock.includes('thinkingLevel: "low"'), true);
  // The surrounding comment legitimately mentions "thinkingBudget" by name to
  // explain why it isn't used; only the actual field key must be absent.
  assertEquals(configBlock.includes("thinkingBudget:"), false);
});
