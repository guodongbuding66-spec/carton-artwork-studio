import assert from "node:assert/strict";
import {
  PDFX_PRODUCTION_PROMOTION_POLICY,
  validateTrustedPrimaryValidatorEvidence,
  validateSecondaryValidatorEvidence,
  validateRipQualificationEvidence,
  summarizePdfxPromotionEvidence
} from "../worker/pdfx-promotion-policy.js";

const p=PDFX_PRODUCTION_PROMOTION_POLICY;
assert.equal(p.profile,"PDF/X-4");
assert.equal(p.primaryValidator.version,"17.0.683");
assert.equal(p.secondaryValidator.version,"26.07");
assert.equal(p.primaryValidator.ruleset.sha256,"f658882bd2d367839ea2fb3b3bce027320de4a70d480169feb3ba860588a6d80");

const primary=(sha)=>({
  status:"PASS",
  profile:"PDF/X-4",
  artifactSha256:sha,
  validator:"callas pdfToolbox CLI",
  version:"17.0.683",
  rulesetId:"CAS-PDFX4-PRODUCTION-1",
  rulesetVersion:"1.0.0",
  rulesetSha256:p.primaryValidator.ruleset.sha256
});
assert.equal(validateTrustedPrimaryValidatorEvidence(primary("a".repeat(64))).ok,true);
assert.equal(validateTrustedPrimaryValidatorEvidence({...primary("a".repeat(64)),version:"17.0.682"}).ok,false);
assert.equal(validateTrustedPrimaryValidatorEvidence({...primary("a".repeat(64)),validator:"Example Validator"}).ok,false);

const secondary=(sha)=>({
  status:"PASS",
  profile:"PDF/X-4",
  artifactSha256:sha,
  validator:"Enfocus PitStop Pro",
  version:"26.07"
});
assert.equal(validateSecondaryValidatorEvidence(secondary("a".repeat(64))).ok,true);

const now=Date.parse("2026-10-01T00:00:00Z");
const rip={
  status:"PASS",
  suite:"Ghent PDF Output Suite",
  suiteVersion:"5.0",
  conformanceLevel:"LEVEL_1_PLUS_2",
  printServiceProvider:"Example Print House",
  ripProduct:"Example RIP",
  ripVersion:"1.0",
  outputDevice:"Example Device",
  actualProductionWorkflow:true,
  testedAt:"2026-09-30T00:00:00Z",
  evidenceSha256:"f".repeat(64)
};
assert.equal(validateRipQualificationEvidence(rip,now).ok,true);

const shas=["1","2","3","4","5"].map((x)=>x.repeat(64));
const summary=summarizePdfxPromotionEvidence({
  primaryRuns:shas.map(primary),
  secondaryRuns:shas.map(secondary),
  ripEvidence:rip
});
assert.equal(summary.ok,true);
assert.equal(summary.primaryUniqueArtifacts,5);

const incomplete=summarizePdfxPromotionEvidence({
  primaryRuns:shas.slice(0,4).map(primary),
  secondaryRuns:shas.slice(0,4).map(secondary),
  ripEvidence:rip
});
assert.equal(incomplete.ok,false);
assert.ok(incomplete.errors.some((x)=>/At least 5/.test(x)));

console.log("PDF/X production promotion policy tests passed.");
