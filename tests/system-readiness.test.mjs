import assert from "node:assert/strict";
import { EXPECTED_LATEST_MIGRATION, buildSystemReadiness } from "../worker/system-readiness.js";

const base={
  identitySource:"cloudflare-access",
  authBypassEnabled:false,
  bootstrapAdminConfigured:false,
  bindings:{d1:true,artifactStore:true,artifactStoreKind:"KV",kv:true,r2:false,assets:true},
  latestMigration:EXPECTED_LATEST_MIGRATION,
  schemaOk:true,
  counts:{approvedTemplates:1,activeFactories:1,productionPolicies:4,approvedFonts:0,approvedIccProfiles:0},
  roleUsers:{OPERATOR:["operator@example.com"],REVIEWER:["reviewer@example.com"]},
  lastArtifactProbe:{status:"PASS",createdAt:"2026-09-30T08:00:00.000Z"},
  nowMs:Date.parse("2026-09-30T09:00:00.000Z"),
  pdfxValidatorConfigured:true,
  pdfxPromotionReadiness:{ok:false,errors:["Promotion evidence incomplete."],policyVersion:"2.0.0",sharedRegressionArtifacts:0},
  productionReadiness:{
    ready:false,
    rendererCapabilities:{fontEmbedding:false,pdfxProfiles:[]},
    gates:[
      {code:"BARCODE_POLICY",displayName:"Barcode",status:"APPROVED",approved:true,valid:true,errors:[]},
      {code:"QR_POLICY",displayName:"QR",status:"APPROVED",approved:true,valid:true,errors:[]},
      {code:"FONT_POLICY",displayName:"Font",status:"DRAFT",approved:false,valid:false,errors:["not implemented"]},
      {code:"PDFX_POLICY",displayName:"PDF/X",status:"DRAFT",approved:false,valid:false,errors:["not implemented"]}
    ]
  }
};

const staging=buildSystemReadiness(base);
assert.equal(staging.stagingReady,true);
assert.equal(staging.status,"STAGING_READY");
assert.equal(staging.productionReady,false);
assert.equal(staging.productionStatus,"PRODUCTION_BLOCKED");
assert.ok(staging.productionChecks.find(x=>x.id==="PRODUCTION_ARTIFACT_STORE"&&!x.ok));
assert.ok(staging.productionChecks.find(x=>x.id==="PDFX_PROMOTION_EVIDENCE"&&!x.ok));

const bootstrap=buildSystemReadiness({...base,bootstrapAdminConfigured:true});
assert.equal(bootstrap.stagingReady,false);
assert.ok(bootstrap.stagingChecks.find(x=>x.id==="BOOTSTRAP_REMOVED"&&!x.ok));

const samePerson=buildSystemReadiness({...base,roleUsers:{OPERATOR:["same@example.com"],REVIEWER:["same@example.com"]}});
assert.equal(samePerson.stagingReady,false);
assert.ok(samePerson.stagingChecks.find(x=>x.id==="FOUR_EYES_IDENTITIES"&&!x.ok));

const stale=buildSystemReadiness({...base,lastArtifactProbe:{status:"PASS",createdAt:"2026-09-28T08:00:00.000Z"}});
assert.equal(stale.stagingReady,false);
assert.ok(stale.stagingChecks.find(x=>x.id==="ARTIFACT_STORE_DEEP_PROBE"&&!x.ok));

const wrongMigration=buildSystemReadiness({...base,latestMigration:"0005_reference_and_readiness.sql"});
assert.equal(wrongMigration.stagingReady,false);
assert.ok(wrongMigration.stagingChecks.find(x=>x.id==="SCHEMA_CURRENT"&&!x.ok));

const productionReady=buildSystemReadiness({
  ...base,
  bindings:{...base.bindings,artifactStoreKind:"R2",r2:true,kv:false},
  counts:{...base.counts,approvedFonts:1,approvedIccProfiles:1},
  pdfxPromotionReadiness:{ok:true,errors:[],policyVersion:"2.0.0",sharedRegressionArtifacts:5},
  productionReadiness:{
    ready:true,
    rendererCapabilities:{fontEmbedding:true,pdfxProfiles:["PDF/X-4"]},
    gates:base.productionReadiness.gates.map(x=>({...x,status:"APPROVED",approved:true,valid:true,errors:[]}))
  }
});
assert.equal(productionReady.stagingReady,true);
assert.equal(productionReady.productionReady,true);
assert.equal(productionReady.productionStatus,"PRODUCTION_READY");

console.log("System readiness tests passed.");
