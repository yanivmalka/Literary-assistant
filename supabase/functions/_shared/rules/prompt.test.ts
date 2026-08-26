import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildExtractionPromptForProfile, buildSubBaseCCharactersInstructions } from "./prompt.ts";

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
