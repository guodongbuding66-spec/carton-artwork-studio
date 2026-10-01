export const PDFX_PRODUCTION_PROMOTION_POLICY = Object.freeze({
  version: "2.0.0",
  profile: "PDF/X-4",
  standard: "ISO 15930-7:2010",
  baseline: "GWG 2022",
  primaryValidator: Object.freeze({
    acceptedNames: Object.freeze([
      "callas pdfToolbox CLI",
      "callas pdfToolbox Server"
    ]),
    version: "17.0.683",
    ruleset: Object.freeze({
      id: "CAS-PDFX4-PRODUCTION-1",
      version: "1.0.0",
      sha256: "f658882bd2d367839ea2fb3b3bce027320de4a70d480169feb3ba860588a6d80"
    })
  }),
  secondaryValidator: Object.freeze({
    acceptedNames: Object.freeze([
      "Enfocus PitStop Pro"
    ]),
    version: "26.07"
  }),
  regression: Object.freeze({
    minimumUniqueArtifacts: 5,
    requireSameBytesAcrossValidators: true
  }),
  ripQualification: Object.freeze({
    suite: "Ghent PDF Output Suite",
    suiteVersion: "5.0",
    minimumConformance: "LEVEL_1_PLUS_2",
    maxEvidenceAgeDays: 365,
    requireActualProductionWorkflow: true
  }),
  productionTrial: Object.freeze({
    maxEvidenceAgeDays: 365,
    requireActualProductionWorkflow: true,
    requireNoPdfRepair: true,
    requireQualifiedRegressionArtifact: true
  })
});

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function exactNameAllowed(value, allowed) {
  const n=norm(value);
  return allowed.some((x)=>norm(x)===n);
}

function validSha(value) {
  return /^[0-9a-f]{64}$/i.test(String(value||""));
}

function validateFreshTimestamp(value, maxDays, nowMs, label) {
  const errors=[];
  const testedAt=Date.parse(String(value||""));
  if(!Number.isFinite(testedAt)) errors.push(`${label} must be a valid timestamp.`);
  else {
    const age=nowMs-testedAt;
    const max=maxDays*24*60*60*1000;
    if(age<0 || age>max) errors.push(`${label} must be no older than ${maxDays} days.`);
  }
  return errors;
}

export function validateTrustedPrimaryValidatorEvidence(evidence={}) {
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const errors=[];
  if(String(evidence.status||"").toUpperCase()!=="PASS") errors.push("Primary validator evidence must be PASS.");
  if(String(evidence.profile||"").toUpperCase()!==p.profile.toUpperCase()) errors.push(`Profile must be ${p.profile}.`);
  if(!exactNameAllowed(evidence.validator,p.primaryValidator.acceptedNames)) {
    errors.push(`Validator must be one of: ${p.primaryValidator.acceptedNames.join(", ")}.`);
  }
  if(String(evidence.version||"")!==p.primaryValidator.version) {
    errors.push(`Validator version must be exactly ${p.primaryValidator.version}.`);
  }
  if(String(evidence.rulesetId||"")!==p.primaryValidator.ruleset.id) {
    errors.push(`Ruleset id must be ${p.primaryValidator.ruleset.id}.`);
  }
  if(String(evidence.rulesetVersion||"")!==p.primaryValidator.ruleset.version) {
    errors.push(`Ruleset version must be exactly ${p.primaryValidator.ruleset.version}.`);
  }
  if(String(evidence.rulesetSha256||"").toLowerCase()!==p.primaryValidator.ruleset.sha256) {
    errors.push("Ruleset SHA-256 does not match the pinned production ruleset.");
  }
  if(!validSha(evidence.artifactSha256)) errors.push("Primary validator artifactSha256 must be a valid SHA-256.");
  return {ok:errors.length===0,errors,policyVersion:p.version};
}

export function validateSecondaryValidatorEvidence(evidence={}) {
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const errors=[];
  if(String(evidence.status||"").toUpperCase()!=="PASS") errors.push("Secondary validator evidence must be PASS.");
  if(String(evidence.profile||"").toUpperCase()!==p.profile.toUpperCase()) errors.push(`Profile must be ${p.profile}.`);
  if(!exactNameAllowed(evidence.validator,p.secondaryValidator.acceptedNames)) {
    errors.push(`Secondary validator must be one of: ${p.secondaryValidator.acceptedNames.join(", ")}.`);
  }
  if(String(evidence.version||"")!==p.secondaryValidator.version) {
    errors.push(`Secondary validator version must be exactly ${p.secondaryValidator.version}.`);
  }
  if(!validSha(evidence.artifactSha256)) errors.push("Secondary validator artifactSha256 must be a valid SHA-256.");
  if(!validSha(evidence.evidenceSha256)) errors.push("Secondary validator report evidenceSha256 must be a valid SHA-256.");
  return {ok:errors.length===0,errors,policyVersion:p.version};
}

