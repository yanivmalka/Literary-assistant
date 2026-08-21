// ============================================
// Main/Branch Regression Tests
// Verify bootstrap mode, branch mode, and multi-extraction scenarios
// ============================================

import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateExtractionMode } from "../supabase/functions/extract-knowledge/testable-pipeline.ts";
import { buildAbilityLinks, mergeAbilityLinkEntries, type AbilityLinkEntity } from "../supabase/functions/_shared/ability-links.ts";

interface RegressionScenario {
  name: string;
  mode: "bootstrap" | "branch";
  batches: Array<{
    batchNum: number;
    input: string;
    expectedNewEntities: string[];
    expectedMerges: Array<{ target: string; source: string }>;
  }>;
  expectedFinalEntities: Set<string>;
  expectedStagingBehavior: string;
  criticalCheck: string;
}

/**
 * Regression test scenarios for Main/Branch architecture
 * 
 * Critical invariant: A false merge can permanently contaminate the knowledge base.
 * Therefore: False negatives preferred over false positives.
 */
const regressionScenarios: RegressionScenario[] = [
  {
    name: "RS-001: First extraction (bootstrap mode, single batch)",
    mode: "bootstrap",
    batches: [
      {
        batchNum: 1,
        input: "ליאו הוא קוסם בן 25 שנה. דברניה היא מלכה.",
        expectedNewEntities: ["ליאו", "דברניה"],
        expectedMerges: []
      }
    ],
    expectedFinalEntities: new Set(["ליאו", "דברניה"]),
    expectedStagingBehavior: "active handler writes bootstrap entities directly to Main; graph/timeline rows use branch_id=null and approved status",
    criticalCheck: "Both entities in main entities table; graph/timeline rows use branch_id=null and approved status"
  },

  {
    name: "RS-002: First extraction (bootstrap mode, multi-batch)",
    mode: "bootstrap",
    batches: [
      {
        batchNum: 1,
        input: "ליאו הוא קוסם בן 25 שנה.",
        expectedNewEntities: ["ליאו"],
        expectedMerges: []
      },
      {
        batchNum: 2,
        input: "דברניה היא מלכה עתיקה.",
        expectedNewEntities: ["דברניה"],
        expectedMerges: []
      },
      {
        batchNum: 3,
        input: "ליאו ודברניה הם אויבים קדומים.",
        expectedNewEntities: [],
        expectedMerges: []
      }
    ],
    expectedFinalEntities: new Set(["ליאו", "דברניה"]),
    expectedStagingBehavior: "all batches use the same extraction_run_id; references resolve against persisted Main/Branch entities",
    criticalCheck: "extraction_mode and extraction_run_id consistent across all batches"
  },

  {
    name: "RS-003: Same entity across multiple batches (bootstrap)",
    mode: "bootstrap",
    batches: [
      {
        batchNum: 1,
        input: "ליאו הקוסם נכנס לחדר.",
        expectedNewEntities: ["ליאו"],
        expectedMerges: []
      },
      {
        batchNum: 2,
        input: "ליאו היה עייף מן הדרך הארוכה.",
        expectedNewEntities: [],
        expectedMerges: [{ target: "ליאו", source: "ליאו" }] // Same entity detected
      }
    ],
    expectedFinalEntities: new Set(["ליאו"]),
    expectedStagingBehavior: "persisted Main entity lookup; no staging table is used by the active handler",
    criticalCheck: "Only one ליאו UUID in final table; cross-batch resolution succeeded"
  },

  {
    name: "RS-004: Second extraction (branch mode, no changes)",
    mode: "branch",
    batches: [
      {
        batchNum: 1,
        input: "ליאו הוא קוסם. דברניה היא מלכה.",
        expectedNewEntities: [],
        expectedMerges: []
      }
    ],
    expectedFinalEntities: new Set(["ליאו", "דברניה"]),
    expectedStagingBehavior: "branch mode: no staging, entities resolved against existing Main",
    criticalCheck: "Existing entities from main preserved; no duplicates created"
  },

  {
    name: "RS-005: Third extraction (branch mode, new entity added)",
    mode: "branch",
    batches: [
      {
        batchNum: 1,
        input: "רימון הוא האביר הגדול של דברניה.",
        expectedNewEntities: ["רימון"],
        expectedMerges: []
      }
    ],
    expectedFinalEntities: new Set(["רימון"]),
    expectedStagingBehavior: "branch mode: new entity created with layer=branch and target branch id",
    criticalCheck: "New entity inserted; existing entities from main remain unchanged"
  },

  {
    name: "RS-006: Failed first extraction (bootstrap rollback)",
    mode: "bootstrap",
    batches: [
      {
        batchNum: 1,
        input: "corrupt data {{{",
        expectedNewEntities: [],
        expectedMerges: []
      }
    ],
    expectedFinalEntities: new Set([]),
    expectedStagingBehavior: "direct Main persistence; failed-batch rollback requires database integration verification",
    criticalCheck: "Failed request is returned; partial-write behavior requires isolated database verification"
  },

  {
    name: "RS-007: Rerun extraction after failure",
    mode: "bootstrap",
    batches: [
      {
        batchNum: 1,
        input: "ליאו הוא קוסם.",
        expectedNewEntities: ["ליאו"],
        expectedMerges: []
      }
    ],
    expectedFinalEntities: new Set(["ליאו"]),
    expectedStagingBehavior: "new bootstrap run writes directly to Main after the empty-Main guard",
    criticalCheck: "Only one ליאו in final table; failed run does not interfere"
  }
];

