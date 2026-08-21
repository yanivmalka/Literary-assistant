# Schema Reconciliation Report — v1.4 Phase 2 Verification Gate

**Status:** ❌ BLOCKED — Deployed schema does not match approved contract.

**Verification Date:** August 20, 2026  
**Deployment:** Supabase project `lqfqfzqcrqluxanhnjwu`  
**Repository Branch:** `v1.4/phase-1-cleanup`

---

## Executive Summary

The deployed Supabase database has **multiple material conflicts** with the approved v1.4 Phase 2 Canonical Knowledge Architecture contract:

1. **`knowledge_entities.layer` constraint:** Deployed allows `main|secondary`, approved contract requires `main|branch`.
2. **`knowledge_entities.entity_type` constraint:** Deployed is missing `event` and `magic_ability` types; includes only `character|location|object|ability|organization`.
3. **`contradictions` table structure:** Missing critical columns for Knowledge-native model (`project_id`, `branch_id`, `field_path`, `value_a_id`, `value_b_id`, `dedupe_key`); uses legacy `attribute_a_id|attribute_b_id`.
4. **`contradictions` RLS policies:** Table has RLS enabled but **zero policies**, making it completely inaccessible.
5. **`knowledge_branch_entities` uniqueness:** Deployed uses source-entity-oriented constraints that may conflict with approved overlay model semantics.

**No Phase 2 code, migrations, or schema changes will proceed until these conflicts are resolved and re-verified.**

---

## Reconciliation Table

| Component | Approved Contract | Checked-in Schema | Deployed Schema | Status |
|-----------|-------------------|-------------------|-----------------|--------|
| **`knowledge_entities.layer` CHECK** | `main \| branch` | `main \| branch` | **`main \| secondary`** ❌ | **CONFLICT** |
| **`knowledge_entities.entity_type` CHECK** | `character, location, object, ability, magic_ability, organization, event` | `character, location, object, ability, magic_ability, organization, event` | **`character, location, object, ability, organization`** ❌ (missing `event`, `magic_ability`) | **CONFLICT** |
| **Main entity `branch_id`** | `NULL` | Foreign key constraint `fk_entity_branch_id` | Foreign key constraint `fk_entity_branch_id` ✓ | ✓ PASS |
| **Branch entity `branch_id`** | NOT NULL, FK to `knowledge_branches` | NOT NULL, FK to `knowledge_branches` | NOT NULL, FK to `knowledge_branches` ✓ | ✓ PASS |
| **Branch entity uniqueness** | Compound `(branch_id, entity_id)` supporting overlay model | `UNIQUE(branch_id, source_entity_id)` + `UNIQUE(branch_id, entity_id)` (dual) | `UNIQUE(branch_id, source_entity_id)` + `UNIQUE(branch_id, entity_id)` (dual) | ⚠ DUAL SEMANTICS (requires validation) |
| **Branch entity overlay identity** | `source_entity_id = Main entity ID` (overlay), `entity_id = Main entity ID` (overlay) OR `source_entity_id = NULL`, `entity_id = Branch entity ID` (independent) | Both patterns supported | Both patterns supported | ✓ PASS (if uniqueness semantics allow both) |
| **`contradictions` table exists** | Yes, Knowledge-native model | Yes, but legacy model | Yes, legacy model ✓ | ✓ EXISTS |
| **`contradictions.project_id`** | Required (FK to `projects`) | Required (not yet in migration) | **MISSING** ❌ | **MISSING** |
| **`contradictions.branch_id`** | Optional (NULL for Main, UUID for Branch) | Optional (not yet in migration) | **MISSING** ❌ | **MISSING** |
| **`contradictions.field_path`** | Required (e.g., `age`, `location.name`) | Required (not yet in migration) | **MISSING** ❌ | **MISSING** |
| **`contradictions.value_a_id`** | Required (FK to `knowledge_entity_values.id`) | Required (not yet in migration) | **MISSING** ❌ (uses legacy `attribute_a_id`) | **MISSING** |
| **`contradictions.value_b_id`** | Required (FK to `knowledge_entity_values.id`) | Required (not yet in migration) | **MISSING** ❌ (uses legacy `attribute_b_id`) | **MISSING** |
| **`contradictions.entity_id`** | Required (FK to `knowledge_entities.id`) | Required | Present ✓ | ✓ PASS |
| **`contradictions.contradiction_type`** | `attribute_conflict` only (in v1.4) | `attribute_conflict` only | Deployed allows `attribute_conflict|logical_conflict|temporal_conflict|relationship_conflict` | ⚠ SUPERSET (OK for now, but not used in v1.4) |
| **`contradictions.status`** | `open|resolved_fix_profile|resolved_fix_text|resolved_intentional|ignored` | As approved | Deployed matches ✓ | ✓ PASS |
| **`contradictions.dedupe_key`** | Required (unique within scope) | Required (not yet in migration) | **MISSING** ❌ | **MISSING** |
| **`contradictions` RLS enabled** | Yes, with ownership policies | Yes (pending migration) | **RLS enabled but NO policies** ❌ | **BLOCKED** |
| **`contradictions` SELECT policy** | User can read contradictions they own (via project/branch) | Required (pending migration) | **MISSING** ❌ | **BLOCKED** |
| **`contradictions` INSERT policy** | Only edge function or system can insert | Required (pending migration) | **MISSING** ❌ | **BLOCKED** |
| **`contradictions` UPDATE policy** | Only project/branch owner | Required (pending migration) | **MISSING** ❌ | **BLOCKED** |
| **`contradictions` DELETE policy** | Only project/branch owner | Required (pending migration) | **MISSING** ❌ | **BLOCKED** |

