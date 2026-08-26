// ============================================
// Edge Function: process-document
// Processes an uploaded document through the pipeline:
// 1. Download from Storage
// 2. Extract text (PDF/DOCX)
// 3. Detect structure (chapters, scenes)
// 4. Chunk with overlap
// 5. Generate embeddings (built-in gte-small, 384 dims)
// 6. Save chunks + embeddings to DB
//
// Triggered by client after document upload.
// Uses EdgeRuntime.waitUntil() for background processing.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Types
// ============================================

interface ProcessRequest {
  version_id: string;
  document_id: string;
  project_id: string;
}

interface ExtractedPage {
  pageNumber: number;
  text: string;
}

interface DocumentChunk {
  content: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  position: number;
  sceneBreak: boolean;
  tokenCount: number;
}

// ============================================
// PDF Extraction (using unpdf — works in Deno/serverless)
// ============================================

async function extractPdfText(buffer: ArrayBuffer): Promise<{
  pages: ExtractedPage[];
  fullText: string;
}> {
  const { extractText, getDocumentProxy } = await import("npm:unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });

  const fullText: string = typeof text === "string" ? text : (text as string[]).join("\n\n");

  // Try to split by form-feeds for per-page text
  const parts = fullText.split("\f").filter((p: string) => p.trim().length > 0);
  const pages: ExtractedPage[] =
    parts.length > 1
      ? parts.map((t: string, i: number) => ({
          pageNumber: i + 1,
          text: t.trim(),
        }))
      : [{ pageNumber: 1, text: fullText.trim() }];

  return { pages, fullText: fullText.trim() };
}

// ============================================
// DOCX Extraction (using mammoth via npm compat)
// ============================================

async function extractDocxText(buffer: ArrayBuffer): Promise<{
  pages: ExtractedPage[];
  fullText: string;
}> {
  const mammoth = await import("npm:mammoth");
  // Deno resolves npm:mammoth's "browser" package.json field (no Node `fs`),
  // whose openZip() only recognizes options.arrayBuffer — the Node build's
  // options.buffer branch does not exist here.
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const fullText: string = result.value || "";

  // DOCX has no real pages; create pseudo-pages by line count
  const lines = fullText.split("\n");
  const linesPerPage = 40;
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    const pageText = lines.slice(i, i + linesPerPage).join("\n").trim();
    if (pageText.length > 0) {
      pages.push({ pageNumber: pages.length + 1, text: pageText });
    }
  }

  return { pages, fullText };
}

// ============================================
// Structure Detection (chapters, scenes)
// ============================================

const CHAPTER_PATTERNS: RegExp[] = [
  /^chapter\s+(\d+|[ivxlcdm]+)[\s.:–\-]*(.*)$/i,
  /^ch(?:ap)?\.?\s*(\d+)[\s.:–\-]*(.*)$/i,
  /^part\s+(\d+|[ivxlcdm]+)[\s.:–\-]*(.*)$/i,
  /^פרק\s+(\d+|[א-ת]{1,2})[\s.:–\-]*(.*)$/,
  /^חלק\s+(\d+|[א-ת]{1,2})[\s.:–\-]*(.*)$/,
  /^(\d{1,3})\.?$/,
];

const SCENE_BREAK_PATTERNS: RegExp[] = [
  /^\s*\*\s*\*\s*\*\s*$/,
  /^\s*[*]{3,}\s*$/,
  /^\s*[-–—]{3,}\s*$/,
  /^\s*[#]{3,}\s*$/,
];

interface Chapter {
  number: number;
  title: string | null;
  startLine: number;
}

function detectChapters(lines: string[]): Chapter[] {
  const chapters: Chapter[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0 || trimmed.length > 100) continue;

    for (const pattern of CHAPTER_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const prevLine = i > 0 ? lines[i - 1].trim() : "";
        if (i === 0 || prevLine === "" || i <= 2) {
          const num = parseInt(match[1], 10) || chapters.length + 1;
          const title = match[2]?.trim() || null;
          chapters.push({ number: num, title, startLine: i });
        }
        break;
      }
    }
  }

  return chapters;
}

function isSceneBreak(line: string): boolean {
  return SCENE_BREAK_PATTERNS.some((p) => p.test(line));
}

