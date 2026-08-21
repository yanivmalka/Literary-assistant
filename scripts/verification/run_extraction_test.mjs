#!/usr/bin/env node
/**
 * Controlled Extraction Test Runner
 * Requires Node 14+ ES module support
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const projectRoot = path.resolve(__dirname, '../..');
const testDocumentPath = path.join(projectRoot, 'tests', 'fixtures', 'CONTROLLED_TEST_DOCUMENT.md');
const resultsDirectory = path.join(projectRoot, 'tests', 'results', 'EXTRACTION_TEST_OUTPUT');

async function readTestDocument() {
  const docPath = testDocumentPath;
  if (!fs.existsSync(docPath)) {
    throw new Error(`Test document not found: ${docPath}`);
  }
  return fs.readFileSync(docPath, 'utf-8');
}

async function getOrCreateUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(`Failed to get current user: ${error.message}`);
  }
  if (!user) {
    throw new Error('No authenticated user. Please sign in first.');
  }
  return user;
}

async function createTestProject(user) {
  const projectName = `Controlled Test - ${new Date().toISOString().slice(0, 19)}`;
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: projectName,
      user_id: user.id,
      description: 'Controlled extraction test for entity consolidation',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }
  console.log(`✓ Created test project: ${data.id}`);
  return data;
}

async function uploadDocument(project, user, content) {
  const docName = 'Controlled Test Document';
  const { data, error } = await supabase
    .from('documents')
    .insert({
      project_id: project.id,
      user_id: user.id,
      name: docName,
      file_type: 'markdown',
      content: content,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upload document: ${error.message}`);
  }
  console.log(`✓ Uploaded document: ${data.id}`);
  return data;
}

async function createDocumentVersion(document, user) {
  const { data, error } = await supabase
    .from('document_versions')
    .insert({
      document_id: document.id,
      user_id: user.id,
      version_number: 1,
      status: 'completed',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create document version: ${error.message}`);
  }
  console.log(`✓ Created document version: ${data.id}`);
  return data;
}

async function chunkDocument(version, user, content) {
  // Simple chunking: split by "###" (markdown h3)
  const chunks = content
    .split('### ')
    .filter(c => c.trim())
    .map((chunk, idx) => ({
      version_id: version.id,
      user_id: user.id,
      position: idx,
      content: `### ${chunk}`.substring(0, 8000), // Limit chunk size
    }));

  if (chunks.length === 0) {
    throw new Error('No chunks generated from document');
  }

  const { data, error } = await supabase
    .from('document_chunks')
    .insert(chunks)
    .select();

  if (error) {
    throw new Error(`Failed to create chunks: ${error.message}`);
  }
  console.log(`✓ Created ${chunks.length} chunks`);
  return data;
}

async function queryEntitiesBefore(project, user) {
  const { data, error, count } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, layer', { count: 'exact' })
    .eq('project_id', project.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Warning: Failed to query entities before:', error.message);
    return { entities: [], count: 0 };
  }
  return { entities: data || [], count: count || 0 };
}

async function invokeExtraction(project, document, version, user) {
  console.log('\n📤 Invoking extract-knowledge Edge Function...');
  
  const extractionRunId = randomUUID();
  const { data, error } = await supabase.functions.invoke('extract-knowledge', {
    body: {
      version_id: version.id,
      document_id: document.id,
      project_id: project.id,
      user_id: user.id,
      extraction_mode: 'bootstrap',
      extraction_run_id: extractionRunId,
      target_branch_id: null,
      offset: 0,
      limit: 100,
    },
  });

  if (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }

  console.log(`✓ Extraction completed`);
  console.log(`  - Entities saved: ${data.summary?.entities_saved || 0}`);
  console.log(`  - Layer: ${data.summary?.layer || 'unknown'}`);
  console.log(`  - Raw extraction ID: ${data.summary?.raw_extraction_id}`);
  
  return data;
}

async function queryRawExtraction(project, document) {
  const { data, error } = await supabase
    .from('raw_extractions')
    .select('id, raw_response, model, chunks_count, created_at')
    .eq('project_id', project.id)
    .eq('document_id', document.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Warning: Failed to query raw extraction:', error.message);
    return null;
  }
  return data;
}

async function queryEntitiesAfter(project, user) {
  const { data, error, count } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, layer, entity_types, description, attributes, structured_fields', { count: 'exact' })
    .eq('project_id', project.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Warning: Failed to query entities after:', error.message);
    return { entities: [], count: 0 };
  }
  return { entities: data || [], count: count || 0 };
}

async function saveResults(project, extraction, rawExtraction, entitiesBefore, entitiesAfter) {
  const outputDir = resultsDirectory;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Save extraction result
  fs.writeFileSync(
    path.join(outputDir, `extraction_result_${timestamp}.json`),
    JSON.stringify(extraction, null, 2)
  );

  // Save raw LLM response
  if (rawExtraction?.raw_response) {
    fs.writeFileSync(
      path.join(outputDir, `llm_response_${timestamp}.json`),
      JSON.stringify(rawExtraction.raw_response, null, 2)
    );
  }

  // Save entities before/after
  fs.writeFileSync(
    path.join(outputDir, `entities_before_${timestamp}.json`),
    JSON.stringify(entitiesBefore, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, `entities_after_${timestamp}.json`),
    JSON.stringify(entitiesAfter, null, 2)
  );

  // Save summary
  const summary = {
    timestamp,
    project_id: project.id,
    extraction_summary: extraction.summary,
    entities_before: entitiesBefore.count,
    entities_after: entitiesAfter.count,
    test_document_path: path.relative(projectRoot, testDocumentPath),
  };
  fs.writeFileSync(
    path.join(outputDir, `summary_${timestamp}.json`),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n✓ Results saved to ${outputDir}/`);
  return outputDir;
}

async function main() {
  try {
    console.log('🚀 Controlled Extraction Test\n');

    // Step 1: Authenticate
    console.log('1️⃣  Authenticating...');
    const user = await getOrCreateUser();
    console.log(`✓ Authenticated as: ${user.email}`);

    // Step 2: Read test document
    console.log('\n2️⃣  Reading test document...');
    const docContent = await readTestDocument();
    console.log(`✓ Read ${docContent.length} bytes`);

    // Step 3: Create project
    console.log('\n3️⃣  Creating test project...');
    const project = await createTestProject(user);

    // Step 4: Query entities before
    console.log('\n4️⃣  Querying entities before extraction...');
    const entitiesBefore = await queryEntitiesBefore(project, user);
    console.log(`✓ Found ${entitiesBefore.count} existing entities`);

    // Step 5: Upload document
    console.log('\n5️⃣  Uploading document...');
    const document = await uploadDocument(project, user, docContent);

    // Step 6: Create version
    console.log('\n6️⃣  Creating document version...');
    const version = await createDocumentVersion(document, user);

    // Step 7: Chunk document
    console.log('\n7️⃣  Chunking document...');
    const chunks = await chunkDocument(version, user, docContent);

    // Step 8: Invoke extraction
    console.log('\n8️⃣  Invoking extraction...');
    const extraction = await invokeExtraction(project, document, version, user);

    // Step 9: Query raw extraction
    console.log('\n9️⃣  Querying raw extraction...');
    const rawExtraction = await queryRawExtraction(project, document);
    if (rawExtraction) {
      console.log(`✓ Raw extraction: ${rawExtraction.model}, ${rawExtraction.chunks_count} chunks`);
    }

    // Step 10: Query entities after
    console.log('\n🔟 Querying entities after extraction...');
    const entitiesAfter = await queryEntitiesAfter(project, user);
    console.log(`✓ Found ${entitiesAfter.count} entities after extraction`);

    // Step 11: Save results
    console.log('\n💾 Saving results...');
    const outputDir = await saveResults(project, extraction, rawExtraction, entitiesBefore, entitiesAfter);

    // Print summary
    console.log('\n📊 SUMMARY');
    console.log(`════════════════════════════════════════`);
    console.log(`Project ID: ${project.id}`);
    console.log(`Document ID: ${document.id}`);
    console.log(`Version ID: ${version.id}`);
    console.log(`Chunks: ${chunks.length}`);
    console.log(`Entities before: ${entitiesBefore.count}`);
    console.log(`Entities after: ${entitiesAfter.count}`);
    console.log(`Entities created: ${entitiesAfter.count - entitiesBefore.count}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`════════════════════════════════════════\n`);

    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
