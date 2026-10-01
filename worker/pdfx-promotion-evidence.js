import {
  PDFX_PRODUCTION_PROMOTION_POLICY,
  validateSecondaryValidatorEvidence,
  validateRipQualificationEvidence,
  validateProductionTrialEvidence
} from "./pdfx-promotion-policy.js";

export const PDFX_PROMOTION_EVIDENCE_TYPES = Object.freeze([
  "SECONDARY_VALIDATION",
  "RIP_QUALIFICATION",
  "PRODUCTION_TRIAL"
]);

export function normalizePromotionEvidenceType(value) {
  const v=String(value||"").trim().toUpperCase();
  return PDFX_PROMOTION_EVIDENCE_TYPES.includes(v)?v:"";
}

export function sanitizeEvidenceFilename(value) {
  return String(value||"evidence.bin").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,180)||"evidence.bin";
}

export function parseEvidenceMetadata(value) {
  if(value && typeof value==="object" && !Array.isArray(value)) return value;
  try {
    const parsed=JSON.parse(String(value||"{}"));
    return parsed && typeof parsed==="object" && !Array.isArray(parsed)?parsed:{};
  } catch {
    return {};
  }
}

function bool(value) {
  return value===true || value===1 || String(value||"").toLowerCase()==="true";
}

export function normalizePromotionEvidence(type, metadata={}, evidenceSha256="") {
  const t=normalizePromotionEvidenceType(type);
  const m=parseEvidenceMetadata(metadata);
  return {
    evidenceType:t,
    status:String(m.result||m.status||"").toUpperCase(),
    profile:String(m.profile||PDFX_PRODUCTION_PROMOTION_POLICY.profile),
    artifactSha256:String(m.artifactSha256||m.artifact_sha256||"").toLowerCase(),
    validator:String(m.validator||m.validatorName||"").trim(),
    version:String(m.version||m.validatorVersion||"").trim(),
    rulesetId:String(m.rulesetId||m.ruleset_id||"").trim(),
    rulesetVersion:String(m.rulesetVersion||m.ruleset_version||"").trim(),
    rulesetSha256:String(m.rulesetSha256||m.ruleset_sha256||"").toLowerCase(),
    suite:String(m.suite||"").trim(),
    suiteVersion:String(m.suiteVersion||m.suite_version||"").trim(),
    conformanceLevel:String(m.conformanceLevel||m.conformance_level||"").trim(),
    printServiceProvider:String(m.printServiceProvider||m.print_service_provider||"").trim(),
    ripProduct:String(m.ripProduct||m.rip_product||"").trim(),
    ripVersion:String(m.ripVersion||m.rip_version||"").trim(),
    outputDevice:String(m.outputDevice||m.output_device||"").trim(),
    actualProductionWorkflow:bool(m.actualProductionWorkflow??m.actual_production_workflow),
    noPdfRepair:bool(m.noPdfRepair??m.no_pdf_repair),
    testedAt:String(m.testedAt||m.tested_at||"").trim(),
    evidenceSha256:String(evidenceSha256||m.evidenceSha256||m.evidence_sha256||"").toLowerCase(),
    notes:String(m.notes||"").trim(),
    jobReference:String(m.jobReference||m.job_reference||"").trim()
  };
}

export function validatePromotionEvidence(type, metadata={}, evidenceSha256="", nowMs=Date.now()) {
  const t=normalizePromotionEvidenceType(type);
  if(!t) return {ok:false,errors:["Evidence type is invalid."],data:null};
  const data=normalizePromotionEvidence(t,metadata,evidenceSha256);
  let result;
  if(t==="SECONDARY_VALIDATION") result=validateSecondaryValidatorEvidence(data);
  else if(t==="RIP_QUALIFICATION") result=validateRipQualificationEvidence(data,nowMs);
  else result=validateProductionTrialEvidence(data,nowMs);

  const errors=[...(result.errors||[])];
  if(!/^[0-9a-f]{64}$/.test(data.evidenceSha256)){
    errors.push("Evidence file SHA-256 is required and must be 64 lowercase hex characters.");
  }
  return {ok:errors.length===0,errors,data,policyVersion:PDFX_PRODUCTION_PROMOTION_POLICY.version};
}

export function evidenceRowToPolicyInput(row={}) {
  let metadata={};
  try{metadata=JSON.parse(row.metadataJson??row.metadata_json??"{}");}catch{}
  return normalizePromotionEvidence(
    row.evidenceType??row.evidence_type,
    {
      ...metadata,
      result:metadata.result||metadata.status||"PASS",
      profile:row.profile||metadata.profile,
      artifactSha256:row.artifactSha256??row.artifact_sha256??metadata.artifactSha256,
      validator:row.validatorName??row.validator_name??metadata.validator,
      version:row.validatorVersion??row.validator_version??metadata.version,
      rulesetId:row.rulesetId??row.ruleset_id??metadata.rulesetId,
      rulesetVersion:row.rulesetVersion??row.ruleset_version??metadata.rulesetVersion,
      rulesetSha256:row.rulesetSha256??row.ruleset_sha256??metadata.rulesetSha256,
      printServiceProvider:row.printServiceProvider??row.print_service_provider??metadata.printServiceProvider,
      ripProduct:row.ripProduct??row.rip_product??metadata.ripProduct,
      ripVersion:row.ripVersion??row.rip_version??metadata.ripVersion,
      outputDevice:row.outputDevice??row.output_device??metadata.outputDevice,
      suite:row.suite||metadata.suite,
      suiteVersion:row.suiteVersion??row.suite_version??metadata.suiteVersion,
      conformanceLevel:row.conformanceLevel??row.conformance_level??metadata.conformanceLevel,
      testedAt:row.testedAt??row.tested_at??metadata.testedAt,
      actualProductionWorkflow:Boolean(row.actualProductionWorkflow??row.actual_production_workflow??metadata.actualProductionWorkflow),
      noPdfRepair:Boolean(row.noPdfRepair??row.no_pdf_repair??metadata.noPdfRepair),
      evidenceSha256:row.evidenceSha256??row.evidence_sha256
    },
    row.evidenceSha256??row.evidence_sha256??""
  );
}
