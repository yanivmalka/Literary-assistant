# Deployment Checklist - Knowledge Extraction Architecture

**Date:** August 21, 2026
**Status:** Conditional — offline checks pass; real Gemini/Supabase verification is still pending

Offline validation does not establish production readiness. Complete the controlled extraction verification and confirm the required migrations are deployed before production approval.

---

## Pre-Deployment Verification

### Database Migrations
Apply the migrations required by the active extraction handler in numeric order. The active handler uses the provenance, model-profile, run-lineage, branch-profile, branch-persistence, and graph/timeline schema changes from migrations 112 and 115-123. Migrations 113-114 define optional bootstrap-staging and resolution-suggestion infrastructure; those modules are not invoked by the current handler and must not be described as active extraction behavior.

- [ ] Migration 112 deployed (`add_mentions_provenance.sql`)
  - [ ] `mentions.chunk_id` added with FK to `document_chunks.id`
  - [ ] `mentions.page_number` added
  - [ ] `mentions.evidence_text` added
  - Verify: `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'mentions' AND column_name = 'chunk_id'`

- [ ] Migration 113 deployed (`bootstrap_staging.sql`) — optional schema support only; the active handler writes directly to Main/Branch and does not call the staging module
  - [ ] If deployed, treat `bootstrap_stages` and `bootstrap_entity_staging` as inactive until an integration change explicitly wires them into the handler
  - Verify: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'bootstrap%'`

- [ ] Migration 114 deployed (`resolution_suggestions.sql`) — supporting schema; suggestion creation is not an acceptance criterion for the active extraction handler
  - [ ] If deployed, verify the tables and policies independently
  - Verify: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%suggestions%'`

- [ ] Migration 115 deployed (`extraction_model_profiles.sql`)
  - [ ] `raw_extractions.model_profile` exists

- [ ] Migration 116 deployed (`extraction_run_lineage.sql`)
  - [ ] `raw_extractions.extraction_run_id` exists
  - [ ] `idx_raw_extractions_extraction_run` exists

- [ ] Migration 117 deployed (`rename_extraction_model_profiles.sql`)
  - [ ] `raw_extractions.model_profile` accepts `current` and `development`

- [ ] Migration 118 deployed (`profile_scoped_branches.sql`)
  - [ ] `knowledge_branches.profile` exists

- [ ] Migration 119 deployed (`extraction_promotions.sql`)
  - [ ] Promotion tables and validation triggers exist

- [ ] Migration 120 deployed (`reconcile_extraction_metadata.sql`)
  - [ ] Recovery migration applied to environments that may have run the function before migrations 115-117
  - Verify:
    ```sql
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_extractions'
      AND column_name IN ('extraction_run_id', 'model_profile');
    ```
    Expected: both columns are returned.

- [ ] Migration 121 deployed (`set_current_model_profile_default.sql`)
  - [ ] New raw extraction rows default to `model_profile = 'current'`

- [ ] Migration 122 deployed (`reconcile_branch_entity_persistence.sql`)
  - [ ] Branch entity rows and `knowledge_branch_entities.entity_id` satisfy the current Branch persistence contract

- [ ] Migration 123 deployed (`extraction_graph_provenance.sql`)
  - [ ] Relationship/event metadata and event mention provenance columns exist

- [ ] `supabase/functions/_shared/extraction-state.ts` reviewed as supporting code only
  - [ ] Do not claim active handler integration unless an E2E test proves it

- [ ] `supabase/functions/_shared/bootstrap-staging.ts` reviewed as inactive in the current handler
  - [ ] `initializeBootstrapStage()`, `stageEntity()`, and `promoteBootstrapToMain()` are not called by `extract-knowledge/index.ts`

- [ ] `supabase/functions/_shared/resolution-suggestions.ts` reviewed as supporting code only
  - [ ] Suggestion persistence requires a separate integration test before being listed as production behavior

- [ ] `supabase/functions/_shared/value-sync.ts` updated
  - [ ] calculateFieldConfidence() uses 6-signal model
  - [ ] Confidence range [0.1, 0.95]
  - [ ] AUTO_CONSOLIDATE_THRESHOLD = 100
  - [ ] SUGGEST_CONSOLIDATION_THRESHOLD = 70

- [ ] `supabase/functions/_shared/rules/prompt.ts` updated
  - [ ] AI prompt includes field_evidence requirement
  - [ ] Prompt documentation updated
  - [ ] Example extraction format includes field_evidence mapping

