#!/usr/bin/env node
/**
 * Full-path live verification for Sub-base Locations, starting from a real PDF:
 *   generate PDF -> POST to the local server upload endpoint -> server pipeline
 *   (extraction -> chunking -> indexing) -> invoke the deployed extract-knowledge
 *   Edge Function with model_profile="sub-base-locations" -> read back and check.
 *
 * Prereqs:
 *   - Local server running (npm run dev:server) on API_BASE.
 *   - Deployed extract-knowledge with the sub-base-locations changes.
 *   - env: SUPABASE_DIAGNOSTIC_EMAIL, SUPABASE_DIAGNOSTIC_PASSWORD
 *   - client/.env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   - pdf-lib importable (npm install pdf-lib --no-save)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const API_BASE = process.env.API_BASE || "http://localhost:3001";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const fileEnv = readEnvFile(path.join(projectRoot, "client", ".env"));
const supabaseUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_DIAGNOSTIC_EMAIL;
const password = process.env.SUPABASE_DIAGNOSTIC_PASSWORD;
if (!supabaseUrl || !anonKey) throw new Error("Supabase URL or anon key is unavailable");
if (!email || !password) throw new Error("SUPABASE_DIAGNOSTIC_EMAIL and SUPABASE_DIAGNOSTIC_PASSWORD are required");

const supabase = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const outputDirectory = path.join(projectRoot, "tests", "results", "EXTRACTION_TEST_OUTPUT");

const DOCUMENT_LINES = [
  "Sub-base Locations PDF Live Verification",
  "",
  "The cosmos of Aeltharun is the whole of existence in this story. Within it lies",
  "a single inhabited world, the planet Var Solethi.",
  "",
  "Var Solethi has one charted continent, Or Dahl. On Or Dahl stands the Kingdom of",
  "Bael Turim, a realm that governs the continent northern half.",
  "",
  "In the Kingdom of Bael Turim there is a mountainous region called the Thornmarch.",
  "The Thornmarch holds the walled city of Kesh Amara. Kesh Amara is a warden-hold,",
  "a settlement rank unique to Bael Turim that ranks between an ordinary city and a",
  "royal fortress. Inside Kesh Amara, at its centre, rises the Obsidian Spire, a",
  "fortress-tower of black glass. On the top floor of the Obsidian Spire is the",
  "Warden Chamber, a small circular room where records are kept.",
  "",
  "Distractors that must not be extracted: the archivist Dorian Vale lives in the",
  "Warden Chamber and keeps a silver moon pendant in a copper box. His colleague",
  "Mira Stonewell can read memories by touch, an ability the wardens call farsight.",
  "",
  "Aeltharun contains Var Solethi. Var Solethi contains Or Dahl. Or Dahl contains",
  "the Kingdom of Bael Turim. Bael Turim contains the Thornmarch. The Thornmarch",
  "contains Kesh Amara. Kesh Amara contains the Obsidian Spire. The Obsidian Spire",
  "contains the Warden Chamber.",
];

async function buildPdfBuffer() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of DOCUMENT_LINES) {
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 20;
  }
  return Buffer.from(await pdf.save());
}

function requireData(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new Error(`${label}: no data returned`);
  return result.data;
}

async function pollVersionIndexed(versionId, { timeoutMs = 180_000, intervalMs = 3_000 } = {}) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("document_versions")
      .select("id, status, error_message")
      .eq("id", versionId)
      .single();
    if (error) throw new Error(`version poll: ${error.message}`);
    last = data;
    if (data.status === "indexed" || data.status === "analyzing" || data.status === "completed") return data;
    if (data.status === "failed" || data.status === "error") {
      throw new Error(`pipeline failed: status=${data.status} ${data.error_message || ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`pipeline did not reach indexed in time (last status: ${last?.status})`);
}

const CONTAINMENT_TYPES = new Set(["contained_in", "contains", "part_of", "located_in"]);
const normalizeRelType = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

async function main() {
  const auth = await supabase.auth.signInWithPassword({ email, password });
  if (auth.error || !auth.data.user) throw new Error(`sign-in: ${auth.error?.message || "no user"}`);
  const user = auth.data.user;
  const accessToken = auth.data.session?.access_token;
  if (!accessToken) throw new Error("no access token from sign-in");

  const project = requireData("project creation", await supabase
    .from("projects")
    .insert({ name: `Sub-base Locations PDF Live ${new Date().toISOString()}`, user_id: user.id, description: "PDF full-path live verification for sub-base-locations." })
    .select("id, name")
    .single());

  const pdfBuffer = await buildPdfBuffer();
  const pdfPath = path.join(outputDirectory, "sub_base_locations_live.pdf");
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(pdfPath, pdfBuffer);

  const form = new FormData();
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "sub-base-locations-live.pdf");
  const uploadResponse = await fetch(`${API_BASE}/api/projects/${project.id}/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const uploadJson = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error(`upload failed (${uploadResponse.status}): ${JSON.stringify(uploadJson)}`);
  const { document_id: documentId, version_id: versionId } = uploadJson;

  const versionAfterPipeline = await pollVersionIndexed(versionId);

  const chunkResult = await supabase.from("document_chunks").select("id, position, content").eq("version_id", versionId).order("position");
  if (chunkResult.error) throw new Error(`chunk query: ${chunkResult.error.message}`);
  const chunks = chunkResult.data || [];
  if (chunks.length === 0) throw new Error("no chunks produced by the server pipeline");

  const extractionRunId = randomUUID();
  const invokeResult = await supabase.functions.invoke("extract-knowledge", {
    body: {
      version_id: versionId,
      document_id: documentId,
      project_id: project.id,
      user_id: user.id,
      extraction_mode: "bootstrap",
      extraction_run_id: extractionRunId,
      target_branch_id: null,
      offset: 0,
      limit: chunks.length,
      model_profile: "sub-base-locations",
      extraction_strategy: "legacy-sequential",
    },
  });
  if (invokeResult.error) throw new Error(`extract-knowledge invoke: ${invokeResult.error.message}`);
  if (!invokeResult.data?.success) throw new Error(`extract-knowledge response: ${JSON.stringify(invokeResult.data)}`);

  const [rawRes, entRes, relRes, placeTypeRes, valRes] = await Promise.all([
    supabase.from("raw_extractions").select("*").eq("project_id", project.id).eq("extraction_run_id", extractionRunId).order("created_at", { ascending: false }).limit(5),
    supabase.from("knowledge_entities").select("id, entity_type, canonical_name, layer, branch_id").eq("project_id", project.id).eq("user_id", user.id),
    supabase.from("knowledge_entity_relationships").select("relationship_type, source_entity_id, target_entity_id").eq("project_id", project.id),
    supabase.from("knowledge_place_types").select("type_key, label, category, is_system, project_id").eq("project_id", project.id),
    supabase.from("knowledge_entity_values").select("id, raw_extraction_id").eq("project_id", project.id),
  ]);
  for (const [label, r] of Object.entries({ rawRes, entRes, relRes, placeTypeRes, valRes })) {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
  }

  const raw = (rawRes.data || [])[0];
  const entities = entRes.data || [];
  const relationships = relRes.data || [];
  const learnedPlaceTypes = placeTypeRes.data || [];
  const values = valRes.data || [];
  const locationEntities = entities.filter((e) => e.entity_type === "location");
  const nonLocationEntities = entities.filter((e) => e.entity_type !== "location");
  const nonContainmentRels = relationships.filter((r) => !CONTAINMENT_TYPES.has(normalizeRelType(r.relationship_type)));
  const rawResponse = raw?.raw_response || {};
  const outOfScopeBuckets = ["characters", "objects", "abilities", "magic_abilities", "events", "organizations"]
    .filter((k) => Array.isArray(rawResponse[k]) && rawResponse[k].length > 0);

  const checks = {
    pipeline_reached_index_stage: ["indexed", "analyzing", "completed"].includes(versionAfterPipeline.status),
    server_produced_chunks: chunks.length > 0,
    response_success: invokeResult.data.success === true,
    response_profile: invokeResult.data.telemetry?.model_profile === "sub-base-locations",
    real_model_used: typeof raw?.model === "string" && raw.model.length > 0,
    canonical_has_locations: locationEntities.length > 0,
    canonical_location_types_only: entities.length > 0 && nonLocationEntities.length === 0,
    raw_no_out_of_scope_buckets: outOfScopeBuckets.length === 0,
    relationships_are_containment_only: relationships.length > 0 && nonContainmentRels.length === 0,
    main_bootstrap: locationEntities.every((e) => e.layer === "main" && e.branch_id === null),
    values_have_lineage: values.length === 0 || values.every((v) => v.raw_extraction_id === raw?.id),
    learned_place_type_persisted: learnedPlaceTypes.length > 0
      && learnedPlaceTypes.every((t) => t.is_system === false && t.project_id === project.id),
  };

  const output = {
    generated_at: new Date().toISOString(),
    mode: "pdf-full-path",
    api_base: API_BASE,
    pdf_path: path.relative(projectRoot, pdfPath),
    pdf_bytes: pdfBuffer.length,
    project_id: project.id,
    document_id: documentId,
    version_id: versionId,
    version_status_after_pipeline: versionAfterPipeline.status,
    server_chunk_count: chunks.length,
    server_chunk_chars: chunks.reduce((sum, c) => sum + (c.content?.length || 0), 0),
    extraction_run_id: extractionRunId,
    telemetry: invokeResult.data.telemetry || null,
    summary: invokeResult.data.summary || null,
    entities: entities.map((e) => `${e.entity_type}:${e.canonical_name}`),
    relationship_types: [...new Set(relationships.map((r) => r.relationship_type))],
    learned_place_types: learnedPlaceTypes.map((t) => `${t.type_key} (${t.label}; ${t.category})`),
    checks,
    all_checks_pass: Object.values(checks).every(Boolean),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDirectory, `locations_pdf_live_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ output_path: path.relative(projectRoot, outputPath), ...output }, null, 2));
  if (!output.all_checks_pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`PDF live verification failed: ${error.message}`);
  process.exitCode = 1;
});
