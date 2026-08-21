# CRITICAL INTEGRATION GAPS - Verification Report

**Date:** August 20, 2026  
**Finding:** Code exists but is NOT integrated into extraction pipeline  
**Status:** ⛔ NOT PRODUCTION READY

---

## Executive Summary

The knowledge extraction system has well-designed individual components, but **they are not connected together**. The actual extraction function (`extract-knowledge/index.ts`) does not use any of the new modules created for bootstrap staging, cross-batch resolution, or resolution suggestions.

**Result:** The system will NOT behave as claimed. Code exists but will not execute the designed behavior.

---

## Critical Integration Gaps

### Gap 1: Bootstrap-Staging NOT CALLED

**Design Claim:**
> "First extraction: all batches staged in bootstrap_entity_staging, then promoted to Main after all batches complete successfully"

**What Exists:**
- ✅ `bootstrap-staging.ts` module with functions:
  - `initializeBootstrapStage()` - creates record in bootstrap_stages table
  - `stageEntity()` - inserts into bootstrap_entity_staging
  - `promoteBootstrapToMain()` - moves staged entities to Main
  - `failBootstrap()` - marks stage failed
  - `rollbackBootstrap()` - deletes staged entities

**What's Missing:**
- ❌ `extract-knowledge/index.ts` does NOT import bootstrap-staging.ts
- ❌ No call to `initializeBootstrapStage()` at extraction start
- ❌ No call to `stageEntity()` when saving entities
- ❌ No call to `promoteBootstrapToMain()` after all batches complete
- ❌ No call to `failBootstrap()` on error
- ❌ No call to `rollbackBootstrap()` on failure

**Current Behavior:**
Entities are inserted directly into `knowledge_entities` table regardless of mode.

**Required Fix:**
```typescript
// In extract-knowledge/index.ts main handler:

if (extractionMode === 'bootstrap') {
  // Initialize stage once per run (batch 1)
  if (batchNumber === 1) {
    bootstrapStageId = await initializeBootstrapStage(
      supabase, projectId, userId, extractionRunId, documentId, versionId, totalBatches
    );
  } else {
    // Get existing stage (batch 2+)
    const stage = await getBootstrapStage(supabase, extractionRunId);
    bootstrapStageId = stage.id;
  }
  
  // Stage entities instead of saving directly
  for (const entity of normalizedEntities) {
    await stageEntity(supabase, bootstrapStageId, projectId, userId, ...);
  }
  
  // After batch complete
  await completeBatch(supabase, bootstrapStageId);
  
  // After all batches complete
  if (batchNumber === totalBatches) {
    await promoteBootstrapToMain(supabase, bootstrapStageId);
  }
}
```

---

### Gap 2: Extraction-State NOT USED

**Design Claim:**
> "Cross-batch entity resolution: Batch 2+ searches extraction-state.ts to find entities created in Batch 1 before consolidating/creating new entities"

**What Exists:**
- ✅ `extraction-state.ts` module with:
  - `ExtractionRunState` interface (in-memory state per extraction run)
  - `initializeExtractionState()` - creates state object
  - `recordCreatedEntity()` - registers entity in state after creation
  - `findPriorBatchEntity()` - searches prior batches by name/type

**What's Missing:**
- ❌ `extract-knowledge/index.ts` does NOT import extraction-state.ts
- ❌ No creation of ExtractionRunState at extraction start
- ❌ No maintenance of state across batches (stateless serverless!)
- ❌ No calls to `findPriorBatchEntity()` during consolidation logic
- ❌ No calls to `recordCreatedEntity()` after saving entities

**Current Behavior:**
Each batch consolidates entities independently. No cross-batch resolution occurs.

**Issue:** Serverless functions are stateless - ExtractionRunState cannot be maintained in memory across batches. Instead, it must be stored in a database table (currently not implemented).

