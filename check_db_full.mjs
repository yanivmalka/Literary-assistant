#!/usr/bin/env node
/**
 * Check all main tables
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

async function checkTable(tableName) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.log(`  ❌ ${tableName}: ${error.message}`);
    return 0;
  }
  
  console.log(`  ✓ ${tableName}: ${count} rows`);
  return count;
}

async function main() {
  console.log(`\n📊 DATABASE INVENTORY\n`);

  const tables = [
    'projects',
    'documents',
    'document_versions',
    'knowledge_entities',
    'knowledge_entity_relationships',
    'raw_extractions',
  ];

  for (const table of tables) {
    await checkTable(table);
  }

  console.log(`\n`);
}

main();
