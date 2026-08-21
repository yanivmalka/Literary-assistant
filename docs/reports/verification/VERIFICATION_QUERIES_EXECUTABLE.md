# Controlled Extraction Test - Verification Queries

**Project ID:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Supabase URL:** `https://lqfqfzqcrqluxanhnjwu.supabase.co`  
**Test Document:** `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md`

---

## How to Run These Queries

### Option 1: Supabase Dashboard (Recommended - No Setup Required)

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select the project: `Literary Assistant` 
3. Go to **SQL Editor** 
4. Click **New Query** or **+ Create a new query**
5. Copy and paste each SQL query below
6. Click **Run**
7. Record the results

### Option 2: Command Line (psql)

```bash
# Install PostgreSQL client tools if needed
# macOS: brew install postgresql
# Windows: Download PostgreSQL (includes psql)
# Ubuntu: apt-get install postgresql-client

export PGPASSWORD="<service_role_key>"
psql -h lqfqfzqcrqluxanhnjwu.db.supabase.co \
     -U postgres \
     -d postgres \
     -f VERIFICATION_QUERIES_EXECUTABLE.md
```

### Option 3: Supabase CLI

```bash
# Install: npm install -g supabase
supabase db execute --file VERIFICATION_QUERIES_EXECUTABLE.md
```

---

## SCENARIO 1: CHARACTER FIELDS (Failure #1)

### Query 1.1: Leo Character Entity with Fields

```sql
-- Query 1.1: Character entity with fields
SELECT 
  id as entity_id,
  canonical_name,
  entity_type,
  aliases,
  structured_fields->>'height' as height,
  structured_fields->>'hair_color' as hair_color,
  structured_fields->>'eye_color' as eye_color,
  structured_fields->>'gender' as gender,
  layer,
  branch_id,
  created_at
FROM knowledge_entities
WHERE canonical_name LIKE 'Leo%'
  AND entity_type = 'character'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

-- Expected Result:
-- 1 row with:
--   canonical_name = 'Leo Frostborne'
--   height = '6 feet 2 inches' (or similar)
--   hair_color = 'black'
--   eye_color = 'blue'
--   gender = 'male' (or similar)
--   aliases includes ['Leo']
--   layer = 'main'
--   branch_id = NULL
```

### Query 1.2: Character Entity Values Synced

```sql
-- Query 1.2: Verify character entity values synced
SELECT 
  kev.id,
  kev.field_path,
  kev.value_json,
  kev.source_type,
  kev.value_status,
  ke.canonical_name
FROM knowledge_entity_values kev
JOIN knowledge_entities ke ON kev.entity_id = ke.id
WHERE ke.canonical_name LIKE 'Leo%'
  AND ke.entity_type = 'character'
  AND ke.project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY kev.field_path;

-- Expected: Rows for 'height', 'hair_color', 'eye_color' with source_type='ai'
-- PASS: height, hair_color, eye_color all present with source_type='ai'
-- FAIL: Missing any of these fields or source_type != 'ai'
```

---

## SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3)

### Query 2.1: Ability Entities

```sql
-- Query 2.1: Verify ability entities created
SELECT 
  id as ability_id,
  canonical_name,
  entity_type,
  layer,
  branch_id,
  created_at
FROM knowledge_entities
WHERE entity_type = 'ability'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY canonical_name;

-- Expected: 4 ability rows:
--   - Sword mastery
--   - Hand-to-hand combat
--   - Cold resistance
--   - Physical strength
-- PASS: Exactly 4 abilities with correct names
-- FAIL: Less than 4, or incorrect names
```

### Query 2.2: Character-Ability Relationships (Fix #2)

```sql
-- Query 2.2: Verify character-ability relationships (Fix #2)
-- This is Fix #2: abilities should be RELATIONSHIPS, not attributes
SELECT 
  r.id as relationship_id,
  r.relationship_type,
  ke_source.canonical_name as character_name,
  ke_target.canonical_name as ability_name,
  r.branch_id,
  r.review_status,
  r.created_at
FROM knowledge_entity_relationships r
JOIN knowledge_entities ke_source ON r.source_entity_id = ke_source.id
JOIN knowledge_entities ke_target ON r.target_entity_id = ke_target.id
WHERE r.relationship_type = 'has_ability'
  AND r.project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY character_name, ability_name;

-- Expected: 4 rows linking Leo to each ability
--   character_name: Leo Frostborne
--   ability_name: Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength
-- PASS: 4 relationships with type='has_ability'
-- FAIL: Less than 4 relationships, or wrong types
-- NOTE: This is Fix #2 - relationships should NOT be stored as character.attributes strings
```

### Query 2.3: Cabinet Objects

