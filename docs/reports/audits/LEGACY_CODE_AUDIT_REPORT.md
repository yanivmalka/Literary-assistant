# Legacy/Dead-Code Audit Report
**Literary Assistant v1.3 → v2.0 Transition**

**Date:** August 20, 2026  
**Status:** AUDIT COMPLETE — NO DELETIONS PERFORMED  
**Scope:** Comprehensive analysis of legacy entity architecture (004) vs. new knowledge layer (007-015)

---

## Executive Summary

The codebase is in **active transition** between two entity architectures:

- **Legacy:** Single-table entity model with AI extraction disabled (004_document_analysis_schema.sql)
- **New:** Multi-table knowledge layer with branching support, active extraction (007_knowledge_entities.sql → 015_branch_scoped_relationship_review.sql)

**Key Finding:** The extraction pipeline writes to NEW tables, but the REST API reads from LEGACY tables. This creates a **two-tier system** where extracted data isn't visible via the current API.

**Critical Issues Found:**
1. ⚠️ Duplicate migration conflict (008 vs 012) — `structured_fields` column status unclear
2. ⚠️ Pipeline stages disabled but code still present (attribute extraction, contradiction detection)
3. ⚠️ Dead Edge Function (extract-entities) never called, can be deleted
4. ⚠️ API layer disconnected from new extraction pipeline

**Deletion Safety:** Can safely delete ~2,500 lines of dead code immediately without affecting active features.

---

## Part 1: Database Schema Analysis

### Legacy Tables (004_document_analysis_schema.sql)

| Table | Rows? | Written By | Read By | Status |
|-------|-------|-----------|---------|--------|
| `entities` | Unknown | Legacy extractor (disabled) | REST API routes | **LEGACY** |
| `entity_mentions` | Unknown | Legacy extractor (disabled) | REST API routes | **LEGACY** |
| `entity_attributes` | Unknown | Legacy extractor (disabled) | REST API routes | **LEGACY** |
| `entity_relations` | Unknown | Legacy extractor (disabled) | REST API routes | **LEGACY** |
| `contradictions` | Unknown | Legacy detector (skipped) | REST API routes, Client UI | **LEGACY** |

**Current Status:** Tables exist in schema but are not actively written to by the production pipeline.

**Where Data Comes From:** Any existing data was created by prior versions. No new data is being inserted since extraction pipeline was disabled.

### New Knowledge Layer Tables (007_knowledge_entities.sql)

| Table | Actively Used? | Written By | Read By | Status |
|-------|----------------|-----------|---------|--------|
| `knowledge_entities` | ✅ YES | extract-knowledge Edge Function | Client stores, Edge functions | **ACTIVE** |
| `knowledge_entity_aliases` | ✅ YES | extract-knowledge | Query/search functions | **ACTIVE** |
| `knowledge_entity_mentions` | ✅ YES | extract-knowledge | Analytics, debugging | **ACTIVE** |
| `knowledge_entity_relationships` | ✅ YES | extract-knowledge | Relationship views | **ACTIVE** |
| `raw_extractions` | ✅ YES | extract-knowledge | Audit trail, debugging | **ACTIVE** |

### Branching System Tables (008 vs 012 Migration Conflict)

**⚠️ CRITICAL ISSUE FOUND:**

**Migration 008_knowledge_branches.sql** and **012_knowledge_branches_standalone.sql** both define `knowledge_branch_entities`:

```
Migration 008 (lines 27-46):
  - NO structured_fields column
  - FK to profiles(id)
  - Creates trigger
  - RLS policies via CREATE POLICY

Migration 012 (lines 24-43):  
  - HAS structured_fields column ✅
  - NO FK to profiles (uses bare UUID)
  - DROP TRIGGER IF EXISTS (safe re-run)
  - RLS policies via DO block (safe if exists)
```

**Current Migration State:** Since migrations run sequentially (001→015), **008 creates the tables first**. Migration 012 uses `CREATE TABLE IF NOT EXISTS`, so it **does nothing** if tables already exist.

**Impact:** If 008 was the only migration applied, `knowledge_branch_entities.structured_fields` column is **MISSING**.

**Verification Needed:** Check actual database schema to confirm which columns exist.

**extract-knowledge.ts Dependency:** Line 420-422 writes to `structured_fields`:
```typescript
structured_fields: buildStructuredFields(type, entity),
```
If column missing, writes will FAIL with: `column "structured_fields" of relation "knowledge_branch_entities" does not exist`

