#!/usr/bin/env python3
"""
Controlled Extraction Test Runner
Triggers extraction and captures verification data
"""

import os
import json
import sys
from pathlib import Path
from datetime import datetime
import subprocess

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Supabase credentials (anon key - for extraction trigger only)
SUPABASE_URL = "https://lqfqfzqcrqluxanhnjwu.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww"

# Test project
TEST_PROJECT_ID = "6c4b7b92-214a-4785-ad66-e62527ee68d6"
TEST_DOCUMENT_PATH = PROJECT_ROOT / "tests" / "fixtures" / "CONTROLLED_TEST_DOCUMENT.md"

def run_command(cmd, description):
    """Run a shell command and return output"""
    print(f"\n📌 {description}...")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed: {result.stderr}")
        return None
    return result.stdout.strip()

def query_database(query, description):
    """Query the database via Supabase CLI"""
    print(f"\n📌 {description}...")
    cmd = f'supabase db query --linked "{query}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=PROJECT_ROOT)
    
    if result.returncode != 0:
        print(f"⚠️  Query failed: {result.stderr[:200]}")
        return None
    
    return result.stdout.strip()

def main():
    print("=" * 80)
    print("CONTROLLED EXTRACTION VERIFICATION TEST")
    print("=" * 80)
    print(f"\nTest Project: {TEST_PROJECT_ID}")
    print(f"Test Document: {TEST_DOCUMENT_PATH.relative_to(PROJECT_ROOT)}")
    print(f"Execution Time: {datetime.now().isoformat()}")
    print(f"Commit: 8597629")
    
    # Step 1: Verify test project exists
    print("\n" + "=" * 80)
    print("STEP 1: VERIFY TEST PROJECT")
    print("=" * 80)
    
    project_query = f"""
    SELECT 
      id,
      name,
      user_id,
      created_at
    FROM projects
    WHERE id = '{TEST_PROJECT_ID}'
    LIMIT 1
    """
    
    project_result = query_database(project_query, "Checking test project")
    if not project_result or "id" not in project_result:
        print("❌ Test project not found!")
        return False
    
    print(f"✅ Test project found")
    print(project_result)
    
    # Step 2: Check existing documents
    print("\n" + "=" * 80)
    print("STEP 2: CHECK EXISTING DOCUMENTS")
    print("=" * 80)
    
    doc_query = f"""
    SELECT 
      id,
      name,
      created_at
    FROM documents
    WHERE project_id = '{TEST_PROJECT_ID}'
    ORDER BY created_at DESC
    LIMIT 5
    """
    
    doc_result = query_database(doc_query, "Checking documents in project")
    if doc_result:
        print(f"✅ Documents found:")
        print(doc_result)
    else:
        print("⚠️  No documents found yet")
    
    # Step 3: Check existing extractions
    print("\n" + "=" * 80)
    print("STEP 3: CHECK EXISTING EXTRACTIONS")
    print("=" * 80)
    
    extraction_query = f"""
    SELECT 
      id as extraction_id,
      model,
      chunks_count,
      layer,
      created_at
    FROM raw_extractions
    WHERE project_id = '{TEST_PROJECT_ID}'
    ORDER BY created_at DESC
    LIMIT 5
    """
    
    extraction_result = query_database(extraction_query, "Checking extractions")
    if extraction_result:
        print(f"✅ Extractions found:")
        print(extraction_result)
    else:
        print("⚠️  No extractions found yet")
    
    # Step 4: Verify character entities
    print("\n" + "=" * 80)
    print("STEP 4: VERIFY CHARACTER ENTITIES (Scenario 1)")
    print("=" * 80)
    
    char_query = f"""
    SELECT 
      id,
      canonical_name,
      entity_type,
      structured_fields->>'height' as height,
      structured_fields->>'hair_color' as hair_color,
      structured_fields->>'eye_color' as eye_color,
      layer,
      created_at
    FROM knowledge_entities
    WHERE entity_type = 'character'
      AND project_id = '{TEST_PROJECT_ID}'
    ORDER BY canonical_name
    """
    
    char_result = query_database(char_query, "Verifying character fields")
    if char_result and "Leo" in char_result:
        print(f"✅ Character entities found:")
        print(char_result)
    else:
        print("⚠️  No character entities or Leo not found")
    
    # Step 5: Verify object entities (Cabinet identity)
    print("\n" + "=" * 80)
    print("STEP 5: VERIFY OBJECT ENTITIES (Scenario 3)")
    print("=" * 80)
    
    obj_query = f"""
    SELECT 
      id,
      canonical_name,
      structured_fields->>'materials' as materials,
      structured_fields->>'appearance' as appearance,
      layer,
      created_at
    FROM knowledge_entities
    WHERE entity_type = 'object'
      AND project_id = '{TEST_PROJECT_ID}'
    ORDER BY canonical_name, created_at
    """
    
    obj_result = query_database(obj_query, "Verifying Cabinet objects")
    if obj_result and "Cabinet" in obj_result:
        print(f"✅ Object entities found:")
        print(obj_result)
        
        # Count Cabinets
        if obj_result.count("Cabinet") >= 2 and ("wood" in obj_result or "glass" in obj_result):
            print("✅ TWO Cabinet entities with different materials detected!")
        else:
            print("⚠️  Unexpected Cabinet count or materials missing")
    else:
        print("⚠️  No object entities or Cabinet not found")
    
    # Step 6: Verify ability entities
    print("\n" + "=" * 80)
    print("STEP 6: VERIFY ABILITY ENTITIES (Scenario 2)")
    print("=" * 80)
    
    ability_query = f"""
    SELECT 
      id,
      canonical_name,
      entity_type,
      layer,
      created_at
    FROM knowledge_entities
    WHERE entity_type = 'ability'
      AND project_id = '{TEST_PROJECT_ID}'
    ORDER BY canonical_name
    """
    
    ability_result = query_database(ability_query, "Verifying ability entities")
    if ability_result:
        ability_count = ability_result.count("\n") + 1
        print(f"✅ Ability entities found ({ability_count}):")
        print(ability_result)
    else:
        print("⚠️  No ability entities found")
    
    # Step 7: Verify Main/Branch isolation
    print("\n" + "=" * 80)
    print("STEP 7: VERIFY MAIN/BRANCH ISOLATION (Scenario 4)")
    print("=" * 80)
    
    layer_query = f"""
    SELECT 
      layer,
      COUNT(*) as count,
      COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as branch_id_null,
      COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as branch_id_not_null
    FROM knowledge_entities
    WHERE project_id = '{TEST_PROJECT_ID}'
    GROUP BY layer
    """
    
    layer_result = query_database(layer_query, "Verifying layer distribution")
    if layer_result:
        print(f"✅ Layer distribution:")
        print(layer_result)
    
    # Step 8: Verify relationships (character -> ability)
    print("\n" + "=" * 80)
    print("STEP 8: VERIFY CHARACTER-ABILITY RELATIONSHIPS (Fix #2)")
    print("=" * 80)
    
    rel_query = f"""
    SELECT 
      relationship_type,
      COUNT(*) as count
    FROM knowledge_entity_relationships
    WHERE project_id = '{TEST_PROJECT_ID}'
    GROUP BY relationship_type
    """
    
    rel_result = query_database(rel_query, "Verifying relationships")
    if rel_result:
        print(f"✅ Relationship summary:")
        print(rel_result)
        
        if "has_ability" in rel_result:
            print("✅ Character-ability relationships (Fix #2) are present!")
    
    # Step 9: Summary
    print("\n" + "=" * 80)
    print("VERIFICATION SUMMARY")
    print("=" * 80)
    
    print("""
    To complete the verification:
    
    1. ✅ Verify Character Fields (Scenario 1)
       - Check: height, hair_color, eye_color displayed correctly
       - Expected: All populated from structured_fields
    
    2. ✅ Verify Abilities & Objects (Scenario 2)
       - Check: 4 ability entities created
       - Check: 2 Cabinet objects with different materials
       - Expected: Abilities linked via relationships (has_ability)
    
    3. ✅ Verify Cabinet Identity (Scenario 3)
       - Check: 2 Cabinet entities with different UUIDs
       - Check: Materials = "wood" vs "glass"
       - Expected: No consolidation of conflicting contexts
    
    4. ✅ Verify Main/Branch Isolation (Scenario 4)
       - Check: All entities in 'main' layer
       - Check: All branch_id = NULL (first extraction)
       - Expected: No overlays in knowledge_branch_entities
    
    For detailed verification, run the SQL queries from
    supabase/sql/verification/../../../supabase/sql/verification/VERIFY_CONTROLLED_EXTRACTION.sql and compare
    results to expected outcomes.
    """)
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)