```sql
-- Query 2.3: Verify object entities (Cabinets)
SELECT 
  id as object_id,
  canonical_name,
  entity_type,
  structured_fields->>'object_type' as object_type,
  structured_fields->>'appearance' as appearance,
  structured_fields->>'materials' as materials,
  structured_fields->>'special_properties' as special_properties,
  layer,
  branch_id,
  created_at
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at;

-- Expected: 2 rows with different materials and special_properties:
--   Row A: materials='wood' or 'wood with magical inscriptions'
--          special_properties includes 'Expanded interior space' or similar
--   Row B: materials='glass'
--          special_properties includes 'Practical storage' or similar
-- PASS: 2 Cabinet rows with clearly different materials (wood vs glass)
-- FAIL: 1 Cabinet (merged incorrectly), 3+ Cabinets (over-fragmented), or materials not different
```

### Query 2.4: Object Materials Values

```sql
-- Query 2.4: Verify object values (materials field specifically)
SELECT 
  e.id as entity_id,
  e.canonical_name,
  e.created_at,
  kev.id as value_id,
  kev.field_path,
  kev.value_json,
  kev.source_type,
  kev.source_extraction_id
FROM knowledge_entities e
LEFT JOIN knowledge_entity_values kev ON e.id = kev.entity_id AND kev.field_path = 'materials'
WHERE e.entity_type = 'object'
  AND e.canonical_name = 'Cabinet'
  AND e.project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY e.created_at, kev.field_path;

-- Expected: 2+ rows (one per Cabinet) with different materials values
-- PASS: Materials values present and different for each Cabinet
-- FAIL: Missing materials, same materials for both, or NULL values
```

---

## SCENARIO 3: CABINET IDENTITY (Failure #4 - CORE FIX)

### Query 3.1: Cabinet Count

```sql
-- Query 3.1: Count Cabinet entities
SELECT 
  COUNT(*) as cabinet_count,
  COUNT(DISTINCT id) as unique_cabinet_ids
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

-- Expected: cabinet_count = 2
-- PASS: cabinet_count = 2
-- FAIL: cabinet_count = 1 (Failure #4 not fixed - two Cabinets incorrectly merged)
-- FAIL: cabinet_count >= 3 (over-fragmentation)
```

### Query 3.2: Cabinet Identities are Truly Separate

```sql
-- Query 3.2: Verify Cabinet identities are truly separate
-- This is the CORE verification for Failure #4
SELECT 
  ke.id,
  ke.canonical_name,
  ke.created_at,
  ke.structured_fields->>'materials' as materials,
  ke.structured_fields->>'appearance' as appearance,
  ke.structured_fields->>'object_type' as object_type,
  (SELECT COUNT(*) FROM knowledge_entity_mentions 
   WHERE entity_id = ke.id) as mention_count,
  (SELECT COUNT(*) FROM knowledge_entity_values 
   WHERE entity_id = ke.id) as field_count
FROM knowledge_entities ke
WHERE ke.entity_type = 'object'
  AND ke.canonical_name = 'Cabinet'
  AND ke.project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY ke.created_at;

-- Expected:
--   Cabinet A: 
--     id = UUID_A (unique)
--     materials = 'wood' or 'wood with magical inscriptions'
--     appearance = 'Ornately carved...' or similar
--     mention_count = 5 (mentioned 5 times in document)
--   Cabinet B: 
--     id = UUID_B (unique, different from UUID_A)
--     materials = 'glass'
--     appearance = 'Small glass cabinet' or similar
--     mention_count = 1 (mentioned 1 time)
--   UUID_A ≠ UUID_B (proof of separate identity - THIS IS THE CORE FIX)

-- PASS: 
--   - Exactly 2 rows
--   - Different materials (wood vs glass)
--   - Different appearances
--   - UUID_A ≠ UUID_B
--   - Cabinet A has 5 mentions, Cabinet B has 1 mention

-- FAIL: 
--   - Only 1 row (merged incorrectly - Failure #4 NOT FIXED)
--   - 3+ rows (over-fragmented)
--   - Same materials or appearance
--   - UUID_A = UUID_B (should never happen)
--   - Wrong mention counts
```

### Query 3.3: No Duplicates with Same Materials

```sql
-- Query 3.3: Verify no duplicates with same materials
SELECT 
  COUNT(DISTINCT id) as unique_cabinets,
  structured_fields->>'materials' as materials,
  COUNT(*) as count_with_this_material
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY materials;

-- Expected:
--   1 row with materials='wood' (unique_cabinets=1)
--   1 row with materials='glass' (unique_cabinets=1)

-- PASS: 
--   - 2 group rows (one wood, one glass)
--   - Each group has unique_cabinets=1 (no duplicates)

-- FAIL: 
--   - More than 2 groups
--   - Any group with unique_cabinets > 1 (duplicates with same material)
--   - Missing wood or glass
```

---

## SCENARIO 4: MAIN / BRANCH ISOLATION

