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

Deno.test("C normalization derives first/last name from a usable name instead of dropping the character", () => {
  const extraction = { characters: [character({
    name: "Unnamed Figure",
    attributes: { character_field_observations: { fears: [{ value: "darkness", evidence: [{ quote: "dark", chunk_position: 2 }] }] } },
  })] } as unknown as GeminiExtraction;
  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  assertEquals(entities.length, 1);
  assertEquals(entities[0].structured_fields.first_name, "Unnamed");
  assertEquals(entities[0].structured_fields.last_name, "Figure");
  assertEquals(entities[0].canonical_name, "Unnamed Figure");
});

Deno.test("C normalization still drops a character with no usable name at all", () => {
  const extraction = { characters: [character({
    name: "   ",
    attributes: { character_field_observations: { fears: [{ value: "darkness", evidence: [{ quote: "dark", chunk_position: 2 }] }] } },
  })] } as unknown as GeminiExtraction;
  assertEquals(normalizeEntities(extraction, chunkLookup, "sub-base-c-characters").length, 0);
});

Deno.test("C normalization prioritizes explicit observations over inferred ones", () => {
  const extraction = { characters: [character({
    attributes: {
      first_name: "Leah",
      last_name: "Frost",
      hair_color: "black",
      character_field_observations: {
        hair_color: [
          { value: "brown", evidence: [{ quote: "a brownish tint", chunk_position: 2 }], confidence: 0.4, inferred: true, inference_note: "impression" },
          { value: "black", evidence: [{ quote: "her black hair", chunk_position: 2 }], confidence: 0.9, inferred: false },
        ],
      },
    },
  })] } as unknown as GeminiExtraction;
  const [entity] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  assertEquals(entity.field_observations?.hair_color?.[0].value, "black");
  assertEquals(entity.field_inferred?.hair_color, false);
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

Deno.test("C adapter normalizes source/target/type relationships to character_a/character_b/relationship_type in a legacy-bucketed payload", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [
      { name: "Mira Stonewell", attributes: { first_name: "Mira", last_name: "Stonewell" } },
      { name: "Dorian Vale", attributes: { first_name: "Dorian", last_name: "Vale" } },
    ],
    relationships: [{
      source: { name: "Mira Stonewell", type: "character" },
      target: { name: "Dorian Vale", type: "character" },
      type: "alliance",
      description: "Trusted allies.",
      evidence: ["Mira and Dorian are trusted allies."],
      source_references: [{ chunk_position: 0, quote: "Mira and Dorian are trusted allies." }],
      chunk_positions: [0],
    }],
  });

  const relationship = (adapted?.relationships as Array<Record<string, unknown>>)[0];
  assertEquals(relationship.character_a, "Mira Stonewell");
  assertEquals(relationship.character_b, "Dorian Vale");
  assertEquals(relationship.relationship_type, "alliance");
  assertEquals(relationship.source_type, "character");
  assertEquals(relationship.target_type, "character");
  assertEquals(relationship.evidence, ["Mira and Dorian are trusted allies."]);
  assertEquals(relationship.chunk_positions, [0]);
  // source/target/type remain present (canonicalRelationshipToLegacy spreads the original fields).
  assertEquals((relationship.source as Record<string, unknown>).name, "Mira Stonewell");
});

Deno.test("C adapter leaves already-legacy character_a/character_b relationships unchanged", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [{ name: "Mira Stonewell", attributes: { first_name: "Mira" } }],
    relationships: [{
      character_a: "Mira Stonewell",
      character_b: "Dorian Vale",
      relationship_type: "alliance",
      evidence: ["Mira and Dorian are trusted allies."],
    }],
  });

  const relationship = (adapted?.relationships as Array<Record<string, unknown>>)[0];
  assertEquals(relationship.character_a, "Mira Stonewell");
  assertEquals(relationship.character_b, "Dorian Vale");
  assertEquals(relationship.relationship_type, "alliance");
});

Deno.test("C adapter normalizes relationships when the top-level payload is schema_version=2 with a unified entities array", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    schema_version: "2",
    entities: [
      { name: "Mira Stonewell", type: "character", attributes: { first_name: "Mira" } },
      { name: "Dorian Vale", type: "character", attributes: { first_name: "Dorian" } },
    ],
    relationships: [{
      source: { name: "Mira Stonewell", type: "character" },
      target: { name: "Dorian Vale", type: "character" },
      type: "alliance",
    }],
  });

  // adaptSubBaseCSerialExtraction only reads record.characters; a schema_version=2 payload's
  // entities live under `entities`, not `characters`, so normalizeCanonicalPayload (called
  // separately, before this adapter, in extract-knowledge/index.ts) is what groups entities
  // into characters for this shape. Here we confirm the adapter's own relationship handling
  // is shape-agnostic: it still normalizes source/target/type regardless of how characters
  // arrived.
  const relationship = (adapted?.relationships as Array<Record<string, unknown>>)[0];
  assertEquals(relationship.character_a, "Mira Stonewell");
  assertEquals(relationship.character_b, "Dorian Vale");
  assertEquals(relationship.relationship_type, "alliance");
});