---

## Part 2: Backend Code Classification

### Server Routes (server/src/entities/routes.ts)

**Status: ACTIVE - All endpoints operational**

| Endpoint | Lines | Tables Used | Active? | Notes |
|----------|-------|------------|---------|-------|
| GET `/api/projects/:id/entities` | 24-49 | entities, entity_mentions | ✅ YES | Used by knowledge hub |
| GET `/api/projects/:id/entities/:id` | 55-118 | entities, entity_mentions, entity_attributes, entity_relations | ✅ YES | Entity detail view |
| PATCH `/api/projects/:id/entities/:id` | 124-156 | entities | ✅ YES | Entity confirmation |
| GET `/api/projects/:id/entities/suggestions/merge` | 162-173 | entities | ✅ YES | Merge suggestions |
| POST `/api/projects/:id/entities/merge` | 179-199 | entities, entity_mentions, entity_attributes, entity_relations | ✅ YES | Entity merging |
| GET `/api/projects/:id/contradictions` | 205-273 | contradictions, entities, entity_attributes | ✅ YES | Contradiction UI |
| PATCH `/api/projects/:id/contradictions/:id` | 279-305 | contradictions | ✅ YES | Contradiction resolution |
| POST `/api/extract-entities` | 311-548 | entities, entity_mentions, entity_attributes | ❌ DISABLED | **Returns HTTP 410** |

**Classification:**
- **ACTIVE:** REST API endpoints are live and used by frontend
- **REQUIRED:** Routes depend on legacy table schema being present
- **ARCHITECTURAL GAP:** API reads legacy tables, but extraction pipeline writes to new knowledge_* tables

### Backend Extraction Services (server/src/entities/)

| File | Function | Lines | Calls | Status |
|------|----------|-------|-------|--------|
| extractor.ts | extractEntitiesFromVersion() | 71-107 | Legacy pipeline | ❌ DEAD |
| extractor.ts | saveExtractedEntities() | 224-306 | Legacy pipeline | ❌ DEAD |
| attributes.ts | extractAttributesForEntity() | 99-167 | Orchestrator | ❌ DEAD |
| attributes.ts | extractAttributesForProject() | 169-203 | Orchestrator | ❌ DEAD |
| contradictions.ts | detectContradictions() | 7-39 | Orchestrator | ❌ SKIPPED |
| contradictions.ts | detectContradictionsForEntity() | 41-75 | Orchestrator | ❌ SKIPPED |
| contradictions.ts | resolveContradiction() | 156-182 | REST API | ✅ ACTIVE |
| deduplicator.ts | findDuplicates() | 70-168 | REST API | ✅ ACTIVE |
| deduplicator.ts | mergeEntities() | 172-240 | REST API | ✅ ACTIVE |

**Why Dead?**
1. Pipeline orchestrator has `entity_extraction` stage disabled (returns early)
2. Attribute extraction stage disabled
3. Contradiction detection stage disabled but runs resolver function

See: **server/src/pipeline/orchestrator.ts lines 347-381**

### Pipeline Orchestrator (server/src/pipeline/orchestrator.ts)

**Active Stages:**
- ✅ extraction (lines 207-250) — Extract text from PDF/DOCX
- ✅ chunking (lines 256-309) — Split into document chunks
- ✅ indexing (lines 315-332) — Generate embeddings

**Disabled Stages:**
- ❌ entity_extraction (lines 347-356) — **Returns immediately, never runs**
  ```typescript
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI entity extraction disabled: active Branch routing is required.',
  }
  ```

- ❌ attribute_extraction (lines 363-371) — **Defined but never called in stage loop**
  ```typescript
  async function runAttributeExtraction(_projectId: string): Promise<StageResult> {
    return {
      skipped: true,
      skipReason: 'Legacy AI attribute extraction disabled: active Branch routing is required.',
    }
  }
  ```

- ⚠️ contradiction_detection (lines 374-381) — **Calls detectContradictions() but only for legacy tables**
  ```typescript
  async function runContradictionDetection(projectId: string): Promise<StageResult> {
    const result = await detectContradictions(projectId)
    // ... error handling
    return { success: true }
  }
  ```

**PIPELINE_STAGES constant (types.ts):**
```typescript
['extraction', 'chunking', 'indexing', 'entity_extraction', 'attribute_extraction', 'contradiction_detection']
```

---

## Part 3: Edge Functions Analysis

