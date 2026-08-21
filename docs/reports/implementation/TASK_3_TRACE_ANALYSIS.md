# Task #3: Trace Analysis - LLM JSON → Database Persistence

**Purpose:** Map the complete data flow for controlled test entities, identifying where information is preserved, lost, or duplicated.

---

## Trace Format

For each entity/relationship, we'll document:
```
INPUT (LLM JSON)
  ↓
NORMALIZATION (normalizeEntities)
  ↓
RESOLUTION (resolveExtractionCandidate)
  ↓
PERSISTENCE (INSERT/UPDATE)
  ↓
OUTPUT (Database row)
```

---

## Trace #1: Leo Frostborne Character

### INPUT: LLM JSON

```json
{
  "name": "Leo",
  "aliases": ["Leonardo", "Leonardo Frostborne", "Leo Frostborne"],
  "age": null,
  "gender": "male",
  "height": "6 feet 2 inches",
  "hair_color": "black",
  "eye_color": "blue",
  "description": "A human fighter known for exceptional strength",
  "abilities": [
    "Sword mastery",
    "Hand-to-hand combat",
    "Cold resistance",
    "Physical strength"
  ],
  "attributes": {
    "tattoo": "Wolf on left shoulder",
    "origin": "Northern mountains",
    "training": "Fighter from childhood"
  },
  "evidence": [
    "Leo Frostborne is a human fighter known for his exceptional strength",
    "Leo stands tall with piercing blue eyes and black hair tied in a braid",
    "Leo's height is approximately 6 feet 2 inches",
    "His tattoo of a wolf adorns his left shoulder"
  ]
}
```

### EXPECTED NORMALIZATION BEHAVIOR

**Input mentions across document:**
1. "Leo Frostborne" (Part 1)
2. "Leo" (Part 1)
3. "Leo" (Part 2, multiple)
4. "Leonardo Frostborne" (Part 4)
5. "Leo Frostborne" (Part 4, multiple)

**normalizeEntities() processing:**

```typescript
// First mention: "Leo Frostborne"
addEntity("Leo Frostborne", "character", {...});
// → entityMap.set("leo frostborne", NormalizedEntity)

// Second mention: "Leo"
addEntity("Leo", "character", {...});
// → Check: normalizeKey("leo") === normalizeKey("leo frostborne") ?
// → No (different keys)
// → Check: hasConflictingEntityContext(existing, incoming) ?
// → No (same character description, abilities match)
// → Merge: existing.aliases.push("leo")
// → entityMap.get("leo frostborne").aliases += "leo"

// Third mention: "Leonardo Frostborne"
addEntity("Leonardo Frostborne", "character", {...});
// → Check: normalizeKey("leonardo frostborne") === normalizeKey("leo frostborne") ?
// → No (different keys)
// → Check: hasConflictingEntityContext() ?
// → No (same context, abilities match)
// → Merge: existing.aliases.push("leonardo frostborne")
// → Result: one entity in map with all aliases consolidated
```

**Expected output from normalizeEntities():**
```typescript
{
  canonical_name: "Leo Frostborne",  // Longest name
  entity_type: "character",
  entity_types: ["character"],
  description: "A human fighter known for exceptional strength",
  attributes: {
    tattoo: "Wolf on left shoulder",
    origin: "Northern mountains",
    training: "Fighter from childhood",
    abilities: [
      "Sword mastery",
      "Hand-to-hand combat",
      "Cold resistance",
      "Physical strength"
    ]
  },
  structured_fields: {
    age: null,
    gender: "male",
    height: "6 feet 2 inches",
    hair_color: "black",
    eye_color: "blue"
  },
  aliases: ["Leo", "Leonardo Frostborne"],
  evidence: [ALL_FOUR_EVIDENCE_ITEMS],
  chunk_positions: [1, 2, 3, 4, 5, 6]  // All chunks where mentioned
}
```

**Key Questions:**
- ✅ Are all 4 abilities present in attributes.abilities?
- ✅ Are both aliases present?
- ✅ Is structured_fields populated with gender, height, etc?

### RESOLUTION PHASE

