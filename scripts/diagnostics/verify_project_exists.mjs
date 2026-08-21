#!/usr/bin/env node
/**
 * Verify that test project exists in Supabase
 * Does not require authentication - uses service role key via environment
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';

// Try to use SUPABASE_SERVICE_ROLE_KEY from environment
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set in environment');
  console.error('This script requires the service role key to query the database');
  console.error('');
  console.error('Without it, we cannot verify if the project exists.');
  console.error('');
  console.error('Alternative: Use the app UI to verify:');
  console.error('1. Open the app');
  console.error('2. Look for any project in your projects list');
  console.error('3. In browser DevTools → Application → Storage → check if project ID matches');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function verifyProject() {
  const TEST_PROJECT_ID = '6c4b7b92-214a-4785-ad66-e62527ee68d6';

  console.log('🔍 VERIFYING TEST PROJECT\n');
  console.log(`Project ID: ${TEST_PROJECT_ID}`);
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);

  try {
    // Query the projects table
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, name, user_id, created_at, description')
      .eq('id', TEST_PROJECT_ID)
      .single();

    if (error) {
      console.error(`❌ Query failed: ${error.message}`);
      process.exit(1);
    }

    if (!project) {
      console.error(`❌ PROJECT NOT FOUND\n`);
      console.error(`The project ID ${TEST_PROJECT_ID} does not exist in the database.\n`);
      
      console.log('Checking for existing projects...\n');
      const { data: allProjects, error: listError } = await supabase
        .from('projects')
        .select('id, name, user_id, created_at')
        .limit(10);

      if (listError) {
        console.error(`Could not list projects: ${listError.message}`);
        process.exit(1);
      }

      if (allProjects && allProjects.length > 0) {
        console.log('📋 Existing projects:\n');
        allProjects.forEach((p, idx) => {
          console.log(`${idx + 1}. ${p.name || '(unnamed)'}`);
          console.log(`   ID: ${p.id}`);
          console.log(`   Owner: ${p.user_id}`);
          console.log('');
        });
      } else {
        console.log('No projects found in database.');
      }

      process.exit(1);
    }

    // Project exists - show details
    console.log('✅ PROJECT FOUND!\n');
    console.log('PROJECT DETAILS:');
    console.log(`  Name: ${project.name || '(unnamed)'}`);
    console.log(`  ID: ${project.id}`);
    console.log(`  Owner ID: ${project.user_id}`);
    console.log(`  Created: ${new Date(project.created_at).toISOString()}`);
    if (project.description) {
      console.log(`  Description: ${project.description}`);
    }
    console.log('');

    // Check for documents
    console.log('📄 CHECKING FOR DOCUMENTS...\n');
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('id, name, file_type, created_at')
      .eq('project_id', TEST_PROJECT_ID)
      .limit(10);

    if (docError) {
      console.error(`Could not query documents: ${docError.message}`);
      process.exit(1);
    }

    if (documents && documents.length > 0) {
      console.log(`✅ Found ${documents.length} document(s):\n`);
      documents.forEach((doc, idx) => {
        console.log(`${idx + 1}. ${doc.name}`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Type: ${doc.file_type}`);
        console.log(`   Created: ${new Date(doc.created_at).toISOString()}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No documents found in this project\n');
    }

    // Summary
    console.log('📋 VERIFICATION SUMMARY:\n');
    console.log(`✅ Project exists: YES`);
    console.log(`✅ Project name: ${project.name || '(unnamed)'}`);
    console.log(`✅ Owner: ${project.user_id}`);
    console.log(`✅ Documents: ${documents ? documents.length : 0}`);
    console.log('');
    console.log('✅ SAFE TO USE FOR CONTROLLED EXTRACTION TEST\n');

  } catch (err) {
    console.error(`❌ Unexpected error: ${err.message}`);
    process.exit(1);
  }
}

verifyProject();
