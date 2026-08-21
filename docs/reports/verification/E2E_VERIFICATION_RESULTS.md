# End-to-End Verification Results
## Extraction Pipeline Fixes (Commit 8597629)

**Date:** August 20, 2026  
**Status:** 🔄 AWAITING REAL EXTRACTION  
**Commit:** 8597629  
**Test Project:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  

---

## Current Situation

The four critical failures have been **identified and fixed in code**:

1. ✅ **Failure #1 (Character Fields)** — Root cause identified, architectural fix prevents bad consolidations
2. ✅ **Failure #2 (Abilities)** — Fixed: character→ability relationships implemented, abilities as first-class entities
3. ✅ **Failure #3 (Objects)** — Root cause identified, field coverage detection prevents sparse merges
4. ✅ **Failure #4 (Cabinet Consolidation)** — Fixed: `entityFieldCoverage()` and enhanced `hasConflictingEntityContext()`

**What remains:** Execute the real extraction with ../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md and verify all four scenarios pass in the actual database.

---

## Prerequisites for Verification

### ✅ Code Changes Committed
- File: `supabase/functions/_shared/entity-resolution.ts` (+57 lines)
- File: `supabase/functions/extract-knowledge/index.ts` (+72 lines)
- Tests: 6 comprehensive unit tests (all passing)
- Build: TypeScript validation successful

### 🔄 Required for Real Extraction
- Authenticated user session (can use app UI or service role key)
- Supabase project `6c4b7b92-214a-4785-ad66-e62527ee68d6` accessible
- Edge Function `extract-knowledge` deployed
- Test document: `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md` (6 parts, prepared)
- Database tables and RLS ready (schema may need reconciliation - see ../migrations/SCHEMA_RECONCILIATION_REQUIRED.md)

---

## Extraction Scenarios to Verify

### Scenario 1: CHARACTER FIELDS (Failure #1)

**Test Document Section:** Parts 1 & 4 (Leo introduction + character details)

**Leo Character Expected in LLM Output:**
- name: "Leo Frostborne"
- aliases: ["Leo", "Leonardo Frostborne"]
- age: null (not mentioned)
- gender: "male"
- **height: "6 feet 2 inches"** ← Key verification
- **hair_color: "black"** ← Key verification
- **eye_color: "blue"** ← Key verification
- tattoos: "Wolf on left shoulder"
- description: "A human fighter known for exceptional strength"

**Data Flow:**
```
LLM JSON (height, hair_color, eye_color)
↓
normalizeEntities() → buildStructuredFields() → structured_fields populated
↓
consolidateEntities() → "Leo" + "Leonardo Frostborne" → ONE entity (canonical_name = longest name)
↓
resolveExtractionCandidate() → EntityId (UUID)
↓
knowledge_entities INSERT → structured_fields column has {height, hair_color, eye_color}
↓
syncEntityValues() → knowledge_entity_values rows for each field
↓
UI Query → Displays height/hair/eye without "לא ידוע" (unknown)
```

**Verification Query:**
```sql
SELECT structured_fields->>'height', structured_fields->>'hair_color', structured_fields->>'eye_color'
FROM knowledge_entities
WHERE canonical_name = 'Leo Frostborne' AND entity_type = 'character'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';
```

**PASS Criteria:**
- [ ] Leo Frostborne entity exists
- [ ] height = "6 feet 2 inches" (or variant with "6" and "2" inches)
- [ ] hair_color = "black"
- [ ] eye_color = "blue"
- [ ] values synced to knowledge_entity_values
- [ ] UI displays all fields populated

**FAIL Indicators:**
- ❌ height/hair_color/eye_color are null
- ❌ values not in knowledge_entity_values
- ❌ UI shows "לא ידוע"
- ❌ Multiple Leo entities (consolidation failed)

---

### Scenario 2: ABILITIES & OBJECTS (Failure #2 & #3)

