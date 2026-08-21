# Controlled Extraction Test - Complete Verification Package

**Project ID:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Status:** ✅ Ready for Execution  
**Last Updated:** 2024

---

## 📋 Table of Contents

This package contains everything needed to verify the controlled extraction test.

### Quick Links

| Document | Purpose | Best For |
|----------|---------|----------|
| **[VERIFICATION_QUERIES_EXECUTABLE.md](VERIFICATION_QUERIES_EXECUTABLE.md)** ⭐ | SQL queries organized by scenario | Manual verification in Supabase dashboard |
| **[VERIFICATION_EXECUTION_GUIDE.md](VERIFICATION_EXECUTION_GUIDE.md)** | Complete how-to guide | Understanding how to run tests |
| **[VERIFICATION_PACKAGE_SUMMARY.md](VERIFICATION_PACKAGE_SUMMARY.md)** | Executive summary | Quick overview of test package |
| **[VERIFICATION_INDEX.md](VERIFICATION_INDEX.md)** | This file | Navigation and quick reference |
| **[../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md](../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md)** | Test input document | Understanding what's being extracted |

---

## 🚀 Start Here

### Choose Your Verification Method

#### Option 1: Manual (No API Key Needed) ⭐ Recommended First Time

1. Open [VERIFICATION_QUERIES_EXECUTABLE.md](VERIFICATION_QUERIES_EXECUTABLE.md)
2. Go to https://app.supabase.com
3. Select "Literary Assistant" project
4. Click **SQL Editor**
5. Copy first query (Query 1.1)
6. Paste into SQL Editor
7. Click **Run**
8. Record result as ✅ PASS or ❌ FAIL
9. Repeat for all queries

**Time:** ~15 minutes  
**Difficulty:** Easy  
**Requirements:** Supabase account access

#### Option 2: Node.js Script (Automated)

```bash
npm install  # Install dependencies if needed
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
node ../../../scripts/verification/run_verification_queries.mjs
```

**Time:** ~2 minutes  
**Difficulty:** Medium  
**Requirements:** Node.js, API key

#### Option 3: Python Script (Automated)

```bash
pip install supabase
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
python3 ../../../scripts/verification/run_verification.py
```

**Time:** ~2 minutes  
**Difficulty:** Medium  
**Requirements:** Python, API key

---

## 📊 What's Being Tested

### Scenario 1: Character Fields (Failure #1)
- Leo Frostborne entity created
- height = "6 feet 2 inches"
- hair_color = "black"  
- eye_color = "blue"
- Values synced to database

**Queries:** 1.1, 1.2

### Scenario 2: Abilities & Objects (Failure #2 & #3)
- 4 ability entities created
- 4 "has_ability" relationships
- 2 Cabinet objects (different materials)

**Queries:** 2.1, 2.2, 2.3, 2.4

### Scenario 3: Cabinet Identity (Failure #4) ⚠️ CRITICAL
- **Exactly 2 Cabinet entities** (not 1)
- Different UUIDs (UUID_A ≠ UUID_B)
- Cabinet A: wood, 5 mentions
- Cabinet B: glass, 1 mention

**Queries:** 3.1, 3.2, 3.3

### Scenario 4: Main/Branch Isolation
- All layer='main'
- All branch_id=NULL
- 7 total entities
- 0 overlay records

**Queries:** 4.1, 4.2, 4.3, 4.4

---

## ✅ Expected Results

### All Tests PASS

```
Character: 1 entity
Abilities: 4 entities  
Cabinet Count: 2 (different UUIDs)
Relationships: 4 has_ability links
Main Layer: 7 total entities
Overlays: 0

STATUS: ✅ EXTRACTION WORKING CORRECTLY
```

### Critical Failure

```
Cabinet Count: 1 (should be 2)

STATUS: ❌ FAILURE #4 NOT FIXED - Cabinets incorrectly merged
```

---

## 📁 Files in This Package

