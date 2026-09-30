(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonCodes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CODE128_PATTERNS = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];

  function assertAscii(text) {
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) throw new Error("Code 128-B supports printable ASCII 32..126 in this implementation.");
    }
  }

  function code128Values(text) {
    const input = String(text || "");
    assertAscii(input);
    const values = [104];
    for (const ch of input) values.push(ch.charCodeAt(0) - 32);
    let checksum = 104;
    for (let i = 1; i < values.length; i += 1) checksum += values[i] * i;
    checksum %= 103;
    values.push(checksum, 106);
    return values;
  }

  function code128Modules(text) {
    return code128Values(text).map((v) => CODE128_PATTERNS[v]).join("");
  }

  function code128Bars(text, options = {}) {
    const modules = code128Modules(text);
    const quiet = Number(options.quietModules ?? 10);
    const moduleMm = Number(options.moduleMm ?? 0.45);
    const heightMm = Number(options.heightMm ?? 24);
    let x = quiet * moduleMm;
    let black = true;
    const bars = [];
    for (const widthDigit of modules) {
      const w = Number(widthDigit) * moduleMm;
      if (black) bars.push({ x, y: 0, w, h: heightMm });
      x += w;
      black = !black;
    }
    const totalWidth = x + quiet * moduleMm;
    return { bars, widthMm: totalWidth, heightMm, quietModules: quiet, moduleMm };
  }

  function code128Svg(text, options = {}) {
    const model = code128Bars(text, options);
    const hri = options.hri !== false;
    const fontSizeMm = Number(options.fontSizeMm ?? 3.3);
    const totalH = model.heightMm + (hri ? fontSizeMm * 1.8 : 0);
    const bars = model.bars.map((b) =>
      `<rect x="${b.x.toFixed(3)}" y="0" width="${b.w.toFixed(3)}" height="${b.h.toFixed(3)}" fill="#000"/>`
    ).join("");
    const hriText = hri
      ? `<text x="${(model.widthMm / 2).toFixed(3)}" y="${(model.heightMm + fontSizeMm * 1.25).toFixed(3)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSizeMm}mm" fill="#000">${escapeXml(text)}</text>`
      : "";
    return {
      ...model,
      totalHeightMm: totalH,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.widthMm} ${totalH}" width="${model.widthMm}mm" height="${totalH}mm">${bars}${hriText}</svg>`
    };
  }

  function escapeXml(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;" })[c]);
  }

  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * Standards-based QR matrix using Kazuhiko Arase's MIT qrcode-generator.
   * Type number 0 selects the smallest QR version that fits the payload.
   */
  function qrMatrix(text, errorCorrectionLevel = "M") {
    const factory = typeof globalThis !== "undefined" ? globalThis.qrcode : null;
    if (typeof factory !== "function") throw new Error("QR encoder is not loaded.");
    if (factory.stringToBytesFuncs?.["UTF-8"]) factory.stringToBytes = factory.stringToBytesFuncs["UTF-8"];
    const ecc = ["L","M","Q","H"].includes(errorCorrectionLevel) ? errorCorrectionLevel : "M";
    const qr = factory(0, ecc);
    qr.addData(String(text ?? ""), "Byte");
    qr.make();
    const n = qr.getModuleCount();
    const matrix = Array.from({ length: n }, (_, row) =>
      Array.from({ length: n }, (_, col) => Boolean(qr.isDark(row, col)))
    );
    return { matrix, errorCorrectionLevel: ecc, version: (n - 17) / 4 };
  }

  function qrPreviewMatrix(text, sizeOrLevel = "M") {
    const ecc = typeof sizeOrLevel === "string" ? sizeOrLevel : "M";
    return qrMatrix(text, ecc).matrix;
  }

  function qrPreviewSvg(text, options = {}) {
    const model = qrMatrix(text, options.errorCorrectionLevel || "M");
    const matrix = model.matrix;
    const moduleMm = Number(options.moduleMm ?? 1.8);
    const quiet = Number(options.quietModules ?? 4);
    const n = matrix.length;
    const side = (n + quiet * 2) * moduleMm;
    const parts = [];
    for (let r = 0; r < n; r += 1) for (let col = 0; col < n; col += 1) {
      if (matrix[r][col]) {
        const x = (col + quiet) * moduleMm;
        const y = (r + quiet) * moduleMm;
        parts.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${moduleMm}" height="${moduleMm}" fill="#000"/>`);
      }
    }
    return {
      matrix,
      widthMm: side,
      heightMm: side,
      isStandardsCompliant: true,
      errorCorrectionLevel: model.errorCorrectionLevel,
      version: model.version,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}mm" height="${side}mm"><rect width="100%" height="100%" fill="#fff"/>${parts.join("")}</svg>`
    };
  }

  return {
    code128Values,
    code128Modules,
    code128Bars,
    code128Svg,
    qrMatrix,
    qrPreviewMatrix,
    qrPreviewSvg
  };
});