**Test Document Sections:** 
- Part 2 & 5 (Cabinet descriptions + Leo's abilities)
- Part 3 (Different Cabinet)

**Expected Abilities:**
```
4 separate ability entities:
1. "Sword mastery"
2. "Hand-to-hand combat"
3. "Cold resistance"
4. "Physical strength"
```

**Expected Objects:**
```
2 separate Cabinet objects:
Cabinet A (Magical):
- materials: "wood" or "wood with magical inscriptions"
- appearance: "ornately carved with symbols of power"
- special_properties: "Expanded interior space", "Magical energy preservation"
- mentions: 5 (consolidation expected)

Cabinet B (Practical):
- materials: "glass"
- appearance: "small glass cabinet"
- special_properties: "practical storage"
- mentions: 1
```

**Data Flow for Abilities:**
```
LLM: ["Sword mastery", "Hand-to-hand combat", "Cold resistance", "Physical strength"]
↓
normalizeEntities(): 4 separate ability entities created in entityMap
↓
consolidateEntities(): Within batch consolidation by evidence score
↓
extractKnowledge: findBatchEntityId() called for each ability
↓
knowledge_entity_relationships: 4 "has_ability" links created (source=Leo, target=each ability)
↓
UI: Queries relationships to display abilities linked to character
```

**Data Flow for Objects (Cabinet):**
```
LLM: Two Cabinet objects with CONFLICTING materials
↓
normalizeEntities(): 
  - First Cabinet: key="cabinet", materials="wood"
  - Second Cabinet: key="cabinet", materials="glass"
  - Conflict check: hasConflictingEntityContext(A, B) = TRUE (materials differ)
  - Create keys: "cabinet" and "cabinet::2"
↓
consolidateEntities(): 
  - No consolidation (threshold requires >= 70 score for conflicts)
  - Both preserved as separate entries
↓
resolveExtractionCandidate(): Two unique UUIDs assigned
↓
knowledge_entities INSERT: Two rows, different materials, different UUIDs
↓
UI: Displays two separate cabinets
```

**Verification Queries:**

Abilities:
```sql
SELECT COUNT(*) FROM knowledge_entities 
WHERE entity_type = 'ability' 
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';
-- Expected: 4
```

Relationships (Fix #2):
```sql
SELECT COUNT(*) FROM knowledge_entity_relationships
WHERE relationship_type = 'has_ability'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';
-- Expected: 4
```

Cabinets (Fix #4):
```sql
SELECT id, materials FROM knowledge_entities
WHERE canonical_name = 'Cabinet' AND entity_type = 'object'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at;
-- Expected: 2 rows, one materials='wood', one materials='glass'
```

**PASS Criteria:**
- [ ] 4 ability entities created
- [ ] 4 character→ability relationship records with type='has_ability'
- [ ] 2 Cabinet entities (not 1, not 3+)
- [ ] Cabinet A: materials contains "wood"
- [ ] Cabinet B: materials = "glass"
- [ ] Cabinet UUIDs are different (UUID_A ≠ UUID_B)
- [ ] UI can display abilities linked to Leo
- [ ] UI can display both cabinets separately

**FAIL Indicators:**
- ❌ < 4 ability entities
- ❌ 0 has_ability relationships
- ❌ 1 Cabinet entity (merge failed - Failure #4 not fixed)
- ❌ Both Cabinets with same materials (data loss)
- ❌ Abilities still in character.attributes as strings (Fix #2 not applied)

---

### Scenario 3: CABINET IDENTITY (Core Fix #4)

**The Core Requirement:**
- Same Cabinet mentioned 5 times → ONE UUID (consolidation within batch)
- Two different Cabinets with same name → TWO UUIDs (Failure #4 fix)

**Repeated Cabinet in Document:**
```
Part 2 mentions:
1. "Leo discovered a mysterious wooden cabinet"
2. "examined the cabinet carefully"
3. "inside the cabinet were magical artifacts"
4. "carry the cabinet with him"
5. "open the cabinet and study"

Result: All → Same UUID (consolidation)

Part 3 mentions:
1. "another cabinet, this one made of glass"
2. "cabinet was much smaller"
3. "cabinet contained only mundane healing supplies"

Result: Different context → Different UUID
```

**Decision Logic (hasConflictingEntityContext):**

```
Cabinet A (5 mentions): {materials: "wood", special_properties: ["magical", "power"]}
Cabinet B (3 mentions): {materials: "glass", special_properties: ["practical", "herbs"]}

hasConflictingEntityContext(A, B):
  Signal 1: descriptions = ["magical cabinet"] vs ["glass cabinet"]
    - Shared tokens: "cabinet"
    - Not zero overlap → not CONFLICTING here
  
  Signal 2: Field values
    - materials: "wood" vs "glass" → DIFFERENT → return TRUE ✓
  
Result: CONFLICTING = TRUE
  → Do NOT consolidate
  → Create separate entities
```

**Verification Query:**
```sql
SELECT 
  id as cabinet_uuid,
  structured_fields->>'materials' as materials,
  COUNT(*) OVER (PARTITION BY id) as entity_count,
  (SELECT COUNT(*) FROM knowledge_entity_mentions
   WHERE entity_id = knowledge_entities.id) as mention_count
FROM knowledge_entities
WHERE canonical_name = 'Cabinet'
  AND entity_type = 'object'
  AND project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at;

-- Expected:
-- cabinet_uuid=UUID_A, materials=wood, mention_count=5
-- cabinet_uuid=UUID_B, materials=glass, mention_count=1
-- UUID_A ≠ UUID_B (proof of separate identity)
```

**PASS Criteria:**
- [ ] 2 Cabinet entities with different UUIDs
- [ ] UUID_A has 5 mentions, materials="wood"
- [ ] UUID_B has 1+ mention, materials="glass"
- [ ] No third Cabinet entity
- [ ] Both UUIDs are actually different (not same UUID with multiple rows)

**FAIL Indicators:**
- ❌ 1 Cabinet entity (consolidation too aggressive - Failure #4 not fixed)
- ❌ 3+ Cabinet entities (consolidation too conservative)
- ❌ Both with same materials (data loss/merge)
- ❌ UUID_A = UUID_B (identity not preserved)

---

### Scenario 4: MAIN / BRANCH ISOLATION

**Architecture Requirement:**
- First extraction: Creates Main layer (all entities have layer='main', branch_id=NULL)
- No overlays created on first extraction (knowledge_branch_entities empty for first run)
- If second extraction exists: Overlays reference Main UUID, Main not duplicated, Branch-only entities separate

**Verification Queries (First Extraction):**

```sql
-- Layer distribution
SELECT layer, COUNT(*) as count, COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as null_branch_id
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
GROUP BY layer;

-- Expected: layer='main' with count=7 (1 Leo + 2 Cabinets + 4 abilities), all branch_id=NULL

-- Overlay count
SELECT COUNT(*) as overlay_count
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND source_entity_id IS NOT NULL;

-- Expected: 0 (no overlays on first extraction)

-- Branch entity count
SELECT COUNT(*) as branch_only_count
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND source_entity_id IS NULL;

-- Expected: 0 (no independent Branch entities on first extraction)
```

**PASS Criteria (First Extraction):**
- [ ] All entities have layer='main'
- [ ] All entities have branch_id=NULL
- [ ] knowledge_branch_entities count = 0
- [ ] No duplicate entities in different layers

**FAIL Indicators:**
- ❌ Any entity has layer='branch' (should be all 'main')
- ❌ branch_id is set on any entity (should be all NULL)
- ❌ Overlays exist in knowledge_branch_entities (shouldn't on first run)
- ❌ Entity count > 7 (duplicate creation)

---

## Execution Steps

### Step 1: Trigger Real Extraction
1. Open app UI → Navigate to test project
2. Click "Extract Knowledge" on ../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md
3. Wait for completion (should complete in 10-30 seconds)
4. Note the extraction_id from response

### Step 2: Capture LLM Output
```sql
SELECT raw_response, model, latency_ms, chunks_count
FROM raw_extractions
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at DESC LIMIT 1;
```
Save raw_response to `CONTROLLED_TEST_LLM_RESPONSE.json`

### Step 3: Run Verification Queries
Execute all queries from `../../../supabase/sql/verification/VERIFY_CONTROLLED_EXTRACTION.sql`

### Step 4: Fill Diagnostic Table

| Scenario | LLM Output | DB Result | Status |
|----------|-----------|-----------|--------|
| Character Fields | height, hair_color, eye_color | values in structured_fields | PASS/FAIL |
| Abilities | 4 abilities | 4 entities + 4 relationships | PASS/FAIL |
| Objects | 2 Cabinets, conflicting | 2 entities, different UUIDs | PASS/FAIL |
| Cabinet Identity | 5 mentions + 1 different | 2 Cabinets, UUID_A ≠ UUID_B | PASS/FAIL |
| Main/Branch | First extraction | All layer='main', branch_id=NULL | PASS/FAIL |

### Step 5: If Any Failure

1. Identify the exact failure point
2. Check root cause in code
3. Implement fix
4. Add regression test
5. Re-run extraction
6. Verify fix

### Step 6: If All Pass

1. Document results in this file
2. Save all query outputs
3. Create regression test
4. Run full test suite
5. Commit: "test: verify controlled extraction with real database"
6. Push to origin/main
7. Mark as production-ready

---

## Resources

- Test Document: `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md`
- Verification Queries: `../../../supabase/sql/verification/VERIFY_CONTROLLED_EXTRACTION.sql`
- Verification Protocol: `./CONTROLLED_EXTRACTION_VERIFICATION.md`
- Code Changes: Commit 8597629
  - `supabase/functions/_shared/entity-resolution.ts` (entityFieldCoverage, hasConflictingEntityContext)
  - `supabase/functions/extract-knowledge/index.ts` (findBatchEntityId, has_ability relationships)
- Unit Tests: `supabase/functions/extract-knowledge/entity-resolution.test.ts` (6 tests, all passing)

---

## Status

🔄 **AWAITING REAL EXTRACTION**

Next action: Execute extraction on test project using test document and run verification queries.

---

