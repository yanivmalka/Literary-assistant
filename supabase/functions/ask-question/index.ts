// ============================================
// Edge Function: ask-question
// Source-grounded Q&A:
// Question → hybrid search for document chunks → entity lookup → context retrieval
// → Gemini prompt → generated answer + sources
//
// Never sends entire book to LLM. Returns insufficient-context flag if needed.
// Uses service_role key for DB access; authenticates user via Authorization header.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiWithFallback } from "../_shared/gemini-client.ts";
import { assertQuillsAvailable, consumeGeminiUsage } from "../_shared/quills.ts";
import { DEFAULT_MODEL } from "../_shared/gemini-config.ts";
import {
  adjacentPositions,
  buildRetrievalTerms,
  mergeAdjacentRetrievalChunks,
  type RetrievalChunk,
} from "../_shared/qa-retrieval.ts";
import {
  isNotebookSchemaUnavailable,
  NotebookConversationAccessError,
  persistNotebookTurn,
  resolveNotebookConversation,
  type NotebookTurnResult,
} from "../_shared/notebook-persistence.ts";
import type { QASource } from "../_shared/notebook-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Types
// ============================================

interface AskQuestionRequest {
  project_id: string;
  question: string;
  top_k?: number;
  branch_id?: string | null;
  conversation_id?: string | null;
  client_request_id?: string;
  /** Optional source scope used only by the enhanced retrieval rollout. */
  source_version_ids?: string[];
  chapter_numbers?: number[];
  chunk_ids?: string[];
  include_adjacent?: boolean;
}

interface DocumentChunk {
  id: string;
  content: string;
  chapter_number: number | null;
  chapter_title: string | null;
  page: number | null;
  position: number;
  version_id: string;
}

interface QAResult {
  answer: string;
  sources: QASource[];
  entitiesReferenced: string[];
  noSufficientContext: boolean;
  conversationId?: string;
  userMessageId?: string;
  messageId?: string;
  citationIds?: string[];
  modelUsed?: string;
  latencyMs?: number;
}

// ============================================
// Error Response Helper
// ============================================

