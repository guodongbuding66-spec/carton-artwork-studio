const assert = require("node:assert/strict");
const { loadBrowserModules } = require("./_load-umd.cjs");
const { CartonApi: A } = loadBrowserModules(["assets/api.js"]);

const calls=[];
const fetchImpl=async (url,init={})=>{
  calls.push({url,init});
  if(url.endsWith("/api/health")) return new Response(JSON.stringify({ok:true,bindings:{d1:true,r2:true,assets:true}}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes("/api/artworks") && init.method==="POST") return new Response(JSON.stringify({data:{id:"art-1",artworkNo:"ART-1"}}),{status:201,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({data:[]}),{status:200,headers:{"content-type":"application/json"}});
};
const api=A.createClient({baseUrl:"https://example.test",fetchImpl});

(async()=>{
  const health=await api.health();
  assert.equal(health.ok,true);
  const artwork={sku:"SKU1",contractNo:"HT1",factoryId:"ningbo-a",packageCount:2,currentPackage:1,revision:"R03"};
  const created=await api.createArtwork(artwork,{product:{sku:"SKU1"}},"tester");
  assert.equal(created.data.id,"art-1");
  const body=JSON.parse(calls.find(x=>x.init.method==="POST").init.body);
  assert.equal(body.revision,"R03");
  assert.equal(body.actor,"tester");
  assert.equal(A.statusToApi("in_review"),"IN_REVIEW");
  assert.equal(A.statusFromApi("APPROVED"),"approved");
  console.log("API client tests passed.");
})().catch((e)=>{console.error(e);process.exitCode=1;});
