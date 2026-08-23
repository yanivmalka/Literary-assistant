// Persistence helpers for run-scoped parallel expert artifacts.
// This module only writes extraction_expert_artifacts; it has no path to the
// canonical Knowledge Layer tables.

import type { FallbackAttempt } from "./gemini-client.ts";
import type {
  ExpertExtractionResult,
  ExpertRole,
  ExpertWindow,
  TokenUsage,
} from "./parallel-experts.ts";

export const EXPERT_ARTIFACT_STATUSES = ["pending", "running", "succeeded", "failed"] as const;
export type ExpertArtifactStatus = typeof EXPERT_ARTIFACT_STATUSES[number];

export interface ExpertArtifactInput {
  project_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  extraction_run_id: string;
  branch_id: string | null;
  model_profile: string;
  role: ExpertRole;
  window: ExpertWindow;
  status: ExpertArtifactStatus;
  attempt: number;
  artifact_contract?: string | null;
  primary_model?: string | null;
  model?: string | null;
  fallback_chain?: FallbackAttempt[] | null;
  raw_response?: unknown;
  parsed_response?: ExpertExtractionResult | null;
  error_message?: string | null;
  usage?: Partial<TokenUsage> | null;
  latency_ms?: number | null;
}

export function isExpertArtifactStatus(value: unknown): value is ExpertArtifactStatus {
  return typeof value === "string"
    && (EXPERT_ARTIFACT_STATUSES as readonly string[]).includes(value);
}

export function expertArtifactIdempotencyKey(
  extractionRunId: string,
  role: ExpertRole,
  windowId: string,
): string {
  return `${extractionRunId}:${role}:${windowId}`;
}

export function buildExpertArtifactRecord(input: ExpertArtifactInput): Record<string, unknown> {
  if (!isExpertArtifactStatus(input.status)) {
    throw new Error(`Invalid expert artifact status: ${String(input.status)}`);
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 0) {
    throw new Error("Expert artifact attempt must be a non-negative integer");
  }

  return {
    project_id: input.project_id,
    document_id: input.document_id,
    version_id: input.version_id,
    user_id: input.user_id,
    extraction_run_id: input.extraction_run_id,
    branch_id: input.branch_id,
    model_profile: input.model_profile,
    extraction_strategy: "parallel-experts",
    role: input.role,
    window_id: input.window.window_id,
    offset: input.window.offset,
    chunk_limit: input.window.limit,
    chunk_positions: input.window.chunk_positions,
    status: input.status,
    attempt: input.attempt,
    artifact_contract: input.artifact_contract ?? "expert-extraction-v1",
    primary_model: input.primary_model ?? null,
    model: input.model ?? null,
    fallback_chain: input.fallback_chain ?? null,
    raw_response: input.raw_response ?? null,
    parsed_response: input.parsed_response ?? null,
    error_message: input.error_message ?? null,
    input_tokens: input.usage?.input_tokens ?? null,
    output_tokens: input.usage?.output_tokens ?? null,
    thinking_tokens: input.usage?.thinking_tokens ?? null,
    cached_tokens: input.usage?.cached_tokens ?? null,
    total_tokens: input.usage?.total_tokens ?? null,
    latency_ms: input.latency_ms ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertExpertArtifact(
  supabase: { from: (table: string) => any },
  input: ExpertArtifactInput,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("extraction_expert_artifacts")
    .upsert(buildExpertArtifactRecord(input), {
      onConflict: "extraction_run_id,role,window_id",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to persist expert artifact: ${error.message}`);
  if (!data) throw new Error("Expert artifact persistence returned no row");
  return data as Record<string, unknown>;
}
