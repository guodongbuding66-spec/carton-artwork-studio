import { PDFX_PRODUCTION_PROMOTION_POLICY, summarizePdfxPromotionEvidence } from "./pdfx-promotion-policy.js";
import { evidenceRowToPolicyInput } from "./pdfx-promotion-evidence.js";
import { verifyQualificationContextFingerprint } from "./production-qualification-context.js";

function parseJson(value) {
  try{return JSON.parse(value||"{}");}
  catch{return {};}
}

export async function collectPdfxPromotionReadiness(db, nowMs=Date.now()) {
  const [primaryResult,evidenceResult]=await Promise.all([
    db.prepare(`
      SELECT id,profile,artifact_sha256 AS artifactSha256,validator_name AS validator,
             validator_version AS version,status,report_json AS reportJson,created_at AS createdAt
      FROM pdfx_validation_runs
      WHERE profile='PDF/X-4' AND status='PASS'
      ORDER BY created_at DESC
      LIMIT 250
    `).all(),
    db.prepare(`
      SELECT id,evidence_type AS evidenceType,profile,policy_version AS policyVersion,artifact_sha256 AS artifactSha256,
             validator_name AS validatorName,validator_version AS validatorVersion,
             ruleset_id AS rulesetId,ruleset_version AS rulesetVersion,ruleset_sha256 AS rulesetSha256,
             print_service_provider AS printServiceProvider,rip_product AS ripProduct,rip_version AS ripVersion,
             output_device AS outputDevice,suite,suite_version AS suiteVersion,
             conformance_level AS conformanceLevel,tested_at AS testedAt,
             actual_production_workflow AS actualProductionWorkflow,no_pdf_repair AS noPdfRepair,
             evidence_sha256 AS evidenceSha256,metadata_json AS metadataJson,
             status,approved_by AS approvedBy,approved_at AS approvedAt,created_at AS createdAt
      FROM pdfx_promotion_evidence
      WHERE status='APPROVED' AND policy_version=?
      ORDER BY created_at DESC
      LIMIT 500
    `).bind(PDFX_PRODUCTION_PROMOTION_POLICY.version).all()
  ]);

  const primaryCandidates=(primaryResult.results||[]).map((row)=>{
    const report=parseJson(row.reportJson);
    const ruleset=report.ruleset||{};
    return {
      id:row.id,
      status:row.status,
      profile:row.profile,
      artifactSha256:String(row.artifactSha256||"").toLowerCase(),
      validator:row.validator,
      version:row.version,
      rulesetId:ruleset.id||report.rulesetId||"",
      rulesetVersion:ruleset.version||report.rulesetVersion||"",
      rulesetSha256:String(ruleset.sha256||report.rulesetSha256||"").toLowerCase(),
      trusted:report.trusted===true,
      trustPolicyVersion:report.trustPolicyVersion||null,
      qualificationContext:report.qualificationContext||null,
      qualificationFingerprint:String(report.qualificationFingerprint||"").toLowerCase(),
      createdAt:row.createdAt
    };
  }).filter((x)=>
    x.trusted===true &&
    x.trustPolicyVersion===PDFX_PRODUCTION_PROMOTION_POLICY.version
  );

  const verifiedPrimary=(await Promise.all(primaryCandidates.map(async(x)=>{
    if(!x.qualificationContext||!x.qualificationFingerprint) return {...x,qualificationOk:false,qualificationErrors:["Qualification context is missing."]};
    const verification=await verifyQualificationContextFingerprint(x.qualificationContext,x.qualificationFingerprint);
    return {...x,qualificationOk:verification.ok,qualificationErrors:verification.errors,qualificationContext:verification.context};
  }))).filter(x=>x.qualificationOk);

  const approved=(evidenceResult.results||[]).map((row)=>({
    row,
    policy:evidenceRowToPolicyInput(row)
  }));
  const secondaryRuns=approved.filter((x)=>x.row.evidenceType==="SECONDARY_VALIDATION").map((x)=>x.policy);
  const ripEvidenceRuns=approved.filter((x)=>x.row.evidenceType==="RIP_QUALIFICATION").map((x)=>x.policy);
  const productionTrials=approved.filter((x)=>x.row.evidenceType==="PRODUCTION_TRIAL").map((x)=>x.policy);

  const contextGroups=new Map();
  for(const run of verifiedPrimary){
    const key=run.qualificationFingerprint;
    if(!contextGroups.has(key)) contextGroups.set(key,[]);
    contextGroups.get(key).push(run);
  }

  const contextResults=[...contextGroups.entries()].map(([fingerprint,runs])=>{
    const summary=summarizePdfxPromotionEvidence({
      primaryRuns:runs,
      secondaryRuns,
      ripEvidenceRuns,
      productionTrials,
      nowMs
    });
    return {
      fingerprint,
      context:runs[0]?.qualificationContext||null,
      primaryRuns:runs,
      summary
    };
  }).sort((a,b)=>
    Number(b.summary.ok)-Number(a.summary.ok) ||
    b.summary.sharedRegressionArtifacts-a.summary.sharedRegressionArtifacts ||
    b.summary.primaryUniqueArtifacts-a.summary.primaryUniqueArtifacts
  );

  const selected=contextResults[0]||{
    fingerprint:null,
    context:null,
    primaryRuns:[],
    summary:summarizePdfxPromotionEvidence({
      primaryRuns:[],
      secondaryRuns,
      ripEvidenceRuns,
      productionTrials,
      nowMs
    })
  };
  const summary={...selected.summary};
  if(primaryCandidates.length>0&&verifiedPrimary.length===0){
    summary.errors=[
      "Trusted primary validation runs exist, but none carry a current valid Production Qualification Context fingerprint.",
      ...summary.errors
    ];
    summary.ok=false;
  }
  if(contextGroups.size>1&&!summary.ok){
    summary.errors=[
      `Primary validation evidence is split across ${contextGroups.size} qualification contexts; five same-context artifacts are required.`,
      ...summary.errors
    ];
  }

  return {
    ...summary,
    qualifyingContextFingerprint:summary.ok?selected.fingerprint:null,
    candidateContextFingerprint:selected.fingerprint,
    qualificationContext:selected.context,
    qualificationContexts:contextResults.map((x)=>({
      fingerprint:x.fingerprint,
      primaryUniqueArtifacts:x.summary.primaryUniqueArtifacts,
      sharedRegressionArtifacts:x.summary.sharedRegressionArtifacts,
      ok:x.summary.ok,
      context:x.context
    })),
    evidenceCounts:{
      trustedPrimaryRuns:primaryCandidates.length,
      currentContextPrimaryRuns:verifiedPrimary.length,
      approvedSecondaryValidation:secondaryRuns.length,
      approvedRipQualification:ripEvidenceRuns.length,
      approvedProductionTrial:productionTrials.length
    },
    policy:{
      version:PDFX_PRODUCTION_PROMOTION_POLICY.version,
      profile:PDFX_PRODUCTION_PROMOTION_POLICY.profile,
      primaryValidatorVersion:PDFX_PRODUCTION_PROMOTION_POLICY.primaryValidator.version,
      secondaryValidatorVersion:PDFX_PRODUCTION_PROMOTION_POLICY.secondaryValidator.version,
      minimumUniqueArtifacts:PDFX_PRODUCTION_PROMOTION_POLICY.regression.minimumUniqueArtifacts
    }
  };
}
