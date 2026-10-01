import assert from "node:assert/strict";
import { can, permissionForRequest, resolveIdentity } from "../worker/auth.js";

function mockDb(user, roles=[]){
  return {
    prepare(sql){
      return {
        args:[],
        bind(...args){this.args=args;return this;},
        async first(){
          if(sql.includes("FROM users")) return user;
          return null;
        },
        async all(){
          if(sql.includes("FROM user_roles")) return {results:roles.map(role=>({role}))};
          return {results:[]};
        }
      };
    }
  };
}

const req=new Request("https://app.example.com/api/artworks",{
  headers:{"cf-access-authenticated-user-email":"operator@example.com"}
});
const identity=await resolveIdentity(req,{DB:mockDb({id:"u1",email:"operator@example.com",displayName:"Operator",status:"ACTIVE"},["OPERATOR"])});
assert.equal(identity.email,"operator@example.com");
assert.deepEqual(identity.roles,["OPERATOR"]);
assert.equal(identity.source,"cloudflare-access");
assert.equal(can(identity,"ARTWORK_WRITE"),true);
assert.equal(can(identity,"REVIEW"),false);
assert.equal(can(identity,"AUDIT_READ"),false);

assert.equal(permissionForRequest("POST","/api/artworks"),"ARTWORK_WRITE");
assert.equal(permissionForRequest("POST","/api/artworks/a1/approval"),"REVIEW");
assert.equal(permissionForRequest("POST","/api/artworks/a1/exports"),"EXPORT_PRODUCTION");
assert.equal(permissionForRequest("PUT","/api/admin/users/u1/roles"),"ADMIN");
assert.equal(permissionForRequest("GET","/api/artworks"),"READ");
assert.equal(permissionForRequest("GET","/api/audit"),"AUDIT_READ");
assert.equal(permissionForRequest("GET","/api/pdfx/promotion/readiness"),"AUDIT_READ");
assert.equal(permissionForRequest("GET","/api/pdfx/promotion/evidence"),"AUDIT_READ");
assert.equal(permissionForRequest("POST","/api/pdfx/promotion/evidence/upload"),"PRODUCTION_POLICY_WRITE");
assert.equal(permissionForRequest("POST","/api/pdfx/promotion/evidence/e1/submit"),"PRODUCTION_POLICY_WRITE");
assert.equal(permissionForRequest("POST","/api/pdfx/promotion/evidence/e1/approval"),"PRODUCTION_POLICY_APPROVE");
assert.equal(permissionForRequest("GET","/api/pdfx/promotion/evidence/e1/file"),"AUDIT_READ");
assert.equal(permissionForRequest("POST","/api/factories"),"ADMIN");
assert.equal(permissionForRequest("PATCH","/api/factories/ningbo-a"),"ADMIN");
assert.equal(permissionForRequest("POST","/api/templates/t1/versions"),"TEMPLATE_WRITE");
assert.equal(permissionForRequest("PATCH","/api/template-versions/v1"),"TEMPLATE_WRITE");
assert.equal(permissionForRequest("POST","/api/template-versions/v1/submit"),"TEMPLATE_WRITE");
assert.equal(permissionForRequest("POST","/api/template-versions/v1/approval"),"TEMPLATE_APPROVE");
assert.equal(permissionForRequest("POST","/api/reference-records"),"REFERENCE_WRITE");
assert.equal(permissionForRequest("PATCH","/api/reference-records/r1"),"REFERENCE_WRITE");
assert.equal(permissionForRequest("PATCH","/api/production-policies/BARCODE_POLICY"),"PRODUCTION_POLICY_WRITE");
assert.equal(permissionForRequest("POST","/api/production-policies/BARCODE_POLICY/submit"),"PRODUCTION_POLICY_WRITE");
assert.equal(permissionForRequest("POST","/api/production-policies/BARCODE_POLICY/approval"),"PRODUCTION_POLICY_APPROVE");
assert.equal(permissionForRequest("POST","/api/production-assets/upload"),"PRODUCTION_ASSET_WRITE");
assert.equal(permissionForRequest("POST","/api/production-assets/a1/submit"),"PRODUCTION_ASSET_WRITE");
assert.equal(permissionForRequest("POST","/api/production-assets/a1/approval"),"PRODUCTION_ASSET_APPROVE");
assert.equal(permissionForRequest("POST","/api/artworks/a1/font-embed-validation"),"PRODUCTION_ASSET_APPROVE");
assert.equal(permissionForRequest("POST","/api/artworks/a1/pdfx4-candidate-validation"),"PRODUCTION_ASSET_APPROVE");
assert.equal(permissionForRequest("POST","/api/artworks/a1/pdfx4-external-validation"),"PRODUCTION_ASSET_APPROVE");
assert.equal(permissionForRequest("POST","/api/artworks/a1/render-production-pdf"),"EXPORT_PRODUCTION");
assert.equal(permissionForRequest("GET","/api/system/readiness"),"ADMIN");
assert.equal(permissionForRequest("POST","/api/system/readiness/probe"),"ADMIN");

const bypassReq=new Request("https://localhost/api/me",{
  headers:{"x-cas-dev-user":"dev@example.com","x-cas-dev-roles":"ADMIN,REVIEWER"}
});
const bypass=await resolveIdentity(bypassReq,{AUTH_BYPASS:"1",DB:mockDb(null,[])});
assert.equal(bypass.source,"development-bypass");
assert.equal(can(bypass,"ADMIN"),true);
assert.equal(can(bypass,"REVIEW"),true);
assert.equal(can(bypass,"AUDIT_READ"),true);

const noBypass=await resolveIdentity(bypassReq,{AUTH_BYPASS:"0",DB:mockDb(null,[])});
assert.equal(noBypass,null);

const bootstrapReq=new Request("https://app.example.com/api/me",{headers:{"cf-access-authenticated-user-email":"owner@example.com"}});
const bootstrap=await resolveIdentity(bootstrapReq,{BOOTSTRAP_ADMIN_EMAIL:"owner@example.com",DB:mockDb(null,[])});
assert.equal(can(bootstrap,"ADMIN"),true);

console.log("Auth/RBAC tests passed.");

assert.equal(permissionForRequest("POST","/api/import-jobs/job-1/create-drafts"),"ARTWORK_WRITE");
