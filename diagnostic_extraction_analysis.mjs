#!/usr/bin/env node
/**
 * DIAGNOSTIC: Extraction Analysis Tool
 * 
 * Purpose: Deep-dive into raw Gemini responses to understand:
 * A) Is Gemini returning empty arrays?
 * B) Are responses being lost in parsing/storage?
 * C) Is the response format wrong?
 * 
 * Queries raw_extractions table to show:
 * - Last 3 extraction attempts with timestamps
 * - Raw JSON responses and what arrays they contain
 * - Comparison of Gemini response vs what was promised in the prompt
 * - Error patterns and empty array detection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

// Supabase credentials - using anon key for read-only access
const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

// ============================================
// ANALYSIS FUNCTIONS
// ============================================

/**
 * Check what projects and documents exist
 */
async function checkExistingData() {
  console.log(`\n📋 Checking existing projects and documents...`);
  
  // Get projects
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (projError) {
    console.error(`  ⚠️  Failed to fetch projects: ${projError.message}`);
  } else if (projects && projects.length > 0) {
    console.log(`  Found ${projects.length} recent project(s):`);
    projects.forEach(p => {
      console.log(`    - ${p.name} (${p.id})`);
    });
  } else {
    console.log(`  ⚠️  No projects found`);
  }

  // Get documents
  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select('id, name, project_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (docError) {
    console.error(`  ⚠️  Failed to fetch documents: ${docError.message}`);
  } else if (documents && documents.length > 0) {
    console.log(`  Found ${documents.length} recent document(s):`);
    documents.forEach(d => {
      console.log(`    - ${d.name} (project: ${d.project_id})`);
    });
  } else {
    console.log(`  ⚠️  No documents found`);
  }
}

/**
 * Fetch the last N extractions
 */
async function getLastExtractions(limit = 3) {
  console.log(`\n📥 Fetching last ${limit} extractions from raw_extractions table...`);
  
  const { data, error } = await supabase
    .from('raw_extractions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`❌ Failed to fetch extractions: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No extractions found in raw_extractions table');
    return [];
  }

  console.log(`✓ Found ${data.length} extraction(s)`);
  return data;
}

/**
 * Analyze a single raw response
 */
function analyzeRawResponse(rawResponse, index) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📊 EXTRACTION #${index + 1} ANALYSIS`);
  console.log(`${'═'.repeat(80)}`);

  if (!rawResponse) {
    console.log('⚠️  raw_response is NULL');
    return {
      hasCharacters: false,
      hasAbilities: false,
      hasMagicAbilities: false,
      error: 'NULL response'
    };
  }

  // Parse if it's a string
  let response = rawResponse;
  if (typeof rawResponse === 'string') {
    try {
      response = JSON.parse(rawResponse);
    } catch (e) {
      console.log('❌ Failed to parse raw_response as JSON');
      console.log(`   Error: ${e.message}`);
      return {
        hasCharacters: false,
        hasAbilities: false,
        hasMagicAbilities: false,
        error: `JSON parse failed: ${e.message}`
      };
    }
  }

  // Check top-level structure
  console.log('\n🔍 Top-Level Structure:');
  const topLevelKeys = Object.keys(response);
  console.log(`   Keys: ${topLevelKeys.join(', ')}`);

  // Check for characters
  console.log('\n📋 CHARACTERS Array:');
  const hasCharacters = Array.isArray(response.characters);
  if (hasCharacters) {
    console.log(`   ✓ Found characters array: ${response.characters.length} items`);
    if (response.characters.length > 0) {
      const firstChar = response.characters[0];
      console.log(`   First character keys: ${Object.keys(firstChar).join(', ')}`);
      console.log(`   First character (partial):`);
      console.log(`     - name: ${firstChar.name || 'NOT FOUND'}`);
      console.log(`     - abilities: ${Array.isArray(firstChar.abilities) ? `array(${firstChar.abilities.length})` : 'NOT AN ARRAY'}`);
      console.log(`     - magic_abilities: ${Array.isArray(firstChar.magic_abilities) ? `array(${firstChar.magic_abilities.length})` : 'NOT AN ARRAY'}`);
    } else {
      console.log(`   ⚠️  characters array is EMPTY`);
    }
  } else {
    console.log(`   ❌ characters is NOT an array (type: ${typeof response.characters})`);
  }

  // Check for abilities (top-level)
  console.log('\n⚡ ABILITIES Array (top-level):');
  const hasAbilities = Array.isArray(response.abilities);
  if (hasAbilities) {
    console.log(`   ✓ Found abilities array: ${response.abilities.length} items`);
    if (response.abilities.length > 0) {
      console.log(`   Sample abilities: ${response.abilities.slice(0, 3).map(a => a.name || a).join(', ')}`);
    } else {
      console.log(`   ⚠️  abilities array is EMPTY`);
    }
  } else {
    console.log(`   ❌ abilities is NOT an array (type: ${typeof response.abilities})`);
  }

  // Check for magic_abilities (top-level)
  console.log('\n✨ MAGIC_ABILITIES Array (top-level):');
  const hasMagicAbilities = Array.isArray(response.magic_abilities);
  if (hasMagicAbilities) {
    console.log(`   ✓ Found magic_abilities array: ${response.magic_abilities.length} items`);
    if (response.magic_abilities.length > 0) {
      console.log(`   Sample magic abilities: ${response.magic_abilities.slice(0, 3).map(a => a.name || a).join(', ')}`);
    } else {
      console.log(`   ⚠️  magic_abilities array is EMPTY`);
    }
  } else {
    console.log(`   ❌ magic_abilities is NOT an array (type: ${typeof response.magic_abilities})`);
  }

  // Detailed character analysis
  if (hasCharacters && response.characters.length > 0) {
    console.log('\n📝 CHARACTER DETAILS (First Character):');
    const char = response.characters[0];
    console.log(`   Name: ${char.name}`);
    
    if (Array.isArray(char.abilities)) {
      console.log(`   Abilities (${char.abilities.length}):`);
      char.abilities.slice(0, 3).forEach(ab => {
        console.log(`     - ${typeof ab === 'string' ? ab : ab.name || JSON.stringify(ab)}`);
      });
      if (char.abilities.length > 3) {
        console.log(`     ... and ${char.abilities.length - 3} more`);
      }
    } else {
      console.log(`   Abilities: NOT AN ARRAY (${typeof char.abilities})`);
    }
    
    if (Array.isArray(char.magic_abilities)) {
      console.log(`   Magic Abilities (${char.magic_abilities.length}):`);
      char.magic_abilities.slice(0, 3).forEach(ma => {
        console.log(`     - ${typeof ma === 'string' ? ma : ma.name || JSON.stringify(ma)}`);
      });
      if (char.magic_abilities.length > 3) {
        console.log(`     ... and ${char.magic_abilities.length - 3} more`);
      }
    } else {
      console.log(`   Magic Abilities: NOT AN ARRAY (${typeof char.magic_abilities})`);
    }
  }

  return {
    hasCharacters,
    hasAbilities,
    hasMagicAbilities,
    characterCount: hasCharacters ? response.characters.length : 0,
    abilitiesCount: hasAbilities ? response.abilities.length : 0,
    magicAbilitiesCount: hasMagicAbilities ? response.magic_abilities.length : 0,
    topLevelKeys,
    error: null
  };
}

