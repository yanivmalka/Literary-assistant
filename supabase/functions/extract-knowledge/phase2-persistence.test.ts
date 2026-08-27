import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  orderRelationshipEndpointsForPersistence,
  describeUnresolvedRelationship,
  planCharacterRelationshipWrite,
  shouldUseMainCharacterFallback,
  withUserOwnedStructuredFields,
} from "./testable-pipeline.ts";
import { isSymmetricCharacterRelationship } from "../_shared/character-specialist.ts";
import { resolveEntityCandidate } from "../_shared/entity-resolution.ts";

Deno.test("Phase 2: symmetric relationship types are recognized, directional ones are not", () => {
  assert(isSymmetricCharacterRelationship("friendship"));
  assert(isSymmetricCharacterRelationship("family"));
  assert(isSymmetricCharacterRelationship("no_significant_bond"));
  assert(!isSymmetricCharacterRelationship("mentorship"));
  assert(!isSymmetricCharacterRelationship("work_supervisor"));
  assert(!isSymmetricCharacterRelationship("protection_or_dependency"));
  assert(!isSymmetricCharacterRelationship("not_a_type"));
});

Deno.test("Phase 2: a symmetric relationship collapses A->B and B->A onto one canonical pair", () => {
  const forward = orderRelationshipEndpointsForPersistence("id-b", "id-a", "friendship");
  const reverse = orderRelationshipEndpointsForPersistence("id-a", "id-b", "friendship");
  assertEquals(forward, ["id-a", "id-b"]);
  assertEquals(reverse, ["id-a", "id-b"]);
  // Identical ordered pair => identical (source_entity_id, target_entity_id,
  // relationship_type) conflict key => a single stored row.
  assertEquals(forward, reverse);
});

Deno.test("Phase 2: a directional relationship keeps both directions as distinct pairs", () => {
  const forward = orderRelationshipEndpointsForPersistence("id-a", "id-b", "mentorship");
  const reverse = orderRelationshipEndpointsForPersistence("id-b", "id-a", "mentorship");
  assertEquals(forward, ["id-a", "id-b"]);
  assertEquals(reverse, ["id-b", "id-a"]);
  assert(JSON.stringify(forward) !== JSON.stringify(reverse));
});

Deno.test("Phase 2: describeUnresolvedRelationship reports unresolved endpoints and is silent when both resolve", () => {
  assertEquals(
    describeUnresolvedRelationship("friendship", "Leo", "Mira", true, true),
    null,
  );
  const sourceMissing = describeUnresolvedRelationship("friendship", "Leo", "Mira", false, true);
  assert(sourceMissing && sourceMissing.includes("source 'Leo'"));
  assert(sourceMissing && !sourceMissing.includes("target"));

  const bothMissing = describeUnresolvedRelationship("family", "", "Mira", false, false);
  assert(bothMissing && bothMissing.includes("source '(missing)'"));
  assert(bothMissing && bothMissing.includes("target 'Mira'"));
});

Deno.test("Phase 2: withUserOwnedStructuredFields keeps user-edited keys and leaves the rest as merged", () => {
  const merged = { hair_color: "black", age: "40", occupation: "guard" };
  const existing = { hair_color: "auburn", age: "27", occupation: "archivist" };

  const guarded = withUserOwnedStructuredFields(merged, existing, ["hair_color"]);
  assertEquals(guarded.hair_color, "auburn"); // user value preserved
  assertEquals(guarded.age, "40");            // untouched field still takes the AI merge
  assertEquals(guarded.occupation, "guard");
});

Deno.test("Phase 2: withUserOwnedStructuredFields drops a merged key the user cleared (absent from existing)", () => {
  const merged = { hair_color: "black", scars: "a scar" };
  const existing = { hair_color: "auburn" }; // key not persisted at all

  const guarded = withUserOwnedStructuredFields(merged, existing, ["scars"]);
  assert(!("scars" in guarded));
  assertEquals(guarded.hair_color, "black");
});

Deno.test("A2: a user-owned field the user cleared to null stays null through the extraction merge", () => {
  // The persisted row keeps the cleared key with a null value (the { value: null }
  // knowledge_entity_values row is what makes it appear in loadUserOwnedFieldPaths).
  const mergedFromAi = { hair_color: "black", scars: "the AI re-extracted a scar" };
  const existing = { hair_color: "black", scars: null };

  const guarded = withUserOwnedStructuredFields(mergedFromAi, existing, ["scars"]);
  assertEquals(guarded.scars, null);            // cleared value preserved, not resurrected
  assertEquals(guarded.hair_color, "black");    // unrelated AI field still merges
});

// ------------------------------------------------------------
// planCharacterRelationshipWrite: the persistence loop's decision, made pure
// ------------------------------------------------------------

