#!/usr/bin/env python3
"""
Controlled Extraction Test - Verification Script
Queries the Supabase database to verify test results
"""

import os
import sys
from pathlib import Path
from typing import Optional, Dict, List, Any

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ supabase-py not installed")
    print("Install with: pip install supabase")
    sys.exit(1)

# Configuration
SUPABASE_URL = "https://lqfqfzqcrqluxanhnjwu.supabase.co"
PROJECT_ID = "6c4b7b92-214a-4785-ad66-e62527ee68d6"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = PROJECT_ROOT / "tests" / "results" / "VERIFICATION_REPORT.json"

def init_client() -> Optional[Client]:
    """Initialize Supabase client"""
    # Try environment variable first
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not service_role_key:
        print("❌ SUPABASE_SERVICE_ROLE_KEY not set in environment")
        print("Export it with: export SUPABASE_SERVICE_ROLE_KEY='your_key'")
        return None
    
    try:
        client = create_client(SUPABASE_URL, service_role_key)
        print(f"✅ Connected to Supabase: {SUPABASE_URL}")
        return client
    except Exception as e:
        print(f"❌ Failed to connect: {e}")
        return None


def scenario_1_character_fields(client: Client) -> Dict[str, Any]:
    """SCENARIO 1: CHARACTER FIELDS (Failure #1)"""
    print("\n" + "="*80)
    print("SCENARIO 1: CHARACTER FIELDS (Failure #1)")
    print("="*80)
    
    results = {
        "scenario": "1_character_fields",
        "tests": []
    }
    
    # Query 1.1: Leo character entity
    print("\n📋 Query 1.1: Character entity with fields")
    print("Expected: 1 Leo Frostborne entity with height, hair_color, eye_color")
    
    try:
        leo_data = client.table('knowledge_entities').select(
            'id, canonical_name, entity_type, aliases, structured_fields, layer, branch_id, created_at'
        ).eq('project_id', PROJECT_ID)\
         .ilike('canonical_name', 'Leo%')\
         .eq('entity_type', 'character')\
         .execute()
        
        leo_count = len(leo_data.data) if leo_data.data else 0
        print(f"Result: {leo_count} rows")
        
        if leo_count == 1:
            entity = leo_data.data[0]
            print(f"✓ Name: {entity['canonical_name']}")
            print(f"✓ Aliases: {entity['aliases']}")
            
            sf = entity.get('structured_fields', {})
            height = sf.get('height')
            hair_color = sf.get('hair_color')
            eye_color = sf.get('eye_color')
            
            print(f"✓ Height: {height}")
            print(f"✓ Hair Color: {hair_color}")
            print(f"✓ Eye Color: {eye_color}")
            
            test_pass = height is not None and hair_color is not None and eye_color is not None
            print(f"\n{'✅ PASS' if test_pass else '❌ FAIL'}: Fields populated")
            results["tests"].append({
                "name": "Query 1.1 - Leo entity fields",
                "expected": 1,
                "result": leo_count,
                "pass": leo_count == 1 and test_pass
            })
        else:
            print(f"❌ FAIL: Expected 1 Leo entity, got {leo_count}")
            results["tests"].append({
                "name": "Query 1.1 - Leo entity fields",
                "expected": 1,
                "result": leo_count,
                "pass": False
            })
            
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 1.1 - Leo entity fields",
            "error": str(e),
            "pass": False
        })
    
    # Query 1.2: Character entity values
    print("\n📋 Query 1.2: Character entity values")
    print("Expected: Values for height, hair_color, eye_color with source_type='ai'")
    
    try:
        if leo_data.data:
            entity_id = leo_data.data[0]['id']
            values_data = client.table('knowledge_entity_values').select(
                'id, field_path, value_json, source_type, value_status'
            ).eq('entity_id', entity_id)\
             .order('field_path')\
             .execute()
            
            values_count = len(values_data.data) if values_data.data else 0
            print(f"Result: {values_count} rows")
            
            required_fields = {'height', 'hair_color', 'eye_color'}
            found_fields = set()
            
            if values_data.data:
                for val in values_data.data:
                    print(f"  {val['field_path']}: {val['value_json']} (source: {val['source_type']})")
                    found_fields.add(val['field_path'])
            
            missing = required_fields - found_fields
            test_pass = len(missing) == 0
            
            print(f"\n{'✅ PASS' if test_pass else '❌ FAIL'}: All required fields present")
            if missing:
                print(f"Missing: {missing}")
            
            results["tests"].append({
                "name": "Query 1.2 - Entity values synced",
                "required": list(required_fields),
                "found": list(found_fields),
                "pass": test_pass
            })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 1.2 - Entity values synced",
            "error": str(e),
            "pass": False
        })
    
    return results


