import {
  PDFX_PRODUCTION_PROMOTION_POLICY,
  validateTrustedPrimaryValidatorEvidence
} from "./pdfx-promotion-policy.js";

function isHttpsUrl(value) {
  try {
    const u=new URL(String(value||""));
    return u.protocol==="https:";
  } catch { return false; }
}

function safeJson(value) {
  if(value && typeof value==="object") return value;
  try{return JSON.parse(String(value||"{}"));}
  catch{return null;}
}

export function validateValidatorConfig(env={}) {
  const url=String(env.PDFX_VALIDATOR_URL||"").trim();
  const token=String(env.PDFX_VALIDATOR_TOKEN||"").trim();
  const errors=[];
  if(!url) errors.push("PDFX_VALIDATOR_URL is not configured.");
  else if(!isHttpsUrl(url)) errors.push("PDFX_VALIDATOR_URL must use HTTPS.");
  if(!token) errors.push("PDFX_VALIDATOR_TOKEN is not configured.");
  return {
    ok:errors.length===0,
    errors,
    url,
    hasToken:Boolean(token),
    promotionPolicyVersion:PDFX_PRODUCTION_PROMOTION_POLICY.version,
    trustedPrimaryValidator:{
      names:[...PDFX_PRODUCTION_PROMOTION_POLICY.primaryValidator.acceptedNames],
      version:PDFX_PRODUCTION_PROMOTION_POLICY.primaryValidator.version,
      ruleset:{...PDFX_PRODUCTION_PROMOTION_POLICY.primaryValidator.ruleset}
    }
  };
}

export function validateValidatorResponse(payload, expected={}) {
  const data=safeJson(payload);
  if(!data) return {ok:false,errors:["Validator response must be JSON."],data:null};
  const errors=[];
  const status=String(data.status||"").toUpperCase();
  if(!["PASS","FAIL"].includes(status)) errors.push("Validator status must be PASS or FAIL.");
  const profile=String(data.profile||"").toUpperCase();
  if(expected.profile && profile!==String(expected.profile).toUpperCase()){
    errors.push(`Validator profile mismatch: expected ${expected.profile}, received ${data.profile||"missing"}.`);
  }
  const artifactSha256=String(data.artifactSha256||data.artifact_sha256||"").toLowerCase();
  if(!artifactSha256) errors.push("Validator must return artifactSha256.");
  else if(!/^[0-9a-f]{64}$/.test(artifactSha256)) errors.push("Validator artifactSha256 must be a 64-character lowercase/uppercase hex SHA-256.");
  if(expected.artifactSha256 && artifactSha256!==String(expected.artifactSha256).toLowerCase()){
    errors.push("Validator artifact SHA-256 does not match the submitted PDF.");
  }
  const validator=String(data.validator||data.validatorName||"").trim();
  if(!validator) errors.push("Validator name is required.");
  const version=String(data.version||data.validatorVersion||"").trim();
  if(!version) errors.push("Validator version is required.");
  const rulesetId=String(data.rulesetId||data.ruleset_id||"").trim();
  const rulesetVersion=String(data.rulesetVersion||data.ruleset_version||"").trim();
  const rulesetSha256=String(data.rulesetSha256||data.ruleset_sha256||"").toLowerCase();
  const checks=Array.isArray(data.checks)?data.checks:[];
  if(status==="PASS" && checks.some((x)=>x && x.ok===false)){
    errors.push("Validator returned PASS while one or more checks failed.");
  }

  let trust={ok:false,errors:[]};
  if(expected.requireTrusted===true && status==="PASS") {
    trust=validateTrustedPrimaryValidatorEvidence({
      status,
      profile:data.profile,
      artifactSha256,
      validator,
      version,
      rulesetId,
      rulesetVersion,
      rulesetSha256
    });
    errors.push(...trust.errors);
  }

  return {
    ok:errors.length===0,
    errors,
    data:{
      status,
      profile:data.profile,
      artifactSha256,
      validator,
      version,
      rulesetId,
      rulesetVersion,
      rulesetSha256,
      trusted:expected.requireTrusted===true ? trust.ok : null,
      trustPolicyVersion:expected.requireTrusted===true ? PDFX_PRODUCTION_PROMOTION_POLICY.version : null,
      checks,
      report:data.report??data
    }
  };
}

export async function runExternalPdfxValidation(bytesLike, options={}, env={}) {
  const config=validateValidatorConfig(env);
  if(!config.ok) {
    const e=new Error("PDFX_VALIDATOR_NOT_CONFIGURED");
    e.detail=config.errors;
    throw e;
  }
  const bytes=bytesLike instanceof Uint8Array?bytesLike:new Uint8Array(bytesLike||[]);
  const profile=String(options.profile||"PDF/X-4");
  const artifactSha256=String(options.artifactSha256||"").toLowerCase();
  if(!bytes.length) throw new Error("PDFX_VALIDATOR_EMPTY_PDF");
  if(!/^[0-9a-f]{64}$/.test(artifactSha256)) throw new Error("PDFX_VALIDATOR_SHA_REQUIRED");

  const policy=PDFX_PRODUCTION_PROMOTION_POLICY;
  const headers=new Headers({
    "content-type":"application/pdf",
    "x-cas-pdfx-profile":profile,
    "x-cas-artifact-sha256":artifactSha256,
    "x-cas-promotion-policy-version":policy.version,
    "x-cas-ruleset-id":policy.primaryValidator.ruleset.id,
    "x-cas-ruleset-version":policy.primaryValidator.ruleset.version,
    "x-cas-ruleset-sha256":policy.primaryValidator.ruleset.sha256
  });
  headers.set("authorization",`Bearer ${String(env.PDFX_VALIDATOR_TOKEN).trim()}`);

  let response;
  try{
    response=await fetch(config.url,{
      method:"POST",
      headers,
      body:bytes,
      signal:AbortSignal.timeout(45000)
    });
  }catch(e){
    const err=new Error("PDFX_VALIDATOR_REQUEST_FAILED");
    err.detail=e?.message||String(e);
    throw err;
  }

  const text=await response.text();
  if(!response.ok){
    const err=new Error("PDFX_VALIDATOR_HTTP_ERROR");
    err.detail={status:response.status,body:text.slice(0,2000)};
    throw err;
  }
  const validation=validateValidatorResponse(text,{profile,artifactSha256,requireTrusted:true});
  if(!validation.ok){
    const err=new Error("PDFX_VALIDATOR_RESPONSE_INVALID");
    err.detail=validation.errors;
    throw err;
  }
  return validation.data;
}
