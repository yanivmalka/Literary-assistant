// ============================================
// Edge Function: extract-knowledge
// Production version: Extracts entities from document chunks via Gemini (with multi-model fallback).
// Fetches chunks internally from DB (like the old Express route).
// Normalizes and saves to knowledge layer tables.
// Idempotent via UNIQUE constraints (upsert).
// Uses service_role key to bypass RLS.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiWithFallback } from "../_shared/gemini-client.ts";
import { DEFAULT_MODEL } from "../_shared/gemini-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;

// ============================================
// Types
// ============================================

interface ExtractRequest {
  version_id: string;
  document_id: string;
  project_id: string;
  user_id: string;
  offset?: number;
  limit?: number;
  target_branch_id?: string; // If provided, extracted entities go to branch instead of Main
}

interface ExtractedEntity {
  name: string;
  type?: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  relationships?: string[];
  abilities?: string[];
  description?: string;
  significance?: string;
  evidence?: string[];
  chunk_positions?: number[];
  users?: string[];
  members?: string[];
  purpose?: string | null;
  // Character fields
  age?: string | null;
  gender?: string | null;
  height?: string | null;
  hair_color?: string | null;
  eye_color?: string | null;
  face_structure?: string | null;
  common_clothing?: string | null;
  scars?: string | null;
  tattoos?: string | null;
  narrative_role?: string | null;
  // Location fields
  location_type?: string | null;
  parent_location?: string | null;
  continent?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  narrative_importance?: string | null;
  related_characters?: string | null;
  // Object fields
  object_type?: string | null;
  appearance?: string | null;
  materials?: string | null;
  special_properties?: string | null;
  origin?: string | null;
  current_location?: string | null;
  owners?: string | null;
  // Ability fields
  ability_type?: string | null;
  mechanism?: string | null;
  activation_conditions?: string | null;
  limitations?: string | null;
  cost?: string | null;
  power_level?: string | null;
  magic_system?: string | null;
  // Magic system fields
  source?: string | null;
  rules?: string | null;
  requirements?: string | null;
  unique_properties?: string | null;
  world_impact?: string | null;
}

interface ExtractedEvent {
  description: string;
  name?: string;
  participants?: string[];
  location?: string | null;
  what_happened?: string;
  evidence?: string[];
  chunk_positions?: number[];
}

interface ExtractedRelationship {
  character_a: string;
  character_b: string;
  relationship_type: string;
  evidence?: string[];
  chunk_positions?: number[];
}

interface GeminiExtraction {
  characters?: ExtractedEntity[];
  locations?: ExtractedEntity[];
  objects?: ExtractedEntity[];
  magic_systems?: ExtractedEntity[];
  abilities?: ExtractedEntity[];
  organizations?: ExtractedEntity[];
  events?: ExtractedEvent[];
  relationships?: ExtractedRelationship[];
}

// ============================================
// Prompt Builder (same as PoC)
// ============================================

