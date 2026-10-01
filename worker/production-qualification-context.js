import { PDFX_PRODUCTION_PROMOTION_POLICY } from "./pdfx-promotion-policy.js";
import { productionCapabilityDescriptor } from "./production-renderer.js";

export const PRODUCTION_QUALIFICATION_CONTEXT_VERSION="1.0.0";

function sha(value){
  return String(value||"").trim().toLowerCase();
}
function validSha(value){
  return /^[0-9a-f]{64}$/.test(sha(value));
}
function normalizedQrEcc(value){
  const v=String(value||"M").trim().toUpperCase();
  return ["L","M","Q","H"].includes(v)?v:"";
}

export function buildProductionQualificationContext(input={}){
  const capability=productionCapabilityDescriptor();
  const snapshot=input.snapshot||{};
  const template=snapshot.template||{};
  const ruleset=PDFX_PRODUCTION_PROMOTION_POLICY.primaryValidator.ruleset;
  return {
    contextVersion:PRODUCTION_QUALIFICATION_CONTEXT_VERSION,
    rendererVersion:capability.rendererVersion,
    controlledSvgProfile:capability.controlledSvgProfile,
    shippingMarkStandardVersion:capability.shippingMarkStandardVersion,
    templateCode:String(template.code||input.templateCode||capability.domainTemplateCode||"").trim(),
    templateVersion:String(template.version||input.templateVersion||capability.domainTemplateVersion||"").trim(),
    printProfile:String(template.printProfile||input.printProfile||"").trim(),
    pdfxProfile:String(input.pdfxProfile||PDFX_PRODUCTION_PROMOTION_POLICY.profile).trim(),
    fontSha256:sha(input.fontSha256),
    iccSha256:sha(input.iccSha256),
    outputConditionIdentifier:String(input.outputConditionIdentifier||"").trim(),
    qrEcc:normalizedQrEcc(input.qrEcc),
    validatorRuleset:{
      id:String(ruleset.id||""),
      version:String(ruleset.version||""),
      sha256:sha(ruleset.sha256)
    }
  };
}

export function canonicalQualificationContext(context={}){
  const ruleset=context.validatorRuleset||{};
  return {
    contextVersion:String(context.contextVersion||""),
    rendererVersion:String(context.rendererVersion||""),
    controlledSvgProfile:String(context.controlledSvgProfile||""),
    shippingMarkStandardVersion:String(context.shippingMarkStandardVersion||""),
    templateCode:String(context.templateCode||""),
    templateVersion:String(context.templateVersion||""),
    printProfile:String(context.printProfile||""),
    pdfxProfile:String(context.pdfxProfile||""),
    fontSha256:sha(context.fontSha256),
    iccSha256:sha(context.iccSha256),
    outputConditionIdentifier:String(context.outputConditionIdentifier||""),
    qrEcc:String(context.qrEcc||"").toUpperCase(),
    validatorRuleset:{
      id:String(ruleset.id||""),
      version:String(ruleset.version||""),
      sha256:sha(ruleset.sha256)
    }
  };
}

export function validateProductionQualificationContext(context={}){
  const current=productionCapabilityDescriptor();
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const c=canonicalQualificationContext(context);
  const errors=[];
  if(c.contextVersion!==PRODUCTION_QUALIFICATION_CONTEXT_VERSION) errors.push("Qualification context version is stale.");
  if(c.rendererVersion!==current.rendererVersion) errors.push(`Renderer version must be ${current.rendererVersion}.`);
  if(c.controlledSvgProfile!==current.controlledSvgProfile) errors.push(`Controlled SVG profile must be ${current.controlledSvgProfile}.`);
  if(c.shippingMarkStandardVersion!==current.shippingMarkStandardVersion) errors.push(`Shipping Mark schema must be ${current.shippingMarkStandardVersion}.`);
  if(c.templateCode!==current.domainTemplateCode) errors.push(`Template code must be ${current.domainTemplateCode}.`);
  if(c.templateVersion!==current.domainTemplateVersion) errors.push(`Template version must be ${current.domainTemplateVersion}.`);
  if(!c.printProfile) errors.push("Print profile is required.");
  if(c.pdfxProfile.toUpperCase()!==p.profile.toUpperCase()) errors.push(`PDF/X profile must be ${p.profile}.`);
  if(!validSha(c.fontSha256)) errors.push("Font SHA-256 is required.");
  if(!validSha(c.iccSha256)) errors.push("ICC SHA-256 is required.");
  if(!c.outputConditionIdentifier) errors.push("OutputConditionIdentifier is required.");
  if(!["L","M","Q","H"].includes(c.qrEcc)) errors.push("QR ECC must be L, M, Q or H.");
  if(c.validatorRuleset.id!==p.primaryValidator.ruleset.id) errors.push("Validator ruleset id is stale.");
  if(c.validatorRuleset.version!==p.primaryValidator.ruleset.version) errors.push("Validator ruleset version is stale.");
  if(c.validatorRuleset.sha256!==p.primaryValidator.ruleset.sha256) errors.push("Validator ruleset SHA-256 is stale.");
  return {ok:errors.length===0,errors,context:c};
}

export async function qualificationContextFingerprint(context={}){
  const canonical=canonicalQualificationContext(context);
  const bytes=new TextEncoder().encode(JSON.stringify(canonical));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}

export async function verifyQualificationContextFingerprint(context={},fingerprint=""){
  const validation=validateProductionQualificationContext(context);
  const actual=await qualificationContextFingerprint(validation.context);
  const supplied=sha(fingerprint);
  const errors=[...validation.errors];
  if(!validSha(supplied)) errors.push("Qualification fingerprint must be a SHA-256.");
  else if(actual!==supplied) errors.push("Qualification fingerprint does not match canonical context bytes.");
  return {ok:errors.length===0,errors,actual,context:validation.context};
}
