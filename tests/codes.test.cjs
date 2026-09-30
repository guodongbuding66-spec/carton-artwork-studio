const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadUmd(path) {
  const code = fs.readFileSync(path, "utf8");
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, globalThis: {}, console });
  return module.exports;
}

const C = loadUmd("assets/codes.js");

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
});

test("Code128 rejects non printable ASCII", () => {
  assert.throws(() => C.code128Values("中文"));
});

test("QR preview is explicitly non-certified technical preview", () => {
  const q = C.qrPreviewSvg("https://example.com");
  assert.equal(q.isStandardsCompliant, false);
  assert.ok(q.matrix.length >= 21);
});

console.log("Code tests passed.");