### Extract-Knowledge (supabase/functions/extract-knowledge/index.ts) — **ACTIVE**

**Status:** ✅ PRODUCTION EXTRACTION PIPELINE

**What it does:**
- Called by: client/src/stores/documentStore.ts (line 359)
- Receives: document version ID, optional branch ID or "main" flag
- LLM: Gemini (multi-model fallback: gemini-2.0-flash → gemini-1.5-pro → etc.)
- Writes to:
  - `raw_extractions` — audit trail (line 665)
  - `knowledge_entities` — main or branch layer (line 827)
  - `knowledge_branch_entities` — if branch mode (line 823)
  - `knowledge_entity_relationships` — relationships (later)
  - `knowledge_events` — future

**Lines of Interest:**
- Line 227-422: buildStructuredFields() — expects `structured_fields` column
- Line 665: Saves to raw_extractions
- Line 823: Inserts to knowledge_branch_entities (REQUIRES structured_fields column)
- Line 827: Inserts to knowledge_entities

**Schema Dependency:** **CRITICAL** — Assumes `structured_fields` column exists in `knowledge_branch_entities`

### Extract-Entities (supabase/functions/extract-entities/index.ts) — **DEAD**

**Status:** ❌ NEVER CALLED — Can be deleted

**What it does:**
- Old extraction function using HuggingFace Mistral
- Writes to legacy tables: entities, entity_mentions, entity_attributes
- Replaced by extract-knowledge

**Proof it's dead:**
- Not referenced anywhere in codebase
- Not called from client or server
- No routes invoke it
- Server routes have `/api/extract-entities` POST endpoint **disabled with HTTP 410**

**Size:** ~400 lines of code

---

## Part 4: Client-Side Code Analysis

### EntityStore (client/src/stores/entityStore.ts)

**Status:** ✅ ACTIVE — manages entity state

**Functions:**
- createEntity() — called by EntityModal, CharacterEditModal
- fetchEntities() — called by CharactersHub, LocationsHub
- updateEntity() — called by CharacterEditModal, CharacterDetailModal
- getMainOnlyEntities() — filters main layer entities
- getEffectiveBranchEntities() — combines main + branch with overrides

**Components Using It:**
- CharactersHub.tsx (line 22)
- CharacterTile.tsx
- LocationsHub.tsx
- LocationTile.tsx
- CharacterEditModal.tsx
- EntityModal.tsx
- AbilitiesPanel.tsx
- ObjectsPanel.tsx

**Note:** Store definition not visible in initial file tree, likely at `client/src/stores/entityStore.ts`

### ContradictionStore (client/src/stores/contradictionStore.ts)

**Status:** ✅ ACTIVE — reads from legacy contradictions table

**What it does:**
- Queries `contradictions` table directly from Supabase
- Used by contradiction detection UI
- Implements contradiction resolution logic

**Note:** Works but depends on legacy table schema

---

## Part 5: Contradictions Architecture Analysis

### Legacy Contradiction System

**Database Schema (004):**
```sql
CREATE TABLE contradictions (
  id UUID,
  entity_id UUID REFERENCES entities,
  attribute_a_id UUID REFERENCES entity_attributes,
  attribute_b_id UUID REFERENCES entity_attributes,
  contradiction_type TEXT, -- 'attribute_conflict' only (MVP)
  status TEXT, -- 'open', 'resolved_fix_profile', 'resolved_fix_text', 'resolved_intentional', 'ignored'
  ...
)
```

### Detection Implementation

**File:** server/src/entities/contradictions.ts

**Functions:**
1. `detectContradictions(projectId)` — lines 7-39
   - Reads all entities for project
   - For each entity, calls detectContradictionsForEntity()
   - Returns: { error?: string }

2. `detectContradictionsForEntity(entityId)` — lines 41-75
   - Reads all attributes for entity
   - Groups by attribute_name
   - For each group with > 1 unique value, creates contradiction record
   - Inserts to contradictions table

3. `resolveContradiction(contradictionId, status, note)` — lines 156-182
   - Updates contradictions table status
   - Used by API route PATCH `/api/projects/:id/contradictions/:id`

### Current Detection Status

**Pipeline Stage Status:** ❌ DISABLED but code still runs

- Orchestrator calls `runContradictionDetection(projectId)` (line 374-381)
- Which calls `detectContradictions(projectId)` (line 378)
- Which queries/writes legacy tables