function buildPrompt(chunks: { position: number; content: string }[]): string {
  const chunksText = chunks
    .map((c) => `[chunk ${c.position}]: ${c.content}`)
    .join("\n\n");

  return `You are a literary entity extractor for Hebrew fiction. Extract entities from these text chunks.

RULES:
- Return entity names in Hebrew exactly as written.
- Do NOT invent information. Only extract what appears in the text.
- If information about a field is NOT in the text, set it to null.
- Keep evidence SHORT (max 10 words each, max 2 per entity).
- Be concise.

Return JSON with these arrays (omit empty arrays):

- characters: [{name, aliases[], age, gender, height, hair_color, eye_color, face_structure, common_clothing, scars, tattoos, description, narrative_role, evidence[], chunk_positions[]}]
- locations: [{name, aliases[], location_type, parent_location, description, continent, country, region, city, narrative_importance, related_characters, evidence[], chunk_positions[]}]
- objects: [{name, aliases[], object_type, description, appearance, materials, special_properties, origin, current_location, owners, narrative_importance, evidence[], chunk_positions[]}]
- magic_systems: [{name, aliases[], description, source, users, rules, requirements, limitations, cost, unique_properties, world_impact, evidence[], chunk_positions[]}]
- abilities: [{name, aliases[], ability_type, description, mechanism, activation_conditions, limitations, cost, power_level, magic_system, users, evidence[], chunk_positions[]}]
- organizations: [{name, aliases[], description, members[], purpose, evidence[], chunk_positions[]}]
- events: [{description, name, participants[], location, what_happened, evidence[], chunk_positions[]}]
- relationships: [{character_a, character_b, relationship_type, evidence[], chunk_positions[]}]

IMPORTANT — Character physical attributes:
For every character, pay special attention to these 4 fields: age, height, eye_color, hair_color.
- Extract them even when mentioned indirectly. Examples:
  "חגג את יום הולדתו השמונה עשרה" → age: "18"
  "התנשא לגובה של מטר ושמונים" → height: "1.80 מ'"
  "שערו השחור נפל על עיניו" → hair_color: "שחור"
  "הביט בה בעיניים ירוקות" → eye_color: "ירוק"
- If a description is vague and cannot be converted to a concrete value (e.g. "גבוה למדי"), set the field to null. Do NOT guess a numeric value.
- If no information exists for a field, set it to null.

Notes:
- A magic_system is a system or method of magic (e.g. "the Force", "Allomancy"). An ability is a specific power a character can use.
- For each entity, only include fields that have actual information from the text. Fields without information should be null or omitted.

TEXT:
${chunksText}`;
}

// ============================================
// Normalization (same as PoC)
// ============================================

interface NormalizedEntity {
  canonical_name: string;
  entity_type: string;
  entity_types: string[];
  description: string | null;
  attributes: Record<string, unknown>;
  structured_fields: Record<string, unknown>;
  aliases: string[];
  evidence: string[];
  chunk_positions: number[];
}

/** Build structured_fields from the entity's flat fields based on its type */
function buildStructuredFields(type: string, entity: ExtractedEntity): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  fields.name = entity.name || null;
  fields.description = entity.description || entity.significance || null;

  if (type === "character") {
    fields.age = entity.age || null;
    fields.gender = entity.gender || null;
    fields.height = entity.height || null;
    fields.hair_color = entity.hair_color || null;
    fields.eye_color = entity.eye_color || null;
    fields.face_structure = entity.face_structure || null;
    fields.cheekbones = null;
    fields.eye_shape = null;
    fields.forehead = null;
    fields.nose = null;
    fields.beard_mustache = null;
    fields.common_clothing = entity.common_clothing || null;
    fields.jewelry = null;
    fields.scars = entity.scars || null;
    fields.tattoos = entity.tattoos || null;
    fields.other_visual_features = null;
    fields.narrative_role = entity.narrative_role || null;
    fields.narrative_impact = null;
  } else if (type === "location") {
    fields.location_type = entity.location_type || null;
    fields.parent_location = entity.parent_location || null;
    fields.continent = entity.continent || null;
    fields.country = entity.country || null;
    fields.region = entity.region || null;
    fields.city = entity.city || null;
    fields.narrative_impact = null;
    fields.narrative_importance = entity.narrative_importance || null;
    fields.related_events = null;
    fields.related_characters = entity.related_characters || null;
  } else if (type === "object") {
    fields.object_type = entity.object_type || null;
    fields.appearance = entity.appearance || null;
    fields.materials = entity.materials || null;
    fields.special_properties = entity.special_properties || null;
    fields.origin = entity.origin || null;
    fields.current_location = entity.current_location || null;
    fields.owners = entity.owners || null;
    fields.narrative_importance = entity.narrative_importance || null;
    fields.narrative_impact = null;
    fields.related_characters = entity.related_characters || null;
    fields.related_events = null;
  } else if (type === "ability") {
    fields.ability_type = entity.ability_type || null;
    fields.mechanism = entity.mechanism || null;
    fields.activation_conditions = entity.activation_conditions || null;
    fields.limitations = entity.limitations || null;
    fields.cost = entity.cost || null;
    fields.power_level = entity.power_level || null;
    fields.magic_system = entity.magic_system || null;
    fields.users = entity.users ? entity.users.join(", ") : null;
    fields.narrative_impact = null;
    fields.related_events = null;
  } else if (type === "magic") {
    fields.source = entity.source || null;
    fields.users = entity.users ? entity.users.join(", ") : null;
    fields.rules = entity.rules || null;
    fields.requirements = entity.requirements || null;
    fields.limitations = entity.limitations || null;
    fields.cost = entity.cost || null;
    fields.unique_properties = entity.unique_properties || null;
    fields.world_impact = entity.world_impact || null;
    fields.narrative_impact = null;
    fields.related_characters = null;
  }
  // organization — store what we have
  if (type === "organization") {
    // Organizations map to whatever we have
    fields.users = entity.members ? entity.members.join(", ") : null;
  }

  return fields;
}