/**
 * Generate diagnostic summary
 */
function generateDiagnosticSummary(extractions, analyses) {
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log(`📊 DIAGNOSTIC SUMMARY`);
  console.log(`${'═'.repeat(80)}`);

  console.log('\n🔍 HYPOTHESIS TESTING:\n');

  // Hypothesis A: Gemini returns empty arrays
  const emptyArrays = analyses.filter(a => 
    a.hasCharacters && a.characterCount === 0 ||
    a.hasAbilities && a.abilitiesCount === 0 ||
    a.hasMagicAbilities && a.magicAbilitiesCount === 0
  );

  if (emptyArrays.length > 0) {
    console.log(`❌ A) GEMINI RETURNING EMPTY ARRAYS: YES (${emptyArrays.length}/${analyses.length})`);
    console.log(`   → Gemini IS receiving the prompt but choosing not to extract`);
  } else {
    console.log(`✓ A) GEMINI RETURNING EMPTY ARRAYS: NO`);
    console.log(`   → All arrays have content`);
  }

  // Hypothesis B: Response not parsed correctly
  const parseErrors = analyses.filter(a => a.error && a.error.includes('parse'));
  const missingFields = analyses.filter(a => 
    a.topLevelKeys && (
      !a.hasCharacters || 
      !a.hasAbilities || 
      !a.hasMagicAbilities
    )
  );

  if (parseErrors.length > 0 || missingFields.length > 0) {
    console.log(`\n❌ B) RESPONSE NOT PARSED CORRECTLY: YES`);
    if (parseErrors.length > 0) {
      console.log(`   - JSON parse failures: ${parseErrors.length}`);
    }
    if (missingFields.length > 0) {
      console.log(`   - Missing expected fields: ${missingFields.length}`);
    }
  } else {
    console.log(`\n✓ B) RESPONSE NOT PARSED CORRECTLY: NO`);
    console.log(`   → All responses parsed successfully with expected fields`);
  }

  // Hypothesis C: Wrong response format
  const wrongFormat = analyses.filter(a => a.error);
  if (wrongFormat.length > 0) {
    console.log(`\n❌ C) WRONG RESPONSE FORMAT: YES (${wrongFormat.length}/${analyses.length})`);
    wrongFormat.forEach((a, i) => {
      const ext = extractions[analyses.indexOf(a)];
      console.log(`   - Extraction ${i + 1}: ${a.error}`);
    });
  } else {
    console.log(`\n✓ C) WRONG RESPONSE FORMAT: NO`);
    console.log(`   → All responses have expected format`);
  }

  // Statistics
  console.log(`\n📈 STATISTICS:\n`);
  console.log(`   Total extractions analyzed: ${extractions.length}`);
  console.log(`   With characters array: ${analyses.filter(a => a.hasCharacters).length}`);
  console.log(`   With abilities array: ${analyses.filter(a => a.hasAbilities).length}`);
  console.log(`   With magic_abilities array: ${analyses.filter(a => a.hasMagicAbilities).length}`);
  
  const totalChars = analyses.reduce((sum, a) => sum + a.characterCount, 0);
  const totalAbilities = analyses.reduce((sum, a) => sum + a.abilitiesCount, 0);
  const totalMagicAbilities = analyses.reduce((sum, a) => sum + a.magicAbilitiesCount, 0);
  
  console.log(`\n   Total characters extracted: ${totalChars}`);
  console.log(`   Total abilities extracted: ${totalAbilities}`);
  console.log(`   Total magic abilities extracted: ${totalMagicAbilities}`);

  // Recommendations
  console.log(`\n💡 RECOMMENDATIONS:\n`);
  
  if (emptyArrays.length > 0) {
    console.log(`1. CHECK GEMINI PROMPT`);
    console.log(`   → Add explicit instructions for abilities extraction`);
    console.log(`   → Verify prompt includes examples of ability objects`);
    console.log(`   → Check if prompt is actually being sent`);
  }
  
  if (parseErrors.length > 0) {
    console.log(`2. CHECK JSON PARSING LOGIC`);
    console.log(`   → Verify response is valid JSON`);
    console.log(`   → Check for string encoding issues`);
    console.log(`   → Validate response schema matches expectations`);
  }
  
  if (missingFields.length > 0) {
    console.log(`3. CHECK RESPONSE SCHEMA`);
    console.log(`   → Verify Gemini is returning required fields`);
    console.log(`   → Check for field name mismatches`);
    console.log(`   → Validate nested object structure`);
  }
}

