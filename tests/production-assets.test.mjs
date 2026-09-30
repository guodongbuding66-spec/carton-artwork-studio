import assert from "node:assert/strict";
import { inspectFont, inspectIcc, inspectProductionAsset, safeAssetCode } from "../worker/production-assets.js";

function putU16(b,o,v){b[o]=(v>>>8)&255;b[o+1]=v&255;}
function putU32(b,o,v){b[o]=(v>>>24)&255;b[o+1]=(v>>>16)&255;b[o+2]=(v>>>8)&255;b[o+3]=v&255;}

const tags=["cmap","head","hhea","hmtx","maxp","glyf","loca"];
const ttf=new Uint8Array(12+tags.length*16);
ttf.set([0,1,0,0],0);
putU16(ttf,4,tags.length);
let p=12;
for(const tag of tags){
  ttf.set(new TextEncoder().encode(tag),p);
  putU32(ttf,p+8,ttf.length);
  putU32(ttf,p+12,0);
  p+=16;
}
assert.equal(inspectFont(ttf).ok,true);
assert.equal(inspectFont(ttf).metadata.container,"TrueType");

const missingCmap=ttf.slice();
missingCmap.set(new TextEncoder().encode("name"),12);
assert.equal(inspectFont(missingCmap).ok,false);
assert.ok(inspectFont(missingCmap).errors.some(x=>/cmap/i.test(x)));

const badFont=new TextEncoder().encode("not-a-font");
assert.equal(inspectFont(badFont).ok,false);

const icc=new Uint8Array(132);
icc[0]=0;icc[1]=0;icc[2]=0;icc[3]=132;
icc[8]=4;icc[9]=0x30;
icc.set(new TextEncoder().encode("mntr"),12);
icc.set(new TextEncoder().encode("RGB "),16);
icc.set(new TextEncoder().encode("XYZ "),20);
icc.set(new TextEncoder().encode("acsp"),36);
const inspected=inspectIcc(icc);
assert.equal(inspected.ok,true);
assert.equal(inspected.metadata.colorSpace,"RGB");
assert.equal(inspected.metadata.version,"4.3.0");

const badIcc=new Uint8Array(132);
badIcc[3]=132;
assert.equal(inspectIcc(badIcc).ok,false);

assert.equal(inspectProductionAsset("UNKNOWN",new Uint8Array()).ok,false);
assert.equal(safeAssetCode(" Arial / Regular "),"ARIAL_REGULAR");

console.log("Production asset tests passed.");
