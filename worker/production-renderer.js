import "../assets/vendor/qrcode-generator.js";
import "../assets/domain.js";
import "../assets/codes.js";
import "../assets/pdf.js";
import { CONTROLLED_SVG_PROFILE, parseControlledSvgDataUrl } from "./controlled-svg.js";

const D=globalThis.CartonDomain;
const C=globalThis.CartonCodes;
const P=globalThis.CartonPdf;

if(!D||!C||!P) throw new Error("PRODUCTION_RENDERER_MODULE_LOAD_FAILED");

export const PRODUCTION_RENDERER_VERSION="pdfx4-embedded-truetype-2.2.0";

export function productionCapabilityDescriptor(){
  const shipping=D.controlledBlockDefinition?.("SHIPPING_MARK_STANDARD")||null;
  return Object.freeze({
    rendererVersion:PRODUCTION_RENDERER_VERSION,
    controlledSvgProfile:CONTROLLED_SVG_PROFILE,
    shippingMarkStandardVersion:String(shipping?.currentVersion||shipping?.version||""),
    domainTemplateCode:String(D.defaultArtwork?.templateCode||""),
    domainTemplateVersion:String(D.defaultArtwork?.templateVersion||"")
  });
}

function productionBarcodeModel(element,artwork,factories){
  const payload=D.resolvedElementPayload(element,artwork,factories);
  const sym=String(element.symbology||"CODE128B").toUpperCase();
  if(sym==="ITF14"){
    return C.itf14Bars(payload,{
      moduleMm:Number(element.moduleMm||1.016),
      heightMm:Number(element.barHeightMm||32),
      quietModules:Number(element.quietModules||10),
      wideRatio:Number(element.wideRatio||2.5),
      bearerBars:element.bearerBars!==false,
      bearerBarThicknessMm:Number(element.bearerBarThicknessMm||2.032)
    });
  }
  if(sym==="GS1_128"){
    return C.gs1_128Bars(payload,{
      moduleMm:Number(element.moduleMm||.495),
      heightMm:Number(element.barHeightMm||31.75),
      quietModules:Number(element.quietModules||10)
    });
  }
  return C.code128Bars(payload,{
    moduleMm:Number(element.moduleMm||.42),
    heightMm:Number(element.barHeightMm||28),
    quietModules:Number(element.quietModules||10)
  });
}

function productionBarcodeSize(element,model){
  const sym=String(element.symbology||model.symbology||"CODE128B").toUpperCase();
  const hri=element.humanReadable!==false;
  const bearer=model.bearerBars?Number(model.bearerBarThicknessMm||0):0;
  const hriFontMm=sym==="ITF14"?4:3.2;
  const hriGapMm=sym==="ITF14"?1.02:1;
  const hriBlock=hri?hriGapMm+hriFontMm*1.35:0;
  return {
    w:Number(model.widthMm||element.w||1),
    h:Number(model.heightMm||element.h||1)+bearer*2+hriBlock
  };
}

