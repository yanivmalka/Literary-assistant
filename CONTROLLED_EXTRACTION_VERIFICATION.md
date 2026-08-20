# Controlled Extraction Verification Protocol

**Date:** August 20, 2026  
**Commit:** 8597629  
**Test Project:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Test Document:** CONTROLLED_TEST_DOCUMENT.md (6 parts, Cabinet identity scenario)  

---

## Verification Plan

This document outlines the step-by-step verification of the four critical fixes using real extraction data.

### Prerequisites
- Supabase project linked and accessible via CLI
- App UI with authentication available
- Extract-knowledge Edge Function deployed
- Test project and document ready

---

## STEP 1: Capture Raw LLM Response

**Objective:** Obtain the actual Gemini JSON output for the test document

**Method A: Via App UI**
1. Open the Literary Assistant app
2. Navigate to test project: `6c4b7b92-214a-4785-ad66-e62527ee68d6`
3. Open test document
4. Click "Extract Knowledge" or "Run Extraction"
5. Wait for completion
6. Open browser DevTools → Network tab
7. Look for request to Edge Function: `extract-knowledge`
8. In response body, find the `raw_response` JSON
9. Save to file: `CONTROLLED_TEST_LLM_RESPONSE.json`

**Method B: Via Supabase Dashboard**
1. Open Supabase dashboard
2. Navigate to SQL Editor
3. Run query:
```sql
SELECT 
  id as extraction_id,
  raw_response,
  model,
  chunks_count,
  created_at
FROM raw_extractions
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at DESC
LIMIT 1;
```
4. Copy `raw_response` JSON and save to file

---

## STEP 2: Verify Four Scenarios

### Scenario 1: CHARACTER FIELDS

**Expected LLM Output:**
```json
{
  "characters": [
    {
      "name": "Leo Frostborne",
      "aliases": ["Leo", "Leonardo Frostborne"],
      "age": null,
      "gender": "male",
      "height": "6 feet 2 inches",
      "hair_color": "black",
      "eye_color": "blue",
      "tattoos": "Wolf on left shoulder",
      "abilities": ["Sword mastery", "Hand-to-hand combat", "Cold resistance"],
      "description": "A human fighter known for exceptional strength"
    }
  ]
}
```

**Data Flow Trace:**

| Stage | What Happens | Expected Data |
|-------|--------------|----------------|
| **LLM Output** | Gemini returns raw_response JSON | height="6 feet 2 inches", hair_color="black", eye_color="blue" |
| **Normalize** | buildStructuredFields() extracts fields | structured_fields = {height, hair_color, eye_color, ...} |
| **Consolidate** | Leo + Leo Frostborne → one entity | canonical_name="Leo Frostborne", aliases=["Leo"] |
| **UUID Resolve** | Entity gets unique ID | entityId = UUID |
| **DB Persist** | knowledge_entities row created | structured_fields column contains all fields |
| **Values Sync** | syncEntityValues() creates value records | knowledge_entity_values rows for height, hair_color, eye_color |
| **Branch View** | UI queries for display | Character shows: Height=6'2", Hair=black, Eyes=blue |

**Verification Query:**
```sql
SELECT 
  id,
  canonical_name,
  entity_type,
  structured_fields,
  attributes
FROM knowledge_entities
WHERE canonical_name LIKE 'Leo%'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND entity_type = 'character';
```

**Pass Criteria:**
- [ ] 1 character row (Leo Frostborne)
- [ ] structured_fields contains: height, hair_color, eye_color
- [ ] Height value = "6 feet 2 inches" (or variant)
- [ ] Hair color = "black"
- [ ] Eye color = "blue"
- [ ] Aliases includes "Leo"
- [ ] UI displays all fields without "לא ידוע" (unknown)

**FAIL Scenarios:**
- ❌ Multiple Leo entities (consolidation failed)
- ❌ Structured_fields empty or all null
- ❌ Height/hair/eye missing or null
- ❌ UI shows "לא ידוע" for these fields

