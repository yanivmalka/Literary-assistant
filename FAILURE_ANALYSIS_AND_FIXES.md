# Extraction Pipeline Failure Analysis and Fix Implementation

## Executive Summary

Four critical failures have been identified in the extraction pipeline through code analysis. Each failure prevents data from surviving the normalization → consolidation → persistence flow. Root causes have been traced to exact files and functions. Fixes are minimal and preserve UUID identity and Main/Branch semantics.

---

## FAILURE 1: Character Fields Lost (Age, Height, Eye Color, Hair Color)

### Root Cause
**File:** `supabase/functions/_shared/value-sync.ts`  
**Function:** `syncEntityValues()` (lines 54–87)  
**Issue:** Null values are unconditionally skipped in value synchronization. When an extraction provides a character field (e.g., `age: "25"`), it's stored in `knowledge_entity_values`. But when a later extraction processes the same character WITHOUT that field (`age: null`), the null is skipped (line 57), and the prior value is never updated or preserved in a consistent way.

### Evidence from Code
```typescript
// supabase/functions/_shared/value-sync.ts, line 57
if (value === null || value === undefined) {
  continue; // Skip nulls ← PROBLEM: Later extractions lose data
}
```

When a character field is populated in extraction #1 but omitted in extraction #2:
1. Extraction #1: `age = "25"` → stored in `knowledge_entity_values` as active
2. Extraction #2: `age = null` → skipped by line 57 → no new record
3. UI queries `knowledge_entity_values` for active values → finds the old "25" BUT if the entity was updated to a Branch overlay, the old value may not be linked properly

### Why This Matters
Character fields (`age`, `height`, `hair_color`, `eye_color`) are critical metadata. If they survive extraction #1 but are lost during extraction #2 (when the LLM doesn't re-extract them), the entity loses detail over time.