function errorResponse(
  message: string,
  status: number,
  details?: string
): Response {
  // Preserve the existing HTTP 200 envelope contract while logging the
  // application status that would otherwise be visible only in the JSON body.
  console.error(
    "[ask-question] Application error",
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
      status: 200, // Return 200 so client gets JSON body (Edge Function convention)
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function persistNotebookTurnSafely(
  supabase: any,
  input: Parameters<typeof persistNotebookTurn>[1] | null,
): Promise<NotebookTurnResult | null> {
  if (!input) return null;
  try {
    return await persistNotebookTurn(supabase, input);
  } catch (error) {
    console.warn(
      "[ask-question] Notebook persistence unavailable; continuing with legacy QA response",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function notebookResponseFields(
  result: NotebookTurnResult | null,
): Pick<QAResult, "conversationId" | "userMessageId" | "messageId" | "citationIds"> {
  if (!result) return {};
  return {
    conversationId: result.conversation_id,
    userMessageId: result.user_message_id,
    messageId: result.assistant_message_id,
    citationIds: result.citation_ids,
  };
}

// ============================================
// Retrieval rollout: legacy full-text by default; enhanced scoped retrieval is opt-in.
// ============================================

async function legacyHybridSearch(
  supabase: any,
  projectId: string,
  question: string,
  topK: number,
  branchId?: string | null
): Promise<QASource[]> {
  // Get all documents for this project
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id")
    .eq("project_id", projectId);

  if (docsError) throw new Error(`Failed to fetch documents: ${docsError.message}`);
  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d: any) => d.id);

  // Get versions that are ready (indexed or processed)
  const { data: versions, error: versionsError } = await supabase
    .from("document_versions")
    .select("id")
    .in("document_id", docIds)
    .in("status", ["ready", "indexed", "skipped_no_provider"]);

  if (versionsError) throw new Error(`Failed to fetch versions: ${versionsError.message}`);
  if (!versions || versions.length === 0) return [];

  const versionIds = versions.map((v: any) => v.id);

  // Full-text search on chunks
  // Build a proper full-text query from the question
  const queryTerms = question
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[.,!?;:()[\]{}]/g, ""))
    .filter((term) => term.length > 1)
    .join(" & ");

  if (!queryTerms) {
    // No valid search terms
    return [];
  }

  let query = supabase
    .from("document_chunks")
    .select("id, content, chapter_number, chapter_title, page, position, version_id")
    .in("version_id", versionIds)
    .textSearch("content", queryTerms, {
      type: "plain",
      config: "simple",
    })
    .limit(topK);

  let chunks = null;
  let chunksError = null;
  
  try {
    const result = await query;
    chunks = result.data;
    chunksError = result.error;
  } catch (err) {
    chunksError = err;
  }

  if (chunksError) {
    // Fall back to simpler search if full-text fails
    console.warn(`Full-text search failed: ${chunksError}`);
    const fallbackResult = await supabase
      .from("document_chunks")
      .select("id, content, chapter_number, chapter_title, page, position, version_id")
      .in("version_id", versionIds)
      .ilike("content", `%${question.split(/\s+/)[0]}%`)
      .limit(topK);

    chunks = fallbackResult.data;
    chunksError = fallbackResult.error;

    if (chunksError) throw new Error(`Fallback search failed: ${chunksError}`);
  }

  // Convert chunks to sources with scoring
  const sources: QASource[] = (chunks || []).map((chunk: DocumentChunk, idx: number) => ({
    chunkId: chunk.id,
    content: chunk.content,
    chapterNumber: chunk.chapter_number,
    chapterTitle: chunk.chapter_title,
    page: chunk.page,
    position: chunk.position,
    versionId: chunk.version_id,
    score: topK - idx, // Simple scoring: first result gets higher score
    documentName: undefined,
  }));

  return sources;
}

interface RetrievalScope {
  sourceVersionIds?: unknown;
  chapterNumbers?: unknown;
  chunkIds?: unknown;
  includeAdjacent?: unknown;
}

function scopeStrings(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, max);
}

function scopeIntegers(value: unknown, max = 100): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is number => typeof item === "number" && Number.isInteger(item))
      .filter((item) => item >= 0),
  )].slice(0, max);
}

function applyChunkScope(query: any, versionIds: string[], scope: ReturnType<typeof normalizeRetrievalScope>): any {
  let scopedQuery = query.in("version_id", versionIds);
  if (scope.chapterNumbers.length > 0) {
    scopedQuery = scopedQuery.in("chapter_number", scope.chapterNumbers);
  }
  if (scope.chunkIds.length > 0) {
    scopedQuery = scopedQuery.in("id", scope.chunkIds);
  }
  return scopedQuery;
}

function normalizeRetrievalScope(scope?: RetrievalScope): {
  sourceVersionIds: string[];
  chapterNumbers: number[];
  chunkIds: string[];
  includeAdjacent: boolean;
} {
  return {
    sourceVersionIds: scopeStrings(scope?.sourceVersionIds),
    chapterNumbers: scopeIntegers(scope?.chapterNumbers),
    chunkIds: scopeStrings(scope?.chunkIds),
    includeAdjacent: scope?.includeAdjacent !== false,
  };
}