**Scenario: First extraction (Main bootstrap)**
```typescript
// findExistingEntity() called with Leo entity
// Queries:
//   - Main: layer='main' (empty, no Main exists yet)
//   - Branch: layer='branch', branch_id=current (empty, no Branch)
//   - Overlays: (empty)

// resolveExtractionCandidate(leoEntity, [], [])
// → No candidates found
// → Returns null

// Decision: CREATE NEW entity
```

**Scenario: Second extraction in Branch (Main exists)**
```typescript
// findExistingEntity() called with Leo entity
// Queries:
//   - Main: layer='main' → Returns MAIN_LEO_UUID with same data
//   - Branch: layer='branch', branch_id=current → Empty
//   - Overlays: (empty, first time in Branch)

// resolveExtractionCandidate(leoEntity, [], [mainLeoCandidate])
// → mainLeoCandidate matches (name, type, context)
// → Returns mainLeoCandidate

// Decision: CREATE OVERLAY for Main entity
```

### PERSISTENCE PHASE

**Main bootstrap INSERT:**
```sql
INSERT INTO knowledge_entities (
  project_id, document_id, version_id, user_id,
  branch_id,  -- NULL for Main
  canonical_name,  -- "Leo Frostborne"
  entity_type,  -- "character"
  entity_types,  -- ["character"]
  description,
  attributes,  -- {tattoo, origin, training, abilities: [4 items]}
  structured_fields,  -- {gender, height, hair_color, eye_color, age}
  layer,  -- "main"
  source,  -- "ai"
  raw_extraction_id
) VALUES (...)
RETURNING id;
-- → id = LEO_MAIN_UUID
```

**Knowledge entity aliases INSERT:**
```sql
INSERT INTO knowledge_entity_aliases (entity_id, alias, branch_id)
VALUES
  (LEO_MAIN_UUID, "Leo", NULL),
  (LEO_MAIN_UUID, "Leonardo Frostborne", NULL);
-- Stores aliases separately
```

**Branch overlay creation (if Main exists):**
```sql
INSERT INTO knowledge_branch_entities (
  branch_id,  -- current_branch_id
  source_entity_id,  -- LEO_MAIN_UUID (source = Main)
  entity_id,  -- LEO_MAIN_UUID (reference = Main)
  project_id,
  user_id,
  canonical_name,  -- "Leo Frostborne" (snapshot)
  entity_type,  -- "character"
  entity_types,  -- ["character"]
  description,
  attributes,  -- Snapshot of Main attributes
  overrides,  -- {} (no changes from Branch)
  base_values,  -- {} (no changes)
  is_modified,  -- false
  modified_fields  -- []
) VALUES (...)
```

### OUTPUT: Database State

**knowledge_entities row (Main layer):**
```
id: LEO_MAIN_UUID
project_id: <PROJECT_ID>
user_id: <USER_ID>
canonical_name: "Leo Frostborne"
entity_type: "character"
entity_types: ["character"]
layer: "main"
branch_id: NULL  ← Key for Main identification
description: "A human fighter known for exceptional strength"
attributes: {
  "tattoo": "Wolf on left shoulder",
  "origin": "Northern mountains",
  "training": "Fighter from childhood",
  "abilities": [  ← CRITICAL: Are all 4 abilities here?
    "Sword mastery",
    "Hand-to-hand combat",
    "Cold resistance",
    "Physical strength"
  ]
}
structured_fields: {
  "gender": "male",
  "height": "6 feet 2 inches",
  "hair_color": "black",
  "eye_color": "blue",
  "age": null
}
created_at: <TIMESTAMP>
updated_at: <TIMESTAMP>
```

**knowledge_entity_aliases rows:**
```
entity_id: LEO_MAIN_UUID, alias: "Leo", branch_id: NULL
entity_id: LEO_MAIN_UUID, alias: "Leonardo Frostborne", branch_id: NULL
```

**Verification Query:**
```sql
SELECT 
  id, canonical_name, entity_type, layer, branch_id,
  attributes->>'abilities' as abilities,
  structured_fields->>'gender' as gender,
  structured_fields->>'height' as height
FROM knowledge_entities
WHERE canonical_name = 'Leo Frostborne' AND user_id = '<USER_ID>';
```

