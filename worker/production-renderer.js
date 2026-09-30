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
    fontBytes
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
    barcode:{
      symbology:"CODE128-B",
      widthMm:codeModel.widthMm,
      moduleMm:codeModel.moduleMm
    }
  };
}
