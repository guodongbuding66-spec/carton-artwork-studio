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
console.log("PDF tests passed.");
