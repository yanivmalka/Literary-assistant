-- Run this in Supabase SQL Editor to verify the schema was created correctly

-- Check knowledge_entity_relationships columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'knowledge_entity_relationships' 
ORDER BY ordinal_position;

-- Check constraints on knowledge_entity_relationships
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'knowledge_entity_relationships' 
ORDER BY constraint_name;

-- Check indexes on knowledge_entity_relationships
SELECT indexname FROM pg_indexes 
WHERE tablename = 'knowledge_entity_relationships' 
ORDER BY indexname;

-- Sample query to verify branch_id works
SELECT id, project_id, source_entity_id, target_entity_id, relationship_type, branch_id, operation, review_status, base_exists 
FROM knowledge_entity_relationships 
LIMIT 5;