Deno.test("A5: symmetric A->B and B->A produce the same stored pair (one row under the conflict key)", () => {
  const forward = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Leo",
    targetName: "Mira",
    sourceId: "id-b",
    targetId: "id-a",
    modelProfile: "sub-base-c-characters",
  });
  const reverse = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Mira",
    targetName: "Leo",
    sourceId: "id-a",
    targetId: "id-b",
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(forward.action, "persist");
  assertEquals(reverse.action, "persist");
  assertEquals(
    [forward.source_entity_id, forward.target_entity_id],
    [reverse.source_entity_id, reverse.target_entity_id],
  );
});

Deno.test("A5: directional relationships keep both directions as two distinct pairs", () => {
  const forward = planCharacterRelationshipWrite({
    relationshipType: "mentorship",
    sourceName: "Leo",
    targetName: "Mira",
    sourceId: "id-a",
    targetId: "id-b",
    modelProfile: "sub-base-c-characters",
  });
  const reverse = planCharacterRelationshipWrite({
    relationshipType: "mentorship",
    sourceName: "Mira",
    targetName: "Leo",
    sourceId: "id-b",
    targetId: "id-a",
    modelProfile: "sub-base-c-characters",
  });
  assertEquals([forward.source_entity_id, forward.target_entity_id], ["id-a", "id-b"]);
  assertEquals([reverse.source_entity_id, reverse.target_entity_id], ["id-b", "id-a"]);
});

Deno.test("A5: non-C profiles are never reordered", () => {
  const plan = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "b",
    targetName: "a",
    sourceId: "id-b",
    targetId: "id-a",
    modelProfile: "sub-base-locations",
  });
  assertEquals([plan.source_entity_id, plan.target_entity_id], ["id-b", "id-a"]);
});

Deno.test("A5: an unresolved endpoint drops the relationship with a diagnostic naming it", () => {
  const plan = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Leo",
    targetName: "Mira",
    sourceId: null,
    targetId: "id-mira",
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(plan.action, "drop");
  assert(plan.diagnostic && plan.diagnostic.includes("source 'Leo'"));
  assertEquals(plan.source_entity_id, undefined);
});

Deno.test("A5: a self-edge is skipped and is NOT counted as an unresolved drop", () => {
  const plan = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Leo",
    targetName: "Leo",
    sourceId: "id-leo",
    targetId: "id-leo",
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(plan.action, "skip_self");
  assertEquals(plan.diagnostic, null);
});

Deno.test("A5: relationshipsDropped is driven only by 'drop' plans, not by self/persist", () => {
  const plans = [
    { relationshipType: "friendship", sourceName: "A", targetName: "B", sourceId: "a", targetId: "b", modelProfile: "sub-base-c-characters" },
    { relationshipType: "friendship", sourceName: "A", targetName: "?", sourceId: "a", targetId: null, modelProfile: "sub-base-c-characters" },
    { relationshipType: "friendship", sourceName: "A", targetName: "A", sourceId: "a", targetId: "a", modelProfile: "sub-base-c-characters" },
  ].map(planCharacterRelationshipWrite);
  const dropped = plans.filter((plan) => plan.action === "drop").length;
  assertEquals(dropped, 1);
});

// ------------------------------------------------------------
// shouldUseMainCharacterFallback: the Item 1 fuzzy-fallback gate
// ------------------------------------------------------------

Deno.test("A1/Item1: the Main character fallback is gated to Sub-base C characters only", () => {
  assert(shouldUseMainCharacterFallback("sub-base-c-characters", "character"));
  assert(!shouldUseMainCharacterFallback("sub-base-c-characters", "object"));
  assert(!shouldUseMainCharacterFallback("sub-base-c-characters", "ability"));
  assert(!shouldUseMainCharacterFallback("sub-base-locations", "character"));
  assert(!shouldUseMainCharacterFallback("sub-base", "character"));
  assert(!shouldUseMainCharacterFallback(undefined, "character"));
});

Deno.test("Item1: an unambiguous short/full-name C character resolves via resolveEntityCandidate", () => {
  const runA = {
    id: "main-leo",
    canonical_name: "Leo",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "Leo", occupation: "archivist" },
    attributes: {},
  };
  const match = resolveEntityCandidate(
    {
      canonical_name: "Leo Frost",
      entity_type: "character",
      structured_fields: { first_name: "Leo", last_name: "Frost", occupation: "archivist" },
      attributes: {},
    },
    [runA],
  );
  assertEquals(match?.id, "main-leo");
});

Deno.test("Item1: two same-first-name candidates with no distinguishing context stay ambiguous (null)", () => {
  const leoFrost = {
    id: "main-leo-frost",
    canonical_name: "Leo Frost",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "Leo", last_name: "Frost" },
    attributes: {},
  };
  const leoSage = {
    id: "main-leo-sage",
    canonical_name: "Leo Sage",
    entity_type: "character",
    aliases: [],
    structured_fields: { first_name: "Leo", last_name: "Sage" },
    attributes: {},
  };
  const match = resolveEntityCandidate(
    { canonical_name: "Leo", entity_type: "character", structured_fields: { first_name: "Leo" }, attributes: {} },
    [leoFrost, leoSage],
  );
  assertEquals(match, null);
});
