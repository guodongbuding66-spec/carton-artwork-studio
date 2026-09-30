import assert from "node:assert/strict";
import { inspectFont, inspectIcc, inspectProductionAsset, safeAssetCode } from "../worker/production-assets.js";

const ttf=new Uint8Array(28);
ttf.set([0,1,0,0],0);
ttf[4]=0;ttf[5]=1;
ttf.set(new TextEncoder().encode("name"),12);
ttf[20]=0;ttf[21]=0;ttf[22]=0;ttf[23]=28;
ttf[24]=0;ttf[25]=0;ttf[26]=0;ttf[27]=0;
assert.equal(inspectFont(ttf).ok,true);
assert.equal(inspectFont(ttf).metadata.container,"TrueType");

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
