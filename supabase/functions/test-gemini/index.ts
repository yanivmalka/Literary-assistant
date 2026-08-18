// ============================================
// Edge Function: test-gemini
// Smoke test: sends a prompt to Gemini 2.5 Flash and returns the response.
// Used to verify connectivity: Frontend → Edge Function → Gemini API.
// Does NOT save anything to DB.
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface TestRequest {
  prompt: string;
}

function errorResponse(
  message: string,
  status: number,
  details?: string
): Response {
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

    // --- Call Gemini API ---
    const startTime = Date.now();

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    const latencyMs = Date.now() - startTime;

    // --- Handle Gemini errors ---
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text().catch(() => "Unable to read error body");
      const status = geminiResponse.status;

      let message: string;
      switch (status) {
        case 400:
          message = "Bad request — malformed prompt or invalid parameters sent to Gemini";
          break;
        case 401:
          message = "Unauthorized — GEMINI_API_KEY is invalid or expired";
          break;
        case 403:
          message = "Forbidden — API key does not have permission to access Gemini 2.5 Flash";
          break;
        case 429:
          message = "Rate limit exceeded — Gemini Free Tier quota reached. Wait and try again.";
          break;
        default:
          if (status >= 500) {
            message = `Gemini service error (HTTP ${status}) — try again later`;
          } else {
            message = `Unexpected Gemini error (HTTP ${status})`;
          }
      }

      return errorResponse(message, status, errorText.slice(0, 500));
    }

    // --- Parse successful response ---
    const data = await geminiResponse.json();

    const responseText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "[No text in response]";

    // Extract token usage from usageMetadata
    const usage = data?.usageMetadata || {};
    const telemetry = {
      model: GEMINI_MODEL,
      input_tokens: usage.promptTokenCount ?? null,
      output_tokens: usage.candidatesTokenCount ?? null,
      total_tokens: usage.totalTokenCount ?? null,
      cached_tokens: usage.cachedContentTokenCount ?? null,
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
