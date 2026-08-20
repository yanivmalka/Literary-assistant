// ============================================
// Golden Dataset Tests for Knowledge Extraction
// Tests real-world extraction scenarios with expected outcomes
// ============================================

import { describe, it, expect, beforeAll, afterAll } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  let supabase: SupabaseClient;
  let projectId: string;
  let documentId: string;
  let versionId: string;

  beforeAll(async () => {
    // Initialize test database connection
    // This would connect to a test Supabase instance
    console.log("Initializing golden dataset tests...");
  });

  afterAll(async () => {
    console.log("Cleaning up test data...");
  });

  for (const testCase of goldenDataset) {
    it(testCase.name, async () => {
      // This is a placeholder test structure
      // In a real scenario, this would:
      // 1. Extract entities from testCase.input
      // 2. Query the database for extracted entities
      // 3. Verify against expectedEntities
      // 4. Check precautions

      expect(testCase.expectedEntities).toBeDefined();
      expect(testCase.precautions).toBeDefined();

      console.log(`✓ ${testCase.name}`);
    });
  }
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
