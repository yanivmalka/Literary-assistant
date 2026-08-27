import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  BranchRelationshipRecord,
  KnowledgeBranchEntityRecord,
  KnowledgeEntityRecord,
  KnowledgeEntityValueRecord,
  KnowledgeEventRecord,
} from "./branch-resolution.ts";
import type { KnowledgeEntityMentionRecord, KnowledgeEntityValueEvidenceRecord } from "./evidence.ts";
import type { QASource } from "./notebook-types.ts";
import type { ChunkSourceRow } from "./evidence.ts";
import { buildUnifiedRetrieval, EMPTY_UNIFIED_RETRIEVAL_ROWS, type UnifiedRetrievalRows } from "./unified-retrieval.ts";

const PROJECT_ID = "project-1";

const mainDavid: KnowledgeEntityRecord = {
  id: "main-david",
  canonical_name: "David",
  entity_type: "character",
  description: "The king's son",
  layer: "main",
  branch_id: null,
  version_id: "version-1",
  document_id: "doc-1",
  raw_extraction_id: "extraction-1",
};

const branchOnlyJonathan: KnowledgeEntityRecord = {
  id: "branch-jonathan",
  canonical_name: "Jonathan",
  entity_type: "character",
  layer: "branch",
  branch_id: "branch-1",
  review_status: "confirmed",
};

const otherBranchEntity: KnowledgeEntityRecord = {
  id: "branch-other",
  canonical_name: "Other",
  entity_type: "character",
  layer: "branch",
  branch_id: "branch-2",
};

const sampleChunk: QASource = {
  chunkId: "c1",
  content: "First passage",
  chapterNumber: 1,
  chapterTitle: "Ch1",
  page: null,
  position: 0,
  versionId: "v1",
  score: 0.9,
};

function rows(overrides: Partial<UnifiedRetrievalRows> = {}): UnifiedRetrievalRows {
  return { ...EMPTY_UNIFIED_RETRIEVAL_ROWS, ...overrides };
}

// --- existing chunk retrieval remains unchanged ------------------------------

Deno.test("REGRESSION: chunk candidates preserve the existing QASource content, order, and score exactly", () => {
  const chunks: QASource[] = [
    sampleChunk,
    { chunkId: "c2", content: "Second passage", chapterNumber: 2, chapterTitle: null, page: 12, position: 1, versionId: "v1", score: 0.5 },
  ];
  const result = buildUnifiedRetrieval(rows({ chunks }), { projectId: PROJECT_ID });
  const chunkCandidates = result.candidates.filter((c) => c.kind === "chunk");
  assertEquals(chunkCandidates.map((c) => c.id), ["c1", "c2"]);
  assertEquals(chunkCandidates.map((c) => c.score), [0.9, 0.5]);
  assertEquals(chunkCandidates.map((c) => c.text), ["First passage", "Second passage"]);
  assertEquals(chunkCandidates[0].evidenceRecords, []);
});

Deno.test("empty structured retrieval preserves the existing chunk-only path", () => {
  const result = buildUnifiedRetrieval(rows({ chunks: [sampleChunk] }), { projectId: PROJECT_ID });
  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].kind, "chunk");
  assertEquals(result.effectiveEntities, []);
});

// --- Main-only / selected Branch scope ---------------------------------------

Deno.test("Main-only scope resolves only Main entities, no branch inference", () => {
  const result = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], branchEntities: [branchOnlyJonathan] }),
    { projectId: PROJECT_ID },
  );
  assertEquals(result.scope.isMain, true);
  assertEquals(result.effectiveEntities.map((e) => e.conceptualEntityId), ["main-david"]);
});

Deno.test("selected Branch scope resolves Main baseline + branch overlay", () => {
  const result = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], branchEntities: [branchOnlyJonathan] }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  const ids = result.effectiveEntities.map((e) => e.conceptualEntityId).sort();
  assertEquals(ids, ["branch-jonathan", "main-david"]);
});

// --- Branch-only entities appear only in their Branch -------------------------

Deno.test("Branch-only entities never leak into Main-only or another Branch's retrieval", () => {
  const mainOnly = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], branchEntities: [branchOnlyJonathan] }),
    { projectId: PROJECT_ID },
  );
  assertEquals(mainOnly.effectiveEntities.map((e) => e.conceptualEntityId), ["main-david"]);

  const otherBranch = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], branchEntities: [otherBranchEntity] }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  assertEquals(otherBranch.effectiveEntities.map((e) => e.conceptualEntityId), ["main-david"]);
});

