// Issue 14: `syncEntityValues` must only write field paths that belong to the
// entity type's authoritative catalogue (`rules/extraction.ts`) plus the
// project's active dynamic field keys — internal / relational attributes such as
// `users`, `members`, `purpose`, and `relationship_labels` must never become
// `knowledge_entity_values`. User-over-AI precedence and Main/Branch scoping are
// unchanged: filtering only narrows the AI write set and issues no deletes.

import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  filterToPersistableFields,
  persistableFieldPaths,
  syncEntityValues,
} from "./value-sync.ts";

// --- pure allow-list ---------------------------------------------------------

Deno.test("persistableFieldPaths: character = rules/extraction.ts + CHARACTER_FIELD_KEYS + dynamic + name/description", () => {
  const allowed = persistableFieldPaths("character", ["occupation", "custom_backstory"])!;
  // rules/extraction.ts character catalogue
  assert(allowed.has("age"));
  assert(allowed.has("hair_color"));
  assert(allowed.has("narrative_role"));
  // static Sub-base C keys
  assert(allowed.has("first_name"));
  assert(allowed.has("secrets"));
  // project-dynamic keys
  assert(allowed.has("occupation"));
  assert(allowed.has("custom_backstory"));
  // always
  assert(allowed.has("name"));
  assert(allowed.has("description"));
  // never
  assert(!allowed.has("users"));
  assert(!allowed.has("relationship_labels"));
});

Deno.test("persistableFieldPaths: object/ability catalogues keep their relational-looking but catalogued fields", () => {
  const object = persistableFieldPaths("object")!;
  assert(object.has("owners"));
  assert(object.has("materials"));
  assert(!object.has("users"));

  const ability = persistableFieldPaths("ability")!;
  assert(ability.has("users")); // `users` IS in the ability catalogue
  assert(!ability.has("owners"));

  assertEquals(persistableFieldPaths("magic_ability")!.has("users"), true);
});

Deno.test("persistableFieldPaths: uncatalogued types (organization, event) return null -> caller does not filter", () => {
  assertEquals(persistableFieldPaths("organization"), null);
  assertEquals(persistableFieldPaths("event"), null);
});

Deno.test("filterToPersistableFields: drops relational/internal attributes, keeps catalogued + dynamic + name/description", () => {
  const filtered = filterToPersistableFields(
    {
      first_name: "Leah",
      age: "30",
      occupation: "smith", // dynamic
      name: "Leah Frost",
      description: "A smith",
      users: ["Someone"], // internal
      members: ["A", "B"], // internal
      purpose: "guarding", // internal
      relationship_labels: ["ally"], // internal
      abilities: ["x"], // internal
    },
    "character",
    ["occupation"],
  );
  assertEquals(filtered, {
    first_name: "Leah",
    age: "30",
    occupation: "smith",
    name: "Leah Frost",
    description: "A smith",
  });
});

Deno.test("filterToPersistableFields: uncatalogued type is returned unfiltered (shallow copy)", () => {
  const input = { members: ["A"], purpose: "x", name: "Guild" };
  const out = filterToPersistableFields(input, "organization");
  assertEquals(out, input);
  assert(out !== input); // new object
});

Deno.test("filterToPersistableFields: object owners survives; a stray attribute does not", () => {
  const filtered = filterToPersistableFields(
    { object_type: "sword", owners: ["Leah"], materials: "gold", relationship_labels: ["x"] },
    "object",
  );
  assertEquals(filtered, { object_type: "sword", owners: ["Leah"], materials: "gold" });
});

// --- integration through syncEntityValues (fake Supabase) -------------------

type Row = Record<string, unknown>;

interface RecordedOp {
  table: string;
  kind: "select" | "insert" | "update";
  filters: Array<{ column: string; type: string; value: unknown }>;
  payload?: Row;
}

/**
 * Minimal fake matching exactly the call chains value-sync.ts issues:
 *   from(t).select(c).eq().eq().eq()[.eq()|.is()]            -> { data, error }
 *   from(t).update(p).eq("id", v)                            -> { error }
 *   from(t).insert(p).select("id").single()                  -> { data:{id}, error }
 *   from(t).insert(p)                                        -> { error }
 */
