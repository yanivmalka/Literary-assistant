// Central orchestration and validation boundary for parallel specialist output.
// This module may load/persist specialist artifacts, but it is the only place
// that converts them into the legacy extraction shape consumed by the writer.

import {
  EXPERT_ROLES,
  validateExpertExtractionResult,
  type ExpertEntityCandidate,
  type ExpertExtractionResult,
  type ExpertRole,
  type ExpertSourceReference,
  type ExpertWindow,
  type TokenUsage,
} from "./parallel-experts.ts";
import {
  upsertExpertArtifact,
  type ExpertArtifactInput,
} from "./parallel-expert-artifacts.ts";
import {
  createGeminiExpertInvoker,
  PARALLEL_EXPERT_MODEL_ASSIGNMENTS,
  runParallelExpertJobs,
  type ExpertChunk,
  type ExpertJob,
} from "./parallel-expert-runner.ts";
import type { GeminiModelConfig, GeminiModelProfile } from "./gemini-config.ts";
import { buildSubBaseLocationsInstructions } from "./rules/prompt.ts";

export interface ExpertArtifactLoadContext {
  project_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  extraction_run_id: string;
  branch_id: string | null;
  model_profile: string;
  expected_windows: Array<{ role: ExpertRole; window: ExpertWindow }>;
}

export interface ValidatedExpertArtifact {
  id: string;
  role: ExpertRole;
  window: ExpertWindow;
  parsed_response: ExpertExtractionResult;
  model: string | null;
  usage: TokenUsage;
  latency_ms: number;
}

export interface MergedParallelExtraction {
  extraction: Record<string, unknown[]> & {
    __parallel_expert_artifacts?: Array<{
      id: string;
      role: ExpertRole;
      window_id: string;
      model: string | null;
    }>;
  };
  artifact_ids: string[];
  expert_models: Array<{ id: string; role: ExpertRole; window_id: string; model: string | null }>;
  usage: TokenUsage;
  model: string;
  latency_ms: number;
}

export interface ParallelExpertExecutionContext {
  supabase: { from: (table: string) => any };
  api_key: string;
  project_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  extraction_run_id: string;
  branch_id: string | null;
  model_profile: GeminiModelProfile;
  project_place_fields?: Array<{ place_type_key: string; field_key: string; label: string }>;
  project_character_fields?: Array<{ field_key: string; label: string; group_key: string }>;
  chunks: ExpertChunk[];
  offset: number;
  limit: number;
  models?: GeminiModelConfig[];
  models_by_role?: Partial<Record<ExpertRole, GeminiModelConfig[]>>;
  timeout_ms?: number;
  max_concurrent_roles?: number;
  min_interval_ms_per_role?: number;
  token_budget_per_role?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
}

