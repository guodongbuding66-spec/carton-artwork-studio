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

console.log("Code tests passed.");