**Expected result:**
```
id: LEO_MAIN_UUID
canonical_name: "Leo Frostborne"
entity_type: "character"
layer: "main"
branch_id: NULL
abilities: ["Sword mastery", "Hand-to-hand combat", "Cold resistance", "Physical strength"]  ← ALL 4?
gender: "male"
height: "6 feet 2 inches"
```

**CRITICAL QUESTIONS FOR TRACE #1:**
1. ❓ Are all 4 abilities present in the database row?
2. ❓ Is structured_fields populated with gender, height, etc?
3. ❓ Are both aliases in knowledge_entity_aliases?
4. ❓ If extracted again in Branch, is overlay created (not duplicate entity)?

---

## Trace #2: Magical Cabinet (Object 1 - 5 mentions)

### INPUT: LLM JSON

```json
{
  "name": "Cabinet",
  "aliases": ["Magical cabinet", "Wooden cabinet"],
  "object_type": "Storage container",
  "appearance": "Ornately carved wooden cabinet with symbols of power",
  "materials": "Wood with magical inscriptions",
  "special_properties": [
    "Expanded interior space",
    "Magical energy preservation",
    "Can only be opened by Leo",
    "Hums with ancient magic"
  ],
  "description": "A mysterious wooden cabinet discovered in an ancient library",
  "attributes": {
    "origin": "Ancient library",
    "current_owner": "Leo",
    "purpose": "Storage of magical artifacts"
  },
  "evidence": [
    "During his travels, Leo discovered a mysterious wooden cabinet in an ancient library",
    "The cabinet was ornately carved with symbols of power",
    "Inside the cabinet were magical artifacts that glowed with ethereal light",
    "The cabinet's interior seemed larger than its exterior, defying physical laws"
  ],
  "significance": "Most prized possession"
}
```

### EXPECTED NORMALIZATION BEHAVIOR

**Input mentions across document:**
1. "mysterious wooden cabinet" (Part 2)
2. "the cabinet" (Part 2, 4x more mentions)

**normalizeEntities() processing:**

```typescript
// All 5 mentions have SAME context (magical, ornate, powerful)
// normalizeKey("cabinet") = "cabinet"
// hasConflictingEntityContext(first, second, third...) = false

// ALL 5 MENTIONS MERGE INTO SINGLE ENTITY
// Result: entityMap.get("cabinet") = ONE Cabinet entity
// NOT "cabinet::2"
```

**Expected output from normalizeEntities():**
```typescript
{
  canonical_name: "Cabinet",
  entity_type: "object",
  entity_types: ["object"],
  description: "A mysterious wooden cabinet discovered in an ancient library",
  attributes: {
    origin: "Ancient library",
    current_owner: "Leo",
    purpose: "Storage of magical artifacts",
    significance: "Most prized possession"
  },
  structured_fields: {
    object_type: "Storage container",
    appearance: "Ornately carved wooden cabinet with symbols of power",
    materials: "Wood with magical inscriptions",
    special_properties: [4 items]
  },
  aliases: ["Magical cabinet", "Wooden cabinet"],
  evidence: [4 items from Part 2],
  chunk_positions: [2, 3, 4, 5, 6]  // All 5 mention positions
}
```

**Key Questions:**
- ✅ Is there ONLY ONE Cabinet entity (not two)?
- ✅ Are special_properties (4 items) preserved?
- ✅ Are both aliases present?

### RESOLUTION PHASE

**First extraction (Main bootstrap):**
```typescript
// resolveExtractionCandidate(cabinetEntity, [], [])
// → No candidates
// → Returns null
// Decision: CREATE NEW
```

### PERSISTENCE PHASE

**INSERT:**
```sql
INSERT INTO knowledge_entities (
  canonical_name: "Cabinet",
  entity_type: "object",
  attributes: {
    "origin": "Ancient library",
    "current_owner": "Leo",
    "purpose": "Storage of magical artifacts",
    "significance": "Most prized possession"
  },
  structured_fields: {
    "object_type": "Storage container",
    "appearance": "Ornately carved wooden cabinet with symbols of power",
    "materials": "Wood with magical inscriptions",
    "special_properties": ["Expanded interior space", "Magical energy preservation", ...]
  },
  layer: "main",
  branch_id: NULL,
  ...
) RETURNING id;
-- → id = CABINET_MAGIC_UUID
```

### OUTPUT: Database State

