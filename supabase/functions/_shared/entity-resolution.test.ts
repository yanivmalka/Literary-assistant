import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyEntityOverrides,
  hasConflictingEntityContext,
  resolveEntityCandidate,
  resolveExtractionCandidate,
} from "./entity-resolution.ts";

const mainDavid = {
  id: "uuid-david-king",
  canonical_name: "David",
  entity_type: "character",
  description: "David is the king's son",
  structured_fields: { narrative_role: "king's son", age: "18" },
  attributes: {},
};

const cityGuardDavid = {
  id: "uuid-david-guard",
  canonical_name: "David",
  entity_type: "character",
  description: "David serves as a city guard",
  structured_fields: { narrative_role: "city guard" },
  attributes: {},
};

Deno.test("same name and matching context resolves to the existing UUID", () => {
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "David",
      entity_type: "character",
      description: "David is the king's son",
      structured_fields: { narrative_role: "king's son", age: "18" },
      attributes: {},
    },
    [mainDavid],
  );

  assertEquals(resolved?.id, "uuid-david-king");
});

Deno.test("same name with contradictory context does not silently merge", () => {
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "David",
      entity_type: "character",
      description: "David serves as a city guard",
      structured_fields: { narrative_role: "city guard" },
      attributes: {},
    },
    [mainDavid],
  );

  assertEquals(resolved, null);
});

Deno.test("multiple same-name candidates resolve only with unique context evidence", () => {
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "David",
      entity_type: "character",
      description: "David serves as a city guard",
      structured_fields: { narrative_role: "city guard" },
      attributes: {},
    },
    [mainDavid, cityGuardDavid],
  );

  assertEquals(resolved?.id, "uuid-david-guard");
});

Deno.test("multiple same-name candidates remain ambiguous without context", () => {
  const resolved = resolveEntityCandidate(
    { canonical_name: "David", entity_type: "character" },
    [mainDavid, cityGuardDavid],
  );

  assertEquals(resolved, null);
});

Deno.test("the resolver does not cross entity types", () => {
  const resolved = resolveEntityCandidate(
    { canonical_name: "David", entity_type: "location" },
    [mainDavid],
  );

  assertEquals(resolved, null);
});

Deno.test("prefers an existing current-Branch entity before a Main candidate", () => {
  const resolved = resolveExtractionCandidate(
    { canonical_name: "Aron", entity_type: "character" },
    [{ id: "branch-aron", canonical_name: "Aron", entity_type: "character", structured_fields: { age: "30" } }],
    [{ id: "main-aron", canonical_name: "Aron", entity_type: "character", structured_fields: { age: "25" } }],
  );

  assertEquals(resolved?.id, "branch-aron");
});

Deno.test("resolves a Main entity when no current-Branch entity matches", () => {
  const resolved = resolveExtractionCandidate(
    { canonical_name: "Aron", entity_type: "character", structured_fields: { age: "25" } },
    [],
    [{ id: "main-aron", canonical_name: "Aron", entity_type: "character", structured_fields: { age: "25" } }],
  );

  assertEquals(resolved?.id, "main-aron");
});

Deno.test("applies Branch overlay values to the candidate used for matching", () => {
  const effective = applyEntityOverrides(
    { id: "main-aron", canonical_name: "Aron", entity_type: "character", structured_fields: { age: "25" } },
    { "structured_fields.age": "30" },
  );

  assertEquals(effective.structured_fields?.age, "30");
});

// ============================================================
// Phase 2: Main cross-run Sub-base C character identity fallback
// (findExistingMainEntity reuses resolveEntityCandidate over the project's
//  Main character rows + aliases; these prove the semantics it relies on.)
// ============================================================

