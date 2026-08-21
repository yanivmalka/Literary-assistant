# 🔧 Extraction Diagnostic Toolkit

This toolkit helps diagnose why ability extraction might not be working by analyzing raw Gemini API responses.

## The Core Problem

Entities (characters, abilities, locations) aren't being extracted from documents. This could be:

**A) Gemini returns empty arrays** - Not extracting even though prompted to  
**B) Parsing fails** - Gemini extracts but response gets corrupted  
**C) Wrong format** - Response structure doesn't match expectations  

This toolkit determines which one is happening.

---

## Quick Start

### 1. Prepare Data (One-Time Setup)

Run an extraction via the web app:

```
1. Open http://localhost:5173
2. Sign up/login
3. Create a project
4. Upload a document
5. Click "Extract Entities"
```

### 2. Run The Diagnostic

```bash
# Automated analysis (easiest)
node ../../scripts/diagnostics/diagnostic_extraction_analysis.mjs

# Or manual SQL queries
# See ../../supabase/sql/diagnostics/DIAGNOSTIC_SQL_QUERIES.sql
```

### 3. Read The Results

The output clearly indicates which hypothesis is confirmed:

```
❌ A) GEMINI RETURNING EMPTY ARRAYS: YES
   → Gemini is not extracting abilities

✓ B) RESPONSE NOT PARSED CORRECTLY: NO
✓ C) WRONG RESPONSE FORMAT: NO
```

Then check **Recommendations** section for next steps.

---

## Tools Included

### 1. `../../scripts/diagnostics/diagnostic_extraction_analysis.mjs` (Recommended)
**What it does**: Automated analysis of the last 3 extractions  
**How to run**: `node ../../scripts/diagnostics/diagnostic_extraction_analysis.mjs`  
**Output**: Terminal report + JSON file  
**Best for**: Quick diagnosis with clear recommendations  

Features:
- ✓ Fetches data directly from Supabase
- ✓ Analyzes JSON structure
- ✓ Hypothesis testing
- ✓ Saves detailed report
- ✓ Clear action items

### 2. `../../supabase/sql/diagnostics/DIAGNOSTIC_SQL_QUERIES.sql`
**What it does**: SQL queries for manual inspection  
**How to use**: Copy-paste into Supabase SQL Editor  
**Output**: Query results in Supabase UI  
**Best for**: Deep-dive analysis or when Node.js is unavailable  

Includes queries for:
- ✓ Last 3 extractions metadata
- ✓ Full raw response
- ✓ Array structure validation
- ✓ Field type checking
- ✓ Entity creation summary

### 3. `DIAGNOSTIC_GUIDE.md`
**What it is**: Detailed documentation  
**Best for**: Understanding output and interpreting results  

Covers:
- ✓ What each output means
- ✓ Example outputs (good vs bad)
- ✓ Troubleshooting
- ✓ What the prompt expects
- ✓ Next steps per diagnosis

### 4. `../../scripts/diagnostics/run_extraction_for_diagnostic.mjs`
**What it does**: Helper to set up test data  
**How to run**: `node ../../scripts/diagnostics/run_extraction_for_diagnostic.mjs`  
**Output**: Instructions for creating test data  
**Best for**: First-time setup  

---

## Typical Output

### When Extraction Works ✅

```
📊 DIAGNOSTIC SUMMARY

✓ A) GEMINI RETURNING EMPTY ARRAYS: NO
   → All arrays have content

✓ B) RESPONSE NOT PARSED CORRECTLY: NO
   → All responses parsed successfully

✓ C) WRONG RESPONSE FORMAT: NO
   → All responses have expected format

📈 STATISTICS:
   Total characters extracted: 3
   Total abilities extracted: 8
   Total magic abilities extracted: 4

✅ All checks passed! Extraction is working correctly.
```

### When Abilities Are Empty ❌

```
📊 DIAGNOSTIC SUMMARY

❌ A) GEMINI RETURNING EMPTY ARRAYS: YES (3/3)
   → Gemini IS receiving the prompt but choosing not to extract

✓ B) RESPONSE NOT PARSED CORRECTLY: NO
✓ C) WRONG RESPONSE FORMAT: NO

💡 RECOMMENDATIONS:
1. CHECK GEMINI PROMPT
   → Add explicit instructions for abilities extraction
   → Verify prompt includes examples of ability objects
   → Check if prompt is actually being sent
```

### When JSON Parse Fails ❌

```
❌ B) RESPONSE NOT PARSED CORRECTLY: YES
   - JSON parse failures: 2
   - Missing expected fields: 1

💡 RECOMMENDATIONS:
2. CHECK JSON PARSING LOGIC
   → Verify response is valid JSON
   → Check for string encoding issues
   → Validate response schema matches expectations
```

---

## Output Files

The diagnostic creates:

```
diagnostic_extraction_report_YYYY-MM-DD-HH-MM-SS.json
```

Contains:
- Complete raw responses
- Analysis for each extraction
- Summary statistics
- Array contents

**Check this file for the actual Gemini responses!**

---

## Step-by-Step Usage

### Step 1: Verify You Have Data

```bash
node ../../scripts/diagnostics/diagnostic_extraction_analysis.mjs
```