export function prepareProductionCustomElements(artwork,factories=[]){
  const visible=(Array.isArray(artwork?.elements)?artwork.elements:[]).filter(e=>e?.visible!==false);
  const unqualified=visible
    .map(e=>({element:e,qualification:D.productionElementQualification(e)}))
    .filter(x=>!x.qualification.qualified);
  if(unqualified.length){
    const error=new Error("PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED");
    error.code="PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED";
    error.detail=unqualified.map(({element,qualification})=>({
      id:element.id||"",
      type:element.type||"",
      name:element.name||"",
      reason:qualification.reason||"NOT_QUALIFIED"
    }));
    throw error;
  }

  return visible.map(element=>{
    if(element.type==="text"){
      const text=D.resolvedElementText(element,artwork,factories);
      const layout=D.textLayout(element,text);
      if(!layout.fits){
        const error=new Error("PRODUCTION_TEXT_OVERFLOW");
        error.code="PRODUCTION_TEXT_OVERFLOW";
        error.detail={id:element.id||"",name:element.name||"",widthMm:layout.widthMm,heightMm:layout.heightMm,boxWidthMm:layout.boxWidthMm,boxHeightMm:layout.boxHeightMm};
        throw error;
      }
      return {...element,text,renderLines:layout.lines,renderLineWidthsMm:layout.widthsMm};
    }
    if(element.type==="image"&&String(element.sourceMimeType||element.mimeType||"").toLowerCase()==="image/svg+xml"){
      try{
        const vectorModel=parseControlledSvgDataUrl(element.vectorDataUrl);
        return {...element,vectorModel};
      }catch(e){
        const error=new Error("PRODUCTION_SVG_NOT_QUALIFIED");
        error.code="PRODUCTION_SVG_NOT_QUALIFIED";
        error.detail={
          id:element.id||"",
          name:element.name||"",
          parserCode:String(e?.code||e?.message||"SVG_PARSE_FAILED"),
          parserDetail:e?.detail??null
        };
        throw error;
      }
    }
    if(element.type==="barcode"){
      const payload=D.resolvedElementPayload(element,artwork,factories);
      const barcodeModel=productionBarcodeModel(element,artwork,factories);
      const size=productionBarcodeSize(element,barcodeModel);
      return {...element,payload,w:size.w,h:size.h,barcodeModel};
    }
    if(element.type==="qr-generated"){
      const payload=D.resolvedElementPayload(element,artwork,factories);
      const qr=C.qrMatrix(payload,element.ecc||"M");
      return {...element,payload,matrix:qr.matrix};
    }
    return {...element};
  });
}

function hydrateProductionContext(snapshot,metadata={}){
  const s=snapshot||{};
  const artwork=D.artworkFromCanonical(s,{
    sku:metadata.sku,
    contractNo:metadata.contractNo,
    factoryId:s.factory?.id||metadata.factoryId,
    packageCount:s.package?.total,
    currentPackage:s.package?.index,
    revision:metadata.revision||s.artwork?.revision,
    status:metadata.status||s.artwork?.status
  });
  const factory=s.factory?{
    id:s.factory.id,
    name:s.factory.name,
    crn:s.factory.crn,
    country:s.factory.country
  }:null;
  return {snapshot:s,artwork,factories:factory?[factory]:[]};
}

function publicCheck(check){
  return {
    id:String(check?.id||""),
    title:String(check?.title||""),
    status:String(check?.status||""),
    detail:String(check?.detail||""),
    category:String(check?.category||""),
    blocking:Boolean(check?.blocking)
  };
}

export function qualifyProductionArtwork({snapshot,metadata={}}){
  const {artwork,factories}=hydrateProductionContext(snapshot,metadata);
  const visible=(Array.isArray(artwork.elements)?artwork.elements:[]).filter(e=>e?.visible!==false);
  const elementQualifications=[];
  const resolvedElements=[];

  for(const element of visible){
    const qualification=D.productionElementQualification(element);
    const item={
      id:String(element.id||""),
      name:String(element.name||element.type||""),
      type:String(element.type||""),
      panelId:String(element.panelId||""),
      qualified:Boolean(qualification.qualified),
      mode:String(qualification.mode||""),
      reason:String(qualification.reason||""),
      errorCode:"",
      errorDetail:null,
      placedSize:{
        w:Number(element.w||0),
        h:Number(element.h||0)
      },
      resolvedSize:null
    };
    if(!qualification.qualified){
      elementQualifications.push(item);
      resolvedElements.push({...element});
      continue;
    }
    try{
      const prepared=prepareProductionCustomElements({...artwork,elements:[element]},factories)[0];
      resolvedElements.push(prepared);
      item.resolvedSize={w:Number(prepared?.w||0),h:Number(prepared?.h||0)};
    }catch(e){
      item.qualified=false;
      item.reason=String(e?.code||e?.message||"CUSTOM_ELEMENT_PREPARE_FAILED");
      item.errorCode=String(e?.code||e?.message||"CUSTOM_ELEMENT_PREPARE_FAILED");
      item.errorDetail=e?.detail??null;
      resolvedElements.push({...element});
    }
    elementQualifications.push(item);
  }

  const productionArtwork={...artwork,elements:resolvedElements};
  const preflight=D.runPreflight(productionArtwork,factories);
  const preflightSummary=D.preflightSummary(preflight);
  const allChecks=Object.values(preflight).flat();
  const blockingChecks=allChecks.filter(x=>x.status==="error"&&x.blocking).map(publicCheck);
  const warningChecks=allChecks.filter(x=>x.status==="warning").map(publicCheck);
  const unqualified=elementQualifications.filter(x=>!x.qualified);

  return {
    ok:unqualified.length===0&&preflightSummary.blocking===0,
    report:{
      ok:unqualified.length===0&&preflightSummary.blocking===0,
      rendererVersion:PRODUCTION_RENDERER_VERSION,
      revision:String(productionArtwork.revision||""),
      customElements:{
        visible:visible.length,
        qualified:elementQualifications.length-unqualified.length,
        unqualified:unqualified.length,
        items:elementQualifications
      },
      preflight:{
        summary:preflightSummary,
        blockingChecks,
        warningChecks
      }
    },
    artwork:productionArtwork,
    factories,
    preflight,
    elementQualifications
  };
}

