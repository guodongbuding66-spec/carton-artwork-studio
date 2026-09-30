import assert from "node:assert/strict";
import {
  RENDERER_CAPABILITIES,
  validateProductionPolicy,
  summarizeProductionReadiness
} from "../worker/readiness.js";

assert.equal(validateProductionPolicy("BARCODE_POLICY",{symbology:"Code128-B",payloadRule:"SKU"}).ok,true);
assert.equal(validateProductionPolicy("BARCODE_POLICY",{symbology:"EAN-13",payloadRule:"SKU"}).ok,false);
assert.equal(validateProductionPolicy("BARCODE_POLICY",{symbology:"Code128-B",payloadRule:"UNCONFIRMED"}).ok,false);

assert.equal(validateProductionPolicy("QR_POLICY",{ecc:"M",payloadRule:"URL_BY_SKU"}).ok,true);
assert.equal(validateProductionPolicy("QR_POLICY",{ecc:"Z",payloadRule:"URL_BY_SKU"}).ok,false);

assert.equal(validateProductionPolicy("FONT_POLICY",{font:"Arial",embedded:true,outlined:false}).ok,false);
assert.equal(validateProductionPolicy("FONT_POLICY",{font:"Arial",assetCode:"ARIAL_REGULAR",assetVersion:"1",embedded:true,outlined:false}).ok,true);
assert.equal(validateProductionPolicy("FONT_POLICY",{font:"Helvetica",embedded:false,outlined:false,assetCode:"HELVETICA",assetVersion:"1"}).ok,false);
assert.equal(validateProductionPolicy("PDFX_POLICY",{profile:"PDF/X-4"}).ok,false);

assert.equal(RENDERER_CAPABILITIES.fontEmbedding,true);
assert.equal(RENDERER_CAPABILITIES.fontOutlining,false);
assert.equal(RENDERER_CAPABILITIES.iccOutputIntent,true);
assert.equal(RENDERER_CAPABILITIES.pdfxMetadataCandidate,true);
assert.deepEqual([...RENDERER_CAPABILITIES.pdfxProfiles],[]);

const rows=[
  {code:"BARCODE_POLICY",displayName:"Barcode",status:"APPROVED",configJson:JSON.stringify({symbology:"Code128-B",payloadRule:"SKU"})},
  {code:"QR_POLICY",displayName:"QR",status:"APPROVED",configJson:JSON.stringify({ecc:"M",payloadRule:"URL_BY_SKU"})},
  {code:"FONT_POLICY",displayName:"Font",status:"APPROVED",configJson:JSON.stringify({font:"Approved Sans",assetCode:"APPROVED_SANS",assetVersion:"1.0",embedded:true,outlined:false})},
  {code:"PDFX_POLICY",displayName:"PDF/X",status:"APPROVED",configJson:JSON.stringify({profile:"PDF/X-4",iccAssetCode:"ISO_COATED_V2",iccAssetVersion:"1.0"})}
];

const assets=[
  {assetType:"FONT",code:"APPROVED_SANS",version:"1.0",status:"APPROVED",metadata:{container:"TrueType"}},
  {assetType:"ICC_PROFILE",code:"ISO_COATED_V2",version:"1.0",status:"APPROVED",metadata:{colorSpace:"CMYK"}}
];

// Font embedding is implemented, but PDF/X remains blocked.
const current=summarizeProductionReadiness(rows,RENDERER_CAPABILITIES,assets);
assert.equal(current.ready,false);
assert.equal(current.gates.find(x=>x.code==="FONT_POLICY").valid,true);
assert.ok(current.gates.find(x=>x.code==="PDFX_POLICY").errors.some(x=>/not implemented/i.test(x)));

const missingFont=summarizeProductionReadiness(rows,RENDERER_CAPABILITIES,assets.filter(x=>x.assetType!=="FONT"));
assert.ok(missingFont.gates.find(x=>x.code==="FONT_POLICY").errors.some(x=>/was not found/i.test(x)));

const cffFont=summarizeProductionReadiness(rows,RENDERER_CAPABILITIES,[
  {assetType:"FONT",code:"APPROVED_SANS",version:"1.0",status:"APPROVED",metadata:{container:"OpenType/CFF"}},
  assets[1]
]);
assert.ok(cffFont.gates.find(x=>x.code==="FONT_POLICY").errors.some(x=>/TrueType-outline/i.test(x)));

const futureCapabilities={
  barcodeSymbologies:["CODE128-B"],
  qrEcc:["L","M","Q","H"],
  fontEmbedding:true,
  fontOutlining:false,
  pdfxProfiles:["PDF/X-4"]
};
assert.equal(summarizeProductionReadiness(rows,futureCapabilities,assets).ready,true);
assert.equal(summarizeProductionReadiness(rows.map((x,i)=>i===3?{...x,status:"DRAFT"}:x),futureCapabilities,assets).ready,false);
assert.equal(summarizeProductionReadiness(rows.slice(0,3),futureCapabilities,assets).ready,false);

console.log("Production readiness tests passed.");
