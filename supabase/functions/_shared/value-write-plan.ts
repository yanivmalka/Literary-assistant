import type { NormalizedFieldObservation } from "./field-provenance.ts";

export interface ExistingKnowledgeValue {
  id: string;
  source_type: "ai" | "user";
  value_status: "active" | "superseded" | "rejected";
}

export interface ValueWritePlan {
  skip: boolean;
  supersede_ids: string[];
  writes: Array<{
    observation: NormalizedFieldObservation;
    value_status: "active" | "superseded";
    supersedes_value_id: string | null;
  }>;
}

/** Pure Main/Branch-scoped precedence and conflict plan used by persistence. */
export function buildValueWritePlan(
  existingValues: ExistingKnowledgeValue[],
  observations: NormalizedFieldObservation[],
): ValueWritePlan {
  if (existingValues.some((value) => value.source_type === "user" && value.value_status === "active")) {
    return { skip: true, supersede_ids: [], writes: [] };
  }
  const existingAi = existingValues.find((value) => value.source_type === "ai" && value.value_status === "active");
  return {
    skip: false,
    supersede_ids: existingAi ? [existingAi.id] : [],
    writes: observations.map((observation, index) => ({
      observation,
      value_status: index === 0 ? "active" : "superseded",
      supersedes_value_id: index === 0 ? existingAi?.id ?? null : null,
    })),
  };
}