describe("Regression Tests - Main/Branch Architecture", () => {
  for (const scenario of regressionScenarios) {
    it(`${scenario.name} has a valid executable scenario contract`, () => {
      assertMatch(scenario.mode, /^(bootstrap|branch)$/);
      assert(scenario.batches.length > 0, `${scenario.name}: at least one batch is required`);
      assert(scenario.expectedFinalEntities instanceof Set, `${scenario.name}: expectedFinalEntities must be a Set`);
      assert(scenario.expectedStagingBehavior.trim().length > 0, `${scenario.name}: persistence behavior is required`);
      assert(scenario.criticalCheck.trim().length > 0, `${scenario.name}: critical check is required`);

      for (const batch of scenario.batches) {
        assert(batch.batchNum > 0, `${scenario.name}: batch numbers must be positive`);
        assert(batch.input.trim().length > 0, `${scenario.name}: batch input is required`);
        assert(Array.isArray(batch.expectedNewEntities), `${scenario.name}: expectedNewEntities must be an array`);
        assert(Array.isArray(batch.expectedMerges), `${scenario.name}: expectedMerges must be an array`);
      }

      const request = scenario.mode === "bootstrap"
        ? { extraction_mode: "bootstrap" as const }
        : { extraction_mode: "branch" as const, target_branch_id: "test-branch" };
      const validation = validateExtractionMode(request);
      assert(validation.ok, `${scenario.name}: mode request should be valid`);
      if (validation.ok) assertEquals(validation.mode, scenario.mode);

      console.log(`\nScenario: ${scenario.name}\nMode: ${scenario.mode}\nBatches: ${scenario.batches.length}\nCritical Check: ${scenario.criticalCheck}`);
    });
  }
});

it("creates physical and magical ability links across persisted batches", () => {
  const character: AbilityLinkEntity = {
    id: "character-nora",
    canonical_name: "נורה",
    entity_type: "character",
    aliases: [],
    attributes: {},
  };
  const abilities: AbilityLinkEntity[] = [
    {
      id: "ability-survival",
      canonical_name: "הישרדות במדבר",
      entity_type: "ability",
      aliases: [],
      attributes: { users: ["נורה"] },
    },
    {
      id: "ability-spellcraft",
      canonical_name: "עיצוב קסם",
      entity_type: "magic_ability",
      aliases: [],
      attributes: { users: ["נורה"] },
    },
  ];

  const links = buildAbilityLinks(mergeAbilityLinkEntries([character], abilities));
  assertEquals(links.map((link) => [link.characterId, link.abilityId]), [
    ["character-nora", "ability-survival"],
    ["character-nora", "ability-spellcraft"],
  ]);
});