**knowledge_entities row:**
```
id: CABINET_MAGIC_UUID
canonical_name: "Cabinet"
entity_type: "object"
layer: "main"
branch_id: NULL
attributes: {
  "origin": "Ancient library",
  "current_owner": "Leo",
  "purpose": "Storage of magical artifacts",
  "significance": "Most prized possession"
}
structured_fields: {
  "object_type": "Storage container",
  "appearance": "Ornately carved wooden cabinet with symbols of power",
  "materials": "Wood with magical inscriptions",
  "special_properties": [
    "Expanded interior space",
    "Magical energy preservation",
    "Can only be opened by Leo",
    "Hums with ancient magic"
  ]
}
```

**Verification Query:**
```sql
SELECT 
  id, canonical_name, entity_type,
  attributes->>'materials' as materials,
  attributes->>'purpose' as purpose,
  structured_fields->>'special_properties' as special_properties
FROM knowledge_entities
WHERE canonical_name = 'Cabinet' AND entity_type = 'object' AND user_id = '<USER_ID>';
```

**Expected result:**
```
id: CABINET_MAGIC_UUID
canonical_name: "Cabinet"
materials: "Wood with magical inscriptions"
purpose: "Storage of magical artifacts"
special_properties: ["Expanded interior space", "Magical energy preservation", ...]
```

**CRITICAL QUESTIONS FOR TRACE #2:**
1. ❓ Is there ONLY ONE Cabinet row for the magical cabinet?
2. ❓ Are all 4 special_properties preserved?
3. ❓ Is materials field populated ("Wood with magical inscriptions")?
4. ❓ Is purpose field populated ("Storage of magical artifacts")?

---

## Trace #3: Practical Cabinet (Object 2 - Different Identity)

### INPUT: LLM JSON

```json
{
  "name": "Cabinet",
  "aliases": ["Glass cabinet", "Herb cabinet"],
  "object_type": "Storage container",
  "appearance": "Small glass cabinet",
  "materials": "Glass",
  "special_properties": ["Practical storage"],
  "description": "A small glass cabinet in the herbalist's cottage containing dried herbs",
  "attributes": {
    "origin": "Herbalist's cottage",
    "purpose": "Storage of healing supplies",
    "contents": "Dried herbs, lavender, sage"
  },
  "evidence": [
    "Inside the cottage stood another cabinet, this one made of glass",
    "This cabinet was much smaller and served a purely practical purpose",
    "The herbalist's cabinet smelled of dried lavender and sage"
  ],
  "significance": "Mundane healing supply storage"
}
```

### EXPECTED NORMALIZATION BEHAVIOR

**Context comparison with Magical Cabinet:**

```typescript
// Compare CONFLICTING_CABINET with MAGICAL_CABINET:
hasConflictingEntityContext(practicalCab, magicalCab)

// Field comparison:
// - materials: "glass" vs "wood" → CONFLICT ✗
// - purpose: "healing supplies" vs "magical artifacts" → CONFLICT ✗
// - appearance: "small glass" vs "ornately carved wooden" → CONFLICT ✗

// Context tokens:
// magicalCab: {ancient, library, magical, artifacts, ornate, symbols, power, ...}
// practicalCab: {herbalist, cottage, glass, dried, herbs, lavender, sage, ...}
// Shared tokens: NONE (completely different semantic fields)

// Result: hasConflictingEntityContext() = TRUE
```

**normalizeEntities() processing:**

```typescript
// First Cabinet (magical) already in map as "cabinet"
// Second Cabinet (practical) incoming

let existing = entityMap.get("cabinet");  // Magical Cabinet
if (existing && hasConflictingEntityContext(existing, incoming)) {
  // Create suffix: "cabinet::2"
  entityMapKey = "cabinet::2";
  existing = entityMap.get("cabinet::2");  // null, first time
}

// NEW entity created under "cabinet::2" key
entityMap.set("cabinet::2", newPracticalCabinet);
```