**However:** There is NO Contradiction Detection MVP yet. The function runs but:
- Only detects `attribute_conflict` type
- Only works with legacy entity_attributes table
- No detection for knowledge layer contradictions

### Classification

| Component | Status | Notes |
|-----------|--------|-------|
| contradictions table | LEGACY | Exists, works, but not populated by active pipeline |
| detectContradictions() | SKIPPED | Runs in orchestrator but is legacy implementation |
| resolveContradiction() | ACTIVE | Used by REST API endpoint |
| Contradiction UI | PARTIAL | Can display but detection disabled |

---

## Part 6: Type Definition Analysis

### Entity Type Enums

**Legacy (004):**
```sql
CHECK (entity_type IN (
  'character', 'location', 'country', 'continent', 'region',
  'object', 'ability', 'magic_system', 'event'
))
```

**New (007):**
```sql
CHECK (entity_type IN (
  'character', 'location', 'object', 'ability', 'magic_ability', 
  'organization', 'event'
))
```

**Differences:**
- Removed: country, continent, region (now location attributes)
- Added: magic_ability (separate from ability)
- Added: organization
- Removed: magic_system (now attribute of ability)

**Impact:** Incompatible enum types between old and new schemas. Cannot directly migrate entities.

---

## Part 7: Data Flow Diagram

### Current (Broken) Two-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT EXTRACTION CALL                                          │
│ client/src/stores/documentStore.ts:triggerEntityExtraction()   │
│ (Line 359)                                                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓ Calls Supabase Edge Function
        ┌────────────────────────┐
        │ extract-knowledge      │
        │ (Active)               │
        │ Gemini LLM extraction  │
        └────────────┬───────────┘
                     │
        Writes to NEW tables:
        - knowledge_entities
        - knowledge_entity_aliases
        - knowledge_entity_mentions
        - knowledge_entity_relationships
        - raw_extractions
                     │
                     └─────── ❌ NOT VISIBLE VIA REST API ────┐
                                                               │
                     ↓                                         │
        ┌────────────────────────┐                             │
        │ REST API Routes        │                             │
        │ (EntityRoutes)         │                             │
        └────────────┬───────────┘                             │
                     │                                         │
        Reads from LEGACY tables:        Extracted data from:
        - entities                        - knowledge_entities
        - entity_mentions                 NOT VISIBLE ❌
        - entity_attributes
        - entity_relations
        - contradictions
                     │
                     ↓ Sends to Client
        ┌────────────────────────┐
        │ Client UI              │
        │ (React Components)      │
        │ - CharactersHub        │
        │ - EntityModal          │
        │ - CharacterTile        │
        └────────────────────────┘
