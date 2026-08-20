// ============================================
// Resolution Suggestions Management
// Persists medium-confidence (70-99) consolidation suggestions for user review
// ============================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SignalType = 
  | 'prefix_match'
  | 'co_location'
  | 'matching_description'
  | 'matching_relationships'
  | 'name_similarity'
  | 'shared_attributes'
  | 'contradictory_context';

export interface ConsolidationSignal {
  type: SignalType;
  points: number;
  evidence?: string;
}

/**
 * Create a resolution suggestion for medium-confidence consolidation.
 * Called when consolidation score is 70-99 (not auto-merge, but worth reviewing).
 */
export async function createResolutionSuggestion(
  supabase: SupabaseClient<any, "public", any>,
  projectId: string,
  userId: string,
  entityAId: string,
  entityBId: string,
  score: number,
  signals: ConsolidationSignal[],
  rawExtractionId: string | null,
  branchId: string | null,
  proposedCanonicalName: string | null,
): Promise<string> {
  if (score < 70 || score >= 100) {
    throw new Error(`Invalid score for suggestion: ${score}. Must be 70-99.`);
  }

  // Ensure consistent ordering (A < B alphabetically or by UUID)
  const [aId, bId] = [entityAId, entityBId].sort();

  const { data: suggestion, error: createError } = await supabase
    .from("entity_resolution_suggestions")
    .insert({
      project_id: projectId,
      user_id: userId,
      entity_a_id: aId,
      entity_b_id: bId,
      score,
      confidence: scoreToConfidence(score),
      raw_extraction_id: rawExtractionId,
      branch_id: branchId,
      review_status: "pending",
      proposed_canonical_name: proposedCanonicalName,
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(`Failed to create resolution suggestion: ${createError.message}`);
  }

  // Add signals
  for (const signal of signals) {
    await addResolutionSignal(supabase, suggestion.id, signal.type, signal.points, signal.evidence || null);
  }

  console.log(`[resolution] Suggestion created: ${aId} ↔ ${bId} (score: ${score})`);
  return suggestion.id;
}

/**
 * Add a signal to a resolution suggestion.
 */
async function addResolutionSignal(
  supabase: SupabaseClient<any, "public", any>,
  suggestionId: string,
  signalType: SignalType,
  points: number,
  evidence: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("entity_resolution_signals")
    .insert({
      suggestion_id: suggestionId,
      signal_type: signalType,
      points,
      evidence_text: evidence,
    });

  if (error) {
    console.error(`Failed to add signal: ${error.message}`);
  }
}

/**
 * Get all pending suggestions for a project.
 */
export async function getPendingSuggestions(
  supabase: SupabaseClient<any, "public", any>,
  projectId: string,
): Promise<Array<any>> {
  const { data, error } = await supabase
    .from("entity_resolution_suggestions")
    .select(`
      *,
      signals: entity_resolution_signals(*)
    `)
    .eq("project_id", projectId)
    .eq("review_status", "pending")
    .order("score", { ascending: false });

  if (error) {
    console.error(`Failed to fetch pending suggestions: ${error.message}`);
    return [];
  }

  return data || [];
}

/**
 * Get a specific suggestion with all details.
 */
export async function getResolutionSuggestion(
  supabase: SupabaseClient<any, "public", any>,
  suggestionId: string,
): Promise<any | null> {
  const { data, error } = await supabase
    .from("entity_resolution_suggestions")
    .select(`
      *,
      entity_a: entity_a_id (id, canonical_name, entity_type, description),
      entity_b: entity_b_id (id, canonical_name, entity_type, description),
      signals: entity_resolution_signals(*)
    `)
    .eq("id", suggestionId)
    .single();

  if (error) {
    console.error(`Failed to fetch suggestion: ${error.message}`);
    return null;
  }

  return data;
}

/**
 * User approves a consolidation suggestion.
 * The entities can now be merged if desired.
 */
export async function approveSuggestion(
  supabase: SupabaseClient<any, "public", any>,
  suggestionId: string,
  proposedCanonicalName: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("entity_resolution_suggestions")
    .update({
      review_status: "approved",
      proposed_canonical_name: proposedCanonicalName,
      user_decision_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);

  if (error) {
    throw new Error(`Failed to approve suggestion: ${error.message}`);
  }

  console.log(`[resolution] Suggestion approved: ${suggestionId}`);
}

/**
 * User rejects a consolidation suggestion.
 * The entities will remain separate.
 */
export async function rejectSuggestion(
  supabase: SupabaseClient<any, "public", any>,
  suggestionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("entity_resolution_suggestions")
    .update({
      review_status: "rejected",
      user_decision_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);

  if (error) {
    throw new Error(`Failed to reject suggestion: ${error.message}`);
  }

  console.log(`[resolution] Suggestion rejected: ${suggestionId}`);
}

/**
 * Mark a suggestion as implemented (merge has been applied).
 */
export async function markSuggestionImplemented(
  supabase: SupabaseClient<any, "public", any>,
  suggestionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("entity_resolution_suggestions")
    .update({
      review_status: "implemented",
      user_decision_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);

  if (error) {
    throw new Error(`Failed to mark suggestion as implemented: ${error.message}`);
  }

  console.log(`[resolution] Suggestion implemented: ${suggestionId}`);
}

/**
 * Delete a suggestion (e.g., after being implemented or if duplicate).
 */
export async function deleteSuggestion(
  supabase: SupabaseClient<any, "public", any>,
  suggestionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("entity_resolution_suggestions")
    .delete()
    .eq("id", suggestionId);

  if (error) {
    throw new Error(`Failed to delete suggestion: ${error.message}`);
  }

  console.log(`[resolution] Suggestion deleted: ${suggestionId}`);
}

/**
 * Convert a consolidation score to confidence level.
 */
function scoreToConfidence(score: number): 'low' | 'medium' | 'high' {
  if (score < 75) return 'low';
  if (score < 90) return 'medium';
  return 'high';
}

/**
 * Get statistics on resolution suggestions for a project.
 */
export async function getResolutionStats(
  supabase: SupabaseClient<any, "public", any>,
  projectId: string,
): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  implemented: number;
  average_score: number;
}> {
  const { data, error } = await supabase
    .from("entity_resolution_suggestions")
    .select("review_status, score")
    .eq("project_id", projectId);

  if (error) {
    console.error(`Failed to fetch stats: ${error.message}`);
    return { total: 0, pending: 0, approved: 0, rejected: 0, implemented: 0, average_score: 0 };
  }

  const suggestions = data || [];
  const pending = suggestions.filter(s => s.review_status === 'pending').length;
  const approved = suggestions.filter(s => s.review_status === 'approved').length;
  const rejected = suggestions.filter(s => s.review_status === 'rejected').length;
  const implemented = suggestions.filter(s => s.review_status === 'implemented').length;
  const average_score = suggestions.length > 0
    ? Math.round(suggestions.reduce((sum, s) => sum + s.score, 0) / suggestions.length)
    : 0;

  return {
    total: suggestions.length,
    pending,
    approved,
    rejected,
    implemented,
    average_score,
  };
}