Deno.test("C adapter leaves a relationship missing source/target/type untouched for the shared validator to reject", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [{ name: "Mira Stonewell", attributes: { first_name: "Mira" } }],
    relationships: [{ description: "no identifiable parties" }],
  });

  const relationship = (adapted?.relationships as Array<Record<string, unknown>>)[0];
  assertEquals(relationship.character_a, undefined);
  assertEquals(relationship.character_b, undefined);
  assertEquals(relationship.relationship_type, undefined);
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

// ============================================================
// Phase 1 regression tests: C prompt/adapter/normalization/age
// ============================================================

Deno.test("Phase 1: C prompt CHARACTER example uses attributes.first_name and character_field_observations, not flat fields", () => {
  const prompt = buildExtractionPromptForProfile([{ position: 0, content: "x" }], "sub-base-c-characters");
  const exampleStart = prompt.indexOf("Example - CHARACTER");
  assert(exampleStart !== -1, "C prompt must contain a CHARACTER example");
  const example = prompt.slice(exampleStart, exampleStart + 2000);
  assert(example.includes('"first_name": "ליאו"'), "example must put first_name inside attributes");
  assert(example.includes('"character_field_observations"'), "example must show character_field_observations");
  assert(!/\n\s*"age":\s*25/.test(example), "example must not show a flat numeric age sibling of name");
  assert(!example.includes('"field_evidence"'), "C CHARACTER example must not use top-level field_evidence");
});

Deno.test("Phase 1: C adapter recovers recognized flat character fields into attributes", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    schema_version: "2",
    characters: [{
      name: "ליאו פרוסט",
      type: "character",
      attributes: { first_name: "ליאו", last_name: "פרוסט" },
      hair_color: "שחור",
      age: 25,
      occupation: "ארכיונאי",
      field_evidence: { hair_color: ["שערו השחור"] },
    }],
  });
  const attributes = (adapted?.characters as Array<Record<string, unknown>>)[0].attributes as Record<string, unknown>;
  assertEquals(attributes.hair_color, "שחור");
  assertEquals(attributes.age, "25");
  assertEquals(attributes.occupation, "ארכיונאי");
  const observations = attributes.character_field_observations as Record<string, Array<Record<string, unknown>>>;
  assertEquals(observations.hair_color[0].value, "שחור");
});

Deno.test("Phase 1: C adapter fills value-less observation entries from an available field value", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [{
      name: "ליאו",
      attributes: {
        first_name: "ליאו",
        hair_color: "שחור",
        character_field_observations: {
          hair_color: [{ evidence: [{ quote: "שערו השחור", chunk_position: 0 }], confidence: 0.9, inferred: false }],
        },
      },
    }],
  });
  const attributes = (adapted?.characters as Array<Record<string, unknown>>)[0].attributes as Record<string, unknown>;
  const observations = attributes.character_field_observations as Record<string, Array<Record<string, unknown>>>;
  assertEquals(observations.hair_color[0].value, "שחור");
});

Deno.test("Phase 1: C adapter maps compatibility field aliases onto canonical keys", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [{
      name: "ליאו",
      attributes: { first_name: "ליאו" },
      favorite_food: "עוגה",
      dislikes: "דגים",
      religion_and_beliefs: "חילוני",
    }],
  });
  const attributes = (adapted?.characters as Array<Record<string, unknown>>)[0].attributes as Record<string, unknown>;
  assertEquals(attributes.favorite_foods, "עוגה");
  assertEquals(attributes.disliked_foods, "דגים");
  assertEquals(attributes.beliefs, "חילוני");
  assertEquals(attributes.favorite_food, undefined);
  assertEquals(attributes.dislikes, undefined);
  assertEquals(attributes.religion_and_beliefs, undefined);
});

