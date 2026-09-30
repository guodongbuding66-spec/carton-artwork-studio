import assert from "node:assert/strict";
import { parseTemplateJson, validateTemplateJson } from "../worker/template.js";

const valid={
  schemaVersion:1,
  templateCode:"US_SIDE_SEAL",
  geometry:{type:"side-seal-parametric",units:"mm"},
  print:{colors:["K"],fontPolicy:"Arial-or-similar"},
  codeBlock:{profiles:["250x80","200x64"],locked:true},
  rules:{multiPackageNotice:true,crnPlacements:2,originFromFactory:true}
};
assert.equal(validateTemplateJson(valid).ok,true);
assert.equal(validateTemplateJson(JSON.stringify(valid)).ok,true);
assert.deepEqual(parseTemplateJson(JSON.stringify(valid)),valid);

const bad={...valid,geometry:{type:"side-seal-parametric",units:"px"}};
const result=validateTemplateJson(bad);
assert.equal(result.ok,false);
assert.ok(result.errors.some(x=>/units must be mm/i.test(x)));

const unlocked={...valid,codeBlock:{profiles:["250x80"],locked:false}};
assert.equal(validateTemplateJson(unlocked).ok,false);

console.log("Template lifecycle tests passed.");