**Required Fix:**
1. Create `extraction_run_state` table to persist state across batch calls
2. Load state from database at batch start:
   ```typescript
   const state = await loadExtractionRunState(supabase, extractionRunId);
   ```
3. Before consolidation, check prior batches:
   ```typescript
   const priorEntity = findPriorBatchEntity(state, entityName, entityType, batchNumber);
   if (priorEntity) {
     // Use priorEntity.entity_id instead of creating new one
   }
   ```
4. After creating entity, record in state:
   ```typescript
   recordCreatedEntity(state, entityId, name, type, batchNumber, ...);
   ```

---

### Gap 3: Extraction-Mode Parameter NOT USED

**Design Claim:**
> "Extraction mode (bootstrap or branch) determines behavior: first extraction uses bootstrap, second uses branch"

**What Exists:**
- ✅ `ExtractRequest` interface includes `extraction_mode?: 'bootstrap' | 'branch'`
- ✅ Client (`documentStore.ts`) sets `extraction_mode` at RUN start

**What's Missing:**
- ❌ `extract-knowledge/index.ts` does NOT read `extraction_mode` from request
- ❌ No branching logic based on mode:
  ```typescript
  if (extractionMode === 'bootstrap') {
    // bootstrap-specific behavior
  } else if (extractionMode === 'branch') {
    // branch-specific behavior
  }
  ```
- ❌ Second extraction does not fall back to existing branch/overlay logic

**Current Behavior:**
Function treats all extractions the same way. Mode parameter is ignored.

**Required Fix:**
```typescript
const { extraction_mode, extraction_run_id } = req.body;

if (!extraction_mode) {
  return errorResponse('extraction_mode is required', 400);
}

if (extraction_mode === 'bootstrap') {
  // Use bootstrap staging
  bootstrapStageId = await initializeBootstrapStage(...);
} else if (extraction_mode === 'branch') {
  // Use existing branch/overlay logic
  const branchId = req.body.target_branch_id;
  // ... fall through to existing branch handling
} else {
  return errorResponse('Invalid extraction_mode', 400);
}
```

---

### Gap 4: Resolution Suggestions NOT CREATED

**Design Claim:**
> "Consolidation scores 70-99 persisted as resolution_suggestions for user review, not auto-merged"

**What Exists:**
- ✅ `resolution-suggestions.ts` module with `createResolutionSuggestion()` function
- ✅ `entity_resolution_suggestions` table created (migration 114)
- ✅ Code recognizes thresholds: `SUGGEST_CONSOLIDATION_THRESHOLD = 70`, `AUTO_CONSOLIDATE_THRESHOLD = 100`

**What's Missing:**
- ❌ Consolidation code has TODO comment instead of implementation:
  ```typescript
  if (score < CONSOLIDATION_THRESHOLDS.AUTO_CONSOLIDATE_THRESHOLD) {
    console.log(`[extract-knowledge] Consolidation SUGGESTED (not auto-merged)...`);
    // TODO: Call createResolutionSuggestion here with the entity IDs
    // This requires fetching entity IDs from the database, which happens later in persistence
    continue;
  }
  ```
- ❌ No call to `createResolutionSuggestion()` with 70-99 scores
- ❌ Medium-confidence suggestions are logged but NOT persisted

**Current Behavior:**
Consolidation candidates with scores 70-99 are neither merged nor stored. They're logged and forgotten.

**Required Fix:**
```typescript
if (score < CONSOLIDATION_THRESHOLDS.AUTO_CONSOLIDATE_THRESHOLD) {
  // Score 70-99: Persist as resolution suggestion
  const signals: ConsolidationSignal[] = evidence.map(e => ({
    type: e as SignalType,
    points: score / evidence.length,
    evidence: e
  }));
  
  await createResolutionSuggestion(
    supabase,
    projectId,
    userId,
    entityAId,  // Must be fetched from database
    entityBId,  // Must be fetched from database
    score,
    signals,
    rawExtractionId,
    branchId,
    null  // proposed_canonical_name
  );
  
  continue;  // Don't merge
}
```

