# Controlled Extraction Test - Verification Package Summary

**Date Created:** 2024  
**Test Project ID:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Status:** Ready for Execution

---

## Executive Summary

This package provides complete verification queries and tools to validate the **controlled extraction test** for the Literary Assistant project. The test verifies that the system correctly:

1. ✅ Extracts character fields (height, hair color, eye color)
2. ✅ Creates entity relationships for abilities
3. ✅ Identifies and separates conflicting entities (two different Cabinets)
4. ✅ Consolidates repeated mentions into single entities
5. ✅ Maintains Main/Branch layer isolation

---

## What's Included

### 1. **VERIFICATION_QUERIES_EXECUTABLE.md** ⭐ START HERE

Complete set of SQL queries organized by scenario with:
- Full query text ready to copy-paste
- Expected results for each query
- PASS/FAIL criteria
- Troubleshooting guide

**Use this for:** Manual verification in Supabase dashboard (no API key needed)

### 2. **VERIFICATION_EXECUTION_GUIDE.md**

Comprehensive guide covering:
- How to run queries (4 methods)
- Recording results template
- Interpreting results
- Troubleshooting
- Next steps if tests fail

**Use this for:** Understanding how to execute tests and what results mean

### 3. **../../../scripts/verification/run_verification_queries.mjs** (Node.js)

Automated verification script that:
- Connects to Supabase via service role key
- Runs all verification queries
- Displays formatted results
- Suitable for CI/CD integration

**Use this for:** Automated testing if API key available

### 4. **../../../scripts/verification/run_verification.py** (Python)

Python implementation of verification that:
- Connects using Supabase Python client
- Runs all scenarios
- Generates JSON report
- Machine-readable output

**Use this for:** Python-based automation or scripting

### 5. **../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md**

The test input document containing:
- Part 1: Character introduction (Leo Frostborne)
- Part 2-3: Cabinet entities (wooden and glass)
- Part 4-6: Additional character details and abilities

**Reference:** What the LLM should extract from

### 6. **VERIFICATION_PACKAGE_SUMMARY.md** (This File)

Quick reference guide to all verification materials

---

## Test Scenarios

### Scenario 1: Character Fields (Failure #1)

**What's Tested:** Extraction of structured character data

**Expected Outcome:**
- Leo Frostborne entity created
- height = "6 feet 2 inches"
- hair_color = "black"
- eye_color = "blue"
- All values synced to database

**Verification Queries:** 1.1, 1.2 in `VERIFICATION_QUERIES_EXECUTABLE.md`

### Scenario 2: Abilities & Objects (Failure #2 & #3)

**What's Tested:** 
- Relationship creation (abilities as relationships, not attributes)
- Object field preservation (Cabinet materials)

**Expected Outcome:**
- 4 ability entities
- 4 "has_ability" relationships
- 2 Cabinet objects with different materials

**Verification Queries:** 2.1, 2.2, 2.3, 2.4

### Scenario 3: Cabinet Identity (Failure #4 - CORE FIX)

**What's Tested:** Conflict detection and entity separation

**Expected Outcome:**
- **Exactly 2 Cabinet entities** (not 1, not 3+)
- Cabinet A: wood material, 5 mentions
- Cabinet B: glass material, 1 mention
- **Different UUIDs** (UUID_A ≠ UUID_B)

**Verification Queries:** 3.1, 3.2, 3.3

**⚠️ CRITICAL:** If you see only 1 Cabinet, Failure #4 is NOT fixed

### Scenario 4: Main/Branch Isolation

**What's Tested:** Layer bootstrapping and isolation

**Expected Outcome:**
- All entities have layer='main'
- All branch_id=NULL
- No branch overlay records
- 7 total entities (1 character + 4 abilities + 2 objects)

**Verification Queries:** 4.1, 4.2, 4.3, 4.4

---

## Quick Start (5 Minutes)

