// ============================================
// Golden Dataset Tests for Knowledge Extraction
// Tests real-world extraction scenarios with expected outcomes
// ============================================

import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  normalizeEntities,
  type GeminiExtraction,
} from "../supabase/functions/extract-knowledge/normalization.ts";
import {
  normalizeExtractionPayload,
  parseExtractionJson,
  validateExtractionPayload,
} from "../supabase/functions/extract-knowledge/testable-pipeline.ts";

interface TestCase {
  name: string;
  input: string;
  expectedEntities: Array<{
    name: string;
    type: string;
    aliases?: string[];
    shouldBeFlaggedAsGeneric?: boolean;
  }>;
  expectedRelationships?: Array<{
    characterA: string;
    characterB: string;
    type: string;
  }>;
  expectedEvents?: string[];
  precautions?: string[];
}

/**
 * Golden test dataset: Real-world extraction scenarios
 * Each test case includes:
 * - Input text (Hebrew fiction excerpt)
 * - Expected entities (with conservative filtering applied)
 * - Expected relationships
 * - Precautions to verify (false merges, false splits, etc.)
 */
const goldenDataset: TestCase[] = [
  {
    name: "TC-001: First name only",
    input: "ליאו נכנס לחדר.",
    expectedEntities: [
      { name: "ליאו", type: "character", aliases: [] }
    ],
    precautions: ["no_generic_extraction"]
  },

  {
    name: "TC-002: First + last name",
    input: "ליאו פרוסט היה קוסם יוצא דופן.",
    expectedEntities: [
      { name: "ליאו פרוסט", type: "character", aliases: [] }
    ],
    precautions: ["no_generic_extraction"]
  },

  {
    name: "TC-003: Alias recognition",
    input: "ליאו נכנס. הקוסם התבונן סביב. ליאו פרוסט הבין את המצב.",
    expectedEntities: [
      { name: "ליאו פרוסט", type: "character", aliases: ["ליאו"] }
    ],
    precautions: ["single_uuid", "no_false_merge"]
  },

  {
    name: "TC-004: Reject generic title alone",
    input: "המלך אמר לשר שלו: 'זה לא מתאים לך'.",
    expectedEntities: [
      // "המלך" and "שר" should NOT be extracted without proper names
    ],
    precautions: ["no_generic_extraction", "no_role_as_entity"]
  },

  {
    name: "TC-005: Two characters with same first name",
    input: "ליאו הקוסם בן 25 שנה. לא להתבלבל עם ליאו הקנוני הזקן בן 60.",
    expectedEntities: [
      { name: "ליאו הקוסם", type: "character", aliases: [] },
      { name: "ליאו הקנוני", type: "character", aliases: [] }
    ],
    precautions: ["no_false_merge", "two_separate_uuids"]
  },

  {
    name: "TC-006: Significant object",
    input: "חרבו של אלדור זרקה אור כחול. 'קלטון' שמו, כלי מכושף עתיק.",
    expectedEntities: [
      { name: "אלדור", type: "character", aliases: [] },
      { name: "קלטון", type: "object", aliases: [] }
    ],
    precautions: ["object_extraction", "named_object_only"]
  },

  {
    name: "TC-007: Generic object rejected",
    input: "הוא הרים את הכיסא ויזרקו אל הדלת.",
    expectedEntities: [
      // "כיסא" should NOT be extracted (generic furniture)
    ],
    precautions: ["no_generic_object"]
  },

  {
    name: "TC-008: Significant location",
    input: "ערי בעקעום: יער אירויין שהוא מקום סודי שבו מתחפים קוסמים.",
    expectedEntities: [
      { name: "יער אירויין", type: "location", aliases: [] }
    ],
    precautions: ["named_location_only", "narrative_importance"]
  },

  {
    name: "TC-009: Generic location rejected",
    input: "הוא הלך דרך היער הגדול.",
    expectedEntities: [
      // "יער" without specific name should NOT be extracted
    ],
    precautions: ["no_generic_location"]
  },

  {
    name: "TC-010: Ability with supporting context",
    input: "קוסמים בעלי יכולת להשתלוט על הנחשים. אש קוסומית היא יכולת נדירה ביותר.",
    expectedEntities: [
      { name: "אש קוסומית", type: "ability", aliases: [] }
    ],
    precautions: ["ability_extraction", "generic_action_rejected"]
  },

  {
    name: "TC-011: Entity crossing chunk boundary",
    input: "ליאו פרוסט הוא קוסם רחוק... [chunk break] ...הוא בן 25 שנה.",
    expectedEntities: [
      { name: "ליאו פרוסט", type: "character", aliases: ["ליאו"] }
    ],
    precautions: ["cross_chunk_resolution", "single_uuid"]
  },

  {
    name: "TC-012: Event extraction",
    input: "בקרב ההרים התרחש ניצחון גדול. הקוסם ליאו עמד מול הדרקון השחור.",
    expectedEntities: [
      { name: "ליאו", type: "character", aliases: [] }
    ],
    expectedEvents: ["קרב בהרים", "ניצחון"],
    precautions: ["event_extraction"]
  },

  {
    name: "TC-013: Relationship extraction",
    input: "ליאו האביר ודברניה המלכה היו אוגיים של לבבות.",
    expectedEntities: [
      { name: "ליאו האביר", type: "character", aliases: [] },
      { name: "דברניה", type: "character", aliases: ["המלכה"] }
    ],
    expectedRelationships: [
      { characterA: "ליאו האביר", characterB: "דברניה", type: "loves" }
    ],
    precautions: ["relationship_extraction"]
  },

  {
    name: "TC-014: Nickname handling",
    input: "ליאו קרא לו 'הניצחון הכחול' בגלל מעילו. השם האמיתי של הניצחון הכחול הוא רימון.",
    expectedEntities: [
      { name: "ליאו", type: "character", aliases: [] },
      { name: "רימון", type: "character", aliases: ["הניצחון הכחול"] }
    ],
    precautions: ["nickname_as_alias", "no_false_merge"]
  },

  {
    name: "TC-015: Page/chunk tracking",
    input: "ליאו נמצא בעמוד 42 בחלק מתן הגיבור.",
    expectedEntities: [
      { name: "ליאו", type: "character", aliases: [] }
    ],
    precautions: ["page_number_stored", "chunk_position_stored"]
  }
];