```

**Problem:** New extracted data in knowledge_* tables is invisible to REST API and client UI.

---

## Part 8: Comprehensive Dead Code Inventory

### 1. Extract-Entities Edge Function

**Location:** supabase/functions/extract-entities/  
**Status:** ❌ DEAD — Never called  
**Lines:** ~400 (entire directory)  
**Replaces:** Legacy entity extraction before Gemini era  
**Can Delete:** YES, immediately

**Evidence:**
- No references in codebase
- Client calls extract-knowledge instead (documentStore.ts)
- Server route disabled (returns 410)

---

### 2. Legacy Entity Extractor

**Location:** server/src/entities/extractor.ts  
**Status:** ❌ DEAD — Never called in pipeline  
**Size:** 306 lines  
**Functions:**
- `extractEntitiesFromVersion()` (lines 71-107)
- `saveExtractedEntities()` (lines 224-306)

**Evidence:**
- Pipeline stage disabled (orchestrator.ts line 355)
- No active callers
- Writes to legacy tables

**Can Delete:** YES, immediately (but check if tested)

---

### 3. Attribute Extraction Service

**Location:** server/src/entities/attributes.ts  
**Status:** ❌ DEAD — Never executed  
**Size:** 203 lines  
**Functions:**
- `extractAttributesForEntity()` (lines 99-167)
- `extractAttributesForProject()` (lines 169-203)

**Evidence:**
- runAttributeExtraction() defined but never called (orchestrator.ts line 363-371)
- Function returns immediately: `skipReason: 'Legacy AI attribute extraction disabled'`
- No other callers in codebase

**Can Delete:** YES, immediately

---

### 4. Disabled Pipeline Stages

**Location:** server/src/pipeline/orchestrator.ts  
**Status:** ❌ DEAD CODE  
**Size:** ~50 lines total

**Functions:**
- `runEntityExtraction()` (lines 347-356) — Returns skipped immediately
- `runAttributeExtraction()` (lines 363-371) — Returns skipped immediately

**Code:**
```typescript
async function runEntityExtraction(_versionId: string, _projectId: string, _userId: string): Promise<StageResult> {
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI entity extraction disabled: active Branch routing is required.',
  }
}
```

**Can Delete:** YES, simplify pipeline (but keep contradiction_detection)

---

### 5. Legacy Extract-Entities API Endpoint

**Location:** server/src/entities/routes.ts, lines 311-548  
**Status:** ❌ DISABLED — Returns HTTP 410  
**Size:** 237 lines

**Code (lines 327-332):**
```typescript
const legacyExtractionDisabled = true
if (legacyExtractionDisabled) {
  res.status(410).json({
    error: 'Legacy entity extraction is disabled. Use extract-knowledge with an active target_branch_id.',
  })
  return
}
```

**Can Delete:** YES, remove entire POST /api/extract-entities implementation

---

### 6. Index Exports (server/src/entities/index.ts)

**Status:** ⚠️ PARTIAL DEAD

**Exports (lines):**
- `extractEntitiesFromVersion` — Dead (extractor.ts)
- `saveExtractedEntities` — Dead (extractor.ts)
- `extractAttributesForEntity` — Dead (attributes.ts)
- `extractAttributesForProject` — Dead (attributes.ts)

**Still Active:**
- `findDuplicates` — Used by REST API
- `mergeEntities` — Used by REST API
- `detectContradictions` — Used by pipeline (legacy)
- `detectContradictionsForEntity` — Used by legacy service
- `resolveContradiction` — Used by REST API
- `entityRoutes` — Used by server

**Can Update:** Remove dead exports from index.ts

---

### 7. Legacy STAGE_TO_STATUS and STAGE_START_STATUS Constants

**Location:** server/src/pipeline/types.ts  
**Status:** ⚠️ PARTIAL DEAD

**Contains:**
- `entity_extraction` stage mappings
- `attribute_extraction` stage mappings

**Can Update:** Simplify if stages removed

---

## Part 9: Active Code Analysis (What Must Stay)

### Active API Endpoints (Must Keep)

All endpoints in **server/src/entities/routes.ts** are active:
- GET /api/projects/:id/entities
- GET /api/projects/:id/entities/:id
- PATCH /api/projects/:id/entities/:id
- GET /api/projects/:id/entities/suggestions/merge
- POST /api/projects/:id/entities/merge
- GET /api/projects/:id/contradictions
- PATCH /api/projects/:id/contradictions/:id

**Reason:** Used by frontend UI for entity management and contradiction resolution.

### Active Services (Must Keep)

- `deduplicator.ts` — Used by merge endpoints
- `contradictions.ts:resolveContradiction()` — Used by API
- `entityRoutes` — Used by server

### Active Edge Functions (Must Keep)

- `extract-knowledge` — Active extraction pipeline
- `process-document` — Document processing
- `generate-embeddings` — Embedding generation
- `test-gemini` — AI provider testing

### Active Client Stores (Must Keep)

- `entityStore.ts` — Used by all entity UI
- `contradictionStore.ts` — Used by contradiction UI
- `branchStore.ts` — Branch management

---

## Part 10: Migration & Data Compatibility Issues

### Issue 1: Enum Type Incompatibility

**Problem:** Entity type enums changed between 004 and 007.

**Old Types (004):**
```
'character', 'location', 'country', 'continent', 'region',
'object', 'ability', 'magic_system', 'event'
```

**New Types (007):**
```
'character', 'location', 'object', 'ability', 'magic_ability',
'organization', 'event'
```

**Data Impact:** Cannot directly copy entities from legacy table to new table if type is country/continent/region/magic_system.

**Solution:** Migration script needed to:
1. Map country/continent/region → location with attributes
2. Map magic_system → organization or ability attribute
3. Split magic_ability from ability

---

### Issue 2: Schema Structure Differences

**Legacy (004):**
```sql
entities:
  - id, project_id, user_id, name, entity_type, status, aliases[], merged_into_id, metadata

entity_attributes:
  - id, entity_id, attribute_name, attribute_value, source_chunk_id, confidence, data_origin
