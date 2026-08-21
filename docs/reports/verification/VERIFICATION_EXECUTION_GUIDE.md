# Controlled Extraction Test - Verification Execution Guide

**Created:** August 21, 2026
**Project ID:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Test Document:** `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md` (text fixture; the original PDF is also retained in the same directory)

---

## Quick Start

### For Manual Verification (Recommended - No Setup Required)

1. **Open:** `VERIFICATION_QUERIES_EXECUTABLE.md`
2. **Copy:** SQL queries from each scenario
3. **Paste:** Into Supabase SQL Editor
4. **Run:** Each query and record results
5. **Compare:** Results against "Expected" values

### For Automated Verification (Requires API Key)

```bash
# Option A: Python (if Python installed)
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
python3 ../../../scripts/verification/run_verification.py

# Option B: Node.js
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
node ../../../scripts/verification/run_verification_queries.mjs
```

---

## What's Being Tested

This test verifies the **controlled extraction** functionality - specifically that the system can:

1. **Extract character fields** (Name, height, hair color, eye color)
2. **Create entity relationships** for abilities (not attributes)
3. **Identify distinct entities** when contexts conflict (two Cabinets with different materials)
4. **Consolidate repeated mentions** (same Cabinet mentioned 5 times = 1 entity)
5. **Maintain Main/Branch isolation** for the first extraction (entities in Main with `branch_id=NULL`; relationships and events are also persisted in Main with approved status)

---

## Test Failures Being Verified

This test specifically checks for these known failures:

| Failure | Description | How It Fails | Expected Result |
|---------|-------------|-------------|-----------------|
| **#1** | Character fields not extracted | Fields NULL in database | height, hair_color, eye_color populated |
| **#2** | Abilities stored as strings | Relationships not created | has_ability relationship type exists |
| **#3** | Objects lose attributes | Cabinet materials not stored | 2 Cabinet rows with different materials |
| **#4** | Cabinet identity bug | Two Cabinets merged into one | 2 separate Cabinet entities with different UUIDs |

---

## Verification Queries - Organized by Scenario

### SCENARIO 1: CHARACTER FIELDS

**File:** `VERIFICATION_QUERIES_EXECUTABLE.md` → Queries 1.1, 1.2

**What to Check:**
- Leo Frostborne entity exists
- Height = "6 feet 2 inches" (or similar)
- Hair color = "black"
- Eye color = "blue"
- Values synced to `knowledge_entity_values` table

**Failure Detection:**
- If fields are NULL → Failure #1 (extraction issue)
- If no values in `knowledge_entity_values` → Data sync issue

---

### SCENARIO 2: ABILITIES & OBJECTS

**File:** `VERIFICATION_QUERIES_EXECUTABLE.md` → Queries 2.1, 2.2, 2.3, 2.4

**What to Check:**

**2.1 - Ability Entities:**
- 4 ability entities created
- Names: Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength

