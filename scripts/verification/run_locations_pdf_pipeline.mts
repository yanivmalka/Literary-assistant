/**
 * PDF -> real server PDF text extraction -> real server chunker -> deployed
 * extract-knowledge Edge Function (model_profile="sub-base-locations") -> verify.
 *
 * Unlike run_locations_pdf_live.mjs this does not need the local HTTP server or a
 * service-role key: it calls the server's own PdfTextExtractor and chunkDocument
 * in-process, then persists chunks and invokes the Edge Function as the signed-in
 * owner. It still proves "a PDF was uploaded and extracted by the model".
 *
 * Run:  cd server && node_modules/.bin/tsx ../scripts/verification/run_locations_pdf_pipeline.mts
 * env:  SUPABASE_DIAGNOSTIC_EMAIL, SUPABASE_DIAGNOSTIC_PASSWORD
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PdfTextExtractor } from "../../server/src/documents/extractors/index.js";
import { detectStructure, chunkDocument, mergeSmallChunks, loadChunkerConfig } from "../../server/src/documents/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const fe = readEnvFile(path.join(projectRoot, "client", ".env"));
const supabaseUrl = process.env.VITE_SUPABASE_URL || fe.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || fe.VITE_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_DIAGNOSTIC_EMAIL;
const password = process.env.SUPABASE_DIAGNOSTIC_PASSWORD;
if (!supabaseUrl || !anonKey) throw new Error("Supabase URL or anon key unavailable");
if (!email || !password) throw new Error("SUPABASE_DIAGNOSTIC_EMAIL / SUPABASE_DIAGNOSTIC_PASSWORD required");

const supabase = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const outputDirectory = path.join(projectRoot, "tests", "results", "EXTRACTION_TEST_OUTPUT");

const DOCUMENT_LINES = [
  "Sub-base Locations PDF Pipeline Verification",
  "",
  "The cosmos of Aeltharun is the whole of existence in this story. Within it lies a single inhabited world, the planet Var Solethi.",
  "Var Solethi has one charted continent, Or Dahl. On Or Dahl stands the Kingdom of Bael Turim, a realm that governs the northern half of the continent.",
  "In the Kingdom of Bael Turim there is a mountainous region called the Thornmarch. The Thornmarch holds the walled city of Kesh Amara.",
  "Kesh Amara is a warden-hold, a settlement rank unique to Bael Turim that ranks between an ordinary city and a royal fortress.",
  "Inside Kesh Amara, at its centre, rises the Obsidian Spire, a fortress-tower of black glass. On the top floor of the Obsidian Spire is the Warden Chamber, a small circular room where records are kept.",
  "Distractors that must not be extracted: the archivist Dorian Vale lives in the Warden Chamber and keeps a silver moon pendant in a copper box. His colleague Mira Stonewell can read memories by touch, an ability the wardens call farsight.",
  "Aeltharun contains Var Solethi. Var Solethi contains Or Dahl. Or Dahl contains the Kingdom of Bael Turim. Bael Turim contains the Thornmarch. The Thornmarch contains Kesh Amara. Kesh Amara contains the Obsidian Spire. The Obsidian Spire contains the Warden Chamber.",
];

async function buildPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const paragraph of DOCUMENT_LINES) {
    for (const line of wrap(paragraph, 95)) {
      if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 18;
    }
    y -= 6;
  }
  return Buffer.from(await pdf.save());
}

function wrap(text: string, width: number): string[] {
  if (text === "") return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > width) { lines.push(current.trim()); current = w; }
    else current = (current + " " + w).trim();
  }
  if (current) lines.push(current);
  return lines;
}

function requireData<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new Error(`${label}: no data`);
  return result.data;
}

const CONTAINMENT = new Set(["contained_in", "contains", "part_of", "located_in"]);
const norm = (v: unknown) => String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

async function main() {
  const auth = await supabase.auth.signInWithPassword({ email, password });
  if (auth.error || !auth.data.user) throw new Error(`sign-in: ${auth.error?.message || "no user"}`);
  const user = auth.data.user;

  // 1. real PDF
  const pdfBuffer = await buildPdf();
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "sub_base_locations_pipeline.pdf"), pdfBuffer);

  // 2. real server PDF text extraction
  const extraction = await new PdfTextExtractor().extract(pdfBuffer);
  if (extraction.isScanned || !extraction.fullText.trim()) {
    throw new Error(`PDF text extraction produced no usable text (isScanned=${extraction.isScanned})`);
  }

  // 3. real server structure detection + chunker (same calls as the pipeline)
  const chunkerConfig = loadChunkerConfig();
  const structure = detectStructure(extraction.fullText);
  let chunked = chunkDocument(structure, chunkerConfig);
  chunked = mergeSmallChunks(chunked, chunkerConfig.minTokens);
  if (chunked.length === 0) throw new Error("chunker produced no chunks");

  // 4. persist project / document / version / chunks as the owner
  const project = requireData("project", await supabase.from("projects")
    .insert({ name: `Sub-base Locations PDF Pipeline ${new Date().toISOString()}`, user_id: user.id, description: "PDF pipeline verification for sub-base-locations." })
    .select("id").single());
  const document = requireData("document", await supabase.from("documents")
    .insert({ project_id: project.id, user_id: user.id, name: "sub-base-locations-pipeline.pdf", file_type: "pdf" })
    .select("id").single());
  const version = requireData("version", await supabase.from("document_versions")
    .insert({ document_id: document.id, version_number: 1, storage_path: `pipeline-verification/${document.id}/doc.pdf`, file_size: pdfBuffer.length, status: "indexed" })
    .select("id").single());
  requireData("chunks", await supabase.from("document_chunks")
    .insert(chunked.map((c, i) => ({ version_id: version.id, position: i, content: c.content })))
    .select("id"));

  // 5. invoke the deployed Edge Function
  const extractionRunId = randomUUID();
  const invoke = await supabase.functions.invoke("extract-knowledge", {
    body: {
      version_id: version.id, document_id: document.id, project_id: project.id, user_id: user.id,
      extraction_mode: "bootstrap", extraction_run_id: extractionRunId, target_branch_id: null,
      offset: 0, limit: chunked.length, model_profile: "sub-base-locations", extraction_strategy: "legacy-sequential",
    },
  });
  if (invoke.error) throw new Error(`invoke: ${invoke.error.message}`);
  if (!invoke.data?.success) throw new Error(`response: ${JSON.stringify(invoke.data)}`);

  // 6. read back and verify
  const [rawRes, entRes, relRes, ptRes, valRes] = await Promise.all([
    supabase.from("raw_extractions").select("*").eq("project_id", project.id).eq("extraction_run_id", extractionRunId).order("created_at", { ascending: false }).limit(5),
    supabase.from("knowledge_entities").select("id, entity_type, canonical_name, layer, branch_id").eq("project_id", project.id).eq("user_id", user.id),
    supabase.from("knowledge_entity_relationships").select("relationship_type").eq("project_id", project.id),
    supabase.from("knowledge_place_types").select("type_key, label, category, is_system, project_id").eq("project_id", project.id),
    supabase.from("knowledge_entity_values").select("id, raw_extraction_id").eq("project_id", project.id),
  ]);
  for (const [l, r] of Object.entries({ rawRes, entRes, relRes, ptRes, valRes })) if (r.error) throw new Error(`${l}: ${r.error.message}`);

  const raw = (rawRes.data || [])[0];
  const entities = entRes.data || [];
  const relationships = relRes.data || [];
  const learned = ptRes.data || [];
  const values = valRes.data || [];
  const locations = entities.filter((e) => e.entity_type === "location");
  const nonLocations = entities.filter((e) => e.entity_type !== "location");
  const rawResponse = (raw?.raw_response as Record<string, unknown>) || {};
  const outOfScope = ["characters", "objects", "abilities", "magic_abilities", "events", "organizations"]
    .filter((k) => Array.isArray(rawResponse[k]) && (rawResponse[k] as unknown[]).length > 0);
  const nonContainment = relationships.filter((r) => !CONTAINMENT.has(norm(r.relationship_type)));

  const checks = {
    pdf_text_extracted_by_server: extraction.fullText.includes("Aeltharun") && !extraction.isScanned,
    server_chunker_produced_chunks: chunked.length > 0,
    response_success: invoke.data.success === true,
    response_profile: invoke.data.telemetry?.model_profile === "sub-base-locations",
    real_model_used: typeof raw?.model === "string" && raw.model.length > 0,
    canonical_has_locations: locations.length > 0,
    canonical_location_types_only: entities.length > 0 && nonLocations.length === 0,
    raw_no_out_of_scope_buckets: outOfScope.length === 0,
    relationships_are_containment_only: relationships.length > 0 && nonContainment.length === 0,
    main_bootstrap: locations.every((e) => e.layer === "main" && e.branch_id === null),
    values_have_lineage: values.length === 0 || values.every((v) => v.raw_extraction_id === raw?.id),
    learned_place_types_are_project_scoped: learned.every((t) => t.is_system === false && t.project_id === project.id),
  };

  const output = {
    generated_at: new Date().toISOString(),
    mode: "pdf-pipeline-in-process",
    pdf_bytes: pdfBuffer.length,
    pdf_pages: extraction.totalPages,
    server_extractor: extraction.metadata.extractorUsed,
    server_extracted_chars: extraction.fullText.length,
    server_chunk_count: chunked.length,
    project_id: project.id, document_id: document.id, version_id: version.id,
    extraction_run_id: extractionRunId,
    telemetry: invoke.data.telemetry || null,
    summary: invoke.data.summary || null,
    entities: entities.map((e) => `${e.entity_type}:${e.canonical_name}`),
    relationship_types: [...new Set(relationships.map((r) => r.relationship_type))],
    learned_place_types: learned.map((t) => `${t.type_key} (${t.label}; ${t.category})`),
    checks,
    all_checks_pass: Object.values(checks).every(Boolean),
  };
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outputDirectory, `locations_pdf_pipeline_${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ output_path: path.relative(projectRoot, outPath), ...output }, null, 2));
  if (!output.all_checks_pass) process.exitCode = 2;
}

main().catch((e) => { console.error(`PDF pipeline verification failed: ${e.message}`); process.exitCode = 1; });
