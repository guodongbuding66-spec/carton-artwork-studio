import fs from "node:fs";
import assert from "node:assert/strict";

const app=fs.readFileSync("assets/app.js","utf8");
const css=fs.readFileSync("assets/app.css","utf8");

const requiredUiMarkers=[
  "Controlled template system",
  "Reference data governance",
  "Quality Control Center",
  "System Administration",
  "Staging Readiness Center",
  "Production remains gated"
];
for(const marker of requiredUiMarkers){
  assert.ok(app.includes(marker),`Missing UI marker: ${marker}`);
}

const requiredHooks=[
  "data-template-tab=",
  "data-content-tab=",
  "data-quality-tab=",
  "data-policy-action=",
  "data-production-asset-action=",
  "data-promotion-evidence-action=",
  'data-action="refresh-system-readiness"',
  'data-action="run-readiness-probe"',
  'data-action="create-user"',
  "data-save-user-roles="
];
for(const hook of requiredHooks){
  assert.ok(app.includes(hook),`Missing UI action hook: ${hook}`);
}

assert.ok(app.includes("Independent review only"));
assert.ok(!/data-action=["\'](?:approve-all|bulk-approve)["\']/.test(app));
assert.ok(!/<button[^>]*>\s*Approve All\s*<\/button>/i.test(app));
assert.ok(!app.includes('data-action="bulk-approve"'));

for(const marker of [
  "Control Center UI v4",
  ".control-layout",
  ".quality-control-layout",
  ".admin-control-grid",
  ".system-readiness-console",
  "@media(max-width:1180px)",
  "@media(max-width:900px)",
  "@media(max-width:650px)"
]){
  assert.ok(css.includes(marker),`Missing UI/CSS regression marker: ${marker}`);
}

assert.match(css,/\.admin-user-table\{max-height:460px;overflow:auto/);
assert.match(css,/\.control-nav-list\{display:flex;overflow:auto\}/);
assert.match(css,/\.system-readiness-status\{grid-template-columns:1fr\}/);

console.log("UI control-center regression tests passed.");
