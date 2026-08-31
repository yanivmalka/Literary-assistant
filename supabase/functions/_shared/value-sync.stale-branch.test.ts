// LOW-1: a branch-scoped AI `knowledge_entity_values` row for a field the
// current extraction run no longer produces must not stay `active` and shadow
// the Main value in branch-scoped retrieval / QA.
//
// `syncEntityValues` only supersedes a field's prior AI row when the same field
// is written again (`buildValueWritePlan`). These tests cover the reconciliation
// pass that also retires a branch AI row when:
//   1. the field is present -> absent across runs, and
//   2. the field became non-persistable (Issue 14 allow-list),
// while proving it never:
//   3. interferes with the normal "field re-written" supersession,
//   4. supersedes an active user value,
//   5. touches Main (branch_id IS NULL) AI values, and
//   6. leaves the stale value winning in `resolveEffectiveEntityValues`.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { syncEntityValues } from "./value-sync.ts";
import {
  resolveEffectiveEntities,
  resolveEffectiveEntityValues,
} from "./branch-resolution.ts";
import type { KnowledgeEntityValueRecord } from "./branch-resolution.ts";

type Row = Record<string, unknown>;

interface RecordedOp {
  table: string;
  kind: "select" | "insert" | "update";
  filters: Array<{ column: string; type: string; value: unknown }>;
  payload?: Row;
}

/**
 * Fake matching the call chains value-sync.ts issues:
 *   from(t).select(c).eq()...[.is()]        -> { data, error }
 *   from(t).update(p).eq("id", v)           -> { error }
 *   from(t).insert(p).select("id").single() -> { data:{id}, error }
 * Selects match seed rows on the columns value-sync filters by; unknown columns
 * (e.g. raw_extraction_id) are matched in value-sync's own JS. Updates are
 * recorded but do not mutate the seed (assertions inspect recorded ops).
 */
function makeFake(seed: Row[]) {
  const ops: RecordedOp[] = [];
  let insertSeq = 0;

  class QB implements PromiseLike<{ data: unknown; error: null }> {
    op: RecordedOp;
    private isSingle = false;
    constructor(table: string, kind: RecordedOp["kind"], payload?: Row) {
      this.op = { table, kind, filters: [], payload };
      ops.push(this.op);
    }
    select(_cols: string) { return this; }
    single() { this.isSingle = true; return this; }
    eq(column: string, value: unknown) { this.op.filters.push({ column, type: "eq", value }); return this; }
    is(column: string, value: unknown) { this.op.filters.push({ column, type: "is", value }); return this; }
    private resolve(): { data: unknown; error: null } {
      if (this.op.kind === "select") {
        const data = seed.filter((row) =>
          this.op.filters.every((f) => {
            if (["value_status", "entity_id", "field_path", "source_type"].includes(f.column)) {
              return row[f.column] === f.value;
            }
            if (f.column === "branch_id") return (row.branch_id ?? null) === (f.value ?? null);
            return true;
          })
        );
        return { data, error: null };
      }
      if (this.op.kind === "insert") {
        return { data: this.isSingle ? { id: `new-${++insertSeq}` } : null, error: null };
      }
      return { data: null, error: null };
    }
    then<T1, T2>(
      onfulfilled?: ((v: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
    }
  }

  const supabase = {
    from(table: string) {
      return {
        select: (cols: string) => new QB(table, "select").select(cols),
        insert: (payload: Row) => new QB(table, "insert", payload),
        update: (payload: Row) => new QB(table, "update", payload),
      };
    },
  };
  return { supabase, ops };
}

function characterEntity(structured_fields: Row) {
  return {
    canonical_name: "Leah Frost",
    entity_type: "character",
    description: "A smith",
    structured_fields,
    attributes: {},
    evidence: [],
    chunk_positions: [1],
  };
}

const RUN = ["raw-2"]; // current run's only raw_extraction so far

function valueRow(overrides: Row): Row {
  return {
    id: "row-x",
    entity_id: "entity-1",
    branch_id: "branch-9",
    field_path: "hair_color",
    source_type: "ai",
    value_status: "active",
    raw_extraction_id: "raw-OLD",
    ...overrides,
  };
}

function supersedeUpdates(ops: RecordedOp[]) {
  return ops.filter((o) =>
    o.table === "knowledge_entity_values" &&
    o.kind === "update" &&
    o.payload?.value_status === "superseded"
  );
}
function targetIds(ops: RecordedOp[]) {
  return supersedeUpdates(ops).map((o) => o.filters.find((f) => f.column === "id")?.value);
}

// 1. present -> absent -----------------------------------------------------------
Deno.test("LOW-1: a branch AI row for a field the current run no longer extracts is superseded", async () => {
  const { supabase, ops } = makeFake([valueRow({ id: "stale-hair", field_path: "hair_color" })]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    currentRunRawExtractionIds: RUN,
    normalizedEntity: characterEntity({ first_name: "Leah", age: "30" }), // no hair_color
  });

  assertEquals(targetIds(ops), ["stale-hair"]);
});

Deno.test("LOW-1: a branch AI row re-affirmed by an earlier batch of the SAME run is kept", async () => {
  // hair_color row was written earlier this run (raw-1), and this batch does not
  // re-observe it. Run lineage protects it from the cleanup.
  const { supabase, ops } = makeFake([valueRow({ id: "same-run-hair", raw_extraction_id: "raw-1" })]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    currentRunRawExtractionIds: ["raw-1", "raw-2"],
    normalizedEntity: characterEntity({ first_name: "Leah" }),
  });

  assertEquals(supersedeUpdates(ops).length, 0);
});