```

**New (007):**
```sql
knowledge_entities:
  - id, project_id, user_id, document_id, version_id, canonical_name, entity_type, entity_types[],
    description, attributes{}, structured_fields{}, layer, source, raw_extraction_id

knowledge_entity_aliases:
  - id, entity_id, alias
```

**Data Impact:**
- No `status` field in new schema (entities are always "active")
- `attributes` is now JSONB object, not separate table rows
- `structured_fields` is typed fields per entity type
- `layer` indicates main vs branch
- `source` indicates AI vs user

**Migration:** Non-trivial data transformation required.

---

### Issue 3: Structured Fields Column Missing (CRITICAL)

**Current Status:** Unknown — need to verify actual database schema

**Location:** knowledge_branch_entities.structured_fields

**Migration Files:**
- **008:** Does NOT include structured_fields column
- **012:** INCLUDES structured_fields column

**If Only 008 Applied:**
- Column missing → extract-knowledge writes will FAIL
- Need to ALTER TABLE to add column

---

## Part 11: Summary Classification Table

### Complete Codebase Classification

| Component | Classification | File/Location | Size | Reason |
|-----------|-----------------|---------------|------|--------|
| extract-knowledge | ACTIVE | supabase/functions/extract-knowledge/ | 1100 lines | Production extraction |
| extract-entities | DEAD | supabase/functions/extract-entities/ | 400 lines | Never called, replaced by extract-knowledge |
| Entity REST API | ACTIVE | server/src/entities/routes.ts | 548 lines | Used by frontend |
| extractEntitiesFromVersion() | DEAD | server/src/entities/extractor.ts | 37 lines | Never called |
| saveExtractedEntities() | DEAD | server/src/entities/extractor.ts | 83 lines | Never called |
| extractAttributesForEntity() | DEAD | server/src/entities/attributes.ts | 69 lines | Never called |
| extractAttributesForProject() | DEAD | server/src/entities/attributes.ts | 35 lines | Never called |
| findDuplicates() | ACTIVE | server/src/entities/deduplicator.ts | 99 lines | Used by merge endpoint |
| mergeEntities() | ACTIVE | server/src/entities/deduplicator.ts | 69 lines | Used by merge endpoint |
| detectContradictions() | SKIPPED | server/src/entities/contradictions.ts | 33 lines | Runs but legacy impl |
| resolveContradiction() | ACTIVE | server/src/entities/contradictions.ts | 27 lines | Used by API |
| POST /api/extract-entities | DISABLED | server/src/entities/routes.ts:311-548 | 237 lines | Returns 410 |
| runEntityExtraction() | DEAD | server/src/pipeline/orchestrator.ts | 10 lines | Returns immediately |
| runAttributeExtraction() | DEAD | server/src/pipeline/orchestrator.ts | 9 lines | Returns immediately |
| runContradictionDetection() | SKIPPED | server/src/pipeline/orchestrator.ts | 8 lines | Runs but legacy |
| EntityStore | ACTIVE | client/src/stores/entityStore.ts | ~300 lines | Used by all entity UI |
| ContradictionStore | ACTIVE | client/src/stores/contradictionStore.ts | ~150 lines | Used by contradiction UI |
| entities table | LEGACY | 004_document_analysis_schema.sql | — | Exists but not written to |
| entity_attributes table | LEGACY | 004_document_analysis_schema.sql | — | Exists but not written to |
| contradictions table | LEGACY | 004_document_analysis_schema.sql | — | Exists, read/written by legacy only |
| knowledge_entities table | ACTIVE | 007_knowledge_entities.sql | — | Written by extract-knowledge |
| knowledge_branch_entities | ACTIVE | 008/012_knowledge_branches.sql | — | Written by extract-knowledge |

---

## Part 12: Risk Assessment

### Safe to Delete (Low Risk)

**Extract-Entities Edge Function** (~400 lines)
- No references in codebase
- Direct replacement exists (extract-knowledge)
- Risk: None — can be deleted immediately

**server/src/entities/extractor.ts** (~306 lines, except if tested)
- Only called by disabled pipeline stage
- Check if there are tests first
- Risk: Medium if tests reference it

**Legacy Pipeline Stages** (~50 lines)
- runEntityExtraction() returns immediately
- runAttributeExtraction() returns immediately
- Risk: Low — just dead code

---

### Requires Migration (Medium Risk)

**Legacy Entity Tables** (entities, entity_mentions, entity_attributes, entity_relations)
- May have existing data
- API still reads from them
- Risk: High if data exists and is needed

**Options:**
1. Keep as backup/archive (no deletion)
2. Migrate data to new schema (complex transformation)
3. Delete data (data loss if needed)

---

### Must Not Touch (Critical)

**Knowledge Layer Tables** — Active production data
- knowledge_entities
- knowledge_entity_aliases
- knowledge_entity_relationships
- knowledge_branch_entities

**Active API Routes** — Used by frontend
- All entity endpoints
- Contradiction endpoints

**Active Services** — Used by routes
- deduplicator.ts (merge logic)
- contradictions.ts (resolve function)

---

## Part 13: Database State Verification Checklist

### Before Proceeding with Cleanup

- [ ] **Verify structured_fields column exists** in knowledge_branch_entities
  - Query: `SELECT column_name FROM information_schema.columns WHERE table_name='knowledge_branch_entities'`
  - If missing: Need ALTER TABLE or new migration 016

- [ ] **Check if legacy tables have data**
  - Query: `SELECT COUNT(*) FROM entities`
  - If > 0: Need migration strategy before deletion

- [ ] **Verify extract-knowledge can write**
  - Check edge function logs for errors
  - Look for "column does not exist" errors

- [ ] **Confirm no client code still reading legacy tables directly**
  - Grep for `from('entities')` in client code
  - Should only be in REST API calls

---

## Part 14: Recommended Cleanup Phases

### Phase 1: Immediate Safe Deletion (No Approval Needed)
**Estimated:** 1-2 hours

- ❌ Delete supabase/functions/extract-entities/ (400 lines)
- ❌ Delete server/src/entities/extractor.ts (306 lines)
- ❌ Delete server/src/entities/attributes.ts (203 lines)
- ❌ Update server/src/entities/index.ts (remove dead exports)
- ❌ Simplify server/src/pipeline/orchestrator.ts (remove disabled stages)
- ✏️ Update server/src/pipeline/types.ts (remove dead constants)

**Total Deletion:** ~1,500 lines

**Risk:** LOW — No active dependencies

**Verification:** Build succeeds, tests pass

---

### Phase 2: API Layer Migration (Requires Architecture Approval)
**Estimated:** 4-6 hours

**Decision Point:** How to bridge REST API to new knowledge_* tables?

**Option A:** Migrate API routes to query knowledge_entities instead of legacy tables
- Pro: Single source of truth
- Con: Must handle Main/Branch layer logic in API

**Option B:** Keep legacy API but sync during extraction
- Pro: Minimal API changes
- Con: Two tables to maintain

**Option C:** Deprecate legacy API, use Edge Functions
- Pro: No server-side API
- Con: Major refactor needed

---

### Phase 3: Legacy Table Archival (Requires Data Decision)

**Decision Point:** What to do with existing entity data?

**Option A:** Keep tables as read-only archive
- Pro: Data preserved, can always migrate later
- Con: Ongoing maintenance burden

**Option B:** Migrate data to new schema
- Pro: Single source of truth
- Con: Complex transformation logic

**Option C:** Delete all legacy data
- Pro: Clean slate
- Con: Data loss

---

## Appendix A: Dead Code Detailed Inventory

### Extract-Entities Edge Function

**File:** supabase/functions/extract-entities/index.ts

**What it does:**
```typescript
1. Receives: batch of document chunks (lines ~50-80)
2. Calls HuggingFace Mistral LLM (lines ~100-150)
3. Parses entity JSON response (lines ~150-200)
4. Inserts to legacy entities table (lines ~220-300)
```

**Why it's dead:**
- No references in codebase
- No route calls it
- No tests reference it
- Replaced by extract-knowledge

**Safe to delete?** YES

---

### Server Extractor

**File:** server/src/entities/extractor.ts

**Functions:**

```typescript
export async function extractEntitiesFromVersion(
  versionId: string,
  projectId: string,
  userId: string
): Promise<ExtractedEntity[]> {
  // Lines 71-107
  // Reads document chunks, calls AI, parses response
  // Never called by pipeline
}

