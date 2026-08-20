import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient("https://lqfqfzqcrqluxanhnjwu.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww");

console.log("Checking projects and documents...\n");

const { data: projects } = await supabase.from("projects").select("id, name").limit(10);
console.log("Projects found:", projects?.length || 0);
projects?.forEach(p => console.log(`  - ${p.id}: ${p.name}`));

console.log("\nDocuments found (any):");
const { data: docs } = await supabase.from("documents").select("id, name, project_id").limit(10);
console.log(docs?.length || 0, "total");
docs?.forEach(d => console.log(`  - ${d.id}: ${d.name} (project: ${d.project_id})`));

console.log("\nLooking for documents in project 6c4b7b92-214a-4785-ad66-e62527ee68d6:");
const { data: projDocs } = await supabase.from("documents").select("id, name").eq("project_id", "6c4b7b92-214a-4785-ad66-e62527ee68d6");
console.log(projDocs?.length || 0, "documents");
projDocs?.forEach(d => console.log(`  - ${d.id}: ${d.name}`));
