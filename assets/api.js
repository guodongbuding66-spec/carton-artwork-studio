(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function statusToApi(status) {
    const s = String(status || "draft").toUpperCase();
    return s === "IN_REVIEW" ? s : s.replace(/-/g, "_");
  }

  function statusFromApi(status) {
    return String(status || "DRAFT").toLowerCase();
  }

  function createClient(options = {}) {
    const baseUrl = String(options.baseUrl || "").replace(/\/$/, "");
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error("Fetch API is not available.");

    async function request(path, init = {}) {
      const headers = new Headers(init.headers || {});
      const body = init.body;
      if (body != null && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array) && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      const response = await fetchImpl(baseUrl + path, { ...init, headers });
      const type = response.headers?.get?.("content-type") || "";
      const payload = type.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        const error = new Error(payload?.message || payload?.error || `Request failed: ${response.status}`);
        error.status = response.status;
        error.code = payload?.error || "HTTP_ERROR";
        error.detail = payload?.detail;
        throw error;
      }
      return payload;
    }

    return {
      request,
      async health() {
        return request("/api/health");
      },
      async me() {
        return request("/api/me");
      },
      async factories() {
        return request("/api/factories");
      },
      async factoryImpact(id) {
        return request(`/api/factories/${encodeURIComponent(id)}/impact`);
      },
      async updateFactory(id, payload) {
        return request(`/api/factories/${encodeURIComponent(id)}`, {
          method:"PATCH",
          body:JSON.stringify(payload)
        });
      },
      async templates() {
        return request("/api/templates");
      },
      async artworks(params = {}) {
        const q = new URLSearchParams();
        if (params.status) q.set("status", statusToApi(params.status));
        if (params.q) q.set("q", params.q);
        return request("/api/artworks" + (q.size ? `?${q}` : ""));
      },
      async artwork(id) {
        return request(`/api/artworks/${encodeURIComponent(id)}`);
      },
      async createArtwork(artwork, canonicalData, actor = "web") {
        return request("/api/artworks", {
          method: "POST",
          body: JSON.stringify({
            sku: artwork.sku,
            contractNo: artwork.contractNo,
            templateId: "tpl-us-side-seal",
            factoryId: artwork.factoryId || null,
            packageCount: artwork.packageCount,
            currentPackage: artwork.currentPackage,
            revision: artwork.revision || "R01",
            canonicalData,
            actor
          })
        });
      },
      async updateArtwork(id, artwork, canonicalData, actor = "web") {
        return request(`/api/artworks/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            sku: artwork.sku,
            contractNo: artwork.contractNo,
            factoryId: artwork.factoryId || null,
            packageCount: artwork.packageCount,
            currentPackage: artwork.currentPackage,
            canonicalData,
            actor
          })
        });
      },
      async submitArtwork(id, payload) {
        return request(`/api/artworks/${encodeURIComponent(id)}/submit`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      },
      async createRevision(id, payload) {
        return request(`/api/artworks/${encodeURIComponent(id)}/revisions`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      },
      async preflight(id, payload) {
        return request(`/api/artworks/${encodeURIComponent(id)}/preflight`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      },
      async comments(id, revision) {
        const q = new URLSearchParams();
        if (revision) q.set("revision", revision);
        return request(`/api/artworks/${encodeURIComponent(id)}/comments${q.size ? "?" + q : ""}`);
      },
      async addComment(id, payload) {
        return request(`/api/artworks/${encodeURIComponent(id)}/comments`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      },
      async resolveComment(commentId) {
        return request(`/api/comments/${encodeURIComponent(commentId)}/resolve`, {
          method: "POST",
          body: "{}"
        });
      },
      async decision(id, decision, payload = {}) {
        return request(`/api/artworks/${encodeURIComponent(id)}/approval`, {
          method: "POST",
          body: JSON.stringify({ ...payload, decision })
        });
      },
      async mappingProfiles() {
        return request("/api/mapping-profiles");
      },
      async saveMappingProfile(profile) {
        return request("/api/mapping-profiles", { method:"POST", body:JSON.stringify(profile) });
      },
      async createImportJob(job) {
        return request("/api/import-jobs", { method:"POST", body:JSON.stringify(job) });
      },
      async saveImportRows(jobId, rows) {
        return request(`/api/import-jobs/${encodeURIComponent(jobId)}/rows`, {
          method:"POST", body:JSON.stringify({ rows })
        });
      },
      async uploadExport(artworkId, blob, meta = {}) {
        const q = new URLSearchParams();
        q.set("kind", meta.kind || "PRODUCTION_BUNDLE");
        if (meta.revision) q.set("revision", meta.revision);
        if (meta.filename) q.set("filename", meta.filename);
        if (meta.renderer) q.set("renderer", meta.renderer);
        const headers = new Headers({ "content-type": blob.type || "application/octet-stream" });
        if (meta.actor) headers.set("x-actor", meta.actor);
        if (meta.manifest) headers.set("x-artwork-manifest", typeof meta.manifest === "string" ? meta.manifest : JSON.stringify(meta.manifest));
        return request(`/api/artworks/${encodeURIComponent(artworkId)}/exports?${q}`, {
          method:"POST", headers, body:blob
        });
      },
      async adminUsers() {
        return request("/api/admin/users");
      },
      async audit(params = {}) {
        const q = new URLSearchParams();
        if (params.limit) q.set("limit", String(params.limit));
        if (params.objectType) q.set("objectType", params.objectType);
        return request("/api/audit" + (q.size ? "?" + q : ""));
      },
      async createUser(payload) {
        return request("/api/admin/users", { method:"POST", body:JSON.stringify(payload) });
      },
      async setUserRoles(userId, roles) {
        return request(`/api/admin/users/${encodeURIComponent(userId)}/roles`, {
          method:"PUT",
          body:JSON.stringify({roles})
        });
      },
      statusToApi,
      statusFromApi
    };
  }

  return { createClient, statusToApi, statusFromApi };
});