---

## Detailed Conflict Analysis

### 1. Layer Constraint Mismatch

**Approved Contract:**
```sql
layer TEXT NOT NULL DEFAULT 'main' CHECK (layer IN ('main', 'branch'))
```

**Checked-in Migration 007:**
```sql
layer TEXT NOT NULL DEFAULT 'main' CHECK (layer IN ('main', 'branch'))
```

**Deployed Schema (remote catalog):**
```
knowledge_entities_layer_check: (layer = ANY (ARRAY['main'::text, 'secondary'::text]))
```

**Root Cause:**  
Unknown. The deployed database has a different constraint than the checked-in migration. Possible causes:
- Deployed schema was manually modified outside Git.
- Previous migration cycle applied different schema.
- Conflict between migration 007 and 012 or later.

**Impact:**  
- Entities currently in Main layer can be inserted/updated without issue (default = 'main').
- If any existing entities have `layer = 'secondary'`, they will conflict when the constraint is updated.
- The approved architecture depends on `layer = 'branch'` for non-Main entities; the deployed `'secondary'` is a different semantic.

---

### 2. Entity Type Constraint Mismatch

**Approved Contract:**
```sql
entity_type TEXT NOT NULL CHECK (entity_type IN (
  'character', 'location', 'object', 'ability', 'magic_ability', 'organization', 'event'
))
```

**Checked-in Migration 007:**
```sql
entity_type TEXT NOT NULL CHECK (entity_type IN (
  'character', 'location', 'object', 'ability', 'magic_ability', 'organization', 'event'
))
```

**Deployed Schema (remote catalog):**
```
knowledge_entities_entity_type_check: (entity_type = ANY (ARRAY['character'::text, 'location'::text, 'object'::text, 'ability'::text, 'organization'::text]))
```

**Root Cause:**  
The deployed schema has a narrower set of entity types than the approved contract. Missing types:
- `magic_ability` (intended for magical powers/spells)
- `event` (intended for events extracted from documents)

**Impact:**  
- Cannot insert new entities of type `magic_ability` or `event`.
- AI extraction with `extract-knowledge` may fail if Gemini returns those types.
- `knowledge_events` table exists as a separate entity type, but `knowledge_entities` cannot store `event` type.
- Planned v1.5 contradiction detection cannot detect contradictions on `event` entities.

---

### 3. Contradictions Table Structure

**Approved Contract (v1.4 Phase 2):**
```sql
CREATE TABLE knowledge_contradictions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  branch_id UUID REFERENCES knowledge_branches(id),  -- NULL for Main
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id),
  field_path TEXT NOT NULL,  -- e.g. 'age', 'location.name'
  value_a_id UUID NOT NULL REFERENCES knowledge_entity_values(id),
  value_b_id UUID NOT NULL REFERENCES knowledge_entity_values(id),
  contradiction_type TEXT NOT NULL CHECK (contradiction_type = 'attribute_conflict'),
  status TEXT NOT NULL CHECK (status IN (...)),
  resolution_note TEXT,
  dedupe_key TEXT NOT NULL,  -- (project_id, branch_id, entity_id, field_path, normalized_value_a, normalized_value_b)
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  UNIQUE(dedupe_key, project_id, branch_id)
);
```