```
verification/
├── VERIFICATION_INDEX.md ...................... This file
├── VERIFICATION_QUERIES_EXECUTABLE.md ......... SQL queries (START HERE)
├── VERIFICATION_EXECUTION_GUIDE.md ........... How-to guide
├── VERIFICATION_PACKAGE_SUMMARY.md ........... Executive summary
├── ../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md ............... Test input
├── ../../../scripts/verification/run_verification_queries.mjs .............. Node.js script
├── ../../../scripts/verification/run_verification.py ....................... Python script
└── [Output files - generated after running]
    ├── ../../../tests/results/VERIFICATION_REPORT.json .............. Automated report
    └── VERIFICATION_RESULTS.txt .............. Manual results
```

---

## 🔍 Quick Diagnostic

Run this single SQL query for immediate status:

```sql
SELECT 'CHARACTER' as check, COUNT(*)::text as count, 'Expected: 1' as expected FROM knowledge_entities WHERE entity_type='character' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL SELECT 'ABILITY', COUNT(*)::text, 'Expected: 4' FROM knowledge_entities WHERE entity_type='ability' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL SELECT 'CABINET', COUNT(*)::text, 'Expected: 2' FROM knowledge_entities WHERE entity_type='object' AND canonical_name='Cabinet' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL SELECT 'RELATIONSHIPS', COUNT(*)::text, 'Expected: 4' FROM knowledge_entity_relationships WHERE relationship_type='has_ability' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
UNION ALL SELECT 'MAIN_LAYER', COUNT(*)::text, 'Expected: 7' FROM knowledge_entities WHERE layer='main' AND project_id='6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY check;
```

**Expected Output:**
```
CHARACTER       1    Expected: 1     ✅
ABILITY         4    Expected: 4     ✅
CABINET         2    Expected: 2     ✅
RELATIONSHIPS   4    Expected: 4     ✅
MAIN_LAYER      7    Expected: 7     ✅
```

---

## 📝 How to Record Results

### Manual Method

1. Create file: `VERIFICATION_RESULTS.txt`
2. Copy template from [VERIFICATION_EXECUTION_GUIDE.md](VERIFICATION_EXECUTION_GUIDE.md)
3. Fill in results for each query
4. Mark PASS/FAIL for each scenario

### Automated Method

Results automatically saved to `../../../tests/results/VERIFICATION_REPORT.json`

---

## ⚠️ Critical Tests

### Scenario 3: Cabinet Identity (Failure #4)

**Most Important Query:** 3.2

This query MUST show:
- 2 rows (not 1)
- Different ID values for each row
- Different materials (wood vs glass)
- Cabinet A: 5 mentions
- Cabinet B: 1 mention

**If you see 1 row:** Failure #4 is NOT fixed (two Cabinets merged)

---

## 🔧 Troubleshooting

### No Results Found
- Verify project exists
- Check extraction was run
- Confirm correct project ID

### Only 1 Cabinet
- **This is Failure #4 bug** - two different Cabinets merged
- Check consolidation logic
- Verify conflict detection

### 3+ Cabinets
- Over-fragmentation - entities split unnecessarily
- Check consolidation threshold

### Missing Fields
- Failure #1 - fields not extracted
- Check raw LLM response
- Verify data sync

### No Relationships
- Failure #2 - relationships not created
- Verify `has_ability` relationship type
- Check ability entities exist

---

## 📊 Test Matrix

| Scenario | File | Queries | Expected | Status |
|----------|------|---------|----------|--------|
| Character Fields | EXEC | 1.1, 1.2 | 1 Leo with fields | PASS/FAIL |
| Abilities | EXEC | 2.1 | 4 abilities | PASS/FAIL |
| Relationships | EXEC | 2.2 | 4 has_ability | PASS/FAIL |
| Cabinet Objects | EXEC | 2.3 | 2 Cabinets | PASS/FAIL |
| Cabinet Identity | EXEC | 3.1, 3.2 | 2 UUIDs | PASS/FAIL |
| Main/Branch | EXEC | 4.1-4.4 | layer=main | PASS/FAIL |

