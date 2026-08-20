# Schema Verification Report

## Issue Fixed
Migration 015 was trying to create indexes on `branch_id` column BEFORE it was added to `knowledge_entity_relationships`, causing silent failures.

## Solution Applied
1. Modified migration 015 to add `branch_id` column FIRST
2. Then add constraints and indexes on it
3. Cleaned up migration 099 to remove duplicate code

## Verification (Executed August 20, 2026)

### Table Structure - knowledge_entity_relationships
```
✅ id                uuid             (NOT NULL)
✅ project_id        uuid             (NOT NULL)
✅ document_id       uuid             
✅ version_id        uuid             
✅ source_entity_id  uuid             (NOT NULL)
✅ target_entity_id  uuid             (NOT NULL)
✅ relationship_type text             (NOT NULL)
✅ attributes        jsonb            
✅ evidence          text             
✅ chunk_position    integer          
✅ raw_extraction_id uuid             
✅ created_at        timestamp        
✅ branch_id         uuid             ✅ CONFIRMED PRESENT
✅ operation         text             (NOT NULL, DEFAULT 'add')
✅ review_status     text             (NOT NULL, DEFAULT 'approved')
✅ base_exists       boolean          (NOT NULL, DEFAULT true)
```

### RLS Policy
- Policy: "Users manage own entity_relationships"
- Condition: Checks if user owns the source entity

### Migration Status
- All 17 migrations (001-099) show as applied
- Remote and local versions are in sync

## Next Steps
1. User should clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh the page (Ctrl+Shift+R)
3. Navigate to entity profile page
4. If still broken, check browser console for any new errors

## Root Cause Timeline
- Migration 007: `knowledge_entity_relationships` created WITHOUT `branch_id`
- Migration 015: Assumes `branch_id` exists, tries to create indexes → FAILS silently
- Migration 099: Tries to ADD `branch_id`, but comes AFTER 015 fails
- Result: Column never created, causing 42703 error when app tries to query it

## Fix Applied
- Moved `branch_id` column creation to the START of migration 015
- Migration 099 now only handles cleanup and additional indexes
- Idempotent pattern: Uses IF EXISTS/IF NOT EXISTS throughout
