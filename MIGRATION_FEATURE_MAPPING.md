# Supabase Migration to Feature Mapping

**Date:** August 20, 2026  
**Purpose:** Map each migration to the features it enables

---

## Feature Groups and Their Migrations

### Feature: User Projects & Maps (Maps Editor)

**Migrations Required:**
1. `001_initial_schema.sql` - Creates projects, maps, markers, regions
2. `002_rls_policies.sql` - Restricts access to user's own projects/maps
3. `003_storage_and_cleanup.sql` - Handles map image storage

**Tables Created:**
- `profiles` - User profile data
- `projects` - Book/story containers
- `maps` - Individual maps within projects
- `markers` - Markers placed on maps
- `regions` - Groups of markers forming areas
- `map_images` - Version history of final map images
- `prompt_history` - Generated prompts for maps

**Capabilities Enabled:**
- ✅ Create/read/update/delete projects
- ✅ Create/read/update/delete maps
- ✅ Place markers on maps
- ✅ Define regions
- ✅ Upload/store final map images
- ✅ Generate prompts

---

### Feature: Document Upload & Analysis

**Migrations Required:**
1. `004_document_analysis_schema.sql` - Creates document storage tables
2. `005_document_rls_policies.sql` - Restricts document access
3. `006_document_storage.sql` - Configures storage buckets

**Tables Created:**
- `documents` - Uploaded documents metadata
- `document_versions` - Version history of documents
- `chunks` - Text chunks extracted from documents

**Capabilities Enabled:**
- ✅ Upload PDF/DOCX documents
- ✅ Store document versions
- ✅ Chunk documents into readable pieces
- ✅ Track document processing status
- ✅ Archive/soft-delete documents

---

### Feature: Knowledge Extraction (Phase 1 - Foundation)

**Migrations Required:**
1. `007_knowledge_entities.sql` - Creates knowledge entity tables
2. `008_knowledge_branches.sql` - Creates branching system
3. `009_search_functions.sql` - Implements search

**Tables Created:**
- `raw_extractions` - Audit trail of AI extraction responses
- `knowledge_entities` - Extracted entities (characters, locations, objects, etc.)
- `knowledge_entity_aliases` - Alternative names for entities
- `knowledge_entity_mentions` - Where entities are mentioned in documents
- `knowledge_entity_relationships` - Connections between entities
- `knowledge_branches` - Working copies of knowledge

**Capabilities Enabled:**
- ✅ AI extraction of entities from documents
- ✅ Store extracted entities
- ✅ Track entity mentions
- ✅ Define relationships between entities
- ✅ Create working copy branches
- ✅ Search for entities

---

### Feature: Branch Overlay Model (Phase 2 - Enhancement)

**Migrations Required:**
1. `010_branch_overlay_model.sql` - Implements overlay mechanism
2. `011_entity_structured_fields.sql` - Adds structured fields
3. `012_knowledge_branches_standalone.sql` - Makes branches independent
4. `013_ai_extraction_branch_routing.sql` - Routes AI to correct branch
5. `014_ai_branch_scope_uniqueness.sql` - Enforces uniqueness per branch
6. `015_branch_scoped_relationship_review.sql` - Branch-scoped relationships

**Tables Enhanced:**
- `knowledge_branch_entities` - Maps branch versions of entities
- `knowledge_entity_relationships` - Enhanced with branch scope

**Capabilities Enabled:**
- ✅ Create independent branches for experimental changes
- ✅ Overlay branch entities over Main layer
- ✅ Manage structured fields (age, location, abilities, etc.)
- ✅ Route AI extraction to specific branches
- ✅ Enforce uniqueness constraints per branch
- ✅ Review and merge changes from branches

---

### Feature: Schema Remediation & Enhancement (Phase 3 - Fixes)

**Migration 099: Fix Missing Columns**
- Adds missing columns to existing tables
- Ensures schema completeness

**Migration 100: Fix Layer & Entity Type Constraints**
- Updates CHECK constraints to allow new entity types:
  - `magic_ability` (in addition to `ability`)
  - `event` (new type for temporal entities)
- Fixes layer constraint from `main|secondary` to `main|branch`

**Capabilities Enabled:**
- ✅ Support for magic abilities in fantasy contexts
- ✅ Support for temporal events
- ✅ Correct layer terminology (branch instead of secondary)

---

### Feature: Contradictions Management (Phase 3 - New)

**Migrations Required:**
1. `101_knowledge_contradictions_enhancement.sql` - Creates contradictions table with metadata
2. `102_contradictions_rls_policies.sql` - Restricts contradiction access
3. `103_validate_branch_entity_uniqueness.sql` - Validates constraint semantics

