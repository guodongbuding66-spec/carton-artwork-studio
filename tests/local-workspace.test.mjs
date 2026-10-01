import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync("assets/app.js","utf8");

assert.match(app,/function localArtworkEditable\(\)\{return !\["in_review","approved"\]\.includes\(state\.artwork\.status\);\}/);
assert.match(app,/function isArtworkLocked\(\)\{return !localArtworkEditable\(\);\}/);
assert.match(app,/async function saveDraft\(\)[\s\S]*?persistLocalDraft\(\);[\s\S]*?if\(!cloudArtworkWritable\(\)\)/);
assert.match(app,/async function runPreflightAction\(\)[\s\S]*?persistLocalDraft\(\);[\s\S]*?if\(cloudArtworkWritable\(\)\)/);
assert.match(app,/async function importBatch\(file\)\{\s*try\{/);
assert.doesNotMatch(app,/async function importBatch\(file\)\{\s*if\(!permitted\("batchWrite"\)\)/);
assert.match(app,/data-action="dry-run" \$\{state\.batchRecords\.length\?"":"disabled"\}/);
assert.match(app,/data-action="batch-generate" \$\{stats\.passed&&!state\.batchGenerating\?"":"disabled"\}/);
assert.match(app,/dropzone\.ondrop=async\(e\)=>/);
assert.match(app,/state\.artwork\[k\]=el\.type==="number"\?Number\(el\.value\):el\.value;\s*persistLocalDraft\(\);/);

console.log("Local workspace usability regression tests passed.");