// ============================================
// Chunking
// ============================================

const MAX_TOKENS = 400; // Keep under 512 (gte-small limit)
const MIN_TOKENS = 30;
const OVERLAP_TOKENS = 50;

function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/);
  // Hebrew words are ~1.5 tokens each
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const hebrewRatio = text.length > 0 ? hebrewChars / text.length : 0;
  return Math.ceil(words.length * (1 + hebrewRatio * 0.5));
}

function chunkDocument(fullText: string): DocumentChunk[] {
  const lines = fullText.split("\n");
  const chapters = detectChapters(lines);
  const chunks: DocumentChunk[] = [];
  let position = 0;

  // If no chapters detected, treat as single chapter
  const chapterRanges: {
    number: number;
    title: string | null;
    start: number;
    end: number;
  }[] = [];

  if (chapters.length === 0) {
    chapterRanges.push({
      number: 1,
      title: null,
      start: 0,
      end: lines.length,
    });
  } else {
    for (let i = 0; i < chapters.length; i++) {
      const start = chapters[i].startLine + 1; // skip heading line
      const end = chapters[i + 1]?.startLine ?? lines.length;
      chapterRanges.push({
        number: chapters[i].number,
        title: chapters[i].title,
        start,
        end,
      });
    }
  }

  for (const chapter of chapterRanges) {
    let currentText = "";
    let currentTokens = 0;
    let isSceneStart = false;

    for (let i = chapter.start; i < chapter.end; i++) {
      const line = lines[i];

      if (isSceneBreak(line)) {
        // Flush current chunk
        if (currentText.trim().length > 0 && currentTokens >= MIN_TOKENS) {
          chunks.push({
            content: currentText.trim(),
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            position: position++,
            sceneBreak: isSceneStart,
            tokenCount: currentTokens,
          });
        }
        currentText = "";
        currentTokens = 0;
        isSceneStart = true;
        continue;
      }

      if (line.trim() === "") {
        // Paragraph break
        if (currentText.length > 0) currentText += "\n\n";
        continue;
      }

      const lineTokens = estimateTokens(line);

      if (currentTokens + lineTokens > MAX_TOKENS && currentText.trim().length > 0) {
        // Flush chunk
        chunks.push({
          content: currentText.trim(),
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          position: position++,
          sceneBreak: isSceneStart,
          tokenCount: currentTokens,
        });
        isSceneStart = false;

        // Overlap: keep last part
        const words = currentText.trim().split(/\s+/);
        if (words.length > OVERLAP_TOKENS) {
          currentText = words.slice(-OVERLAP_TOKENS).join(" ") + "\n" + line;
          currentTokens = estimateTokens(currentText);
        } else {
          currentText = line;
          currentTokens = lineTokens;
        }
      } else {
        currentText += (currentText.endsWith("\n\n") || currentText === "" ? "" : "\n") + line;
        currentTokens += lineTokens;
      }
    }

    // Flush remaining
    if (currentText.trim().length > 0) {
      chunks.push({
        content: currentText.trim(),
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        position: position++,
        sceneBreak: isSceneStart,
        tokenCount: currentTokens,
      });
    }
  }

  return chunks;
}

// ============================================
// Main Pipeline
// ============================================

