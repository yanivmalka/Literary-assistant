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
