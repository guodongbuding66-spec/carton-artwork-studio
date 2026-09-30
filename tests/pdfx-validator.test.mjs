import assert from "node:assert/strict";
import { validateValidatorConfig, validateValidatorResponse } from "../worker/pdfx-validator.js";

assert.equal(validateValidatorConfig({}).ok,false);
assert.equal(validateValidatorConfig({PDFX_VALIDATOR_URL:"http://example.com"}).ok,false);
assert.equal(validateValidatorConfig({PDFX_VALIDATOR_URL:"https://validator.example.com"}).ok,true);

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

console.log("PDF/X validator bridge tests passed.");
