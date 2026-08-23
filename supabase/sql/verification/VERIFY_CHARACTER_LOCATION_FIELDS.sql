-- Full Character and Location Extraction Verification
-- Fixture: tests/fixtures/FULL_CHARACTER_LOCATION_TEST_DOCUMENT.md
-- Purpose: verify extraction, normalization, persistence, value sync, and Main scope
-- Replace the project ID below with the isolated project used for this run.
-- This script is read-only.

-- Test project used by the existing controlled-extraction verification package.
-- Run this fixture in a clean project or record a run-specific extraction ID.

-- ============================================================================
-- 0. RAW EXTRACTION INSPECTION
-- ============================================================================
-- Use this query first to distinguish an extraction failure from a persistence
-- or normalization failure. The raw response must contain both target entities.

SELECT
  id AS raw_extraction_id,
  project_id,
  branch_id,
  created_at,
  jsonb_pretty(raw_response->'characters') AS raw_characters,
  jsonb_pretty(raw_response->'locations') AS raw_locations
FROM raw_extractions
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- 1. EXPECTED FIELD MATRIX: 20 CHARACTER FIELDS + 9 LOCATION FIELDS
-- ============================================================================

WITH expected(entity_type, canonical_name, field_path, expected_value) AS (
  VALUES
    -- CharacterFields: basic
    ('character', 'Mira Stonewell', 'name', 'Mira Stonewell'),
    ('character', 'Mira Stonewell', 'age', '31'),
    ('character', 'Mira Stonewell', 'gender', 'woman'),
    ('character', 'Mira Stonewell', 'height', '5 feet 8 inches'),
    -- CharacterFields: appearance
    ('character', 'Mira Stonewell', 'hair_color', 'black'),
    ('character', 'Mira Stonewell', 'eye_color', 'green'),
    ('character', 'Mira Stonewell', 'face_structure', 'oval'),
    ('character', 'Mira Stonewell', 'cheekbones', 'high'),
    ('character', 'Mira Stonewell', 'eye_shape', 'almond-shaped'),
    ('character', 'Mira Stonewell', 'forehead', 'broad'),
    ('character', 'Mira Stonewell', 'nose', 'straight'),
    ('character', 'Mira Stonewell', 'beard_mustache', 'none'),
    ('character', 'Mira Stonewell', 'common_clothing', 'dark-blue wool coat and leather boots'),
    ('character', 'Mira Stonewell', 'jewelry', 'silver moon pendant and a thin copper ring'),
    ('character', 'Mira Stonewell', 'scars', 'narrow scar across her left eyebrow'),
    ('character', 'Mira Stonewell', 'tattoos', 'small crescent tattoo on her right wrist'),
    ('character', 'Mira Stonewell', 'other_visual_features', 'small birthmark below her left ear'),
    -- CharacterFields: description
    ('character', 'Mira Stonewell', 'description', 'observant, patient, and protective'),
    ('character', 'Mira Stonewell', 'narrative_role', 'reluctant guardian'),
    ('character', 'Mira Stonewell', 'narrative_impact', 'protect the forbidden archive drives the central conflict'),
    -- LocationFields: basic
    ('location', 'Asterfall Citadel', 'name', 'Asterfall Citadel'),
    ('location', 'Asterfall Citadel', 'location_type', 'fortress'),
    ('location', 'Asterfall Citadel', 'description', 'walled stone citadel built around a circular archive tower'),
    -- LocationFields: geographic hierarchy
    ('location', 'Asterfall Citadel', 'continent', 'Aurelia'),
    ('location', 'Asterfall Citadel', 'country', 'Lyr'),
    ('location', 'Asterfall Citadel', 'region', 'North March'),
    ('location', 'Asterfall Citadel', 'city', 'Valebridge'),
    -- LocationFields: narrative
    ('location', 'Asterfall Citadel', 'narrative_impact', 'the place where the archive conflict begins'),
    ('location', 'Asterfall Citadel', 'narrative_importance', 'critical')
),
latest_entities AS (
  SELECT DISTINCT ON (entity_type, canonical_name)
    id,
    entity_type,
    canonical_name,
    structured_fields,
    layer,
    branch_id,
    raw_extraction_id
  FROM knowledge_entities
  WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
    AND (
      (entity_type = 'character' AND canonical_name = 'Mira Stonewell')
      OR (entity_type = 'location' AND canonical_name = 'Asterfall Citadel')
    )
  ORDER BY entity_type, canonical_name, created_at DESC
)
SELECT
  expected.entity_type,
  expected.canonical_name,
  expected.field_path,
  expected.expected_value,
  entity.id AS entity_id,
  entity.structured_fields->>expected.field_path AS actual_value,
  CASE
    WHEN entity.id IS NULL THEN 'FAIL: entity missing'
    WHEN entity.structured_fields->>expected.field_path IS NULL THEN 'FAIL: field missing/null'
    WHEN lower(entity.structured_fields->>expected.field_path) LIKE '%' || lower(expected.expected_value) || '%' THEN 'PASS: expected value present'
    ELSE 'FAIL: value mismatch'
  END AS result,
  entity.layer,
  entity.branch_id,
  entity.raw_extraction_id
