import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyEntityOverrides,
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
