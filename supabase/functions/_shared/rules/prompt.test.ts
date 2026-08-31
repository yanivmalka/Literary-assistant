import { assert, assertFalse, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildExtractionPromptForProfile,
  buildPlaceTypeCatalogText,
  buildSubBaseCCharactersInstructions,
} from "./prompt.ts";

const chunks = [{ position: 0, content: "טקסט לדוגמה" }];

Deno.test("sub-base-c-characters prompt covers objects and abilities with evidence/confidence/contradiction rules", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-c-characters");
  assert(prompt.includes("owners"));
  assert(prompt.includes("users"));
  assert(prompt.includes("CONTRADICTION REPORTING") || prompt.includes("OBJECT AND ABILITY IDENTITY, DUPLICATE PREVENTION, AND CONTRADICTIONS"));
  assert(prompt.includes("unresolved_references"));
  assert(prompt.includes("Never merge two candidates whose confirmed field values genuinely conflict"));
});

Deno.test("sub-base-c-characters prompt excludes locations and events", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-c-characters");
  assertFalse(/=== LOCATIONS ===/.test(prompt));
  assert(prompt.includes("Do NOT return locations, organizations, or events as entities."));
});

Deno.test("sub-base-c-characters prompt keeps character-to-object/ability links out of the relationships array", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-c-characters");
  assert(prompt.includes("the relationships array is for character-to-character relationships only"));
  assert(prompt.includes("Put the character's name in the object's/ability's own \"owners\"/\"users\" attribute instead"));
});

Deno.test("sub-base-c-characters prompt is stable across calls for the same chunks (no non-deterministic ordering)", () => {
  const a = buildExtractionPromptForProfile(chunks, "sub-base-c-characters");
  const b = buildExtractionPromptForProfile(chunks, "sub-base-c-characters");
  assert(a === b);
});

Deno.test("sub-base-c-characters instructions still enforce first_name and the fixed relationship taxonomy", () => {
  const instructions = buildSubBaseCCharactersInstructions();
  assert(instructions.includes("first_name is mandatory"));
  assert(instructions.includes("no_significant_bond"));
});

Deno.test("sub-base-locations prompt extracts only locations and place containment", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  assert(prompt.includes("=== LOCATIONS ==="));
  assert(prompt.includes("PLACE TYPE CATALOG"));
  assert(prompt.includes("attributes.place_type"));
  assert(prompt.includes('"type": "contained_in"'));
  assert(prompt.includes("the relationships array is for place-to-place containment only"));
});

Deno.test("sub-base-locations prompt excludes characters, objects, abilities, and events", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  assert(prompt.includes("Do NOT return characters, objects, abilities, magic abilities, organizations, or events as entities."));
  assertFalse(/=== CHARACTERS ===/.test(prompt));
  assertFalse(/=== ABILITIES ===/.test(prompt));
  assertFalse(/=== OBJECTS ===/.test(prompt));
  assertFalse(/DYNAMIC CHARACTER FIELDS/.test(prompt));
  assertFalse(/SUB-BASE-2 PROFILE INSTRUCTIONS/.test(prompt));
});

Deno.test("sub-base-locations prompt does not reuse the shared legacy base prompt", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  // The shared base prompt opens with the generic entity-extractor line.
  assertFalse(prompt.includes("Extract meaningful entities from these text chunks."));
  assert(prompt.includes("You are a literary place extractor for Hebrew fiction."));
});

Deno.test("sub-base-locations prompt appends project-specific location fields only when provided", () => {
  const withoutFields = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  assertFalse(/PROJECT-SPECIFIC LOCATION FIELDS/.test(withoutFields));

  const withFields = buildExtractionPromptForProfile(
    chunks,
    "sub-base-locations",
    [],
    [{ place_type_key: "city", field_key: "population", label: "אוכלוסייה" }],
  );
  assert(withFields.includes("=== PROJECT-SPECIFIC LOCATION FIELDS ==="));
  assert(withFields.includes("city: population (אוכלוסייה)"));
});

Deno.test("sub-base-locations prompt is stable across calls for the same chunks", () => {
  const a = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  const b = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  assert(a === b);
});

Deno.test("sub-base-locations prompt falls back to the static catalog when no project types are supplied", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  assert(prompt.includes("- cosmic: universe, parallel_universe, dimension"));
  assert(prompt.includes("attributes.is_new_type to true"));
});

Deno.test("sub-base-locations prompt renders the supplied project catalog grouped by category", () => {
  const prompt = buildExtractionPromptForProfile(
    chunks,
    "sub-base-locations",
    [],
    [],
    [
      { type_key: "kingdom", label: "Kingdom", category: "governance" },
      { type_key: "city", label: "City", category: "settlement" },
      { type_key: "mahaz", label: "מאחז", category: "custom" },
    ],
  );
  assert(prompt.includes("- governance: kingdom"));
  assert(prompt.includes("- settlement: city"));
  assert(prompt.includes("- custom: mahaz"));
  // The static fallback catalog must not also appear.
  assertFalse(prompt.includes("- cosmic: universe, parallel_universe, dimension"));
});

Deno.test("sub-base-locations prompt rescues a plot-central unnamed space with a descriptive name and flag", () => {
  const prompt = buildExtractionPromptForProfile(chunks, "sub-base-locations");
  assert(prompt.includes("EXCEPTION — a generic space that carries the plot:"));
  assert(prompt.includes("attributes.is_descriptive_name to true"));
  assert(prompt.includes('"is_descriptive_name": false'));
  // The rescue must stay narrow.
  assert(prompt.includes("Do NOT rescue a space that is only mentioned once or twice"));
});

Deno.test("buildPlaceTypeCatalogText orders known categories first, then extras alphabetically, deduping keys", () => {
  const text = buildPlaceTypeCatalogText([
    { type_key: "void", label: "Void", category: "zeta" },
    { type_key: "city", label: "City", category: "settlement" },
    { type_key: "city", label: "City dup", category: "settlement" },
    { type_key: "realm", label: "Realm", category: "governance" },
    { type_key: "rift", label: "Rift", category: "alpha" },
  ]);
  assertEquals(text.split("\n"), [
    "- governance: realm",
    "- settlement: city",
    "- alpha: rift",
    "- zeta: void",
  ]);
});
