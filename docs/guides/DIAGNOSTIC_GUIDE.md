# 🔍 Extraction Diagnostic Guide

## Purpose

This diagnostic script analyzes raw Gemini API responses stored in the Supabase `raw_extractions` table to determine **why abilities extraction might be failing**.

It answers three critical questions:

**A) Is Gemini returning empty arrays?**
- Gemini is receiving the prompt but choosing not to extract abilities

**B) Are responses being lost in parsing/storage?**
- Gemini extracts abilities but they're lost during JSON parsing or database storage

**C) Is the response format wrong?**
- The JSON structure Gemini returns doesn't match what the code expects

---

## What The Diagnostic Shows

For each of the last 3 extractions:

1. **Metadata**
   - Timestamp (when extraction ran)
   - Model used (e.g., gemini-2.0-flash)
   - Number of chunks processed
   - Token usage

2. **Response Structure Analysis**
   - Top-level keys in the JSON
   - Whether `characters[]` exists and how many items
   - Whether `abilities[]` exists and how many items
   - Whether `magic_abilities[]` exists and how many items

3. **Character-Level Detail**
   - For the first character extracted:
     - Name
     - How many abilities listed
     - How many magic_abilities listed
     - Sample ability names

4. **Array Content**
   - Actual JSON for each extracted ability
   - Actual JSON for each magic_ability
   - Whether arrays are truly empty or contain items

5. **Diagnostic Summary**
   - **Hypothesis A Testing**: Are we getting empty arrays?
   - **Hypothesis B Testing**: Are there JSON parse errors?
   - **Hypothesis C Testing**: Are fields missing entirely?
   - **Statistics**: Total characters, abilities, magic_abilities extracted

6. **Recommendations**
   - Specific actions based on what was found

---

## How To Use

### Step 1: Set Up Data

You need at least one extraction in the database. Do this via the web app:

```
1. Open http://localhost:5173
2. Sign up or log in
3. Create a new project
4. Upload a document (can be any text, Hebrew recommended for testing)
5. Click "Extract Entities"
6. Wait for extraction to complete
```

### Step 2: Run The Diagnostic

```bash
node ../../scripts/diagnostics/diagnostic_extraction_analysis.mjs
```

### Step 3: Interpret Results

The output will show:

#### ✓ Good Signs
- `characters array: 5 items` ✓
- `abilities array: 8 items` ✓
- `magic_abilities array: 3 items` ✓

#### ❌ Red Flags
- `characters array is EMPTY` - Check if document chunks are being created
- `abilities is NOT an array (type: null)` - Check if field name is wrong
- `JSON parse failed` - Check raw response format
- `abilities: NOT AN ARRAY (type: undefined)` - Field is missing from response

---

## Understanding The Output

### Example Output: All Working

```
═══════════════════════════════════════════════════════════════════════════
📊 EXTRACTION #1 ANALYSIS
═══════════════════════════════════════════════════════════════════════════

🔍 Top-Level Structure:
   Keys: characters, abilities, magic_abilities, locations

📋 CHARACTERS Array:
   ✓ Found characters array: 3 items
   First character keys: name, aliases, abilities, magic_abilities, description

⚡ ABILITIES Array (top-level):
   ✓ Found abilities array: 4 items
   Sample abilities: Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength

✨ MAGIC_ABILITIES Array (top-level):
   ✓ Found magic_abilities array: 2 items
   Sample magic abilities: Telekinesis, Fire magic
```

### Example Output: Empty Arrays

```
═══════════════════════════════════════════════════════════════════════════
📊 EXTRACTION #1 ANALYSIS
═══════════════════════════════════════════════════════════════════════════

⚡ ABILITIES Array (top-level):
   ✓ Found abilities array: 0 items
   ⚠️  abilities array is EMPTY

✨ MAGIC_ABILITIES Array (top-level):
   ✓ Found magic_abilities array: 0 items
   ⚠️  magic_abilities array is EMPTY
```

**→ This means Hypothesis A is likely: Gemini isn't extracting abilities**

### Example Output: Missing Field

```
⚡ ABILITIES Array (top-level):
   ❌ abilities is NOT an array (type: undefined)

✨ MAGIC_ABILITIES Array (top-level):
   ❌ magic_abilities is NOT an array (type: undefined)
```

**→ This means Hypothesis C is likely: Wrong response format**

---

## Detailed Diagnostic Sections

### 📊 DIAGNOSTIC SUMMARY

This section provides clear hypothesis testing:

```
🔍 HYPOTHESIS TESTING:

❌ A) GEMINI RETURNING EMPTY ARRAYS: YES (2/3)
   → Gemini IS receiving the prompt but choosing not to extract

✓ B) RESPONSE NOT PARSED CORRECTLY: NO
   → All responses parsed successfully with expected fields

✓ C) WRONG RESPONSE FORMAT: NO
   → All responses have expected format
```

**Read this section first** - it will tell you which hypothesis to investigate.

### 💡 RECOMMENDATIONS

Based on findings, the diagnostic will suggest:

**If A is YES:**
```
1. CHECK GEMINI PROMPT
   → Add explicit instructions for abilities extraction
   → Verify prompt includes examples of ability objects
   → Check if prompt is actually being sent
```

**If B is YES:**
```
2. CHECK JSON PARSING LOGIC
   → Verify response is valid JSON
   → Check for string encoding issues
   → Validate response schema matches expectations
```

**If C is YES:**
```
3. CHECK RESPONSE SCHEMA
   → Verify Gemini is returning required fields
   → Check for field name mismatches
   → Validate nested object structure
```

