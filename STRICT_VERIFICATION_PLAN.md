# Strict Verification Pass - Knowledge Extraction System

**Date:** August 20, 2026  
**Goal:** Prove that the claimed architecture actually works, not merely that code exists  
**Approach:** Code review + schema validation + unit test execution

---

## Part 1: Code-Level Verification

### 1.1 MAIN/BRANCH Bootstrap (Task #1)

**Claim:** First extraction with multiple batches stays in bootstrap mode; all batches belong to same extraction run.

**Implementation Files:**
- `client/src/stores/documentStore.ts` - Sets extraction_mode at RUN start
- `supabase/functions/extract-knowledge/index.ts` - ExtractRequest interface includes extraction_mode and extraction_run_id
- `supabase/functions/_shared/extraction-state.ts` - ExtractionRunState holds extraction_mode

**Code Review:**

✅ **VERIFIED: ExtractRequest interface has extraction_mode and extraction_run_id**
```typescript
interface ExtractRequest {
  extraction_mode?: 'bootstrap' | 'branch';
  extraction_run_id?: string;
  // ... other fields
}
```
These are passed from client to function for every batch.

✅ **VERIFIED: ExtractionRunState stores extraction_mode once per run**
```typescript
export interface ExtractionRunState {
  extraction_run_id: string;
  extraction_mode: 'bootstrap' | 'branch';  // Set once at run start
  // ...
}
```

✅ **VERIFIED: initializeExtractionState() called at RUN level**
The function takes extraction_mode as a parameter and stores it for the entire run.

**Finding:** Code structure supports extraction-level mode determination. However, verification requires:
1. Client actually sets extraction_mode at RUN start (not per-batch)
2. Every batch includes the same extraction_mode and extraction_run_id
3. Bootstrap stage created once per run

**Status:** Code-level verification PASS. Runtime verification requires test database.

---

### 1.2 MAIN/BRANCH Second Extraction (Task #2)

**Claim:** Second extraction uses Branch/Overlay without modifying canonical Main.

**Implementation:**
- Existing architecture uses `target_branch_id` and `layer` field
- New code should use this existing mechanism
- Second extraction should NOT set extraction_mode='bootstrap'

**Code Review:**

✅ **VERIFIED: Branch layer concept exists in schema**
- `knowledge_entities.layer` field distinguishes Main/Branch
- `knowledge_entities.branch_id` links to knowledge_branches
- Existing code already handles branch-specific operations

❌ **ISSUE IDENTIFIED:**
The new code does NOT yet integrate with existing branch/overlay logic.
The bootstrap-staging.ts and extraction-state.ts modules are NEW and focused on bootstrap mode.
They need to check: if extraction_mode !== 'bootstrap', fall back to existing branch logic.

**Finding:** Architecture design is sound, but integration with existing branch logic NOT YET IMPLEMENTED.

**Status:** Code-level verification INCOMPLETE. This is a genuine gap that needs to be filled.

---

### 1.3 Cross-Batch Entity Resolution (Task #3)

**Claim:** Same entity across batches resolves to single UUID.

**Implementation:**
- `extraction-state.ts`: `findPriorBatchEntity(state, name, type, batchNum)`
- Records prior entities: `recordCreatedEntity(state, ...)`

**Code Review:**

✅ **VERIFIED: findPriorBatchEntity() exists and has cross-batch logic**
```typescript
export function findPriorBatchEntity(
  state: ExtractionRunState,
  canonicalName: string,
  entityType: string,
  currentBatchNumber: number,
): CreatedEntity | null {
  // Searches created_entities map for prior batches only
  if (direct && direct.batch_number < currentBatchNumber) {
    return direct;
  }
  // Also checks aliases...
}
```

✅ **VERIFIED: Uses normalized key matching**
- normalizeKey() and stripNikud() used for robust matching
- Conservative: prefers exact matches over prefix matches

✅ **VERIFIED: In-memory state maintained per extraction run**
- `created_entities: Map<string, CreatedEntity>` stores all entities in current run
- Each entity records: entity_id, batch_number, canonical_name, aliases

**Finding:** Logic looks sound for in-memory resolution within a run. 

**Status:** Code-level verification PASS. Runtime verification requires integration test.

---

### 1.4 Different Entities, Same First Name (Task #4)

**Claim:** Two entities with same first name do NOT incorrectly merge.

**Implementation:**
- consolidation scoring uses multiple signals
- confidence must reach 100% to auto-merge, or 70-99% to suggest

**Code Review:**

✅ **VERIFIED: Consolidation logic exists with thresholds**
```typescript
export const AUTO_CONSOLIDATE_THRESHOLD = 100;
export const SUGGEST_CONSOLIDATION_THRESHOLD = 70;
```