FROM expected
LEFT JOIN latest_entities entity
  ON entity.entity_type = expected.entity_type
 AND entity.canonical_name = expected.canonical_name
ORDER BY expected.entity_type, expected.canonical_name, expected.field_path;

-- ============================================================================
-- 2. FIELD COVERAGE SUMMARY IN knowledge_entities
-- ============================================================================

WITH expected(entity_type, canonical_name, field_path, expected_value) AS (
  VALUES
    ('character', 'Mira Stonewell', 'name', 'Mira Stonewell'),
    ('character', 'Mira Stonewell', 'age', '31'),
    ('character', 'Mira Stonewell', 'gender', 'woman'),
    ('character', 'Mira Stonewell', 'height', '5 feet 8 inches'),
    ('character', 'Mira Stonewell', 'hair_color', 'black'),
    ('character', 'Mira Stonewell', 'eye_color', 'green'),
    ('character', 'Mira Stonewell', 'face_structure', 'oval'),
    ('character', 'Mira Stonewell', 'cheekbones', 'high'),
    ('character', 'Mira Stonewell', 'eye_shape', 'almond-shaped'),
    ('character', 'Mira Stonewell', 'forehead', 'broad'),
    ('character', 'Mira Stonewell', 'nose', 'straight'),
    ('character', 'Mira Stonewell', 'beard_mustache', 'none'),
    ('character', 'Mira Stonewell', 'common_clothing', 'dark-blue wool coat and leather boots'),
    ('character', 'Mira Stonewell', 'jewelry', 'silver moon pendant and a thin copper ring'),
    ('character', 'Mira Stonewell', 'scars', 'narrow scar across her left eyebrow'),
    ('character', 'Mira Stonewell', 'tattoos', 'small crescent tattoo on her right wrist'),
    ('character', 'Mira Stonewell', 'other_visual_features', 'small birthmark below her left ear'),
    ('character', 'Mira Stonewell', 'description', 'observant, patient, and protective'),
    ('character', 'Mira Stonewell', 'narrative_role', 'reluctant guardian'),
    ('character', 'Mira Stonewell', 'narrative_impact', 'protect the forbidden archive drives the central conflict'),
    ('location', 'Asterfall Citadel', 'name', 'Asterfall Citadel'),
    ('location', 'Asterfall Citadel', 'location_type', 'fortress'),
    ('location', 'Asterfall Citadel', 'description', 'walled stone citadel built around a circular archive tower'),
    ('location', 'Asterfall Citadel', 'continent', 'Aurelia'),
    ('location', 'Asterfall Citadel', 'country', 'Lyr'),
    ('location', 'Asterfall Citadel', 'region', 'North March'),
    ('location', 'Asterfall Citadel', 'city', 'Valebridge'),
    ('location', 'Asterfall Citadel', 'narrative_impact', 'the place where the archive conflict begins'),
    ('location', 'Asterfall Citadel', 'narrative_importance', 'critical')
),
entities AS (
  SELECT DISTINCT ON (entity_type, canonical_name)
    id, entity_type, canonical_name, structured_fields
  FROM knowledge_entities
  WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
    AND canonical_name IN ('Mira Stonewell', 'Asterfall Citadel')
  ORDER BY entity_type, canonical_name, created_at DESC
)
SELECT
  expected.entity_type,
  expected.canonical_name,
  COUNT(*) AS expected_fields,
  COUNT(*) FILTER (WHERE entities.structured_fields->>expected.field_path IS NOT NULL) AS populated_fields,
  COUNT(*) FILTER (
    WHERE entities.structured_fields->>expected.field_path IS NOT NULL
      AND lower(entities.structured_fields->>expected.field_path) LIKE '%' || lower(expected.expected_value) || '%'
  ) AS matching_fields,
  CASE WHEN COUNT(*) = COUNT(*) FILTER (
    WHERE entities.structured_fields->>expected.field_path IS NOT NULL
      AND lower(entities.structured_fields->>expected.field_path) LIKE '%' || lower(expected.expected_value) || '%'
  ) THEN 'PASS' ELSE 'FAIL' END AS result