**Deployed Schema (current):**
```
id UUID PRIMARY KEY
entity_id UUID NOT NULL
attribute_a_id UUID  -- Legacy: references entity_attributes, not values
attribute_b_id UUID  -- Legacy: references entity_attributes, not values
contradiction_type TEXT NOT NULL (allows 4 types, not just 'attribute_conflict')
status TEXT NOT NULL (matches approved)
description TEXT
resolution_note TEXT
created_at TIMESTAMPTZ
resolved_at TIMESTAMPTZ
```

**Critical Missing Columns:**
- ❌ `project_id` — No way to scope contradictions by project; breaks RLS.
- ❌ `branch_id` — Cannot support Main vs Branch contradictions; breaks Main/Branch semantics.
- ❌ `field_path` — Uses legacy `attribute_a_id|attribute_b_id` instead of canonical values; cannot migrate to Knowledge values.
- ❌ `value_a_id` / `value_b_id` — Cannot reference canonical `knowledge_entity_values` (not yet created).
- ❌ `dedupe_key` — Cannot implement repeat-safe detection; duplicate contradictions can accumulate.

**Impact:**  
- The deployed `contradictions` table is **incompatible** with the approved Knowledge-native model.
- Cannot implement repeat-safe detection without `dedupe_key`.
- Cannot support Main vs Branch contradictions without `branch_id`.
- Cannot support RLS without `project_id`.
- Planned detector will write to legacy `contradictions` if it uses the existing schema, creating duplicate data.

---

### 4. Contradictions RLS Policies

**Approved Contract:**
- RLS enabled: Yes
- Policies:
  - SELECT: Users can read contradictions for projects they own.
  - INSERT: Edge functions or system can insert.
  - UPDATE: Users can update contradictions they own.
  - DELETE: Users can delete contradictions they own.

**Deployed Schema:**
```
RLS enabled: true
Policies: (NONE)
```

**Impact:**  
- The deployed table is **completely inaccessible** to all users, including Edge Functions.
- The application cannot read or write contradictions via RLS.
- No way to assign ownership without a `project_id` column.

---

### 5. Branch Entity Uniqueness Semantics

**Deployed Constraints:**
```
UNIQUE(branch_id, source_entity_id)  -- Legacy: one overlay per Main entity
UNIQUE(branch_id, entity_id)         -- Overlay identity: branch entity can reference Main or self
CHECK (source_entity_id IS NOT NULL OR entity_id IS NOT NULL)
```

**Approved Model:**
- Main overlay: `source_entity_id = Main entity ID`, `entity_id = Main entity ID`
- Independent Branch entity: `source_entity_id = NULL`, `entity_id = Branch entity ID`

**Semantic Question:**  
Does the deployed dual-uniqueness constraint correctly prevent duplicates while allowing both patterns?

- Pattern A (Main overlay): `(branch_id, source_entity_id=X, entity_id=X)` — unique on both.
- Pattern B (independent): `(branch_id, source_entity_id=NULL, entity_id=Y)` — unique on second only.
- Duplicate Pattern A: `(branch_id, source_entity_id=X, entity_id=X)` and `(branch_id, source_entity_id=X, entity_id=X)` — blocked by both UNIQUEs ✓
- Duplicate Pattern B: `(branch_id, source_entity_id=NULL, entity_id=Y)` and `(branch_id, source_entity_id=NULL, entity_id=Y)` — blocked by entity_id UNIQUE ✓
- Cross-pattern conflict: `(branch_id, source_entity_id=X, entity_id=X)` and `(branch_id, source_entity_id=NULL, entity_id=X)` — **NOT blocked** ❌

**Verdict:**  
The uniqueness constraints allow a Main overlay and an independent entity to coexist with the same `entity_id`, which violates the approved invariant that each entity ID can appear at most once per branch. This requires investigation and possible constraint revision.

---

## Data Verification Required

Before applying reconciliation migrations, verify:

### Verify `knowledge_entities` data:

```sql
-- Check if any entities have layer = 'secondary'
SELECT COUNT(*) FROM knowledge_entities WHERE layer = 'secondary';

-- Check if any entities have entity_type outside approved set
SELECT DISTINCT entity_type FROM knowledge_entities 
WHERE entity_type NOT IN ('character', 'location', 'object', 'ability', 'magic_ability', 'organization', 'event')
ORDER BY entity_type;

-- Check Main/Branch consistency
SELECT COUNT(*) FROM knowledge_entities 
WHERE (layer = 'branch' AND branch_id IS NULL) 
   OR (layer = 'main' AND branch_id IS NOT NULL);
```

### Verify `knowledge_branch_entities` data:

