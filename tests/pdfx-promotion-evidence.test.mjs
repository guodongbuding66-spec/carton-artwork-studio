import assert from "node:assert/strict";
import {
  normalizePromotionEvidenceType,
  sanitizeEvidenceFilename,
  validatePromotionEvidence,
  evidenceRowToPolicyInput
} from "../worker/pdfx-promotion-evidence.js";

const sha="a".repeat(64);
const evidenceSha="b".repeat(64);
const now=Date.parse("2026-10-01T00:00:00Z");

assert.equal(normalizePromotionEvidenceType("secondary_validation"),"SECONDARY_VALIDATION");
assert.equal(normalizePromotionEvidenceType("unknown"),"");
assert.equal(sanitizeEvidenceFilename("../PitStop report 01.pdf"),".._PitStop_report_01.pdf");

const secondary=validatePromotionEvidence("SECONDARY_VALIDATION",{
  result:"PASS",
  profile:"PDF/X-4",
  artifactSha256:sha,
  validator:"Enfocus PitStop Pro",
  version:"26.07"
},evidenceSha,now);
assert.equal(secondary.ok,true);
assert.equal(secondary.data.artifactSha256,sha);

const rip=validatePromotionEvidence("RIP_QUALIFICATION",{
  result:"PASS",
  suite:"Ghent PDF Output Suite",
  suiteVersion:"5.0",
  conformanceLevel:"LEVEL_1_PLUS_2",
  printServiceProvider:"Printer A",
  ripProduct:"RIP A",
  ripVersion:"10.0",
  outputDevice:"Press A",
  actualProductionWorkflow:true,
  testedAt:"2026-09-30T00:00:00Z"
},evidenceSha,now);
assert.equal(rip.ok,true);

const trial=validatePromotionEvidence("PRODUCTION_TRIAL",{
  result:"PASS",
  profile:"PDF/X-4",
  artifactSha256:sha,
  printServiceProvider:"Printer A",
  ripProduct:"RIP A",
  ripVersion:"10.0",
  outputDevice:"Press A",
  actualProductionWorkflow:true,
  noPdfRepair:true,
  testedAt:"2026-09-30T00:00:00Z"
},evidenceSha,now);
assert.equal(trial.ok,true);

const repaired=validatePromotionEvidence("PRODUCTION_TRIAL",{
  ...trial.data,
  result:"PASS",
  noPdfRepair:false
},evidenceSha,now);
assert.equal(repaired.ok,false);

const fromRow=evidenceRowToPolicyInput({
  evidence_type:"PRODUCTION_TRIAL",
  profile:"PDF/X-4",
  artifact_sha256:sha,
  print_service_provider:"Printer A",
  rip_product:"RIP A",
  rip_version:"10.0",
  output_device:"Press A",
  actual_production_workflow:1,
  no_pdf_repair:1,
  tested_at:"2026-09-30T00:00:00Z",
  evidence_sha256:evidenceSha,
  metadata_json:JSON.stringify({result:"PASS"})
});
assert.equal(fromRow.noPdfRepair,true);
assert.equal(fromRow.actualProductionWorkflow,true);
assert.equal(fromRow.artifactSha256,sha);

console.log("PDF/X promotion evidence tests passed.");
