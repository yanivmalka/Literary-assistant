# Literary Assistant - Product Roadmap

**Version**: 1.3 → 2.0+  
**Last Updated**: August 20, 2026  
**Current State**: v1.3 (Extraction & Entity Index Complete)

---

## **Overview**

This document is the master product roadmap for Literary Assistant, tracking progress from v1.3 through v2.0 and beyond. It aligns technical implementation with user value, prioritizing architecture cleanup before new features.

### **Architectural Principle**
**Legacy Architecture Cleanup is a prerequisite for Contradiction Detection and future features.** The current codebase has two parallel entity/attribute systems:

| System | Tables | Status |
|--------|--------|--------|
| Legacy | `entities`, `entity_attributes`, `entity_mentions`, `entity_relations`, `contradictions` | Deprecated |
| Knowledge Layer | `knowledge_entities`, `knowledge_branch_entities`, `knowledge_entity_aliases`, `knowledge_entity_mentions`, `knowledge_entity_relationships`, `knowledge_branches` | Active |

**Decision**: Legacy tables must be fully migrated or deprecated before Contradiction Detection can work correctly. Preserve legacy architecture only if audit proves it's still actively used (it is not for new extractions).

---

## **Version 1.3 — Current / Completed**

### **Version Goal**
Establish the foundational extraction pipeline and entity index with Main/Branch architecture.

### **User Value**
Users can upload manuscripts, extract entities (characters, locations, objects, abilities), and maintain separate working copies (Branches) without affecting canonical data.

### **Features**
- Document upload and processing pipeline
- AI entity extraction via Edge Functions
- Main/Branch isolation with overlay model
- Entity management (CRUD)
- Branch creation, activation, and approval workflow

### **Detailed Implementation Tasks**

#### **Phase 1: Document Processing**
- [x] Document upload (PDF/DOCX)
- [x] Text extraction from documents
- [x] Chunking with chapter detection
- [x] Embedding generation for semantic search

#### **Phase 2: Entity Extraction**
- [x] AI extraction via Gemini (with fallback models)
- [x] Entity normalization and deduplication
- [x] Entity mention tracking (where in document)
- [x] Entity aliases support
- [x] Entity attributes extraction
- [x] Entity relationships extraction

#### **Phase 3: Main/Branch Architecture**
- [x] `knowledge_branches` table for branch metadata
- [x] `knowledge_entities` table with `layer` column
- [x] `knowledge_branch_entities` overlay model
- [x] Branch isolation (no cross-contamination)
- [x] Effective entity view (Main + Branch overrides)

#### **Phase 4: Entity Management**
- [x] Entity CRUD operations
- [x] Entity editing UI
- [x] Branch entity approval workflow
- [x] Branch entity rejection tracking

#### **Phase 5: Branch Approval System**
- [x] `knowledge_branch_entities` overlay model
- [x] `overrides` and `base_values` JSONB columns
- [x] `modified_fields` array for tracking changes
- [x] Field-level approval (single field transfer)
- [x] Full entity approval (all changes transfer)

### **Dependencies**
- Supabase PostgreSQL database
- Gemini AI API (with multi-model fallback)
- Frontend: React + TypeScript + Vite
- Backend: Express.js + Supabase Edge Functions

### **Acceptance Criteria**
- [x] Document upload completes successfully
- [x] Entity extraction creates entities in correct layer (Main or Branch)
- [x] Branch entities show correct overlay values
- [x] Approval workflow moves Branch entities to Main correctly
- [x] RLS security enforced (users only see own data)

