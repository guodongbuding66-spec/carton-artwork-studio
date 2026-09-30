const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const baseline = require("./snapshots/us-side-seal-production.json");
const { loadBrowserModules } = require("./_load-umd.cjs");

const ctx = loadBrowserModules([
  "assets/domain.js",
  "assets/vendor/qrcode-generator.js",
  "assets/codes.js",
  "assets/pdf.js"
]);
const D=ctx.CartonDomain, C=ctx.CartonCodes, P=ctx.CartonPdf;

const artwork={...D.defaultArtwork};
const geometry=D.sideSealGeometry(artwork);
const computed=D.computed(artwork);
const barcode=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
const qr=C.qrMatrix(artwork.qr,"M").matrix;
const bytes=P.createPdfBytes({artwork,geometry,computed,codeModel:barcode,qrMatrix:qr,mode:"production"});
const sha256=crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

assert.equal(Number(geometry.totalWidth.toFixed(3)),baseline.geometry.totalWidthMm);
assert.equal(Number(geometry.totalHeight.toFixed(3)),baseline.geometry.totalHeightMm);
assert.equal(bytes.length,baseline.pdfBytes);
assert.equal(sha256,baseline.sha256,`Production renderer snapshot changed: ${sha256}`);

console.log("Render snapshot tests passed.");
