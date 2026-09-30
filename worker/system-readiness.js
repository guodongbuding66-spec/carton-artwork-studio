export const EXPECTED_LATEST_MIGRATION = "0008_pdfx_validation_runs.sql";
export const R2_PROBE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function gate(id, label, ok, detail, category="STAGING", blocking=true) {
  return { id, label, ok:Boolean(ok), status:ok?"PASS":"FAIL", detail, category, blocking };
}

function isFreshProbe(probe, nowMs=Date.now(), maxAgeMs=R2_PROBE_MAX_AGE_MS) {
  if (!probe || String(probe.status||"").toUpperCase() !== "PASS" || !probe.createdAt) return false;
  const t = Date.parse(probe.createdAt);
  return Number.isFinite(t) && nowMs - t >= 0 && nowMs - t <= maxAgeMs;
}

export function buildSystemReadiness(input = {}) {
  const counts=input.counts||{};
  const prod=input.productionReadiness||{ready:false,gates:[]};
  const roleUsers=input.roleUsers||{};
  const operatorEmails=new Set((roleUsers.OPERATOR||[]).map((x)=>String(x).toLowerCase()));
  const reviewerEmails=new Set((roleUsers.REVIEWER||[]).map((x)=>String(x).toLowerCase()));
  const distinctFourEyes=
    operatorEmails.size>0 &&
    reviewerEmails.size>0 &&
    new Set([...operatorEmails,...reviewerEmails]).size>=2;

  const stagingChecks=[
    gate("AUTH_BYPASS_DISABLED","Development auth bypass disabled",!input.authBypassEnabled,
      input.authBypassEnabled?"AUTH_BYPASS=1 must never be used in staging/production.":"AUTH_BYPASS is disabled."),
    gate("ACCESS_IDENTITY","Cloudflare Access identity",input.identitySource==="cloudflare-access",
      input.identitySource==="cloudflare-access"?"Current request is authenticated by Cloudflare Access.":`Identity source is ${input.identitySource||"missing"}.`),
    gate("D1_BOUND","D1 binding",input.bindings?.d1===true,
      input.bindings?.d1?"DB binding is available.":"DB binding is missing."),
    gate("SCHEMA_CURRENT","D1 migration/schema current",
      input.latestMigration===EXPECTED_LATEST_MIGRATION && input.schemaOk===true,
      `Latest migration: ${input.latestMigration||"unknown"}; expected: ${EXPECTED_LATEST_MIGRATION}.`),
    gate("R2_BOUND","R2 binding",input.bindings?.r2===true,
      input.bindings?.r2?"ARTWORK_FILES binding is available.":"ARTWORK_FILES binding is missing."),
    gate("R2_DEEP_PROBE","R2 write/read/delete probe",isFreshProbe(input.lastR2Probe,input.nowMs),
      isFreshProbe(input.lastR2Probe,input.nowMs)
        ? `Last successful probe: ${input.lastR2Probe.createdAt}.`
        : "No successful R2 deep probe within the last 24 hours."),
    gate("ASSETS_BOUND","Static assets binding",input.bindings?.assets===true,
      input.bindings?.assets?"ASSETS binding is available.":"ASSETS binding is missing."),
    gate("BOOTSTRAP_REMOVED","Bootstrap admin removed",!input.bootstrapAdminConfigured,
      input.bootstrapAdminConfigured?"BOOTSTRAP_ADMIN_EMAIL is still configured.":"Bootstrap admin override is removed."),
    gate("APPROVED_TEMPLATE","Approved template present",Number(counts.approvedTemplates||0)>0,
      `${Number(counts.approvedTemplates||0)} approved template version(s).`),
    gate("ACTIVE_FACTORY","Active factory master present",Number(counts.activeFactories||0)>0,
      `${Number(counts.activeFactories||0)} active factory master record(s).`),
    gate("OPERATOR_PRESENT","Operator identity present",operatorEmails.size>0,
      `${operatorEmails.size} active OPERATOR identity/identities.`),
    gate("REVIEWER_PRESENT","Reviewer identity present",reviewerEmails.size>0,
      `${reviewerEmails.size} active REVIEWER identity/identities.`),
    gate("FOUR_EYES_IDENTITIES","Four-eyes identities are separable",distinctFourEyes,
      distinctFourEyes?"Operator and Reviewer duties can be performed by different identities.":"At least two distinct active identities are required across Operator/Reviewer duties."),
    gate("PRODUCTION_POLICY_ROWS","Production policy records present",Number(counts.productionPolicies||0)===4,
      `${Number(counts.productionPolicies||0)} of 4 required production policies exist.`)
  ];

  const stagingReady=stagingChecks.filter((x)=>x.blocking).every((x)=>x.ok);

  const productionChecks=[
    gate("STAGING_READY","Staging release gate",stagingReady,
      stagingReady?"All staging gates pass.":"One or more staging gates are blocked.","PRODUCTION"),
    gate("APPROVED_FONT_ASSET","Approved font asset",Number(counts.approvedFonts||0)>0,
      `${Number(counts.approvedFonts||0)} approved FONT asset(s).`,"PRODUCTION"),
    gate("APPROVED_ICC_ASSET","Approved ICC output profile",Number(counts.approvedIccProfiles||0)>0,
      `${Number(counts.approvedIccProfiles||0)} approved ICC_PROFILE asset(s).`,"PRODUCTION"),
    gate("PDFX_VALIDATOR_CONFIGURED","Trusted PDF/X validator bridge configured",input.pdfxValidatorConfigured===true,
      input.pdfxValidatorConfigured?"Trusted validator URL + bearer secret are configured; response identity/ruleset is still verified per v2 policy.":"Trusted validator bridge is incomplete: HTTPS URL and PDFX_VALIDATOR_TOKEN are required.","PRODUCTION"),
    ...((prod.gates||[]).map((x)=>gate(
      x.code,
      x.displayName||x.code,
      x.approved===true && x.valid===true,
      (x.errors||[]).join(" · ") || `Policy status: ${x.status||"unknown"}.`,
      "PRODUCTION"
    )))
  ];
  const productionReady=stagingReady && prod.ready===true && productionChecks.every((x)=>x.ok);

  return {
    version:1,
    generatedAt:new Date(input.nowMs||Date.now()).toISOString(),
    status:stagingReady?"STAGING_READY":"STAGING_BLOCKED",
    stagingReady,
    productionStatus:productionReady?"PRODUCTION_READY":"PRODUCTION_BLOCKED",
    productionReady,
    stagingChecks,
    productionChecks,
    rendererCapabilities:prod.rendererCapabilities||null,
    summary:{
      stagingPassed:stagingChecks.filter((x)=>x.ok).length,
      stagingTotal:stagingChecks.length,
      productionPassed:productionChecks.filter((x)=>x.ok).length,
      productionTotal:productionChecks.length
    }
  };
}

export { isFreshProbe };