// --- Main-field overrides resolve correctly -----------------------------------

Deno.test("Main-field override resolves to a single effective entity in the override layer", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: { eye_color: "blue" },
  };
  const result = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], branchOverlays: [overlay] }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  assertEquals(result.effectiveEntities.length, 1);
  assertEquals(result.effectiveEntities[0].layer, "main-with-override");
  const entityCandidates = result.candidates.filter((c) => c.kind === "entity");
  assertEquals(entityCandidates.length, 1);
  assertEquals(entityCandidates[0].layer, "main-with-override");
});

// --- Branch values override Main values / competing observations preserved ---

Deno.test("Branch value overrides the Main value for the same field", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1", branch_id: "branch-1", source_entity_id: "main-david", entity_id: "main-david", overrides: {},
  };
  const values: KnowledgeEntityValueRecord[] = [
    { id: "v-main", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
    { id: "v-branch", entity_id: "main-david", branch_id: "branch-1", field_path: "hair_color", value_json: "silver", source_type: "user", value_status: "active" },
  ];
  const result = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], branchOverlays: [overlay], entityValues: values }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  const valueCandidates = result.candidates.filter((c) => c.kind === "value");
  assertEquals(valueCandidates.length, 1);
  assertEquals(valueCandidates[0].text, `hair_color: "silver"`);
});

