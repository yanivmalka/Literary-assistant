// ============================================
// Entity Consolidation Rules
// ============================================
// Determines when two entity mentions should be consolidated into one.
// Uses evidence-based decision making: prefer False Negatives over False Positives.
// ============================================

/**
 * Evidence types that support consolidation of two entities.
 */
export enum ConsolidationEvidence {
  /**
   * STRONG: One name is a clear prefix of another (first name + surname).
   * Example: "ליאו" is a prefix of "ליאו פרוסט"
   * Score: 80 points
   */
  PREFIX_MATCH = "prefix_match",

  /**
   * STRONG: Both names appear in the same chunk (co-location).
   * Example: "ליאו פרוסט" and "ליאו" mentioned in same paragraph
   * Score: 70 points
   */
  CO_LOCATION = "co_location",

  /**
   * MODERATE: Same physical description attributes.
   * Example: Both "ליאו" and "ליאו פרוסט" have "eye_color: blue"
   * Score: 50 points
   */
  MATCHING_DESCRIPTION = "matching_description",

  /**
   * MODERATE: Share the same relationships/connections.
   * Example: Both connected to "רייבן" with "knows" relationship
   * Score: 50 points
   */
  MATCHING_RELATIONSHIPS = "matching_relationships",

  /**
   * WEAK: Names are very similar (Levenshtein distance < 3).
   * Example: "ליאו" vs "ליו" (typo)
   * Score: 20 points
   */
  NAME_SIMILARITY = "name_similarity",

  /**
   * EXPERT: User explicitly confirmed consolidation.
   * Example: User merged "ליאו" into "ליאו פרוסט" in UI
   * Score: 100 points (automatic consolidation)
   */
  EXPLICIT_USER_ACTION = "explicit_user_action",
}

/**
 * Configuration for consolidation thresholds.
 */
export const CONSOLIDATION_THRESHOLDS = {
  /**
   * Minimum score to automatically consolidate (without user confirmation).
   * HIGH threshold = prefer keeping entities separate.
   * Set to 100+ to require user confirmation for all non-explicit consolidations.
   */
  AUTO_CONSOLIDATE_THRESHOLD: 100,

  /**
   * Score for each evidence type.
   */
  EVIDENCE_SCORES: {
    [ConsolidationEvidence.PREFIX_MATCH]: 80,
    [ConsolidationEvidence.CO_LOCATION]: 70,
    [ConsolidationEvidence.MATCHING_DESCRIPTION]: 50,
    [ConsolidationEvidence.MATCHING_RELATIONSHIPS]: 50,
    [ConsolidationEvidence.NAME_SIMILARITY]: 20,
    [ConsolidationEvidence.EXPLICIT_USER_ACTION]: 100,
  },

  /**
   * Score needed to SUGGEST consolidation (show in preview UI).
   * Lower than AUTO_CONSOLIDATE_THRESHOLD so user can review proposals.
   */
  SUGGEST_CONSOLIDATION_THRESHOLD: 70,

  /**
   * Score needed to NOT suggest consolidation (too weak signal).
   */
  IGNORE_CONSOLIDATION_THRESHOLD: 20,
} as const;

/**
 * Calculate if two character names should be considered for consolidation.
 * Returns: { shouldConsolidate, score, evidence[], reason }
 */
export interface ConsolidationProposal {
  entityA_id: string;
  entityA_name: string;
  entityB_id: string;
  entityB_name: string;
  should_consolidate: boolean; // true = meets SUGGEST threshold
  score: number; // 0-100+
  evidence: ConsolidationEvidence[];
  confidence: "high" | "medium" | "low";
  reason: string;
  canonical_name: string; // which name should be canonical (longer one)
  alias_name: string; // which becomes the alias
}

/**
 * Detect if one name is a clear prefix of another.
 * Examples:
 *   - "ליאו" → "ליאו פרוסט" = YES
 *   - "ליאו" → "ליאו סייג'" = YES
 *   - "פרוסט" → "ליאו פרוסט" = NO (suffix, not prefix)
 *   - "ליא" → "ליאו" = NO (partial word)
 */
export function isPrefixMatch(shortName: string, longName: string): boolean {
  const short = shortName.trim();
  const long = longName.trim();

  // Exact match → not a prefix relationship
  if (short === long) return false;

  // Check if short name is a prefix followed by space or quotes
  if (long.startsWith(short + " ") || long.startsWith(short + "'") || long.startsWith(short + "\"")) {
    return true;
  }

  return false;
}

/**
 * Simple Levenshtein distance for name similarity.
 * Returns distance (lower = more similar).
 */
export function levenshteinDistance(a: string, b: string): number {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];

  if (shorter.length === 0) return longer.length;

  const distances: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    distances[i] = i;
  }

  for (let j = 1; j <= longer.length; j++) {
    let prevDiag = distances[0];
    distances[0] = j;

    for (let i = 1; i <= shorter.length; i++) {
      const oldDiag = distances[i];
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
      distances[i] = Math.min(distances[i] + 1, distances[i - 1] + 1, prevDiag + cost);
      prevDiag = oldDiag;
    }
  }

  return distances[shorter.length];
}

/**
 * Score consolidation evidence between two entities.
 * Used for both automatic filtering and preview suggestions.
 */
export function scoreConsolidation(
  nameA: string,
  nameB: string,
  commonChunkPositions: boolean = false,
  matchingDescription: boolean = false,
  matchingRelationships: boolean = false
): ConsolidationProposal["score"] {
  let score = 0;
  const evidence: ConsolidationEvidence[] = [];

  // PREFIX MATCH (strongest signal for name consolidation)
  const shortName = nameA.length <= nameB.length ? nameA : nameB;
  const longName = nameA.length > nameB.length ? nameA : nameB;
  if (isPrefixMatch(shortName, longName)) {
    score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES[ConsolidationEvidence.PREFIX_MATCH];
    evidence.push(ConsolidationEvidence.PREFIX_MATCH);
  }

  // CO-LOCATION
  if (commonChunkPositions) {
    score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES[ConsolidationEvidence.CO_LOCATION];
    evidence.push(ConsolidationEvidence.CO_LOCATION);
  }

  // MATCHING DESCRIPTION
  if (matchingDescription) {
    score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES[ConsolidationEvidence.MATCHING_DESCRIPTION];
    evidence.push(ConsolidationEvidence.MATCHING_DESCRIPTION);
  }

  // MATCHING RELATIONSHIPS
  if (matchingRelationships) {
    score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES[ConsolidationEvidence.MATCHING_RELATIONSHIPS];
    evidence.push(ConsolidationEvidence.MATCHING_RELATIONSHIPS);
  }

  // NAME SIMILARITY (weakest signal)
  const distance = levenshteinDistance(nameA, nameB);
  if (distance > 0 && distance < 3) {
    score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES[ConsolidationEvidence.NAME_SIMILARITY];
    evidence.push(ConsolidationEvidence.NAME_SIMILARITY);
  }

  return score;
}