function makeFakeSupabase(seedExistingValues: Row[]) {
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
        const data = seedExistingValues.filter((row) =>
          this.op.filters.every((f) => {
            if (f.column === "value_status") return row.value_status === f.value;
            if (f.column === "entity_id") return row.entity_id === f.value;
            if (f.column === "field_path") return row.field_path === f.value;
            if (f.column === "source_type") return row.source_type === f.value;
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

function characterEntity(overrides: Partial<Row> = {}) {
  return {
    canonical_name: "Leah Frost",
    entity_type: "character",
    description: "A smith",
    structured_fields: { first_name: "Leah", age: "30" },
    attributes: {
      users: ["Ghost"],
      members: ["A", "B"],
      purpose: "guarding",
      relationship_labels: ["ally"],
    },
    evidence: [],
    chunk_positions: [1],
    ...overrides,
  };
}

Deno.test("syncEntityValues: internal attributes never reach knowledge_entity_values; catalogued + dynamic + name/description do", async () => {
  const { supabase, ops } = makeFakeSupabase([]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: null,
    activeDynamicFieldKeys: ["occupation"],
    normalizedEntity: characterEntity({
      structured_fields: { first_name: "Leah", age: "30", occupation: "smith" },
    }),
  });

  const insertedFieldPaths = ops
    .filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")
    .map((o) => o.payload!.field_path);

  assertEquals([...insertedFieldPaths].sort(), ["age", "description", "first_name", "name", "occupation"]);
  for (const banned of ["users", "members", "purpose", "relationship_labels"]) {
    assertEquals(insertedFieldPaths.includes(banned), false);
  }
  // A filtered field is never even queried for existing values.
  const selectedFieldPaths = ops
    .filter((o) => o.table === "knowledge_entity_values" && o.kind === "select")
    .flatMap((o) => o.filters.filter((f) => f.column === "field_path").map((f) => f.value));
  assertEquals(selectedFieldPaths.includes("users"), false);
});

Deno.test("syncEntityValues: an existing user-owned value for a now-filtered field is never queried, updated, or superseded", async () => {
  const { supabase, ops } = makeFakeSupabase([
    { id: "user-users", entity_id: "entity-1", field_path: "users", branch_id: null, source_type: "user", value_status: "active" },
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: null,
    normalizedEntity: characterEntity(),
  });

  // No update/delete touched the user's row (value-sync issues no deletes at all).
  const updates = ops.filter((o) => o.kind === "update");
  assertEquals(updates.length, 0);
  const touchedUsers = ops.some((o) =>
    o.filters.some((f) => f.column === "field_path" && f.value === "users")
  );
  assertEquals(touchedUsers, false);
});

Deno.test("Issue 10 x 14: an object with a string structured_fields.owners and an array attributes.owners persists exactly one owners value (the array)", async () => {
  const { supabase, ops } = makeFakeSupabase([]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "obj-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: null,
    normalizedEntity: {
      canonical_name: "Golden Sword",
      entity_type: "object",
      description: "A blade",
      structured_fields: { object_type: "sword", owners: "Leah Frost" },
      attributes: { owners: ["Leah Frost"], relationship_labels: ["x"] },
      evidence: [],
      chunk_positions: [1],
    },
  });

  const ownersInserts = ops.filter(
    (o) => o.table === "knowledge_entity_values" && o.kind === "insert" && o.payload!.field_path === "owners",
  );
  assertEquals(ownersInserts.length, 1);
  assertEquals(ownersInserts[0].payload!.value_json, ["Leah Frost"]);
  // The stray attribute did not persist.
  const inserted = ops
    .filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")
    .map((o) => o.payload!.field_path);
  assertEquals(inserted.includes("relationship_labels"), false);
});

Deno.test("Issue 10: an object with array structured_fields.owners and array attributes.owners still persists exactly one array owners value", async () => {
  const { supabase, ops } = makeFakeSupabase([]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "obj-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: null,
    normalizedEntity: {
      canonical_name: "Golden Sword",
      entity_type: "object",
      description: "A blade",
      // Post-Issue-10: both representations are the same normalized array.
      structured_fields: { object_type: "sword", owners: ["Leah Frost", "Ada North"] },
      attributes: { owners: ["Leah Frost", "Ada North"], relationship_labels: ["x"] },
      evidence: [],
      chunk_positions: [1],
    },
  });

  const ownersInserts = ops.filter(
    (o) => o.table === "knowledge_entity_values" && o.kind === "insert" && o.payload!.field_path === "owners",
  );
  assertEquals(ownersInserts.length, 1);
  assertEquals(ownersInserts[0].payload!.value_json, ["Leah Frost", "Ada North"]);
});

Deno.test("Issue 2: Branch AI supersede lookups and inserts stay scoped to the current branch", async () => {
  const { supabase, ops } = makeFakeSupabase([]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: "branch-9",
    normalizedEntity: characterEntity(),
  });

  // The existing-value lookup that drives AI supersession is branch-scoped and
  // never widened to Main.
  const supersedeLookups = ops.filter((o) =>
    o.table === "knowledge_entity_values" && o.kind === "select" &&
    !o.filters.some((f) => f.column === "source_type")
  );
  assert(supersedeLookups.length > 0);
  for (const select of supersedeLookups) {
    assertEquals(
      select.filters.some((f) => f.column === "branch_id" && f.type === "eq" && f.value === "branch-9"),
      true,
    );
    assertEquals(select.filters.some((f) => f.column === "branch_id" && f.type === "is"), false);
  }
  // Every AI insert is scoped to the branch too.
  for (const insert of ops.filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")) {
    assertEquals(insert.payload!.branch_id, "branch-9");
  }
});

