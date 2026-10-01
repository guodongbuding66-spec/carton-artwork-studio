const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadUmd(path) {
  const code = fs.readFileSync(path, "utf8");
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, globalThis: {}, console, TextEncoder, Blob, Response, DecompressionStream });
  return module.exports;
}

const D = loadUmd("assets/domain.js");

function test(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { console.error("✗", name); throw e; }
}

test("sample inches convert to about 1200 x 600 x 200 mm", () => {
  const g = D.sideSealGeometry({ ...D.defaultArtwork });
  assert.ok(Math.abs(g.L - 1200) < 0.3);
  assert.ok(Math.abs(g.W - 600) < 0.3);
  assert.ok(Math.abs(g.H - 200) < 0.3);
});

test("multi-package notice is conditional", () => {
  const a = { ...D.defaultArtwork, packageCount: 3, currentPackage: 2 };
  assert.match(D.computed(a).packageNote, /3 packages/);
  a.packageCount = 1;
  a.currentPackage = 1;
  assert.equal(D.computed(a).packageNote, "");
});

test("factory drives both CRN and origin", () => {
  const c = D.computed({ ...D.defaultArtwork, factoryId: "vietnam-c" });
  assert.equal(c.crn, "VN-HCM-88021");
  assert.equal(c.originText, "Made in Vietnam");
});

test("gross weight below net weight blocks", () => {
  const groups = D.runPreflight({ ...D.defaultArtwork, netWeight: 80, grossWeight: 70 });
  assert.equal(groups.Data.find(x => x.id === "weight").status, "error");
  assert.ok(D.preflightSummary(groups).blocking > 0);
});

test("package index outside range blocks", () => {
  const groups = D.runPreflight({ ...D.defaultArtwork, packageCount: 2, currentPackage: 3 });
  assert.equal(groups.Data.find(x => x.id === "package").status, "error");
});

test("source 200mm calibration is explicit and within 1 percent", () => {
  const m = D.calibrationMetrics();
  assert.ok(Math.abs(m.reference.deltaPct) < 1);
});

test("default sample has no blocking preflight errors", () => {
  const s = D.preflightSummary(D.runPreflight({ ...D.defaultArtwork }));
  assert.equal(s.blocking, 0);
});

test("canonical snapshot hydrates back to editable artwork", () => {
  const source = { ...D.defaultArtwork, sku: "LIVE-001", packageCount: 2, currentPackage: 2, factoryId: "vietnam-c", revision: "R07" };
  const snapshot = D.canonicalData(source);
  const restored = D.artworkFromCanonical(snapshot, { status: "APPROVED", revision: "R07" });
  assert.equal(restored.sku, "LIVE-001");
  assert.equal(restored.packageCount, 2);
  assert.equal(restored.currentPackage, 2);
  assert.equal(restored.factoryId, "vietnam-c");
  assert.equal(restored.status, "approved");
  assert.equal(restored.revision, "R07");
});

test("custom artwork elements round-trip through canonical snapshot", () => {
  const source = {
    ...D.defaultArtwork,
    elements: [
      {id:"el-qr",type:"qr-generated",name:"Support QR",x:300,y:900,w:45,h:45,rotation:0,locked:false,payload:"https://example.com/help",ecc:"Q",sourceType:"generated-vector"},
      {id:"el-logo",type:"image",name:"Logo",x:400,y:900,w:60,h:30,rotation:0,locked:false,dataUrl:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",pixelWidth:600,pixelHeight:300}
    ]
  };
  const snapshot=D.canonicalData(source);
  assert.equal(snapshot.artwork.elements.length,2);
  assert.equal(snapshot.artwork.elements[0].type,"qr-generated");
  assert.equal(snapshot.artwork.elements[0].ecc,"Q");
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements.length,2);
  assert.equal(restored.elements[1].name,"Logo");
  const preflight=D.runPreflight(source);
  assert.ok(Array.isArray(preflight.Assets));
  assert.ok(preflight.Assets.some(x=>x.id==="qr-generated-el-qr"&&x.status==="pass"));
});

test("uploaded QR image is explicitly marked as unverified", () => {
  const a={...D.defaultArtwork,elements:[{
    id:"qr-img",type:"qr-image",name:"Customer QR",x:300,y:900,w:40,h:40,rotation:0,
    dataUrl:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",pixelWidth:600,pixelHeight:600
  }]};
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="qr-upload-qr-img"&&x.status==="warning"));
});

test("panel-constrained custom text is persisted and preflighted", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const panel=g.panels.find(p=>p.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[{
    id:"txt-1",type:"text",name:"Side Mark",x:panel.x+20,y:panel.y+20,w:120,h:30,
    rotation:0,locked:false,visible:true,panelId:"TOP_FACE",constrainToPanel:true,
    text:"MADE FOR RETAIL",fontSizePt:12,fontWeight:"bold",textAlign:"center"
  }]};
  const snapshot=D.canonicalData(a);
  assert.equal(snapshot.artwork.elements[0].panelId,"TOP_FACE");
  assert.equal(snapshot.artwork.elements[0].text,"MADE FOR RETAIL");
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements[0].fontWeight,"bold");
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="asset-panel-bounds-txt-1"&&x.status==="pass"));
  assert.ok(assets.some(x=>x.id==="text-content-txt-1"&&x.status==="pass"));
});

test("custom element crossing its assigned fold line blocks", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const panel=g.panels.find(p=>p.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[{
    id:"bad-1",type:"text",name:"Bad",x:panel.x+panel.w-10,y:panel.y+20,w:60,h:20,
    rotation:0,locked:false,visible:true,panelId:"TOP_FACE",constrainToPanel:true,
    text:"OVER FOLD",fontSizePt:12,fontWeight:"normal",textAlign:"left"
  }]};
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="asset-panel-bounds-bad-1"&&x.status==="error"&&x.blocking));
});

test("barcode and handling symbol metadata round-trip through canonical snapshot", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[
    {id:"bar-1",type:"barcode",name:"Case GTIN",x:p.x+20,y:p.y+20,w:140,h:45,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,symbology:"ITF14",humanReadable:true,payload:"10012345000017"},
    {id:"sym-1",type:"symbol",name:"Keep Dry",x:p.x+180,y:p.y+20,w:45,h:45,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,symbolKey:"KEEP_DRY"}
  ]};
  const snapshot=D.canonicalData(a);
  assert.equal(snapshot.artwork.elements[0].symbology,"ITF14");
  assert.equal(snapshot.artwork.elements[0].humanReadable,true);
  assert.equal(snapshot.artwork.elements[1].symbolKey,"KEEP_DRY");
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements[0].symbology,"ITF14");
  assert.equal(restored.elements[1].symbolKey,"KEEP_DRY");
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="barcode-type-bar-1"&&x.status==="pass"));
  assert.ok(assets.some(x=>x.id==="symbol-master-sym-1"&&x.status==="warning"));
});

test("computed and preflight can use remote factory master", () => {
  const remoteFactories = [{ id: "remote-a", name: "Remote A", crn: "CRN-NEW", country: "Mexico" }];
  const a = { ...D.defaultArtwork, factoryId: "remote-a" };
  assert.equal(D.computed(a, remoteFactories).crn, "CRN-NEW");
  assert.equal(D.computed(a, remoteFactories).originText, "Made in Mexico");
  assert.equal(D.runPreflight(a, remoteFactories).Data.find(x => x.id === "factory").status, "pass");
});

console.log("Domain tests passed.");