export async function saveExtractedEntities(
  projectId: string,
  userId: string,
  versionId: string,
  entities: ExtractedEntity[]
): Promise<void> {
  // Lines 224-306
  // Saves to legacy tables
  // Never called
}
```

**Safe to delete?** Mostly YES, check if tests reference

---

### Attributes Service

**File:** server/src/entities/attributes.ts

**Functions:**

```typescript
export async function extractAttributesForEntity(
  entityId: string,
  projectId: string
): Promise<ExtractedAttribute[]> {
  // Lines 99-167
  // Extracts attributes for single entity
  // Never called
}

export async function extractAttributesForProject(
  projectId: string
): Promise<Record<string, ExtractedAttribute[]>> {
  // Lines 169-203
  // Extracts attributes for all entities
  // Never called
}
```

**Safe to delete?** YES

---

### Pipeline Disabled Stages

**File:** server/src/pipeline/orchestrator.ts

**Code:**

```typescript
// Lines 347-356
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

// Lines 363-371
async function runAttributeExtraction(_projectId: string): Promise<StageResult> {
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI attribute extraction disabled: active Branch routing is required.',
  }
}
```

**Safe to delete?** YES, simplify pipeline

---

## Appendix B: Active Code That Depends on Legacy Tables

### REST API Routes (server/src/entities/routes.ts)

**Endpoint:** GET /api/projects/:projectId/entities

```typescript
const { data: entities } = await supabase
  .from('entities')
  .select('id, name, entity_type, status, aliases')
  .eq('project_id', projectId)