### Query 4.1: Layer Distribution

```sql
-- Query 4.1: Verify first extraction bootstrapped Main layer
SELECT 
  layer,
  COUNT(*) as entity_count,
  COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as main_entities,
  COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as branch_scoped,
  entity_type,
  COUNT(DISTINCT entity_type) as type_count
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY layer, entity_type
ORDER BY layer, entity_type;

-- Expected (First extraction only):
--   layer='main': 
--     entity_count = 7 (1 Leo + 2 Cabinets + 4 abilities)
--     main_entities = 7 (all branch_id = NULL)
--     branch_scoped = 0
--   (no layer='branch' rows)

-- PASS: 
--   - Only layer='main' present
--   - 7 total entities
--   - All branch_id = NULL

-- FAIL: 
--   - layer='branch' present (bootstrapping failed)
--   - branch_id set on Main layer (isolation broken)
--   - Count != 7
```

### Query 4.2: Branch Overlays on First Extraction

```sql
-- Query 4.2: Verify no overlays created on first extraction
SELECT 
  COUNT(*) as branch_overlay_count,
  COUNT(CASE WHEN source_entity_id IS NOT NULL THEN 1 END) as overlays_with_source,
  COUNT(CASE WHEN source_entity_id IS NULL THEN 1 END) as independent_branch_entities
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

-- Expected (First extraction): 0 overlays
-- PASS: branch_overlay_count = 0
-- FAIL: branch_overlay_count > 0 (overlays created before second extraction)
```

### Query 4.3: Main Entity Identities (Pre-Second Extraction)

```sql
-- Query 4.3: Main entity identities (save these UUIDs for comparison after second extraction)
SELECT 
  id,
  canonical_name,
  entity_type,
  layer,
  branch_id,
  created_at
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND layer = 'main'
ORDER BY canonical_name, entity_type;

-- Expected: 7 Main entities
--   1. Leo Frostborne (character)
--   2. Cabinet (object) - wood
--   3. Cabinet (object) - glass
--   4-7. 4 abilities (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)

-- PASS: 7 entities with these names
-- FAIL: Wrong count or names

-- NOTE: Save all IDs for comparison after second extraction
-- After second extraction, these same UUIDs should still exist with layer='main'
```

### Query 4.4: Entity Count Summary

```sql
-- Query 4.4: Synthesis - entity count and distribution
SELECT 
  entity_type,
  COUNT(*) as count,
  COUNT(DISTINCT layer) as layer_count,
  COUNT(CASE WHEN layer='main' THEN 1 END) as main_count,
  COUNT(CASE WHEN layer='branch' THEN 1 END) as branch_count,
  COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as null_branch_ids
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY entity_type
ORDER BY entity_type;

-- Expected summary:
--   character: count=1, main_count=1, branch_count=0, null_branch_ids=1
--   ability: count=4, main_count=4, branch_count=0, null_branch_ids=4
--   object: count=2, main_count=2, branch_count=0, null_branch_ids=2

-- PASS: All values match expected
-- FAIL: Any deviation from expected
```

---

## SYNTHESIS: PASS/FAIL DETERMINATION

### Verification Checklist

```sql
-- COMPREHENSIVE VERIFICATION CHECKLIST
-- Run each section and mark PASS/FAIL based on query results

-- SCENARIO 1 (Character Fields):
-- PASS if:
--   ✓ Query 1.1: Leo entity exists with populated height, hair_color, eye_color
--   ✓ Query 1.2: Values synced in knowledge_entity_values table
-- FAIL if:
--   ✗ Leo entity missing
--   ✗ Fields NULL
--   ✗ No value records

-- SCENARIO 2 (Abilities & Objects):
-- PASS if:
--   ✓ Query 2.1: 4 ability entities created
--   ✓ Query 2.2: 4 character→ability relationships (Fix #2)
--   ✓ Query 2.3: 2 Cabinet objects with different materials
--   ✓ Query 2.4: Materials values present and different
-- FAIL if:
--   ✗ < 4 abilities
--   ✗ No has_ability relationships
--   ✗ != 2 Cabinets
--   ✗ Same materials for both Cabinets

-- SCENARIO 3 (Cabinet Identity - CORE FIX):
-- PASS if:
--   ✓ Query 3.1: cabinet_count = 2 (not 1, not 3+)
--   ✓ Query 3.2: Two UUIDs, one wood (5 mentions), one glass (1 mention)
--   ✓ Query 3.3: No duplicates with same materials
-- FAIL if:
--   ✗ cabinet_count = 1 (Failure #4 not fixed)
--   ✗ cabinet_count >= 3 (over-fragmentation)
--   ✗ UUID_A = UUID_B (should be different)
--   ✗ Wrong mention counts

-- SCENARIO 4 (Main/Branch Isolation):
-- PASS if:
--   ✓ Query 4.1: All layer='main', all branch_id=NULL
--   ✓ Query 4.2: branch_overlay_count = 0
--   ✓ Query 4.3: 7 Main entities with correct names
--   ✓ Query 4.4: Distribution matches expected
-- FAIL if:
--   ✗ layer='branch' present
--   ✗ branch_id set on Main layer
--   ✗ branch_overlay_count > 0
--   ✗ Count != 7

-- OVERALL:
-- ✓ PASS if: All 4 scenarios pass
-- ✗ FAIL if: Any scenario fails
```