### **Testing Requirements**
- [x] Document upload workflow end-to-end
- [x] Entity extraction accuracy
- [x] Branch isolation (Branch entities don't leak to Main)
- [x] Approval workflow (Branch → Main transfer)
- [x] RLS security tests

### **Definition of Done**
- [x] All features implemented
- [x] Tests passing
- [x] Documentation complete
- [x] No critical security issues

### **Priority**
✅ **Complete** - Core functionality delivered

### **Status**
**Completed** - Production ready

---

## **Version 1.4 — Stabilization & Architecture Cleanup**

### **Version Goal**
Remove legacy architecture dependencies and ensure all new extractions use the knowledge layer exclusively.

### **User Value**
Simpler architecture = fewer bugs, easier maintenance, cleaner data model. Users get more reliable entity extraction and a path forward for new features.

### **Features**
- Remove legacy entity extraction routes
- Migrate or deprecate legacy tables
- Audit all code paths for legacy dependencies
- Ensure all extractions go through `extract-knowledge` Edge Function

### **Detailed Implementation Tasks**

#### **Architecture Audit**
- [ ] Audit all code paths to identify legacy table usage
- [ ] Audit all API endpoints to identify legacy routes
- [ ] Audit database migrations to identify unused tables
- [ ] Document dependencies between legacy and knowledge layer

#### **Legacy Table Migration/Deprecation**
- [ ] Identify tables that can be safely dropped (with rationale)
- [ ] Identify tables that need data migration (with migration strategy)
- [ ] Create migration scripts for any required data transfer
- [ ] Document migration rollback procedure

#### **Known Legacy Tables to Evaluate**
| Table | Purpose | Migration Needed? | Action |
|-------|---------|-------------------|--------|
| `entities` | Legacy entity storage | **YES** - Map to `knowledge_entities` | Create migration or deprecate |
| `entity_attributes` | Legacy attribute storage | **YES** - Migrate to `attributes`/`structured_fields` JSONB | Create migration |
| `entity_mentions` | Legacy mention tracking | **YES** - Use `knowledge_entity_mentions` | Deprecate legacy table |
| `entity_relations` | Legacy relationships | **YES** - Use `knowledge_entity_relationships` | Deprecate legacy table |
| `contradictions` | Legacy contradictions | **YES** - Migrate to knowledge layer schema | **MUST DO before v1.5** |
| `profiles_base` | Legacy profile storage | Evaluate usage | May be deprecated |
| `profile_field_sources` | Legacy field tracking | Evaluate usage | May be deprecated |

#### **Legacy Route Removal**
- [ ] Remove `/api/projects/:projectId/entities` route (legacy extraction)
- [ ] Remove `/api/projects/:projectId/entities/merge` route
- [ ] Remove any other legacy entity routes
- [ ] Replace with knowledge layer equivalents if needed

#### **Edge Function Hardening**
- [ ] Ensure `extract-knowledge` is the ONLY extraction path
- [ ] Add validation that all extractions set `branch_id` or `use_main=true`
- [ ] Add telemetry for extraction sources
- [ ] Add error handling for extraction failures

### **Dependencies**
- [ ] Complete v1.3 features
- [ ] Audit of all legacy code paths
- [ ] Approval for schema changes from stakeholders

### **Acceptance Criteria**
- [ ] No new extractions write to legacy `entities` table
- [ ] All extraction routes route through `extract-knowledge`
- [ ] Legacy routes that don't support knowledge layer are removed
- [ ] Database schema documented with only active tables

### **Testing Requirements**
- [ ] Verify no legacy extraction routes are called in production
- [ ] Verify all new extractions write to `knowledge_entities`
- [ ] Verify legacy data is migrated or deprecated
- [ ] RLS security tests pass for knowledge layer only

### **Definition of Done**
- [ ] All legacy entity routes removed or migrated
- [ ] All knowledge layer extractions working correctly
- [ ] Database schema cleaned up
- [ ] No legacy dependencies in new code

### **Priority**
✅ **High** - Required before v1.5 (Contradiction Detection)

### **Status**
**Pending** - Audit required before implementation

---

## **Version 1.5 — Contradiction Detection**

### **Version Goal**
Enable users to detect and resolve contradictions in entity attributes across document mentions.

### **User Value**
Users can identify inconsistencies in their writing (e.g., "Character A has blue eyes in Chapter 1, brown eyes in Chapter 3") and resolve them systematically.

### **Features**
- Automatic contradiction detection after extraction
- Contradiction display in UI with side-by-side values
- Contradiction resolution workflow (fix profile, fix text, intentional, ignore)
- Branch-aware contradictions (separate contradictions per branch)

### **Detailed Implementation Tasks**

#### **Database Schema**
- [ ] Create `knowledge_contradictions` table with correct schema:
  ```sql
  CREATE TABLE knowledge_contradictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES knowledge_entities(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    branch_id UUID REFERENCES knowledge_branches(id),  -- NULL = Main, NOT NULL = Branch
    attribute_name TEXT NOT NULL,                      -- e.g., "eye_color"
    value_a TEXT NOT NULL,                             -- e.g., "blue"
    value_b TEXT NOT NULL,                             -- e.g., "green"
    confidence_a FLOAT,
    confidence_b FLOAT,
    contradiction_type TEXT DEFAULT 'attribute_conflict',
    status TEXT DEFAULT 'open',
    description TEXT,
    resolution_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );
  ```
- [ ] Create indexes for common queries
- [ ] Add RLS policies for knowledge layer contradictions
- [ ] Migrate legacy contradictions if needed (Option A: full migration, Option B: compatibility layer)

#### **Contradiction Detection Logic**
- [ ] Rewrite `detectContradictions()` to query `knowledge_entities` instead of `entities`
- [ ] Rewrite `detectContradictionsForEntity()` to extract attributes from JSONB columns:
  - Query `attributes` JSONB
  - Query `structured_fields` JSONB
  - Combine and compare values
- [ ] Store contradictions with inline attribute values (no foreign keys to `entity_attributes`)
- [ ] Support branch-specific contradictions

#### **Edge Function Integration**
- [ ] Add contradiction detection call at end of `extract-knowledge` Edge Function
- [ ] Ensure failures don't rollback entity extraction
- [ ] Add telemetry for contradiction detection

#### **Frontend Store**
- [ ] Update `contradictionStore.ts` to query `knowledge_contradictions`
- [ ] Add joins to `knowledge_entities` for entity metadata
- [ ] Support branch filtering
- [ ] Add loading states and error handling

#### **UI Components**
- [ ] Verify `ContradictionCard.tsx` displays correctly with new schema
- [ ] Add "Contradictions" tab to `KnowledgeHubPage.tsx`
- [ ] Add navigation link in sidebar/header
- [ ] Add "Check for Contradictions" button (manual trigger)
- [ ] Add detection progress indicator

### **Dependencies**
- [ ] Complete v1.4 (Architecture Cleanup) - **REQUIRED**
- [ ] Knowledge layer extraction working correctly
- [ ] No legacy `entity_attributes` dependencies

### **Acceptance Criteria**
- [ ] Contradiction detection runs after extraction
- [ ] Contradictions are stored with branch context
- [ ] UI displays contradictions with entity name and attribute values
- [ ] Users can resolve contradictions via UI
- [ ] Branch contradictions are isolated from Main contradictions

### **Testing Requirements**
- [ ] Test contradiction detection on known conflicting data
- [ ] Test branch isolation (different contradictions per branch)
- [ ] Test resolution workflow (all 4 resolution statuses)
- [ ] Test edge cases (single value, no conflicts, etc.)
- [ ] Test RLS security (users can only see their contradictions)

### **Definition of Done**
- [ ] Contradiction detection working end-to-end
- [ ] UI displays contradictions correctly
- [ ] Resolution workflow functional
- [ ] Branch isolation verified
- [ ] Tests passing

### **Priority**
🟡 **Medium** - Depends on v1.4 completion

### **Status**
**Blocked** - Blocked by v1.4 (Architecture Cleanup)

---

## **Version 1.6 — Timeline**

### **Version Goal**
Enable users to create, edit, and organize timeline events with relative or absolute time labels.

### **User Value**
Users can build a chronology of events in their story, track when things happen relative to other events, and visualize the story timeline.

### **Features**
- Event creation modal (name, description, time, participants, location)
- Event editing and deletion
- Drag-and-drop event reordering
- Timeline visualization (vertical or horizontal)
- Time label support (e.g., "Chapter 3", "Day 5", "Absolute date")

### **Detailed Implementation Tasks**

#### **Database Schema**
- [ ] Verify `knowledge_events` table has all required columns
- [ ] Add time label support: `attributes.time_label TEXT`
- [ ] Add time range support: `attributes.time_start TIMESTAMPTZ`, `attributes.time_end TIMESTAMPTZ`
- [ ] Add location support: `attributes.location TEXT`
- [ ] Add index on `time_start` for chronological sorting

#### **Event Service**
- [ ] Verify `eventService.ts` supports all event operations
- [ ] Add `getTimelineEventsSorted()` for chronological ordering
- [ ] Add `createBranchEvent()` for event creation
- [ ] Add `updateBranchEvent()` for event editing
- [ ] Add `deleteBranchEvent()` for event deletion

#### **Event Creation UI**
- [ ] Create `EventCreationModal.tsx` with:
  - Event name (required)
  - Description (optional)
  - Time label input (e.g., "Chapter 3", "Day 5", or date picker)
  - Participant multi-select (from existing entities)
  - Location input (free text or select from locations)
  - Save button

#### **Timeline UI**
- [ ] Enhance `TimelineHub.tsx` to:
  - Display events in chronological order
  - Show time labels (relative or absolute)
  - Show event name and description
  - Show location if present
  - Show branch indicator for branch events
  - Add "Add Event" button
  - Add click-to-edit for event details
  - Add drag handle for reordering
  - Add delete button

#### **Drag-and-Drop**
- [ ] Implement drag handle UI
- [ ] Add reordering logic (update `time_start` or sort order)
- [ ] Add visual feedback during drag
- [ ] Save changes to database

### **Dependencies**
- [ ] Complete v1.5 (Contradiction Detection) - **RECOMMENDED**
- [ ] Knowledge entities exist (for participant selection)
- [ ] Knowledge locations exist (for location selection)

### **Acceptance Criteria**
- [ ] Users can create new events
- [ ] Users can edit event details
- [ ] Users can delete events
- [ ] Events appear in chronological order
- [ ] Users can reorder events via drag-and-drop
- [ ] Time labels display correctly (relative and absolute)

### **Testing Requirements**
- [ ] Test event creation with all fields
- [ ] Test event editing
- [ ] Test event deletion
- [ ] Test chronological ordering
- [ ] Test drag-and-drop reordering
- [ ] Test time label display (relative and absolute)

### **Definition of Done**
- [ ] Event CRUD operations working
- [ ] Timeline visualization functional
- [ ] Drag-and-drop reordering working
- [ ] Time labels display correctly
- [ ] Tests passing

### **Priority**
🟡 **Medium** - Nice to have before v2.0

### **Status**
**Pending**

---

## **Version 1.7 — Branch UX & Empty States**

### **Version Goal**
Improve user experience for branch management and provide helpful guidance for empty states.

### **User Value**
Users understand how to use branches correctly and aren't confused by blank panels or missing instructions.

### **Features**
- Clear branch activation prompt before extraction
- Empty state guidance for knowledge panels
- Help text for Main/Branch concept
- Better error messages

### **Detailed Implementation Tasks**

#### **Branch Activation UX**
- [ ] Add check in `DocumentUploader.tsx` before extraction
- [ ] Show modal if no active branch: "No active branch found. Create one now?"
- [ ] Add "Create & Extract" button (auto-creates branch + starts extraction)
- [ ] Add "Learn about Main/Branch" link (to documentation)
- [ ] Add "Activate Branch" button (shows branch selector)

#### **Empty State Guidance**
- [ ] Add "Get Started" state in `KnowledgeOverview.tsx`:
  - Upload document button
  - "Extract Knowledge" CTA
  - Tutorial tooltip for Main/Branch concept
- [ ] Add empty state messages for each knowledge panel:
  - Characters: "No characters extracted yet. Upload a document to start."
  - Locations: "No locations extracted yet. Upload a document to start."
  - Timeline: "No events extracted yet. Upload a document to start."
- [ ] Add helpful icon for empty states
- [ ] Add call-to-action for first extraction

#### **Help & Documentation**
- [ ] Add "What is a branch?" tooltip
- [ ] Add "Main vs Branch" comparison diagram
- [ ] Add tutorial walkthrough for first-time users
- [ ] Add FAQ section in UI

### **Dependencies**
- [ ] Complete v1.6 (Timeline) - **RECOMMENDED**
- [ ] Branch extraction working correctly

### **Acceptance Criteria**
- [ ] Users can't extract without active branch (clear error message or auto-create)
- [ ] Empty states show helpful messages
- [ ] Users understand Main/Branch concept
- [ ] First-time users can complete workflow in <5 minutes

### **Testing Requirements**
- [ ] Test extraction with no active branch
- [ ] Test auto-branch creation
- [ ] Test empty state messages
- [ ] Test first-time user flow

### **Definition of Done**
- [ ] Branch activation UX improved
- [ ] Empty states are helpful
- [ ] Tutorial walkthrough complete
- [ ] Tests passing

### **Priority**
🟢 **Low** - UX polish, nice to have before v2.0

### **Status**
**Pending**

---

## **Version 1.8 — Family Ties**

### **Version Goal**
Enable users to manage entity relationships (family ties, social connections, ownership) with visual graph view.

### **User Value**
Users can visualize complex relationships between characters, track family trees, and understand character connections at a glance.

### **Features**
- Relationship creation (source entity → relationship type → target entity)
- Relationship editing and deletion
- Visual relationship graph (nodes = entities, edges = relationships)
- Relationship type taxonomy (owns, uses, knows, parent_of, spouse_of, etc.)
- Branch-aware relationships (proposals vs approved)

### **Detailed Implementation Tasks**

#### **Database Schema**
- [ ] Verify `knowledge_entity_relationships` has all required columns
- [ ] Add `operation` column for remove proposals
- [ ] Add `review_status` column for pending/approved/rejected
- [ ] Add `base_exists` column to track if relationship existed in Main
- [ ] Add indexes for relationship queries

#### **Relationship Service**
- [ ] Verify `relationshipService.ts` supports all operations
- [ ] Add `createBranchRelationship()` for relationship proposals
- [ ] Add `removeBranchRelationship()` for relationship removal proposals
- [ ] Add `reviewBranchRelationship()` for approval/rejection
- [ ] Add `getEffectiveRelationships()` for Main + Branch merge

#### **Relationship UI Components**
- [ ] Add "Relationships" tab to `CharacterDetailModal.tsx`
- [ ] Create `RelationshipList.tsx` showing entity's relationships
- [ ] Create `RelationshipCreationModal.tsx` for new relationships
- [ ] Create `RelationshipGraph.tsx` for visual graph view

#### **Graph Visualization**
- [ ] Choose library: D3.js or vis.js
- [ ] Render nodes (entities) with type-based colors
- [ ] Render edges (relationships) with type-based styling
- [ ] Add hover tooltips with relationship details
- [ ] Add click-to-edit for relationships
- [ ] Add zoom/pan for large graphs

#### **Relationship Type System**
- [ ] Create `relationship_types` table with predefined types
- [ ] Add UI dropdown for relationship type selection
- [ ] Add autocomplete for entity names in creation form
- [ ] Add validation for relationship types

### **Dependencies**
- [ ] Complete v1.7 (Branch UX & Empty States) - **RECOMMENDED**
- [ ] Knowledge entities exist (for relationship creation)
- [ ] Branch relationships working correctly

### **Acceptance Criteria**
- [ ] Users can create relationships between entities
- [ ] Users can edit and delete relationships
- [ ] Visual graph shows relationships clearly
- [ ] Relationship type system is functional
- [ ] Branch relationships are isolated from Main

### **Testing Requirements**
- [ ] Test relationship creation
- [ ] Test relationship editing/deletion
- [ ] Test visual graph rendering
- [ ] Test relationship type selection
- [ ] Test branch relationship isolation

### **Definition of Done**
- [ ] Relationship CRUD operations working
- [ ] Visual graph functional
- [ ] Relationship type system complete
- [ ] Branch isolation verified
- [ ] Tests passing

### **Priority**
🟢 **Low** - Nice to have before v2.0

### **Status**
**Pending**

---

## **Version 1.9 — Knowledge/UX Refinement**

### **Version Goal**
Polish the knowledge management experience, fix remaining bugs, and prepare for v2.0 release.

### **User Value**
Smoother user experience, fewer bugs, better documentation, and a solid foundation for v2.0 features.

### **Features**
- UI/UX polish across all knowledge panels
- Performance optimizations
- Bug fixes
- Documentation improvements
- Accessibility improvements

### **Detailed Implementation Tasks**

#### **UI/UX Polish**
- [ ] Review all knowledge panels for consistency
- [ ] Standardize button placement and styling
- [ ] Improve form validation and error messages
- [ ] Add keyboard shortcuts where appropriate
- [ ] Improve mobile responsiveness

#### **Performance**
- [ ] Optimize entity loading (lazy loading, pagination)
- [ ] Optimize graph rendering (virtualization for large graphs)
- [ ] Optimize query performance (add indexes, denormalize if needed)
- [ ] Add loading skeletons for better perceived performance

#### **Bug Fixes**
- [ ] Fix all known bugs in v1.8
- [ ] Fix edge cases in extraction
- [ ] Fix RLS security issues
- [ ] Fix date/time handling
- [ ] Fix translation issues (Hebrew/English)

#### **Documentation**
- [ ] Update user documentation
- [ ] Add in-app tooltips
- [ ] Add video tutorials
- [ ] Add FAQ section
- [ ] Add troubleshooting guide

#### **Accessibility**
- [ ] Run accessibility audit (axe, WAVE)
- [ ] Fix keyboard navigation issues
- [ ] Fix screen reader issues
- [ ] Add ARIA labels where needed
- [ ] Ensure color contrast meets WCAG AA

### **Dependencies**
- [ ] Complete v1.8 (Family Ties) - **RECOMMENDED**
- [ ] All v1.x features functional

### **Acceptance Criteria**
- [ ] All known bugs fixed
- [ ] Performance targets met (load times < 2s, etc.)
- [ ] Accessibility audit passes
- [ ] Documentation complete

### **Testing Requirements**
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile testing (iOS Safari, Android Chrome)
- [ ] Accessibility testing (screen readers, keyboard navigation)
- [ ] Performance testing (load times, query performance)

### **Definition of Done**
- [ ] All known bugs fixed
- [ ] Accessibility audit passed
- [ ] Documentation complete
- [ ] Performance targets met

### **Priority**
🟢 **Low** - Polish and preparation for v2.0

### **Status**
**Pending**

---

## **Version 2.0 — Integrated Fantasy Knowledge Platform**

### **Version Goal**
Deliver a complete, integrated fantasy knowledge platform where users can manage characters, locations, timelines, and relationships with confidence in data consistency.

### **User Value**
Users can build complex fantasy worlds with confidence, knowing that their data is consistent, well-organized, and easy to manage. Contradictions are caught early, timelines are clear, and relationships are visualized.

### **Features**
- Full contradiction detection and resolution
- Timeline with events and relative time labels
- Visual relationship graph (family ties, social connections)
- Branch workflow for collaborative writing
- Knowledge overview with all entities in one place
- Export and backup capabilities

### **Detailed Implementation Tasks**

#### **Contradiction Detection MVP**
- [ ] Complete v1.5 (Contradiction Detection)
- [ ] Test on real user data
- [ ] Gather user feedback
- [ ] Iterate on detection logic

#### **Timeline**
- [ ] Complete v1.6 (Timeline)
- [ ] Test on real user data
- [ ] Gather user feedback
- [ ] Iterate on timeline display

#### **Relationship Graph**
- [ ] Complete v1.8 (Family Ties)
- [ ] Test on real user data
- [ ] Gather user feedback
- [ ] Iterate on graph visualization

#### **Integration**
- [ ] Ensure all features work together
- [ ] Test data flow between features
- [ ] Test Branch isolation across all features
- [ ] Test conflict resolution across features

#### **Documentation**
- [ ] Create getting started guide
- [ ] Create feature documentation
- [ ] Create video tutorials
- [ ] Create troubleshooting guide

### **Dependencies**
- [ ] Complete v1.9 (Knowledge/UX Refinement)
- [ ] All v1.x features functional
- [ ] User testing complete

### **Acceptance Criteria**
- [ ] Contradiction detection working end-to-end
- [ ] Timeline with events functional
- [ ] Relationship graph functional
- [ ] Branch workflow smooth
- [ ] All features integrated and tested
- [ ] Documentation complete

### **Testing Requirements**
- [ ] End-to-end testing of all features
- [ ] User acceptance testing
- [ ] Performance testing
- [ ] Security testing
- [ ] Accessibility testing

### **Definition of Done**
- [ ] All v2.0 features complete
- [ ] Documentation complete
- [ ] User acceptance testing passed
- [ ] No critical bugs
- [ ] Production ready

### **Priority**
✅ **Critical** - Core release goal

### **Status**
**In Progress** - v2.0 roadmap active

---

## **Version 2.1+ — Future / Deferred Features**

### **Future Scope**
These features are identified but not scheduled for v2.0. They may move to earlier versions if priorities change.

#### **Magic System**
- Magic type taxonomy (spells, rituals, artifacts)
- Magic properties (power level, cooldown, cost, requirements)
- Magic-user relationships (who can cast what)
- Magic visualization (schools of magic, spell trees)

#### **Advanced AI Integration**
- Direct AI integration for image generation
- AI-assisted writing suggestions
- AI-powered consistency checking
- AI-powered summarization

#### **Collaborative Features**
- Shared project access
- Real-time collaboration
- Comment threads on entities
- Version history with diff

#### **Export & Backup**
- Export knowledge as JSON
- Export timeline as CSV
- Export relationships as graph data
- One-click backup

#### **Mobile Optimization**
- Mobile-first redesign
- Offline support
- Push notifications
- Native mobile app (iOS/Android)

#### **Premium Features**
- Advanced timeline with drag-and-drop events
- Advanced relationship graph with filtering
- AI-powered character portrait generation
- AI-powered location image generation
- Multi-user collaboration

### **Additional Future Capability Systems**

The following systems are Wishlist items only. They are **not part of the current implementation phase or current release scope**. They must be designed as consumers of the Knowledge Layer that is being established in the current roadmap: canonical entities, structured fields, relationships, Timeline Events, provenance/evidence, Main/Branch overlays, and the Effective Branch View. New systems must not introduce parallel legacy entity models. Any generated or inferred change to story knowledge should remain reviewable and Branch-scoped until explicitly promoted to Main.

#### **1. Narrative Consistency Engine**

Build a structured model of the story from canonical entities, events, relationships, timeline data, extracted facts, mentions, and their provenance. The engine should evaluate the Effective Branch View rather than raw records so that checks respect the user's active Main/Branch context.

Planned diagnostic categories include:
- Plot holes and missing causal steps
- Deus Ex Machina
- Forced coincidence
- Inconsistent character behavior or traits
- Unmotivated actions
- Continuity and timeline problems
- Contradictory facts or information
- Setups without payoffs
- Broken or unsupported causality

The engine should distinguish between a confirmed inconsistency and a possible narrative risk, preserve the source evidence for every finding, and create reviewable suggestions rather than modifying Main automatically.

#### **2. Evidence-Based Diagnostics**

Add a diagnostic model shared by the Narrative Consistency Engine and future analysis tools. Every finding should include:
- The events, entities, relationships, and extracted facts on which it is based
- Source references such as document, version, chunk, page, quote, or mention
- Severity and an explicit certainty state, such as `confirmed` or `possible`
- A clear explanation written for the author
- A link to an in-product knowledge page explaining the concept, its meaning, examples, and possible repair strategies
- Review status, resolution notes, and Branch context

The system should prefer evidence-backed explanations, require multiple supporting signals where appropriate, expose why a warning was raised, and avoid presenting ambiguous interpretation as a definite error. User dismissals and intentional choices should be recorded so repeated false positives can be reduced over time.

#### **3. Story Knowledge Graph**

Create a temporal and state-aware graph over the structured story model. The graph should allow the system to follow, over time:
- Character state and knowledge
- Object ownership, location, condition, and transfer
- Location occupancy, boundaries, and changes
- Abilities, activation conditions, costs, limitations, and users
- Knowledge held by characters or groups
- Effective entity relationships
- Events, participants, locations, prerequisites, and consequences

The graph is intended to support continuity and causality checks, not replace the existing entity model. It should use canonical entity UUIDs, Timeline Events, relationship provenance, and temporal fields. Main and Branch graphs must remain isolated and provide an Effective Graph View consistent with the Effective Timeline and Effective Branch View. Derived state must be traceable back to source evidence and should be proposed for review when it conflicts with Main.

#### **4. Visual Worldbuilding System**

Allow fantasy-book users to independently create and manage a visual map of their world. The system should support manual creation and editing of:
- Places and nested place hierarchy
- Regions and boundaries
- Routes, paths, and travel connections
- Other geographic entities and map annotations

Maps should link to the existing location entities and preserve the hierarchy of places used by the Knowledge Layer. Users should be able to work with a Main map and Branch-specific map proposals, compare changes, and promote approved changes without duplicating location records. Future extraction or AI assistance may suggest locations and connections, but users must be able to build and maintain the map independently. Map elements should support provenance and links to relevant events, characters, and chapters.

#### **5. Character Image Generation**

Generate character profile images from the character's structured appearance fields, description, user-defined information, and optional reference images. The feature should use the canonical character entity as its source and preserve the inputs and provenance of every generated asset.

Visual consistency should be supported across works in the same series or shared story world through a reusable visual identity profile containing approved references, stable attributes, style preferences, and generation metadata. User edits and approved images should be reviewable, and an image generated from Branch-only character changes must not silently replace the Main profile. The system should clearly distinguish generated interpretation from facts established in the manuscript.

#### **6. Story Event Gallery**

Create a visual folder/gallery for important story material, including characters, locations, and major events or scenes. Users should be able to illustrate key moments from the book and organize assets by:
- Entity
- Chapter or source document location
- Timeline Event
- User-defined folders and collections

Gallery items should link back to the relevant canonical entities, Timeline Events, chapters, and evidence. The gallery should support Main/Branch scope, asset provenance, captions, review status, and references to the prompts or source descriptions used to create an image. It should remain useful as a user-managed visualization workspace even when no AI image generation is available.

### **Deferred Features**
These features are identified but explicitly deferred to post-v2.0:

- [ ] Magic system implementation
- [ ] Advanced AI integration
- [ ] Collaborative features
- [ ] Export and backup
- [ ] Mobile optimization
- [ ] Premium features

### **Feature Candidates (May Move Between Versions)**
- [ ] Advanced timeline with drag-and-drop events
- [ ] Advanced relationship graph with filtering
- [ ] AI-powered character portrait generation
- [ ] AI-powered location image generation

### **Priority**
🟢 **Low** - Future scope

### **Status**
**Planned** - Not yet scheduled

---

## **Appendix: Architecture Summary**

### **Known Architecture Issues**

| Issue | Impact | Resolution Status |
|-------|--------|-------------------|
| Dual entity/attribute systems | Blocks Contradiction Detection | **Fixed in v1.4** |
| Legacy tables still in use | Blocks Contradiction Detection | **Fixed in v1.4** |
| Missing `branch_id` on contradictions | Blocks Branch isolation | **Fixed in v1.5** |
| Legacy `entity_attributes` table | Blocks Contradiction Detection | **Fixed in v1.4** |

### **Schema Migration Strategy**

| Legacy Table | Knowledge Layer Table | Migration Required? | Action |
|--------------|----------------------|---------------------|--------|
| `entities` | `knowledge_entities` | YES | Create migration or deprecate |
| `entity_attributes` | N/A (use JSONB) | YES | Migrate to `attributes`/`structured_fields` JSONB |
| `entity_mentions` | `knowledge_entity_mentions` | YES | Use knowledge layer table |
| `entity_relations` | `knowledge_entity_relationships` | YES | Use knowledge layer table |
| `contradictions` | `knowledge_contradictions` | YES | Create new table, migrate data |
| `profiles_base` | N/A | MAYBE | Evaluate usage, may deprecate |
| `profile_field_sources` | N/A | MAYBE | Evaluate usage, may deprecate |

### **Version Dependencies**

```
v1.3 (Base)
    ↓
v1.4 (Architecture Cleanup) ← REQUIRED BEFORE v1.5
    ↓
v1.5 (Contradiction Detection) ← REQUIRED BEFORE v1.6, v1.8
    ↓
v1.6 (Timeline) ← RECOMMENDED BEFORE v1.8
    ↓
v1.7 (Branch UX & Empty States)
    ↓
v1.8 (Family Ties)
    ↓
v1.9 (Knowledge/UX Refinement)
    ↓
v2.0 (Integrated Fantasy Knowledge Platform)
```

### **Risk Assessment**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Legacy architecture dependencies | High | Complete v1.4 before v1.5 |
| Schema migration issues | High | Test migration thoroughly, have rollback plan |
| Contradiction detection performance | Medium | Optimize queries, add indexes |
| Timeline complexity | Medium | Start simple, iterate |
| Relationship graph rendering | Medium | Use proven library (D3.js or vis.js) |
| Branch workflow confusion | Low | Clear UX guidance in v1.7 |

---

## **Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | August 20, 2026 | Kiro | Initial version with v1.3-v2.0 roadmap |