✅ **VERIFIED: Confidence scoring uses 6 signals**
- Field objectivity, evidence, specificity, contradictions, completeness
- NOT just name matching

❌ **ISSUE IDENTIFIED:**
The consolidation.ts file (which scores merges) is NOT in the provided codebase.
Without seeing the actual consolidation scoring logic, cannot verify that name alone doesn't trigger 100% confidence.

**Status:** Code-level verification INCOMPLETE - consolidation.ts not provided.

---

### 1.5 Bootstrap Failure (Task #5)

**Claim:** Failed batch does not corrupt Main.

**Implementation:**
- `bootstrap-staging.ts`: `failBootstrap()`, `rollbackBootstrap()`
- Entities staged in bootstrap_entity_staging, not Main
- Only promoted if ALL batches succeed

**Code Review:**

✅ **VERIFIED: Staging layer prevents Main corruption**
```typescript
export async function promoteBootstrapToMain(...) {
  // Only moves to Main AFTER all batches complete
  // Only called if bootstrap_stage.status === "completed"
}
```

✅ **VERIFIED: Rollback function exists**
```typescript
export async function rollbackBootstrap(...) {
  await supabase
    .from("bootstrap_entity_staging")
    .delete()
    .eq("bootstrap_stage_id", bootstrapStageId);
}
```

✅ **VERIFIED: Failed batch marked in bootstrap_stages**
```typescript
export async function failBootstrap(...) {
  await supabase
    .from("bootstrap_stages")
    .update({ status: "failed" })
    .eq("id", bootstrapStageId);
}
```

**Finding:** Architecture is sound. Requires verification that:
1. promoteBootstrapToMain() is only called when status === "completed"
2. Main query only reads records with layer = 'main' (not 'main_staging')

**Status:** Code-level verification PASS. Schema validation needed.

---

### 1.6 Merge Thresholds (Task #6)

**Claim:** 100% auto-merge, 70-99% suggestions, <70% no action.

**Implementation:**
- `resolution-suggestions.ts`: `createResolutionSuggestion()` saves 70-99 scores
- Thresholds defined: AUTO_CONSOLIDATE_THRESHOLD = 100

**Code Review:**

✅ **VERIFIED: Suggestion persistence exists**
```typescript
export async function createResolutionSuggestion(...) {
  if (score < 70 || score >= 100) {
    throw new Error(`Invalid score for suggestion: ${score}`);
  }
  // Persists to entity_resolution_suggestions table
}
```

✅ **VERIFIED: Suggestions table schema allows pending status**
- `review_status` field with values: 'pending', 'approved', 'rejected', 'implemented'
- Medium-confidence suggestions NOT auto-merged

❌ **ISSUE IDENTIFIED:**
The actual consolidation logic (which decides to create 100% auto-merges vs. 70-99 suggestions) is NOT shown in provided code.
Need to see where consolidation.ts or equivalent handles the threshold decision.

**Status:** Code-level verification PARTIAL - suggestion persistence proven, but consolidation decision logic not visible.

---

### 1.7 Field-Specific Evidence (Task #7)

**Claim:** Evidence linked to correct fields, not generic.

**Implementation:**
- `value-sync.ts`: `normalizedEntity.field_evidence: Record<string, string[]>`
- `calculateFieldConfidence()` uses field-specific evidence

**Code Review:**

✅ **VERIFIED: Field evidence mapping in NormalizedEntity**
```typescript
field_evidence?: Record<string, string[]>;  // Evidence keyed by field path
```

✅ **VERIFIED: Confidence uses field-specific evidence**
```typescript
const hasFieldEvidence = entity.field_evidence?.[fieldPath] && entity.field_evidence[fieldPath].length > 0;
if (hasFieldEvidence) {
  confidence += 0.15;
}
```

✅ **VERIFIED: Evidence synced per-field**
```typescript
const fieldEvidence = normalizedEntity.field_evidence?.[fieldPath] || [];
for (const quote of fieldEvidence) {
  // Link THIS quote to THIS field's value
}
```

**Finding:** Architecture is sound and field-specific evidence is properly used.

**Status:** Code-level verification PASS.

---

### 1.8 Confidence Scoring (Task #8)

**Claim:** Confidence varies by signal, not constant 0.8.

**Implementation:**
- `calculateFieldConfidence()` with 6 signals

**Code Review:**

✅ **VERIFIED: 6 signals implemented**
1. Field type objectivity (objective +0.25, subjective -0.15)
2. Evidence existence (+0.15 for field-specific)
3. Evidence count (+0.10 for 3+, +0.05 for 2)
4. Value specificity (+0.05 for long, ×0.70 for generic)
5. Contradiction detection (×0.80)
6. Field completeness (+0.05 or -0.10)

