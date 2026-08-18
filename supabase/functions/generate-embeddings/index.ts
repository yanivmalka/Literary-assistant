// ============================================
// Edge Function: generate-embeddings
// Generates embeddings for a small batch of chunks (max 10 per call).
// Called multiple times by the client to process all chunks
// without exceeding the 2s CPU time limit.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmbedRequest {
  version_id: string;
  offset: number;    // start from this chunk position
  limit: number;     // how many chunks to process (max 10)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { version_id, offset = 0, limit = 10 } = (await req.json()) as EmbedRequest;

    if (!version_id) {
      return new Response(
        JSON.stringify({ error: "version_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get chunks for this batch
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, content")
      .eq("version_id", version_id)
      .order("position", { ascending: true })
      .range(offset, offset + limit - 1);

    if (chunksError || !chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ done: true, processed: 0, total_so_far: offset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which chunks already have embeddings (idempotent)
    const chunkIds = chunks.map(c => c.id);
    const { data: existing } = await supabase
      .from("chunk_embeddings")
      .select("chunk_id")
      .in("chunk_id", chunkIds)
      .eq("is_stale", false);

    const existingSet = new Set((existing || []).map(e => e.chunk_id));
    const chunksToEmbed = chunks.filter(c => !existingSet.has(c.id));

    if (chunksToEmbed.length === 0) {
      return new Response(
        JSON.stringify({
          done: chunks.length < limit,
          processed: 0,
          skipped: chunks.length,
          next_offset: offset + limit,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate embeddings using built-in gte-small
    const session = new Supabase.ai.Session("gte-small");
    let processed = 0;

    for (const chunk of chunksToEmbed) {
      try {
        const truncated = chunk.content.split(/\s+/).slice(0, 400).join(" ");
        const embedding = await session.run(truncated, {
          mean_pool: true,
          normalize: true,
        });

        await supabase.from("chunk_embeddings").insert({
          chunk_id: chunk.id,
          model_name: "gte-small",
          dimensions: 384,
          embedding: JSON.stringify(Array.from(embedding)),
          is_stale: false,
        });

        processed++;
      } catch (e) {
        console.error(`Embedding error for chunk ${chunk.id}:`, e);
      }
    }

    const done = chunks.length < limit;

    // If all chunks for this version are done, update status to 'ready'
    if (done) {
      const { count } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("version_id", version_id);

      const { count: embeddedCount } = await supabase
        .from("chunk_embeddings")
        .select("id", { count: "exact", head: true })
        .in("chunk_id",
          (await supabase
            .from("document_chunks")
            .select("id")
            .eq("version_id", version_id)
          ).data?.map(c => c.id) || []
        )
        .eq("is_stale", false);

      // Update version status
      await supabase
        .from("document_versions")
        .update({
          status: "ready",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", version_id);

      console.log(`[Embeddings] Version ${version_id} complete: ${embeddedCount}/${count} chunks embedded`);
    }

    return new Response(
      JSON.stringify({
        done,
        processed,
        skipped: chunks.length - chunksToEmbed.length,
        next_offset: offset + limit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Embeddings] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
