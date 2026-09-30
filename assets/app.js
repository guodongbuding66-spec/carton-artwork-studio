(() => {
  "use strict";

  const D = window.CartonDomain;
  const C = window.CartonCodes;
  const P = window.CartonPdf;
  const X = window.CartonImport;
  const B = window.CartonBatch;
  const Z = window.CartonZip;
  const A = window.CartonApi;
  const api = A?.createClient ? A.createClient() : null;
  const app = document.getElementById("app");
  if (!D || !C || !P || !X || !B || !Z || !A || !api) throw new Error("Carton Artwork Studio modules failed to load.");

  const state = {
    page: "artwork",
    artwork: { ...D.defaultArtwork },
    tab: "artwork",
    zoom: 0.68,
    showDieline: true,
    showSafe: true,
    showPanels: true,
    pfBusy: false,
    templateTab: "overview",
    contentTab: "factories",
    qualityTab: "profiles",
    batchStep: 0,
    batchRows: [],
    batchIssues: [],
    batchRecords: [],
    batchReview: [],
    batchMapping: null,
    batchSource: null,
    batchGenerating: false,
    dialog: null,
    apiOnline: false,
    apiChecked: false,
    apiBusy: false,
    remoteArtworkId: localStorage.getItem("cas:remoteArtworkId") || null,
    remoteRevision: null,
    remoteImportJobId: null,
    apiBindings: { d1:false, r2:false, assets:false },
    identity: null,
    authError: null,
    comments: [],
    commentsLoading: false,
    adminUsers: [],
    auditLogs: [],
    factories: [...D.factories],
    templates: [],
    templateVersions: [],
    templateVersionsMeta: null,
    templateEditor: null,
    remoteArtworks: [],
    impact: null,
    referenceRecords: [],
    productionPolicies: [],
    productionReadiness: { ready:false, gates:[] },
    remoteRevisions: [],
    compareFrom: null,
    compareTo: null,
    revisionCompare: null
  };

  const navItems = [
    ["dashboard", "▦", "工作台", "Dashboard"],
    ["artwork", "▣", "印刷稿", "Artwork"],
    ["batch", "⇅", "批量生成", "Batch"],
    ["templates", "▤", "模板", "Templates"],
    ["content", "◫", "内容资料", "Content"],
    ["quality", "✓", "质量检查", "Quality"],
    ["admin", "⚙", "系统管理", "Admin"]
  ];

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
  }

  function computed() { return D.computed(state.artwork,state.factories); }
  function geometry() { return D.sideSealGeometry(state.artwork); }
  function checksFor(artwork) {
    const groups=D.runPreflight(artwork,state.factories);
    const barcode=groups.Codes?.find(x=>x.id==="barcode");
    if(barcode){
      try{
        const values=C.code128Values(artwork.barcode);
        barcode.status="pass";
        barcode.title="Code 128-B vector encoding";
        barcode.detail=`Encodable payload · checksum ${values.at(-2)} · quiet zone applied by renderer.`;
      }catch(e){
        barcode.status="error";barcode.blocking=true;barcode.title="Code 128-B vector encoding";barcode.detail=e.message||String(e);
      }
    }
    const qr=groups.Codes?.find(x=>x.id==="qr");
    if(qr){
      try{
        const model=C.qrMatrix(artwork.qr,"M");
        qr.status="pass";qr.title="QR vector encoding";qr.detail=`Version ${model.version} · ECC M · ${model.matrix.length}×${model.matrix.length} modules.`;
      }catch(e){
        qr.status="error";qr.blocking=true;qr.title="QR vector encoding";qr.detail=e.message||String(e);
      }
    }
    return groups;
  }
  function checks() { return checksFor(state.artwork); }
  function summary() { return D.preflightSummary(checks()); }
  function factory() { return D.findFactory(state.artwork.factoryId,state.factories); }
  function canonical() { return D.canonicalData(state.artwork,state.factories); }
  function hasRole(role){return Boolean(state.identity?.roles?.includes(role));}
  function permitted(key){return Boolean(state.identity?.permissions?.[key]);}
  function blockingCommentsResolved(){return !state.comments.some(x=>x.blocking&&!x.resolved);}
  function productionPolicy(code){return state.productionPolicies.find(x=>x.code===code)||null;}
  function approvedQrEcc(){
    const policy=productionPolicy("QR_POLICY");
    const ecc=String(policy?.config?.ecc||"M").toUpperCase();
    return ["L","M","Q","H"].includes(ecc)?ecc:"M";
  }
  function approvedBarcodeSymbology(){
    const policy=productionPolicy("BARCODE_POLICY");
    return String(policy?.config?.symbology||"Code128-B");
  }
  function identityLabel(){
    if(state.identity) return `${state.identity.email} · ${state.identity.roles.join(", ")||"NO ROLE"}`;
    if(state.apiChecked&&state.authError) return "Access required";
    return state.apiChecked?"Local / unauthenticated":"Checking identity…";
  }

  function shell(body, titleZh, titleEn) {
    return `
      <div class="app">
        <aside class="sidebar">
          <div class="brand"><div class="brand-mark">CAS</div><div class="brand-copy"><div class="brand-title">CARTON ARTWORK</div><div class="brand-sub">Studio · 包装印刷稿系统</div></div></div>
          <nav class="nav">
            ${navItems.map(([id,ic,zh,en]) => `<button class="nav-btn ${state.page===id?"active":""}" data-page="${id}"><span class="nav-icon">${ic}</span><span>${zh}</span><span>${en}</span></button>`).join("")}
          </nav>
          <div class="sidebar-foot">Environment<br><strong>DEV · Cloudflare-ready</strong><br>Geometry: mm<br><span class="badge ${state.apiOnline&&state.identity?"green":state.apiChecked?"amber":"blue"}">${state.apiOnline&&state.identity?"Access Connected":state.apiChecked?"Access Required / Local":"API Checking…"}</span><div class="subtle" style="margin-top:6px;word-break:break-word">${esc(identityLabel())}</div></div>
        </aside>
        <section class="main">
          <header class="topbar">
            <div class="breadcrumb">Carton Artwork Studio /</div><div class="page-title">${esc(titleZh)}</div><div class="breadcrumb">${esc(titleEn)}</div>
            <div class="spacer"></div>
            <label class="search"><input id="global-search" placeholder="搜索 SKU / Contract / Artwork…" /></label>
            <span class="dev">DEV</span><span class="subtle mono">${state.identity?esc(state.identity.email):"No Access identity"}</span><button class="icon-btn" title="Notifications">◔</button><div class="avatar">${state.identity?esc((state.identity.displayName||state.identity.email).slice(0,2).toUpperCase()):"—"}</div>
          </header>
          <main class="content">${body}</main>
        </section>
      </div>`;
  }

  function render() {
    let body = "";
    let titleZh = "", titleEn = "";
    if (state.page === "dashboard") { titleZh="工作台"; titleEn="Dashboard"; body=renderDashboard(); }
    if (state.page === "artwork") { titleZh="印刷稿"; titleEn="Artwork"; body=renderArtwork(); }
    if (state.page === "batch") { titleZh="批量生成"; titleEn="Batch Generation"; body=renderBatch(); }
    if (state.page === "templates") { titleZh="模板"; titleEn="Templates"; body=renderTemplates(); }
    if (state.page === "content") { titleZh="内容资料"; titleEn="Content Master"; body=renderContent(); }
    if (state.page === "quality") { titleZh="质量检查"; titleEn="Quality"; body=renderQuality(); }
    if (state.page === "admin") { titleZh="系统管理"; titleEn="Admin"; body=renderAdmin(); }
    app.innerHTML = shell(body, titleZh, titleEn) + (state.dialog ? renderDialog() : "");
    bind();
  }

  function renderDashboard() {
    const rows=state.remoteArtworks||[];
    const count=(status)=>rows.filter(x=>String(x.status||"").toUpperCase()===status).length;
    const cards=[
      ["Draft",count("DRAFT"),"待完善"],
      ["Pending Review",count("IN_REVIEW"),"等待审核"],
      ["Rejected",count("REJECTED"),"需要修订"],
      ["Approved",count("APPROVED"),"可生产"]
    ];
    const recent=rows.slice(0,8).map(x=>[
      x.artworkNo||"—",
      x.sku||"—",
      x.contractNo||"—",
      x.currentRevision||"—",
      `<span class="badge ${String(x.status).toUpperCase()==="APPROVED"?"green":String(x.status).toUpperCase()==="IN_REVIEW"?"blue":String(x.status).toUpperCase()==="REJECTED"?"red":"amber"}">${esc(x.status||"—")}</span>`,
      `<button class="btn small" data-open-artwork="${esc(x.id)}">Open</button>`
    ]);
    const s=summary();
    const tpl=state.templates[0];
    return `
      ${state.apiOnline&&state.identity?"":'<div class="notice warn" style="margin-bottom:12px">当前未连接 Cloudflare Access/D1，工作台不会显示伪造业务数据。</div>'}
      <div class="kpis">${cards.map(c=>`<div class="kpi"><div class="kpi-label">${c[0]}</div><div class="kpi-value">${c[1]}</div><div class="kpi-foot">${c[2]}</div></div>`).join("")}</div>
      <div class="grid2">
        <section class="card"><div class="card-head"><h3>Recent Artwork</h3><span class="subtle">D1 实时数据</span><span class="spacer"></span><button class="btn small" data-action="refresh-dashboard">Refresh</button></div>${recent.length?table(["Artwork","SKU","Contract","Rev","Status",""],recent,true):'<div class="card-body"><div class="notice">当前没有远程 Artwork 数据。</div></div>'}</section>
        <div>
          <section class="card"><div class="card-head"><h3>Current Preflight</h3><span class="subtle">当前工作稿</span></div><div class="card-body">
            <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:0"><div class="kpi"><div class="kpi-label">Errors</div><div class="kpi-value" style="color:#bc2f3b">${s.error}</div></div><div class="kpi"><div class="kpi-label">Warnings</div><div class="kpi-value" style="color:#a86b00">${s.warning}</div></div><div class="kpi"><div class="kpi-label">Passed</div><div class="kpi-value" style="color:#16835d">${s.pass}</div></div></div>
          </div></section>
          <section class="card"><div class="card-head"><h3>Template Status</h3></div><div class="card-body"><strong>${esc(tpl?.displayName||state.artwork.templateName)}</strong><div class="subtle" style="margin-top:4px">${esc(tpl?.version||state.artwork.templateVersion)} · ${esc(tpl?.status||"Local")} · ${esc(tpl?.preflightProfile||"US_SIDE_SEAL_K_ONLY_V1")}</div></div></section>
        </div>
      </div>`;
  }


  function health(name,v){ return `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between"><span>${name}</span><span class="mono">${v}%</span></div><div style="height:5px;background:#edf1f4;border-radius:5px;margin-top:5px"><i style="display:block;width:${v}%;height:100%;background:#16835d;border-radius:5px"></i></div></div>`; }

  function renderArtwork() {
    const s = summary();
    const prod = state.artwork.status === "approved" && s.blocking === 0 && blockingCommentsResolved() && permitted("productionExport") && state.apiOnline && Boolean(state.remoteArtworkId) && Boolean(state.productionReadiness?.ready);
    return `
      <div class="artwork-header">
        <div><div class="artwork-title">美线侧封箱 <span class="badge blue">US_SIDE_SEAL</span></div><div class="meta mono">Template 2026.05.20 · Revision ${state.artwork.revision} · SKU ${esc(state.artwork.sku)}</div></div>
        <div class="spacer"></div>
        <span class="badge ${state.artwork.status==="approved"?"green":state.artwork.status==="in_review"?"blue":state.artwork.status==="rejected"?"red":"amber"}">${esc(state.artwork.status.replace("_"," ").toUpperCase())}</span>
        <button class="btn" data-action="save" ${state.apiBusy||!permitted("artworkWrite")?"disabled":""}>保存草稿</button>
        <button class="btn" data-action="preflight" ${state.apiBusy||!permitted("artworkWrite")?"disabled":""}>运行检查</button>
        <button class="btn primary" data-action="submit" ${!["draft","rejected"].includes(state.artwork.status)||summary().blocking>0||state.apiBusy||!permitted("artworkWrite")?"disabled":""}>提交审核</button>
        ${state.artwork.status==="in_review"&&permitted("review")?`<button class="btn success" data-action="approve" ${!blockingCommentsResolved()||state.apiBusy?"disabled":""}>Reviewer Approve</button><button class="btn" data-action="reject" ${state.apiBusy?"disabled":""}>Reject</button>`:""}
        ${state.artwork.status==="approved"&&permitted("artworkWrite")?`<button class="btn" data-action="new-revision" ${state.apiBusy?"disabled":""}>创建新 Revision</button>`:""}
        <button class="btn" data-action="proof">导出审核稿</button>
        <button class="btn success" data-action="production" ${prod?"":"disabled"}>下载生产稿</button>
      </div>
      <div class="workspace">
        <aside class="left-panel">${renderForm()}</aside>
        <section class="center-panel">${renderTabs()}${renderTools()}${renderCenter()}</section>
        <aside class="right-panel">${renderPreflight()}</aside>
      </div>`;
  }

  function sel(v){ return state.artwork.status===v?"selected":""; }
  function isArtworkLocked(){return ["in_review","approved"].includes(state.artwork.status)||!permitted("artworkWrite");}

  function renderForm() {
    const a = state.artwork, f = factory(), c = computed();
    return `
      ${formSection("Product 产品", field("SKU","product.sku",input("sku",a.sku)))}
      ${formSection("Order 订单", field("Contract No.","order.contractNo",input("contractNo",a.contractNo)))}
      ${formSection("Package 包装", `
        <div class="row2">${field("Package Count","总包数",num("packageCount",a.packageCount))}${field("Current Package","当前包",num("currentPackage",a.currentPackage))}</div>
        <div class="row2">${field("N.W.","LBS",suffix("netWeight",a.netWeight,"LBS"))}${field("G.W.","LBS",suffix("grossWeight",a.grossWeight,"LBS"))}</div>
        <div class="row3">${field("Length","INCH",num("length",a.length))}${field("Width","INCH",num("width",a.width))}${field("Height","INCH",num("height",a.height))}</div>
        <div class="notice"><strong>Package Meas</strong><br><span class="mono">${esc(c.packageMeas)}</span></div>
      `)}
      ${formSection("Production 生产", `
        ${field("Factory","Master Data",`<select class="select" data-art="factoryId" ${isArtworkLocked()?"disabled":""}>${state.factories.map(x=>`<option value="${x.id}" ${a.factoryId===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select>`)}
        ${field("CRN","factory.crn",`<input class="input mono" readonly value="${esc(f?.crn||"")}" />`)}
        ${field("Country of Origin","derived",`<input class="input" readonly value="${esc(f?.country||"")}" />`)}
      `)}
      ${formSection("Codes 代码", `
        ${field("Barcode","Code 128-B PoC",input("barcode",a.barcode))}
        ${field("QR payload","Encoder gate pending",input("qr",a.qr))}
        ${field("CodeBlock Profile","locked component",`<select class="select" data-art="codeBlockProfile" ${isArtworkLocked()?"disabled":""}><option value="250x80" ${a.codeBlockProfile==="250x80"?"selected":""}>250 × 80 mm</option><option value="200x64" ${a.codeBlockProfile==="200x64"?"selected":""}>200 × 64 mm</option></select>`)}
        <div class="notice">🔒 Barcode + QR 为锁定组合组件。Business Mode 禁止拆分和单独移动。</div>
      `)}
    `;
  }

  function formSection(t,b){return `<section class="section"><div class="section-title">${t}</div><div class="section-body">${b}</div></section>`;}
  function field(a,b,c){return `<div class="field"><label><span>${a}</span><span class="hint">${b}</span></label>${c}</div>`;}
  function input(k,v){return `<input class="input" data-art="${k}" value="${esc(v)}" ${isArtworkLocked()?"disabled":""}/>`;}
  function num(k,v){return `<input class="input mono" type="number" step="0.01" data-art="${k}" value="${esc(v)}" ${isArtworkLocked()?"disabled":""}/>`;}
  function suffix(k,v,s){return `<div class="suffix"><input class="input mono" type="number" step="0.01" data-art="${k}" value="${esc(v)}" ${isArtworkLocked()?"disabled":""}/><span>${s}</span></div>`; }

  function renderTabs(){
    return `<div class="tabs">${[["artwork","Artwork"],["snapshot","Data Snapshot"],["compare","Revision Compare"],["comments","Comments"]].map(([id,n])=>`<button class="tab ${state.tab===id?"active":""}" data-tab="${id}">${n}</button>`).join("")}</div>`;
  }

  function renderTools(){
    return `<div class="preview-tools">
      <button class="tool" data-preview="fit">Fit</button><button class="tool" data-preview="-">−</button><span class="zoom">${Math.round(state.zoom*100)}%</span><button class="tool" data-preview="+">＋</button><button class="tool" data-preview="100">100%</button>
      <button class="tool ${state.showDieline?"active":""}" data-preview="dieline">Dieline</button>
      <button class="tool ${state.showSafe?"active":""}" data-preview="safe">Safe Zone</button>
      <button class="tool ${state.showPanels?"active":""}" data-preview="panels">Panel Labels</button>
      <span class="spacer"></span><span class="subtle mono">Single geometry source · mm</span>
    </div>`;
  }

  function renderCenter(){
    if(state.tab==="snapshot") return `<div class="snapshot"><pre>${esc(JSON.stringify(canonical(),null,2))}</pre></div>`;
    if(state.tab==="compare") return `<div class="compare"><div class="change"><strong>Factory</strong><div class="change-values"><div class="old">Zhejiang Factory B</div><div>→</div><div class="new">${esc(factory()?.name||"—")}</div></div></div><div class="change"><strong>CRN</strong><div class="change-values"><div class="old mono">3307820AB1</div><div>→</div><div class="new mono">${esc(computed().crn)}</div></div></div><div class="notice">下一阶段加入 Overlay / Difference / Flicker 图形比对。</div></div>`;
    if(state.tab==="comments") return renderComments();
    return `<div class="canvas"><div class="artboard" style="transform:scale(${state.zoom})">${dielineSvg()}</div></div>`;
  }

  function renderComments(){
    const rows=state.comments;
    const list=state.commentsLoading
      ? '<div class="notice">Loading review comments…</div>'
      : rows.length
        ? rows.map(x=>`<div class="comment"><span class="badge ${x.blocking?(x.resolved?"green":"red"):"blue"}">${x.blocking?(x.resolved?"Blocking · Resolved":"Blocking"):"Comment"}</span> <strong>${esc(x.author)}</strong><span class="subtle"> · ${esc(x.revision||"")}</span><p>${esc(x.body)}</p>${x.blocking&&!x.resolved&&permitted("review")?`<button class="btn small" data-resolve-comment="${esc(x.id)}">标记已解决</button>`:""}</div>`).join("")
        : '<div class="notice">当前 Revision 暂无审核评论。</div>';
    const composer=permitted("commentWrite")&&state.remoteArtworkId
      ? `<section class="card" style="margin-bottom:10px"><div class="card-body"><textarea id="comment-body" class="input" rows="3" placeholder="输入审核意见…"></textarea><div class="toolbar" style="margin-top:8px">${permitted("review")?'<label><input id="comment-blocking" type="checkbox"/> Blocking comment</label>':""}<span class="spacer"></span><button class="btn primary" data-action="add-comment">Add Comment</button></div></div></section>`
      : '<div class="notice warn" style="margin-bottom:10px">连接 Cloudflare Access 且兛备评论权限后可添加审核意见。</div>';
    return `<div class="comments">${composer}${list}</div>`;
  }

  function dielineSvg(mode="editor", artwork=state.artwork) {
    const a=artwork,g=D.sideSealGeometry(a),c=D.computed(a), safe=22;
    const proof=mode==="proof", production=mode==="production";
    const showD=production?false:(proof?true:state.showDieline);
    const showS=production?false:(proof?true:state.showSafe);
    const showP=production?false:(proof?true:state.showPanels);
    const vb=`-50 -50 ${g.totalWidth+100} ${g.totalHeight+100}`;
    const cut=showD?`<g fill="none" stroke="#202a34" stroke-width="1.2"><rect x="${g.H}" y="0" width="${g.L}" height="${g.totalHeight}"/><rect x="0" y="${g.H}" width="${g.totalWidth}" height="${g.W}"/><rect x="0" y="${g.H+g.W+g.H}" width="${g.totalWidth}" height="${g.W}"/></g>`:"";
    const crease=showD?`<g stroke="#3978b8" stroke-width=".8" stroke-dasharray="8 5"><line x1="${g.H}" y1="0" x2="${g.H}" y2="${g.totalHeight}"/><line x1="${g.H+g.L}" y1="0" x2="${g.H+g.L}" y2="${g.totalHeight}"/>${[g.H,g.H+g.W,g.H+g.W+g.H,g.H+g.W+g.H+g.W].map(y=>`<line x1="0" y1="${y}" x2="${g.totalWidth}" y2="${y}"/>`).join("")}</g>`:"";
    const safeBox=showS?`<rect x="${g.H+safe}" y="${g.H+g.W+g.H+safe}" width="${g.L-safe*2}" height="${g.W-safe*2}" fill="none" stroke="#15976d" stroke-dasharray="6 4"/>`:"";
    const labels=showP?g.panels.map(p=>`<text x="${p.x+p.w/2}" y="${p.y+p.h/2}" text-anchor="middle" fill="#aab4be" font-size="16" font-family="Arial">${p.id}</text>`).join(""):"";
    const bx=g.H+45, by=g.H+g.W+g.H+68;
    const code=renderCodeBlock(g.H+g.L-320,g.H+g.W+g.H+g.W-118, a.codeBlockProfile, a);
    const note=c.packageNote?`<text x="${bx}" y="${by+108}" font-size="12" font-family="Arial" fill="#000">${esc(c.packageNote)}</text>`:"";
    const watermark=proof?`<text x="${g.H+g.L/2}" y="${g.totalHeight/2}" text-anchor="middle" transform="rotate(-15 ${g.H+g.L/2} ${g.totalHeight/2})" font-family="Arial" font-size="46" fill="#000" opacity=".12">NOT FOR PRODUCTION</text>`:"";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${g.totalWidth}mm" height="${g.totalHeight}mm" aria-label="US side seal carton artwork">
      <rect x="-50" y="-50" width="${g.totalWidth+100}" height="${g.totalHeight+100}" fill="#fff"/>
      ${cut}${crease}${safeBox}${labels}
      <g fill="#000" font-family="Arial,Helvetica,sans-serif">
        <text x="${bx}" y="${by}" font-size="22" font-weight="700">${esc(a.sku)}</text>
        <text x="${bx}" y="${by+24}" font-size="14">N.W. ${esc(a.netWeight)} LBS   G.W. ${esc(a.grossWeight)} LBS</text>
        <text x="${bx}" y="${by+44}" font-size="14">Package Meas ${esc(c.packageMeas)}</text>
        <text x="${bx}" y="${by+64}" font-size="14">CRN ${esc(c.crn)}</text>
        <text x="${bx}" y="${by+84}" font-size="14">Contract No ${esc(a.contractNo)}   ·   ${esc(c.originText)}   ·   US</text>
        ${note}
        <g transform="translate(${g.H*.55} ${g.H+g.W*.56}) rotate(90)"><text font-size="14">CRN ${esc(c.crn)}</text></g>
      </g>
      ${code}${watermark}
    </svg>`;
  }

  function renderCodeBlock(x,y,profile,artwork=state.artwork){
    const dims=D.codeBlockDimensions(profile), b=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
    const scale=Math.min((dims.w-72)/b.widthMm,1.15);
    const bars=b.bars.map(r=>`<rect x="${(x+10+r.x*scale).toFixed(2)}" y="${y+14}" width="${(r.w*scale).toFixed(2)}" height="${r.h}" fill="#000"/>`).join("");
    const qm=C.qrMatrix(artwork.qr,"M").matrix, qSize=Math.min(54,dims.h-14), quiet=4, mod=qSize/(qm.length+quiet*2), qx=x+dims.w-qSize-8,qy=y+7;
    const qr=qm.flatMap((row,rr)=>row.map((v,cc)=>v?`<rect x="${(qx+(cc+quiet)*mod).toFixed(2)}" y="${(qy+(rr+quiet)*mod).toFixed(2)}" width="${mod.toFixed(2)}" height="${mod.toFixed(2)}" fill="#000"/>`:"")).join("");
    return `<g><rect x="${x}" y="${y}" width="${dims.w}" height="${dims.h}" rx="2" fill="#fff" stroke="#8d98a3"/>${bars}<text x="${x+12}" y="${y+48}" font-family="Arial" font-size="8">${esc(artwork.barcode)}</text>${qr}<text x="${x+8}" y="${y+dims.h-5}" font-family="Arial" font-size="7" fill="#555">🔒 Locked CodeBlock · QR M · standards encoder</text></g>`;
  }

  function renderPreflight(){
    const groups=checks(),s=summary();
    return `<div class="preflight-summary"><div class="pf-stat"><div class="pf-num" style="color:#bc2f3b">${s.error}</div><div class="pf-label">Errors</div></div><div class="pf-stat"><div class="pf-num" style="color:#a86b00">${s.warning}</div><div class="pf-label">Warnings</div></div><div class="pf-stat"><div class="pf-num" style="color:#16835d">${s.pass}</div><div class="pf-label">Passed</div></div></div>
      <div style="padding:10px;border-bottom:1px solid #e8edf2"><button class="btn primary" style="width:100%" data-action="preflight" ${state.pfBusy?"disabled":""}>${state.pfBusy?"Checking…":"Run Preflight"}</button></div>
      ${Object.entries(groups).map(([name,items])=>`<section class="pf-group"><div class="pf-group-title">${name}</div>${items.map(i=>`<div class="pf-item"><i class="pf-dot ${i.status}"></i><div><div class="pf-title">${esc(i.title)} ${i.blocking&&i.status==="error"?'<span class="badge red">BLOCKING</span>':""}</div><div class="pf-detail">${esc(i.detail)}</div></div></div>`).join("")}</section>`).join("")}`;
  }

  function renderBatch(){
    const steps=["Upload","Mapping","Validate","Review","Generate"];
    const stats=B.summarize(state.batchReview);
    const review=state.batchReview.slice(0,100);
    const mapping=state.batchMapping?Object.entries(state.batchMapping):[];
    return `
      <div class="stepper">${steps.map((x,i)=>`<div class="step ${i<state.batchStep?"done":i===state.batchStep?"active":""}">${i+1}. ${x}</div>`).join("")}</div>
      <section class="card"><div class="card-head"><h3>Packing List Import</h3><span class="subtle">.xlsx / .csv</span><span class="spacer"></span><span class="badge blue">US Packing List Default</span></div><div class="card-body">
        <label class="dropzone"><input id="batch-file" type="file" accept=".xlsx,.csv" hidden/><strong>拖入 Packing List 或点击选择</strong><div class="subtle" style="margin-top:6px">Header Detection · Alias · Fill Down · TOTAL Stop · Cell-level errors</div>${state.batchSource?`<div style="margin-top:9px" class="badge green">${esc(state.batchSource)}</div>`:""}</label>
        <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-action="dry-run" ${state.batchRecords.length&&permitted("batchWrite")?"":"disabled"}>Dry Run</button><button class="btn" data-action="download-errors" ${stats.failed?"":"disabled"}>Download Error Rows</button><button class="btn" data-action="save-mapping" ${mapping.length&&state.apiOnline&&permitted("batchWrite")?"":"disabled"}>Save Mapping Profile</button><button class="btn success" data-action="batch-generate" ${stats.passed&&!state.batchGenerating&&permitted("batchWrite")?"":"disabled"}>${state.batchGenerating?"Generating…":"Generate Passed Proofs"}</button></div>
      </div></section>
      ${state.batchSource?`<div class="kpis" style="margin-top:12px"><div class="kpi"><div class="kpi-label">TOTAL</div><div class="kpi-value">${stats.total}</div></div><div class="kpi"><div class="kpi-label">PASSED</div><div class="kpi-value" style="color:#16835d">${stats.passed}</div></div><div class="kpi"><div class="kpi-label">FAILED</div><div class="kpi-value" style="color:#bc2f3b">${stats.failed}</div></div><div class="kpi"><div class="kpi-label">MAPPING</div><div class="kpi-value">${mapping.length}</div><div class="kpi-foot">fields detected</div></div></div>`:""}
      ${mapping.length?`<section class="card" style="margin-top:12px"><div class="card-head"><h3>Detected Mapping</h3><span class="subtle">自动表头映射，可保存为 Mapping Profile（D1 schema 已预留）</span></div>${table(["Canonical Field","Excel Column"],mapping.map(([field,col])=>[field,`${X.columnLabel(col)} · column ${Number(col)+1}`]))}</section>`:""}
      <section class="card" style="margin-top:12px"><div class="card-head"><h3>Import Review</h3><span class="subtle">真实行级 Preflight · 最多显示前 100 行</span></div>${review.length?table(["Row","SKU","Status","Issue"],review.map(r=>[r.row,r.sku,`<span class="badge ${r.status==="PASS"?"green":"red"}">${r.status}</span>`,r.issue]),true):`<div class="card-body"><div class="notice">尚未载入文件。导入后系统会先做 Excel 解析，再将每一行转换为 Canonical Artwork Data 并运行阻断检查。</div></div>`}</section>`;
  }

  function renderTemplates(){
    const tabs=["overview","variables","rules","layers","tests","versions"];
    const latest=state.templateVersions[0]||state.templates[0]||null;
    const status=latest?.status||"NO DATA";
    const badge=status==="APPROVED"?"green":status==="SUBMITTED"?"blue":status==="REJECTED"?"red":"amber";
    const title=state.templateVersionsMeta?.displayName||state.artwork.templateName||"美线侧封箱";
    const code=state.templateVersionsMeta?.code||state.artwork.templateCode||"US_SIDE_SEAL";
    return `<div class="split"><div class="subnav">${tabs.map(t=>`<button class="${state.templateTab===t?"active":""}" data-template-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}</div><div>
      <section class="card"><div class="card-head"><h3>${esc(title)}</h3><span class="badge ${badge}">${esc(status)}</span><span class="spacer"></span><span class="mono subtle">${esc(code)}${latest?.version?" · "+esc(latest.version):""}</span></div><div class="card-body">${templateBody()}</div></section>
      ${state.templateEditor?renderTemplateEditor():""}
    </div></div>`;
  }

  function templateBody(){
    if(state.templateTab==="variables") return table(["Variable","Path","Type","Required"],[
      ["SKU","product.sku","string","Yes"],["N.W.","package.netWeight","number","Yes"],["G.W.","package.grossWeight","number","Yes"],["Dimensions","package.{length,width,height}","number","Yes"],["Factory","factory.id","factory","Yes"],["CRN","factory.crn","linked","Yes"],["Origin","origin.country","computed","Yes"],["Barcode","codes.barcode","barcode","Yes"],["QR","codes.qr","string","Yes"]
    ]);
    if(state.templateTab==="rules") return table(["Rule","Condition","Action"],[
      ["Multi-package notice","package.total > 1","SHOW package notice"],["Origin text","factory.country","SET Made in {country}"],["CRN binding","factory.crn","SYNC 2 placements"],["US units","template=US_SIDE_SEAL","LBS / INCH"],["CodeBlock profile","250x80 or 200x64","LOCK composite"]
    ]);
    if(state.templateTab==="layers") return table(["Layer","Editor","Proof","Production","Locked"],[
      ["DIELINE","✓","✓","Profile","Yes"],["CREASE","✓","✓","Profile","Yes"],["SAFE_ZONE","✓","✓","✕","Yes"],["STATIC_ART","✓","✓","✓","Yes"],["VARIABLE_ART","✓","✓","✓","Business"],["CODE","✓","✓","✓","Yes"],["REVIEW","✓","✓","✕","No"]
    ]);
    if(state.templateTab==="tests") return table(["Test","Scenario","Expected"],[
      ["US-001","single package","notice hidden"],["US-002","multi package","notice visible"],["US-008","factory changed","CRN x2 synchronized"],["US-011","GW < NW","blocking error"],["US-012","package index > total","blocking error"],["US-016","K-only profile","pass"]
    ]);
    if(state.templateTab==="versions"){
      const rows=state.templateVersions.map(v=>[
        v.version,
        `<span class="badge ${v.status==="APPROVED"?"green":v.status==="SUBMITTED"?"blue":v.status==="REJECTED"?"red":"amber"}">${esc(v.status)}</span>`,
        v.effectiveAt||"—",
        v.createdBy||"—",
        v.submittedBy||"—",
        v.approvedBy||"—",
        `<button class="btn small" data-edit-template-version="${esc(v.id)}">Open</button>`
      ]);
      return `${permitted("templateWrite")?`<div class="toolbar" style="margin-bottom:10px"><input id="new-template-version" class="input mono" style="max-width:180px" placeholder="e.g. 2026.10.01"/><input id="new-template-effective" class="input" style="max-width:170px" placeholder="YYYY-MM-DD"/><button class="btn primary" data-action="create-template-version">Create Draft from Approved</button></div>`:""}${rows.length?table(["Version","Status","Effective","Created By","Submitted By","Approved By",""],rows,true):'<div class="notice warn">尚未从 D1 读取 Template Versions。</div>'}`;
    }
    const latest=state.templateVersions.find(v=>v.status==="APPROVED")||state.templateVersions[0]||state.templates[0];
    return `<div class="row2"><div><strong>Template Code</strong><p class="mono">${esc(state.templateVersionsMeta?.code||state.artwork.templateCode)}</p><strong>Preflight Profile</strong><p class="mono">${esc(latest?.preflightProfile||"US_SIDE_SEAL_K_ONLY_V1")}</p><strong>Print</strong><p>Single black / K-only</p></div><div><strong>Geometry</strong><p>Parametric mm model</p><strong>Source Calibration</strong><p>200 mm vector reference ≈ 199.46 mm</p><strong>CodeBlock</strong><p>250×80 / 200×64 mm</p></div></div>`;
  }

  function renderTemplateEditor(){
    const v=state.templateEditor;
    const editable=["DRAFT","REJECTED"].includes(v.status)&&permitted("templateWrite");
    const submitted=v.status==="SUBMITTED";
    return `<section class="card" style="margin-top:12px"><div class="card-head"><h3>Template Version ${esc(v.version)}</h3><span class="badge ${v.status==="APPROVED"?"green":v.status==="SUBMITTED"?"blue":v.status==="REJECTED"?"red":"amber"}">${esc(v.status)}</span><span class="spacer"></span><button class="btn small" data-action="close-template-editor">Close</button></div><div class="card-body">
      <div class="row2"><div class="field"><label>Effective</label><input id="template-effective" class="input" value="${esc(v.effectiveAt||"")}" ${editable?"":"disabled"}/></div><div class="field"><label>Preflight Profile</label><input id="template-preflight-profile" class="input mono" value="${esc(v.preflightProfile||"")}" ${editable?"":"disabled"}/></div></div>
      <div class="field"><label>Notes</label><input id="template-notes" class="input" value="${esc(v.notes||"")}" ${editable?"":"disabled"}/></div>
      <div class="field"><label>Template JSON</label><textarea id="template-json-editor" class="input mono" rows="18" ${editable?"":"disabled"}>${esc(prettyTemplateJson(v.templateJson))}</textarea></div>
      <div class="notice">Schema gate: mm geometry · K print profile · locked 250×80 / 200×64 CodeBlock · CRN placement rule.</div>
      <div class="toolbar" style="justify-content:flex-end;margin-top:10px">${editable?'<button class="btn" data-action="save-template-draft">Save Draft</button><button class="btn primary" data-action="submit-template-version">Submit for Approval</button>':""}${submitted&&permitted("templateApprove")?'<button class="btn" data-action="reject-template-version">Reject</button><button class="btn success" data-action="approve-template-version">Approve</button>':""}</div>
      <div class="subtle" style="margin-top:8px">Created: ${esc(v.createdBy||"—")} · Submitted: ${esc(v.submittedBy||"—")} · Approved: ${esc(v.approvedBy||"—")}</div>
      ${v.lastComment?`<div class="notice warn" style="margin-top:8px">Last review: ${esc(v.lastDecision||"")} · ${esc(v.lastComment)}</div>`:""}
    </div></section>`;
  }

  function prettyTemplateJson(value){
    try{
      const data=typeof value==="string"?JSON.parse(value):value;
      return JSON.stringify(data||{},null,2);
    }catch{return String(value||"{}");}
  }

  function contentNamespace(){
    return ({customers:"CUSTOMER",products:"PRODUCT",countries:"COUNTRY",shared:"SHARED"})[state.contentTab]||null;
  }

  function renderContent(){
    const tabs=["factories","customers","products","countries","shared"];
    let body="";
    if(state.contentTab==="factories"){
      const factories=(state.apiOnline&&state.identity?state.factories:[]).map(f=>[
        f.name,
        `<span class="mono">${esc(f.crn)}</span>`,
        f.country,
        f.effectiveAt||f.effective||"—",
        permitted("admin")?`<button class="btn small" data-impact="${esc(f.id)}">Impact / Edit</button>`:"—"
      ]);
      body=factories.length
        ? table(["Factory","CRN","Country","Effective",""],factories,true)
        : '<div class="card-body"><div class="notice warn">Cloudflare Access / D1 未连接或当前没有 Factory Master 数据。这里不显示演示数据。</div></div>';
    }else{
      const ns=contentNamespace();
      const rows=(state.referenceRecords||[]).filter(x=>x.namespace===ns).map(x=>[
        x.code,
        x.displayName,
        x.effectiveAt||"—",
        `<span class="badge ${x.status==="ACTIVE"?"green":"amber"}">${esc(x.status)}</span>`,
        `<span class="mono subtle">${esc(JSON.stringify(x.data||{}))}</span>`
      ]);
      const creator=permitted("referenceWrite")?`
        <div class="card-body" style="border-bottom:1px solid #e5e9ee">
          <div class="row2">
            <div class="field"><label>Code</label><input id="master-code" class="input mono" placeholder="${ns}_CODE"/></div>
            <div class="field"><label>Display Name</label><input id="master-name" class="input" placeholder="Name"/></div>
          </div>
          <div class="row2">
            <div class="field"><label>Effective</label><input id="master-effective" class="input" placeholder="YYYY-MM-DD"/></div>
            <div class="field"><label>Data JSON</label><textarea id="master-json" class="input mono" rows="3">{}</textarea></div>
          </div>
          <div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="create-reference">Create ${ns}</button></div>
        </div>`:"";
      body=`${creator}${rows.length?table(["Code","Name","Effective","Status","Data"],rows,true):'<div class="card-body"><div class="notice">当前命名空间暂无记录。</div></div>'}`;
    }
    return `<div class="tabs" style="border:1px solid #d8dee6;border-radius:7px 7px 0 0">${tabs.map(t=>`<button class="tab ${state.contentTab===t?"active":""}" data-content-tab="${t}">${t}</button>`).join("")}</div><section class="card" style="border-radius:0 0 7px 7px">${body}</section>`;
  }

  function renderPolicyReadiness(){
    const readiness=state.productionReadiness||{ready:false,gates:[]};
    const cards=(state.productionPolicies||[]).map(p=>{
      const badge=p.status==="APPROVED"?"green":p.status==="SUBMITTED"?"blue":p.status==="REJECTED"?"red":"amber";
      const editable=["DRAFT","REJECTED"].includes(p.status)&&permitted("productionPolicyWrite");
      const reviewable=p.status==="SUBMITTED"&&permitted("productionPolicyApprove");
      return `<section class="card" style="margin-top:10px">
        <div class="card-head"><h3>${esc(p.displayName)}</h3><span class="badge ${badge}">${esc(p.status)}</span><span class="spacer"></span><span class="mono subtle">${esc(p.code)}</span></div>
        <div class="card-body">
          <div class="field"><label>Config JSON</label><textarea class="input mono" rows="5" id="policy-config-${esc(p.code)}" ${editable?"":"disabled"}>${esc(JSON.stringify(p.config||{},null,2))}</textarea></div>
          <div class="field"><label>Notes</label><input class="input" id="policy-notes-${esc(p.code)}" value="${esc(p.notes||"")}" ${editable?"":"disabled"}/></div>
          <div class="subtle">Submitted: ${esc(p.submittedBy||"—")} · Approved: ${esc(p.approvedBy||"—")}</div>
          <div class="toolbar" style="justify-content:flex-end;margin-top:10px">
            ${editable?`<button class="btn" data-policy-action="save" data-policy-code="${esc(p.code)}">Save Draft</button><button class="btn primary" data-policy-action="submit" data-policy-code="${esc(p.code)}">Submit</button>`:""}
            ${reviewable?`<button class="btn" data-policy-action="reject" data-policy-code="${esc(p.code)}">Reject</button><button class="btn success" data-policy-action="approve" data-policy-code="${esc(p.code)}">Approve</button>`:""}
          </div>
          ${p.lastComment?`<div class="notice warn" style="margin-top:8px">Last review: ${esc(p.lastDecision||"")} · ${esc(p.lastComment)}</div>`:""}
        </div>
      </section>`;
    }).join("");
    const gates=(readiness.gates||[]).map(g=>[
      g.displayName||g.code,
      `<span class="badge ${g.approved&&g.valid?"green":"red"}">${g.approved&&g.valid?"READY":"BLOCKED"}</span>`,
      g.status,
      (g.errors||[]).join(" · ")||"—"
    ]);
    return `<div class="card-body"><div class="notice ${readiness.ready?"":"warn"}"><strong>Production Readiness: ${readiness.ready?"READY":"BLOCKED"}</strong><br>Barcode / QR / Font / PDF/X 四个业务政策必须全部通过四眼审批且配置有效，Production Export 才会解锁。</div></div>
      ${gates.length?table(["Gate","Result","Policy Status","Validation"],gates,true):""}
      ${cards||'<div class="card-body"><div class="notice">D1 尚无 Production Policy 数据。</div></div>'}`;
  }

  function compareValue(value){
    if(value===undefined) return "—";
    if(value===null) return "null";
    if(typeof value==="object") return JSON.stringify(value);
    return String(value);
  }

  function renderRevisionCompare(){
    if(!state.remoteArtworkId){
      return '<div class="card-body"><div class="notice">先从 Dashboard 打开一个 D1 Artwork，才能比较历史 Revision。</div></div>';
    }
    const revisions=state.remoteRevisions||[];
    if(revisions.length<2){
      return '<div class="card-body"><div class="notice">当前 Artwork 少于 2 个持久化 Revision，暂无可比较版本。</div></div>';
    }
    const options=revisions.map(r=>`<option value="${esc(r.revision)}">${esc(r.revision)} · ${esc(r.status||"")}</option>`).join("");
    const compare=state.revisionCompare;
    const rows=(compare?.changes||[]).map(x=>[
      `<span class="mono">${esc(x.path)}</span>`,
      `<span class="mono subtle">${esc(compareValue(x.from))}</span>`,
      `<span class="mono subtle">${esc(compareValue(x.to))}</span>`,
      `<span class="badge ${x.change==="ADDED"?"green":x.change==="REMOVED"?"red":"amber"}">${esc(x.change)}</span>`
    ]);
    return `
      <div class="card-body">
        <div class="row2">
          <div class="field"><label>From Revision</label><select id="compare-from" class="input">${options}</select></div>
          <div class="field"><label>To Revision</label><select id="compare-to" class="input">${options}</select></div>
        </div>
        <div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="run-compare">Compare Canonical Data</button></div>
        ${compare?`<div class="kpis" style="margin-top:12px"><div class="kpi"><div class="kpi-label">TOTAL CHANGES</div><div class="kpi-value">${compare.total}</div></div><div class="kpi"><div class="kpi-label">CHANGED</div><div class="kpi-value">${compare.changed}</div></div><div class="kpi"><div class="kpi-label">ADDED</div><div class="kpi-value">${compare.added}</div></div><div class="kpi"><div class="kpi-label">REMOVED</div><div class="kpi-value">${compare.removed}</div></div></div>`:""}
      </div>
      ${compare?(rows.length?table(["Canonical Path","From","To","Change"],rows,true):'<div class="card-body"><div class="notice">两个 Revision 的 Canonical Data 完全一致。</div></div>'):'<div class="card-body"><div class="notice">选择两个 Revision 后执行 Compare。比较基于冻结的 Canonical Snapshot，不使用演示结果。</div></div>'}
    `;
  }

  function renderQuality(){
    const tabs=["profiles","reports","readiness","compare"];
    let body="";
    if(state.qualityTab==="profiles") body=table(["Profile","Version","Status","Checks"],[["US_SIDE_SEAL_K_ONLY_V1","1","<span class='badge green'>Locked</span>","Data / Layout / Codes / Print"]],true);
    if(state.qualityTab==="reports"){
      const s=summary();
      const recent=(state.auditLogs||[]).filter(x=>x.objectType==="PREFLIGHT").slice(0,50).map(x=>[
        x.actor||"—",x.createdAt||"—",x.action||"RUN",x.objectId||"—",x.reason||"—"
      ]);
      body=`<div class="card-body"><div class="kpis" style="margin:0"><div class="kpi"><div class="kpi-label">Current Errors</div><div class="kpi-value" style="color:#bc2f3b">${s.error}</div></div><div class="kpi"><div class="kpi-label">Warnings</div><div class="kpi-value" style="color:#a86b00">${s.warning}</div></div><div class="kpi"><div class="kpi-label">Passed</div><div class="kpi-value" style="color:#16835d">${s.pass}</div></div></div></div>${recent.length?table(["Actor","Time","Action","Preflight","Reason"],recent):`<div class="card-body"><div class="notice">暂无可读取的持久化 Preflight Audit 记录。当前工作稿检查结果显示在上方。</div></div>`}`;
    }
    if(state.qualityTab==="readiness") body=renderPolicyReadiness();
    if(state.qualityTab==="compare") body=renderRevisionCompare();
    return `<div class="tabs" style="border:1px solid #d8dee6;border-radius:7px 7px 0 0">${tabs.map(t=>`<button class="tab ${state.qualityTab===t?"active":""}" data-quality-tab="${t}">${t}</button>`).join("")}</div><section class="card" style="border-radius:0 0 7px 7px">${body}</section>`;
  }

  function renderAdmin(){
    const roles=["OPERATOR","REVIEWER","TEMPLATE_DESIGNER","TEMPLATE_APPROVER","ADMIN"];
    if(!permitted("admin")) return '<section class="card"><div class="card-body"><div class="notice warn">Admin 权限由 Cloudflare Access 身份 + D1 RBAC 决定。当前用户没有系统管理权限。</div></div></section>';
    const userRows=state.adminUsers.map(u=>[
      u.email,
      u.displayName||"—",
      u.status,
      roles.map(role=>`<label style="display:inline-block;margin:2px 8px 2px 0"><input type="checkbox" data-role-user="${esc(u.id)}" data-role="${role}" ${u.roles?.includes(role)?"checked":""}/> ${role}</label>`).join(""),
      `<button class="btn small" data-save-user-roles="${esc(u.id)}">Save Roles</button>`
    ]);
    const auditRows=(state.auditLogs||[]).slice(0,100).map(x=>[
      x.actor||"—",x.createdAt||"—",x.objectType||"—",x.action||"—",x.objectId||"—",x.reason||"—"
    ]);
    return `
      <section class="card"><div class="card-head"><h3>Access / RBAC Users</h3><span class="subtle">Cloudflare Access 提供身份，D1 控制应用角色</span></div><div class="card-body">
        <div class="row2"><div class="field"><label>Email</label><input id="admin-user-email" class="input" placeholder="name@company.com"/></div><div class="field"><label>Display Name</label><input id="admin-user-name" class="input" placeholder="Name"/></div></div>
        <div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="create-user">Create User</button></div>
      </div>${table(["Email","Name","Status","Roles",""],userRows,true)}</section>
      <section class="card" style="margin-top:12px"><div class="card-head"><h3>Four-eyes Approval</h3></div><div class="card-body"><div class="notice">提交人与 Reviewer 必须是不同身份。即使拥有 Admin 角色，也不能批准自己提交的同一 Revision。</div></div></section>
      <section class="card" style="margin-top:12px"><div class="card-head"><h3>Audit Log</h3><span class="subtle">D1 immutable-style operation trail</span><span class="spacer"></span><button class="btn small" data-action="refresh-audit">Refresh</button></div>${auditRows.length?table(["Actor","Time","Object","Action","ID","Reason"],auditRows):'<div class="card-body"><div class="notice">暂无 Audit Log。</div></div>'}</section>`;
  }

  function table(headers, rows, html=false){
    return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${html?String(v):esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderDialog(){
    if(state.dialog!=="impact"||!state.impact) return "";
    const i=state.impact, f=i.factory||{}, a=i.currentArtworks||{};
    const canEdit=permitted("admin");
    return `<div class="dialog-backdrop"><div class="dialog"><div class="dialog-head">Factory Impact Analysis</div><div class="dialog-body">
      <div class="row2"><div class="field"><label>Factory</label><input id="impact-factory-name" class="input" value="${esc(f.name||"")}" ${canEdit?"":"disabled"}/></div><div class="field"><label>CRN</label><input id="impact-factory-crn" class="input mono" value="${esc(f.crn||"")}" ${canEdit?"":"disabled"}/></div></div>
      <div class="row2"><div class="field"><label>Country</label><input id="impact-factory-country" class="input" value="${esc(f.country||"")}" ${canEdit?"":"disabled"}/></div><div class="field"><label>Effective</label><input id="impact-factory-effective" class="input" value="${esc(f.effectiveAt||"")}" ${canEdit?"":"disabled"}/></div></div>
      <div class="impact" style="margin-top:12px"><div><strong>${a.total||0}</strong>current artworks</div><div><strong>${a.draft||0}</strong>draft</div><div><strong>${a.inReview||0}</strong>in review</div><div><strong>${a.approved||0}</strong>approved</div><div><strong>${a.approvedUnproduced||0}</strong>approved-unproduced</div><div><strong>${i.revisionCount||0}</strong>historical revisions</div></div>
      <div class="notice warn" style="margin-top:12px">${esc(i.note||"Historical Revision snapshots remain frozen.")}</div>
      <div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-action="close-dialog">Close</button>${canEdit?'<button class="btn primary" data-action="save-factory">Save Factory Master</button>':""}</div>
    </div></div></div>`;
  }

  function bind(){
    document.querySelectorAll("[data-page]").forEach(b=>b.onclick=async()=>{state.page=b.dataset.page;render();if(state.page==="dashboard")await loadRemoteArtworks();if(state.page==="templates")await loadTemplateVersions();if(state.page==="content")await loadReferenceData();if(state.page==="admin"){await loadAdminUsers();await loadAudit();}});
    document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=async()=>{state.tab=b.dataset.tab;render();if(state.tab==="comments")await loadComments();});
    document.querySelectorAll("[data-template-tab]").forEach(b=>b.onclick=async()=>{state.templateTab=b.dataset.templateTab;render();if(state.templateTab==="versions")await loadTemplateVersions();});
    document.querySelectorAll("[data-content-tab]").forEach(b=>b.onclick=async()=>{state.contentTab=b.dataset.contentTab;render();if(state.contentTab!=="factories")await loadReferenceMasters();});
    document.querySelectorAll("[data-quality-tab]").forEach(b=>b.onclick=async()=>{state.qualityTab=b.dataset.qualityTab;render();if(state.qualityTab==="reports")await loadAudit();if(state.qualityTab==="readiness")await loadProductionReadiness();if(state.qualityTab==="compare"&&state.remoteArtworkId&&!state.remoteRevisions.length)await refreshRemoteRevisionMetadata();});
    document.querySelectorAll("[data-impact]").forEach(b=>b.onclick=()=>loadFactoryImpact(b.dataset.impact));
    document.querySelectorAll("[data-art]").forEach(el=>{
      el.oninput=el.onchange=()=>{
        const k=el.dataset.art;
        state.artwork[k]=el.type==="number"?Number(el.value):el.value;
        render();
      };
    });
    document.querySelectorAll("[data-preview]").forEach(b=>b.onclick=()=>{
      const a=b.dataset.preview;
      if(a==="+")state.zoom=Math.min(1.5,state.zoom+.1);
      if(a==="-")state.zoom=Math.max(.25,state.zoom-.1);
      if(a==="100")state.zoom=1;
      if(a==="fit")state.zoom=.68;
      if(a==="dieline")state.showDieline=!state.showDieline;
      if(a==="safe")state.showSafe=!state.showSafe;
      if(a==="panels")state.showPanels=!state.showPanels;
      render();
    });
    document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>handleAction(b.dataset.action));
    document.querySelectorAll("[data-resolve-comment]").forEach(b=>b.onclick=()=>resolveComment(b.dataset.resolveComment));
    document.querySelectorAll("[data-save-user-roles]").forEach(b=>b.onclick=()=>saveUserRoles(b.dataset.saveUserRoles));
    document.querySelectorAll("[data-open-artwork]").forEach(b=>b.onclick=()=>openRemoteArtwork(b.dataset.openArtwork));
    document.querySelectorAll("[data-edit-template-version]").forEach(b=>b.onclick=()=>openTemplateVersion(b.dataset.editTemplateVersion));
    document.querySelectorAll("[data-policy-action]").forEach(b=>b.onclick=()=>handlePolicyAction(b.dataset.policyAction,b.dataset.policyCode));
    const search=document.getElementById("global-search");
    if(search) search.onkeydown=async(e)=>{if(e.key==="Enter"){state.page="dashboard";await loadRemoteArtworks(search.value.trim());}};
    const file=document.getElementById("batch-file");
    if(file) file.onchange=async()=>{ if(file.files?.[0]) await importBatch(file.files[0]); };
  }

  async function handleAction(action){
    if(action==="save") return saveDraft();
    if(action==="preflight") return runPreflightAction();
    if(action==="submit") return submitForReview();
    if(action==="approve") return reviewDecision("APPROVE");
    if(action==="reject") return reviewDecision("REJECT");
    if(action==="new-revision") return createNewRevision();
    if(action==="add-comment") return addComment();
    if(action==="create-user") return createAdminUser();
    if(action==="create-reference") return createReferenceRecord();
    if(action==="create-template-version") return createTemplateVersion();
    if(action==="save-template-draft") return saveTemplateDraft();
    if(action==="submit-template-version") return submitTemplateVersion();
    if(action==="approve-template-version") return decideTemplateVersion("APPROVE");
    if(action==="reject-template-version") return decideTemplateVersion("REJECT");
    if(action==="close-template-editor"){state.templateEditor=null;render();return;}
    if(action==="refresh-dashboard") return loadRemoteArtworks();
    if(action==="refresh-audit") return loadAudit();
    if(action==="run-compare") return loadRevisionCompare();
    if(action==="save-factory") return saveFactoryMaster();
    if(action==="proof") return exportProof();
    if(action==="production") return exportProduction();
    if(action==="dry-run"){
      state.batchReview=B.buildReview(state.batchRecords,state.batchIssues,D,{defaults:D.defaultArtwork,factories:state.factories,codes:C});
      state.batchStep=Math.max(state.batchStep,3);render();
      const s=B.summarize(state.batchReview);toast(`Dry Run: ${s.passed} passed / ${s.failed} failed`,s.failed?"error":"success");
    }
    if(action==="download-errors"){downloadText("failed_rows.csv",B.failedRowsCsv(state.batchReview),"text/csv;charset=utf-8");}
    if(action==="batch-generate") return exportBatchProofs();
    if(action==="save-mapping") return saveMappingProfile();
    if(action==="close-dialog"){state.dialog=null;state.impact=null;render();}
  }

  function activeTemplateId(){
    return state.templateVersionsMeta?.id || state.templates.find(t=>t.code===state.artwork.templateCode)?.id || state.templates[0]?.id || null;
  }

  async function loadTemplateVersions(renderAfter=true){
    if(!state.apiOnline||!state.identity){
      state.templateVersions=[];
      state.templateVersionsMeta=null;
      state.templateEditor=null;
      if(renderAfter) render();
      return;
    }
    const templateId=activeTemplateId();
    if(!templateId){
      state.templateVersions=[];
      state.templateVersionsMeta=null;
      if(renderAfter) render();
      return;
    }
    try{
      const response=await api.templateVersions(templateId);
      state.templateVersionsMeta=response.data?.template||null;
      state.templateVersions=response.data?.versions||[];
      if(state.templateEditor){
        state.templateEditor=state.templateVersions.find(v=>v.id===state.templateEditor.id)||null;
      }
    }catch(e){
      state.templateVersions=[];
      toast(e.message||String(e),"error");
    }
    if(renderAfter) render();
  }

  function openTemplateVersion(id){
    const version=state.templateVersions.find(v=>v.id===id);
    if(!version){toast("Template Version not found.","error");return;}
    state.templateEditor={...version};
    render();
  }

  async function createTemplateVersion(){
    if(!permitted("templateWrite")){toast("需要 Template Designer / Admin 权限。","error");return;}
    const templateId=activeTemplateId();
    const version=document.getElementById("new-template-version")?.value?.trim()||"";
    const effectiveAt=document.getElementById("new-template-effective")?.value?.trim()||null;
    if(!templateId||!version){toast("请输入新 Template Version。","error");return;}
    const base=state.templateVersions.find(v=>v.status==="APPROVED")||state.templateVersions[0]||null;
    try{
      const response=await api.createTemplateVersion(templateId,{
        version,
        effectiveAt,
        baseVersionId:base?.id||null,
        preflightProfile:base?.preflightProfile||"US_SIDE_SEAL_K_ONLY_V1",
        notes:"Draft cloned from "+(base?.version||"template baseline")
      });
      await loadTemplateVersions(false);
      state.templateTab="versions";
      state.templateEditor=state.templateVersions.find(v=>v.id===response.data.id)||null;
      render();
      toast(`${version} Draft 已创建`,"success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  function templateEditorPayload(){
    let templateJson;
    try{
      templateJson=JSON.parse(document.getElementById("template-json-editor")?.value||"{}");
    }catch{
      throw new Error("Template JSON 格式无效。");
    }
    return {
      effectiveAt:document.getElementById("template-effective")?.value?.trim()||null,
      preflightProfile:document.getElementById("template-preflight-profile")?.value?.trim()||"",
      notes:document.getElementById("template-notes")?.value?.trim()||"",
      templateJson
    };
  }

  async function saveTemplateDraft(renderAfter=true){
    if(!state.templateEditor||!permitted("templateWrite")){toast("没有 Template Draft 编辑权限。","error");return false;}
    try{
      const payload=templateEditorPayload();
      await api.updateTemplateVersion(state.templateEditor.id,payload);
      await loadTemplateVersions(false);
      state.templateEditor=state.templateVersions.find(v=>v.id===state.templateEditor.id)||null;
      if(renderAfter) render();
      toast("Template Draft 已保存","success");
      return true;
    }catch(e){toast(e.message||String(e),"error");return false;}
  }

  async function submitTemplateVersion(){
    if(!state.templateEditor||!permitted("templateWrite")){toast("没有 Template 提交权限。","error");return;}
    if(["DRAFT","REJECTED"].includes(state.templateEditor.status)){
      const saved=await saveTemplateDraft(false);
      if(!saved)return;
    }
    try{
      await api.submitTemplateVersion(state.templateEditor.id,{reason:"Submitted from Template Center"});
      await loadTemplateVersions(false);
      state.templateEditor=state.templateVersions.find(v=>v.id===state.templateEditor.id)||null;
      render();
      toast("Template Version 已提交审批","success");
    }catch(e){
      const detail=Array.isArray(e.detail)?` ${e.detail.join(" · ")}`:"";
      toast((e.message||String(e))+detail,"error");
    }
  }

  async function decideTemplateVersion(decision){
    if(!state.templateEditor||!permitted("templateApprove")){toast("需要 Template Approver / Admin 权限。","error");return;}
    try{
      await api.decideTemplateVersion(state.templateEditor.id,decision,{
        comment:decision==="APPROVE"?"Template schema and production rules reviewed.":"Template revision required."
      });
      await loadTemplateVersions(false);
      state.templateEditor=state.templateVersions.find(v=>v.id===state.templateEditor.id)||null;
      await loadReferenceData(false);
      render();
      toast(decision==="APPROVE"?"Template Version 已批准":"Template Version 已退回","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function loadReferenceMasters(renderAfter=true){
    if(!state.apiOnline||!state.identity){
      state.referenceRecords=[];
      if(renderAfter) render();
      return;
    }
    try{
      const response=await api.referenceRecords();
      state.referenceRecords=response.data||[];
    }catch(e){
      state.referenceRecords=[];
      toast(e.message||String(e),"error");
    }
    if(renderAfter) render();
  }

  async function createReferenceRecord(){
    if(!permitted("referenceWrite")){toast("需要 Admin Master Data 权限。","error");return;}
    const namespace=contentNamespace();
    if(!namespace){toast("请选择 Customer / Product / Country / Shared。","error");return;}
    const code=document.getElementById("master-code")?.value?.trim()||"";
    const displayName=document.getElementById("master-name")?.value?.trim()||"";
    const effectiveAt=document.getElementById("master-effective")?.value?.trim()||null;
    let data={};
    try{data=JSON.parse(document.getElementById("master-json")?.value||"{}");}
    catch{toast("Data JSON 格式无效。","error");return;}
    if(!code||!displayName){toast("Code 和 Display Name 必填。","error");return;}
    try{
      await api.createReferenceRecord({namespace,code,displayName,effectiveAt,data,status:"ACTIVE"});
      await loadReferenceMasters(false);
      render();
      toast(`${namespace} Master 已创建`,"success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function loadProductionReadiness(renderAfter=true){
    if(!state.apiOnline||!state.identity){
      state.productionPolicies=[];
      state.productionReadiness={ready:false,gates:[]};
      if(renderAfter) render();
      return;
    }
    try{
      const [policies,readiness]=await Promise.all([
        api.productionPolicies(),
        api.productionReadiness()
      ]);
      state.productionPolicies=policies.data||[];
      state.productionReadiness=readiness.data||{ready:false,gates:[]};
    }catch(e){
      state.productionPolicies=[];
      state.productionReadiness={ready:false,gates:[]};
      toast(e.message||String(e),"error");
    }
    if(renderAfter) render();
  }

  async function handlePolicyAction(action, code){
    const policy=state.productionPolicies.find(x=>x.code===code);
    if(!policy){toast("Production Policy not found.","error");return;}
    try{
      if(action==="save"||action==="submit"){
        if(!permitted("productionPolicyWrite")){toast("需要 Production Policy Write 权限。","error");return;}
        let config;
        try{config=JSON.parse(document.getElementById(`policy-config-${code}`)?.value||"{}");}
        catch{toast("Policy JSON 格式无效。","error");return;}
        const notes=document.getElementById(`policy-notes-${code}`)?.value?.trim()||"";
        await api.updateProductionPolicy(code,{config,notes,reason:"Updated from Quality / Readiness"});
        if(action==="submit"){
          await api.submitProductionPolicy(code,{reason:"Submitted from Quality / Readiness"});
        }
      }
      if(action==="approve"||action==="reject"){
        if(!permitted("productionPolicyApprove")){toast("需要 Template Approver / Admin 权限。","error");return;}
        await api.decideProductionPolicy(code,action==="approve"?"APPROVE":"REJECT",{
          comment:action==="approve"?"Production policy reviewed and approved.":"Production policy requires revision."
        });
      }
      await loadProductionReadiness(false);
      render();
      toast(`${code} · ${action} completed`,"success");
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.join(" · ")}`:"";
      toast((e.message||String(e))+detail,"error");
    }
  }

  async function loadReferenceData(renderAfter=true){
    if(!state.apiOnline||!state.identity?.roles?.length){
      state.remoteArtworks=[];
      state.templates=[];
      if(renderAfter) render();
      return;
    }
    try{
      const [factoryResponse,templateResponse,artworkResponse,referenceResponse,policyResponse,readinessResponse]=await Promise.all([
        api.factories(),api.templates(),api.artworks(),api.referenceRecords(),api.productionPolicies(),api.productionReadiness()
      ]);
      state.factories=factoryResponse.data||[];
      state.templates=templateResponse.data||[];
      state.remoteArtworks=artworkResponse.data||[];
      state.referenceRecords=referenceResponse.data||[];
      state.productionPolicies=policyResponse.data||[];
      state.productionReadiness=readinessResponse.data||{ready:false,gates:[]};
    }catch(e){
      toast("Reference data load failed: "+(e.message||e),"error");
    }
    if(renderAfter) render();
  }

  function syncRevisionCompareDefaults(){
    const revisions=state.remoteRevisions||[];
    const current=state.artwork?.revision;
    if(!revisions.length){
      state.compareFrom=null;
      state.compareTo=null;
      state.revisionCompare=null;
      return;
    }
    const to=revisions.find(x=>x.revision===current)?.revision||revisions[0]?.revision||null;
    const from=revisions.find(x=>x.revision!==to)?.revision||to;
    if(!state.compareTo||!revisions.some(x=>x.revision===state.compareTo)) state.compareTo=to;
    if(!state.compareFrom||!revisions.some(x=>x.revision===state.compareFrom)) state.compareFrom=from;
  }

  async function refreshRemoteRevisionMetadata(renderAfter=true){
    if(!state.apiOnline||!state.remoteArtworkId){
      state.remoteRevisions=[];
      state.revisionCompare=null;
      if(renderAfter) render();
      return;
    }
    try{
      const remote=await api.artwork(state.remoteArtworkId);
      state.remoteRevisions=remote.data?.revisions||[];
      syncRevisionCompareDefaults();
    }catch(e){
      state.remoteRevisions=[];
      state.revisionCompare=null;
      toast(e.message||String(e),"error");
    }
    if(renderAfter) render();
  }

  async function loadRevisionCompare(){
    if(!state.apiOnline||!state.remoteArtworkId){toast("需要已连接的 D1 Artwork。","error");return;}
    const from=document.getElementById("compare-from")?.value||state.compareFrom;
    const to=document.getElementById("compare-to")?.value||state.compareTo;
    if(!from||!to){toast("请选择两个 Revision。","error");return;}
    if(from===to){toast("请选择两个不同的 Revision。","error");return;}
    try{
      const response=await api.compareArtwork(state.remoteArtworkId,from,to);
      state.compareFrom=from;
      state.compareTo=to;
      state.revisionCompare=response.data||null;
      render();
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function loadRemoteArtworks(q=""){
    if(!state.apiOnline||!state.identity?.roles?.length){
      state.remoteArtworks=[];render();return;
    }
    try{
      const response=await api.artworks({q});
      state.remoteArtworks=response.data||[];
    }catch(e){
      state.remoteArtworks=[];
      toast(e.message||String(e),"error");
    }
    render();
  }

  async function openRemoteArtwork(id){
    if(!state.apiOnline||!state.identity){toast("Cloudflare Access 未连接。","error");return;}
    try{
      const remote=await api.artwork(id);
      const row=remote.data.artwork;
      let snapshot={};
      try{snapshot=JSON.parse(row.canonical_data_json||"{}");}catch{}
      state.artwork=D.artworkFromCanonical(snapshot,{
        sku:row.sku,
        contractNo:row.contract_no,
        factoryId:row.factory_id,
        packageCount:row.package_count,
        currentPackage:row.current_package,
        status:A.statusFromApi(row.status),
        revision:row.current_revision
      });
      state.remoteArtworkId=id;
      state.remoteRevision=state.artwork.revision;
      state.remoteRevisions=remote.data?.revisions||[];
      state.revisionCompare=null;
      syncRevisionCompareDefaults();
      state.comments=[];
      localStorage.setItem("cas:remoteArtworkId",id);
      localStorage.setItem("cas:draft",JSON.stringify(state.artwork));
      state.page="artwork";
      state.tab="artwork";
      await loadComments();
      render();
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function loadFactoryImpact(id){
    if(!state.apiOnline||!state.identity){toast("Cloudflare API 未连接。","error");return;}
    try{
      const response=await api.factoryImpact(id);
      state.impact=response.data;
      state.dialog="impact";
      render();
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function saveFactoryMaster(){
    if(!permitted("admin")||!state.impact?.factory){toast("需要 Admin 权限。","error");return;}
    const id=state.impact.factory.id;
    const payload={
      name:document.getElementById("impact-factory-name")?.value?.trim()||"",
      crn:document.getElementById("impact-factory-crn")?.value?.trim()||"",
      country:document.getElementById("impact-factory-country")?.value?.trim()||"",
      effectiveAt:document.getElementById("impact-factory-effective")?.value?.trim()||null,
      reason:"Updated from Factory Impact dialog"
    };
    try{
      await api.updateFactory(id,payload);
      state.dialog=null;
      state.impact=null;
      const response=await api.factories();
      state.factories=response.data||[];
      await loadRemoteArtworks();
      toast("Factory Master 已更新；历史 Revision Snapshot 未修改。","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function loadAudit(renderAfter=true){
    if(!state.apiOnline||!permitted("auditRead")){
      state.auditLogs=[];
      if(renderAfter) render();
      return;
    }
    try{
      const response=await api.audit({limit:100});
      state.auditLogs=response.data||[];
    }catch(e){
      state.auditLogs=[];
      toast(e.message||String(e),"error");
    }
    if(renderAfter) render();
  }

  async function loadComments(){
    if(!state.apiOnline||!state.identity||!state.remoteArtworkId){
      state.comments=[];render();return;
    }
    state.commentsLoading=true;render();
    try{
      const response=await api.comments(state.remoteArtworkId,state.artwork.revision);
      state.comments=response.data||[];
    }catch(e){
      state.comments=[];
      toast(e.message||String(e),"error");
    }finally{
      state.commentsLoading=false;render();
    }
  }

  async function addComment(){
    if(!permitted("commentWrite")||!state.remoteArtworkId){toast("没有评论权限或 Artwork 尚未同步。","error");return;}
    const body=document.getElementById("comment-body")?.value?.trim()||"";
    const blocking=Boolean(document.getElementById("comment-blocking")?.checked);
    if(!body){toast("请输入审核意见。","error");return;}
    try{
      await api.addComment(state.remoteArtworkId,{revision:state.artwork.revision,body,blocking});
      await loadComments();
      toast(blocking?"Blocking comment 已添加":"Comment 已添加","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function resolveComment(id){
    if(!permitted("review")){toast("只有 Reviewer / Admin 可以解决 Blocking comment。","error");return;}
    try{
      await api.resolveComment(id);
      await loadComments();
      toast("Blocking comment 已解决","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function loadAdminUsers(){
    if(!state.apiOnline||!permitted("admin")){state.adminUsers=[];render();return;}
    try{
      const response=await api.adminUsers();
      state.adminUsers=response.data||[];
      if(permitted("auditRead")) {
        const audit=await api.audit({limit:100});
        state.auditLogs=audit.data||[];
      }
    }catch(e){toast(e.message||String(e),"error");}
    render();
  }

  async function createAdminUser(){
    if(!permitted("admin")){toast("需要 Admin 权限。","error");return;}
    const email=document.getElementById("admin-user-email")?.value?.trim()||"";
    const displayName=document.getElementById("admin-user-name")?.value?.trim()||"";
    if(!email){toast("请输入 Email。","error");return;}
    try{
      await api.createUser({email,displayName});
      await loadAdminUsers();
      toast("User 已创建","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function saveUserRoles(userId){
    if(!permitted("admin")){toast("需要 Admin 权限。","error");return;}
    const roles=[...document.querySelectorAll(`[data-role-user="${CSS.escape(userId)}"]:checked`)].map(x=>x.dataset.role);
    try{
      await api.setUserRoles(userId,roles);
      await loadAdminUsers();
      toast("Roles 已更新","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function ensureRemoteArtwork(){
    if(!permitted("artworkWrite")) throw new Error("Artwork Write permission is required.");
    localStorage.setItem("cas:draft",JSON.stringify(state.artwork));
    if(!state.apiOnline)return null;
    const canonicalData=D.canonicalData(state.artwork,state.factories);
    try{
      let response;
      if(state.remoteArtworkId){
        try{response=await api.updateArtwork(state.remoteArtworkId,state.artwork,canonicalData,"web");}
        catch(e){
          if(e.status!==404)throw e;
          state.remoteArtworkId=null;
          localStorage.removeItem("cas:remoteArtworkId");
        }
      }
      if(!state.remoteArtworkId){
        response=await api.createArtwork(state.artwork,canonicalData,"web");
        state.remoteArtworkId=response.data.id;
        localStorage.setItem("cas:remoteArtworkId",state.remoteArtworkId);
      }
      return response;
    }catch(e){
      throw new Error(`Cloud save failed: ${e.message||e}`);
    }
  }

  async function saveDraft(){
    if(!permitted("artworkWrite")){toast("需要 Artwork Write 权限。","error");return;}
    if(["in_review","approved"].includes(state.artwork.status)){
      toast("已提交或已批准的 Revision 不允许原地修改；需要创建新 Revision。","error");return;
    }
    state.apiBusy=true;render();
    try{
      const remote=await ensureRemoteArtwork();
      toast(remote?"草稿已同步到 D1":"Cloud API 未连接，草稿仅保存到本地","success");
    }catch(e){toast(e.message||String(e),"error");}
    finally{state.apiBusy=false;render();}
  }

  async function persistPreflight(){
    const groups=checks(),s=D.preflightSummary(groups);
    if(!state.apiOnline||!state.remoteArtworkId)return null;
    const status=s.error>0?"ERROR":s.warning>0?"WARNING":"PASS";
    return api.preflight(state.remoteArtworkId,{
      revision:state.artwork.revision,
      profileCode:"US_SIDE_SEAL_K_ONLY_V1",
      profileVersion:"1",
      status,
      report:{summary:s,groups}
    });
  }

  async function runPreflightAction(){
    if(!permitted("artworkWrite")){toast("需要 Artwork Write 权限。","error");return;}
    state.pfBusy=true;state.apiBusy=true;render();
    try{
      if(!state.remoteArtworkId&&state.apiOnline)await ensureRemoteArtwork();
      await new Promise(r=>setTimeout(r,280));
      await persistPreflight();
      const s=summary();
      toast(`Preflight: ${s.pass} pass / ${s.warning} warning / ${s.error} error`,s.error?"error":"success");
    }catch(e){toast(e.message||String(e),"error");}
    finally{state.pfBusy=false;state.apiBusy=false;render();}
  }

  async function submitForReview(){
    if(!permitted("artworkWrite")){toast("需要 Artwork Write 权限。","error");return;}
    const s=summary();
    if(s.blocking>0){toast("存在 blocking errors，无法提交审核","error");return;}
    state.apiBusy=true;render();
    try{
      if(!state.apiOnline){
        toast("提交审核需要 Cloudflare D1 API；当前处于 Local Mode。","error");return;
      }
      await ensureRemoteArtwork();
      await persistPreflight();
      const pfStatus=s.error>0?"ERROR":s.warning>0?"WARNING":"PASS";
      const response=await api.submitArtwork(state.remoteArtworkId,{
        dataSnapshot:D.canonicalData(state.artwork,state.factories),
        preflightStatus:pfStatus,
        blockingErrors:s.blocking,
        preflightProfileVersion:"US_SIDE_SEAL_K_ONLY_V1@1",
        actor:"web",
        reason:"Submitted from Artwork workspace"
      });
      state.artwork.status="in_review";
      state.artwork.revision=response.data.revision;
      state.remoteRevision=response.data.revision;
      localStorage.setItem("cas:draft",JSON.stringify(state.artwork));
      await loadComments();
      await refreshRemoteRevisionMetadata(false);
      toast(`${response.data.revision} 已提交审核`,"success");
    }catch(e){toast(e.message||String(e),"error");}
    finally{state.apiBusy=false;render();}
  }

  async function reviewDecision(decision){
    if(!permitted("review")){toast("需要 Reviewer / Admin 权限。","error");return;}
    if(!state.apiOnline||!state.remoteArtworkId){toast("Reviewer decision 需要 Cloudflare API。","error");return;}
    if(decision==="APPROVE"&&!blockingCommentsResolved()){toast("请先解决所有 Blocking comment。","error");return;}
    state.apiBusy=true;render();
    try{
      const response=await api.decision(state.remoteArtworkId,decision,{
        revision:state.artwork.revision,
        comment:decision==="APPROVE"?"Preflight and artwork reviewed.":"Revision required."
      });
      state.artwork.status=response.data.status.toLowerCase();
      localStorage.setItem("cas:draft",JSON.stringify(state.artwork));
      await loadComments();
      await refreshRemoteRevisionMetadata(false);
      toast(decision==="APPROVE"?"Revision 已批准":"Revision 已退回","success");
    }catch(e){toast(e.message||String(e),"error");}
    finally{state.apiBusy=false;render();}
  }

  async function createNewRevision(){
    if(!permitted("artworkWrite")){toast("需要 Artwork Write 权限。","error");return;}
    if(!state.apiOnline||!state.remoteArtworkId){toast("创建新 Revision 需要 Cloudflare API。","error");return;}
    state.apiBusy=true;render();
    try{
      const response=await api.createRevision(state.remoteArtworkId,{
        dataSnapshot:D.canonicalData(state.artwork,state.factories),
        preflightProfileVersion:"US_SIDE_SEAL_K_ONLY_V1@1",
        actor:"web"
      });
      state.artwork.revision=response.data.revision;
      state.artwork.status="draft";
      state.comments=[];
      state.revisionCompare=null;
      localStorage.setItem("cas:draft",JSON.stringify(state.artwork));
      await refreshRemoteRevisionMetadata(false);
      toast(`${response.data.revision} Draft 已创建`,"success");
    }catch(e){toast(e.message||String(e),"error");}
    finally{state.apiBusy=false;render();}
  }

  function exportProof(){
    const g=geometry(), c=computed(), code=C.code128Bars(state.artwork.barcode,{moduleMm:.42,heightMm:25}), qr=C.qrMatrix(state.artwork.qr,"M").matrix;
    const blob=P.createPdfBlob({artwork:state.artwork,geometry:g,computed:c,codeModel:code,qrMatrix:qr,mode:"proof"});
    downloadBlob(fileBase()+"_Proof.pdf",blob); toast("已生成 1:1 mm Vector Proof PDF（Code128 + QR 均为矢量）","success");
  }

  async function productionArtifactSet(artwork, mode="production"){
    const g=D.sideSealGeometry(artwork), comp=D.computed(artwork,state.factories);
    const code=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
    const qr=C.qrMatrix(artwork.qr,"M").matrix;
    const pdfBytes=P.createPdfBytes({artwork,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode});
    const svg=`<?xml version="1.0" encoding="UTF-8"?>\n${dielineSvg(mode,artwork)}`;
    const snapshot=JSON.stringify(D.canonicalData(artwork,state.factories),null,2);
    const pfGroups=checksFor(artwork), pfSummary=D.preflightSummary(pfGroups);
    const preflight=JSON.stringify({summary:pfSummary,groups:pfGroups,generatedAt:new Date().toISOString()},null,2);
    const manifest=D.manifest(artwork,"vector-svg-pdf-1.0.0");
    manifest.qr={encoder:"qrcode-generator",errorCorrectionLevel:"M",vector:true};
    manifest.barcode={symbology:"Code 128-B PoC",vector:true};
    manifest.sha256={
      pdf:await sha256(pdfBytes),
      svg:await sha256(svg),
      snapshot:await sha256(snapshot),
      preflight:await sha256(preflight)
    };
    const base=B.safeBase(artwork);
    return {base,manifest,files:[
      {name:"Production.pdf",data:pdfBytes},
      {name:"Production.svg",data:svg},
      {name:"DataSnapshot.json",data:snapshot},
      {name:"PreflightReport.json",data:preflight},
      {name:"Manifest.json",data:JSON.stringify(manifest,null,2)}
    ]};
  }

  async function exportProduction(){
    const s=summary();
    if(!permitted("productionExport")||!state.apiOnline||!state.remoteArtworkId){toast("Production Export 需要 Cloudflare Access + Production Export 权限。","error");return;}
    if(state.artwork.status!=="approved"||s.blocking>0||!blockingCommentsResolved()){toast("Production Export 被审核状态、阻断错误或未解决评论锁定","error");return;}
    try{
      const [remote,readiness]=await Promise.all([
        api.artwork(state.remoteArtworkId),
        api.productionReadiness()
      ]);
      state.productionReadiness=readiness.data||{ready:false,gates:[]};
      if(!state.productionReadiness.ready){
        const blocked=(state.productionReadiness.gates||[]).filter(x=>!(x.approved&&x.valid)).map(x=>x.displayName||x.code).join(" / ");
        render();
        toast("Production Readiness 未通过："+(blocked||"policy gate"),"error");
        return;
      }
      if(String(remote.data.artwork.status||"").toUpperCase()!=="APPROVED"||remote.data.artwork.current_revision!==state.artwork.revision){toast("服务器端当前 Revision 未批准或已过期，已阻止生产稿导出。","error");return;}
    }catch(e){toast("无法验证服务器端批准/生产就绪状态："+(e.message||e),"error");return;}
    const built=await productionArtifactSet(state.artwork,"production");
    built.files.push({name:"README.txt",data:"Approved Production Bundle\nTemplate: "+state.artwork.templateCode+" "+state.artwork.templateVersion+"\nRevision: "+state.artwork.revision+"\nProduction policies: server-approved at export time.\n"});
    const bundle=Z.createZipBlob(built.files);
    const filename=built.base+"_ProductionBundle.zip";
    downloadBlob(filename,bundle);
    if(state.apiOnline&&state.apiBindings.r2&&state.remoteArtworkId){
      try{
        await api.uploadExport(state.remoteArtworkId,bundle,{kind:"PRODUCTION_BUNDLE",revision:state.artwork.revision,filename,renderer:"1.0.0",actor:"web",manifest:built.manifest});
        toast("Production Bundle 已下载并同步到 R2","success");
      }catch(e){toast("本地 Bundle 已生成，但 R2 同步失败："+(e.message||e),"error");}
    }else toast("Production Bundle ZIP 已生成；R2 尚未连接","success");
  }

  async function exportBatchProofs(){
    const passed=state.batchReview.filter(r=>r.status==="PASS");
    if(!passed.length){toast("没有可生成的通过记录","error");return;}
    state.batchGenerating=true;render();
    try{
      const files=[],index=[];
      for(const row of passed){
        const art={...row.artwork,status:"draft",revision:"R01"};
        const g=D.sideSealGeometry(art),comp=D.computed(art,state.factories),code=C.code128Bars(art.barcode,{moduleMm:.42,heightMm:25}),qr=C.qrMatrix(art.qr,"M").matrix;
        const pdf=P.createPdfBytes({artwork:art,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof"});
        const svg=`<?xml version="1.0" encoding="UTF-8"?>\n${dielineSvg("proof",art)}`;
        const snap=JSON.stringify(D.canonicalData(art,state.factories),null,2);
        const prefix=`row-${String(row.row).padStart(4,"0")}_${B.safeBase(art)}/`;
        files.push({name:prefix+"Proof.pdf",data:pdf},{name:prefix+"Proof.svg",data:svg},{name:prefix+"DataSnapshot.json",data:snap});
        index.push({row:row.row,sku:art.sku,path:prefix,status:"PASS"});
      }
      const stats=B.summarize(state.batchReview);
      files.push({name:"BatchManifest.json",data:JSON.stringify({version:"1.0.0",source:state.batchSource,summary:stats,generatedAt:new Date().toISOString(),items:index},null,2)});
      if(stats.failed) files.push({name:"failed_rows.csv",data:B.failedRowsCsv(state.batchReview)});
      downloadBlob(`BatchProofs_${new Date().toISOString().slice(0,10)}.zip`,Z.createZipBlob(files));
      state.batchStep=4;toast(`已生成 ${stats.passed} 条通过记录的 Proof Bundle`,"success");
    }catch(e){toast(e.message||String(e),"error");}
    finally{state.batchGenerating=false;render();}
  }

  async function sha256(value){
    if(!crypto?.subtle)return "unavailable";
    let bytes;
    if(value instanceof Uint8Array) bytes=value;
    else if(value instanceof ArrayBuffer) bytes=new Uint8Array(value);
    else if(value instanceof Blob) bytes=new Uint8Array(await value.arrayBuffer());
    else bytes=new TextEncoder().encode(String(value??""));
    const buf=await crypto.subtle.digest("SHA-256",bytes);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  async function importBatch(file){
    if(!permitted("batchWrite")){toast("需要 Batch Write 权限。","error");return;}
    try{
      const parsed=await X.parseFile(file);
      const result=X.rowsToRecords(parsed.rows,{fillDown:true});
      const review=B.buildReview(result.records,result.issues,D,{defaults:D.defaultArtwork,factories:state.factories,codes:C});
      state.batchSource=`${file.name} · ${parsed.source}`;
      state.batchRecords=result.records;
      state.batchIssues=result.issues;
      state.batchMapping=result.header.mapping;
      state.batchReview=review;
      state.batchRows=review.slice(0,100);
      state.batchStep=3;
      render();
      const s=B.summarize(review);
      toast(`读取 ${s.total} 行：${s.passed} passed / ${s.failed} failed`,s.failed?"error":"success");
      if(state.apiOnline&&permitted("batchWrite")){
        try{await persistBatchJob(file,parsed.source);toast(`Import Job 已同步 D1：${state.remoteImportJobId}`,"success");}
        catch(e){toast("Batch 已在本地解析，但 D1 同步失败："+(e.message||e),"error");}
      }
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function persistBatchJob(file, sourceType){
    if(!state.apiOnline||!permitted("batchWrite"))return null;
    const stats=B.summarize(state.batchReview);
    const created=await api.createImportJob({
      sourceName:file.name,
      sourceType,
      mappingProfileId:"map-us-packing-list-default",
      status:"REVIEWED",
      totalRows:stats.total,
      passedRows:stats.passed,
      failedRows:stats.failed,
      summary:stats,
      actor:"web"
    });
    const jobId=created.data.id;
    state.remoteImportJobId=jobId;
    const rows=state.batchReview.map(r=>({
      rowNo:r.row,
      sku:r.sku,
      status:r.status,
      canonicalData:D.canonicalData(r.artwork,state.factories),
      issues:r.issues
    }));
    for(let i=0;i<rows.length;i+=500) await api.saveImportRows(jobId,rows.slice(i,i+500));
    return jobId;
  }

  async function saveMappingProfile(){
    if(!state.apiOnline||!state.batchMapping||!permitted("batchWrite")){toast("Mapping Profile 需要 Cloudflare D1 API + Batch Write 权限。","error");return;}
    try{
      const mapping={};
      for(const [field,col] of Object.entries(state.batchMapping)) mapping[field]=X.columnLabel(col);
      await api.saveMappingProfile({
        id:"map-us-packing-list-default",
        name:"US Packing List Default",
        templateCode:"US_SIDE_SEAL",
        mapping,
        aliases:X.DEFAULT_ALIASES,
        actor:"web"
      });
      toast("Mapping Profile 已保存到 D1","success");
    }catch(e){toast(e.message||String(e),"error");}
  }

  function fileBase(){return `${state.artwork.templateCode}_${state.artwork.sku}_${state.artwork.currentPackage}-${state.artwork.packageCount}_${state.artwork.revision}`.replace(/[^a-z0-9._-]+/gi,"_");}
  function downloadText(name,text,type){downloadBlob(name,new Blob([text],{type}));}
  function downloadBlob(name,blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
  function toast(msg,type=""){const t=document.createElement("div");t.className="toast "+type;t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600);}

  async function bootCloud(){
    try{
      const health=await api.health();
      state.apiBindings=health.bindings||state.apiBindings;
      state.apiOnline=Boolean(health.ok&&health.bindings?.d1);

      if(state.apiOnline){
        try{
          const me=await api.me();
          state.identity=me.data||null;
          state.authError=null;
        }catch(e){
          state.identity=null;
          state.authError=e;
        }
      }

      if(state.apiOnline&&state.identity?.roles?.length){
        await loadReferenceData(false);
        if(permitted("auditRead")) await loadAudit(false);

        if(state.remoteArtworkId){
          try{
            const remote=await api.artwork(state.remoteArtworkId);
            const row=remote.data.artwork;
            let snapshot={};
            try{snapshot=JSON.parse(row.canonical_data_json||"{}");}catch{}
            state.artwork=D.artworkFromCanonical(snapshot,{
              sku:row.sku,
              contractNo:row.contract_no,
              factoryId:row.factory_id,
              packageCount:row.package_count,
              currentPackage:row.current_package,
              status:A.statusFromApi(row.status),
              revision:row.current_revision
            });
            state.remoteRevision=state.artwork.revision;
            state.remoteRevisions=remote.data?.revisions||[];
            state.revisionCompare=null;
            syncRevisionCompareDefaults();
            const comments=await api.comments(state.remoteArtworkId,state.artwork.revision);
            state.comments=comments.data||[];
          }catch(e){
            if(e.status===404){state.remoteArtworkId=null;localStorage.removeItem("cas:remoteArtworkId");}
            else if(e.status===401||e.status===403){state.authError=e;}
          }
        }

        if(state.page==="admin"&&permitted("admin")){
          try{state.adminUsers=(await api.adminUsers()).data||[];}catch{}
        }
      }
    }catch(e){
      state.apiOnline=false;
      state.identity=null;
      state.authError=e;
    }finally{
      state.apiChecked=true;
      render();
    }
  }

  const saved=localStorage.getItem("cas:draft");
  if(saved){try{state.artwork={...state.artwork,...JSON.parse(saved)};}catch{}}
  render();
  bootCloud();
})();
