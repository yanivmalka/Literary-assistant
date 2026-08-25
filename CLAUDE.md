# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A web app for fiction authors (primarily Hebrew, RTL) to upload manuscript documents and get an AI-extracted, structured "knowledge base" of the story: characters, locations, abilities/magic, events, objects, and the relationships/contradictions between them. Users can then query the knowledge base (QA) and review/resolve inconsistencies. There is also a legacy fantasy-map canvas editor (Konva-based) from an earlier product direction — it still exists in `client/src` but is not where active development is focused.

Two of `docs/features/*.md` (Characters/Environment/Magic modules) and `docs/architecture/SYSTEM_ARCHITECTURE.md` describe an early planning stage (map builder MVP) and are **out of date** relative to the current entity-extraction/knowledge system described below — the `server/src/{documents,entities,pipeline,profiles,qa}` code and the `supabase/functions/_shared` extraction engine are the actual current architecture. Prefer reading code over those stale docs.

## Monorepo layout

- `client/` — React 19 + TypeScript + Vite frontend (port 5173)
- `server/` — Express + TypeScript API (port 3001), proxied by Vite at `/api`. Handles document upload, text extraction, chunking, and embeddings — a light, non-AI pipeline.
- `supabase/` — Postgres schema (`migrations/`), Supabase Edge Functions (`functions/`), and the shared AI extraction engine (`functions/_shared/`). This is where the actual LLM-driven entity extraction, contradiction detection, and QA retrieval logic lives.
- `tests/` — Deno tests (golden dataset + regression) that exercise the extraction pipeline against real scenarios.
- `scripts/` — diagnostic and manual verification scripts (`.mjs`/`.py`/`.ps1`), run ad hoc against a real Supabase project, not part of CI.
- `docs/` — architecture notes, feature specs, guides, and audit/migration reports. Mixed currency — see note above.
- `.kiro/steering/` — project rules originally written for the Kiro agent; the durable ones are folded into this file below.

## Commands

```bash
# Install everything (root + client + server)
npm run install:all

# Run frontend + backend together
npm run dev
# Or separately:
npm run dev:client   # Vite dev server, port 5173
npm run dev:server   # Express with tsx watch, port 3001

# Build
npm run build         # client (tsc -b && vite build) then server (tsc)

# Client unit tests (Vitest)
cd client && npx vitest run <path/to/file.test.ts>   # single file
npm run test:entities:offline   # entity-extraction + ability-profile tests, no network
npm run test:entities:models    # live model extraction tests (hits real LLM APIs)
npm run test:entities:all       # offline + models
npm run test:extraction-models  # branching/models/telemetry tests

# Deno tests (extraction golden dataset + regression), require network:
npm run test:golden
npm run test:regression
npm run test:verification       # both of the above
```

There is no lint script configured in this repo (no ESLint config in `client/` or `server/`). Type-check via each package's `build` script (`tsc -b` / `tsc`).

Server-only tests live alongside the Edge Function shared code: `supabase/functions/_shared/*.test.ts` (e.g. `entity-resolution.test.ts`, `shadow-comparison.test.ts`, `character-specialist.test.ts`) — these are Deno tests too.

## Architecture

### Document pipeline (server/, non-AI)

`server/src/pipeline/orchestrator.ts` runs a resumable, idempotent stage sequence per document version: `extraction → chunking → indexing`. It reads/writes `document_versions.status` in Postgres and resumes from wherever a version left off (or from `startFromStage` on explicit retry). This pipeline stops at `indexed` — it does **not** do entity extraction or contradiction detection itself. Those AI-dependent stages (`analyzing` status) are handled separately by Supabase Edge Functions, not the Express server.

- `documents/extractors/` — per-format text extraction (PDF via `pdf-parse`, DOCX via `mammoth`, OCR via `tesseract.js`)
- `documents/chunker.ts` — splits extracted text into chunks, with a configurable merge-small-chunks step
- `documents/embeddings.ts` — generates embeddings for chunks (used later for QA retrieval)
- `documents/structure-detector.ts` — detects document structure prior to chunking

### AI extraction engine (supabase/functions/_shared/)

This is the core domain logic, shared across several Edge Functions (`extract-knowledge`, `detect-contradictions`, `generate-embeddings`, `ask-question`, `process-document`):

- `rules/` — per-entity-type extraction rules and prompt construction (`prompt.ts` builds the LLM instruction from chunk text; `abilities.ts`, `characters.ts`, `locations.ts`, `objects.ts`, `filtering.ts`, `normalization.ts`, `consolidation.ts` define what counts as each entity type and how near-duplicates are merged)
- `entity-resolution.ts` — deduplicates/merges entities extracted across chunks (same character referenced by alias, name variants, etc.)
- `character-specialist.ts`, `parallel-experts.ts` / `parallel-expert-runner.ts` / `parallel-expert-merger.ts` — specialized extraction passes that run per entity type and get merged into one result
- `shadow-comparison.ts` — compares extraction outputs across model/prompt versions without affecting production data (used to evaluate changes safely)
- `value-sync.ts` / `value-write-plan.ts` / `field-provenance.ts` — controls how extracted field values are written into profiles while tracking where each value came from
- `qa-retrieval.ts` — retrieval logic backing the `ask-question` function
- `gemini-client.ts` / `gemini-config.ts` — LLM client used for extraction