---

## Final Diagnostic Summary

```sql
-- QUICK DIAGNOSTIC: Run this to see consolidated results
WITH scenario_1 AS (
  SELECT 
    'SCENARIO_1_LEO_FIELDS' as diagnostic,
    COUNT(*)::text as result,
    'Expected: 1' as note
  FROM knowledge_entities 
  WHERE canonical_name LIKE 'Leo%' 
    AND entity_type='character' 
    AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
),
scenario_2a AS (
  SELECT 
    'SCENARIO_2_ABILITIES' as diagnostic,
    COUNT(*)::text as result,
    'Expected: 4' as note
  FROM knowledge_entities 
  WHERE entity_type='ability' 
    AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
),
scenario_2b AS (
  SELECT 
    'SCENARIO_2_CABINETS' as diagnostic,
    COUNT(*)::text as result,
    'Expected: 2' as note
  FROM knowledge_entities 
  WHERE entity_type='object' 
    AND canonical_name='Cabinet'
    AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
),
scenario_2c AS (
  SELECT 
    'SCENARIO_2_RELATIONSHIPS' as diagnostic,
    COUNT(*)::text as result,
    'Expected: 4 (Fix #2)' as note
  FROM knowledge_entity_relationships 
  WHERE relationship_type='has_ability'
    AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
),
scenario_4a AS (
  SELECT 
    'SCENARIO_4_MAIN_LAYER' as diagnostic,
    COUNT(*)::text as result,
    'Expected: 7' as note
  FROM knowledge_entities 
  WHERE layer='main' 
    AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
),
scenario_4b AS (
  SELECT 
    'SCENARIO_4_BRANCH_OVERLAYS' as diagnostic,
    COUNT(*)::text as result,
    'Expected: 0 (first extraction)' as note
  FROM knowledge_branch_entities 
  WHERE source_entity_id IS NOT NULL
    AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
)
SELECT * FROM scenario_1
UNION ALL SELECT * FROM scenario_2a
UNION ALL SELECT * FROM scenario_2b
UNION ALL SELECT * FROM scenario_2c
UNION ALL SELECT * FROM scenario_4a
UNION ALL SELECT * FROM scenario_4b
ORDER BY diagnostic;
```

---

## How to Interpret Results

### Example PASS Results:
```
SCENARIO_1_LEO_FIELDS              | 1   | Expected: 1
SCENARIO_2_ABILITIES               | 4   | Expected: 4
SCENARIO_2_CABINETS                | 2   | Expected: 2
SCENARIO_2_RELATIONSHIPS           | 4   | Expected: 4 (Fix #2)
SCENARIO_4_MAIN_LAYER              | 7   | Expected: 7
SCENARIO_4_BRANCH_OVERLAYS         | 0   | Expected: 0 (first extraction)
```
✅ **ALL TESTS PASS** - Controlled extraction test successful

### Example FAIL Results:
```
SCENARIO_1_LEO_FIELDS              | 0   | Expected: 1              ❌ FAIL
SCENARIO_2_CABINETS                | 1   | Expected: 2              ❌ FAIL (Merged)
SCENARIO_4_BRANCH_OVERLAYS         | 3   | Expected: 0              ❌ FAIL
```
❌ **TESTS FAILED** - Issues detected in controlled extraction

---

## Notes for Tester

1. **Run queries in order** - Scenario 1 → 4 for full verification
2. **Record ALL results** - Screenshot or copy-paste into results file
3. **Check materials specifically** - Query 3.2 is critical for Failure #4 (Cabinet identity)
4. **Verify UUIDs match** - Cabinet A and Cabinet B should have different `id` values
5. **If tests fail** - Use the detailed queries to isolate which specific issue occurred
6. **Save diagnostic summary** - The "Quick Diagnostic" query at the end shows at-a-glance results

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Project ID not found" | Verify project exists using Query 4.3 first |
| "No entities found" | Extraction may not have run - check if document was processed |
| "1 Cabinet instead of 2" | Failure #4 bug detected - two Cabinets incorrectly merged |
| "3+ Cabinets" | Over-fragmentation - entities split when should be consolidated |
| "leo_entity_id" is NULL | Leo entity missing - character extraction failed |
| Values are NULL | Entity values not synced - check knowledge_entity_values table |