**Tables Created:**
- `knowledge_contradictions` - Tracks conflicting values for entities

**Columns Added:**
- `project_id` - Which project contains the contradiction
- `branch_id` - Which branch (NULL for Main)
- `entity_id` - Which entity has the contradiction
- `field_path` - What field is contradicted (e.g., "age", "location.name")
- `value_a_id` - First value (from entity_values)
- `value_b_id` - Second value (from entity_values)
- `dedupe_key` - Unique identifier within scope
- `contradiction_type` - Type of contradiction
- `status` - Resolution status (open, resolved_fix_profile, etc.)

**Capabilities Enabled:**
- ✅ Detect conflicting information about entities
- ✅ Track contradictions per branch
- ✅ Link contradictions to specific values
- ✅ Mark contradictions as resolved
- ✅ Generate contradiction reports

---

### Feature: Structured Entity Values (Phase 3 - New)

**Migrations Required:**
1. `104_knowledge_entity_values.sql` - Creates entity values table
2. `105_knowledge_entity_value_evidence.sql` - Adds evidence linking

**Tables Created:**
- `knowledge_entity_values` - Structured attribute values
- `knowledge_entity_value_evidence` - Links values to source evidence

**Capabilities Enabled:**
- ✅ Store structured values for entity fields
- ✅ Track multiple values per field
- ✅ Link values to source evidence (chunks)
- ✅ Support contradictions on specific values

---

### Feature: Entity Status & Review (Phase 3 - New)

**Migrations Required:**
1. `106_add_review_status_to_entities.sql` - Adds review tracking
2. `107_add_knowledge_contradiction_references.sql` - Links to contradictions

**Columns Added to entities:**
- `review_status` - Tracks if entity has been reviewed
- `contradiction_count` - Cache of active contradictions
- `last_reviewed_at` - Timestamp of last review

**Capabilities Enabled:**
- ✅ Track entity review status
- ✅ Flag entities with unresolved contradictions
- ✅ Generate review prioritization lists
- ✅ Track review history

---

### Feature: Entity Uniqueness & Identity (Phase 3 - Refinements)

**Migrations Required:**
1. `108_knowledge_entities_main_branch_uniqueness.sql` - Main layer uniqueness
2. `109_knowledge_contradictions.sql` - Final contradiction refinements
3. `110_allow_duplicate_entity_canonical_names.sql` - Removes duplicate restrictions

**Key Changes:**
- Entity identity is UUID, not canonical_name
- Multiple entities can have same canonical_name
- Uniqueness constraints apply only where needed (Main layer identity)
- Overlay model fully supported

**Capabilities Enabled:**
- ✅ Support for entities with duplicate names (same character name in different contexts)
- ✅ Clean separation between identity (UUID) and display (canonical_name)
- ✅ Flexible naming in branches

---

### Feature: Legacy Cleanup (Phase 3 - Final)

**Migration 111: Remove Legacy Bootstrap Entities**

**Purpose:**
- Removes synthetic bootstrap sentinel entities
- These were used to mark Main layer initialization
- Now implicit: Main is initialized when first real entities added

**Entities Affected:**
- All entities with `canonical_name = '__bootstrap__'`
- With `layer = 'main'` and `source = 'ai'`

**Capabilities Impact:**
- ✅ Cleaner database (no synthetic data)
- ✅ Simpler initialization logic
- ✅ No changes to application code (already filters these out)

**Cascade Deletions:**
- knowledge_entity_aliases (if any)
- knowledge_entity_mentions (if any)
- knowledge_entity_relationships (if any)
- knowledge_branch_entities (if any)
- knowledge_entity_values (if any)
- knowledge_contradictions (if any)

---

## Dependency Chain for Features

### Basic Functionality (Minimal)
```
001 → 002 → 003
└─ User projects and maps ready
```

### Document Processing (Add)
```
001 → 002 → 003 → 004 → 005 → 006
└─ Document upload and chunking ready
```

### Knowledge Extraction (Add)
```
... → 007 → 008 → 009
└─ Basic entity extraction ready
```

### Full Branching System (Add)
```
... → 010 → 011 → 012 → 013 → 014 → 015
└─ Branch management and overlay model ready
```

### Complete Feature Set (All)
```
... → 099 → 100 → 101 → 102 → 103 → 104 → 105 → 106 → 107 → 108 → 109 → 110 → 111
└─ Full contradiction management, structured values, and cleanup ready
```

---

## Feature Availability by Migration Level

