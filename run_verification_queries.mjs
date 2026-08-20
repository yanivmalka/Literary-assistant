#!/usr/bin/env node
/**
 * Run Controlled Extraction Verification Queries
 * Queries the database directly to verify test results
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
// Use anon key for read-only queries
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';
// Use the actual project ID where extraction was completed
const PROJECT_ID = process.env.TEST_PROJECT_ID || '39c5af73-9baa-460c-b823-eeeee0a27978';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

async function runQuery(name, query) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`QUERY: ${name}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    const { data, error } = await supabase.rpc('query_directly', {
      sql_query: query
    }).catch(() => {
      // Fallback: try using postgres directly
      return supabase.from('knowledge_entities').select('*').limit(1);
    });

    if (error) {
      console.error(`ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }

    console.log('RESULT:');
    console.log(JSON.stringify(data, null, 2));
    return { success: true, data };
  } catch (err) {
    console.error(`EXCEPTION: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function verifyCharacterFields() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           SCENARIO 1: CHARACTER FIELDS (Failure #1)                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Query 1.1: Character entity with fields
  const { data: leoEntity, error: leoError } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, aliases, structured_fields, layer, branch_id, created_at')
    .eq('project_id', PROJECT_ID)
    .ilike('canonical_name', 'Leo%')
    .eq('entity_type', 'character');

  console.log('\n📋 Query 1.1: Character entity with fields');
  console.log(`Expected: 1 Leo Frostborne entity with height, hair_color, eye_color`);
  if (leoError) {
    console.log(`❌ FAILED: ${leoError.message}`);
  } else {
    console.log(`\nResult (${leoEntity?.length || 0} rows):`);
    leoEntity?.forEach(entity => {
      console.log(`  ID: ${entity.id}`);
      console.log(`  Name: ${entity.canonical_name}`);
      console.log(`  Type: ${entity.entity_type}`);
      console.log(`  Aliases: ${JSON.stringify(entity.aliases)}`);
      console.log(`  Structured Fields: ${JSON.stringify(entity.structured_fields, null, 2)}`);
      console.log(`  Layer: ${entity.layer}, Branch ID: ${entity.branch_id}`);
    });
    console.log(`\n${leoEntity?.length === 1 ? '✅ PASS' : '❌ FAIL'}: Expected 1, got ${leoEntity?.length || 0}`);
  }

  // Query 1.2: Character entity values
  if (leoEntity && leoEntity.length > 0) {
    const { data: values, error: valError } = await supabase
      .from('knowledge_entity_values')
      .select('field_path, value_json, source_type, value_status')
      .eq('entity_id', leoEntity[0].id)
      .order('field_path');

    console.log('\n📋 Query 1.2: Character entity values');
    console.log(`Expected: Rows for height, hair_color, eye_color with source_type='ai'`);
    if (valError) {
      console.log(`❌ FAILED: ${valError.message}`);
    } else {
      console.log(`\nResult (${values?.length || 0} rows):`);
      values?.forEach(val => {
        console.log(`  Field: ${val.field_path}`);
        console.log(`    Value: ${JSON.stringify(val.value_json)}`);
        console.log(`    Source: ${val.source_type}`);
        console.log(`    Status: ${val.value_status}`);
      });
      const hasRequired = values?.some(v => v.field_path === 'height') &&
                         values?.some(v => v.field_path === 'hair_color') &&
                         values?.some(v => v.field_path === 'eye_color');
      console.log(`\n${hasRequired ? '✅ PASS' : '❌ FAIL'}: Missing required fields`);
    }
  }
}

async function verifyAbilitiesAndObjects() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3)         ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Query 2.1: Ability entities
  const { data: abilities, error: abError } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, layer, branch_id')
    .eq('project_id', PROJECT_ID)
    .eq('entity_type', 'ability')
    .order('canonical_name');

  console.log('\n📋 Query 2.1: Ability entities');
  console.log(`Expected: 4 abilities (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)`);
  if (abError) {
    console.log(`❌ FAILED: ${abError.message}`);
  } else {
    console.log(`\nResult (${abilities?.length || 0} rows):`);
    abilities?.forEach((ab, idx) => {
      console.log(`  ${idx + 1}. ${ab.canonical_name}`);
    });
    console.log(`\n${abilities?.length === 4 ? '✅ PASS' : '❌ FAIL'}: Expected 4, got ${abilities?.length || 0}`);
  }

  // Query 2.2: Character-ability relationships
  const { data: leoEntity } = await supabase
    .from('knowledge_entities')
    .select('id')
    .eq('project_id', PROJECT_ID)
    .ilike('canonical_name', 'Leo%')
    .eq('entity_type', 'character')
    .single();

  if (leoEntity) {
    const { data: relationships, error: relError } = await supabase
      .from('knowledge_entity_relationships')
      .select('id, relationship_type, source_entity_id, target_entity_id')
      .eq('project_id', PROJECT_ID)
      .eq('relationship_type', 'has_ability')
      .eq('source_entity_id', leoEntity.id);

    console.log('\n📋 Query 2.2: Character-ability relationships');
    console.log(`Expected: 4 relationships linking Leo to abilities`);
    if (relError) {
      console.log(`❌ FAILED: ${relError.message}`);
    } else {
      console.log(`\nResult (${relationships?.length || 0} rows):`);
      relationships?.forEach((rel, idx) => {
        console.log(`  ${idx + 1}. Relationship ID: ${rel.id}`);
      });
      console.log(`\n${relationships?.length === 4 ? '✅ PASS' : '❌ FAIL'}: Expected 4, got ${relationships?.length || 0}`);
    }
  }

  // Query 2.3: Cabinet objects
  const { data: cabinets, error: cabError } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, structured_fields, layer, branch_id, created_at')
    .eq('project_id', PROJECT_ID)
    .eq('entity_type', 'object')
    .eq('canonical_name', 'Cabinet')
    .order('created_at');

  console.log('\n📋 Query 2.3: Cabinet objects');
  console.log(`Expected: 2 Cabinet rows (wooden and glass)`);
  if (cabError) {
    console.log(`❌ FAILED: ${cabError.message}`);
  } else {
    console.log(`\nResult (${cabinets?.length || 0} rows):`);
    cabinets?.forEach((cab, idx) => {
      console.log(`  ${idx + 1}. Cabinet`);
      console.log(`     ID: ${cab.id}`);
      console.log(`     Fields: ${JSON.stringify(cab.structured_fields, null, 2)}`);
    });
    console.log(`\n${cabinets?.length === 2 ? '✅ PASS' : '❌ FAIL'}: Expected 2, got ${cabinets?.length || 0}`);
  }
}

async function verifyCabinetIdentity() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║    SCENARIO 3: CABINET IDENTITY (Failure #4 - CORE FIX)           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Query 3.1: Cabinet count
  const { data: countData, error: countError } = await supabase
    .from('knowledge_entities')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .eq('entity_type', 'object')
    .eq('canonical_name', 'Cabinet');

  console.log('\n📋 Query 3.1: Cabinet count');
  console.log(`Expected: 2 (not 1, not 3+)`);
  if (countError) {
    console.log(`❌ FAILED: ${countError.message}`);
  } else {
    const count = countData?.length || 0;
    let status = '❌ FAIL';
    if (count === 2) status = '✅ PASS';
    else if (count === 1) status = '❌ FAIL (merged, not split)';
    else if (count > 2) status = '❌ FAIL (over-fragmented)';
    console.log(`Result: ${count} rows`);
    console.log(`${status}`);
  }

  // Query 3.2: Cabinet identities and mentions
  const { data: cabinetDetails, error: detailError } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, structured_fields, created_at')
    .eq('project_id', PROJECT_ID)
    .eq('entity_type', 'object')
    .eq('canonical_name', 'Cabinet')
    .order('created_at');

  console.log('\n📋 Query 3.2: Cabinet identities');
  console.log(`Expected: Cabinet A (wood), Cabinet B (glass) with different UUIDs`);
  if (detailError) {
    console.log(`❌ FAILED: ${detailError.message}`);
  } else {
    console.log(`\nResult (${cabinetDetails?.length || 0} rows):`);
    cabinetDetails?.forEach((cab, idx) => {
      console.log(`  Cabinet ${String.fromCharCode(65 + idx)}:`);
      console.log(`    ID: ${cab.id}`);
      console.log(`    Materials: ${JSON.stringify(cab.structured_fields?.materials)}`);
      console.log(`    Created: ${cab.created_at}`);
    });

    // Check mentions
    if (cabinetDetails && cabinetDetails.length >= 2) {
      const cab1Mentions = await supabase
        .from('knowledge_entity_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', cabinetDetails[0].id);

      const cab2Mentions = await supabase
        .from('knowledge_entity_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', cabinetDetails[1].id);

      console.log(`\n  Mention counts:`);
      console.log(`    Cabinet A: ${cab1Mentions.data?.length || 0} mentions`);
      console.log(`    Cabinet B: ${cab2Mentions.data?.length || 0} mentions`);
      console.log(`\n${cabinetDetails[0].id !== cabinetDetails[1].id ? '✅ PASS' : '❌ FAIL'}: UUIDs are different`);
    }
  }
}

async function verifyMainBranchIsolation() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║      SCENARIO 4: MAIN/BRANCH ISOLATION                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Query 4.1: Layer distribution
  const { data: layerDist, error: layerError } = await supabase
    .from('knowledge_entities')
    .select('layer, entity_type')
    .eq('project_id', PROJECT_ID);

  console.log('\n📋 Query 4.1: Layer distribution');
  console.log(`Expected (first extraction): All layer='main', all branch_id=NULL`);
  if (layerError) {
    console.log(`❌ FAILED: ${layerError.message}`);
  } else {
    const layerGroups = {};
    layerDist?.forEach(e => {
      layerGroups[e.layer] = (layerGroups[e.layer] || 0) + 1;
    });
    console.log(`\nResult:`);
    Object.entries(layerGroups).forEach(([layer, count]) => {
      console.log(`  layer='${layer}': ${count} entities`);
    });
    console.log(`\n${Object.keys(layerGroups).length === 1 && Object.keys(layerGroups)[0] === 'main' ? '✅ PASS' : '❌ FAIL'}: Should only have main layer`);
  }

  // Query 4.2: Branch overlays
  const { data: overlays, error: overlayError } = await supabase
    .from('knowledge_branch_entities')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .not('source_entity_id', 'is', null);

  console.log('\n📋 Query 4.2: Branch overlays');
  console.log(`Expected (first extraction): 0 overlays`);
  if (overlayError) {
    console.log(`❌ FAILED: ${overlayError.message}`);
  } else {
    const overlayCount = overlays?.length || 0;
    console.log(`Result: ${overlayCount} overlays`);
    console.log(`\n${overlayCount === 0 ? '✅ PASS' : '❌ FAIL'}: Expected 0, got ${overlayCount}`);
  }

  // Query 4.3: Overall entity count
  const { data: allEntities, error: allError } = await supabase
    .from('knowledge_entities')
    .select('entity_type')
    .eq('project_id', PROJECT_ID);

  console.log('\n📋 Query 4.3: Overall entity count');
  console.log(`Expected: character=1, ability=4, object=2 (total=7)`);
  if (allError) {
    console.log(`❌ FAILED: ${allError.message}`);
  } else {
    const entityTypes = {};
    allEntities?.forEach(e => {
      entityTypes[e.entity_type] = (entityTypes[e.entity_type] || 0) + 1;
    });
    console.log(`\nResult:`);
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    const total = Object.values(entityTypes).reduce((a, b) => a + b, 0);
    console.log(`  TOTAL: ${total}`);
    
    const pass = entityTypes.character === 1 && entityTypes.ability === 4 && entityTypes.object === 2 && total === 7;
    console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}: Verify counts match expected`);
  }
}

async function generateSummary() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                          SUMMARY                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const { data: entities, error } = await supabase
    .from('knowledge_entities')
    .select('entity_type')
    .eq('project_id', PROJECT_ID);

  if (!error && entities) {
    const summary = {
      project_id: PROJECT_ID,
      timestamp: new Date().toISOString(),
      total_entities: entities.length,
      by_type: {},
    };

    entities.forEach(e => {
      summary.by_type[e.entity_type] = (summary.by_type[e.entity_type] || 0) + 1;
    });

    console.log(JSON.stringify(summary, null, 2));
    console.log('\n✅ Verification complete');
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        CONTROLLED EXTRACTION TEST - VERIFICATION QUERIES           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\nProject ID: ${PROJECT_ID}`);
  console.log(`Supabase: ${SUPABASE_URL}\n`);

  try {
    await verifyCharacterFields();
    await verifyAbilitiesAndObjects();
    await verifyCabinetIdentity();
    await verifyMainBranchIsolation();
    await generateSummary();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