function normalizeEntities(extraction: GeminiExtraction): NormalizedEntity[] {
  const entityMap = new Map<string, NormalizedEntity>();

  function addEntity(name: string, type: string, entity: ExtractedEntity) {
    const key = name.trim().toLowerCase();
    if (!key) return;

    const existing = entityMap.get(key);
    if (existing) {
      if (!existing.entity_types.includes(type)) existing.entity_types.push(type);
      if (entity.attributes) existing.attributes = { ...existing.attributes, ...entity.attributes };
      if (entity.evidence) {
        for (const e of entity.evidence) {
          if (!existing.evidence.includes(e)) existing.evidence.push(e);
        }
      }
      if (entity.chunk_positions) {
        for (const p of entity.chunk_positions) {
          if (!existing.chunk_positions.includes(p)) existing.chunk_positions.push(p);
        }
      }
      if (entity.aliases) {
        for (const a of entity.aliases) {
          if (a && !existing.aliases.includes(a)) existing.aliases.push(a);
        }
      }
      if (entity.description && !existing.description) existing.description = entity.description;
      if (entity.significance && !existing.description) existing.description = entity.significance;
      if (entity.abilities && entity.abilities.length > 0) {
        existing.attributes.abilities = [...((existing.attributes.abilities as string[]) || []), ...entity.abilities];
      }
      if (entity.relationships && entity.relationships.length > 0) {
        existing.attributes.relationships = [...((existing.attributes.relationships as string[]) || []), ...entity.relationships];
      }
      if (entity.users && entity.users.length > 0) {
        existing.attributes.users = [...((existing.attributes.users as string[]) || []), ...entity.users];
      }
      if (entity.members && entity.members.length > 0) {
        existing.attributes.members = [...((existing.attributes.members as string[]) || []), ...entity.members];
      }
      if (entity.purpose) existing.attributes.purpose = entity.purpose;
      // Merge structured_fields: keep existing non-null values, add new ones
      const newStructured = buildStructuredFields(type, entity);
      for (const [k, v] of Object.entries(newStructured)) {
        if (v != null && existing.structured_fields[k] == null) {
          existing.structured_fields[k] = v;
        }
      }
    } else {
      const attrs: Record<string, unknown> = { ...(entity.attributes || {}) };
      if (entity.abilities && entity.abilities.length > 0) attrs.abilities = entity.abilities;
      if (entity.relationships && entity.relationships.length > 0) attrs.relationships = entity.relationships;
      if (entity.users && entity.users.length > 0) attrs.users = entity.users;
      if (entity.members && entity.members.length > 0) attrs.members = entity.members;
      if (entity.purpose) attrs.purpose = entity.purpose;

      entityMap.set(key, {
        canonical_name: name.trim(),
        entity_type: type,
        entity_types: [type],
        description: entity.description || entity.significance || null,
        attributes: attrs,
        structured_fields: buildStructuredFields(type, entity),
        aliases: (entity.aliases || []).filter(Boolean),
        evidence: entity.evidence || [],
        chunk_positions: entity.chunk_positions || [],
      });
    }
  }

  for (const char of extraction.characters || []) addEntity(char.name, "character", char);
  for (const loc of extraction.locations || []) addEntity(loc.name, "location", loc);
  for (const obj of extraction.objects || []) addEntity(obj.name, "object", obj);
  for (const magic of extraction.magic_systems || []) addEntity(magic.name, "magic", magic);
  for (const ab of extraction.abilities || []) addEntity(ab.name, "ability", ab);
  for (const org of extraction.organizations || []) addEntity(org.name, "organization", org);

  return Array.from(entityMap.values());
}

