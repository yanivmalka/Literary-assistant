import type { GeminiModelProfile } from "./gemini-config.ts";

export const SHADOW_COMPARISON_CONTRACT_VERSION = 1 as const;
/**
 * Value stored in `extraction_shadow_comparisons.candidate_extraction_strategy`
 * when a caller does not supply one. It is kept as `parallel-experts` only
 * because migration 140 still constrains that column with
 * `CHECK (candidate_extraction_strategy = 'parallel-experts')`; the live
 * extraction pipeline runs `legacy-sequential` (parallel-experts was retired in
 * Issue 13). The request-time execution guard that also required this value has
 * been removed as dead code.
 */
export const SHADOW_COMPARISON_STRATEGY = "parallel-experts" as const;
export const SHADOW_COMPARISON_PROFILE = "sub-base-c-characters" as const;
export const SHADOW_COMPARISON_STATUSES = ["succeeded", "failed"] as const;
export type ShadowComparisonStatus = typeof SHADOW_COMPARISON_STATUSES[number];

export interface ShadowChunkInput {
  position: number;
  content: string;
}

export interface ShadowScope {
  project_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
}

export interface BaselineRawExtraction extends ShadowScope {
  id: string;
  branch_id: string | null;
  model: string | null;
  model_profile: string | null;
  extraction_strategy: string | null;
  raw_response: unknown;
}

export type ShadowValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

export interface ComparisonEntity {
  key: string;
  name: string;
  entity_type: string;
  fields: Record<string, unknown>;
}

export interface ComparisonRelationship {
  key: string;
  source: string;
  target: string;
  relationship_type: string;
  fields: Record<string, unknown>;
}

export interface ComparisonSnapshot {
  entities: ComparisonEntity[];
  relationships: ComparisonRelationship[];
}

export interface ShadowComparisonMetrics {
  baseline_entity_count: number;
  candidate_entity_count: number;
  baseline_unique_entity_count: number;
  candidate_unique_entity_count: number;
  matched_entity_count: number;
  added_entity_count: number;
  removed_entity_count: number;
  baseline_relationship_count: number;
  candidate_relationship_count: number;
  baseline_unique_relationship_count: number;
  candidate_unique_relationship_count: number;
  matched_relationship_count: number;
  added_relationship_count: number;
  removed_relationship_count: number;
  compared_field_count: number;
  changed_field_count: number;
  field_change_rate: number | null;
  field_changes: Array<{
    entity_key: string;
    field: string;
    baseline: unknown;
    candidate: unknown;
  }>;
}

