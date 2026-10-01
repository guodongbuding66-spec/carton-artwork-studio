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

test("variable-data bindings resolve repeated placements from one source", () => {
  const a={...D.defaultArtwork,factoryId:"vietnam-c",packageCount:3,currentPackage:2};
  assert.equal(D.resolveArtworkBinding("product.sku",a),a.sku);
  assert.equal(D.resolveArtworkBinding("factory.crn",a),"VN-HCM-88021");
  assert.equal(D.resolveArtworkBinding("origin.text",a),"Made in Vietnam");
  assert.equal(D.resolveArtworkBinding("package.indexOfTotal",a),"2 / 3");
  assert.match(D.resolveArtworkBinding("package.note",a),/3 packages/);
  const first={type:"text",bindingKey:"factory.crn",text:"stale"};
  const second={type:"text",bindingKey:"factory.crn",text:"different stale"};
  assert.equal(D.resolvedElementText(first,a),D.resolvedElementText(second,a));
  const changed={...a,factoryId:"ningbo-a"};
  assert.notEqual(D.resolvedElementText(first,a),D.resolvedElementText(first,changed));
});

test("bound element keys round-trip and drive text/barcode/QR payloads", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[
    {id:"t",type:"text",x:p.x+10,y:p.y+10,w:100,h:25,visible:true,panelId:p.id,constrainToPanel:true,text:"manual",bindingKey:"product.sku",fontSizePt:12},
    {id:"b",type:"barcode",x:p.x+10,y:p.y+50,w:140,h:45,visible:true,panelId:p.id,constrainToPanel:true,payload:"manual",bindingKey:"codes.barcode",symbology:"CODE128B"},
    {id:"q",type:"qr-generated",x:p.x+180,y:p.y+50,w:45,h:45,visible:true,panelId:p.id,constrainToPanel:true,payload:"manual",bindingKey:"codes.qr",ecc:"M"}
  ]};
  const snapshot=D.canonicalData(a);
  assert.equal(snapshot.artwork.elements[0].bindingKey,"product.sku");
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements[1].bindingKey,"codes.barcode");
  assert.equal(D.resolvedElementText(restored.elements[0],a),a.sku);
  assert.equal(D.resolvedElementPayload(restored.elements[1],a),a.barcode);
  assert.equal(D.resolvedElementPayload(restored.elements[2],a),a.qr);
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="text-binding-t"&&x.status==="pass"));
});

test("unknown variable-data binding blocks preflight", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[{
    id:"bad-bind",type:"text",x:p.x+10,y:p.y+10,w:100,h:25,visible:true,panelId:p.id,constrainToPanel:true,
    text:"",bindingKey:"unknown.field",fontSizePt:12
  }]};
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="text-binding-bad-bind"&&x.status==="error"&&x.blocking));
});

test("computed and preflight can use remote factory master", () => {
  const remoteFactories = [{ id: "remote-a", name: "Remote A", crn: "CRN-NEW", country: "Mexico" }];
  const a = { ...D.defaultArtwork, factoryId: "remote-a" };
  assert.equal(D.computed(a, remoteFactories).crn, "CRN-NEW");
  assert.equal(D.computed(a, remoteFactories).originText, "Made in Mexico");
  assert.equal(D.runPreflight(a, remoteFactories).Data.find(x => x.id === "factory").status, "pass");
});

test("GS1-128 barcode metadata passes domain symbology gate", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[{
    id:"gs1",type:"barcode",name:"SSCC",x:p.x+20,y:p.y+20,w:180,h:50,
    rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    symbology:"GS1_128",humanReadable:true,payload:"(00)123456789012345675"
  }]};
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="barcode-type-gs1"&&x.status==="pass"));
});

test("uploaded QR decode evidence round-trips and expected mismatch blocks", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const base={
    id:"qr-uploaded",type:"qr-image",name:"Customer QR",x:p.x+20,y:p.y+20,w:45,h:45,
    rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    dataUrl:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",pixelWidth:600,pixelHeight:600,
    expectedPayload:"EXPECTED",decodedValue:"ACTUAL",decodeStatus:"PASS",verifiedAt:"2026-10-01T00:00:00.000Z"
  };
  const a={...D.defaultArtwork,elements:[base]};
  const snapshot=D.canonicalData(a);
  assert.equal(snapshot.artwork.elements[0].decodedValue,"ACTUAL");
  assert.equal(snapshot.artwork.elements[0].expectedPayload,"EXPECTED");
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements[0].decodeStatus,"PASS");
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="qr-upload-qr-uploaded"&&x.status==="pass"));
  assert.ok(assets.some(x=>x.id==="qr-upload-match-qr-uploaded"&&x.status==="error"&&x.blocking));
});

