-- CONTROLLED EXTRACTION VERIFICATION QUERIES
-- Run these queries after executing the extraction on ../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md
-- Date: August 20, 2026
-- Commit: 8597629
-- Test Project ID: 6c4b7b92-214a-4785-ad66-e62527ee68d6

-- ============================================================================
-- SCENARIO 1: CHARACTER FIELDS (Failure #1 Verification)
-- ============================================================================
-- Expected: Leo Frostborne with populated height, hair_color, eye_color
-- If FAILS: fields are NULL or missing

-- Query 1.1: Verify Leo character entity
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
--   gender = 'male'
--   aliases includes ['Leo']
--   layer = 'main'
--   branch_id = NULL

-- Query 1.2: Verify character entity values synced
SELECT 
  field_path,
  value_json,
  source_type,
  value_status
FROM knowledge_entity_values
WHERE entity_id IN (
  SELECT id FROM knowledge_entities 
  WHERE canonical_name LIKE 'Leo%'
    AND entity_type = 'character'
    AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
)
ORDER BY field_path;

-- Expected: Rows for 'height', 'hair_color', 'eye_color' with source_type='ai'

-- Query 1.3: UI Verification (simulated)
-- In app UI, navigate to Leo character card
-- Expected: All fields displayed (not showing "לא ידוע"/unknown)

-- ============================================================================
-- SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3 Verification)
-- ============================================================================

-- Query 2.1: Verify ability entities created
SELECT 
  id as ability_id,
  canonical_name,
  entity_type,
  layer,
  branch_id
FROM knowledge_entities
WHERE entity_type = 'ability'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY canonical_name;

-- Expected: 4 ability rows:
--   - Sword mastery
--   - Hand-to-hand combat
--   - Cold resistance
--   - Physical strength

