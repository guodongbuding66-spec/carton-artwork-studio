const assert = require("node:assert/strict");
const { loadBrowserModules } = require("./_load-umd.cjs");
const ctx = loadBrowserModules([
  "assets/domain.js",
  "assets/vendor/qrcode-generator.js",
  "assets/codes.js",
  "assets/batch.js"
]);
const D = ctx.CartonDomain;
const C = ctx.CartonCodes;
const B = ctx.CartonBatch;

const records = [
  {_row:2,_cells:{sku:"A2",contractNo:"B2",grossWeight:"F2",factory:"H2",barcode:"J2",qr:"K2",length:"L2",width:"M2",height:"N2"},sku:"SKU-001",contractNo:"HT1",packageCount:"2",currentPackage:"1",netWeight:"10",grossWeight:"11",length:"47.24",width:"23.62",height:"7.87",factory:"Ningbo Factory A",barcode:"ABC123",qr:"https://example.com/1"},
  {_row:3,_cells:{sku:"A3",contractNo:"B3",grossWeight:"F3",factory:"H3",barcode:"J3",qr:"K3",length:"L3",width:"M3",height:"N3"},sku:"SKU-002",contractNo:"",packageCount:"1",currentPackage:"1",netWeight:"10",grossWeight:"9",length:"0",width:"23.62",height:"7.87",factory:"Unknown Factory",barcode:"",qr:""}
];

const review = B.buildReview(records, [], D, { defaults:D.defaultArtwork, factories:D.factories, codes:C });
assert.equal(review.length,2);
assert.equal(review[0].status,"PASS");
assert.equal(review[0].artwork.factoryId,"ningbo-a");
assert.equal(review[1].status,"ERROR");
assert.ok(review[1].errors.some(x=>/Contract No/.test(x.message)));
assert.ok(review[1].errors.some(x=>/Factory/.test(x.message)));
assert.ok(review[1].errors.some(x=>/G\.W/.test(x.message)));
assert.ok(review[1].errors.some(x=>/Length/.test(x.message)));

const s = B.summarize(review);
assert.deepEqual(JSON.parse(JSON.stringify(s)),{total:2,passed:1,failed:1});
const csv = B.failedRowsCsv(review);
assert.match(csv,/row,sku,cell,field,error/);
assert.match(csv,/SKU-002/);
assert.equal(B.resolveFactory("3203960FM4",D.factories).id,"ningbo-a");
assert.equal(B.normalizeCode("1.2345E+5"),"123450");
console.log("Batch tests passed.");
