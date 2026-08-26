import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveEffectiveEntities, resolveEffectiveEvents, type BranchRelationshipRecord, type KnowledgeEntityRecord, type KnowledgeEntityValueRecord, type KnowledgeEventRecord } from "./branch-resolution.ts";
import { entitiesToCandidates, eventsToCandidates, relationshipsToCandidates, valuesToCandidates, chunkToCandidates } from "./retrieval-candidate.ts";
import {
  attachChunkEvidence,
  attachEntityEvidence,
  attachEventEvidence,
  attachRelationshipEvidence,
  attachValueEvidence,
  resolveExtractionProvenanceEvidence,
  resolveMentionEvidence,
  resolveValueEvidence,
  type KnowledgeEntityMentionRecord,
  type KnowledgeEntityValueEvidenceRecord,
} from "./evidence.ts";

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

// --- value: entity -> value -> evidence -> chunk ---------------------------

Deno.test("entity -> value -> evidence -> chunk: value candidate is federated with real chunk evidence", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  const values: KnowledgeEntityValueRecord[] = [
    { id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: "black", source_type: "ai", value_status: "active", raw_extraction_id: "extraction-3" },
  ];
  const evidenceRows: KnowledgeEntityValueEvidenceRecord[] = [
    { id: "ev-1", value_id: "value-1", chunk_id: "chunk-9", position_start: 10, position_end: 25, raw_extraction_id: "extraction-3" },
  ];
  const [candidate] = valuesToCandidates(entity, values, PROJECT_ID);
  const federated = attachValueEvidence(candidate, entity, "hair_color", values, evidenceRows);
  assertEquals(federated.evidenceRecords, [{
    kind: "value-evidence",
    id: "ev-1",
    chunkId: "chunk-9",
    versionId: null,
    documentId: null,
    startPosition: 10,
    endPosition: 25,
    fieldPath: "hair_color",
    sourceType: "value_evidence",
    confidence: null,
    metadata: { rawExtractionId: "extraction-3" },
  }]);
  // Phase 2 fields untouched.
  assertEquals(federated.id, candidate.id);
  assertEquals(federated.text, candidate.text);
});

Deno.test("value evidence rows with no chunk_id are excluded, not fabricated", () => {
  const evidenceRows: KnowledgeEntityValueEvidenceRecord[] = [
    { id: "ev-1", value_id: "value-1", chunk_id: null, position_start: null, position_end: null, raw_extraction_id: "extraction-3" },
  ];
  assertEquals(resolveValueEvidence("value-1", "hair_color", evidenceRows), []);
});

Deno.test("value evidence only matches its own value_id", () => {
  const evidenceRows: KnowledgeEntityValueEvidenceRecord[] = [
    { id: "ev-1", value_id: "value-OTHER", chunk_id: "chunk-1", position_start: null, position_end: null, raw_extraction_id: null },
  ];
  assertEquals(resolveValueEvidence("value-1", "hair_color", evidenceRows), []);
});

Deno.test("multiple evidence records for one value are all federated", () => {
  const evidenceRows: KnowledgeEntityValueEvidenceRecord[] = [
    { id: "ev-1", value_id: "value-1", chunk_id: "chunk-1", position_start: 0, position_end: 5, raw_extraction_id: "ex-1" },
    { id: "ev-2", value_id: "value-1", chunk_id: "chunk-2", position_start: 6, position_end: 9, raw_extraction_id: "ex-1" },
  ];
  const records = resolveValueEvidence("value-1", "hair_color", evidenceRows);
  assertEquals(records.map((r) => r.chunkId), ["chunk-1", "chunk-2"]);
});

// --- entity -> mention -> chunk ---------------------------------------------

