# Literary Assistant - Product Roadmap

**Version**: 1.3 → 2.0+  
**Last Updated**: August 23, 2026
**Current State**: v1.3 (Extraction & Entity Index Complete)

---

## **Product North Star: One Story System**

Literary Assistant is intended to become a complete workspace for authors: a system that understands the book, remembers its established knowledge, helps the author plan and write it, checks it, teaches the author, supports safe experimentation, and makes the story visible.

The product must not become a collection of disconnected writing, planning, Worldbuilding, and analysis features. Every capability should operate on the same central **Story Model** and **Entity System**. The Story Model is the source of truth for canonical story knowledge; features consume it, enrich it through traceable evidence, or propose reviewable changes to it.

### **Unified Story Intelligence Flow**

The end-to-end product flow is:

```text
Manuscript
  → Extraction
  → Entities
  → Relationships
  → Events
  → Timeline
  → Canonical Knowledge
  → Main / Branch
  → Analysis
  → Writing
  → Visualization
  → Publishing
```

This is a connected lifecycle, not a required linear workflow. Authors may begin with planning or writing, import an existing manuscript later, or work non-linearly. Regardless of entry point, new information must resolve into the shared Story Model with provenance, scope, and review status.

### **What the Story Model Owns**

The shared model should represent, at minimum:

- Manuscripts, documents, chapters, scenes, passages, and source mentions
- Characters, locations, objects, abilities, cultures, languages, and other canonical entities
- Relationships, ownership, knowledge, status, and other time-aware connections
- Events, scenes, causes, consequences, participants, locations, and temporal positions
- Plot lines, goals, conflicts, setups, payoffs, and narrative structure
- Evidence, provenance, confidence, certainty, review state, and author decisions
- Main canon, isolated Branch proposals, effective views, diffs, and promotion history
- Writing context, research, visual assets, and publishing metadata linked to the relevant story objects

No future feature should create a parallel entity, relationship, timeline, or canon store when the information belongs in this model.

### **Product Inspiration Without Feature Parity**

The following products are sources of design inspiration, not separate implementation targets. Literary Assistant should adopt their strongest user value while connecting it to the Story Model:

| Product | Strength to learn from | Integrated Literary Assistant interpretation |
|---------|------------------------|----------------------------------------------|
| Sudowrite | AI writing, brainstorming, rewriting, scene generation, Story Bible | Writing assistance grounded in the active canon, character knowledge, timeline, and author-approved constraints |
| Novelcrafter | Codex, structured lore, series support, BYOK | A central Codex/Story Bible backed by canonical entities and provider-independent AI configuration |
| Fictionary | Story Elements, Story Map, structural coaching | Evidence-based narrative analysis that explains both the finding and the underlying craft concept |
| NovelContinuity | Extraction, timelines, cross-references, continuity analysis | A provenance-aware extraction and continuity layer shared by every feature |
| Plottr | Visual planning, scene cards, plotlines, character sheets, series bible | Visual projections of the same scenes, events, plotlines, entities, and relationships—not duplicate planning data |
| Campfire | Deep Worldbuilding, maps, cultures, magic, languages, encyclopedia | A world encyclopedia and visual world model linked to canonical locations, entities, events, and relationships |
| Scrivener | Long-form writing, research, organization, non-linear workflow | A professional manuscript workspace where chapters, research, scenes, and Story Model references remain connected |
| Dabble / NovelPad | Simple writing flow, goals, scenes, organization, cloud workflow | A focused writing experience with goals and scenes that remains synchronized with the shared story knowledge |
| Atticus | Writing, organization, formatting, and publishing workflow | A continuous path from manuscript and structured knowledge to book formatting and publication outputs |

The goal is not to copy competitors feature-by-feature. The goal is to combine their strongest workflows around one model of the book.

### **Core Capability Pillars**

Future capabilities should be delivered as connected layers over the Story Model:

