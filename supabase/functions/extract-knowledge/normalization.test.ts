import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildStructuredFields,
  normalizeEntities,
  type ExtractedEntity,
  type GeminiExtraction,
} from "./normalization.ts";

const chunkLookup = new Map<number, { id: string; page: number | null }>([
  [2, { id: "chunk-2", page: 7 }],
]);

function character(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Leah Frost",
    type: "character",
    attributes: {
      first_name: "Leah",
      last_name: "Frost",
      age: "30",
      custom_motto: "Never retreat",
      unapproved_internal_field: "must not persist",
      extraction_meta: { should_not_become_a_value: true },
      character_field_observations: {
        fears: [{
          value: "heights",
          evidence: [{ quote: "She would not look down.", chunk_position: 2 }],
          confidence: 0.81,
          inferred: true,
          inference_note: "Repeated avoidance of high places",
        }],
        age: [
          { value: "30", evidence: [{ quote: "Leah was thirty.", chunk_position: 2 }], confidence: 0.9, inferred: false },
          { value: "31", evidence: [{ quote: "The report listed thirty-one.", chunk_position: 2 }], confidence: 0.55, inferred: false },
        ],
      },
    },
    evidence: ["Leah was thirty."],
    chunk_positions: [2],
    ...overrides,
  };
}

Deno.test("C normalization enforces first_name and derives display name", () => {
  const extraction = { characters: [character()] } as unknown as GeminiExtraction;
  const [entity] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters", {
    activeCharacterFieldKeys: ["custom_motto"],
  });
  assertEquals(entity.canonical_name, "Leah Frost");
  assertEquals(entity.structured_fields.first_name, "Leah");
  assertEquals(entity.structured_fields.last_name, "Frost");
  assertEquals(entity.structured_fields.custom_motto, "Never retreat");
  assertEquals(entity.structured_fields.unapproved_internal_field, undefined);
  assertEquals(entity.structured_fields.extraction_meta, undefined);
  assertEquals(entity.field_evidence?.fears?.[0].chunk_id, "chunk-2");
  assertEquals(entity.field_evidence?.fears?.[0].page, 7);
  assertEquals(entity.field_inferred?.fears, true);
  assertEquals(entity.field_observations?.age.length, 2);
});

Deno.test("C normalization drops characters without first_name", () => {
  const extraction = { characters: [character({
    name: "Unnamed Figure",
    attributes: { character_field_observations: { fears: [{ value: "darkness", evidence: [{ quote: "dark", chunk_position: 2 }] }] } },
  })] } as unknown as GeminiExtraction;
  assertEquals(normalizeEntities(extraction, chunkLookup, "sub-base-c-characters").length, 0);
});

Deno.test("dynamic fields remain profile-scoped and legacy fields stay compatible", () => {
  const cFields = buildStructuredFields("character", character() as unknown as ExtractedEntity, "sub-base-c-characters", {
    activeCharacterFieldKeys: ["custom_motto"],
  });
  assertEquals(cFields.custom_motto, "Never retreat");
  assertEquals(cFields.unapproved_internal_field, undefined);

  const legacyFields = buildStructuredFields("character", {
    name: "Leah",
    age: "30",
    attributes: { custom_motto: "Never retreat" },
  }, "sub-base");
  assertEquals(legacyFields.age, "30");
  assertEquals(legacyFields.custom_motto, undefined);
});
