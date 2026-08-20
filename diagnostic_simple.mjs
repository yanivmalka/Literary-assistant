#!/usr/bin/env node
/**
 * DIAGNOSTIC: Simple Extraction Analysis (Production DB)
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

async function main() {
  console.log(`\n📊 EXTRACTION DIAGNOSTIC\n`);

  try {
    // Get last 5 extractions
    const { data: extractions, error } = await supabase
      .from('raw_extractions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }

    if (!extractions || extractions.length === 0) {
      console.log('⚠️  No extractions found');
      process.exit(0);
    }

    console.log(`✓ Found ${extractions.length} extraction(s)\n`);

    extractions.forEach((ext, idx) => {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`EXTRACTION #${idx + 1}`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`Created: ${new Date(ext.created_at).toLocaleString()}`);
      console.log(`Model: ${ext.model}`);
      console.log(`Chunks: ${ext.chunks_count}`);
      
      try {
        let response = ext.raw_response;
        if (typeof response === 'string') {
          response = JSON.parse(response);
        }

        const chars = Array.isArray(response.characters) ? response.characters.length : 0;
        const abilities = Array.isArray(response.abilities) ? response.abilities.length : 0;
        const magic = Array.isArray(response.magic_abilities) ? response.magic_abilities.length : 0;

        console.log(`\n📊 Results:`);
        console.log(`  Characters: ${chars}`);
        console.log(`  Abilities: ${abilities}`);
        console.log(`  Magic Abilities: ${magic}`);

        if (chars > 0) {
          console.log(`\n📋 Sample character: ${response.characters[0].name}`);
          if (response.characters[0].abilities) {
            console.log(`   Abilities: ${response.characters[0].abilities.join(', ')}`);
          }
          if (response.characters[0].magic_abilities) {
            console.log(`   Magic: ${response.characters[0].magic_abilities.join(', ')}`);
          }
        }

      } catch (e) {
        console.log(`❌ Parse error: ${e.message}`);
      }
    });

    console.log(`\n`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
