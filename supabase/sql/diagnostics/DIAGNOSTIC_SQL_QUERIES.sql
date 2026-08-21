-- ============================================================================
-- EXTRACTION DIAGNOSTIC SQL QUERIES
-- ============================================================================
-- Use these queries directly in Supabase SQL Editor to diagnose extraction issues
-- Copy and paste one at a time to get immediate results
-- ============================================================================

-- ============================================================================
-- QUERY 1: Get Last 3 Extractions (Metadata)
-- ============================================================================
-- Shows when extractions ran and basic info
SELECT 
  id,
  project_id,
  document_id,
  model,
  chunks_count,
  total_tokens,
  input_tokens,
  output_tokens,
  created_at
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 3;

-- ============================================================================
-- QUERY 2: Get Latest Raw Response (Full JSON)
-- ============================================================================
-- Shows the complete raw response from Gemini for the latest extraction
SELECT 
  id,
  created_at,
  model,
  raw_response,
  total_tokens
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 3: Check Raw Response Structure
-- ============================================================================
-- Shows what top-level keys are in the response
SELECT 
  id,
  created_at,
  jsonb_object_keys(raw_response) as response_keys
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 4: Check Characters Array
-- ============================================================================
-- Shows if characters array exists and how many items
SELECT 
  id,
  created_at,
  jsonb_array_length(raw_response -> 'characters') as character_count,
  (raw_response -> 'characters') as characters_array
FROM raw_extractions
WHERE raw_response -> 'characters' IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 5: Check Abilities Array
-- ============================================================================
-- Shows if abilities array exists and how many items
SELECT 
  id,
  created_at,
  jsonb_array_length(raw_response -> 'abilities') as ability_count,
  (raw_response -> 'abilities') as abilities_array
FROM raw_extractions
WHERE raw_response -> 'abilities' IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 6: Check Magic Abilities Array
-- ============================================================================
-- Shows if magic_abilities array exists and how many items
SELECT 
  id,
  created_at,
  jsonb_array_length(raw_response -> 'magic_abilities') as magic_ability_count,
  (raw_response -> 'magic_abilities') as magic_abilities_array
FROM raw_extractions
WHERE raw_response -> 'magic_abilities' IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 7: Check First Character's Abilities
-- ============================================================================
-- Shows what abilities the first extracted character has
SELECT 
  id,
  created_at,
  raw_response -> 'characters' -> 0 ->> 'name' as character_name,
  jsonb_array_length(raw_response -> 'characters' -> 0 -> 'abilities') as ability_count_in_character,
  raw_response -> 'characters' -> 0 -> 'abilities' as character_abilities,
  jsonb_array_length(raw_response -> 'characters' -> 0 -> 'magic_abilities') as magic_ability_count_in_character,
  raw_response -> 'characters' -> 0 -> 'magic_abilities' as character_magic_abilities
FROM raw_extractions
WHERE raw_response -> 'characters' IS NOT NULL
  AND jsonb_array_length(raw_response -> 'characters') > 0
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 8: Compare Extraction Attempts (Last 3)
-- ============================================================================
-- Side-by-side comparison of the last 3 extraction attempts
SELECT 
  id,
  created_at,
  jsonb_array_length(raw_response -> 'characters') as char_count,
  jsonb_array_length(raw_response -> 'abilities') as ability_count,
  jsonb_array_length(raw_response -> 'magic_abilities') as magic_ability_count,
  jsonb_array_length(raw_response -> 'locations') as location_count,
  total_tokens,
  chunks_count
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 3;

-- ============================================================================
-- QUERY 9: Check for NULL or Empty Arrays
-- ============================================================================
-- Identifies which fields are missing or empty
SELECT 
  id,
  created_at,
  raw_response -> 'characters' IS NULL as characters_null,
  jsonb_array_length(raw_response -> 'characters') = 0 as characters_empty,
  raw_response -> 'abilities' IS NULL as abilities_null,
  jsonb_array_length(raw_response -> 'abilities') = 0 as abilities_empty,
  raw_response -> 'magic_abilities' IS NULL as magic_abilities_null,
  jsonb_array_length(raw_response -> 'magic_abilities') = 0 as magic_abilities_empty
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 3;

-- ============================================================================
-- QUERY 10: Export Latest Response as Readable JSON
-- ============================================================================
-- Get the latest response in a readable format for manual inspection
SELECT 
  jsonb_pretty(raw_response) as formatted_response,
  created_at
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 11: Check Entity Creation from Extractions
-- ============================================================================
-- Shows how many entities were created vs what was extracted
SELECT 
  COUNT(DISTINCT ke.id) as total_entities,
  COUNT(DISTINCT CASE WHEN ke.entity_type = 'character' THEN ke.id END) as characters,
  COUNT(DISTINCT CASE WHEN ke.entity_type = 'ability' THEN ke.id END) as abilities,
  COUNT(DISTINCT CASE WHEN ke.entity_type = 'magic_ability' THEN ke.id END) as magic_abilities,
  COUNT(DISTINCT CASE WHEN ke.entity_type = 'location' THEN ke.id END) as locations
FROM knowledge_entities ke
WHERE ke.raw_extraction_id IN (
  SELECT id FROM raw_extractions ORDER BY created_at DESC LIMIT 1
);

-- ============================================================================
-- QUERY 12: Check For Parse Errors (if error column exists)
-- ============================================================================
-- Shows any error messages from extraction attempts
SELECT 
  id,
  created_at,
  raw_response ->> 'error' as error_message,
  raw_response ->> 'error_type' as error_type,
  total_tokens
FROM raw_extractions
WHERE raw_response ->> 'error' IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- QUERY 13: Full Raw Response (Pretty Printed) for Last 3 Attempts
-- ============================================================================
-- Shows the complete response structure for debugging
SELECT 
  id,
  created_at,
  model,
  chunks_count,
  jsonb_pretty(raw_response) as response
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 3;

-- ============================================================================
-- QUERY 14: Check Specific Field Types
-- ============================================================================
-- Validates that array fields are actually arrays (not strings, nulls, etc.)
SELECT 
  id,
  created_at,
  jsonb_typeof(raw_response -> 'characters') as characters_type,
  jsonb_typeof(raw_response -> 'abilities') as abilities_type,
  jsonb_typeof(raw_response -> 'magic_abilities') as magic_abilities_type,
  jsonb_typeof(raw_response -> 'locations') as locations_type
FROM raw_extractions
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- QUERY 15: Summary Statistics
-- ============================================================================
-- Overall statistics about extractions
SELECT 
  COUNT(*) as total_extractions,
  COUNT(DISTINCT model) as unique_models,
  AVG(total_tokens) as avg_tokens,
  SUM(chunks_count) as total_chunks_processed,
  MAX(created_at) as latest_extraction
FROM raw_extractions;

-- ============================================================================
-- HOW TO USE THESE QUERIES
-- ============================================================================
-- 1. Go to: https://app.supabase.com/project/[your-project]/sql
-- 2. Copy one query (e.g., QUERY 1)
-- 3. Paste into the SQL Editor
-- 4. Click "Run" 
-- 5. View results below
--
-- RECOMMENDED ORDER FOR DIAGNOSIS:
-- - Run Query 8 first to see the summary
-- - If arrays are empty, run Query 2 to see the full raw response
-- - Run Query 9 to check what's NULL or empty
-- - Run Query 10 if you need the pretty-printed response
-- - Run Query 12 if you suspect errors
--
-- ============================================================================

