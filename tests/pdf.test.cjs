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
console.log("PDF tests passed.");