**Expected output from normalizeEntities():**
```typescript
// Map contains TWO entries:
entityMap.get("cabinet") = {
  canonical_name: "Cabinet",
  description: "A mysterious wooden cabinet...",
  attributes: { origin: "Ancient library", ... },
  structured_fields: { materials: "Wood...", ... }
};

entityMap.get("cabinet::2") = {
  canonical_name: "Cabinet",  // Same name, different UUID
  description: "A small glass cabinet in the herbalist's cottage...",
  attributes: { origin: "Herbalist's cottage", ... },
  structured_fields: { materials: "Glass", ... }
};
```

**Key Question:**
- ✅ Are TWO separate Cabinet entities created (not merged)?

### RESOLUTION PHASE

```typescript
// resolveExtractionCandidate(practicalCabinet, [], [])
// → No existing entities (first extraction)
// → Returns null
// Decision: CREATE NEW
```

### PERSISTENCE PHASE

**Two separate INSERTs:**

```sql
-- Cabinet 1 (Magical)
INSERT INTO knowledge_entities (
  canonical_name: "Cabinet",
  attributes: { origin: "Ancient library", purpose: "Storage of magical artifacts", ... },
  structured_fields: { materials: "Wood...", ... }
) RETURNING id;
-- → CABINET_MAGIC_UUID

-- Cabinet 2 (Practical)
INSERT INTO knowledge_entities (
  canonical_name: "Cabinet",  -- SAME NAME, different UUID
  attributes: { origin: "Herbalist's cottage", purpose: "Storage of healing supplies", ... },
  structured_fields: { materials: "Glass", ... }
) RETURNING id;
-- → CABINET_PRACTICAL_UUID
```

### OUTPUT: Database State

**Query for all Cabinets:**
```sql
SELECT 
  id,
  canonical_name,
  entity_type,
  attributes->>'materials' as materials,
  attributes->>'origin' as origin,
  attributes->>'purpose' as purpose,
  created_at
FROM knowledge_entities
WHERE canonical_name = 'Cabinet'
ORDER BY created_at;
```

**Expected results:**
```
Row 1:
  id: CABINET_MAGIC_UUID
  canonical_name: "Cabinet"
  materials: "Wood with magical inscriptions"
  origin: "Ancient library"
  purpose: "Storage of magical artifacts"
  created_at: <T1>

Row 2:
  id: CABINET_PRACTICAL_UUID
  canonical_name: "Cabinet"
  materials: "Glass"
  origin: "Herbalist's cottage"
  purpose: "Storage of healing supplies"
  created_at: <T1>
```

**CRITICAL QUESTIONS FOR TRACE #3:**
1. ❓ Are TWO SEPARATE rows created (not merged)?
2. ❓ Do they have DIFFERENT UUIDs?
3. ❓ Do they have DIFFERENT materials values?
4. ❓ Do they have DIFFERENT purpose values?
5. ❓ Are both visible in UI (or does same name cause display confusion)?

---

## Trace #4: Relationships

### INPUT: LLM JSON

```json
{
  "relationships": [
    {
      "entity_a": "Leo",
      "entity_b": "Cabinet",
      "relationship_type": "owner_of",
      "description": "Leo carries the magical cabinet with him on his journey"
    },
    {
      "entity_a": "Leo",
      "entity_b": "Herbalist",
      "relationship_type": "mutual_respect",
      "description": "Leo's relationship with the herbalist is one of mutual respect and occasional assistance"
    }
  ]
}
```

### EXPECTED PERSISTENCE

**Relationship 1: Leo → Cabinet (Magical)**
```sql
-- First, resolve entity names to UUIDs
SELECT id FROM knowledge_entities WHERE canonical_name = 'Leo Frostborne' AND entity_type = 'character';
-- → LEO_MAIN_UUID

SELECT id FROM knowledge_entities WHERE canonical_name = 'Cabinet' AND entity_type = 'object';
-- → Returns TWO rows (CABINET_MAGIC_UUID, CABINET_PRACTICAL_UUID)
-- PROBLEM: Which Cabinet to use?
```

**Question: How does relationship matching work?**

Code location: `supabase/functions/extract-knowledge/index.ts:findBatchEntityId()`

```typescript
function findBatchEntityId(
  name: string,
  entries: Array<{ entity: NormalizedEntity; id: string }>,
): string | null {
  const key = normalizeKey(name);
  const matches = entries.filter(({ entity }) =>
    normalizeKey(entity.canonical_name) === key ||
    entity.aliases.some((alias) => normalizeKey(alias) === key),
  );
  const ids = [...new Set(matches.map(({ id }) => id))];
  // Name-only references are safe only when the batch contains one candidate.
  return ids.length === 1 ? ids[0] : null;
}
```

