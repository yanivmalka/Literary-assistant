#!/usr/bin/env node
/**
 * Find existing project and document accessible for testing
 * Does not modify anything, only reads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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

async function main() {
  try {
    console.log('🔍 Finding accessible test project...\n');

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('ℹ️  No authenticated user. Querying all projects with documents and chunks...\n');

      // Query projects with documents that have chunks
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          user_id,
          documents (
            id,
            name,
            document_chunks (
              id
            )
          )
        `)
        .limit(10);

      if (projError) {
        console.error('Error querying projects:', projError.message);
        process.exit(1);
      }

      if (!projects || projects.length === 0) {
        console.log('No projects found');
        process.exit(1);
      }

      // Find first project with a document that has chunks
      for (const project of projects) {
        if (!project.documents || project.documents.length === 0) continue;

        for (const doc of project.documents) {
          if (!doc.document_chunks || doc.document_chunks.length === 0) continue;

          console.log('✓ Found project with chunked document:\n');
          console.log(`  PROJECT_ID: ${project.id}`);
          console.log(`  Project name: ${project.name}`);
          console.log(`  DOCUMENT_ID: ${doc.id}`);
          console.log(`  Document name: ${doc.name}`);
          console.log(`  Chunks: ${doc.document_chunks.length}`);
          console.log(`  User ID: ${project.user_id}\n`);

          // Query entity count for this project
          const { count } = await supabase
            .from('knowledge_entities')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('layer', 'main');

          console.log(`  Existing Main entities: ${count || 0}`);
          console.log('\n════════════════════════════════════════');
          console.log('Ready to use for controlled extraction.');
          console.log('════════════════════════════════════════\n');

          return;
        }
      }

      console.log('ℹ️  No projects found with chunked documents');
      process.exit(0);
    } else {
      console.log(`Authenticated as: ${user.email}\n`);

      // Query user's projects
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          documents (
            id,
            name,
            document_chunks (
              id
            )
          )
        `)
        .eq('user_id', user.id)
        .limit(10);

      if (projError) {
        console.error('Error querying projects:', projError.message);
        process.exit(1);
      }

      if (!projects || projects.length === 0) {
        console.log('No projects found for this user');
        process.exit(1);
      }

      // Find first project with a document that has chunks
      for (const project of projects) {
        if (!project.documents || project.documents.length === 0) continue;

        for (const doc of project.documents) {
          if (!doc.document_chunks || doc.document_chunks.length === 0) continue;

          console.log('✓ Found project with chunked document:\n');
          console.log(`  PROJECT_ID: ${project.id}`);
          console.log(`  Project name: ${project.name}`);
          console.log(`  DOCUMENT_ID: ${doc.id}`);
          console.log(`  Document name: ${doc.name}`);
          console.log(`  Chunks: ${doc.document_chunks.length}`);
          console.log(`  User ID: ${user.id}\n`);

          // Query entity count for this project
          const { count } = await supabase
            .from('knowledge_entities')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('layer', 'main');

          console.log(`  Existing Main entities: ${count || 0}`);
          console.log('\n════════════════════════════════════════');
          console.log('Ready to use for controlled extraction.');
          console.log('════════════════════════════════════════\n');

          return;
        }
      }

      console.log('ℹ️  No projects found with chunked documents for this user');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