1. **AI Writing Assistant** — brainstorming, rewrite, scene generation, summarization, and contextual suggestions using the effective canon.
2. **Story Bible / Codex** — a living, explainable view of characters, places, lore, events, relationships, and author decisions.
3. **Entity and Relationship Management** — canonical identity, aliases, attributes, mentions, relationships, provenance, and safe merging.
4. **Worldbuilding Encyclopedia** — locations, maps, cultures, magic, languages, objects, abilities, and other world knowledge.
5. **Timeline and Visual Story Planning** — chapters, scenes, events, plotlines, goals, conflicts, dependencies, and visual cards backed by shared records.
6. **Character Management** — character sheets, states, goals, knowledge, abilities, relationships, arcs, and visual identity.
7. **Continuity and Narrative Intelligence** — plot holes, character consistency, causality, setup/payoff, Deus Ex Machina, narrative errors, and timeline risks.
8. **Narrative Education** — contextual explanations, examples, repair strategies, and a knowledge base connected to each diagnostic.
9. **Branches and Impact Analysis** — isolated what-if changes, downstream impact analysis, comparison, review, and explicit promotion to Main.
10. **Visualization** — world maps, character portraits, event/scene illustrations, relationship graphs, and a visual Story Bible.
11. **Publishing Workflow** — formatting, export, editions, and publication preparation without breaking links to the manuscript and Story Model.

### **Non-Negotiable Product Rules**

- The Story Model and Entity System are the shared source of truth; feature-specific views are projections, not separate databases of meaning.
- Every extracted, inferred, generated, or user-authored fact must have scope, provenance, and an appropriate review state.
- Main represents canonical knowledge. AI suggestions and experimental changes remain Branch-scoped or reviewable until explicitly promoted.
- Writing, planning, analysis, visualization, and publishing must be able to link back to the same entities, events, scenes, evidence, and decisions.
- The Effective Branch View is the basis for branch-aware writing and analysis; raw tables must not be interpreted independently when overlays apply.
- Features should be prioritized by the quality of the shared model they strengthen and the number of workflows they unlock, not by isolated feature count.
- The author remains the final authority. The system may extract, suggest, explain, visualize, and identify risk, but must not silently rewrite canon.

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

## **Version 1.3A — Character Extraction Contract and Temporal Character States**

### **Purpose**
Complete and verify the character model for the `sub-base` extraction profile before building contradiction detection, temporal analysis, or deeper AI character analysis. This is a stabilization gate for v1.3, not a separate parallel character database.

All character facts must use the shared Knowledge Layer and preserve source evidence, confidence, extraction lineage, review status, and Main/Branch scope. Profile-specific prompts and extraction rules may evolve independently, but they must write to the same canonical character contract.

### **Dynamic Fields — `sub-base-locations` Only**

The dynamic character-field behavior described below is restricted to the `sub-base-locations` extraction profile. It must not change extraction, normalization, persistence, or UI behavior for `sub-base` or `sub-base-2`.

- Character fields are metadata-driven rather than a form containing every possible field with an empty value.
- The product maintains a catalog of all approved character fields defined for this profile, including personal details, traits, appearance, beliefs, race, and future story-specific fields.
- The user can add fields from that catalog to the project/profile configuration. The selected fields are then included in the Gemini extraction instructions with their exact stable keys.
- Gemini extracts a selected field only when the source text explicitly supports it. Missing or unsupported fields are omitted from the extracted entity instead of being persisted as empty `null` fields.
- The UI displays populated extracted fields and explicitly selected fields; it does not render the entire catalog as “unknown” values.
- The UI must show the remaining catalog entries as available fields that the user can add. Adding a field must preserve its metadata and make it available to future extraction runs.
- Dynamic field values must remain in `structured_fields`, `knowledge_entity_values`, and field-level evidence with the same provenance and review rules as built-in fields.
- The dynamic-field catalog and selected fields are project-scoped and profile-scoped to `sub-base-locations`; they must not leak into `sub-base` or `sub-base-2` prompts, normalized entities, value rows, or forms.

### **Character Identity Rules**

- `first_name` is the only required identity field.
- A character is created as a canonical `character` entity only when a first name is explicitly identified in the source text.
- Unnamed characters are filtered completely for the current phase. They are not persisted as character entities or unnamed-character candidates.
- `last_name` is optional and is extracted into a separate field.
- The displayed title uses first name plus last name when both are available, while the stored fields remain separate.
- `aliases` contains only actual alternate names: shortened names, nicknames, insults, jokes, pseudonyms, or other names used for the character. The ordinary first name is never duplicated as an alias.

### **Baseline Character Fields**

The extraction contract should support these potential fields. A field remains `null` when the source does not provide it; the extractor must not invent factual values.

#### **Identity and personal details**

- `first_name` — required
- `last_name`
- `aliases`
- `age`
- `gender`
- `sexual_orientation`
- `favorite_food`
- `occupation`
- `hobbies`
- `dislikes`
- `religion_and_beliefs`
- `height`

#### **Traits and appearance**

