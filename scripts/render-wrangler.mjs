import fs from "node:fs";

const target = process.argv[2] || "staging";
if (target !== "staging") throw new Error("Only staging config generation is supported by this script.");

const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const kvNamespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const bootstrapAdmin = process.env.CLOUDFLARE_BOOTSTRAP_ADMIN_EMAIL || "";
const pdfxValidatorUrl = process.env.CLOUDFLARE_PDFX_VALIDATOR_URL || "";

if (!databaseId) throw new Error("CLOUDFLARE_D1_DATABASE_ID is required.");
if (!kvNamespaceId) throw new Error("CLOUDFLARE_KV_NAMESPACE_ID is required.");


const config = {
  "$schema": "node_modules/wrangler/config-schema.json",
  name: "carton-artwork-studio-staging",
  main: "worker/index.js",
  compatibility_date: "2026-09-30",
  assets: {
    directory: ".",
    binding: "ASSETS",
    not_found_handling: "single-page-application"
  },
  vars: {
    AUTH_BYPASS: "0",
    BOOTSTRAP_ADMIN_EMAIL: bootstrapAdmin,
    PDFX_VALIDATOR_URL: pdfxValidatorUrl
  },
  d1_databases: [{
    binding: "DB",
    database_name: "carton-artwork-studio-staging",
    database_id: databaseId,
    migrations_dir: "migrations"
  }],
  kv_namespaces: [{
    binding: "ARTWORK_KV",
    id: kvNamespaceId
  }]
};

const file = ".wrangler.staging.generated.json";
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log(file);