- [ ] `supabase/functions/extract-knowledge/index.ts` updated
  - [ ] `ExtractRequest` includes `extraction_mode` and `extraction_run_id`
  - [ ] The handler writes bootstrap entities directly to Main and Branch entities to the active Branch
  - [ ] Relationships and events are persisted in the selected layer with the appropriate review status
  - [ ] Consolidation logic checks confidence against the configured thresholds

- [ ] `client/src/stores/documentStore.ts` updated
  - [ ] extraction_mode set once at RUN start
  - [ ] extraction_run_id generated and persisted
  - [ ] extraction_mode passed in every batch request

### Configuration Verification
- [ ] Environment variables set in Supabase functions:
  - [ ] `SUPABASE_URL` configured
  - [ ] `SUPABASE_ANON_KEY` configured
  - [ ] `GEMINI_API_KEY` configured

- [ ] Supabase RLS (Row Level Security) policies reviewed:
  - [ ] `extraction_run_state` accessible to authenticated users
  - [ ] `bootstrap_stages` accessible to authenticated users
  - [ ] `bootstrap_entity_staging` accessible to authenticated users
  - [ ] `entity_resolution_suggestions` accessible to authenticated users

### API Contract Verification
- [ ] Batch extraction request includes:
  ```json
  {
    "extraction_mode": "bootstrap|branch",
    "extraction_run_id": "uuid",
    "document_id": "uuid",
    "batch_number": 1,
    "text": "...",
    "page_start": 1,
    "page_end": 5
  }
  ```

- [ ] Extraction response includes the handler's actual envelope:
  ```json
  {
    "success": true,
    "done": true,
    "next_offset": 100,
    "telemetry": {
      "model": "string",
      "model_profile": "current|development",
      "latency_ms": 0,
      "chunks_sent": 1
    },
    "summary": {
      "entities_saved": 0,
      "relationships_saved": 0,
      "events_saved": 0,
      "raw_extraction_id": "uuid",
      "layer": "main|branch",
      "branch_id": null
    }
  }
  ```
  - [ ] Raw extraction data and normalized entities are verified through the database queries; they are not returned as an `entities`/`suggestions` array by this handler.

---

## Testing Before Production

- [ ] Run Deno contract/normalization tests
  ```bash
  npm run test:verification
  ```
  - [ ] Golden dataset contract and production normalization tests pass
  - [ ] Main/Branch mode contract tests pass

- [ ] Run a real database verification separately (requires Gemini, Supabase access, the applied migrations, and authenticated credentials)
- [ ] Test single-batch extraction (bootstrap mode)
  - [ ] Send `extraction_mode: "bootstrap"` and one stable `extraction_run_id`
  - [ ] Verify entities are created in `knowledge_entities` with `layer='main'` and `branch_id IS NULL`
  - [ ] Verify relationships/events, when extracted, use Main with approved status

- [ ] Test multi-batch extraction (bootstrap mode)
  - [ ] Send the same `extraction_run_id` for every batch
  - [ ] Extract batch 1: Create entity A
  - [ ] Extract batch 2: Reference entity A from batch 1
  - [ ] Verify only one UUID for entity A

- [ ] Test second extraction (branch mode)
  - [ ] Send `extraction_mode: "branch"` with an active `target_branch_id`
  - [ ] Verify new entities use `layer='branch'` and the target Branch ID
  - [ ] Verify Main entities remain unchanged

- [ ] Test failed extraction behavior
  - [ ] Verify the returned error and inspect whether partial writes remain
  - [ ] Do not claim `rollbackBootstrap()` or staging cleanup: the active handler does not invoke bootstrap-staging rollback

### Load Testing
- [ ] Test multi-batch extraction with 10+ batches
  - [ ] Verify cross-batch resolution performance
  - [ ] Check extraction_run_state table query performance
  - [ ] Monitor function execution time (target: < 30s per batch)

- [ ] Test concurrent extractions
  - [ ] Verify extraction_run_id isolation
  - [ ] Verify no cross-run contamination

### Data Quality Testing
- [ ] Extract sample document → verify:
  - [ ] All extracted entities have field_evidence
  - [ ] Confidence scores reflect signal quality
  - [ ] Provenance complete (chunk_id, page_number, evidence_text)
  - [ ] No false merges (only 100% confidence auto-merged)

---

## Monitoring Setup

