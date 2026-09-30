(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_ALIASES = {
    sku: ["sku", "sku#", "item", "item no", "item number", "货号", "产品货号"],
    contractNo: ["contract no", "contract", "contract number", "合同号"],
    packageCount: ["packages", "package count", "total packages", "总包数", "包数"],
    currentPackage: ["package no", "package index", "current package", "第几包"],
    netWeight: ["nw", "n.w.", "net weight", "净重"],
    grossWeight: ["gw", "g.w.", "gross weight", "毛重"],
    length: ["length", "l", "长"],
    width: ["width", "w", "宽"],
    height: ["height", "h", "高"],
    factory: ["factory", "supplier", "vendor", "工厂", "供应商"],
    barcode: ["barcode", "bar code", "条码"],
    qr: ["qr", "qr code", "二维码"]
  };

  function normalizeHeader(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s_\-\/\\]+/g, " ")
      .replace(/[.:：]+/g, "")
      .trim();
  }

  function parseCsv(text) {
    const src = String(text ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
    return rows;
  }

  function columnNameToIndex(name) {
    let n = 0;
    for (const ch of String(name || "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function cellRefToParts(ref) {
    const m = /^([A-Z]+)(\d+)$/i.exec(ref || "");
    return m ? { col: columnNameToIndex(m[1]), row: Number(m[2]) - 1 } : null;
  }

  function decodeXmlText(v) {
    return String(v ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    const out = [];
    for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlText(m[1]));
      out.push(parts.join(""));
    }
    return out;
  }

  function parseSheetXml(xml, sharedStrings = []) {
    const rows = [];
    for (const rm of String(xml || "").matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowAttr = rm[1];
      const rowNumMatch = /\br="(\d+)"/.exec(rowAttr);
      const rowIndex = rowNumMatch ? Number(rowNumMatch[1]) - 1 : rows.length;
      const row = rows[rowIndex] || [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cm[1], body = cm[2];
        const refMatch = /\br="([^"]+)"/.exec(attrs);
        const typeMatch = /\bt="([^"]+)"/.exec(attrs);
        const ref = refMatch?.[1] || "";
        const parts = cellRefToParts(ref);
        const col = parts ? parts.col : row.length;
        const type = typeMatch?.[1] || "";
        const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const inlineMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
        let value = valueMatch ? decodeXmlText(valueMatch[1]) : (inlineMatch ? decodeXmlText(inlineMatch[1]) : "");
        if (type === "s") value = sharedStrings[Number(value)] ?? "";
        if (type === "b") value = value === "1";
        row[col] = value;
      }
      rows[rowIndex] = row;
    }
    return rows.map((r) => r || []);
  }

  function findEocd(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    throw new Error("Invalid XLSX/ZIP: EOCD not found.");
  }

  function listZipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(bytes);
    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    const td = new TextDecoder();
    const out = new Map();

    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("Invalid XLSX/ZIP central directory.");
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const uncompressedSize = view.getUint32(ptr + 24, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = td.decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));
      out.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function unzipEntry(bytes, entry) {
    if (!entry) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const p = entry.localOffset;
    if (view.getUint32(p, true) !== 0x04034b50) throw new Error("Invalid XLSX/ZIP local header.");
    const nameLen = view.getUint16(p + 26, true);
    const extraLen = view.getUint16(p + 28, true);
    const start = p + 30 + nameLen + extraLen;
    const compressed = bytes.slice(start, start + entry.compressedSize);

    if (entry.method === 0) return compressed;
    if (entry.method !== 8) throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
    if (typeof DecompressionStream === "undefined") throw new Error("Deflate decompression is not available in this runtime.");

    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([compressed]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function parseXlsx(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const entries = listZipEntries(bytes);
    const td = new TextDecoder();

    const sharedEntry = entries.get("xl/sharedStrings.xml");
    const sharedXml = sharedEntry ? td.decode(await unzipEntry(bytes, sharedEntry)) : "";
    const shared = parseSharedStrings(sharedXml);

    let sheetEntry = entries.get("xl/worksheets/sheet1.xml");
    if (!sheetEntry) {
      const first = [...entries.keys()].find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
      sheetEntry = first ? entries.get(first) : null;
    }
    if (!sheetEntry) throw new Error("No worksheet found in XLSX.");

    const sheetXml = td.decode(await unzipEntry(bytes, sheetEntry));
    return parseSheetXml(sheetXml, shared);
  }

  function buildAliasIndex(aliases = DEFAULT_ALIASES) {
    const idx = new Map();
    for (const [key, list] of Object.entries(aliases)) {
      for (const item of [key, ...list]) idx.set(normalizeHeader(item), key);
    }
    return idx;
  }

  function detectHeader(rows, aliases = DEFAULT_ALIASES) {
    const idx = buildAliasIndex(aliases);
    let best = null;
    rows.slice(0, 40).forEach((row, rowIndex) => {
      const mapping = {};
      let score = 0;
      row.forEach((cell, colIndex) => {
        const key = idx.get(normalizeHeader(cell));
        if (key && !(key in mapping)) { mapping[key] = colIndex; score += 1; }
      });
      if (!best || score > best.score) best = { rowIndex, mapping, score };
    });
    if (!best || best.score < 2) throw new Error("No recognizable header row found.");
    return best;
  }

  function isFooterRow(row) {
    const first = normalizeHeader(row.find((v) => String(v ?? "").trim()) || "");
    return ["total", "subtotal", "合计", "总计"].includes(first);
  }

  function rowsToRecords(rows, options = {}) {
    const header = detectHeader(rows, options.aliases || DEFAULT_ALIASES);
    const records = [];
    const issues = [];
    let previous = {};

    for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
      const row = rows[r] || [];
      if (isFooterRow(row)) break;
      const normalized = row.map((v) => normalizeHeader(v));
      const headerLike = Object.values(header.mapping).filter((c) => normalized[c] && buildAliasIndex(options.aliases || DEFAULT_ALIASES).has(normalized[c])).length;
      if (headerLike >= 2) continue;
      if (!row.some((v) => String(v ?? "").trim())) continue;

      const rec = { _row: r + 1, _cells: {} };
      for (const [key, col] of Object.entries(header.mapping)) {
        let value = row[col] ?? "";
        if (options.fillDown !== false && String(value).trim() === "" && previous[key] != null) value = previous[key];
        if (String(value).trim() !== "") previous[key] = value;
        rec[key] = value;
        rec._cells[key] = columnLabel(col) + String(r + 1);
      }

      validateRecord(rec, issues);
      records.push(rec);
    }
    return { header, records, issues };
  }

  function columnLabel(index) {
    let n = Number(index) + 1, out = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function validateRecord(rec, issues) {
    const required = ["sku"];
    for (const key of required) {
      if (!String(rec[key] ?? "").trim()) {
        issues.push({ severity: "error", row: rec._row, cell: rec._cells[key] || "", field: key, message: `${key} is required.` });
      }
    }
    if (rec.packageCount !== undefined && String(rec.packageCount).trim() !== "") {
      const n = Number(rec.packageCount);
      if (!Number.isInteger(n) || n < 1) issues.push({ severity: "error", row: rec._row, cell: rec._cells.packageCount, field: "packageCount", message: "Package Count must be an integer >= 1." });
    }
    if (rec.grossWeight !== undefined && rec.netWeight !== undefined && Number(rec.grossWeight) < Number(rec.netWeight)) {
      issues.push({ severity: "error", row: rec._row, cell: rec._cells.grossWeight, field: "grossWeight", message: "G.W. must be >= N.W." });
    }
  }

  function normalizeNumericCode(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return String(Math.trunc(n));
    }
    return s.replace(/\.0+$/, "");
  }

  async function parseFile(file) {
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".csv")) return { rows: parseCsv(await file.text()), source: "csv" };
    if (name.endsWith(".xlsx")) return { rows: await parseXlsx(await file.arrayBuffer()), source: "xlsx" };
    if (name.endsWith(".xls")) throw new Error("Legacy .xls BIFF is not supported. Please save as .xlsx.");
    throw new Error("Supported formats: .xlsx and .csv.");
  }

  return {
    DEFAULT_ALIASES,
    normalizeHeader,
    parseCsv,
    parseSharedStrings,
    parseSheetXml,
    listZipEntries,
    parseXlsx,
    detectHeader,
    rowsToRecords,
    normalizeNumericCode,
    parseFile,
    columnLabel,
    cellRefToParts
  };
});
