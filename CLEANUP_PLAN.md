# Architecture Cleanup Plan
**Literary Assistant v1.3 → v2.0**

**Date:** August 20, 2026  
**Phase:** Pre-Contradiction Detection MVP Cleanup  
**Status:** AWAITING APPROVAL — No changes made yet

---

## Overview

This plan defines what can be safely deleted, what must be migrated, and what remains active during the transition from legacy entity architecture (v1.0-1.2) to knowledge layer architecture (v1.3+).

**Total Dead Code Identified:** ~2,500 lines  
**Safe to Delete Immediately:** ~1,500 lines  
**Risk Level:** LOW (isolated legacy code with no active dependencies)

---

## Part 1: What Can Be Safely Deleted Immediately (Phase 1)

### Phase 1A: Delete Edge Functions

#### 1. Extract-Entities Edge Function
**Location:** `supabase/functions/extract-entities/`  
**Size:** ~400 lines  
**Status:** DEAD CODE  
**Why Delete:** Never called, replaced by extract-knowledge  
**Risk:** NONE — no active references

**Verification Before Delete:**
```bash
# Should return no matches
grep -r "extract-entities" client/ server/ supabase/functions --exclude-dir=node_modules
# Only result should be the function directory itself
```

**Action:**
```bash
rm -rf supabase/functions/extract-entities/
```

---

### Phase 1B: Delete Backend Services

#### 2. Entity Extractor Service
**Location:** `server/src/entities/extractor.ts`  
**Size:** 306 lines  
**Status:** DEAD CODE  
**Why Delete:** Only called by disabled pipeline stage  
**Risk:** LOW — but check if tested

**Functions to Delete:**
- `extractEntitiesFromVersion()` (lines 71-107)
- `saveExtractedEntities()` (lines 224-306)

**Verification Before Delete:**
```bash
# Search for references
grep -r "extractEntitiesFromVersion\|saveExtractedEntities" server/ --include="*.ts"
# Should return no matches (except in extractor.ts and index.ts exports)
```

**Note:** Check if `server/src/entities/__tests__/` has tests for this file. If yes, delete tests too.

**Action:**
```bash
rm server/src/entities/extractor.ts
```

---

#### 3. Attributes Extraction Service
**Location:** `server/src/entities/attributes.ts`  
**Size:** 203 lines  
**Status:** DEAD CODE  
**Why Delete:** Never called in pipeline, extracted method never invoked  
**Risk:** LOW

**Functions to Delete:**
- `extractAttributesForEntity()` (lines 99-167)
- `extractAttributesForProject()` (lines 169-203)

**Verification Before Delete:**
```bash
grep -r "extractAttributesForEntity\|extractAttributesForProject" server/ --include="*.ts"
# Should return only in attributes.ts and index.ts exports
```

**Note:** Check tests.

**Action:**
```bash
rm server/src/entities/attributes.ts
```

---

### Phase 1C: Update Module Exports

#### 4. Update server/src/entities/index.ts
**Location:** `server/src/entities/index.ts`  
**Current Exports:** Mixed active + dead  
**Size:** ~10 lines

**Before:**
```typescript
export { extractEntitiesFromVersion, saveExtractedEntities } from './extractor.js'
export { findDuplicates, mergeEntities } from './deduplicator.js'
export type { MergeSuggestion } from './deduplicator.js'
export { extractAttributesForEntity, extractAttributesForProject } from './attributes.js'
export { detectContradictions, detectContradictionsForEntity, resolveContradiction } from './contradictions.js'
export { default as entityRoutes } from './routes.js'
```

**After:**
```typescript
export { findDuplicates, mergeEntities } from './deduplicator.js'
export type { MergeSuggestion } from './deduplicator.js'
export { detectContradictions, detectContradictionsForEntity, resolveContradiction } from './contradictions.js'
export { default as entityRoutes } from './routes.js'
```

