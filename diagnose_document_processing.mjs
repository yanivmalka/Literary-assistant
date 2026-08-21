#!/usr/bin/env node
/**
 * Diagnose document processing for the authenticated user.
 * Uses temporary environment variables; credentials are never stored here.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJscWZxZnpxY3JxbHV4YW5obnd1IiwiaWF0IjoxNzg2OTU4MDgxLCJleHAiOjIxMDI1MzQwODF9.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const supabase = createClient(
  SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const email = process.env.SUPABASE_DIAGNOSTIC_EMAIL;
  const password = process.env.SUPABASE_DIAGNOSTIC_PASSWORD;

  if (!email || !password) {
    console.error('❌ Missing SUPABASE_DIAGNOSTIC_EMAIL or SUPABASE_DIAGNOSTIC_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    console.error(`❌ Sign-in failed: ${authError?.message || 'no user returned'}`);
    process.exitCode = 1;
    return;
  }

  const { data: versions, error: versionsError } = await supabase
    .from('document_versions')
    .select('id, document_id, version_number, status, error_message, error_stage, structure_metadata, created_at, processing_completed_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (versionsError) {
    console.error(`❌ Could not read document_versions: ${versionsError.message}`);
    process.exitCode = 1;
    return;
  }

  const documentIds = [...new Set((versions || []).map((version) => version.document_id))];
  const { data: documents, error: documentsError } = await supabase
    .from('documents')
    .select('id, name')
    .in('id', documentIds);

  if (documentsError) {
    console.error(`❌ Could not read documents: ${documentsError.message}`);
    process.exitCode = 1;
    return;
  }

  const names = new Map((documents || []).map((document) => [document.id, document.name]));

  console.log('\n📄 DOCUMENT PROCESSING DIAGNOSTIC\n');
  for (const version of versions || []) {
    const { count: chunkCount, error: chunkError } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id);

    const { count: rawCount, error: rawError } = await supabase
      .from('raw_extractions')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id);

    console.log(`Document: ${names.get(version.document_id) || version.document_id}`);
    console.log(`  Version: ${version.version_number} (${version.id})`);
    console.log(`  Status: ${version.status}`);
    console.log(`  Chunks: ${chunkError ? `ERROR: ${chunkError.message}` : chunkCount}`);
    console.log(`  Raw extractions: ${rawError ? `ERROR: ${rawError.message}` : rawCount}`);
    console.log(`  Structure metadata: ${JSON.stringify(version.structure_metadata || {})}`);
    if (version.error_message) console.log(`  Error: ${version.error_message}`);
    console.log(`  Created: ${version.created_at}`);
    console.log('');
  }

  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(`❌ Diagnostic failed: ${error.message}`);
  process.exitCode = 1;
});
