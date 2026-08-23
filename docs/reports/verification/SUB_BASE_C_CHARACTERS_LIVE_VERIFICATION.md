# Sub-base C Characters — Live Verification

**Date:** 2026-08-23
**Status:** PASS for C extraction, persistence, telemetry, quota accounting, and Main/Branch routing. Interactive browser inspection was not executed in the Kiro runtime.

## Scope

This verification intentionally tests only `sub-base-c-characters` / Model A:

- role: `characters`
- profile: `sub-base-c-characters`
- strategy: `parallel-experts`
- no location, event, object, ability, or magic-ability extraction targets
- existing Knowledge Layer and Main/Branch tables; no new `characters` table

Fixture: `tests/fixtures/SUB_BASE_C_CHARACTERS_TEST_DOCUMENT.md`
Runner: `scripts/verification/run_c_characters_live.mjs`
Remote Edge Function: `extract-knowledge`, version 44

## Run identity

| Item | Value |
|---|---|
| Project | `95ab8555-f335-45f2-a160-6a57dd243edf` |
| Document | `3fe8b564-e3d9-4b21-91b7-2261ddb0f5cf` |
| Version | `1a1d6632-bb75-4f16-9fc9-31256e91c4df` |
| Extraction run | `89bc82ff-2bb6-4199-83d1-01f1fe7ab45f` |
| Raw extraction | `81688ae9-8888-4d65-aa2b-f0a6d56c5738` |
| Expert artifact | `8b3c8c2c-6336-4790-9720-def3e778aa42` |

## Acceptance results

| Check | Result | Evidence |
|---|---|---|
| C profile and strategy | PASS | Raw row and response telemetry contain `sub-base-c-characters` and `parallel-experts`. |
| Artifact cardinality | PASS | Exactly one succeeded artifact, role `characters`, window `0:1`. |
| Contract | PASS | `artifact_contract=character-specialist-v1`. |
| Model and fallback telemetry | PASS | Primary and actual model: `gemini-3.5-flash-lite`; fallback chain stored with primary HTTP 200 attempt. No fallback was needed. |
| Token usage | PASS | 1,387 input + 2,812 output = 4,199 total tokens; artifact latency 6,329ms. |
| Raw → artifact → merger | PASS | Raw response contains Mira Stonewell, Dorian Vale, and one `alliance` relationship; parsed artifact and canonical rows match the C-only shape. |
| Canonical entities | PASS | 2 `character` entities and 0 non-character entities. |
| Values and evidence | PASS | 27 `knowledge_entity_values` rows and 27 `knowledge_entity_value_evidence` rows, with extraction lineage. |
| Aliases and mentions | PASS | 1 alias (`Stonewatch`) and 2 canonical mentions were persisted. |
| Relationships | PASS | 1 character relationship, `alliance`, persisted as a graph edge. |
| Main/Branch | PASS | All canonical rows are Main with `branch_id=NULL`; 0 `knowledge_branch_entities` overlays. |
| Future buckets | PASS | No populated `locations`, `events`, `objects`, or `abilities` buckets and no such canonical entities. |

## Quota and failure behavior

The wallet remained at **30 Quills** and ended with **4,199 token remainder**. The ledger recorded:

- `total_tokens=4199`
- `quills_delta=0`
- `balance_after=30`
- idempotency key `extract:89bc82ff-2bb6-4199-83d1-01f1fe7ab45f:0`

This confirms the documented 5,000-token threshold: this run consumed tokens but did not cross the first Quill boundary.

Before the successful run, the runner exposed three schema assumptions and was corrected without rerunning extraction:

1. `documents` has no `content` column; fixture text belongs in `document_chunks`.
2. Active `documents.file_type` accepts `pdf`/`docx`, not `markdown`.
3. Active `document_versions` requires `storage_path` and does not have `user_id`; `document_chunks` also does not have `user_id`.

Four isolated setup projects were created during those failed setup attempts. They have no successful extraction and no Quill consumption. No destructive cleanup was performed.

## UI verification

The persisted C data is compatible with the implemented UI path:

- `getPopulatedCharacterFields()` filters null, empty, and empty-array values, so missing values are not rendered as `Unknown` or blank rows in the dynamic C views.
- Characters Hub supports Main/Effective Branch selection and local search across name, aliases, and populated values.
- Tile and detail views render populated fields only.
- Detail provenance renders source (`AI`/`user`), inferred flag, confidence, inference note, and evidence quote when present.
- Edit modal supports Main/Branch edits, existing catalog fields, and custom `text`/`long_text` fields; alias synchronization uses the existing entity store.
- Objects remain a placeholder. Ability compatibility fallback is disabled for C; `shouldUseAbilityFallback('sub-base-c-characters')` is false.

The live fixture produced explicit observations only (`inferred=false` for the returned field observations) and did not include a user-edited value. Therefore inferred/user precedence is code-path verified, not a live-state observation in this run. A browser-level click-through was not possible in the current runtime because no interactive dev server/browser session was started.

## Overall conclusion

The C extraction pipeline is end-to-end verified for the tested scope: authenticated request, isolated project setup, Gemini invocation, specialist artifact, C merger, canonical Knowledge Layer persistence, values/evidence, relationship persistence, quota idempotency, and Main routing all passed. The result does not claim fallback activation, live user-edit precedence, or interactive browser click-through; those remain follow-up coverage items.