test("custom uploaded symbol is review-only in preflight", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[{
    id:"sym-img",type:"symbol-image",name:"Customer Handling Icon",x:p.x+20,y:p.y+20,w:45,h:45,
    rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    dataUrl:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",pixelWidth:600,pixelHeight:600,assetRole:"symbol-review"
  }]};
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="symbol-upload-sym-img"&&x.status==="warning"));
});

test("barcode physical settings round-trip and preflight", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[
    {id:"itf-physical",type:"barcode",name:"Case GTIN",x:p.x+20,y:p.y+20,w:170,h:55,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
      symbology:"ITF14",humanReadable:true,payload:"10012345000017",moduleMm:1.016,barHeightMm:32,quietModules:10,wideRatio:2.5,bearerBars:true,bearerBarThicknessMm:2.032},
    {id:"gs1-physical",type:"barcode",name:"SSCC",x:p.x+220,y:p.y+20,w:190,h:55,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
      symbology:"GS1_128",humanReadable:true,payload:"(00)123456789012345675",moduleMm:.495,barHeightMm:31.75,quietModules:10}
  ]};
  const snapshot=D.canonicalData(a);
  assert.equal(snapshot.artwork.elements[0].moduleMm,1.016);
  assert.equal(snapshot.artwork.elements[0].bearerBars,true);
  assert.equal(snapshot.artwork.elements[1].barHeightMm,31.75);
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements[0].wideRatio,2.5);
  assert.equal(restored.elements[1].quietModules,10);
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="barcode-itf-height-itf-physical"&&x.status==="pass"));
  assert.ok(assets.some(x=>x.id==="barcode-itf-bearer-itf-physical"&&x.status==="pass"));
  assert.ok(assets.some(x=>x.id==="barcode-gs1128-x-gs1-physical"&&x.status==="pass"));
});

test("out-of-profile barcode physical dimensions block preflight", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,elements:[{
    id:"bad-gs1",type:"barcode",name:"Bad GS1",x:p.x+20,y:p.y+20,w:180,h:50,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    symbology:"GS1_128",humanReadable:true,payload:"(00)123456789012345675",moduleMm:.4,barHeightMm:20,quietModules:8
  }]};
  const assets=D.runPreflight(a).Assets;
  assert.ok(assets.some(x=>x.id==="barcode-gs1128-x-bad-gs1"&&x.status==="error"&&x.blocking));
  assert.ok(assets.some(x=>x.id==="barcode-gs1128-height-bad-gs1"&&x.status==="error"&&x.blocking));
  assert.ok(assets.some(x=>x.id==="barcode-gs1128-quiet-bad-gs1"&&x.status==="error"&&x.blocking));
});

test("safe margin, group and text-fit metadata round-trip", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const a={...D.defaultArtwork,safeMarginMm:30,elements:[{
    id:"txt-meta",type:"text",name:"Grouped text",x:p.x+40,y:p.y+40,w:120,h:30,
    rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    text:"GROUPED TEXT",fontSizePt:12,fontWeight:"bold",textAlign:"left",
    groupId:"grp-1",safeAreaExempt:true,autoFitText:true,minFontSizePt:6.5
  }]};
  const snapshot=D.canonicalData(a);
  assert.equal(snapshot.artwork.safeMarginMm,30);
  assert.equal(snapshot.artwork.elements[0].groupId,"grp-1");
  assert.equal(snapshot.artwork.elements[0].safeAreaExempt,true);
  assert.equal(snapshot.artwork.elements[0].autoFitText,true);
  assert.equal(snapshot.artwork.elements[0].minFontSizePt,6.5);
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.safeMarginMm,30);
  assert.equal(restored.elements[0].groupId,"grp-1");
  assert.equal(restored.elements[0].autoFitText,true);
});

