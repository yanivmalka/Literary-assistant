import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveFieldProvenance,
  mergeFieldObservationMaps,
  normalizeFieldObservationMap,
} from "./field-provenance.ts";

const chunks = new Map<number, { id: string; page: number | null }>([
  [4, { id: "chunk-4", page: 9 }],
]);

Deno.test("field observations resolve chunk, page, and offsets", () => {
  const observations = normalizeFieldObservationMap({
    fears: [{
      value: "heights",
      evidence: [{
        quote: "She would not look down.",
        chunk_position: 4,
        start_offset: 10,
        end_offset: 31,
      }],
      confidence: 0.82,
      inferred: true,
      inference_note: "Repeated avoidance of high places",
    }],
  }, chunks);
  const observation = observations.fears[0];
  assertEquals(observation.evidence[0], {
    quote: "She would not look down.",
    chunk_position: 4,
    chunk_id: "chunk-4",
    page: 9,
    position_start: 10,
    position_end: 31,
  });
  assertEquals(deriveFieldProvenance(observations).field_confidence.fears, 0.82);
  assertEquals(deriveFieldProvenance(observations).field_inferred.fears, true);
});

Deno.test("field observation merge preserves distinct conflicting values", () => {
  const target = normalizeFieldObservationMap({ age: [{ value: "30", evidence: [{ quote: "thirty", chunk_position: 4 }] }] }, chunks);
  const incoming = normalizeFieldObservationMap({ age: [{ value: "31", evidence: [{ quote: "thirty-one", chunk_position: 4 }] }] }, chunks);
  mergeFieldObservationMaps(target, incoming);
  assertEquals(target.age.length, 2);
  assertEquals(target.age.map((item) => item.value), ["30", "31"]);
});

Deno.test("duplicate field observations are idempotently deduplicated", () => {
  const observations = normalizeFieldObservationMap({
    eye_color: [
      { value: "blue", evidence: [{ quote: "blue eyes", chunk_position: 4 }] },
      { value: "blue", evidence: [{ quote: "blue eyes", chunk_position: 4 }] },
    ],
  }, chunks);
  assert(observations.eye_color.length === 1);
});

// ============================================================
// Phase 3 (Evidence Federation): version/document preservation
// ============================================================

Deno.test("Phase 3: a version-aware chunk lookup carries version_id/document_id onto each field reference", () => {
  const versioned = new Map<number, { id: string; page: number | null; version_id?: string | null; document_id?: string | null }>([
    [4, { id: "chunk-4", page: 9, version_id: "version-77", document_id: "doc-3" }],
  ]);
  const observations = normalizeFieldObservationMap({
    hair_color: [{
      value: "black",
      evidence: [{ quote: "her black hair", chunk_position: 4 }],
      confidence: 0.9,
      inferred: false,
    }],
  }, versioned);
  assertEquals(observations.hair_color[0].evidence[0], {
    quote: "her black hair",
    chunk_position: 4,
    chunk_id: "chunk-4",
    page: 9,
    position_start: null,
    position_end: null,
    version_id: "version-77",
    document_id: "doc-3",
  });
  // deriveFieldProvenance carries the same references through unchanged.
  const derived = deriveFieldProvenance(observations);
  assertEquals(derived.field_evidence.hair_color[0].version_id, "version-77");
  assertEquals(derived.field_evidence.hair_color[0].document_id, "doc-3");
});

Deno.test("Phase 3: a lookup without version context yields byte-identical references (no new keys)", () => {
  const observations = normalizeFieldObservationMap({
    eye_color: [{ value: "blue", evidence: [{ quote: "blue eyes", chunk_position: 4 }] }],
  }, chunks);
  const reference = observations.eye_color[0].evidence[0];
  assertEquals(Object.prototype.hasOwnProperty.call(reference, "version_id"), false);
  assertEquals(Object.prototype.hasOwnProperty.call(reference, "document_id"), false);
});
