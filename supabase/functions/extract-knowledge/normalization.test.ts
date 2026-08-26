import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeCharacterAge } from "../_shared/character-age.ts";
import { buildExtractionPromptForProfile, buildSubBaseCCharactersInstructions } from "../_shared/rules/prompt.ts";
import { buildAbilityLinks, buildObjectLinks, type AbilityLinkEntity } from "../_shared/ability-links.ts";
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

// ============================================
// Active legacy-sequential C path: characters + objects + abilities
// ============================================

Deno.test("C path prompt requests characters, objects, and abilities together, and excludes locations/events", () => {
  const prompt = buildExtractionPromptForProfile([{ position: 0, content: "טקסט לדוגמה" }], "sub-base-c-characters");
  assert(prompt.includes("=== OBJECTS ==="));
  assert(prompt.includes("=== ABILITIES ==="));
  assert(prompt.includes("=== CHARACTERS ==="));
  assert(prompt.includes("Do NOT return locations, organizations, or events as entities."));
  assertFalse(/=== LOCATIONS ===/.test(prompt));
});

Deno.test("C normalization extracts an object entity from the unified entities bucket", () => {
  const extraction = {
    characters: [character()],
    objects: [{
      name: "חרב הזהב",
      type: "object",
      attributes: { owners: ["Leah Frost"] },
      special_properties: "זוהרת בחושך",
      owners: ["Leah Frost"],
      evidence: ["חרב הזהב זהרה בידיה"],
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const sword = entities.find((entity) => entity.entity_type === "object");
  assert(sword);
  assertEquals(sword?.canonical_name, "חרב הזהב");
  assertEquals(sword?.structured_fields.special_properties, "זוהרת בחושך");
  assertEquals(sword?.structured_fields.owners, "Leah Frost");
});

Deno.test("C normalization extracts ability and magic_ability entities from the unified entities bucket", () => {
  const extraction = {
    characters: [character()],
    abilities: [{
      name: "לחימה בשתי חרבות",
      type: "ability",
      users: ["Leah Frost"],
      mechanism: "אימון שנים",
      chunk_positions: [2],
    }],
    magic_abilities: [{
      name: "טלקינזיס",
      type: "magic_ability",
      users: ["Leah Frost"],
      power_level: "בינוני",
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const ability = entities.find((entity) => entity.entity_type === "ability");
  const magicAbility = entities.find((entity) => entity.entity_type === "magic_ability");
  assert(ability);
  assert(magicAbility);
  assertEquals(ability?.structured_fields.mechanism, "אימון שנים");
  assertEquals(magicAbility?.structured_fields.power_level, "בינוני");
});

Deno.test("C normalization does not persist locations or organizations even if the model returns them", () => {
  const extraction = {
    characters: [character()],
    locations: [{ name: "טירת הצפון", type: "location", chunk_positions: [2] }],
    organizations: [{ name: "מסדר האור", type: "organization", chunk_positions: [2] }],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  assertFalse(entities.some((entity) => entity.entity_type === "location"));
  assertFalse(entities.some((entity) => entity.entity_type === "organization"));
});

Deno.test("C path: character-to-object link is built from the object's owners attribute", () => {
  const extraction = {
    characters: [character()],
    objects: [{
      name: "חרב הזהב",
      type: "object",
      attributes: { owners: ["Leah Frost"] },
      owners: ["Leah Frost"],
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const linkEntries: AbilityLinkEntity[] = entities.map((entity, index) => ({
    id: `entity-${index}`,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    aliases: entity.aliases,
    attributes: entity.attributes,
  }));

  const links = buildObjectLinks(linkEntries);
  assertEquals(links.length, 1);
  assertEquals(links[0].objectName, "חרב הזהב");
  assertEquals(links[0].relationshipType, "owns");
});

Deno.test("C path: character-to-ability link is built from the ability's users attribute", () => {
  const extraction = {
    characters: [character()],
    magic_abilities: [{
      name: "טלקינזיס",
      type: "magic_ability",
      attributes: { users: ["Leah Frost"] },
      users: ["Leah Frost"],
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const linkEntries: AbilityLinkEntity[] = entities.map((entity, index) => ({
    id: `entity-${index}`,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    aliases: entity.aliases,
    attributes: entity.attributes,
  }));

  const links = buildAbilityLinks(linkEntries);
  assertEquals(links.length, 1);
  assertEquals(links[0].abilityName, "טלקינזיס");
  assertEquals(links[0].relationshipType, "has_ability");
});

Deno.test("C path: an object arriving in a later batch still links to a character normalized in an earlier batch", () => {
  const earlierBatch = normalizeEntities(
    { characters: [character()] } as unknown as GeminiExtraction,
    chunkLookup,
    "sub-base-c-characters",
  );
  const laterBatch = normalizeEntities(
    {
      objects: [{
        name: "חרב הזהב",
        type: "object",
        attributes: { owners: ["Leah Frost"] },
        owners: ["Leah Frost"],
        chunk_positions: [2],
      }],
    } as unknown as GeminiExtraction,
    chunkLookup,
    "sub-base-c-characters",
  );

  const persisted: AbilityLinkEntity[] = earlierBatch.map((entity, index) => ({
    id: `persisted-${index}`,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    aliases: entity.aliases,
    attributes: entity.attributes,
  }));
  const current: AbilityLinkEntity[] = laterBatch.map((entity, index) => ({
    id: `current-${index}`,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    aliases: entity.aliases,
    attributes: entity.attributes,
  }));

  const links = buildObjectLinks([...persisted, ...current]);
  assertEquals(links.length, 1);
  assertEquals(links[0].characterId, "persisted-0");
  assertEquals(links[0].objectId, "current-0");
});

Deno.test("C path: two objects with the same name but conflicting field values are kept as separate entities", () => {
  const extraction = {
    objects: [
      {
        name: "חרב הזהב",
        type: "object",
        description: "חרב עתיקה מהמלחמה הראשונה",
        special_properties: "קרה כקרח",
        chunk_positions: [2],
      },
      {
        name: "חרב הזהב",
        type: "object",
        description: "חרב חדשה שנוצרה על ידי הנפח",
        special_properties: "בוערת באש",
        chunk_positions: [2],
      },
    ],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const swords = entities.filter((entity) => entity.entity_type === "object");
  assertEquals(swords.length, 2);
  const properties = swords.map((sword) => sword.structured_fields.special_properties).sort();
  assertEquals(properties, ["בוערת באש", "קרה כקרח"]);
});
