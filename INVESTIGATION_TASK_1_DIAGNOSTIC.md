# Task #1 Diagnostic: Main/Branch Data Isolation & Repeated Entity Resolution

**Date:** August 20, 2026  
**Objective:** Verify whether Main/Branch duplication is a persistence issue or a display issue, and understand repeated-entity consolidation.

---

## Architecture Understanding

### Current Extraction Flow

**Main Bootstrap Mode (no Main exists yet):**
```
LLM JSON
  → normalizeEntities() [in-batch consolidation]
  → resolveExtractionCandidate() [against empty Main/Branch]
  → INSERT into knowledge_entities (layer='main', branch_id=NULL)
  → layer='main' entities created
```

**Branch Mode (Main already exists):**
```
LLM JSON
  → normalizeEntities() [in-batch consolidation]
  → findExistingEntity() for each entity:
      - Query Main entities (layer='main')
      - Query Branch entities (layer='branch', branch_id=current)
      - Load overlays (knowledge_branch_entities with source_entity_id)
      - resolveExtractionCandidate(entity, branchCandidates, mainCandidates)
  → If existing found:
      - If layer='branch': UPDATE that entity + its mapping
      - If layer='main': CREATE overlay in knowledge_branch_entities
  → If NOT found: INSERT new entity (layer='branch', branch_id=current)
```

### Key Mechanism: Overlay Model

When a Main entity is found during Branch extraction:
- Main entity is NOT modified (remains layer='main', branch_id=NULL)
- An overlay is CREATED in knowledge_branch_entities:
  - source_entity_id = Main entity ID (links to Main)
  - entity_id = Main entity ID (reference)
  - overrides = {} (Branch-specific changes, if any)
  - is_modified = false (unless there are overrides)

### UI Display Logic

**Main view:**
- Query: `knowledge_entities WHERE layer='main'`
- Shows all Main-layer entities only

**Branch view:**
- Query: `knowledge_entities WHERE layer='main'` (Main entities)
- Query: `knowledge_entities WHERE layer='branch' AND branch_id=current` (Branch-only entities)
- Query: `knowledge_branch_entities WHERE branch_id=current AND source_entity_id IS NOT NULL` (Main overlays)
- Apply overlays: if overlay exists for Main entity, use `applyEntityOverrides(mainEntity, overlay.overrides)`
- Combine: [Main entities with overlays] + [Branch-only entities]

---

## Hypothesis for "Duplication" Issue

### Possibility A: Same Data Persisted Twice (TRUE DUPLICATION)
- First extraction: Creates Main entity "Cabinet" with ID=uuid-1
- Second extraction (Branch): Finds Main entity, creates overlay
- Third extraction (Branch): Fails to find previous extraction's data, creates NEW branch entity "Cabinet" with ID=uuid-2
- Result: Two rows in knowledge_entities with same name but different IDs and layers

**DB state:**
```
knowledge_entities:
  uuid-1, "Cabinet", layer='main', branch_id=NULL
  uuid-2, "Cabinet", layer='branch', branch_id=branch-1

knowledge_branch_entities:
  (empty or only overlays for uuid-1)
```

### Possibility B: Data in Main + Inherited in Branch (CORRECT BEHAVIOR)
- First extraction: Creates Main entity "Cabinet" with ID=uuid-1
- Second extraction (Branch): Finds Main entity, creates overlay
- Third extraction (Branch): Finds overlay, updates overlay metadata only
- Result: One Main entity + one overlay record = one effective Cabinet in Branch view

**DB state:**
```
knowledge_entities:
  uuid-1, "Cabinet", layer='main', branch_id=NULL

knowledge_branch_entities:
  uuid-1, branch_id=branch-1, source_entity_id=uuid-1, entity_id=uuid-1, overrides={}
```

### Possibility C: Same Data Inherited from Main (DISPLAY ISSUE)
- First extraction: Creates Main entity "Cabinet" with ID=uuid-1
- All Branch views: Show uuid-1 (inherited from Main)
- No duplication in DB, but effective Branch view includes Main data

---

## Investigation Plan

### Step 1: Verify Current Database State

**Query 1: Count entities by layer in current project**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN layer='main' THEN 1 ELSE 0 END) as main_layer,
  SUM(CASE WHEN layer='branch' THEN 1 ELSE 0 END) as branch_layer,
  SUM(CASE WHEN layer='secondary' THEN 1 ELSE 0 END) as secondary_layer
FROM knowledge_entities
WHERE project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>';
```

**Query 2: Check for duplicate canonical_name values**
```sql
SELECT canonical_name, layer, COUNT(*) as count
FROM knowledge_entities
WHERE project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>'
GROUP BY canonical_name, layer
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

**Query 3: Check Main entities with overlays**
```sql
SELECT 
  ke.id as entity_id,
  ke.canonical_name,
  ke.layer,
  COUNT(kbe.id) as overlay_count
FROM knowledge_entities ke
LEFT JOIN knowledge_branch_entities kbe ON ke.id = kbe.source_entity_id
WHERE ke.project_id = '<PROJECT_ID>'
  AND ke.user_id = '<USER_ID>'
  AND ke.layer = 'main'
GROUP BY ke.id, ke.canonical_name, ke.layer
HAVING COUNT(kbe.id) > 0;
```

**Query 4: Check all branch entities and their sources**
```sql
SELECT 
  kbe.entity_id,
  kbe.source_entity_id,
  ke.canonical_name,
  ke.layer,
  kbe.branch_id
FROM knowledge_branch_entities kbe
LEFT JOIN knowledge_entities ke ON ke.id = kbe.entity_id
WHERE kbe.branch_id = '<BRANCH_ID>'
ORDER BY ke.canonical_name;
```

