# Controlled Test Document: Repeated Entity & Dual Identity Scenario

**Purpose:** Generate predictable LLM extraction output to test entity consolidation, Main/Branch handling, and field persistence.

---

## Document Content

### Part 1: Character Introduction

Leo Frostborne is a human fighter known for his exceptional strength. He has fought in many battles across the kingdom. Leo stands tall with piercing blue eyes and black hair tied in a braid. His appearance is distinctive and memorable. Leo carries a weathered journal detailing his adventures.

### Part 2: Repeated References to Same Cabinet

During his travels, Leo discovered a mysterious wooden cabinet in an ancient library. The cabinet was ornately carved with symbols of power. Leo examined the cabinet carefully and noted its construction was masterful. Inside the cabinet were magical artifacts that glowed with ethereal light. The cabinet itself seemed to hum with ancient magic.

Leo decided to carry the cabinet with him on his journey. He packed supplies beside the cabinet and prepared for departure. The cabinet proved invaluable as he traveled through dangerous territories. Every night, Leo would open the cabinet and study its contents. The cabinet's interior seemed larger than its exterior, defying physical laws.

### Part 3: Different Cabinet (Conflicting Identity)

Later in his journey, Leo encountered a small cottage belonging to an old herbalist. Inside the cottage stood another cabinet, this one made of glass and containing dried herbs. This cabinet was much smaller and served a purely practical purpose. Unlike the magical cabinet Leo carried, this cabinet contained only mundane healing supplies. The herbalist's cabinet smelled of dried lavender and sage.

### Part 4: Character Details (Adding Information)

Leo's full name is Leonardo Frostborne, though few call him by his formal title. He was born in the northern mountains and trained as a fighter from childhood. His greatest ability is his physical strength and combat skill. Leo's height is approximately 6 feet 2 inches, making him taller than most men. His tattoo of a wolf adorns his left shoulder, marking him as a member of the Frostborne clan.

### Part 5: Abilities and Relationships

Leo possesses exceptional combat abilities including sword mastery and hand-to-hand combat. He also has the ability to withstand extreme cold due to his mountain heritage. Leo's resilience and determination have made him a valued companion to many adventurers. His relationship with the herbalist is one of mutual respect and occasional assistance.

### Part 6: Object Summary

The magical cabinet remains Leo's most prized possession. It serves as both protection and transportation for his magical artifacts. The cabinet's properties include expanded interior space and magical energy preservation. These properties make it invaluable for storing powerful objects. The cabinet can only be opened by Leo, who holds its key.

---

## Expected LLM Output Structure

```json
{
  "characters": [
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
  ],
  "objects": [
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
    },
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
  ],
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

---

## Test Expectations

### Within-Batch Consolidation (normalizeEntities)

**Input:** Two "Cabinet" objects with CONFLICTING context
- Cabinet A: Wooden, magical, symbols of power, artifacts inside
- Cabinet B: Glass, practical, herbs, in cottage

**Expected Outcome:** TWO separate Cabinet entities
- `entityMap.get("cabinet")` → Cabinet A (magical)
- `entityMap.get("cabinet::2")` → Cabinet B (practical)

**Reason:** hasConflictingEntityContext(A, B) = true
- Different materials (wood vs glass)
- Different purposes (magical artifacts vs herbs)
- Different settings (ancient library vs cottage)
- Shared term count = 0 (no overlapping tokens)

**Result:** Two separate UUIDs in database

### Repeated Mentions Consolidation

**Input:** Cabinet mentioned 5 times in parts 2-3
- "Leo discovered a mysterious wooden cabinet"
- "examined the cabinet carefully"
- "inside the cabinet were magical artifacts"
- "carry the cabinet with him"
- "open the cabinet and study"

**Expected Outcome:** ALL five mentions → SINGLE Cabinet A UUID
- Same context (magical, ornate, powerful)
- Same name normalization ("cabinet")
- No conflict detection

**Result:** One UUID, one knowledge_entities row for magical Cabinet

### Character Consolidation

**Input:** Leo mentioned by different names across parts 1 and 4
- "Leo Frostborne"
- "Leo"
- "Leonardo Frostborne"
- "Leo Frostborne"

**Expected Outcome:** ONE character entity with aliases
- canonical_name = "Leo Frostborne" (longest name wins)
- aliases = ["Leo", "Leonardo Frostborne"]
- All mentions resolve to same UUID

**Result:** One UUID for Leo character

---

## Database Verification Queries (After Extraction)

### Query 1: Verify Cabinet Count & Isolation

```sql
SELECT 
  id,
  canonical_name,
  entity_type,
  attributes->>'materials' as materials,
  attributes->>'purpose' as purpose,
  attributes->>'significance' as significance,
  created_at
