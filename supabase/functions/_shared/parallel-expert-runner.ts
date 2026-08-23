// Bounded specialist execution for the parallel-experts strategy.
// Experts return artifacts only. Canonical persistence belongs to the merger.

import {
  consumeTokenBudget,
  createTokenBudgetState,
  validateExpertExtractionResult,
  type ExpertExtractionResult,
  type ExpertRole,
  type ExpertWindow,
  type TokenBudgetState,
  type TokenUsage,
} from "./parallel-experts.ts";
import type { ExpertArtifactInput } from "./parallel-expert-artifacts.ts";
import { parseExtractionJson } from "../extract-knowledge/testable-pipeline.ts";

export interface ExpertChunk {
  position: number;
  content: string;
}

export interface ExpertJob {
  role: ExpertRole;
  window: ExpertWindow;
  chunks: ExpertChunk[];
  model_profile: string;
  attempt?: number;
  max_output_tokens?: number;
}

export interface ExpertInvocationResult {
  model: string;
  raw_response: Record<string, unknown>;
  response_text: string;
  usage: TokenUsage;
  latency_ms: number;
}

export type ExpertInvoker = (job: ExpertJob, prompt: string) => Promise<ExpertInvocationResult>;
export type PersistExpertArtifact = (input: ExpertArtifactInput) => Promise<unknown>;

export interface ExpertRunnerOptions {
  max_concurrent_roles?: number;
  min_interval_ms_per_role?: number;
  token_budget_per_role?: number;
  persist_artifact?: PersistExpertArtifact;
}

export interface ExpertJobResult {
  role: ExpertRole;
  window_id: string;
  status: "succeeded" | "failed";
  model: string | null;
  result: ExpertExtractionResult | null;
  usage: TokenUsage | null;
  error: string | null;
}

const DEFAULT_MAX_CONCURRENT_ROLES = 3;
const DEFAULT_MIN_INTERVAL_MS_PER_ROLE = 0;

const ROLE_INSTRUCTIONS: Record<ExpertRole, string> = {
  characters: "Extract only characters and character facts. Do not create locations, events, or relationships as primary results.",
  locations: "Extract only locations and location facts. Do not create characters or events as primary results.",
  events: "Extract only narrative events, their participants, locations, and explicitly supported relationships.",
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function buildExpertPrompt(job: ExpertJob): string {
  const chunks = job.chunks
    .map((chunk) => `<chunk position="${chunk.position}">\n${chunk.content}\n</chunk>`)
    .join("\n\n");

  return `<role>
You are the ${job.role} specialist in a multi-stage literary extraction pipeline.
</role>

<instructions>
${ROLE_INSTRUCTIONS[job.role]}
Extract only facts explicitly supported by the supplied source text.
Preserve exact evidence and chunk positions for every candidate.
Do not infer missing facts, merge ambiguous identities, or delete conflicting observations.
Return JSON only and follow the contract exactly.
</instructions>

<output_contract>
{
  "contract_version": 1,
  "role": "${job.role}",
  "window": {
    "window_id": "${job.window.window_id}",
    "offset": ${job.window.offset},
    "limit": ${job.window.limit},
    "chunk_positions": [number]
  },
  "entities": [{
    "name": "string",
    "entity_type": "string",
    "aliases": ["string"],
    "fields": {},
    "evidence": ["string"],
    "chunk_positions": [number],
    "source_references": [{"chunk_position": number, "quote": "string or null", "page": number or null}],
    "confidence": number or null
  }],
  "events": [{
    "name": "string",
    "description": "string or null",
    "participants": ["string"],
    "location": "string or null",
    "evidence": ["string"],
    "chunk_positions": [number],
    "source_references": [{"chunk_position": number, "quote": "string or null", "page": number or null}],
    "confidence": number or null
  }],
  "relationships": [{
    "source": "string",
    "target": "string",
    "relationship_type": "string",
    "evidence": ["string"],
    "chunk_positions": [number],
    "source_references": [{"chunk_position": number, "quote": "string or null", "page": number or null}],
    "confidence": number or null
  }],
  "unresolved_references": ["string"]
}
</output_contract>

<source_context>
${chunks}
</source_context>`;
}

function emptyUsage(): TokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cached_tokens: 0,
    total_tokens: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Expert invocation failed";
}

function artifactInput(
  job: ExpertJob,
  status: ExpertArtifactInput["status"],
  invocation: ExpertInvocationResult | null,
  parsed: ExpertExtractionResult | null,
  error: string | null,
  attempt: number,
): ExpertArtifactInput {
  return {
    project_id: "",
    document_id: "",
    version_id: "",
    user_id: "",
    extraction_run_id: "",
    branch_id: null,
    model_profile: job.model_profile,
    role: job.role,
    window: job.window,
    status,
    attempt,
    model: invocation?.model ?? null,
    raw_response: invocation?.raw_response ?? null,
    parsed_response: parsed,
    error_message: error,
    usage: invocation?.usage ?? null,
    latency_ms: invocation?.latency_ms ?? null,
  };
}

