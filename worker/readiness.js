export const REQUIRED_PRODUCTION_POLICIES = Object.freeze([
  "BARCODE_POLICY",
  "QR_POLICY",
  "FONT_POLICY",
  "PDFX_POLICY"
]);

export function parsePolicyConfig(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "{}")); }
  catch { throw new Error("POLICY_CONFIG_INVALID"); }
}

export function validateProductionPolicy(code, value) {
  let data;
  try { data = parsePolicyConfig(value); }
  catch { return { ok:false, errors:["Policy config must be valid JSON."] }; }

  const errors=[];
  if (code === "BARCODE_POLICY") {
    const sym=String(data.symbology||"").trim();
    const payload=String(data.payloadRule||"").trim();
    if(!sym || /UNCONFIRMED/i.test(sym)) errors.push("Barcode symbology must be confirmed.");
    if(!payload || /UNCONFIRMED/i.test(payload)) errors.push("Barcode payload rule must be confirmed.");
  }
  if (code === "QR_POLICY") {
    const ecc=String(data.ecc||"").trim().toUpperCase();
    const payload=String(data.payloadRule||"").trim();
    if(!["L","M","Q","H"].includes(ecc)) errors.push("QR ecc must be one of L, M, Q, H.");
    if(!payload || /UNCONFIRMED/i.test(payload)) errors.push("QR payload rule must be confirmed.");
  }
  if (code === "FONT_POLICY") {
    const font=String(data.font||"").trim();
    if(!font) errors.push("Approved font name is required.");
    if(data.embedded!==true && data.outlined!==true) errors.push("Font policy requires embedded=true or outlined=true.");
  }
  if (code === "PDFX_POLICY") {
    const profile=String(data.profile||"").trim().toUpperCase();
    if(!profile || /UNCONFIRMED/i.test(profile)) errors.push("PDF/X profile must be confirmed.");
  }
  return { ok:errors.length===0, errors, data };
}

export function summarizeProductionReadiness(rows) {
  const map=new Map((rows||[]).map((x)=>[x.code,x]));
  const gates=REQUIRED_PRODUCTION_POLICIES.map((code)=>{
    const row=map.get(code);
    const validation=row ? validateProductionPolicy(code,row.configJson??row.config_json??row.config) : {ok:false,errors:["Policy missing."]};
    const approved=String(row?.status||"").toUpperCase()==="APPROVED";
    return {
      code,
      displayName:row?.displayName||row?.display_name||code,
      status:row?.status||"MISSING",
      approved,
      valid:validation.ok,
      errors:validation.errors
    };
  });
  return {
    ready:gates.every((x)=>x.approved&&x.valid),
    gates
  };
}
