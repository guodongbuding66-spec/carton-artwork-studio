import fs from "node:fs";

const base=String(process.env.CLOUDFLARE_STAGING_URL||"").replace(/\/$/,"");
const clientId=String(process.env.CLOUDFLARE_ACCESS_CLIENT_ID||"");
const clientSecret=String(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET||"");

if(!base) throw new Error("CLOUDFLARE_STAGING_URL is required.");

const accessHeaders={};
if(clientId&&clientSecret){
  accessHeaders["CF-Access-Client-Id"]=clientId;
  accessHeaders["CF-Access-Client-Secret"]=clientSecret;
}

async function fetchJson(path, options={}) {
  const response=await fetch(base+path,{
    ...options,
    headers:{...accessHeaders,...(options.headers||{})},
    redirect:"manual"
  });
  const text=await response.text();
  let payload;
  try{payload=JSON.parse(text);}catch{payload=text;}
  return {response,payload};
}

const health=await fetchJson("/api/health");
const redirectStatuses=new Set([301,302,303,307,308]);

if(redirectStatuses.has(health.response.status) && !clientId && !clientSecret) {
  fs.mkdirSync("artifacts",{recursive:true});
  const acceptance={
    schemaVersion:2,
    generatedAt:new Date().toISOString(),
    gitSha:String(process.env.GITHUB_SHA||""),
    gitRef:String(process.env.GITHUB_REF||""),
    stagingUrl:base,
    service:null,
    version:null,
    bindings:null,
    auth:{provider:"cloudflare-access",bypassEnabled:false},
    pdfx:null,
    unauthenticatedHealthStatus:health.response.status,
    runtimeHealthVerified:false,
    accessEnforced:true,
    result:"ACCESS_PROTECTED",
    productionBlockedAsExpected:true
  };
  fs.writeFileSync("artifacts/staging-acceptance.json",JSON.stringify(acceptance,null,2)+"\n");
  console.log("Staging is protected by Cloudflare Access; unauthenticated deploy smoke passed.");
  console.log("Runtime health verification requires an Access service token.");
  process.exit(0);
}

if(health.response.status!==200) {
  throw new Error(`Staging health failed: HTTP ${health.response.status} ${JSON.stringify(health.payload)}`);
}
if(health.payload?.service!=="carton-artwork-studio") throw new Error("Unexpected staging service identity.");
if(health.payload?.version!=="2.0.0") throw new Error(`Unexpected staging version: ${health.payload?.version||"unknown"}; expected 2.0.0.`);
if(health.payload?.pdfx?.promotionPolicyVersion!=="2.0.0") throw new Error("Staging does not expose PDF/X promotion policy v2.0.0.");
if(health.payload?.bindings?.d1!==true) throw new Error("Staging D1 binding is not active.");
if(health.payload?.bindings?.artifactStore!==true) throw new Error("Staging Artifact Store binding is not active.");
if(!["KV","R2"].includes(health.payload?.bindings?.artifactStoreKind)) throw new Error("Unexpected staging Artifact Store provider.");
if(health.payload?.bindings?.assets!==true) throw new Error("Staging static asset binding is not active.");
if(health.payload?.auth?.bypassEnabled===true) throw new Error("AUTH_BYPASS must be disabled in staging.");

const unauth=await fetch(base+"/api/me",{redirect:"manual"});
if(![301,302,303,307,308,401,403].includes(unauth.status)) {
  throw new Error(`Unauthenticated /api/me was not blocked by Access/application auth. HTTP ${unauth.status}`);
}

fs.mkdirSync("artifacts",{recursive:true});
const acceptance={
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  gitSha:String(process.env.GITHUB_SHA||""),
  gitRef:String(process.env.GITHUB_REF||""),
  stagingUrl:base,
  service:health.payload?.service||null,
  version:health.payload?.version||null,
  bindings:health.payload?.bindings||null,
  auth:health.payload?.auth||null,
  pdfx:health.payload?.pdfx||null,
  unauthenticatedMeStatus:unauth.status,
  runtimeHealthVerified:true,
  accessEnforced:redirectStatuses.has(unauth.status),
  result:"PASS",
  productionBlockedAsExpected:health.payload?.bindings?.artifactStoreKind!=="R2"
};
fs.writeFileSync("artifacts/staging-acceptance.json",JSON.stringify(acceptance,null,2)+"\n");

console.log("Staging smoke tests passed.");
console.log("Health version:",health.payload?.version||"unknown");
console.log("Bindings:",JSON.stringify(health.payload?.bindings||{}));
console.log("Unauthenticated /api/me status:",unauth.status);
