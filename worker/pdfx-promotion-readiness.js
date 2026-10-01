import { PDFX_PRODUCTION_PROMOTION_POLICY, summarizePdfxPromotionEvidence } from "./pdfx-promotion-policy.js";
import { evidenceRowToPolicyInput } from "./pdfx-promotion-evidence.js";

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
      SELECT id,evidence_type AS evidenceType,profile,artifact_sha256 AS artifactSha256,
             validator_name AS validatorName,validator_version AS validatorVersion,
             ruleset_id AS rulesetId,ruleset_version AS rulesetVersion,ruleset_sha256 AS rulesetSha256,
             print_service_provider AS printServiceProvider,rip_product AS ripProduct,rip_version AS ripVersion,
             output_device AS outputDevice,suite,suite_version AS suiteVersion,
             conformance_level AS conformanceLevel,tested_at AS testedAt,
             actual_production_workflow AS actualProductionWorkflow,no_pdf_repair AS noPdfRepair,
             evidence_sha256 AS evidenceSha256,metadata_json AS metadataJson,
             status,approved_by AS approvedBy,approved_at AS approvedAt,created_at AS createdAt
      FROM pdfx_promotion_evidence
      WHERE status='APPROVED'
      ORDER BY created_at DESC
      LIMIT 500
    `).all()
  ]);

  const primaryRuns=(primaryResult.results||[]).map((row)=>{
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
      createdAt:row.createdAt
    };
  }).filter((x)=>
    x.trusted===true &&
    x.trustPolicyVersion===PDFX_PRODUCTION_PROMOTION_POLICY.version
  );

  const approved=(evidenceResult.results||[]).map((row)=>({
    row,
    policy:evidenceRowToPolicyInput(row)
  }));
  const secondaryRuns=approved.filter((x)=>x.row.evidenceType==="SECONDARY_VALIDATION").map((x)=>x.policy);
  const ripEvidenceRuns=approved.filter((x)=>x.row.evidenceType==="RIP_QUALIFICATION").map((x)=>x.policy);
  const productionTrials=approved.filter((x)=>x.row.evidenceType==="PRODUCTION_TRIAL").map((x)=>x.policy);

  const summary=summarizePdfxPromotionEvidence({
    primaryRuns,
    secondaryRuns,
    ripEvidenceRuns,
    productionTrials,
    nowMs
  });

  return {
    ...summary,
    evidenceCounts:{
      trustedPrimaryRuns:primaryRuns.length,
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
