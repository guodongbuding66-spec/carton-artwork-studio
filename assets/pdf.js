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

    ops.push(textOp(baseX, baseY, 13, artwork.sku));
    ops.push(textOp(baseX, baseY - 9, 10, `N.W. ${artwork.netWeight} LBS   G.W. ${artwork.grossWeight} LBS`));
    ops.push(textOp(baseX, baseY - 17, 10, `Package Meas ${computed.packageMeas}`));
    ops.push(textOp(baseX, baseY - 25, 10, `CRN ${computed.crn}`));
    ops.push(textOp(baseX, baseY - 33, 10, `Contract No ${artwork.contractNo}`));
    ops.push(textOp(baseX, baseY - 41, 10, computed.originText));
    ops.push(textOp(baseX, baseY - 49, 10, artwork.market || "US"));

    if (computed.packageNote) {
      ops.push(textOp(baseX, baseY - 63, 9, computed.packageNote));
    }

    // Second CRN occurrence on a side panel.
    ops.push(textOp(H * 0.55, H + W * 0.5, 9, `CRN ${computed.crn}`, 90));

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
      ops.push(textOp(codeX + 10, codeY + 7, 7.5, artwork.barcode));
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
      ops.push(textOp(H + L * 0.25, geometry.totalHeight * 0.52, 34, "NOT FOR PRODUCTION", 15));
      ops.push("0 g");
    }

    return ops.join("\n");
  }

  function createPdfBytes({ artwork, geometry, computed, codeModel, qrMatrix, mode = "production" }) {
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
    createPdfBytes,
    createPdfBlob
  };
});
