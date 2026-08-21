# 📊 Extraction Data Flow & Diagnostic Analysis Points

This document shows where data flows through the system and where the diagnostic collects information.

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     EXTRACTION DATA FLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

1. USER ACTION (Web App)
   ├─ Creates Project
   ├─ Uploads Document
   └─ Clicks "Extract"
        ↓

2. SERVER RECEIVES REQUEST
   ├─ validate input
   └─ invoke extract-knowledge Edge Function
        ↓

3. EDGE FUNCTION (Supabase)
   ├─ Chunks document
   ├─ Creates document_chunks table entries
   │  ↓
   ├─ FOR EACH CHUNK:
   │  ├─ Sends to Gemini API
   │  ├─ Receives raw JSON response  ⭐ DIAGNOSTIC POINT A
   │  ├─ Stores in raw_extractions.raw_response (JSONB)
   │  ├─ Parses JSON response
   │  ├─ Creates knowledge_entities table entries
   │  └─ Creates relationships
   │  ↓
   └─ Returns summary
        ↓

4. DATABASE STORAGE
   ├─ raw_extractions TABLE
   │  └─ raw_response: {"characters": [...], "abilities": [...]}  ⭐ KEY DATA
   │
   ├─ knowledge_entities TABLE
   │  └─ entity_type: 'character', 'ability', 'magic_ability'
   │
   └─ knowledge_entity_relationships TABLE
      └─ Links characters to abilities
           ↓

5. DIAGNOSTIC QUERIES  ⭐ THE DIAGNOSTIC HAPPENS HERE
   ├─ Fetch raw_extractions
   ├─ Parse raw_response JSON
   ├─ Compare with expected schema
   ├─ Test three hypotheses
   └─ Generate recommendations
        ↓

6. USER SEES RESULTS
   ├─ Terminal output
   └─ JSON report file
```

---

## Where The Diagnostic Analyzes

### Data Sources

The diagnostic only reads from:

```sql
SELECT * FROM raw_extractions 
ORDER BY created_at DESC 
LIMIT 3;
```

This table contains:

| Column | Purpose | Used By Diagnostic |
|--------|---------|-------------------|
| `id` | Unique identifier | For reference |
| `raw_response` | Full JSON from Gemini | ✅ ANALYZED |
| `model` | Model name | Shown in output |
| `chunks_count` | How many chunks | Shown in output |
| `created_at` | When extracted | Shown in output |
| `total_tokens` | Token usage | Shown in output |

### The "raw_response" Field

This is the **key field** containing the Gemini API response:

```json
{
  "characters": [
    {
      "name": "Leo Frost",
      "aliases": ["Leo"],
      "description": "...",
      "abilities": ["ability1", "ability2"],
      "magic_abilities": ["magic1"],
      "evidence": ["..."]
    }
  ],
  "abilities": [
    {
      "name": "Sword mastery",
      "ability_type": "physical",
      "users": ["Leo Frost"],
      "description": "...",
      "evidence": ["..."]
    }
  ],
  "magic_abilities": [
    {
      "name": "Telekinesis",
      "ability_type": "magical",
      "users": ["Character Name"],
      "description": "...",
      "evidence": ["..."]
    }
  ],
  "locations": [
    {
      "name": "Troneheim",
      "aliases": ["..."],
      "location_type": "city",
      "description": "..."
    }
  ]
}
```

The diagnostic checks:
1. Does `raw_response` exist? (Is it NULL?)
2. Can we parse it as JSON?
3. Do the expected arrays exist?
4. How many items in each array?
5. Is each array actually an array type?

---

## Three Test Scenarios

### Scenario A: Empty Arrays

**What we see in raw_response:**

```json
{
  "characters": [],
  "abilities": [],
  "magic_abilities": [],
  "locations": []
}
```

**Diagnostic Output:**

```
⚠️  characters array is EMPTY
⚠️  abilities array is EMPTY
⚠️  magic_abilities array is EMPTY

❌ A) GEMINI RETURNING EMPTY ARRAYS: YES
   → Gemini IS receiving the prompt but choosing not to extract