Deno.test("Phase 2: a short first name on run A resolves to the full first+last name on run B", () => {
  const runAEntity = {
    id: "main-leo",
    canonical_name: "Leo",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "Leo", occupation: "archivist" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "Leo Frost",
      entity_type: "character",
      structured_fields: { first_name: "Leo", last_name: "Frost", occupation: "archivist" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved?.id, "main-leo");
});

Deno.test("Phase 2: a conflicting explicit age blocks the short-to-full name merge", () => {
  const runAEntity = {
    id: "main-leo",
    canonical_name: "Leo",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "Leo", age: "27" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "Leo Frost",
      entity_type: "character",
      structured_fields: { first_name: "Leo", last_name: "Frost", age: "41" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved, null);
});

Deno.test("a differing height representation does not block the short-to-full name merge", () => {
  // Run A saw only the given name and a descriptive height; run B saw the
  // surname and a numeric height. Same person, two surface forms.
  const runAEntity = {
    id: "main-sara",
    canonical_name: "שרה",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "שרה", height: "גבוה" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "שרה כהן",
      entity_type: "character",
      structured_fields: { first_name: "שרה", last_name: "כהן", height: "180" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved?.id, "main-sara");
});

Deno.test("a cosmetic field mismatch (hair_color) does not block the short-to-full name merge", () => {
  const runAEntity = {
    id: "main-sara",
    canonical_name: "שרה",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "שרה", hair_color: "חום", common_clothing: "גלימה" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "שרה כהן",
      entity_type: "character",
      structured_fields: { first_name: "שרה", last_name: "כהן", hair_color: "שחור", common_clothing: "מעיל עור" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved?.id, "main-sara");
});

Deno.test("a conflicting gender still blocks the short-to-full name merge", () => {
  const runAEntity = {
    id: "main-sara",
    canonical_name: "שרה",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "שרה", gender: "female" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "שרה כהן",
      entity_type: "character",
      structured_fields: { first_name: "שרה", last_name: "כהן", gender: "male" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved, null);
});

Deno.test("non-character entities still treat any field mismatch as conflicting", () => {
  const runAEntity = {
    id: "loc-harbor",
    canonical_name: "Harbor",
    entity_type: "location",
    aliases: [],
    structured_fields: { place_type: "port", region: "north" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "Harbor District",
      entity_type: "location",
      structured_fields: { place_type: "port", region: "south" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved, null);
});

Deno.test("Phase 2: an existing alias resolves run B to the same Main character", () => {
  const runAEntity = {
    id: "main-leo",
    canonical_name: "Leo Sage",
    entity_type: "character",
    aliases: ["Leo"],
    structured_fields: { first_name: "Leo", last_name: "Sage" },
    attributes: {},
  };
  const resolved = resolveEntityCandidate(
    {
      canonical_name: "Leo",
      entity_type: "character",
      structured_fields: { first_name: "Leo" },
      attributes: {},
    },
    [runAEntity],
  );
  assertEquals(resolved?.id, "main-leo");
});

// ============================================================
// Issue 3: character `age` is canonicalized before an identity-conflict check
// so semantically equal ages (numbers, "17 שנה", Hebrew number words) never
// manufacture a duplicate, while genuinely different ages still conflict.
// ============================================================

const ageCharacter = (id: string, age: unknown) => ({
  id,
  canonical_name: "מאיה",
  entity_type: "character",
  aliases: [] as string[],
  structured_fields: { first_name: "מאיה", age },
  attributes: {},
});

// A shared non-age field so these tests isolate the `age` identity comparison
// rather than the separate "rich entities with zero shared tokens" signal.
const withAge = (age: unknown) => ({
  canonical_name: "מאיה",
  entity_type: "character",
  structured_fields: { first_name: "מאיה", age },
  attributes: {},
});

Deno.test("Issue 3: numeric vs Hebrew-word age for the same name is not an identity conflict", () => {
  assertEquals(hasConflictingEntityContext(withAge("17"), withAge("שבע עשרה")), false);
});

Deno.test("Issue 3: '17' resolves to an existing character stored as '17 שנה'", () => {
  const resolved = resolveEntityCandidate(
    { canonical_name: "מאיה", entity_type: "character", structured_fields: { first_name: "מאיה", age: "17" }, attributes: {} },
    [ageCharacter("main-maya", "17 שנה")],
  );
  assertEquals(resolved?.id, "main-maya");
});

Deno.test("Issue 3: a numeric age value (not a string) resolves against a Hebrew-word age", () => {
  const resolved = resolveEntityCandidate(
    { canonical_name: "מאיה", entity_type: "character", structured_fields: { first_name: "מאיה", age: 17 }, attributes: {} },
    [ageCharacter("main-maya", "בת שבע עשרה")],
  );
  assertEquals(resolved?.id, "main-maya");
});

Deno.test("Issue 3: legacy 'בן 25' and 'עשרים וחמש' are treated as the same age", () => {
  const resolved = resolveEntityCandidate(
    { canonical_name: "מאיה", entity_type: "character", structured_fields: { first_name: "מאיה", age: "עשרים וחמש" }, attributes: {} },
    [ageCharacter("main-maya", "בן 25")],
  );
  assertEquals(resolved?.id, "main-maya");
});

Deno.test("Issue 3: genuinely different ages (17 vs 41) still block an identity match", () => {
  assertEquals(hasConflictingEntityContext(withAge("17"), withAge("41")), true);
  const resolved = resolveEntityCandidate(
    { canonical_name: "מאיה", entity_type: "character", structured_fields: { first_name: "מאיה", age: "17 שנה" }, attributes: {} },
    [ageCharacter("main-maya", "41")],
  );
  assertEquals(resolved, null);
});

Deno.test("Issue 3: equal canonicalized age still contributes positive context for ambiguous same-name candidates", () => {
  // Two same-name Main candidates; only the age (17 == 'שבע עשרה') distinguishes
  // the correct one, so the match must rely on the canonicalized age both
  // avoiding a conflict AND contributing to the context score.
  const resolved = resolveEntityCandidate(
    { canonical_name: "מאיה", entity_type: "character", structured_fields: { first_name: "מאיה", age: "17" }, attributes: {} },
    [
      ageCharacter("main-maya-17", "שבע עשרה"),
      ageCharacter("main-maya-30", "30"),
    ],
  );
  assertEquals(resolved?.id, "main-maya-17");
});

Deno.test("Issue 3: age canonicalization is scoped to characters; non-character age is compared literally", () => {
  assertEquals(
    hasConflictingEntityContext(
      { canonical_name: "Relic", entity_type: "object", structured_fields: { age: "17" }, attributes: {} },
      { canonical_name: "Relic", entity_type: "object", structured_fields: { age: "שבע עשרה" }, attributes: {} },
    ),
    true,
  );
});