async function enhancedHybridSearch(
  supabase: any,
  projectId: string,
  question: string,
  topK: number,
  scopeInput?: RetrievalScope,
): Promise<QASource[]> {
  const scope = normalizeRetrievalScope(scopeInput);
  const safeTopK = Math.min(20, Math.max(1, Math.floor(topK || 5)));
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id")
    .eq("project_id", projectId);

  if (docsError) throw new Error(`Failed to fetch documents: ${docsError.message}`);
  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((doc: { id: string }) => doc.id);
  let versionQuery = supabase
    .from("document_versions")
    .select("id")
    .in("document_id", docIds)
    .in("status", ["ready", "indexed", "skipped_no_provider"]);
  if (scope.sourceVersionIds.length > 0) {
    versionQuery = versionQuery.in("id", scope.sourceVersionIds);
  }

  const { data: versions, error: versionsError } = await versionQuery;
  if (versionsError) throw new Error(`Failed to fetch versions: ${versionsError.message}`);
  if (!versions || versions.length === 0) return [];

  const versionIds = versions.map((version: { id: string }) => version.id);
  const terms = buildRetrievalTerms(question);
  const queryTerms = terms.join(" & ");
  if (!queryTerms) return [];

  const selectFields = "id, content, chapter_number, chapter_title, page, position, version_id";
  let query = applyChunkScope(
    supabase.from("document_chunks").select(selectFields),
    versionIds,
    scope,
  )
    .textSearch("content", queryTerms, { type: "plain", config: "simple" })
    .limit(safeTopK);

  let chunks: DocumentChunk[] | null = null;
  let chunksError: { message?: string } | null = null;
  try {
    const result = await query;
    chunks = result.data as DocumentChunk[] | null;
    chunksError = result.error;
  } catch (error) {
    chunksError = error as { message?: string };
  }

  if (chunksError) {
    console.warn(`[ask-question] Enhanced full-text search failed: ${chunksError.message || "unknown error"}`);
    let fallbackQuery = applyChunkScope(
      supabase.from("document_chunks").select(selectFields),
      versionIds,
      scope,
    );
    fallbackQuery = fallbackQuery.ilike("content", `%${terms[0]}%`).limit(safeTopK);
    const fallbackResult = await fallbackQuery;
    chunks = fallbackResult.data as DocumentChunk[] | null;
    if (fallbackResult.error) {
      throw new Error(`Fallback search failed: ${fallbackResult.error.message}`);
    }
  }

  const primary: RetrievalChunk[] = (chunks || []).map((chunk, index) => ({
    id: chunk.id,
    content: chunk.content,
    chapter_number: chunk.chapter_number,
    chapter_title: chunk.chapter_title,
    page: chunk.page,
    position: chunk.position,
    version_id: chunk.version_id,
    score: safeTopK - index,
  }));

  if (!scope.includeAdjacent || scope.chunkIds.length > 0 || primary.length === 0) {
    return primary.map((chunk) => ({
      chunkId: chunk.id,
      content: chunk.content,
      chapterNumber: chunk.chapter_number,
      chapterTitle: chunk.chapter_title,
      page: chunk.page,
      position: chunk.position,
      versionId: chunk.version_id,
      score: chunk.score,
      documentName: chunk.document_name,
    }));
  }

  const primaryPositions = new Map<string, number[]>();
  for (const chunk of primary) {
    const positions = primaryPositions.get(chunk.version_id) || [];
    positions.push(chunk.position);
    primaryPositions.set(chunk.version_id, positions);
  }

  const minPosition = Math.max(0, Math.min(...primary.map((chunk) => chunk.position)) - 1);
  const maxPosition = Math.max(...primary.map((chunk) => chunk.position)) + 1;
  let adjacentQuery = supabase
    .from("document_chunks")
    .select(selectFields)
    .in("version_id", versionIds)
    .gte("position", minPosition)
    .lte("position", maxPosition);
  if (scope.chapterNumbers.length > 0) {
    adjacentQuery = adjacentQuery.in("chapter_number", scope.chapterNumbers);
  }

  const adjacentResult = await adjacentQuery;
  if (adjacentResult.error) {
    console.warn(`[ask-question] Adjacent context lookup failed: ${adjacentResult.error.message}`);
  }

  const adjacent: RetrievalChunk[] = ((adjacentResult.data || []) as DocumentChunk[])
    .filter((chunk) => {
      const positions = primaryPositions.get(chunk.version_id) || [];
      return positions.some((position) => adjacentPositions(position).includes(chunk.position));
    })
    .map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      chapter_number: chunk.chapter_number,
      chapter_title: chunk.chapter_title,
      page: chunk.page,
      position: chunk.position,
      version_id: chunk.version_id,
      score: 0.5,
    }));

  return mergeAdjacentRetrievalChunks(primary, adjacent, safeTopK).map((chunk) => ({
    chunkId: chunk.id,
    content: chunk.content,
    chapterNumber: chunk.chapter_number,
    chapterTitle: chunk.chapter_title,
    page: chunk.page,
    position: chunk.position,
    versionId: chunk.version_id,
    score: chunk.score,
    documentName: chunk.document_name,
  }));
}