### Option A: Manual Verification (Recommended)

1. Open `VERIFICATION_QUERIES_EXECUTABLE.md`
2. Go to https://app.supabase.com
3. Open SQL Editor
4. Copy first query (1.1)
5. Paste and run
6. Compare result to "Expected"
7. Record as ✅ PASS or ❌ FAIL
8. Repeat for remaining queries

### Option B: Automated (Requires API Key)

```bash
# Set your service role key
export SUPABASE_SERVICE_ROLE_KEY="your_key_here"

# Run Python verification
python3 ../../../scripts/verification/run_verification.py

# Or Node.js
node ../../../scripts/verification/run_verification_queries.mjs
```

---

## Expected Results Summary

### If All Tests PASS:

```
✅ Leo Frostborne: 1 entity with height, hair_color, eye_color
✅ Abilities: 4 entities (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)
✅ Relationships: 4 has_ability links from Leo to each ability
✅ Cabinets: 2 entities (wood and glass) with different UUIDs
✅ Main Layer: 7 total entities, all layer='main', all branch_id=NULL
✅ No Overlays: 0 branch overlay records

RESULT: ✅ CONTROLLED EXTRACTION TEST PASSES
```

### If Tests FAIL:

**Critical Issues:**
- Cabinet count = 1 → Failure #4 NOT fixed (Cabinets merged)
- UUID_A = UUID_B → Critical bug (same ID for different entities)

**Medium Issues:**
- Leo fields NULL → Failure #1 (extraction issue)
- No relationships → Failure #2 (relationship creation broken)
- 1 Cabinet → Failure #3 (object fields lost)

**Low Issues:**
- Values missing from table → Sync issue
- branch_id set on Main → Isolation issue

---

## Project Context

**Project Name:** Literary Assistant  
**Supabase URL:** `https://lqfqfzqcrqluxanhnjwu.supabase.co`  
**Test Project ID:** `6c4b7b92-214a-4785-ad66-e62527ee68d6`  
**Database:** Supabase PostgreSQL  

### Key Tables:
- `knowledge_entities` - Entity records
- `knowledge_entity_values` - Extracted field values
- `knowledge_entity_relationships` - Entity relationships
- `knowledge_entity_mentions` - Entity mentions in text
- `knowledge_branch_entities` - Branch-layer overlays
- `raw_extractions` - LLM response records

---

## Files Checklist

- [ ] `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md` - Test input document
- [ ] `VERIFICATION_QUERIES_EXECUTABLE.md` - Main SQL queries
- [ ] `VERIFICATION_EXECUTION_GUIDE.md` - How-to guide
- [ ] `../../../scripts/verification/run_verification_queries.mjs` - Node.js automation
- [ ] `../../../scripts/verification/run_verification.py` - Python automation
- [ ] `VERIFICATION_PACKAGE_SUMMARY.md` - This file

---

## How to Use This Package

### Step 1: Choose Your Method

| Method | Setup | Complexity | Best For |
|--------|-------|-----------|----------|
| Manual (Dashboard) | None | Low | Single verification, no automation |
| Node.js Script | npm install, API key | Medium | CI/CD, developers |
| Python Script | pip install, API key | Medium | Data analysis, reporting |

### Step 2: Run Queries

- **Manual:** Copy queries from `VERIFICATION_QUERIES_EXECUTABLE.md`
- **Automated:** Run script, collect JSON output

### Step 3: Record Results

- **Manual:** Use template in `VERIFICATION_EXECUTION_GUIDE.md`
- **Automated:** Script generates `../../../tests/results/VERIFICATION_REPORT.json`

### Step 4: Analyze

- Compare results to expected values in `VERIFICATION_QUERIES_EXECUTABLE.md`
- Identify failures using troubleshooting guide
- Document issues and next steps

---

## Verification Workflow

