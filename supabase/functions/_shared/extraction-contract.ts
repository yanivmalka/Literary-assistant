export const EXTRACTION_SCHEMA_VERSION = "2" as const;

export type CanonicalEntityType =
  | "character"
  | "location"
  | "object"
  | "ability"
  | "magic_ability"
  | "organization";

export interface ExtractionNameUncertainty {
  is_uncertain?: boolean;
  confidence?: number | null;
  reason?: string | null;
}

export interface ExtractionSourceReference {
  chunk_position?: number | null;
  chunk_id?: string | null;
  page_number?: number | null;
  quote?: string | null;
  position_start?: number | null;
  position_end?: number | null;
}

export interface CanonicalEntity {
  name: string;
  type: CanonicalEntityType;
  description?: string | null;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  name_uncertainty?: ExtractionNameUncertainty | null;
  source_references?: ExtractionSourceReference[];
  evidence?: string[];
  chunk_positions?: number[];
  field_evidence?: Record<string, string[]>;
}

export interface CanonicalEntityReference {
  name: string;
  type?: CanonicalEntityType | null;
}

export interface CanonicalRelationship {
  source: string | CanonicalEntityReference;
  target: string | CanonicalEntityReference;
  type: string;
  description?: string | null;
  uncertainty?: number | null;
  source_references?: ExtractionSourceReference[];
  evidence?: string[];
  chunk_positions?: number[];
}

export interface CanonicalEvent {
  name: string;
  description?: string | null;
  participants?: Array<string | CanonicalEntityReference>;
  location?: string | CanonicalEntityReference | null;
  uncertainty?: number | null;
  source_references?: ExtractionSourceReference[];
  evidence?: string[];
  chunk_positions?: number[];
}

export interface CanonicalExtraction {
  schema_version: typeof EXTRACTION_SCHEMA_VERSION;
  entities: CanonicalEntity[];
  relationships?: CanonicalRelationship[];
  events?: CanonicalEvent[];
}

export function isCanonicalExtractionPayload(value: unknown): value is CanonicalExtraction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schema_version === EXTRACTION_SCHEMA_VERSION && Array.isArray(record.entities);
}

export function referenceName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name.trim() : "";
}

export function sourceReferencesToLegacyFields(
  references: ExtractionSourceReference[] | undefined,
  evidence: string[] | undefined,
  chunkPositions: number[] | undefined,
): { evidence?: string[]; chunk_positions?: number[] } {
  const quotes = [
    ...(evidence || []),
    ...(references || []).map((reference) => reference.quote || ""),
  ].filter(Boolean);
  const positions = [
    ...(chunkPositions || []),
    ...(references || [])
      .map((reference) => reference.chunk_position)
      .filter((position): position is number => typeof position === "number"),
  ];

  return {
    evidence: quotes.length > 0 ? [...new Set(quotes)] : undefined,
    chunk_positions: positions.length > 0 ? [...new Set(positions)] : undefined,
  };
}
