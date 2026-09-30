import { ROLES, can, permissionForRequest, resolveIdentity } from "./auth.js";
import { parseTemplateJson, validateTemplateJson } from "./template.js";
import { parsePolicyConfig, validateProductionPolicy, summarizeProductionReadiness } from "./readiness.js";

const json = (data, init = {}) => new Response(JSON.stringify(data, null, 2), {
  ...init,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(init.headers || {})
  }
});

function err(status, code, message, detail) {
  return json({ error: code, message, detail }, { status });
}

async function bodyJson(request) {
  try { return await request.json(); }
  catch { throw new Error("INVALID_JSON"); }
}

async function audit(env, identity, objectType, objectId, action, options = {}) {
  await env.DB.prepare(`
    INSERT INTO audit_logs(id,actor,object_type,object_id,action,old_value_json,new_value_json,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(),
    identity?.email || "system",
    objectType,
    objectId || null,
    action,
    options.oldValue == null ? null : JSON.stringify(options.oldValue),
    options.newValue == null ? null : JSON.stringify(options.newValue),
    options.reason || null
  ).run();
}

async function securityEvent(env, identity, eventType, request, detail = {}) {
  try {
    const url = new URL(request.url);
    await env.DB.prepare(`
      INSERT INTO security_events(id,actor_email,event_type,method,path,detail_json,created_at)
      VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(
      crypto.randomUUID(),
      identity?.email || null,
      eventType,
      request.method,
      url.pathname,
      JSON.stringify(detail)
    ).run();
  } catch {
    // Security logging must never replace the primary response.
  }
}