- `personality_traits` — internal character traits
- `appearance_traits` — externally observed qualities, including beauty-related descriptions
- `skin_color`
- `eye_color`
- `eye_shape`
- `hair_color`
- `hair_type`
- `tattoos`
- `jewelry`
- `scars`
- `body_type`

#### **World and status details**

- `race` is extracted whenever the text identifies a non-human race. It is not restricted to stories that contain multiple races; human identity is not required to be stored as a race value unless the text explicitly establishes it as meaningful.
- `status` is not a permanent profile string. Alive/dead state is represented as a temporal event or state transition linked to the relevant narrative position.

### **Relationship Semantics**

Relationships are first-class, time-aware Knowledge Layer records, not comma-separated character attributes. The initial relationship taxonomy is:

- `acquaintance_or_no_significant_bond` — ordinary interaction such as classmates, colleagues, or people who know each other without a meaningful bond
- `friendship` — a deep or highly meaningful friendship, stronger than ordinary acquaintance
- `romantic_relationship` — two partners, including any sexual orientation or gender combination supported by the source
- `hostility` — active enmity, antagonism, or sustained opposition
- `work_relationship` — an employment or professional relationship
- `employer_of`
- `employee_or_worker_of`

Each relationship must preserve source evidence, confidence, temporal validity, review status, and Branch context. Relationship strength and changes over time must be represented without overwriting earlier states.

### **Temporal Character Model**

Character data must support a future Effective Timeline in which the author can move through the story and see the character state at that point. The model must distinguish at least:

- **Alpha state** — the initial story state, containing the characters and known facts from the opening section, initially defined as the first three chapters.
- **Intermediate states** — states reconstructed from extracted events and narrative positions as the story progresses.
- **Omega state** — the final story state after the last word, showing where each character is left at the end of the manuscript.

Moving the timeline must not mutate canonical history. Instead, the system should calculate an effective character snapshot from facts and events valid at the selected narrative position. This includes identity-relevant facts, relationships, alive/dead status, occupation or affiliation changes, appearance changes, and other state transitions supported by evidence.

Required temporal data for a state transition includes:

- affected character
- changed field or relationship
- previous and new state when known
- event or narrative position
- source document, chapter, chunk, page, and quote where available
- confidence and certainty
- Main/Branch scope

### **Manual AI Character Analysis**

Deep character analysis is an on-demand capability. It must not run automatically after every extraction and must not silently modify canonical character facts.

When the user explicitly requests analysis, the system should retrieve relevant character mentions, nearby context, related events, relationships, and source metadata before calling Gemini. The analysis should use a closed-source RAG flow:

```text
Sources → chunks → character mention retrieval → focused context → Gemini analysis → cited result
```

The analysis may produce:

- A general description based on central traits, race where established, and appearance
- A psychological analysis derived from the character's mentions across the plot
- A narrative-role analysis covering function, conflict, motivation, development, and impact on the story

AI analysis is provisional and user-controlled. Every result must include the retrieved sources/citations, confidence or certainty, model metadata, creation time, and review status. The user must be able to accept, edit, reject, or regenerate it. Any user-approved canonical change is written through the normal review and Main/Branch workflow; an AI inference must not become Main automatically.

### **Implementation Tasks**

- [ ] Extend the `CharacterFields` contract and extraction schema with the identity, personal, relationship, appearance, belief, race, and temporal-state fields above.
- [ ] Enforce the required `first_name` rule and filter unnamed characters before canonical persistence.
- [ ] Separate first name, last name, display title, and aliases during normalization and persistence.
- [ ] Define and validate the initial relationship taxonomy, including the distinction between ordinary acquaintance and deep friendship.
- [ ] Model alive/dead status and other character changes as Timeline Events or temporal state transitions.
- [ ] Define Alpha, intermediate, and Omega Effective Character Views over the shared Effective Timeline.
- [ ] Add full provenance and evidence checks for every extracted character field and relationship.
- [ ] Add an explicit, user-triggered character-analysis action using retrieval-focused context and citations.
- [ ] Store AI analyses as reviewable, versioned results that cannot silently overwrite Main facts.
- [ ] Run the full character extraction verification against live Gemini and Supabase, including raw output, normalized fields, value synchronization, provenance, Main routing, Branch isolation, and UI coverage.

### **Acceptance Criteria**