test("safe margin blocks edge artwork unless explicitly exempted", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const base={
    id:"edge-text",type:"text",name:"Edge text",x:p.x+2,y:p.y+2,w:80,h:20,
    rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    text:"EDGE",fontSizePt:10,fontWeight:"normal",textAlign:"left"
  };
  const blocked=D.runPreflight({...D.defaultArtwork,safeMarginMm:22,elements:[base]}).Assets;
  assert.ok(blocked.some(x=>x.id==="asset-safe-area-edge-text"&&x.status==="error"&&x.blocking));
  const exempt=D.runPreflight({...D.defaultArtwork,safeMarginMm:22,elements:[{...base,safeAreaExempt:true}]}).Assets;
  assert.ok(!exempt.some(x=>x.id==="asset-safe-area-edge-text"));
});

test("text overflow is blocking and auto-fit can resolve it", () => {
  const text="THIS IS A VERY LONG CARTON MARK THAT SHOULD NOT FIT";
  const element={type:"text",w:90,h:16,fontSizePt:18,fontWeight:"bold",minFontSizePt:7};
  const overflow=D.textFitMetrics(element,text);
  assert.equal(overflow.fits,false);
  const fitted=D.fitTextToBox(element,text,{minPt:7,maxPt:18});
  assert.equal(fitted.fits,true);
  assert.ok(fitted.fontSizePt<18);
  assert.ok(fitted.fontSizePt>=7);

  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const assets=D.runPreflight({...D.defaultArtwork,elements:[{
    id:"overflow-text",name:"Overflow",...element,text,
    x:p.x+30,y:p.y+30,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true
  }]}).Assets;
  assert.ok(assets.some(x=>x.id==="text-overflow-overflow-text"&&x.status==="error"&&x.blocking));
});

test("auto-fit reports failure when minimum font still cannot fit", () => {
  const element={type:"text",w:8,h:4,fontSizePt:20,fontWeight:"bold",minFontSizePt:12};
  const result=D.fitTextToBox(element,"IMPOSSIBLY LONG TEXT",{minPt:12,maxPt:20});
  assert.equal(result.fits,false);
  assert.equal(result.fontSizePt,12);
});

test("rotated visual bounds swap dimensions at 90 degrees", () => {
  const v=D.elementVisualBounds({x:100,y:100,w:20,h:100,rotation:90});
  assert.ok(Math.abs(v.width-100)<1e-9);
  assert.ok(Math.abs(v.height-20)<1e-9);
  assert.ok(Math.abs(v.centerX-110)<1e-9);
  assert.ok(Math.abs(v.centerY-150)<1e-9);
  assert.ok(Math.abs(v.left-60)<1e-9);
  assert.ok(Math.abs(v.right-160)<1e-9);
});

test("rotated element crossing a fold blocks even when raw box is inside panel", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const element={
    id:"rotated-fold",type:"text",name:"Rotated Fold",
    x:p.x+p.w-25,y:p.y+120,w:20,h:100,rotation:45,
    locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    safeAreaExempt:true,text:"ROTATED",fontSizePt:9,fontWeight:"normal",textAlign:"left"
  };
  assert.ok(element.x>=p.x && element.x+element.w<=p.x+p.w,"Raw unrotated box should be inside panel");
  const visual=D.elementVisualBounds(element);
  assert.ok(visual.right>p.x+p.w,"Rotated visual bounds should cross the right fold");
  const assets=D.runPreflight({...D.defaultArtwork,elements:[element]}).Assets;
  assert.ok(assets.some(x=>x.id==="asset-panel-bounds-rotated-fold"&&x.status==="error"&&x.blocking));
});

test("rotated safe-area crossing blocks using visual bounds", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const element={
    id:"rotated-safe",type:"symbol",name:"Rotated Safe",
    x:p.x+30,y:p.y+100,w:20,h:80,rotation:45,
    locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    safeAreaExempt:false,symbolKey:"KEEP_DRY"
  };
  const assets=D.runPreflight({...D.defaultArtwork,safeMarginMm:22,elements:[element]}).Assets;
  assert.ok(assets.some(x=>x.id==="asset-panel-bounds-rotated-safe"&&x.status==="pass"));
  assert.ok(assets.some(x=>x.id==="asset-safe-area-rotated-safe"&&x.status==="error"&&x.blocking));
});

