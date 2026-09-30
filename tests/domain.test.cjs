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

test("computed and preflight can use remote factory master", () => {
  const remoteFactories = [{ id: "remote-a", name: "Remote A", crn: "CRN-NEW", country: "Mexico" }];
  const a = { ...D.defaultArtwork, factoryId: "remote-a" };
  assert.equal(D.computed(a, remoteFactories).crn, "CRN-NEW");
  assert.equal(D.computed(a, remoteFactories).originText, "Made in Mexico");
  assert.equal(D.runPreflight(a, remoteFactories).Data.find(x => x.id === "factory").status, "pass");
});

console.log("Domain tests passed.");
