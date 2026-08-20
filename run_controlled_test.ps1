# Controlled Test Extraction Runner (PowerShell)
# Purpose: Execute controlled extraction and capture diagnostic data
# Usage: .\run_controlled_test.ps1 -ProjectId <ID> -UserId <ID> [-DocumentId <ID>]

param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    
    [Parameter(Mandatory = $true)]
    [string]$UserId,
    
    [Parameter(Mandatory = $false)]
    [string]$DocumentId = ""
)

$OutputDir = "./CONTROLLED_TEST_OUTPUT"
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = "$OutputDir/test_run_${Timestamp}.log"

function Log {
    param([string]$Message)
    $FormattedMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $FormattedMessage
    Add-Content -Path $LogFile -Value $FormattedMessage
}

Log "Starting controlled extraction test"
Log "PROJECT_ID: $ProjectId"
Log "USER_ID: $UserId"
Log "DOCUMENT_ID: $DocumentId"
Log "OUTPUT_DIR: $OutputDir"

# Step 1: If DOCUMENT_ID not provided, list available documents
if ([string]::IsNullOrEmpty($DocumentId)) {
    Log ""
    Log "Querying available documents..."
    
    $Query = @"
SELECT 
  d.id,
  d.name,
  d.title,
  COUNT(dc.id) as chunk_count,
  MAX(dc.created_at) as last_updated
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
WHERE d.project_id = '$ProjectId'
  AND d.user_id = '$UserId'
GROUP BY d.id, d.name, d.title
ORDER BY d.created_at DESC
LIMIT 20;
"@
    
    try {
        $Result = supabase db query --linked $Query
        $OutputFile = "$OutputDir/documents_available_${Timestamp}.txt"
        $Result | Out-File -Path $OutputFile -Encoding UTF8
        Log "Available documents saved to: $OutputFile"
        Write-Host $Result
    } catch {
        Log "ERROR: Failed to query documents: $_"
    }
    
    Log ""
    Log "Please provide DOCUMENT_ID as -DocumentId parameter and run again."
    exit 0
}

# Step 2: Query raw extractions before test
Log ""
Log "Querying raw extractions BEFORE test..."

$Query = @"
SELECT 
  id,
  document_id,
  created_at,
  branch_id,
  model
FROM raw_extractions
WHERE project_id = '$ProjectId'
  AND document_id = '$DocumentId'
ORDER BY created_at DESC
LIMIT 5;
"@

try {
    $Result = supabase db query --linked $Query
    $OutputFile = "$OutputDir/raw_extractions_before_${Timestamp}.txt"
    $Result | Out-File -Path $OutputFile -Encoding UTF8
    Write-Host $Result
    Add-Content -Path $LogFile -Value $Result
} catch {
    Log "ERROR: Failed to query raw extractions: $_"
}

# Step 3: Query entities before test
Log ""
Log "Querying entities BEFORE test..."

$Query = @"
SELECT 
  COUNT(*) as total_count,
  SUM(CASE WHEN layer='main' THEN 1 ELSE 0 END) as main_layer_count,
  SUM(CASE WHEN layer='branch' THEN 1 ELSE 0 END) as branch_layer_count
FROM knowledge_entities
WHERE project_id = '$ProjectId'
  AND user_id = '$UserId';
"@

try {
    $Result = supabase db query --linked $Query
    $OutputFile = "$OutputDir/entities_before_${Timestamp}.txt"
    $Result | Out-File -Path $OutputFile -Encoding UTF8
    Write-Host $Result
    Add-Content -Path $LogFile -Value $Result
} catch {
    Log "ERROR: Failed to query entities: $_"
}

# Step 4: Wait for manual extraction
Log ""
Log "Triggering extraction (you must do this manually via UI)"
Log "Steps:"
Log "1. Open the app UI"
Log "2. Navigate to document: $DocumentId"
Log "3. Click 'Extract Knowledge'"
Log "4. Wait for completion"
Log "5. Return to this terminal and press ENTER"
Read-Host "Press ENTER when extraction is complete"

# Step 5: Query raw extraction AFTER test
Log ""
Log "Querying raw extraction AFTER test..."

$Query = @"
SELECT 
  id as raw_extraction_id,
  raw_response,
  model,
  branch_id,
  created_at,
  chunks_count
FROM raw_extractions
WHERE project_id = '$ProjectId'
  AND document_id = '$DocumentId'
ORDER BY created_at DESC
LIMIT 1;
"@

try {
    $Result = supabase db query --linked $Query
    $OutputFile = "$OutputDir/raw_extraction_response_${Timestamp}.txt"
    $Result | Out-File -Path $OutputFile -Encoding UTF8
    Write-Host $Result
    Add-Content -Path $LogFile -Value $Result
} catch {
    Log "ERROR: Failed to query raw extraction: $_"
}

# Step 6: Extract the raw_response JSON
Log ""
Log "Extracting raw LLM response JSON..."

$Query = "SELECT raw_response FROM raw_extractions WHERE project_id = '$ProjectId' AND document_id = '$DocumentId' ORDER BY created_at DESC LIMIT 1;"

