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

  const email = process.env.SUPABASE_DIAGNOSTIC_EMAIL;
  const password = process.env.SUPABASE_DIAGNOSTIC_PASSWORD;

  if (!email || !password) {
    console.error('❌ Missing authentication variables.');
    console.error('Set SUPABASE_DIAGNOSTIC_EMAIL and SUPABASE_DIAGNOSTIC_PASSWORD in this PowerShell session, then run the script again.');
    process.exitCode = 1;
    return;
  }

  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !data.user) {
    console.error(`❌ Supabase sign-in failed: ${signInError?.message || 'no user returned'}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Authenticated as ${data.user.email}`);

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

  await supabase.auth.signOut();
  console.log(`\n`);
}

main().catch((error) => {
  console.error(`❌ Diagnostic failed: ${error.message}`);
  process.exitCode = 1;
});