// ============================================
// Error helper
// ============================================

function errorResponse(message: string, status: number, details?: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, status, details: details || null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ExtractRequest;

    if (!body.version_id || !body.project_id || !body.document_id || !body.user_id) {
      return errorResponse("Missing version_id, project_id, document_id, or user_id", 400);
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return errorResponse("GEMINI_API_KEY not configured", 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const offset = body.offset ?? 0;
    const limit = body.limit ?? BATCH_SIZE;

    // ==============================
    // Step 1: Fetch chunks from DB
    // ==============================
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, content, position")
      .eq("version_id", body.version_id)
      .order("position", { ascending: true })
      .range(offset, offset + limit - 1);

    if (chunksError || !chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, done: true, saved: 0, entities_found: 0, next_offset: offset }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunkData = chunks.map((c: { position: number; content: string }) => ({
      position: c.position,
      content: c.content,
    }));

    // ==============================
    // Step 2: Call Gemini (with multi-model fallback)
    // ==============================
    const prompt = buildPrompt(chunkData);
    const totalChars = chunkData.reduce((sum, c) => sum + c.content.length, 0);

    const geminiResult = await callGeminiWithFallback(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
          responseMimeType: "application/json",
        },
      },
      geminiApiKey,
      { timeoutMs: 60_000 }
    );

    if (!geminiResult.success) {
      console.error("[extract-knowledge] Gemini fallback chain exhausted:", JSON.stringify(geminiResult.fallbackChain));
      return errorResponse(
        geminiResult.error,
        geminiResult.status,
        geminiResult.details
      );
    }

    const { data: geminiData, modelUsed, latencyMs } = geminiResult;
    // Extract text from response - handle multi-part responses (thinking models return thought + text parts)
    const candidate = (geminiData as any)?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    // Filter out thought parts (they have thought: true) and get only text output parts
    const textParts = parts.filter((p: any) => p.text && !p.thought);
    const responseText = textParts.length > 0
      ? textParts.map((p: any) => p.text).join("")
      : parts.map((p: any) => p.text || "").filter(Boolean).join("");
    console.log(`[extract-knowledge] Model: ${modelUsed}, Response length: ${responseText.length}, Parts: ${parts.length}, TextParts: ${textParts.length}`);

    // If response is empty, skip this batch (model returned no content - likely MAX_TOKENS with no output)
    if (!responseText || responseText.trim().length === 0) {
      console.error(`[extract-knowledge] Empty response from ${modelUsed}. Parts dump: ${JSON.stringify(parts.map((p: any) => ({ hasText: !!p.text, hasThought: !!p.thought, textLen: p.text?.length || 0 })))}`);
      // Return success with empty results so the loop continues to next batch
      const done = chunks.length < limit;
      return new Response(
        JSON.stringify({ success: true, done, next_offset: offset + limit, telemetry: { model: modelUsed, latency_ms: latencyMs }, summary: { entities_saved: 0, mentions_saved: 0, aliases_saved: 0, relationships_saved: 0, events_saved: 0, event_mentions_saved: 0, event_participants_saved: 0, raw_extraction_id: null, normalized_entity_count: 0 } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const usage = (geminiData as Record<string, unknown>)?.usageMetadata || {};

    // Log fallback info if we didn't use the primary model
    if (modelUsed !== DEFAULT_MODEL) {
      console.log(`[extract-knowledge] Used fallback model: ${modelUsed} (primary: ${DEFAULT_MODEL})`);
      console.log(`[extract-knowledge] Fallback chain: ${JSON.stringify(geminiResult.fallbackChain)}`);
    }


    // ==============================
    // Step 3: Parse JSON � skip batch on failure (do not stop extraction)
    // ==============================
    let extraction: GeminiExtraction;
    try {
      // Strip code block markers if present
      let jsonText = responseText.trim();
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      
      // Try direct parse
      extraction = JSON.parse(jsonText);
    } catch {
      // Try finding JSON object in text
      try {
        const start = responseText.indexOf("{");
        const end = responseText.lastIndexOf("}");
        if (start !== -1 && end > start) {
          extraction = JSON.parse(responseText.slice(start, end + 1));
        } else {
          throw new Error("no JSON object found");
        }
      } catch {
        // Skip this batch � return success so the loop continues
        console.warn(`[extract-knowledge] Skipping batch offset=${offset}: unparseable JSON (len=${responseText.length})`);
        const done = chunks.length < limit;
        return new Response(
          JSON.stringify({ success: true, done, next_offset: offset + limit, telemetry: { model: modelUsed, latency_ms: latencyMs, skipped: true }, summary: { entities_saved: 0, events_saved: 0, skipped_parse_error: true } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ==============================
    // Step 4: Save raw extraction
    // ==============================
    const { data: rawExtraction, error: rawError } = await supabase
      .from("raw_extractions")
      .insert({
        project_id: body.project_id,
        document_id: body.document_id,
        version_id: body.version_id,
        user_id: body.user_id,
        model: modelUsed,
        raw_response: extraction,
        input_tokens: (usage as Record<string, unknown>).promptTokenCount ?? null,
        output_tokens: (usage as Record<string, unknown>).candidatesTokenCount ?? null,
        thinking_tokens: (usage as Record<string, unknown>).thoughtsTokenCount ?? null,
        total_tokens: (usage as Record<string, unknown>).totalTokenCount ?? null,
        cached_tokens: (usage as Record<string, unknown>).cachedContentTokenCount ?? null,
        latency_ms: latencyMs,
        chunks_count: chunks.length,
      })
      .select("id")
      .single();

    if (rawError) {
      return errorResponse(`Failed to save raw extraction: ${rawError.message}`, 500);
    }

    const rawExtractionId = rawExtraction.id;

    // ==============================
    // Step 5: Normalize & upsert entities (incremental merge)
    // Priority: user data > existing extracted data > new extracted data > null
    // ==============================
    const normalizedEntities = normalizeEntities(extraction);
    const entityIdMap = new Map<string, string>();
    let entitiesSaved = 0;
    let mentionsSaved = 0;
    let aliasesSaved = 0;
    let branchEntitiesSaved = 0;

    for (const entity of normalizedEntities) {
      // Check if entity already exists for this project+user+name+type
      const { data: existing } = await supabase
        .from("knowledge_entities")
        .select("id, structured_fields, attributes, source, description, entity_types")
        .eq("project_id", body.project_id)
        .eq("user_id", body.user_id)
        .eq("layer", "main")
        .ilike("canonical_name", entity.canonical_name)
        .maybeSingle();

      let entityId: string;

      if (existing) {
        // --- Incremental merge: don't overwrite existing non-null values ---
        const existingStructured = (existing.structured_fields || {}) as Record<string, unknown>;
        const existingAttrs = (existing.attributes || {}) as Record<string, unknown>;
        const isUserSource = existing.source === "user";

        // Merge structured_fields: only fill in null fields (never overwrite user data or previous values)
        const mergedStructured: Record<string, unknown> = { ...existingStructured };
        for (const [key, newVal] of Object.entries(entity.structured_fields)) {
          if (newVal == null) continue; // AI returned null — skip
          const existingVal = existingStructured[key];
          if (existingVal != null && existingVal !== "") continue; // already has a value — keep it
          // If entity was user-created, only fill fields that user left empty
          mergedStructured[key] = newVal;
        }

        // Merge attributes: same logic — only add keys that don't exist or are null
        const mergedAttrs: Record<string, unknown> = { ...existingAttrs };
        for (const [key, newVal] of Object.entries(entity.attributes)) {
          if (newVal == null) continue;
          if (mergedAttrs[key] != null) continue;
          mergedAttrs[key] = newVal;
        }

        // Merge entity_types array
        const existingTypes = (existing.entity_types || []) as string[];
        const mergedTypes = [...new Set([...existingTypes, ...entity.entity_types])];

        // Merge description: only if currently null
        const mergedDescription = existing.description || entity.description;

        const { error: updateError } = await supabase
          .from("knowledge_entities")
          .update({
            structured_fields: mergedStructured,
            attributes: mergedAttrs,
            entity_types: mergedTypes,
            description: mergedDescription,
            raw_extraction_id: rawExtractionId,
            updated_at: new Date().toISOString(),
            // Keep source as-is if user created it
            ...(isUserSource ? {} : { source: "ai" }),
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error(`Failed to update entity '${entity.canonical_name}':`, updateError.message);
          continue;
        }

        entityId = existing.id;
      } else {
        // --- New entity: insert fresh ---
        const { data: inserted, error: insertError } = await supabase
          .from("knowledge_entities")
          .insert({
            project_id: body.project_id,
            document_id: body.document_id,
            version_id: body.version_id,
            user_id: body.user_id,
            canonical_name: entity.canonical_name,
            entity_type: entity.entity_type,
            entity_types: entity.entity_types,
            description: entity.description,
            attributes: entity.attributes,
            raw_extraction_id: rawExtractionId,
            updated_at: new Date().toISOString(),
            layer: "main",
            structured_fields: entity.structured_fields,
            source: "ai",
          })
          .select("id")
          .single();

        if (insertError || !inserted) {
          console.error(`Failed to insert entity '${entity.canonical_name}':`, insertError?.message);
          continue;
        }

        entityId = inserted.id;
      }

      entityIdMap.set(entity.canonical_name.toLowerCase(), entityId);
      entitiesSaved++;

      // If target_branch_id is provided, also copy entity into branch for user review
      if (body.target_branch_id) {
        const { error: branchError } = await supabase
          .from("knowledge_branch_entities")
          .upsert(
            {
              branch_id: body.target_branch_id,
              source_entity_id: entityId,
              project_id: body.project_id,
              user_id: body.user_id,
              canonical_name: entity.canonical_name,
              entity_type: entity.entity_type,
              entity_types: entity.entity_types || [],
              description: entity.description || null,
              attributes: entity.attributes || {},
              structured_fields: entity.structured_fields || {},
              is_modified: false,
              modified_fields: [],
            },
            { onConflict: "branch_id,source_entity_id" }
          );
        if (branchError) {
          console.error(`Failed to copy entity '${entity.canonical_name}' to branch:`, branchError.message);
        } else {
          branchEntitiesSaved++;
        }
      }

      // Mentions
      for (const pos of entity.chunk_positions) {
        const ev = entity.evidence.length > 0 ? entity.evidence[0]?.slice(0, 500) : null;
        await supabase.from("knowledge_entity_mentions").upsert(
          { entity_id: entityId, chunk_position: pos, evidence: ev },
          { onConflict: "entity_id,chunk_position,evidence" }
        );
        mentionsSaved++;
      }

      // Additional evidence as mentions
      if (entity.evidence.length > 1 && entity.chunk_positions.length > 0) {
        for (let i = 1; i < entity.evidence.length; i++) {
          await supabase.from("knowledge_entity_mentions").upsert(
            { entity_id: entityId, chunk_position: entity.chunk_positions[0], evidence: entity.evidence[i]?.slice(0, 500) },
            { onConflict: "entity_id,chunk_position,evidence" }
          );
          mentionsSaved++;
        }
      }

      // Aliases
      for (const alias of entity.aliases) {
        if (!alias) continue;
        await supabase.from("knowledge_entity_aliases").upsert(
          { entity_id: entityId, alias },
          { onConflict: "entity_id,alias" }
        );
        aliasesSaved++;
      }
    }

    // ==============================
    // Step 6: Save relationships
    // ==============================
    let relationshipsSaved = 0;
    for (const rel of extraction.relationships || []) {
      const sourceId = entityIdMap.get(rel.character_a?.trim().toLowerCase());
      const targetId = entityIdMap.get(rel.character_b?.trim().toLowerCase());
      if (!sourceId || !targetId) continue;

      await supabase.from("knowledge_entity_relationships").upsert(
        {
          project_id: body.project_id,
          document_id: body.document_id,
          version_id: body.version_id,
          source_entity_id: sourceId,
          target_entity_id: targetId,
          relationship_type: rel.relationship_type || "unknown",
          evidence: rel.evidence?.join(" | ")?.slice(0, 1000) || null,
          chunk_position: rel.chunk_positions?.[0] || null,
          raw_extraction_id: rawExtractionId,
        },
        { onConflict: "version_id,source_entity_id,target_entity_id,relationship_type" }
      );
      relationshipsSaved++;
    }

    // ==============================
    // Step 7: Save events
    // ==============================
    let eventsSaved = 0;
    let eventMentionsSaved = 0;
    let eventParticipantsSaved = 0;

    for (const event of extraction.events || []) {
      const eventName = (event.description || event.name || "unnamed event").slice(0, 200);

      const { data: upsertedEvent, error: eventError } = await supabase
        .from("knowledge_events")
        .upsert(
          {
            project_id: body.project_id,
            document_id: body.document_id,
            version_id: body.version_id,
            user_id: body.user_id,
            name: eventName,
            description: event.what_happened || event.description || null,
            attributes: { location: event.location || null, participants: event.participants || [] },
            raw_extraction_id: rawExtractionId,
          },
          { onConflict: "version_id,name" }
        )
        .select("id")
        .single();

      if (eventError || !upsertedEvent) continue;
      eventsSaved++;
      const eventId = upsertedEvent.id;

      for (const pos of event.chunk_positions || []) {
        const ev = event.evidence?.length ? event.evidence[0]?.slice(0, 500) : null;
        await supabase.from("knowledge_event_mentions").upsert(
          { event_id: eventId, chunk_position: pos, evidence: ev },
          { onConflict: "event_id,chunk_position,evidence" }
        );
        eventMentionsSaved++;
      }

      for (const participantName of event.participants || []) {
        const participantId = entityIdMap.get(participantName.trim().toLowerCase());
        if (!participantId) continue;
        await supabase.from("knowledge_event_participants").upsert(
          { event_id: eventId, entity_id: participantId, role: null },
          { onConflict: "event_id,entity_id" }
        );
        eventParticipantsSaved++;
      }
    }

    // ==============================
    // Step 8: Return result
    // ==============================
    const done = chunks.length < limit;

    return new Response(
      JSON.stringify({
        success: true,
        done,
        next_offset: offset + limit,
        telemetry: {
          model: modelUsed,
          input_tokens: (usage as Record<string, unknown>).promptTokenCount ?? null,
          output_tokens: (usage as Record<string, unknown>).candidatesTokenCount ?? null,
          total_tokens: (usage as Record<string, unknown>).totalTokenCount ?? null,
          latency_ms: latencyMs,
          chunks_sent: chunks.length,
          total_chars: totalChars,
        },
        summary: {
          entities_saved: entitiesSaved,
          mentions_saved: mentionsSaved,
          aliases_saved: aliasesSaved,
          relationships_saved: relationshipsSaved,
          events_saved: eventsSaved,
          event_mentions_saved: eventMentionsSaved,
          event_participants_saved: eventParticipantsSaved,
          branch_entities_saved: branchEntitiesSaved,
          raw_extraction_id: rawExtractionId,
          normalized_entity_count: normalizedEntities.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("extract-knowledge error:", message);
    return errorResponse(`Edge Function error: ${message}`, 500);
  }
});
