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
const gs1=C.gs1_128Bars("(00)123456789012345675",{moduleMm:.42,heightMm:28});
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

console.log("PDF tests passed.");