FROM expected
LEFT JOIN entities
  ON entities.entity_type = expected.entity_type
 AND entities.canonical_name = expected.canonical_name
GROUP BY expected.entity_type, expected.canonical_name
ORDER BY expected.entity_type;

-- ============================================================================
-- 3. knowledge_entity_values SYNC AND PROVENANCE
-- ============================================================================
-- field_path is intentionally checked without a structured_fields prefix:
-- value-sync flattens structured_fields into canonical field paths.

WITH expected(entity_type, canonical_name, field_path, expected_value) AS (
  VALUES
    ('character', 'Mira Stonewell', 'name', 'Mira Stonewell'),
    ('character', 'Mira Stonewell', 'age', '31'),
    ('character', 'Mira Stonewell', 'gender', 'woman'),
    ('character', 'Mira Stonewell', 'height', '5 feet 8 inches'),
    ('character', 'Mira Stonewell', 'hair_color', 'black'),
    ('character', 'Mira Stonewell', 'eye_color', 'green'),
    ('character', 'Mira Stonewell', 'face_structure', 'oval'),
    ('character', 'Mira Stonewell', 'cheekbones', 'high'),
    ('character', 'Mira Stonewell', 'eye_shape', 'almond-shaped'),
    ('character', 'Mira Stonewell', 'forehead', 'broad'),
    ('character', 'Mira Stonewell', 'nose', 'straight'),
    ('character', 'Mira Stonewell', 'beard_mustache', 'none'),
    ('character', 'Mira Stonewell', 'common_clothing', 'dark-blue wool coat and leather boots'),
    ('character', 'Mira Stonewell', 'jewelry', 'silver moon pendant and a thin copper ring'),
    ('character', 'Mira Stonewell', 'scars', 'narrow scar across her left eyebrow'),
    ('character', 'Mira Stonewell', 'tattoos', 'small crescent tattoo on her right wrist'),
    ('character', 'Mira Stonewell', 'other_visual_features', 'small birthmark below her left ear'),
    ('character', 'Mira Stonewell', 'description', 'observant, patient, and protective'),
    ('character', 'Mira Stonewell', 'narrative_role', 'reluctant guardian'),
    ('character', 'Mira Stonewell', 'narrative_impact', 'protect the forbidden archive drives the central conflict'),
    ('location', 'Asterfall Citadel', 'name', 'Asterfall Citadel'),
    ('location', 'Asterfall Citadel', 'location_type', 'fortress'),
    ('location', 'Asterfall Citadel', 'description', 'walled stone citadel built around a circular archive tower'),
    ('location', 'Asterfall Citadel', 'continent', 'Aurelia'),
    ('location', 'Asterfall Citadel', 'country', 'Lyr'),
    ('location', 'Asterfall Citadel', 'region', 'North March'),
    ('location', 'Asterfall Citadel', 'city', 'Valebridge'),
    ('location', 'Asterfall Citadel', 'narrative_impact', 'the place where the archive conflict begins'),
    ('location', 'Asterfall Citadel', 'narrative_importance', 'critical')
),
targets AS (
  SELECT id, entity_type, canonical_name
  FROM knowledge_entities
  WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
    AND canonical_name IN ('Mira Stonewell', 'Asterfall Citadel')
),
latest_values AS (
  SELECT DISTINCT ON (v.entity_id, v.field_path)
    v.entity_id,
    v.field_path,
    v.value_json,
    v.source_type,
    v.value_status,
    v.confidence,
    v.raw_extraction_id,
    v.branch_id,
    v.created_at
  FROM knowledge_entity_values v
  JOIN targets t ON t.id = v.entity_id
  WHERE v.branch_id IS NULL
  ORDER BY v.entity_id, v.field_path, v.created_at DESC
)
SELECT
  expected.entity_type,
  expected.canonical_name,
  expected.field_path,
  expected.expected_value,
  latest_values.value_json->>'value' AS stored_value,
  latest_values.source_type,
  latest_values.value_status,
  latest_values.confidence,
  latest_values.raw_extraction_id,
  latest_values.branch_id,
  CASE
    WHEN latest_values.entity_id IS NULL THEN 'FAIL: value row missing'
    WHEN latest_values.value_json->>'value' IS NULL THEN 'FAIL: value null'
    WHEN latest_values.source_type IS DISTINCT FROM 'ai' THEN 'FAIL: source is not AI'
    WHEN latest_values.raw_extraction_id IS NULL THEN 'FAIL: extraction lineage missing'
    WHEN lower(latest_values.value_json->>'value') LIKE '%' || lower(expected.expected_value) || '%' THEN 'PASS'
    ELSE 'FAIL: value mismatch'
  END AS result
