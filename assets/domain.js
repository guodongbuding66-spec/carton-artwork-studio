(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const INCH_TO_MM = 25.4;
  const PT_PER_MM = 72 / 25.4;

  const factories = [
    { id: "ningbo-a", name: "Ningbo Factory A", crn: "3203960FM4", country: "China", effective: "2026-01-01" },
    { id: "zhejiang-b", name: "Zhejiang Factory B", crn: "3307820AB1", country: "China", effective: "2026-04-15" },
    { id: "vietnam-c", name: "Vietnam Factory C", crn: "VN-HCM-88021", country: "Vietnam", effective: "2026-08-01" }
  ];

  const defaultArtwork = {
    sku: "KF210215US-02PM-001",
    contractNo: "HT24010213",
    packageCount: 3,
    currentPackage: 1,
    netWeight: 74.1,
    grossWeight: 80.7,
    length: 47.24,
    width: 23.62,
    height: 7.87,
    factoryId: "ningbo-a",
    barcode: "KF210215US02PM001",
    qr: "https://example.com/KF210215US-02PM-001",
    codeBlockProfile: "250x80",
    status: "draft",
    revision: "R03",
    templateCode: "US_SIDE_SEAL",
    templateVersion: "2026.05.20",
    templateName: "美线侧封箱",
    market: "US",
    safeMarginMm: 22,
    boxType: "US_SIDE_SEAL",
    materialId: "E_FLUTE_WHITE",
    paperThicknessMm: 1.5,
    bleedMm: 3,
    dimensionMode: "OUTER",
    elements: []
  };

  const sourceCalibration = {
    sourceFile: "美线侧封箱印刷模板20260520.pdf",
    pagePt: { width: 14400, height: 10335.2001953125 },
    reference200mm: {
      measuredMm: 199.46,
      targetMm: 200
    },
    structureScale: 0.9535
  };

  function round(n, digits = 2) {
    const p = 10 ** digits;
    return Math.round((Number(n) + Number.EPSILON) * p) / p;
  }

  function inchToMm(v) {
    return Number(v || 0) * INCH_TO_MM;
  }

  function mmToPt(v) {
    return Number(v || 0) * PT_PER_MM;
  }

  function findFactory(id, factoryList = factories) {
    return (factoryList || factories).find((f) => f.id === id) || null;
  }

  function formatNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    return Number.isInteger(num) ? String(num) : String(round(num, 2)).replace(/\.0+$/, "");
  }

  function canonicalData(artwork, factoryList = factories) {
    const a = artwork;
    const f = findFactory(a.factoryId, factoryList);
    return {
      order: {
        contractNo: a.contractNo,
        market: a.market
      },
      product: {
        sku: a.sku
      },
      package: {
        total: Number(a.packageCount),
        index: Number(a.currentPackage),
        netWeight: Number(a.netWeight),
        grossWeight: Number(a.grossWeight),
        length: Number(a.length),
        width: Number(a.width),
        height: Number(a.height),
        weightUnit: "LBS",
        dimensionUnit: "INCH"
      },
      factory: f ? {
        id: f.id,
        name: f.name,
        crn: f.crn,
        country: f.country
      } : null,
      origin: {
        country: f?.country || ""
      },
      codes: {
        barcode: a.barcode,
        qr: a.qr,
        profile: a.codeBlockProfile
      },
      template: {
        code: a.templateCode,
        version: a.templateVersion,
        printProfile: "US_SIDE_SEAL_K_ONLY_V1"
      },
      structure: {
        boxType: String(a.boxType||"US_SIDE_SEAL"),
        materialId: String(a.materialId||"E_FLUTE_WHITE"),
        paperThicknessMm: Number(a.paperThicknessMm??1.5),
        bleedMm: Number(a.bleedMm??3),
        dimensionMode: String(a.dimensionMode||"OUTER")
      },
      artwork: {
        revision: a.revision,
        status: a.status,
        safeMarginMm: Number(a.safeMarginMm ?? 22),
        elements: Array.isArray(a.elements) ? a.elements.map((e)=>({
          id:e.id,
          type:e.type,
          name:e.name||"",
          x:Number(e.x||0),
          y:Number(e.y||0),
          w:Number(e.w||0),
          h:Number(e.h||0),
          rotation:Number(e.rotation||0),
          locked:Boolean(e.locked),
          visible:e.visible!==false,
          panelId:e.panelId||"TOP_FACE",
          constrainToPanel:e.constrainToPanel!==false,
          text:e.text||"",
          fontSizePt:Number(e.fontSizePt||12),
          fontWeight:String(e.fontWeight||"normal"),
          textAlign:String(e.textAlign||"left"),
          wrapText:Boolean(e.wrapText),
          lineHeight:Number(e.lineHeight||1.2),
          bindingKey:String(e.bindingKey||""),
          symbology:String(e.symbology||""),
          humanReadable:e.humanReadable!==false,
          moduleMm:Number(e.moduleMm||0),
          barHeightMm:Number(e.barHeightMm||0),
          quietModules:Number(e.quietModules||0),
          wideRatio:Number(e.wideRatio||0),
          bearerBars:e.bearerBars!==false,
          bearerBarThicknessMm:Number(e.bearerBarThicknessMm||0),
          symbolKey:String(e.symbolKey||""),
          payload:e.payload||"",
          ecc:e.ecc||"M",
          sourceType:e.sourceType||"",
          mimeType:e.mimeType||"",
          dataUrl:e.dataUrl||"",
          pixelWidth:Number(e.pixelWidth||0),
          pixelHeight:Number(e.pixelHeight||0),
          sourcePixelWidth:Number(e.sourcePixelWidth||0),
          sourcePixelHeight:Number(e.sourcePixelHeight||0),
          sourceMimeType:String(e.sourceMimeType||e.mimeType||""),
          originalFileName:String(e.originalFileName||""),
          vectorDataUrl:String(e.vectorDataUrl||""),
          assetRole:String(e.assetRole||""),
          expectedPayload:String(e.expectedPayload||""),
          decodedValue:String(e.decodedValue||""),
          decodeStatus:String(e.decodeStatus||""),
          verifiedAt:String(e.verifiedAt||""),
          groupId:String(e.groupId||""),
          safeAreaExempt:Boolean(e.safeAreaExempt),
          autoFitText:Boolean(e.autoFitText),
          minFontSizePt:Number(e.minFontSizePt||7),
          blockType:String(e.blockType||""),
          blockVersion:String(e.blockVersion||""),
          blockSlot:String(e.blockSlot||"")
        })) : []
      }
    };
  }

  function computed(artwork, factoryList = factories) {
    const a = artwork;
    const f = findFactory(a.factoryId, factoryList);
    return {
      packageMeas: `${formatNumber(a.length)}x${formatNumber(a.width)}x${formatNumber(a.height)} INCH`,
      originText: f ? `Made in ${f.country}` : "Made in —",
      packageNote: Number(a.packageCount) > 1
        ? `Please note the product has ${a.packageCount} packages, and this is the package ${a.currentPackage}`
        : "",
      crn: f?.crn || ""
    };
  }

  const artworkBindings = Object.freeze([
    { key:"", label:"Manual text" },
    { key:"product.sku", label:"SKU / Item No." },
    { key:"order.contractNo", label:"Contract / PO" },
    { key:"order.market", label:"Market" },
    { key:"codes.barcode", label:"Primary Barcode Data" },
    { key:"codes.qr", label:"Primary QR Data" },
    { key:"package.total", label:"Package Count" },
    { key:"package.index", label:"Current Package" },
    { key:"package.indexOfTotal", label:"Package X of Y" },
    { key:"package.netWeight", label:"N.W. + unit" },
    { key:"package.grossWeight", label:"G.W. + unit" },
    { key:"package.meas", label:"Package Meas" },
    { key:"package.note", label:"Multi-package note" },
    { key:"factory.crn", label:"Factory CRN" },
    { key:"factory.name", label:"Factory Name" },
    { key:"origin.country", label:"Country of Origin" },
    { key:"origin.text", label:"Made in …" },
    { key:"shipping.skuLine", label:"Shipping · ITEM NO." },
    { key:"shipping.contractLine", label:"Shipping · CONTRACT NO." },
    { key:"shipping.weightLine", label:"Shipping · N.W. / G.W." },
    { key:"shipping.packageLine", label:"Shipping · PACKAGE MEAS" },
    { key:"shipping.crnLine", label:"Shipping · CRN" },
    { key:"shipping.originLine", label:"Shipping · ORIGIN" }
  ]);

  function isKnownArtworkBinding(key) {
    return artworkBindings.some((x)=>x.key===String(key||""));
  }

  function resolveArtworkBinding(key, artwork, factoryList = factories) {
    const k=String(key||"");
    const a=artwork||{};
    const f=findFactory(a.factoryId,factoryList);
    const c=computed(a,factoryList);
    if(!k) return "";
    if(k==="product.sku") return String(a.sku??"");
    if(k==="order.contractNo") return String(a.contractNo??"");
    if(k==="order.market") return String(a.market??"");
    if(k==="codes.barcode") return String(a.barcode??"");
    if(k==="codes.qr") return String(a.qr??"");
    if(k==="package.total") return formatNumber(a.packageCount);
    if(k==="package.index") return formatNumber(a.currentPackage);
    if(k==="package.indexOfTotal") return `${formatNumber(a.currentPackage)} / ${formatNumber(a.packageCount)}`;
    if(k==="package.netWeight") return `${formatNumber(a.netWeight)} LBS`;
    if(k==="package.grossWeight") return `${formatNumber(a.grossWeight)} LBS`;
    if(k==="package.meas") return c.packageMeas;
    if(k==="package.note") return c.packageNote;
    if(k==="factory.crn") return String(f?.crn||"");
    if(k==="factory.name") return String(f?.name||"");
    if(k==="origin.country") return String(f?.country||"");
    if(k==="origin.text") return c.originText;
    if(k==="shipping.skuLine") return `ITEM NO. ${String(a.sku??"")}`;
    if(k==="shipping.contractLine") return `CONTRACT NO. ${String(a.contractNo??"")}`;
    if(k==="shipping.weightLine") return `N.W. ${formatNumber(a.netWeight)} LBS   G.W. ${formatNumber(a.grossWeight)} LBS`;
    if(k==="shipping.packageLine") return `PACKAGE MEAS ${c.packageMeas}`;
    if(k==="shipping.crnLine") return `CRN ${String(f?.crn||"")}`;
    if(k==="shipping.originLine") return c.originText;
    return "";
  }

  function resolvedElementText(element, artwork, factoryList = factories) {
    const binding=String(element?.bindingKey||"");
    return binding ? resolveArtworkBinding(binding,artwork,factoryList) : String(element?.text||"");
  }

  function resolvedElementPayload(element, artwork, factoryList = factories) {
    const binding=String(element?.bindingKey||"");
    return binding ? resolveArtworkBinding(binding,artwork,factoryList) : String(element?.payload||"");
  }

  function sideSealGeometry(artwork) {
    const L = Math.max(1, inchToMm(artwork.length));
    const W = Math.max(1, inchToMm(artwork.width));
    const H = Math.max(1, inchToMm(artwork.height));
    const closingTab = Math.max(20, H * 0.2);

    const totalWidth = L + H * 2;
    const totalHeight = H + W + H + W + closingTab;

    const x = {
      outerLeft: 0,
      mainLeft: H,
      mainRight: H + L,
      outerRight: H + L + H
    };

    const y = {
      top: 0,
      topBandBottom: H,
      bottomPanelBottom: H + W,
      middleBandBottom: H + W + H,
      topPanelBottom: H + W + H + W,
      closingBottom: totalHeight
    };

    return {
      units: "mm",
      L, W, H, closingTab, totalWidth, totalHeight, x, y,
      panels: [
        { id: "TOP_BAND", x: H, y: 0, w: L, h: H, rotation: 0 },
        { id: "BOTTOM_FACE", x: H, y: H, w: L, h: W, rotation: 0 },
        { id: "MIDDLE_BAND", x: H, y: H + W, w: L, h: H, rotation: 180 },
        { id: "TOP_FACE", x: H, y: H + W + H, w: L, h: W, rotation: 0 },
        { id: "CLOSING_TAB", x: H, y: H + W + H + W, w: L, h: closingTab, rotation: 0 },
        { id: "SIDE_LEFT_BOTTOM", x: 0, y: H, w: H, h: W, rotation: -90 },
        { id: "SIDE_RIGHT_BOTTOM", x: H + L, y: H, w: H, h: W, rotation: 90 },
        { id: "SIDE_LEFT_TOP", x: 0, y: H + W + H, w: H, h: W, rotation: -90 },
        { id: "SIDE_RIGHT_TOP", x: H + L, y: H + W + H, w: H, h: W, rotation: 90 }
      ]
    };
  }

  function elementVisualBounds(element) {
    const x=Number(element?.x||0),y=Number(element?.y||0);
    const w=Math.max(0,Number(element?.w||0)),h=Math.max(0,Number(element?.h||0));
    const rotation=Number(element?.rotation||0)*Math.PI/180;
    const cx=x+w/2,cy=y+h/2;
    const halfW=Math.abs(Math.cos(rotation))*w/2+Math.abs(Math.sin(rotation))*h/2;
    const halfH=Math.abs(Math.sin(rotation))*w/2+Math.abs(Math.cos(rotation))*h/2;
    return {
      left:cx-halfW,
      top:cy-halfH,
      right:cx+halfW,
      bottom:cy+halfH,
      width:halfW*2,
      height:halfH*2,
      centerX:cx,
      centerY:cy
    };
  }

  function visualBoundsFitContainer(element, bounds, tolerance = 0.01) {
    const v=elementVisualBounds(element);
    return v.left>=Number(bounds.x||0)-tolerance &&
      v.top>=Number(bounds.y||0)-tolerance &&
      v.right<=Number(bounds.x||0)+Number(bounds.w||0)+tolerance &&
      v.bottom<=Number(bounds.y||0)+Number(bounds.h||0)+tolerance;
  }

  function constrainElementResize(element, bounds, desiredW, desiredH, minSize = 5) {
    const startW=Math.max(minSize,Number(element?.w||minSize));
    const startH=Math.max(minSize,Number(element?.h||minSize));
    const targetW=Math.max(minSize,Number(desiredW||minSize));
    const targetH=Math.max(minSize,Number(desiredH||minSize));
    const candidate=(w,h)=>({...element,w,h});
    if(visualBoundsFitContainer(candidate(targetW,targetH),bounds)){
      return {w:targetW,h:targetH,limited:false};
    }
    if(!visualBoundsFitContainer(candidate(startW,startH),bounds)){
      return {w:startW,h:startH,limited:true};
    }
    let lo=0,hi=1;
    for(let i=0;i<32;i+=1){
      const mid=(lo+hi)/2;
      const w=startW+(targetW-startW)*mid;
      const h=startH+(targetH-startH)*mid;
      if(visualBoundsFitContainer(candidate(w,h),bounds)) lo=mid;
      else hi=mid;
    }
    return {
      w:startW+(targetW-startW)*lo,
      h:startH+(targetH-startH)*lo,
      limited:true
    };
  }

  function calibrationMetrics() {
    const measuredMm = sourceCalibration.reference200mm.measuredMm;
    return {
      reference: {
        targetMm: 200,
        measuredMm,
        deltaMm: measuredMm - 200,
        deltaPct: ((measuredMm - 200) / 200) * 100
      },
      avgRatio: sourceCalibration.structureScale,
      sample: {
        lengthMm: inchToMm(defaultArtwork.length),
        widthMm: inchToMm(defaultArtwork.width),
        heightMm: inchToMm(defaultArtwork.height)
      }
    };
  }

  function codeBlockDimensions(profile) {
    return profile === "200x64"
      ? { w: 200, h: 64 }
      : { w: 250, h: 80 };
  }

  function glyphWidthFactor(ch) {
    if(ch===" "||ch==="\t") return 0.33;
    const code=ch.codePointAt(0)||0;
    if(code>255) return 1.0;
    if(/[A-Z]/.test(ch)) return 0.62;
    if(/[a-z]/.test(ch)) return 0.54;
    if(/[0-9]/.test(ch)) return 0.56;
    if(/[.,:;!'"`|]/.test(ch)) return 0.30;
    return 0.58;
  }

  function measureTextLineMm(line, fontSizePt=12, fontWeight="normal") {
    const fontMm=Math.max(0,Number(fontSizePt||0))/PT_PER_MM;
    const weightFactor=String(fontWeight||"normal")==="bold"?1.05:1;
    return [...String(line??"")].reduce((sum,ch)=>sum+glyphWidthFactor(ch),0)*fontMm*weightFactor;
  }

  function wrapTextLines(text, maxWidthMm, fontSizePt=12, fontWeight="normal") {
    const maxWidth=Math.max(0,Number(maxWidthMm||0));
    const paragraphs=String(text??"").split(/\r?\n/);
    if(!maxWidth) return paragraphs.length?paragraphs:[""];
    const out=[];
    for(const paragraph of paragraphs){
      if(paragraph===""){out.push("");continue;}
      let line="";
      for(const ch of [...paragraph]){
        const candidate=line+ch;
        if(!line||measureTextLineMm(candidate,fontSizePt,fontWeight)<=maxWidth+0.001){
          line=candidate;
          continue;
        }
        const space=Math.max(line.lastIndexOf(" "),line.lastIndexOf("\t"));
        if(space>0){
          const head=line.slice(0,space).trimEnd();
          const tail=line.slice(space+1).trimStart();
          if(head) out.push(head);
          line=tail+ch;
          while(line&&measureTextLineMm(line,fontSizePt,fontWeight)>maxWidth+0.001){
            let chunk="";
            for(const part of [...line]){
              if(chunk&&measureTextLineMm(chunk+part,fontSizePt,fontWeight)>maxWidth+0.001) break;
              chunk+=part;
            }
            if(!chunk) break;
            out.push(chunk);
            line=line.slice([...chunk].length);
          }
        }else{
          out.push(line);
          line=ch;
        }
      }
      out.push(line.trimEnd());
    }
    return out.length?out:[""];
  }

  function textLayout(element, text) {
    const fontSizePt=Math.max(0,Number(element?.fontSizePt||12));
    const fontWeight=String(element?.fontWeight||"normal");
    const boxWidthMm=Math.max(0,Number(element?.w||0));
    const boxHeightMm=Math.max(0,Number(element?.h||0));
    const lineHeight=Math.max(0.8,Math.min(3,Number(element?.lineHeight||1.2)));
    const wrap=Boolean(element?.wrapText);
    const lines=wrap
      ? wrapTextLines(text,boxWidthMm,fontSizePt,fontWeight)
      : String(text??"").split(/\r?\n/);
    const widths=lines.map(line=>measureTextLineMm(line,fontSizePt,fontWeight));
    const fontMm=fontSizePt/PT_PER_MM;
    const lineHeightMm=fontMm*lineHeight;
    const widthMm=widths.length?Math.max(...widths):0;
    const heightMm=Math.max(1,lines.length)*lineHeightMm;
    return {
      lines,
      widthsMm:widths,
      widthMm,
      heightMm,
      lineCount:Math.max(1,lines.length),
      lineHeight,
      lineHeightMm,
      fontSizePt,
      fontWeight,
      wrapText:wrap,
      boxWidthMm,
      boxHeightMm,
      fits:widthMm<=boxWidthMm+0.01&&heightMm<=boxHeightMm+0.01,
      widthOverflowMm:Math.max(0,widthMm-boxWidthMm),
      heightOverflowMm:Math.max(0,heightMm-boxHeightMm)
    };
  }

  function estimateTextBox(text, fontSizePt=12, fontWeight="normal") {
    const lines=String(text??"").split(/\r?\n/);
    const widths=lines.map(line=>measureTextLineMm(line,fontSizePt,fontWeight));
    const fontMm=Math.max(0,Number(fontSizePt||0))/PT_PER_MM;
    return {
      widthMm: widths.length?Math.max(...widths):0,
      heightMm: Math.max(1,lines.length)*fontMm*1.2,
      lineCount: Math.max(1,lines.length),
      fontSizePt:Number(fontSizePt||0)
    };
  }

  function textFitMetrics(element, text) {
    return textLayout(element,text);
  }

  function fitTextToBox(element, text, options={}) {
    const minPt=Math.max(1,Number(options.minPt??element?.minFontSizePt??7));
    const maxPt=Math.max(minPt,Number(options.maxPt??element?.fontSizePt??12));
    const atMax=textFitMetrics({...element,fontSizePt:maxPt},text);
    if(atMax.fits) return {fits:true,fontSizePt:maxPt,metrics:atMax};
    const atMin=textFitMetrics({...element,fontSizePt:minPt},text);
    if(!atMin.fits) return {fits:false,fontSizePt:minPt,metrics:atMin};
    let lo=minPt,hi=maxPt,best={fits:true,fontSizePt:minPt,metrics:atMin};
    for(let i=0;i<28;i+=1){
      const mid=(lo+hi)/2;
      const metrics=textFitMetrics({...element,fontSizePt:mid},text);
      if(metrics.fits){best={fits:true,fontSizePt:mid,metrics};lo=mid;}
      else hi=mid;
    }
    return {...best,fontSizePt:round(best.fontSizePt,2)};
  }

  const controlledBlockDefinitions=Object.freeze({
    SHIPPING_MARK_STANDARD:Object.freeze({
      type:"SHIPPING_MARK_STANDARD",
      currentVersion:"1.1.0",
      supportedVersions:Object.freeze(["1.0.0","1.1.0"]),
      legacyRequiredBindings:Object.freeze([
        "shipping.skuLine","shipping.contractLine","shipping.weightLine",
        "shipping.packageLine","shipping.crnLine","shipping.originLine"
      ]),
      versions:Object.freeze({
        "1.1.0":Object.freeze({
          gapMm:1.5,
          minWidthMm:80,
          maxWidthMm:280,
          insetFloorMm:4,
          paddingYmm:1.2,
          rowMinHeightMm:8.5,
          lineHeight:1.15,
          minFontSizePt:7,
          slots:Object.freeze([
            Object.freeze({id:"ITEM",bindingKey:"shipping.skuLine",name:"Shipping · ITEM NO.",fontSizePt:13}),
            Object.freeze({id:"CONTRACT",bindingKey:"shipping.contractLine",name:"Shipping · CONTRACT NO.",fontSizePt:10.5}),
            Object.freeze({id:"WEIGHT",bindingKey:"shipping.weightLine",name:"Shipping · N.W. / G.W.",fontSizePt:10.5}),
            Object.freeze({id:"MEAS",bindingKey:"shipping.packageLine",name:"Shipping · PACKAGE MEAS",fontSizePt:10.5}),
            Object.freeze({id:"CRN",bindingKey:"shipping.crnLine",name:"Shipping · CRN",fontSizePt:10.5}),
            Object.freeze({id:"ORIGIN",bindingKey:"shipping.originLine",name:"Shipping · ORIGIN",fontSizePt:10.5})
          ])
        })
      })
    })
  });

  function controlledBlockDefinition(type,version=""){
    const root=controlledBlockDefinitions[String(type||"")]||null;
    if(!root) return null;
    const resolvedVersion=String(version||root.currentVersion);
    const config=root.versions?.[resolvedVersion]||null;
    return config?{...config,type:root.type,version:resolvedVersion,currentVersion:root.currentVersion,supportedVersions:[...root.supportedVersions]}:null;
  }

  function shippingMarkBlockLayout(artwork,panel,factoryList=factories,options={}){
    const root=controlledBlockDefinitions.SHIPPING_MARK_STANDARD;
    const version=String(options.version||root.currentVersion);
    const def=controlledBlockDefinition(root.type,version);
    if(!def) return {ok:false,reason:"BLOCK_VERSION_UNSUPPORTED",version};

    const safe=Math.max(0,Number(artwork?.safeMarginMm??22));
    const inset=Math.max(Number(def.insetFloorMm||4),safe);
    const availableW=Math.max(0,Number(panel?.w||0)-inset*2);
    const availableH=Math.max(0,Number(panel?.h||0)-inset*2);
    if(availableW<Number(def.minWidthMm||80)){
      return {ok:false,reason:"BLOCK_PANEL_TOO_NARROW",version,inset,availableW,availableH};
    }

    const blockW=Math.min(Number(def.maxWidthMm||280),availableW);
    const minPt=Number(def.minFontSizePt||7);
    const measure=(scale)=>{
      const slots=[];
      let total=0;
      for(const slot of def.slots){
        const fontSizePt=Math.max(minPt,Number(slot.fontSizePt||10)*scale);
        const text=resolveArtworkBinding(slot.bindingKey,artwork,factoryList);
        const layout=textLayout({
          w:blockW,
          h:100000,
          fontSizePt,
          fontWeight:"normal",
          wrapText:true,
          lineHeight:def.lineHeight
        },text);
        const rowHeightMm=Math.max(
          Number(def.rowMinHeightMm||8.5),
          layout.heightMm+Number(def.paddingYmm||1.2)*2
        );
        slots.push({
          ...slot,
          text,
          fontSizePt,
          lineHeight:Number(def.lineHeight||1.15),
          rowHeightMm,
          lineCount:layout.lineCount,
          textWidthMm:layout.widthMm,
          textHeightMm:layout.heightMm
        });
        total+=rowHeightMm;
      }
      total+=Math.max(0,def.slots.length-1)*Number(def.gapMm||0);
      return {slots,totalH:total};
    };

    let chosen=measure(1);
    let scale=1;
    if(chosen.totalH>availableH+.01){
      const minScale=Math.min(1,Math.min(...def.slots.map(slot=>minPt/Math.max(minPt,Number(slot.fontSizePt||minPt)))));
      const atMin=measure(minScale);
      if(atMin.totalH>availableH+.01){
        return {
          ok:false,reason:"BLOCK_TOO_TALL_AT_MIN_FONT",version,inset,availableW,availableH,
          minimumHeightMm:atMin.totalH,minimumScale:minScale
        };
      }
      let lo=minScale,hi=1,best=atMin;
      for(let i=0;i<28;i+=1){
        const mid=(lo+hi)/2;
        const current=measure(mid);
        if(current.totalH<=availableH+.01){lo=mid;best=current;scale=mid;}
        else hi=mid;
      }
      chosen=best;
    }

    const x=Number(panel.x||0)+inset+(availableW-blockW)/2;
    const y=Number(panel.y||0)+inset;
    let cursorY=y;
    const slots=chosen.slots.map(slot=>{
      const placed={
        ...slot,
        x,
        y:cursorY,
        w:blockW,
        h:slot.rowHeightMm
      };
      cursorY+=slot.rowHeightMm+Number(def.gapMm||0);
      return placed;
    });
    return {
      ok:true,
      type:root.type,
      version,
      panelId:String(panel?.id||""),
      inset,
      availableW,
      availableH,
      blockW,
      totalH:chosen.totalH,
      x,
      y,
      scale,
      slots
    };
  }

  function validateShippingMarkBlock(items){
    const list=Array.isArray(items)?items.filter(Boolean):[];
    const root=controlledBlockDefinitions.SHIPPING_MARK_STANDARD;
    if(!list.length) return {ok:false,reason:"BLOCK_EMPTY",version:"",missing:[...root.legacyRequiredBindings]};
    const versions=new Set(list.map(x=>String(x.blockVersion||"")));
    const version=versions.size===1?[...versions][0]:"";
    const versionSupported=versions.size===1&&root.supportedVersions.includes(version);
    const bindings=list.map(x=>String(x.bindingKey||""));
    const bindingSet=new Set(bindings);
    const missing=root.legacyRequiredBindings.filter(k=>!bindingSet.has(k));
    const duplicates=[...bindingSet].filter(k=>k&&bindings.filter(x=>x===k).length>1);
    const groupIds=new Set(list.map(x=>String(x.groupId||"")));
    const panels=new Set(list.map(x=>String(x.panelId||"")));
    const typeOk=list.every(x=>String(x.type||"")==="text");
    const visibleOk=list.every(x=>x.visible!==false);

    let slotsOk=true,wrongSlots=[];
    if(version==="1.1.0"){
      const def=controlledBlockDefinition(root.type,version);
      const expected=new Map(def.slots.map(s=>[s.id,s.bindingKey]));
      const seen=new Set();
      wrongSlots=list.flatMap(item=>{
        const slot=String(item.blockSlot||"");
        const binding=String(item.bindingKey||"");
        if(!expected.has(slot)||expected.get(slot)!==binding||seen.has(slot)){
          return [{slot,binding,id:String(item.id||"")}];
        }
        seen.add(slot);return [];
      });
      for(const slot of expected.keys()) if(!seen.has(slot)) wrongSlots.push({slot,binding:expected.get(slot),id:""});
      slotsOk=wrongSlots.length===0;
    }

    const ok=versionSupported&&!missing.length&&!duplicates.length&&groupIds.size===1&&panels.size===1&&typeOk&&visibleOk&&slotsOk;
    return {
      ok,version,versionSupported,missing,duplicates,wrongSlots,
      groupOk:groupIds.size===1,panelOk:panels.size===1,typeOk,visibleOk,
      groupId:[...groupIds][0]||"",panelId:[...panels][0]||""
    };
  }

  function createShippingMarkBlockElements(artwork,panel,factoryList=factories,options={}) {
    const root=controlledBlockDefinitions.SHIPPING_MARK_STANDARD;
    const version=String(options.version||root.currentVersion);
    const layout=shippingMarkBlockLayout(artwork,panel,factoryList,{version});
    if(!layout.ok) return {...layout,elements:[]};

    const idFactory=typeof options.idFactory==="function"
      ? options.idFactory
      : ((slot,index)=>`shipping-${slot.id.toLowerCase()}-${index+1}`);
    const groupId=String(options.groupId||`shipping-mark-${String(panel?.id||"panel").toLowerCase()}`);
    const locked=options.locked!==false;
    const elements=layout.slots.map((slot,index)=>({
      id:String(idFactory(slot,index)||`shipping-${index+1}`),
      type:"text",
      name:slot.name,
      x:slot.x,
      y:slot.y,
      w:slot.w,
      h:slot.h,
      rotation:0,
      locked,
      visible:true,
      panelId:String(panel?.id||""),
      constrainToPanel:true,
      safeAreaExempt:false,
      groupId,
      text:"",
      bindingKey:slot.bindingKey,
      fontSizePt:slot.fontSizePt,
      fontWeight:"normal",
      textAlign:"left",
      wrapText:true,
      lineHeight:slot.lineHeight,
      autoFitText:false,
      minFontSizePt:Number(controlledBlockDefinition(root.type,version)?.minFontSizePt||7),
      symbology:"",
      humanReadable:false,
      symbolKey:"",
      payload:"",
      ecc:"M",
      sourceType:"controlled-shipping-block",
      mimeType:"",
      dataUrl:"",
      pixelWidth:0,
      pixelHeight:0,
      blockType:root.type,
      blockVersion:version,
      blockSlot:slot.id
    }));
    return {...layout,ok:true,groupId,elements};
  }

  function effectiveImageDpi(element) {
    const vector=Boolean(element?.vectorDataUrl)||String(element?.sourceType||"")==="uploaded-vector";
    if(vector) return {isVector:true,xDpi:null,yDpi:null,minDpi:null};
    const wMm=Math.max(0,Number(element?.w||0));
    const hMm=Math.max(0,Number(element?.h||0));
    const pxW=Math.max(0,Number(element?.pixelWidth||0));
    const pxH=Math.max(0,Number(element?.pixelHeight||0));
    if(!wMm||!hMm||!pxW||!pxH) return {isVector:false,xDpi:0,yDpi:0,minDpi:0};
    const xDpi=pxW/(wMm/25.4);
    const yDpi=pxH/(hMm/25.4);
    return {isVector:false,xDpi,yDpi,minDpi:Math.min(xDpi,yDpi)};
  }

  function productionElementQualification(element) {
    const type=String(element?.type||"");
    if(type==="text"){
      if(String(element?.fontWeight||"normal")==="bold"){
        return {qualified:false,mode:"BLOCKED",reason:"CUSTOM_BOLD_FONT_NOT_QUALIFIED"};
      }
      return {qualified:true,mode:"EMBEDDED_VECTOR_TEXT"};
    }
    if(type==="barcode") return {qualified:true,mode:"VECTOR_BARCODE"};
    if(type==="qr-generated") return {qualified:true,mode:"VECTOR_QR"};
    if(type==="image"){
      const sourceMime=String(element?.sourceMimeType||element?.mimeType||"").toLowerCase();
      const vector=Boolean(element?.vectorDataUrl)&&sourceMime==="image/svg+xml";
      if(vector){
        return {qualified:true,mode:"CONTROLLED_K_ONLY_SVG",requiresServerVectorValidation:true};
      }
      const dpi=effectiveImageDpi(element);
      if(!dpi.isVector&&Number(dpi.minDpi||0)<150){
        return {qualified:false,mode:"BLOCKED",reason:"RASTER_GRAPHIC_BELOW_MINIMUM_PPI"};
      }
      if(!dpi.isVector&&Number(dpi.minDpi||0)<300){
        return {qualified:false,mode:"BLOCKED",reason:"RASTER_GRAPHIC_BELOW_PRODUCTION_PPI"};
      }
      return {qualified:false,mode:"BLOCKED",reason:"RASTER_GRAPHIC_COLOR_PIPELINE_NOT_QUALIFIED"};
    }
    if(type==="qr-image"){
      return {qualified:false,mode:"BLOCKED",reason:"UPLOADED_QR_NOT_CONTROLLED_PRODUCTION_ASSET"};
    }
    if(type==="symbol-image"){
      return {qualified:false,mode:"BLOCKED",reason:"UPLOADED_SYMBOL_NOT_APPROVED_MASTER"};
    }
    return {qualified:false,mode:"BLOCKED",reason:"CUSTOM_ELEMENT_TYPE_NOT_PRODUCTION_QUALIFIED"};
  }

  function check(id, title, status, detail, category, blocking = false) {
    return { id, title, status, detail, category, blocking };
  }

  function runPreflight(artwork, factoryList = factories) {
    const a = artwork;
    const f = findFactory(a.factoryId, factoryList);
    const c = computed(a, factoryList);
    const g = sideSealGeometry(a);
    const calib = calibrationMetrics();

    const required = [
      ["SKU", a.sku],
      ["Contract No.", a.contractNo],
      ["Factory", a.factoryId],
      ["Barcode", a.barcode],
      ["QR", a.qr]
    ];

    const missing = required
      .filter(([, v]) => !String(v ?? "").trim())
      .map(([k]) => k);

    const data = [
      check(
        "required",
        "Required data complete",
        missing.length ? "error" : "pass",
        missing.length ? `Missing: ${missing.join(", ")}` : "All required production fields are complete.",
        "Data",
        true
      ),
      check(
        "weight",
        "G.W. >= N.W.",
        Number(a.grossWeight) < Number(a.netWeight) ? "error" : "pass",
        Number(a.grossWeight) < Number(a.netWeight)
          ? "Gross weight must be greater than or equal to net weight."
          : `G.W. ${formatNumber(a.grossWeight)} LBS / N.W. ${formatNumber(a.netWeight)} LBS`,
        "Data",
        true
      )
    ];

    const pkgInvalid =
      Number(a.packageCount) < 1 ||
      Number(a.currentPackage) < 1 ||
      Number(a.currentPackage) > Number(a.packageCount);

    data.push(check(
      "package",
      "Package index valid",
      pkgInvalid ? "error" : "pass",
      pkgInvalid ? "Current package must be within 1..Package Count." : `Package ${a.currentPackage} of ${a.packageCount}`,
      "Data",
      true
    ));

    data.push(check(
      "factory",
      "Factory master data",
      f && f.crn ? "pass" : "error",
      f ? `${f.name} · CRN ${f.crn}` : "Select a valid production factory.",
      "Data",
      true
    ));

    const codeSize = codeBlockDimensions(a.codeBlockProfile);
    const safeMargin = Number(a.safeMarginMm ?? 22);
    const safeMarginValid=Number.isFinite(safeMargin)&&safeMargin>=0&&safeMargin<=100;
    const effectiveSafeMargin=safeMarginValid?safeMargin:22;
    const availableW = Math.max(0, g.L - effectiveSafeMargin * 2);
    const availableH = Math.max(0, g.W - effectiveSafeMargin * 2);
    const codeFits = codeSize.w <= availableW && codeSize.h <= availableH;

    const paperThickness=Number(a.paperThicknessMm??1.5);
    const paperThicknessValid=Number.isFinite(paperThickness)&&paperThickness>=0.2&&paperThickness<=10;
    const bleed=Number(a.bleedMm??3);
    const bleedValid=Number.isFinite(bleed)&&bleed>=0&&bleed<=20;
    const structureType=String(a.boxType||"US_SIDE_SEAL");

    const layout = [
      check("box-structure-type","Box structure family",structureType==="US_SIDE_SEAL"?"pass":"error",
        structureType==="US_SIDE_SEAL"?"US_SIDE_SEAL is the currently qualified parametric geometry.":"This box structure family is not yet qualified for production geometry.",
        "Layout",true),
      check("paper-thickness","Paper / board thickness",paperThicknessValid?"pass":"error",
        paperThicknessValid?`${round(paperThickness,2)} mm · design metadata and 3D preview.`:"Thickness must be between 0.2 and 10 mm.",
        "Layout",true),
      check("bleed-config","Bleed configuration",bleedValid?"pass":"error",
        bleedValid?`${round(bleed,2)} mm technical bleed preview.`:"Bleed must be between 0 and 20 mm.",
        "Layout",true),
      check("safe-margin-config","Safe margin configuration",safeMarginValid?"pass":"error",
        safeMarginValid?`${round(safeMargin,2)} mm panel inset.`:"Safe margin must be between 0 and 100 mm.",
        "Layout",true),
      check("geometry", "Geometry derived from package dimensions", "pass",
        `${round(g.L)}×${round(g.W)}×${round(g.H)} mm canonical carton model.`, "Layout"),
      check("safe", "CodeBlock within safe area", codeFits ? "pass" : "error",
        codeFits
          ? `${codeSize.w}×${codeSize.h} mm fits available ${round(availableW)}×${round(availableH)} mm.`
          : `${codeSize.w}×${codeSize.h} mm exceeds available ${round(availableW)}×${round(availableH)} mm.`,
        "Layout", true),
      check("sync", "CRN synchronized in 2 placements", f?.crn ? "pass" : "error",
        f?.crn ? `Both placements bind to factory.crn = ${c.crn}` : "No CRN available.", "Layout", true),
      check("rotation", "Panel rotations", "pass",
        "Artwork rotations are driven by panel geometry, not manual business-user edits.", "Layout"),
      check("source-ref", "Source PDF 200 mm calibration",
        Math.abs(calib.reference.deltaPct) < 1 ? "pass" : "warning",
        `Vector marker measures ${round(calib.reference.measuredMm)} mm (Δ ${round(calib.reference.deltaPct, 2)}%).`,
        "Layout"),
      check("source-scale", "Source sheet structural scale", "warning",
        `Source sheet structure is ~${round(calib.avgRatio * 100, 2)}% of sample carton; production geometry uses canonical dimensions.`,
        "Layout")
    ];

    const codes = [
      check("code-profile", "CodeBlock approved size",
        ["250x80", "200x64"].includes(a.codeBlockProfile) ? "pass" : "error",
        a.codeBlockProfile === "200x64" ? "200×64 mm approved reduced profile." : "250×80 mm approved profile.",
        "Codes", true),
      check("barcode", "Barcode present",
        a.barcode?.trim() ? "pass" : "error",
        a.barcode?.trim() ? `Payload: ${a.barcode}` : "Barcode payload is empty.",
        "Codes", true),
      check("qr", "QR present",
        a.qr?.trim() ? "pass" : "error",
        a.qr?.trim() ? "QR payload is present." : "QR payload is empty.",
        "Codes", true),
      check("decode", "Digital barcode decode", "warning",
        "Digital preflight only. Physical print grade requires a verifier.",
        "Codes")
    ];

    const customElements=Array.isArray(a.elements)?a.elements:[];
    const assetChecks=[];
    for(const element of customElements){
      const name=element.name||element.type||"element";
      const x=Number(element.x||0),y=Number(element.y||0),w=Number(element.w||0),h=Number(element.h||0);
      const visual=elementVisualBounds(element);
      const visible=element.visible!==false;
      if(!visible){
        assetChecks.push(check(
          `asset-hidden-${element.id||name}`,
          `${name} is hidden`,
          "warning",
          "Hidden custom elements are excluded from preview/proof output.",
          "Assets"
        ));
        continue;
      }
      const within=w>0&&h>0&&visual.left>=0&&visual.top>=0&&visual.right<=g.totalWidth&&visual.bottom<=g.totalHeight;
      assetChecks.push(check(
        `asset-bounds-${element.id||name}`,
        `${name} within artwork bounds`,
        within?"pass":"error",
        within?`Visual bounds ${round(visual.width)}×${round(visual.height)} mm at ${round(visual.left)},${round(visual.top)} mm.`:"Rotated element extends outside the carton artwork bounds.",
        "Assets",
        true
      ));
      const panel=g.panels.find((p)=>p.id===String(element.panelId||""));
      assetChecks.push(check(
        `asset-panel-${element.id||name}`,
        `${name} panel assignment`,
        panel?"pass":"error",
        panel?`Assigned to ${panel.id}.`:"Element has no valid carton panel assignment.",
        "Assets",
        true
      ));
      if(panel&&element.constrainToPanel!==false){
        const inPanel=visual.left>=panel.x&&visual.top>=panel.y&&visual.right<=panel.x+panel.w&&visual.bottom<=panel.y+panel.h;
        assetChecks.push(check(
          `asset-panel-bounds-${element.id||name}`,
          `${name} inside ${panel.id}`,
          inPanel?"pass":"error",
          inPanel?"Element stays inside its assigned carton panel.":"Element crosses the assigned panel boundary/fold line.",
          "Assets",
          true
        ));
        if(!element.safeAreaExempt&&safeMarginValid){
          const usableW=panel.w-safeMargin*2,usableH=panel.h-safeMargin*2;
          const inSafe=usableW>=0&&usableH>=0&&
            visual.left>=panel.x+safeMargin&&visual.top>=panel.y+safeMargin&&
            visual.right<=panel.x+panel.w-safeMargin&&visual.bottom<=panel.y+panel.h-safeMargin;
          assetChecks.push(check(
            `asset-safe-area-${element.id||name}`,
            `${name} inside ${panel.id} safe area`,
            inSafe?"pass":"error",
            inSafe
              ? `Element clears the configured ${round(safeMargin,2)} mm safe margin.`
              : `Element enters the configured ${round(safeMargin,2)} mm panel safety inset. Mark an explicit safe-area exemption only for intentional edge/bleed artwork.`,
            "Assets",
            true
          ));
        }
      }
      if(element.type==="text"){
        const binding=String(element.bindingKey||"");
        const known=!binding||isKnownArtworkBinding(binding);
        const text=resolvedElementText(element,a,factoryList);
        const size=Number(element.fontSizePt||0);
        if(binding){
          assetChecks.push(check(
            `text-binding-${element.id||name}`,
            `${name} data binding`,
            known?"pass":"error",
            known?`Bound to ${binding}.`:`Unknown binding key: ${binding}`,
            "Assets",
            !known
          ));
        }
        assetChecks.push(check(
          `text-content-${element.id||name}`,
          `${name} text content`,
          text.trim()?"pass":"error",
          text.trim()?`${text.length} characters.`:"Text element is empty.",
          "Assets",
          true
        ));
        assetChecks.push(check(
          `text-size-${element.id||name}`,
          `${name} font size`,
          size>=Number(element.minFontSizePt||7)?"pass":"warning",
          `${round(size,1)} pt. Minimum configured size is ${round(Number(element.minFontSizePt||7),1)} pt.`,
          "Assets"
        ));
        const fit=textFitMetrics(element,text);
        assetChecks.push(check(
          `text-overflow-${element.id||name}`,
          `${name} text fits its box`,
          fit.fits?"pass":"error",
          fit.fits
            ? `Estimated text ${round(fit.widthMm,1)}×${round(fit.heightMm,1)} mm fits ${round(fit.boxWidthMm,1)}×${round(fit.boxHeightMm,1)} mm.`
            : `Estimated text requires ${round(fit.widthMm,1)}×${round(fit.heightMm,1)} mm but box is ${round(fit.boxWidthMm,1)}×${round(fit.boxHeightMm,1)} mm.`,
          "Assets",
          !fit.fits
        ));
      }
      if(element.type==="barcode"){
        const supported=["CODE128B","ITF14","GS1_128"].includes(String(element.symbology||"").toUpperCase());
        assetChecks.push(check(
          `barcode-type-${element.id||name}`,
          `${name} barcode symbology`,
          supported?"pass":"error",
          supported?`Symbology: ${String(element.symbology).toUpperCase()}.`:"Unsupported custom barcode symbology.",
          "Assets",
          true
        ));
        assetChecks.push(check(
          `barcode-data-${element.id||name}`,
          `${name} barcode data`,
          resolvedElementPayload(element,a,factoryList).trim()?"pass":"error",
          resolvedElementPayload(element,a,factoryList).trim()?`Payload: ${resolvedElementPayload(element,a,factoryList)}`:"Barcode payload is empty.",
          "Assets",
          true
        ));

        const sym=String(element.symbology||"").toUpperCase();
        if(sym==="ITF14"){
          const x=Number(element.moduleMm||1.016);
          const height=Number(element.barHeightMm||32);
          const quiet=Number(element.quietModules||10);
          const ratio=Number(element.wideRatio||2.5);
          const bearer=element.bearerBars!==false;
          assetChecks.push(check(
            `barcode-itf-x-${element.id||name}`,
            `${name} ITF-14 X-dimension`,
            x>0?"pass":"error",
            `${round(x,3)} mm narrow element. Application-specific X-dimension; general-distribution review target is 1.016 mm.`,
            "Assets",
            x<=0
          ));
          assetChecks.push(check(
            `barcode-itf-height-${element.id||name}`,
            `${name} ITF-14 bar height`,
            height>=32?"pass":"error",
            `${round(height,2)} mm; review minimum is 32 mm.`,
            "Assets",
            height<32
          ));
          assetChecks.push(check(
            `barcode-itf-ratio-${element.id||name}`,
            `${name} ITF-14 wide:narrow ratio`,
            ratio>=2.25&&ratio<=3?"pass":"error",
            `${round(ratio,2)}:1; GS1 range is 2.25:1–3.0:1.`,
            "Assets",
            !(ratio>=2.25&&ratio<=3)
          ));
          assetChecks.push(check(
            `barcode-itf-quiet-${element.id||name}`,
            `${name} ITF-14 Quiet Zone`,
            quiet>=10?"pass":"error",
            `${round(quiet,1)}X on each side; minimum is 10X.`,
            "Assets",
            quiet<10
          ));
          assetChecks.push(check(
            `barcode-itf-bearer-${element.id||name}`,
            `${name} ITF-14 bearer bars`,
            bearer?"pass":"warning",
            bearer?"Top/bottom bearer bars enabled.":"Bearer bars disabled; print reliability may be reduced.",
            "Assets"
          ));
        }
        if(sym==="GS1_128"){
          const x=Number(element.moduleMm||0.495);
          const height=Number(element.barHeightMm||31.75);
          const quiet=Number(element.quietModules||10);
          const xOk=x>=0.495&&x<=0.94;
          assetChecks.push(check(
            `barcode-gs1128-x-${element.id||name}`,
            `${name} GS1-128 X-dimension`,
            xOk?"pass":"error",
            `${round(x,3)} mm; logistics review profile range is 0.495–0.940 mm.`,
            "Assets",
            !xOk
          ));
          assetChecks.push(check(
            `barcode-gs1128-height-${element.id||name}`,
            `${name} GS1-128 bar height`,
            height>=31.75?"pass":"error",
            `${round(height,2)} mm; logistics review profile minimum is 31.75 mm.`,
            "Assets",
            height<31.75
          ));
          assetChecks.push(check(
            `barcode-gs1128-quiet-${element.id||name}`,
            `${name} GS1-128 Quiet Zone`,
            quiet>=10?"pass":"error",
            `${round(quiet,1)}X on each side; review minimum is 10X.`,
            "Assets",
            quiet<10
          ));
        }
      }
      if(element.type==="symbol"){
        assetChecks.push(check(
          `symbol-master-${element.id||name}`,
          `${name} handling symbol master`,
          String(element.symbolKey||"").trim()?"warning":"error",
          String(element.symbolKey||"").trim()
            ? `Built-in review symbol ${element.symbolKey}; production must bind to an approved controlled symbol master.`
            : "Handling symbol key is missing.",
          "Assets",
          !String(element.symbolKey||"").trim()
        ));
      }
      if(element.type==="qr-generated"){
        const size=Math.min(w,h);
        assetChecks.push(check(
          `qr-generated-${element.id||name}`,
          "Generated QR vector source",
          resolvedElementPayload(element,a,factoryList).trim()?"pass":"error",
          resolvedElementPayload(element,a,factoryList).trim()
            ? `ECC ${String(element.ecc||"M").toUpperCase()} · ${round(size)} mm · vector matrix with quiet zone.`
            : "Generated QR payload is empty.",
          "Assets",
          true
        ));
        if(size<25){
          assetChecks.push(check(
            `qr-size-${element.id||name}`,
            "Custom QR physical size",
            "warning",
            `${round(size)} mm is below the internal 25 mm review threshold; verify scan performance on the real print process.`,
            "Assets"
          ));
        }
      }
      if(element.type==="qr-image"){
        const decoded=String(element.decodedValue||"").trim();
        const expected=String(element.expectedPayload||"").trim();
        const decodeStatus=String(element.decodeStatus||"").toUpperCase();
        assetChecks.push(check(
          `qr-upload-${element.id||name}`,
          "Uploaded QR digital decode",
          decoded&&decodeStatus==="PASS"?"pass":"warning",
          decoded&&decodeStatus==="PASS"
            ? `Decoded payload: ${decoded}`
            : decodeStatus==="UNAVAILABLE"
              ? "Browser BarcodeDetector is unavailable; uploaded QR content remains digitally unverified."
              : "Uploaded QR has not passed browser-side digital decode. Generated QR is preferred for controlled production.",
          "Assets"
        ));
        if(expected){
          const matches=decoded&&decoded===expected;
          assetChecks.push(check(
            `qr-upload-match-${element.id||name}`,
            "Uploaded QR expected payload",
            matches?"pass":"error",
            matches?"Decoded QR matches the expected payload.":decoded?`Expected "${expected}" but decoded "${decoded}".`:"Expected payload is set but no decoded value is available.",
            "Assets",
            true
          ));
        }
      }
      if(element.type==="symbol-image"){
        assetChecks.push(check(
          `symbol-upload-${element.id||name}`,
          `${name} custom symbol asset`,
          "warning",
          "Uploaded custom symbol is a review asset. Production must bind it to an approved customer/factory Symbol Master.",
          "Assets"
        ));
      }
      if(element.type==="image"||element.type==="qr-image"||element.type==="symbol-image"){
        const dpi=effectiveImageDpi(element);
        if(dpi.isVector){
          assetChecks.push(check(
            `asset-vector-source-${element.id||name}`,
            `${name} vector source preserved`,
            "pass",
            "SVG source is preserved as vector data. Authoritative Production re-validates a restricted K-only SVG subset server-side before converting it to native PDF vector operators.",
            "Assets"
          ));
        }else{
          const ppi=Number(dpi.minDpi||0);
          const status=ppi>=300?"pass":ppi>=150?"warning":"error";
          assetChecks.push(check(
            `asset-resolution-${element.id||name}`,
            `${name} effective raster resolution`,
            status,
            ppi>0
              ? `${round(ppi)} PPI at placed size ${round(w)}×${round(h)} mm. ≥300 PPI target; 150–299 PPI review warning; <150 PPI blocks.`
              : "Raster pixel dimensions or placed size are invalid; print resolution cannot be verified.",
            "Assets",
            status==="error"
          ));
        }
      }
    }

    const shippingGroups=new Map();
    for(const element of customElements){
      if(element?.visible===false||String(element?.blockType||"")!=="SHIPPING_MARK_STANDARD") continue;
      const key=String(element.groupId||element.id||"shipping");
      if(!shippingGroups.has(key)) shippingGroups.set(key,[]);
      shippingGroups.get(key).push(element);
    }
    for(const [groupId,items] of shippingGroups){
      const validation=validateShippingMarkBlock(items);
      assetChecks.push(check(
        `shipping-block-${groupId}`,
        "Standard Shipping Mark Block",
        validation.ok?"pass":"error",
        validation.ok
          ? `SHIPPING_MARK_STANDARD ${validation.version} · ${items.length} controlled text slots.`
          : `Controlled block invalid. Version: ${validation.version||"mixed/empty"}; missing: ${validation.missing.join(", ")||"none"}; duplicates: ${validation.duplicates.join(", ")||"none"}; slot errors: ${validation.wrongSlots.length}; groupOk=${validation.groupOk}; panelOk=${validation.panelOk}.`,
        "Assets",
        !validation.ok
      ));

      if(validation.version==="1.1.0"&&validation.panelOk){
        const panel=g.panels.find(p=>p.id===validation.panelId);
        const expected=panel?shippingMarkBlockLayout(a,panel,factoryList,{version:"1.1.0"}):{ok:false,reason:"BLOCK_PANEL_INVALID"};
        if(!expected.ok){
          assetChecks.push(check(
            `shipping-block-layout-${groupId}`,
            "Shipping Mark Block layout",
            "error",
            `Block cannot be laid out in ${validation.panelId||"assigned panel"}: ${expected.reason||"UNKNOWN"}.`,
            "Assets",
            true
          ));
        }else{
          const bySlot=new Map(items.map(x=>[String(x.blockSlot||""),x]));
          const drift=[];
          for(const slot of expected.slots){
            const item=bySlot.get(slot.id);
            if(!item) continue;
            const fields=[
              ["x",slot.x,.25],["y",slot.y,.25],["w",slot.w,.25],["h",slot.h,.25],
              ["fontSizePt",slot.fontSizePt,.15],["lineHeight",slot.lineHeight,.02]
            ];
            for(const [field,value,tolerance] of fields){
              if(Math.abs(Number(item[field]||0)-Number(value||0))>tolerance) drift.push(`${slot.id}.${field}`);
            }
            if(!item.wrapText||item.autoFitText||Number(item.rotation||0)!==0) drift.push(`${slot.id}.mode`);
          }
          assetChecks.push(check(
            `shipping-block-layout-${groupId}`,
            "Shipping Mark Block layout",
            drift.length?"error":"pass",
            drift.length
              ? `Controlled 1.1.0 layout drift detected: ${drift.join(", ")}. Reflow the whole block from canonical data.`
              : `Canonical 1.1.0 reflow matches ${validation.panelId}; block height ${round(expected.totalH,1)} mm at scale ${round(expected.scale*100,1)}%.`,
            "Assets",
            Boolean(drift.length)
          ));
        }

        const allLocked=items.every(x=>Boolean(x.locked));
        assetChecks.push(check(
          `shipping-block-lock-${groupId}`,
          "Shipping Mark Block locked",
          allLocked?"pass":"error",
          allLocked?"All controlled slots are locked as one unit.":"Version 1.1.0 must be locked as a whole before review/production.",
          "Assets",
          !allLocked
        ));
      }
    }

    const print = [
      check("k-only", "K-only print profile", "pass",
        "US_SIDE_SEAL_K_ONLY_V1 · single black production profile.", "Print"),
      check("dieline", "Dieline export layer", "pass",
        "Proof can include technical layers; Production excludes review-only overlays.", "Print"),
      check("font", "Font registry", "warning",
        "Local preview uses system sans / PDF core font. Authoritative Production PDF uses the server-side pinned approved TrueType asset when FONT_POLICY is ready; outlining remains unsupported.", "Print")
    ];

    return { Data: data, Layout: layout, Codes: codes, Assets: assetChecks, Print: print };
  }

  function preflightSummary(groups) {
    const all = Object.values(groups).flat();
    return {
      pass: all.filter((x) => x.status === "pass").length,
      warning: all.filter((x) => x.status === "warning").length,
      error: all.filter((x) => x.status === "error").length,
      blocking: all.filter((x) => x.status === "error" && x.blocking).length,
      total: all.length
    };
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }

  function fnv1a32(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  function artworkFromCanonical(snapshot, metadata = {}) {
    const s = snapshot || {};
    const p = s.package || {};
    const codes = s.codes || {};
    const tpl = s.template || {};
    const aw = s.artwork || {};
    const structure = s.structure || {};
    return {
      ...defaultArtwork,
      sku: s.product?.sku ?? metadata.sku ?? defaultArtwork.sku,
      contractNo: s.order?.contractNo ?? metadata.contractNo ?? defaultArtwork.contractNo,
      market: s.order?.market ?? defaultArtwork.market,
      packageCount: Number(p.total ?? metadata.packageCount ?? defaultArtwork.packageCount),
      currentPackage: Number(p.index ?? metadata.currentPackage ?? defaultArtwork.currentPackage),
      netWeight: Number(p.netWeight ?? defaultArtwork.netWeight),
      grossWeight: Number(p.grossWeight ?? defaultArtwork.grossWeight),
      length: Number(p.length ?? defaultArtwork.length),
      width: Number(p.width ?? defaultArtwork.width),
      height: Number(p.height ?? defaultArtwork.height),
      factoryId: s.factory?.id ?? metadata.factoryId ?? defaultArtwork.factoryId,
      barcode: codes.barcode ?? defaultArtwork.barcode,
      qr: codes.qr ?? defaultArtwork.qr,
      codeBlockProfile: codes.profile ?? defaultArtwork.codeBlockProfile,
      templateCode: tpl.code ?? metadata.templateCode ?? defaultArtwork.templateCode,
      templateVersion: tpl.version ?? defaultArtwork.templateVersion,
      revision: metadata.revision ?? aw.revision ?? defaultArtwork.revision,
      status: String(metadata.status ?? aw.status ?? defaultArtwork.status).toLowerCase(),
      safeMarginMm: Number(aw.safeMarginMm ?? defaultArtwork.safeMarginMm),
      boxType: String(structure.boxType ?? defaultArtwork.boxType),
      materialId: String(structure.materialId ?? defaultArtwork.materialId),
      paperThicknessMm: Number(structure.paperThicknessMm ?? defaultArtwork.paperThicknessMm),
      bleedMm: Number(structure.bleedMm ?? defaultArtwork.bleedMm),
      dimensionMode: String(structure.dimensionMode ?? defaultArtwork.dimensionMode),
      elements: Array.isArray(aw.elements) ? aw.elements.map((e)=>({
        id:String(e.id||""),
        type:String(e.type||"image"),
        name:String(e.name||""),
        x:Number(e.x||0),
        y:Number(e.y||0),
        w:Number(e.w||0),
        h:Number(e.h||0),
        rotation:Number(e.rotation||0),
        locked:Boolean(e.locked),
        visible:e.visible!==false,
        panelId:String(e.panelId||"TOP_FACE"),
        constrainToPanel:e.constrainToPanel!==false,
        text:String(e.text||""),
        fontSizePt:Number(e.fontSizePt||12),
        fontWeight:["normal","bold"].includes(String(e.fontWeight||"normal"))?String(e.fontWeight||"normal"):"normal",
        textAlign:["left","center","right"].includes(String(e.textAlign||"left"))?String(e.textAlign||"left"):"left",
        wrapText:Boolean(e.wrapText),
        lineHeight:Math.max(0.8,Math.min(3,Number(e.lineHeight||1.2))),
        bindingKey:String(e.bindingKey||""),
        symbology:String(e.symbology||""),
        humanReadable:e.humanReadable!==false,
        moduleMm:Number(e.moduleMm||0),
        barHeightMm:Number(e.barHeightMm||0),
        quietModules:Number(e.quietModules||0),
        wideRatio:Number(e.wideRatio||0),
        bearerBars:e.bearerBars!==false,
        bearerBarThicknessMm:Number(e.bearerBarThicknessMm||0),
        symbolKey:String(e.symbolKey||""),
        payload:String(e.payload||""),
        ecc:["L","M","Q","H"].includes(String(e.ecc||"M").toUpperCase())?String(e.ecc||"M").toUpperCase():"M",
        sourceType:String(e.sourceType||""),
        mimeType:String(e.mimeType||""),
        dataUrl:String(e.dataUrl||""),
        pixelWidth:Number(e.pixelWidth||0),
        pixelHeight:Number(e.pixelHeight||0),
        sourcePixelWidth:Number(e.sourcePixelWidth||0),
        sourcePixelHeight:Number(e.sourcePixelHeight||0),
        sourceMimeType:String(e.sourceMimeType||e.mimeType||""),
        originalFileName:String(e.originalFileName||""),
        vectorDataUrl:String(e.vectorDataUrl||""),
        assetRole:String(e.assetRole||""),
        expectedPayload:String(e.expectedPayload||""),
        decodedValue:String(e.decodedValue||""),
        decodeStatus:String(e.decodeStatus||""),
        verifiedAt:String(e.verifiedAt||""),
        groupId:String(e.groupId||""),
        safeAreaExempt:Boolean(e.safeAreaExempt),
        autoFitText:Boolean(e.autoFitText),
        minFontSizePt:Number(e.minFontSizePt||7),
        blockType:String(e.blockType||""),
        blockVersion:String(e.blockVersion||""),
        blockSlot:String(e.blockSlot||"")
      })) : []
    };
  }

  function manifest(artwork, rendererVersion = "vector-svg-pdf-0.5.0") {
    const snapshot = canonicalData(artwork);
    const payload = stableStringify({ snapshot, rendererVersion });
    return {
      templateCode: artwork.templateCode,
      templateVersion: artwork.templateVersion,
      revision: artwork.revision,
      rendererVersion,
      generatedAt: new Date().toISOString(),
      prototypeSignature: `fnv1a32:${fnv1a32(payload)}`,
      note: "Browser bundle uses SHA-256 when crypto.subtle is available."
    };
  }

  return {
    INCH_TO_MM,
    PT_PER_MM,
    factories,
    defaultArtwork,
    sourceCalibration,
    findFactory,
    inchToMm,
    mmToPt,
    formatNumber,
    canonicalData,
    computed,
    artworkBindings,
    isKnownArtworkBinding,
    resolveArtworkBinding,
    resolvedElementText,
    resolvedElementPayload,
    artworkFromCanonical,
    sideSealGeometry,
    elementVisualBounds,
    visualBoundsFitContainer,
    constrainElementResize,
    calibrationMetrics,
    codeBlockDimensions,
    measureTextLineMm,
    wrapTextLines,
    textLayout,
    estimateTextBox,
    textFitMetrics,
    fitTextToBox,
    controlledBlockDefinitions,
    controlledBlockDefinition,
    shippingMarkBlockLayout,
    validateShippingMarkBlock,
    createShippingMarkBlockElements,
    effectiveImageDpi,
    productionElementQualification,
    runPreflight,
    preflightSummary,
    stableStringify,
    fnv1a32,
    manifest,
    round
  };
});
