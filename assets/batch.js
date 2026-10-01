(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonBatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(v) {
    return String(v ?? "").trim();
  }

  function num(v, fallback = 0) {
    if (v === "" || v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalize(v) {
    return text(v).toLowerCase().replace(/[\s_\-./\\]+/g, "");
  }

  function normalizeCode(v) {
    const s = text(v);
    if (!s) return "";
    if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return String(Math.trunc(n));
    }
    return s.replace(/\.0+$/, "");
  }

  function resolveFactory(value, factories = []) {
    const q = normalize(value);
    if (!q) return null;
    return factories.find((f) =>
      [f.id, f.name, f.crn].some((candidate) => normalize(candidate) === q)
    ) || factories.find((f) => normalize(f.name).includes(q) || q.includes(normalize(f.name))) || null;
  }

  function recordToArtwork(record, options = {}) {
    const defaults = options.defaults || {};
    const factories = options.factories || [];
    const factory = resolveFactory(record.factory, factories);
    return {
      sku: text(record.sku),
      contractNo: text(record.contractNo),
      packageCount: Math.trunc(num(record.packageCount, 1)),
      currentPackage: Math.trunc(num(record.currentPackage, 1)),
      netWeight: num(record.netWeight, 0),
      grossWeight: num(record.grossWeight, 0),
      length: num(record.length, 0),
      width: num(record.width, 0),
      height: num(record.height, 0),
      factoryId: factory?.id || "",
      barcode: normalizeCode(record.barcode),
      qr: text(record.qr),
      codeBlockProfile: defaults.codeBlockProfile || "250x80",
      status: "draft",
      revision: "R01",
      templateCode: defaults.templateCode || "US_SIDE_SEAL",
      templateVersion: defaults.templateVersion || "2026.05.20",
      templateName: defaults.templateName || "美线侧封箱",
      market: defaults.market || "US",
      safeMarginMm: Number(defaults.safeMarginMm ?? 22),
      elements: []
    };
  }

  function applyControlledPreset(artwork, domain, factories = [], preset = {}) {
    if(!preset?.enabled) return {ok:true,artwork,preset:null};
    if(!domain?.sideSealGeometry||!domain?.createShippingMarkBlockElements){
      return {ok:false,artwork,reason:"CONTROLLED_PRESET_DOMAIN_UNAVAILABLE"};
    }
    const geometry=domain.sideSealGeometry(artwork);
    const panelId=String(preset.panelId||"TOP_FACE");
    const panel=geometry.panels.find((p)=>p.id===panelId)||null;
    if(!panel) return {ok:false,artwork,reason:"CONTROLLED_PRESET_PANEL_INVALID",panelId};

    const version=String(preset.version||"1.1.0");
    const rowKey=String(preset.rowKey||artwork.sku||"row").replace(/[^a-zA-Z0-9_-]+/g,"_");
    const built=domain.createShippingMarkBlockElements(artwork,panel,factories,{
      version,
      groupId:`batch-shipping-${rowKey}`,
      locked:true,
      idFactory:(slot,index)=>`batch-${rowKey}-${String(slot.id||index).toLowerCase()}`
    });
    if(!built.ok){
      return {
        ok:false,
        artwork,
        reason:String(built.reason||"CONTROLLED_PRESET_LAYOUT_FAILED"),
        panelId,
        version,
        detail:built
      };
    }
    artwork.elements=[...(Array.isArray(artwork.elements)?artwork.elements:[]),...built.elements];
    return {
      ok:true,
      artwork,
      preset:{
        type:"SHIPPING_MARK_STANDARD",
        version:built.version,
        panelId,
        groupId:built.groupId,
        elementCount:built.elements.length,
        totalHeightMm:built.totalH
      }
    };
  }

  function issue(row, cell, field, message, severity = "error", source = "batch") {
    return { row, cell: cell || "", field, message, severity, source };
  }

  function validateArtworkRow(artwork, record, domain, optionsCodes, factories = []) {
    const out = [];
    const row = record._row;
    const cells = record._cells || {};
    const req = [
      ["sku", "SKU"],
      ["contractNo", "Contract No."],
      ["factoryId", "Factory"],
      ["barcode", "Barcode"],
      ["qr", "QR"]
    ];
    for (const [field, label] of req) {
      if (!text(artwork[field])) out.push(issue(row, cells[field === "factoryId" ? "factory" : field], field, `${label} is required.`));
    }
    for (const [field, label] of [["netWeight","N.W."],["grossWeight","G.W."],["length","Length"],["width","Width"],["height","Height"]]) {
      if (!(Number(artwork[field]) > 0)) out.push(issue(row, cells[field], field, `${label} must be greater than 0.`));
    }
    if (!Number.isInteger(artwork.packageCount) || artwork.packageCount < 1) {
      out.push(issue(row, cells.packageCount, "packageCount", "Package Count must be an integer >= 1."));
    }
    if (!Number.isInteger(artwork.currentPackage) || artwork.currentPackage < 1 || artwork.currentPackage > artwork.packageCount) {
      out.push(issue(row, cells.currentPackage, "currentPackage", "Current Package must be within 1..Package Count."));
    }
    if (artwork.grossWeight > 0 && artwork.netWeight > 0 && artwork.grossWeight < artwork.netWeight) {
      out.push(issue(row, cells.grossWeight, "grossWeight", "G.W. must be >= N.W."));
    }

    if (optionsCodes?.code128Values && artwork.barcode) {
      try { optionsCodes.code128Values(artwork.barcode); }
      catch (e) { out.push(issue(row, cells.barcode, "barcode", e.message || "Barcode cannot be encoded.")); }
    }
    if (optionsCodes?.qrMatrix && artwork.qr) {
      try { optionsCodes.qrMatrix(artwork.qr, "M"); }
      catch (e) { out.push(issue(row, cells.qr, "qr", e.message || "QR cannot be encoded.")); }
    }

    if (domain?.runPreflight) {
      const groups = domain.runPreflight(artwork,factories);
      for (const check of Object.values(groups).flat()) {
        if (check.status === "error") {
          out.push(issue(row, "", check.id, check.detail || check.title, "error", "preflight"));
        } else if (check.status === "warning") {
          out.push(issue(row, "", check.id, check.detail || check.title, "warning", "preflight"));
        }
      }
    }
    return dedupeIssues(out);
  }

  function dedupeIssues(items) {
    const seen = new Set();
    return items.filter((x) => {
      const key = [x.row, x.cell, x.field, x.message, x.severity].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildReview(records, parserIssues, domain, options = {}) {
    const byRow = new Map();
    for (const i of parserIssues || []) {
      if (!byRow.has(i.row)) byRow.set(i.row, []);
      byRow.get(i.row).push({ ...i, source: i.source || "import" });
    }
    return (records || []).map((record) => {
      const artwork = recordToArtwork(record, options);
      const presetResult=applyControlledPreset(
        artwork,
        domain,
        options.factories||[],
        options.controlledShippingMark
          ? {...options.controlledShippingMark,rowKey:`r${record._row}-${artwork.sku||"sku"}`}
          : null
      );
      const presetIssues=presetResult.ok?[]:[issue(
        record._row,
        "",
        "controlled-shipping-mark",
        `Controlled Shipping Mark preset failed: ${presetResult.reason}`,
        "error",
        "controlled-preset"
      )];
      const issues = dedupeIssues([
        ...(byRow.get(record._row) || []),
        ...presetIssues,
        ...validateArtworkRow(artwork, record, domain, options.codes, options.factories||[])
      ]);
      const errors = issues.filter((i) => i.severity !== "warning");
      const warnings = issues.filter((i) => i.severity === "warning");
      return {
        row: record._row,
        sku: artwork.sku || "—",
        status: errors.length ? "ERROR" : "PASS",
        issue: errors[0] ? `${errors[0].cell ? errors[0].cell + " · " : ""}${errors[0].message}` : (warnings[0] ? `WARNING · ${warnings[0].message}` : "—"),
        artwork,
        controlledPreset:presetResult.preset||null,
        sourceRecord: record,
        issues,
        errors,
        warnings
      };
    });
  }

  function summarize(review) {
    const rows = review || [];
    const failed = rows.filter((r) => r.status === "ERROR").length;
    return { total: rows.length, passed: rows.length - failed, failed };
  }

  function failedRowsCsv(review) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["row,sku,cell,field,error"];
    for (const row of review || []) {
      for (const i of row.errors || []) lines.push([row.row, q(row.sku), q(i.cell), q(i.field), q(i.message)].join(","));
    }
    return lines.join("\n") + "\n";
  }

  function safeBase(artwork) {
    return [
      artwork.templateCode || "TEMPLATE",
      artwork.sku || "NO_SKU",
      `${artwork.currentPackage || 1}-${artwork.packageCount || 1}`,
      artwork.revision || "R01"
    ].map((x) => String(x).replace(/[^a-zA-Z0-9._-]+/g, "_")).join("_");
  }

  return {
    normalize,
    normalizeCode,
    resolveFactory,
    recordToArtwork,
    applyControlledPreset,
    validateArtworkRow,
    buildReview,
    summarize,
    failedRowsCsv,
    safeBase
  };
});
