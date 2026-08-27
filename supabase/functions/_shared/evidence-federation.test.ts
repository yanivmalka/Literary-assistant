import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildChunkSourceIndex,
  federateEvidenceThroughChunks,
  fieldEvidenceReferencesToUnifiedEvidence,
  type ChunkSourceIndex,
  type UnifiedEvidence,
} from "./evidence.ts";
import { normalizeFieldObservationMap, deriveFieldProvenance } from "./field-provenance.ts";

// ---------------------------------------------------------------------------
// buildChunkSourceIndex
// ---------------------------------------------------------------------------

Deno.test("buildChunkSourceIndex maps chunk id -> version/document/position/page", () => {
  const index = buildChunkSourceIndex([
    { id: "chunk-1", version_id: "v-1", document_id: "d-1", position: 0, page: 3 },
    { id: "chunk-2", version_id: "v-1", document_id: "d-1", position: 1, page: 3 },
    { id: "", version_id: "v-1" }, // no real id -> skipped
  ]);
  assertEquals(index.size, 2);
  assertEquals(index.get("chunk-2"), { versionId: "v-1", documentId: "d-1", position: 1, page: 3 });
});

// ---------------------------------------------------------------------------
// federateEvidenceThroughChunks
// ---------------------------------------------------------------------------

const chunkIndex: ChunkSourceIndex = new Map([
  ["chunk-9", { versionId: "version-42", documentId: "doc-7", position: 12, page: 4 }],
]);

Deno.test("federateEvidenceThroughChunks fills version/document/position for a chunk-grounded record", () => {
  const record: UnifiedEvidence = {
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
  };
  const [federated] = federateEvidenceThroughChunks([record], chunkIndex);
  assertEquals(federated.versionId, "version-42");
  assertEquals(federated.documentId, "doc-7");
  assertEquals(federated.metadata.chunkPosition, 12);
  assertEquals(federated.metadata.page, 4);
  // Untouched fields.
  assertEquals(federated.chunkId, "chunk-9");
  assertEquals(federated.startPosition, 10);
  assertEquals(federated.metadata.rawExtractionId, "extraction-3");
  // Pure: the input is not mutated.
  assertEquals(record.versionId, null);
});

Deno.test("federateEvidenceThroughChunks never fabricates for records with no resolvable chunk", () => {
  const noChunk: UnifiedEvidence = {
    kind: "extraction-provenance",
    id: "ex-1",
    chunkId: null,
    versionId: "version-known",
    documentId: null,
    startPosition: null,
    endPosition: null,
    fieldPath: null,
    sourceType: "entity",
    confidence: null,
    metadata: {},
  };
  const unknownChunk: UnifiedEvidence = { ...noChunk, id: "ex-2", chunkId: "chunk-not-indexed", versionId: null };
  const [a, b] = federateEvidenceThroughChunks([noChunk, unknownChunk], chunkIndex);
  assertEquals(a, noChunk);            // returned unchanged
  assertEquals(b.versionId, null);     // no chunk in the index -> not fabricated
  assertEquals(b.documentId, null);
});

Deno.test("federateEvidenceThroughChunks does not overwrite a version already resolved on the record", () => {
  const record: UnifiedEvidence = {
    kind: "value-evidence",
    id: "ev-1",
    chunkId: "chunk-9",
    versionId: "already-set",
    documentId: "already-doc",
    startPosition: null,
    endPosition: null,
    fieldPath: "age",
    sourceType: "value_evidence",
    confidence: null,
    metadata: {},
  };
  const [federated] = federateEvidenceThroughChunks([record], chunkIndex);
  assertEquals(federated.versionId, "already-set");
  assertEquals(federated.documentId, "already-doc");
});

// ---------------------------------------------------------------------------
// fieldEvidenceReferencesToUnifiedEvidence
// ---------------------------------------------------------------------------

Deno.test("fieldEvidenceReferencesToUnifiedEvidence normalizes extraction references into the shared shape", () => {
  const unified = fieldEvidenceReferencesToUnifiedEvidence("hair_color", [
    {
      quote: "her black hair",
      chunk_position: 12,
      chunk_id: "chunk-9",
      page: 4,
      position_start: null,
      position_end: null,
      version_id: "version-42",
      document_id: "doc-7",
    },
  ]);
  assertEquals(unified, [{
    kind: "value-evidence",
    id: "chunk-9",
    chunkId: "chunk-9",
    versionId: "version-42",
    documentId: "doc-7",
    startPosition: null,
    endPosition: null,
    fieldPath: "hair_color",
    sourceType: "value_evidence",
    confidence: null,
    metadata: { chunkPosition: 12, page: 4, quote: "her black hair" },
  }]);
});

Deno.test("fieldEvidenceReferencesToUnifiedEvidence keeps a chunk-less reference ungrounded", () => {
  const [unified] = fieldEvidenceReferencesToUnifiedEvidence("beliefs", [
    { quote: "a legacy quote", chunk_position: null, chunk_id: null, page: null, position_start: null, position_end: null },
  ]);
  assertEquals(unified.chunkId, null);
  assertEquals(unified.versionId, null);
  assertEquals(unified.documentId, null);
  assert(typeof unified.id === "string" && unified.id.length > 0); // stable synthetic id, not null
});

// ---------------------------------------------------------------------------
// End-to-end: Entity -> field observation -> reference -> UnifiedEvidence ->
// federate -> { chunkId, versionId, documentId, position }
// ---------------------------------------------------------------------------

Deno.test("end to end: a Character field value federates to chunk + version + document + position", () => {
  const chunkLookup = new Map<number, { id: string; page: number | null; version_id?: string | null; document_id?: string | null }>([
    [5, { id: "chunk-5", page: 2, version_id: "version-100", document_id: "doc-1" }],
  ]);
  const observations = normalizeFieldObservationMap({
    hair_color: [{
      value: "black",
      evidence: [{ quote: "his black hair", chunk_position: 5 }],
      confidence: 0.85,
      inferred: false,
    }],
  }, chunkLookup);
  const fieldEvidence = deriveFieldProvenance(observations).field_evidence.hair_color;

  const unified = fieldEvidenceReferencesToUnifiedEvidence("hair_color", fieldEvidence);
  // The reference already resolved version/document via the version-aware lookup.
  assertEquals(unified[0].chunkId, "chunk-5");
  assertEquals(unified[0].versionId, "version-100");
  assertEquals(unified[0].documentId, "doc-1");

  // A record that only knows its chunk still federates through a chunk index.
  const chunkOnly = { ...unified[0], versionId: null, documentId: null };
  const [federated] = federateEvidenceThroughChunks(
    [chunkOnly],
    buildChunkSourceIndex([{ id: "chunk-5", version_id: "version-100", document_id: "doc-1", position: 5, page: 2 }]),
  );
  assertEquals(federated.versionId, "version-100");
  assertEquals(federated.documentId, "doc-1");
  assertEquals(federated.metadata.chunkPosition, 5);
});