try {
    $Result = supabase db query --linked $Query | ConvertFrom-Json
    if ($Result.raw_response) {
        $JsonFile = "$OutputDir/llm_response_${Timestamp}.json"
        $Result.raw_response | ConvertTo-Json | Out-File -Path $JsonFile -Encoding UTF8
        Log "LLM response saved to: $JsonFile"
        
        $Preview = $Result.raw_response | ConvertTo-Json | Select-Object -Index 0..9
        Log "Response preview (first 500 chars):"
        Log ($Preview -join "`n")
    } else {
        Log "WARNING: LLM response is empty"
    }
} catch {
    Log "Note: Query result format may vary, LLM response captured in raw_extraction_response file"
}

# Step 7: Query entities after test
Log ""
Log "Querying entities AFTER test..."

$Query = @"
SELECT 
  COUNT(*) as total_count,
  SUM(CASE WHEN layer='main' THEN 1 ELSE 0 END) as main_layer_count,
  SUM(CASE WHEN layer='branch' THEN 1 ELSE 0 END) as branch_layer_count
FROM knowledge_entities
WHERE project_id = '$ProjectId'
  AND user_id = '$UserId';
"@

try {
    $Result = supabase db query --linked $Query
    $OutputFile = "$OutputDir/entities_after_${Timestamp}.txt"
    $Result | Out-File -Path $OutputFile -Encoding UTF8
    Write-Host $Result
    Add-Content -Path $LogFile -Value $Result
} catch {
    Log "ERROR: Failed to query entities: $_"
}

# Step 8: Query Cabinet entities
Log ""
Log "Querying 'Cabinet' entities..."

$Query = @"
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
  AND project_id = '$ProjectId'
  AND user_id = '$UserId'
ORDER BY created_at;
"@

try {
    $Result = supabase db query --linked $Query
    $OutputFile = "$OutputDir/cabinet_entities_${Timestamp}.txt"
    $Result | Out-File -Path $OutputFile -Encoding UTF8
    Write-Host $Result
    Add-Content -Path $LogFile -Value $Result
} catch {
    Log "ERROR: Failed to query Cabinet entities: $_"
}

# Step 9: Query Leo entities
Log ""
Log "Querying 'Leo' entities..."

$Query = @"
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
  AND project_id = '$ProjectId'
  AND user_id = '$UserId'
ORDER BY created_at;
"@

try {
    $Result = supabase db query --linked $Query
    $OutputFile = "$OutputDir/leo_entities_${Timestamp}.txt"
    $Result | Out-File -Path $OutputFile -Encoding UTF8
    Write-Host $Result
    Add-Content -Path $LogFile -Value $Result
} catch {
    Log "ERROR: Failed to query Leo entities: $_"
}

# Step 10: Generate comparison report
Log ""
Log "Generating comparison report..."

$ReportFile = "$OutputDir/comparison_report_${Timestamp}.txt"
$ReportContent = @"
=================================================================
CONTROLLED EXTRACTION TEST REPORT
=================================================================
Timestamp: $Timestamp
Project ID: $ProjectId
User ID: $UserId
Document ID: $DocumentId

=================================================================
DIAGNOSTIC QUESTIONS
=================================================================

1. How many Cabinet rows are there?
   Expected: 2 (one magical, one practical)
   See cabinet_entities_${Timestamp}.txt for details

2. Do the Cabinets have different materials and purposes?
   Expected: Yes (wood+magical vs glass+practical)
   See cabinet_entities_${Timestamp}.txt for details

3. Is there only one Leo entity?
   Expected: 1 entity with aliases
   See leo_entities_${Timestamp}.txt for details

4. Are all abilities in Leo's attributes?
   Expected: 4 abilities present (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)
   See leo_entities_${Timestamp}.txt for details

5. Is layer consistency maintained?
   Expected: All layer='main' or layer='branch', no 'secondary'
   See cabinet_entities_${Timestamp}.txt and leo_entities_${Timestamp}.txt

=================================================================
FILES CREATED
=================================================================

- llm_response_${Timestamp}.json
  Raw LLM JSON output from Gemini

- cabinet_entities_${Timestamp}.txt
  Query results for all 'Cabinet' entities

- leo_entities_${Timestamp}.txt
  Query results for all 'Leo' entities

- entities_before_${Timestamp}.txt
  Entity count summary BEFORE extraction

- entities_after_${Timestamp}.txt
  Entity count summary AFTER extraction

- raw_extraction_response_${Timestamp}.txt
  Complete raw_extractions table row

- comparison_report_${Timestamp}.txt
  This report

=================================================================
NEXT STEPS
=================================================================

1. Review LLM JSON: $OutputDir/llm_response_${Timestamp}.json
2. Check Cabinet count (expected: 2)
3. Check Leo count (expected: 1)
4. Verify abilities are present
5. If issues found, proceed to Task #3 (trace analysis)

"@

$ReportContent | Out-File -Path $ReportFile -Encoding UTF8
Write-Host $ReportContent
Add-Content -Path $LogFile -Value $ReportContent

Log ""
Log "Controlled extraction test complete!"
Log "All output saved to: $OutputDir"
Log "Log file: $LogFile"