```sql
-- Check for entities violating the approved invariant (entity_id appears twice per branch)
SELECT branch_id, entity_id, COUNT(*) AS cnt 
FROM knowledge_branch_entities 
WHERE entity_id IS NOT NULL
GROUP BY branch_id, entity_id 
HAVING COUNT(*) > 1;

-- Check for entities with both source_entity_id and entity_id as same value (correct)
SELECT COUNT(*) FROM knowledge_branch_entities 
WHERE source_entity_id = entity_id;

-- Check for independent Branch entities
SELECT COUNT(*) FROM knowledge_branch_entities 
WHERE source_entity_id IS NULL AND entity_id IS NOT NULL;
```

### Verify `contradictions` data:

```sql
-- Count legacy contradictions
SELECT COUNT(*) FROM contradictions;

-- Check if any contradictions reference entities that will be affected by layer/entity_type updates
SELECT COUNT(*) FROM contradictions c 
JOIN knowledge_entities ke ON c.entity_id = ke.id 
WHERE ke.layer = 'secondary' 
   OR ke.entity_type NOT IN ('character', 'location', 'object', 'ability', 'magic_ability', 'organization', 'event');
```

---

## Recommended Reconciliation Steps

### Phase 1: Fix Layer and Entity Type Constraints

**Create Migration `100_fix_layer_entity_type_constraints.sql`:**

1. Verify no entities have `layer = 'secondary'`; if found, plan migration.
2. Update `knowledge_entities` layer CHECK constraint from `main|secondary` to `main|branch`.
3. Update `knowledge_entities` entity_type CHECK constraint to include `magic_ability` and `event`.
4. Ensure existing data remains consistent.

### Phase 2: Enhance Contradictions Table

**Create Migration `101_knowledge_contradictions_enhancement.sql`:**

1. Add `project_id` column (NOT NULL) with FK to `projects`.
2. Add `branch_id` column (nullable) with FK to `knowledge_branches`.
3. Add `field_path` column (TEXT, NOT NULL).
4. Add `value_a_id` column (UUID, not nullable after data migration) with FK to `knowledge_entity_values` (deferred until values table exists).
5. Add `dedupe_key` column (TEXT, NOT NULL).
6. Rename `attribute_a_id` → `legacy_attribute_a_id` (preserve for historical migration later).
7. Rename `attribute_b_id` → `legacy_attribute_b_id` (preserve for historical migration later).
8. Create UNIQUE constraint on `dedupe_key`.

### Phase 3: Add Contradictions RLS Policies

**Create Migration `102_contradictions_rls_policies.sql`:**

1. Create SELECT policy: Users can read contradictions for projects/branches they own.
2. Create INSERT policy: System/Edge functions only.
3. Create UPDATE policy: Users can update contradictions they own.
4. Create DELETE policy: Users can delete contradictions they own.

### Phase 4: Validate Branch Entity Uniqueness Semantics

**Create Migration `103_fix_branch_entity_uniqueness.sql` (if needed):**

1. If data shows conflicts in the approved invariant, decide:
   - Drop one UNIQUE constraint and replace with a more selective constraint.
   - Or add a CHECK constraint to prevent the conflicting pattern.
2. Validate that all existing data remains compliant.

---

## Blockers Remaining Before v1.5 Contradiction Detection

1. ✅ Schema gate: **Must pass before Task #2 begins**.
2. ⚠️  `knowledge_entity_values` table: Not yet created; `value_a_id`/`value_b_id` FKs must be deferred or implemented in Phase 2.
3. ⚠️  RLS policies: Must be deployed before Edge Functions can write contradictions.
4. ⚠️  Repeat-safe dedupe logic: Must be implemented in the detection algorithm.

---

## Next Action

**User decision required:**

1. **Approve the reconciliation steps** above, or provide a revised approach.
2. **Authorize deployment** of reconciliation migrations.
3. **Confirm data** that `layer = 'secondary'` and entity types outside the approved set are safe to migrate.

Once reconciliation is approved and applied, I will:
1. Run reconciliation migrations.
2. Re-run the full catalog verification.
3. Confirm all contract requirements pass.
4. Resume Task #2 implementation.

---

## Verification Methodology

All findings were obtained using the Supabase CLI with read-only `--linked` project access:

```bash
supabase migration list --linked --project-ref lqfqfzqcrqluxanhnjwu
supabase db query --linked "SELECT ... FROM information_schema...."
supabase db query --linked "SELECT ... FROM pg_policies WHERE ..."
```

No temporary database role authentication was required for migration history or remote catalog queries. The RLS policy query succeeded and showed all active Knowledge table policies.

---