test("rotation-aware resize solver stops at visual container bounds", () => {
  const bounds={x:0,y:0,w:200,h:200};
  const element={x:80,y:80,w:40,h:40,rotation:45};
  assert.equal(D.visualBoundsFitContainer(element,bounds),true);

  const grown=D.constrainElementResize(element,bounds,180,180,5);
  assert.equal(grown.limited,true);
  assert.ok(grown.w>40&&grown.w<180);
  assert.ok(grown.h>40&&grown.h<180);
  assert.equal(D.visualBoundsFitContainer({...element,w:grown.w,h:grown.h},bounds),true);

  const smaller=D.constrainElementResize(element,bounds,20,20,5);
  assert.equal(smaller.limited,false);
  assert.equal(smaller.w,20);
  assert.equal(smaller.h,20);
  assert.equal(D.visualBoundsFitContainer({...element,w:20,h:20},bounds),true);
});

test("resize solver preserves current size if starting visual bounds are already invalid", () => {
  const bounds={x:0,y:0,w:100,h:100};
  const element={x:90,y:90,w:40,h:40,rotation:45};
  const result=D.constrainElementResize(element,bounds,80,80,5);
  assert.equal(result.limited,true);
  assert.equal(result.w,40);
  assert.equal(result.h,40);
});

test("wrapped text layout shares deterministic line breaking", () => {
  const text="THIS IS A LONG SHIPPING MARK LINE";
  const nowrap=D.textLayout({w:45,h:30,fontSizePt:12,fontWeight:"normal",wrapText:false,lineHeight:1.2},text);
  const wrapped=D.textLayout({w:45,h:30,fontSizePt:12,fontWeight:"normal",wrapText:true,lineHeight:1.2},text);
  assert.equal(nowrap.fits,false);
  assert.ok(wrapped.lines.length>1);
  assert.equal(wrapped.fits,true);
  assert.ok(wrapped.lines.every(line=>D.measureTextLineMm(line,12,"normal")<=45.01));
  assert.equal(JSON.stringify(D.wrapTextLines("A\nB",100,12,"normal")),JSON.stringify(["A","B"]));
});

test("line height participates in text fit metrics", () => {
  const text="LINE ONE\nLINE TWO";
  const tight=D.textLayout({w:100,h:20,fontSizePt:12,wrapText:false,lineHeight:1},text);
  const loose=D.textLayout({w:100,h:20,fontSizePt:12,wrapText:false,lineHeight:1.8},text);
  assert.ok(loose.heightMm>tight.heightMm);
  assert.equal(loose.lineCount,2);
});

test("effective raster DPI uses placed physical millimetres", () => {
  const exact=D.effectiveImageDpi({type:"image",w:50.8,h:50.8,pixelWidth:600,pixelHeight:600});
  assert.equal(exact.isVector,false);
  assert.ok(Math.abs(exact.minDpi-300)<1e-9);
  const vector=D.effectiveImageDpi({type:"image",w:100,h:50,vectorDataUrl:"data:image/svg+xml;base64,PHN2Zy8+"});
  assert.equal(vector.isVector,true);
  assert.equal(vector.minDpi,null);
});

test("raster below 150 PPI is a blocking preflight error", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const art={...D.defaultArtwork,elements:[{
    id:"lowdpi",type:"image",name:"Low DPI Logo",
    x:p.x+30,y:p.y+30,w:50.8,h:25.4,rotation:0,locked:false,visible:true,
    panelId:p.id,constrainToPanel:true,safeAreaExempt:false,
    sourceType:"uploaded-raster",mimeType:"image/jpeg",dataUrl:"data:image/jpeg;base64,AA==",
    pixelWidth:100,pixelHeight:50
  }]};
  const assets=D.runPreflight(art).Assets;
  const quality=assets.find(x=>x.id==="asset-resolution-lowdpi");
  assert.equal(quality.status,"error");
  assert.equal(quality.blocking,true);
});

test("preserved SVG source is vector-qualified for quality reporting but not production", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const el={
    id:"svg-logo",type:"image",name:"Vector Logo",
    x:p.x+30,y:p.y+30,w:60,h:30,rotation:0,locked:false,visible:true,
    panelId:p.id,constrainToPanel:true,safeAreaExempt:false,
    sourceType:"uploaded-vector",mimeType:"image/jpeg",
    sourceMimeType:"image/svg+xml",dataUrl:"data:image/jpeg;base64,AA==",
    vectorDataUrl:"data:image/svg+xml;base64,PHN2Zy8+",pixelWidth:1800,pixelHeight:900
  };
  const assets=D.runPreflight({...D.defaultArtwork,elements:[el]}).Assets;
  assert.ok(assets.some(x=>x.id==="asset-vector-source-svg-logo"&&x.status==="warning"));
  const qualification=D.productionElementQualification(el);
  assert.equal(qualification.qualified,false);
  assert.equal(qualification.reason,"UPLOADED_GRAPHIC_NOT_PRODUCTION_QUALIFIED");
});