function uniqueReferences<T extends ExpertSourceReference | Record<string, unknown>>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((reference) => {
    const key = JSON.stringify(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceReferencesWithArtifact(
  references: ExpertSourceReference[],
  artifactId: string,
  fallbackChunkPosition?: number,
): Array<Record<string, unknown>> {
  const mapped = references.map((reference) => ({
    chunk_position: reference.chunk_position,
    chunk_id: null,
    page_number: reference.page ?? null,
    quote: reference.quote ?? null,
    position_start: reference.start_offset ?? null,
    position_end: reference.end_offset ?? null,
    artifact_id: artifactId,
  }));
  if (mapped.length > 0 || fallbackChunkPosition === undefined) return mapped;
  return [{
    chunk_position: fallbackChunkPosition,
    chunk_id: null,
    page_number: null,
    quote: null,
    position_start: null,
    position_end: null,
    artifact_id: artifactId,
  }];
}

function artifactMarker(artifact: ValidatedExpertArtifact): Record<string, unknown> {
  return {
    artifact_id: artifact.id,
    role: artifact.role,
    window_id: artifact.window.window_id,
  };
}

function entityBucket(entityType: string): string | null {
  const normalized = normalizedKey(entityType).replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "character":
    case "person":
    case "people":
      return "characters";
    case "location":
    case "place":
      return "locations";
    case "object":
    case "item":
    case "artifact":
      return "objects";
    case "ability":
    case "skill":
    case "power":
      return "abilities";
    case "magic_ability":
    case "magical_ability":
    case "spell":
      return "magic_abilities";
    case "organization":
    case "group":
    case "faction":
      return "organizations";
    default:
      return null;
  }
}

function candidateDescription(candidate: ExpertEntityCandidate): string | undefined {
  const description = candidate.fields.description ?? candidate.fields.significance;
  return typeof description === "string" && description.trim() ? description.trim() : undefined;
}

function mergeEntity(
  target: Record<string, unknown>,
  candidate: ExpertEntityCandidate,
  artifact: ValidatedExpertArtifact,
): void {
  target.aliases = uniqueStrings([
    ...((target.aliases as string[] | undefined) ?? []),
    ...candidate.aliases,
  ]);
  target.evidence = uniqueStrings([
    ...((target.evidence as string[] | undefined) ?? []),
    ...candidate.evidence,
  ]);
  target.chunk_positions = uniqueNumbers([
    ...((target.chunk_positions as number[] | undefined) ?? []),
    ...candidate.chunk_positions,
  ]);
  target.source_references = uniqueReferences([
    ...((target.source_references as ExpertSourceReference[] | undefined) ?? []),
    ...sourceReferencesWithArtifact(candidate.source_references, artifact.id, candidate.chunk_positions[0]),
  ]);

  const attributes = isRecord(target.attributes) ? target.attributes : {};
  const currentFields = isRecord(target.attributes) ? target.attributes : {};
  for (const [key, value] of Object.entries(candidate.fields)) {
    if (value === null || value === undefined || value === "") continue;
    const existing = currentFields[key];
    if (existing === undefined || existing === null || existing === "") {
      attributes[key] = value;
    } else if (JSON.stringify(existing) !== JSON.stringify(value)) {
      const conflicts = isRecord(attributes.extraction_meta)
        ? attributes.extraction_meta
        : {};
      const fieldConflicts = isRecord(conflicts.conflicts) ? conflicts.conflicts : {};
      const values = Array.isArray(fieldConflicts[key]) ? fieldConflicts[key] as unknown[] : [existing];
      fieldConflicts[key] = [...values, value].filter((item, index, all) =>
        all.findIndex((candidateValue) => JSON.stringify(candidateValue) === JSON.stringify(item)) === index,
      );
      conflicts.conflicts = fieldConflicts;
      attributes.extraction_meta = conflicts;
    }
  }

  const metadata = isRecord(attributes.extraction_meta) ? attributes.extraction_meta : {};
  const markers = Array.isArray(metadata.parallel_expert_artifacts)
    ? metadata.parallel_expert_artifacts
    : [];
  metadata.parallel_expert_artifacts = [...markers, artifactMarker(artifact)].filter((marker, index, all) =>
    all.findIndex((candidateMarker) => JSON.stringify(candidateMarker) === JSON.stringify(marker)) === index,
  );
  attributes.extraction_meta = metadata;
  target.attributes = attributes;

  const description = candidateDescription(candidate);
  if (description && !target.description) target.description = description;
}

function addEntity(
  buckets: Record<string, unknown[]>,
  candidate: ExpertEntityCandidate,
  artifact: ValidatedExpertArtifact,
): void {
  const bucket = entityBucket(candidate.entity_type);
  if (!bucket || !candidate.name.trim()) return;
  const items = buckets[bucket] ?? (buckets[bucket] = []);
  const key = `${normalizedKey(candidate.name)}:${bucket}`;
  const existing = items.find((item) => {
    if (!isRecord(item)) return false;
    return `${normalizedKey(String(item.name ?? ""))}:${bucket}` === key;
  });

  if (existing && isRecord(existing)) {
    mergeEntity(existing, candidate, artifact);
    return;
  }

  const attributes: Record<string, unknown> = { ...candidate.fields };
  attributes.extraction_meta = {
    parallel_expert_artifacts: [artifactMarker(artifact)],
  };
  items.push({
    name: candidate.name.trim(),
    type: bucket === "magic_abilities" ? "magic_ability" : bucket.slice(0, -1),
    aliases: uniqueStrings(candidate.aliases),
    attributes,
    description: candidateDescription(candidate),
    evidence: uniqueStrings(candidate.evidence),
    chunk_positions: uniqueNumbers(candidate.chunk_positions),
    source_references: sourceReferencesWithArtifact(candidate.source_references, artifact.id, candidate.chunk_positions[0]),
  });
}

function addEvent(
  events: Record<string, unknown>[],
  candidate: ExpertExtractionResult["events"][number],
  artifact: ValidatedExpertArtifact,
): void {
  const name = candidate.name.trim() || candidate.description?.trim() || "";
  if (!name) return;
  const existing = events.find((event) => isRecord(event) && normalizedKey(String(event.name ?? "")) === normalizedKey(name));
  if (existing && isRecord(existing)) {
    existing.participants = uniqueStrings([
      ...((existing.participants as string[] | undefined) ?? []),
      ...candidate.participants,
    ]);
    existing.evidence = uniqueStrings([
      ...((existing.evidence as string[] | undefined) ?? []),
      ...candidate.evidence,
    ]);
    existing.chunk_positions = uniqueNumbers([
      ...((existing.chunk_positions as number[] | undefined) ?? []),
      ...candidate.chunk_positions,
    ]);
    existing.source_references = uniqueReferences([
      ...((existing.source_references as ExpertSourceReference[] | undefined) ?? []),
      ...sourceReferencesWithArtifact(candidate.source_references, artifact.id, candidate.chunk_positions[0]),
    ]);
    return;
  }

  events.push({
    name,
    description: candidate.description || name,
    what_happened: candidate.description || name,
    participants: uniqueStrings(candidate.participants),
    location: candidate.location,
    evidence: uniqueStrings(candidate.evidence),
    chunk_positions: uniqueNumbers(candidate.chunk_positions),
    source_references: sourceReferencesWithArtifact(candidate.source_references, artifact.id, candidate.chunk_positions[0]),
  });
}

function addRelationship(
  relationships: Record<string, unknown>[],
  candidate: ExpertExtractionResult["relationships"][number],
  artifact: ValidatedExpertArtifact,
): void {
  const source = candidate.source.trim();
  const target = candidate.target.trim();
  const relationshipType = candidate.relationship_type.trim();
  if (!source || !target || !relationshipType) return;
  const key = `${normalizedKey(source)}|${normalizedKey(target)}|${normalizedKey(relationshipType)}`;
  const existing = relationships.find((relationship) => {
    if (!isRecord(relationship)) return false;
    return `${normalizedKey(String(relationship.character_a ?? ""))}|${normalizedKey(String(relationship.character_b ?? ""))}|${normalizedKey(String(relationship.relationship_type ?? ""))}` === key;
  });
  if (existing && isRecord(existing)) {
    existing.evidence = uniqueStrings([
      ...((existing.evidence as string[] | undefined) ?? []),
      ...candidate.evidence,
    ]);
    existing.chunk_positions = uniqueNumbers([
      ...((existing.chunk_positions as number[] | undefined) ?? []),
      ...candidate.chunk_positions,
    ]);
    existing.source_references = uniqueReferences([
      ...((existing.source_references as ExpertSourceReference[] | undefined) ?? []),
      ...sourceReferencesWithArtifact(candidate.source_references, artifact.id, candidate.chunk_positions[0]),
    ]);
    return;
  }

  relationships.push({
    character_a: source,
    character_b: target,
    relationship_type: relationshipType,
    source_type: null,
    target_type: null,
    evidence: uniqueStrings(candidate.evidence),
    chunk_positions: uniqueNumbers(candidate.chunk_positions),
    source_references: sourceReferencesWithArtifact(candidate.source_references, artifact.id, candidate.chunk_positions[0]),
  });
}

function emptyUsage(): TokenUsage {
  return { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, total_tokens: 0 };
}

function addUsage(total: TokenUsage, usage: Partial<TokenUsage>): void {
  total.input_tokens += usage.input_tokens ?? 0;
  total.output_tokens += usage.output_tokens ?? 0;
  total.thinking_tokens += usage.thinking_tokens ?? 0;
  total.cached_tokens += usage.cached_tokens ?? 0;
  total.total_tokens += usage.total_tokens ?? 0;
}

function compareWindows(left: ExpertWindow, right: ExpertWindow): boolean {
  return left.window_id === right.window_id
    && left.offset === right.offset
    && left.limit === right.limit
    && JSON.stringify(uniqueNumbers(left.chunk_positions)) === JSON.stringify(uniqueNumbers(right.chunk_positions));
}

export async function loadValidatedExpertArtifacts(
  supabase: { from: (table: string) => any },
  context: ExpertArtifactLoadContext,
): Promise<ValidatedExpertArtifact[]> {
  let query = supabase
    .from("extraction_expert_artifacts")
    .select("*")
    .eq("project_id", context.project_id)
    .eq("document_id", context.document_id)
    .eq("version_id", context.version_id)
    .eq("user_id", context.user_id)
    .eq("extraction_run_id", context.extraction_run_id)
    .eq("model_profile", context.model_profile)
    .eq("extraction_strategy", "parallel-experts");
  query = context.branch_id === null
    ? query.is("branch_id", null)
    : query.eq("branch_id", context.branch_id);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load parallel expert artifacts: ${error.message}`);
  const rows = Array.isArray(data) ? data : [];
  const expectedKeys = new Set(context.expected_windows.map((item) => `${item.role}:${item.window.window_id}`));
  const foundKeys = new Set<string>();
  const artifacts: ValidatedExpertArtifact[] = [];

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const sameScope = row.project_id === context.project_id
      && row.document_id === context.document_id
      && row.version_id === context.version_id
      && row.user_id === context.user_id
      && row.extraction_run_id === context.extraction_run_id
      && row.model_profile === context.model_profile
      && (row.branch_id ?? null) === context.branch_id
      && row.extraction_strategy === "parallel-experts";
    if (!sameScope) throw new Error(`Parallel expert artifact ${String(row.id)} has inconsistent run scope`);
    if (row.status !== "succeeded" || !isRecord(row.parsed_response)) continue;
    const parsedValidation = validateExpertExtractionResult(row.parsed_response);
    if (!parsedValidation.valid) {
      throw new Error(`Parallel expert artifact ${String(row.id)} failed contract validation: ${parsedValidation.errors.join("; ")}`);
    }
    const parsed = parsedValidation.value;
    const rowWindow: ExpertWindow = {
      window_id: String(row.window_id ?? ""),
      offset: Number(row.offset),
      limit: Number(row.chunk_limit),
      chunk_positions: Array.isArray(row.chunk_positions) ? row.chunk_positions as number[] : [],
    };
    if (row.role !== parsed.role || !compareWindows(rowWindow, parsed.window)) {
      throw new Error(`Parallel expert artifact ${String(row.id)} has inconsistent role/window provenance`);
    }
    const key = `${parsed.role}:${parsed.window.window_id}`;
    if (!expectedKeys.has(key)) continue;
    if (foundKeys.has(key)) throw new Error(`Duplicate parallel expert artifact for ${key}`);
    foundKeys.add(key);
    artifacts.push({
      id: String(row.id),
      role: parsed.role,
      window: parsed.window,
      parsed_response: parsed,
      model: typeof row.model === "string" ? row.model : null,
      usage: {
        input_tokens: Number(row.input_tokens) || 0,
        output_tokens: Number(row.output_tokens) || 0,
        thinking_tokens: Number(row.thinking_tokens) || 0,
        cached_tokens: Number(row.cached_tokens) || 0,
        total_tokens: Number(row.total_tokens) || 0,
      },
      latency_ms: Number(row.latency_ms) || 0,
    });
  }

  for (const expected of context.expected_windows) {
    const key = `${expected.role}:${expected.window.window_id}`;
    if (!foundKeys.has(key)) {
      throw new Error(`Parallel expert artifact is missing or unfinished: ${key}`);
    }
  }

  return artifacts.sort((left, right) => {
    const roleOrder = EXPERT_ROLES.indexOf(left.role) - EXPERT_ROLES.indexOf(right.role);
    return roleOrder || left.window.offset - right.window.offset || left.id.localeCompare(right.id);
  });
}

export function mergeValidatedExpertArtifacts(
  artifacts: ValidatedExpertArtifact[],
): MergedParallelExtraction {
  const extraction: Record<string, unknown[]> & {
    __parallel_expert_artifacts?: Array<{
      id: string;
      role: ExpertRole;
      window_id: string;
      model: string | null;
    }>;
  } = {};
  const artifactMetadata: Array<{
    id: string;
    role: ExpertRole;
    window_id: string;
    model: string | null;
  }> = [];
  const usage = emptyUsage();
  let latency_ms = 0;

  for (const artifact of artifacts) {
    const result = artifact.parsed_response;
    artifactMetadata.push({
      id: artifact.id,
      role: artifact.role,
      window_id: artifact.window.window_id,
      model: artifact.model,
    });
    addUsage(usage, artifact.usage);
    latency_ms += artifact.latency_ms;
    for (const entity of result.entities) addEntity(extraction, entity, artifact);
    for (const event of result.events) addEvent((extraction.events ??= []) as Record<string, unknown>[], event, artifact);
    for (const relationship of result.relationships) addRelationship((extraction.relationships ??= []) as Record<string, unknown>[], relationship, artifact);
  }

  extraction.__parallel_expert_artifacts = artifactMetadata;
  return {
    extraction,
    artifact_ids: artifactMetadata.map((artifact) => artifact.id),
    expert_models: artifactMetadata,
    usage,
    model: "parallel-experts",
    latency_ms,
  };
}

export async function executeParallelExpertExtraction(
  context: ParallelExpertExecutionContext,
): Promise<MergedParallelExtraction> {
  const window: ExpertWindow = {
    window_id: `${context.offset}:${context.limit}`,
    offset: context.offset,
    limit: context.limit,
    chunk_positions: context.chunks.map((chunk) => chunk.position),
  };
  const jobs: ExpertJob[] = EXPERT_ROLES.map((role) => ({
    role,
    window,
    chunks: context.chunks,
    model_profile: context.model_profile,
    profile_instructions: context.model_profile === "sub-base-locations"
      ? buildSubBaseLocationsInstructions(context.project_place_fields, context.project_character_fields)
      : undefined,
  }));

  const invoker = createGeminiExpertInvoker({
    api_key: context.api_key,
    models: context.models,
    models_by_role: context.models_by_role ?? PARALLEL_EXPERT_MODEL_ASSIGNMENTS,
    timeout_ms: context.timeout_ms,
  });
  const runResults = await runParallelExpertJobs(
    jobs,
    invoker,
    {
      max_concurrent_roles: context.max_concurrent_roles,
      min_interval_ms_per_role: context.min_interval_ms_per_role,
      timeout_ms: context.timeout_ms,
      token_budget_per_role: context.token_budget_per_role,
      persist_artifact: (input: ExpertArtifactInput) => upsertExpertArtifact(context.supabase, input),
    },
    {
      project_id: context.project_id,
      document_id: context.document_id,
      version_id: context.version_id,
      user_id: context.user_id,
      extraction_run_id: context.extraction_run_id,
      branch_id: context.branch_id,
    },
  );
  const failed = runResults.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    throw new Error(`Parallel expert execution failed for ${failed.map((result) => `${result.role}/${result.window_id}: ${result.error}`).join("; ")}`);
  }

  const artifacts = await loadValidatedExpertArtifacts(context.supabase, {
    project_id: context.project_id,
    document_id: context.document_id,
    version_id: context.version_id,
    user_id: context.user_id,
    extraction_run_id: context.extraction_run_id,
    branch_id: context.branch_id,
    model_profile: context.model_profile,
    expected_windows: jobs.map((job) => ({ role: job.role, window: job.window })),
  });
  return mergeValidatedExpertArtifacts(artifacts);
}
