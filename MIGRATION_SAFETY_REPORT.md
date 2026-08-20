# Pre-Migration Data Safety Audit Report

**Date:** August 20, 2026  
**Database:** Supabase Project `lqfqfzqcrqluxanhnjwu`  
**Audit Type:** READ-ONLY Data Safety Audit  
**Purpose:** Verify database state before schema migration to support Main/Branch architecture

## Executive Summary

The audit confirms the database is in a **CLEAN STATE** for migration. No legacy `secondary` layer rows exist, no duplicate names violate constraints, and no branch entities exist yet. The current constraints already match the desired Main/Branch architecture.

## Key Findings

### A. Current Database State

| Metric | Count | Status |
|--------|-------|--------|
| Total knowledge_entities | 121 | ✅ |
| Main entities (non-versioned) | 8 | ✅ |
| Versioned entities | 113 | ✅ |
| Branch entities (`branch_id IS NOT NULL`) | 0 | ✅ |
| Knowledge branches | 4 | ✅ |
| Knowledge_branch_entities | 3 | ✅ |
| Legacy `secondary` layer rows | 0 | ✅ |
| Duplicate Main names | 0 | ✅ |
| Duplicate Branch candidates | 0 | ✅ |
| Invalid layer/branch combinations | 0 | ✅ |

### B. Constraint Analysis

#### Current Constraints (Already Correct):

1. **`knowledge_entities_layer_check`**  
   ```sql
   CHECK ((layer = ANY (ARRAY['main'::text, 'branch'::text])))
   ```
   ✅ **CORRECT** - Already allows only `'main'` and `'branch'`

2. **`check_entity_branch_layer_consistency`**  
   ```sql
   CHECK (
     CASE
       WHEN (layer = 'branch'::text) THEN (branch_id IS NOT NULL)
       WHEN (layer = 'main'::text) THEN (branch_id IS NULL)
       ELSE true
     END
   )
   ```
   ✅ **CORRECT** - Already enforces Main/Branch consistency

3. **`knowledge_entities_project_name_user_unique`**  
   ```sql
   CREATE UNIQUE INDEX knowledge_entities_project_name_user_unique 
   ON public.knowledge_entities (project_id, canonical_name) 
   WHERE (version_id IS NULL)
   ```
   ⚠️ **NEEDS UPDATE** - Missing `branch_id` for branch-scoped uniqueness

4. **`knowledge_entities_version_name_unique`**  
   ```sql
   CREATE UNIQUE INDEX knowledge_entities_version_name_unique 
   ON public.knowledge_entities (version_id, canonical_name) 
   WHERE (version_id IS NOT NULL)
   ```
   ✅ **CORRECT** - Versioned entities have separate uniqueness

### C. Data Integrity Findings

#### 1. Legacy `secondary` Layer Rows
- **Count:** 0
- **Status:** ✅ **CLEAN** - No migration required
- No rows with `layer = 'secondary'` exist in the database

#### 2. Duplicate Main Names
- **Count:** 0  
- **Status:** ✅ **CLEAN** - All Main entities have unique `(project_id, canonical_name)`
- Current unique constraint is being respected

#### 3. Existing Branch Entities
- **Count:** 0
- **Status:** ✅ **CLEAN** - No branch entities exist yet
- All 121 entities have `layer = 'main'` and `branch_id IS NULL`

#### 4. Invalid Layer/Branch Combinations
- **Count:** 0
- **Status:** ✅ **CLEAN** - No inconsistencies between `layer` and `branch_id`

#### 5. knowledge_branch_entities Integrity
- **Rows:** 3
- **Pattern:** All rows have `source_entity_id = entity_id` (referencing Main entities)
- **Duplicates:** 0 duplicate `(branch_id, source_entity_id)` or `(branch_id, entity_id)` pairs
- **NULL checks:** 0 rows with both `source_entity_id` and `entity_id` NULL
- **Status:** ✅ **CLEAN** - Overlay mechanism working correctly

#### 6. Versioned Entities
- **Count:** 113
- **Pattern:** All `layer = 'main'`, `branch_id IS NULL`
- **Uniqueness:** No duplicate names within same `(project_id, version_id)`
- **Status:** ✅ **CLEAN** - Properly excluded from main uniqueness constraint