Deno.test("entity -> mention -> chunk: entity candidate is federated with real mention evidence", () => {
  const entities = resolveEffectiveEntities([mainDavid], [], [], null);
  const [candidate] = entitiesToCandidates(entities, PROJECT_ID);
  const mentions: KnowledgeEntityMentionRecord[] = [
    { id: "mention-1", entity_id: "main-david", chunk_id: "chunk-5", page_number: 3 },
  ];
  const federated = attachEntityEvidence(candidate, entities[0], mentions);
  const mentionEvidence = federated.evidenceRecords.find((e) => e.kind === "mention");
  assertEquals(mentionEvidence, {
    kind: "mention",
    id: "mention-1",
    chunkId: "chunk-5",
    versionId: null,
    documentId: null,
    startPosition: null,
    endPosition: null,
    fieldPath: null,
    sourceType: "mention",
    confidence: null,
    metadata: { pageNumber: 3 },
  });
});

Deno.test("mentions without a chunk_id carry no recoverable evidence and are excluded", () => {
  const mentions: KnowledgeEntityMentionRecord[] = [
    { id: "mention-1", entity_id: "main-david", chunk_id: null },
  ];
  assertEquals(resolveMentionEvidence("main-david", mentions), []);
});

Deno.test("mentions for a different entity never leak", () => {
  const mentions: KnowledgeEntityMentionRecord[] = [
    { id: "mention-1", entity_id: "someone-else", chunk_id: "chunk-1" },
  ];
  assertEquals(resolveMentionEvidence("main-david", mentions), []);
});

// --- entity/relationship/event extraction-provenance ------------------------

Deno.test("entity candidate carries version/document provenance alongside mention evidence", () => {
  const entities = resolveEffectiveEntities([mainDavid], [], [], null);
  const [candidate] = entitiesToCandidates(entities, PROJECT_ID);
  const federated = attachEntityEvidence(candidate, entities[0], []);
  const provenance = federated.evidenceRecords.find((e) => e.kind === "extraction-provenance");
  assertEquals(provenance, {
    kind: "extraction-provenance",
    id: "extraction-1",
    chunkId: null,
    versionId: "version-1",
    documentId: "doc-1",
    startPosition: null,
    endPosition: null,
    fieldPath: null,
    sourceType: "entity",
    confidence: null,
    metadata: {},
  });
});

Deno.test("resolveExtractionProvenanceEvidence returns empty when nothing is present, not a fabricated record", () => {
  assertEquals(
    resolveExtractionProvenanceEvidence({ versionId: null, documentId: null, rawExtractionId: null, sourceType: "entity" }),
    [],
  );
});

const approvedMainRel: BranchRelationshipRecord = {
  id: "rel-main-1",
  branch_id: null,
  source_entity_id: "main-david",
  target_entity_id: "main-goliath",
  relationship_type: "defeated",
  document_id: "doc-1",
  version_id: "version-1",
  raw_extraction_id: "extraction-5",
};

Deno.test("relationship candidate is federated with real extraction provenance, no chunk_id fabricated", () => {
  const [candidate] = relationshipsToCandidates([approvedMainRel], PROJECT_ID);
  const federated = attachRelationshipEvidence(candidate, approvedMainRel);
  assertEquals(federated.evidenceRecords, [{
    kind: "extraction-provenance",
    id: "extraction-5",
    chunkId: null,
    versionId: "version-1",
    documentId: "doc-1",
    startPosition: null,
    endPosition: null,
    fieldPath: null,
    sourceType: "relationship",
    confidence: null,
    metadata: {},
  }]);
});

Deno.test("relationship with no provenance columns yields empty evidence", () => {
  const bare: BranchRelationshipRecord = {
    branch_id: null,
    source_entity_id: "a",
    target_entity_id: "b",
    relationship_type: "knows",
  };
  const [candidate] = relationshipsToCandidates([bare], PROJECT_ID);
  const federated = attachRelationshipEvidence(candidate, bare);
  assertEquals(federated.evidenceRecords, []);
});

const mainEvent: KnowledgeEventRecord = { id: "event-main", branch_id: null, name: "The battle", version_id: "v1", document_id: "doc-1", raw_extraction_id: "extraction-4" };

Deno.test("event candidate is federated with real extraction provenance", () => {
  const effective = resolveEffectiveEvents([mainEvent], [], null);
  const [candidate] = eventsToCandidates(effective, PROJECT_ID);
  const federated = attachEventEvidence(candidate, mainEvent);
  assertEquals(federated.evidenceRecords, [{
    kind: "extraction-provenance",
    id: "extraction-4",
    chunkId: null,
    versionId: "v1",
    documentId: "doc-1",
    startPosition: null,
    endPosition: null,
    fieldPath: null,
    sourceType: "event",
    confidence: null,
    metadata: {},
  }]);
});