**Removed Exports:**
- `extractEntitiesFromVersion`
- `saveExtractedEntities`
- `extractAttributesForEntity`
- `extractAttributesForProject`

**Action:**
```typescript
// Edit server/src/entities/index.ts
// Remove lines exporting from extractor.js and attributes.js
```

---

### Phase 1D: Simplify Pipeline Orchestrator

#### 5. Remove Disabled Pipeline Stages
**Location:** `server/src/pipeline/orchestrator.ts`  
**Size:** ~60 lines total

**What to Delete:**

**Option A (Conservative): Keep function stubs but remove from pipeline**
- Keep functions but rename to indicate disabled status
- Leaves hooks for future implementation

**Option B (Aggressive): Delete entirely**
- Removes unused code completely
- Must be re-added if pipeline stages re-enabled in future

**Recommendation:** Option B — Delete entirely since they're documented in comments.

**Functions to Delete:**

```typescript
// Lines 347-356 — DELETE
async function runEntityExtraction(
  _versionId: string,
  _projectId: string,
  _userId: string
): Promise<StageResult> {
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI entity extraction disabled: active Branch routing is required.',
  }
}

// Lines 363-371 — DELETE
async function runAttributeExtraction(_projectId: string): Promise<StageResult> {
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI attribute extraction disabled: active Branch routing is required.',
  }
}
```

**Update executeStage() switch statement:**

**Before:**
```typescript
switch (stage) {
  case 'extraction':
    return await runExtraction(versionId, storagePath)
  case 'chunking':
    return await runChunking(versionId)
  case 'indexing':
    return await runIndexing(versionId)
  case 'entity_extraction':
    return await runEntityExtraction(versionId, projectId, userId)
  case 'attribute_extraction':
    return await runAttributeExtraction(projectId)
  case 'contradiction_detection':
    return await runContradictionDetection(projectId)
  // ...
}
```

**After:**
```typescript
switch (stage) {
  case 'extraction':
    return await runExtraction(versionId, storagePath)
  case 'chunking':
    return await runChunking(versionId)
  case 'indexing':
    return await runIndexing(versionId)
  case 'contradiction_detection':
    return await runContradictionDetection(projectId)
  // ...
}
```

**Update PIPELINE_STAGES constant in types.ts:**

**Before:**
```typescript
export const PIPELINE_STAGES: PipelineStage[] = [
  'extraction',
  'chunking',
  'indexing',
  'entity_extraction',
  'attribute_extraction',
  'contradiction_detection',
]
```

**After:**
```typescript
export const PIPELINE_STAGES: PipelineStage[] = [
  'extraction',
  'chunking',
  'indexing',
  'contradiction_detection',
]
```

**Update STAGE_START_STATUS and STAGE_TO_STATUS:**

**Before:**
```typescript
export const STAGE_START_STATUS: Record<PipelineStage, string> = {
  extraction: 'extracting',
  chunking: 'chunking',
  indexing: 'indexing',
  entity_extraction: 'analyzing',
  attribute_extraction: 'analyzing',
  contradiction_detection: 'analyzing',
}

export const STAGE_TO_STATUS: Record<PipelineStage, string> = {
  extraction: 'extracted',
  chunking: 'chunked',
  indexing: 'indexed',
  entity_extraction: 'ready',
  attribute_extraction: 'ready',
  contradiction_detection: 'ready',
}
```

**After:**
```typescript
export const STAGE_START_STATUS: Record<PipelineStage, string> = {
  extraction: 'extracting',
  chunking: 'chunking',
  indexing: 'indexing',
  contradiction_detection: 'analyzing',
}

export const STAGE_TO_STATUS: Record<PipelineStage, string> = {
  extraction: 'extracted',
  chunking: 'chunked',
  indexing: 'indexed',
  contradiction_detection: 'ready',
}
```

**Update getResumeStage() function:**

