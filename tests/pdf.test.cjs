const assert = require("node:assert/strict");
const { loadBrowserModules } = require("./_load-umd.cjs");
const ctx = loadBrowserModules([
  "assets/domain.js",
  "assets/vendor/qrcode-generator.js",
  "assets/codes.js",
  "assets/pdf.js"
]);
const D = ctx.CartonDomain;
const C = ctx.CartonCodes;
const P = ctx.CartonPdf;

const a = {...D.defaultArtwork};
const g = D.sideSealGeometry(a);
const comp = D.computed(a);
const code = C.code128Bars(a.barcode,{moduleMm:.42,heightMm:25});
const qr = C.qrMatrix(a.qr,"M").matrix;
const withQr = P.createPdfBytes({artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"production"});
const noQr = P.createPdfBytes({artwork:a,geometry:g,computed:comp,codeModel:code,mode:"production"});
const text = Buffer.from(withQr).toString("latin1");

assert.ok(text.startsWith("%PDF-1.4"));
assert.ok(text.includes("/MediaBox"));
assert.ok(withQr.length > noQr.length, "QR vector modules should increase PDF byte size");
assert.ok((text.match(/ re f/g)||[]).length > code.bars.length, "PDF should contain barcode and QR vector rectangles");

const customQr=C.qrMatrix("https://example.com/custom","Q").matrix;
const tinyJpeg="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Q/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";
const custom=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"el-qr",type:"qr-generated",x:280,y:900,w:45,h:45,rotation:0,matrix:customQr},
    {id:"el-img",type:"image",x:350,y:900,w:60,h:30,rotation:0,dataUrl:tinyJpeg,pixelWidth:1,pixelHeight:1}
  ]
});
const customText=Buffer.from(custom).toString("latin1");
assert.ok(customText.includes("/Subtype /Image"),"Uploaded artwork image should be embedded as a PDF image XObject");
assert.ok(customText.includes("/Im1 Do"),"Proof content stream should draw the custom image");
assert.ok((customText.match(/ re f/g)||[]).length>(text.match(/ re f/g)||[]).length,"Generated custom QR should add vector rectangles");

const textProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"txt",type:"text",x:300,y:900,w:120,h:30,rotation:0,visible:true,text:"CUSTOM MARK",fontSizePt:12,textAlign:"left"},
    {id:"hidden",type:"text",x:300,y:940,w:120,h:30,rotation:0,visible:false,text:"DO NOT PRINT",fontSizePt:12,textAlign:"left"}
  ]
});
const textProofText=Buffer.from(textProof).toString("latin1");
assert.ok(textProofText.includes("(CUSTOM MARK) Tj"),"Custom text should be emitted into proof PDF");
assert.ok(!textProofText.includes("DO NOT PRINT"),"Hidden custom text must not be emitted into proof PDF");

const itf=C.itf14Bars("1001234500001",{moduleMm:.8,heightMm:30});
const barSymbolProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"bar",type:"barcode",x:300,y:900,w:150,h:48,rotation:0,visible:true,humanReadable:true,payload:itf.payload,barcodeModel:itf},
    {id:"sym",type:"symbol",x:480,y:900,w:48,h:48,rotation:0,visible:true,symbolKey:"THIS_WAY_UP"}
  ]
});
const barSymbolText=Buffer.from(barSymbolProof).toString("latin1");
assert.ok(barSymbolText.includes("(10012345000017) Tj"),"ITF-14 human-readable data should be emitted into proof PDF");
assert.ok((barSymbolText.match(/ re f/g)||[]).length>(text.match(/ re f/g)||[]).length,"Custom barcode should add vector bar rectangles");
assert.ok((barSymbolText.match(/ m .* l S/g)||[]).length>0,"Handling symbol should add vector line operations");
const gs1=C.gs1_128Bars("(00)123456789012345675",{moduleMm:.495,heightMm:31.75,quietModules:10});
const gs1Proof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"gs1",type:"barcode",x:300,y:900,w:180,h:50,rotation:0,visible:true,humanReadable:true,payload:gs1.hri,barcodeModel:gs1}
  ]
});
const gs1Text=Buffer.from(gs1Proof).toString("latin1");
assert.ok(gs1Text.includes("(\\(00\\)123456789012345675) Tj"),"GS1-128 HRI should retain AI parentheses with PDF string escaping");
assert.ok((gs1Text.match(/ re f/g)||[]).length>(text.match(/ re f/g)||[]).length,"GS1-128 should add vector bar rectangles");

const expandedSymbolProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"stack",type:"symbol",x:300,y:900,w:48,h:48,rotation:0,visible:true,symbolKey:"DO_NOT_STACK"},
    {id:"heat",type:"symbol",x:360,y:900,w:48,h:48,rotation:0,visible:true,symbolKey:"KEEP_AWAY_FROM_HEAT"},
    {id:"hook",type:"symbol",x:420,y:900,w:48,h:48,rotation:0,visible:true,symbolKey:"NO_HOOKS"}
  ]
});
const expandedSymbolText=Buffer.from(expandedSymbolProof).toString("latin1");
assert.ok((expandedSymbolText.match(/ m .* l S/g)||[]).length>=8,"Expanded handling symbols should emit vector line operations");

const customSymbolImageProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"symbol-img",type:"symbol-image",x:300,y:900,w:48,h:48,rotation:0,visible:true,dataUrl:tinyJpeg,pixelWidth:1,pixelHeight:1}
  ]
});
const customSymbolImageText=Buffer.from(customSymbolImageProof).toString("latin1");
assert.ok(customSymbolImageText.includes("/Subtype /Image"),"Custom symbol review image should be embedded in proof PDF");
assert.ok(customSymbolImageText.includes("/Im1 Do"),"Custom symbol image should be drawn in proof PDF");

const itfPhysical=C.itf14Bars("1001234500001",{moduleMm:1.016,heightMm:32,quietModules:10,wideRatio:2.5,bearerBars:true,bearerBarThicknessMm:2.032});
const itfBearerProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[
    {id:"itf-physical",type:"barcode",x:300,y:900,w:170,h:58,rotation:0,visible:true,humanReadable:true,payload:itfPhysical.payload,barcodeModel:itfPhysical}
  ]
});
const itfBearerText=Buffer.from(itfBearerProof).toString("latin1");
const baseRects=(text.match(/ re f/g)||[]).length;
const itfRects=(itfBearerText.match(/ re f/g)||[]).length;
assert.ok(itfRects>=baseRects+itfPhysical.bars.length+2,"ITF-14 Proof PDF should include vector bars plus top/bottom bearer bars");

const physicalItf=C.itf14Bars("1001234500001",{moduleMm:1.016,heightMm:32,quietModules:10,wideRatio:2.5,bearerBars:true,bearerBarThicknessMm:2.032});
const physicalItfHriFont=4;
const physicalItfHriBlock=1.02+physicalItfHriFont*1.35;
const physicalItfProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[{
    id:"itf-1to1",type:"barcode",symbology:"ITF14",
    x:300,y:900,w:physicalItf.widthMm,h:physicalItf.heightMm+physicalItf.bearerBarThicknessMm*2+physicalItfHriBlock,
    rotation:0,visible:true,humanReadable:true,payload:physicalItf.payload,barcodeModel:physicalItf
  }]
});
const physicalItfText=Buffer.from(physicalItfProof).toString("latin1");
const firstItfBar=physicalItf.bars[0];
const expectedPhysicalBar=P.rectOp(
  firstItfBar.x,
  physicalItfHriBlock+physicalItf.bearerBarThicknessMm+firstItfBar.y,
  firstItfBar.w,
  firstItfBar.h,
  true
);
assert.ok(physicalItfText.includes(expectedPhysicalBar),"Proof PDF must preserve true physical ITF bar width/height instead of fitting to an arbitrary box");

const wrappedTextProof=P.createPdfBytes({
  artwork:a,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof",
  customElements:[{
    id:"wrapped-text",type:"text",x:300,y:900,w:90,h:35,rotation:15,visible:true,
    text:"ignored-source",fontSizePt:10,textAlign:"left",lineHeight:1.4,
    renderLines:["LINE ONE","LINE TWO"],renderLineWidthsMm:[15,16]
  }]
});
const wrappedTextProofText=Buffer.from(wrappedTextProof).toString("latin1");
assert.ok(wrappedTextProofText.includes("(LINE ONE) Tj"),"Wrapped custom text should emit every deterministic line");
assert.ok(wrappedTextProofText.includes("(LINE TWO) Tj"),"Wrapped custom text should emit the second deterministic line");
assert.ok((wrappedTextProofText.match(/\nq\n/g)||[]).length>=1,"Rotated multiline text should use a local graphics-state transform");

const batchArt={...D.defaultArtwork,sku:"BATCH-PDF-001",contractNo:"PO-BATCH-009"};
const batchPanel=D.sideSealGeometry(batchArt).panels.find(x=>x.id==="TOP_FACE");
const batchBlock=D.createShippingMarkBlockElements(batchArt,batchPanel,D.factories,{
  version:"1.1.0",groupId:"batch-pdf",locked:true,
  idFactory:(slot)=>"pdf-"+slot.id.toLowerCase()
});
assert.equal(batchBlock.ok,true);
const batchCustom=batchBlock.elements.map(e=>{
  const resolved=D.resolvedElementText(e,batchArt,D.factories);
  const layout=D.textLayout(e,resolved);
  return {...e,text:resolved,renderLines:layout.lines,renderLineWidthsMm:layout.widthsMm};
});
const batchG=D.sideSealGeometry(batchArt);
const batchComp=D.computed(batchArt,D.factories);
const batchCode=C.code128Bars(batchArt.barcode,{moduleMm:.42,heightMm:25});
const batchQr=C.qrMatrix(batchArt.qr,"M").matrix;
const batchProof=P.createPdfBytes({
  artwork:batchArt,geometry:batchG,computed:batchComp,codeModel:batchCode,qrMatrix:batchQr,
  customElements:batchCustom,mode:"proof"
});
const batchProofText=Buffer.from(batchProof).toString("latin1");
assert.ok(batchProofText.includes("(ITEM NO. BATCH-PDF-001) Tj"),"Batch controlled Shipping Mark ITEM should be emitted into Proof PDF");
assert.ok(batchProofText.includes("(CONTRACT NO. PO-BATCH-009) Tj"),"Batch controlled Shipping Mark contract should be emitted into Proof PDF");
assert.ok(batchProofText.includes("(CRN 3203960FM4) Tj"),"Batch controlled Shipping Mark CRN should be emitted into Proof PDF");

console.log("PDF tests passed.");
