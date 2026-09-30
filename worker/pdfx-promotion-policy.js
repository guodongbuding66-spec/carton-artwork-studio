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
  })
});

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function exactNameAllowed(value, allowed) {
  const n=norm(value);
  return allowed.some((x)=>norm(x)===n);
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
  const testedAt=Date.parse(String(evidence.testedAt||""));
  if(!Number.isFinite(testedAt)) errors.push("testedAt must be a valid timestamp.");
  else {
    const age=nowMs-testedAt;
    const max=p.ripQualification.maxEvidenceAgeDays*24*60*60*1000;
    if(age<0 || age>max) errors.push(`RIP evidence must be no older than ${p.ripQualification.maxEvidenceAgeDays} days.`);
  }
  if(!/^[0-9a-f]{64}$/i.test(String(evidence.evidenceSha256||""))) {
    errors.push("evidenceSha256 must be a 64-character SHA-256.");
  }
  return {ok:errors.length===0,errors,policyVersion:p.version};
}

export function summarizePdfxPromotionEvidence(input={}) {
  const p=PDFX_PRODUCTION_PROMOTION_POLICY;
  const primary=Array.isArray(input.primaryRuns)?input.primaryRuns:[];
  const secondary=Array.isArray(input.secondaryRuns)?input.secondaryRuns:[];
  const uniquePrimary=new Set(primary.map((x)=>String(x.artifactSha256||"").toLowerCase()).filter((x)=>/^[0-9a-f]{64}$/.test(x)));
  const uniqueSecondary=new Set(secondary.map((x)=>String(x.artifactSha256||"").toLowerCase()).filter((x)=>/^[0-9a-f]{64}$/.test(x)));
  const primaryChecks=primary.map(validateTrustedPrimaryValidatorEvidence);
  const secondaryChecks=secondary.map(validateSecondaryValidatorEvidence);
  const errors=[];
  if(uniquePrimary.size<p.regression.minimumUniqueArtifacts) {
    errors.push(`At least ${p.regression.minimumUniqueArtifacts} unique trusted primary validation artifacts are required.`);
  }
  if(primaryChecks.some((x)=>!x.ok)) errors.push("One or more primary validation runs are not trusted.");
  if(secondaryChecks.some((x)=>!x.ok)) errors.push("One or more secondary validation runs are not trusted.");
  if(p.regression.requireSameBytesAcrossValidators) {
    for(const sha of uniquePrimary) {
      if(!uniqueSecondary.has(sha)) errors.push(`Secondary validation is missing for artifact ${sha}.`);
    }
  }
  const rip=validateRipQualificationEvidence(input.ripEvidence||{});
  if(!rip.ok) errors.push(...rip.errors);
  return {
    ok:errors.length===0,
    errors,
    policyVersion:p.version,
    profile:p.profile,
    primaryUniqueArtifacts:uniquePrimary.size,
    secondaryUniqueArtifacts:uniqueSecondary.size,
    ripOk:rip.ok
  };
}
