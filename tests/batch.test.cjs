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

const controlledReview=B.buildReview([records[0],{
  ...records[0],
  _row:4,
  sku:"SKU-004",
  contractNo:"HT4",
  barcode:"XYZ789",
  qr:"https://example.com/4"
}],[],D,{
  defaults:D.defaultArtwork,
  factories:D.factories,
  codes:C,
  controlledShippingMark:{enabled:true,panelId:"TOP_FACE",version:"1.1.0"}
});
assert.equal(controlledReview.length,2);
assert.equal(controlledReview[0].status,"PASS");
assert.equal(controlledReview[1].status,"PASS");
for(const row of controlledReview){
  assert.equal(row.controlledPreset.type,"SHIPPING_MARK_STANDARD");
  assert.equal(row.controlledPreset.version,"1.1.0");
  assert.equal(row.controlledPreset.panelId,"TOP_FACE");
  assert.equal(row.artwork.elements.length,6);
  assert.equal(D.validateShippingMarkBlock(row.artwork.elements).ok,true);
  assert.equal(row.artwork.safeMarginMm,D.defaultArtwork.safeMarginMm);
}
assert.notEqual(controlledReview[0].controlledPreset.groupId,controlledReview[1].controlledPreset.groupId);
assert.notEqual(controlledReview[0].artwork.elements[0].id,controlledReview[1].artwork.elements[0].id);
assert.equal(D.resolvedElementText(controlledReview[0].artwork.elements[0],controlledReview[0].artwork,D.factories),"ITEM NO. SKU-001");
assert.equal(D.resolvedElementText(controlledReview[1].artwork.elements[0],controlledReview[1].artwork,D.factories),"ITEM NO. SKU-004");
assert.equal(D.resolvedElementText(controlledReview[1].artwork.elements[1],controlledReview[1].artwork,D.factories),"CONTRACT NO. HT4");

const remoteFactories=[{id:"remote-a",name:"Remote Batch Factory",crn:"REMOTE-CRN",country:"Mexico"}];
const remoteRecord={...records[0],_row:5,factory:"Remote Batch Factory"};
const remoteReview=B.buildReview([remoteRecord],[],D,{
  defaults:D.defaultArtwork,
  factories:remoteFactories,
  codes:C,
  controlledShippingMark:{enabled:true,panelId:"TOP_FACE",version:"1.1.0"}
});
assert.equal(remoteReview[0].status,"PASS");
assert.equal(remoteReview[0].artwork.factoryId,"remote-a");
assert.equal(D.resolvedElementText(remoteReview[0].artwork.elements[4],remoteReview[0].artwork,remoteFactories),"CRN REMOTE-CRN");
assert.equal(D.resolvedElementText(remoteReview[0].artwork.elements[5],remoteReview[0].artwork,remoteFactories),"Made in Mexico");
console.log("Batch tests passed.");
