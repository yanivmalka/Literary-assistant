// Contracts and pure helpers for the parallel-experts extraction strategy.
// This module is intentionally I/O-free: specialist execution and persistence
// are implemented separately so expert output cannot become canonical data by accident.

export const EXPERT_ROLES = ["characters", "locations", "events"] as const;
export type ExpertRole = typeof EXPERT_ROLES[number];

export const PARALLEL_EXPERTS_STRATEGY = "parallel-experts" as const;
export const DEFAULT_EXPERT_TOKEN_BUDGET = 150_000;
export const EXPERT_CONTRACT_VERSION = 1;

export interface ExpertWindow {
  window_id: string;
  offset: number;
  limit: number;
  chunk_positions: number[];
}

export interface ExpertSourceReference {
  chunk_position: number;
  quote?: string | null;
  page?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
}

export interface ExpertEntityCandidate {
  name: string;
  entity_type: string;
  aliases: string[];
  fields: Record<string, unknown>;
  evidence: string[];
  chunk_positions: number[];
  source_references: ExpertSourceReference[];
  confidence: number | null;
}

export interface ExpertEventCandidate {
  name: string;
  description: string | null;
  participants: string[];
  location: string | null;
  evidence: string[];
  chunk_positions: number[];
  source_references: ExpertSourceReference[];
  confidence: number | null;
}

export interface ExpertRelationshipCandidate {
  source: string;
  target: string;
  relationship_type: string;
  evidence: string[];
  chunk_positions: number[];
  source_references: ExpertSourceReference[];
  confidence: number | null;
}

export interface ExpertExtractionResult {
  contract_version: number;
  role: ExpertRole;
  window: ExpertWindow;
  entities: ExpertEntityCandidate[];
  events: ExpertEventCandidate[];
  relationships: ExpertRelationshipCandidate[];
  unresolved_references: string[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface TokenBudgetState {
  limit: number;
  consumed: number;
}

export type TokenBudgetResult =
  | { ok: true; state: TokenBudgetState; remaining: number }
  | { ok: false; state: TokenBudgetState; remaining: number; reason: "budget-exceeded" };

export function isExpertRole(value: unknown): value is ExpertRole {
  return typeof value === "string" && (EXPERT_ROLES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isInteger(item));
}

function isSourceReferenceArray(value: unknown): value is ExpertSourceReference[] {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item) || typeof item.chunk_position !== "number" || !Number.isInteger(item.chunk_position)) {
      return false;
    }
    return item.quote === undefined || item.quote === null || typeof item.quote === "string";
  });
}

function isConfidence(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isEntityCandidate(value: unknown): value is ExpertEntityCandidate {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && value.name.trim().length > 0
    && typeof value.entity_type === "string" && value.entity_type.trim().length > 0
    && isStringArray(value.aliases)
    && isRecord(value.fields)
    && isStringArray(value.evidence)
    && isNumberArray(value.chunk_positions)
    && isSourceReferenceArray(value.source_references)
    && isConfidence(value.confidence);
}

function isEventCandidate(value: unknown): value is ExpertEventCandidate {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && value.name.trim().length > 0
    && (value.description === null || typeof value.description === "string")
    && isStringArray(value.participants)
    && (value.location === null || typeof value.location === "string")
    && isStringArray(value.evidence)
    && isNumberArray(value.chunk_positions)
    && isSourceReferenceArray(value.source_references)
    && isConfidence(value.confidence);
}

function isRelationshipCandidate(value: unknown): value is ExpertRelationshipCandidate {
  if (!isRecord(value)) return false;
  return typeof value.source === "string" && value.source.trim().length > 0
    && typeof value.target === "string" && value.target.trim().length > 0
    && typeof value.relationship_type === "string" && value.relationship_type.trim().length > 0
    && isStringArray(value.evidence)
    && isNumberArray(value.chunk_positions)
    && isSourceReferenceArray(value.source_references)
    && isConfidence(value.confidence);
}

export type ExpertResultValidation =
  | { valid: true; value: ExpertExtractionResult }
  | { valid: false; errors: string[] };

export function validateExpertExtractionResult(value: unknown): ExpertResultValidation {
  if (!isRecord(value)) return { valid: false, errors: ["result must be an object"] };

  const errors: string[] = [];
  if (value.contract_version !== EXPERT_CONTRACT_VERSION) errors.push("unsupported contract_version");
  if (!isExpertRole(value.role)) errors.push("role must be a supported expert role");

  const window = value.window;
  if (!isRecord(window)) {
    errors.push("window must be an object");
  } else {
    if (typeof window.window_id !== "string" || window.window_id.trim().length === 0) errors.push("window.window_id is required");
    if (typeof window.offset !== "number" || !Number.isInteger(window.offset) || window.offset < 0) errors.push("window.offset must be a non-negative integer");
    if (typeof window.limit !== "number" || !Number.isInteger(window.limit) || window.limit <= 0) errors.push("window.limit must be a positive integer");
    if (!isNumberArray(window.chunk_positions)) errors.push("window.chunk_positions must be an integer array");
  }

  if (!Array.isArray(value.entities) || !value.entities.every(isEntityCandidate)) errors.push("entities contains an invalid candidate");
  if (!Array.isArray(value.events) || !value.events.every(isEventCandidate)) errors.push("events contains an invalid candidate");
  if (!Array.isArray(value.relationships) || !value.relationships.every(isRelationshipCandidate)) errors.push("relationships contains an invalid candidate");
  if (!isStringArray(value.unresolved_references)) errors.push("unresolved_references must be a string array");

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: value as unknown as ExpertExtractionResult };
}

export function createTokenBudgetState(limit = DEFAULT_EXPERT_TOKEN_BUDGET): TokenBudgetState {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("Token budget limit must be a positive integer");
  return { limit, consumed: 0 };
}

export function consumeTokenBudget(state: TokenBudgetState, usage: TokenUsage): TokenBudgetResult {
  const total = Number.isFinite(usage.total_tokens) && usage.total_tokens >= 0
    ? Math.floor(usage.total_tokens)
    : Math.floor(Math.max(0, usage.input_tokens) + Math.max(0, usage.output_tokens) + Math.max(0, usage.thinking_tokens));
  const nextConsumed = state.consumed + total;
  const nextState = { ...state, consumed: nextConsumed };
  const remaining = Math.max(0, state.limit - nextConsumed);

  if (nextConsumed > state.limit) {
    return { ok: false, state: nextState, remaining, reason: "budget-exceeded" };
  }
  return { ok: true, state: nextState, remaining };
}