```

**Root Cause:**
- Gemini received the prompt
- But didn't extract anything
- Likely: Prompt needs better instructions

**Where to Fix:**
- File: `supabase/functions/extract-knowledge/index.ts`
- Look for: Prompt construction
- Solution: Add explicit examples, clearer instructions

---

### Scenario B: Missing or Wrong Fields

**What we see in raw_response:**

```json
{
  "characters": [...],
  "extracted_abilities": [],      // ← Wrong field name!
  "extracted_magic_abilities": [],
  "locations": [...]
}
```

**Diagnostic Output:**

```
❌ abilities is NOT an array (type: undefined)
❌ magic_abilities is NOT an array (type: undefined)

❌ C) WRONG RESPONSE FORMAT: YES
   → All responses have wrong format
```

**Root Cause:**
- Gemini is using different field names
- Or response schema changed

**Where to Fix:**
- File: `supabase/functions/extract-knowledge/index.ts`
- Look for: Response parsing/mapping
- Solution: Update field name mapping

---

### Scenario C: Parse Error

**What happens:**

```
raw_response is a valid JSONB but contains:
{
  "error": "Failed to parse",
  "error_code": 400
}
```

**Diagnostic Output:**

```
❌ JSON parse failed: SyntaxError: Unexpected token

❌ B) RESPONSE NOT PARSED CORRECTLY: YES
   - JSON parse failures: 2
```

**Root Cause:**
- Gemini response isn't valid JSON
- Or contains special characters
- Or is truncated

**Where to Fix:**
- File: `supabase/functions/extract-knowledge/index.ts`
- Look for: JSON.parse() calls
- Solution: Better validation, error handling

---

## Data Transformation Chain

```
┌──────────────────┐
│  Gemini API      │
│  Returns String  │
└────────┬─────────┘
         │ (raw string JSON)
         ↓
┌──────────────────────────────────┐
│  Stored as JSONB in Database     │
│  raw_extractions.raw_response    │
└────────┬─────────────────────────┘
         │
         ↓ (diagnostic fetches it)
