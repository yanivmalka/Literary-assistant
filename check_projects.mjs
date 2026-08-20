import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('Checking for projects and entities...\n');

// Check extractions
console.log('Recent extractions...\n');

const { data: extractions, error: extError } = await supabase
  .from('raw_extractions')
  .select('id, project_id, model, chunks_count, created_at')
  .order('created_at', { ascending: false })
  .limit(10);

if (extError) {
  console.error('Error fetching extractions:', extError);
} else {
  console.log(`Found ${extractions?.length || 0} extractions:\n`);
  extractions?.forEach((e, i) => {
    console.log(`${i+1}. ID: ${e.id.substring(0, 8)}...`);
    console.log(`   Project: ${e.project_id}`);
    console.log(`   Model: ${e.model}`);
    console.log(`   Chunks: ${e.chunks_count}`);
    console.log(`   Created: ${e.created_at}\n`);
  });
}

// Check entities by project
console.log('\n\nEntity count by project:\n');

const { data: allEntities, error: entError } = await supabase
  .from('knowledge_entities')
  .select('project_id, entity_type, canonical_name')
  .order('project_id');

if (entError) {
  console.error('Error:', entError);
} else {
  const grouped = {};
  allEntities?.forEach(e => {
    if (!grouped[e.project_id]) {
      grouped[e.project_id] = {};
    }
    grouped[e.project_id][e.entity_type] = (grouped[e.project_id][e.entity_type] || 0) + 1;
  });

  Object.entries(grouped).forEach(([pid, types]) => {
    const total = Object.values(types).reduce((a, b) => a + b, 0);
    console.log(`Project: ${pid}`);
    console.log(`  Total entities: ${total}`);
    Object.entries(types).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });
    console.log();
  });
}
