// Phase 5.2 explicitly must not redesign or rewrite buildQAPrompt. ask-question/index.ts
// calls Deno.serve(...) at module scope, so it can't be imported directly in a test
// (that would start a server) — instead this asserts the exact literal template text
// is still present, byte-for-byte, as a golden-string regression check.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const EXPECTED_PROMPT_TEMPLATE = `You are a literary assistant helping an author understand their book. Answer the question based ONLY on the provided context from the book.

Rules:
- Only use information from the provided context passages.
- If the context does not contain enough information to answer, say: "I could not find sufficient information in the document to answer this question."
- Cite your sources using [Chapter X] or [Page Y] format where available.
- Be precise and factual. Do not invent or assume details not present in the text.
- Answer in the same language as the question.
- Keep your answer concise and focused.

\${entityInfo ? \`Known entities relevant to this question:\\n\${entityInfo}\\n\` : ""}Context passages from the book:
\${context}

Question: \${question}

Answer:\`;`;

Deno.test("buildQAPrompt's literal template text in ask-question/index.ts is unchanged", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(source.includes(EXPECTED_PROMPT_TEMPLATE), true);
});