**Before:**
```typescript
function getResumeStage(status: string): PipelineStage | null {
  switch (status) {
    case 'uploaded':
      return 'extraction'
    case 'extracting':
      return 'extraction' // retry
    case 'extracted':
      return 'chunking'
    case 'chunking':
      return 'chunking' // retry
    case 'chunked':
      return 'indexing'
    case 'indexing':
      return 'indexing' // retry
    case 'indexed':
      return 'entity_extraction'  // DELETE THIS LINE
    case 'analyzing':
      return 'entity_extraction'  // DELETE THIS LINE — might need to check which sub-stage
    case 'ready':
      return null // already done
    case 'error':
      return null // need explicit retry with startFromStage
    case 'skipped_no_provider':
      return null // AI stages skipped — document is usable for search
    default:
      return 'extraction'
  }
}
```

**After:**
```typescript
function getResumeStage(status: string): PipelineStage | null {
  switch (status) {
    case 'uploaded':
      return 'extraction'
    case 'extracting':
      return 'extraction' // retry
    case 'extracted':
      return 'chunking'
    case 'chunking':
      return 'chunking' // retry
    case 'chunked':
      return 'indexing'
    case 'indexing':
      return 'indexing' // retry
    case 'indexed':
      return 'contradiction_detection'  // CHANGED: skip directly to contradiction
    case 'analyzing':
      return 'contradiction_detection'  // CHANGED: skip straight to contradiction
    case 'ready':
      return null // already done
    case 'error':
      return null // need explicit retry with startFromStage
    case 'skipped_no_provider':
      return null // AI stages skipped — document is usable for search
    default:
      return 'extraction'
  }
}
```

---

### Phase 1E: Remove Disabled API Endpoint

#### 6. Remove POST /api/extract-entities Endpoint
**Location:** `server/src/entities/routes.ts` lines 311-548  
**Size:** 237 lines  
**Status:** DISABLED (returns HTTP 410)

**What to Delete:**

The entire endpoint implementation:
```typescript
// Lines 311-548 — DELETE ENTIRE SECTION
router.post('/api/extract-entities', async (req, res) => {
  // ... 237 lines of code
  const legacyExtractionDisabled = true
  if (legacyExtractionDisabled) {
    res.status(410).json({
      error: 'Legacy entity extraction is disabled. Use extract-knowledge with an active target_branch_id.',
    })
    return
  }
  // ... rest of endpoint
})
```

**Verification Before Delete:**
```bash
grep -r "extract-entities" client/ --include="*.ts" --include="*.tsx"
# Should return no matches — client doesn't call this endpoint
```

**Action:**
```typescript
// Edit server/src/entities/routes.ts
// Delete lines 311-548 (entire POST /api/extract-entities route)
```

---

## Summary of Phase 1 Changes

| File | Change | Lines Deleted | Risk |
|------|--------|---------------|------|
| supabase/functions/extract-entities/ | Delete directory | ~400 | LOW |
| server/src/entities/extractor.ts | Delete file | 306 | LOW |
| server/src/entities/attributes.ts | Delete file | 203 | LOW |
| server/src/entities/index.ts | Update exports | 2 | LOW |
| server/src/entities/routes.ts | Delete endpoint | 237 | LOW |
| server/src/pipeline/orchestrator.ts | Delete functions | 60 | LOW |
| server/src/pipeline/types.ts | Update constants | 6 | LOW |

**Total Lines Deleted:** ~1,500  
**Build Verification:** Must compile without errors  
**Test Verification:** Existing tests pass

---

## Part 2: What Must Be Migrated (Requires Decisions)

### Issue 2A: Database Migration Conflict — structured_fields Column

**Status:** NEEDS VERIFICATION  
**Action Required:** Create Migration 016

**Problem:**
- Migration 008 does NOT include `structured_fields` column in `knowledge_branch_entities`
- Migration 012 DOES include `structured_fields` column
- Since 008 creates table first, 012's CREATE TABLE IF NOT EXISTS does nothing
- Result: Column may be missing

