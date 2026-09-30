import assert from "node:assert/strict";
import { EXPECTED_LATEST_MIGRATION, buildSystemReadiness } from "../worker/system-readiness.js";

const base={
  identitySource:"cloudflare-access",
  authBypassEnabled:false,
  bootstrapAdminConfigured:false,
  bindings:{d1:true,r2:true,assets:true},
  latestMigration:EXPECTED_LATEST_MIGRATION,
  schemaOk:true,
  counts:{approvedTemplates:1,activeFactories:1,productionPolicies:4},
  roleUsers:{OPERATOR:["operator@example.com"],REVIEWER:["reviewer@example.com"]},
  lastR2Probe:{status:"PASS",createdAt:"2026-09-30T08:00:00.000Z"},
  nowMs:Date.parse("2026-09-30T09:00:00.000Z"),
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

const bootstrap=buildSystemReadiness({...base,bootstrapAdminConfigured:true});
assert.equal(bootstrap.stagingReady,false);
assert.ok(bootstrap.stagingChecks.find(x=>x.id==="BOOTSTRAP_REMOVED"&&!x.ok));

const samePerson=buildSystemReadiness({...base,roleUsers:{OPERATOR:["same@example.com"],REVIEWER:["same@example.com"]}});
assert.equal(samePerson.stagingReady,false);
assert.ok(samePerson.stagingChecks.find(x=>x.id==="FOUR_EYES_IDENTITIES"&&!x.ok));

const stale=buildSystemReadiness({...base,lastR2Probe:{status:"PASS",createdAt:"2026-09-28T08:00:00.000Z"}});
assert.equal(stale.stagingReady,false);
assert.ok(stale.stagingChecks.find(x=>x.id==="R2_DEEP_PROBE"&&!x.ok));

const wrongMigration=buildSystemReadiness({...base,latestMigration:"0005_reference_and_readiness.sql"});
assert.equal(wrongMigration.stagingReady,false);
assert.ok(wrongMigration.stagingChecks.find(x=>x.id==="SCHEMA_CURRENT"&&!x.ok));

const productionReady=buildSystemReadiness({
  ...base,
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