```

**Endpoint:** GET /api/projects/:projectId/entities/:entityId

```typescript
const { data: entity } = await supabase
  .from('entities')
  .select('*')
  .eq('id', entityId)
  .single()

const { data: mentions } = await supabase
  .from('entity_mentions')
  .select('*')
  .eq('entity_id', entityId)

const { data: attributes } = await supabase
  .from('entity_attributes')
  .select('*')
  .eq('entity_id', entityId)
```

**Endpoint:** PATCH /api/projects/:projectId/entities/:entityId

```typescript
await supabase
  .from('entities')
  .update({ status: body.status, name: body.name })
  .eq('id', entityId)
```

**Endpoint:** POST /api/projects/:projectId/entities/merge

```typescript
const result = await mergeEntities(sourceId, targetId)
// mergeEntities() updates legacy tables
```

**Endpoint:** GET /api/projects/:projectId/contradictions

```typescript
const { data: contradictions } = await supabase
  .from('contradictions')
  .select(`
    id, entity_id, contradiction_type, status,
    entities(name, entity_type),
    entity_attributes(attribute_name, attribute_value)
  `)
```

**Endpoint:** PATCH /api/projects/:projectId/contradictions/:contradictionId

```typescript
await resolveContradiction(contradictionId, status, resolutionNote)
```

---

## Appendix C: Migration 008 vs 012 Detailed Comparison

### knowledge_branches Table

| Aspect | 008 | 012 |
|--------|-----|-----|
| CREATE TABLE IF NOT EXISTS | ✓ | ✓ |
| user_id FK to profiles | ✓ References profiles(id) | ✗ Bare UUID |
| Trigger: deactivate_other_branches | ✓ | ✓ (with DROP IF EXISTS) |
| RLS Policies | Via CREATE POLICY (raw) | Via DO block (safe) |

### knowledge_branch_entities Table

| Aspect | 008 | 012 |
|--------|-----|-----|
| CREATE TABLE IF NOT EXISTS | ✓ | ✓ |
| canonical_name | ✓ | ✓ |
| entity_type | ✓ | ✓ |
| entity_types | ✓ | ✓ |
| description | ✓ | ✓ |
| attributes | ✓ | ✓ |
| **structured_fields** | ✗ MISSING | ✓ PRESENT |
| is_modified | ✓ | ✓ |
| modified_fields | ✓ | ✓ |
| source_entity_id FK | ✓ References knowledge_entities | ✓ References knowledge_entities |
| branch_id FK | ✓ References knowledge_branches | ✓ References knowledge_branches |
| project_id FK | ✓ | ✓ |
| user_id FK | ✓ References profiles | ✗ Bare UUID |

**Critical Difference:** `structured_fields` column

---

## Conclusion

The codebase is maintainable but requires cleanup before Contradiction Detection MVP:

1. **~1,500 lines of safe dead code** can be deleted immediately
2. **Duplicate migration conflict** must be resolved to ensure schema consistency
3. **API layer disconnection** needs architectural decision (Phase 2)
4. **Legacy data** needs decision (keep, migrate, or delete)

No modifications have been made. Awaiting approval to proceed with Phase 1 cleanup.

---

**Report Generated:** 2026-08-20  
**Status:** Ready for Review  
**Next Step:** Awaiting user approval to proceed with cleanup plan
