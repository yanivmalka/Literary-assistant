import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type BranchRelationshipRecord,
  type KnowledgeBranchEntityRecord,
  type KnowledgeEntityRecord,
  type KnowledgeEntityValueRecord,
  type KnowledgeEventRecord,
  resolveEffectiveBranchRelationships,
  resolveEffectiveEntities,
  resolveEffectiveEvents,
} from "./branch-resolution.ts";
import type { QASource } from "./notebook-types.ts";
import {
  chunkToCandidates,
  entitiesToCandidates,
  eventsToCandidates,
  relationshipsToCandidates,
  type RetrievalCandidate,
  valuesToCandidates,
} from "./retrieval-candidate.ts";

const PROJECT_ID = "project-1";

const mainDavid: KnowledgeEntityRecord = {
  id: "main-david",
  canonical_name: "David",
  entity_type: "character",
  description: "The king's son",
  attributes: { eye_color: "brown" },
  layer: "main",
  branch_id: null,
  version_id: "version-1",
  raw_extraction_id: "extraction-1",
};

const branchOnlyJonathan: KnowledgeEntityRecord = {
  id: "branch-jonathan",
  canonical_name: "Jonathan",
  entity_type: "character",
  layer: "branch",
  branch_id: "branch-1",
  review_status: "confirmed",
  version_id: "version-2",
  raw_extraction_id: "extraction-2",
};

// --- chunk candidates: regression of existing chunk-retrieval behavior -----

Deno.test("REGRESSION: chunk candidates preserve existing QASource content, order, and score exactly", () => {
  const sources: QASource[] = [
    { chunkId: "c1", content: "First passage", chapterNumber: 1, chapterTitle: "Ch1", page: null, position: 0, versionId: "v1", score: 0.9 },
    { chunkId: "c2", content: "Second passage", chapterNumber: 2, chapterTitle: null, page: 12, position: 1, versionId: "v1", score: 0.5 },
  ];
  const candidates = chunkToCandidates(sources, PROJECT_ID, null);
  assertEquals(candidates.length, 2);
  assertEquals(candidates[0].id, "c1");
  assertEquals(candidates[0].text, "First passage");
  assertEquals(candidates[0].score, 0.9);
  assertEquals(candidates[1].id, "c2");
  assertEquals(candidates[1].text, "Second passage");
  assertEquals(candidates[1].score, 0.5);
  // order must match input order (existing hybrid-search ordering is untouched)
  assertEquals(candidates.map((c) => c.id), ["c1", "c2"]);
});

Deno.test("chunk candidates carry sourceChunkIds/versionIds without fabricating evidence", () => {
  const sources: QASource[] = [
    { chunkId: "c1", content: "text", chapterNumber: null, chapterTitle: null, page: null, position: 0, versionId: "v1", score: 0.7 },
  ];
  const [candidate] = chunkToCandidates(sources, PROJECT_ID, "branch-1");
  assertEquals(candidate.kind, "chunk");
  assertEquals(candidate.sourceChunkIds, ["c1"]);
  assertEquals(candidate.versionIds, ["v1"]);
  assertEquals(candidate.evidence, []);
  assertEquals(candidate.layer, "main");
  assertEquals(candidate.branchId, "branch-1");
});

Deno.test("empty chunk input yields empty candidates", () => {
  assertEquals(chunkToCandidates([], PROJECT_ID, null), []);
});

// --- entity candidates -------------------------------------------------------

Deno.test("Main-only entity candidates carry real provenance, not fabricated", () => {
  const entities = resolveEffectiveEntities([mainDavid], [], [], null);
  const candidates = entitiesToCandidates(entities, PROJECT_ID);
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0], {
    kind: "entity",
    id: "main-david",
    projectId: PROJECT_ID,
    branchId: null,
    layer: "main",
    text: "David (character): The king's son",
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: ["version-1"],
    evidence: ["extraction-1"],
  });
});

