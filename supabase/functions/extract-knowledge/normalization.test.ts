import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeCharacterAge } from "../_shared/character-age.ts";
import { buildSubBaseCCharactersInstructions } from "../_shared/rules/prompt.ts";
import { adaptSubBaseCSerialExtraction } from "./testable-pipeline.ts";
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

Deno.test("C age normalization accepts canonical numeric and narrow Hebrew forms", () => {
  for (const [raw, expected] of [
    [17, "17"],
    ["17", "17"],
    ["שבע־עשרה", "17"],
    ["שבע עשרה", "17"],
    ["שבע-עשרה", "17"],
    ["בת שבע־עשרה", "17"],
  ] as const) {
    assertEquals(normalizeCharacterAge(raw), expected);
  }
  assertEquals(normalizeCharacterAge("נערה מהכפר שבע־עשרה, בעלת שיער שחור"), null);
  assertEquals(normalizeCharacterAge("בת שבע־עשרה מהכפר"), null);
});

Deno.test("C adapter keeps age evidence separate and rejects compound age values", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [{
      name: "אליה",
      age: "נערה מהכפר שבע־עשרה, בעלת שיער שחור",
      attributes: {
        first_name: "אליה",
        character_field_observations: {
          age: [
            {
              value: "בת שבע־עשרה",
              evidence: [{ quote: "אליה, נערה בת שבע־עשרה, מהכפר רינור" }],
              confidence: 0.8,
              inferred: false,
            },
            {
              value: "נערה מהכפר שבע־עשרה",
              evidence: [{ quote: "נערה מהכפר שבע־עשרה" }],
              confidence: 0.99,
              inferred: false,
            },
          ],
        },
      },
    }],
  });

  const entity = (adapted?.characters as Array<Record<string, unknown>>)[0];
  const attributes = entity.attributes as Record<string, unknown>;
  const observations = attributes.character_field_observations as Record<string, Array<Record<string, unknown>>>;
  assertEquals(attributes.age, "17");
  assertEquals(observations.age.map((observation) => observation.value), ["17", null]);
  assertEquals((observations.age[0].evidence as Array<Record<string, unknown>>)[0].quote, "אליה, נערה בת שבע־עשרה, מהכפר רינור");
});

Deno.test("C normalization aligns canonical age with the strongest explicit observation", () => {
  const extraction = {
    characters: [character({
      description: "נערה מהכפר שבע עשרה",
      attributes: {
        first_name: "אליה",
        age: "נערה מהכפר שבע־עשרה, בעלת שיער שחור",
        character_field_observations: {
          age: [
            {
              value: "נערה מהכפר שבע־עשרה",
              evidence: [{ quote: "נערה מהכפר שבע־עשרה" }],
              confidence: 0.99,
              inferred: false,
            },
            {
              value: "בת שבע־עשרה",
              evidence: [{ quote: "אליה, נערה בת שבע־עשרה" }],
              confidence: 0.7,
              inferred: false,
            },
          ],
        },
      },
    })],
  } as unknown as GeminiExtraction;
  const [entity] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");

  assertEquals(entity.structured_fields.age, "17");
  assertEquals(entity.description, "נערה מהכפר שבע עשרה");
  assertEquals(entity.field_observations?.age.map((observation) => observation.value), ["17", null]);
  assert(entity.field_evidence?.age.some((reference) => reference.quote === "אליה, נערה בת שבע־עשרה"));
});

Deno.test("C prompt requires a canonical age value and evidence separation", () => {
  const prompt = buildSubBaseCCharactersInstructions();
  assert(prompt.includes("canonical ASCII decimal string"));
  assert(prompt.includes("Keep the original wording only in that observation's evidence"));
  assert(prompt.includes("Keep description independent from age and evidence"));
});
