// ============================================
// Edge Function: extract-entities
// Extracts characters, locations, and other entities from document chunks
// using HuggingFace Inference API (free tier, Mistral model).
// Processes chunks in batches to stay within CPU/time limits.
// Called by client after document reaches 'ready' status.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HF_API_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

interface ExtractRequest {
  version_id: string;
  project_id: string;
  user_id: string;
  offset?: number;
  limit?: number;
}

interface ExtractedEntity {
  name: string;
  type: string;
  aliases: string[];
  attributes: Record<string, string>;
  context: string;
}

// ============================================
// LLM Call
// ============================================

async function callLLM(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 2048,
        temperature: 0.1,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HuggingFace API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as Array<{ generated_text: string }>;
  return data[0]?.generated_text || "";
}

// ============================================
// Entity Extraction Prompt
// ============================================

function buildPrompt(chunkTexts: string[]): string {
  const combined = chunkTexts.join("\n---\n");
  return `<s>[INST] You are an entity extractor for fantasy novels. Extract ALL named entities from the following text passages.

For each entity, provide:
- name: the entity's name exactly as it appears
- type: one of [character, location, country, continent, region, object, ability, magic_system, event]
- aliases: alternative names or references (empty array if none)
- attributes: key-value pairs of properties mentioned (e.g. {"eye_color": "blue", "hair": "black"})
- context: a short quote (max 20 words) showing where this entity appears

Important rules:
- This is a FANTASY novel. Names are invented and won't appear in any dictionary.
- Include ALL proper nouns referring to characters, places, items, or abilities.
- For characters: extract appearance details (hair, eyes, height, build, scars, clothing).
- For locations: extract terrain, climate, architecture, atmosphere.
- Do NOT include common nouns or generic descriptions.
- The text may be in Hebrew or English. Extract entities in the language they appear.

Return ONLY a valid JSON array. No other text before or after.

Example:
[{"name": "Raven", "type": "character", "aliases": ["The Shadow"], "attributes": {"eye_color": "blue", "hair": "black", "scar": "above left eye"}, "context": "Raven looked at him with cold blue eyes"}]

Text:
${combined} [/INST]`;
}

// ============================================
// Parse LLM Response
// ============================================

function parseResponse(response: string): ExtractedEntity[] {
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Find JSON array
  const arrayStart = jsonStr.indexOf("[");
  const arrayEnd = jsonStr.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item: unknown) => {
      if (typeof item !== "object" || item === null) return false;
      const obj = item as Record<string, unknown>;
      return typeof obj.name === "string" && obj.name.length > 0;
    }).map((item: Record<string, unknown>) => ({
      name: (item.name as string).trim(),
      type: typeof item.type === "string" ? item.type : "character",
      aliases: Array.isArray(item.aliases) ? item.aliases.filter((a: unknown) => typeof a === "string") : [],
      attributes: typeof item.attributes === "object" && item.attributes !== null
        ? item.attributes as Record<string, string>
        : {},
      context: typeof item.context === "string" ? item.context : "",
    }));
  } catch {
    console.error("[Entities] Failed to parse LLM response:", jsonStr.slice(0, 200));
    return [];
  }
}

// ============================================
// Save Entities to DB
// ============================================

async function saveEntities(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  userId: string,
  entities: ExtractedEntity[],
  chunkIds: string[]
) {
  let saved = 0;

  // Deduplicate by name (case-insensitive)
  const uniqueMap = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, entity);
    } else {
      // Merge attributes
      const existing = uniqueMap.get(key)!;
      existing.attributes = { ...existing.attributes, ...entity.attributes };
      if (entity.aliases.length > 0) {
        existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])];
      }
    }
  }

  for (const [_key, entity] of uniqueMap) {
    try {
      // Check if entity already exists in project
      const { data: existing } = await supabase
        .from("entities")
        .select("id")
        .eq("project_id", projectId)
        .ilike("name", entity.name)
        .limit(1)
        .maybeSingle();

      let entityId: string;

      if (existing) {
        entityId = existing.id;
        // Update aliases if new
        const { data: current } = await supabase
          .from("entities")
          .select("aliases")
          .eq("id", entityId)
          .single();
        
        if (current && entity.aliases.length > 0) {
          const merged = [...new Set([...(current.aliases || []), ...entity.aliases])];
          await supabase.from("entities").update({ aliases: merged }).eq("id", entityId);
        }
      } else {
        // Create new entity
        const validTypes = ['character', 'location', 'country', 'continent', 'region', 'object', 'ability', 'magic_system', 'event'];
        const entityType = validTypes.includes(entity.type) ? entity.type : 'character';

        const { data: newEntity, error } = await supabase
          .from("entities")
          .insert({
            project_id: projectId,
            user_id: userId,
            name: entity.name,
            entity_type: entityType,
            status: "pending",
            aliases: entity.aliases,
            metadata: { extracted_attributes: entity.attributes },
          })
          .select("id")
          .single();

        if (error || !newEntity) {
          console.error(`[Entities] Failed to create '${entity.name}':`, error?.message);
          continue;
        }
        entityId = newEntity.id;
      }

      // Save mention (use first chunk as reference)
      if (chunkIds.length > 0) {
        await supabase.from("entity_mentions").insert({
          entity_id: entityId,
          chunk_id: chunkIds[0],
          context_snippet: entity.context.slice(0, 500),
          mention_text: entity.name,
        });
      }

      // Save attributes
      const attrRecords = Object.entries(entity.attributes).map(([name, value]) => ({
        entity_id: entityId,
        attribute_name: name,
        attribute_value: String(value),
        source_chunk_id: chunkIds[0] || null,
        confidence: 0.8,
        data_origin: "ai_extracted",
      }));

      if (attrRecords.length > 0) {
        await supabase.from("entity_attributes").insert(attrRecords);
      }

      saved++;
    } catch (err) {
      console.error(`[Entities] Error saving '${entity.name}':`, err);
    }
  }

  return saved;
}

// ============================================
// HTTP Handler
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { version_id, project_id, user_id, offset = 0, limit = 3 } =
      (await req.json()) as ExtractRequest;

    if (!version_id || !project_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "version_id, project_id, and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "HUGGINGFACE_API_KEY not configured", skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get chunks batch
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, content")
      .eq("version_id", version_id)
      .order("position", { ascending: true })
      .range(offset, offset + limit - 1);

    if (chunksError || !chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ done: true, saved: 0, next_offset: offset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call LLM to extract entities
    const chunkTexts = chunks.map(c => c.content);
    const chunkIds = chunks.map(c => c.id);
    const prompt = buildPrompt(chunkTexts);

    console.log(`[Entities] Processing chunks ${offset}-${offset + chunks.length - 1}...`);

    const llmResponse = await callLLM(prompt, apiKey);
    const entities = parseResponse(llmResponse);

    console.log(`[Entities] Found ${entities.length} entities in batch`);

    // Save to DB
    const saved = await saveEntities(supabase, project_id, user_id, entities, chunkIds);

    const done = chunks.length < limit;

    return new Response(
      JSON.stringify({
        done,
        saved,
        entities_found: entities.length,
        next_offset: offset + limit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Entities] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