Deno.test("branch-only entity candidates never leak into Main-only retrieval", () => {
  const mainOnly = resolveEffectiveEntities([mainDavid], [branchOnlyJonathan], [], null);
  const candidates = entitiesToCandidates(mainOnly, PROJECT_ID);
  assertEquals(candidates.map((c) => c.id), ["main-david"]);
});

Deno.test("selecting a branch surfaces Main baseline + branch overlay entity candidates", () => {
  const entities = resolveEffectiveEntities([mainDavid], [branchOnlyJonathan], [], "branch-1");
  const candidates = entitiesToCandidates(entities, PROJECT_ID);
  const ids = candidates.map((c) => c.id).sort();
  assertEquals(ids, ["branch-jonathan", "main-david"]);
  const jonathan = candidates.find((c) => c.id === "branch-jonathan")!;
  assertEquals(jonathan.layer, "branch-only");
  assertEquals(jonathan.branchId, "branch-1");
});

Deno.test("another branch's entities never leak into this branch's candidates", () => {
  const otherBranchEntity: KnowledgeEntityRecord = {
    id: "branch-other",
    canonical_name: "Other",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-2",
  };
  const entities = resolveEffectiveEntities([mainDavid], [otherBranchEntity], [], "branch-1");
  const candidates = entitiesToCandidates(entities, PROJECT_ID);
  assertEquals(candidates.map((c) => c.id), ["main-david"]);
});

Deno.test("pending branch-only entities are excluded from candidates by default", () => {
  const pending: KnowledgeEntityRecord = {
    id: "branch-pending",
    canonical_name: "Saul",
    entity_type: "character",
    layer: "branch",
    branch_id: "branch-1",
    review_status: "pending",
  };
  const entities = resolveEffectiveEntities([], [pending], [], "branch-1");
  assertEquals(entitiesToCandidates(entities, PROJECT_ID), []);

  const included = resolveEffectiveEntities([], [pending], [], "branch-1", { includePendingBranchData: true });
  assertEquals(entitiesToCandidates(included, PROJECT_ID).map((c) => c.id), ["branch-pending"]);
});

Deno.test("Main-field override produces one entity candidate reflecting the override layer, no duplicate for the Main baseline", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: { eye_color: "blue" },
  };
  const entities = resolveEffectiveEntities([mainDavid], [], [overlay], "branch-1");
  const candidates = entitiesToCandidates(entities, PROJECT_ID);
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].layer, "main-with-override");
  assertEquals(candidates[0].branchId, "branch-1");
});

// --- value candidates ---------------------------------------------------------

Deno.test("value candidates: one per effective field, evidence traced to the winning record", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active", raw_extraction_id: "extraction-3" },
  ];
  const candidates = valuesToCandidates(entity, values, PROJECT_ID);
  assertEquals(candidates, [{
    kind: "value",
    id: "main-david:hair_color",
    projectId: PROJECT_ID,
    branchId: null,
    layer: "main",
    text: `hair_color: "black"`,
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: [],
    evidence: ["extraction-3"],
  }]);
});

Deno.test("REGRESSION: rejected and superseded values never produce candidates", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "old", source_type: "ai", value_status: "superseded" },
    { entity_id: "main-david", branch_id: null, field_path: "eye_color", value_json: "green", source_type: "ai", value_status: "rejected" },
  ];
  assertEquals(valuesToCandidates(entity, values, PROJECT_ID), []);
});

Deno.test("Branch value wins over Main value for the same field, and the candidate reflects the Branch scope", () => {
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
    { entity_id: "main-david", branch_id: "branch-1", field_path: "hair_color", value_json: "silver", source_type: "user", value_status: "active", raw_extraction_id: null },
  ];
  const candidates = valuesToCandidates(entity, values, PROJECT_ID);
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].text, `hair_color: "silver"`);
  assertEquals(candidates[0].branchId, "branch-1");
});

