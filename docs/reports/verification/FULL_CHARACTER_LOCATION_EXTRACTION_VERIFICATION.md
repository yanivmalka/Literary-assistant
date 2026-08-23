# Full Character and Location Extraction Verification

**Status:** Planned verification — not yet executed against live Gemini and Supabase

## Purpose

The existing controlled extraction verification covers only a subset of character fields and does not include a named location. This protocol defines the next verification needed to prove extraction across every active `CharacterFields` and `LocationFields` field, from model output through persistence and value synchronization.

This is an extraction and data-integrity verification task. It does not implement the future Wishlist systems and does not change the Main/Branch architecture.

## Scope

The verification covers:

- Gemini/raw extraction output
- Backward-compatible payload normalization
- `buildStructuredFields()` and entity consolidation
- Persistence to `knowledge_entities.structured_fields`
- Persistence to `knowledge_entity_values`
- Main-layer routing and Branch isolation
- Manual UI inspection of the complete edit form

The active field counts are:

- **Character:** 20 fields
- **Location:** 9 fields
- **Total:** 29 fields

The active lists are defined by `client/src/lib/entityTypes.ts`. `parent_location`, `related_events`, and `related_characters` are not active LocationFields acceptance criteria; they should be represented through entity relationships where applicable.

## Test material

- Fixture: `tests/fixtures/FULL_CHARACTER_LOCATION_TEST_DOCUMENT.md`
- Verification SQL: `supabase/sql/verification/VERIFY_CHARACTER_LOCATION_FIELDS.sql`
- Existing baseline report: `docs/reports/verification/REAL_EXTRACTION_VERIFICATION_READY.md`

Use an isolated, clean project. The SQL currently uses the existing controlled-verification project ID `6c4b7b92-214a-4785-ad66-e62527ee68d6`; replace it if a different test project is used.

## Expected field matrix

### Character — 20 fields

| Group | Fields |
|---|---|
| Basic | `name`, `age`, `gender`, `height` |
| Appearance | `hair_color`, `eye_color`, `face_structure`, `cheekbones`, `eye_shape`, `forehead`, `nose`, `beard_mustache`, `common_clothing`, `jewelry`, `scars`, `tattoos`, `other_visual_features` |
| Description | `description`, `narrative_role`, `narrative_impact` |

### Location — 9 fields

| Group | Fields |
|---|---|
| Basic | `name`, `location_type`, `description` |
| Geographic hierarchy | `continent`, `country`, `region`, `city` |
| Narrative | `narrative_impact`, `narrative_importance` |

The exact expected values are defined in the fixture and repeated in the standalone SQL queries so each query can be run independently. The SQL compares case-insensitively and allows the extracted value to contain the expected phrase, because the model may return a slightly fuller description.

## Execution procedure

1. Create or select a clean isolated test project and confirm the user can run extraction.
2. Upload and extract `FULL_CHARACTER_LOCATION_TEST_DOCUMENT.md` through the application.
3. Run the raw-response query first and save the latest `raw_extraction_id`.
4. Inspect `raw_response->characters` and `raw_response->locations`.
5. Run the structured-field matrix query. It must return matching values for all 20 character fields and all 9 location fields.
6. Run the `knowledge_entity_values` query. It must return one current Main value for each of the 29 fields, with AI source metadata and a non-null extraction lineage.
7. Run the Main/Branch queries. Both entities must be `layer='main'` with `branch_id IS NULL`, and no unexpected Branch overlays may exist.
8. Open the Character and Location edit modals in the UI and confirm all active fields are populated. Do not treat a summary tile that shows only a subset as proof of complete UI coverage.
9. Record the result by layer: raw extraction, normalization, structured persistence, value sync, Main routing, and UI.

## PASS/FAIL rules

### Raw extraction

- **PASS:** Gemini returns both named entities and all expected field information in the raw response.
- **FAIL — extraction:** a field is absent or materially incorrect in `raw_response`.

### Structured persistence

- **PASS:** all 29 expected values are present and match in `knowledge_entities.structured_fields`.
- **FAIL — normalization/persistence:** a value exists in raw output but is lost, nulled, or incorrectly merged before or during persistence.

### Canonical values and provenance

- **PASS:** all 29 values have current `knowledge_entity_values` rows with the expected value, AI source, Main scope, confidence, and `raw_extraction_id`.
- **FAIL — value sync:** structured fields are correct but the value row is missing, stale, Branch-scoped, or disconnected from the extraction.

### Main/Branch

- **PASS:** the first extraction creates both entities in Main with `branch_id IS NULL` and no overlays.
- **FAIL — routing:** either entity is written to Branch or an overlay is created during the Main bootstrap.

### UI

- **PASS:** the edit forms load and display all 20 CharacterFields and all 9 LocationFields from the persisted entity.
- **INCOMPLETE:** summary cards or detail views show only a subset. This is a UI coverage gap, not proof that extraction failed.

## Known implementation risks to check explicitly

The current codebase indicates several areas that this verification must expose rather than silently overlook:

1. `ExtractedEntity` and `buildStructuredFields()` do not explicitly define/populate every active CharacterFields field, including `cheekbones`, `eye_shape`, `forehead`, `nose`, `beard_mustache`, `jewelry`, `other_visual_features`, and `narrative_impact`.
2. Location `narrative_impact` is currently populated as `null` in the normalization builder.
3. `validateExtractionPayload()` does not currently enforce field coverage or field types.
4. `knowledge_entity_values` is an audit/provenance read model; the UI currently reads `structured_fields` directly.
5. Character and Location summary components intentionally display only a subset of fields. Full UI verification must use the edit modals unless the detail views are expanded.
6. `knowledge_entity_value_evidence` may retain quote evidence without a direct `chunk_id` in the value-sync path; this must be recorded as a provenance gap if observed.

A field failing because the raw response lacks it is an extraction-contract gap. A field present in raw output but absent from `structured_fields` is a normalization gap. A field present in `structured_fields` but absent from `knowledge_entity_values` is a value-sync gap.

## Completion criteria

This verification task is complete only when:

- [ ] Raw Gemini output covers all 29 fields.
- [ ] All 20 CharacterFields values persist correctly.
- [ ] All 9 LocationFields values persist correctly.
- [ ] All 29 values are synchronized to `knowledge_entity_values`.
- [ ] Both entities have correct provenance and Main scope.
- [ ] No unexpected Branch overlays are created.
- [ ] UI coverage is recorded separately and gaps are documented.
- [ ] Any failures are assigned to extraction, normalization, persistence, value sync, routing, or UI rather than reported only as a generic failure.

## Next action

Run the fixture and SQL against the isolated test project. Do not mark the extraction pipeline production-ready based on the existing 4-scenario controlled test alone; this full character/location verification is a required additional gate.
