const json = (data, init = {}) => new Response(JSON.stringify(data, null, 2), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) }
});

function err(status, code, message, detail) {
  return json({ error: code, message, detail }, { status });
}

async function bodyJson(request) {
  try { return await request.json(); }
  catch { throw new Error("INVALID_JSON"); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "carton-artwork-studio",
        version: "0.4.0",
        runtime: "cloudflare-workers",
        bindings: { d1: Boolean(env.DB), r2: Boolean(env.ARTWORK_FILES), assets: Boolean(env.ASSETS) },
        time: new Date().toISOString()
      });
    }

    if (!env.DB) return err(503, "DATABASE_NOT_BOUND", "Cloudflare D1 binding DB is not configured.");

    try {
      if (request.method === "GET" && url.pathname === "/api/factories") {
        const { results } = await env.DB.prepare(`
          SELECT id,name,crn,country,effective_at AS effectiveAt,status
          FROM factories ORDER BY name
        `).all();
        return json({ data: results });
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

      if (request.method === "GET" && url.pathname === "/api/artworks") {
        const where=[], binds=[];
        const status=url.searchParams.get("status");
        const q=url.searchParams.get("q");
        if(status){where.push("a.status=?");binds.push(status);}
        if(q){where.push("(a.sku LIKE ? OR a.contract_no LIKE ? OR a.artwork_no LIKE ?)");const like=`%${q}%`;binds.push(like,like,like);}
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
          ) VALUES(?,?,?,?,?,?,'DRAFT',?,?,'R01',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(
          id,artworkNo,b.sku||"",b.contractNo||"",b.templateId||null,b.factoryId||null,
          Number(b.packageCount||1),Number(b.currentPackage||1),JSON.stringify(b.canonicalData||b)
        ).run();

        await env.DB.prepare(`
          INSERT INTO audit_logs(id,actor,object_type,object_id,action,new_value_json,reason,created_at)
          VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(crypto.randomUUID(),b.actor||"api","ARTWORK",id,"CREATE",JSON.stringify({artworkNo}),b.reason||"API create").run();

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

      const revMatch=/^\/api\/artworks\/([^/]+)\/revisions$/.exec(url.pathname);
      if(request.method==="POST"&&revMatch){
        const artworkId=revMatch[1],b=await bodyJson(request);
        const parent=await env.DB.prepare("SELECT current_revision FROM artworks WHERE id=?").bind(artworkId).first();
        if(!parent)return err(404,"NOT_FOUND","Artwork not found.");
        const currentNum=Number(String(parent.current_revision||"R00").replace(/\D/g,""))||0;
        const revision="R"+String(currentNum+1).padStart(2,"0");
        const id=crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO artwork_revisions(id,artwork_id,revision,status,data_snapshot_json,template_version_id,preflight_profile_version,created_by,created_at)
            VALUES(?,?,?,'DRAFT',?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(id,artworkId,revision,JSON.stringify(b.dataSnapshot||b),b.templateVersionId||null,b.preflightProfileVersion||"US_SIDE_SEAL_K_ONLY_V1@1",b.actor||"api"),
          env.DB.prepare("UPDATE artworks SET current_revision=?,status='DRAFT',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(revision,artworkId)
        ]);
        return json({data:{id,revision}},{status:201});
      }

      const pfMatch=/^\/api\/artworks\/([^/]+)\/preflight$/.exec(url.pathname);
      if(request.method==="POST"&&pfMatch){
        const artworkId=pfMatch[1],b=await bodyJson(request),id=crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO preflight_runs(id,artwork_id,revision,profile_code,profile_version,status,report_json,created_at)
          VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(id,artworkId,b.revision||null,b.profileCode||"US_SIDE_SEAL_K_ONLY_V1",b.profileVersion||"1",b.status||"PASS",JSON.stringify(b.report||{})).run();
        return json({data:{id}},{status:201});
      }

      const approvalMatch=/^\/api\/artworks\/([^/]+)\/approval$/.exec(url.pathname);
      if(request.method==="POST"&&approvalMatch){
        const artworkId=approvalMatch[1],b=await bodyJson(request);
        const id=crypto.randomUUID(),decision=String(b.decision||"").toUpperCase();
        if(!["APPROVE","REJECT"].includes(decision))return err(400,"INVALID_DECISION","decision must be APPROVE or REJECT.");
        const next=decision==="APPROVE"?"APPROVED":"REJECTED";
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO approvals(id,artwork_id,revision,reviewer,decision,comment,created_at)
            VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
          `).bind(id,artworkId,b.revision||null,b.reviewer||"reviewer",decision,b.comment||""),
          env.DB.prepare("UPDATE artworks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next,artworkId)
        ]);
        return json({data:{id,status:next}},{status:201});
      }

      return err(404,"NOT_FOUND","API route not found.",url.pathname);
    } catch (e) {
      console.error(e);
      if(String(e?.message)==="INVALID_JSON")return err(400,"INVALID_JSON","Request body must be valid JSON.");
      return err(500,"INTERNAL_ERROR",String(e?.message||e));
    }
  }
};