Deno.test("a stray Main-scoped value for a branch-only entity never produces a leaked candidate", () => {
  const entity = resolveEffectiveEntities([], [branchOnlyJonathan], [], "branch-1")[0];
  const values: KnowledgeEntityValueRecord[] = [
    { entity_id: "branch-jonathan", branch_id: null, field_path: "title", value_json: "leaked", source_type: "ai", value_status: "active" },
  ];
  assertEquals(valuesToCandidates(entity, values, PROJECT_ID), []);
});

Deno.test("empty value input yields empty candidates", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  assertEquals(valuesToCandidates(entity, [], PROJECT_ID), []);
});

// --- relationship candidates --------------------------------------------------

const approvedMainRel: BranchRelationshipRecord = {
  id: "rel-main-1",
  branch_id: null,
  source_entity_id: "main-david",
  target_entity_id: "main-goliath",
  relationship_type: "defeated",
};

Deno.test("Main relationship candidates use the existing approved add/remove semantics via Phase 1's resolver", () => {
  const effective = resolveEffectiveBranchRelationships([approvedMainRel], [], null);
  const candidates = relationshipsToCandidates(effective, PROJECT_ID);
  assertEquals(candidates, [{
    kind: "relationship",
    id: "rel-main-1",
    projectId: PROJECT_ID,
    branchId: null,
    layer: "main",
    text: "main-david —defeated→ main-goliath",
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: [],
    evidence: [],
  }]);
});

Deno.test("REGRESSION: an approved Branch 'remove' still deletes the relationship candidate", () => {
  const removeRel: BranchRelationshipRecord = {
    branch_id: "branch-1",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "defeated",
    operation: "remove",
    review_status: "approved",
  };
  const effective = resolveEffectiveBranchRelationships([approvedMainRel], [removeRel], "branch-1");
  assertEquals(relationshipsToCandidates(effective, PROJECT_ID), []);
});

Deno.test("REGRESSION: an approved Branch 'add' overwrites the candidate for that relationship key", () => {
  const addRel: BranchRelationshipRecord = {
    id: "rel-branch-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "defeated",
    operation: "add",
    review_status: "approved",
  };
  const effective = resolveEffectiveBranchRelationships([approvedMainRel], [addRel], "branch-1");
  const candidates = relationshipsToCandidates(effective, PROJECT_ID);
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].id, "rel-branch-1");
  assertEquals(candidates[0].branchId, "branch-1");
  assertEquals(candidates[0].layer, "branch");
});

Deno.test("pending Branch relationships never produce candidates", () => {
  const pendingRel: BranchRelationshipRecord = {
    branch_id: "branch-1",
    source_entity_id: "main-david",
    target_entity_id: "main-goliath",
    relationship_type: "allied_with",
    operation: "add",
    review_status: "pending",
  };
  const effective = resolveEffectiveBranchRelationships([], [pendingRel], "branch-1");
  assertEquals(relationshipsToCandidates(effective, PROJECT_ID), []);
});

Deno.test("a relationship without an id falls back to a derived composite id, not a fabricated database id", () => {
  const relWithoutId: BranchRelationshipRecord = { ...approvedMainRel, id: undefined };
  const effective = resolveEffectiveBranchRelationships([relWithoutId], [], null);
  const [candidate] = relationshipsToCandidates(effective, PROJECT_ID);
  assertEquals(candidate.id, "main-david:main-goliath:defeated");
});

Deno.test("empty relationship input yields empty candidates", () => {
  assertEquals(relationshipsToCandidates([], PROJECT_ID), []);
});

// --- event candidates (additive only) ----------------------------------------

const mainEvent: KnowledgeEventRecord = { id: "event-main", branch_id: null, name: "The battle", version_id: "v1", raw_extraction_id: "extraction-4" };
const branchEvent: KnowledgeEventRecord = { id: "event-branch", branch_id: "branch-1", name: "The duel", description: "A private duel" };

