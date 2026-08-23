export interface RetrievalChunk {
  id: string;
  content: string;
  chapter_number: number | null;
  chapter_title: string | null;
  page: number | null;
  position: number;
  version_id: string;
  score: number;
  document_name?: string;
}

/**
 * Build conservative lexical terms for PostgreSQL simple full-text search.
 * The caller remains responsible for parameterizing the database query.
 */
export function buildRetrievalTerms(question: string): string[] {
  const terms = question
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[.,!?;:()[\]{}"'“”‘’]/g, ""))
    .map((term) => term.trim())
    .filter((term) => term.length > 1);

  return [...new Set(terms)];
}

/**
 * Keep primary hits first, then add nearby passages without allowing nearby
 * passages to displace an explicitly retrieved hit. This makes the enhanced
 * mode predictable and easy to disable.
 */
export function mergeAdjacentRetrievalChunks(
  primary: RetrievalChunk[],
  adjacent: RetrievalChunk[],
  topK: number,
): RetrievalChunk[] {
  const safeTopK = Math.max(1, Math.floor(topK));
  const maxResults = Math.min(20, safeTopK * 2);
  const primaryIds = new Set(primary.map((chunk) => chunk.id));
  const uniqueAdjacent = new Map<string, RetrievalChunk>();

  for (const chunk of adjacent) {
    if (primaryIds.has(chunk.id) || uniqueAdjacent.has(chunk.id)) continue;
    uniqueAdjacent.set(chunk.id, chunk);
  }

  const sortedAdjacent = [...uniqueAdjacent.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.version_id !== right.version_id) return left.version_id.localeCompare(right.version_id);
    return left.position - right.position;
  });

  return [...primary, ...sortedAdjacent].slice(0, maxResults);
}

export function adjacentPositions(position: number, radius = 1): number[] {
  const safeRadius = Math.max(1, Math.floor(radius));
  return Array.from({ length: safeRadius * 2 + 1 }, (_, index) => position - safeRadius + index)
    .filter((candidate) => candidate >= 0 && candidate !== position);
}
