import assert from "node:assert/strict";
import { validateProductionPolicy, summarizeProductionReadiness } from "../worker/readiness.js";

assert.equal(validateProductionPolicy("BARCODE_POLICY",{symbology:"Code128-B",payloadRule:"SKU"}).ok,true);
assert.equal(validateProductionPolicy("BARCODE_POLICY",{symbology:"Code128-B",payloadRule:"UNCONFIRMED"}).ok,false);
assert.equal(validateProductionPolicy("QR_POLICY",{ecc:"M",payloadRule:"URL_BY_SKU"}).ok,true);
assert.equal(validateProductionPolicy("FONT_POLICY",{font:"Arial",embedded:true,outlined:false}).ok,true);
assert.equal(validateProductionPolicy("FONT_POLICY",{font:"Helvetica",embedded:false,outlined:false}).ok,false);
assert.equal(validateProductionPolicy("PDFX_POLICY",{profile:"PDF/X-4"}).ok,true);

const rows=[
  {code:"BARCODE_POLICY",displayName:"Barcode",status:"APPROVED",configJson:JSON.stringify({symbology:"Code128-B",payloadRule:"SKU"})},
  {code:"QR_POLICY",displayName:"QR",status:"APPROVED",configJson:JSON.stringify({ecc:"M",payloadRule:"URL_BY_SKU"})},
  {code:"FONT_POLICY",displayName:"Font",status:"APPROVED",configJson:JSON.stringify({font:"Arial",embedded:true,outlined:false})},
  {code:"PDFX_POLICY",displayName:"PDF/X",status:"APPROVED",configJson:JSON.stringify({profile:"PDF/X-4"})}
];
assert.equal(summarizeProductionReadiness(rows).ready,true);
assert.equal(summarizeProductionReadiness(rows.map((x,i)=>i===3?{...x,status:"DRAFT"}:x)).ready,false);
assert.equal(summarizeProductionReadiness(rows.slice(0,3)).ready,false);

console.log("Production readiness tests passed.");
