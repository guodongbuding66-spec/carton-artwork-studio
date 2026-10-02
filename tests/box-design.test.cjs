const assert=require("node:assert/strict");
const fs=require("node:fs");
const D=require("../assets/domain.js");
const Q=require("../assets/box-design.js");

const artwork={
  ...D.defaultArtwork,
  length:12,
  width:8,
  height:4,
  paperThicknessMm:1.8,
  bleedMm:4,
  materialId:"E_FLUTE_WHITE",
  boxType:"US_SIDE_SEAL",
  dimensionMode:"OUTER"
};

const m=Q.metrics(artwork);
assert.ok(m.lengthMm>304&&m.lengthMm<306);
assert.ok(m.widthMm>203&&m.widthMm<204);
assert.ok(m.heightMm>101&&m.heightMm<103);
assert.equal(m.paperThicknessMm,1.8);
assert.equal(m.bleedMm,4);
assert.equal(m.panelCount,9);
assert.ok(m.sheetWidthMm>m.dielineWidthMm);
assert.ok(m.sheetHeightMm>m.dielineHeightMm);

const svg=Q.structureSvg(artwork,{showBleed:true,showSafe:true,showPanels:true,showDimensions:true});
assert.match(svg,/data-box-dieline="US_SIDE_SEAL"/);
assert.match(svg,/data-layer="cut"/);
assert.match(svg,/data-layer="crease"/);
assert.match(svg,/data-layer="bleed"/);
assert.match(svg,/data-layer="safe"/);
assert.match(svg,/data-layer="dimensions"/);
assert.match(svg,/L 304\.8 mm/);

const html=Q.preview3dMarkup(artwork,{rotateX:-18,rotateY:-32});
assert.match(html,/data-box3d-stage/);
assert.match(html,/data-box3d-object/);
assert.match(html,/box3d-front/);
assert.match(html,/rotateX\(-18deg\) rotateY\(-32deg\)/);

const snapshot=D.canonicalData(artwork);
assert.equal(snapshot.structure.boxType,"US_SIDE_SEAL");
assert.equal(snapshot.structure.materialId,"E_FLUTE_WHITE");
assert.equal(snapshot.structure.paperThicknessMm,1.8);
assert.equal(snapshot.structure.bleedMm,4);
assert.equal(snapshot.structure.dimensionMode,"OUTER");

const hydrated=D.artworkFromCanonical(snapshot);
assert.equal(hydrated.boxType,"US_SIDE_SEAL");
assert.equal(hydrated.materialId,"E_FLUTE_WHITE");
assert.equal(hydrated.paperThicknessMm,1.8);
assert.equal(hydrated.bleedMm,4);
assert.equal(hydrated.dimensionMode,"OUTER");

const pf=D.runPreflight(artwork);
const layout=pf.Layout||[];
assert.equal(layout.find(x=>x.id==="box-structure-type")?.status,"pass");
assert.equal(layout.find(x=>x.id==="paper-thickness")?.status,"pass");
assert.equal(layout.find(x=>x.id==="bleed-config")?.status,"pass");

const invalid=D.runPreflight({...artwork,paperThicknessMm:0.05,bleedMm:30,boxType:"UNQUALIFIED"});
assert.equal(invalid.Layout.find(x=>x.id==="box-structure-type")?.status,"error");
assert.equal(invalid.Layout.find(x=>x.id==="paper-thickness")?.status,"error");
assert.equal(invalid.Layout.find(x=>x.id==="bleed-config")?.status,"error");

const app=fs.readFileSync("assets/app.js","utf8");
const css=fs.readFileSync("assets/app.css","utf8");
const index=fs.readFileSync("index.html","utf8");

for(const marker of [
  '["boxdesign", "◇", "纸盒设计", "Box Design"]',
  "function renderBoxDesign()",
  'data-box-view="dieline"',
  'data-box-view="3d"',
  'data-box-mm="length"',
  'data-box-material',
  'data-box-layer="bleed"',
  'data-box-camera="x"',
  'data-box-camera-preset="iso"',
  'data-box-export="svg"',
  "function exportBoxDielineSvg()"
]) assert.ok(app.includes(marker),`Missing box design UI marker: ${marker}`);

assert.ok(index.includes("./assets/box-design.js"));
for(const marker of [".box-design-layout",".box-dieline-canvas",".box3d-stage",".box3d-object",".box-camera-controls"]){
  assert.ok(css.includes(marker),`Missing box design CSS marker: ${marker}`);
}

console.log("Parametric box design tests passed.");
