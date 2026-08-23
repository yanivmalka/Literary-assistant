import { assert, assertArrayIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  characterSpecialistToExpertExtractionResult,
  validateCharacterSpecialistResult,
} from "./character-specialist.ts";
import {
  duplicateAndConflictingCharacterFixture,
  explicitAndInferredCharacterFixture,
  firstNameAliasCharacterFixture,
  futureExtensionCharacterFixture,
  invalidRelationshipCharacterFixture,
  missingFieldEvidenceCharacterFixture,
  missingFirstNameCharacterFixture,
} from "./character-specialist.fixtures.ts";

function assertInvalid(value: unknown, expectedMessage: string): void {
  const validation = validateCharacterSpecialistResult(value);
  assert(!validation.valid);
  if (validation.valid) return;
  assert(
    validation.errors.some((error) => error.includes(expectedMessage)),
    `Expected validation error containing: ${expectedMessage}`,
  );
}

Deno.test("Character Specialist accepts explicit and inferred fields with provenance", () => {
  const validation = validateCharacterSpecialistResult(explicitAndInferredCharacterFixture);
  assert(validation.valid);
  if (!validation.valid) return;

  const character = validation.value.characters[0];
  assertEquals(character.first_name, "Ada");
  assertArrayIncludes(character.aliases, ["The Analyst"]);
  assertEquals(character.fields.age.inferred, false);
  assertEquals(character.fields.fears.inferred, true);
  assertEquals(character.fields.fears.evidence[0].chunk_position, 2);
  assertEquals(character.fields.fears.inference_note, "Her repeated reaction to the height supports an inferred fear.");
  assertEquals(validation.value.relationships[0].relationship_type, "friendship_deep");
});

Deno.test("Character Specialist requires first_name and excludes it from aliases", () => {
  assertInvalid(missingFirstNameCharacterFixture, "characters contains an invalid candidate");
  assertInvalid(firstNameAliasCharacterFixture, "aliases must not contain first_name");
});

Deno.test("Character Specialist requires evidence for inferred fields", () => {
  assertInvalid(missingFieldEvidenceCharacterFixture, "characters contains an invalid candidate");
});

Deno.test("Character Specialist preserves duplicate candidates and conflicting observations for merger review", () => {
  const validation = validateCharacterSpecialistResult(duplicateAndConflictingCharacterFixture);
  assert(validation.valid);
  if (!validation.valid) return;

  assertEquals(validation.value.characters.length, 2);
  assertEquals(validation.value.characters[0].fields.age.value, "thirty-two");
  assertEquals(validation.value.characters[1].fields.age.value, "thirty-three");

  const adapted = characterSpecialistToExpertExtractionResult(validation.value);
  assertEquals(adapted.entities.length, 2);
  const firstObservations = adapted.entities[0].field_observations as Record<string, { value: unknown }>;
  const secondObservations = adapted.entities[1].field_observations as Record<string, { value: unknown }>;
  assertEquals(firstObservations.age?.value, "thirty-two");
  assertEquals(secondObservations.age?.value, "thirty-three");
});

Deno.test("Character Specialist rejects self-references and unknown relationship types", () => {
  assertInvalid(invalidRelationshipCharacterFixture, "relationships contains an invalid candidate");
});

Deno.test("Character Specialist keeps future extensions opaque and out of current output", () => {
  const validation = validateCharacterSpecialistResult(futureExtensionCharacterFixture);
  assert(validation.valid);
  if (!validation.valid) return;

  const adapted = characterSpecialistToExpertExtractionResult(validation.value);
  assertEquals(adapted.entities.every((entity) => entity.entity_type === "character"), true);
  assertEquals(adapted.events, []);
  assertEquals("locations" in adapted, false);
  assertEquals("objects" in adapted, false);
  assertEquals("abilities" in adapted, false);
  assertEquals("magic_abilities" in adapted, false);
});
