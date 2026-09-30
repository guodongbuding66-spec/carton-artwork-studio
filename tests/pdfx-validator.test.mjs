import assert from "node:assert/strict";
import { validateValidatorConfig, validateValidatorResponse, runExternalPdfxValidation } from "../worker/pdfx-validator.js";
import { PDFX_PRODUCTION_PROMOTION_POLICY } from "../worker/pdfx-promotion-policy.js";

assert.equal(validateValidatorConfig({}).ok,false);
assert.equal(validateValidatorConfig({PDFX_VALIDATOR_URL:"http://example.com",PDFX_VALIDATOR_TOKEN:"x"}).ok,false);
assert.equal(validateValidatorConfig({PDFX_VALIDATOR_URL:"https://validator.example.com"}).ok,false);
assert.equal(validateValidatorConfig({PDFX_VALIDATOR_URL:"https://validator.example.com",PDFX_VALIDATOR_TOKEN:"secret"}).ok,true);

const good=validateValidatorResponse({
  status:"PASS",
  profile:"PDF/X-4",
  artifactSha256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  validator:"Example Validator",
  version:"1.2.3",
  checks:[{name:"profile",ok:true}]
},{profile:"PDF/X-4",artifactSha256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
assert.equal(good.ok,true);
assert.equal(good.data.status,"PASS");

assert.equal(validateValidatorResponse({
  status:"PASS",profile:"PDF/X-4",artifactSha256:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",validator:"V",version:"1"
},{profile:"PDF/X-4",artifactSha256:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}).ok,false);

assert.equal(validateValidatorResponse({
  status:"PASS",profile:"PDF/X-4",artifactSha256:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",validator:"V",version:"1",
  checks:[{name:"font",ok:false}]
},{profile:"PDF/X-4",artifactSha256:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}).ok,false);

assert.equal(validateValidatorResponse({
  status:"FAIL",profile:"PDF/X-4",artifactSha256:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",validator:"V",version:"1",
  checks:[{name:"font",ok:false}]
},{profile:"PDF/X-4",artifactSha256:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}).ok,true);

const p=PDFX_PRODUCTION_PROMOTION_POLICY;
const sha="eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const originalFetch=globalThis.fetch;
let captured=null;
globalThis.fetch=async (url,init)=>{
  captured={url,init};
  return new Response(JSON.stringify({
    status:"PASS",
    profile:"PDF/X-4",
    artifactSha256:sha,
    validator:"callas pdfToolbox CLI",
    version:"17.0.683",
    rulesetId:p.primaryValidator.ruleset.id,
    rulesetVersion:p.primaryValidator.ruleset.version,
    rulesetSha256:p.primaryValidator.ruleset.sha256,
    checks:[{name:"pdfx",ok:true}]
  }),{status:200,headers:{"content-type":"application/json"}});
};
const external=await runExternalPdfxValidation(new Uint8Array([37,80,68,70]),{
  profile:"PDF/X-4",artifactSha256:sha
},{
  PDFX_VALIDATOR_URL:"https://validator.example.com/api/validate",
  PDFX_VALIDATOR_TOKEN:"secret-token"
});
assert.equal(external.status,"PASS");
assert.equal(external.trusted,true);
assert.equal(captured.url,"https://validator.example.com/api/validate");
assert.equal(captured.init.headers.get("authorization"),"Bearer secret-token");
assert.equal(captured.init.headers.get("x-cas-artifact-sha256"),sha);
assert.equal(captured.init.headers.get("x-cas-ruleset-id"),p.primaryValidator.ruleset.id);
assert.equal(captured.init.headers.get("x-cas-ruleset-sha256"),p.primaryValidator.ruleset.sha256);

globalThis.fetch=async ()=>new Response(JSON.stringify({
  status:"PASS",
  profile:"PDF/X-4",
  artifactSha256:sha,
  validator:"Mock Validator",
  version:"9.1",
  rulesetId:p.primaryValidator.ruleset.id,
  rulesetVersion:p.primaryValidator.ruleset.version,
  rulesetSha256:p.primaryValidator.ruleset.sha256,
  checks:[{name:"pdfx",ok:true}]
}),{status:200});
await assert.rejects(
  ()=>runExternalPdfxValidation(new Uint8Array([37,80,68,70]),{profile:"PDF/X-4",artifactSha256:sha},{
    PDFX_VALIDATOR_URL:"https://validator.example.com/api/validate",
    PDFX_VALIDATOR_TOKEN:"secret-token"
  }),
  (e)=>e.message==="PDFX_VALIDATOR_RESPONSE_INVALID"
);
globalThis.fetch=originalFetch;

console.log("PDF/X validator bridge tests passed.");
