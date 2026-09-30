(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonPdf = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PT_PER_MM = 72 / 25.4;

  function escPdfText(v) {
    return String(v ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function mm(v) {
    return Number(v) * PT_PER_MM;
  }


  function u16be(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function i16be(bytes, offset) {
    const v = u16be(bytes, offset);
    return v & 0x8000 ? v - 0x10000 : v;
  }

  function u32be(bytes, offset) {
    return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  }

  function sfntTable(bytes, tag) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12) throw new Error("FONT_INVALID_SFNT");
    const numTables = u16be(bytes, 4);
    for (let i = 0; i < numTables; i += 1) {
      const p = 12 + i * 16;
      if (p + 16 > bytes.length) throw new Error("FONT_INVALID_TABLE_DIRECTORY");
      const name = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
      if (name !== tag) continue;
      const offset = u32be(bytes, p + 8);
      const length = u32be(bytes, p + 12);
      if (offset + length > bytes.length) throw new Error(`FONT_TABLE_OUT_OF_BOUNDS:${tag}`);
      return { offset, length };
    }
    throw new Error(`FONT_TABLE_MISSING:${tag}`);
  }

  function parseCmap(bytes) {
    const table = sfntTable(bytes, "cmap");
    const base = table.offset;
    if (base + 4 > bytes.length) throw new Error("FONT_CMAP_INVALID");
    const count = u16be(bytes, base + 2);
    const candidates = [];
    for (let i = 0; i < count; i += 1) {
      const p = base + 4 + i * 8;
      if (p + 8 > base + table.length) throw new Error("FONT_CMAP_RECORD_INVALID");
      const platform = u16be(bytes, p);
      const encoding = u16be(bytes, p + 2);
      const subOffset = u32be(bytes, p + 4);
      const sub = base + subOffset;
      if (sub + 2 > bytes.length) continue;
      const format = u16be(bytes, sub);
      let score = 0;
      if (format === 12 && platform === 3 && encoding === 10) score = 100;
      else if (format === 12 && platform === 0) score = 90;
      else if (format === 4 && platform === 3 && encoding === 1) score = 80;
      else if (format === 4 && platform === 0) score = 70;
      if (score) candidates.push({ format, sub, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) throw new Error("FONT_CMAP_UNSUPPORTED");
    const chosen = candidates[0];

    if (chosen.format === 12) {
      const nGroups = u32be(bytes, chosen.sub + 12);
      const start = chosen.sub + 16;
      return function glyphForCodePoint(cp) {
        let lo = 0, hi = nGroups - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const p = start + mid * 12;
          const first = u32be(bytes, p);
          const last = u32be(bytes, p + 4);
          if (cp < first) hi = mid - 1;
          else if (cp > last) lo = mid + 1;
          else return (u32be(bytes, p + 8) + (cp - first)) >>> 0;
        }
        return 0;
      };
    }

    const segCount = u16be(bytes, chosen.sub + 6) / 2;
    const endBase = chosen.sub + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;
    return function glyphForCodePoint(cp) {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < segCount; i += 1) {
        const end = u16be(bytes, endBase + i * 2);
        if (cp > end) continue;
        const start = u16be(bytes, startBase + i * 2);
        if (cp < start) return 0;
        const delta = i16be(bytes, deltaBase + i * 2);
        const rangeOffset = u16be(bytes, rangeBase + i * 2);
        if (rangeOffset === 0) return (cp + delta) & 0xffff;
        const rangeAddress = rangeBase + i * 2;
        const glyphAddress = rangeAddress + rangeOffset + (cp - start) * 2;
        if (glyphAddress + 2 > bytes.length) return 0;
        let gid = u16be(bytes, glyphAddress);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
        return gid;
      }
      return 0;
    };
  }

  function utf16beHex(codePoint) {
    if (codePoint <= 0xffff) return codePoint.toString(16).padStart(4, "0").toUpperCase();
    const n = codePoint - 0x10000;
    const hi = 0xd800 + (n >> 10);
    const lo = 0xdc00 + (n & 0x3ff);
    return hi.toString(16).padStart(4, "0").toUpperCase() + lo.toString(16).padStart(4, "0").toUpperCase();
  }

  function parseTrueTypeFont(fontBytes) {
    const bytes = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes || []);
    const sig = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : "";
    const trueType = bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0;
    if (!trueType && sig !== "true") throw new Error("FONT_EMBEDDING_REQUIRES_TRUETYPE_OUTLINES");

    const head = sfntTable(bytes, "head");
    const hhea = sfntTable(bytes, "hhea");
    const hmtx = sfntTable(bytes, "hmtx");
    const maxp = sfntTable(bytes, "maxp");
    const glyphForCodePoint = parseCmap(bytes);

    const unitsPerEm = u16be(bytes, head.offset + 18);
    if (!unitsPerEm) throw new Error("FONT_UNITS_PER_EM_INVALID");
    const bbox = [
      i16be(bytes, head.offset + 36),
      i16be(bytes, head.offset + 38),
      i16be(bytes, head.offset + 40),
      i16be(bytes, head.offset + 42)
    ];
    const ascent = i16be(bytes, hhea.offset + 4);
    const descent = i16be(bytes, hhea.offset + 6);
    const numberOfHMetrics = u16be(bytes, hhea.offset + 34);
    const numGlyphs = u16be(bytes, maxp.offset + 4);
    if (!numberOfHMetrics || !numGlyphs) throw new Error("FONT_METRICS_INVALID");

    function advanceWidth(gid) {
      if (!Number.isInteger(gid) || gid < 0 || gid >= numGlyphs) return 0;
      const metricIndex = Math.min(gid, numberOfHMetrics - 1);
      const p = hmtx.offset + metricIndex * 4;
      if (p + 2 > hmtx.offset + hmtx.length) throw new Error("FONT_HMTX_INVALID");
      return u16be(bytes, p);
    }

    const used = new Map();
    function encodeText(text) {
      let hex = "";
      for (const ch of String(text ?? "")) {
        const cp = ch.codePointAt(0);
        const gid = glyphForCodePoint(cp);
        if (!gid) throw new Error(`FONT_GLYPH_MISSING:U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
        if (gid > 0xffff) throw new Error("FONT_GLYPH_ID_EXCEEDS_CID16");
        hex += gid.toString(16).padStart(4, "0").toUpperCase();
        if (!used.has(gid)) used.set(gid, cp);
      }
      return hex;
    }

    function scale1000(v) {
      return Math.round(Number(v) * 1000 / unitsPerEm);
    }

    return {
      bytes,
      unitsPerEm,
      numGlyphs,
      bbox: bbox.map(scale1000),
      ascent: scale1000(ascent),
      descent: scale1000(descent),
      encodeText,
      used,
      width1000(gid) { return scale1000(advanceWidth(gid)); }
    };
  }

  function embeddedTextOp(xMm, yMm, sizePt, text, rotateDeg, fontModel) {
    const x = mm(xMm), y = mm(yMm);
    const r = (Number(rotateDeg) || 0) * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const hex = fontModel.encodeText(text);
    return [
      "BT",
      `/F1 ${Number(sizePt).toFixed(2)} Tf`,
      `${c.toFixed(6)} ${s.toFixed(6)} ${(-s).toFixed(6)} ${c.toFixed(6)} ${x.toFixed(3)} ${y.toFixed(3)} Tm`,
      `<${hex}> Tj`,
      "ET"
    ].join("\n");
  }

  function textOp(xMm, yMm, sizePt, text, rotateDeg = 0) {
    const x = mm(xMm), y = mm(yMm);
    const r = (Number(rotateDeg) || 0) * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return [
      "BT",
      `/F1 ${Number(sizePt).toFixed(2)} Tf`,
      `${c.toFixed(6)} ${s.toFixed(6)} ${(-s).toFixed(6)} ${c.toFixed(6)} ${x.toFixed(3)} ${y.toFixed(3)} Tm`,
      `(${escPdfText(text)}) Tj`,
      "ET"
    ].join("\n");
  }

  function rectOp(xMm, yMm, wMm, hMm, fill = true) {
    const op = `${mm(xMm).toFixed(3)} ${mm(yMm).toFixed(3)} ${mm(wMm).toFixed(3)} ${mm(hMm).toFixed(3)} re`;
    return fill ? `${op} f` : `${op} S`;
  }

  function lineOp(x1Mm, y1Mm, x2Mm, y2Mm, dash = false) {
    return [
      dash ? "[6 4] 0 d" : "[] 0 d",
      `${mm(x1Mm).toFixed(3)} ${mm(y1Mm).toFixed(3)} m ${mm(x2Mm).toFixed(3)} ${mm(y2Mm).toFixed(3)} l S`
    ].join("\n");
  }

  function buildArtworkOps(artwork, geometry, computed, codeModel, options = {}) {
    const proof = options.mode === "proof";
    const fontModel = options.fontModel || null;
    const writeText = fontModel
      ? (x,y,size,text,rotate=0) => embeddedTextOp(x,y,size,text,rotate,fontModel)
      : textOp;
    const qrMatrix = options.qrMatrix || null;
    const ops = ["0 g", "0 G", "0.35 w"];
    const H = geometry.H, L = geometry.L, W = geometry.W, tab = geometry.closingTab;

    if (proof) {
      const x0 = H, x1 = H + L;
      const y = [0, H, H + W, H + W + H, H + W + H + W, H + W + H + W + tab];
      ops.push(lineOp(x0, 0, x0, geometry.totalHeight));
      ops.push(lineOp(x1, 0, x1, geometry.totalHeight));
      ops.push(lineOp(0, H, geometry.totalWidth, H));
      ops.push(lineOp(0, H + W, geometry.totalWidth, H + W));
      ops.push(lineOp(0, H + W + H, geometry.totalWidth, H + W + H));
      ops.push(lineOp(0, H + W + H + W, geometry.totalWidth, H + W + H + W));
      for (const yy of y) {
        if (yy > 0 && yy < geometry.totalHeight) ops.push(lineOp(H, yy, H + L, yy, true));
      }
    }

    const baseX = H + 26;
    const baseY = geometry.totalHeight - H - 58;

    ops.push(writeText(baseX, baseY, 13, artwork.sku));
    ops.push(writeText(baseX, baseY - 9, 10, `N.W. ${artwork.netWeight} LBS   G.W. ${artwork.grossWeight} LBS`));
    ops.push(writeText(baseX, baseY - 17, 10, `Package Meas ${computed.packageMeas}`));
    ops.push(writeText(baseX, baseY - 25, 10, `CRN ${computed.crn}`));
    ops.push(writeText(baseX, baseY - 33, 10, `Contract No ${artwork.contractNo}`));
    ops.push(writeText(baseX, baseY - 41, 10, computed.originText));
    ops.push(writeText(baseX, baseY - 49, 10, artwork.market || "US"));

    if (computed.packageNote) {
      ops.push(writeText(baseX, baseY - 63, 9, computed.packageNote));
    }

    // Second CRN occurrence on a side panel.
    ops.push(writeText(H * 0.55, H + W * 0.5, 9, `CRN ${computed.crn}`, 90));

    const blockW = artwork.codeBlockProfile === "200x64" ? 200 : 250;
    const blockH = artwork.codeBlockProfile === "200x64" ? 64 : 80;
    const codeX = H + L - blockW - 26;
    const codeY = H + W + H + W - blockH - 24;

    if (codeModel?.bars?.length) {
      const barcodeMaxW = Math.max(40, blockW - 78);
      const scale = Math.min(1, barcodeMaxW / Math.max(1, codeModel.widthMm));
      for (const b of codeModel.bars) {
        ops.push(rectOp(codeX + 10 + b.x * scale, codeY + 16, b.w * scale, b.h, true));
      }
      ops.push(writeText(codeX + 10, codeY + 7, 7.5, artwork.barcode));
    }

    if (Array.isArray(qrMatrix) && qrMatrix.length) {
      const quiet = 4;
      const n = qrMatrix.length;
      const qrSize = Math.min(52, blockH - 12);
      const cell = qrSize / (n + quiet * 2);
      const qx = codeX + blockW - qrSize - 8;
      const qy = codeY + (blockH - qrSize) / 2;
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          if (qrMatrix[row][col]) {
            ops.push(rectOp(qx + (col + quiet) * cell, qy + (row + quiet) * cell, cell, cell, true));
          }
        }
      }
    }

    if (proof) {
      ops.push("0.78 g");
      ops.push(writeText(H + L * 0.25, geometry.totalHeight * 0.52, 34, "NOT FOR PRODUCTION", 15));
      ops.push("0 g");
    }

    return ops.join("\n");
  }


  function joinBytes(chunks) {
    const total = chunks.reduce((n, x) => n + x.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  function toBytes(value) {
    return value instanceof Uint8Array ? value : new TextEncoder().encode(String(value ?? ""));
  }

  function makeStream(dict, bytes) {
    return { stream:true, dict:String(dict || "").trim(), bytes:toBytes(bytes) };
  }

  function buildBinaryPdf(objects, version = "1.4") {
    const chunks = [];
    let length = 0;
    const offsets = [0];
    const push = (value) => {
      const bytes = toBytes(value);
      chunks.push(bytes);
      length += bytes.length;
    };
    push(`%PDF-${version}\n%CASB\n`);
    for (let i = 1; i < objects.length; i += 1) {
      offsets[i] = length;
      push(`${i} 0 obj\n`);
      const obj = objects[i];
      if (obj && obj.stream) {
        const dict = obj.dict ? obj.dict + " " : "";
        push(`<< ${dict}/Length ${obj.bytes.length} >>\nstream\n`);
        push(obj.bytes);
        push("\nendstream\n");
      } else {
        push(String(obj ?? ""));
        push("\n");
      }
      push("endobj\n");
    }
    const xref = length;
    push(`xref\n0 ${objects.length}\n`);
    push("0000000000 65535 f \n");
    for (let i = 1; i < objects.length; i += 1) {
      push(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
    }
    push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return joinBytes(chunks);
  }

  function makeWidths(fontModel) {
    const gids = [...fontModel.used.keys()].sort((a, b) => a - b);
    return gids.map((gid) => `${gid} [${fontModel.width1000(gid)}]`).join(" ");
  }

  function makeToUnicode(fontModel) {
    const entries = [...fontModel.used.entries()].sort((a, b) => a[0] - b[0]);
    const lines = [
      "/CIDInit /ProcSet findresource begin",
      "12 dict begin",
      "begincmap",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
      "/CMapName /CAS-Identity-UCS def",
      "/CMapType 2 def",
      "1 begincodespacerange",
      "<0000> <FFFF>",
      "endcodespacerange"
    ];
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      lines.push(`${chunk.length} beginbfchar`);
      for (const [gid, cp] of chunk) {
        lines.push(`<${gid.toString(16).padStart(4, "0").toUpperCase()}> <${utf16beHex(cp)}>`);
      }
      lines.push("endbfchar");
    }
    lines.push(
      "endcmap",
      "CMapName currentdict /CMap defineresource pop",
      "end",
      "end"
    );
    return lines.join("\n");
  }

  function xmlEsc(v) {
    return String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" })[ch]);
  }

  function createEmbeddedPdfBytes({
    artwork, geometry, computed, codeModel, qrMatrix, mode = "production",
    fontBytes, iccBytes = null, outputIntent = null
  }) {
    const fontModel = parseTrueTypeFont(fontBytes);
    const widthPt = mm(geometry.totalWidth);
    const heightPt = mm(geometry.totalHeight);
    const streamText = buildArtworkOps(artwork, geometry, computed, codeModel, { mode, qrMatrix, fontModel });
    const stream = new TextEncoder().encode(streamText);
    const toUnicode = new TextEncoder().encode(makeToUnicode(fontModel));
    const fontFile = fontModel.bytes;
    const widths = makeWidths(fontModel);
    const bbox = fontModel.bbox.join(" ");
    const hasIcc = iccBytes instanceof Uint8Array && iccBytes.length > 0;
    const objects = new Array(hasIcc ? 13 : 10);
    objects[1] = hasIcc
      ? "<< /Type /Catalog /Pages 2 0 R /OutputIntents [10 0 R] /Metadata 12 0 R >>"
      : "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(3)} ${heightPt.toFixed(3)}] /TrimBox [0 0 ${widthPt.toFixed(3)} ${heightPt.toFixed(3)}] /BleedBox [0 0 ${widthPt.toFixed(3)} ${heightPt.toFixed(3)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`;
    objects[4] = makeStream("", stream);
    objects[5] = "<< /Type /Font /Subtype /Type0 /BaseFont /CASEmbeddedFont /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 9 0 R >>";
    objects[6] = `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /CASEmbeddedFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /CIDToGIDMap /Identity /DW 1000 /W [${widths}] >>`;
    objects[7] = `<< /Type /FontDescriptor /FontName /CASEmbeddedFont /Flags 32 /FontBBox [${bbox}] /ItalicAngle 0 /Ascent ${fontModel.ascent} /Descent ${fontModel.descent} /CapHeight ${fontModel.ascent} /StemV 80 /FontFile2 8 0 R >>`;
    objects[8] = makeStream(`/Length1 ${fontFile.length}`, fontFile);
    objects[9] = makeStream("", toUnicode);

    if (hasIcc) {
      const oi = outputIntent || {};
      const identifier = escPdfText(oi.identifier || "Custom");
      const info = escPdfText(oi.info || oi.identifier || "Custom ICC Output Profile");
      const registry = escPdfText(oi.registryName || "https://www.color.org");
      objects[10] = `<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (${identifier}) /RegistryName (${registry}) /Info (${info}) /DestOutputProfile 11 0 R >>`;
      const n = Number(oi.components || 4);
      objects[11] = makeStream(`/N ${[1,3,4].includes(n)?n:4}`, iccBytes);
      const pdfx = xmlEsc(oi.pdfxVersion || "PDF/X-4");
      const title = xmlEsc(oi.title || "Carton Artwork Production");
      const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/"><pdfxid:GTS_PDFXVersion>${pdfx}</pdfxid:GTS_PDFXVersion><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
      objects[12] = makeStream("/Type /Metadata /Subtype /XML", new TextEncoder().encode(xmp));
    }
    return buildBinaryPdf(objects, hasIcc ? "1.6" : "1.4");
  }

  function createPdfBytes({
    artwork, geometry, computed, codeModel, qrMatrix, mode = "production",
    fontBytes = null, iccBytes = null, outputIntent = null
  }) {
    if (fontBytes) return createEmbeddedPdfBytes({ artwork, geometry, computed, codeModel, qrMatrix, mode, fontBytes, iccBytes, outputIntent });
    const widthPt = mm(geometry.totalWidth);
    const heightPt = mm(geometry.totalHeight);
    const stream = buildArtworkOps(artwork, geometry, computed, codeModel, { mode, qrMatrix });
    const objects = [];

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(3)} ${heightPt.toFixed(3)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`;
    objects[4] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
    objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

    let pdf = "%PDF-1.4\n%CAS4\n";
    const offsets = [0];

    for (let i = 1; i <= 5; i += 1) {
      offsets[i] = new TextEncoder().encode(pdf).length;
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xref = new TextEncoder().encode(pdf).length;
    pdf += "xref\n0 6\n";
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= 5; i += 1) {
      pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
  }

  function createPdfBlob(args) {
    return new Blob([createPdfBytes(args)], { type: "application/pdf" });
  }

  return {
    PT_PER_MM,
    mmToPt: mm,
    textOp,
    rectOp,
    lineOp,
    parseTrueTypeFont,
    createEmbeddedPdfBytes,
    createPdfBytes,
    createPdfBlob
  };
});
