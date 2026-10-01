const assert = require("node:assert/strict");
const { loadBrowserModules } = require("./_load-umd.cjs");

const { CartonCodes: C } = loadBrowserModules([
  "assets/vendor/qrcode-generator.js",
  "assets/codes.js"
]);

function test(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { console.error("✗", name); throw e; }
}

test("Code128-B emits start, checksum and stop", () => {
  const values = C.code128Values("ABC123");
  assert.equal(values[0], 104);
  assert.equal(values.at(-1), 106);
  assert.equal(values.length, 9);
});

test("Code128 model has quiet zones and positive bar widths", () => {
  const m = C.code128Bars("KF210215US02PM001");
  assert.ok(m.widthMm > 0);
  assert.ok(m.bars.length > 20);
  assert.ok(m.bars.every(b => b.w > 0 && b.h > 0));
  assert.equal(m.quietModules, 10);
});

test("Code128 rejects non printable ASCII", () => {
  assert.throws(() => C.code128Values("中文"));
});

test("QR encoder returns standards-based matrix", () => {
  const q = C.qrPreviewSvg("https://example.com", { errorCorrectionLevel: "M" });
  assert.equal(q.isStandardsCompliant, true);
  assert.ok(q.matrix.length >= 21);
  assert.ok(Number.isInteger(q.version) && q.version >= 1);
  assert.equal(q.errorCorrectionLevel, "M");
});

test("QR UTF-8 payload can be encoded", () => {
  const q = C.qrMatrix("美线侧封箱", "Q");
  assert.equal(q.errorCorrectionLevel, "Q");
  assert.ok(q.matrix.length >= 21);
});

test("GS1 check digit matches known GTIN example", () => {
  assert.equal(C.gs1CheckDigit("1001234500001"),"7");
});

test("ITF-14 accepts 13 digits and appends a valid check digit", () => {
  const normalized=C.normalizeItf14("1001234500001");
  assert.equal(normalized,"10012345000017");
  const model=C.itf14Bars("1001234500001");
  assert.equal(model.payload,"10012345000017");
  assert.ok(model.bars.length>20);
  assert.ok(model.widthMm>0);
  assert.equal(model.checkDigit,"7");
});

test("ITF-14 rejects invalid GTIN check digit", () => {
  assert.throws(()=>C.normalizeItf14("10012345000018"),/check digit/i);
});

test("ITF-14 rejects non-numeric data", () => {
  assert.throws(()=>C.itf14Bars("ABC123"),/numeric/i);
});

test("GS1-128 parses AI syntax and inserts FNC1 separators", () => {
  const model=C.gs1_128Bars("(01)10614141000019(10)ABC123(21)SN9");
  assert.equal(model.symbology,"GS1-128");
  assert.equal(model.elements.length,3);
  assert.equal(model.elements[0].ai,"01");
  assert.equal(model.elements[1].ai,"10");
  assert.equal(model.hri,"(01)10614141000019(10)ABC123(21)SN9");
  assert.equal(model.values[0],104);
  assert.equal(model.values[1],102);
  assert.ok(model.values.filter(v=>v===102).length>=2,"Start FNC1 plus separator after variable-length AI should be encoded");
  assert.equal(model.values.at(-1),106);
  assert.ok(model.bars.length>20);
});

test("GS1-128 validates SSCC AI 00", () => {
  assert.equal(C.normalizeSscc("12345678901234567"),"123456789012345675");
  assert.equal(C.ssccGs1Text("12345678901234567"),"(00)123456789012345675");
  const model=C.gs1_128Bars("(00)123456789012345675");
  assert.equal(model.elements[0].rule.title,"SSCC");
});

test("GS1-128 rejects invalid check digits and unsupported AIs", () => {
  assert.throws(()=>C.gs1_128Bars("(00)123456789012345676"),/check digit/i);
  assert.throws(()=>C.gs1_128Bars("(999)ABC"),/Unsupported GS1 Application Identifier/i);
});

test("ITF-14 physical profile includes bearer bars and 10X quiet zones", () => {
  const model=C.itf14Bars("1001234500001",{moduleMm:1.016,heightMm:32,quietModules:10,wideRatio:2.5,bearerBars:true});
  assert.equal(model.quietModules,10);
  assert.equal(model.heightMm,32);
  assert.equal(model.wideRatio,2.5);
  assert.equal(model.bearerBars,true);
  assert.equal(model.bearerRects.length,2);
  assert.ok(model.bearerBarThicknessMm>=model.moduleMm*2);
});

test("ITF-14 rejects out-of-spec ratio and quiet zone", () => {
  assert.throws(()=>C.itf14Bars("1001234500001",{wideRatio:2.1}),/2\.25/);
  assert.throws(()=>C.itf14Bars("1001234500001",{quietModules:9}),/10X/);
});

test("GS1-128 logistics physical profile enforces X dimension, height and quiet zone", () => {
  const ok=C.gs1_128Bars("(00)123456789012345675",{moduleMm:.495,heightMm:31.75,quietModules:10});
  assert.equal(ok.moduleMm,.495);
  assert.equal(ok.heightMm,31.75);
  assert.throws(()=>C.gs1_128Bars("(00)123456789012345675",{moduleMm:.4,heightMm:31.75,quietModules:10}),/0\.495/);
  assert.throws(()=>C.gs1_128Bars("(00)123456789012345675",{moduleMm:.495,heightMm:30,quietModules:10}),/31\.75/);
  assert.throws(()=>C.gs1_128Bars("(00)123456789012345675",{moduleMm:.495,heightMm:31.75,quietModules:9}),/10X/);
});

console.log("Code tests passed.");