### Step 2: Trace a Specific Extracted Entity

**For an entity with same canonical_name appearing in multiple rows:**

```sql
-- Find all "Cabinet" entities
SELECT 
  id,
  canonical_name,
  entity_type,
  layer,
  branch_id,
  description,
  attributes,
  structured_fields,
  created_at,
  raw_extraction_id
FROM knowledge_entities
WHERE canonical_name = 'Cabinet'
  AND project_id = '<PROJECT_ID>'
  AND user_id = '<USER_ID>'
ORDER BY layer, branch_id, created_at;

-- For each Cabinet entity, check if it has overlays
SELECT 
  kbe.entity_id,
  kbe.source_entity_id,
  kbe.branch_id,
  kbe.is_modified,
  kbe.overrides,
  kbe.created_at
FROM knowledge_branch_entities kbe
WHERE kbe.entity_id = '<CABINET_ID>'
  OR kbe.source_entity_id = '<CABINET_ID>'
ORDER BY branch_id, created_at;

-- Check mentions for this entity
SELECT 
  id,
  entity_id,
  entity_name,
  mention_text,
  chunk_position,
  created_at
FROM knowledge_entity_mentions
WHERE entity_id = '<CABINET_ID>'
ORDER BY chunk_position;
```

### Step 3: Check Repeated Mentions Within One Extraction

**For the next extraction we run, capture:**

1. Raw LLM JSON response (from raw_extractions table)
2. Normalized entities after normalizeEntities()
3. Entity IDs assigned after database insert

```sql
-- After extraction, check raw response
SELECT 
  id,
  raw_response,
  branch_id,
  created_at
FROM raw_extractions
WHERE project_id = '<PROJECT_ID>'
  AND document_id = '<DOCUMENT_ID>'
ORDER BY created_at DESC
LIMIT 1;

-- Check all entities from this raw extraction
SELECT 
  ke.id,
  ke.canonical_name,
  ke.entity_type,
  ke.layer,
  ke.branch_id,
  ke.raw_extraction_id,
  ke.created_at
FROM knowledge_entities ke
WHERE ke.raw_extraction_id = '<RAW_EXTRACTION_ID>'
ORDER BY ke.canonical_name;
```

---

## Expected Results by Hypothesis

### If Hypothesis A (TRUE DUPLICATION):
- ❌ Multiple knowledge_entities rows with same canonical_name
- ❌ Different UUIDs for same conceptual entity
- ❌ No consistent branching structure (multiple Cabinets with different IDs)
- ❌ Multiple overlays for same entity name

### If Hypothesis B (CORRECT):
- ✅ One Main entity per canonical_name
- ✅ Zero or one overlay per Main entity
- ✅ Branch-only entities have unique names (or are intentionally distinct)
- ✅ Layer/branch_id consistency maintained

### If Hypothesis C (DISPLAY ISSUE):
- ✅ DB state is correct (Hypothesis B)
- ❌ UI shows "duplication" because it includes inherited Main data
- ✅ Artifact: effective Branch view includes all Main entities + Branch-only entities
- ✅ This is actually correct behavior (intended)

---

## Root Cause Questions

### Q1: Is `resolveExtractionCandidate()` correctly consolidating repeated mentions?

**What it should do:**
- Within the same batch, if "Cabinet" is mentioned 3 times
- All 3 mentions should resolve to the same normalized entity (same map entry)
- Result: 1 "Cabinet" UUID per batch, not 3

**Current code:**
- normalizeEntities() uses `entityMap.get(key)` to track within-batch entities
- If two Cabinets have same normalized key but conflicting context, creates suffix: "cabinet::2"
- If same name + same context, merges into single entity
- **Should work correctly**

### Q2: Is `resolveExtractionCandidate()` correctly finding existing entities?

**What it should do:**
- If "Cabinet" exists in Main, resolve to that entity
- If "Cabinet" exists in Branch, resolve to that entity
- If both exist, prefer Branch match

**Current code:**
- Calls resolveExtractionCandidate(entity, branchCandidates, mainCandidates)
- Returns first match from resolveEntityCandidate() logic
- **Should work correctly**

### Q3: Is the overlay model correctly implemented?

**What it should do:**
- If Main entity found, create overlay (source_entity_id = Main ID)
- If Branch entity found, update it
- If not found, create new (source_entity_id = NULL)

**Current code:**
- Creates knowledge_branch_entities with source_entity_id when Main entity found
- Updates knowledge_entities when Branch entity found
- **Should work correctly**

### Q4: Are relationships and abilities being persisted correctly?

**What they should do:**
- Extract "Cabinet" with ability "hold items"
- Persist ability to knowledge_entities.attributes.abilities
- Persist to knowledge_entity_abilities if that table exists

**Question:** Does knowledge_entity_abilities table exist? Are abilities extracted to it?

---

## Next Steps

1. **Run Query Set 1-4** to understand current database state
2. **Create controlled extraction test** (see Task #2)
3. **Trace through normalizeEntities()** for repeated mentions
4. **Verify overlay creation** for Main entities in Branch mode
5. **Check abilities/objects persistence** (Task #5)
6. **Generate diagnostic checkpoint** (Task #6)

---

## Related Files

**Extraction:**
- `supabase/functions/extract-knowledge/index.ts` — Main extraction logic

**Entity Resolution:**
- `supabase/functions/_shared/entity-resolution.ts` — Resolution logic

**UI Display:**
- `client/src/stores/entityStore.ts` — Fetch and display logic

**Consolidation:**
- `supabase/functions/extract-knowledge/index.ts:normalizeEntities()` — In-batch consolidation
- `supabase/functions/_shared/rules/consolidation.ts` — Consolidation scoring

---