def scenario_2_abilities_objects(client: Client) -> Dict[str, Any]:
    """SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3)"""
    print("\n" + "="*80)
    print("SCENARIO 2: ABILITIES & OBJECTS (Failure #2 & #3)")
    print("="*80)
    
    results = {
        "scenario": "2_abilities_objects",
        "tests": []
    }
    
    # Query 2.1: Ability entities
    print("\n📋 Query 2.1: Ability entities")
    print("Expected: 4 abilities")
    
    try:
        abilities_data = client.table('knowledge_entities').select(
            'id, canonical_name'
        ).eq('project_id', PROJECT_ID)\
         .eq('entity_type', 'ability')\
         .order('canonical_name')\
         .execute()
        
        abilities_count = len(abilities_data.data) if abilities_data.data else 0
        print(f"Result: {abilities_count} rows")
        
        if abilities_data.data:
            for ab in abilities_data.data:
                print(f"  - {ab['canonical_name']}")
        
        print(f"\n{'✅ PASS' if abilities_count == 4 else '❌ FAIL'}: Expected 4, got {abilities_count}")
        results["tests"].append({
            "name": "Query 2.1 - Ability entities",
            "expected": 4,
            "result": abilities_count,
            "pass": abilities_count == 4
        })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 2.1 - Ability entities",
            "error": str(e),
            "pass": False
        })
    
    # Query 2.2: Character-ability relationships
    print("\n📋 Query 2.2: Character-ability relationships (Fix #2)")
    print("Expected: 4 relationships")
    
    try:
        # First get Leo's ID
        leo_data = client.table('knowledge_entities').select('id').eq('project_id', PROJECT_ID)\
            .ilike('canonical_name', 'Leo%')\
            .eq('entity_type', 'character')\
            .single()\
            .execute()
        
        if leo_data.data:
            leo_id = leo_data.data['id']
            
            rel_data = client.table('knowledge_entity_relationships').select(
                'id, relationship_type'
            ).eq('project_id', PROJECT_ID)\
             .eq('relationship_type', 'has_ability')\
             .eq('source_entity_id', leo_id)\
             .execute()
            
            rel_count = len(rel_data.data) if rel_data.data else 0
            print(f"Result: {rel_count} rows")
            
            print(f"\n{'✅ PASS' if rel_count == 4 else '❌ FAIL'}: Expected 4, got {rel_count}")
            results["tests"].append({
                "name": "Query 2.2 - has_ability relationships",
                "expected": 4,
                "result": rel_count,
                "pass": rel_count == 4
            })
        else:
            print("❌ Leo entity not found")
            results["tests"].append({
                "name": "Query 2.2 - has_ability relationships",
                "error": "Leo entity not found",
                "pass": False
            })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 2.2 - has_ability relationships",
            "error": str(e),
            "pass": False
        })
    
    # Query 2.3: Cabinet objects
    print("\n📋 Query 2.3: Cabinet objects")
    print("Expected: 2 Cabinets with different materials")
    
    try:
        cabinets_data = client.table('knowledge_entities').select(
            'id, canonical_name, structured_fields, created_at'
        ).eq('project_id', PROJECT_ID)\
         .eq('entity_type', 'object')\
         .eq('canonical_name', 'Cabinet')\
         .order('created_at')\
         .execute()
        
        cabinets_count = len(cabinets_data.data) if cabinets_data.data else 0
        print(f"Result: {cabinets_count} rows")
        
        if cabinets_data.data:
            for idx, cab in enumerate(cabinets_data.data):
                sf = cab.get('structured_fields', {})
                print(f"  Cabinet {chr(65+idx)}: materials={sf.get('materials')}")
        
        print(f"\n{'✅ PASS' if cabinets_count == 2 else '❌ FAIL'}: Expected 2, got {cabinets_count}")
        results["tests"].append({
            "name": "Query 2.3 - Cabinet objects",
            "expected": 2,
            "result": cabinets_count,
            "pass": cabinets_count == 2
        })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 2.3 - Cabinet objects",
            "error": str(e),
            "pass": False
        })
    
    return results