- [ ] No canonical character entity is persisted without a non-empty extracted `first_name`.
- [ ] First name, last name, display title, and aliases are stored and displayed according to the identity rules above.
- [ ] The ordinary first name is absent from the aliases collection.
- [ ] Character facts that are not present in the manuscript remain `null` rather than being inferred as factual values.
- [ ] Non-human race is extracted whenever explicitly identified in the text.
- [ ] Relationships distinguish ordinary acquaintance from deep friendship and support romantic relationships without assuming a particular orientation.
- [ ] Character status changes are represented as time-aware events/state transitions rather than destructive profile updates.
- [ ] Alpha, intermediate, and Omega views return the correct character state for the selected narrative position.
- [ ] Deep AI analysis runs only after an explicit user action, cites retrieved source material, and remains reviewable.
- [ ] The full character extraction verification gate is updated to cover every active field in the baseline contract before this milestone is marked complete.

### **Priority**
**High** — Required to make the character Story Model reliable before temporal analysis and deeper AI features.

### **Status**
**Pending** — Contract and implementation gate to complete after the current extraction verification and before v1.5/v1.6 dependent work.

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

### **Future Prioritization and Task Management**

This section is a planning backlog for post-v2.0 work. It is **not an authorization to implement these features now**. All tasks below remain deferred until the current Knowledge Layer, Main/Branch workflow, Timeline, and v2.0 integration work are stable.

#### **Priority Scale**

| Priority | Meaning | Planning rule |
|----------|---------|---------------|
| **P0 — Critical foundation** | Required to make later analysis reliable | Must be designed before dependent feature work begins |
| **P1 — High** | Core user value that depends on the foundation | Start after all P0 exit criteria pass |
| **P2 — Medium** | Valuable visualization or creation capability | Can proceed in parallel only after its data contracts are stable |
| **P3 — Low** | Enhancement that depends on several mature systems | Start after higher-priority systems are proven with real projects |

#### **Ranked Future Capability Plan**

| Rank | Capability | Priority | Why it matters | Main dependencies | Planned phase | Status |
|------|------------|----------|----------------|------------------|---------------|--------|
| 1 | **Story Knowledge Graph** | **P0 — Critical foundation** | Provides the temporal, state-aware model required for continuity and causality | Knowledge Layer, canonical entity UUIDs, relationships, Timeline Events, provenance, Main/Branch | Phase 1 | Backlog — deferred |
| 2 | **Evidence-Based Diagnostics** | **P0 — Critical foundation** | Makes every future warning explainable, reviewable, and less prone to false positives | Provenance/evidence model, diagnostic schema, Effective Branch View | Phase 1 | Backlog — deferred |
| 3 | **Narrative Consistency Engine** | **P1 — High** | Delivers the primary automated analysis after the graph and diagnostics can support trustworthy findings | Story Knowledge Graph, Evidence-Based Diagnostics, effective timeline, contradiction data | Phase 2 | Backlog — deferred |
| 4 | **Visual Worldbuilding System** | **P2 — Medium** | Gives users an independent visual planning tool while reusing the location hierarchy | Location entities, place hierarchy, relationship model, Branch proposals, asset storage | Phase 3 | Backlog — deferred |
| 5 | **Character Image Generation** | **P2 — Medium** | Adds visual character representation after structured appearance data and asset provenance are stable | Character structured fields, visual identity metadata, reference assets, review workflow | Phase 4 | Backlog — deferred |
| 6 | **Story Event Gallery** | **P3 — Low** | Provides the broadest presentation layer and benefits from all entity, event, image, and evidence links | Canonical entities, Timeline Events, chapters, asset storage, optional image generation | Phase 5 | Backlog — deferred |

#### **Execution Phases and Future Backlog**

**Phase 0 — Readiness and contracts**

| ID | Task | Priority | Depends on | Definition of done | Status |
|----|------|----------|------------|-------------------|--------|
| FUT-001 | Freeze the cross-feature data contracts for canonical entities, structured fields, relationships, Timeline Events, provenance, and Main/Branch scope | P0 | v1.4–v2.0 foundation | Contracts document the source of truth, identifiers, branch behavior, and migration boundaries | Backlog — deferred |
| FUT-002 | Resolve the boundary between an `event` entity and a `Timeline Event`, and define the Effective Timeline contract | P0 | FUT-001 | One documented model explains identity, participants, temporal fields, and Branch behavior | Backlog — deferred |
| FUT-003 | Define shared review, certainty, severity, evidence, and resolution status values | P0 | FUT-001 | All future diagnostics and AI outputs use the same review vocabulary | Backlog — deferred |
| FUT-004 | Define asset storage, provenance, permissions, and versioning for maps, generated images, and gallery items | P1 | FUT-001 | Every visual asset can be traced to its entity/event, inputs, Branch, and approval state | Backlog — deferred |

