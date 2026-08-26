/**
 * Phase 1 effective Main/Branch state resolver.
 *
 * Deno-compatible (no imports) pure merge/resolution helpers for computing
 * the *effective* state of entities, their field values, relationships, and
 * events under the hybrid Main/Branch model. These functions take
 * already-loaded rows and return merged results — they never query the
 * database themselves, so wiring them into an actual Edge Function (loading
 * rows, changing `ask-question`'s retrieval, etc.) is explicitly out of
 * scope for Phase 1.
 *
 * Hybrid model this resolver implements (verified against the actual write
 * path in `supabase/functions/extract-knowledge/index.ts`, not just migration
 * comments):
 * - `knowledge_entities` branch-layer rows (`layer: 'branch'`) are canonical
 *   for AI-extracted, branch-only entities (no Main counterpart). A fresh
 *   branch-only entity gets its own new `knowledge_entities.id`, and its
 *   `knowledge_branch_entities` overlay row has `source_entity_id: null` and
 *   `entity_id` equal to that new row's id.
 * - `knowledge_branch_entities.overrides` is canonical for explicit
 *   Main-field overlays (a Branch editing fields of an existing Main
 *   entity). For this case the write path sets `entity_id === source_entity_id`
 *   — both equal to the Main entity's own id — and never creates a separate
 *   branch-layer row; the override content lives entirely in the overlay
 *   row's own `overrides`/`base_values` columns, applied on top of the Main
 *   row directly (mirrors `applyEntityOverrides`/`findExistingEntity` in
 *   `extract-knowledge/index.ts`). `knowledge_branch_entities` has no
 *   `review_status` column, so overlay rows are never pending-filtered here;
 *   only `knowledge_entities.review_status` gates branch-only entities.
 * - `knowledge_entity_values` rows carry an independent `(entity_id,
 *   branch_id)` pair: for an override, `entity_id` is the Main entity's id
 *   (scoped by `branch_id`); for a branch-only entity, `entity_id` is that
 *   entity's own id, and its `branch_id` is always the branch id — never
 *   `null` (confirmed in `value-sync.ts`'s insert path; there is no
 *   Main-scoped baseline for an entity that only exists in a Branch). See
 *   `resolveEffectiveEntityValues`.
 * - Relationships keep the exact approved add/remove overlay semantics
 *   already implemented client-side in
 *   `client/src/lib/extractionBranching.ts`'s `getEffectiveBranchRelationships`
 *   (duplicated here so Edge Functions, which cannot import client code,
 *   can share the same semantics).
 * - Events are additive only for Phase 1: a Branch can add events on top of
 *   Main, there is no remove/override overlay yet.
 * - Pending Branch data (`review_status: 'pending'`) is excluded unless the
 *   caller opts in via `includePendingBranchData`.
 */

import type { BranchId } from "./retrieval-scope.ts";

// ---------------------------------------------------------------------------
// Input row shapes (subset of the actual DB columns needed for resolution)
// ---------------------------------------------------------------------------

export type EntityReviewStatus = "pending" | "confirmed" | "dismissed" | "merged";

export interface KnowledgeEntityRecord {
  id: string;
  canonical_name: string;
  entity_type: string;
  entity_types?: string[] | null;
  description?: string | null;
  attributes?: Record<string, unknown> | null;
  structured_fields?: Record<string, unknown> | null;
  layer: "main" | "branch";
  branch_id: string | null;
  review_status?: EntityReviewStatus | null;
  /** Provenance columns, optional so Phase 1 callers can omit them; used only for provenance (e.g. by Phase 2 retrieval candidates), never for merge/filter decisions. */
  version_id?: string | null;
  document_id?: string | null;
  raw_extraction_id?: string | null;
}

export interface KnowledgeBranchEntityRecord {
  id: string;
  branch_id: string;
  /** Null for a branch-only entity; the Main entity id when overriding Main. */
  source_entity_id: string | null;
  /** The entity id that actually holds the effective content (Main or Branch layer). */
  entity_id: string;
  overrides?: Record<string, unknown> | null;
  rejected_fields?: string[] | null;
}