// 2. field became non-persistable (Issue 14) -----------------------------------
Deno.test("LOW-1: a branch AI row whose field is now dropped by the persistable allow-list is superseded", async () => {
  // `religion_and_beliefs` is a catalog-only extra: the extraction still emits it
  // but `filterToPersistableFields` drops it (it is not in the character
  // allow-list), so it is never written -> its stale branch AI row must be
  // retired rather than left shadowing Main.
  const { supabase, ops } = makeFake([
    valueRow({ id: "stale-rb", field_path: "religion_and_beliefs" }),
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    currentRunRawExtractionIds: RUN,
    normalizedEntity: characterEntity({ first_name: "Leah", religion_and_beliefs: "devout" }),
  });

  assertEquals(targetIds(ops), ["stale-rb"]);
  const inserted = ops
    .filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")
    .map((o) => o.payload!.field_path);
  assertEquals(inserted.includes("religion_and_beliefs"), false);
});

// 3. normal "field re-written" supersession is unchanged ----------------------
Deno.test("LOW-1: a re-written field still supersedes through the normal plan, not the cleanup, and is not touched twice", async () => {
  const { supabase, ops } = makeFake([
    valueRow({ id: "age-old", field_path: "age", raw_extraction_id: "raw-OLD" }),
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    currentRunRawExtractionIds: RUN,
    normalizedEntity: characterEntity({ first_name: "Leah", age: "31" }), // changed value
  });

  // Exactly one supersede of the old age row (from buildValueWritePlan), and a
  // fresh active age row written.
  assertEquals(targetIds(ops), ["age-old"]);
  const ageInserts = ops.filter(
    (o) => o.table === "knowledge_entity_values" && o.kind === "insert" && o.payload!.field_path === "age",
  );
  assertEquals(ageInserts.length, 1);
  assertEquals(ageInserts[0].payload!.value_status, "active");
});

// 4. active user values are never superseded by the cleanup -------------------
Deno.test("LOW-1: an active user value for an un-extracted field is never superseded by the cleanup", async () => {
  const { supabase, ops } = makeFake([
    // A stale-looking AI row AND the user value that owns the same field.
    valueRow({ id: "ai-secrets", field_path: "secrets" }),
    valueRow({ id: "user-secrets", field_path: "secrets", source_type: "user", raw_extraction_id: null }),
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    currentRunRawExtractionIds: RUN,
    normalizedEntity: characterEntity({ first_name: "Leah" }), // no secrets
  });

  // The user row is never a supersede target, and the cleanup skips the AI row
  // for a user-owned field.
  assertEquals(targetIds(ops).includes("user-secrets"), false);
  assertEquals(targetIds(ops).includes("ai-secrets"), false);
});

// 5. Main (branch_id IS NULL) AI values are never affected -------------------
Deno.test("LOW-1: a Main-scoped AI value is never superseded by a Branch extraction's cleanup", async () => {
  const { supabase, ops } = makeFake([
    valueRow({ id: "main-hair", branch_id: null }),
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    currentRunRawExtractionIds: RUN,
    normalizedEntity: characterEntity({ first_name: "Leah" }),
  });

  assertEquals(supersedeUpdates(ops).length, 0);
});

Deno.test("LOW-1: Main-mode extraction (no branchId) runs no stale-value cleanup", async () => {
  const { supabase, ops } = makeFake([valueRow({ id: "some-ai", branch_id: null })]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: null,
    currentRunRawExtractionIds: RUN,
    normalizedEntity: characterEntity({ first_name: "Leah" }),
  });

  assertEquals(supersedeUpdates(ops).length, 0);
});

Deno.test("LOW-1: without run lineage (legacy run) the cleanup is skipped entirely", async () => {
  const { supabase, ops } = makeFake([valueRow({ id: "stale-hair" })]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-2",
    branchId: "branch-9",
    // currentRunRawExtractionIds omitted
    normalizedEntity: characterEntity({ first_name: "Leah" }),
  });

  assertEquals(supersedeUpdates(ops).length, 0);
});

// 6. effective branch retrieval no longer returns the stale value ------------
Deno.test("LOW-1: once the stale branch row is superseded, resolveEffectiveEntityValues returns the Main value", () => {
  const mainEntity = {
    id: "main-david",
    canonical_name: "David",
    entity_type: "character",
    layer: "main" as const,
    branch_id: null,
  };
  const overlay = {
    id: "overlay-1",
    branch_id: "branch-1",
    source_entity_id: "main-david",
    entity_id: "main-david",
    overrides: {},
  };
  const entity = resolveEffectiveEntities([mainEntity], [], [overlay], "branch-1")[0];

  const mainValue: KnowledgeEntityValueRecord = {
    entity_id: "main-david", branch_id: null, field_path: "hair_color",
    value_json: "black", source_type: "ai", value_status: "active",
  };
  const staleBranchValue: KnowledgeEntityValueRecord = {
    entity_id: "main-david", branch_id: "branch-1", field_path: "hair_color",
    value_json: "green", source_type: "ai", value_status: "active",
  };

  // Before the fix: the stale active branch row shadows Main.
  assertEquals(
    resolveEffectiveEntityValues(entity, [mainValue, staleBranchValue]),
    [{ fieldPath: "hair_color", value: "green", sourceType: "ai" }],
  );

  // After the cleanup supersedes it: Main wins again.
  assertEquals(
    resolveEffectiveEntityValues(entity, [mainValue, { ...staleBranchValue, value_status: "superseded" }]),
    [{ fieldPath: "hair_color", value: "black", sourceType: "ai" }],
  );
});
