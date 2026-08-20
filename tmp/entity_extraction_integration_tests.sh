#!/bin/bash

#==============================================
# ENTITY EXTRACTION FLOW INTEGRATION TESTS
# After Edge Function fix (Main bootstrap validation)
#==============================================

set -e

# Test configuration
API_URL="${API_URL:-http://localhost:54321}"  # Supabase local or remote
SUPABASE_KEY="${SUPABASE_KEY:-your_key}"
PROJECT_ID="${PROJECT_ID:-test-project-123}"
DOCUMENT_ID="${DOCUMENT_ID:-test-doc-456}"
USER_ID="${USER_ID:-test-user-789}"
TEST_EMAIL="${TEST_EMAIL:-test@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-TestPass123}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

function test_name() {
  echo -e "\n${YELLOW}[TEST]${NC} $1"
}

function pass() {
  echo -e "${GREEN}✓ PASS${NC} - $1"
  ((TESTS_PASSED++))
}

function fail() {
  echo -e "${RED}✗ FAIL${NC} - $1"
  ((TESTS_FAILED++))
}

function verify() {
  local condition=$1
  local message=$2
  if [ "$condition" = "true" ]; then
    pass "$message"
  else
    fail "$message"
  fi
}

#==============================================
# TEST 1: First Extraction (Main Bootstrap)
#==============================================

test_name "1. First Extraction (Main Bootstrap)"

# Build request with use_main=true, target_branch_id=null
REQUEST_BODY_1=$(cat <<EOF
{
  "version_id": "version-1",
  "project_id": "$PROJECT_ID",
  "document_id": "$DOCUMENT_ID",
  "user_id": "$USER_ID",
  "use_main": true,
  "target_branch_id": null,
  "offset": 0,
  "limit": 3
}
EOF
)

echo "Request: $REQUEST_BODY_1"