export interface KnowledgeEntityValueRecord {
  /** `knowledge_entity_values.id`, optional so Phase 1 callers can omit it; needed by Phase 3 to join `knowledge_entity_value_evidence.value_id`. Never used for merge/filter decisions. */
  id?: string;
  entity_id: string;
  branch_id: string | null;
  field_path: string;
  value_json: unknown;
  source_type: "ai" | "user";
  value_status: "active" | "superseded" | "rejected";
  /** Provenance only, optional; never used for merge/filter decisions. */
  raw_extraction_id?: string | null;
}

export interface KnowledgeEventRecord {
  id: string;
  branch_id: string | null;
  name: string;
  description?: string | null;
  attributes?: Record<string, unknown> | null;
  /** Provenance only, optional; never used for merge/filter decisions. */
  version_id?: string | null;
  document_id?: string | null;
  raw_extraction_id?: string | null;
}

export type RelationshipOperation = "add" | "remove";
export type RelationshipReviewStatus = "pending" | "approved" | "rejected";

/** Matches `BranchRelationshipRecord` in client/src/lib/extractionBranching.ts. */
export interface BranchRelationshipRecord {
  id?: string;
  branch_id: string | null;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  operation?: RelationshipOperation;
  review_status?: RelationshipReviewStatus;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Effective entities
// ---------------------------------------------------------------------------

export type EffectiveEntityLayer = "main" | "branch-only" | "main-with-override";

/** An `(entity_id, branch_id)` pair a value lookup should match against. */
export interface ValueLookupKey {
  entityId: string;
  branchId: BranchId;
}

export interface EffectiveEntity {
  /**
   * Stable id identifying "this entity" across Main and Branch: the Main
   * entity's own id when a Main baseline exists, otherwise the branch-only
   * entity's own id. Use this for stable identity (e.g. React keys, dedup).
   */
  conceptualEntityId: string;
  /**
   * The id whose fields are actually in effect for this scope: the Main
   * entity id when unmodified, or the branch-layer `knowledge_entities.id`
   * that holds the override/branch-only content.
   */
  effectiveEntityId: string;
  layer: EffectiveEntityLayer;
  branchId: BranchId;
  canonicalName: string;
  entityType: string;
  entityTypes: string[];
  description: string | null;
  /** Merged view of attributes + structured_fields, with any Branch override applied. */
  fields: Record<string, unknown>;
  isOverridden: boolean;
  valueLookupKeys: ValueLookupKey[];
  /**
   * Provenance carried straight through from the underlying `knowledge_entities`
   * row that defines this entity's identity (the Main row for `main` and
   * `main-with-override`, the branch-only row for `branch-only`) — never
   * fabricated. `knowledge_branch_entities` overlay rows have no provenance
   * columns of their own, so an override does not change these.
   */
  versionId: string | null;
  documentId: string | null;
  rawExtractionId: string | null;
}

interface ResolveEffectiveEntitiesOptions {
  includePendingBranchData?: boolean;
}

function baseFields(entity: KnowledgeEntityRecord): Record<string, unknown> {
  return { ...(entity.attributes ?? {}), ...(entity.structured_fields ?? {}) };
}

function applyOverrides(
  base: Record<string, unknown>,
  overrides: Record<string, unknown> | null | undefined,
  rejectedFields: string[] | null | undefined,
): Record<string, unknown> {
  if (!overrides) return { ...base };
  const rejected = new Set(rejectedFields ?? []);
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (rejected.has(key)) continue;
    merged[key] = value;
  }
  return merged;
}

function isPending(reviewStatus: EntityReviewStatus | null | undefined): boolean {
  return reviewStatus === "pending";
}

/**
 * Resolve the effective entity list for a scope: Main baseline entities,
 * with Branch-only entities and Main-field Branch overrides layered on top
 * when a branch is selected. Never infers a branch — pass `branchId: null`
 * for Main-only resolution.
 */