Deno.test("Issue 2: a Main user value (branch_id IS NULL) is honored during Branch extraction and blocks only that field", async () => {
  const { supabase, ops } = makeFakeSupabase([
    {
      id: "main-user-age",
      entity_id: "entity-1",
      field_path: "age",
      branch_id: null,
      source_type: "user",
      value_status: "active",
    },
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: "branch-9",
    normalizedEntity: characterEntity({
      structured_fields: { first_name: "Leah", age: "30" },
    }),
  });

  // A dedicated Main user-provenance lookup ran for the protected field.
  const mainUserLookup = ops.find((o) =>
    o.table === "knowledge_entity_values" && o.kind === "select" &&
    o.filters.some((f) => f.column === "source_type" && f.value === "user") &&
    o.filters.some((f) => f.column === "branch_id" && f.type === "is") &&
    o.filters.some((f) => f.column === "field_path" && f.value === "age")
  );
  assertExists(mainUserLookup);

  // The Main-user-owned field is not (re)written by the Branch AI extraction...
  const inserted = ops
    .filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")
    .map((o) => o.payload!.field_path);
  assertEquals(inserted.includes("age"), false);
  // ...while the other fields still persist to the branch.
  assertArrayIncludes(inserted, ["first_name", "name", "description"]);
  for (const insert of ops.filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")) {
    assertEquals(insert.payload!.branch_id, "branch-9");
  }
  // The Main row itself is never updated or deleted.
  assertEquals(ops.some((o) => o.kind === "update"), false);
});

Deno.test("Issue 2: branch-local user provenance is still honored (unchanged)", async () => {
  const { supabase, ops } = makeFakeSupabase([
    {
      id: "branch-user-age",
      entity_id: "entity-1",
      field_path: "age",
      branch_id: "branch-9",
      source_type: "user",
      value_status: "active",
    },
  ]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: "branch-9",
    normalizedEntity: characterEntity({
      structured_fields: { first_name: "Leah", age: "30" },
    }),
  });

  const inserted = ops
    .filter((o) => o.table === "knowledge_entity_values" && o.kind === "insert")
    .map((o) => o.payload!.field_path);
  assertEquals(inserted.includes("age"), false);
  assertEquals(ops.some((o) => o.kind === "update"), false);
});

Deno.test("Issue 2: Main-mode existing-value lookups stay branch_id IS NULL with no Main-user guard query", async () => {
  const { supabase, ops } = makeFakeSupabase([]);
  await syncEntityValues({
    // deno-lint-ignore no-explicit-any
    supabase: supabase as any,
    entityId: "entity-1",
    projectId: "project-1",
    userId: "user-1",
    rawExtractionId: "raw-1",
    branchId: null,
    normalizedEntity: characterEntity(),
  });

  const selects = ops.filter((o) => o.table === "knowledge_entity_values" && o.kind === "select");
  assert(selects.length > 0);
  for (const select of selects) {
    assertEquals(select.filters.some((f) => f.column === "branch_id" && f.type === "is"), true);
    // Main mode issues no extra source_type-scoped guard query.
    assertEquals(select.filters.some((f) => f.column === "source_type"), false);
  }
});