**Expected behavior:**
- Searches entityIdEntries for "Cabinet"
- Finds TWO matches (CABINET_MAGIC_UUID, CABINET_PRACTICAL_UUID)
- ids.length === 2
- Returns NULL (ambiguous, more than one candidate)

**Result:**
- Relationship may not be persisted
- Or persisted with NULL entity_b_id
- Or error logged

### CRITICAL QUESTIONS FOR TRACE #4:
1. ❓ Is the Leo-Cabinet relationship persisted?
2. ❓ Which Cabinet ID is used (magical or practical)?
3. ❓ If ambiguous (two Cabinets), is it skipped or error logged?
4. ❓ Is the Leo-Herbalist relationship created (Herbalist is new)?

---

## Summary of Critical Points to Verify After Controlled Test

### Point 1: Within-Batch Consolidation
**Test:** Leo mentioned 5 times → should be 1 entity
- Query: `SELECT COUNT(*) FROM knowledge_entities WHERE canonical_name = 'Leo%'`
- Expected: 1
- Actual: ?

### Point 2: Same-Name Different-Context Isolation
**Test:** Two Cabinets with conflicting context → should be 2 entities
- Query: `SELECT COUNT(*) FROM knowledge_entities WHERE canonical_name = 'Cabinet'`
- Expected: 2
- Actual: ?

### Point 3: Abilities Persistence
**Test:** Leo's 4 abilities should be in attributes.abilities
- Query: `SELECT attributes->>'abilities' FROM knowledge_entities WHERE canonical_name = 'Leo Frostborne'`
- Expected: ["Sword mastery", "Hand-to-hand combat", "Cold resistance", "Physical strength"]
- Actual: ?

### Point 4: Structured Fields Persistence
**Test:** Cabinet's materials should be in structured_fields
- Query: `SELECT structured_fields->>'materials' FROM knowledge_entities WHERE canonical_name = 'Cabinet' AND entity_type = 'object'`
- Expected: 2 rows with values "Wood..." and "Glass"
- Actual: ?

### Point 5: Main/Branch Isolation (First Extraction)
**Test:** All entities should be layer='main', branch_id=NULL
- Query: `SELECT COUNT(*) FROM knowledge_entities WHERE layer='branch'`
- Expected: 0
- Actual: ?

### Point 6: Main/Branch Overlay (Second Extraction in Branch)
**Test:** Existing Main entity should get overlay, not duplicate
- Query: `SELECT COUNT(*) FROM knowledge_entities WHERE layer='main' AND canonical_name LIKE 'Leo%'`
- Expected: 1 (unchanged from first extraction)
- Actual: ?

- Query: `SELECT COUNT(*) FROM knowledge_branch_entities WHERE source_entity_id = '<LEO_ID>'`
- Expected: 1 (one overlay for Leo in Branch)
- Actual: ?

---

## Execution Instructions

### Step 1: Run Controlled Test
```bash
# Windows
.\run_controlled_test.ps1 -ProjectId '<PROJECT_ID>' -UserId '<USER_ID>' -DocumentId '<DOCUMENT_ID>'

# Or macOS/Linux
bash run_controlled_test.sh <PROJECT_ID> <USER_ID> <DOCUMENT_ID>
```

### Step 2: Capture Output
- Raw LLM JSON: `../../tests/results/CONTROLLED_TEST_OUTPUT/llm_response_*.json`
- Entity results: `../../tests/results/CONTROLLED_TEST_OUTPUT/cabinet_entities_*.txt`
- Leo results: `../../tests/results/CONTROLLED_TEST_OUTPUT/leo_entities_*.txt`
- Comparison report: `../../tests/results/CONTROLLED_TEST_OUTPUT/comparison_report_*.txt`

### Step 3: Verify Against Trace

For each trace section:
1. Compare LLM JSON to expected normalization output
2. Check database row count and values
3. Mark ✅ or ❌ for each critical question

### Step 4: Document Findings

Use Task #4 to identify where failures occur in the trace.

---

