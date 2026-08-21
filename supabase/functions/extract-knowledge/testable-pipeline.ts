export type ExtractionMode = 'bootstrap' | 'branch';

export interface ExtractionModeRequest {
  extraction_mode?: ExtractionMode;
  target_branch_id?: string | null;
  use_main?: boolean;
}

export interface ExtractionValidationResult {
  ok: true;
  mode: ExtractionMode;
  branchId: string | null;
} | {
  ok: false;
  error: string;
}

/** Mirrors the handler's JSON cleanup and fallback object extraction without I/O. */
export function parseExtractionJson<T>(responseText: string): T | null {
  try {
    let jsonText = responseText.trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    return JSON.parse(jsonText) as T;
  } catch {
    try {
      const start = responseText.indexOf('{');
      const end = responseText.lastIndexOf('}');
      if (start !== -1 && end > start) return JSON.parse(responseText.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
    return null;
  }
}

/** Validates the same Main/Branch combinations accepted by the Edge Function. */
export function validateExtractionMode(request: ExtractionModeRequest): ExtractionValidationResult {
  const mode = request.extraction_mode;
  const hasBranchId = Boolean(request.target_branch_id);
  const useMain = mode === 'bootstrap' || (request.use_main === true && !mode);

  if (mode === 'bootstrap' && hasBranchId) {
    return { ok: false, error: "extraction_mode='bootstrap' cannot specify target_branch_id." };
  }
  if (mode === 'branch' && !hasBranchId) {
    return { ok: false, error: "extraction_mode='branch' requires target_branch_id." };
  }
  if (!mode) {
    if (useMain && hasBranchId) {
      return { ok: false, error: 'cannot specify both use_main=true and target_branch_id.' };
    }
    if (!useMain && !hasBranchId) {
      return { ok: false, error: 'must specify either use_main=true or target_branch_id.' };
    }
  }

  return {
    ok: true,
    mode: mode || (useMain ? 'bootstrap' : 'branch'),
    branchId: hasBranchId ? request.target_branch_id! : null,
  };
}
