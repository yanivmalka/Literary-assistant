#!/usr/bin/env node
/**
 * SIMULATION: Insert sample extraction data to test AbilitiesPanel
 * This creates sample entities and relationships without needing extraction
 */

import { createClient } from '@supabase/supabase-js';

// Simple UUID v4 generator (no dependency needed)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
  console.log(`🎬 SIMULATION: Inserting Sample Data for AbilitiesPanel Testing`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ Not authenticated. Please log in first.');
      return;
    }
    console.log(`✓ Authenticated as: ${user.email}\n`);

    // Create sample project
    const projectId = uuidv4();
    console.log(`📦 Creating sample project...`);
    const { error: projectError } = await supabase
      .from('projects')
      .insert({
        id: projectId,
        user_id: user.id,
        name: 'Test: Abilities',
        description: 'Test project for AbilitiesPanel',
        is_active: true,
      });

    if (projectError) {
      console.error(`❌ Error:`, projectError.message);
      return;
    }
    console.log(`   ✓ Project created: ${projectId}\n`);

    // Create sample character "אלינה"
    const characterId = uuidv4();
    console.log(`👤 Creating character "אלינה"...`);
    const { error: characterError } = await supabase
      .from('knowledge_entities')
      .insert({
        id: characterId,
        project_id: projectId,
        user_id: user.id,
        canonical_name: 'אלינה',
        entity_type: 'character',
        entity_types: ['character'],
        description: 'דמות לדוגמה עם יכולות',
        attributes: {},
        structured_fields: {},
        layer: 'main',
        source: 'ai',
      });

    if (characterError) {
      console.error(`❌ Error:`, characterError.message);
      return;
    }
    console.log(`   ✓ Character created: ${characterId}\n`);

    // Create sample abilities
    const abilities = [
      { name: 'לחימה בשתי חרבות', type: 'ability' },
      { name: 'ריפוי אנרגטי', type: 'magic_ability' },
      { name: 'כושר גבוה', type: 'ability' },
      { name: 'כישוף ריח', type: 'magic_ability' },
    ];

    const abilityIds = [];
    console.log(`✨ Creating abilities...`);
    
    for (const ability of abilities) {
      const abilityId = uuidv4();
      abilityIds.push(abilityId);

      const { error: abilityError } = await supabase
        .from('knowledge_entities')
        .insert({
          id: abilityId,
          project_id: projectId,
          user_id: user.id,
          canonical_name: ability.name,
          entity_type: ability.type,
          entity_types: [ability.type],
          description: `תיאור של: ${ability.name}`,
          attributes: {},
          structured_fields: {},
          layer: 'main',
          source: 'ai',
        });

      if (abilityError) {
        console.error(`   ❌ Error creating ability "${ability.name}":`, abilityError.message);
        continue;
      }

      console.log(`   ✓ "${ability.name}" (${ability.type})`);
    }
    console.log();

    // Create relationships: character → has_ability → abilities
    console.log(`🔗 Creating character→ability relationships...`);
    
    for (const abilityId of abilityIds) {
      const relationshipId = uuidv4();
      
      const { error: relError } = await supabase
        .from('knowledge_entity_relationships')
        .insert({
          id: relationshipId,
          project_id: projectId,
          source_entity_id: characterId,
          target_entity_id: abilityId,
          relationship_type: 'has_ability',
          evidence: null,
          chunk_position: null,
          branch_id: null,
          operation: null,
          review_status: null,
          base_exists: false,
        });

      if (relError) {
        console.error(`   ❌ Error:`, relError.message);
        continue;
      }
    }
    console.log(`   ✓ ${abilityIds.length} relationships created\n`);

    // Verify
    console.log(`${'═'.repeat(70)}`);
    console.log(`✅ SUCCESS! Sample data inserted.\n`);
    console.log(`📋 Next steps:`);
    console.log(`   1. Open http://localhost:5173`);
    console.log(`   2. Navigate to: Projects → "Test: Abilities"`);
    console.log(`   3. Go to Characters hub`);
    console.log(`   4. Click on character "אלינה"`);
    console.log(`   5. Click "Abilities" button`);
    console.log(`   6. Click "Life Skills" or "Magic Skills"`);
    console.log(`   7. You should see the abilities listed! 🎉\n`);
    console.log(`📊 Data inserted:`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Character ID: ${characterId}`);
    console.log(`   Abilities: ${abilityIds.length}`);
    console.log(`${'═'.repeat(70)}\n`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

main();
