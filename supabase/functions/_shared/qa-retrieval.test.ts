import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildOrTsQuery, buildRetrievalTerms } from "./qa-retrieval.ts";

Deno.test("buildOrTsQuery joins terms as an OR tsquery with each term individually quoted", () => {
  assertEquals(buildOrTsQuery(["מי", "זה", "מירה"]), "'מי' | 'זה' | 'מירה'");
});

Deno.test("buildOrTsQuery escapes a literal single quote by doubling it", () => {
  assertEquals(buildOrTsQuery(["it's"]), "'it''s'");
});

Deno.test("buildOrTsQuery drops blank/whitespace-only terms", () => {
  assertEquals(buildOrTsQuery(["מירה", "  ", ""]), "'מירה'");
});

Deno.test("buildOrTsQuery returns an empty string for no usable terms", () => {
  assertEquals(buildOrTsQuery([]), "");
  assertEquals(buildOrTsQuery(["", "   "]), "");
});

Deno.test("buildOrTsQuery neutralizes tsquery operator characters by quoting the whole term", () => {
  // Characters like & | ! ( ) : are only meaningful to to_tsquery when
  // unquoted; wrapping each term in single quotes passes it through as a
  // literal lexeme instead of letting it be parsed as an operator.
  assertEquals(buildOrTsQuery(["a&b", "c|d", "e:f"]), "'a&b' | 'c|d' | 'e:f'");
});

Deno.test("buildRetrievalTerms output feeds directly into buildOrTsQuery without extra normalization", () => {
  const terms = buildRetrievalTerms("מי זה מירה?");
  assertEquals(terms, ["מי", "זה", "מירה"]);
  assertEquals(buildOrTsQuery(terms), "'מי' | 'זה' | 'מירה'");
});