### Production Metrics Dashboard
- [ ] Create dashboard with key metrics:
  - [ ] False merge rate (target: 0)
  - [ ] Medium-confidence suggestion acceptance rate (target: > 60%)
  - [ ] Cross-batch resolution accuracy (target: > 95%)
  - [ ] Bootstrap success rate (target: > 99%)
  - [ ] Multi-batch completion rate (target: > 90%)
  - [ ] Evidence coverage (target: > 85%)
  - [ ] Provenance completeness (target: 100%)

### Alerting
- [ ] Alert if false merge detected
- [ ] Alert if bootstrap failure occurs
- [ ] Alert if extraction_run_state grows unbounded
- [ ] Alert if entity_resolution_suggestions backlog > 100

### Logging
- [ ] Log all consolidation decisions (with confidence scores)
- [ ] Log all bootstrap stage transitions
- [ ] Log all rollback operations
- [ ] Log cross-batch resolution matches

---

## Documentation Updates

### User-Facing
- [ ] Update user guide: "How to review resolution suggestions"
- [ ] Add FAQ: "Why didn't two similar entities merge?"
  - Explain: Only 100% confidence auto-merge; user can review 70-99 suggestions
- [ ] Add FAQ: "How is confidence calculated?"
  - Document: 6 signals (objectivity, evidence, specificity, contradiction, completeness)

### Developer-Facing
- [ ] Update API documentation
  - [ ] extraction_mode and extraction_run_id parameters
  - [ ] Response format including field_confidence and field_evidence
  - [ ] Suggestion workflow (create → approve/reject)

- [ ] Update architecture documentation
  - [ ] Extraction-level bootstrap mode
  - [ ] Cross-batch resolution flow
  - [ ] Bootstrap staging lifecycle
  - [ ] Confidence scoring algorithm

- [ ] Create runbook: Investigating false merges
  - [ ] Query entity_resolution_suggestions table
  - [ ] Review field_evidence for both entities
  - [ ] Trace consolidation decision logic

- [ ] Create runbook: Investigating false splits
  - [ ] Query extraction_run_state
  - [ ] Verify findPriorBatchEntity() logic
  - [ ] Check entity name normalization

---

## Post-Deployment Validation

### Day 1
- [ ] Monitor extraction error rate (should be < 1%)
- [ ] Monitor database query times (should be < 100ms for most queries)
- [ ] Spot-check extracted entities for quality
- [ ] Verify no bootstrap failures in logs

### Week 1
- [ ] Review all false merge alerts (should be 0)
- [ ] Analyze resolution suggestions acceptance rate
- [ ] Verify evidence coverage > 85%
- [ ] Check provenance completeness = 100%

### Month 1
- [ ] Generate production report with all metrics
- [ ] Verify false merge rate remains 0
- [ ] Assess user acceptance of suggestion workflow
- [ ] Plan optimization if needed (extraction speed, etc.)

---

## Rollback Plan

If critical issues occur:

1. **Immediate (if false merges detected):**
   - [ ] Stop all extractions
   - [ ] Disable auto-consolidation (set AUTO_CONSOLIDATE_THRESHOLD to 101)
   - [ ] Alert team

2. **Investigation:**
   - [ ] Query entity_resolution_suggestions for all approved merges
   - [ ] Audit field_evidence for each merge
   - [ ] Identify pattern in failures

3. **Recovery:**
   - Option A: Revert to previous extraction version
   - Option B: Manually split incorrectly merged entities (if possible)
   - Option C: Re-extract affected documents

4. **Prevention:**
   - [ ] Increase confidence threshold if needed
   - [ ] Add additional validation signals
   - [ ] Expand golden test dataset

---

## Sign-Off Checklist

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Engineer | | | [ ] Approved |
| QA Engineer | | | [ ] Approved |
| Product Owner | | | [ ] Approved |
| DevOps | | | [ ] Approved |

---

## Deployment Schedule

**Recommended:** Deploy during low-traffic period (e.g., early morning UTC)

- [ ] Pre-deployment: Backup database
- [ ] Deploy migrations (112-121, in numeric order)
- [ ] Deploy function updates
- [ ] Deploy client updates
- [ ] Run post-deployment tests
- [ ] Monitor metrics for 1 hour
- [ ] Enable alerting

**Estimated Deployment Time:** 30-45 minutes

---

**Deployment Ready:** Yes ✓  
**Prerequisites Met:** [To be completed before deployment]  
**Approved:** [Signature required]  
**Date:** _______________