/**
 * Architecture verification checklist
 */
export const architectureCheckList = {
  "Extraction-level mode determination": {
    description: "extraction_mode set once at RUN start, persists across all batches",
    verification: "extraction_mode and extraction_run_id passed in every batch request"
  },
  
  "Cross-batch entity resolution": {
    description: "Relationship and participant references can resolve against persisted Main/Branch entities when a batch-local match is absent.",
    verification: "Run an E2E multi-batch extraction and verify same-entity UUID reuse."
  },
  
  "Bootstrap staging": {
    description: "The current handler writes directly to Main; bootstrap-staging modules are not active in production extraction.",
    verification: "Do not claim staging/promotion without a separate integration test that imports and invokes those modules."
  },
  
  "Bootstrap failure safety": {
    description: "A failed batch must be verified against the deployed database behavior; the active handler does not provide transaction rollback.",
    verification: "Run an isolated E2E extraction and verify whether partial Main rows remain after failure."
  },
  
  "False merge prevention": {
    description: "confidence < 70 => suggestion (not auto-merge); false negatives preferred",
    verification: "Two distinct entities with score 65 do not merge"
  },
  
  "Field-specific evidence": {
    description: "Each extracted field has supporting evidence mapping",
    verification: "field_evidence populated for at least 80% of values"
  },
  
  "Provenance tracking": {
    description: "chunk_id, page_number, evidence_text stored with every mention",
    verification: "Extract entity; verify mention has chunk_id and page_number"
  },
  
  "Alias resolution": {
    description: "Aliases detected and linked to the primary entity within a batch; cross-batch identity resolution is database-backed.",
    verification: "Run an E2E extraction and verify aliases and UUID reuse."
  },
  
  "Multi-batch relationships": {
    description: "Relationships created between entities extracted in different batches",
    verification: "Entity A (batch 1) related to Entity B (batch 2); relationship stored"
  },
  
  "Resolution suggestions persisted": {
    description: "confidence 70-99 => entity_resolution_suggestions table, not auto-merge",
    verification: "Query suggestions table; user can review and approve/reject"
  }
};

/**
 * Known limitations (documented, not bugs)
 */
export const knownLimitations = [
  "Database-backed cross-batch reference resolution is not covered by these offline tests",
  "Relationship/event persistence and participant resolution require a Supabase integration run",
  "Confidence scoring is heuristic-based (not ML model)",
  "Generic entity filtering is rule-based (not semantic)",
  "Bootstrap staging modules exist but are not wired into the active extraction handler",
];

/**
 * Critical metrics to monitor post-deployment
 */
export const productionMetrics = {
  "False merge rate": {
    target: 0,
    description: "Zero false merges allowed; false negatives acceptable"
  },
  "Medium-confidence suggestion acceptance": {
    target: "> 60%",
    description: "User approval rate for 70-99 confidence suggestions"
  },
  "Cross-batch resolution accuracy": {
    target: "> 95%",
    description: "Accuracy of cross-batch same-entity detection"
  },
  "Bootstrap stage success rate": {
    target: "> 99%",
    description: "Successful promotion of bootstrap stages to main"
  },
  "Extraction completion rate": {
    target: "> 90%",
    description: "Multi-batch extractions that complete without failure"
  },
  "Evidence coverage": {
    target: "> 85%",
    description: "Percentage of extracted fields with supporting evidence"
  },
  "Provenance completeness": {
    target: "100%",
    description: "All mentions must have chunk_id and page_number"
  }
};
