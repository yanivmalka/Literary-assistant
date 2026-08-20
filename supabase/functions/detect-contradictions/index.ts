// ============================================
// Edge Function: detect-contradictions
// Detects and saves knowledge-native contradictions
// Called after extract-knowledge completes
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectRequest {
  project_id: string;
  branch_id?: string | null;
}

function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, status }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Normalize a value for deduplication.
 */
function normalizeValue(value: unknown): string {
  if (typeof value === "string") {
    return value.toLowerCase().trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }
  if (value === null || value === undefined) {
    return "null";
  }
  return JSON.stringify(value).toLowerCase();
}

/**
 * Create a dedupe key to prevent duplicate contradictions.
 */
function createDedupeKey(
  projectId: string,
  branchId: string | null,
  entityId: string,
  fieldPath: string,
  normalizedA: string,
  normalizedB: string
): string {
  const [valA, valB] = [normalizedA, normalizedB].sort();
  const scope = branchId ? `branch:${branchId}` : "main";
  return `${projectId}:${scope}:${entityId}:${fieldPath}:${valA}:${valB}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as DetectRequest;

    // Validate required fields
    if (!body.project_id) {
      return errorResponse("Missing required field: project_id", 400);
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );

    const { data: { user: authenticatedUser }, error: authError } = await authClient.auth.getUser();

    if (authError || !authenticatedUser) {
      return errorResponse("Unauthorized", 401);
    }

    // Verify user owns the project
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", body.project_id)
      .eq("user_id", authenticatedUser.id)
      .maybeSingle();

    if (projectError || !project) {
      return errorResponse("Project not found or unauthorized", 403);
    }

    // If branch specified, validate it
    if (body.branch_id) {
      const { data: branch, error: branchError } = await supabase
        .from("knowledge_branches")
        .select("id")
        .eq("id", body.branch_id)
        .eq("project_id", body.project_id)
        .eq("user_id", authenticatedUser.id)
        .maybeSingle();

      if (branchError || !branch) {
        return errorResponse("Branch not found or unauthorized", 403);
      }
    }

    console.log(
      `[detect-contradictions] Starting detection for project ${body.project_id}, branch: ${body.branch_id || "Main"}`
    );

    // Query all active values for this scope
    const query = supabase
      .from("knowledge_entity_values")
      .select("id, entity_id, field_path, value_json, source_type")
      .eq("project_id", body.project_id)
      .eq("value_status", "active");

    if (body.branch_id) {
      query.eq("branch_id", body.branch_id);
    } else {
      query.is("branch_id", null);
    }

    const { data: allValues, error: queryError } = await query;

    if (queryError) {
      return errorResponse(`Failed to query values: ${queryError.message}`, 500);
    }

    const contradictions: Array<{
      project_id: string;
      branch_id: string | null;
      entity_id: string;
      field_path: string;
      value_a_id: string;
      value_b_id: string;
      contradiction_type: string;
      status: string;
      dedupe_key: string;
    }> = [];

    // Group values by (entity_id, field_path)
    const valuesByField = new Map<string, typeof allValues>();
    if (allValues) {
      for (const value of allValues) {
        const key = `${value.entity_id}:${value.field_path}`;
        if (!valuesByField.has(key)) {
          valuesByField.set(key, []);
        }
        valuesByField.get(key)!.push(value);
      }
    }

    // Detect contradictions between pairs of values
    for (const [fieldKey, values] of valuesByField.entries()) {
      if (values.length < 2) continue;

      const [entityId, fieldPath] = fieldKey.split(":");

      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const valA = values[i];
          const valB = values[j];

          // User values never conflict with each other
          if (valA.source_type === "user" && valB.source_type === "user") {
            continue;
          }

          // User value takes precedence; no contradiction
          if (valA.source_type === "user" || valB.source_type === "user") {
            continue;
          }

          // Both AI values; check for actual conflict
          const normA = normalizeValue(valA.value_json);
          const normB = normalizeValue(valB.value_json);

          if (normA === normB) continue;

          // Found a contradiction
          const dedupeKey = createDedupeKey(
            body.project_id,
            body.branch_id || null,
            entityId,
            fieldPath,
            normA,
            normB
          );

          contradictions.push({
            project_id: body.project_id,
            branch_id: body.branch_id || null,
            entity_id: entityId,
            field_path: fieldPath,
            value_a_id: valA.id,
            value_b_id: valB.id,
            contradiction_type: "attribute_conflict",
            status: "open",
            dedupe_key: dedupeKey,
          });
        }
      }
    }

    console.log(`[detect-contradictions] Found ${contradictions.length} potential contradictions`);

    // Save non-duplicate contradictions
    let saved = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contra of contradictions) {
      // Check if this contradiction already exists (dedupe)
      const { data: existing, error: checkError } = await supabase
        .from("knowledge_contradictions")
        .select("id, status")
        .eq("project_id", contra.project_id)
        .is("branch_id", contra.branch_id)
        .eq("entity_id", contra.entity_id)
        .eq("dedupe_key", contra.dedupe_key)
        .maybeSingle();

      if (checkError) {
        errors.push(`Failed to check dedupe for ${contra.dedupe_key}: ${checkError.message}`);
        continue;
      }

      if (existing) {
        skipped++;
        continue; // Already exists
      }

      // Insert new contradiction
      const { error: insertError } = await supabase
        .from("knowledge_contradictions")
        .insert(contra);

      if (insertError) {
        errors.push(`Failed to insert contradiction: ${insertError.message}`);
        continue;
      }

      saved++;
    }

    console.log(
      `[detect-contradictions] Saved ${saved} contradictions, skipped ${skipped} (duplicate dedupe_key)`
    );

    return new Response(
      JSON.stringify({
        success: true,
        detected: contradictions.length,
        saved,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[detect-contradictions] Error:", message);
    return errorResponse(`Error: ${message}`, 500);
  }
});
