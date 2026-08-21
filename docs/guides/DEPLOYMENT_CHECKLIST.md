# Deployment Checklist - Knowledge Extraction Architecture

**Date:** August 20, 2026  
**Status:** Ready for Production (all prerequisites must be completed)

---

## Pre-Deployment Verification

### Database Migrations
Apply all migrations in `supabase/migrations/` in numeric order. The current extraction function requires migrations 115-121 in addition to the earlier knowledge-extraction migrations.

- [ ] Migration 112 deployed (`add_mentions_provenance.sql`)
  - [ ] `mentions.chunk_id` added with FK to `document_chunks.id`
  - [ ] `mentions.page_number` added
  - [ ] `mentions.evidence_text` added
  - Verify: `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'mentions' AND column_name = 'chunk_id'`

- [ ] Migration 113 deployed (`bootstrap_staging.sql`)
  - [ ] `bootstrap_stages` table created
  - [ ] `bootstrap_entity_staging` table created
  - [ ] Indexes created on `extraction_run_id`, `batch_id`
  - Verify: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'bootstrap%'`

- [ ] Migration 114 deployed (`resolution_suggestions.sql`)
  - [ ] `entity_resolution_suggestions` table created
  - [ ] `entity_resolution_signals` table created
  - [ ] Indexes created on `entity_a_id`, `entity_b_id`, `status`
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

- [ ] `supabase/functions/_shared/extraction-state.ts` deployed
  - [ ] ExtractionRunState interface accessible
  - [ ] findPriorBatchEntity() function available
  - [ ] recordCreatedEntity() function available

- [ ] `supabase/functions/_shared/bootstrap-staging.ts` deployed
  - [ ] initializeBootstrapStage() callable
  - [ ] stageEntity() callable
  - [ ] promoteBootstrapToMain() callable
  - [ ] failBootstrap() and rollbackBootstrap() callable

- [ ] `supabase/functions/_shared/resolution-suggestions.ts` deployed
  - [ ] createResolutionSuggestion() callable
  - [ ] approveSuggestion() and rejectSuggestion() callable

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
  - [ ] ExtractRequest interface includes extraction_mode and extraction_run_id
  - [ ] extraction_mode and extraction_run_id passed to bootstrap functions
  - [ ] Consolidation logic checks confidence >= 100% only

- [ ] `client/src/stores/documentStore.ts` updated
  - [ ] extraction_mode set once at RUN start
  - [ ] extraction_run_id generated and persisted
  - [ ] extraction_mode passed in every batch request

### Configuration Verification
- [ ] Environment variables set in Supabase functions:
  - [ ] `SUPABASE_URL` configured
  - [ ] `SUPABASE_ANON_KEY` configured
  - [ ] `OPENAI_API_KEY` configured (or equivalent AI service)

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

- [ ] Extraction response includes:
  ```json
  {
    "entities": [
      {
        "id": "uuid",
        "type": "character|object|location|ability|event",
        "name": "string",
        "field_evidence": { "first_name": [...], "age": [...] },
        "field_confidence": { "first_name": 0.95, "age": 0.65 },
        "aliases": [],
        "relationships": []
      }
    ],
    "suggestions": [
      {
        "entity_a_id": "uuid",
        "entity_b_id": "uuid",
        "confidence": 0.75,
        "signals": ["name_similarity", "field_overlap"]
      }
    ]
  }
  ```

---

## Testing Before Production

- [ ] Run Deno contract/normalization tests
  ```bash
  npm run test:verification
  ```
  - [ ] Golden dataset contract and production normalization tests pass
  - [ ] Main/Branch mode contract tests pass

- [ ] Run a real database verification separately (requires Supabase access)
- [ ] Test single-batch extraction (bootstrap mode)
  - [ ] Extract document chunk
  - [ ] Verify entities created in main_entities
  - [ ] Verify bootstrap_stage_id set correctly

- [ ] Test multi-batch extraction (bootstrap mode)
  - [ ] Extract batch 1: Create entity A
  - [ ] Extract batch 2: Reference entity A from batch 1
  - [ ] Verify only one UUID for entity A

- [ ] Test second extraction (branch mode)
  - [ ] Extract existing document with branch_mode
  - [ ] Verify new entities created with branch_version_id
  - [ ] Verify Main entities unchanged

- [ ] Test failed extraction and rollback
  - [ ] Extract batch 1: Create entities
  - [ ] Extract batch 2: Corrupt data → extraction fails
  - [ ] Verify rollbackBootstrap() executed
  - [ ] Verify bootstrap_entity_staging cleaned up
  - [ ] Verify Main entities untouched

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