Deno.test("Phase 1: C adapter drops relationships with a non-C relationship type and keeps valid ones", () => {
  const adapted = adaptSubBaseCSerialExtraction({
    characters: [
      { name: "ליאו", attributes: { first_name: "ליאו" } },
      { name: "מירה", attributes: { first_name: "מירה" } },
    ],
    relationships: [
      { source: { name: "ליאו" }, target: { name: "מירה" }, type: "besties" },
      { source: { name: "ליאו" }, target: { name: "מירה" }, type: "family" },
      { source: { name: "ליאו" }, target: { name: "מירה" }, type: "Mentorship" },
    ],
  });
  const relationships = adapted?.relationships as Array<Record<string, unknown>>;
  assertEquals(relationships.length, 2);
  assertEquals(relationships.map((relationship) => relationship.relationship_type).sort(), ["family", "mentorship"]);
});

Deno.test("Phase 1: Hebrew age lexicon covers ones, tens and combined ages", () => {
  for (const [raw, expected] of [
    ["בן שבע", "7"],
    ["בת תשע", "9"],
    ["בן עשר", "10"],
    ["בן שלושים", "30"],
    ["בת עשרים וחמש", "25"],
    ["בן חמש ועשרים", "25"],
    ["בן שבעים ושלוש", "73"],
  ] as const) {
    assertEquals(normalizeCharacterAge(raw), expected);
  }
  // Descriptive prose and ambiguous phrases must never become an age.
  assertEquals(normalizeCharacterAge("נערה מהכפר שבע עשרה"), null);
  assertEquals(normalizeCharacterAge("בן גיל העמידה"), null);
  assertEquals(normalizeCharacterAge("בן מאה"), null);
});

Deno.test("Phase 1: nikud is stripped before Hebrew age parsing", () => {
  // Vocalized "בן שש עשרה" (age 16) with nikud on every letter.
  assertEquals(normalizeCharacterAge("בֶּן שֵׁשׁ עֶשְׂרֵה"), "16");
});

Deno.test("Phase 1: prompt->adapter->normalization round-trips a character in the documented C shape", () => {
  const modelPayload = {
    schema_version: "2",
    characters: [{
      name: "ליאו פרוסט",
      type: "character",
      aliases: ["ליאו"],
      description: "קוסם קודר",
      attributes: {
        first_name: "ליאו",
        last_name: "פרוסט",
        age: "25",
        hair_color: "שחור",
        character_field_observations: {
          first_name: [{ value: "ליאו", evidence: [{ quote: "אני ליאו פרוסט", chunk_position: 2 }], confidence: 0.98, inferred: false }],
          age: [{ value: "25", evidence: [{ quote: "בן חמש ועשרים", chunk_position: 2 }], confidence: 0.9, inferred: false }],
          hair_color: [{ value: "שחור", evidence: [{ quote: "שערו השחור", chunk_position: 2 }], confidence: 0.85, inferred: false }],
        },
      },
      chunk_positions: [2],
    }],
  };
  const adapted = adaptSubBaseCSerialExtraction(modelPayload) as unknown as GeminiExtraction;
  const [entity] = normalizeEntities(adapted, chunkLookup, "sub-base-c-characters");
  assertEquals(entity.canonical_name, "ליאו פרוסט");
  assertEquals(entity.structured_fields.first_name, "ליאו");
  assertEquals(entity.structured_fields.last_name, "פרוסט");
  assertEquals(entity.structured_fields.age, "25");
  assertEquals(entity.structured_fields.hair_color, "שחור");
  assertEquals(entity.field_evidence?.hair_color?.[0].chunk_id, "chunk-2");
});

// ============================================================
// Phase 3 (Evidence Federation): the C extraction path preserves
// version/document on each field's evidence, alongside chunk id.
// ============================================================

