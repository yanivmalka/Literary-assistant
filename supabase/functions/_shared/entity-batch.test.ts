import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deduplicateBatchEntities } from "./entity-batch.ts";

function character(name: string, age: string | null) {
  return {
    canonical_name: name,
    entity_type: "character",
    entity_types: ["character"],
    description: null,
    attributes: {},
    structured_fields: { name, age },
    aliases: [],
    evidence: [],
    chunk_positions: [],
  };
}

Deno.test("deduplicates same-name entities within one extraction batch", () => {
  const result = deduplicateBatchEntities([
    character("Aron", "30"),
    character("aron", null),
  ]);

  assertEquals(result.length, 1);
  assertEquals(result[0].structured_fields.age, "30");
});

Deno.test("keeps same display names distinct when entity types differ", () => {
  const result = deduplicateBatchEntities([
    character("Aron", "30"),
    {
      ...character("Aron", null),
      entity_type: "location",
      entity_types: ["location"],
    },
  ]);

  assertEquals(result.length, 2);
});