export interface ExpertArtifactContext {
  project_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  extraction_run_id: string;
  branch_id: string | null;
}

function withArtifactContext(
  input: ExpertArtifactInput,
  context: ExpertArtifactContext,
): ExpertArtifactInput {
  return { ...input, ...context };
}

async function runOneExpertJob(
  job: ExpertJob,
  invoker: ExpertInvoker,
  budgets: Map<ExpertRole, TokenBudgetState>,
  options: ExpertRunnerOptions,
  context?: ExpertArtifactContext,
  lastStartedAt: Map<ExpertRole, number> = new Map(),
): Promise<ExpertJobResult> {
  const attempt = job.attempt ?? 0;
  const interval = options.min_interval_ms_per_role ?? DEFAULT_MIN_INTERVAL_MS_PER_ROLE;
  const previousStart = lastStartedAt.get(job.role) ?? 0;
  const waitFor = interval - (Date.now() - previousStart);
  if (waitFor > 0) await sleep(waitFor);
  lastStartedAt.set(job.role, Date.now());

  const persist = async (
    input: ExpertArtifactInput,
  ): Promise<void> => {
    if (!options.persist_artifact || !context) return;
    await options.persist_artifact(withArtifactContext(input, context));
  };

  await persist(artifactInput(job, "running", null, null, null, attempt));

  let invocation: ExpertInvocationResult | null = null;
  try {
    invocation = await invoker(job, buildExpertPrompt(job));
    const parsed = parseExtractionJson<unknown>(invocation.response_text);
    const validation = validateExpertExtractionResult(parsed);
    if (!validation.valid) {
      const error = `Invalid expert result: ${validation.errors.join("; ")}`;
      await persist(artifactInput(job, "failed", invocation, null, error, attempt));
      return { role: job.role, window_id: job.window.window_id, status: "failed", model: invocation.model, result: null, usage: invocation.usage, error };
    }

    const budget = budgets.get(job.role) ?? createTokenBudgetState(options.token_budget_per_role);
    const budgetResult = consumeTokenBudget(budget, invocation.usage);
    budgets.set(job.role, budgetResult.state);
    if (!budgetResult.ok) {
      const error = `Token budget exceeded for ${job.role}: ${budgetResult.state.consumed}/${budgetResult.state.limit}`;
      await persist(artifactInput(job, "failed", invocation, null, error, attempt));
      return { role: job.role, window_id: job.window.window_id, status: "failed", model: invocation.model, result: null, usage: invocation.usage, error };
    }

    await persist(artifactInput(job, "succeeded", invocation, validation.value, null, attempt));
    return { role: job.role, window_id: job.window.window_id, status: "succeeded", model: invocation.model, result: validation.value, usage: invocation.usage, error: null };
  } catch (error) {
    const message = errorMessage(error);
    await persist(artifactInput(job, "failed", invocation, null, message, attempt));
    return { role: job.role, window_id: job.window.window_id, status: "failed", model: invocation?.model ?? null, result: null, usage: invocation?.usage ?? null, error: message };
  }
}

/**
 * Run jobs in parallel across expert roles while processing windows for one
 * role sequentially. This preserves per-role budget and ordering while still
 * reducing wall-clock time across characters, locations, and events.
 */
export async function runParallelExpertJobs(
  jobs: ExpertJob[],
  invoker: ExpertInvoker,
  options: ExpertRunnerOptions = {},
  context?: ExpertArtifactContext,
): Promise<ExpertJobResult[]> {
  const maxConcurrentRoles = Math.max(1, Math.floor(options.max_concurrent_roles ?? DEFAULT_MAX_CONCURRENT_ROLES));
  const budgets = new Map<ExpertRole, TokenBudgetState>();
  const lastStartedAt = new Map<ExpertRole, number>();
  const grouped = new Map<ExpertRole, Array<{ job: ExpertJob; index: number }>>();

  for (const [index, job] of jobs.entries()) {
    const roleJobs = grouped.get(job.role) ?? [];
    roleJobs.push({ job, index });
    grouped.set(job.role, roleJobs);
  }

  const results = new Array<ExpertJobResult>(jobs.length);
  const groups = [...grouped.values()];
  let nextGroup = 0;

  async function worker(): Promise<void> {
    while (true) {
      const groupIndex = nextGroup++;
      const group = groups[groupIndex];
      if (!group) return;

      for (const item of group) {
        results[item.index] = await runOneExpertJob(
          item.job,
          invoker,
          budgets,
          options,
          context,
          lastStartedAt,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrentRoles, groups.length) }, () => worker()),
  );
  return results;
}