FROM expected
LEFT JOIN targets
  ON targets.entity_type = expected.entity_type
 AND targets.canonical_name = expected.canonical_name
LEFT JOIN latest_values
  ON latest_values.entity_id = targets.id
 AND latest_values.field_path = expected.field_path
ORDER BY expected.entity_type, expected.canonical_name, expected.field_path;

-- ============================================================================
-- 4. MAIN SCOPE AND ENTITY IDENTITY
-- ============================================================================

SELECT
  entity_type,
  canonical_name,
  id,
  layer,
  branch_id,
  CASE
    WHEN layer = 'main' AND branch_id IS NULL THEN 'PASS'
    ELSE 'FAIL: unexpected Branch scope'
  END AS result
FROM knowledge_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND canonical_name IN ('Mira Stonewell', 'Asterfall Citadel')
ORDER BY entity_type, canonical_name;

SELECT
  COUNT(*) AS unexpected_branch_overlays,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM knowledge_branch_entities
WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
  AND source_entity_id IN (
    SELECT id
    FROM knowledge_entities
    WHERE project_id = '6c4b7b92-214a-4785-ad66-e62527ee68d6'
      AND canonical_name IN ('Mira Stonewell', 'Asterfall Citadel')
  );

-- ============================================================================
-- 5. FINAL SUMMARY
-- ============================================================================
-- A full extraction pass requires:
--   * raw response contains both target entities and their expected evidence;
--   * all 20 CharacterFields values match;
--   * all 9 LocationFields values match;
--   * all 29 non-null values are synced to knowledge_entity_values;
--   * both entities are Main entities with branch_id IS NULL;
--   * no unexpected Branch overlays exist.
-- UI display is a separate acceptance layer and is documented in the protocol.