Entity extraction flow: chunk text → `buildExtractionPrompt()` → LLM call → JSON entities → normalization rules → entity resolution (dedupe/merge) → stored as `knowledge_entities` / `entities` + `entity_attributes`, with relationships in `entity_relationships`.

### Main vs. Branch model (critical invariant)

AI extraction never writes directly to the confirmed "Main" knowledge state. Every extraction run targets an explicit branch (`target_branch_id`); a `null`/`use_main` branch context is only valid for the initial bootstrap import. New AI-found entities are always created as branch-only records and must be explicitly promoted (see `extraction_promotions` migration and `server/src/profiles/`) before they become part of Main. See `client/src/lib/extractionBranching.ts` and its tests for the exact contract (`validateBranchContext`, `buildExtractionRequest`, `buildBranchEntityRecord`, etc.) — any code that calls the extraction API must go through this contract rather than constructing requests ad hoc.

### Profiles (server/src/profiles/)

A "profile" (`profiles_base` table) is the user-facing, editable record for a confirmed entity (character, environment, etc.), created from an entity via `createProfileFromEntity`. Each field tracks its source: `document_extracted`, `user_defined`, or `user_edited`. **Fields marked `user_edited` must never be silently overwritten by a later AI extraction pass** — this is enforced in the profile service and must be preserved in any code that writes profile fields.

### Extraction model profiles / versioning

There can be multiple "extraction model profiles" (LLM/prompt configurations) over the project's history (see migrations 115–123, 133, 136–140: model profiles, branch-scoped profiles, promotions, strategies, telemetry, shadow comparisons). When asked to change, fix, or update extraction behavior:
- First identify which model profile is actually the current/latest one in use — do not assume based on filename ordering or migration order alone.
- Never modify a historical/archived extraction model profile unless the user explicitly names it.
- If the current profile can't be identified with confidence, stop and ask rather than guessing.

### Supabase schema & migrations

- `supabase/migrations/` is sequentially numbered (currently up to ~142) and must be applied in order — never skip a migration or edit a historical one that's already been applied; write a new migration to fix a past mistake instead.
- Before running an advanced/late migration, verify which earlier migrations have actually been applied in the target database; don't assume a migration ran just because the file exists in the repo.
- Row Level Security (RLS) is the primary authorization mechanism — most tables scope by `auth.uid()` directly or via a join, so server-side code generally doesn't need manual `user_id` checks beyond what RLS already enforces.
- Before dropping/renaming a table, column, enum, constraint, or function, check for dependent code, migrations, RLS policies, and other DB objects, and resolve the dependency before deleting.

### Client (client/src/)

- React 19 + TypeScript + Vite, Zustand for state (no Redux/Context for global state), Tailwind CSS, React Router v7, react-i18next (English + Hebrew, full RTL support).
- Feature areas under `components/`: `entities/`, `contradictions/`, `documents/`, `knowledge/`, `qa/`, `artifacts/` — these correspond to the extraction/knowledge system. `components/editor/` is the legacy map canvas editor.
- `lib/extractionBranching.ts` — the Main/Branch contract described above; `lib/__tests__/entity-extraction/` and `lib/__tests__/extractionBranching.test.ts` etc. are the primary unit test suites for extraction-adjacent client logic.
- Path alias `@/` resolves to `src/`.
- All Supabase queries should go through Zustand store actions, not directly from components.

### Conventions carried over from project steering rules

- **i18n**: every user-visible string uses `t('key')` from react-i18next; keys follow `module.section.key`; `en.json` and `he.json` must be kept in sync — add a new string to both before merging.
- **RTL**: use logical Tailwind properties (`ps-4`, `me-2`, `border-s`, `text-start`/`text-end`) instead of `left`/`right` equivalents; the `dir` attribute switches automatically by language.
- **Dark mode**: any new UI text/element must also look correct in dark mode (contrast, colors, backgrounds, borders, icons, hover/focus/disabled states).
- **File naming**: components PascalCase, stores `camelCaseStore.ts`, pages `PascalCasePage.tsx`, libs/utils camelCase.
- **Soft delete**: `deleted_at` column, `null` = active, timestamp = trashed.
- Don't add `try/catch`, fallback, or suppression around an error just to make output look clean — first find and document the root cause, then propose a fix, then apply it (diagnose and fix are separate steps). Never hide an underlying error.
- When debugging a non-trivial issue, change one thing at a time; don't make several independent changes and then guess which one fixed (or broke) it.
- Automated tests must use isolated test data/fixtures and must never mutate, pollute, or delete data in the user's real database.
