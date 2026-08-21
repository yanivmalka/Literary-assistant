import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  "https://lqfqfzqcrqluxanhnjwu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww"
);

async function main() {
  try {
    console.log("🚀 CONTROLLED EXTRACTION FLOW\n");

    // Step 1: Authenticate
    console.log("1️⃣  Authenticating...");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Not authenticated. Please sign in first.");
    }
    console.log(`✓ Authenticated as: ${user.email}\n`);

    const userId = user.id;

    // Step 2: Create project
    console.log("2️⃣  Creating test project...");
    const projectName = `Controlled Test - ${new Date().toISOString().split("T")[0]}`;
    const { data: project, error: projError } = await supabase
      .from("projects")
      .insert({
        name: projectName,
        user_id: userId,
        description: "Controlled extraction test for entity consolidation",
      })
      .select()
      .single();

    if (projError) throw new Error(`Project creation failed: ${projError.message}`);
    console.log(`✓ Project created: ${project.id}\n`);

    const projectId = project.id;

    // Step 3: Read test document
    console.log("3️⃣  Reading test document...");
    const docPath = path.join(__dirname, "../tests/fixtures/CONTROLLED_TEST_DOCUMENT.md");
    const docContent = fs.readFileSync(docPath, "utf-8");
    console.log(`✓ Read ${docContent.length} bytes\n`);

    // Step 4: Create document
    console.log("4️⃣  Creating document...");
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        project_id: projectId,
        user_id: userId,
        name: "Controlled Test Document",
        file_type: "markdown",
      })
      .select()
      .single();

    if (docError) throw new Error(`Document creation failed: ${docError.message}`);
    console.log(`✓ Document created: ${doc.id}\n`);

    const documentId = doc.id;

    // Step 5: Create document version
    console.log("5️⃣  Creating document version...");
    const { data: version, error: verError } = await supabase
      .from("document_versions")
      .insert({
        document_id: documentId,
        user_id: userId,
        version_number: 1,
        status: "completed",
      })
      .select()
      .single();

    if (verError) throw new Error(`Version creation failed: ${verError.message}`);
    console.log(`✓ Version created: ${version.id}\n`);

    const versionId = version.id;

    // Step 6: Create chunks
    console.log("6️⃣  Chunking document...");
    
    // Simple chunking: split by "### " (markdown h3 headers)
    const parts = docContent.split("### ").filter(p => p.trim());
    const chunks = parts.map((part, idx) => ({
      version_id: versionId,
      user_id: userId,
      position: idx,
      content: `### ${part}`.substring(0, 8000),
    }));

    const { data: chunkData, error: chunkError } = await supabase
      .from("document_chunks")
      .insert(chunks)
      .select();

    if (chunkError) throw new Error(`Chunking failed: ${chunkError.message}`);
    console.log(`✓ Created ${chunks.length} chunks\n`);

    // Step 7: Invoke extraction
    console.log("7️⃣  Invoking extract-knowledge...");
    const extractionRunId = randomUUID();
    const { data: extraction, error: extractError } = await supabase.functions.invoke(
      "extract-knowledge",
      {
        body: {
          version_id: versionId,
          document_id: documentId,
          project_id: projectId,
          user_id: userId,
          extraction_mode: "bootstrap",
          extraction_run_id: extractionRunId,
          target_branch_id: null,
          offset: 0,
          limit: 100,
        },
      }
    );

    if (extractError) throw new Error(`Extraction failed: ${extractError.message}`);
    console.log(`✓ Extraction completed`);
    console.log(`  - Success: ${extraction.success}`);
    console.log(`  - Done: ${extraction.done}`);
    if (extraction.summary) {
      console.log(`  - Entities saved: ${extraction.summary.entities_saved}`);
      console.log(`  - Layer: ${extraction.summary.layer}`);
      console.log(`  - Raw extraction ID: ${extraction.summary.raw_extraction_id}\n`);
    }

    // Step 8: Get raw extraction
    console.log("8️⃣  Retrieving raw LLM response...");
    const { data: rawExtraction, error: rawError } = await supabase
      .from("raw_extractions")
      .select("id, raw_response, model, chunks_count")
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (rawError) throw new Error(`Failed to get raw extraction: ${rawError.message}`);
    console.log(`✓ Raw extraction retrieved`);
    console.log(`  - Model: ${rawExtraction.model}`);
    console.log(`  - Chunks: ${rawExtraction.chunks_count}\n`);

    // Step 9: Query Main entities
    console.log("9️⃣  Querying Main entities...");
    const { data: mainEntities, error: mainError, count } = await supabase
      .from("knowledge_entities")
      .select("id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, layer, branch_id", { count: "exact" })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("layer", "main");

    if (mainError) throw new Error(`Entity query failed: ${mainError.message}`);
    console.log(`✓ Found ${count} Main entities\n`);

    // Step 10: Save outputs
    console.log("🔟 Saving outputs...");
    const outputDir = path.join(__dirname, "../EXTRACTION_TEST_OUTPUT");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Save extraction summary
    const summary = {
      timestamp,
      project_id: projectId,
      document_id: documentId,
      version_id: versionId,
      user_id: userId,
      chunks: chunks.length,
      extraction: extraction.summary,
      llm_model: rawExtraction.model,
      entities_created: count,
    };
    fs.writeFileSync(
      path.join(outputDir, `summary_${timestamp}.json`),
      JSON.stringify(summary, null, 2)
    );
    console.log(`✓ Saved summary`);

    // Save raw LLM response
    if (rawExtraction.raw_response) {
      fs.writeFileSync(
        path.join(outputDir, `llm_response_${timestamp}.json`),
        JSON.stringify(rawExtraction.raw_response, null, 2)
      );
      console.log(`✓ Saved LLM response`);
    }

    // Save entities
    fs.writeFileSync(
      path.join(outputDir, `entities_${timestamp}.json`),
      JSON.stringify(mainEntities, null, 2)
    );
    console.log(`✓ Saved entities\n`);

    // Print summary
    console.log("════════════════════════════════════════");
    console.log("✅ CONTROLLED EXTRACTION COMPLETE");
    console.log("════════════════════════════════════════");
    console.log(`Project ID: ${projectId}`);
    console.log(`Document ID: ${documentId}`);
    console.log(`Version ID: ${versionId}`);
    console.log(`Chunks: ${chunks.length}`);
    console.log(`Entities created: ${count}`);
    console.log(`LLM Model: ${rawExtraction.model}`);
    console.log(`Output directory: ${outputDir}\n`);

    // Print sample of LLM response
    if (rawExtraction.raw_response) {
      const resp = rawExtraction.raw_response;
      console.log("LLM Response content:");
      console.log(`  - Characters: ${resp.characters?.length || 0}`);
      console.log(`  - Objects: ${resp.objects?.length || 0}`);
      console.log(`  - Relationships: ${resp.relationships?.length || 0}`);
      console.log(`  - Events: ${resp.events?.length || 0}\n`);

      // Print entities
      if (resp.characters) {
        console.log("Characters extracted:");
        resp.characters.forEach(c => {
          console.log(`  - ${c.name}: ${c.description}`);
          if (c.abilities) console.log(`    Abilities: ${c.abilities.join(", ")}`);
          if (c.height) console.log(`    Height: ${c.height}`);
        });
      }

      if (resp.objects) {
        console.log("\nObjects extracted:");
        resp.objects.forEach(o => {
          console.log(`  - ${o.name}: ${o.description}`);
          if (o.materials) console.log(`    Materials: ${o.materials}`);
        });
      }
    }

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