/**
 * Save detailed report to file
 */
function saveDetailedReport(extractions, analyses) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(__dirname, `diagnostic_extraction_report_${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      extractionsAnalyzed: extractions.length,
      hasCharactersCount: analyses.filter(a => a.hasCharacters).length,
      hasAbilitiesCount: analyses.filter(a => a.hasAbilities).length,
      hasMagicAbilitiesCount: analyses.filter(a => a.hasMagicAbilities).length,
      totalCharacters: analyses.reduce((sum, a) => sum + a.characterCount, 0),
      totalAbilities: analyses.reduce((sum, a) => sum + a.abilitiesCount, 0),
      totalMagicAbilities: analyses.reduce((sum, a) => sum + a.magicAbilitiesCount, 0),
    },
    extractions: extractions.map((ext, idx) => ({
      id: ext.id,
      model: ext.model,
      created_at: ext.created_at,
      chunks_count: ext.chunks_count,
      analysis: analyses[idx],
      raw_response: ext.raw_response,
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);
}

/**
 * Main execution
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    EXTRACTION DIAGNOSTIC TOOL                              ║
║          Analyzing raw Gemini responses for ability extraction              ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);

  try {
    // Step 0: Check existing data
    await checkExistingData();

    // Step 1: Fetch extractions
    const extractions = await getLastExtractions(3);
    
    if (extractions.length === 0) {
      console.log('\n⚠️  No extractions found. Cannot proceed with analysis.');
      console.log('    You can:');
      console.log('    1. Run: node run_extraction_test.mjs');
      console.log('    2. Or use the app to upload a document and extract entities');
      console.log('    3. Then run this script again');
      process.exit(1);
    }

    // Step 2: Show metadata for each extraction
    console.log(`\n📋 EXTRACTION METADATA:\n`);
    extractions.forEach((ext, idx) => {
      console.log(`${idx + 1}. Created: ${ext.created_at}`);
      console.log(`   ID: ${ext.id}`);
      console.log(`   Model: ${ext.model}`);
      console.log(`   Chunks: ${ext.chunks_count}`);
      console.log(`   Tokens: ${ext.total_tokens || 'N/A'}`);
    });

    // Step 3: Analyze each raw response
    const analyses = extractions.map((ext, idx) => {
      console.log(`\n⏳ Analyzing extraction ${idx + 1}...`);
      return analyzeRawResponse(ext.raw_response, idx);
    });

    // Step 4: Generate diagnostic summary
    generateDiagnosticSummary(extractions, analyses);

    // Step 5: Save detailed report
    saveDetailedReport(extractions, analyses);

    console.log(`\n✅ Diagnostic complete!\n`);

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the diagnostic
main();