Deno.test("Main-only event candidates exclude Branch events", () => {
  const effective = resolveEffectiveEvents([mainEvent], [branchEvent], null);
  const candidates = eventsToCandidates(effective, PROJECT_ID);
  assertEquals(candidates, [{
    kind: "event",
    id: "event-main",
    projectId: PROJECT_ID,
    branchId: null,
    layer: "main",
    text: "The battle",
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: ["v1"],
    evidence: ["extraction-4"],
  }]);
});

Deno.test("REGRESSION: selecting a branch adds its events on top of Main, additively (no remove overlay)", () => {
  const effective = resolveEffectiveEvents([mainEvent], [branchEvent], "branch-1");
  const candidates = eventsToCandidates(effective, PROJECT_ID);
  assertEquals(candidates.map((c) => c.id), ["event-main", "event-branch"]);
  const branchCandidate = candidates.find((c) => c.id === "event-branch")!;
  assertEquals(branchCandidate.layer, "branch");
  assertEquals(branchCandidate.text, "The duel: A private duel");
  assertEquals(branchCandidate.evidence, []); // no raw_extraction_id on this fixture — must not be fabricated
});

Deno.test("another branch's events never leak into this branch's candidates", () => {
  const effective = resolveEffectiveEvents([mainEvent], [branchEvent], "branch-2");
  assertEquals(eventsToCandidates(effective, PROJECT_ID).map((c) => c.id), ["event-main"]);
});

Deno.test("empty event input yields empty candidates", () => {
  assertEquals(eventsToCandidates([], PROJECT_ID), []);
});

// --- cross-kind composition / candidate normalization -------------------------

Deno.test("candidates from every kind share the same normalized shape", () => {
  const chunkCandidates = chunkToCandidates(
    [{ chunkId: "c1", content: "text", chapterNumber: null, chapterTitle: null, page: null, position: 0, versionId: "v1", score: 0.5 }],
    PROJECT_ID,
    "branch-1",
  );
  const entities = resolveEffectiveEntities([mainDavid], [branchOnlyJonathan], [], "branch-1");
  const entityCandidates = entitiesToCandidates(entities, PROJECT_ID);
  const valueCandidates = valuesToCandidates(entities[0], [
    { entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
  ], PROJECT_ID);
  const relationshipCandidates = relationshipsToCandidates(
    resolveEffectiveBranchRelationships([approvedMainRel], [], "branch-1"),
    PROJECT_ID,
  );
  const eventCandidates = eventsToCandidates(
    resolveEffectiveEvents([mainEvent], [branchEvent], "branch-1"),
    PROJECT_ID,
  );

  const all: RetrievalCandidate[] = [
    ...chunkCandidates,
    ...entityCandidates,
    ...valueCandidates,
    ...relationshipCandidates,
    ...eventCandidates,
  ];

  assertEquals(all.length, 1 + 2 + 1 + 1 + 2);
  const expectedKeys = [
    "kind", "id", "projectId", "branchId", "layer", "text", "score",
    "confidence", "sourceChunkIds", "versionIds", "evidence",
  ].sort();
  for (const candidate of all) {
    assertEquals(Object.keys(candidate).sort(), expectedKeys);
    assertEquals(candidate.projectId, PROJECT_ID);
  }
});

Deno.test("empty structured retrieval (no entities/values/relationships/events) yields only chunk candidates", () => {
  const chunkCandidates = chunkToCandidates(
    [{ chunkId: "c1", content: "text", chapterNumber: null, chapterTitle: null, page: null, position: 0, versionId: "v1", score: 0.5 }],
    PROJECT_ID,
    null,
  );
  const entityCandidates = entitiesToCandidates(resolveEffectiveEntities([], [], [], null), PROJECT_ID);
  const relationshipCandidates = relationshipsToCandidates(resolveEffectiveBranchRelationships([], [], null), PROJECT_ID);
  const eventCandidates = eventsToCandidates(resolveEffectiveEvents([], [], null), PROJECT_ID);

  assertEquals(entityCandidates, []);
  assertEquals(relationshipCandidates, []);
  assertEquals(eventCandidates, []);
  assertEquals(chunkCandidates.length, 1);
});
