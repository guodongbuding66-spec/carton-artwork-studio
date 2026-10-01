import assert from "node:assert/strict";
import { parseControlledSvgDataUrl } from "../worker/controlled-svg.js";

function svgData(xml){
  return "data:image/svg+xml;base64,"+Buffer.from(xml,"utf8").toString("base64");
}

const valid=svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <rect x="2" y="2" width="20" height="10" fill="#000"/>
  <path d="M30 5 L50 5 L45 20 Q40 28 35 20 Z" fill="black"/>
  <circle cx="75" cy="20" r="10" fill="none" stroke="#000000" stroke-width="2"/>
</svg>`);
const model=parseControlledSvgDataUrl(valid);
assert.equal(model.profile,"CAS_SVG_K_ONLY_1");
assert.deepEqual(model.viewBox,{x:0,y:0,w:100,h:50});
assert.equal(model.primitiveCount,3);
assert.ok(model.primitives[1].commands.some(x=>x.op==="C"),"Quadratic curves are normalized to cubic PDF-compatible curves");

const relative=svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="m2 2 h10 v10 l-5 5 z" fill="#000"/></svg>`);
const relativeModel=parseControlledSvgDataUrl(relative);
assert.equal(relativeModel.primitiveCount,1);
assert.equal(relativeModel.primitives[0].commands.at(-1).op,"Z");

for(const [name,xml,code] of [
  ["script",`<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>`,"SVG_UNSAFE_OR_UNSUPPORTED_FEATURE"],
  ["external href",`<svg viewBox="0 0 10 10"><use href="https://evil.test/a.svg#x"/></svg>`,"SVG_UNSAFE_OR_UNSUPPORTED_FEATURE"],
  ["color",`<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>`,"SVG_COLOR_NOT_K_ONLY"],
  ["arc",`<svg viewBox="0 0 10 10"><path d="M1 1 A4 4 0 0 1 9 9" fill="none" stroke="black"/></svg>`,"SVG_PATH_ARC_UNSUPPORTED"],
  ["transform",`<svg viewBox="0 0 10 10"><g transform="scale(2)"><rect width="2" height="2"/></g></svg>`,"SVG_UNSAFE_OR_UNSUPPORTED_FEATURE"],
  ["embedded image",`<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>`,"SVG_UNSAFE_OR_UNSUPPORTED_FEATURE"]
]){
  assert.throws(
    ()=>parseControlledSvgDataUrl(svgData(xml)),
    (e)=>e?.code===code,
    name
  );
}

assert.throws(
  ()=>parseControlledSvgDataUrl("data:image/svg+xml,%3Csvg%3E"),
  (e)=>e?.code==="SVG_DATA_URL_INVALID"
);

console.log("Controlled SVG production parser tests passed.");