**2.2 - Relationships (Fix #2):**
- 4 `has_ability` relationships from Leo to abilities
- **This is critical:** Abilities should be relationships, NOT attributes

**2.3 - Cabinet Objects:**
- 2 Cabinet entities
- Different materials (wood vs glass)

**Failure Detection:**
- If < 4 abilities → Failure #2 (extraction issue)
- If no relationships → Failure #2 (consolidation issue)
- If 1 Cabinet → Cabinet fields lost or merged
- If materials NULL → Failure #3 (object attributes not stored)

---

### SCENARIO 3: CABINET IDENTITY (CORE FIX)

**File:** `VERIFICATION_QUERIES_EXECUTABLE.md` → Queries 3.1, 3.2, 3.3

**What to Check (CRITICAL):**

**3.1 - Cabinet Count:**
- **Exactly 2** Cabinet entities
- Not 1 (would indicate incorrect merge)
- Not 3+ (would indicate over-fragmentation)

**3.2 - Cabinet Identities (MOST IMPORTANT):**
- Cabinet A:
  - ID: `UUID_A` (unique)
  - Materials: "wood" or "wood with magical inscriptions"
  - Mentions: 5 (mentioned 5 times in document)
  - Appearance: "Ornately carved..."
  
- Cabinet B:
  - ID: `UUID_B` (unique, **different from UUID_A**)
  - Materials: "glass"
  - Mentions: 1
  - Appearance: "Small glass cabinet"

**3.3 - Duplicate Detection:**
- No duplicate Cabinet UUIDs with same materials
- Confirms entities are properly separated

**Failure Detection:**
- If cabinet_count = 1 → **Failure #4 NOT FIXED** (two different Cabinets merged)
- If UUID_A = UUID_B → Critical bug (should never happen)
- If materials are same → Consolidation failed
- If mention_count wrong → Entity references not tracked properly

---

### SCENARIO 4: MAIN/BRANCH ISOLATION

**File:** `VERIFICATION_QUERIES_EXECUTABLE.md` → Queries 4.1, 4.2, 4.3, 4.4

**What to Check (First Extraction Only):**

**4.1 - Layer Distribution:**
- All entities have `layer = 'main'`
- All entities have `branch_id = NULL`
- No `layer = 'branch'` present

**4.2 - Branch Overlays:**
- 0 overlay records in `knowledge_branch_entities`
- (Overlays only created after second extraction)

**4.3 - Entity Count:**
- character: 1 (Leo)
- ability: 4 (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)
- object: 2 (Cabinet wood, Cabinet glass)
- **Total: 7 entities**

**Failure Detection:**
- If branch_id set on Main layer → Bootstrap failed
- If overlays present → Incorrect layer handling
- If count != 7 → Extraction incomplete

---

## How to Run Verification

### Method 1: Supabase Dashboard (Most User-Friendly)

**Steps:**

1. Go to https://app.supabase.com
2. Click "Literary Assistant" project (or search for `lqfqfzqcrqluxanhnjwu`)
3. Navigate to **SQL Editor** (left sidebar)
4. Click **+ New Query**
5. Open `VERIFICATION_QUERIES_EXECUTABLE.md`
6. Copy the first query (Query 1.1)
7. Paste into SQL Editor
8. Click **Run** (or press Ctrl+Enter)
9. See results below query editor
10. Record results (see "Recording Results" section)
11. Repeat for all queries

**Result View:**
- Results appear in table format below the query editor
- Column headers show field names
- Row count shown at bottom
- Can export as CSV if needed

---

### Method 2: Command Line (psql)

**Prerequisites:**
- PostgreSQL installed (includes `psql` command)
- Supabase service role key

**Steps:**

```bash
# 1. Get connection string
# From Supabase Dashboard:
#   - Settings → Database → Connection Pooling (Recommended)
#   - Copy the connection string

# 2. Set environment variable
export PGPASSWORD="your_postgres_password"

# 3. Run queries
psql -h lqfqfzqcrqluxanhnjwu.db.supabase.co \
     -U postgres \
     -d postgres \
     -p 6543 \
     -c "SELECT COUNT(*) FROM knowledge_entities WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';"
```

---

### Method 3: Python Script

**Prerequisites:**
- Python 3.7+
- `pip install supabase`
- Supabase service role key

**Steps:**

```bash
# 1. Set environment variable with API key
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."  # Your service role key

# 2. Run verification
python3 ../../../scripts/verification/run_verification.py

# 3. View results
cat ../../../tests/results/VERIFICATION_REPORT.json
```

**Output:** Generates `../../../tests/results/VERIFICATION_REPORT.json` with all results

---

### Method 4: Node.js Script

**Prerequisites:**
- Node.js 14+
- Dependencies installed: `npm install`
- Supabase service role key

**Steps:**

```bash
# 1. Set environment variable
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."

# 2. Run verification
node ../../../scripts/verification/run_verification_queries.mjs

# 3. Check output in terminal
```

**Output:** Displays results in terminal with color formatting

---

## Recording Results

### Template for Manual Recording

Create a file `VERIFICATION_RESULTS.txt` with this format:

```
CONTROLLED EXTRACTION TEST - VERIFICATION RESULTS
==================================================

Project ID: 6c4b7b92-214a-4785-ad66-e62527ee68d6
Test Date: [TODAY'S DATE]
Tester: [YOUR NAME]

SCENARIO 1: CHARACTER FIELDS
=============================

Query 1.1 - Leo Character Entity
Expected: 1 row with height, hair_color, eye_color
Result: [COPY QUERY RESULTS HERE]
Status: ✅ PASS / ❌ FAIL

Query 1.2 - Character Values
Expected: Fields synced in knowledge_entity_values
Result: [COPY QUERY RESULTS HERE]
Status: ✅ PASS / ❌ FAIL

SCENARIO 2: ABILITIES & OBJECTS
================================

Query 2.1 - Ability Entities
Expected: 4 abilities
Result: [COUNT OR COPY RESULTS]
Status: ✅ PASS / ❌ FAIL

Query 2.2 - Relationships
Expected: 4 has_ability relationships
Result: [COUNT OR COPY RESULTS]
Status: ✅ PASS / ❌ FAIL

Query 2.3 - Cabinet Objects
Expected: 2 Cabinets (wood, glass)
Result: [COPY RESULTS - ESPECIALLY MATERIALS]
Status: ✅ PASS / ❌ FAIL

SCENARIO 3: CABINET IDENTITY (CRITICAL)
=========================================

Query 3.1 - Cabinet Count
Expected: 2
Result: [COUNT]
Status: ✅ PASS / ❌ FAIL
Note: [If count=1: "Failure #4 NOT FIXED - Cabinets merged"]

Query 3.2 - Cabinet Details
Expected: Different UUIDs, different materials
Cabinet A - UUID: [PASTE], Materials: [VALUE], Mentions: [COUNT]
Cabinet B - UUID: [PASTE], Materials: [VALUE], Mentions: [COUNT]
Status: ✅ PASS / ❌ FAIL
Note: [If UUIDs same: "Critical bug - same UUID for different entities"]

SCENARIO 4: MAIN/BRANCH ISOLATION
==================================

Query 4.1 - Layer Distribution
Expected: All layer='main', all branch_id=NULL, 7 total
Result: [PASTE DISTRIBUTION]
Status: ✅ PASS / ❌ FAIL

Query 4.2 - Branch Overlays
Expected: 0
Result: [COUNT]
Status: ✅ PASS / ❌ FAIL

Query 4.3 - Entity Summary
Expected: character=1, ability=4, object=2 (total=7)
Result: [PASTE TABLE]
Status: ✅ PASS / ❌ FAIL

OVERALL VERDICT
================

Total Scenarios: 4
Passed: [COUNT]
Failed: [COUNT]

✅ ALL TESTS PASSED - EXTRACTION WORKING CORRECTLY
OR
❌ SOME TESTS FAILED - SEE NOTES BELOW

NOTES & OBSERVATIONS:
[Record any issues, unexpected results, or configuration details]
```

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "Project not found" | Wrong project ID or project deleted | Verify project ID in Supabase dashboard |
| "Permission denied" | Using anon key instead of service role | Use SUPABASE_SERVICE_ROLE_KEY, not anon key |
| No entities returned | Extraction not run or wrong project | Run extraction first, verify project ID |
| 1 Cabinet instead of 2 | Failure #4 bug | Two different Cabinets incorrectly merged |
| 3+ Cabinets | Over-fragmentation | Entities split when should be consolidated |
| NULL field values | Failure #1 | Fields not extracted or not synced |
| 0 relationships | Failure #2 | Relationships not created |
| Leo entity missing | Character extraction failed | Check raw_extractions table for errors |

---

## Interpreting Results

### PASS Indicators

```
✅ Query 1.1: Leo entity exists with fields populated
✅ Query 1.2: Values synced to knowledge_entity_values
✅ Query 2.1: 4 abilities created
✅ Query 2.2: 4 has_ability relationships
✅ Query 2.3: 2 Cabinet objects
✅ Query 3.1: cabinet_count = 2
✅ Query 3.2: Different UUIDs, different materials
✅ Query 4.1: All layer='main', all branch_id=NULL
✅ Query 4.2: 0 overlays
✅ Query 4.3: 7 total entities

OVERALL: ✅ ALL TESTS PASS
```

### FAIL Indicators

**Critical Issues:**

```
❌ Query 3.1: cabinet_count = 1 (Failure #4 NOT FIXED)
❌ Query 3.2: UUID_A = UUID_B (Same UUID for different entities)

These indicate core system failures
```

**Medium Issues:**

```
❌ Query 1.1: Leo fields NULL (Failure #1)
❌ Query 2.2: 0 relationships (Failure #2)
❌ Query 2.3: 1 Cabinet (Failure #3)

These indicate extraction/consolidation issues
```

**Low-Priority Issues:**

```
❌ Query 1.2: Some values missing (sync issue)
❌ Query 4.1: branch_id set (isolation issue)

These indicate data consistency issues
```

---

## Next Steps If Tests Fail

### If Failure #4 Detected (1 Cabinet Instead of 2)

1. **Check raw extraction:**
   ```sql
   SELECT raw_response FROM raw_extractions
   WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
   ORDER BY created_at DESC LIMIT 1;
   ```

2. **Verify consolidation logic** handles conflict detection

3. **Run extraction test again** to confirm reproducibility

### If Character Fields Missing

1. **Check raw extraction** - are fields in LLM response?
2. **Verify data sync** - are values in `knowledge_entity_values`?
3. **Check extraction function** for field mapping

### If Relationships Missing

1. **Verify consolidation** - do abilities exist as separate entities?
2. **Check relationship creation** in extraction logic
3. **Review relationship type** should be "has_ability"

---

## Key Query Reference

### Quick Check - All At Once

```sql
-- Run this single query for quick status
SELECT 'CHARACTER_COUNT' as check, COUNT(*)::text as result
FROM knowledge_entities WHERE entity_type='character' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL
SELECT 'ABILITY_COUNT', COUNT(*)::text FROM knowledge_entities WHERE entity_type='ability' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL
SELECT 'CABINET_COUNT', COUNT(*)::text FROM knowledge_entities WHERE entity_type='object' AND canonical_name='Cabinet' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL
SELECT 'RELATIONSHIPS', COUNT(*)::text FROM knowledge_entity_relationships WHERE relationship_type='has_ability' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL
SELECT 'MAIN_LAYER', COUNT(*)::text FROM knowledge_entities WHERE layer='main' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY check;
```

**Expected Output:**
```
CHARACTER_COUNT      1
ABILITY_COUNT        4
CABINET_COUNT        2
RELATIONSHIPS        4
MAIN_LAYER           7
```

---

## Files Reference

| File | Purpose | Usage |
|------|---------|-------|
| `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md` | Test input document | Reference for what was extracted |
| `VERIFICATION_QUERIES_EXECUTABLE.md` | SQL queries | Manual execution in Supabase |
| `../../../scripts/verification/run_verification_queries.mjs` | Node.js script | Automated verification |
| `../../../scripts/verification/run_verification.py` | Python script | Automated verification |
| `VERIFICATION_EXECUTION_GUIDE.md` | This file | How to run tests |

---

## Support

If tests fail consistently:

1. **Review test document** - `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md`
2. **Check extraction logs** - Supabase Edge Function logs
3. **Verify consolidation logic** - See `FAILURE_ANALYSIS_AND_FIXES.md`
4. **Test with simpler data** - Verify basic functionality first

---

**Last Updated:** 2024  
**Test Version:** 1.0  
**Status:** Ready for execution
