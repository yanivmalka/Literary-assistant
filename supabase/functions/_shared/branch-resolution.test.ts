import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type BranchRelationshipRecord,
  type KnowledgeBranchEntityRecord,
  type KnowledgeEntityRecord,
  type KnowledgeEntityValueRecord,
  type KnowledgeEventRecord,
  resolveEffectiveBranchRelationships,
  resolveEffectiveEntities,
  resolveEffectiveEntityValues,
  resolveEffectiveEvents,
} from "./branch-resolution.ts";

const mainDavid: KnowledgeEntityRecord = {
  id: "main-david",
  canonical_name: "David",
  entity_type: "character",
  entity_types: ["character"],
  description: "The king's son",
  attributes: { eye_color: "brown" },
  structured_fields: { age: "18" },
  layer: "main",
  branch_id: null,
  review_status: "confirmed",
};

const mainGoliath: KnowledgeEntityRecord = {
  id: "main-goliath",
  canonical_name: "Goliath",
  entity_type: "character",
  layer: "main",
  branch_id: null,
};

// --- resolveEffectiveEntities ------------------------------------------------

Deno.test("Main-only scope returns only Main entities, unmodified", () => {
  const result = resolveEffectiveEntities([mainDavid, mainGoliath], [], [], null);
  assertEquals(result.length, 2);
  const david = result.find((e) => e.conceptualEntityId === "main-david")!;
  assertEquals(david.effectiveEntityId, "main-david");
  assertEquals(david.layer, "main");
  assertEquals(david.isOverridden, false);
  assertEquals(david.fields, { eye_color: "brown", age: "18" });
});

Deno.test("branch-only knowledge_entities rows are included when a branch is selected", () => {
  const branchOnly: KnowledgeEntityRecord = {
    id: "branch-new-1",
    canonical_name: "Jonathan",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-1",
    review_status: "confirmed",
    attributes: { title: "prince" },
  };

  const result = resolveEffectiveEntities([mainDavid], [branchOnly], [], "branch-1");
  const jonathan = result.find((e) => e.conceptualEntityId === "branch-new-1");
  assertEquals(jonathan?.layer, "branch-only");
  assertEquals(jonathan?.effectiveEntityId, "branch-new-1");
  assertEquals(jonathan?.branchId, "branch-1");
  assertEquals(jonathan?.fields, { title: "prince" });
});

Deno.test("pending branch-only entities are excluded by default and included when opted in", () => {
  const pendingEntity: KnowledgeEntityRecord = {
    id: "branch-new-2",
    canonical_name: "Saul",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-1",
    review_status: "pending",
  };

  const excluded = resolveEffectiveEntities([], [pendingEntity], [], "branch-1");
  assertEquals(excluded.find((e) => e.conceptualEntityId === "branch-new-2"), undefined);

  const included = resolveEffectiveEntities([], [pendingEntity], [], "branch-1", {
    includePendingBranchData: true,
  });
  assertEquals(included.find((e) => e.conceptualEntityId === "branch-new-2")?.layer, "branch-only");
});

Deno.test("knowledge_branch_entities.overrides applies a Main-field override on top of the Main baseline (real shape: entity_id === source_entity_id)", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: { eye_color: "blue", height: "tall" },
    rejected_fields: [],
  };

  const result = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1");
  const david = result.find((e) => e.conceptualEntityId === "main-david")!;
  assertEquals(david.layer, "main-with-override");
  assertEquals(david.effectiveEntityId, "main-david");
  assertEquals(david.isOverridden, true);
  assertEquals(david.fields, { eye_color: "blue", age: "18", height: "tall" });
});

Deno.test("effectiveEntityId passes through overlay.entity_id verbatim even if it ever diverges from source_entity_id (defensive, not assumed)", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "some-other-id",
    overrides: {},
  };
  const result = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1");
  const david = result.find((e) => e.conceptualEntityId === "main-david")!;
  assertEquals(david.effectiveEntityId, "some-other-id");
  assertEquals(david.conceptualEntityId, "main-david");
});

Deno.test("rejected_fields on an override are not applied", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: { eye_color: "blue" },
    rejected_fields: ["eye_color"],
  };

  const result = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1");
  const david = result.find((e) => e.conceptualEntityId === "main-david")!;
  assertEquals(david.fields.eye_color, "brown");
});

Deno.test("an override targeting an unknown Main entity is ignored rather than throwing", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "does-not-exist",
    entity_id: "branch-x",
    overrides: { foo: "bar" },
  };

  const result = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1");
  assertEquals(result.length, 1);
  assertEquals(result[0].conceptualEntityId, "main-david");
});

Deno.test("a branch selected in the request does not leak another branch's entities", () => {
  const otherBranchEntity: KnowledgeEntityRecord = {
    id: "branch-other",
    canonical_name: "Other",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-2",
  };
  const result = resolveEffectiveEntities([mainDavid], [otherBranchEntity], [], "branch-1");
  assertEquals(result.length, 1);
  assertEquals(result[0].conceptualEntityId, "main-david");
});

// --- resolveEffectiveEntityValues -------------------------------------------

Deno.test("Main value is used when there is no Branch value for the field", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
  ];
  const resolved = resolveEffectiveEntityValues(entity, values);
  assertEquals(resolved, [{ fieldPath: "hair_color", value: "black", sourceType: "ai" }]);
});

Deno.test("a Branch value referencing the Main entity id, scoped by branch_id, resolves for an override entity (real write-path shape: entity_id === source_entity_id)", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: {},
  };
  const entity = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1")[0];
  assertEquals(entity.effectiveEntityId, "main-david");

  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "main-david", branch_id: "branch-1", field_path: "hair_color", value_json: "silver", source_type: "user", value_status: "active" },
  ];
  const resolved = resolveEffectiveEntityValues(entity, values);
  assertEquals(resolved, [{ fieldPath: "hair_color", value: "silver", sourceType: "user" }]);
});

