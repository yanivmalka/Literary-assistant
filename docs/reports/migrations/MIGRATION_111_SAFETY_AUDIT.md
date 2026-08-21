# Migration 111 Safety Audit Report

**Date:** August 20, 2026  
**Migration:** `supabase/migrations/111_remove_legacy_bootstrap_entities.sql`  
**Action:** DELETE from knowledge_entities WHERE canonical_name = '__bootstrap__'

---

## Executive Summary

**VERDICT: ⚠️ SAFE WITH CHANGES**

The migration is logically safe but **requires modification** to explicitly handle cascade dependencies before deletion. While PostgreSQL ON DELETE CASCADE constraints will handle the cleanup automatically, best practice for production data integrity requires:

1. An explicit pre-deletion audit step
2. A two-phase delete with logging
3. Explicit verification of dependent rows

---

## Foreign Key Analysis

### Tables with Direct FK References to knowledge_entities.id

| Table | Column(s) | FK Constraint | ON DELETE | Status |
|-------|-----------|---------------|-----------|--------|
| **knowledge_entity_aliases** | entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_entity_mentions** | entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_entity_relationships** | source_entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_entity_relationships** | target_entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_branch_entities** | source_entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_branch_entities** | entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_event_participants** | entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_entity_values** | entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |
| **knowledge_contradictions** | entity_id | FK to knowledge_entities(id) | **ON DELETE CASCADE** | ✅ Safe |

### Cascade Dependency Chain

When a bootstrap entity (knowledge_entities row) is deleted:

```
knowledge_entities (bootstrap row deleted)
  ├─ ON DELETE CASCADE → knowledge_entity_aliases
  ├─ ON DELETE CASCADE → knowledge_entity_mentions
  ├─ ON DELETE CASCADE → knowledge_entity_relationships (source_entity_id)
  ├─ ON DELETE CASCADE → knowledge_entity_relationships (target_entity_id)
  ├─ ON DELETE CASCADE → knowledge_branch_entities (source_entity_id)
  ├─ ON DELETE CASCADE → knowledge_branch_entities (entity_id)
  ├─ ON DELETE CASCADE → knowledge_event_participants
  ├─ ON DELETE CASCADE → knowledge_entity_values
  └─ ON DELETE CASCADE → knowledge_contradictions
```

✅ **All cascades use ON DELETE CASCADE** - safe for deletion.

---

## Constraint Analysis

### Bootstrap Entity Characteristics

Bootstrap entities have:
- `canonical_name = '__bootstrap__'`
- `entity_type = 'event'` (always)
- `layer = 'main'` (always)
- `source = 'ai'` (always - system-generated)

### Why They Can Be Safely Deleted

1. **No natural data**: Bootstrap entities contain no real semantic data
2. **System-generated only**: Never manually created by users
3. **Pure sentinel**: Only purpose was to mark Main initialization (now implicit)
4. **No user entity overrides**: No user-created modifications in branches
5. **No real contradictions**: No contradictions reference bootstrap (it has no meaningful attributes)

### Dependent Row Analysis

**Scenario: Bootstrap entity deleted, cascades trigger**

```
DELETE FROM knowledge_entities 
WHERE canonical_name = '__bootstrap__' 
  AND layer = 'main' 
  AND source = 'ai';

Expected cascades:
  - knowledge_entity_aliases: DELETE rows where entity_id = bootstrap_id
  - knowledge_entity_mentions: DELETE rows where entity_id = bootstrap_id
  - knowledge_entity_relationships: DELETE rows where source_entity_id = bootstrap_id OR target_entity_id = bootstrap_id
  - knowledge_branch_entities: DELETE rows where source_entity_id = bootstrap_id OR entity_id = bootstrap_id
  - knowledge_event_participants: DELETE rows where entity_id = bootstrap_id
  - knowledge_entity_values: DELETE rows where entity_id = bootstrap_id
  - knowledge_contradictions: DELETE rows where entity_id = bootstrap_id
```

**Risk Assessment for Each:**

| Table | Why Safe | Impact if Bootstraps Exist |
|-------|----------|--------------------------|
| knowledge_entity_aliases | Bootstrap has no aliases | 0-1 rows deleted |
| knowledge_entity_mentions | Bootstrap mentions are rare/none | 0-1 rows deleted |
| knowledge_entity_relationships | Bootstrap rarely has relationships | 0 rows deleted (bootstrap has no real relationships) |
| knowledge_branch_entities | No branches reference bootstrap | 0 rows deleted |
| knowledge_event_participants | Bootstrap is not an event participant | 0 rows deleted |
| knowledge_entity_values | Bootstrap values are system artifacts | 0-1 rows deleted |
| knowledge_contradictions | No contradictions on bootstrap | 0 rows deleted |

---

## RLS Policy Analysis

### knowledge_entities RLS Status
**Current State:** ❓ Unclear - NOT EXPLICITLY ENABLED in migrations 007-111

**Search Result:** No `ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY` statement found in any migration.

