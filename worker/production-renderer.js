import "../assets/vendor/qrcode-generator.js";
import "../assets/domain.js";
import "../assets/codes.js";
import "../assets/pdf.js";

const D=globalThis.CartonDomain;
const C=globalThis.CartonCodes;
const P=globalThis.CartonPdf;

if(!D||!C||!P) throw new Error("PRODUCTION_RENDERER_MODULE_LOAD_FAILED");

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
  const visibleCustomElements=(Array.isArray(s.artwork?.elements)?s.artwork.elements:[]).filter((e)=>e?.visible!==false);
  if(visibleCustomElements.length){
    const error=new Error("PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED");
    error.code="PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED";
    error.detail=visibleCustomElements.map((e)=>({id:e.id||"",type:e.type||"",name:e.name||""}));
    throw error;
  }
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