---

## 🎯 Next Steps

### Before You Start
1. ✅ Read [VERIFICATION_PACKAGE_SUMMARY.md](VERIFICATION_PACKAGE_SUMMARY.md) for context
2. ✅ Review [../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md](../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md) to understand test data
3. ✅ Choose verification method (Manual recommended first time)

### During Verification
1. ✅ Open [VERIFICATION_QUERIES_EXECUTABLE.md](VERIFICATION_QUERIES_EXECUTABLE.md)
2. ✅ Execute queries in order (Scenario 1 → 4)
3. ✅ Record results
4. ✅ Compare to expected values

### After Verification
1. ✅ Review results
2. ✅ If failures: Check troubleshooting guide
3. ✅ Document final status
4. ✅ Save results file

---

## 🔑 Project Details

**Project ID:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Project Name:** Literary Assistant (Test Instance)  
**Supabase URL:** `https://lqfqfzqcrqluxanhnjwu.supabase.co`  
**Database:** Supabase PostgreSQL  

### Key Tables
- `knowledge_entities` - Entity records
- `knowledge_entity_values` - Field values
- `knowledge_entity_relationships` - Relationships
- `knowledge_entity_mentions` - Mentions
- `knowledge_branch_entities` - Layer overlays

---

## 💡 Key Concepts

### Entity Consolidation
When the same entity is mentioned multiple times with consistent context → Single UUID

Example: Cabinet mentioned 5 times in Part 2-3 = 1 entity

### Conflict Detection
When same term mentioned with conflicting context → Multiple UUIDs

Example: Cabinet mentioned 5 times (magical) vs 1 time (practical) = 2 entities

### Layer Isolation
- **Main**: Bootstrap layer with primary entities
- **Branch**: Alternative extractions, isolated from Main
- **First extraction always**: layer='main', branch_id=NULL

### Relationship Type
Abilities stored as separate entities with `has_ability` relationship type, NOT as attributes on character

---

## 📞 Support

**Before asking for help:**
1. ✅ Run the quick diagnostic query (see above)
2. ✅ Check troubleshooting section in [VERIFICATION_EXECUTION_GUIDE.md](VERIFICATION_EXECUTION_GUIDE.md)
3. ✅ Review [./FAILURE_ANALYSIS_AND_FIXES.md](./FAILURE_ANALYSIS_AND_FIXES.md) for known issues

**Common Issues & Solutions:**

| Issue | Solution |
|-------|----------|
| "Project not found" | Verify ID: `6c4b7b92-214a-4785-ad66-e62527ee68d6` |
| 1 Cabinet (should be 2) | Failure #4 bug - see ./FAILURE_ANALYSIS_AND_FIXES.md |
| No entities | Run extraction first |
| NULL fields | Failure #1 - check raw LLM response |

---

## 📖 Related Documents

- `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md` - Test input data
- `./FAILURE_ANALYSIS_AND_FIXES.md` - Known failures and solutions
- `../implementation/IMPLEMENTATION_SUMMARY.md` - System architecture
- `../migrations/MIGRATION_111_COMPLETE_REFERENCE.md` - Database schema

---

## ✨ Summary

This package provides complete, ready-to-execute verification for the controlled extraction test.

**What you'll verify:**
- ✅ Character field extraction (Failure #1)
- ✅ Ability relationships (Failure #2)
- ✅ Object field preservation (Failure #3)
- ✅ Entity identity & consolidation (Failure #4 - Critical)
- ✅ Main/Branch layer isolation

**Time to complete:** 5-15 minutes depending on method

**Start with:** [VERIFICATION_QUERIES_EXECUTABLE.md](VERIFICATION_QUERIES_EXECUTABLE.md)

---

**Package Status:** ✅ Complete and Ready  
**Version:** 1.0  
**Last Updated:** 2024
