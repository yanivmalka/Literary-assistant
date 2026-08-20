#!/usr/bin/env node
/**
 * Check what's actually in the production database
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
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔍 CHECKING DATABASE FOR ENTITIES & RELATIONSHIPS`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // 1. Check characters
    console.log(`📋 Step 1: Checking Characters`);
    const { data: characters, error: charError } = await supabase
      .from('knowledge_entities')
      .select('id, canonical_name, entity_type, attributes')
      .eq('entity_type', 'character')
      .limit(5);

    if (charError) {
      console.error(`❌ Error:`, charError.message);
      return;
    }

    console.log(`   Found: ${characters?.length || 0} characters\n`);
    characters?.forEach((char, i) => {
      console.log(`   ${i + 1}. "${char.canonical_name}"`);
      if (char.attributes?.abilities?.length > 0) {
        console.log(`      Abilities (embedded): ${char.attributes.abilities.join(', ')}`);
      }
      if (char.attributes?.magic_abilities?.length > 0) {
        console.log(`      Magic (embedded): ${char.attributes.magic_abilities.join(', ')}`);
      }
    });

    // 2. Check abilities as separate entities
    console.log(`\n✨ Step 2: Checking Ability Entities`);
    const { data: abilities, error: abilError } = await supabase
      .from('knowledge_entities')
      .select('id, canonical_name, entity_type')
      .in('entity_type', ['ability', 'magic_ability'])
      .limit(10);

    if (abilError) {
      console.error(`❌ Error:`, abilError.message);
      return;
    }

    console.log(`   Found: ${abilities?.length || 0} ability entities\n`);
    abilities?.slice(0, 5).forEach((ability, i) => {
      console.log(`   ${i + 1}. "${ability.canonical_name}" (${ability.entity_type})`);
    });

    // 3. Check character→ability relationships
    if (characters && characters.length > 0) {
      const firstCharId = characters[0].id;
      console.log(`\n🔗 Step 3: Checking Relationships for Character "${characters[0].canonical_name}"`);
      
      const { data: rels, error: relError } = await supabase
        .from('knowledge_entity_relationships')
        .select('id, relationship_type, target_entity_id, source_entity_id')
        .eq('source_entity_id', firstCharId);

      if (relError) {
        console.error(`❌ Error:`, relError.message);
        return;
      }

      console.log(`   Found: ${rels?.length || 0} relationships\n`);
      
      // Check specifically for has_ability relationships
      const abilityRels = rels?.filter(r => r.relationship_type === 'has_ability') || [];
      console.log(`   has_ability links: ${abilityRels.length}\n`);
      
      if (abilityRels.length > 0) {
        for (const rel of abilityRels.slice(0, 3)) {
          // Get the ability name
          const { data: ability } = await supabase
            .from('knowledge_entities')
            .select('canonical_name')
            .eq('id', rel.target_entity_id)
            .single();
          console.log(`   → has_ability: "${ability?.canonical_name}"`);
        }
      } else {
        console.log(`   ⚠️  NO CHARACTER→ABILITY RELATIONSHIPS FOUND!`);
      }
    }

    // 4. Summary
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 SUMMARY:`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`   Characters: ${characters?.length || 0}`);
    console.log(`   Ability entities: ${abilities?.length || 0}`);
    console.log(`   Character→ability links: ?`);
    console.log(`\n💡 IF ability entities exist but links don't:`);
    console.log(`   → Problem is in the extraction pipeline (Step 5 of extract-knowledge/index.ts)`);
    console.log(`   → Specifically: findBatchEntityId() failing to match abilities to characters\n`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

main();
