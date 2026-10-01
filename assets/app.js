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
    apiBindings: { d1:false, artifactStore:false, artifactStoreKind:"NONE", kv:false, r2:false, assets:false },
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
    revisionCompare: null,
    compareMode: "side",
    compareOpacity: 0.5,
    systemReadiness: null,
    readinessProbeBusy: false,
    productionAssets: [],
    productionAssetBusy: false,
    pdfxValidationRuns: [],
    pdfxPromotionReadiness: null,
    pdfxPromotionEvidence: [],
    promotionEvidenceBusy: false,
    selectedElementId: null,
    historyPast: [],
    historyFuture: []
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
    const customBars=(Array.isArray(artwork.elements)?artwork.elements:[]).filter(e=>e.visible!==false&&e.type==="barcode");
    for(const element of customBars){
      let item=(groups.Assets||[]).find(x=>x.id===`barcode-data-${element.id||element.name}`);
      try{
        const itf=String(element.symbology||"").toUpperCase()==="ITF14";
        const payload=D.resolvedElementPayload(element,artwork,state.factories);
        const model=itf?C.itf14Bars(payload):C.code128Bars(payload);
        if(item){
          item.status="pass";item.blocking=false;
          item.title=itf?"ITF-14 / GTIN-14 vector encoding":"Code 128-B vector encoding";
          item.detail=itf
            ? `GTIN-14 ${model.payload} · check digit ${model.checkDigit} · vector bars generated.`
            : `Encodable payload · ${model.bars.length} vector bars.`;
        }
      }catch(err){
        if(!item){
          item={id:`barcode-data-${element.id}`,title:"Barcode encoding",category:"Assets"};
          (groups.Assets||(groups.Assets=[])).push(item);
        }
        item.status="error";item.blocking=true;item.detail=err.message||String(err);
      }
    }
    const customQrs=(Array.isArray(artwork.elements)?artwork.elements:[]).filter(e=>e.visible!==false&&e.type==="qr-generated");
    for(const element of customQrs){
      const item=(groups.Assets||[]).find(x=>x.id===`qr-generated-${element.id||element.name}`);
      try{
        const payload=D.resolvedElementPayload(element,artwork,state.factories);
        const model=C.qrMatrix(payload,element.ecc||"M");
        if(item){
          item.status="pass";item.blocking=false;
          item.detail=`Version ${model.version} · ECC ${model.errorCorrectionLevel} · ${model.matrix.length}×${model.matrix.length} modules · data source ${element.bindingKey||"manual"}.`;
        }
      }catch(err){
        if(item){item.status="error";item.blocking=true;item.detail=err.message||String(err);}
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
  function localArtworkEditable(){return !["in_review","approved"].includes(state.artwork.status);}
  function cloudArtworkWritable(){return state.apiOnline&&permitted("artworkWrite");}
  function cloudBatchWritable(){return state.apiOnline&&permitted("batchWrite");}
  function persistLocalDraft(){
    try{localStorage.setItem("cas:draft",JSON.stringify(state.artwork));return true;}
    catch{return false;}
  }
  function artworkSnapshot(){
    return JSON.stringify(state.artwork);
  }
  function clearArtworkHistory(){
    state.historyPast=[];
    state.historyFuture=[];
  }
  function pushArtworkHistory(){
    const snapshot=artworkSnapshot();
    if(state.historyPast.at(-1)===snapshot) return;
    state.historyPast.push(snapshot);
    if(state.historyPast.length>12) state.historyPast.shift();
    state.historyFuture=[];
  }
  function restoreArtworkSnapshot(snapshot){
    try{
      state.artwork=JSON.parse(snapshot);
      if(state.selectedElementId&&!artworkElements().some(e=>e.id===state.selectedElementId)) state.selectedElementId=null;
      persistLocalDraft();
      render();
      return true;
    }catch{return false;}
  }
  function undoArtwork(){
    if(!state.historyPast.length){toast("没有可撤销的操作。");return;}
    state.historyFuture.push(artworkSnapshot());
    const snapshot=state.historyPast.pop();
    restoreArtworkSnapshot(snapshot);
  }
  function redoArtwork(){
    if(!state.historyFuture.length){toast("没有可重做的操作。");return;}
    state.historyPast.push(artworkSnapshot());
    const snapshot=state.historyFuture.pop();
    restoreArtworkSnapshot(snapshot);
  }
  function artworkElements(){
    if(!Array.isArray(state.artwork.elements)) state.artwork.elements=[];
    return state.artwork.elements;
  }
  function selectedArtworkElement(){
    return artworkElements().find((e)=>e.id===state.selectedElementId)||null;
  }
  function newElementId(){
    return "el-"+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36));
  }
  function elementTransform(e){
    return `translate(${Number(e.x||0).toFixed(3)} ${Number(e.y||0).toFixed(3)}) rotate(${Number(e.rotation||0).toFixed(2)} ${(Number(e.w||0)/2).toFixed(3)} ${(Number(e.h||0)/2).toFixed(3)})`;
  }
  function panelById(id,artwork=state.artwork){
    return D.sideSealGeometry(artwork).panels.find((p)=>p.id===id)||null;
  }
  function defaultElementPlacement(w=50,h=50){
    const g=geometry();
    const panel=g.panels.find((p)=>p.id==="TOP_FACE")||g.panels[0];
    return {
      panelId:panel.id,
      x:Math.max(panel.x,panel.x+(panel.w-w)/2),
      y:Math.max(panel.y,panel.y+(panel.h-h)/2)
    };
  }
  function elementBounds(e){
    const g=geometry();
    if(e.constrainToPanel!==false){
      const p=panelById(e.panelId);
      if(p) return p;
    }
    return {x:0,y:0,w:g.totalWidth,h:g.totalHeight};
  }
  function clampElementToBounds(e){
    const b=elementBounds(e),w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1));
    e.x=Math.max(b.x,Math.min(b.x+b.w-w,Number(e.x||b.x)));
    e.y=Math.max(b.y,Math.min(b.y+b.h-h,Number(e.y||b.y)));
    return e;
  }
  function placeElementInPanel(e,panelId){
    const p=panelById(panelId);
    if(!p)return;
    e.panelId=p.id;
    const w=Math.min(Math.max(5,Number(e.w||5)),p.w);
    const h=Math.min(Math.max(5,Number(e.h||5)),p.h);
    e.w=w;e.h=h;
    e.x=p.x+(p.w-w)/2;
    e.y=p.y+(p.h-h)/2;
  }
  function snapElementPosition(e,x,y){
    const b=elementBounds(e),w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1)),snap=4;
    let nx=Math.max(b.x,Math.min(b.x+b.w-w,x));
    let ny=Math.max(b.y,Math.min(b.y+b.h-h,y));
    const xs=[b.x,b.x+b.w-w,b.x+(b.w-w)/2];
    const ys=[b.y,b.y+b.h-h,b.y+(b.h-h)/2];
    for(const v of xs) if(Math.abs(nx-v)<=snap){nx=v;break;}
    for(const v of ys) if(Math.abs(ny-v)<=snap){ny=v;break;}
    return {x:nx,y:ny};
  }
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
          <div class="sidebar-foot">Environment<br><strong>STAGING · Cloudflare Workers</strong><br>Geometry: mm<br><span class="badge ${state.apiOnline&&state.identity?"green":state.apiChecked?"amber":"blue"}">${state.apiOnline&&state.identity?"Cloud Connected":state.apiChecked?"Local Editing · Cloud Login Required":"Connecting…"}</span><div class="subtle" style="margin-top:6px;word-break:break-word">${esc(identityLabel())}</div></div>
        </aside>
        <section class="main">
          <header class="topbar">
            <div class="breadcrumb">Carton Artwork Studio /</div><div class="page-title">${esc(titleZh)}</div><div class="breadcrumb">${esc(titleEn)}</div>
            <div class="spacer"></div>
            <label class="search"><input id="global-search" placeholder="搜索 SKU / Contract / Artwork…" /></label>
            <span class="dev">STAGING</span><span class="subtle mono">${state.identity?esc(state.identity.email):"Local workspace"}</span><button class="icon-btn" title="Notifications">◔</button><div class="avatar">${state.identity?esc((state.identity.displayName||state.identity.email).slice(0,2).toUpperCase()):"—"}</div>
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
    const prod = state.artwork.status === "approved" && s.blocking === 0 && blockingCommentsResolved() && permitted("productionExport") && state.apiOnline && state.apiBindings.r2 && Boolean(state.remoteArtworkId) && Boolean(state.productionReadiness?.ready);
    const cloudWrite=cloudArtworkWritable();
    return `
      ${!cloudWrite?`<div class="notice warn" style="margin-bottom:12px"><strong>本地编辑模式</strong>：现在可以正常编辑、运行检查、导入文件和导出审核稿；“同步云端 / 提交审核 / 审批 / 正式生产”需要 Cloudflare Access 身份。</div>`:""}
      <div class="artwork-header">
        <div><div class="artwork-title">美线侧封箱 <span class="badge blue">US_SIDE_SEAL</span></div><div class="meta mono">Template 2026.05.20 · Revision ${state.artwork.revision} · SKU ${esc(state.artwork.sku)}</div></div>
        <div class="spacer"></div>
        <span class="badge ${state.artwork.status==="approved"?"green":state.artwork.status==="in_review"?"blue":state.artwork.status==="rejected"?"red":"amber"}">${esc(state.artwork.status.replace("_"," ").toUpperCase())}</span>
        <button class="btn" data-action="new-local">新建本地稿</button>
        <button class="btn" data-action="save" ${state.apiBusy||!localArtworkEditable()?"disabled":""}>${cloudWrite?"保存草稿":"保存本地草稿"}</button>
        <button class="btn" data-action="preflight" ${state.apiBusy?"disabled":""}>运行检查</button>
        <button class="btn primary" data-action="submit" title="${cloudWrite?"":"需要 Cloudflare Access + Artwork Write 权限"}" ${!["draft","rejected"].includes(state.artwork.status)||summary().blocking>0||state.apiBusy||!cloudWrite?"disabled":""}>${cloudWrite?"提交审核":"提交审核（需登录）"}</button>
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
  function isArtworkLocked(){return !localArtworkEditable();}

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
        ${field("Barcode","Current template Code 128-B",input("barcode",a.barcode))}
        ${field("QR payload","Locked template CodeBlock",input("qr",a.qr))}
        ${field("CodeBlock Profile","locked component",`<select class="select" data-art="codeBlockProfile" ${isArtworkLocked()?"disabled":""}><option value="250x80" ${a.codeBlockProfile==="250x80"?"selected":""}>250 × 80 mm</option><option value="200x64" ${a.codeBlockProfile==="200x64"?"selected":""}>200 × 64 mm</option></select>`)}
        <div class="notice">模板自带 Barcode + QR 仍作为锁定 CodeBlock。下面“元素”区可额外上传 Logo/图片、上传二维码，或生成独立矢量 QR。</div>
      `)}
      ${renderElementEditor()}
    `;
  }

  function renderElementEditor(){
    const elements=artworkElements();
    const selected=selectedArtworkElement();
    const locked=isArtworkLocked();
    const rows=[...elements].reverse().map((e)=>{
      const label=e.type==="qr-generated"?"QR":e.type==="qr-image"?"QR IMG":e.type==="text"?"TEXT":e.type==="barcode"?"BAR":e.type==="symbol"?"SYM":"IMG";
      return `<button type="button" class="element-row ${state.selectedElementId===e.id?"active":""} ${e.visible===false?"muted":""}" data-select-element="${esc(e.id)}">
        <span class="element-type">${label}</span>
        <span class="element-name">${esc(e.name||e.type)}</span>
        <span class="mono subtle">${esc(e.panelId||"—")}</span>
        ${e.visible===false?'<span class="badge gray">HIDE</span>':e.locked?'<span class="badge amber">LOCK</span>':""}
      </button>`;
    }).join("");
    const panelOptions=geometry().panels.map(p=>`<option value="${p.id}" ${selected?.panelId===p.id?"selected":""}>${p.id}</option>`).join("");
    const bindingOptions=(D.artworkBindings||[]).map(b=>`<option value="${esc(b.key)}" ${selected?.bindingKey===b.key?"selected":""}>${esc(b.label)}</option>`).join("");
    const props=selected?`
      <div class="element-properties">
        <div class="field"><label>Name</label><input class="input" data-element-prop="name" value="${esc(selected.name||"")}"/></div>
        <div class="field"><label>Panel 面板</label><select class="select" data-element-prop="panelId">${panelOptions}</select></div>
        <div class="row2">
          <label class="toggle-line"><input type="checkbox" data-element-visible ${selected.visible!==false?"checked":""}/> Visible</label>
          <label class="toggle-line"><input type="checkbox" data-element-lock ${selected.locked?"checked":""}/> Lock</label>
        </div>
        <label class="toggle-line"><input type="checkbox" data-element-constrain ${selected.constrainToPanel!==false?"checked":""}/> 限制在所属面板内</label>
        ${selected.type==="text"?`
          <div class="field"><label>Data Source 数据源</label><select class="select" data-element-prop="bindingKey">${bindingOptions}</select></div>
          ${selected.bindingKey?`<div class="notice binding-preview"><strong>Resolved</strong><br><span class="mono">${esc(D.resolvedElementText(selected,state.artwork,state.factories)||"—")}</span></div>`:""}
          <div class="field"><label>Text 文本</label><textarea class="input" rows="3" data-element-prop="text" ${selected.bindingKey?"disabled":""}>${esc(selected.text||"")}</textarea></div>
          <div class="row3">
            <div class="field"><label>pt</label><input class="input mono" type="number" min="5" step="0.5" data-element-prop="fontSizePt" value="${esc(selected.fontSizePt||12)}"/></div>
            <div class="field"><label>Weight</label><select class="select" data-element-prop="fontWeight"><option value="normal" ${selected.fontWeight!=="bold"?"selected":""}>Normal</option><option value="bold" ${selected.fontWeight==="bold"?"selected":""}>Bold</option></select></div>
            <div class="field"><label>Align</label><select class="select" data-element-prop="textAlign"><option value="left" ${selected.textAlign==="left"?"selected":""}>Left</option><option value="center" ${selected.textAlign==="center"?"selected":""}>Center</option><option value="right" ${selected.textAlign==="right"?"selected":""}>Right</option></select></div>
          </div>`:""}
        ${selected.type==="qr-generated"?`
          <div class="field"><label>Data Source 数据源</label><select class="select" data-element-prop="bindingKey">${bindingOptions}</select></div>
          ${selected.bindingKey?`<div class="notice binding-preview"><strong>Resolved</strong><br><span class="mono">${esc(D.resolvedElementPayload(selected,state.artwork,state.factories)||"—")}</span></div>`:""}
          <div class="field"><label>QR payload</label><textarea class="input" rows="3" data-element-prop="payload" ${selected.bindingKey?"disabled":""}>${esc(selected.payload||"")}</textarea></div>
          <div class="field"><label>Error correction</label><select class="select" data-element-prop="ecc">${["L","M","Q","H"].map(x=>`<option ${selected.ecc===x?"selected":""}>${x}</option>`).join("")}</select></div>`:""}
        ${selected.type==="barcode"?`
          <div class="field"><label>Data Source 数据源</label><select class="select" data-element-prop="bindingKey">${bindingOptions}</select></div>
          ${selected.bindingKey?`<div class="notice binding-preview"><strong>Resolved</strong><br><span class="mono">${esc(D.resolvedElementPayload(selected,state.artwork,state.factories)||"—")}</span></div>`:""}
          <div class="field"><label>Barcode payload</label><input class="input mono" data-element-prop="payload" value="${esc(selected.payload||"")}" ${selected.bindingKey?"disabled":""}/></div>
          <div class="row2">
            <div class="field"><label>Symbology</label><select class="select" data-element-prop="symbology"><option value="CODE128B" ${selected.symbology!=="ITF14"?"selected":""}>Code 128-B</option><option value="ITF14" ${selected.symbology==="ITF14"?"selected":""}>ITF-14 / GTIN-14</option></select></div>
            <label class="toggle-line"><input type="checkbox" data-element-hri ${selected.humanReadable!==false?"checked":""}/> Human readable</label>
          </div>
          <div class="notice">ITF-14 仅接受 GTIN 数字；13 位会自动计算校验位，14 位会验证校验位。</div>
        `:""}
        ${selected.type==="symbol"?`
          <div class="field"><label>Handling symbol</label><select class="select" data-element-prop="symbolKey">
            <option value="THIS_WAY_UP" ${selected.symbolKey==="THIS_WAY_UP"?"selected":""}>This Way Up</option>
            <option value="KEEP_DRY" ${selected.symbolKey==="KEEP_DRY"?"selected":""}>Keep Dry</option>
            <option value="FRAGILE" ${selected.symbolKey==="FRAGILE"?"selected":""}>Fragile</option>
          </select></div>
          <div class="notice warn">当前为 Review Library 矢量符号。正式生产须绑定客户/工厂批准的受控 Symbol Master。</div>
        `:""}
        <div class="row2">
          <div class="field"><label>X mm</label><input class="input mono" type="number" step="1" data-element-prop="x" value="${esc(selected.x)}"/></div>
          <div class="field"><label>Y mm</label><input class="input mono" type="number" step="1" data-element-prop="y" value="${esc(selected.y)}"/></div>
        </div>
        <div class="row3">
          <div class="field"><label>W mm</label><input class="input mono" type="number" min="5" step="1" data-element-prop="w" value="${esc(selected.w)}"/></div>
          <div class="field"><label>H mm</label><input class="input mono" type="number" min="5" step="1" data-element-prop="h" value="${esc(selected.h)}"/></div>
          <div class="field"><label>°</label><input class="input mono" type="number" step="1" data-element-prop="rotation" value="${esc(selected.rotation||0)}"/></div>
        </div>
        <div class="element-action-grid">
          <button class="btn small" data-action="duplicate-element">Duplicate</button>
          <button class="btn small" data-action="layer-front">To Front</button>
          <button class="btn small" data-action="layer-up">Up</button>
          <button class="btn small" data-action="layer-down">Down</button>
          <button class="btn small" data-action="layer-back">To Back</button>
          <button class="btn danger small" data-action="delete-element" ${locked?"disabled":""}>Delete</button>
        </div>
        <div class="align-grid">
          ${[["align-left","左"],["align-hcenter","水平中"],["align-right","右"],["align-top","顶"],["align-vcenter","垂直中"],["align-bottom","底"]].map(([a,n])=>`<button class="tool" data-action="${a}">${n}</button>`).join("")}
        </div>
      </div>`:'<div class="notice">选择元素后可设置面板、图层、对齐、锁定与毫米位置。</div>';
    return formSection("Elements 元素",`
      <div class="notice" style="margin-bottom:10px"><strong>面板化唛头元素</strong>：每个对象属于一个纸箱面板；默认不会越过折线。后添加的对象位于更高图层。</div>
      <div class="toolbar element-tools">
        <input id="art-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden/>
        <input id="art-qr-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden/>
        <button class="btn small" data-action="add-text-element" ${locked?"disabled":""}>＋ 文字</button>
        <button class="btn small" data-action="add-barcode-element" ${locked?"disabled":""}>＋ 条码</button>
        <button class="btn small" data-action="upload-image-trigger" ${locked?"disabled":""}>＋ 图片 / Logo</button>
        <button class="btn small" data-action="upload-qr-trigger" ${locked?"disabled":""}>＋ 上传二维码</button>
        <select id="handling-symbol-select" class="select compact-select" ${locked?"disabled":""}>
          <option value="THIS_WAY_UP">This Way Up</option>
          <option value="KEEP_DRY">Keep Dry</option>
          <option value="FRAGILE">Fragile</option>
        </select>
        <button class="btn small" data-action="add-handling-symbol" ${locked?"disabled":""}>＋ 包装图标</button>
      </div>
      <div class="row2" style="margin-top:8px">
        <div class="field"><label>变量数据字段</label><select id="binding-preset-select" class="select">${(D.artworkBindings||[]).filter(b=>b.key).map(b=>`<option value="${esc(b.key)}">${esc(b.label)}</option>`).join("")}</select></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" style="width:100%" data-action="add-bound-text-element" ${locked?"disabled":""}>＋ 数据字段</button></div>
      </div>
      <div class="field" style="margin-top:8px"><label>生成二维码内容</label><textarea id="custom-qr-payload" class="input" rows="2" placeholder="URL / SKU / GS1 Digital Link / 自定义内容">${esc(state.artwork.qr||"")}</textarea></div>
      <div class="row2">
        <div class="field"><label>ECC</label><select id="custom-qr-ecc" class="select"><option>L</option><option selected>M</option><option>Q</option><option>H</option></select></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" style="width:100%" data-action="add-generated-qr" ${locked?"disabled":""}>生成矢量 QR</button></div>
      </div>
      <div class="element-list">${rows||'<div class="subtle">还没有自定义元素。</div>'}</div>
      ${props}
    `);
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
      <button class="tool" data-action="undo-artwork" ${state.historyPast.length?"":"disabled"} title="Ctrl/Cmd+Z">↶ Undo</button>
      <button class="tool" data-action="redo-artwork" ${state.historyFuture.length?"":"disabled"} title="Ctrl/Cmd+Shift+Z / Ctrl+Y">↷ Redo</button>
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

  function handlingSymbolSvgBody(key,w,h){
    const sw=Math.max(1.2,Math.min(w,h)*0.045);
    if(key==="THIS_WAY_UP"){
      const x1=w*.34,x2=w*.66,top=h*.12,bottom=h*.85,head=h*.22;
      return `<g fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="square" stroke-linejoin="miter">
        <line x1="${x1}" y1="${bottom}" x2="${x1}" y2="${top+head}"/><polyline points="${x1-w*.12},${top+head} ${x1},${top} ${x1+w*.12},${top+head}"/>
        <line x1="${x2}" y1="${bottom}" x2="${x2}" y2="${top+head}"/><polyline points="${x2-w*.12},${top+head} ${x2},${top} ${x2+w*.12},${top+head}"/>
      </g>`;
    }
    if(key==="KEEP_DRY"){
      const cx=w/2,cy=h*.43,rx=w*.36,ry=h*.25;
      return `<g fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M ${cx-rx} ${cy} Q ${cx} ${cy-ry*1.8} ${cx+rx} ${cy} Q ${cx+rx*.5} ${cy-ry*.25} ${cx} ${cy} Q ${cx-rx*.5} ${cy-ry*.25} ${cx-rx} ${cy}"/>
        <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${h*.79}"/><path d="M ${cx} ${h*.79} q 0 ${h*.09} ${w*.09} ${h*.09}"/>
        <line x1="${w*.18}" y1="${h*.08}" x2="${w*.12}" y2="${h*.20}"/><line x1="${w*.82}" y1="${h*.08}" x2="${w*.88}" y2="${h*.20}"/>
      </g>`;
    }
    if(key==="FRAGILE"){
      return `<g fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M ${w*.28} ${h*.12} L ${w*.72} ${h*.12} L ${w*.63} ${h*.48} Q ${w*.58} ${h*.62} ${w*.5} ${h*.62} Q ${w*.42} ${h*.62} ${w*.37} ${h*.48} Z"/>
        <line x1="${w*.5}" y1="${h*.62}" x2="${w*.5}" y2="${h*.84}"/><line x1="${w*.32}" y1="${h*.86}" x2="${w*.68}" y2="${h*.86}"/>
      </g>`;
    }
    return `<rect x="1" y="1" width="${Math.max(1,w-2)}" height="${Math.max(1,h-2)}" fill="none" stroke="#bc2f3b" stroke-width="${sw}"/>`;
  }

  function barcodeSvgBody(element,w,h,artwork=state.artwork,factoryList=state.factories){
    try{
      const payload=D.resolvedElementPayload(element,artwork,factoryList);
      const itf=String(element.symbology||"").toUpperCase()==="ITF14";
      const model=itf
        ? C.itf14Bars(payload,{moduleMm:.8,heightMm:30})
        : C.code128Bars(payload,{moduleMm:.42,heightMm:28});
      const hri=element.humanReadable!==false;
      const hriH=hri?Math.min(8,h*.22):0;
      const maxW=Math.max(1,w-4),maxH=Math.max(1,h-hriH-3);
      const sx=maxW/Math.max(1,model.widthMm),sy=maxH/Math.max(1,model.heightMm);
      const x0=2,y0=1;
      const bars=model.bars.map(b=>`<rect x="${(x0+b.x*sx).toFixed(3)}" y="${y0}" width="${Math.max(.15,b.w*sx).toFixed(3)}" height="${Math.max(.5,b.h*sy).toFixed(3)}" fill="#000"/>`).join("");
      const label=itf?(model.payload||payload):payload;
      const text=hri?`<text x="${w/2}" y="${h-1.5}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${Math.max(3,Math.min(5.5,hriH*.65))}" fill="#000">${esc(label)}</text>`:"";
      return `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>${bars}${text}`;
    }catch(err){
      return `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="#bc2f3b"/><text x="5" y="15" font-size="9" fill="#bc2f3b">Invalid barcode</text>`;
    }
  }

  function renderCustomElements(artwork=state.artwork,mode="editor",factoryList=state.factories){
    const elements=Array.isArray(artwork.elements)?artwork.elements:[];
    return elements.filter((e)=>e.visible!==false).map((e)=>{
      const w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1));
      const selected=mode==="editor"&&state.selectedElementId===e.id;
      const border=selected?`<rect data-element-selection x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#e13b6b" stroke-width="2" stroke-dasharray="7 4" vector-effect="non-scaling-stroke"/>`:"";
      const resizeHandle=selected&&!e.locked?`<rect data-element-resize="${esc(e.id)}" x="${Math.max(0,w-4)}" y="${Math.max(0,h-4)}" width="8" height="8" rx="1.5" fill="#fff" stroke="#e13b6b" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:nwse-resize"/>`:"";
      let body="";
      if((e.type==="image"||e.type==="qr-image")&&e.dataUrl){
        body=`<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/><image href="${esc(e.dataUrl)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
      }else if(e.type==="text"){
        const fontMm=Math.max(1,Number(e.fontSizePt||12))*25.4/72;
        const lines=D.resolvedElementText(e,artwork,factoryList).split(/\r?\n/);
        const anchor=e.textAlign==="center"?"middle":e.textAlign==="right"?"end":"start";
        const tx=e.textAlign==="center"?w/2:e.textAlign==="right"?w:0;
        const weight=e.fontWeight==="bold"?"700":"400";
        body=`<text x="${tx}" y="${fontMm}" text-anchor="${anchor}" font-family="Arial,Helvetica,sans-serif" font-size="${fontMm}" font-weight="${weight}" fill="#000">${lines.map((line,i)=>`<tspan x="${tx}" dy="${i===0?0:fontMm*1.2}">${esc(line)}</tspan>`).join("")}</text>`;
      }else if(e.type==="barcode"){
        body=barcodeSvgBody(e,w,h,artwork,factoryList);
      }else if(e.type==="symbol"){
        body=handlingSymbolSvgBody(e.symbolKey,w,h);
      }else if(e.type==="qr-generated"){
        try{
          const model=C.qrMatrix(D.resolvedElementPayload(e,artwork,factoryList),e.ecc||"M");
          const quiet=4,n=model.matrix.length,size=Math.min(w,h),cell=size/(n+quiet*2),ox=(w-size)/2,oy=(h-size)/2;
          const modules=model.matrix.flatMap((row,rr)=>row.map((v,cc)=>v?`<rect x="${(ox+(cc+quiet)*cell).toFixed(3)}" y="${(oy+(rr+quiet)*cell).toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="#000"/>`:"")).join("");
          body=`<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="#fff"/>${modules}`;
        }catch{
          body=`<rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="#bc2f3b"/><text x="5" y="18" font-size="10" fill="#bc2f3b">Invalid QR</text>`;
        }
      }
      return `<g data-art-element="${esc(e.id)}" data-element-locked="${e.locked?"1":"0"}" transform="${elementTransform(e)}" style="cursor:${e.locked?"default":"move"}">${body}${border}${resizeHandle}</g>`;
    }).join("");
  }

  function dielineSvg(mode="editor", artwork=state.artwork, options={}) {
    const a=artwork;
    const g=D.sideSealGeometry(a);
    const factoryList=options.factories||state.factories;
    const c=D.computed(a,factoryList);
    const safe=22;
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
    const qrEcc=String(options.qrEcc||approvedQrEcc()||"M").toUpperCase();
    const code=renderCodeBlock(g.H+g.L-320,g.H+g.W+g.H+g.W-118,a.codeBlockProfile,a,{qrEcc});
    const note=c.packageNote?`<text x="${bx}" y="${by+108}" font-size="12" font-family="Arial" fill="#000">${esc(c.packageNote)}</text>`:"";
    const custom=renderCustomElements(a,mode,factoryList);
    const watermark=proof?`<text x="${g.H+g.L/2}" y="${g.totalHeight/2}" text-anchor="middle" transform="rotate(-15 ${g.H+g.L/2} ${g.totalHeight/2})" font-family="Arial" font-size="46" fill="#000" opacity=".12">NOT FOR PRODUCTION</text>`:"";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${g.totalWidth}mm" height="${g.totalHeight}mm" aria-label="US side seal carton artwork">
      <rect x="-50" y="-50" width="${g.totalWidth+100}" height="${g.totalHeight+100}" fill="#fff"/>
      ${cut}${crease}${safeBox}${labels}
      <g fill="#000" font-family="Arial,Helvetica,sans-serif">
        <text x="${bx}" y="${by}" font-size="22" font-weight="700">${esc(a.sku)}</text>
        <text x="${bx}" y="${by+24}" font-size="14">N.W. ${esc(a.netWeight)} LBS   G.W. ${esc(a.grossWeight)} LBS</text>
        <text x="${bx}" y="${by+44}" font-size="14">Package Meas ${esc(c.packageMeas)}</text>
        <text x="${bx}" y="${by+64}" font-size="14">CRN ${esc(c.crn)}</text>
        <text x="${bx}" y="${by+84}" font-size="14">Contract No ${esc(a.contractNo)}   ·   ${esc(c.originText)}   ·   ${esc(a.market||"US")}</text>
        ${note}
        <g transform="translate(${g.H*.55} ${g.H+g.W*.56}) rotate(90)"><text font-size="14">CRN ${esc(c.crn)}</text></g>
      </g>
      ${code}${custom}${watermark}
    </svg>`;
  }

  function renderCodeBlock(x,y,profile,artwork=state.artwork,options={}){
    const dims=D.codeBlockDimensions(profile), b=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
    const scale=Math.min((dims.w-72)/b.widthMm,1.15);
    const bars=b.bars.map(r=>`<rect x="${(x+10+r.x*scale).toFixed(2)}" y="${y+14}" width="${(r.w*scale).toFixed(2)}" height="${r.h}" fill="#000"/>`).join("");
    const ecc=String(options.qrEcc||approvedQrEcc()||"M").toUpperCase();
    const qm=C.qrMatrix(artwork.qr,ecc).matrix, qSize=Math.min(54,dims.h-14), quiet=4, mod=qSize/(qm.length+quiet*2), qx=x+dims.w-qSize-8,qy=y+7;
    const qr=qm.flatMap((row,rr)=>row.map((v,cc)=>v?`<rect x="${(qx+(cc+quiet)*mod).toFixed(2)}" y="${(qy+(rr+quiet)*mod).toFixed(2)}" width="${mod.toFixed(2)}" height="${mod.toFixed(2)}" fill="#000"/>`:"")).join("");
    return `<g><rect x="${x}" y="${y}" width="${dims.w}" height="${dims.h}" rx="2" fill="#fff" stroke="#8d98a3"/>${bars}<text x="${x+12}" y="${y+48}" font-family="Arial" font-size="8">${esc(artwork.barcode)}</text>${qr}<text x="${x+8}" y="${y+dims.h-5}" font-family="Arial" font-size="7" fill="#555">🔒 Locked CodeBlock · QR ${esc(ecc)} · standards encoder</text></g>`;
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
        ${!cloudBatchWritable()?'<div class="notice warn" style="margin-bottom:10px"><strong>本地批量模式</strong>：文件解析、Dry Run、错误下载和 Proof ZIP 生成均可直接使用；只有保存 Mapping / Import Job 到 D1 需要登录权限。</div>':""}
        <label class="dropzone" id="batch-dropzone"><input id="batch-file" type="file" accept=".xlsx,.csv" hidden/><strong>拖入 Packing List 或点击选择</strong><div class="subtle" style="margin-top:6px">Header Detection · Alias · Fill Down · TOTAL Stop · Cell-level errors</div>${state.batchSource?`<div style="margin-top:9px" class="badge green">${esc(state.batchSource)}</div>`:""}</label>
        <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-action="dry-run" ${state.batchRecords.length?"":"disabled"}>Dry Run</button><button class="btn" data-action="download-errors" ${stats.failed?"":"disabled"}>Download Error Rows</button><button class="btn" data-action="save-mapping" ${mapping.length&&cloudBatchWritable()?"":"disabled"}>Save Mapping Profile</button><button class="btn success" data-action="batch-generate" ${stats.passed&&!state.batchGenerating?"":"disabled"}>${state.batchGenerating?"Generating…":"Generate Passed Proofs"}</button></div>
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
      const factoryCreator=permitted("admin")?`
        <div class="card-body" style="border-bottom:1px solid #e5e9ee">
          <div class="row2">
            <div class="field"><label>Factory Name</label><input id="factory-create-name" class="input" placeholder="Factory legal / master name"/></div>
            <div class="field"><label>CRN</label><input id="factory-create-crn" class="input mono" placeholder="Customs registration code"/></div>
          </div>
          <div class="row2">
            <div class="field"><label>Country</label><input id="factory-create-country" class="input" placeholder="China"/></div>
            <div class="field"><label>Effective</label><input id="factory-create-effective" class="input" placeholder="YYYY-MM-DD"/></div>
          </div>
          <div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="create-factory">Create Active Factory</button></div>
        </div>`:"";
      body=`${factoryCreator}${factories.length
        ? table(["Factory","CRN","Country","Effective",""],factories,true)
        : '<div class="card-body"><div class="notice warn">Cloudflare Access / D1 未连接或当前没有 Active Factory Master。请由 Admin 创建正式 Factory；系统不会把 SAMPLE Factory 当成生产数据。</div></div>'}`;
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

  function frozenModel(side){
    const snapshot=side?.snapshot||{};
    const artwork=D.artworkFromCanonical(snapshot,{
      revision:side?.revision,
      status:A.statusFromApi(side?.status||"DRAFT")
    });
    const frozenFactory=snapshot.factory ? [{
      id:snapshot.factory.id,
      name:snapshot.factory.name,
      crn:snapshot.factory.crn,
      country:snapshot.factory.country
    }] : [];
    return {artwork,factories:frozenFactory};
  }

  function renderCompareVisual(compare){
    if(!compare?.from?.snapshot||!compare?.to?.snapshot) return "";
    const left=frozenModel(compare.from), right=frozenModel(compare.to);
    const leftSvg=dielineSvg("editor",left.artwork,{factories:left.factories,qrEcc:"M"});
    const rightSvg=dielineSvg("editor",right.artwork,{factories:right.factories,qrEcc:"M"});
    const toolbar=`<div class="toolbar" style="margin:10px 0"><button class="btn small ${state.compareMode==="side"?"primary":""}" data-compare-mode="side">Side by side</button><button class="btn small ${state.compareMode==="overlay"?"primary":""}" data-compare-mode="overlay">Overlay</button>${state.compareMode==="overlay"?`<label class="subtle" style="margin-left:8px">To opacity <input id="compare-opacity" type="range" min="0" max="1" step=".05" value="${state.compareOpacity}"/></label>`:""}</div>`;
    if(state.compareMode==="overlay"){
      return `${toolbar}<div class="card-body"><div class="revision-overlay"><div class="revision-overlay-layer">${leftSvg}</div><div id="compare-overlay-top" class="revision-overlay-layer" style="opacity:${state.compareOpacity}">${rightSvg}</div></div><div class="subtle" style="margin-top:6px">${esc(compare.from.revision)} = base · ${esc(compare.to.revision)} = overlay</div></div>`;
    }
    return `${toolbar}<div class="revision-visual-grid"><section class="card"><div class="card-head"><strong>${esc(compare.from.revision)}</strong><span class="subtle">${esc(compare.from.status||"")}</span></div><div class="card-body revision-visual">${leftSvg}</div></section><section class="card"><div class="card-head"><strong>${esc(compare.to.revision)}</strong><span class="subtle">${esc(compare.to.status||"")}</span></div><div class="card-body revision-visual">${rightSvg}</div></section></div>`;
  }

  function renderRevisionCompare(){
    if(!state.remoteArtworkId){
      return '<div class="card-body"><div class="notice">先从 Dashboard 打开一个 D1 Artwork，才能比较历史 Revision。</div></div>';
    }
    const revisions=state.remoteRevisions||[];
    if(revisions.length<2){
      return '<div class="card-body"><div class="notice">当前 Artwork 少于 2 个持久化 Revision，暂无可比较版本。</div></div>';
    }
    const optionHtml=(selected)=>revisions.map(r=>`<option value="${esc(r.revision)}" ${r.revision===selected?"selected":""}>${esc(r.revision)} · ${esc(r.status||"")}</option>`).join("");
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
          <div class="field"><label>From Revision</label><select id="compare-from" class="input">${optionHtml(state.compareFrom)}</select></div>
          <div class="field"><label>To Revision</label><select id="compare-to" class="input">${optionHtml(state.compareTo)}</select></div>
        </div>
        <div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="run-compare">Compare Revision</button></div>
        ${compare?`<div class="kpis" style="margin-top:12px"><div class="kpi"><div class="kpi-label">TOTAL CHANGES</div><div class="kpi-value">${compare.total}</div></div><div class="kpi"><div class="kpi-label">CHANGED</div><div class="kpi-value">${compare.changed}</div></div><div class="kpi"><div class="kpi-label">ADDED</div><div class="kpi-value">${compare.added}</div></div><div class="kpi"><div class="kpi-label">REMOVED</div><div class="kpi-value">${compare.removed}</div></div></div>`:""}
      </div>
      ${compare?renderCompareVisual(compare):""}
      ${compare?(rows.length?table(["Canonical Path","From","To","Change"],rows,true):'<div class="card-body"><div class="notice">两个 Revision 的 Canonical Data 完全一致。</div></div>'):'<div class="card-body"><div class="notice">选择两个 Revision 后执行 Compare。比较和预览都来自冻结的 Canonical Snapshot。</div></div>'}
    `;
  }

  function renderProductionAssets(){
    const rows=(state.productionAssets||[]).map(a=>{
      const statusClass=a.status==="APPROVED"?"green":a.status==="SUBMITTED"?"blue":a.status==="REJECTED"?"red":a.status==="RETIRED"?"amber":"amber";
      const canSubmit=["DRAFT","REJECTED"].includes(a.status)&&permitted("productionAssetWrite");
      const canReview=a.status==="SUBMITTED"&&permitted("productionAssetApprove");
      const canFontTest=a.assetType==="FONT"&&a.status==="APPROVED"&&Boolean(state.remoteArtworkId)&&permitted("productionAssetApprove");
      const actions=[
        canSubmit?`<button class="btn small" data-production-asset-action="submit" data-production-asset-id="${esc(a.id)}">Submit</button>`:"",
        canReview?`<button class="btn small" data-production-asset-action="reject" data-production-asset-id="${esc(a.id)}">Reject</button><button class="btn success small" data-production-asset-action="approve" data-production-asset-id="${esc(a.id)}">Approve</button>`:"",
        canFontTest?`<button class="btn small" data-production-asset-action="font-test" data-production-asset-id="${esc(a.id)}">Embed Test PDF</button>`:""
      ].join(" ");
      return [
        `<span class="badge blue">${esc(a.assetType)}</span>`,
        `<span class="mono">${esc(a.code)}</span>`,
        esc(a.version),
        esc(a.filename),
        `<span class="badge ${statusClass}">${esc(a.status)}</span>`,
        `<span class="mono subtle">${esc(String(a.sha256||"").slice(0,16))}…</span>`,
        `<span class="mono subtle">${esc(JSON.stringify(a.metadata||{}))}</span>`,
        actions||"—"
      ];
    });

    const uploader=permitted("productionAssetWrite")?`
      <div class="card-body" style="border-bottom:1px solid #e5e9ee">
        <div class="notice warn" style="margin-bottom:10px">Production Asset 上传建立受控资产与审批链。TrueType 字体嵌入已进入服务器 Renderer；PDF/X-4 Candidate 已支持 ICC OutputIntent + XMP/Box 结构检查，但外部 PDF/X conformance 尚未关闭。原始 Font / ICC 文件保存在受控 Artifact Store；staging 可使用 KV，Production 仍要求 R2。本页不提供原文件下载入口。</div>
        <div class="row2">
          <div class="field"><label>Asset Type</label><select id="production-asset-type" class="input"><option value="FONT">FONT</option><option value="ICC_PROFILE">ICC_PROFILE</option></select></div>
          <div class="field"><label>Code</label><input id="production-asset-code" class="input mono" placeholder="ISUNOR_SANS_REGULAR"/></div>
        </div>
        <div class="row2">
          <div class="field"><label>Version</label><input id="production-asset-version" class="input" placeholder="1.0"/></div>
          <div class="field"><label>License / source note</label><input id="production-asset-license" class="input" placeholder="Licensed source / OFL / vendor profile"/></div>
        </div>
        <div class="row2">
          <div class="field"><label>File</label><input id="production-asset-file" class="input" type="file" accept=".ttf,.otf,.icc,.icm,font/ttf,font/otf,application/vnd.iccprofile"/></div>
          <div class="field"><label>Notes</label><input id="production-asset-notes" class="input" placeholder="Usage / printer / customer scope"/></div>
        </div>
        <div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="upload-production-asset" ${state.productionAssetBusy?"disabled":""}>${state.productionAssetBusy?"Uploading…":"Upload Draft Asset"}</button></div>
      </div>`:"";

    const approvedFonts=(state.productionAssets||[]).filter(a=>a.assetType==="FONT"&&a.status==="APPROVED"&&/^TrueType/i.test(String(a.metadata?.container||"")));
    const approvedIcc=(state.productionAssets||[]).filter(a=>a.assetType==="ICC_PROFILE"&&a.status==="APPROVED"&&String(a.metadata?.colorSpace||"").toUpperCase()==="CMYK");
    const candidateTool=permitted("productionAssetApprove")?`
      <div class="card-body" style="border-bottom:1px solid #e5e9ee">
        <div class="notice warn" style="margin-bottom:10px"><strong>PDF/X-4 Candidate Test</strong> 只做内部结构验证，不代表通过 ISO/GWG/印厂外部 Preflight，不能作为正式生产稿。</div>
        <div class="row2">
          <div class="field"><label>Approved TrueType Font</label><select id="pdfx-candidate-font" class="input"><option value="">Select…</option>${approvedFonts.map(a=>`<option value="${esc(a.id)}">${esc(a.code)} @ ${esc(a.version)}</option>`).join("")}</select></div>
          <div class="field"><label>Approved CMYK ICC</label><select id="pdfx-candidate-icc" class="input"><option value="">Select…</option>${approvedIcc.map(a=>`<option value="${esc(a.id)}">${esc(a.code)} @ ${esc(a.version)}</option>`).join("")}</select></div>
        </div>
        <div class="row2">
          <div class="field"><label>Output Condition Identifier</label><input id="pdfx-output-condition" class="input mono" placeholder="Printer / FOGRA / GRACoL condition identifier"/></div>
          <div class="field"><label>Artwork</label><input class="input mono" disabled value="${esc(state.remoteArtworkId||"Open a D1 Artwork first")}"/></div>
        </div>
        <div class="toolbar" style="justify-content:flex-end">
          <button class="btn" data-action="pdfx4-external-validate" ${!state.remoteArtworkId||!approvedFonts.length||!approvedIcc.length?"disabled":""}>Run External Validator</button>
          <button class="btn primary" data-action="pdfx4-candidate" ${!state.remoteArtworkId||!approvedFonts.length||!approvedIcc.length?"disabled":""}>Render PDF/X-4 Candidate</button>
        </div>
      </div>`:"";

    const validationRows=(state.pdfxValidationRuns||[]).map(v=>[
      v.createdAt||"—",
      v.revision||"—",
      `<span class="badge ${v.status==="PASS"?"green":v.status==="FAIL"?"red":"amber"}">${esc(v.status)}</span>`,
      `${esc(v.validator||"—")} ${esc(v.validatorVersion||"")}`,
      `<span class="mono subtle">${esc(String(v.artifactSha256||"").slice(0,16))}…</span>`
    ]);
    const validationTable=validationRows.length?`<div class="card-head"><h3>External PDF/X Validation Evidence</h3></div>${table(["Time","Revision","Status","Validator","PDF SHA-256"],validationRows,true)}`:"";
    return `${uploader}${candidateTool}${validationTable}${rows.length?table(["Type","Code","Version","File","Status","SHA-256","Metadata","Actions"],rows,true):'<div class="card-body"><div class="notice">尚无 Production Asset。正式 Font / ICC Profile 必须通过受控上传与四眼审批后才能进入后续 renderer 集成。</div></div>'}`;
  }

  function renderQuality(){
    const tabs=["profiles","reports","readiness","assets","compare"];
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
    if(state.qualityTab==="assets") body=renderProductionAssets();
    if(state.qualityTab==="compare") body=renderRevisionCompare();
    return `<div class="tabs" style="border:1px solid #d8dee6;border-radius:7px 7px 0 0">${tabs.map(t=>`<button class="tab ${state.qualityTab===t?"active":""}" data-quality-tab="${t}">${t}</button>`).join("")}</div><section class="card" style="border-radius:0 0 7px 7px">${body}</section>`;
  }

  function renderPromotionEvidenceRegistry(){
    const p=state.pdfxPromotionReadiness||state.systemReadiness?.pdfxPromotionReadiness||{};
    const counts=p.evidenceCounts||{};
    const evidence=state.pdfxPromotionEvidence||[];
    const statusColor=(s)=>String(s||"").toUpperCase()==="APPROVED"?"green":String(s||"").toUpperCase()==="SUBMITTED"?"blue":String(s||"").toUpperCase()==="REJECTED"?"red":"amber";
    const detail=(x)=>{
      if(x.evidenceType==="SECONDARY_VALIDATION") return `${x.validatorName||"—"} ${x.validatorVersion||""}`;
      if(x.evidenceType==="RIP_QUALIFICATION") return `${x.printServiceProvider||"—"} · ${x.ripProduct||"—"} ${x.ripVersion||""} · ${x.outputDevice||"—"}`;
      return `${x.printServiceProvider||"—"} · ${x.ripProduct||"—"} ${x.ripVersion||""} · no repair: ${x.noPdfRepair?"yes":"no"}`;
    };
    const rows=evidence.map(x=>{
      const actions=[
        `<button class="btn small" data-promotion-evidence-action="download" data-promotion-evidence-id="${esc(x.id)}">Download</button>`
      ];
      if(["DRAFT","REJECTED"].includes(String(x.status||"").toUpperCase())&&permitted("productionPolicyWrite")){
        actions.push(`<button class="btn small" data-promotion-evidence-action="submit" data-promotion-evidence-id="${esc(x.id)}">Submit</button>`);
      }
      if(String(x.status||"").toUpperCase()==="SUBMITTED"&&permitted("productionPolicyApprove")){
        actions.push(`<button class="btn primary small" data-promotion-evidence-action="approve" data-promotion-evidence-id="${esc(x.id)}">Approve</button>`);
        actions.push(`<button class="btn small danger" data-promotion-evidence-action="reject" data-promotion-evidence-id="${esc(x.id)}">Reject</button>`);
      }
      return [
        esc(x.evidenceType||"—"),
        `<span class="badge ${statusColor(x.status)}">${esc(x.status||"—")}</span>`,
        x.artifactSha256?`<span class="mono">${esc(String(x.artifactSha256).slice(0,14))}…</span>`:"—",
        esc(detail(x)),
        x.testedAt?esc(x.testedAt):"—",
        `<span class="mono">${esc(String(x.evidenceSha256||"").slice(0,14))}…</span>`,
        actions.join(" ")
      ];
    });
    const upload=permitted("productionPolicyWrite")?`
      <div class="card-body">
        <div class="notice">
          Evidence file bytes are hashed by the Worker and stored in the private Artifact Store. Staging may use KV; Production still requires R2. Approval re-downloads the object and verifies the SHA again.
        </div>
        <div class="row2" style="margin-top:12px">
          <div class="field"><label>Evidence Type</label><select id="promotion-evidence-type" class="input"><option>SECONDARY_VALIDATION</option><option>RIP_QUALIFICATION</option><option>PRODUCTION_TRIAL</option></select></div>
          <div class="field"><label>Artifact SHA-256 <span class="subtle">Secondary / Trial</span></label><input id="promotion-artifact-sha" class="input mono" placeholder="64 hex"/></div>
        </div>
        <div class="row2">
          <div class="field"><label>Print Service Provider <span class="subtle">RIP / Trial</span></label><input id="promotion-provider" class="input" placeholder="Factory / print house"/></div>
          <div class="field"><label>RIP / DFE Product</label><input id="promotion-rip-product" class="input" placeholder="RIP product"/></div>
        </div>
        <div class="row2">
          <div class="field"><label>RIP / DFE Version</label><input id="promotion-rip-version" class="input" placeholder="Exact version"/></div>
          <div class="field"><label>Output Device</label><input id="promotion-output-device" class="input" placeholder="Press / proofer / device"/></div>
        </div>
        <div class="row2">
          <div class="field"><label>Tested At <span class="subtle">RIP / Trial</span></label><input id="promotion-tested-at" class="input" type="datetime-local"/></div>
          <div class="field"><label>Evidence File</label><input id="promotion-evidence-file" class="input" type="file"/></div>
        </div>
        <div class="toolbar" style="justify-content:space-between">
          <div>
            <label style="margin-right:14px"><input id="promotion-actual-workflow" type="checkbox" checked/> Actual production workflow</label>
            <label><input id="promotion-no-repair" type="checkbox" checked/> No PDF repair / rewrite</label>
          </div>
          <button class="btn primary" data-action="upload-promotion-evidence" ${state.promotionEvidenceBusy?"disabled":""}>${state.promotionEvidenceBusy?"Uploading…":"Upload Evidence"}</button>
        </div>
      </div>`:"";
    return `
      <section class="card" style="margin-top:12px">
        <div class="card-head">
          <h3>PDF/X Production Promotion Evidence</h3>
          <span class="badge ${p.ok?"green":"amber"}">${p.ok?"QUALIFIED":"INCOMPLETE"}</span>
          <span class="spacer"></span>
          <button class="btn small" data-action="refresh-promotion-evidence">Refresh</button>
        </div>
        <div class="card-body">
          <div class="kpis" style="margin:0">
            <div class="kpi"><div class="kpi-label">SAME-BYTE REGRESSION</div><div class="kpi-value">${p.sharedRegressionArtifacts||0}/${p.policy?.minimumUniqueArtifacts||5}</div></div>
            <div class="kpi"><div class="kpi-label">PRIMARY PASS</div><div class="kpi-value">${counts.trustedPrimaryRuns||0}</div></div>
            <div class="kpi"><div class="kpi-label">SECONDARY APPROVED</div><div class="kpi-value">${counts.approvedSecondaryValidation||0}</div></div>
            <div class="kpi"><div class="kpi-label">RIP / TRIAL</div><div class="kpi-value">${p.ripOk?"PASS":"—"} / ${p.productionTrialOk?"PASS":"—"}</div></div>
          </div>
          ${(p.errors||[]).length?`<div class="notice warn" style="margin-top:12px">${(p.errors||[]).map(esc).join(" · ")}</div>`:`<div class="notice" style="margin-top:12px">Promotion evidence satisfies policy ${esc(p.policyVersion||"2.0.0")}. PDF/X-4 capability still requires a separate code-reviewed promotion change.</div>`}
        </div>
        ${upload}
        ${rows.length?table(["Type","State","Artifact SHA","Qualification Detail","Tested At","Evidence SHA","Actions"],rows,true):'<div class="card-body"><div class="notice">No controlled promotion evidence has been uploaded yet.</div></div>'}
      </section>
    `;
  }

  function renderSystemReadiness(){
    const r=state.systemReadiness;
    if(!r) return `<section class="card"><div class="card-head"><h3>Staging Readiness Center</h3><span class="spacer"></span><button class="btn small" data-action="refresh-system-readiness">Refresh</button></div><div class="card-body"><div class="notice">尚未读取服务器 Readiness 状态。</div></div></section>`;

    const stagingRows=(r.stagingChecks||[]).map(x=>[
      esc(x.label),
      `<span class="badge ${x.ok?"green":"red"}">${esc(x.status)}</span>`,
      esc(x.detail)
    ]);
    const productionRows=(r.productionChecks||[]).map(x=>[
      esc(x.label),
      `<span class="badge ${x.ok?"green":"red"}">${esc(x.status)}</span>`,
      esc(x.detail)
    ]);
    const diag=r.diagnostics||{};
    const lastProbe=diag.lastArtifactProbe?.createdAt||"Never";
    state.pdfxPromotionReadiness=r.pdfxPromotionReadiness||state.pdfxPromotionReadiness;
    return `
      <section class="card">
        <div class="card-head">
          <h3>Staging Readiness Center</h3>
          <span class="badge ${r.stagingReady?"green":"red"}">${esc(r.status)}</span>
          <span class="badge ${r.productionReady?"green":"amber"}">${esc(r.productionStatus)}</span>
          <span class="spacer"></span>
          <button class="btn small" data-action="refresh-system-readiness">Refresh</button>
          <button class="btn primary small" data-action="run-readiness-probe" ${state.readinessProbeBusy?"disabled":""}>${state.readinessProbeBusy?"Probing…":"Run Artifact Store Probe"}</button>
        </div>
        <div class="card-body">
          <div class="kpis" style="margin:0">
            <div class="kpi"><div class="kpi-label">STAGING GATES</div><div class="kpi-value">${r.summary?.stagingPassed||0}/${r.summary?.stagingTotal||0}</div></div>
            <div class="kpi"><div class="kpi-label">PRODUCTION GATES</div><div class="kpi-value">${r.summary?.productionPassed||0}/${r.summary?.productionTotal||0}</div></div>
            <div class="kpi"><div class="kpi-label">LATEST MIGRATION</div><div class="kpi-value mono" style="font-size:13px">${esc(diag.latestMigration||"unknown")}</div></div>
            <div class="kpi"><div class="kpi-label">LAST STORE PROBE</div><div class="kpi-value mono" style="font-size:12px">${esc(lastProbe)}</div></div>
          </div>
          <div class="notice ${r.stagingReady?"":"warn"}" style="margin-top:12px">
            Staging 与 Production 是独立门禁。PDF/X-4 Production 需要 trusted primary validator、同 SHA 的独立 secondary validator、真实 RIP qualification 和无修复 production trial；证据齐全后仍需单独代码审查才能把 PDF/X-4 加入 production capability。
          </div>
        </div>
        <div class="card-head"><h3>Staging Gates</h3></div>
        ${table(["Gate","Result","Detail"],stagingRows,true)}
        <div class="card-head"><h3>Production Gates</h3></div>
        ${table(["Gate","Result","Detail"],productionRows,true)}
      </section>
      ${renderPromotionEvidenceRegistry()}
    `;
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
      ${renderSystemReadiness()}
      <section class="card" style="margin-top:12px"><div class="card-head"><h3>Access / RBAC Users</h3><span class="subtle">Cloudflare Access 提供身份，D1 控制应用角色</span></div><div class="card-body">
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
    document.querySelectorAll("[data-page]").forEach(b=>b.onclick=async()=>{state.page=b.dataset.page;render();if(state.page==="dashboard")await loadRemoteArtworks();if(state.page==="templates")await loadTemplateVersions();if(state.page==="content")await loadReferenceData();if(state.page==="admin"){await loadAdminUsers();await loadAudit();await loadSystemReadiness();await loadPromotionEvidence();}});
    document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=async()=>{state.tab=b.dataset.tab;render();if(state.tab==="comments")await loadComments();});
    document.querySelectorAll("[data-template-tab]").forEach(b=>b.onclick=async()=>{state.templateTab=b.dataset.templateTab;render();if(state.templateTab==="versions")await loadTemplateVersions();});
    document.querySelectorAll("[data-content-tab]").forEach(b=>b.onclick=async()=>{state.contentTab=b.dataset.contentTab;render();if(state.contentTab!=="factories")await loadReferenceMasters();});
    document.querySelectorAll("[data-quality-tab]").forEach(b=>b.onclick=async()=>{state.qualityTab=b.dataset.qualityTab;render();if(state.qualityTab==="reports")await loadAudit();if(state.qualityTab==="readiness")await loadProductionReadiness();if(state.qualityTab==="assets")await loadProductionAssets();if(state.qualityTab==="compare"&&state.remoteArtworkId&&!state.remoteRevisions.length)await refreshRemoteRevisionMetadata();});
    document.querySelectorAll("[data-impact]").forEach(b=>b.onclick=()=>loadFactoryImpact(b.dataset.impact));
    document.querySelectorAll("[data-art]").forEach(el=>{
      el.onfocus=()=>{if(localArtworkEditable())pushArtworkHistory();};
      const apply=()=>{
        const k=el.dataset.art;
        state.artwork[k]=el.type==="number"?Number(el.value):el.value;
        persistLocalDraft();
      };
      el.oninput=apply;
      el.onchange=()=>{
        apply();
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
    document.querySelectorAll("[data-production-asset-action]").forEach(b=>b.onclick=()=>handleProductionAssetAction(b.dataset.productionAssetAction,b.dataset.productionAssetId));
    document.querySelectorAll("[data-promotion-evidence-action]").forEach(b=>b.onclick=()=>handlePromotionEvidenceAction(b.dataset.promotionEvidenceAction,b.dataset.promotionEvidenceId));
    document.querySelectorAll("[data-compare-mode]").forEach(b=>b.onclick=()=>{state.compareMode=b.dataset.compareMode;render();});
    const compareOpacity=document.getElementById("compare-opacity");
    if(compareOpacity) compareOpacity.oninput=()=>{state.compareOpacity=Number(compareOpacity.value);const top=document.getElementById("compare-overlay-top");if(top)top.style.opacity=String(state.compareOpacity);};
    const search=document.getElementById("global-search");
    if(search) search.onkeydown=async(e)=>{if(e.key==="Enter"){state.page="dashboard";await loadRemoteArtworks(search.value.trim());}};
    bindArtworkElements();
    bindEditorKeyboard();
    const artImageFile=document.getElementById("art-image-file");
    const artQrImageFile=document.getElementById("art-qr-image-file");
    if(artImageFile) artImageFile.onchange=async()=>{const file=artImageFile.files?.[0];if(file)await addUploadedArtworkElement(file,"image");};
    if(artQrImageFile) artQrImageFile.onchange=async()=>{const file=artQrImageFile.files?.[0];if(file)await addUploadedArtworkElement(file,"qr-image");};
    const file=document.getElementById("batch-file");
    const dropzone=document.getElementById("batch-dropzone");
    if(file) file.onchange=async()=>{ if(file.files?.[0]) await importBatch(file.files[0]); };
    if(dropzone){
      dropzone.ondragover=(e)=>{e.preventDefault();dropzone.classList.add("dragging");};
      dropzone.ondragleave=()=>dropzone.classList.remove("dragging");
      dropzone.ondrop=async(e)=>{
        e.preventDefault();
        dropzone.classList.remove("dragging");
        const dropped=e.dataTransfer?.files?.[0];
        if(dropped) await importBatch(dropped);
      };
    }
  }

  function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(reader.error||new Error("FILE_READ_FAILED"));
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error("IMAGE_DECODE_FAILED"));
      img.src=src;
    });
  }

  async function normalizeArtworkImageFile(file){
    if(!file) throw new Error("请选择图片。");
    const allowed=["image/png","image/jpeg","image/webp","image/svg+xml"];
    if(!allowed.includes(file.type)) throw new Error("仅支持 PNG / JPG / WebP / SVG。");
    if(file.size>8*1024*1024) throw new Error("图片超过 8 MB，请先压缩后再上传。");
    const raw=await fileToDataUrl(file);
    const img=await loadImageElement(raw);
    const maxPx=1200;
    const scale=Math.min(1,maxPx/Math.max(img.naturalWidth||1,img.naturalHeight||1));
    const width=Math.max(1,Math.round((img.naturalWidth||1)*scale));
    const height=Math.max(1,Math.round((img.naturalHeight||1)*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{alpha:false});
    ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
    ctx.drawImage(img,0,0,width,height);
    let quality=.94;
    let dataUrl=canvas.toDataURL("image/jpeg",quality);
    while(dataUrl.length>900000&&quality>.72){
      quality-=.06;
      dataUrl=canvas.toDataURL("image/jpeg",quality);
    }
    if(dataUrl.length>1200000) throw new Error("图片归一化后仍然过大，请使用更简单的 Logo/图标或降低图片尺寸。");
    return {dataUrl,mimeType:"image/jpeg",pixelWidth:width,pixelHeight:height};
  }

  async function addUploadedArtworkElement(file,type="image"){
    if(!localArtworkEditable()){toast("当前 Revision 已锁定，不能添加元素。","error");return;}
    try{
      const normalized=await normalizeArtworkImageFile(file);
      const ratio=normalized.pixelWidth/Math.max(1,normalized.pixelHeight);
      let w=type==="qr-image"?45:Math.min(90,Math.max(35,60));
      let h=type==="qr-image"?45:w/Math.max(.1,ratio);
      if(h>90){h=90;w=h*ratio;}
      const p=defaultElementPlacement(w,h);
      const el={
        id:newElementId(),
        type,
        name:type==="qr-image"?`QR image · ${file.name}`:file.name,
        x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
        panelId:p.panelId,constrainToPanel:true,
        text:"",fontSizePt:12,fontWeight:"normal",textAlign:"left",
        payload:"",
        ecc:"M",
        sourceType:"uploaded-raster",
        mimeType:normalized.mimeType,
        dataUrl:normalized.dataUrl,
        pixelWidth:normalized.pixelWidth,
        pixelHeight:normalized.pixelHeight
      };
      pushArtworkHistory();
      artworkElements().push(el);
      state.selectedElementId=el.id;
      const saved=persistLocalDraft();
      render();
      toast(saved?(type==="qr-image"?"二维码图片已添加":"图片 / Logo 已添加"):"图片已添加，但浏览器本地存储空间不足，请尽快导出或减少图片大小",saved?"success":"error");
    }catch(e){toast(e.message||String(e),"error");}
  }

  function addGeneratedQrElement(){
    if(!localArtworkEditable()){toast("当前 Revision 已锁定，不能添加元素。","error");return;}
    const payload=document.getElementById("custom-qr-payload")?.value?.trim()||"";
    const ecc=String(document.getElementById("custom-qr-ecc")?.value||"M").toUpperCase();
    if(!payload){toast("请输入二维码内容。","error");return;}
    try{C.qrMatrix(payload,ecc);}catch(e){toast("二维码内容无法编码："+(e.message||e),"error");return;}
    const size=45,p=defaultElementPlacement(size,size);
    const el={
      id:newElementId(),type:"qr-generated",name:"Generated QR",
      x:p.x,y:p.y,w:size,h:size,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,
      text:"",fontSizePt:12,fontWeight:"normal",textAlign:"left",
      payload,ecc,sourceType:"generated-vector",mimeType:"",
      dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);
    state.selectedElementId=el.id;
    persistLocalDraft();
    render();
    toast("矢量二维码已添加","success");
  }

  function addBarcodeElement(){
    if(!localArtworkEditable()) return;
    const w=150,h=48,p=defaultElementPlacement(w,h);
    const el={
      id:newElementId(),type:"barcode",name:"Barcode",
      x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,
      text:"",fontSizePt:12,fontWeight:"normal",textAlign:"center",
      symbology:"CODE128B",humanReadable:true,symbolKey:"",
      payload:String(state.artwork.barcode||"ABC123"),ecc:"M",
      sourceType:"generated-vector",mimeType:"",dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);state.selectedElementId=el.id;
    persistLocalDraft();render();toast("条码元素已添加","success");
  }

  function addHandlingSymbol(){
    if(!localArtworkEditable()) return;
    const key=String(document.getElementById("handling-symbol-select")?.value||"THIS_WAY_UP");
    const names={THIS_WAY_UP:"This Way Up",KEEP_DRY:"Keep Dry",FRAGILE:"Fragile"};
    const size=48,p=defaultElementPlacement(size,size);
    const el={
      id:newElementId(),type:"symbol",name:names[key]||key,
      x:p.x,y:p.y,w:size,h:size,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,
      text:"",fontSizePt:12,fontWeight:"normal",textAlign:"center",
      symbology:"",humanReadable:false,symbolKey:key,
      payload:"",ecc:"M",sourceType:"builtin-review-symbol",mimeType:"",
      dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);state.selectedElementId=el.id;
    persistLocalDraft();render();toast("包装图标已添加（Review Library）","success");
  }

  function addBoundTextElement(){
    if(!localArtworkEditable()) return;
    const bindingKey=String(document.getElementById("binding-preset-select")?.value||"product.sku");
    const meta=(D.artworkBindings||[]).find(b=>b.key===bindingKey);
    if(!bindingKey||!D.isKnownArtworkBinding(bindingKey)){toast("请选择有效的数据字段。","error");return;}
    const w=150,h=30,p=defaultElementPlacement(w,h);
    const el={
      id:newElementId(),type:"text",name:meta?.label||bindingKey,
      x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,
      text:"",bindingKey,fontSizePt:12,fontWeight:"bold",textAlign:"left",
      symbology:"",humanReadable:false,symbolKey:"",
      payload:"",ecc:"M",sourceType:"bound-variable",mimeType:"",
      dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);state.selectedElementId=el.id;
    persistLocalDraft();render();toast(`数据字段已绑定：${meta?.label||bindingKey}`,"success");
  }

  function addTextElement(){
    if(!localArtworkEditable()) return;
    const w=120,h=28,p=defaultElementPlacement(w,h);
    const el={
      id:newElementId(),type:"text",name:"Text",
      x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,
      text:"NEW MARK TEXT",fontSizePt:12,fontWeight:"bold",textAlign:"left",
      payload:"",ecc:"M",sourceType:"generated-text",mimeType:"",
      dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);
    state.selectedElementId=el.id;
    persistLocalDraft();render();toast("文字元素已添加","success");
  }

  function duplicateSelectedElement(){
    const current=selectedArtworkElement();
    if(!current||!localArtworkEditable()) return;
    pushArtworkHistory();
    const copy=JSON.parse(JSON.stringify(current));
    copy.id=newElementId();copy.name=(current.name||current.type)+" copy";
    copy.locked=false;
    copy.x=Number(current.x||0)+8;copy.y=Number(current.y||0)+8;
    clampElementToBounds(copy);
    artworkElements().push(copy);
    state.selectedElementId=copy.id;
    persistLocalDraft();render();
  }

  function reorderSelectedElement(mode){
    const list=artworkElements(),index=list.findIndex(e=>e.id===state.selectedElementId);
    if(index<0||!localArtworkEditable()) return;
    pushArtworkHistory();
    const [item]=list.splice(index,1);
    let next=index;
    if(mode==="front") next=list.length;
    if(mode==="back") next=0;
    if(mode==="up") next=Math.min(list.length,index+1);
    if(mode==="down") next=Math.max(0,index-1);
    list.splice(next,0,item);
    persistLocalDraft();render();
  }

  function alignSelectedElement(mode){
    const e=selectedArtworkElement();
    if(!e||!localArtworkEditable()) return;
    pushArtworkHistory();
    const b=elementBounds(e),w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1));
    if(mode==="left")e.x=b.x;
    if(mode==="hcenter")e.x=b.x+(b.w-w)/2;
    if(mode==="right")e.x=b.x+b.w-w;
    if(mode==="top")e.y=b.y;
    if(mode==="vcenter")e.y=b.y+(b.h-h)/2;
    if(mode==="bottom")e.y=b.y+b.h-h;
    clampElementToBounds(e);persistLocalDraft();render();
  }

  function deleteSelectedElement(){
    if(!localArtworkEditable()) return;
    const index=artworkElements().findIndex((e)=>e.id===state.selectedElementId);
    if(index<0){toast("请先选择一个元素。","error");return;}
    pushArtworkHistory();
    artworkElements().splice(index,1);
    state.selectedElementId=null;
    persistLocalDraft();
    render();
    toast("元素已删除","success");
  }

  function bindArtworkElements(){
    document.querySelectorAll("[data-select-element]").forEach((b)=>{
      b.onclick=()=>{state.selectedElementId=b.dataset.selectElement;render();};
    });
    document.querySelectorAll("[data-element-prop]").forEach((el)=>{
      const apply=()=>{
        const e=selectedArtworkElement();
        if(!e||!localArtworkEditable()) return;
        const key=el.dataset.elementProp;
        if(key==="panelId"){
          placeElementInPanel(e,el.value);
        }else{
          e[key]=["x","y","w","h","rotation","fontSizePt"].includes(key)?Number(el.value):el.value;
          if(key==="w"||key==="h") e[key]=Math.max(5,Number(e[key]||5));
          if(key==="fontSizePt") e[key]=Math.max(5,Number(e[key]||5));
          clampElementToBounds(e);
        }
        persistLocalDraft();
      };
      el.oninput=apply;
      el.onchange=()=>{apply();render();};
    });
    const lock=document.querySelector("[data-element-lock]");
    if(lock) lock.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      e.locked=Boolean(lock.checked);persistLocalDraft();render();
    };
    const visible=document.querySelector("[data-element-visible]");
    if(visible) visible.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      e.visible=Boolean(visible.checked);persistLocalDraft();render();
    };
    const hri=document.querySelector("[data-element-hri]");
    if(hri) hri.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      e.humanReadable=Boolean(hri.checked);persistLocalDraft();render();
    };
    const constrain=document.querySelector("[data-element-constrain]");
    if(constrain) constrain.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      e.constrainToPanel=Boolean(constrain.checked);clampElementToBounds(e);persistLocalDraft();render();
    };

    document.querySelectorAll("[data-art-element]").forEach((group)=>{
      group.onpointerdown=(ev)=>{
        const id=group.dataset.artElement;
        const element=artworkElements().find((x)=>x.id===id);
        if(!element) return;
        state.selectedElementId=id;
        if(element.locked||!localArtworkEditable()){render();return;}
        ev.preventDefault();
        const svg=group.ownerSVGElement;
        if(!svg?.createSVGPoint) return;
        const point=(event)=>{
          const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
          return p.matrixTransform(svg.getScreenCTM().inverse());
        };
        const start=point(ev),startX=Number(element.x||0),startY=Number(element.y||0);
        try{group.setPointerCapture(ev.pointerId);}catch{}
        group.onpointermove=(move)=>{
          if(move.pointerId!==ev.pointerId) return;
          const p=point(move);
          const snapped=snapElementPosition(element,startX+(p.x-start.x),startY+(p.y-start.y));
          element.x=snapped.x;element.y=snapped.y;
          group.setAttribute("transform",elementTransform(element));
        };
        const finish=()=>{
          group.onpointermove=null;group.onpointerup=null;group.onpointercancel=null;
          persistLocalDraft();render();
        };
        group.onpointerup=finish;group.onpointercancel=finish;
      };
    });
  }

  async function handleAction(action){
    if(action==="undo-artwork") return undoArtwork();
    if(action==="redo-artwork") return redoArtwork();
    if(action==="upload-image-trigger"){document.getElementById("art-image-file")?.click();return;}
    if(action==="upload-qr-trigger"){document.getElementById("art-qr-image-file")?.click();return;}
    if(action==="add-text-element") return addTextElement();
    if(action==="add-bound-text-element") return addBoundTextElement();
    if(action==="add-barcode-element") return addBarcodeElement();
    if(action==="add-handling-symbol") return addHandlingSymbol();
    if(action==="add-generated-qr") return addGeneratedQrElement();
    if(action==="duplicate-element") return duplicateSelectedElement();
    if(action==="layer-front") return reorderSelectedElement("front");
    if(action==="layer-back") return reorderSelectedElement("back");
    if(action==="layer-up") return reorderSelectedElement("up");
    if(action==="layer-down") return reorderSelectedElement("down");
    if(action==="align-left") return alignSelectedElement("left");
    if(action==="align-hcenter") return alignSelectedElement("hcenter");
    if(action==="align-right") return alignSelectedElement("right");
    if(action==="align-top") return alignSelectedElement("top");
    if(action==="align-vcenter") return alignSelectedElement("vcenter");
    if(action==="align-bottom") return alignSelectedElement("bottom");
    if(action==="delete-element") return deleteSelectedElement();
    if(action==="new-local") return resetLocalArtwork();
    if(action==="save") return saveDraft();
    if(action==="preflight") return runPreflightAction();
    if(action==="submit") return submitForReview();
    if(action==="approve") return reviewDecision("APPROVE");
    if(action==="reject") return reviewDecision("REJECT");
    if(action==="new-revision") return createNewRevision();
    if(action==="add-comment") return addComment();
    if(action==="create-user") return createAdminUser();
    if(action==="create-reference") return createReferenceRecord();
    if(action==="create-factory") return createFactoryMaster();
    if(action==="create-template-version") return createTemplateVersion();
    if(action==="save-template-draft") return saveTemplateDraft();
    if(action==="submit-template-version") return submitTemplateVersion();
    if(action==="approve-template-version") return decideTemplateVersion("APPROVE");
    if(action==="reject-template-version") return decideTemplateVersion("REJECT");
    if(action==="close-template-editor"){state.templateEditor=null;render();return;}
    if(action==="refresh-dashboard") return loadRemoteArtworks();
    if(action==="refresh-audit") return loadAudit();
    if(action==="refresh-system-readiness") return loadSystemReadiness();
    if(action==="run-readiness-probe") return runSystemReadinessProbe();
    if(action==="refresh-promotion-evidence") return loadPromotionEvidence();
    if(action==="upload-promotion-evidence") return uploadPromotionEvidence();
    if(action==="upload-production-asset") return uploadProductionAsset();
    if(action==="pdfx4-candidate") return renderPdfX4Candidate();
    if(action==="pdfx4-external-validate") return runExternalPdfXValidation();
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

  async function createFactoryMaster(){
    if(!state.apiOnline||!permitted("admin")){toast("需要 Admin 权限和 D1 连接。","error");return;}
    const name=document.getElementById("factory-create-name")?.value?.trim()||"";
    const crn=document.getElementById("factory-create-crn")?.value?.trim()||"";
    const country=document.getElementById("factory-create-country")?.value?.trim()||"";
    const effectiveAt=document.getElementById("factory-create-effective")?.value?.trim()||null;
    if(!name||!crn||!country){toast("Factory Name、CRN、Country 必填。","error");return;}
    try{
      await api.createFactory({name,crn,country,effectiveAt,status:"ACTIVE",reason:"Created from Content Master"});
      state.factories=(await api.factories()).data||[];
      await loadSystemReadiness(false);
      render();
      toast("Active Factory Master 已创建","success");
    }catch(e){toast(e.message||String(e),"error");}
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

  async function renderPdfX4Candidate(){
    if(!state.apiOnline||!permitted("productionAssetApprove")){toast("需要 Production Asset Approve 权限。","error");return;}
    if(!state.remoteArtworkId){toast("请先从 Dashboard 打开一个 D1 Artwork。","error");return;}
    const fontAssetId=document.getElementById("pdfx-candidate-font")?.value||"";
    const iccAssetId=document.getElementById("pdfx-candidate-icc")?.value||"";
    const outputConditionIdentifier=document.getElementById("pdfx-output-condition")?.value?.trim()||"";
    if(!fontAssetId||!iccAssetId||!outputConditionIdentifier){
      toast("请选择 Approved Font、Approved CMYK ICC，并填写 Output Condition Identifier。","error");return;
    }
    try{
      const result=await api.renderPdfX4Candidate(state.remoteArtworkId,{fontAssetId,iccAssetId,outputConditionIdentifier});
      downloadBlob(result.filename||"PDFX4Candidate.pdf",result.blob);
      toast(`PDF/X-4 Candidate 结构检查通过 · PDF ${String(result.headers?.artifactSha256||"").slice(0,12)}… · ICC ${String(result.headers?.iccSha256||"").slice(0,12)}…`,"success");
      if(permitted("auditRead")) await loadAudit(false);
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.map(x=>typeof x==="object"?(x.name||JSON.stringify(x)):String(x)).join(" · ")}`:"";
      toast("PDF/X-4 Candidate 失败："+(e.message||e)+detail,"error");
    }
  }

  async function runExternalPdfXValidation(){
    if(!state.apiOnline||!permitted("productionAssetApprove")){toast("需要 Production Asset Approve 权限。","error");return;}
    if(!state.remoteArtworkId){toast("请先从 Dashboard 打开一个 D1 Artwork。","error");return;}
    const fontAssetId=document.getElementById("pdfx-candidate-font")?.value||"";
    const iccAssetId=document.getElementById("pdfx-candidate-icc")?.value||"";
    const outputConditionIdentifier=document.getElementById("pdfx-output-condition")?.value?.trim()||"";
    if(!fontAssetId||!iccAssetId||!outputConditionIdentifier){
      toast("请选择 Approved Font、Approved CMYK ICC，并填写 Output Condition Identifier。","error");return;
    }
    try{
      const response=await api.validatePdfX4External(state.remoteArtworkId,{fontAssetId,iccAssetId,outputConditionIdentifier});
      const result=response.data||{};
      toast(`External PDF/X Validator · ${result.status||"UNKNOWN"} · ${result.validator||"validator"} ${result.validatorVersion||""}`,result.status==="PASS"?"success":"error");
      const runs=await api.pdfxValidations(state.remoteArtworkId);
      state.pdfxValidationRuns=runs.data||[];
      if(permitted("auditRead")) await loadAudit(false);
      render();
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.map(x=>typeof x==="object"?JSON.stringify(x):String(x)).join(" · ")}`:"";
      toast("External PDF/X validation failed: "+(e.message||e)+detail,"error");
    }
  }

  async function loadProductionAssets(renderAfter=true){
    if(!state.apiOnline||!state.identity){
      state.productionAssets=[];
      if(renderAfter) render();
      return;
    }
    try{
      const response=await api.productionAssets();
      state.productionAssets=response.data||[];
      if(state.remoteArtworkId){
        try{state.pdfxValidationRuns=(await api.pdfxValidations(state.remoteArtworkId)).data||[];}catch{state.pdfxValidationRuns=[];}
      }else state.pdfxValidationRuns=[];
    }catch(e){
      state.productionAssets=[];
      toast("Production Assets load failed: "+(e.message||e),"error");
    }
    if(renderAfter) render();
  }

  async function uploadProductionAsset(){
    if(!state.apiOnline||!permitted("productionAssetWrite")){toast("需要 Production Asset Write 权限。","error");return;}
    const type=document.getElementById("production-asset-type")?.value||"";
    const code=document.getElementById("production-asset-code")?.value?.trim()||"";
    const version=document.getElementById("production-asset-version")?.value?.trim()||"";
    const license=document.getElementById("production-asset-license")?.value?.trim()||"";
    const notes=document.getElementById("production-asset-notes")?.value?.trim()||"";
    const file=document.getElementById("production-asset-file")?.files?.[0]||null;
    if(!file||!code||!version){toast("Type、Code、Version、File 必填。","error");return;}
    state.productionAssetBusy=true;render();
    try{
      await api.uploadProductionAsset(file,{type,code,version,filename:file.name,license,notes});
      await loadProductionAssets(false);
      render();
      toast("Production Asset 已上传为 DRAFT","success");
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.join(" · ")}`:"";
      toast((e.message||String(e))+detail,"error");
    }finally{
      state.productionAssetBusy=false;
      render();
    }
  }

  async function handleProductionAssetAction(action,id){
    const asset=state.productionAssets.find(x=>x.id===id);
    if(!asset){toast("Production Asset not found.","error");return;}
    try{
      if(action==="font-test"){
        if(!state.remoteArtworkId){toast("请先从 Dashboard 打开一个 D1 Artwork。","error");return;}
        if(!permitted("productionAssetApprove")){toast("需要 Production Asset Approve 权限。","error");return;}
        const result=await api.renderFontEmbedValidation(state.remoteArtworkId,id);
        downloadBlob(result.filename||"FontEmbedValidation.pdf",result.blob);
        toast(`Server Font Embed Test 已生成 · PDF ${String(result.headers?.artifactSha256||"").slice(0,12)}… · Font ${String(result.headers?.fontSha256||"").slice(0,12)}…`,"success");
        if(permitted("auditRead")) await loadAudit(false);
        return;
      }
      if(action==="submit"){
        if(!permitted("productionAssetWrite")){toast("需要 Production Asset Write 权限。","error");return;}
        await api.submitProductionAsset(id,{reason:"Submitted from Quality / Production Assets"});
      }else if(action==="approve"||action==="reject"){
        if(!permitted("productionAssetApprove")){toast("需要 Template Approver / Admin 权限。","error");return;}
        await api.decideProductionAsset(id,action==="approve"?"APPROVE":"REJECT",{
          comment:action==="approve"?"Production asset file, identity and license/source metadata reviewed.":"Production asset requires revision or replacement."
        });
      }
      await loadProductionAssets(false);
      if(permitted("admin")) await loadSystemReadiness(false);
      render();
      toast(`${asset.code} ${asset.version} · ${action} completed`,"success");
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
      clearArtworkHistory();
      state.selectedElementId=null;
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

  async function loadPromotionEvidence(renderAfter=true){
    if(!state.apiOnline||!permitted("auditRead")){
      state.pdfxPromotionReadiness=null;
      state.pdfxPromotionEvidence=[];
      if(renderAfter) render();
      return;
    }
    try{
      const [readiness,evidence]=await Promise.all([
        api.pdfxPromotionReadiness(),
        api.pdfxPromotionEvidence()
      ]);
      state.pdfxPromotionReadiness=readiness.data||null;
      state.pdfxPromotionEvidence=evidence.data||[];
    }catch(e){
      state.pdfxPromotionReadiness=null;
      state.pdfxPromotionEvidence=[];
      toast("Promotion evidence load failed: "+(e.message||e),"error");
    }
    if(renderAfter) render();
  }

  function promotionTestedAt(){
    const raw=document.getElementById("promotion-tested-at")?.value||"";
    if(!raw) return "";
    const d=new Date(raw);
    return Number.isFinite(d.getTime())?d.toISOString():"";
  }

  async function uploadPromotionEvidence(){
    if(!state.apiOnline||!permitted("productionPolicyWrite")){toast("需要 Production Policy Write 权限。","error");return;}
    const type=document.getElementById("promotion-evidence-type")?.value||"";
    const file=document.getElementById("promotion-evidence-file")?.files?.[0]||null;
    const artifactSha256=document.getElementById("promotion-artifact-sha")?.value?.trim().toLowerCase()||"";
    const printServiceProvider=document.getElementById("promotion-provider")?.value?.trim()||"";
    const ripProduct=document.getElementById("promotion-rip-product")?.value?.trim()||"";
    const ripVersion=document.getElementById("promotion-rip-version")?.value?.trim()||"";
    const outputDevice=document.getElementById("promotion-output-device")?.value?.trim()||"";
    const testedAt=promotionTestedAt();
    const actualProductionWorkflow=Boolean(document.getElementById("promotion-actual-workflow")?.checked);
    const noPdfRepair=Boolean(document.getElementById("promotion-no-repair")?.checked);
    if(!file){toast("请选择 Evidence File。","error");return;}

    let metadata={result:"PASS"};
    if(type==="SECONDARY_VALIDATION"){
      metadata={
        ...metadata,
        profile:"PDF/X-4",
        artifactSha256,
        validator:"Enfocus PitStop Pro",
        version:"26.07"
      };
      if(!/^[0-9a-f]{64}$/.test(artifactSha256)){toast("Secondary Validation 必须填写 64 位 Artifact SHA-256。","error");return;}
    }else if(type==="RIP_QUALIFICATION"){
      metadata={
        ...metadata,
        suite:"Ghent PDF Output Suite",
        suiteVersion:"5.0",
        conformanceLevel:"LEVEL_1_PLUS_2",
        printServiceProvider,ripProduct,ripVersion,outputDevice,
        actualProductionWorkflow,testedAt
      };
      if(!printServiceProvider||!ripProduct||!ripVersion||!outputDevice||!testedAt){
        toast("RIP Qualification 必须填写印厂、RIP/DFE、版本、设备和测试时间。","error");return;
      }
    }else if(type==="PRODUCTION_TRIAL"){
      metadata={
        ...metadata,
        profile:"PDF/X-4",
        artifactSha256,
        printServiceProvider,ripProduct,ripVersion,outputDevice,
        actualProductionWorkflow,noPdfRepair,testedAt
      };
      if(!/^[0-9a-f]{64}$/.test(artifactSha256)||!printServiceProvider||!ripProduct||!ripVersion||!outputDevice||!testedAt){
        toast("Production Trial 必须填写 Artifact SHA、印厂、RIP/DFE、版本、设备和测试时间。","error");return;
      }
      if(!noPdfRepair){toast("Production Trial 必须确认 No PDF repair / rewrite。","error");return;}
    }else{
      toast("Evidence Type 无效。","error");return;
    }

    state.promotionEvidenceBusy=true;render();
    try{
      await api.uploadPdfxPromotionEvidence(file,type,metadata);
      await loadPromotionEvidence(false);
      if(permitted("admin")) await loadSystemReadiness(false);
      toast("Promotion Evidence 已上传为 DRAFT","success");
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.join(" · ")}`:"";
      toast((e.message||String(e))+detail,"error");
    }finally{
      state.promotionEvidenceBusy=false;
      render();
    }
  }

  async function handlePromotionEvidenceAction(action,id){
    const evidence=state.pdfxPromotionEvidence.find(x=>x.id===id);
    if(!evidence){toast("Promotion Evidence not found.","error");return;}
    try{
      if(action==="download"){
        const result=await api.downloadPdfxPromotionEvidence(id);
        downloadBlob(result.filename||evidence.filename||"evidence.bin",result.blob);
        return;
      }
      if(action==="submit"){
        if(!permitted("productionPolicyWrite")){toast("需要 Production Policy Write 权限。","error");return;}
        await api.submitPdfxPromotionEvidence(id,{reason:"Submitted from Admin / PDF/X Promotion Evidence"});
      }else if(action==="approve"||action==="reject"){
        if(!permitted("productionPolicyApprove")){toast("需要 Production Policy Approve 权限。","error");return;}
        await api.decidePdfxPromotionEvidence(id,action==="approve"?"APPROVE":"REJECT",{
          comment:action==="approve"
            ?"Evidence bytes, SHA binding and qualification metadata reviewed."
            :"Promotion evidence requires replacement or correction."
        });
      }
      await loadPromotionEvidence(false);
      if(permitted("admin")) await loadSystemReadiness(false);
      if(permitted("auditRead")) await loadAudit(false);
      render();
      toast(`${evidence.evidenceType} · ${action} completed`,"success");
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.join(" · ")}`:"";
      toast((e.message||String(e))+detail,"error");
    }
  }

  async function loadSystemReadiness(renderAfter=true){
    if(!state.apiOnline||!permitted("admin")){
      state.systemReadiness=null;
      if(renderAfter) render();
      return;
    }
    try{
      const response=await api.systemReadiness();
      state.systemReadiness=response.data||null;
    }catch(e){
      state.systemReadiness=null;
      toast("Readiness load failed: "+(e.message||e),"error");
    }
    if(renderAfter) render();
  }

  async function runSystemReadinessProbe(){
    if(!state.apiOnline||!permitted("admin")){toast("需要 Admin 权限。","error");return;}
    state.readinessProbeBusy=true;render();
    try{
      const response=await api.runSystemReadinessProbe();
      state.systemReadiness=response.data?.readiness||null;
      const probe=response.data?.probe;
      toast(probe?.ok?"Artifact Store write/read/delete probe passed":"Artifact Store probe failed: "+(probe?.error||"unknown"),probe?.ok?"success":"error");
      if(permitted("auditRead")) await loadAudit(false);
    }catch(e){
      toast("Artifact Store readiness probe failed: "+(e.message||e),"error");
    }finally{
      state.readinessProbeBusy=false;
      render();
    }
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

  function resetLocalArtwork(){
    if(!confirm("新建本地稿会清空当前浏览器中的未保存工作稿，继续吗？")) return;
    state.artwork={...D.defaultArtwork};
    clearArtworkHistory();
    state.remoteArtworkId=null;
    state.remoteRevision=null;
    state.remoteRevisions=[];
    state.comments=[];
    state.revisionCompare=null;
    localStorage.removeItem("cas:remoteArtworkId");
    persistLocalDraft();
    state.page="artwork";
    state.tab="artwork";
    render();
    toast("已新建本地工作稿","success");
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
    if(!localArtworkEditable()){
      toast("已提交或已批准的 Revision 不允许原地修改；需要创建新 Revision。","error");return;
    }
    persistLocalDraft();
    if(!cloudArtworkWritable()){
      toast("本地草稿已保存。登录后可同步到 D1。","success");
      return;
    }
    state.apiBusy=true;render();
    try{
      const remote=await ensureRemoteArtwork();
      toast(remote?"草稿已同步到 D1":"本地草稿已保存","success");
    }catch(e){
      toast("云端同步失败，本地草稿已保留："+(e.message||String(e)),"error");
    }finally{state.apiBusy=false;render();}
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
    state.pfBusy=true;state.apiBusy=true;render();
    try{
      persistLocalDraft();
      if(cloudArtworkWritable()){
        if(!state.remoteArtworkId) await ensureRemoteArtwork();
        await persistPreflight();
      }
      await new Promise(r=>setTimeout(r,180));
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

  function proofPdfElements(artwork=state.artwork){
    return (Array.isArray(artwork.elements)?artwork.elements:[]).map((e)=>{
      if(e.type==="text"){
        return {...e,text:D.resolvedElementText(e,artwork,state.factories)};
      }
      if(e.type==="qr-generated"){
        const payload=D.resolvedElementPayload(e,artwork,state.factories);
        try{return {...e,payload,matrix:C.qrMatrix(payload,e.ecc||"M").matrix};}
        catch{return {...e,payload,matrix:[]};}
      }
      if(e.type==="barcode"){
        const payload=D.resolvedElementPayload(e,artwork,state.factories);
        try{
          const model=String(e.symbology||"").toUpperCase()==="ITF14"
            ? C.itf14Bars(payload,{moduleMm:.8,heightMm:30})
            : C.code128Bars(payload,{moduleMm:.42,heightMm:28});
          return {...e,payload,barcodeModel:model};
        }catch{return {...e,payload,barcodeModel:null};}
      }
      return {...e};
    });
  }

  function exportProof(){
    const g=geometry(), c=computed(), code=C.code128Bars(state.artwork.barcode,{moduleMm:.42,heightMm:25}), qr=C.qrMatrix(state.artwork.qr,"M").matrix;
    const blob=P.createPdfBlob({artwork:state.artwork,geometry:g,computed:c,codeModel:code,qrMatrix:qr,customElements:proofPdfElements(state.artwork),mode:"proof"});
    downloadBlob(fileBase()+"_Proof.pdf",blob); toast("已生成 1:1 mm Vector Proof PDF（Code128 + QR 均为矢量）","success");
  }

  async function productionArtifactSet(artwork, mode="production", evidence=null){
    const g=D.sideSealGeometry(artwork), comp=D.computed(artwork,state.factories);
    const barcodePolicy=(evidence?.policies||state.productionPolicies||[]).find(x=>x.code==="BARCODE_POLICY");
    const qrPolicy=(evidence?.policies||state.productionPolicies||[]).find(x=>x.code==="QR_POLICY");
    const barcodeSymbology=String(barcodePolicy?.config?.symbology||approvedBarcodeSymbology()||"Code128-B");
    const qrEcc=String(qrPolicy?.config?.ecc||approvedQrEcc()||"M").toUpperCase();

    if(!/code\s*[-_ ]?128\s*[-_ ]?b/i.test(barcodeSymbology.replace(/CODE128/i,"Code 128"))) {
      throw new Error(`Production renderer currently supports Code128-B only; policy requested ${barcodeSymbology}.`);
    }

    const code=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
    const qrModel=C.qrMatrix(artwork.qr,qrEcc);
    const pdfBytes=P.createPdfBytes({artwork,geometry:g,computed:comp,codeModel:code,qrMatrix:qrModel.matrix,mode});
    const svg=`<?xml version="1.0" encoding="UTF-8"?>\n${dielineSvg(mode,artwork,{factories:state.factories,qrEcc})}`;
    const snapshot=JSON.stringify(D.canonicalData(artwork,state.factories),null,2);
    const pfGroups=checksFor(artwork), pfSummary=D.preflightSummary(pfGroups);
    const preflight=JSON.stringify({summary:pfSummary,groups:pfGroups,generatedAt:new Date().toISOString()},null,2);
    const readinessEvidence=JSON.stringify(evidence||{
      capturedAt:new Date().toISOString(),
      readiness:state.productionReadiness,
      policies:state.productionPolicies
    },null,2);

    const manifest=D.manifest(artwork,"vector-svg-pdf-1.8.0");
    manifest.qr={encoder:"qrcode-generator",errorCorrectionLevel:qrModel.errorCorrectionLevel,version:qrModel.version,vector:true};
    manifest.barcode={symbology:barcodeSymbology,renderer:"Code128-B",vector:true};
    manifest.productionEvidence={
      readiness:Boolean(evidence?.readiness?.ready??state.productionReadiness?.ready),
      capturedAt:evidence?.capturedAt||null,
      policyCodes:(evidence?.policies||state.productionPolicies||[]).map(x=>x.code)
    };
    manifest.sha256={
      pdf:await sha256(pdfBytes),
      svg:await sha256(svg),
      snapshot:await sha256(snapshot),
      preflight:await sha256(preflight),
      readinessEvidence:await sha256(readinessEvidence)
    };
    const base=B.safeBase(artwork);
    return {base,manifest,files:[
      {name:"Production.pdf",data:pdfBytes},
      {name:"Production.svg",data:svg},
      {name:"DataSnapshot.json",data:snapshot},
      {name:"PreflightReport.json",data:preflight},
      {name:"ProductionReadiness.json",data:readinessEvidence},
      {name:"Manifest.json",data:JSON.stringify(manifest,null,2)}
    ]};
  }

  async function exportProduction(){
    const s=summary();
    if(!permitted("productionExport")||!state.apiOnline||!state.remoteArtworkId){toast("Production Export 需要 Cloudflare Access + Production Export 权限。","error");return;}
    if(state.artwork.status!=="approved"||s.blocking>0||!blockingCommentsResolved()){toast("Production Export 被审核状态、阻断错误或未解决评论锁定","error");return;}
    try{
      const [remote,readiness,policies,assets]=await Promise.all([
        api.artwork(state.remoteArtworkId),
        api.productionReadiness(),
        api.productionPolicies(),
        api.productionAssets()
      ]);
      state.productionReadiness=readiness.data||{ready:false,gates:[]};
      state.productionPolicies=policies.data||[];
      state.productionAssets=assets.data||[];
      if(!state.productionReadiness.ready){
        const blocked=(state.productionReadiness.gates||[]).filter(x=>!(x.approved&&x.valid)).map(x=>x.displayName||x.code).join(" / ");
        render();
        toast("Production Readiness 未通过："+(blocked||"policy gate"),"error");
        return;
      }
      if(String(remote.data.artwork.status||"").toUpperCase()!=="APPROVED"||remote.data.artwork.current_revision!==state.artwork.revision){
        toast("服务器端当前 Revision 未批准或已过期，已阻止生产稿导出。","error");return;
      }
      if(!state.apiBindings.r2){
        toast("R2 未连接，正式 Production 不允许只在浏览器本地生成。","error");
        return;
      }

      // Authoritative PDF is rendered and persisted by Worker using the approved, pinned font asset.
      const serverPdf=await api.renderProductionPdf(state.remoteArtworkId);
      const evidence={
        capturedAt:new Date().toISOString(),
        readiness:state.productionReadiness,
        authoritativePdf:{
          exportId:serverPdf.headers?.exportId||"",
          sha256:serverPdf.headers?.artifactSha256||"",
          renderer:serverPdf.headers?.renderer||"",
          fontSha256:serverPdf.headers?.fontSha256||""
        },
        assets:state.productionAssets.filter(a=>a.status==="APPROVED").map(a=>({
          id:a.id,assetType:a.assetType,code:a.code,version:a.version,sha256:a.sha256,
          approvedBy:a.approvedBy,approvedAt:a.approvedAt,metadata:a.metadata
        })),
        policies:state.productionPolicies.map(p=>({
          code:p.code,displayName:p.displayName,status:p.status,config:p.config,
          submittedBy:p.submittedBy,submittedAt:p.submittedAt,
          approvedBy:p.approvedBy,approvedAt:p.approvedAt,updatedAt:p.updatedAt
        }))
      };

      const built=await productionArtifactSet(state.artwork,"production",evidence);
      const pdfFile=built.files.find(x=>x.name==="Production.pdf");
      if(pdfFile) pdfFile.data=serverPdf.blob;
      const svgFile=built.files.find(x=>x.name==="Production.svg");
      if(svgFile) svgFile.name="Reference.svg";
      built.manifest.rendererVersion=serverPdf.headers?.renderer||"pdfx4-embedded-truetype-1.8.0";
      built.manifest.authoritativePdf=evidence.authoritativePdf;
      built.manifest.sha256.pdf=serverPdf.headers?.artifactSha256||await sha256(serverPdf.blob);
      if(built.manifest.sha256.svg){
        built.manifest.sha256.referenceSvg=built.manifest.sha256.svg;
        delete built.manifest.sha256.svg;
      }
      const manifestFile=built.files.find(x=>x.name==="Manifest.json");
      if(manifestFile) manifestFile.data=JSON.stringify(built.manifest,null,2);
      built.files.push({
        name:"README.txt",
        data:
          "Approved Production Bundle\n"+
          "Template: "+state.artwork.templateCode+" "+state.artwork.templateVersion+"\n"+
          "Revision: "+state.artwork.revision+"\n"+
          "Production.pdf is the authoritative server-rendered artifact.\n"+
          "Reference.svg is non-authoritative and provided for visual/reference use only.\n"+
          "Font asset SHA-256 and server renderer evidence are pinned in Manifest.json.\n"
      });
      const bundle=Z.createZipBlob(built.files);
      const filename=built.base+"_ProductionBundle.zip";

      const persisted=await api.uploadExport(state.remoteArtworkId,bundle,{
        kind:"PRODUCTION_BUNDLE",
        revision:state.artwork.revision,
        filename,
        renderer:serverPdf.headers?.renderer||"pdfx4-embedded-truetype-1.8.0",
        actor:"web",
        manifest:built.manifest,
        authoritativePdfExportId:serverPdf.headers?.exportId,
        authoritativePdfSha256:serverPdf.headers?.artifactSha256
      });
      downloadBlob(filename,bundle);
      toast(`Production Bundle 已绑定服务器权威 PDF、写入 R2 并下载 · Bundle SHA256 ${String(persisted.data?.sha256||"").slice(0,12)}…`,"success");
      await loadAudit(false);
    }catch(e){
      const detail=Array.isArray(e.detail)?` · ${e.detail.map(x=>x.displayName?x.displayName+": "+(x.errors||[]).join(" / "):String(x)).join(" · ")}`:"";
      toast("Production Export 失败："+(e.message||e)+detail,"error");
    }finally{render();}
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
        const svg=`<?xml version="1.0" encoding="UTF-8"?>\n${dielineSvg("proof",art,{factories:state.factories,qrEcc:"M"})}`;
        const snap=JSON.stringify(D.canonicalData(art,state.factories),null,2);
        const prefix=`row-${String(row.row).padStart(4,"0")}_${B.safeBase(art)}/`;
        files.push({name:prefix+"Proof.pdf",data:pdf},{name:prefix+"Proof.svg",data:svg},{name:prefix+"DataSnapshot.json",data:snap});
        index.push({row:row.row,sku:art.sku,path:prefix,status:"PASS"});
      }
      const stats=B.summarize(state.batchReview);
      files.push({name:"BatchManifest.json",data:JSON.stringify({version:"1.8.0",source:state.batchSource,summary:stats,generatedAt:new Date().toISOString(),items:index},null,2)});
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
      if(cloudBatchWritable()){
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
            clearArtworkHistory();
            state.selectedElementId=null;
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
          try{state.systemReadiness=(await api.systemReadiness()).data||null;}catch{}
          try{state.pdfxPromotionReadiness=(await api.pdfxPromotionReadiness()).data||null;}catch{}
          try{state.pdfxPromotionEvidence=(await api.pdfxPromotionEvidence()).data||[];}catch{}
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
