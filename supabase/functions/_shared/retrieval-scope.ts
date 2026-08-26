/**
 * Unified retrieval scope types and Main/Branch resolution helpers.
 *
 * Deno-compatible (no imports, no Node-specific APIs) so it can be shared by
 * Supabase Edge Functions. This module only introduces types and pure
 * normalization/resolution functions — it does not change any existing
 * retrieval query or persistence behavior. Consumers must opt in explicitly.
 *
 * Sentinel convention (matches client/src/lib/extractionBranching.ts):
 * a `branchId` of `null`/`undefined`/`""` means Main; any other non-empty
 * string identifies a Branch. There is no implicit "active branch" lookup
 * here — a Branch is only in scope when its id is passed in explicitly.
 */

/** Canonical branch identifier: `null` means Main, otherwise a Branch id. */
export type BranchId = string | null;

/** Raw branch id as received from a request/caller, before normalization. */
export type RawBranchId = string | null | undefined;

export interface BranchContext {
  branchId: BranchId;
}

/**
 * Raw retrieval scope as received from a caller, before normalization.
 * Mirrors the untrusted-input shape already used by
 * `supabase/functions/ask-question/index.ts`'s local `RetrievalScope`, plus
 * the Main/Branch and pending-data fields Phase 1 adds.
 */
export interface RawUnifiedRetrievalScope {
  projectId: string;
  branchId?: RawBranchId;
  sourceVersionIds?: unknown;
  chapterNumbers?: unknown;
  chunkIds?: unknown;
  includeAdjacent?: unknown;
  includePendingBranchData?: unknown;
}

/**
 * A unified description of what should be retrieved: both the document/chunk
 * filters that already exist in `ask-question`'s retrieval scope, and the
 * Main/Branch layering. Main is always the base layer, and a Branch (when
 * explicitly selected) is an overlay on top of it.
 */
export interface UnifiedRetrievalScope {
  projectId: string;

  /** Canonical branch id: `null` when the effective scope is Main only. */
  branchId: BranchId;
  /** True when there is no active branch (retrieval is Main-only). */
  isMain: boolean;
  /** Main is always included as the base layer. */
  includeMain: true;
  /** Whether Branch-layer records should also be included as an overlay. */
  includeBranch: boolean;

  sourceVersionIds: string[];
  chapterNumbers: number[];
  chunkIds: string[];
  includeAdjacent: boolean;

  /**
   * Whether Branch entities/relationships still awaiting review (e.g.
   * `review_status: 'pending'`) should be included. Defaults to `false`:
   * pending Branch data is excluded unless explicitly requested.
   */
  includePendingBranchData: boolean;
}

/**
 * Normalize a raw branch id into the canonical `BranchId` form: falsy values
 * (`null`, `undefined`, `""`) collapse to `null` (Main). Never infers a
 * branch from context — the caller must pass one explicitly.
 */
export function normalizeBranchId(branchId: RawBranchId): BranchId {
  return branchId ? branchId : null;
}

/** True when the normalized branch id denotes Main (no active branch). */
export function isMainScope(branchId: RawBranchId): boolean {
  return normalizeBranchId(branchId) === null;
}

function scopeStrings(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, max);
}

function scopeIntegers(value: unknown, max = 100): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is number => typeof item === "number" && Number.isInteger(item))
      .filter((item) => item >= 0),
  )].slice(0, max);
}

/**
 * Resolve the effective Main/Branch retrieval scope for a raw branch id.
 * Main is always included as the base layer; a Branch, when explicitly
 * passed, is layered on top as an overlay. No implicit active-branch
 * selection happens here.
 */
export function resolveEffectiveScope(branchId: RawBranchId): {
  branchId: BranchId;
  isMain: boolean;
  includeMain: true;
  includeBranch: boolean;
} {
  const normalized = normalizeBranchId(branchId);
  const isMain = normalized === null;

  return {
    branchId: normalized,
    isMain,
    includeMain: true,
    includeBranch: !isMain,
  };
}

/**
 * Normalize a raw unified retrieval scope into its canonical, sanitized
 * form. Combines the existing document/chunk scope sanitization used by
 * `ask-question` with explicit Main/Branch resolution.
 */
export function normalizeUnifiedRetrievalScope(
  raw: RawUnifiedRetrievalScope,
): UnifiedRetrievalScope {
  const { branchId, isMain, includeMain, includeBranch } = resolveEffectiveScope(raw.branchId);

  return {
    projectId: raw.projectId,
    branchId,
    isMain,
    includeMain,
    includeBranch,
    sourceVersionIds: scopeStrings(raw.sourceVersionIds),
    chapterNumbers: scopeIntegers(raw.chapterNumbers),
    chunkIds: scopeStrings(raw.chunkIds),
    includeAdjacent: raw.includeAdjacent !== false,
    includePendingBranchData: raw.includePendingBranchData === true,
  };
}