Deno.test("Phase 3: C normalization preserves version_id/document_id on field evidence", () => {
  const versionedLookup = new Map<number, { id: string; page: number | null; version_id?: string | null; document_id?: string | null }>([
    [2, { id: "chunk-2", page: 7, version_id: "version-501", document_id: "doc-9" }],
  ]);
  const extraction = {
    characters: [{
      name: "ליאו פרוסט",
      type: "character",
      attributes: {
        first_name: "ליאו",
        last_name: "פרוסט",
        hair_color: "שחור",
        character_field_observations: {
          hair_color: [{
            value: "שחור",
            evidence: [{ quote: "שערו השחור", chunk_position: 2 }],
            confidence: 0.85,
            inferred: false,
          }],
        },
      },
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const [entity] = normalizeEntities(extraction, versionedLookup, "sub-base-c-characters");
  const reference = entity.field_evidence?.hair_color?.[0];
  assertEquals(reference?.chunk_id, "chunk-2");
  assertEquals(reference?.chunk_position, 2);
  assertEquals(reference?.version_id, "version-501");
  assertEquals(reference?.document_id, "doc-9");
  // The observation carries the same resolved reference.
  assertEquals(entity.field_observations?.hair_color?.[0].evidence[0].version_id, "version-501");
});

Deno.test("Phase 3: a lookup without version context leaves C field evidence byte-identical (no regression)", () => {
  const extraction = {
    characters: [{
      name: "ליאו פרוסט",
      type: "character",
      attributes: {
        first_name: "ליאו",
        hair_color: "שחור",
        character_field_observations: {
          hair_color: [{ value: "שחור", evidence: [{ quote: "שערו השחור", chunk_position: 2 }], confidence: 0.85, inferred: false }],
        },
      },
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const [entity] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const reference = entity.field_evidence?.hair_color?.[0];
  assertEquals(reference?.chunk_id, "chunk-2");
  assertEquals(Object.prototype.hasOwnProperty.call(reference ?? {}, "version_id"), false);
  assertEquals(Object.prototype.hasOwnProperty.call(reference ?? {}, "document_id"), false);
});

// ============================================================
// Issue 10 (Phase 5): an object's owners keeps its array structure on
// attributes.owners so character -> object ownership links can be built,
// even when the model emits owners only as a top-level array.
// ============================================================

function objectLinkEntries(entities: ReturnType<typeof normalizeEntities>): AbilityLinkEntity[] {
  return entities.map((entity, index) => ({
    id: `entity-${index}`,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    aliases: entity.aliases,
    attributes: entity.attributes,
  }));
}

Deno.test("Issue 10: a top-level owners array (no attributes.owners) is preserved as attributes.owners", () => {
  const extraction = {
    objects: [{
      name: "חרב הזהב",
      type: "object",
      owners: ["Leah Frost"],
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const [object] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  assertEquals(object.attributes.owners, ["Leah Frost"]);
  // structured_fields keeps its existing joined-string representation.
  assertEquals(object.structured_fields.owners, "Leah Frost");
});

Deno.test("Issue 10: multiple owners are kept as an array, never joined, on attributes.owners", () => {
  const extraction = {
    objects: [{
      name: "חרב הזהב",
      type: "object",
      owners: ["Leah Frost", "Ada North"],
      chunk_positions: [2],
    }],
  } as unknown as GeminiExtraction;

  const [object] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  assertEquals(object.attributes.owners, ["Leah Frost", "Ada North"]);
  assertEquals(object.structured_fields.owners, "Leah Frost, Ada North");
});

Deno.test("Issue 10: ownership link is built from a top-level owners array alone", () => {
  const extraction = {
    characters: [character()],
    objects: [{ name: "חרב הזהב", type: "object", owners: ["Leah Frost"], chunk_positions: [2] }],
  } as unknown as GeminiExtraction;

  const entities = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters");
  const links = buildObjectLinks(objectLinkEntries(entities));
  assertEquals(links.length, 1);
  assertEquals(links[0].objectName, "חרב הזהב");
  assertEquals(links[0].relationshipType, "owns");
});

Deno.test("Issue 10: the same object repeated with the same owner keeps a deduped owners array (never a join)", () => {
  const merged = normalizeEntities(
    {
      objects: [
        { name: "חרב הזהב", type: "object", owners: ["Leah Frost"], chunk_positions: [2] },
        { name: "חרב הזהב", type: "object", owners: ["Leah Frost"], chunk_positions: [2] },
      ],
    } as unknown as GeminiExtraction,
    chunkLookup,
    "sub-base-c-characters",
  );
  const object = merged.find((entity) => entity.entity_type === "object")!;
  assertEquals(object.attributes.owners, ["Leah Frost"]);
});

Deno.test("Issue 10: an object arriving in a later batch links to a character from an earlier batch via attributes.owners", () => {
  const earlierBatch = normalizeEntities(
    { characters: [character()] } as unknown as GeminiExtraction,
    chunkLookup,
    "sub-base-c-characters",
  );
  const laterBatch = normalizeEntities(
    { objects: [{ name: "חרב הזהב", type: "object", owners: ["Leah Frost"], chunk_positions: [2] }] } as unknown as GeminiExtraction,
    chunkLookup,
    "sub-base-c-characters",
  );
  const persisted = objectLinkEntries(earlierBatch).map((entry, i) => ({ ...entry, id: `persisted-${i}` }));
  const current = objectLinkEntries(laterBatch).map((entry, i) => ({ ...entry, id: `current-${i}` }));
  const links = buildObjectLinks([...persisted, ...current]);
  assertEquals(links.length, 1);
  assertEquals(links[0].relationshipType, "owns");
});