export function renderEmbeddedArtworkPdf({
  snapshot,
  metadata={},
  fontBytes,
  iccBytes=null,
  pdfxProfile="",
  outputConditionIdentifier="",
  qrEcc="M",
  mode="production"
}) {
  const qualification=qualifyProductionArtwork({snapshot,metadata});
  const productionArtwork=qualification.artwork;
  const factories=qualification.factories;
  const unqualified=qualification.elementQualifications.filter(x=>!x.qualified);
  if(unqualified.length){
    const customPolicyFailures=unqualified.filter(x=>
      ["UPLOADED_GRAPHIC_NOT_PRODUCTION_QUALIFIED","CUSTOM_ELEMENT_TYPE_NOT_PRODUCTION_QUALIFIED","CUSTOM_BOLD_FONT_NOT_QUALIFIED","PRODUCTION_SVG_NOT_QUALIFIED"].includes(x.reason)
    );
    const first=unqualified[0];
    const code=customPolicyFailures.length
      ? "PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED"
      : (first.errorCode||first.reason||"PRODUCTION_CUSTOM_ELEMENT_INVALID");
    const error=new Error(code);
    error.code=code;
    error.detail=unqualified;
    throw error;
  }
  if(qualification.report.preflight.summary.blocking>0){
    const error=new Error("PRODUCTION_PREFLIGHT_BLOCKED");
    error.code="PRODUCTION_PREFLIGHT_BLOCKED";
    error.detail=qualification.report.preflight.blockingChecks;
    throw error;
  }

  const customElements=productionArtwork.elements||[];
  const geometry=D.sideSealGeometry(productionArtwork);
  const computed=D.computed(productionArtwork,factories);
  const codeModel=C.code128Bars(productionArtwork.barcode,{moduleMm:.42,heightMm:25});
  const qrModel=C.qrMatrix(productionArtwork.qr,qrEcc);
  const bytes=P.createPdfBytes({
    artwork:productionArtwork,
    geometry,
    computed,
    codeModel,
    qrMatrix:qrModel.matrix,
    customElements,
    mode,
    fontBytes,
    iccBytes,
    pdfxProfile,
    outputConditionIdentifier,
    documentTitle:`${productionArtwork.sku} ${productionArtwork.revision}`
  });
  return {
    bytes,
    artwork:productionArtwork,
    geometry,
    computed,
    customElements:{
      count:customElements.length,
      types:[...new Set(customElements.map(e=>e.type))]
    },
    qr:{
      ecc:qrModel.errorCorrectionLevel,
      version:qrModel.version
    },
    pdfxCandidate:pdfxProfile?{
      profile:pdfxProfile,
      structural:P.inspectPdfX4Candidate(bytes)
    }:null,
    barcode:{
      symbology:"CODE128-B",
      widthMm:codeModel.widthMm,
      moduleMm:codeModel.moduleMm
    }
  };
}

