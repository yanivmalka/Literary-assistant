#!/usr/bin/env node
/**
 * Live, isolated verification runner for Sub-base Locations.
 * Creates a new project, uploads a place-hierarchy fixture (with character /
 * object / ability distractors), invokes the authenticated Edge Function with
 * model_profile="sub-base-locations", and captures raw/canonical outputs.
 *
 * Prerequisites:
 *   - The updated extract-knowledge Edge Function must be DEPLOYED to the target
 *     Supabase project (Part A + Part B changes), otherwise this exercises the
 *     old prompt/persistence path.
 *   - env: SUPABASE_DIAGNOSTIC_EMAIL, SUPABASE_DIAGNOSTIC_PASSWORD
 *   - client/.env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *
 * Re-inspect an existing run without re-invoking the model:
 *   LOCATIONS_LIVE_PROJECT_ID=... LOCATIONS_LIVE_RUN_ID=... node scripts/verification/run_locations_live.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

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

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fixturePath = path.join(projectRoot, "tests", "fixtures", "SUB_BASE_LOCATIONS_TEST_DOCUMENT.md");
const outputDirectory = path.join(projectRoot, "tests", "results", "EXTRACTION_TEST_OUTPUT");

function requireData(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new Error(`${label}: no data returned`);
  return result.data;
}

async function insertProject(user) {
  return requireData("project creation", await supabase
    .from("projects")
    .insert({
      name: `Sub-base Locations Live Verification ${new Date().toISOString()}`,
      user_id: user.id,
      description: "Isolated live verification for sub-base-locations.",
    })
    .select("id, name, user_id, created_at")
    .single());
}

async function insertDocument(project, user) {
  return requireData("document creation", await supabase
    .from("documents")
    .insert({
      project_id: project.id,
      user_id: user.id,
      name: "Sub-base Locations Live Verification",
      file_type: "pdf",
    })
    .select("id, project_id, user_id, name")
    .single());
}

async function insertVersion(document) {
  return requireData("version creation", await supabase
    .from("document_versions")
    .insert({
      document_id: document.id,
      version_number: 1,
      storage_path: `live-verification/${document.id}/document.pdf`,
      file_size: Buffer.byteLength("Sub-base Locations Live Verification"),
      status: "uploaded",
    })
    .select("id, document_id, version_number")
    .single());
}

async function insertChunks(version, content) {
  const chunks = [{
    version_id: version.id,
    position: 0,
    content: content.substring(0, 8000),
  }];
  return requireData("chunk creation", await supabase
    .from("document_chunks")
    .insert(chunks)
    .select("id, version_id, position, content"));
}

async function invokeExtraction(project, document, version, user) {
  const extractionRunId = randomUUID();
  const result = await supabase.functions.invoke("extract-knowledge", {
    body: {
      version_id: version.id,
      document_id: document.id,
      project_id: project.id,
      user_id: user.id,
      extraction_mode: "bootstrap",
      extraction_run_id: extractionRunId,
      target_branch_id: null,
      offset: 0,
      limit: 1,
      model_profile: "sub-base-locations",
      extraction_strategy: "legacy-sequential",
    },
  });
  if (result.error) throw new Error(`extraction invocation: ${result.error.message}`);
  if (!result.data?.success) throw new Error(`extraction response: ${JSON.stringify(result.data)}`);
  return { extractionRunId, response: result.data };
}

async function queryProjectPlaceTypes(projectId) {
  const result = await supabase
    .from("knowledge_place_types")
    .select("type_key, label, category, is_system, project_id")
    .eq("project_id", projectId);
  if (result.error) throw new Error(`place types query: ${result.error.message}`);
  return result.data || [];
}

async function queryVerificationData(project, document, version, user, extractionRunId) {
  const [raw, entities, values, branches] = await Promise.all([
    supabase.from("raw_extractions").select("*").eq("project_id", project.id).eq("extraction_run_id", extractionRunId).order("created_at", { ascending: false }).limit(10),
    supabase.from("knowledge_entities").select("*").eq("project_id", project.id).eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("knowledge_entity_values").select("*").eq("project_id", project.id).order("created_at", { ascending: true }),
    supabase.from("knowledge_branch_entities").select("*").eq("project_id", project.id),
  ]);

  for (const [label, result] of Object.entries({ raw, entities, values, branches })) {
    if (result.error) throw new Error(`${label} verification query: ${result.error.message}`);
  }

  const entityRows = entities.data || [];
  const entityIds = entityRows.map((entity) => entity.id);
  const valueRows = values.data || [];
  const valueIds = valueRows.map((value) => value.id);
  const emptyId = "00000000-0000-0000-0000-000000000000";
  const [aliases, mentions, evidence, relationships] = await Promise.all([
    supabase.from("knowledge_entity_aliases").select("*").in("entity_id", entityIds.length > 0 ? entityIds : [emptyId]),
    supabase.from("knowledge_entity_mentions").select("*").in("entity_id", entityIds.length > 0 ? entityIds : [emptyId]),
    supabase.from("knowledge_entity_value_evidence").select("*").in("value_id", valueIds.length > 0 ? valueIds : [emptyId]),
    supabase.from("knowledge_entity_relationships").select("*").eq("project_id", project.id),
  ]);

  for (const [label, result] of Object.entries({ aliases, mentions, evidence, relationships })) {
    if (result.error) throw new Error(`${label} verification query: ${result.error.message}`);
  }

  const projectPlaceTypes = await queryProjectPlaceTypes(project.id);

  return {
    project,
    document,
    version,
    user_id: user.id,
    extraction_run_id: extractionRunId,
    raw_extractions: raw.data || [],
    entities: entityRows,
    aliases: aliases.data || [],
    mentions: mentions.data || [],
    values: valueRows,
    value_evidence: evidence.data || [],
    relationships: relationships.data || [],
    branch_entities: branches.data || [],
    project_place_types: projectPlaceTypes,
  };
}

const CONTAINMENT_TYPES = new Set(["contained_in", "contains", "part_of", "located_in"]);

function normalizeRelType(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function buildChecks(data, response) {
  const raw = data.raw_extractions[0];
  const locationEntities = data.entities.filter((entity) => entity.entity_type === "location");
  const nonLocationEntities = data.entities.filter((entity) => entity.entity_type !== "location");
  const mainEntities = locationEntities.filter((entity) => entity.layer === "main" && entity.branch_id === null);
  const rawResponse = raw?.raw_response || {};

  const inScopeBuckets = ["locations"].filter((key) => Array.isArray(rawResponse[key]) && rawResponse[key].length > 0);
  const outOfScopeBuckets = ["characters", "objects", "abilities", "magic_abilities", "events", "organizations"]
    .filter((key) => Array.isArray(rawResponse[key]) && rawResponse[key].length > 0);

  const nonContainmentRelationships = data.relationships.filter(
    (rel) => !CONTAINMENT_TYPES.has(normalizeRelType(rel.relationship_type || rel.type)),
  );

  const learnedPlaceTypes = data.project_place_types || [];

  const rescuedLocations = locationEntities.filter((entity) => {
    const sf = entity.structured_fields || {};
    const attrs = entity.attributes || {};
    return sf.is_descriptive_name === true || attrs.is_descriptive_name === true;
  });

  const checks = {
    response_success: response.success === true,
    response_profile: response.telemetry?.model_profile === "sub-base-locations",
    response_strategy: response.telemetry?.extraction_strategy === "legacy-sequential",
    actual_model_recorded: typeof (raw?.model) === "string" && raw.model.length > 0,
    raw_extraction_recorded: Boolean(raw?.id && raw?.model_profile === "sub-base-locations"),
    raw_is_bucketed_persistence_contract: typeof rawResponse === "object" && rawResponse !== null && !Array.isArray(rawResponse) && rawResponse.schema_version === undefined && !Array.isArray(rawResponse.entities),
    raw_has_locations: Array.isArray(rawResponse.locations) && rawResponse.locations.length > 0,
    raw_no_out_of_scope_buckets: outOfScopeBuckets.length === 0,
    canonical_has_locations: locationEntities.length > 0,
    canonical_location_types_only: data.entities.length > 0 && nonLocationEntities.length === 0,
    main_bootstrap: mainEntities.length === locationEntities.length && data.branch_entities.length === 0,
    relationships_are_containment_only: data.relationships.length > 0 && nonContainmentRelationships.length === 0,
    values_have_lineage: data.values.length === 0 || data.values.every((value) => value.raw_extraction_id === raw?.id),
    // The model does not always flag the borderline "warden-hold" type, so this
    // asserts scoping is correct for whatever it did learn rather than requiring
    // a learned row every run. planNewPlaceTypes has its own unit coverage.
    learned_place_types_are_project_scoped: learnedPlaceTypes.every(
      (placeType) => placeType.is_system === false && placeType.project_id === data.project.id,
    ),
    descriptive_name_rescued: rescuedLocations.length > 0,
  };

  return {
    checks,
    raw_bucket_keys_with_values: inScopeBuckets,
    raw_out_of_scope_bucket_keys_with_values: outOfScopeBuckets,
    non_containment_relationship_types: [...new Set(nonContainmentRelationships.map((rel) => rel.relationship_type || rel.type))],
    learned_place_types: learnedPlaceTypes.map((placeType) => `${placeType.type_key} (${placeType.label}; ${placeType.category})`),
    rescued_descriptive_names: rescuedLocations.map((entity) => entity.canonical_name || entity.name),
    place_types_learned_reported: response.summary?.place_types_learned ?? null,
    entity_counts: {
      total: data.entities.length,
      locations: locationEntities.length,
      non_locations: nonLocationEntities.length,
      non_location_names: nonLocationEntities.map((entity) => `${entity.entity_type}:${entity.canonical_name || entity.name}`),
      aliases: data.aliases.length,
      mentions: data.mentions.length,
      values: data.values.length,
      value_evidence: data.value_evidence.length,
      relationships: data.relationships.length,
      branch_entities: data.branch_entities.length,
    },
    all_checks_pass: Object.values(checks).every(Boolean),
  };
}

async function inspectExistingRun(user, projectId, extractionRunId) {
  const projectResult = await supabase.from("projects").select("id, name, user_id, created_at").eq("id", projectId).eq("user_id", user.id).single();
  if (projectResult.error) throw new Error(`existing project query: ${projectResult.error.message}`);
  const documentResult = await supabase.from("documents").select("id, project_id, name").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).single();
  if (documentResult.error) throw new Error(`existing document query: ${documentResult.error.message}`);
  const versionResult = await supabase.from("document_versions").select("id, document_id, version_number").eq("document_id", documentResult.data.id).order("version_number", { ascending: false }).limit(1).single();
  if (versionResult.error) throw new Error(`existing version query: ${versionResult.error.message}`);

  const data = await queryVerificationData(projectResult.data, documentResult.data, versionResult.data, user, extractionRunId);
  const raw = data.raw_extractions[0];
  const response = {
    success: true,
    telemetry: {
      model_profile: raw?.model_profile || null,
      extraction_strategy: raw?.extraction_strategy || null,
      model: raw?.model || null,
    },
  };
  const verification = buildChecks(data, response);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDirectory, `locations_live_inspect_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: "inspect-existing",
    extraction_run_id: extractionRunId,
    verification,
    data,
  }, null, 2));
  console.log(JSON.stringify({ output_path: path.relative(projectRoot, outputPath), project_id: projectId, extraction_run_id: extractionRunId, verification }, null, 2));
  if (!verification.all_checks_pass) process.exitCode = 2;
}

async function main() {
  const auth = await supabase.auth.signInWithPassword({ email, password });
  if (auth.error || !auth.data.user) throw new Error(`Supabase sign-in: ${auth.error?.message || "no user returned"}`);
  const user = auth.data.user;

  if (process.env.LOCATIONS_LIVE_PROJECT_ID && process.env.LOCATIONS_LIVE_RUN_ID) {
    await inspectExistingRun(user, process.env.LOCATIONS_LIVE_PROJECT_ID, process.env.LOCATIONS_LIVE_RUN_ID);
    return;
  }

  const content = fs.readFileSync(fixturePath, "utf8");
  const project = await insertProject(user);
  const document = await insertDocument(project, user);
  const version = await insertVersion(document);
  const chunks = await insertChunks(version, content);
  const extraction = await invokeExtraction(project, document, version, user);
  const data = await queryVerificationData(project, document, version, user, extraction.extractionRunId);
  const verification = buildChecks(data, extraction.response);

  fs.mkdirSync(outputDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDirectory, `locations_live_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    fixture: path.relative(projectRoot, fixturePath),
    extraction_response: extraction.response,
    verification,
    data,
    chunks: chunks.map(({ content: chunkContent, ...chunk }) => ({ ...chunk, content_length: chunkContent.length })),
  }, null, 2));

  console.log(JSON.stringify({
    output_path: path.relative(projectRoot, outputPath),
    project_id: project.id,
    document_id: document.id,
    version_id: version.id,
    user_id: user.id,
    extraction_run_id: extraction.extractionRunId,
    raw_extraction_id: data.raw_extractions[0]?.id || null,
    telemetry: extraction.response.telemetry || null,
    verification,
  }, null, 2));

  if (!verification.all_checks_pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Live locations verification failed: ${error.message}`);
  process.exitCode = 1;
});