**Verification Query:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'knowledge_branch_entities' 
ORDER BY ordinal_position;
```

**If structured_fields is MISSING:**

Create `supabase/migrations/016_add_structured_fields_to_branch_entities.sql`:

```sql
-- ============================================
-- MIGRATION 016: Add structured_fields column
-- Purpose: Fix missing column from 008_knowledge_branches.sql
-- ============================================

ALTER TABLE knowledge_branch_entities
ADD COLUMN IF NOT EXISTS structured_fields JSONB DEFAULT '{}';

-- Re-index if necessary
REINDEX TABLE knowledge_branch_entities;
```

**If structured_fields EXISTS:**
- No action needed
- Migration 008 was sufficient

---

### Issue 2B: API Layer Architecture Decision

**Status:** REQUIRES DESIGN DECISION  
**Timeline:** Post-MVP (not blocking cleanup)

**Decision Point:** How should REST API serve entity data?

**Current State:**
```
Extract-Knowledge Edge Function
  ↓
Writes to: knowledge_entities, knowledge_branch_entities
  ↓
REST API Endpoint (/api/projects/:id/entities)
  ↓
Reads from: entities (legacy table)
  ↓
Client UI
```

**Problem:** New extracted data is invisible to API consumers.

**Option A: Migrate API to knowledge_entities (RECOMMENDED)**
- Update routes.ts to query knowledge_* tables instead of legacy
- Handle Main/Branch layer logic in endpoints
- Timeline: 4-6 hours
- Risk: Medium (behavior change)
- Pro: Single source of truth
- Con: API logic becomes more complex

**Option B: Sync legacy tables during extraction (Compatibility Layer)**
- When extract-knowledge writes to knowledge_entities, also write to entities
- Keep API unchanged
- Timeline: 2-3 hours
- Risk: Low (no API change)
- Pro: Minimal API changes
- Con: Two tables to maintain
- Note: Explicitly not doing this per user instruction

**Option C: Deprecate REST API for entity extraction**
- Clients call extract-knowledge directly
- Keep API for other operations (merge, resolve contradictions)
- Timeline: 1-2 hours
- Risk: High (breaking change)
- Pro: No server-side extraction code
- Con: Requires client changes

**Recommendation:** Option A (Migrate API)  
**When:** After Contradiction Detection MVP is complete

---

### Issue 2C: Legacy Data Decision

**Status:** REQUIRES DATA DECISION  
**Scope:** Existing data in entities, entity_mentions, entity_attributes, entity_relations, contradictions

**Questions:**
1. Does production database have existing entity data?
2. Is that data still needed?
3. Should it be preserved?

**Options:**

**Option A: Keep Tables (Archive Mode)**
- Leave legacy tables in place but unused
- Mark schema as deprecated
- Can always migrate later
- Timeline: 0 hours
- Risk: None (no changes)
- Pro: Data preserved indefinitely
- Con: Schema debt increases

**Option B: Migrate Data to New Schema**
- Write data transformation script
- Map old entity types to new types
- Create new knowledge_entities records
- Delete legacy data after verification
- Timeline: 8-12 hours (depends on data volume)
- Risk: High (complex transformation)
- Pro: Single source of truth
- Con: Non-trivial development

**Option C: Delete Legacy Data**
- Delete all records from legacy tables (or drop tables)
- Start fresh with new schema
- Timeline: 1 hour
- Risk: Medium (data loss if needed)
- Pro: Clean slate
- Con: Cannot recover old data

**Recommendation:** Option A (Keep as archive)  
**Rationale:** Data is already not written to. Keeping tables preserves history and allows future migration if needed. Can always delete later.

---

## Part 3: What Must Remain (Active Code)

### Must Keep: Active API Endpoints

**Location:** server/src/entities/routes.ts

**Endpoints:**
- ✅ GET /api/projects/:projectId/entities
- ✅ GET /api/projects/:projectId/entities/:entityId
- ✅ PATCH /api/projects/:projectId/entities/:entityId
- ✅ GET /api/projects/:projectId/entities/suggestions/merge
- ✅ POST /api/projects/:projectId/entities/merge
- ✅ GET /api/projects/:projectId/contradictions
- ✅ PATCH /api/projects/:projectId/contradictions/:contradictionId

**Why Keep:** Used by frontend UI for entity management and contradiction resolution.

**Status After Phase 1:** Unchanged — only POST /api/extract-entities is deleted.

---

### Must Keep: Active Services

**Location:** server/src/entities/

**Services:**
- ✅ deduplicator.ts — Entity merge logic (used by /merge endpoint)
- ✅ contradictions.ts — Resolve contradictions (used by API)
- ✅ routes.ts (except /api/extract-entities)
- ✅ index.ts (updated exports)

**Why Keep:** Used by active REST endpoints.

---

### Must Keep: Active Edge Functions

**Location:** supabase/functions/

**Functions:**
- ✅ extract-knowledge/ — Production extraction pipeline
- ✅ process-document/ — Document processing
- ✅ generate-embeddings/ — Embedding generation
- ✅ test-gemini/ — AI provider testing (for development)
- ✅ _shared/ — Shared utilities

**Status After Phase 1:** Unchanged except extract-entities/ is deleted.

---

### Must Keep: Active Database Tables

**Status: DO NOT DELETE**

**Legacy Tables (Read-only Archive):**
- entities
- entity_mentions
- entity_attributes
- entity_relations
- contradictions

**Active Knowledge Layer:**
- ✅ knowledge_entities
- ✅ knowledge_entity_aliases
- ✅ knowledge_entity_mentions
- ✅ knowledge_entity_relationships
- ✅ knowledge_events
- ✅ knowledge_event_mentions
- ✅ knowledge_event_participants
- ✅ knowledge_branches
- ✅ knowledge_branch_entities
- ✅ raw_extractions

---

### Must Keep: Active Client Code

**All components and stores remain active:**
- ✅ client/src/stores/entityStore.ts
- ✅ client/src/stores/contradictionStore.ts
- ✅ All entity components (CharactersHub, EntityModal, etc.)

**Status After Phase 1:** Unchanged (no client-side changes in Phase 1).

---

## Part 4: Validation Checklist

### Before Phase 1 Execution

- [ ] Audit report reviewed
- [ ] No objections from team
- [ ] Backup created of codebase
- [ ] Local build currently successful
- [ ] Tests currently passing

### Phase 1 Execution Steps

1. **Backup current state**
   ```bash
   git checkout -b cleanup/phase-1
   ```

2. **Delete dead code** (follow deletions in Part 1)
   - Delete supabase/functions/extract-entities/
   - Delete server/src/entities/extractor.ts
   - Delete server/src/entities/attributes.ts
   - Update server/src/entities/index.ts
   - Delete POST /api/extract-entities from routes.ts
   - Update orchestrator.ts

3. **Update Pipeline Types**
   - Modify server/src/pipeline/types.ts

4. **Verify builds**
   ```bash
   npm run build
   cd server && npm run build
   cd client && npm run build
   ```

5. **Run tests**
   ```bash
   npm run test
   # All tests should pass
   ```

6. **Commit changes**
   ```bash
   git add -A
   git commit -m "Cleanup Phase 1: Remove legacy extraction code and disabled pipeline stages"
   ```

### Phase 1 Verification

**Expected Outcomes:**
- ✅ Build succeeds with no errors
- ✅ All existing tests pass
- ✅ No compilation warnings
- ✅ No runtime errors on startup

**If Build Fails:**
- Identify remaining references to deleted code
- Update imports and exports
- Re-verify all dependent code

---

## Part 5: Post-Cleanup Notes

### For Contradiction Detection MVP

**What's Available After Cleanup:**
- Clean, simplified pipeline with only active stages
- Legacy code removed, reducing maintenance burden
- API endpoints ready for entity/contradiction operations
- Database schema documented with clear separation of legacy vs. active layers

**What Needs Attention for MVP:**

1. **Contradiction Detection Re-enable**
   - runContradictionDetection() remains in pipeline
   - detectContradictions() function is called
   - Legacy implementation works with existing tables
   - MVP can build on this foundation or re-architect for knowledge_entities

2. **API Layer Migration** (Post-MVP)
   - Consider migrating /api/projects/:id/entities to read knowledge_* tables
   - Decide on Main/Branch layer handling in API
   - Update documentation

3. **Data Migration** (Optional)
   - If keeping legacy tables, document as archive
   - Consider data migration script if data needs to be moved to new schema

---

## Appendix: Files to Delete (Summary)

### Phase 1 Deletions

```
supabase/functions/extract-entities/
  ├── index.ts
  ├── deno.json
  └── ... (all files in directory)