async function hybridSearch(
  supabase: any,
  projectId: string,
  question: string,
  topK: number,
  branchId?: string | null,
  scope?: RetrievalScope,
): Promise<QASource[]> {
  if (scope) {
    const hasExplicitSourceScope = scopeStrings(scope.sourceVersionIds).length > 0
      || scopeIntegers(scope.chapterNumbers).length > 0
      || scopeStrings(scope.chunkIds).length > 0;
    if (hasExplicitSourceScope) {
      return enhancedHybridSearch(supabase, projectId, question, topK, scope);
    }
  }
  if (Deno.env.get("QA_RETRIEVAL_MODE") === "enhanced") {
    return enhancedHybridSearch(supabase, projectId, question, topK, scope);
  }
  return legacyHybridSearch(supabase, projectId, question, topK, branchId);
}

// ============================================
// Entity Lookup: Find relevant entities mentioned in question
// ============================================

async function findRelevantEntities(
  supabase: any,
  projectId: string,
  question: string,
  includeGlobalContext = true,
): Promise<{ entityInfo: string; entityNames: string[] }> {
  if (!includeGlobalContext) {
    return { entityInfo: "", entityNames: [] };
  }

  // Search knowledge_entities for names matching question keywords
  const { data: entities, error } = await supabase
    .from("knowledge_entities")
    .select("canonical_name, entity_type, aliases")
    .eq("project_id", projectId)
    .eq("layer", "main")
    .limit(50);

  if (error || !entities || entities.length === 0) {
    return { entityInfo: "", entityNames: [] };
  }

  const questionLower = question.toLowerCase();
  const relevant = entities.filter((e: any) => {
    const names = [e.canonical_name, ...(e.aliases || [])].map((n: string) =>
      n.toLowerCase()
    );
    return names.some((n: string) => questionLower.includes(n) || n.includes(questionLower.split(/\s+/).filter((w: string) => w.length > 2)[0] || ""));
  });

  if (relevant.length === 0) {
    return { entityInfo: "", entityNames: [] };
  }

  const entityNames = relevant.map((e: any) => e.canonical_name);
  const entityInfo = relevant.map((e: any) => `- ${e.canonical_name} (${e.entity_type})`).join("\n");

  return { entityInfo, entityNames };
}

// ============================================
// QA Prompt Builder
// ============================================