---

## Output Files

The diagnostic saves a JSON report:

```
diagnostic_extraction_report_2024-12-XX-HH-MM-SS.json
```

This file contains:
- Summary statistics
- Full raw responses for each extraction
- Analysis results for each extraction
- Exact arrays returned by Gemini

---

## Troubleshooting

### "No extractions found"
**Solution**: Run an extraction via the web app first (see Step 1)

### "Invalid API key"
**Solution**: The script uses the anon key hardcoded. If this fails, check:
- Is Supabase running?
- Is the URL correct?
- Are you connected to the internet?

### "No projects found"
**Solution**: Create a project via the web app first

### Response shows NULL for raw_response
**Solution**: The extraction likely failed. Check the server logs or network tab in browser dev tools

---

## What The Prompt Requests

The extraction prompt tells Gemini to return:

```json
{
  "characters": [
    {
      "name": "...",
      "aliases": ["..."],
      "description": "...",
      "abilities": ["..."],
      "magic_abilities": ["..."],
      "evidence": ["..."]
    }
  ],
  "abilities": [
    {
      "name": "...",
      "ability_type": "physical|combat",
      "description": "...",
      "users": ["..."],
      "evidence": ["..."]
    }
  ],
  "magic_abilities": [
    {
      "name": "...",
      "ability_type": "magical|supernatural",
      "description": "...",
      "users": ["..."],
      "evidence": ["..."]
    }
  ],
  "locations": [...]
}
```

**The diagnostic compares what Gemini actually returned against this structure.**

---

## Example: Full Diagnostic Output

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    EXTRACTION DIAGNOSTIC TOOL                              ║
║          Analyzing raw Gemini responses for ability extraction              ║
╚════════════════════════════════════════════════════════════════════════════╝

📋 Checking existing projects and documents...
  Found 1 recent project(s):
    - Test Project (39c5af73-9baa-460c-b823-eeeee0a27978)
  Found 1 recent document(s):
    - Hebrew Test (39c5af73-9baa-460c-b823-eeeee0a27978)

📥 Fetching last 3 extractions from raw_extractions table...
✓ Found 1 extraction(s)

📋 EXTRACTION METADATA:

1. Created: 2024-12-16T18:45:23.456Z
   ID: 8f3d9c2a-1b4e-4f2c-9e1a-7b6c5d4e3f2a
   Model: gemini-2.0-flash
   Chunks: 5
   Tokens: 2147

⏳ Analyzing extraction 1...

════════════════════════════════════════════════════════════════════════════
📊 EXTRACTION #1 ANALYSIS
════════════════════════════════════════════════════════════════════════════

🔍 Top-Level Structure:
   Keys: characters, abilities, magic_abilities, locations

📋 CHARACTERS Array:
   ✓ Found characters array: 3 items
   First character keys: name, aliases, abilities, magic_abilities, description
   First character (partial):
     - name: Leo Frost
     - abilities: array(4)
     - magic_abilities: array(2)

⚡ ABILITIES Array (top-level):
   ✓ Found abilities array: 4 items
   Sample abilities: Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength

✨ MAGIC_ABILITIES Array (top-level):
   ✓ Found magic_abilities array: 2 items
   Sample magic abilities: Telekinesis, Fire magic

📝 CHARACTER DETAILS (First Character):
   Name: Leo Frost
   Abilities (4):
     - Sword mastery
     - Hand-to-hand combat
     - Cold resistance
     - Physical strength
   Magic Abilities (2):
     - Telekinesis
     - Fire magic


════════════════════════════════════════════════════════════════════════════
📊 DIAGNOSTIC SUMMARY
════════════════════════════════════════════════════════════════════════════

🔍 HYPOTHESIS TESTING:

✓ A) GEMINI RETURNING EMPTY ARRAYS: NO
   → All arrays have content

✓ B) RESPONSE NOT PARSED CORRECTLY: NO
   → All responses parsed successfully with expected fields

✓ C) WRONG RESPONSE FORMAT: NO
   → All responses have expected format

📈 STATISTICS:

   Total extractions analyzed: 1
   With characters array: 1
   With abilities array: 1
   With magic_abilities array: 1

   Total characters extracted: 3
   Total abilities extracted: 4
   Total magic abilities extracted: 2

💡 RECOMMENDATIONS:

✅ All checks passed! Extraction is working correctly.
```

---

## Next Steps After Diagnosis

### If Abilities Are Extracting Correctly
- The diagnostic will show ✓ marks and say all checks pass
- This means the extraction is working
- Check why abilities aren't showing in the UI (might be a database query issue)

### If Gemini Is Returning Empty Arrays (Hypothesis A)
1. Review the prompt in `supabase/functions/extract-knowledge/index.ts`
2. Add more explicit instructions
3. Add examples of abilities to extract
4. Test with simpler Hebrew text

### If Parsing Is Failing (Hypothesis B)
1. Check `supabase/functions/extract-knowledge/index.ts` for JSON parsing logic
2. Add better error handling
3. Log the raw response before parsing

### If Response Format Is Wrong (Hypothesis C)
1. Check what field names Gemini is using
2. Update the database schema if needed
3. Add a transformation layer to map field names

---

## Questions?

The diagnostic output will clearly indicate which hypothesis is confirmed, making it easy to:
1. Know what to investigate
2. Know where to look in the code
3. Know what to fix

**Run the diagnostic, read the summary section, then refer to the recommendations above.**
