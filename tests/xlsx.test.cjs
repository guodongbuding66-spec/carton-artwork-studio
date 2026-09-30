const assert = require("node:assert/strict");
const X = require("../assets/xlsx-lite.js");

function test(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { console.error("✗", name); throw e; }
}

test("CSV parser handles quoted commas", () => {
  const rows = X.parseCsv('SKU,Contract No.\n"A,1",HT1\n');
  assert.equal(rows[1][0], "A,1");
});

test("Header detection requires SKU-like field", () => {
  assert.throws(() => X.detectHeader([["Gross Weight","Factory"],["10","A"]]));
  const h = X.detectHeader([["SKU","Gross Weight","Factory"]]);
  assert.equal(h.mapping.sku, 0);
});

test("Selective fill-down does not copy SKU or barcode", () => {
  const rows = [
    ["SKU","Contract No.","Factory","Barcode","G.W.","N.W.","Length","Width","Height","QR"],
    ["A","HT1","Ningbo Factory A","ABC1","11","10","47.24","23.62","7.87","https://e/1"],
    ["","","","","12","11","47.24","23.62","7.87","https://e/2"]
  ];
  const r = X.rowsToRecords(rows,{fillDown:true});
  assert.equal(r.records[1].contractNo,"HT1");
  assert.equal(r.records[1].factory,"Ningbo Factory A");
  assert.equal(r.records[1].sku,"");
  assert.equal(r.records[1].barcode,"");
});

test("Formula without cached value becomes cell-level error", () => {
  const xml = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c><c r="B1" t="inlineStr"><is><t>G.W.</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>SKU1</t></is></c><c r="B2"><f>SUM(C2:D2)</f></c></row></sheetData></worksheet>';
  const rows = X.parseSheetXml(xml,[]);
  const result = X.rowsToRecords(rows,{fillDown:true});
  assert.ok(result.issues.some(i => i.cell === "B2" && /no cached value/i.test(i.message)));
});

console.log("XLSX tests passed.");
