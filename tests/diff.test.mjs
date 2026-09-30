import assert from "node:assert/strict";
import { flattenJson, diffJson } from "../worker/diff.js";

assert.deepEqual(flattenJson({a:{b:1},c:[2,3]}),{"a.b":1,"c[0]":2,"c[1]":3});

const d=diffJson(
  {product:{sku:"A"},package:{total:1},codes:{barcode:"111"}},
  {product:{sku:"B"},package:{total:2},codes:{barcode:"111"},origin:{country:"China"}}
);
assert.equal(d.total,3);
assert.equal(d.added,1);
assert.equal(d.changed,2);
assert.equal(d.removed,0);
assert.ok(d.changes.some(x=>x.path==="product.sku"&&x.from==="A"&&x.to==="B"));
assert.ok(d.changes.some(x=>x.path==="origin.country"&&x.change==="ADDED"));

assert.equal(diffJson({a:1},{a:1}).total,0);
console.log("Revision diff tests passed.");
