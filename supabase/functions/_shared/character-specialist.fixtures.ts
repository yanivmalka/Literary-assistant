import type {
  CharacterFieldObservation,
  CharacterSpecialistResult,
} from "./character-specialist.ts";

export const characterSpecialistWindow = {
  window_id: "0:4",
  offset: 0,
  limit: 4,
  chunk_positions: [0, 1, 2, 3],
};

function reference(chunk_position: number, quote: string) {
  return { chunk_position, quote, page: chunk_position + 1 };
}

function observation(
  value: unknown,
  chunk_position: number,
  quote: string,
  inferred = false,
  confidence = 0.9,
  inference_note: string | null = null,
): CharacterFieldObservation {
  return {
    value,
    evidence: [reference(chunk_position, quote)],
    confidence,
    inferred,
    inference_note,
  };
}

export const explicitAndInferredCharacterFixture: CharacterSpecialistResult = {
  contract_version: 1,
  role: "characters",
  window: characterSpecialistWindow,
  characters: [{
    name: "Ada Lovelace",
    first_name: "Ada",
    last_name: "Lovelace",
    aliases: ["The Analyst"],
    fields: {
      first_name: observation("Ada", 0, "Ada opened the notebook.", false),
      age: observation("thirty-two", 0, "Ada was thirty-two.", false),
      fears: observation(
        "heights",
        2,
        "She gripped the balcony rail and refused to look down.",
        true,
        0.82,
        "Her repeated reaction to the height supports an inferred fear.",
      ),
      personality_traits: observation(
        ["curious", "methodical"],
        1,
        "She filled three pages with questions before breakfast.",
        true,
        0.84,
        "The repeated questioning and systematic notes support these traits.",
      ),
    },
    evidence: [
      "Ada opened the notebook.",
      "She gripped the balcony rail and refused to look down.",
    ],
    chunk_positions: [0, 1, 2],
    source_references: [
      reference(0, "Ada opened the notebook."),
      reference(2, "She gripped the balcony rail and refused to look down."),
    ],
    confidence: 0.94,
  }],
  relationships: [{
    source: "Ada Lovelace",
    target: "Charles Babbage",
    relationship_type: "friendship_deep",
    evidence: ["Charles was the only person Ada trusted with the design."],
    chunk_positions: [3],
    source_references: [reference(3, "Charles was the only person Ada trusted with the design.")],
    confidence: 0.88,
    inferred: false,
    inference_note: null,
  }],
  unresolved_references: [],
};

/** Duplicate candidates remain observable so the later merger can preserve conflicts. */
export const duplicateAndConflictingCharacterFixture: CharacterSpecialistResult = {
  ...explicitAndInferredCharacterFixture,
  characters: [
    explicitAndInferredCharacterFixture.characters[0],
    {
      ...explicitAndInferredCharacterFixture.characters[0],
      aliases: ["The Analyst 2"],
      fields: {
        first_name: observation("Ada", 0, "Ada opened the notebook.", false),
        age: observation("thirty-three", 3, "Ada celebrated her thirty-third birthday.", false, 0.76),
      },
      evidence: ["Ada celebrated her thirty-third birthday."],
      chunk_positions: [3],
      source_references: [reference(3, "Ada celebrated her thirty-third birthday.")],
      confidence: 0.76,
    },
  ],
};

export const missingFirstNameCharacterFixture: unknown = {
  ...explicitAndInferredCharacterFixture,
  characters: [{
    ...explicitAndInferredCharacterFixture.characters[0],
    first_name: "",
  }],
};

export const firstNameAliasCharacterFixture: unknown = {
  ...explicitAndInferredCharacterFixture,
  characters: [{
    ...explicitAndInferredCharacterFixture.characters[0],
    aliases: ["Ada", "The Analyst"],
  }],
};

export const missingFieldEvidenceCharacterFixture: unknown = {
  ...explicitAndInferredCharacterFixture,
  characters: [{
    ...explicitAndInferredCharacterFixture.characters[0],
    fields: {
      fears: {
        value: "heights",
        evidence: [],
        confidence: 0.82,
        inferred: true,
        inference_note: "The response suggests fear.",
      },
    },
  }],
};

export const invalidRelationshipCharacterFixture: unknown = {
  ...explicitAndInferredCharacterFixture,
  relationships: [{
    source: "Ada Lovelace",
    target: "Ada Lovelace",
    relationship_type: "unknown_relationship",
    evidence: ["invalid relationship"],
    chunk_positions: [0],
    source_references: [reference(0, "invalid relationship")],
    confidence: 0.4,
    inferred: true,
    inference_note: "invalid",
  }],
};

export const futureExtensionCharacterFixture: CharacterSpecialistResult = {
  ...explicitAndInferredCharacterFixture,
  future_extensions: {
    abilities: [{ name: "analytical reasoning" }],
    magic_abilities: [],
    objects: [{ name: "notebook" }],
  },
};