┌──────────────────────────────────┐
│  Diagnostic Script Analyzes      │  ⭐ DIAGNOSTIC HERE
│  (This is what we're doing)      │
└────────┬─────────────────────────┘
         │
         ↓
    ┌────────────────────┐
    │ Test Hypothesis A  │ ← Is it an empty array?
    │ Test Hypothesis B  │ ← Did JSON parse fail?
    │ Test Hypothesis C  │ ← Is structure wrong?
    └────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│  Generate Diagnosis & Report     │
│  - Which hypothesis confirmed?   │
│  - What's the root cause?        │
│  - What to fix?                  │
└──────────────────────────────────┘
```

---

## How Diagnostic Checks Each Hypothesis

### Hypothesis A: Empty Arrays

**Check:**
```javascript
const hasAbilities = Array.isArray(response.abilities);
if (hasAbilities) {
  const count = response.abilities.length;
  if (count === 0) {
    // Hypothesis A confirmed: empty array exists but has 0 items
  }
}
```

**What it means:**
- Field exists ✓
- It's an array ✓
- But it's empty ✗

**Diagnosis:** Gemini didn't extract

---

### Hypothesis B: Parse Failures

**Check:**
```javascript
let json;
try {
  json = JSON.parse(response);
} catch (e) {
  // Hypothesis B confirmed: can't parse
}
```

**What it means:**
- Response isn't valid JSON
- String contains unexpected characters
- Encoding issue

**Diagnosis:** Storage or transmission failed

---

### Hypothesis C: Wrong Format

**Check:**
```javascript
const hasAbilities = Array.isArray(response.abilities);
if (!hasAbilities) {
  // Either:
  // - Field doesn't exist (undefined)
  // - It's null
  // - It's a string, not array
  // - It's named differently
}
```

**What it means:**
- Expected field missing OR
- Field exists but wrong type OR
- Field named something else

**Diagnosis:** Schema mismatch

---

## Database Schema (Diagnostic Perspective)

The diagnostic only cares about these columns:

```sql
CREATE TABLE raw_extractions (
  id UUID,                    -- Reference ID
  raw_response JSONB,         -- ⭐ The data we analyze
  model TEXT,                 -- Show in output
  chunks_count INT,           -- Show in output
  created_at TIMESTAMP,       -- Show in output
  total_tokens INT            -- Show in output
);
```

All other columns are ignored.

The `raw_response` JSONB can contain:

```json
{
  "characters": [...],        // Checked: exists? array? count?
  "abilities": [...],         // Checked: exists? array? count?
  "magic_abilities": [...],   // Checked: exists? array? count?
  "locations": [...],         // Checked: exists? array? count?
  "error": "..."              // Checked: is there an error message?
}
```

---

## Analysis Logic Flow

```
START: Fetch raw_extractions
  ↓
FOR EACH extraction:
  ↓
  1. Get raw_response JSON
  ↓
  2. Try to parse it
     ├─ Parse fails? → Hypothesis B confirmed
     └─ Parse OK? → Continue
  ↓
  3. Check for expected arrays
     ├─ arrays exist? → Good
     ├─ arrays missing? → Hypothesis C confirmed
     └─ arrays null? → Hypothesis C confirmed
  ↓
  4. Check array lengths
     ├─ All have items? → All good
     ├─ Some empty? → Hypothesis A confirmed
     └─ Can't determine type? → Hypothesis C confirmed
  ↓
  5. Collect statistics
     ├─ Count items in each array
     ├─ Show first character details
     └─ Show sample content
  ↓
END: Generate summary + recommendations
```

---

## Report Output Structure

The diagnostic generates:

```
diagnostic_extraction_report_YYYY-MM-DD-HH-MM-SS.json
{
  "timestamp": "...",
  "summary": {
    "extractionsAnalyzed": 3,
    "hasCharactersCount": 3,
    "hasAbilitiesCount": 3,
    "hasMagicAbilitiesCount": 0,  // ← This would indicate problem
    "totalCharacters": 5,
    "totalAbilities": 8,
    "totalMagicAbilities": 0      // ← Problem shown here
  },
  "extractions": [
    {
      "id": "uuid",
      "model": "gemini-2.0-flash",
      "created_at": "timestamp",
      "analysis": {
        "hasCharacters": true,
        "hasAbilities": false,     // ← Flag: no abilities found
        "hasMagicAbilities": false,
        "characterCount": 5,
        "abilitiesCount": 0,       // ← Root cause identified
        "magicAbilitiesCount": 0
      },
      "raw_response": {...}        // ← Full response for inspection
    }
  ]
}
```

---

## How to Trace Issues

### If Abilities Are Empty

1. **Get the raw_response JSON**
   - From diagnostic output or JSON report
   - Section: `extractions[0].raw_response`

2. **Check the abilities array**
   - Search for: `"abilities":`
   - Check if it's: `[]` (empty) or missing entirely

3. **Find the prompt**
   - File: `supabase/functions/extract-knowledge/index.ts`
   - Search for: ability extraction prompt
   - Compare what prompt says vs what Gemini did

4. **Fix and retry**
   - Update prompt
   - Run extraction again
   - Rerun diagnostic

### If Parse Fails

1. **Check raw_response format**
   - Is it valid JSON?
   - Look for: unescaped quotes, control characters

2. **Check encoding**
   - Hebrew text might have encoding issues
   - Check: UTF-8 handling in code

3. **Check truncation**
   - Is response cut off?
   - Check: total_tokens in metadata

### If Fields Are Wrong

1. **Compare field names**
   - What does prompt request?
   - What does response contain?
   - Are names different?

2. **Check schema mapping**
   - File: `supabase/functions/extract-knowledge/index.ts`
   - Look for: field name mapping
   - Update if needed

---

## Key Metrics Tracked

The diagnostic tracks:

```
For each extraction:
  ├─ Created timestamp
  ├─ Model name
  ├─ Chunks processed
  ├─ Token usage
  ├─ Response structure validation
  ├─ Array existence checks
  ├─ Array population checks
  └─ Sample content extraction

Overall statistics:
  ├─ Total extractions analyzed
  ├─ Percentage with characters
  ├─ Percentage with abilities
  ├─ Percentage with magic_abilities
  ├─ Total entities extracted
  ├─ Hypothesis A occurrences
  ├─ Hypothesis B occurrences
  ├─ Hypothesis C occurrences
  └─ Recommendations generated
```

---

## Quick Reference: What Gets Analyzed

```
✅ ANALYZED:
- raw_response JSON structure
- Array existence (characters, abilities, magic_abilities)
- Array types (is it really an array?)
- Array population (how many items?)
- Field names in response
- Error messages in response
- Token usage statistics

❌ NOT ANALYZED:
- knowledge_entities table
- knowledge_entity_relationships table
- knowledge_entity_values table
- Any data outside raw_extractions

Note: We only look at raw Gemini responses,
not what the database created from them.
This isolates the problem to extraction vs. parsing.
```

This focused analysis makes it fast to identify where the breakdown occurs!
