#!/usr/bin/env node
/**
 * Run Controlled Extraction Verification Queries
 * Queries the database directly to verify test results
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk1ODA4MSwiZXhwIjoyMTAyNTM0MDgxfQ.6DFaUVH5cKqgS_-K7L0-X9P9-nU8vI-q-J2q-K3l-M4N';
// Use the actual project ID where extraction was completed (from session summary)
const PROJECT_ID = '39c5af73-9baa-460c-b823-eeeee0a27978';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║        CONTROLLED EXTRACTION TEST - VERIFICATION QUERIES           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log(`Project ID: ${PROJECT_ID}`);
console.log(`Supabase: ${SUPABASE_URL}`);

// ============================================================================
// SCENARIO 1: CHARACTER FIELDS (Failure #1)
// ============================================================================
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
    });
    const hasAllFields = ['height', 'hair_color', 'eye_color'].every(f => 
      values?.some(v => v.field_path === f)
    );
    console.log(`\n${hasAllFields ? '✅ PASS' : '❌ FAIL'}: All required fields present`);
  }
}

// ============================================================================
// SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3)
// ============================================================================
console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║          SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3)         ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

// Query 2.1: Ability entities
const { data: abilities, error: abError } = await supabase
  .from('knowledge_entities')
  .select('id, canonical_name, entity_type, layer, branch_id, created_at')
  .eq('project_id', PROJECT_ID)
  .eq('entity_type', 'ability')
  .order('canonical_name');

console.log('\n📋 Query 2.1: Ability entities');
console.log(`Expected: 4 abilities (Sword mastery, Hand-to-hand combat, Cold resistance, Physical strength)`);
if (abError) {
  console.log(`❌ FAILED: ${abError.message}`);
} else {
  console.log(`\nResult (${abilities?.length || 0} rows):`);
  abilities?.forEach(ab => {
    console.log(`  ${ab.canonical_name} (ID: ${ab.id})`);
  });
  console.log(`\n${abilities?.length === 4 ? '✅ PASS' : '❌ FAIL'}: Expected 4, got ${abilities?.length || 0}`);
}

// Query 2.2: Character-Ability relationships
const { data: relationships, error: relError } = await supabase
  .from('knowledge_entity_relationships')
  .select('id, relationship_type, source_entity_id, target_entity_id, branch_id, review_status, created_at')
  .eq('project_id', PROJECT_ID)
  .eq('relationship_type', 'has_ability');

console.log('\n📋 Query 2.2: Character-Ability relationships (Fix #2)');
console.log(`Expected: 4 has_ability relationships`);
if (relError) {
  console.log(`❌ FAILED: ${relError.message}`);
} else {
  console.log(`\nResult (${relationships?.length || 0} rows):`);
  relationships?.forEach(rel => {
    console.log(`  Relationship ID: ${rel.id}`);
    console.log(`  Type: ${rel.relationship_type}`);
    console.log(`  Source: ${rel.source_entity_id}`);
    console.log(`  Target: ${rel.target_entity_id}`);
  });
  console.log(`\n${relationships?.length === 4 ? '✅ PASS' : '❌ FAIL'}: Expected 4, got ${relationships?.length || 0}`);
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
console.log(`Expected: 2 Cabinet rows (wooden and glass, different materials)`);
if (cabError) {
  console.log(`❌ FAILED: ${cabError.message}`);
} else {
  console.log(`\nResult (${cabinets?.length || 0} rows):`);
  cabinets?.forEach(cab => {
    console.log(`  ID: ${cab.id}`);
    console.log(`  Materials: ${JSON.stringify(cab.structured_fields?.materials)}`);
    console.log(`  Appearance: ${JSON.stringify(cab.structured_fields?.appearance)}`);
  });
  console.log(`\n${cabinets?.length === 2 ? '✅ PASS' : '❌ FAIL'}: Expected 2, got ${cabinets?.length || 0}`);
}

// ============================================================================
// SCENARIO 3: CABINET IDENTITY (Failure #4 - CORE FIX)
// ============================================================================
console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║    SCENARIO 3: CABINET IDENTITY (Failure #4 - CORE FIX)           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

// Query 3.1: Cabinet count
const { data: cabinetCount, error: cabCountError } = await supabase
  .from('knowledge_entities')
  .select('COUNT(*)');

console.log('\n📋 Query 3.1: Cabinet count');
console.log(`Expected: 2 (not 1, not 3+)`);
if (cabCountError) {
  console.log(`❌ FAILED: ${cabCountError.message}`);
} else {
  // Get cabinets with count
  const { data: cabinetsDetail, error: cabDetError } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, structured_fields->>materials as materials, created_at')
    .eq('project_id', PROJECT_ID)
    .eq('entity_type', 'object')
    .eq('canonical_name', 'Cabinet')
    .order('created_at');

  console.log(`\nResult (${cabinetsDetail?.length || 0} rows):`);
  cabinetsDetail?.forEach(cab => {
    console.log(`  ID: ${cab.id}`);
    console.log(`  Materials: ${cab.materials}`);
    console.log(`  Created: ${cab.created_at}`);
  });
  
  if (cabinetsDetail && cabinetsDetail.length === 2) {
    const materials = cabinetsDetail.map(c => c.materials);
    const differentMaterials = materials[0] !== materials[1];
    console.log(`\n${differentMaterials ? '✅ PASS' : '❌ FAIL'}: 2 Cabinets with ${differentMaterials ? 'different' : 'same'} materials`);
  } else {
    console.log(`\n❌ FAIL: Expected 2, got ${cabinetsDetail?.length || 0}`);
  }
}

// ============================================================================
// SCENARIO 4: MAIN/BRANCH ISOLATION
// ============================================================================
console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║      SCENARIO 4: MAIN/BRANCH ISOLATION                             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

// Query 4.1: Layer distribution
const { data: layerDist, error: layerError } = await supabase
  .from('knowledge_entities')
  .select('layer, COUNT(*)');

console.log('\n📋 Query 4.1: Layer distribution');
console.log(`Expected: All layer='main' with branch_id=NULL (first extraction)`);
if (layerError) {
  console.log(`❌ FAILED: ${layerError.message}`);
} else {
  const dist = {};
  layerDist?.forEach(row => {
    dist[row.layer] = row.count;
  });
  console.log(`\nResult:`, dist);

  // Check branch_id distribution
  const { data: branchDist, error: brError } = await supabase
    .from('knowledge_entities')
    .select('branch_id, COUNT(*)');

  if (!brError) {
    const brMap = {};
    branchDist?.forEach(row => {
      brMap[row.branch_id || 'NULL'] = row.count;
    });
    console.log(`Branch ID distribution:`, brMap);
  }

  const allMain = dist['main'] === undefined ? 0 : dist['main'];
  console.log(`\n${allMain > 0 ? '✅ PASS' : '❌ FAIL'}: ${allMain} entities on main layer`);
}

// Query 4.2: Branch overlays
const { data: overlays, error: overlayError } = await supabase
  .from('knowledge_branch_entities')
  .select('COUNT(*)');

console.log('\n📋 Query 4.2: Branch overlays');
console.log(`Expected: 0 overlays (first extraction)`);
if (overlayError) {
  console.log(`❌ FAILED: ${overlayError.message}`);
} else {
  console.log(`Result: ${overlays?.[0]?.count || 0} overlays`);
  console.log(`\n${overlays?.[0]?.count === 0 ? '✅ PASS' : '❌ FAIL'}: Expected 0, got ${overlays?.[0]?.count || 0}`);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║                          SUMMARY                                   ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

const summary = {
  project_id: PROJECT_ID,
  timestamp: new Date().toISOString(),
  total_entities: 0,
  by_type: {}
};

const { data: allEntities, error: entError } = await supabase
  .from('knowledge_entities')
  .select('entity_type');

if (!entError) {
  summary.total_entities = allEntities?.length || 0;
  allEntities?.forEach(e => {
    summary.by_type[e.entity_type] = (summary.by_type[e.entity_type] || 0) + 1;
  });
}

console.log('\nEntity Summary:');
console.log(`  Total: ${summary.total_entities}`);
Object.entries(summary.by_type).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

console.log('\n✅ Verification complete');