```
┌─────────────────────────────────────────────────┐
│ 1. Choose Verification Method                    │
│    - Manual (Dashboard)                          │
│    - Python Script                               │
│    - Node.js Script                              │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ 2. Execute Queries                               │
│    - Run all 4 scenarios                         │
│    - Collect results                             │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ 3. Compare Results                               │
│    - Check each result vs. Expected              │
│    - Mark PASS/FAIL                              │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ 4. Generate Report                               │
│    - Manual: Document in text file               │
│    - Automated: JSON file generated              │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ 5. Analyze Failures (if any)                     │
│    - Use troubleshooting guide                   │
│    - Check raw extraction                        │
│    - Document issues                             │
└─────────────────────────────────────────────────┘
```

---

## Key Insights

### Why This Test Matters

The controlled extraction test validates the **core consolidation logic** - specifically:

1. **Entity consolidation** - Same entity mentioned multiple times = 1 UUID
2. **Conflict detection** - Different contexts = different entities
3. **Field preservation** - Object attributes (materials, etc.) survive extraction
4. **Relationship creation** - Abilities stored as relationships, not strings
5. **Layer isolation** - Main and Branch layers properly separated

### What Failure #4 Bug Was

The Cabinet identity bug (Failure #4) showed that the system incorrectly merged two different Cabinet entities (wooden with magical properties vs. glass with herbs) into a single entity despite having:
- Different materials (wood vs glass)
- Different contexts (magical vs practical)
- Different locations (ancient library vs cottage)

**The Fix:** Proper conflict detection and entity separation

---

## Verification Checklist for Tester

- [ ] Read `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md` to understand test data
- [ ] Choose verification method (Manual recommended for first run)
- [ ] Execute all queries in `VERIFICATION_QUERIES_EXECUTABLE.md`
- [ ] Record results in `VERIFICATION_RESULTS.txt`
- [ ] Verify all scenarios pass
- [ ] If failures detected, refer to troubleshooting guide
- [ ] Save results file for documentation

---

## After Verification

### If All Tests Pass ✅

1. Document results with timestamp
2. Confirm extraction working correctly
3. Consider test complete
4. Archive verification results

### If Tests Fail ❌

1. Identify which scenario failed
2. Review raw LLM response: `SELECT raw_response FROM raw_extractions WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6' ORDER BY created_at DESC LIMIT 1;`
3. Check consolidation logic
4. Run extraction again to verify reproducibility
5. Document issue with specific failure details

---

## Support & Troubleshooting

### No Results Returned
- Verify project exists: Run `SELECT * FROM projects WHERE id = '6c4b7b92-214a-4785-ad66-e62527ee68d6';`
- Check if extraction was run
- Verify correct project ID

### Permission Errors
- Using wrong API key (anon instead of service role)
- Use `SUPABASE_SERVICE_ROLE_KEY`, not anon key

### Unexpected Results
- See `VERIFICATION_EXECUTION_GUIDE.md` troubleshooting section
- Review raw extraction for LLM response
- Check consolidation logs

---

## References

- **Test Document:** `../../../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md`
- **Known Issues:** `./FAILURE_ANALYSIS_AND_FIXES.md`
- **Architecture:** `../implementation/IMPLEMENTATION_SUMMARY.md`
- **Database Schema:** `../migrations/MIGRATION_111_COMPLETE_REFERENCE.md`

---

## Contact & Documentation

For detailed information about:
- **How to run queries:** See `VERIFICATION_EXECUTION_GUIDE.md`
- **Expected results:** See `VERIFICATION_QUERIES_EXECUTABLE.md`
- **Database schema:** Check project documentation
- **Known failures:** See `./FAILURE_ANALYSIS_AND_FIXES.md`

---

**Package Version:** 1.0  
**Test Version:** Controlled Extraction v1  
**Status:** ✅ Ready for Execution

**Next Step:** Choose your verification method and start with `VERIFICATION_QUERIES_EXECUTABLE.md`