def scenario_3_cabinet_identity(client: Client) -> Dict[str, Any]:
    """SCENARIO 3: CABINET IDENTITY (Failure #4 - CORE FIX)"""
    print("\n" + "="*80)
    print("SCENARIO 3: CABINET IDENTITY (Failure #4 - CORE FIX)")
    print("="*80)
    
    results = {
        "scenario": "3_cabinet_identity",
        "tests": []
    }
    
    # Query 3.1: Cabinet count
    print("\n📋 Query 3.1: Cabinet count")
    print("Expected: 2 (not 1, not 3+)")
    
    try:
        count_data = client.table('knowledge_entities').select(
            'id', { count: 'exact' }
        ).eq('project_id', PROJECT_ID)\
         .eq('entity_type', 'object')\
         .eq('canonical_name', 'Cabinet')\
         .execute()
        
        cabinet_count = len(count_data.data) if count_data.data else 0
        print(f"Result: {cabinet_count} rows")
        
        status = "✅ PASS"
        message = ""
        if cabinet_count == 1:
            status = "❌ FAIL"
            message = " (merged - Failure #4 not fixed)"
        elif cabinet_count > 2:
            status = "❌ FAIL"
            message = " (over-fragmented)"
        elif cabinet_count == 2:
            status = "✅ PASS"
        
        print(f"\n{status}: Expected 2, got {cabinet_count}{message}")
        results["tests"].append({
            "name": "Query 3.1 - Cabinet count",
            "expected": 2,
            "result": cabinet_count,
            "pass": cabinet_count == 2,
            "message": message
        })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 3.1 - Cabinet count",
            "error": str(e),
            "pass": False
        })
    
    # Query 3.2: Cabinet identities
    print("\n📋 Query 3.2: Cabinet identities (CORE VERIFICATION)")
    print("Expected: Different UUIDs, different materials")
    
    try:
        cabinets_data = client.table('knowledge_entities').select(
            'id, canonical_name, structured_fields, created_at'
        ).eq('project_id', PROJECT_ID)\
         .eq('entity_type', 'object')\
         .eq('canonical_name', 'Cabinet')\
         .order('created_at')\
         .execute()
        
        if cabinets_data.data and len(cabinets_data.data) >= 2:
            cab_a = cabinets_data.data[0]
            cab_b = cabinets_data.data[1]
            
            print(f"Cabinet A: ID={cab_a['id'][:8]}...")
            print(f"  Materials: {cab_a['structured_fields'].get('materials')}")
            
            print(f"Cabinet B: ID={cab_b['id'][:8]}...")
            print(f"  Materials: {cab_b['structured_fields'].get('materials')}")
            
            different_ids = cab_a['id'] != cab_b['id']
            different_materials = cab_a['structured_fields'].get('materials') != cab_b['structured_fields'].get('materials')
            
            print(f"\n{'✅' if different_ids else '❌'} UUIDs different: {different_ids}")
            print(f"{'✅' if different_materials else '❌'} Materials different: {different_materials}")
            
            test_pass = different_ids and different_materials
            print(f"\n{'✅ PASS' if test_pass else '❌ FAIL'}: Cabinet identities verified")
            
            results["tests"].append({
                "name": "Query 3.2 - Cabinet identities",
                "cabinet_a_id": cab_a['id'][:16],
                "cabinet_b_id": cab_b['id'][:16],
                "different_ids": different_ids,
                "different_materials": different_materials,
                "pass": test_pass
            })
        else:
            print("❌ Not enough Cabinet entities found")
            results["tests"].append({
                "name": "Query 3.2 - Cabinet identities",
                "error": "Not enough Cabinet entities",
                "pass": False
            })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 3.2 - Cabinet identities",
            "error": str(e),
            "pass": False
        })
    
    return results