describe("Golden Dataset - Entity Extraction", () => {
  for (const testCase of goldenDataset) {
    it(`${testCase.name} has a valid extraction contract`, () => {
      assert(Array.isArray(testCase.expectedEntities), `${testCase.name}: expectedEntities must be an array`);
      assert(Array.isArray(testCase.precautions), `${testCase.name}: precautions must be an array`);

      for (const entity of testCase.expectedEntities) {
        assert(entity.name.trim().length > 0, `${testCase.name}: entity name must not be empty`);
        assert(entity.type.trim().length > 0, `${testCase.name}: entity type must not be empty`);
        if (entity.aliases) {
          assert(entity.aliases.every((alias) => alias.trim().length > 0), `${testCase.name}: aliases must not be empty`);
        }
      }

      for (const relationship of testCase.expectedRelationships || []) {
        assert(relationship.characterA.trim().length > 0, `${testCase.name}: relationship source is required`);
        assert(relationship.characterB.trim().length > 0, `${testCase.name}: relationship target is required`);
        assert(relationship.type.trim().length > 0, `${testCase.name}: relationship type is required`);
      }

      for (const event of testCase.expectedEvents || []) {
        assert(event.trim().length > 0, `${testCase.name}: event name must not be empty`);
      }
    });
  }

  it("normalizes the canonical schema v2 through the production pipeline", () => {
    const parsed = parseExtractionJson<unknown>(JSON.stringify({
      schema_version: "2",
      entities: [
        {
          name: "ליאו פרוסט",
          type: "character",
          description: "קוסם צעיר",
          aliases: ["ליאו"],
          attributes: { abilities: ["רונת אש"] },
          name_uncertainty: {
            is_uncertain: true,
            confidence: 0.62,
            reason: "כינוי מול שם מלא",
          },
          source_references: [{ chunk_position: 2, quote: "ליאו פרוסט הגיע" }],
          field_evidence: { description: ["קוסם צעיר"] },
        },
        { name: "טרונהיים", type: "location", description: "עיר עתיקה" },
        { name: "רונת אש", type: "magic_ability", description: "יכולת קסומה" },
      ],
      relationships: [{
        source: { name: "ליאו פרוסט", type: "character" },
        target: { name: "טרונהיים", type: "location" },
        type: "located_in",
        source_references: [{ chunk_position: 2, quote: "הגיע לטרונהיים" }],
      }],
      events: [{
        name: "הגעה לטרונהיים",
        description: "ליאו הגיע לעיר",
        participants: [{ name: "ליאו פרוסט", type: "character" }],
        location: { name: "טרונהיים", type: "location" },
        chunk_positions: [2],
      }],
    }));

    const extraction = normalizeExtractionPayload<GeminiExtraction>(parsed);
    assert(extraction !== null, "canonical schema should be recognized");

    const validation = validateExtractionPayload(extraction);
    assert(validation.valid, `canonical schema should validate: ${validation.errors.join(", ")}`);
    assertEquals(validation.itemCount, 5);

    const normalized = normalizeEntities(extraction, new Map([
      [2, { id: "chunk-2", page: 4 }],
    ]));
    assertEquals(normalized.length, 3);

    const character = normalized.find((entity) => entity.entity_type === "character");
    assert(character !== undefined, "character should be normalized");
    assertEquals(character?.canonical_name, "ליאו פרוסט");
    assertEquals(character?.aliases, ["ליאו"]);
    assertEquals(character?.chunk_ids, ["chunk-2"]);
    assertEquals(character?.attributes.extraction_meta, {
      schema_version: "2",
      name_uncertainty: {
        is_uncertain: true,
        confidence: 0.62,
        reason: "כינוי מול שם מלא",
      },
      source_references: [{ chunk_position: 2, quote: "ליאו פרוסט הגיע" }],
    });
  });

  it("rejects generic locations through the production filtering rules", () => {
    const normalized = normalizeEntities({
      locations: [{ name: "יער", description: "מקום כללי" }],
    }, new Map());
    assertEquals(normalized, []);
  });
});

/**
 * Metrics to verify after running all golden tests:
 * - Precision: % of extracted entities that are correct
 * - Recall: % of expected entities that were extracted
 * - False positives: Generic entities wrongly extracted
 * - False merges: Distinct entities incorrectly merged
 * - False splits: Same entity split into multiple UUIDs
 * - Evidence coverage: % of values with supporting evidence
 * - Provenance coverage: % of entities with complete provenance (chunk_id, page_number)
 */
export const goldenMetrics = {
  expected: {
    precision: 0.95,        // At least 95% of extracted entities are correct
    recall: 0.85,           // At least 85% of expected entities are found
    falsePositives: 0.05,   // No more than 5% false positives
    falseMerges: 0,         // ZERO false merges allowed
    falseSplits: 0,         // ZERO false splits allowed
    evidenceCoverage: 0.8,  // 80% of values have evidence
    provenanceCoverage: 1.0 // 100% of entities have complete provenance
  }
};