---

### Gap 5: Provenance NOT POPULATED

**Design Claim:**
> "Every mention has chunk_id, page_number, evidence_text stored from source"

**What Exists:**
- ✅ Migration 112 adds `chunk_id` and `page_number` columns to `knowledge_entity_mentions`
- ✅ Indexes created for performance
- ✅ Schema is valid

**What's Missing:**
- ❌ No code that populates `chunk_id` field (would be NULL)
- ❌ No code that populates `page_number` field (would be NULL)
- ❌ Mentions are created but provenance not linked

**Current Behavior:**
Mentions are created with NULL chunk_id and page_number. Columns exist but are unpopulated.

**Required Fix:**
```typescript
// When creating mention:
const chunkInfo = chunkLookup.get(chunkPosition);
const { error } = await supabase
  .from("knowledge_entity_mentions")
  .insert({
    entity_id: entityId,
    mention_text: extractedName,
    chunk_position: chunkPosition,
    chunk_id: chunkInfo?.id,  // FK to document_chunks
    page_number: chunkInfo?.page,  // From document_chunks.page
    evidence_text: evidenceQuote,  // Extract snippet
    // ... other fields
  });
```

---

### Gap 6: Aliases NOT PERSISTED

**Design Claim:**
> "Aliases are extracted, tracked with provenance, and preserved across batches"

**What Exists:**
- ✅ `NormalizedEntity.aliases: string[]` captures aliases during extraction
- ✅ `findPriorBatchEntity()` checks aliases during cross-batch resolution
- ✅ Consolidation logic merges aliases from both entities

**What's Missing:**
- ❌ No `knowledge_entity_aliases` table shown in migrations
- ❌ No code saves aliases to database
- ❌ Aliases only exist in-memory during consolidation
- ❌ After extraction, aliases are lost

**Current Behavior:**
Aliases are used during extraction but not saved.

**Required Fix:**
Need to save aliases:
```typescript
// After entity created:
for (const alias of normalizedEntity.aliases) {
  await supabase
    .from("knowledge_entity_aliases")
    .insert({
      entity_id: entityId,
      alias: alias,
      branch_id: branchId,
      source: "ai",
      raw_extraction_id: rawExtractionId
    });
}
```

---

### Gap 7: Relationships NOT RESOLVED

**Design Claim:**
> "Relationships created between entities using actual UUIDs, not names"

**What Exists:**
- ✅ `ExtractedRelationship` interface captures: character_a, character_b, relationship_type, evidence

**What's Missing:**
- ❌ No code shown for resolving character_a/character_b names to UUIDs
- ❌ No code persists relationships with entity UUIDs
- ❌ No evidence field populated in relationships

**Current Behavior:**
Relationships extracted but not resolved or persisted.

**Required Fix:**
```typescript
// After all entities created:
for (const rel of extractedRelationships) {
  const entityAId = findBatchEntityId(rel.character_a, createdEntities);
  const entityBId = findBatchEntityId(rel.character_b, createdEntities);
  
  if (!entityAId || !entityBId) continue;
  
  await supabase
    .from("knowledge_entity_relationships")
    .insert({
      entity_a_id: entityAId,
      entity_b_id: entityBId,
      relationship_type: rel.relationship_type,
      evidence_text: rel.evidence?.[0],
      confidence: 0.85,
      branch_id: branchId,
      raw_extraction_id: rawExtractionId
    });
}
```

---

## What Would Need to Happen for System to Work

### Phase 1: Integration (Required Before Any Deployment)

1. **Import modules in extract-knowledge/index.ts:**
   ```typescript
   import { initializeBootstrapStage, stageEntity, promoteBootstrapToMain } from "../_shared/bootstrap-staging.ts";
   import { createResolutionSuggestion } from "../_shared/resolution-suggestions.ts";
   ```

