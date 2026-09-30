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
    resolvedBlockingComment: false,
    apiOnline: false,
    apiChecked: false,
    apiBusy: false,
    remoteArtworkId: localStorage.getItem("cas:remoteArtworkId") || null,
    remoteRevision: null
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

  function computed() { return D.computed(state.artwork); }
  function geometry() { return D.sideSealGeometry(state.artwork); }
  function checksFor(artwork) {
    const groups=D.runPreflight(artwork);
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
  function factory() { return D.findFactory(state.artwork.factoryId); }
  function canonical() { return D.canonicalData(state.artwork); }

  function shell(body, titleZh, titleEn) {
    return `
      <div class="app">
        <aside class="sidebar">
          <div class="brand"><div class="brand-mark">CAS</div><div class="brand-copy"><div class="brand-title">CARTON ARTWORK</div><div class="brand-sub">Studio · 包装印刷稿系统</div></div></div>
          <nav class="nav">
            ${navItems.map(([id,ic,zh,en]) => `<button class="nav-btn ${state.page===id?"active":""}" data-page="${id}"><span class="nav-icon">${ic}</span><span>${zh}</span><span>${en}</span></button>`).join("")}
          </nav>
          <div class="sidebar-foot">Environment<br><strong>DEV · Cloudflare-ready</strong><br>Geometry: mm<br><span class="badge ${state.apiOnline?"green":state.apiChecked?"amber":"blue"}">${state.apiOnline?"API Connected":state.apiChecked?"Local Mode":"API Checking…"}</span></div>
        </aside>
        <section class="main">
          <header class="topbar">
            <div class="breadcrumb">Carton Artwork Studio /</div><div class="page-title">${esc(titleZh)}</div><div class="breadcrumb">${esc(titleEn)}</div>
            <div class="spacer"></div>
            <label class="search"><input placeholder="搜索 SKU / Contract / CRN…" /></label>
            <span class="dev">DEV</span><button class="icon-btn" title="Notifications">◔</button><div class="avatar">DG</div>
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
    const cards = [["Draft",18,"待完善"],["Pending Review",7,"等待审核"],["Rejected",2,"需要修订"],["Approved",46,"可生产"]];
    const recent = [
      ["ART-260930-001","KF210215US-02PM-001","HT24010213","R03","In Review"],
      ["ART-260930-002","SHED-1019-US","HT24090218","R02","Approved"],
      ["ART-260929-011","PERGOLA-US-440","HT24081107","R01","Draft"],
      ["ART-260929-008","PLANTER-US-208","HT24080199","R04","Rejected"]
    ];
    return `
      <div class="kpis">${cards.map(c=>`<div class="kpi"><div class="kpi-label">${c[0]}</div><div class="kpi-value">${c[1]}</div><div class="kpi-foot">${c[2]}</div></div>`).join("")}</div>
      <div class="grid2">
        <section class="card"><div class="card-head"><h3>Recent Artwork</h3><span class="subtle">最近印刷稿</span></div>${table(["Artwork","SKU","Contract","Rev","Status"],recent)}</section>
        <div>
          <section class="card"><div class="card-head"><h3>Preflight Health</h3><span class="subtle">质量健康度</span></div><div class="card-body">
            ${health("Data",99.7)}${health("Layout",98.4)}${health("Codes",97.9)}${health("Print",96.8)}
            <div class="notice warn" style="margin-top:10px">3 个 Artwork 存在阻断错误，Production Export 被锁定。</div>
          </div></section>
          <section class="card"><div class="card-head"><h3>Template Status</h3></div><div class="card-body"><strong>US_SIDE_SEAL</strong><div class="subtle" style="margin-top:4px">2026.05.20 · Approved · US_SIDE_SEAL_K_ONLY_V1</div></div></section>
        </div>
      </div>`;
  }

  function health(name,v){ return `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between"><span>${name}</span><span class="mono">${v}%</span></div><div style="height:5px;background:#edf1f4;border-radius:5px;margin-top:5px"><i style="display:block;width:${v}%;height:100%;background:#16835d;border-radius:5px"></i></div></div>`; }

  function renderArtwork() {
    const s = summary();
    const prod = state.artwork.status === "approved" && s.blocking === 0 && state.resolvedBlockingComment;
    return `
      <div class="artwork-header">
        <div><div class="artwork-title">美线侧封箱 <span class="badge blue">US_SIDE_SEAL</span></div><div class="meta mono">Template 2026.05.20 · Revision ${state.artwork.revision} · SKU ${esc(state.artwork.sku)}</div></div>
        <div class="spacer"></div>
        <span class="badge ${state.artwork.status==="approved"?"green":state.artwork.status==="in_review"?"blue":state.artwork.status==="rejected"?"red":"amber"}">${esc(state.artwork.status.replace("_"," ").toUpperCase())}</span>
        <button class="btn" data-action="save" ${state.apiBusy?"disabled":""}>保存草稿</button>
        <button class="btn" data-action="preflight" ${state.apiBusy?"disabled":""}>运行检查</button>
        <button class="btn primary" data-action="submit" ${!["draft","rejected"].includes(state.artwork.status)||summary().blocking>0||state.apiBusy?"disabled":""}>提交审核</button>
        ${state.artwork.status==="in_review"?`<button class="btn success" data-action="approve" ${!state.resolvedBlockingComment||state.apiBusy?"disabled":""}>Reviewer Approve</button><button class="btn" data-action="reject" ${state.apiBusy?"disabled":""}>Reject</button>`:""}
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
        ${field("Factory","Master Data",`<select class="select" data-art="factoryId">${D.factories.map(x=>`<option value="${x.id}" ${a.factoryId===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select>`)}
        ${field("CRN","factory.crn",`<input class="input mono" readonly value="${esc(f?.crn||"")}" />`)}
        ${field("Country of Origin","derived",`<input class="input" readonly value="${esc(f?.country||"")}" />`)}
      `)}
      ${formSection("Codes 代码", `
        ${field("Barcode","Code 128-B PoC",input("barcode",a.barcode))}
        ${field("QR payload","Encoder gate pending",input("qr",a.qr))}
        ${field("CodeBlock Profile","locked component",`<select class="select" data-art="codeBlockProfile"><option value="250x80" ${a.codeBlockProfile==="250x80"?"selected":""}>250 × 80 mm</option><option value="200x64" ${a.codeBlockProfile==="200x64"?"selected":""}>200 × 64 mm</option></select>`)}
        <div class="notice">🔒 Barcode + QR 为锁定组合组件。Business Mode 禁止拆分和单独移动。</div>
      `)}
    `;
  }

  function formSection(t,b){return `<section class="section"><div class="section-title">${t}</div><div class="section-body">${b}</div></section>`;}
  function field(a,b,c){return `<div class="field"><label><span>${a}</span><span class="hint">${b}</span></label>${c}</div>`;}
  function input(k,v){return `<input class="input" data-art="${k}" value="${esc(v)}"/>`;}
  function num(k,v){return `<input class="input mono" type="number" step="0.01" data-art="${k}" value="${esc(v)}"/>`;}
  function suffix(k,v,s){return `<div class="suffix"><input class="input mono" type="number" step="0.01" data-art="${k}" value="${esc(v)}"/><span>${s}</span></div>`; }

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
    if(state.tab==="comments") return `<div class="comments"><div class="comment"><span class="badge ${state.resolvedBlockingComment?"green":"red"}">${state.resolvedBlockingComment?"Resolved":"Blocking"}</span> <strong>QA · Helen</strong><p>请确认本批次工厂 CRN 与最新海关备案文件一致。</p>${state.resolvedBlockingComment?"":'<button class="btn small" data-action="resolve-comment">标记已解决</button>'}</div><div class="comment"><span class="badge green">Resolved</span> <strong>Packaging · Leo</strong><p>Barcode + QR 已按批准组合尺寸统一。</p></div></div>`;
    return `<div class="canvas"><div class="artboard" style="transform:scale(${state.zoom})">${dielineSvg()}</div></div>`;
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
        <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-action="dry-run" ${state.batchRecords.length?"":"disabled"}>Dry Run</button><button class="btn" data-action="download-errors" ${stats.failed?"":"disabled"}>Download Error Rows</button><button class="btn success" data-action="batch-generate" ${stats.passed&&!state.batchGenerating?"":"disabled"}>${state.batchGenerating?"Generating…":"Generate Passed Proofs"}</button></div>
      </div></section>
      ${state.batchSource?`<div class="kpis" style="margin-top:12px"><div class="kpi"><div class="kpi-label">TOTAL</div><div class="kpi-value">${stats.total}</div></div><div class="kpi"><div class="kpi-label">PASSED</div><div class="kpi-value" style="color:#16835d">${stats.passed}</div></div><div class="kpi"><div class="kpi-label">FAILED</div><div class="kpi-value" style="color:#bc2f3b">${stats.failed}</div></div><div class="kpi"><div class="kpi-label">MAPPING</div><div class="kpi-value">${mapping.length}</div><div class="kpi-foot">fields detected</div></div></div>`:""}
      ${mapping.length?`<section class="card" style="margin-top:12px"><div class="card-head"><h3>Detected Mapping</h3><span class="subtle">自动表头映射，可保存为 Mapping Profile（D1 schema 已预留）</span></div>${table(["Canonical Field","Excel Column"],mapping.map(([field,col])=>[field,`${X.columnLabel(col)} · column ${Number(col)+1}`]))}</section>`:""}
      <section class="card" style="margin-top:12px"><div class="card-head"><h3>Import Review</h3><span class="subtle">真实行级 Preflight · 最多显示前 100 行</span></div>${review.length?table(["Row","SKU","Status","Issue"],review.map(r=>[r.row,r.sku,`<span class="badge ${r.status==="PASS"?"green":"red"}">${r.status}</span>`,r.issue]),true):`<div class="card-body"><div class="notice">尚未载入文件。导入后系统会先做 Excel 解析，再将每一行转换为 Canonical Artwork Data 并运行阻断检查。</div></div>`}</section>`;
  }

  function renderTemplates(){
    const tabs=["overview","variables","rules","layers","tests","versions"];
    return `<div class="split"><div class="subnav">${tabs.map(t=>`<button class="${state.templateTab===t?"active":""}" data-template-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}</div><div>
      <section class="card"><div class="card-head"><h3>美线侧封箱</h3><span class="badge green">Approved</span><span class="spacer"></span><span class="mono subtle">US_SIDE_SEAL · 2026.05.20</span></div><div class="card-body">${templateBody()}</div></section>
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
    if(state.templateTab==="versions") return table(["Version","Status","Effective","Note"],[
      ["2026.05.20","Approved","2026-05-20","Add factory customs registration code"],["2025.09.23","Deprecated","2025-09-23","Remove metric and lower content"],["2025.06.21","Deprecated","2025-06-21","Move barcode/QR"]
    ]);
    return `<div class="row2"><div><strong>Template Code</strong><p class="mono">US_SIDE_SEAL</p><strong>Preflight Profile</strong><p class="mono">US_SIDE_SEAL_K_ONLY_V1</p><strong>Print</strong><p>Single black / K-only</p></div><div><strong>Geometry</strong><p>Parametric mm model</p><strong>Source Calibration</strong><p>200 mm vector reference ≈ 199.46 mm</p><strong>CodeBlock</strong><p>250×80 / 200×64 mm</p></div></div>`;
  }

  function renderContent(){
    const tabs=["factories","customers","products","countries","shared"];
    const factories=D.factories.map(f=>[f.name,`<span class="mono">${f.crn}</span>`,f.country,f.effective,'<button class="btn small" data-impact="1">Edit CRN</button>']);
    return `<div class="tabs" style="border:1px solid #d8dee6;border-radius:7px 7px 0 0">${tabs.map(t=>`<button class="tab ${state.contentTab===t?"active":""}" data-content-tab="${t}">${t}</button>`).join("")}</div><section class="card" style="border-radius:0 0 7px 7px">${state.contentTab==="factories"?table(["Factory","CRN","Country","Effective",""],factories,true):`<div class="card-body"><div class="notice">该 Master Data 模块已预留。所有正式 Artwork Revision 保存冻结 Snapshot，Master Data 后续变化不会污染历史稿。</div></div>`}</section>`;
  }

  function renderQuality(){
    const tabs=["profiles","reports","compare"];
    let body="";
    if(state.qualityTab==="profiles") body=table(["Profile","Version","Status","Checks"],[["US_SIDE_SEAL_K_ONLY_V1","1","<span class='badge green'>Locked</span>","Data / Layout / Codes / Print"]],true);
    if(state.qualityTab==="reports") body=table(["Artwork","Profile","Status","Time","Output Hash"],[
      ["ART-260930-001","US_SIDE_SEAL_K_ONLY_V1","<span class='badge amber'>Warning</span>","09:25","b14f…92da"],["ART-260929-008","US_SIDE_SEAL_K_ONLY_V1","<span class='badge red'>Error</span>","Yesterday","—"]
    ],true);
    if(state.qualityTab==="compare") body=`<div class="card-body"><div class="notice">Version Compare roadmap: Text / Graphics / Code / Dieline · Side-by-side / Overlay / Difference / Flicker.</div></div>`;
    return `<div class="tabs" style="border:1px solid #d8dee6;border-radius:7px 7px 0 0">${tabs.map(t=>`<button class="tab ${state.qualityTab===t?"active":""}" data-quality-tab="${t}">${t}</button>`).join("")}</div><section class="card" style="border-radius:0 0 7px 7px">${body}</section>`;
  }

  function renderAdmin(){
    const roles=[["Operator","Create artwork, edit business data, export proof"],["Reviewer","Review, comment, reject, approve"],["Template Designer","Edit template drafts and rules"],["Template Approver","Publish template versions"],["Admin","Users, roles, master data, profiles"]];
    return `<div class="roles">${roles.map(r=>`<div class="role"><h4>${r[0]}</h4><p>${r[1]}</p></div>`).join("")}</div><section class="card" style="margin-top:12px"><div class="card-head"><h3>Audit Log</h3><span class="subtle">不可变操作记录</span></div>${table(["Who","When","Object","Action","Old","New","Reason"],[
      ["dong guo","09:18","ART-260930-001","Factory changed","Zhejiang B","Ningbo A","Production factory confirmed"],["Helen","09:24","ART-260930-001","Blocking comment","—","Open","Verify CRN"],["System","09:25","Preflight","Run","—","1 warning","Manual run"]
    ])}</section>`;
  }

  function table(headers, rows, html=false){
    return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${html?String(v):esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderDialog(){
    if(state.dialog!=="impact") return "";
    return `<div class="dialog-backdrop"><div class="dialog"><div class="dialog-head">CRN Impact Analysis</div><div class="dialog-body"><div class="impact"><div><strong>3</strong>templates</div><div><strong>27</strong>draft artworks</div><div><strong>5</strong>approved-unproduced</div><div><strong>164</strong>historical</div></div><div class="notice warn" style="margin-top:12px">历史 Revision 为冻结 Snapshot，不自动修改。需要更新的未生产稿应创建新 Revision。</div><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-action="close-dialog">Close</button><button class="btn primary" data-action="impact-revision">Create New Revisions</button></div></div></div></div>`;
  }

  function bind(){
    document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render();});
    document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
    document.querySelectorAll("[data-template-tab]").forEach(b=>b.onclick=()=>{state.templateTab=b.dataset.templateTab;render();});
    document.querySelectorAll("[data-content-tab]").forEach(b=>b.onclick=()=>{state.contentTab=b.dataset.contentTab;render();});
    document.querySelectorAll("[data-quality-tab]").forEach(b=>b.onclick=()=>{state.qualityTab=b.dataset.qualityTab;render();});
    document.querySelectorAll("[data-impact]").forEach(b=>b.onclick=()=>{state.dialog="impact";render();});
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
    const file=document.getElementById("batch-file");
    if(file) file.onchange=async()=>{ if(file.files?.[0]) await importBatch(file.files[0]); };
  }

  async function handleAction(action){
    if(action==="save"){localStorage.setItem("cas:draft",JSON.stringify(state.artwork));toast("草稿已保存到本地","success");}
    if(action==="preflight"){state.pfBusy=true;render();setTimeout(()=>{state.pfBusy=false;render();toast("Preflight 已重新计算","success");},650);}
    if(action==="submit"){state.artwork.status="in_review";render();toast("已进入 In Review","success");}
    if(action==="resolve-comment"){state.resolvedBlockingComment=true;render();toast("Blocking comment 已解决","success");}
    if(action==="proof") return exportProof();
    if(action==="production") return exportProduction();
    if(action==="dry-run"){
      state.batchReview=B.buildReview(state.batchRecords,state.batchIssues,D,{defaults:D.defaultArtwork,factories:D.factories,codes:C});
      state.batchStep=Math.max(state.batchStep,3);render();
      const s=B.summarize(state.batchReview);toast(`Dry Run: ${s.passed} passed / ${s.failed} failed`,s.failed?"error":"success");
    }
    if(action==="download-errors"){downloadText("failed_rows.csv",B.failedRowsCsv(state.batchReview),"text/csv;charset=utf-8");}
    if(action==="batch-generate") return exportBatchProofs();
    if(action==="close-dialog"){state.dialog=null;render();}
    if(action==="impact-revision"){state.dialog=null;render();toast("已生成受影响 Artwork 的新 Revision 任务","success");}
  }

  function exportProof(){
    const g=geometry(), c=computed(), code=C.code128Bars(state.artwork.barcode,{moduleMm:.42,heightMm:25}), qr=C.qrMatrix(state.artwork.qr,"M").matrix;
    const blob=P.createPdfBlob({artwork:state.artwork,geometry:g,computed:c,codeModel:code,qrMatrix:qr,mode:"proof"});
    downloadBlob(fileBase()+"_Proof.pdf",blob); toast("已生成 1:1 mm Vector Proof PDF（Code128 + QR 均为矢量）","success");
  }

  async function productionArtifactSet(artwork, mode="production"){
    const g=D.sideSealGeometry(artwork), comp=D.computed(artwork);
    const code=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
    const qr=C.qrMatrix(artwork.qr,"M").matrix;
    const pdfBytes=P.createPdfBytes({artwork,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode});
    const svg=`<?xml version="1.0" encoding="UTF-8"?>\n${dielineSvg(mode,artwork)}`;
    const snapshot=JSON.stringify(D.canonicalData(artwork),null,2);
    const pfGroups=checksFor(artwork), pfSummary=D.preflightSummary(pfGroups);
    const preflight=JSON.stringify({summary:pfSummary,groups:pfGroups,generatedAt:new Date().toISOString()},null,2);
    const manifest=D.manifest(artwork,"vector-svg-pdf-0.5.0");
    manifest.qr={encoder:"qrcode-generator",errorCorrectionLevel:"M",vector:true};
    manifest.barcode={symbology:"Code 128-B PoC",vector:true};
    manifest.sha256={
      pdf:await sha256(pdfBytes),
      svg:await sha256(svg),
      snapshot:await sha256(snapshot),
      preflight:await sha256(preflight)
    };
    const base=B.safeBase(artwork);
    return {base,files:[
      {name:"Production.pdf",data:pdfBytes},
      {name:"Production.svg",data:svg},
      {name:"DataSnapshot.json",data:snapshot},
      {name:"PreflightReport.json",data:preflight},
      {name:"Manifest.json",data:JSON.stringify(manifest,null,2)}
    ]};
  }

  async function exportProduction(){
    const s=summary();
    if(state.artwork.status!=="approved"||s.blocking>0||!state.resolvedBlockingComment){toast("Production Export 被审核状态、阻断错误或未解决评论锁定","error");return;}
    const built=await productionArtifactSet(state.artwork,"production");
    built.files.push({name:"README.txt",data:"Approved Production Bundle\nTemplate: "+state.artwork.templateCode+" "+state.artwork.templateVersion+"\nRevision: "+state.artwork.revision+"\nQR ECC: M\nFont embedding / PDF-X remain separate production gates.\n"});
    downloadBlob(built.base+"_ProductionBundle.zip",Z.createZipBlob(built.files));
    toast("Production Bundle ZIP 已生成：PDF / SVG / Snapshot / Preflight / SHA-256 Manifest","success");
  }

  async function exportBatchProofs(){
    const passed=state.batchReview.filter(r=>r.status==="PASS");
    if(!passed.length){toast("没有可生成的通过记录","error");return;}
    state.batchGenerating=true;render();
    try{
      const files=[],index=[];
      for(const row of passed){
        const art={...row.artwork,status:"draft",revision:"R01"};
        const g=D.sideSealGeometry(art),comp=D.computed(art),code=C.code128Bars(art.barcode,{moduleMm:.42,heightMm:25}),qr=C.qrMatrix(art.qr,"M").matrix;
        const pdf=P.createPdfBytes({artwork:art,geometry:g,computed:comp,codeModel:code,qrMatrix:qr,mode:"proof"});
        const svg=`<?xml version="1.0" encoding="UTF-8"?>\n${dielineSvg("proof",art)}`;
        const snap=JSON.stringify(D.canonicalData(art),null,2);
        const prefix=`row-${String(row.row).padStart(4,"0")}_${B.safeBase(art)}/`;
        files.push({name:prefix+"Proof.pdf",data:pdf},{name:prefix+"Proof.svg",data:svg},{name:prefix+"DataSnapshot.json",data:snap});
        index.push({row:row.row,sku:art.sku,path:prefix,status:"PASS"});
      }
      const stats=B.summarize(state.batchReview);
      files.push({name:"BatchManifest.json",data:JSON.stringify({version:"0.5.0",source:state.batchSource,summary:stats,generatedAt:new Date().toISOString(),items:index},null,2)});
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
    try{
      const parsed=await X.parseFile(file);
      const result=X.rowsToRecords(parsed.rows,{fillDown:true});
      const review=B.buildReview(result.records,result.issues,D,{defaults:D.defaultArtwork,factories:D.factories,codes:C});
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
    }catch(e){toast(e.message||String(e),"error");}
  }

  function fileBase(){return `${state.artwork.templateCode}_${state.artwork.sku}_${state.artwork.currentPackage}-${state.artwork.packageCount}_${state.artwork.revision}`.replace(/[^a-z0-9._-]+/gi,"_");}
  function downloadText(name,text,type){downloadBlob(name,new Blob([text],{type}));}
  function downloadBlob(name,blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
  function toast(msg,type=""){const t=document.createElement("div");t.className="toast "+type;t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600);}

  const saved=localStorage.getItem("cas:draft");
  if(saved){try{state.artwork={...state.artwork,...JSON.parse(saved)};}catch{}}
  render();
})();