export interface ShadowComparisonInput {
  scope: ShadowScope;
  shadow_run_id: string;
  baseline: BaselineRawExtraction;
  candidate_payload: unknown;
  offset: number;
  limit: number;
  chunk_positions: number[];
  input_fingerprint: string;
  candidate_model_profile?: GeminiModelProfile | string;
  candidate_extraction_strategy?: string;
  candidate_model?: string | null;
  candidate_primary_model?: string | null;
  candidate_fallback_chain?: unknown;
  input_tokens?: number | null;
  output_tokens?: number | null;
  thinking_tokens?: number | null;
  cached_tokens?: number | null;
  total_tokens?: number | null;
  latency_ms?: number | null;
  status?: ShadowComparisonStatus;
  error_message?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function normalizedKey(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function normalizedType(value: unknown): string {
  return normalizedKey(value).replace(/[\s-]+/g, "_");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function comparableFields(record: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const attributes = isRecord(record.attributes) ? record.attributes : {};
  const structuredFields = isRecord(record.structured_fields) ? record.structured_fields : {};
  Object.assign(fields, attributes, structuredFields);

  const excluded = new Set([
    "name", "canonical_name", "type", "entity_type", "entity_types",
    "attributes", "structured_fields", "evidence", "chunk_positions",
    "chunk_ids", "page_numbers", "source_references", "field_evidence",
    "raw_extraction_id", "extraction_meta", "character_field_observations",
  ]);
  for (const [key, value] of Object.entries(record)) {
    if (!excluded.has(key) && value !== undefined && value !== null && value !== "") {
      fields[key] = value;
    }
  }
  return stableValue(fields) as Record<string, unknown>;
}

function normalizeEntity(value: unknown, bucket: string): ComparisonEntity | null {
  if (!isRecord(value)) return null;
  const nameValue = value.name ?? value.canonical_name;
  if (!nonEmptyString(nameValue)) return null;
  const entityType = value.type ?? value.entity_type ?? bucket.slice(0, -1);
  const name = nameValue.trim();
  const type = normalizedType(entityType);
  return {
    key: `${type}:${normalizedKey(name)}`,
    name,
    entity_type: type,
    fields: comparableFields(value),
  };
}

function normalizeRelationship(value: unknown): ComparisonRelationship | null {
  if (!isRecord(value)) return null;
  const source = value.source ?? value.character_a ?? value.entity_a;
  const target = value.target ?? value.character_b ?? value.entity_b;
  const sourceName = isRecord(source) ? source.name ?? source.canonical_name : source;
  const targetName = isRecord(target) ? target.name ?? target.canonical_name : target;
  const type = value.relationship_type ?? value.type;
  if (!nonEmptyString(sourceName) || !nonEmptyString(targetName) || !nonEmptyString(type)) return null;
  const normalizedSource = normalizedKey(sourceName);
  const normalizedTarget = normalizedKey(targetName);
  const normalizedRelationshipType = normalizedType(type);
  const fields = comparableFields(value);
  return {
    key: `${normalizedSource}|${normalizedTarget}|${normalizedRelationshipType}`,
    source: String(sourceName).trim(),
    target: String(targetName).trim(),
    relationship_type: normalizedRelationshipType,
    fields,
  };
}

export function validateBaselineScope(
  baseline: Partial<BaselineRawExtraction> | null | undefined,
  expected: ShadowScope & { baseline_raw_extraction_id: string },
): ShadowValidation {
  if (!baseline) return { ok: false, errors: ["baseline raw extraction was not found"] };
  const errors: string[] = [];
  if (baseline.id !== expected.baseline_raw_extraction_id) errors.push("baseline id mismatch");
  for (const key of ["project_id", "document_id", "version_id", "user_id"] as const) {
    if (baseline[key] !== expected[key]) errors.push(`baseline ${key} does not match shadow scope`);
  }
  if (!isRecord(baseline.raw_response)) errors.push("baseline raw_response must be a JSON object");
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/** Creates a stable SHA-256 fingerprint for the exact candidate chunk window. */
export async function fingerprintShadowInput(chunks: ShadowChunkInput[]): Promise<string> {
  const normalized = chunks
    .map((chunk) => ({ position: chunk.position, content: chunk.content }))
    .sort((left, right) => left.position - right.position);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableJson(normalized)),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function validateShadowCandidatePayload(payload: unknown): ShadowValidation {
  if (!isRecord(payload)) return { ok: false, errors: ["candidate payload must be an object"] };
  const errors: string[] = [];
  const characters = payload.characters;
  if (characters !== undefined && !Array.isArray(characters)) errors.push("characters must be an array");
  if (Array.isArray(characters)) {
    characters.forEach((character, index) => {
      if (!isRecord(character) || !nonEmptyString(character.name)) {
        errors.push(`characters[${index}] must contain a name`);
      }
    });
  }
  for (const bucket of ["locations", "objects", "abilities", "magic_abilities", "organizations", "events"] as const) {
    if (payload[bucket] !== undefined && !Array.isArray(payload[bucket])) {
      errors.push(`${bucket} must be an array when present`);
    } else if (Array.isArray(payload[bucket]) && payload[bucket].length > 0) {
      errors.push(`${bucket} must be empty for the isolated character shadow`);
    }
  }
  if (payload.relationships !== undefined && !Array.isArray(payload.relationships)) {
    errors.push("relationships must be an array when present");
  }
  if (Array.isArray(payload.relationships)) {
    payload.relationships.forEach((relationship, index) => {
      if (!normalizeRelationship(relationship)) errors.push(`relationships[${index}] is invalid`);
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function normalizeComparisonPayload(payload: unknown): ComparisonSnapshot {
  if (!isRecord(payload)) return { entities: [], relationships: [] };
  const entities: ComparisonEntity[] = [];
  for (const bucket of ["characters", "locations", "objects", "abilities", "magic_abilities", "organizations"] as const) {
    const values = payload[bucket];
    if (Array.isArray(values)) {
      for (const value of values) {
        const normalized = normalizeEntity(value, bucket);
        if (normalized) entities.push(normalized);
      }
    }
  }
  const relationships = Array.isArray(payload.relationships)
    ? payload.relationships.map(normalizeRelationship).filter((item): item is ComparisonRelationship => item !== null)
    : [];
  return { entities, relationships };
}

function uniqueByKey<T extends { key: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.key, item]));
}

export function compareShadowPayloads(baselinePayload: unknown, candidatePayload: unknown): ShadowComparisonMetrics {
  const baseline = normalizeComparisonPayload(baselinePayload);
  const candidate = normalizeComparisonPayload(candidatePayload);
  const baselineEntities = uniqueByKey(baseline.entities);
  const candidateEntities = uniqueByKey(candidate.entities);
  const baselineRelationships = uniqueByKey(baseline.relationships);
  const candidateRelationships = uniqueByKey(candidate.relationships);
  const matchedEntityKeys = [...candidateEntities.keys()].filter((key) => baselineEntities.has(key));
  const matchedRelationshipKeys = [...candidateRelationships.keys()].filter((key) => baselineRelationships.has(key));
  const fieldChanges: ShadowComparisonMetrics["field_changes"] = [];
  let comparedFieldCount = 0;
  for (const key of matchedEntityKeys) {
    const baselineFields = baselineEntities.get(key)!.fields;
    const candidateFields = candidateEntities.get(key)!.fields;
    for (const field of new Set([...Object.keys(baselineFields), ...Object.keys(candidateFields)])) {
      comparedFieldCount++;
      const left = baselineFields[field];
      const right = candidateFields[field];
      if (stableJson(left) !== stableJson(right) && fieldChanges.length < 100) {
        fieldChanges.push({ entity_key: key, field, baseline: left ?? null, candidate: right ?? null });
      }
    }
  }
  const changedFieldCount = fieldChanges.length;
  return {
    baseline_entity_count: baseline.entities.length,
    candidate_entity_count: candidate.entities.length,
    baseline_unique_entity_count: baselineEntities.size,
    candidate_unique_entity_count: candidateEntities.size,
    matched_entity_count: matchedEntityKeys.length,
    added_entity_count: [...candidateEntities.keys()].filter((key) => !baselineEntities.has(key)).length,
    removed_entity_count: [...baselineEntities.keys()].filter((key) => !candidateEntities.has(key)).length,
    baseline_relationship_count: baseline.relationships.length,
    candidate_relationship_count: candidate.relationships.length,
    baseline_unique_relationship_count: baselineRelationships.size,
    candidate_unique_relationship_count: candidateRelationships.size,
    matched_relationship_count: matchedRelationshipKeys.length,
    added_relationship_count: [...candidateRelationships.keys()].filter((key) => !baselineRelationships.has(key)).length,
    removed_relationship_count: [...baselineRelationships.keys()].filter((key) => !candidateRelationships.has(key)).length,
    compared_field_count: comparedFieldCount,
    changed_field_count: changedFieldCount,
    field_change_rate: comparedFieldCount > 0 ? changedFieldCount / comparedFieldCount : null,
    field_changes: fieldChanges,
  };
}

export function buildShadowComparisonRecord(input: ShadowComparisonInput): Record<string, unknown> {
  const candidateValidation = validateShadowCandidatePayload(input.candidate_payload);
  if (!candidateValidation.ok) throw new Error(`Invalid shadow candidate payload: ${candidateValidation.errors.join("; ")}`);
  const baselineValidation = validateBaselineScope(input.baseline, {
    ...input.scope,
    baseline_raw_extraction_id: input.baseline.id,
  });
  if (!baselineValidation.ok) throw new Error(`Invalid shadow baseline: ${baselineValidation.errors.join("; ")}`);
  const baselinePayload = input.baseline.raw_response;
  const candidatePayload = input.candidate_payload;
  const comparisonMetrics = compareShadowPayloads(baselinePayload, candidatePayload);
  const comparisonKey = `${input.shadow_run_id}:${input.baseline.id}:${input.offset}:${input.limit}`;
  return {
    contract_version: SHADOW_COMPARISON_CONTRACT_VERSION,
    comparison_key: comparisonKey,
    project_id: input.scope.project_id,
    document_id: input.scope.document_id,
    version_id: input.scope.version_id,
    user_id: input.scope.user_id,
    shadow_run_id: input.shadow_run_id,
    baseline_raw_extraction_id: input.baseline.id,
    baseline_branch_id: input.baseline.branch_id,
    baseline_model_profile: input.baseline.model_profile,
    baseline_extraction_strategy: input.baseline.extraction_strategy,
    candidate_model_profile: input.candidate_model_profile ?? SHADOW_COMPARISON_PROFILE,
    candidate_extraction_strategy: input.candidate_extraction_strategy ?? SHADOW_COMPARISON_STRATEGY,
    offset: input.offset,
    chunk_limit: input.limit,
    chunk_positions: input.chunk_positions,
    input_fingerprint: input.input_fingerprint,
    input_alignment: "unverified",
    baseline_payload: baselinePayload,
    candidate_payload: candidatePayload,
    baseline_summary: {
      entity_count: normalizeComparisonPayload(baselinePayload).entities.length,
      relationship_count: normalizeComparisonPayload(baselinePayload).relationships.length,
    },
    comparison_metrics: comparisonMetrics,
    candidate_model: input.candidate_model ?? null,
    candidate_primary_model: input.candidate_primary_model ?? null,
    candidate_fallback_chain: input.candidate_fallback_chain ?? null,
    input_tokens: input.input_tokens ?? null,
    output_tokens: input.output_tokens ?? null,
    thinking_tokens: input.thinking_tokens ?? null,
    cached_tokens: input.cached_tokens ?? null,
    total_tokens: input.total_tokens ?? null,
    latency_ms: input.latency_ms ?? null,
    status: input.status ?? "succeeded",
    error_message: input.error_message ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function persistShadowComparison(
  supabase: { from: (table: string) => any },
  input: ShadowComparisonInput,
): Promise<Record<string, unknown>> {
  const record = buildShadowComparisonRecord(input);
  const { data, error } = await supabase
    .from("extraction_shadow_comparisons")
    .upsert(record, { onConflict: "comparison_key" })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to persist shadow comparison: ${error.message}`);
  if (!data) throw new Error("Shadow comparison persistence returned no row");
  return data as Record<string, unknown>;
}
