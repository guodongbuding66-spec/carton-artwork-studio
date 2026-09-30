const base=String(process.env.CLOUDFLARE_STAGING_URL||"").replace(/\/$/,"");
const clientId=String(process.env.CLOUDFLARE_ACCESS_CLIENT_ID||"");
const clientSecret=String(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET||"");

if(!base) throw new Error("CLOUDFLARE_STAGING_URL is required.");
if(!clientId||!clientSecret) throw new Error("Cloudflare Access service-token credentials are required for staging smoke tests.");

const accessHeaders={
  "CF-Access-Client-Id":clientId,
  "CF-Access-Client-Secret":clientSecret
};

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
if(health.response.status!==200) {
  throw new Error(`Staging health failed: HTTP ${health.response.status} ${JSON.stringify(health.payload)}`);
}
if(health.payload?.service!=="carton-artwork-studio") throw new Error("Unexpected staging service identity.");
if(health.payload?.bindings?.d1!==true) throw new Error("Staging D1 binding is not active.");
if(health.payload?.bindings?.r2!==true) throw new Error("Staging R2 binding is not active.");
if(health.payload?.bindings?.assets!==true) throw new Error("Staging static asset binding is not active.");
if(health.payload?.auth?.bypassEnabled===true) throw new Error("AUTH_BYPASS must be disabled in staging.");

const unauth=await fetch(base+"/api/me",{redirect:"manual"});
if(![301,302,303,307,308,401,403].includes(unauth.status)) {
  throw new Error(`Unauthenticated /api/me was not blocked by Access/application auth. HTTP ${unauth.status}`);
}

console.log("Staging smoke tests passed.");
console.log("Health version:",health.payload?.version||"unknown");
console.log("Bindings:",JSON.stringify(health.payload?.bindings||{}));
console.log("Unauthenticated /api/me status:",unauth.status);
