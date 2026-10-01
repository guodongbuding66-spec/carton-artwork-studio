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
    selectedElementIds: [],
    snapGuides: [],
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
        const sym=String(element.symbology||"").toUpperCase();
        const payload=D.resolvedElementPayload(element,artwork,state.factories);
        ensureBarcodePhysicalSettings(element);
        const model=sym==="ITF14"
          ? C.itf14Bars(payload,{
              moduleMm:Number(element.moduleMm),heightMm:Number(element.barHeightMm),quietModules:Number(element.quietModules),
              wideRatio:Number(element.wideRatio),bearerBars:element.bearerBars!==false,bearerBarThicknessMm:Number(element.bearerBarThicknessMm)
            })
          : sym==="GS1_128"
            ? C.gs1_128Bars(payload,{moduleMm:Number(element.moduleMm),heightMm:Number(element.barHeightMm),quietModules:Number(element.quietModules)})
            : C.code128Bars(payload,{moduleMm:Number(element.moduleMm),heightMm:Number(element.barHeightMm),quietModules:Number(element.quietModules)});
        if(item){
          item.status="pass";item.blocking=false;
          item.title=sym==="ITF14"
            ? "ITF-14 / GTIN-14 vector encoding"
            : sym==="GS1_128"
              ? "GS1-128 vector encoding"
              : "Code 128-B vector encoding";
          item.detail=sym==="ITF14"
            ? `GTIN-14 ${model.payload} · check digit ${model.checkDigit} · vector bars generated.`
            : sym==="GS1_128"
              ? `${model.hri} · ${model.elements.length} GS1 AI element(s) · FNC1 applied · vector bars generated.`
              : `Encodable payload · ${model.bars.length} vector bars.`;
        }
        const physical=barcodePhysicalSize(element,model);
        const sizeOk=Math.abs(Number(element.w||0)-physical.w)<.05&&Math.abs(Number(element.h||0)-physical.h)<.05;
        (groups.Assets||(groups.Assets=[])).push({
          id:`barcode-physical-size-${element.id||element.name}`,
          title:"Barcode 1:1 physical footprint",
          status:sizeOk?"pass":"error",
          detail:sizeOk
            ? `${physical.w.toFixed(2)} × ${physical.h.toFixed(2)} mm · no fit-to-box scaling.`
            : `Element box ${Number(element.w||0).toFixed(2)}×${Number(element.h||0).toFixed(2)} mm differs from required ${physical.w.toFixed(2)}×${physical.h.toFixed(2)} mm.`,
          category:"Assets",
          blocking:!sizeOk
        });
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
      state.selectedElementIds=(state.selectedElementIds||[]).filter(id=>artworkElements().some(e=>e.id===id));
      if(state.selectedElementId&&!state.selectedElementIds.includes(state.selectedElementId)) state.selectedElementIds=[state.selectedElementId];
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
  function selectedArtworkElements(){
    const ids=new Set(state.selectedElementIds||[]);
    if(state.selectedElementId) ids.add(state.selectedElementId);
    return artworkElements().filter((e)=>ids.has(e.id));
  }
  function isElementSelected(id){
    return selectedArtworkElements().some((e)=>e.id===id);
  }
  function selectionUnitIds(id){
    const element=artworkElements().find(e=>e.id===id);
    if(!element) return [];
    const groupId=String(element.groupId||"");
    return groupId
      ? artworkElements().filter(e=>String(e.groupId||"")===groupId).map(e=>e.id)
      : [id];
  }
  function selectOnlyElement(id){
    const ids=id?selectionUnitIds(id):[];
    state.selectedElementId=id||null;
    state.selectedElementIds=ids;
  }
  function toggleElementSelection(id){
    const unit=selectionUnitIds(id);
    const ids=new Set(state.selectedElementIds||[]);
    const allSelected=unit.length>0&&unit.every(x=>ids.has(x));
    for(const unitId of unit){
      if(allSelected) ids.delete(unitId); else ids.add(unitId);
    }
    state.selectedElementIds=[...ids];
    state.selectedElementId=ids.has(id)?id:(state.selectedElementIds.at(-1)||null);
  }
  function newGroupId(){
    return "grp-"+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36));
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
  const OPPOSITE_PANEL_MAP=Object.freeze({
    TOP_FACE:"BOTTOM_FACE",
    BOTTOM_FACE:"TOP_FACE",
    TOP_BAND:"MIDDLE_BAND",
    MIDDLE_BAND:"TOP_BAND",
    SIDE_LEFT_BOTTOM:"SIDE_RIGHT_BOTTOM",
    SIDE_RIGHT_BOTTOM:"SIDE_LEFT_BOTTOM",
    SIDE_LEFT_TOP:"SIDE_RIGHT_TOP",
    SIDE_RIGHT_TOP:"SIDE_LEFT_TOP"
  });
  function panelRelativePosition(element,panel){
    const w=Math.max(1,Number(element.w||1)),h=Math.max(1,Number(element.h||1));
    const freeX=Math.max(0,panel.w-w),freeY=Math.max(0,panel.h-h);
    return {
      rx:freeX>0?Math.max(0,Math.min(1,(Number(element.x||0)-panel.x)/freeX)):.5,
      ry:freeY>0?Math.max(0,Math.min(1,(Number(element.y||0)-panel.y)/freeY)):.5
    };
  }
  function cloneElementsToPanel(items,targetPanelId,options={}){
    if(!items.length||!localArtworkEditable()) return [];
    if(!sameSelectionPanel(items)){toast("复制到面板前，请先选择同一面板内的元素。","error");return [];}
    const source=panelById(items[0].panelId),target=panelById(targetPanelId);
    if(!source||!target){toast("目标面板无效。","error");return [];}
    const oversized=items.find(e=>Number(e.w||0)>target.w||Number(e.h||0)>target.h);
    if(oversized){toast(`${oversized.name||oversized.type} 尺寸大于目标面板，已阻止复制。`,"error");return [];}
    const groupMap=new Map();
    const clones=[];
    for(const item of items){
      const copy=JSON.parse(JSON.stringify(item));
      const rel=panelRelativePosition(item,source);
      copy.id=newElementId();
      copy.name=(item.name||item.type)+(options.nameSuffix||(" · "+target.id));
      copy.panelId=target.id;
      if(options.unlockCopies!==false) copy.locked=false;
      if(copy.groupId){
        if(!groupMap.has(copy.groupId)) groupMap.set(copy.groupId,newGroupId());
        copy.groupId=groupMap.get(copy.groupId);
      }
      copy.x=target.x+rel.rx*Math.max(0,target.w-Number(copy.w||0));
      copy.y=target.y+rel.ry*Math.max(0,target.h-Number(copy.h||0));
      clampElementToBounds(copy);
      clones.push(copy);
    }
    artworkElements().push(...clones);
    state.selectedElementIds=clones.map(e=>e.id);
    state.selectedElementId=clones.at(-1)?.id||null;
    return clones;
  }
  function cloneSelectionToPanel(targetPanelId){
    const items=selectedArtworkElements();
    if(!items.length||!localArtworkEditable()) return;
    pushArtworkHistory();
    const clones=cloneElementsToPanel(items,targetPanelId);
    if(!clones.length){state.historyPast.pop();return;}
    persistLocalDraft();render();
    toast(`已复制 ${clones.length} 个元素到 ${targetPanelId}`,"success");
  }
  function clonePanelLayout(sourcePanelId,targetPanelId){
    const items=artworkElements().filter(e=>String(e.panelId||"")===String(sourcePanelId||""));
    if(!items.length){toast(`${sourcePanelId} 没有可复制的自定义元素。`,"error");return;}
    pushArtworkHistory();
    const clones=cloneElementsToPanel(items,targetPanelId,{nameSuffix:" · "+targetPanelId,unlockCopies:false});
    if(!clones.length){state.historyPast.pop();return;}
    persistLocalDraft();render();
    toast(`已复制 ${sourcePanelId} 的整套布局（${clones.length} 个元素）到 ${targetPanelId}`,"success");
  }

  function cloneSelectionToOppositePanel(){
    const items=selectedArtworkElements();
    if(!items.length||!sameSelectionPanel(items)){toast("对称面复制要求选择同一面板内的元素。","error");return;}
    const sourceId=String(items[0].panelId||"");
    const targetId=OPPOSITE_PANEL_MAP[sourceId];
    if(!targetId){toast(`${sourceId||"当前面板"} 没有定义对称面。`,"error");return;}
    cloneSelectionToPanel(targetId);
  }
  function smartSnapElementPosition(e,x,y,excludeIds=[]){
    const b=elementBounds(e),w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1)),snap=4;
    let nx=Math.max(b.x,Math.min(b.x+b.w-w,x));
    let ny=Math.max(b.y,Math.min(b.y+b.h-h,y));
    const excluded=new Set(excludeIds);
    excluded.add(e.id);
    const xTargets=[
      {value:b.x,kind:"panel-edge"},{value:b.x+b.w/2,kind:"panel-center"},{value:b.x+b.w,kind:"panel-edge"}
    ];
    const yTargets=[
      {value:b.y,kind:"panel-edge"},{value:b.y+b.h/2,kind:"panel-center"},{value:b.y+b.h,kind:"panel-edge"}
    ];
    for(const other of artworkElements()){
      if(other.visible===false||excluded.has(other.id)||String(other.panelId||"")!==String(e.panelId||"")) continue;
      const ox=Number(other.x||0),oy=Number(other.y||0),ow=Math.max(1,Number(other.w||1)),oh=Math.max(1,Number(other.h||1));
      xTargets.push({value:ox,kind:"object"},{value:ox+ow/2,kind:"object"},{value:ox+ow,kind:"object"});
      yTargets.push({value:oy,kind:"object"},{value:oy+oh/2,kind:"object"},{value:oy+oh,kind:"object"});
    }
    const xAnchors=()=>[nx,nx+w/2,nx+w];
    const yAnchors=()=>[ny,ny+h/2,ny+h];
    let bestX=null,bestY=null;
    for(const target of xTargets) for(const anchor of xAnchors()){
      const delta=target.value-anchor,abs=Math.abs(delta);
      if(abs<=snap&&(!bestX||abs<bestX.abs)) bestX={abs,delta,target};
    }
    if(bestX) nx=Math.max(b.x,Math.min(b.x+b.w-w,nx+bestX.delta));
    for(const target of yTargets) for(const anchor of yAnchors()){
      const delta=target.value-anchor,abs=Math.abs(delta);
      if(abs<=snap&&(!bestY||abs<bestY.abs)) bestY={abs,delta,target};
    }
    if(bestY) ny=Math.max(b.y,Math.min(b.y+b.h-h,ny+bestY.delta));
    const guides=[];
    if(bestX) guides.push({axis:"x",pos:bestX.target.value,kind:bestX.target.kind});
    if(bestY) guides.push({axis:"y",pos:bestY.target.value,kind:bestY.target.kind});
    return {x:nx,y:ny,guides};
  }
  function updateSnapGuides(svg,guides=[]){
    state.snapGuides=guides;
    const gx=svg?.querySelector("[data-snap-guide-x]");
    const gy=svg?.querySelector("[data-snap-guide-y]");
    const xGuide=guides.find(g=>g.axis==="x");
    const yGuide=guides.find(g=>g.axis==="y");
    if(gx){
      gx.setAttribute("x1",String(xGuide?.pos||0));gx.setAttribute("x2",String(xGuide?.pos||0));
      gx.setAttribute("opacity",xGuide?"1":"0");
    }
    if(gy){
      gy.setAttribute("y1",String(yGuide?.pos||0));gy.setAttribute("y2",String(yGuide?.pos||0));
      gy.setAttribute("opacity",yGuide?"1":"0");
    }
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
  function barcodePhysicalDefaults(symbology){
    const sym=String(symbology||"CODE128B").toUpperCase();
    if(sym==="ITF14") return {moduleMm:1.016,barHeightMm:32,quietModules:10,wideRatio:2.5,bearerBars:true,bearerBarThicknessMm:Math.max(2.032,1.016*2)};
    if(sym==="GS1_128") return {moduleMm:.495,barHeightMm:31.75,quietModules:10,wideRatio:0,bearerBars:false,bearerBarThicknessMm:0};
    return {moduleMm:.42,barHeightMm:28,quietModules:10,wideRatio:0,bearerBars:false,bearerBarThicknessMm:0};
  }
  function ensureBarcodePhysicalSettings(element,force=false){
    if(!element||element.type!=="barcode") return element;
    const d=barcodePhysicalDefaults(element.symbology);
    for(const [key,value] of Object.entries(d)){
      if(force||element[key]===undefined||element[key]===null||element[key]===0||element[key]==="") element[key]=value;
    }
    return element;
  }
  function barcodeModelForElement(element,artwork=state.artwork,factoryList=state.factories){
    ensureBarcodePhysicalSettings(element);
    const payload=D.resolvedElementPayload(element,artwork,factoryList);
    const sym=String(element.symbology||"CODE128B").toUpperCase();
    if(sym==="ITF14") return C.itf14Bars(payload,{
      moduleMm:Number(element.moduleMm),heightMm:Number(element.barHeightMm),quietModules:Number(element.quietModules),
      wideRatio:Number(element.wideRatio),bearerBars:element.bearerBars!==false,bearerBarThicknessMm:Number(element.bearerBarThicknessMm)
    });
    if(sym==="GS1_128") return C.gs1_128Bars(payload,{
      moduleMm:Number(element.moduleMm),heightMm:Number(element.barHeightMm),quietModules:Number(element.quietModules)
    });
    return C.code128Bars(payload,{
      moduleMm:Number(element.moduleMm),heightMm:Number(element.barHeightMm),quietModules:Number(element.quietModules)
    });
  }
  function barcodePhysicalSize(element,model=null){
    const m=model||barcodeModelForElement(element);
    const sym=String(element.symbology||"CODE128B").toUpperCase();
    const bearer=m.bearerBars?Number(m.bearerBarThicknessMm||0):0;
    const hri=element.humanReadable!==false;
    const hriFontMm=sym==="ITF14"?4:3.2;
    const hriGapMm=sym==="ITF14"?1.02:1;
    return {
      w:Number(m.widthMm||1),
      h:Number(m.heightMm||1)+bearer*2+(hri?hriGapMm+hriFontMm*1.35:0),
      hriFontMm,hriGapMm,bearer
    };
  }
  function syncBarcodeElementSize(element){
    if(!element||element.type!=="barcode") return element;
    try{
      const model=barcodeModelForElement(element);
      const size=barcodePhysicalSize(element,model);
      element.w=size.w;
      element.h=size.h;
      clampElementToBounds(element);
    }catch{}
    return element;
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
      ${formSection("Layout Safety 安全区", `
        ${field("Safe Margin","mm",`<input class="input mono" type="number" min="0" max="100" step="1" data-art="safeMarginMm" value="${esc(Number(a.safeMarginMm??22))}" ${isArtworkLocked()?"disabled":""}/>`)}
        <div class="notice">对每个面板从折线/切线向内缩进。默认 22 mm。文字、条码、QR、图标等越过安全区会在 Preflight 中 BLOCK；确有贴边需求时可对单个对象显式豁免。</div>
      `)}
      ${renderElementEditor()}
    `;
  }

  function renderElementEditor(){
    const elements=artworkElements();
    const selected=selectedArtworkElement();
    const selectedMany=selectedArtworkElements();
    const locked=isArtworkLocked();
    const rows=[...elements].reverse().map((e)=>{
      const label=e.type==="qr-generated"?"QR":e.type==="qr-image"?"QR IMG":e.type==="symbol-image"?"SYM IMG":e.type==="text"?"TEXT":e.type==="barcode"?"BAR":e.type==="symbol"?"SYM":"IMG";
      return `<button type="button" class="element-row ${isElementSelected(e.id)?"active":""} ${e.visible===false?"muted":""}" data-select-element="${esc(e.id)}">
        <span class="element-type">${label}</span>
        <span class="element-name">${esc(e.name||e.type)}</span>
        <span class="mono subtle">${esc(e.panelId||"—")}</span>
        ${e.groupId?'<span class="badge blue">GROUP</span>':""}
        ${e.visible===false?'<span class="badge gray">HIDE</span>':e.locked?'<span class="badge amber">LOCK</span>':""}
      </button>`;
    }).join("");
    const panelOptions=geometry().panels.map(p=>`<option value="${p.id}" ${selected?.panelId===p.id?"selected":""}>${p.id}</option>`).join("");
    const selectionSourcePanel=selectedMany.length&&sameSelectionPanel(selectedMany)?String(selectedMany[0].panelId||""):"";
    const copyPanelOptions=geometry().panels
      .filter(p=>p.id!==selectionSourcePanel)
      .map(p=>`<option value="${p.id}">${p.id}</option>`).join("");
    const panelCopyTools=selectedMany.length?`
      <div class="panel-copy-tools">
        <div class="section-mini-title">Panel Repeat 面板复用</div>
        ${selectionSourcePanel?`
          <div class="row2">
            <select class="select" id="copy-panel-target">${copyPanelOptions}</select>
            <button class="btn small" data-action="copy-selection-panel">复制所选</button>
          </div>
          <button class="btn small" style="width:100%;margin-top:6px" data-action="copy-panel-layout">复制当前面板全部元素 → 目标面板</button>
          <button class="btn small" style="width:100%;margin-top:6px" data-action="copy-opposite-panel" ${OPPOSITE_PANEL_MAP[selectionSourcePanel]?"":"disabled"}>
            复制到对称面 ${OPPOSITE_PANEL_MAP[selectionSourcePanel]?"→ "+OPPOSITE_PANEL_MAP[selectionSourcePanel]:""}
          </button>
          <div class="notice" style="margin-top:6px">保持对象真实尺寸和相对面板位置；条码不会缩放。</div>
        `:'<div class="notice warn">跨面板多选不能复制为一个布局组，请先选择同一面板。</div>'}
      </div>`:"";
    const multiTools=selectedMany.length>1?`
      <div class="multi-selection-tools">
        <div class="notice"><strong>${selectedMany.length} 个元素已多选</strong><br>Shift+点击继续增减选择；对齐/分布会以当前选择整体为参考。</div>
        <div class="align-grid">
          ${[["multi-align-left","左对齐"],["multi-align-hcenter","水平居中"],["multi-align-right","右对齐"],["multi-align-top","顶对齐"],["multi-align-vcenter","垂直居中"],["multi-align-bottom","底对齐"]].map(([a,n])=>`<button class="tool" data-action="${a}">${n}</button>`).join("")}
          <button class="tool" data-action="distribute-horizontal" ${selectedMany.length<3?"disabled":""}>水平等距</button>
          <button class="tool" data-action="distribute-vertical" ${selectedMany.length<3?"disabled":""}>垂直等距</button>
        </div>
        <div class="toolbar" style="justify-content:flex-end;margin-top:8px">
          <button class="btn small" data-action="group-selection" ${sameSelectionPanel(selectedMany)?"":"disabled"}>Group 组合</button>
          <button class="btn small" data-action="ungroup-selection" ${selectedMany.some(e=>e.groupId)?"":"disabled"}>Ungroup</button>
          <button class="btn danger small" data-action="delete-selection">删除所选</button>
        </div>
      </div>`:"";
    const bindingOptions=(D.artworkBindings||[]).map(b=>`<option value="${esc(b.key)}" ${selected?.bindingKey===b.key?"selected":""}>${esc(b.label)}</option>`).join("");
    const selectedTextFit=selected?.type==="text"
      ? D.textFitMetrics(selected,D.resolvedElementText(selected,state.artwork,state.factories))
      : null;
    const props=selected?`
      <div class="element-properties">
        <div class="field"><label>Name</label><input class="input" data-element-prop="name" value="${esc(selected.name||"")}"/></div>
        <div class="field"><label>Panel 面板</label><select class="select" data-element-prop="panelId">${panelOptions}</select></div>
        <div class="row2">
          <label class="toggle-line"><input type="checkbox" data-element-visible ${selected.visible!==false?"checked":""}/> Visible</label>
          <label class="toggle-line"><input type="checkbox" data-element-lock ${selected.locked?"checked":""}/> Lock</label>
        </div>
        <label class="toggle-line"><input type="checkbox" data-element-constrain ${selected.constrainToPanel!==false?"checked":""}/> 限制在所属面板内</label>
        <label class="toggle-line"><input type="checkbox" data-element-safe-exempt ${selected.safeAreaExempt?"checked":""}/> 允许超出 Safe Margin（显式豁免）</label>
        ${selected.type==="text"?`
          <div class="field"><label>Data Source 数据源</label><select class="select" data-element-prop="bindingKey">${bindingOptions}</select></div>
          ${selected.bindingKey?`<div class="notice binding-preview"><strong>Resolved</strong><br><span class="mono">${esc(D.resolvedElementText(selected,state.artwork,state.factories)||"—")}</span></div>`:""}
          <div class="field"><label>Text 文本</label><textarea class="input" rows="3" data-element-prop="text" ${selected.bindingKey?"disabled":""}>${esc(selected.text||"")}</textarea></div>
          <div class="row3">
            <div class="field"><label>pt</label><input class="input mono" type="number" min="1" step="0.25" data-element-prop="fontSizePt" value="${esc(selected.fontSizePt||12)}"/></div>
            <div class="field"><label>Weight</label><select class="select" data-element-prop="fontWeight"><option value="normal" ${selected.fontWeight!=="bold"?"selected":""}>Normal</option><option value="bold" ${selected.fontWeight==="bold"?"selected":""}>Bold</option></select></div>
            <div class="field"><label>Align</label><select class="select" data-element-prop="textAlign"><option value="left" ${selected.textAlign==="left"?"selected":""}>Left</option><option value="center" ${selected.textAlign==="center"?"selected":""}>Center</option><option value="right" ${selected.textAlign==="right"?"selected":""}>Right</option></select></div>
          </div>
          <div class="row2">
            <label class="toggle-line"><input type="checkbox" data-element-autofit ${selected.autoFitText?"checked":""}/> Auto Fit 自动缩小</label>
            <div class="field"><label>Minimum pt</label><input class="input mono" type="number" min="1" step="0.25" data-element-prop="minFontSizePt" value="${esc(Number(selected.minFontSizePt||7))}"/></div>
          </div>
          <button class="btn small" style="width:100%" data-action="fit-text-element">Fit Text Now</button>
          <div class="notice ${selectedTextFit?.fits?"success":"warn"}">
            <strong>Text Box Check</strong><br>
            ${selectedTextFit?.fits
              ? `预计文字 ${D.round(selectedTextFit.widthMm,1)}×${D.round(selectedTextFit.heightMm,1)} mm，可放入 ${D.round(selectedTextFit.boxWidthMm,1)}×${D.round(selectedTextFit.boxHeightMm,1)} mm。`
              : `文字预计需要 ${D.round(selectedTextFit?.widthMm||0,1)}×${D.round(selectedTextFit?.heightMm||0,1)} mm，当前文本框 ${D.round(selectedTextFit?.boxWidthMm||0,1)}×${D.round(selectedTextFit?.boxHeightMm||0,1)} mm；Preflight 会 BLOCK。`}
          </div>`:""}
        ${selected.type==="qr-generated"?`
          <div class="field"><label>Data Source 数据源</label><select class="select" data-element-prop="bindingKey">${bindingOptions}</select></div>
          ${selected.bindingKey?`<div class="notice binding-preview"><strong>Resolved</strong><br><span class="mono">${esc(D.resolvedElementPayload(selected,state.artwork,state.factories)||"—")}</span></div>`:""}
          <div class="field"><label>QR payload</label><textarea class="input" rows="3" data-element-prop="payload" ${selected.bindingKey?"disabled":""}>${esc(selected.payload||"")}</textarea></div>
          <div class="field"><label>Error correction</label><select class="select" data-element-prop="ecc">${["L","M","Q","H"].map(x=>`<option ${selected.ecc===x?"selected":""}>${x}</option>`).join("")}</select></div>`:""}
        ${selected.type==="qr-image"?`
          <div class="field"><label>Expected QR payload 预期内容</label><textarea class="input" rows="3" data-element-prop="expectedPayload" placeholder="可选；填写后 Preflight 会比较扫码结果">${esc(selected.expectedPayload||"")}</textarea></div>
          <div class="notice ${selected.decodeStatus==="PASS"?"success":selected.decodeStatus==="UNAVAILABLE"?"warn":""}">
            <strong>Digital Decode</strong><br>
            Status: <span class="mono">${esc(selected.decodeStatus||"NOT_CHECKED")}</span><br>
            ${selected.decodedValue?`Decoded: <span class="mono">${esc(selected.decodedValue)}</span><br>`:""}
            ${selected.verifiedAt?`Checked: ${esc(selected.verifiedAt)}`:""}
          </div>
          <button class="btn small" data-action="verify-uploaded-qr">验证二维码内容</button>
        `:""}
        ${selected.type==="symbol-image"?`
          <div class="notice warn"><strong>Custom Symbol · Review Asset</strong><br>该图标可以用于布局和审核稿，但正式生产前必须绑定经过批准的客户/工厂 Symbol Master。</div>
        `:""}
        ${selected.type==="barcode"?`
          <div class="field"><label>Data Source 数据源</label><select class="select" data-element-prop="bindingKey">${bindingOptions}</select></div>
          ${selected.bindingKey?`<div class="notice binding-preview"><strong>Resolved</strong><br><span class="mono">${esc(D.resolvedElementPayload(selected,state.artwork,state.factories)||"—")}</span></div>`:""}
          <div class="field"><label>Barcode payload</label><input class="input mono" data-element-prop="payload" value="${esc(selected.payload||"")}" ${selected.bindingKey?"disabled":""}/></div>
          <div class="row2">
            <div class="field"><label>Symbology</label><select class="select" data-element-prop="symbology"><option value="CODE128B" ${selected.symbology==="CODE128B"||!selected.symbology?"selected":""}>Code 128-B</option><option value="ITF14" ${selected.symbology==="ITF14"?"selected":""}>ITF-14 / GTIN-14</option><option value="GS1_128" ${selected.symbology==="GS1_128"?"selected":""}>GS1-128 / SSCC</option></select></div>
            <label class="toggle-line"><input type="checkbox" data-element-hri ${selected.humanReadable!==false?"checked":""}/> Human readable</label>
          </div>
          ${selected.symbology==="GS1_128"?`
            <div class="notice"><strong>GS1 AI 格式</strong><br><span class="mono">(00)SSCC · (01)GTIN · (10)BATCH · (21)SERIAL</span><br>固定长度 AI 会自动连续编码；可变长度 AI 后还有字段时自动插入 FNC1。</div>
            <button class="btn small" data-action="normalize-sscc">把当前数字规范化为 (00) SSCC</button>
          `:selected.symbology==="ITF14"
            ?'<div class="notice">ITF-14 仅接受 GTIN 数字；13 位会自动计算校验位，14 位会验证校验位。</div>'
            :'<div class="notice">Code 128-B 用于普通 ASCII 数据；需要 GS1 物流语义时请选择 GS1-128。</div>'}
          <div class="section-mini-title">Print Geometry 印刷几何</div>
          <div class="row3">
            <div class="field"><label>X mm</label><input class="input mono" type="number" step="0.001" min="0.1" data-element-prop="moduleMm" value="${esc(Number(selected.moduleMm||barcodePhysicalDefaults(selected.symbology).moduleMm))}"/></div>
            <div class="field"><label>Bar H mm</label><input class="input mono" type="number" step="0.25" min="5" data-element-prop="barHeightMm" value="${esc(Number(selected.barHeightMm||barcodePhysicalDefaults(selected.symbology).barHeightMm))}"/></div>
            <div class="field"><label>Quiet X</label><input class="input mono" type="number" step="1" min="0" data-element-prop="quietModules" value="${esc(Number(selected.quietModules||10))}"/></div>
          </div>
          <div class="notice"><strong>1:1 Physical Size</strong><br>条码 W/H 由编码数据和印刷几何自动计算，禁止通过拖拽非等比缩放。修改 X / 条高 / Quiet Zone 后尺寸自动更新。</div>
          ${selected.symbology==="ITF14"?`
            <div class="row3">
              <div class="field"><label>Wide:Narrow</label><input class="input mono" type="number" step="0.05" min="2.25" max="3" data-element-prop="wideRatio" value="${esc(Number(selected.wideRatio||2.5))}"/></div>
              <div class="field"><label>Bearer mm</label><input class="input mono" type="number" step="0.1" min="0" data-element-prop="bearerBarThicknessMm" value="${esc(Number(selected.bearerBarThicknessMm||Math.max(2.032,Number(selected.moduleMm||1.016)*2)))}"/></div>
              <label class="toggle-line"><input type="checkbox" data-element-bearer ${selected.bearerBars!==false?"checked":""}/> Bearer bars</label>
            </div>
            <div class="notice">ITF-14 Review Profile：Quiet Zone ≥ 10X、条高 ≥ 32 mm、wide:narrow 2.25–3.0；top/bottom bearer bars 默认启用。</div>
          `:selected.symbology==="GS1_128"?`
            <div class="notice">GS1-128 Logistics Review Profile：X 0.495–0.940 mm、条高 ≥ 31.75 mm、Quiet Zone ≥ 10X。</div>
          `:""}
        `:""}
        ${selected.type==="symbol"?`
          <div class="field"><label>Handling symbol</label><select class="select" data-element-prop="symbolKey">
            <option value="THIS_WAY_UP" ${selected.symbolKey==="THIS_WAY_UP"?"selected":""}>This Way Up</option>
            <option value="KEEP_DRY" ${selected.symbolKey==="KEEP_DRY"?"selected":""}>Keep Dry</option>
            <option value="FRAGILE" ${selected.symbolKey==="FRAGILE"?"selected":""}>Fragile</option>
            <option value="DO_NOT_STACK" ${selected.symbolKey==="DO_NOT_STACK"?"selected":""}>Do Not Stack</option>
            <option value="KEEP_AWAY_FROM_HEAT" ${selected.symbolKey==="KEEP_AWAY_FROM_HEAT"?"selected":""}>Keep Away From Heat</option>
            <option value="NO_HOOKS" ${selected.symbolKey==="NO_HOOKS"?"selected":""}>No Hooks</option>
          </select></div>
          <div class="notice warn">当前为 Review Library 矢量符号。正式生产须绑定客户/工厂批准的受控 Symbol Master。</div>
        `:""}
        <div class="row2">
          <div class="field"><label>X mm</label><input class="input mono" type="number" step="1" data-element-prop="x" value="${esc(selected.x)}"/></div>
          <div class="field"><label>Y mm</label><input class="input mono" type="number" step="1" data-element-prop="y" value="${esc(selected.y)}"/></div>
        </div>
        <div class="row3">
          <div class="field"><label>W mm</label><input class="input mono" type="number" min="5" step="1" data-element-prop="w" value="${esc(selected.w)}" ${selected.type==="barcode"?"readonly":""}/></div>
          <div class="field"><label>H mm</label><input class="input mono" type="number" min="5" step="1" data-element-prop="h" value="${esc(selected.h)}" ${selected.type==="barcode"?"readonly":""}/></div>
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
        <input id="art-symbol-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden/>
        <button class="btn small" data-action="add-text-element" ${locked?"disabled":""}>＋ 文字</button>
        <button class="btn small" data-action="add-barcode-element" ${locked?"disabled":""}>＋ 条码</button>
        <button class="btn small" data-action="upload-image-trigger" ${locked?"disabled":""}>＋ 图片 / Logo</button>
        <button class="btn small" data-action="upload-qr-trigger" ${locked?"disabled":""}>＋ 上传二维码</button>
        <button class="btn small" data-action="upload-symbol-trigger" ${locked?"disabled":""}>＋ 自定义图标</button>
        <select id="handling-symbol-select" class="select compact-select" ${locked?"disabled":""}>
          <option value="THIS_WAY_UP">This Way Up</option>
          <option value="KEEP_DRY">Keep Dry</option>
          <option value="FRAGILE">Fragile</option>
          <option value="DO_NOT_STACK">Do Not Stack</option>
          <option value="KEEP_AWAY_FROM_HEAT">Keep Away From Heat</option>
          <option value="NO_HOOKS">No Hooks</option>
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
      ${multiTools}${panelCopyTools}${props}
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
      <span class="spacer"></span><span class="subtle mono">↑↓←→ 1 mm · Shift 5 mm · Alt 0.1 mm · Ctrl/Cmd+D · Delete</span>
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
    if(key==="DO_NOT_STACK"){
      return `<g fill="none" stroke="#000" stroke-width="${sw}" stroke-linejoin="round">
        <rect x="${w*.22}" y="${h*.52}" width="${w*.56}" height="${h*.28}"/>
        <rect x="${w*.28}" y="${h*.18}" width="${w*.44}" height="${h*.24}"/>
        <line x1="${w*.15}" y1="${h*.12}" x2="${w*.85}" y2="${h*.88}"/>
        <line x1="${w*.85}" y1="${h*.12}" x2="${w*.15}" y2="${h*.88}"/>
      </g>`;
    }
    if(key==="KEEP_AWAY_FROM_HEAT"){
      const cx=w*.72,cy=h*.26,r=Math.min(w,h)*.12;
      const rays=[0,45,90,135,180,225,270,315].map(deg=>{
        const a=deg*Math.PI/180;
        const x1=cx+Math.cos(a)*r*1.35,y1=cy+Math.sin(a)*r*1.35;
        const x2=cx+Math.cos(a)*r*1.8,y2=cy+Math.sin(a)*r*1.8;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }).join("");
      return `<g fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round">
        <circle cx="${cx}" cy="${cy}" r="${r}"/>${rays}
        <rect x="${w*.18}" y="${h*.52}" width="${w*.48}" height="${h*.28}"/>
        <line x1="${w*.12}" y1="${h*.88}" x2="${w*.88}" y2="${h*.12}"/>
      </g>`;
    }
    if(key==="NO_HOOKS"){
      return `<g fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M ${w*.55} ${h*.14} L ${w*.55} ${h*.55} Q ${w*.55} ${h*.78} ${w*.38} ${h*.78} Q ${w*.22} ${h*.78} ${w*.22} ${h*.62}"/>
        <line x1="${w*.14}" y1="${h*.14}" x2="${w*.86}" y2="${h*.86}"/>
      </g>`;
    }
    return `<rect x="1" y="1" width="${Math.max(1,w-2)}" height="${Math.max(1,h-2)}" fill="none" stroke="#bc2f3b" stroke-width="${sw}"/>`;
  }

  function barcodeSvgBody(element,w,h,artwork=state.artwork,factoryList=state.factories){
    try{
      const model=barcodeModelForElement(element,artwork,factoryList);
      const size=barcodePhysicalSize(element,model);
      const sym=String(element.symbology||"CODE128B").toUpperCase();
      const bearer=size.bearer;
      const barsY=bearer;
      const bars=model.bars.map(b=>`<rect x="${Number(b.x||0).toFixed(3)}" y="${(barsY+Number(b.y||0)).toFixed(3)}" width="${Math.max(.01,Number(b.w||0)).toFixed(3)}" height="${Math.max(.01,Number(b.h||0)).toFixed(3)}" fill="#000"/>`).join("");
      const bearers=model.bearerBars
        ? `<rect x="0" y="0" width="${model.widthMm}" height="${bearer}" fill="#000"/><rect x="0" y="${(bearer+Number(model.heightMm)).toFixed(3)}" width="${model.widthMm}" height="${bearer}" fill="#000"/>`
        : "";
      const hri=element.humanReadable!==false;
      const label=sym==="GS1_128"?(model.hri||model.payload||""):(model.payload||D.resolvedElementPayload(element,artwork,factoryList));
      const textY=bearer+Number(model.heightMm)+bearer+size.hriGapMm+size.hriFontMm;
      const text=hri?`<text x="${Number(model.widthMm)/2}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size.hriFontMm}" fill="#000">${esc(label)}</text>`:"";
      return `<rect x="0" y="0" width="${size.w}" height="${size.h}" fill="#fff"/>${bearers}${bars}${text}`;
    }catch(err){
      return `<rect x="0" y="0" width="${Math.max(1,w)}" height="${Math.max(1,h)}" fill="#fff" stroke="#bc2f3b"/><text x="5" y="15" font-size="9" fill="#bc2f3b">Invalid barcode</text>`;
    }
  }

  function renderCustomElements(artwork=state.artwork,mode="editor",factoryList=state.factories){
    const elements=Array.isArray(artwork.elements)?artwork.elements:[];
    return elements.filter((e)=>e.visible!==false).map((e)=>{
      if(e.type==="barcode") syncBarcodeElementSize(e);
      const w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1));
      const selected=mode==="editor"&&isElementSelected(e.id);
      const border=selected?`<rect data-element-selection x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#e13b6b" stroke-width="2" stroke-dasharray="7 4" vector-effect="non-scaling-stroke"/>`:"";
      const resizeHandle=selected&&selectedArtworkElements().length===1&&!e.locked&&e.type!=="barcode"?`<rect data-element-resize="${esc(e.id)}" x="${Math.max(0,w-4)}" y="${Math.max(0,h-4)}" width="8" height="8" rx="1.5" fill="#fff" stroke="#e13b6b" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:nwse-resize"/>`:"";
      let body="";
      if((e.type==="image"||e.type==="qr-image"||e.type==="symbol-image")&&e.dataUrl){
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
    const safe=Math.max(0,Number(a.safeMarginMm??22));
    const proof=mode==="proof", production=mode==="production";
    const showD=production?false:(proof?true:state.showDieline);
    const showS=production?false:(proof?true:state.showSafe);
    const showP=production?false:(proof?true:state.showPanels);
    const vb=`-50 -50 ${g.totalWidth+100} ${g.totalHeight+100}`;
    const cut=showD?`<g fill="none" stroke="#202a34" stroke-width="1.2"><rect x="${g.H}" y="0" width="${g.L}" height="${g.totalHeight}"/><rect x="0" y="${g.H}" width="${g.totalWidth}" height="${g.W}"/><rect x="0" y="${g.H+g.W+g.H}" width="${g.totalWidth}" height="${g.W}"/></g>`:"";
    const crease=showD?`<g stroke="#3978b8" stroke-width=".8" stroke-dasharray="8 5"><line x1="${g.H}" y1="0" x2="${g.H}" y2="${g.totalHeight}"/><line x1="${g.H+g.L}" y1="0" x2="${g.H+g.L}" y2="${g.totalHeight}"/>${[g.H,g.H+g.W,g.H+g.W+g.H,g.H+g.W+g.H+g.W].map(y=>`<line x1="0" y1="${y}" x2="${g.totalWidth}" y2="${y}"/>`).join("")}</g>`:"";
    const safeBox=showS?g.panels.map(p=>{
      const w=Math.max(0,p.w-safe*2),h=Math.max(0,p.h-safe*2);
      return `<rect x="${p.x+safe}" y="${p.y+safe}" width="${w}" height="${h}" fill="none" stroke="#15976d" stroke-dasharray="6 4" opacity=".78"/>`;
    }).join(""):"";
    const labels=showP?g.panels.map(p=>`<text x="${p.x+p.w/2}" y="${p.y+p.h/2}" text-anchor="middle" fill="#aab4be" font-size="16" font-family="Arial">${p.id}</text>`).join(""):"";
    const bx=g.H+45, by=g.H+g.W+g.H+68;
    const qrEcc=String(options.qrEcc||approvedQrEcc()||"M").toUpperCase();
    const code=renderCodeBlock(g.H+g.L-320,g.H+g.W+g.H+g.W-118,a.codeBlockProfile,a,{qrEcc});
    const note=c.packageNote?`<text x="${bx}" y="${by+108}" font-size="12" font-family="Arial" fill="#000">${esc(c.packageNote)}</text>`:"";
    const custom=renderCustomElements(a,mode,factoryList);
    const guideLayer=mode==="editor"?`<defs><marker id="gap-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M6 0 L0 3 L6 6" fill="none" stroke="#b4235a" stroke-width="1"/></marker></defs>
    <g data-snap-guides pointer-events="none">
      <line data-snap-guide-x x1="0" y1="0" x2="0" y2="${g.totalHeight}" stroke="#e13b6b" stroke-width="1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" opacity="0"/>
      <line data-snap-guide-y x1="0" y1="0" x2="${g.totalWidth}" y2="0" stroke="#e13b6b" stroke-width="1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" opacity="0"/>
      <g data-spacing-overlay>${selectionSpacingSvg()}</g>
      <rect data-marquee-box x="0" y="0" width="0" height="0" fill="#3978b8" fill-opacity=".08" stroke="#3978b8" stroke-width="1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" opacity="0"/>
    </g>`:"";
    const watermark=proof?`<text x="${g.H+g.L/2}" y="${g.totalHeight/2}" text-anchor="middle" transform="rotate(-15 ${g.H+g.L/2} ${g.totalHeight/2})" font-family="Arial" font-size="46" fill="#000" opacity=".12">NOT FOR PRODUCTION</text>`:"";
    const marqueeAttr=mode==="editor"?'data-marquee-surface style="cursor:crosshair"':"";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${g.totalWidth}mm" height="${g.totalHeight}mm" aria-label="US side seal carton artwork">
      <rect ${marqueeAttr} x="-50" y="-50" width="${g.totalWidth+100}" height="${g.totalHeight+100}" fill="#fff"/>
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
      ${code}${custom}${guideLayer}${watermark}
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
        refreshAutoFitTextElements();
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
    const artSymbolFile=document.getElementById("art-symbol-file");
    if(artImageFile) artImageFile.onchange=async()=>{const file=artImageFile.files?.[0];if(file)await addUploadedArtworkElement(file,"image");};
    if(artQrImageFile) artQrImageFile.onchange=async()=>{const file=artQrImageFile.files?.[0];if(file)await addUploadedArtworkElement(file,"qr-image");};
    if(artSymbolFile) artSymbolFile.onchange=async()=>{const file=artSymbolFile.files?.[0];if(file)await addUploadedArtworkElement(file,"symbol-image");};
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
      let w=(type==="qr-image"||type==="symbol-image")?45:Math.min(90,Math.max(35,60));
      let h=(type==="qr-image"||type==="symbol-image")?45:w/Math.max(.1,ratio);
      if(h>90){h=90;w=h*ratio;}
      const p=defaultElementPlacement(w,h);
      const el={
        id:newElementId(),
        type,
        name:type==="qr-image"?`QR image · ${file.name}`:type==="symbol-image"?`Custom symbol · ${file.name}`:file.name,
        x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
        panelId:p.panelId,constrainToPanel:true,
        text:"",fontSizePt:12,fontWeight:"normal",textAlign:"left",
        payload:"",
        ecc:"M",
        sourceType:"uploaded-raster",
        mimeType:normalized.mimeType,
        dataUrl:normalized.dataUrl,
        pixelWidth:normalized.pixelWidth,
        pixelHeight:normalized.pixelHeight,
        assetRole:type==="symbol-image"?"symbol-review":"",
        expectedPayload:"",
        decodedValue:"",
        decodeStatus:"",
        verifiedAt:""
      };
      pushArtworkHistory();
      artworkElements().push(el);
      selectOnlyElement(el.id);
      const saved=persistLocalDraft();
      render();
      toast(saved?(type==="qr-image"?"二维码图片已添加":type==="symbol-image"?"自定义包装图标已添加（Review）":"图片 / Logo 已添加"):"图片已添加，但浏览器本地存储空间不足，请尽快导出或减少图片大小",saved?"success":"error");
    }catch(e){toast(e.message||String(e),"error");}
  }

  async function decodeUploadedQrElement(element){
    if(!element||element.type!=="qr-image"||!element.dataUrl) throw new Error("请选择上传的二维码图片元素。");
    if(typeof globalThis.BarcodeDetector!=="function"){
      element.decodeStatus="UNAVAILABLE";
      element.decodedValue="";
      element.verifiedAt=new Date().toISOString();
      return {status:"UNAVAILABLE",value:""};
    }
    try{
      if(typeof globalThis.BarcodeDetector.getSupportedFormats==="function"){
        const formats=await globalThis.BarcodeDetector.getSupportedFormats();
        if(Array.isArray(formats)&&!formats.includes("qr_code")){
          element.decodeStatus="UNAVAILABLE";
          element.decodedValue="";
          element.verifiedAt=new Date().toISOString();
          return {status:"UNAVAILABLE",value:""};
        }
      }
      const response=await fetch(element.dataUrl);
      const blob=await response.blob();
      const source=typeof createImageBitmap==="function"?await createImageBitmap(blob):await loadImageElement(element.dataUrl);
      const detector=new globalThis.BarcodeDetector({formats:["qr_code"]});
      const results=await detector.detect(source);
      const value=String(results?.[0]?.rawValue||"");
      element.decodedValue=value;
      element.decodeStatus=value?"PASS":"FAIL";
      element.verifiedAt=new Date().toISOString();
      return {status:element.decodeStatus,value};
    }catch(err){
      element.decodedValue="";
      element.decodeStatus="FAIL";
      element.verifiedAt=new Date().toISOString();
      throw err;
    }
  }

  async function verifySelectedQrImage(){
    const element=selectedArtworkElement();
    if(!element||element.type!=="qr-image"){toast("请先选择上传的二维码图片。","error");return;}
    pushArtworkHistory();
    try{
      const result=await decodeUploadedQrElement(element);
      persistLocalDraft();render();
      if(result.status==="PASS"){
        const expected=String(element.expectedPayload||"").trim();
        toast(expected&&expected!==result.value?"二维码可解码，但内容与预期不一致":"二维码数字解码通过",expected&&expected!==result.value?"error":"success");
      }else{
        toast("当前浏览器不支持 BarcodeDetector QR 解码；Preflight 将保持未验证警告。","error");
      }
    }catch(err){
      persistLocalDraft();render();toast("二维码数字解码失败："+(err.message||String(err)),"error");
    }
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
    selectOnlyElement(el.id);
    persistLocalDraft();
    render();
    toast("矢量二维码已添加","success");
  }

  function normalizeSelectedSscc(){
    const e=selectedArtworkElement();
    if(!e||e.type!=="barcode"||!localArtworkEditable()) return;
    const raw=String(e.payload||"").trim();
    try{
      let digits=raw;
      const match=/^\(00\)(\d+)$/.exec(raw);
      if(match) digits=match[1];
      pushArtworkHistory();
      e.symbology="GS1_128";
      e.bindingKey="";
      e.payload=C.ssccGs1Text(digits);
      e.name="SSCC";
      syncBarcodeElementSize(e);
      persistLocalDraft();
      render();
      toast("已按 GS1 AI (00) 生成/验证 SSCC","success");
    }catch(err){toast(err.message||String(err),"error");}
  }

  function addBarcodeElement(){
    if(!localArtworkEditable()) return;
    const defaults=barcodePhysicalDefaults("CODE128B");
    const provisional={type:"barcode",symbology:"CODE128B",humanReadable:true,...defaults,payload:String(state.artwork.barcode||"ABC123"),bindingKey:""};
    let size={w:150,h:48};
    try{size=barcodePhysicalSize(provisional,barcodeModelForElement(provisional));}catch{}
    const w=size.w,h=size.h,p=defaultElementPlacement(w,h);
    const el={
      id:newElementId(),type:"barcode",name:"Barcode",
      x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,
      text:"",fontSizePt:12,fontWeight:"normal",textAlign:"center",
      symbology:"CODE128B",humanReadable:true,
      ...defaults,
      symbolKey:"",
      payload:String(state.artwork.barcode||"ABC123"),ecc:"M",
      sourceType:"generated-vector",mimeType:"",dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);selectOnlyElement(el.id);
    persistLocalDraft();render();toast("条码元素已添加","success");
  }

  function addHandlingSymbol(){
    if(!localArtworkEditable()) return;
    const key=String(document.getElementById("handling-symbol-select")?.value||"THIS_WAY_UP");
    const names={THIS_WAY_UP:"This Way Up",KEEP_DRY:"Keep Dry",FRAGILE:"Fragile",DO_NOT_STACK:"Do Not Stack",KEEP_AWAY_FROM_HEAT:"Keep Away From Heat",NO_HOOKS:"No Hooks"};
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
    artworkElements().push(el);selectOnlyElement(el.id);
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
      panelId:p.panelId,constrainToPanel:true,safeAreaExempt:false,groupId:"",
      text:"",bindingKey,fontSizePt:12,fontWeight:"bold",textAlign:"left",
      autoFitText:true,minFontSizePt:7,
      symbology:"",humanReadable:false,symbolKey:"",
      payload:"",ecc:"M",sourceType:"bound-variable",mimeType:"",
      dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);selectOnlyElement(el.id);
    persistLocalDraft();render();toast(`数据字段已绑定：${meta?.label||bindingKey}`,"success");
  }

  function fitTextElementInPlace(element){
    if(!element||element.type!=="text") return {fits:true};
    const text=D.resolvedElementText(element,state.artwork,state.factories);
    const result=D.fitTextToBox(element,text,{
      minPt:Number(element.minFontSizePt||7),
      maxPt:Number(element.fontSizePt||12)
    });
    if(result.fits) element.fontSizePt=result.fontSizePt;
    return result;
  }
  function fitSelectedTextElement(){
    const element=selectedArtworkElement();
    if(!element||element.type!=="text"||!localArtworkEditable()) return;
    pushArtworkHistory();
    const result=fitTextElementInPlace(element);
    persistLocalDraft();render();
    if(result.fits) toast(`文字已适配到 ${Number(element.fontSizePt).toFixed(2)} pt`,"success");
    else toast(`在最小字号 ${Number(element.minFontSizePt||7).toFixed(2)} pt 下仍无法放入当前文本框，请增大文本框。`,"error");
  }
  function refreshAutoFitTextElements(){
    for(const element of artworkElements()){
      if(element.type==="text"&&element.autoFitText) fitTextElementInPlace(element);
    }
  }

  function addTextElement(){
    if(!localArtworkEditable()) return;
    const w=120,h=28,p=defaultElementPlacement(w,h);
    const el={
      id:newElementId(),type:"text",name:"Text",
      x:p.x,y:p.y,w,h,rotation:0,locked:false,visible:true,
      panelId:p.panelId,constrainToPanel:true,safeAreaExempt:false,groupId:"",
      text:"NEW MARK TEXT",fontSizePt:12,fontWeight:"bold",textAlign:"left",
      autoFitText:true,minFontSizePt:7,
      payload:"",ecc:"M",sourceType:"generated-text",mimeType:"",
      dataUrl:"",pixelWidth:0,pixelHeight:0
    };
    pushArtworkHistory();
    artworkElements().push(el);
    selectOnlyElement(el.id);
    persistLocalDraft();render();toast("文字元素已添加","success");
  }

  function duplicateSelectedElement(){
    const items=selectedArtworkElements();
    if(!items.length||!localArtworkEditable()) return;
    pushArtworkHistory();
    const copies=[];
    const groupMap=new Map();
    for(const current of items){
      const copy=JSON.parse(JSON.stringify(current));
      copy.id=newElementId();copy.name=(current.name||current.type)+" copy";
      if(copy.groupId){
        if(!groupMap.has(copy.groupId)) groupMap.set(copy.groupId,newGroupId());
        copy.groupId=groupMap.get(copy.groupId);
      }
      copy.locked=false;
      copy.x=Number(current.x||0)+8;copy.y=Number(current.y||0)+8;
      clampElementToBounds(copy);
      copies.push(copy);
    }
    artworkElements().push(...copies);
    state.selectedElementIds=copies.map(e=>e.id);
    state.selectedElementId=copies.at(-1)?.id||null;
    persistLocalDraft();render();
    toast(copies.length>1?`已复制 ${copies.length} 个元素`:"元素已复制","success");
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

  function selectionBounds(elements=selectedArtworkElements()){
    if(!elements.length) return null;
    const left=Math.min(...elements.map(e=>Number(e.x||0)));
    const top=Math.min(...elements.map(e=>Number(e.y||0)));
    const right=Math.max(...elements.map(e=>Number(e.x||0)+Math.max(1,Number(e.w||1))));
    const bottom=Math.max(...elements.map(e=>Number(e.y||0)+Math.max(1,Number(e.h||1))));
    return {left,top,right,bottom,width:right-left,height:bottom-top};
  }

  function selectionSpacingSvg(elements=selectedArtworkElements()){
    const items=elements.filter(e=>e.visible!==false);
    if(!items.length) return "";
    const b=selectionBounds(items);
    const label=(x,y,text,anchor="middle")=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#b4235a" stroke="#fff" stroke-width="4" paint-order="stroke" vector-effect="non-scaling-stroke">${esc(text)}</text>`;
    let out=label(b.left,b.top-7,`Selection ${D.round(b.width,1)} × ${D.round(b.height,1)} mm`,"start");
    if(items.length!==2||!sameSelectionPanel(items)) return out;
    const [a,bx]=items;
    const ax=Number(a.x||0),ay=Number(a.y||0),aw=Number(a.w||0),ah=Number(a.h||0);
    const bx0=Number(bx.x||0),by0=Number(bx.y||0),bw=Number(bx.w||0),bh=Number(bx.h||0);
    const ar=ax+aw,ab=ay+ah,br=bx0+bw,bb=by0+bh;

    let x1=null,x2=null;
    if(ar<=bx0){x1=ar;x2=bx0;}
    else if(br<=ax){x1=br;x2=ax;}
    if(x1!==null){
      const y=(Math.max(ay,by0)+Math.min(ab,bb))/2;
      const yy=Number.isFinite(y)?y:(ay+ah/2+by0+bh/2)/2;
      out+=`<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#b4235a" stroke-width="1" marker-start="url(#gap-arrow)" marker-end="url(#gap-arrow)" vector-effect="non-scaling-stroke"/>`;
      out+=label((x1+x2)/2,yy-5,`${D.round(x2-x1,1)} mm`);
    }

    let y1=null,y2=null;
    if(ab<=by0){y1=ab;y2=by0;}
    else if(bb<=ay){y1=bb;y2=ay;}
    if(y1!==null){
      const x=(Math.max(ax,bx0)+Math.min(ar,br))/2;
      const xx=Number.isFinite(x)?x:(ax+aw/2+bx0+bw/2)/2;
      out+=`<line x1="${xx}" y1="${y1}" x2="${xx}" y2="${y2}" stroke="#b4235a" stroke-width="1" marker-start="url(#gap-arrow)" marker-end="url(#gap-arrow)" vector-effect="non-scaling-stroke"/>`;
      out+=label(xx+6,(y1+y2)/2,`${D.round(y2-y1,1)} mm`,"start");
    }
    return out;
  }
  function updateSpacingOverlay(svg){
    const layer=svg?.querySelector("[data-spacing-overlay]");
    if(layer) layer.innerHTML=selectionSpacingSvg();
  }

  function sameSelectionPanel(elements=selectedArtworkElements()){
    const panels=new Set(elements.map(e=>String(e.panelId||"")));
    return panels.size<=1;
  }

  function groupSelectedElements(){
    const items=selectedArtworkElements();
    if(items.length<2||!localArtworkEditable()) return;
    if(!sameSelectionPanel(items)){toast("Group 要求元素位于同一纸箱面板。","error");return;}
    pushArtworkHistory();
    const groupId=newGroupId();
    for(const item of items) item.groupId=groupId;
    persistLocalDraft();render();toast(`已组合 ${items.length} 个元素`,"success");
  }
  function ungroupSelectedElements(){
    const ids=new Set(selectedArtworkElements().map(e=>String(e.groupId||"")).filter(Boolean));
    if(!ids.size||!localArtworkEditable()) return;
    pushArtworkHistory();
    let count=0;
    for(const item of artworkElements()){
      if(ids.has(String(item.groupId||""))){item.groupId="";count+=1;}
    }
    persistLocalDraft();render();toast(`已解除 ${count} 个元素的组合`,"success");
  }

  function selectionMoveLimits(items){
    let minDx=-Infinity,maxDx=Infinity,minDy=-Infinity,maxDy=Infinity;
    for(const item of items){
      const b=elementBounds(item),w=Math.max(1,Number(item.w||1)),h=Math.max(1,Number(item.h||1));
      const x=Number(item.x||0),y=Number(item.y||0);
      minDx=Math.max(minDx,b.x-x);
      maxDx=Math.min(maxDx,b.x+b.w-w-x);
      minDy=Math.max(minDy,b.y-y);
      maxDy=Math.min(maxDy,b.y+b.h-h-y);
    }
    return {minDx,maxDx,minDy,maxDy};
  }
  function clampedSelectionDelta(items,dx,dy){
    const lim=selectionMoveLimits(items);
    return {
      dx:Math.max(lim.minDx,Math.min(lim.maxDx,dx)),
      dy:Math.max(lim.minDy,Math.min(lim.maxDy,dy))
    };
  }
  function moveSelectionBy(items,dx,dy){
    const delta=clampedSelectionDelta(items,dx,dy);
    for(const item of items){
      item.x=Number(item.x||0)+delta.dx;
      item.y=Number(item.y||0)+delta.dy;
    }
    return delta;
  }

  function alignSelectedElements(mode){
    const items=selectedArtworkElements().filter(e=>!e.locked);
    if(items.length<2||!localArtworkEditable()) return;
    if(!sameSelectionPanel(items)){toast("多选对齐要求元素位于同一纸箱面板，避免跨折线误移动。","error");return;}
    const b=selectionBounds(items);if(!b)return;
    pushArtworkHistory();
    for(const e of items){
      const w=Math.max(1,Number(e.w||1)),h=Math.max(1,Number(e.h||1));
      if(mode==="left") e.x=b.left;
      if(mode==="hcenter") e.x=b.left+(b.width-w)/2;
      if(mode==="right") e.x=b.right-w;
      if(mode==="top") e.y=b.top;
      if(mode==="vcenter") e.y=b.top+(b.height-h)/2;
      if(mode==="bottom") e.y=b.bottom-h;
      clampElementToBounds(e);
    }
    persistLocalDraft();render();
  }

  function distributeSelectedElements(axis){
    const items=selectedArtworkElements().filter(e=>!e.locked);
    if(items.length<3||!localArtworkEditable()) return;
    if(!sameSelectionPanel(items)){toast("等距分布要求元素位于同一纸箱面板。","error");return;}
    pushArtworkHistory();
    if(axis==="horizontal"){
      const sorted=[...items].sort((a,b)=>Number(a.x||0)-Number(b.x||0));
      const first=sorted[0],last=sorted.at(-1);
      const left=Number(first.x||0),right=Number(last.x||0)+Number(last.w||0);
      const totalWidth=sorted.reduce((sum,e)=>sum+Number(e.w||0),0);
      const gap=(right-left-totalWidth)/(sorted.length-1);
      let x=left;
      for(const e of sorted){e.x=x;x+=Number(e.w||0)+gap;clampElementToBounds(e);}
    }else{
      const sorted=[...items].sort((a,b)=>Number(a.y||0)-Number(b.y||0));
      const first=sorted[0],last=sorted.at(-1);
      const top=Number(first.y||0),bottom=Number(last.y||0)+Number(last.h||0);
      const totalHeight=sorted.reduce((sum,e)=>sum+Number(e.h||0),0);
      const gap=(bottom-top-totalHeight)/(sorted.length-1);
      let y=top;
      for(const e of sorted){e.y=y;y+=Number(e.h||0)+gap;clampElementToBounds(e);}
    }
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
    const ids=new Set(selectedArtworkElements().filter(e=>!e.locked).map(e=>e.id));
    if(!ids.size){toast("请先选择可编辑元素。","error");return;}
    pushArtworkHistory();
    state.artwork.elements=artworkElements().filter(e=>!ids.has(e.id));
    selectOnlyElement(null);
    persistLocalDraft();
    render();
    toast(ids.size>1?`已删除 ${ids.size} 个元素`:"元素已删除","success");
  }

  function bindEditorKeyboard(){
    document.onkeydown=(event)=>{
      const target=event.target;
      const typing=target&&(["INPUT","TEXTAREA","SELECT"].includes(target.tagName)||target.isContentEditable);
      if(typing) return;
      const mod=event.ctrlKey||event.metaKey;
      const key=String(event.key||"").toLowerCase();
      if(mod&&key==="z"){
        event.preventDefault();
        if(event.shiftKey) redoArtwork(); else undoArtwork();
        return;
      }
      if(mod&&key==="y"){
        event.preventDefault();redoArtwork();return;
      }
      const element=selectedArtworkElement();
      const selection=selectedArtworkElements().filter(e=>!e.locked);
      if(!element||!selection.length||!localArtworkEditable()) return;
      if(mod&&key==="d"){
        event.preventDefault();duplicateSelectedElement();return;
      }
      if(event.key==="Delete"||event.key==="Backspace"){
        event.preventDefault();deleteSelectedElement();return;
      }
      if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){
        event.preventDefault();
        if(!event.repeat) pushArtworkHistory();
        const step=event.altKey?0.1:(event.shiftKey?5:1);
        let dx=0,dy=0;
        if(event.key==="ArrowLeft") dx=-step;
        if(event.key==="ArrowRight") dx=step;
        if(event.key==="ArrowUp") dy=-step;
        if(event.key==="ArrowDown") dy=step;
        moveSelectionBy(selection,dx,dy);
        persistLocalDraft();render();
      }
    };
  }

  function bindArtworkElements(){
    document.querySelectorAll("[data-select-element]").forEach((b)=>{
      b.onclick=(event)=>{
        if(event.shiftKey) toggleElementSelection(b.dataset.selectElement);
        else selectOnlyElement(b.dataset.selectElement);
        render();
      };
    });
    document.querySelectorAll("[data-element-prop]").forEach((el)=>{
      el.onfocus=()=>{if(localArtworkEditable())pushArtworkHistory();};
      const apply=()=>{
        const e=selectedArtworkElement();
        if(!e||!localArtworkEditable()) return;
        const key=el.dataset.elementProp;
        if(key==="panelId"){
          placeElementInPanel(e,el.value);
        }else{
          e[key]=["x","y","w","h","rotation","fontSizePt","minFontSizePt","moduleMm","barHeightMm","quietModules","wideRatio","bearerBarThicknessMm"].includes(key)?Number(el.value):el.value;
          if(key==="symbology") ensureBarcodePhysicalSettings(e,true);
          if(key==="w"||key==="h") e[key]=Math.max(5,Number(e[key]||5));
          if(key==="fontSizePt") e[key]=Math.max(5,Number(e[key]||5));
          if(e.type==="barcode"&&["payload","bindingKey","symbology","moduleMm","barHeightMm","quietModules","wideRatio","bearerBarThicknessMm"].includes(key)) syncBarcodeElementSize(e);
          else {
            clampElementToBounds(e);
            if(e.type==="text"&&e.autoFitText&&["text","bindingKey","w","h","fontWeight","minFontSizePt"].includes(key)) fitTextElementInPlace(e);
          }
        }
        persistLocalDraft();
      };
      el.oninput=apply;
      el.onchange=()=>{apply();render();};
    });
    const lock=document.querySelector("[data-element-lock]");
    if(lock) lock.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      pushArtworkHistory();
      e.locked=Boolean(lock.checked);persistLocalDraft();render();
    };
    const visible=document.querySelector("[data-element-visible]");
    if(visible) visible.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      pushArtworkHistory();
      e.visible=Boolean(visible.checked);persistLocalDraft();render();
    };
    const hri=document.querySelector("[data-element-hri]");
    if(hri) hri.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      pushArtworkHistory();
      e.humanReadable=Boolean(hri.checked);syncBarcodeElementSize(e);persistLocalDraft();render();
    };
    const bearer=document.querySelector("[data-element-bearer]");
    if(bearer) bearer.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      pushArtworkHistory();
      e.bearerBars=Boolean(bearer.checked);syncBarcodeElementSize(e);persistLocalDraft();render();
    };
    const constrain=document.querySelector("[data-element-constrain]");
    if(constrain) constrain.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      pushArtworkHistory();
      e.constrainToPanel=Boolean(constrain.checked);clampElementToBounds(e);persistLocalDraft();render();
    };
    const safeExempt=document.querySelector("[data-element-safe-exempt]");
    if(safeExempt) safeExempt.onchange=()=>{
      const e=selectedArtworkElement();if(!e||!localArtworkEditable())return;
      pushArtworkHistory();
      e.safeAreaExempt=Boolean(safeExempt.checked);persistLocalDraft();render();
    };
    const autoFit=document.querySelector("[data-element-autofit]");
    if(autoFit) autoFit.onchange=()=>{
      const e=selectedArtworkElement();if(!e||e.type!=="text"||!localArtworkEditable())return;
      pushArtworkHistory();
      e.autoFitText=Boolean(autoFit.checked);
      if(e.autoFitText) fitTextElementInPlace(e);
      persistLocalDraft();render();
    };

    document.querySelectorAll("[data-element-resize]").forEach((handle)=>{
      handle.onpointerdown=(ev)=>{
        ev.preventDefault();ev.stopPropagation();
        const id=handle.dataset.elementResize;
        const element=artworkElements().find((x)=>x.id===id);
        const group=handle.closest("[data-art-element]");
        const svg=group?.ownerSVGElement;
        if(!element||element.locked||!localArtworkEditable()||!group||!svg?.createSVGPoint) return;
        pushArtworkHistory();
        const localPoint=(event)=>{
          const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
          return p.matrixTransform(group.getScreenCTM().inverse());
        };
        const bounds=elementBounds(element);
        const maxW=Math.max(5,bounds.x+bounds.w-Number(element.x||0));
        const maxH=Math.max(5,bounds.y+bounds.h-Number(element.y||0));
        let nextW=Number(element.w||5),nextH=Number(element.h||5);
        try{handle.setPointerCapture(ev.pointerId);}catch{}
        handle.onpointermove=(move)=>{
          if(move.pointerId!==ev.pointerId)return;
          const p=localPoint(move);
          nextW=Math.max(5,Math.min(maxW,p.x));
          nextH=Math.max(5,Math.min(maxH,p.y));
          const selection=group.querySelector("[data-element-selection]");
          if(selection){selection.setAttribute("width",String(nextW));selection.setAttribute("height",String(nextH));}
          handle.setAttribute("x",String(Math.max(0,nextW-4)));
          handle.setAttribute("y",String(Math.max(0,nextH-4)));
        };
        const finish=()=>{
          handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;
          element.w=nextW;element.h=nextH;clampElementToBounds(element);
          if(element.type==="text"&&element.autoFitText) fitTextElementInPlace(element);
          persistLocalDraft();render();
        };
        handle.onpointerup=finish;handle.onpointercancel=finish;
      };
    });

    const marqueeSurface=document.querySelector("[data-marquee-surface]");
    if(marqueeSurface){
      marqueeSurface.onpointerdown=(ev)=>{
        if(!localArtworkEditable()) return;
        const svg=marqueeSurface.ownerSVGElement;
        const box=svg?.querySelector("[data-marquee-box]");
        if(!svg?.createSVGPoint||!box) return;
        ev.preventDefault();
        const point=(event)=>{
          const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
          return p.matrixTransform(svg.getScreenCTM().inverse());
        };
        const start=point(ev);
        const baseIds=ev.shiftKey?new Set(state.selectedElementIds||[]):new Set();
        let current=start;
        try{marqueeSurface.setPointerCapture(ev.pointerId);}catch{}
        const draw=()=>{
          const x=Math.min(start.x,current.x),y=Math.min(start.y,current.y);
          const w=Math.abs(current.x-start.x),h=Math.abs(current.y-start.y);
          box.setAttribute("x",String(x));box.setAttribute("y",String(y));
          box.setAttribute("width",String(w));box.setAttribute("height",String(h));
          box.setAttribute("opacity",w>1||h>1?"1":"0");
        };
        marqueeSurface.onpointermove=(move)=>{
          if(move.pointerId!==ev.pointerId) return;
          current=point(move);draw();
        };
        const finish=()=>{
          marqueeSurface.onpointermove=null;marqueeSurface.onpointerup=null;marqueeSurface.onpointercancel=null;
          const left=Math.min(start.x,current.x),right=Math.max(start.x,current.x);
          const top=Math.min(start.y,current.y),bottom=Math.max(start.y,current.y);
          const moved=(right-left)>2||(bottom-top)>2;
          const ids=new Set(baseIds);
          if(moved){
            for(const item of artworkElements()){
              if(item.visible===false) continue;
              const x=Number(item.x||0),y=Number(item.y||0),w=Number(item.w||0),h=Number(item.h||0);
              const hit=x<right&&(x+w)>left&&y<bottom&&(y+h)>top;
              if(hit) for(const unitId of selectionUnitIds(item.id)) ids.add(unitId);
            }
          }
          state.selectedElementIds=[...ids];
          state.selectedElementId=state.selectedElementIds.at(-1)||null;
          box.setAttribute("opacity","0");
          render();
        };
        marqueeSurface.onpointerup=finish;marqueeSurface.onpointercancel=finish;
      };
    }

    document.querySelectorAll("[data-art-element]").forEach((group)=>{
      group.onpointerdown=(ev)=>{
        const id=group.dataset.artElement;
        const element=artworkElements().find((x)=>x.id===id);
        if(!element) return;
        if(ev.shiftKey){
          toggleElementSelection(id);
          ev.preventDefault();
          render();
          return;
        }

        const alreadySelected=isElementSelected(id);
        if(!alreadySelected) selectOnlyElement(id);
        const dragItems=selectedArtworkElements().filter(e=>!e.locked);
        if(element.locked||!dragItems.length||!localArtworkEditable()){render();return;}
        if(dragItems.length>1&&!sameSelectionPanel(dragItems)){
          toast("整组拖动要求所选元素位于同一面板。","error");
          render();
          return;
        }

        pushArtworkHistory();
        ev.preventDefault();
        const svg=group.ownerSVGElement;
        if(!svg?.createSVGPoint) return;
        const point=(event)=>{
          const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
          return p.matrixTransform(svg.getScreenCTM().inverse());
        };
        const startPoint=point(ev);
        const starts=new Map(dragItems.map(item=>[item.id,{x:Number(item.x||0),y:Number(item.y||0)}]));
        const anchorStart=starts.get(element.id);
        const dragIds=dragItems.map(item=>item.id);
        const lim=selectionMoveLimits(dragItems);

        try{group.setPointerCapture(ev.pointerId);}catch{}
        group.onpointermove=(move)=>{
          if(move.pointerId!==ev.pointerId) return;
          const p=point(move);
          let dx=Math.max(lim.minDx,Math.min(lim.maxDx,p.x-startPoint.x));
          let dy=Math.max(lim.minDy,Math.min(lim.maxDy,p.y-startPoint.y));

          const snapped=smartSnapElementPosition(
            element,
            anchorStart.x+dx,
            anchorStart.y+dy,
            dragIds
          );
          dx=Math.max(lim.minDx,Math.min(lim.maxDx,snapped.x-anchorStart.x));
          dy=Math.max(lim.minDy,Math.min(lim.maxDy,snapped.y-anchorStart.y));

          for(const item of dragItems){
            const initial=starts.get(item.id);
            item.x=initial.x+dx;
            item.y=initial.y+dy;
            const node=svg.querySelector(`[data-art-element="${CSS.escape(item.id)}"]`);
            if(node) node.setAttribute("transform",elementTransform(item));
          }
          updateSnapGuides(svg,snapped.guides);
          updateSpacingOverlay(svg);
        };
        const finish=()=>{
          group.onpointermove=null;group.onpointerup=null;group.onpointercancel=null;
          updateSnapGuides(svg,[]);
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
    if(action==="upload-symbol-trigger"){document.getElementById("art-symbol-file")?.click();return;}
    if(action==="verify-uploaded-qr") return verifySelectedQrImage();
    if(action==="add-text-element") return addTextElement();
    if(action==="add-bound-text-element") return addBoundTextElement();
    if(action==="add-barcode-element") return addBarcodeElement();
    if(action==="normalize-sscc") return normalizeSelectedSscc();
    if(action==="add-handling-symbol") return addHandlingSymbol();
    if(action==="add-generated-qr") return addGeneratedQrElement();
    if(action==="duplicate-element") return duplicateSelectedElement();
    if(action==="copy-selection-panel"){
      const target=document.getElementById("copy-panel-target")?.value||"";
      if(target) return cloneSelectionToPanel(target);
      return;
    }
    if(action==="copy-panel-layout"){
      const items=selectedArtworkElements();
      const source=items.length&&sameSelectionPanel(items)?String(items[0].panelId||""):"";
      const target=document.getElementById("copy-panel-target")?.value||"";
      if(source&&target) return clonePanelLayout(source,target);
      return;
    }
    if(action==="copy-opposite-panel") return cloneSelectionToOppositePanel();
    if(action==="group-selection") return groupSelectedElements();
    if(action==="ungroup-selection") return ungroupSelectedElements();
    if(action==="fit-text-element") return fitSelectedTextElement();
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
    if(action==="multi-align-left") return alignSelectedElements("left");
    if(action==="multi-align-hcenter") return alignSelectedElements("hcenter");
    if(action==="multi-align-right") return alignSelectedElements("right");
    if(action==="multi-align-top") return alignSelectedElements("top");
    if(action==="multi-align-vcenter") return alignSelectedElements("vcenter");
    if(action==="multi-align-bottom") return alignSelectedElements("bottom");
    if(action==="distribute-horizontal") return distributeSelectedElements("horizontal");
    if(action==="distribute-vertical") return distributeSelectedElements("vertical");
    if(action==="delete-selection") return deleteSelectedElement();
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
          const sym=String(e.symbology||"").toUpperCase();
          ensureBarcodePhysicalSettings(e);
          const model=barcodeModelForElement(e,artwork,state.factories);
          const size=barcodePhysicalSize(e,model);
          return {...e,w:size.w,h:size.h,payload,barcodeModel:model};
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