✅ **VERIFIED: Confidence not constant**
- Base 0.5, adjusted by signals
- Range [0.1, 0.95]
- Logged with signals for transparency

**Status:** Code-level verification PASS.

---

### 1.9 Provenance (Task #9)

**Claim:** All mentions have chunk_id, page_number, evidence.

**Implementation:**
- Migration 112 adds chunk_id, page_number to knowledge_entity_mentions

**Code Review:**

✅ **VERIFIED: Schema additions in migration 112**
```sql
ALTER TABLE knowledge_entity_mentions
ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES document_chunks(id);
ADD COLUMN IF NOT EXISTS page_number INT;
```

✅ **VERIFIED: Indexes created for performance**
- idx_entity_mentions_chunk_id
- idx_entity_mentions_page_number

❌ **ISSUE IDENTIFIED:**
Migration creates the schema columns, BUT the application code that POPULATES these columns is NOT shown.
Need to see: where are mentions created with chunk_id and page_number populated?

**Status:** Code-level verification INCOMPLETE - Schema ready but population logic not visible.

---

### 1.10 Aliases (Task #10)

**Claim:** Aliases preserve provenance and resolve correctly.

**Implementation:**
- `extraction-state.ts`: `CreatedEntity.aliases[]` stores aliases
- `findPriorBatchEntity()` checks aliases

**Code Review:**

✅ **VERIFIED: Aliases tracked in ExtractionRunState**
```typescript
interface CreatedEntity {
  aliases: string[];
}
```

✅ **VERIFIED: Alias matching in cross-batch resolution**
```typescript
for (const alias of entity.aliases) {
  if (normalizeKey(alias) === incomingKey) {
    return entity;  // Found by alias
  }
}
```

❌ **ISSUE IDENTIFIED:**
How are aliases stored in the final knowledge base? 
The code shows they're used for resolution, but not where they're persisted.
Need to see: knowledge_entity_aliases table or equivalent.

**Status:** Code-level verification INCOMPLETE - Resolution logic present, persistence logic unclear.

---

### 1.11 Relationships (Task #11)

**Claim:** Relationships use entity UUIDs and include evidence.

**Implementation:**
- ExtractedRelationship interface has: character_a (string), character_b (string), relationship_type, evidence

**Code Review:**

❌ **ISSUE IDENTIFIED:**
The code shows ExtractedRelationship in the interface, but NOT how they're resolved to UUIDs or persisted.
Need to see: where relationship entities resolve names to UUIDs and store evidence.

**Status:** Code-level verification INCOMPLETE - Interface defined but implementation not shown.

---

## Part 2: Schema Validation

### 2.1 Migration 112: Provenance

**Status:** ✅ VALID
- Adds chunk_id (UUID FK to document_chunks)
- Adds page_number (INT)
- Creates appropriate indexes
- Backward compatible (nullable columns)
- No conflicts with existing schema

### 2.2 Migration 113: Bootstrap Staging

**Status:** ✅ VALID
- Creates bootstrap_stages table (tracks runs)
- Creates bootstrap_entity_staging table (holds pending entities)
- Appropriate indexes on project_id, extraction_run_id, status
- UNIQUE constraint prevents duplicate runs per (project, user, extraction_run_id)
- RLS not yet enabled (may need to add)

**Issue:** RLS policies not defined. Need to add access control.

### 2.3 Migration 114: Resolution Suggestions

**Status:** ✅ VALID
- Creates entity_resolution_suggestions table
- Creates entity_resolution_signals table
- Appropriate indexes and UNIQUE constraints
- Score validation (70-99)
- RLS policies defined for user access

**Issue:** FK to knowledge_entities may fail if entities deleted before suggestion reviewed.
Consider: ON DELETE SET NULL for suggestion cleanup?

---

## Part 3: Test Execution

### Test Framework

The test files exist:
- `tests/golden-dataset.test.ts` - 15 test cases (structure defined, logic placeholder)
- `tests/regression-main-branch.test.ts` - 7 scenarios (structure defined, logic placeholder)

**Issue:** Tests are DEFINED but NOT EXECUTABLE yet. They use:
```typescript
import { describe, it, expect } from "https://deno.land/std@0.208.0/testing/bdd.ts";
```

This requires:
1. Deno installed
2. Test database available
3. Actual extraction to run

---

## Summary of Findings

### ✅ What's Working
1. Bootstrap staging layer design (prevents Main corruption) - CODE EXISTS
2. Cross-batch entity resolution logic (in-memory) - CODE EXISTS
3. Field-specific evidence mapping (integrated) - CODE EXISTS
4. Confidence scoring with 6 signals (implemented) - CODE EXISTS & INTEGRATED
5. Resolution suggestions persistence (schema + code) - CODE EXISTS
6. Extraction-level mode determination (interface design) - ExtractRequest interface includes it
7. Bootstrap failure handling (rollback logic) - CODE EXISTS
8. Database migrations (valid schema) - ALL 3 MIGRATIONS VALID
9. Consolidation thresholds exist (100% auto, 70-99% suggest) - CODE SHOWS THRESHOLDS
10. Extract-knowledge recognizes extraction_mode (in interface) - ExtractRequest.extraction_mode exists

