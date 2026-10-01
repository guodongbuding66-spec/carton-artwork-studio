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
assert.match(app,/async function addUploadedArtworkElement\(file,type="image"\)/);
assert.match(app,/function addGeneratedQrElement\(\)/);
assert.match(app,/querySelectorAll\("\[data-art-element\]"\)/);
assert.match(app,/data-action="upload-image-trigger"/);
assert.match(app,/data-action="upload-qr-trigger"/);
assert.match(app,/data-action="add-generated-qr"/);
assert.match(app,/function addTextElement\(\)/);
assert.match(app,/function reorderSelectedElement\(mode\)/);
assert.match(app,/function alignSelectedElement\(mode\)/);
assert.match(app,/data-action="layer-front"/);
assert.match(app,/"align-hcenter","水平中"/);
assert.match(app,/if\(action==="align-hcenter"\) return alignSelectedElement\("hcenter"\);/);
assert.match(app,/data-element-prop="panelId"/);
assert.match(app,/data-element-constrain/);
assert.match(app,/\$\{code\}\$\{custom\}\$\{watermark\}/);
assert.match(app,/state\.artwork\[k\]=el\.type==="number"\?Number\(el\.value\):el\.value;\s*persistLocalDraft\(\);/);

console.log("Local workspace usability regression tests passed.");