server/src/entities/extractor.ts
server/src/entities/attributes.ts
```

### Phase 1 Modifications

```
server/src/entities/index.ts
  - Remove extractor.js exports
  - Remove attributes.js exports

server/src/entities/routes.ts
  - Delete lines 311-548 (POST /api/extract-entities)

server/src/pipeline/orchestrator.ts
  - Delete runEntityExtraction() function
  - Delete runAttributeExtraction() function
  - Update executeStage() switch statement
  - Update getResumeStage() function

server/src/pipeline/types.ts
  - Update PIPELINE_STAGES constant
  - Update STAGE_START_STATUS constant
  - Update STAGE_TO_STATUS constant
```

---

## Timeline & Effort Estimates

| Phase | Task | Effort | Risk | Blocking |
|-------|------|--------|------|----------|
| 1A | Delete extract-entities Edge Function | 5 min | LOW | No |
| 1B | Delete extractor.ts and attributes.ts | 15 min | LOW | No |
| 1C | Update entity index.ts | 5 min | LOW | No |
| 1D | Simplify orchestrator | 20 min | LOW | No |
| 1E | Delete disabled endpoint | 5 min | LOW | No |
| **Total Phase 1** | | **50 min** | **LOW** | **No** |
| 2A | Fix structured_fields (if needed) | 10 min | LOW | Yes |
| 2B | API Architecture Decision | 0 min | N/A | No |
| 2C | Legacy Data Decision | 0 min | N/A | No |

**Phase 1 is safe to execute immediately after approval.**  
**Phases 2A-2C require decisions but don't block Phase 1.**

---

## Approval Gates

### Gate 1: Phase 1 Cleanup (Ready for approval)
**Preconditions:**
- [ ] Audit report reviewed
- [ ] Cleanup plan approved

**Deliverables:**
- ~1,500 lines of dead code removed
- Build succeeds
- Tests pass

**Success Criteria:**
- Codebase is cleaner
- No broken functionality
- All tests green

---

### Gate 2: Database Schema Verification (Prerequisite for Phase 2)
**Required Before:**
- Contradiction Detection MVP implementation

**Deliverables:**
- Confirm structured_fields column exists
- Create Migration 016 if needed
- Verify extract-knowledge can write

---

### Gate 3: API Migration (Post-MVP)
**Timeline:** After Contradiction Detection MVP

**Options to Choose:**
- [ ] Option A: Migrate API to knowledge_entities
- [ ] Option B: Implement compatibility layer (rejected per instructions)
- [ ] Option C: Deprecate REST extraction API

---

## Conclusion

**Phase 1 Cleanup is READY FOR EXECUTION.**

All dead code has been identified, classified, and prepared for safe deletion. No active functionality will be affected. The cleanup reduces maintenance burden and provides a clean foundation for Contradiction Detection MVP development.

**Recommended Action:** Approve Phase 1, execute immediately, verify builds, then proceed with Contradiction Detection MVP implementation.

---

**Report Generated:** 2026-08-20  
**Status:** AWAITING APPROVAL  
**Next Step:** User approval to execute Phase 1
