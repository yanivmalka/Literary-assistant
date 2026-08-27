// Issue 15 (Phase 5): the active Character field set must be represented
// consistently across every layer that touches it —
//   1. the Sub-base C extraction prompt ("SUPPORTED FIXED FIELDS")
//   2. normalization's allowed-key gate
//   3. value persistence (`persistableFieldPaths`)
// All three now derive from one source of truth: `CHARACTER_FIELD_KEYS`
// (`character-specialist.ts`), plus the project's active dynamic field keys.
//
// These tests assert the single-source-of-truth relationship itself, not a
// hand-picked field list, so they fail if any layer drifts.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHARACTER_FIELD_KEYS } from "./character-specialist.ts";
import { persistableFieldPaths } from "./value-sync.ts";
import {
  buildExtractionPromptForProfile,
  buildSubBaseCCharactersInstructions,
} from "./rules/prompt.ts";
import { normalizeEntities, type GeminiExtraction } from "../../functions/extract-knowledge/normalization.ts";

const chunkLookup = new Map<number, { id: string; page: number | null }>([[0, { id: "chunk-0", page: 1 }]]);

function promptFixedFields(promptText: string): string[] {
  const match = promptText.match(/SUPPORTED FIXED FIELDS:\n(.+?)\./s);
  assert(match, "prompt must contain a SUPPORTED FIXED FIELDS list");
  return match[1].split(",").map((field) => field.trim()).filter(Boolean);
}

Deno.test("Issue 15: the Sub-base C prompt's fixed-field list IS CHARACTER_FIELD_KEYS (same set and order)", () => {
  const prompt = buildExtractionPromptForProfile([{ position: 0, content: "x" }], "sub-base-c-characters");
  assertEquals(promptFixedFields(prompt), [...CHARACTER_FIELD_KEYS]);
});

Deno.test("Issue 15: every fixed character field is persistable, and no relational attribute is", () => {
  const allowed = persistableFieldPaths("character")!;
  for (const key of CHARACTER_FIELD_KEYS) {
    assert(allowed.has(key), `persistable set is missing fixed field '${key}'`);
  }
  for (const relational of ["users", "members", "purpose", "relationship_labels", "abilities"]) {
    assert(!allowed.has(relational), `persistable set must not contain relational attribute '${relational}'`);
  }
});

Deno.test("Issue 15: normalization's C allowed-key gate == CHARACTER_FIELD_KEYS ∪ active dynamic keys", () => {
  const dynamicKey = "clan_rank";
  const extraction = {
    characters: [{
      name: "Leah Frost",
      type: "character",
      attributes: {
        first_name: "Leah",
        [CHARACTER_FIELD_KEYS[10]]: "some value", // a fixed field → kept
        [dynamicKey]: "captain", // active dynamic field → kept
        narrative_impact: "huge", // in the UI catalogue but NOT in the C contract → dropped
      },
      chunk_positions: [0],
    }],
  } as unknown as GeminiExtraction;

  const [entity] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters", {
    activeCharacterFieldKeys: [dynamicKey],
  });

  assertEquals(entity.structured_fields.first_name, "Leah");
  assertEquals(entity.structured_fields[CHARACTER_FIELD_KEYS[10]], "some value");
  assertEquals(entity.structured_fields[dynamicKey], "captain");
  assertEquals(entity.structured_fields.narrative_impact, undefined);
});

Deno.test("Issue 15: an active project-dynamic field is represented in all three layers", () => {
  const dynamicKey = "clan_rank";
  const instructions = buildSubBaseCCharactersInstructions([
    { field_key: dynamicKey, label: "Clan rank", group_key: "world" },
  ]);
  assert(instructions.includes(dynamicKey), "prompt instructions must list the active dynamic field");
  assert(persistableFieldPaths("character", [dynamicKey])!.has(dynamicKey), "dynamic field must be persistable");

  const extraction = {
    characters: [{
      name: "Ada North",
      type: "character",
      attributes: { first_name: "Ada", [dynamicKey]: "elder" },
      chunk_positions: [0],
    }],
  } as unknown as GeminiExtraction;
  const [entity] = normalizeEntities(extraction, chunkLookup, "sub-base-c-characters", {
    activeCharacterFieldKeys: [dynamicKey],
  });
  assertEquals(entity.structured_fields[dynamicKey], "elder");
});