test("new text and source metadata round-trip through canonical snapshot", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const art={...D.defaultArtwork,elements:[{
    id:"meta2",type:"image",name:"SVG",
    x:p.x+30,y:p.y+30,w:60,h:30,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    sourceType:"uploaded-vector",mimeType:"image/jpeg",sourceMimeType:"image/svg+xml",
    originalFileName:"logo.svg",dataUrl:"data:image/jpeg;base64,AA==",vectorDataUrl:"data:image/svg+xml;base64,PHN2Zy8+",
    pixelWidth:1800,pixelHeight:900,sourcePixelWidth:300,sourcePixelHeight:150,
    blockType:"",blockVersion:""
  },{
    id:"txt2",type:"text",name:"Wrapped",x:p.x+100,y:p.y+100,w:100,h:30,rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,
    text:"WRAPPED TEXT",fontSizePt:10,fontWeight:"normal",textAlign:"left",wrapText:true,lineHeight:1.35,
    autoFitText:true,minFontSizePt:7,blockType:"SHIPPING_MARK_STANDARD",blockVersion:"1.0.0"
  }]};
  const snapshot=D.canonicalData(art);
  assert.equal(snapshot.artwork.elements[0].sourceMimeType,"image/svg+xml");
  assert.equal(snapshot.artwork.elements[0].originalFileName,"logo.svg");
  assert.ok(snapshot.artwork.elements[0].vectorDataUrl.startsWith("data:image/svg+xml"));
  assert.equal(snapshot.artwork.elements[1].wrapText,true);
  assert.equal(snapshot.artwork.elements[1].lineHeight,1.35);
  assert.equal(snapshot.artwork.elements[1].blockVersion,"1.0.0");
  const restored=D.artworkFromCanonical(snapshot);
  assert.equal(restored.elements[0].sourcePixelWidth,300);
  assert.equal(restored.elements[1].blockType,"SHIPPING_MARK_STANDARD");
});

test("controlled shipping mark block requires all six bindings and pinned version", () => {
  const g=D.sideSealGeometry(D.defaultArtwork);
  const p=g.panels.find(x=>x.id==="TOP_FACE");
  const keys=[
    "shipping.skuLine","shipping.contractLine","shipping.weightLine",
    "shipping.packageLine","shipping.crnLine","shipping.originLine"
  ];
  const elements=keys.map((bindingKey,i)=>({
    id:"ship-"+i,type:"text",name:bindingKey,x:p.x+30,y:p.y+30+i*12,w:240,h:9,
    rotation:0,locked:false,visible:true,panelId:p.id,constrainToPanel:true,safeAreaExempt:false,
    groupId:"grp-ship",text:"",bindingKey,fontSizePt:10,fontWeight:"normal",textAlign:"left",
    wrapText:false,lineHeight:1.15,autoFitText:true,minFontSizePt:7,
    blockType:"SHIPPING_MARK_STANDARD",blockVersion:"1.0.0"
  }));
  const good=D.runPreflight({...D.defaultArtwork,elements}).Assets;
  assert.ok(good.some(x=>x.id==="shipping-block-grp-ship"&&x.status==="pass"));

  const broken=D.runPreflight({...D.defaultArtwork,elements:elements.slice(0,-1)}).Assets;
  assert.ok(broken.some(x=>x.id==="shipping-block-grp-ship"&&x.status==="error"&&x.blocking));
});

test("production element qualification is an explicit vector allowlist", () => {
  const textQualification=D.productionElementQualification({type:"text",fontWeight:"normal"});
  assert.equal(textQualification.qualified,true);
  assert.equal(textQualification.mode,"EMBEDDED_VECTOR_TEXT");
  assert.equal(D.productionElementQualification({type:"text",fontWeight:"bold"}).reason,"CUSTOM_BOLD_FONT_NOT_QUALIFIED");
  assert.equal(D.productionElementQualification({type:"barcode"}).qualified,true);
  assert.equal(D.productionElementQualification({type:"qr-generated"}).qualified,true);
  assert.equal(D.productionElementQualification({type:"image"}).qualified,false);
  assert.equal(D.productionElementQualification({type:"symbol"}).qualified,false);
});

console.log("Domain tests passed.");