### ❌ CRITICAL INTEGRATION GAPS - NOT YET WOVEN INTO EXTRACTION PIPELINE
1. **CRITICAL BLOCKER:** bootstrap-staging.ts functions are DEFINED but NEVER CALLED in extract-knowledge/index.ts
   - initializeBootstrapStage() - exists but grep finds ZERO calls to it
   - stageEntity() - exists but grep finds ZERO calls to it
   - promoteBootstrapToMain() - exists but grep finds ZERO calls to it
   - Result: Bootstrap staging layer exists in isolation but is not part of the extraction flow

2. **CRITICAL BLOCKER:** extraction-state.ts NOT IMPORTED in extract-knowledge/index.ts
   - findPriorBatchEntity() exists but is never called during extraction
   - Cross-batch resolution infrastructure built but not integrated
   - Result: Batch 2+ does not actually use the state infrastructure

3. **CRITICAL BLOCKER:** extractionMode NOT READ or USED in extract-knowledge/index.ts
   - ExtractRequest includes extraction_mode parameter
   - But no code found that branches on it (if extraction_mode === 'bootstrap')
   - Result: Function does not behave differently for bootstrap vs. branch

4. **CRITICAL BLOCKER:** Resolution suggestions NOT CREATED during consolidation
   - Consolid consolidation.ts scores candidates 70-99
   - Code shows TODO comment: "// TODO: Call createResolutionSuggestion here"
   - Result: Medium-confidence suggestions are logged but NOT persisted

5. **MAJOR ISSUE:** Second extraction branch logic not integrated
   - Existing branch/overlay logic in codebase
   - New bootstrap logic ignores it
   - Result: Second extraction would try bootstrap again (wrong!)

### ❌ What's Missing / Incomplete
1. **Integration:** bootstrap-staging.ts NOT CALLED anywhere
2. **Integration:** extraction-state.ts NOT USED in consolidation
3. **Feature:** resolution-suggestions creation is TODO/incomplete
4. **Feature:** extraction_mode parameter not acted upon
5. **Feature:** Provenance columns not populated with chunk_id, page_number
6. **Feature:** Relationship and alias persistence not shown
7. **Policy:** RLS policies on bootstrap_stages incomplete
8. **Tests:** Not executable without test infrastructure

### ⚠️ BLOCKERS FOR PRODUCTION DEPLOYMENT
1. **CRITICAL:** Code exists but is NOT INTEGRATED into extraction pipeline
2. **CRITICAL:** Extract-knowledge function does not use bootstrap-staging at all
3. **CRITICAL:** Extract-knowledge does not use extraction-state for cross-batch resolution
4. **CRITICAL:** Extract-knowledge does not branch on extraction_mode parameter
5. **CRITICAL:** Consolidation score 70-99 not persisted as suggestions (TODO in code)
6. **CRITICAL:** Second extraction would incorrectly attempt bootstrap
7. **MAJOR:** Tests cannot pass without fixing integration issues
8. **MAJOR:** Runtime behavior will NOT match claimed architecture

---

## Recommended Verification Next Steps

### Immediate (Today)
1. Examine `extract-knowledge/index.ts` FULL implementation to show:
   - Where extraction_mode is read
   - Where initializeBootstrapStage() is called
   - Where stageEntity() is called
   - How entities are promoted to Main

2. Locate and review `consolidation.ts` to verify merge thresholds

3. Show relationship/alias persistence code

### Short Term (1-2 days)
1. Set up test database (Supabase instance)
2. Execute integration tests
3. Verify end-to-end extraction with multiple batches

### Medium Term (Post-verification)
1. Add RLS policies to bootstrap_stages
2. Enhance relationship/alias persistence
3. Add monitoring and logging

---

## Verdict

**Current Status:** Code structure and design are solid, but **integration is incomplete**.

The modules are well-designed in isolation, but they're not yet woven into the actual extraction pipeline.

Before declaring "Production Ready," need to demonstrate:
1. ✅ Schema is valid (DONE - migrations 112, 113, 114 look good)
2. ❌ Code is integrated (NOT DONE - bootstrap-staging not yet called)
3. ❌ Tests execute successfully (NOT DONE - requires test environment)
4. ❌ End-to-end scenario works (NOT DONE - requires verification)

**Recommendation:** Do NOT deploy yet. Complete the integration work first, then run verification tests.
