import { spawnSync } from "node:child_process";
import fs from "node:fs";

const persist = ".wrangler/ci";
fs.rmSync(persist, { recursive:true, force:true });

function wrangler(args, capture=false) {
  const bin = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(bin, ["wrangler", ...args], {
    encoding:"utf8",
    stdio:capture ? ["ignore","pipe","pipe"] : "inherit"
  });
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
    process.exit(result.status || 1);
  }
  return result.stdout || "";
}

const base=["--local","--persist-to",persist,"--config","wrangler.ci.jsonc"];

wrangler(["d1","migrations","apply","DB",...base]);

function query(sql) {
  const out=wrangler(["d1","execute","DB",...base,"--command",sql,"--json"],true);
  const start=Math.min(
    ...[out.indexOf("["),out.indexOf("{")].filter((x)=>x>=0)
  );
  if(!Number.isFinite(start)) throw new Error("Wrangler did not return JSON output.");
  return JSON.parse(out.slice(start));
}

function rows(payload) {
  if(Array.isArray(payload)){
    const first=payload[0];
    if(Array.isArray(first?.results)) return first.results;
    if(Array.isArray(first)) return first;
  }
  if(Array.isArray(payload?.results)) return payload.results;
  return [];
}

const required=[
  "templates","template_versions","template_approvals",
  "factories","artworks","artwork_revisions","comments","approvals",
  "preflight_runs","exports","audit_logs",
  "mapping_profiles","import_jobs","import_rows",
  "users","user_roles","security_events",
  "reference_records","production_policies","production_policy_approvals","system_readiness_runs"
];

const tableRows=rows(query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"));
const names=new Set(tableRows.map((x)=>x.name));
const missing=required.filter((name)=>!names.has(name));
if(missing.length) throw new Error("Missing D1 tables after migrations: "+missing.join(", "));

const migrations=rows(query("SELECT name FROM d1_migrations ORDER BY id;"));
if(migrations.at(-1)?.name!=="0006_system_readiness.sql") throw new Error(`Latest migration must be 0006_system_readiness.sql, got ${migrations.at(-1)?.name||"none"}.`);

const policies=rows(query("SELECT code,status FROM production_policies ORDER BY code;"));
if(policies.length!==4) throw new Error(`Expected 4 production policy seeds, got ${policies.length}.`);
if(policies.some((x)=>x.status!=="DRAFT")) throw new Error("Production policy seeds must start in DRAFT.");

const sampleFactories=rows(query("SELECT id,status FROM factories WHERE id IN ('ningbo-a','zhejiang-b','vietnam-c') ORDER BY id;"));
if(sampleFactories.length!==3) throw new Error("Expected 3 scaffold factory rows for migration compatibility.");
if(sampleFactories.some((x)=>x.status!=="SAMPLE")) throw new Error("Scaffold factories must be quarantined as SAMPLE.");

const template=rows(query("SELECT id,status,template_json AS templateJson FROM template_versions WHERE id='tplv-us-side-seal-20260520';"))[0];
if(!template) throw new Error("Approved US side-seal baseline template is missing.");
const templateJson=JSON.parse(template.templateJson||"{}");
if(templateJson.schemaVersion!==1 || templateJson.geometry?.units!=="mm") {
  throw new Error("US side-seal baseline template JSON migration is invalid.");
}

console.log("D1 migration smoke tests passed.");
console.log(`Tables: ${required.length} required / ${names.size} total`);
console.log("Production policies:", policies.map((x)=>x.code+":"+x.status).join(", "));