### Fix Strategy
**Don't skip nulls in value sync. Instead:**
1. Distinguish between "field provided as null by extraction" vs "field not present in LLM output"
2. If a field was previously populated and the new extraction omits it (doesn't provide it at all), PRESERVE the old value
3. If a field was previously populated and the new extraction explicitly sets it to null, MARK it as "user-cleared" (if user did it) or "no longer mentioned" (if LLM cleared it)

**Implementation approach:**
- Add a `field_source` column to `knowledge_entity_values` table to distinguish extraction-provided vs user-provided vs inferred
- Modify `syncEntityValues()` to check if field was previously populated before skipping null
- If skipping a null field that had a prior value, preserve that value instead of allowing it to be superseded

---

## FAILURE 2: Abilities Not Persisting or Displaying

### Root Cause
**File:** `supabase/functions/extract-knowledge/index.ts`  
**Function:** `normalizeEntities()` (lines 285–288, 352–354)  
**Issue:** Abilities are extracted and stored in `attributes.abilities` as a string array, NOT as separate ability entities with their own UUIDs and relationship records. This violates the entity model: abilities should be first-class entities, not embedded data.

### Evidence from Code
```typescript
// supabase/functions/extract-knowledge/index.ts, lines 285–288
if (entity.abilities && entity.abilities.length > 0) {
  existing.attributes.abilities = [...((existing.attributes.abilities as string[]) || []), ...entity.abilities];
}
```

And later:
```typescript
// supabase/functions/extract-knowledge/index.ts, lines 352–354
for (const ab of extraction.abilities || []) {
  const type = "ability";
  addEntity(ab.name, type, ab);
}
```

**The disconnect:** Line 352 normalizes abilities as separate entities. But line 285 ALSO stores them inside character attributes. This creates two parallel representations:
1. Ability as a separate entity (with UUID, searchable, displayable)
2. Ability as a string in character.attributes.abilities (unlinked, hard to render)

### Why This Matters
When the UI tries to display abilities, it has no way to link the ability name back to the ability entity. Abilities are rendered as plain text, not as clickable entity links. If multiple characters share an ability, there's no relationship tracking.

### Fix Strategy
**Stop storing abilities in character attributes. Instead:**
1. Create ability entities through normal extraction flow (already happening at line 352)
2. Create relationship records linking character → ability with type "has_ability"
3. Remove the inline ability array from character.attributes
4. Update UI to query relationships to display character abilities

**Implementation approach:**
- Remove lines 285–288 (don't merge abilities into attributes)
- After entity extraction, create `knowledge_entity_relationships` records for character → ability relationships
- Update `CharacterDetailModal` and `AbilitiesPanel` to query relationships instead of attributes

---

## FAILURE 3: Object Extraction and Persistence Fails

### Root Cause
**File:** `supabase/functions/extract-knowledge/index.ts` + `supabase/functions/_shared/value-sync.ts`  
**Functions:** `buildStructuredFields()` (lines 222–232) + `syncEntityValues()` (line 57)  
**Issue:** Object fields like `materials`, `special_properties`, `origin` are initialized to null in `buildStructuredFields()` if not provided by the LLM. Then in `syncEntityValues()`, all null values are skipped (line 57). Result: object entities end up with all fields as null in the database, appearing as "לא ידוע" (unknown) in the UI.

### Evidence from Code
```typescript
// supabase/functions/extract-knowledge/index.ts, lines 222–232
fields.object_type = entity.object_type || null;
fields.appearance = entity.appearance || null;
fields.materials = entity.materials || null;
fields.special_properties = entity.special_properties || null;
fields.origin = entity.origin || null;
```

These are passed to `syncEntityValues()`, which skips them:
```typescript
// supabase/functions/_shared/value-sync.ts, line 57
if (value === null || value === undefined) {
  continue; // Skip nulls ← No record created
}
```

### Why This Matters
If the LLM extracts an object but doesn't populate every field (e.g., it provides `materials: "wood"` but not `origin`), the user sees "origin: לא ידוע". If a second extraction adds `origin: "ancient library"`, it should update the entity. But since the first extraction never created a value record for `origin` (it was null), the second extraction has nothing to supersede.

### Fix Strategy
**Track whether a field was provided vs omitted by the LLM:**
1. Distinguish between "LLM said this field is null/unknown" vs "LLM didn't provide this field at all"
2. For fields provided by LLM (even if null), create a `knowledge_entity_values` record
3. For fields not mentioned by LLM, don't create a record (allow a future extraction to add it)
4. When updating, check if a value record exists before deciding to skip

**Implementation approach:**
- Modify `syncEntityValues()` to accept a "provided_fields" set indicating which fields the extraction explicitly provided
- Create value records for provided fields, even if they're null
- Skip only fields that weren't mentioned in the extraction
- This way, a second extraction can find the prior value and supersede it

---

## FAILURE 4: Cabinet Consolidation — Two with Same Name Should Get TWO UUIDs

### Root Cause
**File:** `supabase/functions/_shared/entity-resolution.ts`  
**Function:** `hasConflictingEntityContext()` (lines 137–171) + `resolveExtractionCandidate()` (lines 84–110)  
**Issue:** When two entities with the same name are extracted in different batches (first extraction extracts Cabinet A, second extraction extracts Cabinet B), the cross-batch entity resolver attempts to match Cabinet B to an existing entity. If Cabinet A is stored with sparse fields (e.g., `materials` is null because it wasn't extracted), the conflict check may incorrectly determine that Cabinet B matches Cabinet A, and Cabinet B's data is stored as a Branch overlay on Cabinet A's UUID instead of creating a new entity.

### Evidence from Code
```typescript
// supabase/functions/_shared/entity-resolution.ts, lines 156–160
const leftFields = fieldValues(left);  // Cabinet B's fields
const rightFields = fieldValues(right);  // Cabinet A's fields
for (const [key, leftValue] of leftFields) {
  const rightValue = rightFields.get(key);
  if (rightValue && leftValue !== rightValue) return true;  // CONFLICTING
}
```

**The problem:** If Cabinet A was extracted without `materials` field, `rightFields` is empty. The loop never finds a conflict. The function falls through to the context token check, which may also pass. Result: `hasConflictingEntityContext()` returns FALSE, and Cabinet B is matched to Cabinet A's UUID.

### Why This Matters
The user has two distinct Cabinet objects:
- Cabinet A (magical): wood, ornate, symbols of power, magical artifacts
- Cabinet B (practical): glass, small, herbs, in cottage

Both named "ארון" in Hebrew. They should get TWO separate UUIDs. If they're incorrectly merged, one is lost, and the database cannot distinguish between them.

### Fix Strategy
**Require that conflicting field values be PRESENT (not null) in either entity before deciding they're the same:**
1. If both entities have a field populated, and values differ → CONFLICTING → create separate entity ✓
2. If one entity has a field, the other has null → NOT CONCLUSIVE → check other evidence
3. If BOTH entities are missing a field → NOT CONCLUSIVE → check descriptions and context
4. If descriptions are missing or empty on both → NOT CONCLUSIVE → require explicit evidence (prefix match, co-location, etc.)

**Implementation approach:**
- Modify `hasConflictingEntityContext()` to distinguish between "no conflict because field values match" vs "no conflict because we have no data"
- When merging entities cross-batch, require STRONGER evidence if both entities have sparse fields
- If an entity is extracted with very few populated fields, store it with a flag indicating "incomplete extraction" so future matches require more evidence
- Add a unit test specifically for the two-Cabinet scenario

---

## Summary of Fixes

| Failure | Root Cause | Fix |
|---------|-----------|-----|
| **1. Character fields** | Nulls skipped in value-sync | Track "provided_fields"; create value records for provided nulls; preserve prior values when field omitted |
| **2. Abilities** | Stored in attributes, not as entities | Extract as separate entities; create relationship records; remove from attributes; update UI to query relationships |
| **3. Objects** | Null fields never synced | Same fix as #1; track which fields extraction provided vs omitted |
| **4. Cabinet consolidation** | Conflict check passes when fields are null | Require stronger evidence when merging sparse entities; don't match on name alone if both missing descriptive fields |

---

## Preservation Requirements Met by Fixes

✅ **UUID = identity** — Each entity gets a UUID at creation and keeps it. No identity merging.  
✅ **canonical_name = non-unique** — Same name doesn't force merge. Conflicts create separate entities with keys like "name::2"  
✅ **Same entity → same UUID** — Within-batch consolidation merges mentions of same entity. Cross-batch matching uses strong evidence.  
✅ **Different same-name entities → different UUIDs** — Conflict detection prevents false merges.  
✅ **Ambiguous identity → no unsafe merge** — When evidence is weak, new UUID is created.  
✅ **Main remains immutable** — First extraction creates Main layer. Later extractions use Branch or overlay.  
✅ **Branch contains only Branch-specific overlays** — No duplication of Main entities in Branch table.  

---