-- Query 2.2: Verify character-ability relationships (Fix #2)
SELECT 
  r.relationship_type,
  (SELECT canonical_name FROM knowledge_entities WHERE id = r.source_entity_id) as character_name,
  (SELECT canonical_name FROM knowledge_entities WHERE id = r.target_entity_id) as ability_name,
  r.branch_id,
  r.review_status
FROM knowledge_entity_relationships r
WHERE r.relationship_type = 'has_ability'
  AND r.project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY character_name, ability_name;

-- Expected: 4 rows linking Leo to each ability with type='has_ability'
-- Note: This is Fix #2 - abilities should NOT be in character.attributes as strings

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
  branch_id
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at;

-- Expected: 2 rows with different materials and special_properties:
--   Row A: materials='wood' (or 'wood with magical inscriptions')
--          special_properties includes 'Expanded interior space'
--   Row B: materials='glass'
--          special_properties includes 'Practical storage'

-- Query 2.4: Verify object values (materials field specifically)
SELECT 
  e.canonical_name,
  e.id,
  kev.field_path,
  kev.value_json,
  kev.source_type
FROM knowledge_entities e
LEFT JOIN knowledge_entity_values kev ON e.id = kev.entity_id AND kev.field_path = 'materials'
WHERE e.entity_type = 'object'
  AND e.canonical_name = 'Cabinet'
  AND e.project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY e.created_at;

-- Expected: Two rows with different materials values

-- ============================================================================
-- SCENARIO 3: REPEATED ENTITY / CABINET IDENTITY (Failure #4 Verification)
-- ============================================================================
-- Core requirement: Same Cabinet mentioned 5 times → ONE UUID
--                  Different Cabinet (glass) → DIFFERENT UUID

-- Query 3.1: Count Cabinet entities
SELECT 
  COUNT(*) as cabinet_count
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

-- Expected: 2 (not 1, not 3+)
-- If result is 1: Failure #4 not fixed (two Cabinets incorrectly merged)
-- If result is 3+: Over-fragmentation

-- Query 3.2: Verify Cabinet identities are truly separate
SELECT 
  id,
  canonical_name,
  structured_fields->>'materials' as materials,
  structured_fields->>'appearance' as appearance,
  (SELECT COUNT(*) FROM knowledge_entity_mentions 
   WHERE entity_id = knowledge_entities.id) as mention_count
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at;

-- Expected:
--   Cabinet A: id=UUID_A, materials='wood', mention_count=5
--   Cabinet B: id=UUID_B, materials='glass', mention_count=1
--   UUID_A ≠ UUID_B (proof of separate identity)

-- Query 3.3: Verify no duplicates with same materials
SELECT 
  COUNT(DISTINCT id) as unique_cabinets,
  structured_fields->>'materials' as materials
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY materials;

-- Expected:
--   1 row with materials='wood'
--   1 row with materials='glass'
--   (Not 2 rows for wood = that would indicate failed consolidation)

-- ============================================================================
-- SCENARIO 4: MAIN / BRANCH ISOLATION (Failure #4 Architecture Verification)
-- ============================================================================

-- Query 4.1: Verify first extraction bootstrapped Main layer
SELECT 
  layer,
  COUNT(*) as entity_count,
  COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as main_entities,
  COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as branch_scoped
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY layer;

-- Expected (First extraction only):
--   layer='main', entity_count=7 (Leo + 2 Cabinets + 4 abilities), branch_id all NULL
--   layer='branch', entity_count=0 (none yet)

-- Query 4.2: Verify no overlays created on first extraction
SELECT COUNT(*) as branch_overlay_count
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND source_entity_id IS NOT NULL;

-- Expected (First extraction): 0
-- If > 0: Overlays incorrectly created before second extraction

-- Query 4.3: Verify Main entity UUIDs unchanged (if second extraction runs)
-- Run before second extraction, save results
SELECT 
  id,
  canonical_name,
  entity_type,
  created_at
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND layer = 'main'
ORDER BY canonical_name;

-- Expected: Save these UUIDs for comparison after second extraction
-- After second extraction, same UUIDs should exist

-- Query 4.4: Branch overlay structure (if second extraction runs)
SELECT 
  branch_id,
  source_entity_id,
  entity_id,
  (source_entity_id = entity_id) as is_overlay,
  is_modified,
  modified_fields
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY branch_id, source_entity_id;

-- Expected:
--   All rows: source_entity_id references existing Main entity UUID
--   is_overlay=TRUE when source_entity_id = entity_id
--   is_overlay=FALSE when independent Branch entity

-- ============================================================================
-- SYNTHESIS: PASS/FAIL DETERMINATION
-- ============================================================================

-- Query S.1: Overall entity count and distribution
SELECT 
  entity_type,
  COUNT(*) as count,
  COUNT(DISTINCT layer) as layer_count,
  COUNT(CASE WHEN layer='main' THEN 1 END) as main_count,
  COUNT(CASE WHEN layer='branch' THEN 1 END) as branch_count
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY entity_type
ORDER BY entity_type;

-- Expected summary:
--   character: count=1 (Leo), main_count=1, branch_count=0
--   ability: count=4 (4 abilities), main_count=4, branch_count=0
--   object: count=2 (2 Cabinets), main_count=2, branch_count=0

-- Query S.2: Verification checklist
-- PASS/FAIL determination based on query results
/*
SCENARIO 1 (Character Fields):
  ✓ PASS if: Leo entity exists, height/hair_color/eye_color populated, values synced
  ✗ FAIL if: Leo missing, fields NULL, no value records

SCENARIO 2 (Abilities & Objects):
  ✓ PASS if: 4 ability entities created, 4 character→ability relationships, 2 Cabinet objects
  ✗ FAIL if: < 4 abilities, no has_ability relationships, != 2 Cabinets

SCENARIO 3 (Cabinet Identity):
  ✓ PASS if: 2 Cabinet UUIDs, one wood + one glass, 5 mentions for wood Cabinet
  ✗ FAIL if: 1 Cabinet (merged incorrectly), materials lost, uuid_a = uuid_b

SCENARIO 4 (Main/Branch):
  ✓ PASS if: All entities layer='main' in first extraction, branch_id=NULL, no overlays
  ✗ FAIL if: layer='branch' present, branch_id set, overlays without reason

OVERALL:
  ✓ PASS if: All 4 scenarios pass
  ✗ FAIL if: Any scenario fails
*/

-- ============================================================================
-- DIAGNOSTIC OUTPUT
-- ============================================================================
-- Run this final query to see consolidated results
SELECT 
  'SCENARIO_1_LEO_FIELDS' as diagnostic,
  (SELECT COUNT(*) FROM knowledge_entities 
   WHERE canonical_name LIKE 'Leo%' AND entity_type='character' 
     AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6')::text as result,
  'Expected: 1' as note
UNION ALL
SELECT 
  'SCENARIO_2_ABILITIES',
  (SELECT COUNT(*) FROM knowledge_entities 
   WHERE entity_type='ability' 
     AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6')::text,
  'Expected: 4'
UNION ALL
SELECT 
  'SCENARIO_2_OBJECTS',
  (SELECT COUNT(*) FROM knowledge_entities 
   WHERE entity_type='object' AND canonical_name='Cabinet'
     AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6')::text,
  'Expected: 2'
UNION ALL
SELECT 
  'SCENARIO_2_RELATIONSHIPS',
  (SELECT COUNT(*) FROM knowledge_entity_relationships 
   WHERE relationship_type='has_ability'
     AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6')::text,
  'Expected: 4 (Fix #2)'
UNION ALL
SELECT 
  'SCENARIO_4_MAIN_LAYER',
  (SELECT COUNT(*) FROM knowledge_entities 
   WHERE layer='main' 
     AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6')::text,
  'Expected: 7'
UNION ALL
SELECT 
  'SCENARIO_4_BRANCH_OVERLAYS',
  (SELECT COUNT(*) FROM knowledge_branch_entities 
   WHERE source_entity_id IS NOT NULL
     AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6')::text,
  'Expected: 0 (first extraction)'
ORDER BY diagnostic;