Deno.test("competing valid AI observations for different fields both remain as separate candidates", () => {
  const values: KnowledgeEntityValueRecord[] = [
    { id: "v1", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
    { id: "v2", entity_id: "main-david", branch_id: null, field_path: "eye_color", value_json: "brown", source_type: "ai", value_status: "active" },
  ];
  const result = buildUnifiedRetrieval(rows({ mainEntities: [mainDavid], entityValues: values }), { projectId: PROJECT_ID });
  const valueCandidates = result.candidates.filter((c) => c.kind === "value");
  assertEquals(valueCandidates.map((c) => c.id).sort(), ["main-david:eye_color", "main-david:hair_color"]);
});

// --- relationship add/remove semantics ----------------------------------------

const approvedMainRel: BranchRelationshipRecord = {
  id: "rel-1", branch_id: null, source_entity_id: "main-david", target_entity_id: "main-goliath", relationship_type: "defeated",
};

Deno.test("relationship add/remove semantics remain unchanged through the unified pipeline", () => {
  const removeRel: BranchRelationshipRecord = {
    branch_id: "branch-1", source_entity_id: "main-david", target_entity_id: "main-goliath", relationship_type: "defeated",
    operation: "remove", review_status: "approved",
  };
  const removed = buildUnifiedRetrieval(
    rows({ mainRelationships: [approvedMainRel], branchRelationships: [removeRel] }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  assertEquals(removed.candidates.filter((c) => c.kind === "relationship"), []);

  const addRel: BranchRelationshipRecord = {
    id: "rel-branch-1", branch_id: "branch-1", source_entity_id: "main-david", target_entity_id: "main-saul",
    relationship_type: "served", operation: "add", review_status: "approved",
  };
  const added = buildUnifiedRetrieval(
    rows({ mainRelationships: [approvedMainRel], branchRelationships: [addRel] }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  assertEquals(added.candidates.filter((c) => c.kind === "relationship").map((c) => c.id).sort(), ["rel-1", "rel-branch-1"]);
});

// --- events remain additive ----------------------------------------------------

Deno.test("events remain additive: Branch adds on top of Main, no remove overlay", () => {
  const mainEvent: KnowledgeEventRecord = { id: "event-main", branch_id: null, name: "The battle" };
  const branchEvent: KnowledgeEventRecord = { id: "event-branch", branch_id: "branch-1", name: "The duel" };
  const result = buildUnifiedRetrieval(
    rows({ mainEvents: [mainEvent], branchEvents: [branchEvent] }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  assertEquals(result.candidates.filter((c) => c.kind === "event").map((c) => c.id).sort(), ["event-branch", "event-main"]);
});

// --- pending/rejected knowledge does not enter retrieval -----------------------

Deno.test("pending branch-only entities and rejected/superseded values never enter the candidate set", () => {
  const pending: KnowledgeEntityRecord = {
    id: "branch-pending", canonical_name: "Saul", entity_type: "character", layer: "branch", branch_id: "branch-1", review_status: "pending",
  };
  const pendingResult = buildUnifiedRetrieval(rows({ branchEntities: [pending] }), { projectId: PROJECT_ID, branchId: "branch-1" });
  assertEquals(pendingResult.candidates.filter((c) => c.kind === "entity"), []);

  const values: KnowledgeEntityValueRecord[] = [
    { id: "v-rejected", entity_id: "main-david", branch_id: null, field_path: "eye_color", value_json: "green", source_type: "ai", value_status: "rejected" },
    { id: "v-superseded", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "old", source_type: "ai", value_status: "superseded" },
  ];
  const valueResult = buildUnifiedRetrieval(rows({ mainEntities: [mainDavid], entityValues: values }), { projectId: PROJECT_ID });
  assertEquals(valueResult.candidates.filter((c) => c.kind === "value"), []);

  const pendingRel: BranchRelationshipRecord = {
    branch_id: "branch-1", source_entity_id: "main-david", target_entity_id: "main-goliath", relationship_type: "allied_with",
    operation: "add", review_status: "pending",
  };
  const relResult = buildUnifiedRetrieval(rows({ branchRelationships: [pendingRel] }), { projectId: PROJECT_ID, branchId: "branch-1" });
  assertEquals(relResult.candidates.filter((c) => c.kind === "relationship"), []);
});

// --- evidence remains attached --------------------------------------------------

Deno.test("evidence remains attached to entity and value candidates through the unified pipeline", () => {
  const mentions: KnowledgeEntityMentionRecord[] = [{ id: "mention-1", entity_id: "main-david", chunk_id: "chunk-5" }];
  const values: KnowledgeEntityValueRecord[] = [
    { id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
  ];
  const valueEvidence: KnowledgeEntityValueEvidenceRecord[] = [
    { id: "ev-1", value_id: "value-1", chunk_id: "chunk-9", position_start: 0, position_end: 5, raw_extraction_id: null },
  ];
  const result = buildUnifiedRetrieval(
    rows({ mainEntities: [mainDavid], mentions, entityValues: values, valueEvidence }),
    { projectId: PROJECT_ID },
  );
  const entityCandidate = result.candidates.find((c) => c.kind === "entity")!;
  assertEquals(entityCandidate.evidenceRecords.some((e) => e.kind === "mention" && e.chunkId === "chunk-5"), true);
  const valueCandidate = result.candidates.find((c) => c.kind === "value")!;
  assertEquals(valueCandidate.evidenceRecords, [{
    kind: "value-evidence", id: "ev-1", chunkId: "chunk-9", versionId: null, documentId: null,
    startPosition: 0, endPosition: 5, fieldPath: "hair_color", sourceType: "value_evidence", confidence: null, metadata: {},
  }]);
});

// --- all five kinds reach the unified result / ranking is applied --------------

Deno.test("candidates from all five kinds reach the unified retrieval result, and ranking is actually applied", () => {
  const overlay: KnowledgeBranchEntityRecord = {
    id: "overlay-1", branch_id: "branch-1", source_entity_id: "main-david", entity_id: "main-david", overrides: {},
  };
  const values: KnowledgeEntityValueRecord[] = [
    { id: "v1", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
  ];
  const event: KnowledgeEventRecord = { id: "event-main", branch_id: null, name: "The battle" };
  const result = buildUnifiedRetrieval(
    rows({
      chunks: [sampleChunk],
      mainEntities: [mainDavid],
      branchOverlays: [overlay],
      entityValues: values,
      mainRelationships: [approvedMainRel],
      mainEvents: [event],
    }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );
  const kinds = new Set(result.candidates.map((c) => c.kind));
  assertEquals(kinds, new Set(["chunk", "entity", "value", "relationship", "event"]));

  // Ranking was actually applied: every candidate produced a ranked entry with a federatedScore,
  // and the ranked list is ordered (non-increasing federatedScore).
  assertEquals(result.ranked.length, result.candidates.length);
  for (let i = 1; i < result.ranked.length; i++) {
    assertEquals(result.ranked[i - 1].federatedScore >= result.ranked[i].federatedScore, true);
  }
  assertNotEquals(result.ranked[0].federatedScore, undefined);
});

// --- no cross-branch leakage -----------------------------------------------------

Deno.test("no cross-branch structured knowledge (entities, values, relationships, events) leaks into another branch's result", () => {
  const otherBranchOverlay: KnowledgeBranchEntityRecord = {
    id: "overlay-2", branch_id: "branch-2", source_entity_id: "main-david", entity_id: "main-david", overrides: { eye_color: "red" },
  };
  const otherBranchValue: KnowledgeEntityValueRecord = {
    id: "v-other", entity_id: "main-david", branch_id: "branch-2", field_path: "hair_color", value_json: "green", source_type: "ai", value_status: "active",
  };
  const otherBranchRel: BranchRelationshipRecord = {
    branch_id: "branch-2", source_entity_id: "main-david", target_entity_id: "main-saul", relationship_type: "served",
    operation: "add", review_status: "approved",
  };
  const otherBranchEvent: KnowledgeEventRecord = { id: "event-other", branch_id: "branch-2", name: "Other branch's event" };

  const result = buildUnifiedRetrieval(
    rows({
      mainEntities: [mainDavid],
      branchEntities: [otherBranchEntity],
      branchOverlays: [otherBranchOverlay],
      entityValues: [otherBranchValue],
      mainRelationships: [approvedMainRel],
      branchRelationships: [otherBranchRel],
      mainEvents: [],
      branchEvents: [otherBranchEvent],
    }),
    { projectId: PROJECT_ID, branchId: "branch-1" },
  );

  assertEquals(result.effectiveEntities.map((e) => e.conceptualEntityId), ["main-david"]);
  assertEquals(result.effectiveEntities[0].layer, "main"); // the branch-2 override never applied
  assertEquals(result.candidates.filter((c) => c.kind === "value"), []);
  assertEquals(result.candidates.filter((c) => c.kind === "relationship").map((c) => c.branchId), [null]);
  assertEquals(result.candidates.filter((c) => c.kind === "event"), []);
});

// --- Phase 4: chunk-source federation + source registry -----------------------

const federationValues: KnowledgeEntityValueRecord[] = [
  { id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active" },
];
const federationValueEvidence: KnowledgeEntityValueEvidenceRecord[] = [
  { id: "ev-1", value_id: "value-1", chunk_id: "chunk-9", position_start: 120, position_end: 135, raw_extraction_id: "extraction-3" },
];
const federationMentions: KnowledgeEntityMentionRecord[] = [
  { id: "mention-1", entity_id: "main-david", chunk_id: "chunk-9" },
];
const federationChunkSources: ChunkSourceRow[] = [
  { id: "chunk-9", version_id: "version-1", document_id: "doc-1", position: 4, page: 3 },
];

Deno.test("Phase 4: chunk-grounded value/mention evidence is federated to real version/document/position from chunkSources", () => {
  const result = buildUnifiedRetrieval(
    rows({
      mainEntities: [mainDavid],
      mentions: federationMentions,
      entityValues: federationValues,
      valueEvidence: federationValueEvidence,
      chunkSources: federationChunkSources,
    }),
    { projectId: PROJECT_ID },
  );

  const valueCandidate = result.candidates.find((c) => c.kind === "value")!;
  assertEquals(valueCandidate.evidenceRecords, [{
    kind: "value-evidence", id: "ev-1", chunkId: "chunk-9",
    versionId: "version-1", documentId: "doc-1",
    startPosition: 120, endPosition: 135, fieldPath: "hair_color",
    sourceType: "value_evidence", confidence: null,
    metadata: { rawExtractionId: "extraction-3", chunkPosition: 4, page: 3 },
  }]);

  const mentionEvidence = result.candidates
    .find((c) => c.kind === "entity")!
    .evidenceRecords.find((e) => e.kind === "mention")!;
  assertEquals(mentionEvidence.versionId, "version-1");
  assertEquals(mentionEvidence.documentId, "doc-1");

  // Source registry: the value candidate resolves as chunk-grounded, carrying the federated coordinates.
  const valueEntry = result.sourceRegistry.find((e) => e.candidateId === "main-david:hair_color")!;
  assertEquals(valueEntry.resolution, "chunk-grounded");
  assertEquals(valueEntry.sources[0].versionId, "version-1");
  assertEquals(valueEntry.sources[0].documentId, "doc-1");
  assertEquals(result.sourceRegistry.length, result.ranked.length);
});

Deno.test("Phase 4 REGRESSION: with no chunkSources the candidate set, evidence, ranking order and scope are byte-identical to the pre-Phase-4 output", () => {
  const baseRows: Partial<UnifiedRetrievalRows> = {
    chunks: [sampleChunk],
    mainEntities: [mainDavid],
    branchEntities: [branchOnlyJonathan],
    mentions: federationMentions,
    entityValues: federationValues,
    valueEvidence: federationValueEvidence,
    mainRelationships: [approvedMainRel],
  };
  const withoutSources = buildUnifiedRetrieval(rows(baseRows), { projectId: PROJECT_ID });
  const withEmptySources = buildUnifiedRetrieval(rows({ ...baseRows, chunkSources: [] }), { projectId: PROJECT_ID });

  assertEquals(
    withEmptySources.candidates.map((c) => ({ id: c.id, kind: c.kind, evidenceRecords: c.evidenceRecords })),
    withoutSources.candidates.map((c) => ({ id: c.id, kind: c.kind, evidenceRecords: c.evidenceRecords })),
  );
  assertEquals(withEmptySources.ranked.map((r) => r.candidate.id), withoutSources.ranked.map((r) => r.candidate.id));
  assertEquals(withEmptySources.effectiveEntities.map((e) => e.conceptualEntityId), ["main-david"]);

  // The value evidence still has no fabricated version/document without a chunk source.
  const valueEvidenceRecord = withEmptySources.candidates.find((c) => c.kind === "value")!.evidenceRecords[0];
  assertEquals(valueEvidenceRecord.versionId, null);
  assertEquals(valueEvidenceRecord.documentId, null);
});

Deno.test("Phase 4: a chunk id absent from chunkSources is never fabricated; a version with no document keeps documentId null", () => {
  const notFabricated = buildUnifiedRetrieval(
    rows({
      mainEntities: [mainDavid],
      entityValues: federationValues,
      valueEvidence: federationValueEvidence,
      chunkSources: [{ id: "some-other-chunk", version_id: "version-x", document_id: "doc-x", position: 1, page: 1 }],
    }),
    { projectId: PROJECT_ID },
  );
  const untouched = notFabricated.candidates.find((c) => c.kind === "value")!.evidenceRecords[0];
  assertEquals(untouched.versionId, null);
  assertEquals(untouched.documentId, null);

  const versionOnly = buildUnifiedRetrieval(
    rows({
      mainEntities: [mainDavid],
      entityValues: federationValues,
      valueEvidence: federationValueEvidence,
      chunkSources: [{ id: "chunk-9", version_id: "version-1", document_id: null, position: 2, page: null }],
    }),
    { projectId: PROJECT_ID },
  );
  const partial = versionOnly.candidates.find((c) => c.kind === "value")!.evidenceRecords[0];
  assertEquals(partial.versionId, "version-1");
  assertEquals(partial.documentId, null);
  assertEquals(partial.metadata.chunkPosition, 2);
});

Deno.test("Phase 4: chunk-source federation does not change which candidates appear or the Main/Branch scope", () => {
  const scopedRows: Partial<UnifiedRetrievalRows> = {
    mainEntities: [mainDavid],
    branchEntities: [otherBranchEntity],
    entityValues: federationValues,
    valueEvidence: federationValueEvidence,
    chunkSources: federationChunkSources,
  };
  const branchResult = buildUnifiedRetrieval(rows(scopedRows), { projectId: PROJECT_ID, branchId: "branch-1" });
  // branch-2's entity still never leaks into branch-1, federation or not.
  assertEquals(branchResult.effectiveEntities.map((e) => e.conceptualEntityId), ["main-david"]);
  assertEquals(
    branchResult.candidates.map((c) => c.id).sort(),
    buildUnifiedRetrieval(rows({ ...scopedRows, chunkSources: [] }), { projectId: PROJECT_ID, branchId: "branch-1" })
      .candidates.map((c) => c.id).sort(),
  );
});
