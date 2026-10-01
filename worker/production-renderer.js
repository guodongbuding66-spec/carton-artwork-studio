import "../assets/vendor/qrcode-generator.js";
import "../assets/domain.js";
import "../assets/codes.js";
import "../assets/pdf.js";

const D=globalThis.CartonDomain;
const C=globalThis.CartonCodes;
const P=globalThis.CartonPdf;

if(!D||!C||!P) throw new Error("PRODUCTION_RENDERER_MODULE_LOAD_FAILED");

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
  const factories=factory?[factory]:[];

  const preflight=D.runPreflight(artwork,factories);
  const preflightSummary=D.preflightSummary(preflight);
  if(preflightSummary.blocking>0){
    const error=new Error("PRODUCTION_PREFLIGHT_BLOCKED");
    error.code="PRODUCTION_PREFLIGHT_BLOCKED";
    error.detail=Object.values(preflight).flat().filter(x=>x.status==="error"&&x.blocking);
    throw error;
  }

  const customElements=prepareProductionCustomElements(artwork,factories);
  const geometry=D.sideSealGeometry(artwork);
  const computed=D.computed(artwork,factories);
  const codeModel=C.code128Bars(artwork.barcode,{moduleMm:.42,heightMm:25});
  const qrModel=C.qrMatrix(artwork.qr,qrEcc);
  const bytes=P.createPdfBytes({
    artwork,
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
    documentTitle:`${artwork.sku} ${artwork.revision}`
  });
  return {
    bytes,
    artwork,
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