export function resolveEffectiveEntities(
  mainEntities: KnowledgeEntityRecord[],
  branchEntities: KnowledgeEntityRecord[],
  branchOverlays: KnowledgeBranchEntityRecord[],
  branchId: BranchId,
  options: ResolveEffectiveEntitiesOptions = {},
): EffectiveEntity[] {
  const includePending = options.includePendingBranchData ?? false;
  const byConceptualId = new Map<string, EffectiveEntity>();

  for (const main of mainEntities) {
    if (main.layer !== "main" || main.branch_id !== null) continue;
    byConceptualId.set(main.id, {
      conceptualEntityId: main.id,
      effectiveEntityId: main.id,
      layer: "main",
      branchId: null,
      canonicalName: main.canonical_name,
      entityType: main.entity_type,
      entityTypes: main.entity_types ?? [],
      description: main.description ?? null,
      fields: baseFields(main),
      isOverridden: false,
      valueLookupKeys: [{ entityId: main.id, branchId: null }],
      versionId: main.version_id ?? null,
      documentId: main.document_id ?? null,
      rawExtractionId: main.raw_extraction_id ?? null,
    });
  }

  if (branchId === null) {
    return Array.from(byConceptualId.values());
  }

  const branchEntityById = new Map(
    branchEntities
      .filter((entity) => entity.layer === "branch" && entity.branch_id === branchId)
      .map((entity) => [entity.id, entity] as const),
  );

  // Branch-only entities: canonical `knowledge_entities` branch-layer rows.
  for (const branchEntity of branchEntityById.values()) {
    if (!includePending && isPending(branchEntity.review_status)) continue;
    byConceptualId.set(branchEntity.id, {
      conceptualEntityId: branchEntity.id,
      effectiveEntityId: branchEntity.id,
      layer: "branch-only",
      branchId,
      canonicalName: branchEntity.canonical_name,
      entityType: branchEntity.entity_type,
      entityTypes: branchEntity.entity_types ?? [],
      description: branchEntity.description ?? null,
      fields: baseFields(branchEntity),
      isOverridden: false,
      // Branch-only entities never have a Main-scoped (`branch_id: null`)
      // value row — the write path always sets `branch_id` to the branch id
      // for a branch-only entity's values. A `branchId: null` key here would
      // let a stray/unrelated Main-scoped value row masquerade as this
      // entity's baseline, which does not conceptually exist.
      valueLookupKeys: [{ entityId: branchEntity.id, branchId }],
      versionId: branchEntity.version_id ?? null,
      documentId: branchEntity.document_id ?? null,
      rawExtractionId: branchEntity.raw_extraction_id ?? null,
    });
  }

  // Main-field overrides and branch-only overlay metadata.
  for (const overlay of branchOverlays) {
    if (overlay.branch_id !== branchId) continue;

    if (overlay.source_entity_id) {
      const baseline = byConceptualId.get(overlay.source_entity_id);
      if (!baseline) continue; // no known Main baseline to override
      // Note: `knowledge_branch_entities` has no `review_status` column, so
      // there is no pending state to gate here — only branch-only entities
      // (via `knowledge_entities.review_status`) are pending-filtered.

      byConceptualId.set(overlay.source_entity_id, {
        ...baseline,
        // The write path always sets entity_id === source_entity_id for an
        // override (no separate branch-layer row is created), so this is
        // just the Main entity's own id.
        effectiveEntityId: overlay.entity_id,
        layer: "main-with-override",
        branchId,
        fields: applyOverrides(baseline.fields, overlay.overrides, overlay.rejected_fields),
        isOverridden: true,
        valueLookupKeys: [
          { entityId: baseline.conceptualEntityId, branchId: null },
          { entityId: overlay.source_entity_id, branchId },
        ],
      });
      continue;
    }

    // Branch-only entity referenced by an overlay row with its own extra overrides.
    const existing = byConceptualId.get(overlay.entity_id);
    if (!existing) continue;
    byConceptualId.set(overlay.entity_id, {
      ...existing,
      fields: applyOverrides(existing.fields, overlay.overrides, overlay.rejected_fields),
      isOverridden: true,
    });
  }

  return Array.from(byConceptualId.values());
}