// --- Branch evidence isolation ----------------------------------------------

Deno.test("Branch isolation: mentions are only ever looked up by the resolved branch-scoped entity id, never cross-branch", () => {
  const entities = resolveEffectiveEntities([mainDavid], [branchOnlyJonathan], [], "branch-1");
  const jonathan = entities.find((e) => e.conceptualEntityId === "branch-jonathan")!;
  const [candidate] = entitiesToCandidates([jonathan], PROJECT_ID);
  const mentions: KnowledgeEntityMentionRecord[] = [
    { id: "mention-david", entity_id: "main-david", chunk_id: "chunk-1" }, // belongs to a different entity
  ];
  const federated = attachEntityEvidence(candidate, jonathan, mentions);
  assertEquals(federated.evidenceRecords.filter((e) => e.kind === "mention"), []);
});

Deno.test("Branch isolation: a branch-only entity's own mentions are still surfaced", () => {
  const entities = resolveEffectiveEntities([mainDavid], [branchOnlyJonathan], [], "branch-1");
  const jonathan = entities.find((e) => e.conceptualEntityId === "branch-jonathan")!;
  const [candidate] = entitiesToCandidates([jonathan], PROJECT_ID);
  const mentions: KnowledgeEntityMentionRecord[] = [
    { id: "mention-jonathan", entity_id: "branch-jonathan", chunk_id: "chunk-2" },
  ];
  const federated = attachEntityEvidence(candidate, jonathan, mentions);
  assertEquals(federated.evidenceRecords.filter((e) => e.kind === "mention").map((e) => e.chunkId), ["chunk-2"]);
});

// --- pending/rejected/superseded exclusion (inherited from Phase 1) --------

Deno.test("REGRESSION: a value evidence lookup is never even attempted for a rejected/superseded value, since Phase 2 never produces a candidate for it", () => {
  const entity = resolveEffectiveEntities([mainDavid], [], [], null)[0];
  const values: KnowledgeEntityValueRecord[] = [
    { id: "value-rejected", entity_id: "main-david", branch_id: null, field_path: "eye_color", value_json: "green", source_type: "ai", value_status: "rejected" },
  ];
  assertEquals(valuesToCandidates(entity, values, PROJECT_ID), []);
});

Deno.test("pending branch-only entities produce no candidate, so no evidence attachment is possible for them", () => {
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
});

// --- candidates with no evidence --------------------------------------------

Deno.test("chunk candidates have no evidence to federate — chunks are the terminal evidence unit", () => {
  const [candidate] = chunkToCandidates(
    [{ chunkId: "c1", content: "text", chapterNumber: null, chapterTitle: null, page: null, position: 0, versionId: "v1", score: 0.5 }],
    PROJECT_ID,
    null,
  );
  assertEquals(attachChunkEvidence(candidate).evidenceRecords, []);
});

Deno.test("an entity with no mentions and no provenance columns federates to empty evidence, not fabricated", () => {
  const bareEntity: KnowledgeEntityRecord = {
    id: "bare",
    canonical_name: "Nobody",
    entity_type: "character",
    layer: "main",
    branch_id: null,
  };
  const entities = resolveEffectiveEntities([bareEntity], [], [], null);
  const [candidate] = entitiesToCandidates(entities, PROJECT_ID);
  const federated = attachEntityEvidence(candidate, entities[0], []);
  assertEquals(federated.evidenceRecords, []);
});

// --- preservation of evidence through candidate conversion ------------------

Deno.test("attaching evidence preserves every existing Phase 2 candidate field verbatim", () => {
  const entities = resolveEffectiveEntities([mainDavid], [], [], null);
  const [candidate] = entitiesToCandidates(entities, PROJECT_ID);
  const federated = attachEntityEvidence(candidate, entities[0], []);
  const { evidenceRecords: _omit, ...rest } = federated;
  assertEquals(rest, candidate);
});