function publicIdentity(identity) {
  return {
    id: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    status: identity.status,
    roles: identity.roles,
    source: identity.source,
    permissions: {
      artworkWrite: can(identity, "ARTWORK_WRITE"),
      review: can(identity, "REVIEW"),
      auditRead: can(identity, "AUDIT_READ"),
      commentWrite: can(identity, "COMMENT_WRITE"),
      batchWrite: can(identity, "BATCH_WRITE"),
      templateWrite: can(identity, "TEMPLATE_WRITE"),
      templateApprove: can(identity, "TEMPLATE_APPROVE"),
      referenceWrite: can(identity, "REFERENCE_WRITE"),
      productionPolicyWrite: can(identity, "PRODUCTION_POLICY_WRITE"),
      productionPolicyApprove: can(identity, "PRODUCTION_POLICY_APPROVE"),
      productionExport: can(identity, "EXPORT_PRODUCTION"),
      admin: can(identity, "ADMIN")
    }
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "carton-artwork-studio",
        version: "1.0.0",
        runtime: "cloudflare-workers",
        auth: {
          provider: "cloudflare-access",
          bypassEnabled: String(env.AUTH_BYPASS || "") === "1"
        },
        bindings: {
          d1: Boolean(env.DB),
          r2: Boolean(env.ARTWORK_FILES),
          assets: Boolean(env.ASSETS)
        },
        time: new Date().toISOString()
      });
    }

    if (!env.DB) return err(503, "DATABASE_NOT_BOUND", "Cloudflare D1 binding DB is not configured.");

    let identity;
    try {
      identity = await resolveIdentity(request, env);
    } catch (e) {
      console.error("identity", e);
      return err(500, "IDENTITY_ERROR", "Unable to resolve authenticated identity.");
    }

    if (!identity) {
      await securityEvent(env, null, "UNAUTHENTICATED_API_REQUEST", request);
      return err(401, "AUTH_REQUIRED", "Cloudflare Access authentication is required.");
    }

    if (String(identity.status).toUpperCase() === "DISABLED") {
      await securityEvent(env, identity, "DISABLED_USER_REQUEST", request);
      return err(403, "USER_DISABLED", "This user account is disabled.");
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      return json({ data: publicIdentity(identity) });
    }

    const permission = permissionForRequest(request.method, url.pathname);
    if (permission && !can(identity, permission)) {
      await securityEvent(env, identity, "RBAC_DENIED", request, { permission, roles: identity.roles });
      return err(403, "FORBIDDEN", `Permission ${permission} is required.`);
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/factories") {
        const includeAll=url.searchParams.get("include")==="all"&&can(identity,"ADMIN");
        const { results } = await env.DB.prepare(`
          SELECT id,name,crn,country,effective_at AS effectiveAt,status
          FROM factories
          ${includeAll?"":"WHERE status='ACTIVE'"}
          ORDER BY name
        `).all();
        return json({ data: results });
      }

      const factoryImpactMatch=/^\/api\/factories\/([^/]+)\/impact$/.exec(url.pathname);
      if(request.method==="GET"&&factoryImpactMatch){
        const id=factoryImpactMatch[1];
        const factory=await env.DB.prepare(
          "SELECT id,name,crn,country,effective_at AS effectiveAt,status FROM factories WHERE id=?"
        ).bind(id).first();
        if(!factory)return err(404,"NOT_FOUND","Factory not found.");

        const current=await env.DB.prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status='DRAFT' THEN 1 ELSE 0 END) AS draft,
            SUM(CASE WHEN status='IN_REVIEW' THEN 1 ELSE 0 END) AS inReview,
            SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) AS rejected
          FROM artworks WHERE factory_id=?
        `).bind(id).first();

        const unproduced=await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM artworks a
          WHERE a.factory_id=? AND a.status='APPROVED'
            AND NOT EXISTS (
              SELECT 1 FROM exports e
              WHERE e.artwork_id=a.id AND e.revision=a.current_revision AND e.kind='PRODUCTION_BUNDLE'
            )
        `).bind(id).first();

        const revisions=await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM artwork_revisions ar
          JOIN artworks a ON a.id=ar.artwork_id
          WHERE a.factory_id=?
        `).bind(id).first();

        return json({data:{
          factory,
          currentArtworks:{
            total:Number(current?.total||0),
            draft:Number(current?.draft||0),
            inReview:Number(current?.inReview||0),
            approved:Number(current?.approved||0),
            rejected:Number(current?.rejected||0),
            approvedUnproduced:Number(unproduced?.count||0)
          },
          revisionCount:Number(revisions?.count||0),
          note:"Historical Revision snapshots remain frozen; changing Factory Master does not rewrite them."
        }});
      }

      const factoryMatch=/^\/api\/factories\/([^/]+)$/.exec(url.pathname);
      if(request.method==="PATCH"&&factoryMatch){
        const id=factoryMatch[1],b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM factories WHERE id=?").bind(id).first();
        if(!current)return err(404,"NOT_FOUND","Factory not found.");
        const next={
          name:String(b.name??current.name).trim(),
          crn:String(b.crn??current.crn).trim(),
          country:String(b.country??current.country).trim(),
          effectiveAt:b.effectiveAt??current.effective_at,
          status:String(b.status??current.status).toUpperCase()
        };
        if(!next.name||!next.crn||!next.country)return err(400,"INVALID_FACTORY","name, crn and country are required.");
        await env.DB.prepare(`
          UPDATE factories
          SET name=?,crn=?,country=?,effective_at=?,status=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).bind(next.name,next.crn,next.country,next.effectiveAt,next.status,id).run();
        await audit(env,identity,"FACTORY",id,"UPDATE_MASTER",{
          oldValue:{name:current.name,crn:current.crn,country:current.country,effectiveAt:current.effective_at,status:current.status},
          newValue:next,
          reason:b.reason||"Factory master data update"
        });
        return json({data:{id,...next}});
      }

      if(request.method==="GET"&&url.pathname==="/api/reference-records"){
        const namespace=String(url.searchParams.get("namespace")||"").toUpperCase();
        const q=String(url.searchParams.get("q")||"").trim();
        const where=[],binds=[];
        if(namespace){where.push("namespace=?");binds.push(namespace);}
        if(q){
          where.push("(code LIKE ? OR display_name LIKE ?)");
          const like=`%${q}%`;binds.push(like,like);
        }
        const sql=`
          SELECT id,namespace,code,display_name AS displayName,data_json AS dataJson,
                 effective_at AS effectiveAt,status,created_by AS createdBy,updated_by AS updatedBy,
                 created_at AS createdAt,updated_at AS updatedAt
          FROM reference_records
          ${where.length?`WHERE ${where.join(" AND ")}`:""}
          ORDER BY namespace,display_name LIMIT 500
        `;
        const {results}=await env.DB.prepare(sql).bind(...binds).all();
        return json({data:results.map((x)=>({...x,data:x.dataJson?JSON.parse(x.dataJson):{}}))});
      }

      if(request.method==="POST"&&url.pathname==="/api/reference-records"){
        const b=await bodyJson(request);
        const namespace=String(b.namespace||"").toUpperCase();
        if(!["CUSTOMER","PRODUCT","COUNTRY","SHARED"].includes(namespace)){
          return err(400,"INVALID_NAMESPACE","namespace must be CUSTOMER, PRODUCT, COUNTRY or SHARED.");
        }
        const code=String(b.code||"").trim().toUpperCase().replace(/[^A-Z0-9_.\-]+/g,"_");
        const displayName=String(b.displayName||"").trim();
        if(!code||!displayName)return err(400,"INVALID_REFERENCE_RECORD","code and displayName are required.");
        const id=crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO reference_records(
            id,namespace,code,display_name,data_json,effective_at,status,created_by,updated_by,created_at,updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(
          id,namespace,code,displayName,JSON.stringify(b.data||{}),b.effectiveAt||null,
          String(b.status||"ACTIVE").toUpperCase(),identity.email,identity.email
        ).run();
        await audit(env,identity,"REFERENCE_RECORD",id,"CREATE",{newValue:{namespace,code,displayName}});
        return json({data:{id,namespace,code,displayName}},{status:201});
      }

      const referenceMatch=/^\/api\/reference-records\/([^/]+)$/.exec(url.pathname);
      if(request.method==="PATCH"&&referenceMatch){
        const id=referenceMatch[1],b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM reference_records WHERE id=?").bind(id).first();
        if(!current)return err(404,"NOT_FOUND","Reference record not found.");
        const next={
          displayName:String(b.displayName??current.display_name).trim(),
          data:b.data===undefined?JSON.parse(current.data_json||"{}"):b.data,
          effectiveAt:b.effectiveAt===undefined?current.effective_at:(b.effectiveAt||null),
          status:String(b.status??current.status).toUpperCase()
        };
        if(!next.displayName)return err(400,"INVALID_REFERENCE_RECORD","displayName is required.");
        await env.DB.prepare(`
          UPDATE reference_records
          SET display_name=?,data_json=?,effective_at=?,status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).bind(next.displayName,JSON.stringify(next.data||{}),next.effectiveAt,next.status,identity.email,id).run();
        await audit(env,identity,"REFERENCE_RECORD",id,"UPDATE",{
          oldValue:{displayName:current.display_name,status:current.status},
          newValue:{displayName:next.displayName,status:next.status},
          reason:b.reason||"Reference master update"
        });
        return json({data:{id,...next}});
      }

      if(request.method==="GET"&&url.pathname==="/api/production-policies"){
        const {results}=await env.DB.prepare(`
          SELECT p.code,p.display_name AS displayName,p.status,p.config_json AS configJson,p.notes,
                 p.updated_by AS updatedBy,p.submitted_by AS submittedBy,p.submitted_at AS submittedAt,
                 p.approved_by AS approvedBy,p.approved_at AS approvedAt,p.updated_at AS updatedAt,
                 (SELECT a.decision FROM production_policy_approvals a WHERE a.policy_code=p.code ORDER BY a.created_at DESC LIMIT 1) AS lastDecision,
                 (SELECT a.comment FROM production_policy_approvals a WHERE a.policy_code=p.code ORDER BY a.created_at DESC LIMIT 1) AS lastComment
          FROM production_policies p ORDER BY p.code
        `).all();
        return json({data:results.map((x)=>({...x,config:x.configJson?JSON.parse(x.configJson):{}}))});
      }

      if(request.method==="GET"&&url.pathname==="/api/production-readiness"){
        const {results}=await env.DB.prepare(`
          SELECT code,display_name AS displayName,status,config_json AS configJson
          FROM production_policies ORDER BY code
        `).all();
        return json({data:summarizeProductionReadiness(results)});
      }

      const policyMatch=/^\/api\/production-policies\/([^/]+)$/.exec(url.pathname);
      if(request.method==="PATCH"&&policyMatch){
        const code=decodeURIComponent(policyMatch[1]).toUpperCase(),b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM production_policies WHERE code=?").bind(code).first();
        if(!current)return err(404,"NOT_FOUND","Production policy not found.");
        if(!["DRAFT","REJECTED"].includes(String(current.status).toUpperCase())){
          return err(409,"POLICY_IMMUTABLE","Only DRAFT or REJECTED policies can be edited.");
        }
        let config=current.config_json||"{}";
        if(b.config!==undefined){
          try{config=JSON.stringify(parsePolicyConfig(b.config));}
          catch{return err(400,"POLICY_CONFIG_INVALID","Policy config must be valid JSON.");}
        }
        const notes=b.notes===undefined?current.notes:String(b.notes||"");
        await env.DB.prepare(`
          UPDATE production_policies
          SET status='DRAFT',config_json=?,notes=?,updated_by=?,submitted_by=NULL,submitted_at=NULL,
              approved_by=NULL,approved_at=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE code=?
        `).bind(config,notes,identity.email,code).run();
        await audit(env,identity,"PRODUCTION_POLICY",code,"UPDATE_DRAFT",{
          oldValue:{status:current.status,config:current.config_json},
          newValue:{status:"DRAFT",config},
          reason:b.reason||"Production policy update"
        });
        return json({data:{code,status:"DRAFT"}});
      }

      const policySubmitMatch=/^\/api\/production-policies\/([^/]+)\/submit$/.exec(url.pathname);
      if(request.method==="POST"&&policySubmitMatch){
        const code=decodeURIComponent(policySubmitMatch[1]).toUpperCase(),b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM production_policies WHERE code=?").bind(code).first();
        if(!current)return err(404,"NOT_FOUND","Production policy not found.");
        if(!["DRAFT","REJECTED"].includes(String(current.status).toUpperCase())){
          return err(409,"POLICY_SUBMIT_STATE","Only DRAFT or REJECTED policies can be submitted.");
        }
        const validation=validateProductionPolicy(code,current.config_json);
        if(!validation.ok)return err(409,"POLICY_VALIDATION_FAILED","Production policy validation failed.",validation.errors);
        await env.DB.prepare(`
          UPDATE production_policies
          SET status='SUBMITTED',submitted_by=?,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
          WHERE code=?
        `).bind(identity.email,code).run();
        await audit(env,identity,"PRODUCTION_POLICY",code,"SUBMIT_REVIEW",{
          newValue:{status:"SUBMITTED"},
          reason:b.reason||"Production policy submitted for approval"
        });
        return json({data:{code,status:"SUBMITTED",submittedBy:identity.email}},{status:201});
      }

      const policyApprovalMatch=/^\/api\/production-policies\/([^/]+)\/approval$/.exec(url.pathname);
      if(request.method==="POST"&&policyApprovalMatch){
        const code=decodeURIComponent(policyApprovalMatch[1]).toUpperCase(),b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM production_policies WHERE code=?").bind(code).first();
        if(!current)return err(404,"NOT_FOUND","Production policy not found.");
        if(String(current.status).toUpperCase()!=="SUBMITTED"){
          return err(409,"POLICY_NOT_SUBMITTED","Only SUBMITTED policies can be approved or rejected.");
        }
        if(String(current.submitted_by||"").toLowerCase()===identity.email.toLowerCase()){
          await securityEvent(env,identity,"POLICY_SELF_APPROVAL_BLOCKED",request,{code});
          return err(409,"FOUR_EYES_REQUIRED","The policy submitter cannot approve or reject the same policy.");
        }
        const decision=String(b.decision||"").toUpperCase();
        if(!["APPROVE","REJECT"].includes(decision))return err(400,"INVALID_DECISION","decision must be APPROVE or REJECT.");
        if(decision==="APPROVE"){
          const validation=validateProductionPolicy(code,current.config_json);
          if(!validation.ok)return err(409,"POLICY_VALIDATION_FAILED","Production policy validation failed.",validation.errors);
        }
        const approvalId=crypto.randomUUID(),next=decision==="APPROVE"?"APPROVED":"REJECTED";
        const stmts=[env.DB.prepare(`
          INSERT INTO production_policy_approvals(id,policy_code,reviewer,decision,comment,created_at)
          VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(approvalId,code,identity.email,decision,b.comment||"")];
        if(decision==="APPROVE"){
          stmts.push(env.DB.prepare(`
            UPDATE production_policies
            SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
            WHERE code=?
          `).bind(identity.email,code));
        }else{
          stmts.push(env.DB.prepare(`
            UPDATE production_policies
            SET status='REJECTED',approved_by=NULL,approved_at=NULL,updated_at=CURRENT_TIMESTAMP
            WHERE code=?
          `).bind(code));
        }
        await env.DB.batch(stmts);
        await audit(env,identity,"PRODUCTION_POLICY",code,decision,{
          newValue:{status:next,reviewer:identity.email},
          reason:b.comment||"Production policy review decision"
        });
        return json({data:{code,status:next,reviewer:identity.email}},{status:201});
      }

      if (request.method === "GET" && url.pathname === "/api/templates") {
        const { results } = await env.DB.prepare(`
          SELECT t.id,t.code,t.display_name AS displayName,
                 tv.id AS versionId,tv.version,tv.status,tv.effective_at AS effectiveAt,
                 tv.preflight_profile_code AS preflightProfile
          FROM templates t
          LEFT JOIN template_versions tv ON tv.template_id=t.id
          WHERE tv.status IS NULL OR tv.status <> 'ARCHIVED'
          ORDER BY t.code,tv.created_at DESC
        `).all();
        return json({ data: results });
      }

      if (request.method === "POST" && url.pathname === "/api/templates") {
        const b=await bodyJson(request);
        const code=String(b.code||"").trim().toUpperCase().replace(/[^A-Z0-9_\-]+/g,"_");
        const displayName=String(b.displayName||"").trim();
        if(!code||!displayName)return err(400,"INVALID_TEMPLATE","code and displayName are required.");
        const id=crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO templates(id,code,display_name,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)"
        ).bind(id,code,displayName).run();
        await audit(env,identity,"TEMPLATE",id,"CREATE",{newValue:{code,displayName}});
        return json({data:{id,code,displayName}},{status:201});
      }

      const templateVersionsMatch=/^\/api\/templates\/([^/]+)\/versions$/.exec(url.pathname);
      if(request.method==="GET"&&templateVersionsMatch){
        const templateId=templateVersionsMatch[1];
        const template=await env.DB.prepare(
          "SELECT id,code,display_name AS displayName,created_at AS createdAt FROM templates WHERE id=?"
        ).bind(templateId).first();
        if(!template)return err(404,"NOT_FOUND","Template not found.");
        const {results}=await env.DB.prepare(`
          SELECT tv.id,tv.template_id AS templateId,tv.version,tv.status,
                 tv.effective_at AS effectiveAt,tv.preflight_profile_code AS preflightProfile,
                 tv.template_json AS templateJson,tv.notes,tv.created_by AS createdBy,
                 tv.submitted_by AS submittedBy,tv.submitted_at AS submittedAt,
                 tv.approved_by AS approvedBy,tv.approved_at AS approvedAt,
                 tv.created_at AS createdAt,tv.updated_at AS updatedAt,
                 (SELECT ta.decision FROM template_approvals ta WHERE ta.template_version_id=tv.id ORDER BY ta.created_at DESC LIMIT 1) AS lastDecision,
                 (SELECT ta.comment FROM template_approvals ta WHERE ta.template_version_id=tv.id ORDER BY ta.created_at DESC LIMIT 1) AS lastComment
          FROM template_versions tv
          WHERE tv.template_id=?
          ORDER BY tv.created_at DESC
        `).bind(templateId).all();
        return json({data:{template,versions:results}});
      }

      if(request.method==="POST"&&templateVersionsMatch){
        const templateId=templateVersionsMatch[1],b=await bodyJson(request);
        const template=await env.DB.prepare("SELECT id,code FROM templates WHERE id=?").bind(templateId).first();
        if(!template)return err(404,"NOT_FOUND","Template not found.");
        const version=String(b.version||"").trim();
        if(!version)return err(400,"VERSION_REQUIRED","version is required.");

        let base=null;
        if(b.baseVersionId){
          base=await env.DB.prepare("SELECT * FROM template_versions WHERE id=? AND template_id=?")
            .bind(b.baseVersionId,templateId).first();
          if(!base)return err(404,"BASE_VERSION_NOT_FOUND","Base template version not found.");
        }else{
          base=await env.DB.prepare(`
            SELECT * FROM template_versions
            WHERE template_id=? AND status='APPROVED'
            ORDER BY approved_at DESC,created_at DESC LIMIT 1
          `).bind(templateId).first();
        }

        const id=crypto.randomUUID();
        const templateJson=base?.template_json||JSON.stringify({
          schemaVersion:1,
          templateCode:template.code,
          geometry:{type:"side-seal-parametric",units:"mm"},
          print:{colors:["K"],fontPolicy:"Arial-or-similar"},
          codeBlock:{profiles:["250x80","200x64"],locked:true},
          rules:{multiPackageNotice:true,crnPlacements:2,originFromFactory:true}
        });
        await env.DB.prepare(`
          INSERT INTO template_versions(
            id,template_id,version,status,effective_at,preflight_profile_code,template_json,
            notes,created_by,created_at,updated_at
          ) VALUES(?,?,?,'DRAFT',?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(
          id,templateId,version,b.effectiveAt||null,
          b.preflightProfile||base?.preflight_profile_code||"US_SIDE_SEAL_K_ONLY_V1",
          templateJson,b.notes||"",identity.email
        ).run();
        await audit(env,identity,"TEMPLATE_VERSION",id,"CREATE_DRAFT",{
          newValue:{templateId,version,baseVersionId:base?.id||null}
        });
        return json({data:{id,templateId,version,status:"DRAFT"}},{status:201});
      }

      const templateVersionMatch=/^\/api\/template-versions\/([^/]+)$/.exec(url.pathname);
      if(request.method==="PATCH"&&templateVersionMatch){
        const id=templateVersionMatch[1],b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM template_versions WHERE id=?").bind(id).first();
        if(!current)return err(404,"NOT_FOUND","Template version not found.");
        if(!["DRAFT","REJECTED"].includes(String(current.status).toUpperCase())){
          return err(409,"TEMPLATE_VERSION_IMMUTABLE","Only DRAFT or REJECTED template versions can be edited.");
        }

        let templateJson=current.template_json||"{}";
        if(b.templateJson!==undefined){
          try{templateJson=JSON.stringify(parseTemplateJson(b.templateJson));}
          catch{return err(400,"TEMPLATE_JSON_INVALID","Template JSON must be valid JSON.");}
        }

        const preflightProfile=String(b.preflightProfile??current.preflight_profile_code??"").trim();
        const effectiveAt=b.effectiveAt===undefined?current.effective_at:(b.effectiveAt||null);
        const notes=b.notes===undefined?current.notes:String(b.notes||"");
        await env.DB.prepare(`
          UPDATE template_versions
          SET status='DRAFT',effective_at=?,preflight_profile_code=?,template_json=?,notes=?,
              submitted_by=NULL,submitted_at=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).bind(effectiveAt,preflightProfile,templateJson,notes,id).run();
        await audit(env,identity,"TEMPLATE_VERSION",id,"UPDATE_DRAFT",{
          oldValue:{status:current.status,effectiveAt:current.effective_at,preflightProfile:current.preflight_profile_code},
          newValue:{status:"DRAFT",effectiveAt,preflightProfile}
        });
        return json({data:{id,status:"DRAFT"}});
      }

      const templateSubmitMatch=/^\/api\/template-versions\/([^/]+)\/submit$/.exec(url.pathname);
      if(request.method==="POST"&&templateSubmitMatch){
        const id=templateSubmitMatch[1],b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM template_versions WHERE id=?").bind(id).first();
        if(!current)return err(404,"NOT_FOUND","Template version not found.");
        if(!["DRAFT","REJECTED"].includes(String(current.status).toUpperCase())){
          return err(409,"TEMPLATE_SUBMIT_STATE","Only DRAFT or REJECTED template versions can be submitted.");
        }
        const validation=validateTemplateJson(current.template_json);
        if(!validation.ok)return err(409,"TEMPLATE_VALIDATION_FAILED","Template schema validation failed.",validation.errors);
        await env.DB.prepare(`
          UPDATE template_versions
          SET status='SUBMITTED',submitted_by=?,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).bind(identity.email,id).run();
        await audit(env,identity,"TEMPLATE_VERSION",id,"SUBMIT_REVIEW",{
          newValue:{status:"SUBMITTED",validationErrors:[]},
          reason:b.reason||"Template version submitted for approval"
        });
        return json({data:{id,status:"SUBMITTED",submittedBy:identity.email}},{status:201});
      }

      const templateApprovalMatch=/^\/api\/template-versions\/([^/]+)\/approval$/.exec(url.pathname);
      if(request.method==="POST"&&templateApprovalMatch){
        const id=templateApprovalMatch[1],b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM template_versions WHERE id=?").bind(id).first();
        if(!current)return err(404,"NOT_FOUND","Template version not found.");
        if(String(current.status).toUpperCase()!=="SUBMITTED"){
          return err(409,"TEMPLATE_NOT_SUBMITTED","Only SUBMITTED template versions can be approved or rejected.");
        }
        if(String(current.submitted_by||"").toLowerCase()===identity.email.toLowerCase()){
          await securityEvent(env,identity,"TEMPLATE_SELF_APPROVAL_BLOCKED",request,{templateVersionId:id});
          return err(409,"FOUR_EYES_REQUIRED","The template submitter cannot approve or reject the same version.");
        }
        const decision=String(b.decision||"").toUpperCase();
        if(!["APPROVE","REJECT"].includes(decision))return err(400,"INVALID_DECISION","decision must be APPROVE or REJECT.");

        if(decision==="APPROVE"){
          const validation=validateTemplateJson(current.template_json);
          if(!validation.ok)return err(409,"TEMPLATE_VALIDATION_FAILED","Template schema validation failed.",validation.errors);
        }

        const approvalId=crypto.randomUUID();
        const next=decision==="APPROVE"?"APPROVED":"REJECTED";
        const statements=[
          env.DB.prepare(`
            INSERT INTO template_approvals(id,template_version_id,reviewer,decision,comment,created_at)
            VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(approvalId,id,identity.email,decision,b.comment||"")
        ];
        if(decision==="APPROVE"){
          statements.push(env.DB.prepare(`
            UPDATE template_versions
            SET status='DEPRECATED',updated_at=CURRENT_TIMESTAMP
            WHERE template_id=? AND status='APPROVED' AND id<>?
          `).bind(current.template_id,id));
          statements.push(env.DB.prepare(`
            UPDATE template_versions
            SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).bind(identity.email,id));
        }else{
          statements.push(env.DB.prepare(`
            UPDATE template_versions SET status='REJECTED',updated_at=CURRENT_TIMESTAMP WHERE id=?
          `).bind(id));
        }
        await env.DB.batch(statements);
        await audit(env,identity,"TEMPLATE_VERSION",id,decision,{
          newValue:{status:next,reviewer:identity.email},
          reason:b.comment||"Template review decision"
        });
        return json({data:{id,status:next,reviewer:identity.email}},{status:201});
      }

      if (request.method === "GET" && url.pathname === "/api/artworks") {
        const where=[], binds=[];
        const status=url.searchParams.get("status");
        const q=url.searchParams.get("q");
        if(status){where.push("a.status=?");binds.push(status);}
        if(q){
          where.push("(a.sku LIKE ? OR a.contract_no LIKE ? OR a.artwork_no LIKE ?)");
          const like=`%${q}%`;binds.push(like,like,like);
        }
        const sql=`
          SELECT a.id,a.artwork_no AS artworkNo,a.sku,a.contract_no AS contractNo,
                 a.status,a.current_revision AS currentRevision,a.updated_at AS updatedAt,
                 t.code AS templateCode,f.name AS factoryName
          FROM artworks a
          LEFT JOIN templates t ON t.id=a.template_id
          LEFT JOIN factories f ON f.id=a.factory_id
          ${where.length?`WHERE ${where.join(" AND ")}`:""}
          ORDER BY a.updated_at DESC LIMIT 200
        `;
        const { results }=await env.DB.prepare(sql).bind(...binds).all();
        return json({ data: results });
      }

      if (request.method === "POST" && url.pathname === "/api/artworks") {
        const b=await bodyJson(request);
        const id=crypto.randomUUID();
        const artworkNo=b.artworkNo||`ART-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${Math.floor(Math.random()*900+100)}`;
        await env.DB.prepare(`
          INSERT INTO artworks(
            id,artwork_no,sku,contract_no,template_id,factory_id,status,
            package_count,current_package,current_revision,canonical_data_json,
            created_at,updated_at
          ) VALUES(?,?,?,?,?,?,'DRAFT',?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(
          id,artworkNo,b.sku||"",b.contractNo||"",b.templateId||null,b.factoryId||null,
          Number(b.packageCount||1),Number(b.currentPackage||1),b.revision||"R01",JSON.stringify(b.canonicalData||b)
        ).run();
        await audit(env, identity, "ARTWORK", id, "CREATE", {
          newValue:{artworkNo,sku:b.sku||""},
          reason:b.reason||"API create"
        });
        return json({ data:{id,artworkNo} },{status:201});
      }

      const artworkMatch=/^\/api\/artworks\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && artworkMatch) {
        const id=artworkMatch[1];
        const artwork=await env.DB.prepare("SELECT * FROM artworks WHERE id=?").bind(id).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");
        const {results:revisions}=await env.DB.prepare(`
          SELECT id,revision,status,data_snapshot_json AS dataSnapshotJson,
                 template_version_id AS templateVersionId,preflight_profile_version AS preflightProfileVersion,
                 created_by AS createdBy,created_at AS createdAt
          FROM artwork_revisions WHERE artwork_id=? ORDER BY created_at DESC
        `).bind(id).all();
        return json({ data:{artwork,revisions} });
      }

      if (request.method === "PATCH" && artworkMatch) {
        const id=artworkMatch[1],b=await bodyJson(request);
        const current=await env.DB.prepare("SELECT * FROM artworks WHERE id=?").bind(id).first();
        if(!current)return err(404,"NOT_FOUND","Artwork not found.");
        if(["IN_REVIEW","APPROVED"].includes(String(current.status||"").toUpperCase())) {
          return err(409,"IMMUTABLE_REVISION","Submitted or approved artwork cannot be edited in place. Create a new revision.");
        }
        const next={
          sku:b.sku ?? current.sku,
          contractNo:b.contractNo ?? current.contract_no,
          factoryId:b.factoryId ?? current.factory_id,
          packageCount:Number(b.packageCount ?? current.package_count),
          currentPackage:Number(b.currentPackage ?? current.current_package),
          canonicalData:b.canonicalData ?? JSON.parse(current.canonical_data_json||"{}")
        };
        await env.DB.prepare(`
          UPDATE artworks SET sku=?,contract_no=?,factory_id=?,package_count=?,current_package=?,
            canonical_data_json=?,status='DRAFT',updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).bind(next.sku,next.contractNo,next.factoryId,next.packageCount,next.currentPackage,JSON.stringify(next.canonicalData),id).run();
        await audit(env, identity, "ARTWORK", id, "UPDATE_DRAFT", {
          oldValue:{sku:current.sku,contractNo:current.contract_no,factoryId:current.factory_id},
          newValue:{sku:next.sku,contractNo:next.contractNo,factoryId:next.factoryId},
          reason:b.reason||"Save draft"
        });
        return json({data:{id,status:"DRAFT",revision:current.current_revision}});
      }

      const submitMatch=/^\/api\/artworks\/([^/]+)\/submit$/.exec(url.pathname);
      if(request.method==="POST"&&submitMatch){
        const artworkId=submitMatch[1],b=await bodyJson(request);
        const artwork=await env.DB.prepare("SELECT * FROM artworks WHERE id=?").bind(artworkId).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");

        const pfStatus=String(b.preflightStatus||"").toUpperCase();
        if(pfStatus==="ERROR"||Number(b.blockingErrors||0)>0) {
          return err(409,"PREFLIGHT_BLOCKED","Artwork has blocking preflight errors.");
        }

        const current=String(artwork.current_revision||"R01");
        const existing=await env.DB.prepare(
          "SELECT id,status FROM artwork_revisions WHERE artwork_id=? AND revision=?"
        ).bind(artworkId,current).first();

        let revision=current;
        let revisionId=existing?.id||crypto.randomUUID();
        const snapshot=JSON.stringify(b.dataSnapshot||JSON.parse(artwork.canonical_data_json||"{}"));

        if(existing && String(existing.status||"").toUpperCase()!=="DRAFT") {
          const n=(Number(current.replace(/\D/g,""))||0)+1;
          revision="R"+String(n).padStart(2,"0");
          revisionId=crypto.randomUUID();
        }

        const statements=[];
        if(existing && revision===current) {
          statements.push(env.DB.prepare(`
            UPDATE artwork_revisions SET status='SUBMITTED',data_snapshot_json=?,
              preflight_profile_version=?,created_by=? WHERE id=?
          `).bind(snapshot,b.preflightProfileVersion||"US_SIDE_SEAL_K_ONLY_V1@1",identity.email,revisionId));
        } else {
          statements.push(env.DB.prepare(`
            INSERT INTO artwork_revisions(id,artwork_id,revision,status,data_snapshot_json,template_version_id,
              preflight_profile_version,created_by,created_at)
            VALUES(?,?,?,'SUBMITTED',?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(revisionId,artworkId,revision,snapshot,b.templateVersionId||null,b.preflightProfileVersion||"US_SIDE_SEAL_K_ONLY_V1@1",identity.email));
        }

        statements.push(env.DB.prepare(
          "UPDATE artworks SET current_revision=?,status='IN_REVIEW',canonical_data_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(revision,snapshot,artworkId));
        await env.DB.batch(statements);
        await audit(env, identity, "ARTWORK", artworkId, "SUBMIT_REVIEW", {
          newValue:{revision},
          reason:b.reason||"Submitted for review"
        });
        return json({data:{id:artworkId,revision,status:"IN_REVIEW"}},{status:201});
      }

      const revMatch=/^\/api\/artworks\/([^/]+)\/revisions$/.exec(url.pathname);
      if(request.method==="POST"&&revMatch){
        const artworkId=revMatch[1],b=await bodyJson(request);
        const parent=await env.DB.prepare("SELECT current_revision,status FROM artworks WHERE id=?").bind(artworkId).first();
        if(!parent)return err(404,"NOT_FOUND","Artwork not found.");
        if(String(parent.status).toUpperCase()!=="APPROVED") {
          return err(409,"REVISION_NOT_ALLOWED","Explicit new revisions are created from approved artwork.");
        }
        const currentNum=Number(String(parent.current_revision||"R00").replace(/\D/g,""))||0;
        const revision="R"+String(currentNum+1).padStart(2,"0");
        const id=crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO artwork_revisions(id,artwork_id,revision,status,data_snapshot_json,template_version_id,preflight_profile_version,created_by,created_at)
            VALUES(?,?,?,'DRAFT',?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(id,artworkId,revision,JSON.stringify(b.dataSnapshot||b),b.templateVersionId||null,b.preflightProfileVersion||"US_SIDE_SEAL_K_ONLY_V1@1",identity.email),
          env.DB.prepare("UPDATE artworks SET current_revision=?,status='DRAFT',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(revision,artworkId)
        ]);
        await audit(env, identity, "ARTWORK", artworkId, "CREATE_REVISION", { newValue:{revision} });
        return json({data:{id,revision}},{status:201});
      }

      const pfMatch=/^\/api\/artworks\/([^/]+)\/preflight$/.exec(url.pathname);
      if(request.method==="POST"&&pfMatch){
        const artworkId=pfMatch[1],b=await bodyJson(request),id=crypto.randomUUID();
        const artwork=await env.DB.prepare("SELECT current_revision FROM artworks WHERE id=?").bind(artworkId).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");
        const revision=b.revision||artwork.current_revision;
        await env.DB.prepare(`
          INSERT INTO preflight_runs(id,artwork_id,revision,profile_code,profile_version,status,report_json,created_at)
          VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(id,artworkId,revision,b.profileCode||"US_SIDE_SEAL_K_ONLY_V1",b.profileVersion||"1",b.status||"PASS",JSON.stringify(b.report||{})).run();
        await audit(env, identity, "PREFLIGHT", id, "RUN", { newValue:{artworkId,revision,status:b.status||"PASS"} });
        return json({data:{id,revision}},{status:201});
      }

      const commentsMatch=/^\/api\/artworks\/([^/]+)\/comments$/.exec(url.pathname);
      if(request.method==="GET"&&commentsMatch){
        const artworkId=commentsMatch[1];
        const artwork=await env.DB.prepare("SELECT current_revision FROM artworks WHERE id=?").bind(artworkId).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");
        const revision=url.searchParams.get("revision")||artwork.current_revision;
        const {results}=await env.DB.prepare(`
          SELECT id,artwork_id AS artworkId,revision,author,blocking,resolved,body,
                 created_at AS createdAt,resolved_at AS resolvedAt
          FROM comments WHERE artwork_id=? AND revision=?
          ORDER BY created_at ASC
        `).bind(artworkId,revision).all();
        return json({data:results.map((x)=>({...x,blocking:Boolean(x.blocking),resolved:Boolean(x.resolved)}))});
      }

      if(request.method==="POST"&&commentsMatch){
        const artworkId=commentsMatch[1],b=await bodyJson(request);
        const artwork=await env.DB.prepare("SELECT current_revision FROM artworks WHERE id=?").bind(artworkId).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");
        const body=String(b.body||"").trim();
        if(!body)return err(400,"COMMENT_REQUIRED","Comment body is required.");
        const blocking=Boolean(b.blocking);
        if(blocking&&!can(identity,"REVIEW")) {
          return err(403,"BLOCKING_COMMENT_ROLE","Only Reviewer or Admin can create a blocking comment.");
        }
        const id=crypto.randomUUID(),revision=b.revision||artwork.current_revision;
        await env.DB.prepare(`
          INSERT INTO comments(id,artwork_id,revision,author,blocking,resolved,body,created_at)
          VALUES(?,?,?,?,?,0,?,CURRENT_TIMESTAMP)
        `).bind(id,artworkId,revision,identity.email,blocking?1:0,body).run();
        await audit(env, identity, "COMMENT", id, "CREATE", { newValue:{artworkId,revision,blocking,body} });
        return json({data:{id,artworkId,revision,author:identity.email,blocking,resolved:false,body}},{status:201});
      }

      const resolveCommentMatch=/^\/api\/comments\/([^/]+)\/resolve$/.exec(url.pathname);
      if(request.method==="POST"&&resolveCommentMatch){
        const id=resolveCommentMatch[1];
        const comment=await env.DB.prepare("SELECT * FROM comments WHERE id=?").bind(id).first();
        if(!comment)return err(404,"NOT_FOUND","Comment not found.");
        if(Number(comment.resolved||0)===1)return json({data:{id,resolved:true}});
        await env.DB.prepare(
          "UPDATE comments SET resolved=1,resolved_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(id).run();
        await audit(env, identity, "COMMENT", id, "RESOLVE", {
          oldValue:{resolved:false},
          newValue:{resolved:true}
        });
        return json({data:{id,resolved:true}});
      }

      const approvalMatch=/^\/api\/artworks\/([^/]+)\/approval$/.exec(url.pathname);
      if(request.method==="POST"&&approvalMatch){
        const artworkId=approvalMatch[1],b=await bodyJson(request);
        const id=crypto.randomUUID(),decision=String(b.decision||"").toUpperCase();
        if(!["APPROVE","REJECT"].includes(decision))return err(400,"INVALID_DECISION","decision must be APPROVE or REJECT.");

        const artwork=await env.DB.prepare("SELECT * FROM artworks WHERE id=?").bind(artworkId).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");
        if(String(artwork.status).toUpperCase()!=="IN_REVIEW") {
          return err(409,"NOT_IN_REVIEW","Only an artwork currently in review can be approved or rejected.");
        }

        const revision=b.revision||artwork.current_revision;
        const revisionRow=await env.DB.prepare(
          "SELECT id,created_by AS createdBy,status FROM artwork_revisions WHERE artwork_id=? AND revision=?"
        ).bind(artworkId,revision).first();
        if(!revisionRow)return err(409,"REVISION_NOT_FOUND","Submitted revision record is missing.");

        if(String(revisionRow.createdBy||"").toLowerCase()===identity.email.toLowerCase()) {
          await securityEvent(env, identity, "SELF_APPROVAL_BLOCKED", request, { artworkId, revision });
          return err(409,"FOUR_EYES_REQUIRED","The submitter cannot approve or reject the same revision.");
        }

        if(decision==="APPROVE"){
          const latestPf=await env.DB.prepare(`
            SELECT status FROM preflight_runs WHERE artwork_id=? AND revision=?
            ORDER BY created_at DESC LIMIT 1
          `).bind(artworkId,revision).first();
          if(!latestPf || String(latestPf.status).toUpperCase()==="ERROR") {
            return err(409,"PREFLIGHT_REQUIRED","A non-error preflight run for the current revision is required.");
          }
          const unresolved=await env.DB.prepare(`
            SELECT COUNT(*) AS count FROM comments
            WHERE artwork_id=? AND revision=? AND blocking=1 AND resolved=0
          `).bind(artworkId,revision).first();
          if(Number(unresolved?.count||0)>0) {
            return err(409,"BLOCKING_COMMENTS","Resolve all blocking review comments before approval.");
          }
        }

        const next=decision==="APPROVE"?"APPROVED":"REJECTED";
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO approvals(id,artwork_id,revision,reviewer,decision,comment,created_at)
            VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(id,artworkId,revision,identity.email,decision,b.comment||""),
          env.DB.prepare("UPDATE artworks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next,artworkId),
          env.DB.prepare("UPDATE artwork_revisions SET status=? WHERE artwork_id=? AND revision=?").bind(next,artworkId,revision)
        ]);
        await audit(env, identity, "ARTWORK", artworkId, decision, {
          newValue:{revision,status:next},
          reason:b.comment||"Review decision"
        });
        return json({data:{id,status:next,revision,reviewer:identity.email}},{status:201});
      }

      if (request.method === "GET" && url.pathname === "/api/mapping-profiles") {
        const { results } = await env.DB.prepare(`
          SELECT id,name,template_code AS templateCode,mapping_json AS mappingJson,
                 aliases_json AS aliasesJson,created_by AS createdBy,
                 created_at AS createdAt,updated_at AS updatedAt
          FROM mapping_profiles ORDER BY updated_at DESC
        `).all();
        return json({ data: results.map((x) => ({
          ...x,
          mapping: x.mappingJson ? JSON.parse(x.mappingJson) : {},
          aliases: x.aliasesJson ? JSON.parse(x.aliasesJson) : {}
        })) });
      }

      if (request.method === "POST" && url.pathname === "/api/mapping-profiles") {
        const b = await bodyJson(request);
        if (!b.name || !b.templateCode || !b.mapping || typeof b.mapping !== "object") {
          return err(400,"INVALID_MAPPING_PROFILE","name, templateCode and mapping are required.");
        }
        const id = b.id || crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO mapping_profiles(id,name,template_code,mapping_json,aliases_json,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            template_code=excluded.template_code,
            mapping_json=excluded.mapping_json,
            aliases_json=excluded.aliases_json,
            created_by=excluded.created_by,
            updated_at=CURRENT_TIMESTAMP
        `).bind(id,b.name,b.templateCode,JSON.stringify(b.mapping),JSON.stringify(b.aliases||{}),identity.email).run();
        await audit(env, identity, "MAPPING_PROFILE", id, "UPSERT", { newValue:{name:b.name,templateCode:b.templateCode} });
        return json({data:{id}},{status:201});
      }

      if (request.method === "GET" && url.pathname === "/api/import-jobs") {
        const { results } = await env.DB.prepare(`
          SELECT id,source_name AS sourceName,source_type AS sourceType,
                 mapping_profile_id AS mappingProfileId,status,total_rows AS totalRows,
                 passed_rows AS passedRows,failed_rows AS failedRows,summary_json AS summaryJson,
                 created_by AS createdBy,created_at AS createdAt,updated_at AS updatedAt
          FROM import_jobs ORDER BY created_at DESC LIMIT 100
        `).all();
        return json({data:results});
      }

      if (request.method === "POST" && url.pathname === "/api/import-jobs") {
        const b = await bodyJson(request);
        if (!b.sourceName || !b.sourceType) return err(400,"INVALID_IMPORT_JOB","sourceName and sourceType are required.");
        const id=crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO import_jobs(id,source_name,source_type,mapping_profile_id,status,total_rows,passed_rows,failed_rows,summary_json,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(
          id,b.sourceName,b.sourceType,b.mappingProfileId||null,b.status||"UPLOADED",
          Number(b.totalRows||0),Number(b.passedRows||0),Number(b.failedRows||0),
          JSON.stringify(b.summary||{}),identity.email
        ).run();
        await audit(env, identity, "IMPORT_JOB", id, "CREATE", { newValue:{sourceName:b.sourceName,sourceType:b.sourceType} });
        return json({data:{id}},{status:201});
      }

      const importJobMatch=/^\/api\/import-jobs\/([^/]+)$/.exec(url.pathname);
      if(request.method==="GET"&&importJobMatch){
        const id=importJobMatch[1];
        const job=await env.DB.prepare(`
          SELECT id,source_name AS sourceName,source_type AS sourceType,mapping_profile_id AS mappingProfileId,
                 status,total_rows AS totalRows,passed_rows AS passedRows,failed_rows AS failedRows,
                 summary_json AS summaryJson,created_by AS createdBy,created_at AS createdAt,updated_at AS updatedAt
          FROM import_jobs WHERE id=?
        `).bind(id).first();
        if(!job)return err(404,"NOT_FOUND","Import job not found.");
        const {results:rows}=await env.DB.prepare(`
          SELECT id,row_no AS rowNo,sku,status,canonical_data_json AS canonicalDataJson,
                 issues_json AS issuesJson,created_at AS createdAt
          FROM import_rows WHERE job_id=? ORDER BY row_no LIMIT 1000
        `).bind(id).all();
        return json({data:{job,rows}});
      }

      const importRowsMatch=/^\/api\/import-jobs\/([^/]+)\/rows$/.exec(url.pathname);
      if(request.method==="POST"&&importRowsMatch){
        const jobId=importRowsMatch[1],b=await bodyJson(request),rows=Array.isArray(b.rows)?b.rows:[];
        if(rows.length>500)return err(413,"TOO_MANY_ROWS","Upload at most 500 rows per request.");
        const job=await env.DB.prepare("SELECT id FROM import_jobs WHERE id=?").bind(jobId).first();
        if(!job)return err(404,"NOT_FOUND","Import job not found.");
        const stmts=rows.map((r)=>env.DB.prepare(`
          INSERT INTO import_rows(id,job_id,row_no,sku,status,canonical_data_json,issues_json,created_at)
          VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(job_id,row_no) DO UPDATE SET
            sku=excluded.sku,status=excluded.status,canonical_data_json=excluded.canonical_data_json,issues_json=excluded.issues_json
        `).bind(
          crypto.randomUUID(),jobId,Number(r.rowNo||r.row||0),r.sku||null,r.status||"ERROR",
          JSON.stringify(r.canonicalData||{}),JSON.stringify(r.issues||[])
        ));
        if(stmts.length) await env.DB.batch(stmts);
        const counts=await env.DB.prepare(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN status='PASS' THEN 1 ELSE 0 END) AS passed,
                 SUM(CASE WHEN status<>'PASS' THEN 1 ELSE 0 END) AS failed
          FROM import_rows WHERE job_id=?
        `).bind(jobId).first();
        await env.DB.prepare(`
          UPDATE import_jobs SET total_rows=?,passed_rows=?,failed_rows=?,status='REVIEWED',updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).bind(Number(counts?.total||0),Number(counts?.passed||0),Number(counts?.failed||0),jobId).run();
        return json({data:{jobId,total:Number(counts?.total||0),passed:Number(counts?.passed||0),failed:Number(counts?.failed||0)}},{status:201});
      }

      const exportMatch=/^\/api\/artworks\/([^/]+)\/exports$/.exec(url.pathname);
      if(request.method==="POST"&&exportMatch){
        if(!env.ARTWORK_FILES)return err(503,"R2_NOT_BOUND","Cloudflare R2 binding ARTWORK_FILES is not configured.");
        const artworkId=exportMatch[1];
        const artwork=await env.DB.prepare("SELECT id,status,current_revision FROM artworks WHERE id=?").bind(artworkId).first();
        if(!artwork)return err(404,"NOT_FOUND","Artwork not found.");
        if(String(artwork.status).toUpperCase()!=="APPROVED") {
          return err(409,"NOT_APPROVED","Production artifacts can only be persisted for approved artwork.");
        }

        const kind=(url.searchParams.get("kind")||"artifact").toUpperCase();
        if(kind.includes("PRODUCTION")){
          const {results:policyRows}=await env.DB.prepare(`
            SELECT code,display_name AS displayName,status,config_json AS configJson
            FROM production_policies ORDER BY code
          `).all();
          const readiness=summarizeProductionReadiness(policyRows);
          if(!readiness.ready){
            return err(409,"PRODUCTION_READINESS_BLOCKED","Production export is blocked until all production policies are approved and valid.",readiness.gates);
          }
        }
        const revision=url.searchParams.get("revision")||artwork.current_revision||"R01";
        if(revision!==artwork.current_revision) {
          return err(409,"STALE_REVISION","Production artifact revision must match the current approved revision.");
        }
        const rev=await env.DB.prepare(
          "SELECT status FROM artwork_revisions WHERE artwork_id=? AND revision=?"
        ).bind(artworkId,revision).first();
        if(!rev||String(rev.status).toUpperCase()!=="APPROVED") {
          return err(409,"REVISION_NOT_APPROVED","The requested revision is not approved.");
        }
        const unresolved=await env.DB.prepare(`
          SELECT COUNT(*) AS count FROM comments
          WHERE artwork_id=? AND revision=? AND blocking=1 AND resolved=0
        `).bind(artworkId,revision).first();
        if(Number(unresolved?.count||0)>0) {
          return err(409,"BLOCKING_COMMENTS","Production export is blocked by unresolved review comments.");
        }

        const filename=(url.searchParams.get("filename")||"artifact.bin").replace(/[^a-zA-Z0-9._-]+/g,"_");
        const contentType=request.headers.get("content-type")||"application/octet-stream";
        const declared=Number(request.headers.get("content-length")||0);
        if(declared>25*1024*1024)return err(413,"ARTIFACT_TOO_LARGE","Artifact exceeds 25 MB API upload limit.");
        const bytes=new Uint8Array(await request.arrayBuffer());
        if(bytes.length>25*1024*1024)return err(413,"ARTIFACT_TOO_LARGE","Artifact exceeds 25 MB API upload limit.");

        const digest=await crypto.subtle.digest("SHA-256",bytes);
        const sha256=[...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,"0")).join("");
        const objectKey=`artworks/${artworkId}/${revision}/${Date.now()}-${filename}`;
        await env.ARTWORK_FILES.put(objectKey,bytes,{httpMetadata:{contentType}});

        const id=crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO exports(id,artwork_id,revision,kind,object_key,sha256,renderer_version,manifest_json,created_at)
          VALUES(?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP)
        `).bind(id,artworkId,revision,kind,objectKey,sha256,url.searchParams.get("renderer")||"1.0.0",request.headers.get("x-artwork-manifest")||null).run();
        await audit(env, identity, "EXPORT", id, "UPLOAD", {
          newValue:{artworkId,revision,kind,objectKey,sha256},
          reason:"Artifact persisted to R2"
        });
        return json({data:{id,objectKey,sha256,size:bytes.length,contentType}},{status:201});
      }

      const exportDownloadMatch=/^\/api\/exports\/([^/]+)$/.exec(url.pathname);
      if(request.method==="GET"&&exportDownloadMatch){
        if(!env.ARTWORK_FILES)return err(503,"R2_NOT_BOUND","Cloudflare R2 binding ARTWORK_FILES is not configured.");
        const rec=await env.DB.prepare("SELECT * FROM exports WHERE id=?").bind(exportDownloadMatch[1]).first();
        if(!rec)return err(404,"NOT_FOUND","Export artifact not found.");
        const object=await env.ARTWORK_FILES.get(rec.object_key);
        if(!object)return err(404,"R2_OBJECT_NOT_FOUND","Export metadata exists but R2 object is missing.");
        const headers=new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag",object.httpEtag);
        headers.set("content-disposition",`attachment; filename="${String(rec.kind||"artifact").toLowerCase()}-${rec.revision||"R01"}"`);
        return new Response(object.body,{headers});
      }

      if(request.method==="GET"&&url.pathname==="/api/audit"){
        const limit=Math.max(1,Math.min(200,Number(url.searchParams.get("limit")||100)));
        const objectType=url.searchParams.get("objectType");
        let sql=`
          SELECT id,actor,object_type AS objectType,object_id AS objectId,action,
                 old_value_json AS oldValueJson,new_value_json AS newValueJson,reason,
                 created_at AS createdAt
          FROM audit_logs
        `;
        const binds=[];
        if(objectType){sql+=" WHERE object_type=?";binds.push(objectType);}
        sql+=" ORDER BY created_at DESC LIMIT ?";
        binds.push(limit);
        const {results}=await env.DB.prepare(sql).bind(...binds).all();
        return json({data:results});
      }

      if(request.method==="GET"&&url.pathname==="/api/admin/users"){
        const {results}=await env.DB.prepare(`
          SELECT u.id,u.email,u.display_name AS displayName,u.status,u.created_at AS createdAt,
                 GROUP_CONCAT(ur.role) AS rolesCsv
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id=u.id
          GROUP BY u.id
          ORDER BY lower(u.email)
        `).all();
        return json({data:results.map((u)=>({
          id:u.id,email:u.email,displayName:u.displayName,status:u.status,
          roles:u.rolesCsv?u.rolesCsv.split(",").sort():[],createdAt:u.createdAt
        }))});
      }

      if(request.method==="POST"&&url.pathname==="/api/admin/users"){
        const b=await bodyJson(request);
        const email=String(b.email||"").trim().toLowerCase();
        if(!email||!email.includes("@"))return err(400,"INVALID_EMAIL","A valid email is required.");
        const id=crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO users(id,email,display_name,status,created_at,updated_at)
          VALUES(?,?,?,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(id,email,b.displayName||email).run();
        await audit(env, identity, "USER", id, "CREATE", { newValue:{email,displayName:b.displayName||email} });
        return json({data:{id,email}},{status:201});
      }

      const userRolesMatch=/^\/api\/admin\/users\/([^/]+)\/roles$/.exec(url.pathname);
      if(request.method==="PUT"&&userRolesMatch){
        const userId=userRolesMatch[1],b=await bodyJson(request);
        const user=await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(userId).first();
        if(!user)return err(404,"NOT_FOUND","User not found.");
        const roles=[...new Set((Array.isArray(b.roles)?b.roles:[]).map((x)=>String(x).toUpperCase()))];
        if(roles.some((role)=>!ROLES.includes(role)))return err(400,"INVALID_ROLE","One or more roles are invalid.");
        const current=await env.DB.prepare("SELECT role FROM user_roles WHERE user_id=? ORDER BY role").bind(userId).all();
        const stmts=[env.DB.prepare("DELETE FROM user_roles WHERE user_id=?").bind(userId)];
        for(const role of roles){
          stmts.push(env.DB.prepare(
            "INSERT INTO user_roles(user_id,role,granted_by,granted_at) VALUES(?,?,?,CURRENT_TIMESTAMP)"
          ).bind(userId,role,identity.email));
        }
        await env.DB.batch(stmts);
        await audit(env, identity, "USER", userId, "SET_ROLES", {
          oldValue:{roles:(current.results||[]).map((x)=>x.role)},
          newValue:{roles}
        });
        return json({data:{id:userId,email:user.email,roles}});
      }

      return err(404,"NOT_FOUND","API route not found.",url.pathname);
    } catch (e) {
      console.error(e);
      if(String(e?.message)==="INVALID_JSON")return err(400,"INVALID_JSON","Request body must be valid JSON.");
      if(String(e?.message||"").includes("UNIQUE constraint failed: users.email")) {
        return err(409,"USER_EXISTS","A user with this email already exists.");
      }
      return err(500,"INTERNAL_ERROR",String(e?.message||e));
    }
  }
};
