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
      artwork: {
        revision: a.revision,
        status: a.status,
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
          payload:e.payload||"",
          ecc:e.ecc||"M",
          sourceType:e.sourceType||"",
          mimeType:e.mimeType||"",
          dataUrl:e.dataUrl||"",
          pixelWidth:Number(e.pixelWidth||0),
          pixelHeight:Number(e.pixelHeight||0)
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
    const safeMargin = Math.max(15, Math.min(30, g.H * 0.1));
    const availableW = Math.max(0, g.L - safeMargin * 2);
    const availableH = Math.max(0, g.W - safeMargin * 2);
    const codeFits = codeSize.w <= availableW && codeSize.h <= availableH;

    const layout = [
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
      const within=x>=0&&y>=0&&w>0&&h>0&&(x+w)<=g.totalWidth&&(y+h)<=g.totalHeight;
      assetChecks.push(check(
        `asset-bounds-${element.id||name}`,
        `${name} within artwork bounds`,
        within?"pass":"error",
        within?`${round(w)}×${round(h)} mm at ${round(x)},${round(y)} mm.`:"Element extends outside the carton artwork bounds.",
        "Assets",
        true
      ));
      if(element.type==="qr-generated"){
        const size=Math.min(w,h);
        assetChecks.push(check(
          `qr-generated-${element.id||name}`,
          "Generated QR vector source",
          String(element.payload||"").trim()?"pass":"error",
          String(element.payload||"").trim()
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
        assetChecks.push(check(
          `qr-upload-${element.id||name}`,
          "Uploaded QR image verification",
          "warning",
          "Uploaded QR artwork is treated as an image reference. Its encoded content is not decoded or verified by the current preflight; generated QR is preferred for controlled production.",
          "Assets"
        ));
      }
      if((element.type==="image"||element.type==="qr-image")&&Number(element.pixelWidth)>0&&Number(element.pixelHeight)>0&&w>0&&h>0){
        const ppi=Math.min(Number(element.pixelWidth)/(w/25.4),Number(element.pixelHeight)/(h/25.4));
        assetChecks.push(check(
          `asset-resolution-${element.id||name}`,
          `${name} effective raster resolution`,
          ppi>=300?"pass":"warning",
          `${round(ppi)} PPI at placed size ${round(w)}×${round(h)} mm. Internal review target is 300 PPI for raster print assets.`,
          "Assets"
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
        payload:String(e.payload||""),
        ecc:["L","M","Q","H"].includes(String(e.ecc||"M").toUpperCase())?String(e.ecc||"M").toUpperCase():"M",
        sourceType:String(e.sourceType||""),
        mimeType:String(e.mimeType||""),
        dataUrl:String(e.dataUrl||""),
        pixelWidth:Number(e.pixelWidth||0),
        pixelHeight:Number(e.pixelHeight||0)
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
    artworkFromCanonical,
    sideSealGeometry,
    calibrationMetrics,
    codeBlockDimensions,
    runPreflight,
    preflightSummary,
    stableStringify,
    fnv1a32,
    manifest,
    round
  };
});
