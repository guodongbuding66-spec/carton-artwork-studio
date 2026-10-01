const KV_MAX_VALUE_BYTES = 24 * 1024 * 1024;

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (typeof value === "string") return new TextEncoder().encode(value).buffer;
  throw new TypeError("Artifact value must be a string, ArrayBuffer, or typed array.");
}

async function sha256Hex(buffer) {
  const digest=await crypto.subtle.digest("SHA-256",buffer);
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}

function kvObject(buffer, metadata={}) {
  const contentType=String(metadata?.contentType||"application/octet-stream");
  const etag=String(metadata?.etag||"");
  return {
    body:buffer,
    size:Number(metadata?.size||buffer.byteLength||0),
    httpEtag:etag,
    httpMetadata:{contentType},
    async arrayBuffer(){ return buffer; },
    writeHttpMetadata(headers){
      if(contentType) headers.set("content-type",contentType);
    }
  };
}

export function createKvR2CompatibilityStore(kv) {
  if(!kv) return null;
  return {
    async put(key,value,options={}) {
      const buffer=toArrayBuffer(value);
      if(buffer.byteLength>KV_MAX_VALUE_BYTES) {
        const error=new Error("KV_OBJECT_TOO_LARGE");
        error.limitBytes=KV_MAX_VALUE_BYTES;
        throw error;
      }
      const etag=`"${await sha256Hex(buffer)}"`;
      await kv.put(key,buffer,{
        metadata:{
          contentType:String(options?.httpMetadata?.contentType||"application/octet-stream"),
          etag,
          size:buffer.byteLength,
          provider:"KV"
        }
      });
    },
    async get(key) {
      const result=await kv.getWithMetadata(key,"arrayBuffer");
      if(!result?.value) return null;
      return kvObject(result.value,result.metadata||{});
    },
    async head(key) {
      const result=await kv.getWithMetadata(key,"arrayBuffer");
      if(!result?.value) return null;
      return {
        size:Number(result.metadata?.size||result.value.byteLength||0),
        httpEtag:String(result.metadata?.etag||""),
        httpMetadata:{contentType:String(result.metadata?.contentType||"application/octet-stream")}
      };
    },
    async delete(key) {
      await kv.delete(key);
    }
  };
}

export function artifactStoreKind(env={}) {
  if(env.ARTIFACT_STORE_KIND) return String(env.ARTIFACT_STORE_KIND).toUpperCase();
  if(env.ARTWORK_FILES) return "R2";
  if(env.ARTWORK_KV) return "KV";
  return "NONE";
}

export function prepareArtifactEnv(env={}) {
  const kind=artifactStoreKind(env);
  if(kind==="R2") return {...env,ARTIFACT_STORE_KIND:"R2"};
  if(kind==="KV") {
    return {
      ...env,
      ARTIFACT_STORE_KIND:"KV",
      ARTWORK_FILES:createKvR2CompatibilityStore(env.ARTWORK_KV)
    };
  }
  return {...env,ARTIFACT_STORE_KIND:"NONE"};
}

export function artifactBindingState(env={}) {
  const kind=artifactStoreKind(env);
  return {
    artifactStore:kind!=="NONE",
    artifactStoreKind:kind,
    kv:kind==="KV",
    r2:kind==="R2"
  };
}

export const ARTIFACT_STORE_LIMITS = Object.freeze({
  KV_MAX_VALUE_BYTES
});
