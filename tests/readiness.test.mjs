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
assert.equal(validateProductionPolicy("FONT_POLICY",{font:"Helvetica",embedded:false,outlined:false}).ok,false);
assert.equal(validateProductionPolicy("PDFX_POLICY",{profile:"PDF/X-4"}).ok,false);

assert.equal(RENDERER_CAPABILITIES.fontEmbedding,false);
assert.equal(RENDERER_CAPABILITIES.fontOutlining,false);
assert.deepEqual([...RENDERER_CAPABILITIES.pdfxProfiles],[]);

const rows=[
  {code:"BARCODE_POLICY",displayName:"Barcode",status:"APPROVED",configJson:JSON.stringify({symbology:"Code128-B",payloadRule:"SKU"})},
  {code:"QR_POLICY",displayName:"QR",status:"APPROVED",configJson:JSON.stringify({ecc:"M",payloadRule:"URL_BY_SKU"})},
  {code:"FONT_POLICY",displayName:"Font",status:"APPROVED",configJson:JSON.stringify({font:"Arial",embedded:true,outlined:false})},
  {code:"PDFX_POLICY",displayName:"PDF/X",status:"APPROVED",configJson:JSON.stringify({profile:"PDF/X-4"})}
];

// Policies cannot claim renderer capabilities that do not exist.
assert.equal(summarizeProductionReadiness(rows).ready,false);
assert.ok(summarizeProductionReadiness(rows).gates.find(x=>x.code==="FONT_POLICY").errors.some(x=>/not implemented/i.test(x)));
assert.ok(summarizeProductionReadiness(rows).gates.find(x=>x.code==="PDFX_POLICY").errors.some(x=>/not implemented/i.test(x)));

const futureCapabilities={
  barcodeSymbologies:["CODE128-B"],
  qrEcc:["L","M","Q","H"],
  fontEmbedding:true,
  fontOutlining:false,
  pdfxProfiles:["PDF/X-4"]
};
assert.equal(summarizeProductionReadiness(rows,futureCapabilities).ready,true);
assert.equal(summarizeProductionReadiness(rows.map((x,i)=>i===3?{...x,status:"DRAFT"}:x),futureCapabilities).ready,false);
assert.equal(summarizeProductionReadiness(rows.slice(0,3),futureCapabilities).ready,false);

console.log("Production readiness tests passed.");