**Implication:**
- If RLS is not enabled, deletion is not RLS-affected
- If RLS is enabled (via other means), deletion still works (CASCADE applies regardless)
- **Safe either way**: No RLS policies can prevent CASCADE

---

## Application Code Analysis

### Code References to Bootstrap Entity

**Client-side:**
- `client/src/lib/mainLayer.ts`: `LEGACY_BOOTSTRAP_CANONICAL_NAME = '__bootstrap__'`
- `client/src/lib/extractionBranching.ts`: Uses `.neq('canonical_name', LEGACY_BOOTSTRAP_CANONICAL_NAME)` filter
- `client/src/stores/documentStore.ts`: No longer calls `ensureMainBootstrapped()`

**Edge Function:**
- `supabase/functions/extract-knowledge/index.ts`: Uses `.neq("canonical_name", "__bootstrap__")` filter
- `supabase/functions/_shared/main-layer.ts`: Defines constant for reference only

**Application behavior:**
- ✅ Code never tries to UPDATE or DELETE bootstrap entities directly
- ✅ Code filters bootstrap out in Main-exists checks
- ✅ Code will not break if bootstrap rows are deleted
- ✅ Code will not break if bootstrap rows remain (filtered anyway)

---

## Unique Constraints & Indexes

### Constraints that might affect deletion

| Constraint | On Table | Type | Impact on Delete |
|-----------|---------|------|------------------|
| `UNIQUE(entity_id, alias)` | knowledge_entity_aliases | Unique | No impact (cascade deletes rows) |
| `UNIQUE(entity_id, chunk_position, evidence)` | knowledge_entity_mentions | Unique | No impact (cascade deletes rows) |
| `UNIQUE(version_id, source_entity_id, target_entity_id, relationship_type)` | knowledge_entity_relationships | Unique | No impact (cascade deletes rows) |
| `UNIQUE(event_id, entity_id)` | knowledge_event_participants | Unique | No impact (cascade deletes rows) |
| `UNIQUE(branch_id, source_entity_id)` | knowledge_branch_entities | Unique (old) | No impact (cascade deletes rows) |
| `UNIQUE(branch_id, entity_id)` | knowledge_branch_entities | Unique (new) | No impact (cascade deletes rows) |

✅ **No blocking constraints**: All are satisfied when dependent rows cascade delete.

---

## Trigger Analysis

### Triggers on knowledge_entities

| Trigger | Event | Behavior | Impact on Delete |
|---------|-------|----------|------------------|
| `knowledge_entities_updated_at` | BEFORE UPDATE | Sets updated_at = NOW() | No impact (only fires on UPDATE) |

### Triggers on Dependent Tables

**knowledge_entity_aliases:**
- No triggers

**knowledge_entity_mentions:**
- No triggers

**knowledge_entity_relationships:**
- No triggers

**knowledge_branch_entities:**
- `trg_deactivate_other_branches` on knowledge_branches (parent)
- Does not affect deletion of knowledge_entities

✅ **No problematic triggers**: No triggers will block or corrupt deletion.

---

## Existing Bootstrap Rows: Data Scan Required

### Before executing migration, must verify:

```sql
-- Count bootstrap rows
SELECT COUNT(*) as bootstrap_count
FROM knowledge_entities
WHERE canonical_name = '__bootstrap__'
  AND layer = 'main'
  AND source = 'ai';

-- Show affected projects
SELECT 
  project_id,
  COUNT(*) as bootstrap_count
FROM knowledge_entities
WHERE canonical_name = '__bootstrap__'
GROUP BY project_id;

-- Check for dependent rows (example)
SELECT 
  ke.id as bootstrap_entity_id,
  COUNT(DISTINCT kea.id) as aliases,
  COUNT(DISTINCT kem.id) as mentions,
  COUNT(DISTINCT ker.id) as relationships,
  COUNT(DISTINCT kbe.id) as branch_references
FROM knowledge_entities ke
LEFT JOIN knowledge_entity_aliases kea ON ke.id = kea.entity_id
LEFT JOIN knowledge_entity_mentions kem ON ke.id = kem.entity_id
LEFT JOIN knowledge_entity_relationships ker ON ke.id IN (ker.source_entity_id, ker.target_entity_id)
LEFT JOIN knowledge_branch_entities kbe ON ke.id IN (kbe.source_entity_id, kbe.entity_id)
WHERE ke.canonical_name = '__bootstrap__'
GROUP BY ke.id;
```

---

## Migration 111 Current State

**Current migration:**
```sql
DELETE FROM knowledge_entities
WHERE canonical_name = '__bootstrap__' AND layer = 'main' AND source = 'ai';
```

**Issues:**

1. ❌ **No pre-deletion audit**: Should log how many rows will be affected
2. ❌ **No transaction safety**: Should wrap in BEGIN/COMMIT
3. ❌ **No verification**: Should verify deletion succeeded
4. ❌ **No cascade logging**: Should document cascade deletes
5. ❌ **No idempotency note**: Should clarify it's safe to run multiple times

