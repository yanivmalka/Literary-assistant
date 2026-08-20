#!/usr/bin/env node
/**
 * Get document ID from test project and invoke extraction
 * Then capture output for analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const PROJECT_ID = '6c4b7b92-214a-4785-ad66-e62527ee68d6';
const USER_ID = '14fa4daa-9d28-4f6d-9b6a-d59912107078';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getDocumentId() {
  console.log('🔍 Retrieving document for test project...\n');
  
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, name, created_at')
    .eq('project_id', PROJECT_ID)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  if (!documents || documents.length === 0) {
    throw new Error('No documents found in test project');
  }

  const doc = documents[0];
  console.log(`✓ Found document:`);
  console.log(`  ID: ${doc.id}`);
  console.log(`  Name: ${doc.name}`);
  console.log(`  Created: ${doc.created_at}\n`);

  return doc.id;
}

async function getDocumentVersion(documentId) {
  console.log('📄 Retrieving document version...\n');
  
  const { data: versions, error } = await supabase
    .from('document_versions')
    .select('id, version_number, status')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch version: ${error.message}`);
  }

  if (!versions || versions.length === 0) {
    throw new Error('No versions found for document');
  }

  const version = versions[0];
  console.log(`✓ Using version:`);
  console.log(`  ID: ${version.id}`);
  console.log(`  Version: ${version.version_number}`);
  console.log(`  Status: ${version.status}\n`);

  return version.id;
}

async function getChunkCount(versionId) {
  console.log('📦 Checking chunks...\n');
  
  const { count, error } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('version_id', versionId);

  if (error) {
    throw new Error(`Failed to count chunks: ${error.message}`);
  }

  console.log(`✓ Found ${count} chunks\n`);
  return count;
}

async function invokeExtraction(documentId, versionId) {
  console.log('📤 Invoking extract-knowledge...\n');

  const { data, error } = await supabase.functions.invoke('extract-knowledge', {
    body: {
      version_id: versionId,
      document_id: documentId,
      project_id: PROJECT_ID,
      user_id: USER_ID,
      use_main: true,
      target_branch_id: null,
      offset: 0,
      limit: 100,
    },
  });

  if (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }

  console.log(`✓ Extraction completed`);
  console.log(`  Success: ${data.success}`);
  console.log(`  Done: ${data.done}`);
  if (data.summary) {
    console.log(`  Entities saved: ${data.summary.entities_saved}`);
    console.log(`  Layer: ${data.summary.layer}`);
    console.log(`  Raw extraction ID: ${data.summary.raw_extraction_id}\n`);
  }

  return data;
}

async function getRawExtraction(documentId) {
  console.log('📥 Retrieving raw LLM response...\n');

  const { data, error } = await supabase
    .from('raw_extractions')
    .select('id, raw_response, model, chunks_count')
    .eq('project_id', PROJECT_ID)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Failed to get raw extraction: ${error.message}`);
  }

  return data;
}

async function queryEntities(layer) {
  console.log(`🔎 Querying ${layer} entities...\n`);

  const { data, error, count } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, layer, branch_id', { count: 'exact' })
    .eq('project_id', PROJECT_ID)
    .eq('user_id', USER_ID)
    .eq('layer', layer);

  if (error) {
    throw new Error(`Failed to query ${layer} entities: ${error.message}`);
  }

  console.log(`✓ Found ${count} ${layer} entities\n`);
  return data || [];
}

async function saveOutputs(extraction, rawExtraction, mainEntities) {
  const outputDir = path.join(__dirname, 'EXTRACTION_TEST_OUTPUT');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Save extraction result
  fs.writeFileSync(
    path.join(outputDir, `extraction_result_${timestamp}.json`),
    JSON.stringify(extraction, null, 2)
  );
  console.log(`✓ Saved extraction result`);

  // Save raw LLM response
  if (rawExtraction?.raw_response) {
    fs.writeFileSync(
      path.join(outputDir, `llm_response_${timestamp}.json`),
      JSON.stringify(rawExtraction.raw_response, null, 2)
    );
    console.log(`✓ Saved LLM response`);
  }

  // Save entities
  fs.writeFileSync(
    path.join(outputDir, `main_entities_${timestamp}.json`),
    JSON.stringify(mainEntities, null, 2)
  );
  console.log(`✓ Saved Main entities`);

  // Save summary
  const summary = {
    timestamp,
    project_id: PROJECT_ID,
    extraction_summary: extraction.summary,
    llm_model: rawExtraction?.model,
    entities_count: mainEntities.length,
  };
  fs.writeFileSync(
    path.join(outputDir, `summary_${timestamp}.json`),
    JSON.stringify(summary, null, 2)
  );
  console.log(`✓ Saved summary\n`);

  return outputDir;
}

async function main() {
  try {
    console.log('🚀 CONTROLLED EXTRACTION TEST\n');
    console.log('Project: 6c4b7b92-214a-4785-ad66-e62527ee68d6\n');

    // Step 1: Get document
    const documentId = await getDocumentId();

    // Step 2: Get version
    const versionId = await getDocumentVersion(documentId);

    // Step 3: Check chunks
    const chunkCount = await getChunkCount(versionId);

    // Step 4: Invoke extraction
    const extraction = await invokeExtraction(documentId, versionId);

    // Step 5: Get raw response
    const rawExtraction = await getRawExtraction(documentId);

    console.log('📊 LLM Response Summary:');
    console.log(`  Model: ${rawExtraction?.model}`);
    console.log(`  Chunks processed: ${rawExtraction?.chunks_count}`);
    if (rawExtraction?.raw_response) {
      const resp = rawExtraction.raw_response;
      console.log(`  Characters: ${resp.characters?.length || 0}`);
      console.log(`  Objects: ${resp.objects?.length || 0}`);
      console.log(`  Relationships: ${resp.relationships?.length || 0}`);
      console.log(`  Events: ${resp.events?.length || 0}\n`);
    }

    // Step 6: Query Main entities
    const mainEntities = await queryEntities('main');

    // Step 7: Save outputs
    const outputDir = await saveOutputs(extraction, rawExtraction, mainEntities);

    console.log('════════════════════════════════════════');
    console.log('✅ Extraction Complete');
    console.log('════════════════════════════════════════');
    console.log(`Output saved to: ${outputDir}`);
    console.log(`\nDocument ID: ${documentId}`);
    console.log(`Version ID: ${versionId}`);
    console.log(`Chunks: ${chunkCount}`);
    console.log(`Main entities created: ${mainEntities.length}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
