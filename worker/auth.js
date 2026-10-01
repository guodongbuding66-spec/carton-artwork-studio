export const ROLES = Object.freeze([
  "OPERATOR",
  "REVIEWER",
  "TEMPLATE_DESIGNER",
  "TEMPLATE_APPROVER",
  "ADMIN"
]);

export const PERMISSIONS = Object.freeze({
  READ: ["OPERATOR","REVIEWER","TEMPLATE_DESIGNER","TEMPLATE_APPROVER","ADMIN"],
  ARTWORK_WRITE: ["OPERATOR","ADMIN"],
  REVIEW: ["REVIEWER","ADMIN"],
  AUDIT_READ: ["REVIEWER","ADMIN"],
  COMMENT_WRITE: ["OPERATOR","REVIEWER","ADMIN"],
  BATCH_WRITE: ["OPERATOR","ADMIN"],
  TEMPLATE_WRITE: ["TEMPLATE_DESIGNER","ADMIN"],
  TEMPLATE_APPROVE: ["TEMPLATE_APPROVER","ADMIN"],
  REFERENCE_WRITE: ["ADMIN"],
  PRODUCTION_POLICY_WRITE: ["ADMIN"],
  PRODUCTION_POLICY_APPROVE: ["TEMPLATE_APPROVER","ADMIN"],
  PRODUCTION_ASSET_WRITE: ["ADMIN"],
  PRODUCTION_ASSET_APPROVE: ["TEMPLATE_APPROVER","ADMIN"],
  EXPORT_PRODUCTION: ["OPERATOR","ADMIN"],
  ADMIN: ["ADMIN"]
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseDevRoles(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter((x) => ROLES.includes(x));
}

export function hasRole(identity, ...roles) {
  const set = new Set(identity?.roles || []);
  return roles.some((role) => set.has(role));
}

export function can(identity, permission) {
  const allowed = PERMISSIONS[permission] || [];
  return hasRole(identity, ...allowed);
}

export function permissionForRequest(method, pathname) {
  const m = String(method || "GET").toUpperCase();
  const p = String(pathname || "");

  if (p === "/api/health") return null;
  if (p === "/api/me") return "READ";

  if (p.startsWith("/api/admin/")) return "ADMIN";
  if (p === "/api/system/readiness" || p === "/api/system/readiness/probe") return "ADMIN";
  if (p === "/api/factories" && m === "POST") return "ADMIN";
  if (/^\/api\/factories\/[^/]+$/.test(p) && m === "PATCH") return "ADMIN";
  if (p === "/api/audit") return "AUDIT_READ";
  if (p === "/api/pdfx/promotion/readiness" || p === "/api/pdfx/promotion/evidence") return "AUDIT_READ";
  if (/^\/api\/pdfx\/promotion\/evidence\/[^/]+\/file$/.test(p) && m === "GET") return "AUDIT_READ";
  if (p === "/api/pdfx/promotion/evidence/upload") return "PRODUCTION_POLICY_WRITE";
  if (/^\/api\/pdfx\/promotion\/evidence\/[^/]+\/submit$/.test(p)) return "PRODUCTION_POLICY_WRITE";
  if (/^\/api\/pdfx\/promotion\/evidence\/[^/]+\/approval$/.test(p)) return "PRODUCTION_POLICY_APPROVE";

  if (p === "/api/reference-records" && m === "POST") return "REFERENCE_WRITE";
  if (/^\/api\/reference-records\/[^/]+$/.test(p) && m === "PATCH") return "REFERENCE_WRITE";

  if (/^\/api\/production-policies\/[^/]+\/approval$/.test(p)) return "PRODUCTION_POLICY_APPROVE";
  if (/^\/api\/production-policies\/[^/]+\/submit$/.test(p)) return "PRODUCTION_POLICY_WRITE";
  if (/^\/api\/production-policies\/[^/]+$/.test(p) && m === "PATCH") return "PRODUCTION_POLICY_WRITE";
  if (p === "/api/production-assets/upload") return "PRODUCTION_ASSET_WRITE";
  if (/^\/api\/production-assets\/[^/]+\/submit$/.test(p)) return "PRODUCTION_ASSET_WRITE";
  if (/^\/api\/production-assets\/[^/]+\/approval$/.test(p)) return "PRODUCTION_ASSET_APPROVE";
  if (/^\/api\/artworks\/[^/]+\/font-embed-validation$/.test(p)) return "PRODUCTION_ASSET_APPROVE";
  if (/^\/api\/artworks\/[^/]+\/pdfx4-candidate-validation$/.test(p)) return "PRODUCTION_ASSET_APPROVE";
  if (/^\/api\/artworks\/[^/]+\/pdfx4-external-validation$/.test(p)) return "PRODUCTION_ASSET_APPROVE";
  if (/^\/api\/artworks\/[^/]+\/render-production-pdf$/.test(p)) return "EXPORT_PRODUCTION";

  if (/^\/api\/template-versions\/[^/]+\/approval$/.test(p)) return "TEMPLATE_APPROVE";
  if (/^\/api\/template-versions\/[^/]+\/submit$/.test(p)) return "TEMPLATE_WRITE";
  if (/^\/api\/template-versions\/[^/]+$/.test(p) && m === "PATCH") return "TEMPLATE_WRITE";
  if (/^\/api\/templates\/[^/]+\/versions$/.test(p) && m === "POST") return "TEMPLATE_WRITE";
  if (p === "/api/templates" && m === "POST") return "TEMPLATE_WRITE";

  if (m === "GET") return "READ";

  if (/^\/api\/artworks\/[^/]+\/approval$/.test(p)) return "REVIEW";
  if (/^\/api\/comments\/[^/]+\/resolve$/.test(p)) return "REVIEW";
  if (/^\/api\/artworks\/[^/]+\/comments$/.test(p)) return "COMMENT_WRITE";

  if (/^\/api\/artworks\/[^/]+\/exports$/.test(p)) return "EXPORT_PRODUCTION";

  if (/^\/api\/import-jobs\/[^/]+\/create-drafts$/.test(p)) return "ARTWORK_WRITE";

  if (p === "/api/mapping-profiles" || p === "/api/import-jobs" || /^\/api\/import-jobs\/[^/]+\/rows$/.test(p)) {
    return "BATCH_WRITE";
  }

  if (p === "/api/artworks" || /^\/api\/artworks\/[^/]+(?:\/revisions|\/submit|\/preflight)?$/.test(p)) {
    return "ARTWORK_WRITE";
  }

  return "ADMIN";
}

export async function resolveIdentity(request, env) {
  const accessEmail = normalizeEmail(request.headers.get("cf-access-authenticated-user-email"));
  const bypass = String(env.AUTH_BYPASS || "") === "1";
  const devHeaderEmail = bypass ? normalizeEmail(request.headers.get("x-cas-dev-user")) : "";
  const devEnvEmail = bypass ? normalizeEmail(env.DEV_USER_EMAIL) : "";
  const email = accessEmail || devHeaderEmail || devEnvEmail;
  if (!email) return null;

  const source = accessEmail ? "cloudflare-access" : "development-bypass";
  let user = null;
  let roles = [];

  if (env.DB) {
    user = await env.DB.prepare(
      "SELECT id,email,display_name AS displayName,status FROM users WHERE lower(email)=lower(?)"
    ).bind(email).first();

    if (user) {
      const result = await env.DB.prepare(
        "SELECT role FROM user_roles WHERE user_id=? ORDER BY role"
      ).bind(user.id).all();
      roles = (result.results || []).map((x) => x.role).filter((x) => ROLES.includes(x));
    }
  }

  const bootstrapEmail = normalizeEmail(env.BOOTSTRAP_ADMIN_EMAIL);
  if (bootstrapEmail && bootstrapEmail === email && !roles.includes("ADMIN")) roles.push("ADMIN");

  if (bypass && !accessEmail) {
    const devRoles = request.headers.get("x-cas-dev-roles") || env.DEV_USER_ROLES || "";
    for (const role of parseDevRoles(devRoles)) {
      if (!roles.includes(role)) roles.push(role);
    }
  }

  return {
    id: user?.id || null,
    email,
    displayName: user?.displayName || email,
    status: user?.status || (bootstrapEmail === email ? "BOOTSTRAP" : "UNREGISTERED"),
    roles,
    source
  };
}