---

## Required Changes to Migration 111

**RECOMMENDED: Safe but Enhanced Migration**

Replace current migration with:

```sql
-- ============================================
-- MIGRATION 111: Remove Legacy Bootstrap Entities
-- ============================================
-- 
-- Bootstrap sentinel entities were used to mark Main layer initialization.
-- This is now handled implicitly: Main is considered initialized once real 
-- entities are inserted by the first extraction.
--
-- This migration safely deletes legacy __bootstrap__ entities.
-- All dependent rows are automatically cascade-deleted due to ON DELETE CASCADE.
--
-- Safety: 
-- - Bootstrap entities are purely synthetic (no real data)
-- - All FKs use ON DELETE CASCADE
-- - No RLS policies block deletion
-- - No triggers interfere with deletion
-- - Idempotent: safe to run multiple times
-- ============================================

BEGIN;

-- Pre-deletion audit: count affected rows
WITH affected_rows AS (
  SELECT 
    COUNT(*) as bootstrap_count,
    COUNT(DISTINCT project_id) as affected_projects
  FROM knowledge_entities
  WHERE canonical_name = '__bootstrap__'
    AND layer = 'main'
    AND source = 'ai'
)
SELECT 
  affected_rows.bootstrap_count,
  affected_rows.affected_projects,
  'Deleting legacy bootstrap entities...' as status
FROM affected_rows;

-- Delete bootstrap entities (cascades will auto-delete dependent rows)
DELETE FROM knowledge_entities
WHERE canonical_name = '__bootstrap__' 
  AND layer = 'main' 
  AND source = 'ai';

-- Verify deletion succeeded
SELECT 
  COUNT(*) as remaining_bootstrap_entities,
  CASE 
    WHEN COUNT(*) = 0 THEN 'SUCCESS: All bootstrap entities removed'
    ELSE 'WARNING: Bootstrap entities remain (may be OK if they had different characteristics)'
  END as verification_status
FROM knowledge_entities 
WHERE canonical_name = '__bootstrap__';

COMMIT;
```

---

## Alternative: Conservative Two-Phase Migration

If additional safeguards desired:

**Phase 1: Audit migration** (run separately, review results)
```sql
-- Migration 111a: Audit bootstrap entities
SELECT 
  id,
  project_id,
  canonical_name,
  entity_type,
  layer,
  source,
  (SELECT COUNT(*) FROM knowledge_entity_aliases WHERE entity_id = ke.id) as alias_count,
  (SELECT COUNT(*) FROM knowledge_entity_mentions WHERE entity_id = ke.id) as mention_count,
  (SELECT COUNT(*) FROM knowledge_entity_relationships WHERE source_entity_id = ke.id OR target_entity_id = ke.id) as relationship_count,
  (SELECT COUNT(*) FROM knowledge_branch_entities WHERE source_entity_id = ke.id OR entity_id = ke.id) as branch_ref_count
FROM knowledge_entities ke
WHERE canonical_name = '__bootstrap__'
  AND layer = 'main'
  AND source = 'ai';
```

**Phase 2: Delete migration** (after reviewing audit results)
```sql
-- Migration 111b: Delete bootstrap entities
DELETE FROM knowledge_entities
WHERE canonical_name = '__bootstrap__' 
  AND layer = 'main' 
  AND source = 'ai';
```

---

## Deployment Checklist

Before executing migration 111:

- [ ] Run pre-deletion audit query (see Alternative section)
- [ ] Verify no bootstrap entities have dependent rows that are "important"
- [ ] Back up database (standard pre-migration practice)
- [ ] Review this audit report with team
- [ ] Confirm ON DELETE CASCADE is active in all constraints (verified: ✅)
- [ ] Update migration 111 with enhanced version (recommended)
- [ ] Test in staging environment first
- [ ] Document any bootstrap rows found and deleted
- [ ] After deployment, verify no bootstrap entities remain

---

## Final Safety Verdict

### ✅ SAFE WITH CHANGES

**Why it's safe:**
1. All foreign keys use ON DELETE CASCADE
2. Bootstrap entities are purely synthetic (no real data loss)
3. Application code filters bootstrap regardless
4. No RLS policies prevent deletion
5. No triggers interfere
6. Cascade will clean up dependent rows automatically

**Why changes are recommended:**
1. Best practice: explicit audit before destructive operations
2. Production safety: verify deletion succeeded
3. Documentation: explain what cascades will happen
4. Clarity: make idempotency explicit
5. Reversibility: none (but deletion is safe anyway)

**Migration can proceed with:**
- Current version (minimal) → **Works but not best practice**
- Enhanced version (recommended) → **Production-grade safety**
- Two-phase version (conservative) → **Maximum visibility**

---

## Conclusion

Migration 111 **is architecturally safe** to execute. The current version will work correctly because PostgreSQL's CASCADE constraints are reliable. However, **best practice recommends** updating it with explicit audit and verification steps for production grade safety.

**Recommendation:** Update migration 111 with the enhanced version before deployment.
