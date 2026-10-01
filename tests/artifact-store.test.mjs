import assert from "node:assert/strict";
import {
  ARTIFACT_STORE_LIMITS,
  artifactBindingState,
  artifactStoreKind,
  createKvR2CompatibilityStore,
  prepareArtifactEnv
} from "../worker/artifact-store.js";

class FakeKv {
  constructor(){ this.map=new Map(); }
  async put(key,value,options={}){
    const buf=value instanceof ArrayBuffer?value:value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
    this.map.set(key,{value:buf,metadata:options.metadata||null});
  }
  async getWithMetadata(key,type){
    assert.equal(type,"arrayBuffer");
    const rec=this.map.get(key);
    return rec?{value:rec.value,metadata:rec.metadata}:{value:null,metadata:null};
  }
  async delete(key){ this.map.delete(key); }
}

const kv=new FakeKv();
const store=createKvR2CompatibilityStore(kv);
const bytes=new TextEncoder().encode("hello-artifact");
await store.put("a.bin",bytes,{httpMetadata:{contentType:"application/octet-stream"}});
const got=await store.get("a.bin");
assert.ok(got);
assert.equal(new TextDecoder().decode(await got.arrayBuffer()),"hello-artifact");
assert.equal(got.httpMetadata.contentType,"application/octet-stream");
assert.match(got.httpEtag,/^"[0-9a-f]{64}"$/);

const headers=new Headers();
got.writeHttpMetadata(headers);
assert.equal(headers.get("content-type"),"application/octet-stream");

const head=await store.head("a.bin");
assert.equal(head.size,bytes.byteLength);
await store.delete("a.bin");
assert.equal(await store.get("a.bin"),null);

assert.equal(artifactStoreKind({ARTWORK_KV:kv}),"KV");
assert.equal(artifactStoreKind({ARTWORK_FILES:{}}),"R2");
assert.equal(artifactStoreKind({}),"NONE");

const prepared=prepareArtifactEnv({ARTWORK_KV:kv,DB:{}});
assert.equal(prepared.ARTIFACT_STORE_KIND,"KV");
assert.ok(prepared.ARTWORK_FILES);
assert.deepEqual(artifactBindingState(prepared),{
  artifactStore:true,
  artifactStoreKind:"KV",
  kv:true,
  r2:false
});

const r2Prepared=prepareArtifactEnv({ARTWORK_FILES:{get(){}}});
assert.equal(r2Prepared.ARTIFACT_STORE_KIND,"R2");
assert.deepEqual(artifactBindingState(r2Prepared),{
  artifactStore:true,
  artifactStoreKind:"R2",
  kv:false,
  r2:true
});

const tooLarge=new ArrayBuffer(ARTIFACT_STORE_LIMITS.KV_MAX_VALUE_BYTES+1);
await assert.rejects(
  ()=>store.put("too-large",tooLarge),
  (e)=>e?.message==="KV_OBJECT_TOO_LARGE"
);

console.log("Artifact store compatibility tests passed.");