2. **Add database support for extraction-state:**
   - Create `extraction_run_state` table OR use bootstrap_stages for tracking
   - Load state at batch start
   - Save state updates after batch

3. **Read and act on extraction_mode parameter:**
   - Check `extraction_mode` in request
   - Branch logic: if bootstrap → use staging, if branch → use existing logic

4. **Implement resolution suggestion creation:**
   - Replace TODO with actual `createResolutionSuggestion()` call
   - Track which entities were created so we have IDs

5. **Populate provenance columns:**
   - Fetch chunk_id and page_number from document_chunks
   - Store with every mention created

6. **Save aliases and relationships:**
   - Create missing tables if needed
   - Persist aliases after entity creation
   - Resolve and persist relationships

### Phase 2: Testing (After Integration)

1. Unit tests for each module in isolation
2. Integration tests for:
   - Single-batch bootstrap
   - Multi-batch bootstrap with cross-batch resolution
   - Second extraction using branch mode
   - Bootstrap failure and rollback
   - Merge threshold behavior
3. End-to-end tests with real Supabase instance

### Phase 3: Verification (After Testing)

1. Run golden dataset tests
2. Run regression scenarios
3. Verify metrics (false merges = 0, etc.)
4. Performance testing
5. Production readiness assessment

---

## Current State vs. Claimed State

| Feature | Claimed | Code Exists | Integrated | Working |
|---------|---------|-------------|-----------|---------|
| Bootstrap staging | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Cross-batch resolution | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Extraction-level mode | ✅ Yes | ✅ Yes (partial) | ❌ No | ❌ No |
| Resolution suggestions | ✅ Yes | ✅ Yes | ❌ No (TODO) | ❌ No |
| Provenance tracking | ✅ Yes | ✅ Schema only | ❌ No | ❌ No |
| Alias preservation | ✅ Yes | ✅ Partial | ❌ No | ❌ No |
| Relationship resolution | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Confidence scoring | ✅ Yes | ✅ Yes | ✅ Yes* | ✅ Yes* |

*Only for simple cases. Field-specific evidence not integrated into main extraction flow.

---

## Recommendations

### For the Team

**DO NOT DEPLOY THIS SYSTEM.** It is not production-ready.

The individual modules are well-designed, but they are disconnected. The extraction function does not use them.

### Immediate Actions (Today)

1. Accept this verification report
2. Do NOT mark as "production-ready"
3. Create a prioritized integration task list
4. Estimate effort to complete integration

### Integration Roadmap (1-2 weeks)

1. **Day 1-2:** Integrate bootstrap-staging into extract-knowledge
2. **Day 2-3:** Add database-backed extraction-state
3. **Day 3-4:** Implement resolution suggestion creation
4. **Day 4-5:** Add provenance population
5. **Day 5:** Fix second-extraction branch logic
6. **Day 6-7:** Unit and integration testing
7. **Day 8:** End-to-end verification

### Testing Before Redeployment

- [ ] Multi-batch bootstrap creates stage and stages entities
- [ ] Bootstrap promotion moves entities to Main
- [ ] Second extraction uses branch logic
- [ ] Cross-batch resolution finds prior-batch entities
- [ ] Medium-confidence (70-99) suggestions persisted
- [ ] Provenance populated for all mentions
- [ ] Golden dataset tests pass
- [ ] Regression tests pass
- [ ] No false merges observed

---

## Conclusion

**The claimed architecture is well-designed but not yet implemented.**

Code has been written and organized into modules, but the modules are not connected to the extraction pipeline. The system will not exhibit the claimed behavior without integration work.

**Current Status:** Code review complete. Critical gaps identified. Ready for integration work.

**Estimated effort to fix:** 40-80 hours of development + testing.

**Deployment readiness:** ⛔ NOT READY - integration required first.

---

**Next Step:** Create integration task list and begin Phase 1 work.