Expected output: Either diagnostic results or "No extractions found"

### Step 2: If No Data, Create It

```bash
node ../../scripts/diagnostics/run_extraction_for_diagnostic.mjs
```

This shows you how to add data via the web app.

### Step 3: Inspect Results

Look for:

1. **EXTRACTION METADATA** section
   - How many extractions found?
   - When did they run?

2. **EXTRACTION #N ANALYSIS** sections
   - Is `characters` an array or NULL?
   - Is `abilities` populated or empty?
   - Is `magic_abilities` populated or empty?

3. **DIAGNOSTIC SUMMARY** section
   - Which hypothesis is confirmed?
   - What are the recommendations?

### Step 4: Take Action

Based on the diagnosis:

**If A (Empty Arrays):**
- Check the prompt in `supabase/functions/extract-knowledge/index.ts`
- Verify Gemini is being sent the right instructions
- Test with the sample Hebrew text

**If B (Parse Failures):**
- Check JSON parsing logic in extraction function
- Log the raw response before parsing
- Validate response structure

**If C (Wrong Format):**
- Check what field names Gemini is using
- Update schema mappings if needed
- Add field name translations

---

## Interpretation Guide

### Top-Level Structure

The diagnostic shows what keys exist in the response:

```
Keys: characters, abilities, magic_abilities, locations
```

Expected keys should include `characters` and `abilities` and `magic_abilities`.

### Array Checks

For each array, the diagnostic shows:

```
✓ Found abilities array: 4 items
```

This means:
- ✓ The field exists
- ✓ It's an array (not NULL or string)
- ✓ It has 4 items

If you see:

```
❌ abilities is NOT an array (type: null)
```

This means:
- ❌ The field doesn't exist OR
- ❌ It's NULL OR
- ❌ It's a string, not an array

### Character Details

The diagnostic drills into the first character:

```
Name: Leo Frost
Abilities (4):
  - Sword mastery
  - Hand-to-hand combat
  - Cold resistance
  - Physical strength
Magic Abilities (2):
  - Telekinesis
  - Fire magic
```

This tells you:
- ✓ Character was extracted
- ✓ Abilities list exists and has 4 items
- ✓ Magic abilities list exists and has 2 items

---

## Common Issues and Solutions

### "No extractions found"
**Cause**: No data in database yet  
**Solution**: Run extraction via web app (Step 1 above)

### "abilities is NOT an array (type: undefined)"
**Cause**: Field name might be wrong or missing from response  
**Solution**: Check the prompt and Gemini's response format

### "abilities array is EMPTY"
**Cause**: Gemini received prompt but didn't extract anything  
**Solution**: Check Gemini prompt instructions

### "JSON parse failed"
**Cause**: Response isn't valid JSON  
**Solution**: Check response encoding and formatting

### "No authenticated user found"
**Cause**: Running the helper without being logged in  
**Solution**: Log in via web app first

---

## Alternative: Using SQL Directly

If you prefer raw SQL, use `../../supabase/sql/diagnostics/DIAGNOSTIC_SQL_QUERIES.sql`:

```sql
-- See the last raw response
SELECT raw_response FROM raw_extractions 
ORDER BY created_at DESC LIMIT 1;

-- See what arrays it contains
SELECT 
  jsonb_array_length(raw_response -> 'characters') as char_count,
  jsonb_array_length(raw_response -> 'abilities') as ability_count,
  jsonb_array_length(raw_response -> 'magic_abilities') as magic_count
FROM raw_extractions 
ORDER BY created_at DESC LIMIT 1;
```

---

## Files in This Diagnostic Package

| File | Purpose | Usage |
|------|---------|-------|
| `../../scripts/diagnostics/diagnostic_extraction_analysis.mjs` | Main diagnostic | `node ../../scripts/diagnostics/diagnostic_extraction_analysis.mjs` |
| `DIAGNOSTIC_GUIDE.md` | Detailed docs | Read for interpretation help |
| `../../supabase/sql/diagnostics/DIAGNOSTIC_SQL_QUERIES.sql` | Manual queries | Copy-paste to SQL editor |
| `DIAGNOSTIC_README.md` | This file | Quick reference |
| `../../scripts/diagnostics/run_extraction_for_diagnostic.mjs` | Setup helper | `node ../../scripts/diagnostics/run_extraction_for_diagnostic.mjs` |

---

## Next Steps

### For Developers

1. **Identify** which hypothesis is confirmed
2. **Locate** the relevant code
3. **Fix** the issue
4. **Rerun** diagnostic to verify fix

### For Troubleshooters

1. **Gather** diagnostic output
2. **Share** the report JSON
3. **Reference** specific findings
4. **Track** changes as you test fixes

### For Documentation

1. **Understand** what the diagnostic shows
2. **Reference** example outputs
3. **Explain** findings to team
4. **Document** the fix in code comments

---

## Questions?

- Read `DIAGNOSTIC_GUIDE.md` for detailed explanations
- Check `../../supabase/sql/diagnostics/DIAGNOSTIC_SQL_QUERIES.sql` for alternative queries
- Review example outputs above
- Check the recommendation section in diagnostic output

The diagnostic is designed to give you **clear, actionable results** that point directly to the problem.