def scenario_4_main_branch_isolation(client: Client) -> Dict[str, Any]:
    """SCENARIO 4: MAIN/BRANCH ISOLATION"""
    print("\n" + "="*80)
    print("SCENARIO 4: MAIN/BRANCH ISOLATION")
    print("="*80)
    
    results = {
        "scenario": "4_main_branch_isolation",
        "tests": []
    }
    
    # Query 4.1: Layer distribution
    print("\n📋 Query 4.1: Layer distribution")
    print("Expected: All layer='main', all branch_id=NULL")
    
    try:
        layer_data = client.table('knowledge_entities').select(
            'layer, branch_id'
        ).eq('project_id', PROJECT_ID)\
         .execute()
        
        layers = {}
        for e in layer_data.data or []:
            layer = e['layer']
            layers[layer] = layers.get(layer, 0) + 1
        
        print(f"Result: {layers}")
        
        # Check if only main layer
        only_main = len(layers) == 1 and 'main' in layers
        main_count = layers.get('main', 0)
        
        print(f"\n{'✅ PASS' if only_main else '❌ FAIL'}: Only main layer present")
        results["tests"].append({
            "name": "Query 4.1 - Layer distribution",
            "layers": layers,
            "expected_main": 7,
            "actual_main": main_count,
            "pass": only_main and main_count == 7
        })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 4.1 - Layer distribution",
            "error": str(e),
            "pass": False
        })
    
    # Query 4.2: Branch overlays
    print("\n📋 Query 4.2: Branch overlays")
    print("Expected: 0 overlays")
    
    try:
        overlay_data = client.table('knowledge_branch_entities').select(
            'id'
        ).eq('project_id', PROJECT_ID)\
         .not_('source_entity_id', 'is', 'null')\
         .execute()
        
        overlay_count = len(overlay_data.data) if overlay_data.data else 0
        print(f"Result: {overlay_count} overlays")
        
        print(f"\n{'✅ PASS' if overlay_count == 0 else '❌ FAIL'}: Expected 0, got {overlay_count}")
        results["tests"].append({
            "name": "Query 4.2 - Branch overlays",
            "expected": 0,
            "result": overlay_count,
            "pass": overlay_count == 0
        })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 4.2 - Branch overlays",
            "error": str(e),
            "pass": False
        })
    
    # Query 4.3: Entity count summary
    print("\n📋 Query 4.3: Entity count summary")
    print("Expected: character=1, ability=4, object=2 (total=7)")
    
    try:
        entity_data = client.table('knowledge_entities').select(
            'entity_type'
        ).eq('project_id', PROJECT_ID)\
         .execute()
        
        entity_types = {}
        for e in entity_data.data or []:
            et = e['entity_type']
            entity_types[et] = entity_types.get(et, 0) + 1
        
        print(f"Result: {entity_types}")
        
        total = sum(entity_types.values())
        expected = {
            'character': 1,
            'ability': 4,
            'object': 2
        }
        
        matches = all(entity_types.get(k) == v for k, v in expected.items())
        
        for entity_type, count in expected.items():
            actual = entity_types.get(entity_type, 0)
            status = "✅" if actual == count else "❌"
            print(f"  {status} {entity_type}: {actual}/{count}")
        
        print(f"\n{'✅ PASS' if matches and total == 7 else '❌ FAIL'}: Expected 7 total")
        results["tests"].append({
            "name": "Query 4.3 - Entity count summary",
            "expected": expected,
            "actual": entity_types,
            "total": total,
            "pass": matches and total == 7
        })
    except Exception as e:
        print(f"❌ Query failed: {e}")
        results["tests"].append({
            "name": "Query 4.3 - Entity count summary",
            "error": str(e),
            "pass": False
        })
    
    return results


def generate_report(scenario_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate final report"""
    print("\n" + "="*80)
    print("FINAL REPORT")
    print("="*80)
    
    all_tests = []
    for scenario in scenario_results:
        all_tests.extend(scenario['tests'])
    
    passed = sum(1 for t in all_tests if t.get('pass', False))
    failed = sum(1 for t in all_tests if not t.get('pass', False))
    total = len(all_tests)
    
    print(f"\nTotal tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success rate: {100 * passed // total}%")
    
    if failed == 0:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print("\n⚠️  Some tests failed. Review above for details.")
    
    return {
        "project_id": PROJECT_ID,
        "total_tests": total,
        "passed": passed,
        "failed": failed,
        "success_rate": f"{100 * passed // total}%",
        "scenarios": scenario_results
    }


def main():
    print("\n╔════════════════════════════════════════════════════════════════════╗")
    print("║        CONTROLLED EXTRACTION TEST - VERIFICATION SCRIPT           ║")
    print("╚════════════════════════════════════════════════════════════════════╝\n")
    
    print(f"Project ID: {PROJECT_ID}")
    print(f"Supabase: {SUPABASE_URL}\n")
    
    client = init_client()
    if not client:
        sys.exit(1)
    
    results = []
    results.append(scenario_1_character_fields(client))
    results.append(scenario_2_abilities_objects(client))
    results.append(scenario_3_cabinet_identity(client))
    results.append(scenario_4_main_branch_isolation(client))
    
    report = generate_report(results)
    
    # Save report in the repository's test-results directory
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open('w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Report saved to {REPORT_PATH}")
    
    sys.exit(0 if report['failed'] == 0 else 1)


if __name__ == '__main__':
    main()
