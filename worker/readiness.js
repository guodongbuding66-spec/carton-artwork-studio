export const REQUIRED_PRODUCTION_POLICIES = Object.freeze([
  "BARCODE_POLICY",
  "QR_POLICY",
  "FONT_POLICY",
  "PDFX_POLICY"
]);

export const RENDERER_CAPABILITIES = Object.freeze({
  barcodeSymbologies: Object.freeze(["CODE128-B"]),
  qrEcc: Object.freeze(["L","M","Q","H"]),
  fontEmbedding: true,
  fontOutlining: false,
  pdfxProfiles: Object.freeze([])
});

export function parsePolicyConfig(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "{}")); }
  catch { throw new Error("POLICY_CONFIG_INVALID"); }
}

function normalizeBarcodeSymbology(value) {
  const v=String(value||"").trim().toUpperCase().replace(/[ _]/g,"-");
  if(["CODE128-B","CODE-128-B","CODE128B","CODE-128B"].includes(v)) return "CODE128-B";
  return v;
}

export function validateProductionPolicy(code, value, capabilities = RENDERER_CAPABILITIES) {
  let data;
  try { data = parsePolicyConfig(value); }
  catch { return { ok:false, errors:["Policy config must be valid JSON."] }; }

  const errors=[];
  if (code === "BARCODE_POLICY") {
    const sym=normalizeBarcodeSymbology(data.symbology);
    const payload=String(data.payloadRule||"").trim();
    if(!sym || /UNCONFIRMED/i.test(sym)) errors.push("Barcode symbology must be confirmed.");
    else if(!capabilities.barcodeSymbologies.includes(sym)) {
      errors.push(`Barcode symbology ${sym} is not implemented by the production renderer.`);
    }
    if(!payload || /UNCONFIRMED/i.test(payload)) errors.push("Barcode payload rule must be confirmed.");
  }

  if (code === "QR_POLICY") {
    const ecc=String(data.ecc||"").trim().toUpperCase();
    const payload=String(data.payloadRule||"").trim();
    if(!capabilities.qrEcc.includes(ecc)) {
      errors.push(`QR ecc must be one of implemented levels: ${capabilities.qrEcc.join(", ")}.`);
    }
    if(!payload || /UNCONFIRMED/i.test(payload)) errors.push("QR payload rule must be confirmed.");
  }

  if (code === "FONT_POLICY") {
    const font=String(data.font||"").trim();
    const assetCode=String(data.assetCode||"").trim().toUpperCase();
    const assetVersion=String(data.assetVersion||"").trim();
    if(!font) errors.push("Approved font name is required.");
    if(!assetCode) errors.push("FONT_POLICY assetCode is required.");
    if(!assetVersion) errors.push("FONT_POLICY assetVersion is required.");
    if(data.embedded!==true && data.outlined!==true) {
      errors.push("Font policy requires embedded=true or outlined=true.");
    }
    if(data.embedded===true && !capabilities.fontEmbedding) {
      errors.push("Font embedding is not implemented by the current production renderer.");
    }
    if(data.outlined===true && !capabilities.fontOutlining) {
      errors.push("Font outlining is not implemented by the current production renderer.");
    }
  }

  if (code === "PDFX_POLICY") {
    const profile=String(data.profile||"").trim().toUpperCase();
    const iccAssetCode=String(data.iccAssetCode||"").trim().toUpperCase();
    const iccAssetVersion=String(data.iccAssetVersion||"").trim();
    if(!iccAssetCode) errors.push("PDFX_POLICY iccAssetCode is required.");
    if(!iccAssetVersion) errors.push("PDFX_POLICY iccAssetVersion is required.");
    if(!profile || /UNCONFIRMED/i.test(profile)) {
      errors.push("PDF/X profile must be confirmed.");
    } else if(!capabilities.pdfxProfiles.map((x)=>String(x).toUpperCase()).includes(profile)) {
      errors.push(`PDF/X profile ${profile} is not implemented by the current production renderer.`);
    }
  }

  return { ok:errors.length===0, errors, data };
}

export function summarizeProductionReadiness(rows, capabilities = RENDERER_CAPABILITIES, assets = []) {
  const map=new Map((rows||[]).map((x)=>[x.code,x]));
  const approvedAssets=(assets||[]).filter((x)=>String(x.status||"").toUpperCase()==="APPROVED");
  const gates=REQUIRED_PRODUCTION_POLICIES.map((code)=>{
    const row=map.get(code);
    const validation=row
      ? validateProductionPolicy(code,row.configJson??row.config_json??row.config,capabilities)
      : {ok:false,errors:["Policy missing."],data:{}};
    const errors=[...(validation.errors||[])];
    const data=validation.data||{};
    if(code==="FONT_POLICY"&&data.assetCode&&data.assetVersion){
      const asset=approvedAssets.find((x)=>
        String(x.assetType??x.asset_type||"").toUpperCase()==="FONT" &&
        String(x.code||"").toUpperCase()===String(data.assetCode).toUpperCase() &&
        String(x.version||"")===String(data.assetVersion)
      );
      if(!asset) errors.push(`Approved FONT asset ${data.assetCode}@${data.assetVersion} was not found.`);
      else{
        let metadata=asset.metadata||{};
        if(!metadata.container&&asset.metadataJson){
          try{metadata=JSON.parse(asset.metadataJson);}catch{}
        }
        if(!/^TrueType/i.test(String(metadata.container||""))){
          errors.push(`FONT asset ${data.assetCode}@${data.assetVersion} is not a TrueType-outline asset supported by the embedded-font renderer.`);
        }
      }
    }
    if(code==="PDFX_POLICY"&&data.iccAssetCode&&data.iccAssetVersion){
      const asset=approvedAssets.find((x)=>
        String(x.assetType??x.asset_type||"").toUpperCase()==="ICC_PROFILE" &&
        String(x.code||"").toUpperCase()===String(data.iccAssetCode).toUpperCase() &&
        String(x.version||"")===String(data.iccAssetVersion)
      );
      if(!asset) errors.push(`Approved ICC_PROFILE asset ${data.iccAssetCode}@${data.iccAssetVersion} was not found.`);
    }
    const approved=String(row?.status||"").toUpperCase()==="APPROVED";
    return {
      code,
      displayName:row?.displayName||row?.display_name||code,
      status:row?.status||"MISSING",
      approved,
      valid:errors.length===0,
      errors
    };
  });
  return {
    ready:gates.every((x)=>x.approved&&x.valid),
    rendererCapabilities:capabilities,
    gates
  };
}