async function processDocument(
  supabase: ReturnType<typeof createClient>,
  versionId: string,
  documentId: string,
  _projectId: string
) {
  console.log(`[Pipeline] Starting processing for version ${versionId}`);

  try {
    // --- Stage 1: Get version info and download file ---
    await updateStatus(supabase, versionId, "extracting");

    const { data: version } = await supabase
      .from("document_versions")
      .select("storage_path, file_size")
      .eq("id", versionId)
      .single();

    if (!version) throw new Error("Version not found");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("project-documents")
      .download(version.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Download failed: ${downloadError?.message}`);
    }

    const buffer = await fileData.arrayBuffer();
    const isDocx = version.storage_path.endsWith(".docx");

    // --- Stage 2: Extract text ---
    console.log(`[Pipeline] Extracting text (${isDocx ? "DOCX" : "PDF"})...`);
    const { fullText, pages } = isDocx
      ? await extractDocxText(buffer)
      : await extractPdfText(buffer);

    if (!fullText || fullText.trim().length === 0) {
      throw new Error("No text could be extracted from the document");
    }

    // Detect language
    const hebrewChars = (fullText.slice(0, 2000).match(/[\u0590-\u05FF]/g) || []).length;
    const latinChars = (fullText.slice(0, 2000).match(/[a-zA-Z]/g) || []).length;
    const total = hebrewChars + latinChars;
    const detectedLanguage = total === 0 ? "unknown" : hebrewChars / total > 0.7 ? "he" : hebrewChars / total < 0.3 ? "en" : "mixed";

    await updateStatus(supabase, versionId, "extracted", {
      structure_metadata: {
        totalPages: pages.length,
        detectedLanguage,
        fullTextLength: fullText.length,
      },
    });

    // --- Stage 3: Chunk ---
    await updateStatus(supabase, versionId, "chunking");
    console.log(`[Pipeline] Chunking document (${fullText.length} chars)...`);

    const chunks = chunkDocument(fullText);
    console.log(`[Pipeline] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("Document produced no chunks");
    }

    // Delete existing chunks for this version (idempotent)
    await supabase.from("document_chunks").delete().eq("version_id", versionId);

    // Insert chunks in batches of 50
    const chunkRecords = chunks.map((chunk) => ({
      version_id: versionId,
      chapter_number: chunk.chapterNumber,
      chapter_title: chunk.chapterTitle,
      position: chunk.position,
      scene_break: chunk.sceneBreak,
      content: chunk.content,
      token_count: chunk.tokenCount,
      metadata: {},
    }));

    for (let i = 0; i < chunkRecords.length; i += 50) {
      const batch = chunkRecords.slice(i, i + 50);
      const { error } = await supabase.from("document_chunks").insert(batch);
      if (error) throw new Error(`Failed to insert chunks: ${error.message}`);
    }

    await updateStatus(supabase, versionId, "chunked", {
      structure_metadata: {
        totalPages: pages.length,
        detectedLanguage,
        fullTextLength: fullText.length,
        chunkCount: chunks.length,
      },
    });

    // --- Stage 4: Done ---
    // Embeddings generation via gte-small exceeds Edge Function CPU limits.
    // Full-text search works without embeddings (GIN index on content).
    // Semantic search (embeddings) will be available when using Express server
    // or when Supabase relaxes CPU limits.
    await updateStatus(supabase, versionId, "ready", {
      processing_completed_at: new Date().toISOString(),
      structure_metadata: {
        totalPages: pages.length,
        detectedLanguage,
        fullTextLength: fullText.length,
        chunkCount: chunks.length,
      },
    });

    console.log(`[Pipeline] Version ${versionId} processing complete! (${chunks.length} chunks, full-text search ready)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Pipeline] Error:`, message);

    await supabase
      .from("document_versions")
      .update({
        status: "error",
        error_message: message,
        error_stage: getErrorStage(message),
      })
      .eq("id", versionId);
  }
}

function getErrorStage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("download") || lower.includes("extract")) return "extraction";
  if (lower.includes("chunk")) return "chunking";
  if (lower.includes("embedding") || lower.includes("insert")) return "indexing";
  return "extraction";
}

async function updateStatus(
  supabase: ReturnType<typeof createClient>,
  versionId: string,
  status: string,
  extra?: Record<string, unknown>
) {
  const update: Record<string, unknown> = { status, error_message: null, error_stage: null };
  if (status === "extracting" && !extra?.processing_started_at) {
    update.processing_started_at = new Date().toISOString();
  }
  if (extra) Object.assign(update, extra);

  await supabase.from("document_versions").update(update).eq("id", versionId);
}

// ============================================
// HTTP Handler
// ============================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { version_id, document_id, project_id } =
      (await req.json()) as ProcessRequest;

    if (!version_id || !document_id || !project_id) {
      return new Response(
        JSON.stringify({ error: "version_id, document_id, and project_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role (to bypass RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Run processing as a background task
    // This allows the HTTP response to return immediately while processing continues
    EdgeRuntime.waitUntil(
      processDocument(supabase, version_id, document_id, project_id)
    );

    return new Response(
      JSON.stringify({ status: "processing", version_id }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