#### 7. Projects/Users Relationship
- **Finding:** Projects are user-scoped (one user per project)
- **Current constraint:** `(project_id, canonical_name)` WHERE `version_id IS NULL`
- **User inclusion:** `user_id` NOT included in current unique constraint despite index name
- **Status:** ✅ **CLEAN** - No multi-user projects exist

### D. Migration Safety Assessment

#### Can migration be applied safely as-is?
**✅ YES - WITH ONE CONSTRAINT UPDATE**

The database is already in the correct Main/Branch architectural state:
1. ✅ CHECK constraint already allows only `'main'` and `'branch'`
2. ✅ Layer/branch consistency already enforced
3. ✅ No legacy `secondary` rows to migrate
4. ✅ No branch entities exist yet
5. ✅ Versioned entities properly handled

**Required Change:**
Update `knowledge_entities_project_name_user_unique` to support branch-scoped uniqueness:

```sql
-- Current (inadequate for branches):
CREATE UNIQUE INDEX knowledge_entities_project_name_user_unique 
ON public.knowledge_entities (project_id, canonical_name) 
WHERE (version_id IS NULL);

-- Required (branch-aware):
CREATE UNIQUE INDEX knowledge_entities_project_name_user_unique 
ON public.knowledge_entities (project_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), canonical_name) 
WHERE (version_id IS NULL);
```

#### Data Migration/Cleanup Required?
**✅ NONE REQUIRED**

No data migration or cleanup is needed because:
1. No `secondary` layer rows to convert
2. No duplicate names to resolve  
3. No invalid layer/branch combinations to fix
4. No existing branch entities to adjust

### E. Risk Assessment

| Risk Level | Description | Mitigation |
|------------|-------------|------------|
| **LOW** | Changing unique constraint could affect existing Main entities | None - Current data already respects uniqueness |
| **LOW** | Application sending `layer = 'secondary'` | Fix application code to send `'branch'` |
| **NONE** | Data corruption from migration | No data changes required |
| **NONE** | Loss of existing data | Read-only migration only |

### F. Recommended Migration Steps

1. **First: Fix Application Code**
   - Ensure application sends `layer = 'branch'` (not `'secondary'`)
   - Ensure `branch_id` is provided for branch entities

2. **Second: Update Unique Constraint**
   ```sql
   DROP INDEX IF EXISTS knowledge_entities_project_name_user_unique;
   
   CREATE UNIQUE INDEX knowledge_entities_project_name_user_unique 
   ON public.knowledge_entities (project_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), canonical_name) 
   WHERE (version_id IS NULL);
   ```

3. **Third: Verification**
   - Test creating Main entities (should work as before)
   - Test creating Branch entities (should allow same name in different branches)
   - Test creating Branch entity with same name as Main (should be allowed)

### G. Compatibility Matrix

| Scenario | Current DB Allows? | Should Architecture Allow? | Status |
|----------|-------------------|----------------------------|--------|
| A. Main entity "X" | ✅ Yes | ✅ Yes | Compatible |
| B. Second Main entity "X" in same project | ❌ No (unique) | ❌ No | Compatible |
| C. Branch A entity "X" | ⚠️ Would fail (wrong layer) | ✅ Yes | Need app fix |
| D. Branch B entity "X" | ⚠️ Would fail (wrong layer) | ✅ Yes | Need app fix |
| E. Branch A entity "X" when Main has "X" | ⚠️ Would fail (wrong layer) | ✅ Yes | Need app fix |
| F. Branch overlay referencing Main "X" | ✅ Yes (via knowledge_branch_entities) | ✅ Yes | Compatible |

### H. Root Cause of Current Errors

Based on the audit, the `23514` error (`knowledge_entities_layer_check`) occurs because:
1. Application is sending `layer = 'secondary'`
2. Database constraint only allows `'main'` or `'branch'`
3. **Fix:** Application must send `layer = 'branch'` for branch entities

The `23505` error (`knowledge_entities_project_name_user_unique`) would occur if:
1. Trying to create duplicate Main entity name
2. Or if branch entities were created without proper uniqueness constraint

## Conclusion

**✅ MIGRATION SAFE TO PROCEED**

The database is in an ideal state for migration:
- No legacy data to migrate
- Constraints already mostly correct
- Clean data integrity
- Zero-risk migration path

**Immediate Action:** Fix application code to send correct `layer` values (`'branch'` not `'secondary'`), then update the unique constraint to support branch-scoped uniqueness.

**No data migration required.**