| Feature | Min Migration | Status |
|---------|---------------|--------|
| Projects & Maps | 003 | ✅ Core |
| Document Upload | 006 | ✅ Core |
| Entity Extraction | 009 | ✅ Knowledge |
| Entity Relationships | 015 | ✅ Branching |
| Branching System | 015 | ✅ Branching |
| Contradictions | 103 | ✅ Enhanced |
| Structured Values | 105 | ✅ Enhanced |
| Entity Review Status | 107 | ✅ Enhanced |
| Full Cleanup | 111 | ✅ Final |

---

## Critical Dependencies

### Must Complete in Order

1. **Tier 1 - Core Infrastructure** (no reordering possible)
   - 001: Base schema
   - 002: RLS enabled
   - 003: Storage ready

2. **Tier 2 - Knowledge Foundation** (must follow Tier 1)
   - 004-006: Document system (independent of knowledge)
   - 007-009: Knowledge system (depends on core)

3. **Tier 3 - Branching** (must follow Tier 2)
   - 010-015: Branch system (depends on knowledge)

4. **Tier 4 - Enhancement** (can follow in order)
   - 099-111: Various enhancements and fixes

### No Internal Dependencies
- 004-006 (documents) don't depend on 007-015 (knowledge)
- Can implement either independently
- Work together at application level only

---

## Schema Growth Over Migrations

### After Migration 003
**Tables:** 7 (profiles, projects, maps, markers, regions, map_images, prompt_history)  
**Indexes:** ~10  
**RLS Policies:** ~15  

### After Migration 006
**Tables:** +3 (documents, document_versions, chunks) = 10 total  
**Indexes:** +~8 = ~18 total  
**RLS Policies:** +~10 = ~25 total  

### After Migration 015
**Tables:** +7 (knowledge_entities, raw_extractions, relationships, etc.) = 17 total  
**Indexes:** +~15 = ~33 total  
**RLS Policies:** +~5 = ~30 total  

### After Migration 111
**Tables:** +1 (knowledge_entity_values, knowledge_contradictions) = 19 total  
**Indexes:** +~8 = ~41 total  
**RLS Policies:** +~5 = ~35 total  
**Stored Functions:** ~10  
**Triggers:** ~5  

---

## Performance Implications

### Indexed Queries (Fast)
- Find user's projects: O(1) via `idx_projects_user_id`
- Find map markers: O(1) via `idx_markers_map_id`
- Search entities: O(log n) via `idx_knowledge_entities_canonical`

### Non-Indexed Queries (Slower, but acceptable)
- Complex relationship queries (handled by application joins)
- Contradiction detection (batch processed)
- Full-text search (would need additional indexes)

### Cascade Operations
- Deleting a project deletes: maps, markers, regions, documents, entities (~100ms typical)
- No orphaned records possible (all CASCADE)

---

## Security Implications

### Authentication
- ✅ All tables linked to `auth.users` via `profiles`
- ✅ User_id always tracked
- ✅ No cross-user access possible

### Row Level Security
- ✅ Enabled on all sensitive tables
- ✅ Core tables (001-002): User-owned projects/maps only
- ✅ Document tables (005): User-owned documents only
- ✅ Knowledge tables: Project-scoped queries (enforced via foreign keys)
- ✅ Contradictions (102): Project/branch-owned contradictions only

### Data Protection
- ✅ Soft deletes on sensitive data (deleted_at field)
- ✅ Audit trail via raw_extractions table
- ✅ No PII stored in extracted entities
- ✅ All references use UUID (no direct text exposure)

---

## Scalability Notes

### Current Limitations
- Single-project database (shared among all users)
- RLS policies enforce user-level isolation
- Row-level access control (not column-level)
- No data sharding or partitioning

### Suitable For
- ✅ 1-100 concurrent users
- ✅ 100-10,000 entities per project
- ✅ 1,000-100,000 relationships
- ✅ 100-1,000 documents per project

### Would Require Refactoring
- ✗ >1,000 concurrent users
- ✗ >1,000,000 entities
- ✗ Real-time collaborative editing (may require CRDT)
- ✗ Horizontal scaling (would need schema redesign)

---

## Conclusion

The migration set provides a complete, layered feature implementation:

1. **Core** (001-003): Projects, maps, storage
2. **Documents** (004-006): Upload and analysis
3. **Knowledge** (007-015): Entity extraction and relationships
4. **Enhanced** (099-111): Contradictions, structured values, refinements

Each layer builds on previous ones, with clear dependencies and no circular requirements. All migrations work together to create a production-ready literary assistant database schema.

