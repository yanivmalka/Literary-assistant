// ============================================
// Edge Function: test-gemini
// Smoke test: sends a prompt to Gemini and returns the response (with multi-model fallback).
// Used to verify connectivity: Frontend → Edge Function → Gemini API.
// Does NOT save anything to DB.
// ============================================

import { callGeminiWithFallback } from "../_shared/gemini-client.ts";
import { DEFAULT_MODEL } from "../_shared/gemini-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TestRequest {
  prompt: string;
}

function errorResponse(
  message: string,
  status: number,
  details?: string
): Response {
  // Preserve the existing HTTP 200 envelope contract while logging the
  // application status that would otherwise be visible only in the JSON body.
  console.error(
    "[test-gemini] Application error",
    JSON.stringify({
      response_status: 200,
      error_status: status,
      message,
      details: details || null,
    }),
  );

  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      status,
      details: details || null,
    }),
    {
      status: 200, // Return 200 so the client gets the JSON body (Edge Function convention)
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Validate request ---
    const body = (await req.json()) as TestRequest;

    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return errorResponse("Missing or empty 'prompt' in request body", 400);
    }

    const prompt = body.prompt.trim();

    // --- Check API key ---
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return errorResponse(
        "GEMINI_API_KEY not configured as Supabase Secret. Run: supabase secrets set GEMINI_API_KEY=your-key",
        500
      );
    }

    // --- Call Gemini API (with multi-model fallback) ---
    const geminiResult = await callGeminiWithFallback(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      },
      apiKey,
      { timeoutMs: 30_000 }
    );

    if (!geminiResult.success) {
      console.error("[test-gemini] Fallback chain:", JSON.stringify(geminiResult.fallbackChain));
      return errorResponse(geminiResult.error, geminiResult.status, geminiResult.details);
    }

    const { data, modelUsed, latencyMs } = geminiResult;

    // Log if fallback was used
    if (modelUsed !== DEFAULT_MODEL) {
      console.log(`[test-gemini] Used fallback model: ${modelUsed} (primary: ${DEFAULT_MODEL})`);
    }

    // --- Parse successful response ---
    const responseText =
      (data as Record<string, unknown>)?.candidates?.[0]?.content?.parts?.[0]?.text || "[No text in response]";

    // Extract token usage from usageMetadata
    const usage = (data as Record<string, unknown>)?.usageMetadata || {};
    const telemetry = {
      model: modelUsed,
      input_tokens: (usage as Record<string, unknown>).promptTokenCount ?? null,
      output_tokens: (usage as Record<string, unknown>).candidatesTokenCount ?? null,
      total_tokens: (usage as Record<string, unknown>).totalTokenCount ?? null,
      cached_tokens: (usage as Record<string, unknown>).cachedContentTokenCount ?? null,
      latency_ms: latencyMs,
    };

    return new Response(
      JSON.stringify({
        success: true,
        response: responseText,
        telemetry,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error in Edge Function";
    return errorResponse(`Edge Function error: ${message}`, 500);
  }
});