Deno.test("Branch value wins over Main value for the same field, both referencing the Main entity id", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: {},
  };
  const entity = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1")[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
    { entity_id: "main-david", branch_id: "branch-1", field_path: "hair_color", value_json: "silver", source_type: "user", value_status: "active" },
  ];
  const resolved = resolveEffectiveEntityValues(entity, values);
  assertEquals(resolved, [{ fieldPath: "hair_color", value: "silver", sourceType: "user" }]);
});

Deno.test("REGRESSION: knowledge_branch_entities has no review_status, so an override is never pending-filtered", () => {
  // Ground truth: pure field overrides never create a separate branch-layer
  // knowledge_entities row, so there is nothing with a review_status to gate
  // on for the override itself — only genuinely new branch-only entities are.
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: { eye_color: "blue" },
  };
  const result = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1", {
    includePendingBranchData: false,
  });
  const david = result.find((e) => e.conceptualEntityId === "main-david");
  assertEquals(david?.layer, "main-with-override");
  assertEquals(david?.fields.eye_color, "blue");
});

Deno.test("REGRESSION: a stray Main-scoped (branch_id: null) value row for a branch-only entity is never resolved", () => {
  // A branch-only entity has no Main baseline, and the write path always
  // scopes its values with branch_id set to the branch — never null. A
  // branch_id:null value row sharing that entity's id must not leak in as
  // if it were a legitimate baseline.
  const branchOnly: KnowledgeEntityRecord = {
    id: "branch-new-1",
    canonical_name: "Jonathan",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-1",
  };
  const entity = resolveEffectiveEntities([], [branchOnly], [], "branch-1")[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "branch-new-1", branch_id: null, field_path: "title", value_json: "leaked-main-value", source_type: "ai", value_status: "active" },
  ];
  assertEquals(resolveEffectiveEntityValues(entity, values), []);
});

Deno.test("superseded and rejected values are excluded", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "old", source_type: "ai", value_status: "superseded" },
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "rejected-value", source_type: "ai", value_status: "rejected" },
  ];
  assertEquals(resolveEffectiveEntityValues(entity, values), []);
});

Deno.test("a value for a different branch is not resolved", () => {
  const otherBranchEntity: KnowledgeEntityRecord = {
    id: "branch-new-1",
    canonical_name: "Jonathan",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-1",
  };
  const entity = resolveEffectiveEntities([], [otherBranchEntity], [], "branch-1")[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "branch-new-1", branch_id: "branch-2", field_path: "title", value_json: "prince", source_type: "ai", value_status: "active" },
  ];
  assertEquals(resolveEffectiveEntityValues(entity, values), []);
});

// --- resolveEffectiveBranchRelationships (must match extractionBranching.ts) --

const approvedMainRel: BranchRelationshipRecord = {
  branch_id: null,
  source_entity_id: "main-david",
  target_entity_id: "main-goliath",
  relationship_type: "defeated",
};

Deno.test("Main relationships default to approved/add when fields are omitted", () => {
  const result = resolveEffectiveBranchRelationships([approvedMainRel], [], null);
  assertEquals(result, [approvedMainRel]);
});

Deno.test("pending Branch relationships are excluded from the effective graph", () => {
  const pendingBranchRel: BranchRelationshipRecord = {
    branch_id: "branch-1",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "allied_with",
    operation: "add",
    review_status: "pending",
  };
  const result = resolveEffectiveBranchRelationships([], [pendingBranchRel], "branch-1");
  assertEquals(result, []);
});

Deno.test("an approved Branch 'remove' deletes the matching Main relationship", () => {
  const removeRel: BranchRelationshipRecord = {
    branch_id: "branch-1",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "defeated",
    operation: "remove",
    review_status: "approved",
  };
  const result = resolveEffectiveBranchRelationships([approvedMainRel], [removeRel], "branch-1");
  assertEquals(result, []);
});

Deno.test("an approved Branch 'add' overwrites the keyed entry", () => {
  const addRel: BranchRelationshipRecord = {
    branch_id: "branch-1",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "defeated",
    operation: "add",
    review_status: "approved",
    id: "branch-version",
  };
  const result = resolveEffectiveBranchRelationships([approvedMainRel], [addRel], "branch-1");
  assertEquals(result, [addRel]);
});

Deno.test("a different branch's relationships do not affect this branch's effective graph", () => {
  const otherBranchRel: BranchRelationshipRecord = {
    branch_id: "branch-2",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "defeated",
    operation: "remove",
    review_status: "approved",
  };
  const result = resolveEffectiveBranchRelationships([approvedMainRel], [otherBranchRel], "branch-1");
  assertEquals(result, [approvedMainRel]);
});

// --- resolveEffectiveEvents (additive only) ---------------------------------

const mainEvent: KnowledgeEventRecord = { id: "event-main", branch_id: null, name: "The battle" };
const branchEvent: KnowledgeEventRecord = { id: "event-branch", branch_id: "branch-1", name: "The duel" };

Deno.test("Main-only scope returns only Main events", () => {
  assertEquals(resolveEffectiveEvents([mainEvent], [branchEvent], null), [mainEvent]);
});

Deno.test("a selected branch adds its events on top of Main, additively", () => {
  const result = resolveEffectiveEvents([mainEvent], [branchEvent], "branch-1");
  assertEquals(result, [mainEvent, branchEvent]);
});

Deno.test("another branch's events are not included", () => {
  const result = resolveEffectiveEvents([mainEvent], [branchEvent], "branch-2");
  assertEquals(result, [mainEvent]);
});