function buildQAPrompt(
  question: string,
  context: string,
  entityInfo: string
): string {
  return `You are a literary assistant helping an author understand their book. Answer the question based ONLY on the provided context from the book.

Rules:
- Only use information from the provided context passages.
- If the context does not contain enough information to answer, say: "I could not find sufficient information in the document to answer this question."
- Cite your sources using [Chapter X] or [Page Y] format where available.
- Be precise and factual. Do not invent or assume details not present in the text.
- Answer in the same language as the question.
- Keep your answer concise and focused.

${entityInfo ? `Known entities relevant to this question:\n${entityInfo}\n` : ""}Context passages from the book:
${context}

Question: ${question}

Answer:`;
}

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Parse request ---
    const body = (await req.json()) as AskQuestionRequest;

    if (!body.project_id || !body.question) {
      return errorResponse("Missing required fields: project_id, question", 400);
    }

    const projectId = body.project_id;
    const question = body.question.trim();
    const topK = body.top_k || 5;
    const branchId = body.branch_id || null;

    if (question.length === 0) {
      return errorResponse("Question cannot be empty", 400);
    }

    if (question.length > 2000) {
      return errorResponse("Question too long (max 2000 characters)", 400);
    }

    // --- Authenticate user ---
    const authHeader = req.headers.get("Authorization");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized: invalid or missing authentication", 401);
    }

    // --- Create service client for DB queries ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // --- Verify user owns project ---
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return errorResponse("Project not found or unauthorized", 403);
    }

    const requestedConversationId = typeof body.conversation_id === "string"
      ? body.conversation_id.trim() || null
      : null;
    const clientRequestId = typeof body.client_request_id === "string"
      ? body.client_request_id.trim() || crypto.randomUUID()
      : crypto.randomUUID();
    if (clientRequestId.length > 200) {
      return errorResponse("client_request_id is too long", 400);
    }

    let notebookConversationId: string | null = null;
    try {
      notebookConversationId = await resolveNotebookConversation(
        supabase,
        projectId,
        user.id,
        requestedConversationId,
        question,
      );
    } catch (error) {
      if (error instanceof NotebookConversationAccessError) {
        return errorResponse(error.message, 403);
      }
      if (isNotebookSchemaUnavailable(error)) {
        console.warn("[ask-question] Notebook migration is not available yet; using legacy QA mode");
      } else {
        console.warn(
          "[ask-question] Could not initialize Notebook conversation; using legacy QA mode",
          error instanceof Error ? error.message : error,
        );
      }
    }

    const persistTurn = (
      answer: string,
      turnSources: QASource[],
      noSufficientContext: boolean,
      metadata: Record<string, unknown> = {},
    ) => persistNotebookTurnSafely(
      supabase,
      notebookConversationId
        ? {
            conversation_id: notebookConversationId,
            project_id: projectId,
            user_id: user.id,
            client_request_id: clientRequestId,
            question,
            answer,
            sources: turnSources,
            no_sufficient_context: noSufficientContext,
            metadata,
          }
        : null,
    );

    // --- Step 1: Hybrid search for relevant chunks ---
    const sources = await hybridSearch(
      supabase,
      projectId,
      question,
      topK,
      branchId,
      {
        sourceVersionIds: body.source_version_ids,
        chapterNumbers: body.chapter_numbers,
        chunkIds: body.chunk_ids,
        includeAdjacent: body.include_adjacent,
      },
    );

    // --- Step 2: Find relevant entities ---
    const explicitSourceScope = Deno.env.get("QA_RETRIEVAL_MODE") === "enhanced" && (
      scopeStrings(body.source_version_ids).length > 0 ||
      scopeIntegers(body.chapter_numbers).length > 0 ||
      scopeStrings(body.chunk_ids).length > 0
    );
    const { entityInfo, entityNames } = await findRelevantEntities(
      supabase,
      projectId,
      question,
      !explicitSourceScope,
    );

    // --- No results: insufficient context ---
    if (sources.length === 0) {
      const persisted = await persistTurn("", [], true, { mode: "no-context" });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            answer: "",
            sources: [],
            entitiesReferenced: entityNames,
            noSufficientContext: true,
            ...notebookResponseFields(persisted),
          } as QAResult,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- Step 3: Check if Gemini API is available ---
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      // No API key: return sources without generated answer
      const persisted = await persistTurn("", sources, false, { mode: "retrieval-only" });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            answer: "",
            sources,
            entitiesReferenced: entityNames,
            noSufficientContext: false,
            ...notebookResponseFields(persisted),
          } as QAResult,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const quota = await assertQuillsAvailable(supabase, user.id);
    if (!quota.available) {
      return errorResponse("INSUFFICIENT_QUILLS", 402);
    }

    // --- Step 4: Build context string with source references ---
    const contextParts = sources.map((s, i) => {
      const ref = s.chapterTitle
        ? `[Chapter ${s.chapterNumber}: ${s.chapterTitle}]`
        : s.chapterNumber
          ? `[Chapter ${s.chapterNumber}]`
          : s.page
            ? `[Page ${s.page}]`
            : `[Source ${i + 1}]`;
      return `${ref}\n${s.content}`;
    });
    const context = contextParts.join("\n\n---\n\n");

    // --- Step 5: Generate answer with Gemini ---
    const prompt = buildQAPrompt(question, context, entityInfo);
    const startTime = Date.now();

    const geminiResult = await callGeminiWithFallback(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // Lower temperature for factual answers
          maxOutputTokens: 1024,
        },
      },
      apiKey,
      { timeoutMs: 30_000 }
    );

    const latencyMs = Date.now() - startTime;

    if (!geminiResult.success) {
      console.error(
        "[ask-question] Gemini error:",
        JSON.stringify(geminiResult)
      );
      // Return sources without answer on LLM failure
      const persisted = await persistTurn("", sources, false, { mode: "generation-failure" });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            answer: "",
            sources,
            entitiesReferenced: entityNames,
            noSufficientContext: false,
            ...notebookResponseFields(persisted),
          } as QAResult,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- Step 6: Parse LLM response and meter usage ---
    const geminiData = geminiResult.data as Record<string, unknown>;

    let quillCharge;
    try {
      quillCharge = await consumeGeminiUsage(
        supabase,
        user.id,
        (geminiData.usageMetadata as Record<string, unknown> | undefined) ?? {},
        "ask-question",
        { project_id: projectId, model: geminiResult.modelUsed },
        `qa:${user.id}:${projectId}:${crypto.randomUUID()}`,
      );
    } catch (chargeError) {
      const chargeMessage = chargeError instanceof Error ? chargeError.message : "Quill consumption failed";
      if (chargeMessage.includes("INSUFFICIENT_QUILLS")) {
        return errorResponse("INSUFFICIENT_QUILLS", 402);
      }
      console.error("[ask-question] Quill consumption failed:", chargeMessage);
      return errorResponse("Failed to update Quill balance", 500, chargeMessage);
    }

    const usage = (geminiData.usageMetadata as Record<string, unknown> | undefined) ?? {};
    const usagePayload = {
      input_tokens: usage.promptTokenCount ?? null,
      output_tokens: usage.candidatesTokenCount ?? null,
      total_tokens: quillCharge.totalTokens,
      charged_quills: quillCharge.chargedQuills,
    };

    // --- Step 7: Parse LLM response ---
    const candidates = (geminiData.candidates as Array<Record<string, unknown>>) || [];
    const firstCandidate = candidates[0];
    const content = firstCandidate?.content as Record<string, unknown> | undefined;
    const parts = (content?.parts as Array<Record<string, unknown>>) || [];
    const firstPart = parts[0];
    const responseText = (firstPart?.text as string) || "";

    const answer = responseText.trim();

    // Check if LLM indicates insufficient context
    const noSufficientContext =
      answer.toLowerCase().includes("could not find sufficient information") ||
      answer.includes("לא נמצא מספיק מידע") ||
      answer.toLowerCase().includes("insufficient information");

    console.log(
      `[ask-question] Generated answer (${latencyMs}ms, model: ${geminiResult.modelUsed})`
    );

    const persisted = await persistTurn(answer, sources, noSufficientContext, {
      mode: "generated",
      model_used: geminiResult.modelUsed,
      latency_ms: latencyMs,
    });

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          answer,
          sources,
          entitiesReferenced: entityNames,
          noSufficientContext,
          ...notebookResponseFields(persisted),
          modelUsed: geminiResult.modelUsed,
          latencyMs,
          usage: usagePayload,
          quills: {
            quills_balance: quillCharge.balance,
            token_remainder: quillCharge.remainder,
          },
        } as QAResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ask-question] Unexpected error:", message, err);
    return errorResponse(`Edge Function error: ${message}`, 500);
  }
});