**Phase 1 — Reliable story model and diagnostics foundation**

| ID | Task | Priority | Depends on | Definition of done | Status |
|----|------|----------|------------|-------------------|--------|
| FUT-101 | Model temporal and state transitions for characters, objects, locations, abilities, knowledge, relationships, and events | P0 | FUT-001, FUT-002 | State changes have timestamps or narrative positions, actors, sources, and affected canonical entities | Backlog — deferred |
| FUT-102 | Build the Main/Branch Effective Graph View with isolated Branch proposals and promotion-safe diffs | P0 | FUT-101 | Main, Branch, and merged views return consistent graph data without writing inferred changes directly to Main | Backlog — deferred |
| FUT-201 | Create the shared evidence-backed diagnostic record and source-reference model | P0 | FUT-003, FUT-101 | Each finding stores supporting facts/events, source references, confidence state, severity, explanation, and Branch context | Backlog — deferred |
| FUT-202 | Add diagnostic review workflow, educational concept pages, dismissals, intentional-choice records, and false-positive feedback | P0 | FUT-201 | Users can inspect why a finding exists, learn the concept, resolve or dismiss it, and preserve the decision | Backlog — deferred |

**Phase 2 — Narrative analysis**

| ID | Task | Priority | Depends on | Definition of done | Status |
|----|------|----------|------------|-------------------|--------|
| FUT-301 | Implement rule families for plot holes, Deus Ex Machina, forced coincidence, inconsistent character, unmotivated action, continuity, contradictions, setup/payoff, and causality | P1 | FUT-102, FUT-201 | Each rule produces evidence-backed findings with confirmed/possible certainty and no direct Main mutation | Backlog — deferred |
| FUT-302 | Add analysis runs, incremental re-checks, explainable results, and Branch-aware comparison | P1 | FUT-301 | Users can run analysis for a project or Branch, compare findings, and trace every result to source data | Backlog — deferred |

**Phase 3 — Visual worldbuilding**

| ID | Task | Priority | Depends on | Definition of done | Status |
|----|------|----------|------------|-------------------|--------|
| FUT-401 | Define map primitives for places, regions, boundaries, routes, annotations, and nested place hierarchy | P2 | FUT-001, FUT-004 | Users can create and edit a map independently and link elements to canonical locations | Backlog — deferred |
| FUT-402 | Add Main map, Branch map proposals, comparison, approval, and links from map elements to events and chapters | P2 | FUT-401, FUT-102 | Map changes are isolated, reviewable, and promotable without duplicating location entities | Backlog — deferred |

**Phase 4 — Character visualization**

| ID | Task | Priority | Depends on | Definition of done | Status |
|----|------|----------|------------|-------------------|--------|
| FUT-501 | Define a visual identity profile from structured appearance fields, user inputs, approved references, and stable style metadata | P2 | FUT-004, character structured fields | A character's approved visual identity is reusable and distinguishable from manuscript facts | Backlog — deferred |
| FUT-502 | Add profile-image generation, review, versioning, and Branch-safe approval | P2 | FUT-501 | Generated images preserve prompts, inputs, provenance, and approval history and cannot silently overwrite Main | Backlog — deferred |

**Phase 5 — Story event gallery**

| ID | Task | Priority | Depends on | Definition of done | Status |
|----|------|----------|------------|-------------------|--------|
| FUT-601 | Build user-managed gallery folders and links to entities, chapters, Timeline Events, and scenes | P3 | FUT-004, Timeline integration | Users can organize visual material by entity, chapter, event, and custom collection | Backlog — deferred |
| FUT-602 | Add captions, evidence links, Branch scope, asset review, filtering, and optional generated-image references | P3 | FUT-601, FUT-202, FUT-502 | Every gallery item is traceable, reviewable, and usable with or without AI generation | Backlog — deferred |

#### **Future Task Management Rules**

- Do not start a task while a required dependency is `Blocked` or incomplete.
- Promote a task from **Backlog — deferred** to **Ready** only after its dependencies and exit criteria are verified.
- Any inferred story fact, graph state, map change, diagnostic resolution, or generated asset must remain Branch-scoped or reviewable until explicitly promoted to Main.
- Track progress by task ID, not by capability name alone; a capability is complete only when all of its tasks and exit criteria are complete.
- Re-evaluate priorities after real-project validation; P2 and P3 items may move only after the P0/P1 reliability criteria are met.

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