---

### Scenario 2: ABILITIES AND OBJECTS

**Expected LLM Output:**
```json
{
  "characters": [
    {
      "name": "Leo Frostborne",
      "abilities": [
        "Sword mastery",
        "Hand-to-hand combat",
        "Cold resistance",
        "Physical strength"
      ]
    }
  ],
  "objects": [
    {
      "name": "Cabinet",
      "aliases": ["Magical cabinet", "Wooden cabinet"],
      "object_type": "Storage container",
      "appearance": "Ornately carved wooden cabinet with symbols of power",
      "materials": "Wood with magical inscriptions",
      "special_properties": ["Expanded interior space", "Magical energy preservation"]
    },
    {
      "name": "Cabinet",
      "aliases": ["Glass cabinet", "Herb cabinet"],
      "object_type": "Storage container",
      "appearance": "Small glass cabinet",
      "materials": "Glass",
      "special_properties": ["Practical storage"]
    }
  ]
}
```

**Data Flow Trace for Abilities:**

| Stage | What Happens | Expected Data |
|-------|--------------|----------------|
| **LLM Output** | Gemini extracts abilities array | ["Sword mastery", "Hand-to-hand combat", "Cold resistance", "Physical strength"] |
| **Normalize** | Each ability becomes separate entity | 4 ability entities created in entityMap |
| **Consolidate** | Duplicate "Sword mastery" mentions → one ability | abilities consolidated by evidence |
| **UUID Resolve** | Each ability gets UUID | 4 unique IDs assigned |
| **DB Persist** | knowledge_entities rows for each ability | entity_type='ability', canonical_name=ability name |
| **Relationships** | Character→Ability relationships created (FIX #2) | knowledge_entity_relationships: has_ability type |
| **Branch View** | UI queries relationships to display | Abilities linked to character entity |

**Data Flow Trace for Objects:**

| Stage | What Happens | Expected Data |
|-------|--------------|----------------|
| **LLM Output** | Two Cabinets with CONFLICTING context | Cabinet A: wood, magical; Cabinet B: glass, practical |
| **Normalize** | normalizeKey("Cabinet") applied to both | Both map to key="cabinet" |
| **Conflict Check** | hasConflictingEntityContext(A, B) called | Returns TRUE (materials differ) |
| **Create Suffix** | entityMap keys become "cabinet" and "cabinet::2" | Two separate entries |
| **UUID Resolve** | Each gets unique UUID | ID_A ≠ ID_B |
| **DB Persist** | Two knowledge_entities rows | Different materials, special_properties |
| **Branch View** | UI can distinguish two cabinets | Can display both separately |

**Verification Queries:**

Abilities:
```sql
SELECT COUNT(*) as ability_count
FROM knowledge_entities
WHERE entity_type = 'ability'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';
```

Objects:
```sql
SELECT 
  id,
  canonical_name,
  structured_fields->>'materials' as materials,
  structured_fields->>'special_properties' as special_properties
FROM knowledge_entities
WHERE entity_type = 'object'
  AND canonical_name = 'Cabinet'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at;
```

Relationships (FIX #2):
```sql
SELECT 
  source_entity_id,
  target_entity_id,
  relationship_type,
  (SELECT canonical_name FROM knowledge_entities WHERE id = source_entity_id) as source_name,
  (SELECT canonical_name FROM knowledge_entities WHERE id = target_entity_id) as target_name
FROM knowledge_entity_relationships
WHERE relationship_type = 'has_ability'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';
```

**Pass Criteria:**

Abilities:
- [ ] 4 ability entities created (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)
- [ ] Each ability has unique UUID
- [ ] Relationship records exist linking Leo to each ability (relationship_type='has_ability')
- [ ] UI displays abilities linked to character

Objects:
- [ ] 2 Cabinet entities created
- [ ] Different UUIDs (UUID_A ≠ UUID_B)
- [ ] Cabinet A: materials="wood" or "wood with magical inscriptions", special_properties includes "Expanded interior"
- [ ] Cabinet B: materials="glass", special_properties includes "Practical storage"
- [ ] UI can display both cabinets separately

**FAIL Scenarios:**
- ❌ < 4 ability entities (consolidation too aggressive)
- ❌ 1 Cabinet entity (FIX #4 failed - should be 2)
- ❌ Abilities in character.attributes as strings (FIX #2 not applied)
- ❌ No relationship records for abilities
- ❌ Abilities not displayed in UI

---

### Scenario 3: REPEATED ENTITY / CABINET IDENTITY (Core Fix #4)

**Expected Behavior:**
- Magical Cabinet mentioned 5 times in document → all resolve to SAME UUID
- Two different Cabinets (magical vs practical) → get DIFFERENT UUIDs

**Verification Query:**
```sql
SELECT 
  id,
  canonical_name,
  structured_fields->>'materials' as materials,
  COUNT(*) OVER (PARTITION BY id) as mention_count,
  (
    SELECT COUNT(*) FROM document_chunks
    WHERE chunk_content ILIKE '%Cabinet%'
      AND document_id = (SELECT document_id FROM documents WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6' LIMIT 1)
  ) as total_cabinet_mentions
FROM knowledge_entities
WHERE entity_type = 'object'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY canonical_name, created_at;
```

**Pass Criteria:**
- [ ] 2 rows for Cabinet entity_type
- [ ] Row A: materials="wood" (or similar), UUID_A
- [ ] Row B: materials="glass", UUID_B
- [ ] UUID_A ≠ UUID_B
- [ ] Row A has evidence from 5 mentions (consolidation within batch)
- [ ] Row B has evidence from separate mentions
- [ ] No duplicate Cabinet rows with same materials

**FAIL Scenarios:**
- ❌ 1 Cabinet entity (both mentions merged - FIX #4 failed)
- ❌ 3+ Cabinet entities (consolidation failed)
- ❌ Both with same materials (data loss due to merge)
- ❌ cabinet::2 suffix still present (conflict detection false-negative)

---

### Scenario 4: MAIN / BRANCH ISOLATION

**Test Case A: First Extraction (Bootstrap Main)**

```sql
SELECT 
  'entities_main' as check_type,
  COUNT(*) as count,
  layer
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY layer;

SELECT 
  'branch_entities' as check_type,
  COUNT(*) as count
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

SELECT 
  'branch_overlays_main' as check_type,
  COUNT(*) as count
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND source_entity_id IS NOT NULL;
```

**Expected Results (First Extraction):**
- All entities created with `layer='main'`
- All entities have `branch_id IS NULL`
- `knowledge_branch_entities` is EMPTY
- No overlays created

**Pass Criteria (First Extraction):**
- [ ] 0 rows with layer='branch'
- [ ] All rows have branch_id=NULL
- [ ] knowledge_branch_entities count = 0
- [ ] No duplicate entities across layers

**Test Case B: Second Extraction in Branch (if executed)**

```sql
SELECT 
  'entities_by_layer' as check_type,
  layer,
  COUNT(*) as count
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY layer;

SELECT 
  'branch_entities_count' as check_type,
  COUNT(*) as count
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

SELECT 
  'main_entity_uuids' as check_type,
  id
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND layer='main'
ORDER BY id;

SELECT 
  'branch_overlay_references' as check_type,
  source_entity_id,
  entity_id,
  (source_entity_id = entity_id) as is_overlay
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND source_entity_id IS NOT NULL;
```

**Expected Results (Second Extraction in Branch):**
- Main entities unchanged (same count, same UUIDs)
- New overlays in knowledge_branch_entities referencing Main entities
- Branch-only entities created (if new entities extracted)
- No duplication of Main entities in Branch table

**Pass Criteria (Second Extraction):**
- [ ] Main entity count unchanged
- [ ] Main entity UUIDs unchanged
- [ ] Branch overlays all have source_entity_id = main entity UUID
- [ ] Branch-only entities have source_entity_id IS NULL
- [ ] No entity_id appears twice in knowledge_branch_entities

**FAIL Scenarios:**
- ❌ Entities with layer='branch' in first extraction (should be all 'main')
- ❌ branch_id not NULL on Main entities
- ❌ knowledge_branch_entities has overlay when none should exist
- ❌ Main entity count different before/after second extraction
- ❌ Duplicate entity_id in knowledge_branch_entities
- ❌ source_entity_id not matching main entity UUID

---

## STEP 3: Create Diagnostic Summary Table

After each scenario, fill in this table:

| Scenario | LLM Output | Normalized | Resolved UUID | DB Row | Main/Branch | UI Result | Status |
|----------|-----------|-----------|---------------|--------|-------------|-----------|--------|
| **Character Fields** | height, hair_color, eye_color present | structured_fields populated | single UUID | fields in DB | Main, branch_id NULL | Fields displayed correctly | PASS/FAIL |
| **Abilities** | 4 abilities in array | 4 entities created | 4 UUIDs | 4 rows entity_type='ability' | relationships created | Abilities shown linked | PASS/FAIL |
| **Objects** | 2 Cabinets, conflicting | Two separate entities | 2 UUIDs | 2 rows, different materials | both in Main | Both displayed separately | PASS/FAIL |
| **Cabinet Identity** | 5 mentions + 1 different | Magical=1 entity, Glass=1 entity | 2 UUIDs | 2 rows, no duplicates | Main layer | Cabinets distinct | PASS/FAIL |
| **Main/Branch** | First extraction | All Main layer | Single per entity | layer='main', branch_id=NULL | No overlays | Single view | PASS/FAIL |

---

## STEP 4: Fix Failures (if any)

**If any scenario fails:**

1. Identify the exact failure point from the diagnostic table
2. Match to one of the four fixes in commit 8597629
3. Review the code change
4. Identify root cause
5. Implement additional fix
6. Create regression test
7. Re-run extraction
8. Verify pass

**If all scenarios pass:**

1. Document as VERIFIED ✅
2. Take git diff snapshot
3. Commit with message: "docs: add controlled extraction verification results"
4. Push to origin/main
5. Mark ready for production deployment

---

## Troubleshooting

### Issue: LLM Response Not Found
- Check that extraction actually completed (look at Edge Function logs)
- Verify document was properly uploaded
- Check project_id is correct
- Run: `SELECT * FROM raw_extractions LIMIT 1`

### Issue: Entity Not Appearing
- Check if it was filtered out by `shouldFilterEntity()`
- Check entity_type constraint in database
- Look for error logs in Edge Function output

### Issue: Character Fields Empty
- Check `knowledge_entity_values` table exists and has records
- Verify `syncEntityValues()` was called
- Check for null skipping logic

### Issue: Abilities Not Showing as Relationships
- Verify relationship records exist in `knowledge_entity_relationships`
- Check relationship_type='has_ability'
- Verify UI is querying relationships, not attributes

### Issue: Two Cabinets Not Separated
- Check `hasConflictingEntityContext()` result (should be TRUE)
- Verify `entityFieldCoverage()` calculated correctly
- Check consolidation threshold >= 70 not met
- Verify conflict evidence logged

---

## Files to Generate/Save

After execution, save:
1. `CONTROLLED_TEST_LLM_RESPONSE.json` - Raw Gemini output
2. `CONTROLLED_TEST_RESULTS_QUERIES.sql` - All verification queries with results
3. `CONTROLLED_TEST_SCENARIO_RESULTS.md` - Filled-in diagnostic table
4. `CONTROLLED_TEST_FAILURES.md` - Any failures and fixes applied

---