FROM knowledge_entities
WHERE canonical_name LIKE 'Cabinet%'
  AND project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>'
ORDER BY created_at;
```

**Expected:**
- 2 rows (Cabinet magical, Cabinet practical)
- Different materials, purposes, significance
- Different UUIDs

### Query 2: Verify Leo Consolidation

```sql
SELECT 
  id,
  canonical_name,
  entity_types,
  aliases,
  attributes->>'tattoo' as tattoo,
  attributes->>'abilities' as abilities,
  created_at
FROM knowledge_entities
WHERE canonical_name LIKE 'Leo%'
  AND project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>'
ORDER BY created_at;
```

**Expected:**
- 1 row (Leo Frostborne)
- aliases includes ["Leo", "Leonardo Frostborne"]
- tattoo and abilities populated

### Query 3: Verify Abilities Persistence

```sql
SELECT 
  id,
  canonical_name,
  entity_type,
  attributes->'abilities' as abilities,
  structured_fields
FROM knowledge_entities
WHERE canonical_name = 'Leo Frostborne'
  AND project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>';
```

**Expected:**
- attributes.abilities = ["Sword mastery", "Hand-to-hand combat", "Cold resistance", "Physical strength"]
- All four abilities present

### Query 4: Verify Objects Count

```sql
SELECT COUNT(*) as object_count
FROM knowledge_entities
WHERE entity_type = 'object'
  AND project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>';
```

**Expected:**
- 2 objects (two Cabinets)

### Query 5: Verify Relationships

```sql
SELECT 
  entity_a_name,
  entity_b_name,
  relationship_type,
  description
FROM knowledge_entity_relationships
WHERE project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>'
ORDER BY created_at;
```

**Expected:**
- "Leo Frostborne" → "Cabinet (magical)" : owner_of
- "Leo Frostborne" → "Herbalist" : mutual_respect

---

## Execution Steps

### Step 1: Create Document in App

1. Create new project (if needed): "Controlled Test"
2. Create new document: "CONTROLLED_TEST_DOCUMENT"
3. Paste the document content above (Part 1-6)
4. Save and note the document_id

### Step 2: Trigger Extraction

1. Click "Extract Knowledge" button
2. Select the document
3. Note the extraction_id and/or raw_extraction_id from network request

### Step 3: Capture LLM Response

```sql
SELECT 
  id as raw_extraction_id,
  raw_response,
  model,
  branch_id,
  created_at
FROM raw_extractions
WHERE document_id = '<DOCUMENT_ID>'
ORDER BY created_at DESC
LIMIT 1;
```

Save the raw_response JSON to file: `CONTROLLED_TEST_LLM_RESPONSE.json`

### Step 4: Query Resulting Entities

Run Query 1-5 above and save results to:
- `CONTROLLED_TEST_ENTITIES.sql`
- `CONTROLLED_TEST_RESULTS.txt`

---

## Diagnostic Checkpoints

### Checkpoint A: In-Batch Consolidation
- ✅ Two Cabinets with different context → two separate entities in DB
- ✅ Leo mentioned 5 times → one Leo entity with combined attributes
- ✅ All abilities present in Leo.attributes.abilities

### Checkpoint B: Main/Branch Isolation (First Extraction)
- ✅ All entities created with layer='main'
- ✅ branch_id = NULL for all
- ✅ knowledge_branch_entities is empty (no overlays yet)

### Checkpoint C: Main/Branch Isolation (Second Extraction in Branch)
- ✅ Existing Main entities NOT modified
- ✅ Overlays created in knowledge_branch_entities
- ✅ New Branch entities created with layer='branch'
- ✅ No duplicate main entities created

### Checkpoint D: Repeated Information
- ✅ Entities not duplicated across layers
- ✅ Main view shows original count
- ✅ Branch view shows Main count + Branch-only count (correct)

---

## Notes

- This test is designed to have deterministic, predictable output
- The two Cabinets should have CLEARLY different contexts
- Leo should consolidate despite name variations
- Abilities should be captured in attributes.abilities
- The test should run in both Main bootstrap mode AND Branch mode to verify layer handling

---

