#!/bin/bash

# Controlled Test Extraction Runner
# Purpose: Execute controlled extraction and capture diagnostic data
# Usage: ./run_controlled_test.sh <PROJECT_ID> <USER_ID> [DOCUMENT_ID]

set -e

PROJECT_ID="${1:?PROJECT_ID required}"
USER_ID="${2:?USER_ID required}"
DOCUMENT_ID="${3:-}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/tests/results/CONTROLLED_TEST_OUTPUT"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$OUTPUT_DIR/test_run_${TIMESTAMP}.log"

echo "[$(date)] Starting controlled extraction test" | tee "$LOG_FILE"
echo "PROJECT_ID: $PROJECT_ID" | tee -a "$LOG_FILE"
echo "USER_ID: $USER_ID" | tee -a "$LOG_FILE"
echo "DOCUMENT_ID: $DOCUMENT_ID" | tee -a "$LOG_FILE"
echo "OUTPUT_DIR: $OUTPUT_DIR" | tee -a "$LOG_FILE"

# Step 1: If DOCUMENT_ID not provided, list available documents
if [ -z "$DOCUMENT_ID" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "[$(date)] Querying available documents..." | tee -a "$LOG_FILE"
  
  supabase db query --linked << EOF > "$OUTPUT_DIR/documents_available_${TIMESTAMP}.txt"
SELECT 
  d.id,
  d.name,
  d.title,
  COUNT(dc.id) as chunk_count,
  MAX(dc.created_at) as last_updated
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
WHERE d.project_id = '$PROJECT_ID'
  AND d.user_id = '$USER_ID'
GROUP BY d.id, d.name, d.title
ORDER BY d.created_at DESC
LIMIT 20;
EOF

  echo "Available documents saved to: $OUTPUT_DIR/documents_available_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"
  cat "$OUTPUT_DIR/documents_available_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "Please provide DOCUMENT_ID as third argument and run again." | tee -a "$LOG_FILE"
  exit 0
fi

# Step 2: Query raw extractions before test
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Querying raw extractions BEFORE test..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF > "$OUTPUT_DIR/raw_extractions_before_${TIMESTAMP}.txt"
SELECT 
  id,
  document_id,
  created_at,
  branch_id,
  model
FROM raw_extractions
WHERE project_id = '$PROJECT_ID'
  AND document_id = '$DOCUMENT_ID'
ORDER BY created_at DESC
LIMIT 5;
EOF

cat "$OUTPUT_DIR/raw_extractions_before_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

# Step 3: Query entities before test
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Querying entities BEFORE test..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF > "$OUTPUT_DIR/entities_before_${TIMESTAMP}.txt"
SELECT 
  COUNT(*) as total_count,
  SUM(CASE WHEN layer='main' THEN 1 ELSE 0 END) as main_layer_count,
  SUM(CASE WHEN layer='branch' THEN 1 ELSE 0 END) as branch_layer_count
FROM knowledge_entities
WHERE project_id = '$PROJECT_ID'
  AND user_id = '$USER_ID';
EOF

cat "$OUTPUT_DIR/entities_before_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

# Step 4: Trigger extraction via HTTP call (if SERVER_URL provided)
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Triggering extraction (you must do this manually via UI)" | tee -a "$LOG_FILE"
echo "Steps:" | tee -a "$LOG_FILE"
echo "1. Open the app UI" | tee -a "$LOG_FILE"
echo "2. Navigate to document: $DOCUMENT_ID" | tee -a "$LOG_FILE"
echo "3. Click 'Extract Knowledge'" | tee -a "$LOG_FILE"
echo "4. Wait for completion" | tee -a "$LOG_FILE"
echo "5. Return to this terminal and press ENTER" | tee -a "$LOG_FILE"
read -p "Press ENTER when extraction is complete..." dummy

# Step 5: Query raw extraction AFTER test
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Querying raw extraction AFTER test..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF > "$OUTPUT_DIR/raw_extraction_response_${TIMESTAMP}.txt"
SELECT 
  id as raw_extraction_id,
  raw_response,
  model,
  branch_id,
  created_at,
  chunks_count
FROM raw_extractions
WHERE project_id = '$PROJECT_ID'
  AND document_id = '$DOCUMENT_ID'
ORDER BY created_at DESC
LIMIT 1;
EOF

cat "$OUTPUT_DIR/raw_extraction_response_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

# Extract the raw_response JSON for separate analysis
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Extracting raw LLM response JSON..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF | jq '.raw_response // empty' > "$OUTPUT_DIR/llm_response_${TIMESTAMP}.json"
SELECT raw_response
FROM raw_extractions
WHERE project_id = '$PROJECT_ID'
  AND document_id = '$DOCUMENT_ID'
ORDER BY created_at DESC
LIMIT 1;
EOF

if [ -s "$OUTPUT_DIR/llm_response_${TIMESTAMP}.json" ]; then
  echo "LLM response saved to: $OUTPUT_DIR/llm_response_${TIMESTAMP}.json" | tee -a "$LOG_FILE"
  echo "Response preview (first 500 chars):" | tee -a "$LOG_FILE"
  head -c 500 "$OUTPUT_DIR/llm_response_${TIMESTAMP}.json" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
else
  echo "WARNING: LLM response JSON is empty" | tee -a "$LOG_FILE"
fi

# Step 6: Query entities after test
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Querying entities AFTER test..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF > "$OUTPUT_DIR/entities_after_${TIMESTAMP}.txt"
SELECT 
  COUNT(*) as total_count,
  SUM(CASE WHEN layer='main' THEN 1 ELSE 0 END) as main_layer_count,
  SUM(CASE WHEN layer='branch' THEN 1 ELSE 0 END) as branch_layer_count
FROM knowledge_entities
WHERE project_id = '$PROJECT_ID'
  AND user_id = '$USER_ID';
EOF

cat "$OUTPUT_DIR/entities_after_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

# Step 7: Query Cabinet entities specifically
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Querying 'Cabinet' entities..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF > "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt"
SELECT 
  id,
  canonical_name,
  entity_type,
  layer,
  branch_id,
  attributes->>'materials' as materials,
  attributes->>'purpose' as purpose,
  attributes->>'special_properties' as special_properties,
  created_at
FROM knowledge_entities
WHERE canonical_name LIKE 'Cabinet%'
  AND project_id = '$PROJECT_ID'
  AND user_id = '$USER_ID'
ORDER BY created_at;
EOF

cat "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

# Step 8: Query Leo entities
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Querying 'Leo' entities..." | tee -a "$LOG_FILE"

supabase db query --linked << EOF > "$OUTPUT_DIR/leo_entities_${TIMESTAMP}.txt"
SELECT 
  id,
  canonical_name,
  entity_type,
  layer,
  branch_id,
  aliases,
  attributes->>'tattoo' as tattoo,
  attributes->>'abilities' as abilities,
  created_at
FROM knowledge_entities
WHERE canonical_name LIKE 'Leo%'
  AND project_id = '$PROJECT_ID'
  AND user_id = '$USER_ID'
ORDER BY created_at;
EOF

cat "$OUTPUT_DIR/leo_entities_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

# Step 9: Generate comparison report
echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Generating comparison report..." | tee -a "$LOG_FILE"

cat > "$OUTPUT_DIR/comparison_report_${TIMESTAMP}.txt" << COMPARISON
=================================================================
CONTROLLED EXTRACTION TEST REPORT
=================================================================
Timestamp: $TIMESTAMP
Project ID: $PROJECT_ID
User ID: $USER_ID
Document ID: $DOCUMENT_ID

=================================================================
ENTITY COUNTS
=================================================================

Before test:
$(cat "$OUTPUT_DIR/entities_before_${TIMESTAMP}.txt")

After test:
$(cat "$OUTPUT_DIR/entities_after_${TIMESTAMP}.txt")

=================================================================
CABINET ENTITIES (Expected: 2 separate Cabinets with different context)
=================================================================

$(cat "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt")

=================================================================
LEO ENTITIES (Expected: 1 Leo with combined attributes)
=================================================================

$(cat "$OUTPUT_DIR/leo_entities_${TIMESTAMP}.txt")

=================================================================
DIAGNOSTIC QUESTIONS
=================================================================

1. How many Cabinet rows are there?
   Expected: 2 (one magical, one practical)
   Actual: $(grep -c "Cabinet" "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt" || echo "0")

2. Do the Cabinets have different materials?
   Expected: Yes (wood vs glass)
   Actual: $(grep -E "materials.*wood|materials.*glass" "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt" | wc -l)

3. Is there only one Leo entity?
   Expected: 1
   Actual: $(grep -c "Leo" "$OUTPUT_DIR/leo_entities_${TIMESTAMP}.txt" || echo "0")

4. Are all abilities in Leo's attributes?
   Expected: 4 abilities present
   Actual: See abilities field above

5. Is layer consistency maintained?
   Expected: All layer='main' or layer='branch'
   Main count: $(grep "layer.*main" "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt" | wc -l)
   Branch count: $(grep "layer.*branch" "$OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt" | wc -l)

=================================================================
NEXT STEPS
=================================================================

1. Review the LLM response: $OUTPUT_DIR/llm_response_${TIMESTAMP}.json
2. Check entity counts and structure above
3. Verify Cabinet isolation (two separate rows)
4. Verify Leo consolidation (one row with all aliases and abilities)
5. If issues found, run trace analysis in Task #3

Files created:
- $OUTPUT_DIR/llm_response_${TIMESTAMP}.json (raw LLM output)
- $OUTPUT_DIR/cabinet_entities_${TIMESTAMP}.txt (Cabinet query results)
- $OUTPUT_DIR/leo_entities_${TIMESTAMP}.txt (Leo query results)
- $OUTPUT_DIR/comparison_report_${TIMESTAMP}.txt (this report)

COMPARISON

cat "$OUTPUT_DIR/comparison_report_${TIMESTAMP}.txt" | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "[$(date)] Controlled extraction test complete!" | tee -a "$LOG_FILE"
echo "All output saved to: $OUTPUT_DIR" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"