// ---------------------------------------------------------------------------
// Effective field values
// ---------------------------------------------------------------------------

export interface ResolvedFieldValue {
  fieldPath: string;
  value: unknown;
  sourceType: "ai" | "user";
}

/**
 * Resolve the effective field values for one entity. Values are matched by
 * the exact `(entity_id, branch_id)` pair — never by `entity_id` alone —
 * because a Branch value is not guaranteed to reference the Branch-layer
 * entity id; it may reference the Main entity id scoped by `branch_id`.
 * When both a Main-scoped and a Branch-scoped value exist for the same
 * field, the Branch value wins.
 */
export function resolveEffectiveEntityValues(
  entity: EffectiveEntity,
  values: KnowledgeEntityValueRecord[],
): ResolvedFieldValue[] {
  const active = values.filter((value) => value.value_status === "active");
  const matchesKey = (value: KnowledgeEntityValueRecord, branchId: BranchId) =>
    entity.valueLookupKeys.some(
      (key) => key.branchId === branchId && key.entityId === value.entity_id,
    );

  const mainMatches = active.filter((value) => value.branch_id === null && matchesKey(value, null));
  const branchMatches = entity.branchId === null
    ? []
    : active.filter((value) => value.branch_id === entity.branchId && matchesKey(value, entity.branchId));

  const byField = new Map<string, ResolvedFieldValue>();
  for (const value of [...mainMatches, ...branchMatches]) {
    byField.set(value.field_path, {
      fieldPath: value.field_path,
      value: value.value_json,
      sourceType: value.source_type,
    });
  }
  return Array.from(byField.values());
}

// ---------------------------------------------------------------------------
// Effective relationships (existing approved add/remove semantics)
// ---------------------------------------------------------------------------

function relationshipKey(relationship: BranchRelationshipRecord): string {
  return `${relationship.source_entity_id}:${relationship.target_entity_id}:${relationship.relationship_type}`;
}

/**
 * Deno-compatible mirror of `getEffectiveBranchRelationships` in
 * `client/src/lib/extractionBranching.ts`. Must stay semantically identical
 * to that function: Main relationships count only when `branch_id === null`
 * and (defaulting to) approved/add; Branch relationships apply only when
 * `branch_id === branchId` and `review_status === 'approved'`, with `remove`
 * deleting and `add` overwriting the keyed entry.
 */
export function resolveEffectiveBranchRelationships(
  mainRelationships: BranchRelationshipRecord[],
  branchRelationships: BranchRelationshipRecord[],
  branchId: BranchId,
): BranchRelationshipRecord[] {
  const effective = new Map<string, BranchRelationshipRecord>();

  for (const relationship of mainRelationships) {
    if (
      relationship.branch_id === null &&
      (relationship.review_status || "approved") === "approved" &&
      (relationship.operation || "add") === "add"
    ) {
      effective.set(relationshipKey(relationship), relationship);
    }
  }

  if (branchId === null) {
    return Array.from(effective.values());
  }

  for (const relationship of branchRelationships) {
    if (relationship.branch_id !== branchId || relationship.review_status !== "approved") continue;
    const key = relationshipKey(relationship);
    if (relationship.operation === "remove") {
      effective.delete(key);
    } else if (relationship.operation === "add") {
      effective.set(key, relationship);
    }
  }

  return Array.from(effective.values());
}

// ---------------------------------------------------------------------------
// Effective events (additive only for Phase 1)
// ---------------------------------------------------------------------------

/**
 * Resolve the effective event list: Main events plus, when a branch is
 * selected, that branch's events layered on top. Additive only — there is
 * no remove/override overlay for events yet.
 */
export function resolveEffectiveEvents(
  mainEvents: KnowledgeEventRecord[],
  branchEvents: KnowledgeEventRecord[],
  branchId: BranchId,
): KnowledgeEventRecord[] {
  const main = mainEvents.filter((event) => event.branch_id === null);
  if (branchId === null) return main;
  const branch = branchEvents.filter((event) => event.branch_id === branchId);
  return [...main, ...branch];
}