export function validateRipQualificationEvidence(evidence={}, nowMs=Date.now()) {
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const errors=[];
  if(String(evidence.status||"").toUpperCase()!=="PASS") errors.push("Printer/RIP evidence must be PASS.");
  if(String(evidence.suite||"")!==p.ripQualification.suite) errors.push(`Output suite must be ${p.ripQualification.suite}.`);
  if(String(evidence.suiteVersion||"")!==p.ripQualification.suiteVersion) errors.push(`Output suite version must be ${p.ripQualification.suiteVersion}.`);
  if(String(evidence.conformanceLevel||"").toUpperCase()!==p.ripQualification.minimumConformance) {
    errors.push(`Conformance level must be ${p.ripQualification.minimumConformance}.`);
  }
  for(const key of ["printServiceProvider","ripProduct","ripVersion","outputDevice"]) {
    if(!String(evidence[key]||"").trim()) errors.push(`${key} is required.`);
  }
  if(evidence.actualProductionWorkflow!==true) errors.push("Evidence must come from the actual production workflow.");
  errors.push(...validateFreshTimestamp(evidence.testedAt,p.ripQualification.maxEvidenceAgeDays,nowMs,"testedAt"));
  if(!validSha(evidence.evidenceSha256)) errors.push("evidenceSha256 must be a valid SHA-256.");
  return {ok:errors.length===0,errors,policyVersion:p.version};
}

export function validateProductionTrialEvidence(evidence={}, nowMs=Date.now()) {
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const errors=[];
  if(String(evidence.status||"").toUpperCase()!=="PASS") errors.push("Production trial evidence must be PASS.");
  if(String(evidence.profile||"").toUpperCase()!==p.profile.toUpperCase()) errors.push(`Profile must be ${p.profile}.`);
  if(!validSha(evidence.artifactSha256)) errors.push("Production trial artifactSha256 must be a valid SHA-256.");
  for(const key of ["printServiceProvider","ripProduct","ripVersion","outputDevice"]) {
    if(!String(evidence[key]||"").trim()) errors.push(`${key} is required.`);
  }
  if(p.productionTrial.requireActualProductionWorkflow && evidence.actualProductionWorkflow!==true) {
    errors.push("Production trial must use the actual production workflow.");
  }
  if(p.productionTrial.requireNoPdfRepair && evidence.noPdfRepair!==true) {
    errors.push("Production trial must confirm that the PDF was not repaired or rewritten before RIP processing.");
  }
  errors.push(...validateFreshTimestamp(evidence.testedAt,p.productionTrial.maxEvidenceAgeDays,nowMs,"testedAt"));
  if(!validSha(evidence.evidenceSha256)) errors.push("evidenceSha256 must be a valid SHA-256.");
  return {ok:errors.length===0,errors,policyVersion:p.version};
}

export function summarizePdfxPromotionEvidence(input={}) {
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const nowMs=input.nowMs??Date.now();
  const primary=Array.isArray(input.primaryRuns)?input.primaryRuns:[];
  const secondary=Array.isArray(input.secondaryRuns)?input.secondaryRuns:[];
  const ripRuns=Array.isArray(input.ripEvidenceRuns)
    ? input.ripEvidenceRuns
    : (input.ripEvidence?[input.ripEvidence]:[]);
  const productionTrials=Array.isArray(input.productionTrials)?input.productionTrials:[];

  const trustedPrimary=primary.filter((x)=>validateTrustedPrimaryValidatorEvidence(x).ok);
  const trustedSecondary=secondary.filter((x)=>validateSecondaryValidatorEvidence(x).ok);
  const uniquePrimary=new Set(trustedPrimary.map((x)=>String(x.artifactSha256||"").toLowerCase()));
  const uniqueSecondary=new Set(trustedSecondary.map((x)=>String(x.artifactSha256||"").toLowerCase()));
  const sharedRegression=new Set([...uniquePrimary].filter((sha)=>uniqueSecondary.has(sha)));
  const validRip=ripRuns.filter((x)=>validateRipQualificationEvidence(x,nowMs).ok);
  const validTrials=productionTrials.filter((x)=>validateProductionTrialEvidence(x,nowMs).ok);
  const qualifiedTrials=validTrials.filter((x)=>sharedRegression.has(String(x.artifactSha256||"").toLowerCase()));

  const errors=[];
  if(uniquePrimary.size<p.regression.minimumUniqueArtifacts) {
    errors.push(`At least ${p.regression.minimumUniqueArtifacts} unique trusted primary validation artifacts are required.`);
  }
  if(uniqueSecondary.size<p.regression.minimumUniqueArtifacts) {
    errors.push(`At least ${p.regression.minimumUniqueArtifacts} unique trusted secondary validation artifacts are required.`);
  }
  if(p.regression.requireSameBytesAcrossValidators && sharedRegression.size<p.regression.minimumUniqueArtifacts) {
    errors.push(`At least ${p.regression.minimumUniqueArtifacts} identical artifact SHA-256 values must pass both validators.`);
  }
  if(validRip.length===0) errors.push("At least one current approved printer/RIP qualification is required.");
  if(validTrials.length===0) errors.push("At least one current approved end-to-end production trial is required.");
  if(p.productionTrial.requireQualifiedRegressionArtifact && qualifiedTrials.length===0) {
    errors.push("Production trial artifact must be one of the same-byte regression artifacts that passed both validators.");
  }

  return {
    ok:errors.length===0,
    errors,
    policyVersion:p.version,
    profile:p.profile,
    primaryUniqueArtifacts:uniquePrimary.size,
    secondaryUniqueArtifacts:uniqueSecondary.size,
    sharedRegressionArtifacts:sharedRegression.size,
    ripOk:validRip.length>0,
    productionTrialOk:qualifiedTrials.length>0,
    qualifyingRipEvidence:validRip.length,
    qualifyingProductionTrials:qualifiedTrials.length
  };
}