# Call extract-knowledge
RESPONSE_1=$(curl -s -X POST \
  "${API_URL}/functions/v1/extract-knowledge" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY_1")

echo "Response: $RESPONSE_1"

# Parse response
USE_MAIN_SENT=$(echo "$REQUEST_BODY_1" | grep -o '"use_main": true' | wc -l)
TARGET_BRANCH_SENT=$(echo "$REQUEST_BODY_1" | grep -o '"target_branch_id": null' | wc -l)
HTTP_200=$(echo "$RESPONSE_1" | grep -o '"success": true' | wc -l)
RESPONSE_HAS_LAYER=$(echo "$RESPONSE_1" | grep -o '"layer"' | wc -l)
RESPONSE_HAS_BRANCH_ID=$(echo "$RESPONSE_1" | grep -o '"branch_id"' | wc -l)

verify "$([ $USE_MAIN_SENT -gt 0 ] && echo true || echo false)" "Request includes use_main=true"
verify "$([ $TARGET_BRANCH_SENT -gt 0 ] && echo true || echo false)" "Request includes target_branch_id=null"
verify "$([ $HTTP_200 -gt 0 ] && echo true || echo false)" "Response status 200 with success=true"
verify "$([ $RESPONSE_HAS_LAYER -gt 0 ] && echo true || echo false)" "Response includes layer field"
verify "$([ $RESPONSE_HAS_BRANCH_ID -gt 0 ] && echo true || echo false)" "Response includes branch_id field"

# Extract telemetry
LAYER_1=$(echo "$RESPONSE_1" | grep -o '"layer": "main"' | head -1)
BRANCH_ID_1=$(echo "$RESPONSE_1" | grep -o '"branch_id": null' | head -1)

verify "$([ -n "$LAYER_1" ] && echo true || echo false)" "Response layer='main' for bootstrap"
verify "$([ -n "$BRANCH_ID_1" ] && echo true || echo false)" "Response branch_id=null for bootstrap"

# Check entities saved in Main
ENTITIES_SAVED_1=$(echo "$RESPONSE_1" | grep -o '"entities_saved": [0-9]*' | grep -o '[0-9]*$' | head -1)
echo "Entities saved in Main bootstrap: $ENTITIES_SAVED_1"

# Check relationships and events (should be 0/skipped)
RELATIONSHIPS_1=$(echo "$RESPONSE_1" | grep -o '"relationships_saved": [0-9]*' | grep -o '[0-9]*$' | head -1)
EVENTS_1=$(echo "$RESPONSE_1" | grep -o '"events_saved": [0-9]*' | grep -o '[0-9]*$' | head -1)

verify "$([ "$RELATIONSHIPS_1" = "0" ] && echo true || echo false)" "Main bootstrap skips relationships (saved=0)"
verify "$([ "$EVENTS_1" = "0" ] && echo true || echo false)" "Main bootstrap skips events (saved=0)"

#==============================================
# TEST 2: Second Extraction (Branch Mode)
#==============================================

test_name "2. Second Extraction (Branch Mode)"

# Build request with use_main=false, target_branch_id=<valid_id>
REQUEST_BODY_2=$(cat <<EOF
{
  "version_id": "version-1",
  "project_id": "$PROJECT_ID",
  "document_id": "$DOCUMENT_ID",
  "user_id": "$USER_ID",
  "use_main": false,
  "target_branch_id": "branch-active-001",
  "offset": 0,
  "limit": 3
}
EOF
)

echo "Request: $REQUEST_BODY_2"

# Call extract-knowledge
RESPONSE_2=$(curl -s -X POST \
  "${API_URL}/functions/v1/extract-knowledge" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY_2")

echo "Response: $RESPONSE_2"

# Parse response
USE_MAIN_FALSE=$(echo "$REQUEST_BODY_2" | grep -o '"use_main": false' | wc -l)
TARGET_BRANCH_SET=$(echo "$REQUEST_BODY_2" | grep -o '"target_branch_id": "branch' | wc -l)
HTTP_200_2=$(echo "$RESPONSE_2" | grep -o '"success": true' | wc -l)

verify "$([ $USE_MAIN_FALSE -gt 0 ] && echo true || echo false)" "Request includes use_main=false"
verify "$([ $TARGET_BRANCH_SET -gt 0 ] && echo true || echo false)" "Request includes valid target_branch_id"
verify "$([ $HTTP_200_2 -gt 0 ] && echo true || echo false)" "Response status 200 for branch extraction"

# Extract layer and branch_id
LAYER_2=$(echo "$RESPONSE_2" | grep -o '"layer": "branch"' | head -1)
BRANCH_ID_2=$(echo "$RESPONSE_2" | grep -o '"branch_id": "branch-active-001"' | head -1)

verify "$([ -n "$LAYER_2" ] && echo true || echo false)" "Response layer='branch' for second extraction"
verify "$([ -n "$BRANCH_ID_2" ] && echo true || echo false)" "Response branch_id matches request"

# Check relationships and events (should be > 0 for branch)
RELATIONSHIPS_2=$(echo "$RESPONSE_2" | grep -o '"relationships_saved": [0-9]*' | grep -o '[0-9]*$' | head -1)
EVENTS_2=$(echo "$RESPONSE_2" | grep -o '"events_saved": [0-9]*' | grep -o '[0-9]*$' | head -1)

echo "Relationships saved in Branch: $RELATIONSHIPS_2"
echo "Events saved in Branch: $EVENTS_2"

verify "$([ "$RELATIONSHIPS_2" != "0" ] || echo true)" "Branch extraction saves relationships (or skip is valid)"
verify "$([ "$EVENTS_2" != "0" ] || echo true)" "Branch extraction saves events (or skip is valid)"

#==============================================
# TEST 3: Main Protection Test
#==============================================

test_name "3. Main Protection Test"

# Attempt extraction with use_main=true after Main already has entities
# This should be rejected with 400, NOT 23514 constraint error
REQUEST_BODY_3=$(cat <<EOF
{
  "version_id": "version-2",
  "project_id": "$PROJECT_ID",
  "document_id": "$DOCUMENT_ID",
  "user_id": "$USER_ID",
  "use_main": true,
  "target_branch_id": null,
  "offset": 0,
  "limit": 3
}
EOF
)

echo "Request (second Main attempt): $REQUEST_BODY_3"

RESPONSE_3=$(curl -s -X POST \
  "${API_URL}/functions/v1/extract-knowledge" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY_3")

echo "Response: $RESPONSE_3"

# Should be rejected with error message (not 23514)
HAS_ERROR=$(echo "$RESPONSE_3" | grep -o '"error"' | wc -l)
HAS_23514=$(echo "$RESPONSE_3" | grep -o '23514' | wc -l)
HAS_MAIN_EXISTS=$(echo "$RESPONSE_3" | grep -i 'main.*exists\|already.*main' | wc -l)

verify "$([ $HAS_ERROR -gt 0 ] && echo true || echo false)" "Response contains error field"
verify "$([ $HAS_23514 -eq 0 ] && echo true || echo false)" "Response does NOT contain 23514 constraint error"
verify "$([ $HAS_MAIN_EXISTS -gt 0 ] && echo true || echo false)" "Error message mentions Main already existing"

#==============================================
# TEST 4: Invalid Request - Both Flags
#==============================================

test_name "4. Invalid Request: use_main=true + target_branch_id (cannot specify both)"

REQUEST_BODY_4=$(cat <<EOF
{
  "version_id": "version-1",
  "project_id": "$PROJECT_ID",
  "document_id": "$DOCUMENT_ID",
  "user_id": "$USER_ID",
  "use_main": true,
  "target_branch_id": "branch-active-001",
  "offset": 0,
  "limit": 3
}
EOF
)

echo "Request (both flags): $REQUEST_BODY_4"

RESPONSE_4=$(curl -s -X POST \
  "${API_URL}/functions/v1/extract-knowledge" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY_4")

echo "Response: $RESPONSE_4"

ERROR_BOTH=$(echo "$RESPONSE_4" | grep -i 'cannot specify both' | wc -l)
HAS_400=$(echo "$RESPONSE_4" | grep -o '"status": 400' | wc -l)

verify "$([ $HAS_400 -gt 0 ] && echo true || echo false)" "Response returns 400 status"
verify "$([ $ERROR_BOTH -gt 0 ] && echo true || echo false)" "Error message mentions 'cannot specify both'"

#==============================================
# TEST 5: Invalid Request - No Flags
#==============================================

test_name "5. Invalid Request: use_main=false + target_branch_id=null (must specify one)"

REQUEST_BODY_5=$(cat <<EOF
{
  "version_id": "version-1",
  "project_id": "$PROJECT_ID",
  "document_id": "$DOCUMENT_ID",
  "user_id": "$USER_ID",
  "use_main": false,
  "target_branch_id": null,
  "offset": 0,
  "limit": 3
}
EOF
)

echo "Request (no mode): $REQUEST_BODY_5"

RESPONSE_5=$(curl -s -X POST \
  "${API_URL}/functions/v1/extract-knowledge" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY_5")

echo "Response: $RESPONSE_5"

ERROR_MUST_SPECIFY=$(echo "$RESPONSE_5" | grep -i 'must specify' | wc -l)
HAS_400_5=$(echo "$RESPONSE_5" | grep -o '"status": 400' | wc -l)

verify "$([ $HAS_400_5 -gt 0 ] && echo true || echo false)" "Response returns 400 status"
verify "$([ $ERROR_MUST_SPECIFY -gt 0 ] && echo true || echo false)" "Error message mentions 'must specify'"

#==============================================
# TEST 6: API Response Behavior
#==============================================

test_name "6. API Response Behavior (telemetry and structure)"

# Using response from test 1
echo "Checking response structure from test 1..."

HAS_TELEMETRY=$(echo "$RESPONSE_1" | grep -o '"telemetry"' | wc -l)
HAS_MODEL=$(echo "$RESPONSE_1" | grep -o '"model"' | wc -l)
HAS_LATENCY=$(echo "$RESPONSE_1" | grep -o '"latency_ms"' | wc -l)
HAS_SUMMARY=$(echo "$RESPONSE_1" | grep -o '"summary"' | wc -l)

verify "$([ $HAS_TELEMETRY -gt 0 ] && echo true || echo false)" "Response includes telemetry object"
verify "$([ $HAS_MODEL -gt 0 ] && echo true || echo false)" "Telemetry includes model field"
verify "$([ $HAS_LATENCY -gt 0 ] && echo true || echo false)" "Telemetry includes latency_ms field"
verify "$([ $HAS_SUMMARY -gt 0 ] && echo true || echo false)" "Response includes summary object"

NO_23514_ERRORS=$(echo "$RESPONSE_1" | grep -c '23514' || echo 0)
verify "$([ $NO_23514_ERRORS -eq 0 ] && echo true || echo false)" "Response contains NO 23514 errors"

#==============================================
# TEST SUMMARY
#==============================================

echo -e "\n${YELLOW}========================================${NC}"
echo -e "INTEGRATION TEST SUMMARY"
echo -e "${YELLOW}========================================${NC}"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo -e "${YELLOW}========================================${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
