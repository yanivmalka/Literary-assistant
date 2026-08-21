#!/usr/bin/env node
/**
 * DIAGNOSTIC: Extraction Analysis Tool
 * 
 * Purpose: Deep-dive into raw Gemini responses to understand:
 * A) Is Gemini returning empty arrays?
 * B) Are responses being lost in parsing/storage?
 * C) Is the response format wrong?
 */

import { createClient } from '@supabase/supabase-js';

// Supabase credentials - Production
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

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

  console.log('\n🔍 Top-Level Keys:');
  const topLevelKeys = Object.keys(response);
  console.log(`   ${topLevelKeys.join(', ')}`);

  // Check characters
  console.log('\n📋 CHARACTERS Array:');
  const hasCharacters = Array.isArray(response.characters);
  if (hasCharacters) {
    console.log(`   ✓ Found: ${response.characters.length} items`);
    if (response.characters.length > 0) {
      console.log(`   First: ${response.characters[0].name || 'unnamed'}`);
    }
  } else {
    console.log(`   ❌ NOT an array (type: ${typeof response.characters})`);
  }

  // Check abilities
  console.log('\n⚡ ABILITIES Array:');
  const hasAbilities = Array.isArray(response.abilities);
  if (hasAbilities) {
    console.log(`   ✓ Found: ${response.abilities.length} items`);
    if (response.abilities.length > 0) {
      response.abilities.slice(0, 3).forEach(a => {
        console.log(`     - ${a.name || JSON.stringify(a)}`);
      });
    } else {
      console.log(`   ⚠️  ARRAY IS EMPTY`);
    }
  } else {
    console.log(`   ❌ NOT an array (type: ${typeof response.abilities})`);
  }

  // Check magic abilities
  console.log('\n✨ MAGIC_ABILITIES Array:');
  const hasMagicAbilities = Array.isArray(response.magic_abilities);
  if (hasMagicAbilities) {
    console.log(`   ✓ Found: ${response.magic_abilities.length} items`);
    if (response.magic_abilities.length > 0) {
      response.magic_abilities.slice(0, 3).forEach(a => {
        console.log(`     - ${a.name || JSON.stringify(a)}`);
      });
    } else {
      console.log(`   ⚠️  ARRAY IS EMPTY`);
    }
  } else {
    console.log(`   ❌ NOT an array (type: ${typeof response.magic_abilities})`);
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
  console.log(`${'═'.repeat(80)}\n`);

  // Hypothesis A: Empty arrays
  const emptyArrays = analyses.filter(a => 
    (a.hasAbilities && a.abilitiesCount === 0) ||
    (a.hasMagicAbilities && a.magicAbilitiesCount === 0)
  );

  if (emptyArrays.length > 0) {
    console.log(`❌ A) GEMINI RETURNING EMPTY ARRAYS: YES (${emptyArrays.length}/${analyses.length})`);
    console.log(`   → Gemini IS receiving the prompt but NOT extracting abilities\n`);
  } else {
    console.log(`✓ A) GEMINI RETURNING EMPTY ARRAYS: NO\n`);
  }

  // Hypothesis B: Parse errors
  const parseErrors = analyses.filter(a => a.error && a.error.includes('parse'));
  if (parseErrors.length > 0) {
    console.log(`❌ B) RESPONSE NOT PARSED CORRECTLY: YES (${parseErrors.length})\n`);
  } else {
    console.log(`✓ B) RESPONSE NOT PARSED CORRECTLY: NO\n`);
  }

  // Hypothesis C: Wrong format
  const wrongFormat = analyses.filter(a => 
    !a.hasCharacters || !a.hasAbilities || !a.hasMagicAbilities
  );
  if (wrongFormat.length > 0) {
    console.log(`❌ C) WRONG RESPONSE FORMAT: YES (${wrongFormat.length})\n`);
  } else {
    console.log(`✓ C) WRONG RESPONSE FORMAT: NO\n`);
  }

  // Statistics
  console.log(`📈 STATISTICS:\n`);
  const totalChars = analyses.reduce((sum, a) => sum + a.characterCount, 0);
  const totalAbilities = analyses.reduce((sum, a) => sum + a.abilitiesCount, 0);
  const totalMagicAbilities = analyses.reduce((sum, a) => sum + a.magicAbilitiesCount, 0);
  
  console.log(`   Total extractions: ${extractions.length}`);
  console.log(`   Total characters: ${totalChars}`);
  console.log(`   Total abilities: ${totalAbilities}`);
  console.log(`   Total magic_abilities: ${totalMagicAbilities}\n`);

  // Recommendations
  console.log(`💡 RECOMMENDATIONS:\n`);
  if (emptyArrays.length > 0) {
    console.log(`1. Gemini is NOT extracting abilities`);
    console.log(`   → Check: supabase/functions/extract-knowledge/index.ts`);
    console.log(`   → Look for: buildPrompt() or buildExtractionPrompt()`);
    console.log(`   → Verify: Is the "abilities" section in the prompt?\n`);
  }
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
    const email = process.env.SUPABASE_DIAGNOSTIC_EMAIL;
    const password = process.env.SUPABASE_DIAGNOSTIC_PASSWORD;

    if (!email || !password) {
      console.error('❌ Missing authentication variables.');
      console.error('Set SUPABASE_DIAGNOSTIC_EMAIL and SUPABASE_DIAGNOSTIC_PASSWORD in this PowerShell session, then run the script again.');
      process.exitCode = 1;
      return;
    }

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !authData.user) {
      console.error(`❌ Supabase sign-in failed: ${signInError?.message || 'no user returned'}`);
      process.exitCode = 1;
      return;
    }

    console.log(`✓ Authenticated as ${authData.user.email}`);
    console.log(`\n📥 Fetching last 3 extractions...\n`);
    
    const { data: extractions, error } = await supabase
      .from('raw_extractions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) {
      console.error(`❌ Failed to fetch extractions: ${error.message}`);
      process.exit(1);
    }

    if (!extractions || extractions.length === 0) {
      console.log('⚠️  No extractions found in database');
      console.log('\n📝 To create data:');
      console.log('   1. Open http://localhost:5173');
      console.log('   2. Create a project');
      console.log('   3. Upload a document');
      console.log('   4. Click "Extract Entities"');
      console.log('   5. Run this script again');
      process.exit(1);
    }

    console.log(`✓ Found ${extractions.length} extraction(s)\n`);

    // Show metadata
    console.log(`📋 EXTRACTION METADATA:\n`);
    extractions.forEach((ext, idx) => {
      console.log(`${idx + 1}. Created: ${ext.created_at}`);
      console.log(`   Model: ${ext.model}`);
      console.log(`   Chunks: ${ext.chunks_count}`);
      console.log(`   Tokens: ${ext.total_tokens}\n`);
    });

    // Analyze each
    const analyses = extractions.map((ext, idx) => {
      return analyzeRawResponse(ext.raw_response, idx);
    });

    // Generate summary
    generateDiagnosticSummary(extractions, analyses);

    console.log(`✅ Diagnostic complete!\n`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
