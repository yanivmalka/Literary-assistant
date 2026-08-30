import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  orderRelationshipEndpointsForPersistence,
  describeUnresolvedRelationship,
  planCharacterRelationshipWrite,
  shouldUseMainCharacterFallback,
  withUserOwnedStructuredFields,
  stripUserOwnedOverlayEntries,
  gateUserOwnedNameAndDescription,
  overlayFieldPathsForUserOwned,
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
// Issue 1b: user-owned `name` / `description` provenance on the
// canonical_name / description columns and Branch overlay overrides
// ------------------------------------------------------------

Deno.test("Issue 1b: Main user-owned `name` preserves the existing canonical_name over a longer AI value", () => {
  const merged = { canonical_name: "Leonard Frost the Third", description: "an archivist" };
  const existing = { canonical_name: "Leo", description: "an archivist" };

  const gated = gateUserOwnedNameAndDescription(merged, existing, new Set(["name"]));
  assertEquals(gated.canonical_name, "Leo");        // user-owned name preserved
  assertEquals(gated.description, "an archivist");  // description not owned -> AI merge (unchanged here)
});

Deno.test("Issue 1b: Main user-owned `description` preserves the existing description on re-extraction", () => {
  const merged = { canonical_name: "Leo", description: "AI rewrote the bio at length" };
  const existing = { canonical_name: "Leo", description: "the bio the user wrote" };

  const gated = gateUserOwnedNameAndDescription(merged, existing, new Set(["description"]));
  assertEquals(gated.description, "the bio the user wrote");
  assertEquals(gated.canonical_name, "Leo");
});

Deno.test("Issue 1b: no user-owned name/description lets the AI merge through", () => {
  const merged = { canonical_name: "Leo Frost", description: "new bio" };
  const existing = { canonical_name: "Leo", description: "old bio" };

  const gated = gateUserOwnedNameAndDescription(merged, existing, new Set(["age"]));
  assertEquals(gated.canonical_name, "Leo Frost");
  assertEquals(gated.description, "new bio");
});

Deno.test("Issue 1b: Branch overlay with Main user-owned `name` produces no overrides.canonical_name", () => {
  const overrides: Record<string, unknown> = { canonical_name: "Leo Frost", "structured_fields.age": "40" };
  const baseValues: Record<string, unknown> = { canonical_name: "Leo", "structured_fields.age": "27" };

  stripUserOwnedOverlayEntries(overrides, baseValues, ["name"]);

  assert(!("canonical_name" in overrides));
  assert(!("canonical_name" in baseValues));
  assertEquals(overrides["structured_fields.age"], "40"); // unrelated change untouched
});

Deno.test("Issue 1b: Branch overlay with Main user-owned `description` produces no overrides.description", () => {
  const overrides: Record<string, unknown> = { description: "AI bio", "attributes.mood": "grim" };
  const baseValues: Record<string, unknown> = { description: "user bio", "attributes.mood": "calm" };

  stripUserOwnedOverlayEntries(overrides, baseValues, ["description"]);

  assert(!("description" in overrides));
  assert(!("description" in baseValues));
  assertEquals(overrides["attributes.mood"], "grim");
});

Deno.test("Issue 1b: a user-owned ordinary field strips both structured_fields.<key> and attributes.<key>", () => {
  const overrides: Record<string, unknown> = {
    "structured_fields.hair_color": "black",
    "attributes.hair_color": "black",
    "structured_fields.age": "40",
  };
  const baseValues: Record<string, unknown> = {
    "structured_fields.hair_color": "auburn",
    "attributes.hair_color": "auburn",
    "structured_fields.age": "27",
  };

  stripUserOwnedOverlayEntries(overrides, baseValues, ["hair_color"]);

  assert(!("structured_fields.hair_color" in overrides));
  assert(!("attributes.hair_color" in overrides));
  assert(!("structured_fields.hair_color" in baseValues));
  assert(!("attributes.hair_color" in baseValues));
  assertEquals(overrides["structured_fields.age"], "40"); // non-user-owned field remains
  assertEquals(baseValues["structured_fields.age"], "27");
});

Deno.test("Issue 1b: overlayFieldPathsForUserOwned maps name/description and ordinary keys", () => {
  assertEquals(overlayFieldPathsForUserOwned("name"), ["canonical_name"]);
  assertEquals(overlayFieldPathsForUserOwned("description"), ["description"]);
  assertEquals(overlayFieldPathsForUserOwned("age"), ["structured_fields.age", "attributes.age"]);
});

Deno.test("Issue 1b: withUserOwnedStructuredFields still preserves user-owned name and description keys", () => {
  const merged = { name: "AI Name", description: "AI desc", age: "40" };
  const existing = { name: "User Name", description: "User desc", age: "27" };

  const guarded = withUserOwnedStructuredFields(merged, existing, ["name", "description"]);
  assertEquals(guarded.name, "User Name");
  assertEquals(guarded.description, "User desc");
  assertEquals(guarded.age, "40");
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

// ============================================================
// Issue 6 (Phase 5, verification only): a relationship whose endpoint did not
// resolve is dropped observably (a diagnostic that names the endpoint, which the
// Edge handler counts into relationships_dropped) — and a fully-resolved
// relationship still persists with a single canonical endpoint pair.
// ============================================================

Deno.test("Issue 6: an unresolved endpoint yields a drop plan with a diagnostic that names the endpoint", () => {
  const plan = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Leo",
    targetName: "Mira",
    sourceId: "entity-leo",
    targetId: null,
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(plan.action, "drop");
  assert(plan.diagnostic && plan.diagnostic.includes("target 'Mira'"));
  assert(plan.diagnostic && !plan.diagnostic.includes("source"));
  assertEquals(plan.source_entity_id, undefined);
});

Deno.test("Issue 6: both endpoints missing is still observable (names both, no silent loss)", () => {
  const plan = planCharacterRelationshipWrite({
    relationshipType: "family",
    sourceName: "",
    targetName: "Mira",
    sourceId: null,
    targetId: null,
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(plan.action, "drop");
  assert(plan.diagnostic && plan.diagnostic.includes("source '(missing)'"));
  assert(plan.diagnostic && plan.diagnostic.includes("target 'Mira'"));
});

Deno.test("Issue 6: a fully-resolved relationship still persists (no regression) with one canonical pair", () => {
  const plan = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Mira",
    targetName: "Leo",
    sourceId: "id-mira",
    targetId: "id-leo",
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(plan.action, "persist");
  assertEquals(plan.diagnostic, null);
  // symmetric type -> deterministic ordered pair regardless of input order
  const reverse = planCharacterRelationshipWrite({
    relationshipType: "friendship",
    sourceName: "Leo",
    targetName: "Mira",
    sourceId: "id-leo",
    targetId: "id-mira",
    modelProfile: "sub-base-c-characters",
  });
  assertEquals(
    [plan.source_entity_id, plan.target_entity_id],
    [reverse.source_entity_id, reverse.target_entity_id],
  );
});
