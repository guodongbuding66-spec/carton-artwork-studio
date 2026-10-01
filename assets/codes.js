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

  const ITF_DIGIT_PATTERNS = {
    "0":"nnwwn","1":"wnnnw","2":"nwnnw","3":"wwnnn","4":"nnwnw",
    "5":"wnwnn","6":"nwwnn","7":"nnnww","8":"wnnwn","9":"nwnwn"
  };

  function gs1CheckDigit(body) {
    const digits=String(body||"");
    if(!/^\d+$/.test(digits)) throw new Error("GS1 check digit input must contain digits only.");
    let sum=0,weight=3;
    for(let i=digits.length-1;i>=0;i-=1){
      sum+=Number(digits[i])*weight;
      weight=weight===3?1:3;
    }
    return String((10-(sum%10))%10);
  }

  function normalizeItf14(text) {
    const digits=String(text||"").replace(/[\s-]+/g,"");
    if(!/^\d+$/.test(digits)) throw new Error("ITF-14 accepts numeric GTIN data only.");
    if(digits.length===13) return digits+gs1CheckDigit(digits);
    if(digits.length!==14) throw new Error("ITF-14 requires 13 GTIN digits plus calculated check digit, or a complete 14-digit GTIN.");
    const expected=gs1CheckDigit(digits.slice(0,13));
    if(digits[13]!==expected) throw new Error(`ITF-14 check digit invalid; expected ${expected}.`);
    return digits;
  }

  function itf14Bars(text, options = {}) {
    const payload=normalizeItf14(text);
    const moduleMm=Number(options.moduleMm??0.8);
    const wideRatio=Number(options.wideRatio??2.5);
    const heightMm=Number(options.heightMm??32);
    const quietModules=Number(options.quietModules??10);
    const bearerBars=options.bearerBars!==false;
    const bearerBarThicknessMm=Number(options.bearerBarThicknessMm??Math.max(moduleMm*2,2.032));
    if(!Number.isFinite(moduleMm)||moduleMm<=0) throw new Error("ITF-14 module width must be positive.");
    if(!Number.isFinite(wideRatio)||wideRatio<2.25||wideRatio>3) throw new Error("ITF-14 wide:narrow ratio must be between 2.25:1 and 3.0:1.");
    if(!Number.isFinite(heightMm)||heightMm<=0) throw new Error("ITF-14 bar height must be positive.");
    if(!Number.isFinite(quietModules)||quietModules<10) throw new Error("ITF-14 quiet zones must be at least 10X.");
    if(bearerBars&&(!Number.isFinite(bearerBarThicknessMm)||bearerBarThicknessMm<moduleMm*2)) throw new Error("ITF-14 top/bottom bearer bars must be at least 2X for the non-plate review profile.");
    const widthFor=(kind)=>kind==="w"?moduleMm*wideRatio:moduleMm;
    let x=quietModules*moduleMm;
    const bars=[];
    const addSequence=(sequence)=>{
      let black=true;
      for(const kind of sequence){
        const w=widthFor(kind);
        if(black) bars.push({x,y:0,w,h:heightMm});
        x+=w;
        black=!black;
      }
    };
    addSequence("nnnn");
    for(let i=0;i<payload.length;i+=2){
      const barsPattern=ITF_DIGIT_PATTERNS[payload[i]];
      const spacesPattern=ITF_DIGIT_PATTERNS[payload[i+1]];
      let sequence="";
      for(let j=0;j<5;j+=1) sequence+=barsPattern[j]+spacesPattern[j];
      addSequence(sequence);
    }
    addSequence("wnn");
    const widthMm=x+quietModules*moduleMm;
    return {
      symbology:"ITF-14",
      payload,
      bars,
      widthMm,
      heightMm,
      quietModules,
      moduleMm,
      wideRatio,
      bearerBars,
      bearerBarThicknessMm,
      bearerRects:bearerBars?[
        {x:0,y:-bearerBarThicknessMm,w:widthMm,h:bearerBarThicknessMm},
        {x:0,y:heightMm,w:widthMm,h:bearerBarThicknessMm}
      ]:[],
      checkDigit:payload.at(-1)
    };
  }

  function itf14Svg(text, options = {}) {
    const model=itf14Bars(text,options);
    const hri=options.hri!==false;
    const fontSizeMm=Number(options.fontSizeMm??4);
    const totalH=model.heightMm+(hri?fontSizeMm*1.8:0);
    const topOffset=model.bearerBars?model.bearerBarThicknessMm:0;
    const bars=model.bars.map((b)=>`<rect x="${b.x.toFixed(3)}" y="${topOffset.toFixed(3)}" width="${b.w.toFixed(3)}" height="${b.h.toFixed(3)}" fill="#000"/>`).join("");
    const bearers=model.bearerBars
      ? `<rect x="0" y="0" width="${model.widthMm}" height="${model.bearerBarThicknessMm}" fill="#000"/><rect x="0" y="${(topOffset+model.heightMm).toFixed(3)}" width="${model.widthMm}" height="${model.bearerBarThicknessMm}" fill="#000"/>`
      : "";
    const symbolH=model.heightMm+topOffset*2;
    const hriText=hri
      ? `<text x="${(model.widthMm/2).toFixed(3)}" y="${(symbolH+fontSizeMm*1.25).toFixed(3)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSizeMm}mm" fill="#000">${model.payload}</text>`
      : "";
    return {
      ...model,
      totalHeightMm:symbolH+(hri?fontSizeMm*1.8:0),
      svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.widthMm} ${symbolH+(hri?fontSizeMm*1.8:0)}" width="${model.widthMm}mm" height="${symbolH+(hri?fontSizeMm*1.8:0)}mm">${bearers}${bars}${hriText}</svg>`
    };
  }

  function assertAscii(text) {
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) throw new Error("Code 128-B supports printable ASCII 32..126 in this implementation.");
    }
  }
  const GS1_AI_RULES = Object.freeze({
    "00": { title:"SSCC", fixed:18, numeric:true, checkDigit:true },
    "01": { title:"GTIN", fixed:14, numeric:true, checkDigit:true },
    "02": { title:"CONTENT", fixed:14, numeric:true, checkDigit:true },
    "10": { title:"BATCH/LOT", max:20, variable:true },
    "11": { title:"PROD DATE", fixed:6, numeric:true },
    "13": { title:"PACK DATE", fixed:6, numeric:true },
    "15": { title:"BEST BEFORE", fixed:6, numeric:true },
    "17": { title:"USE BY", fixed:6, numeric:true },
    "21": { title:"SERIAL", max:20, variable:true },
    "37": { title:"COUNT", max:8, variable:true, numeric:true }
  });

  function normalizeGs1Identifier(value) {
    return String(value||"").replace(/[\s-]+/g,"");
  }

  function validateGs1CheckDigit(data, ai) {
    const digits=normalizeGs1Identifier(data);
    if(digits.length<2||!/^[0-9]+$/.test(digits)) throw new Error(`AI (${ai}) must contain digits only.`);
    const expected=gs1CheckDigit(digits.slice(0,-1));
    if(digits.at(-1)!==expected) throw new Error(`AI (${ai}) check digit invalid; expected ${expected}.`);
  }

  function parseGs1AiText(text) {
    const source=String(text||"").trim();
    if(!source) throw new Error("GS1-128 payload is empty.");
    const re=/\((\d{2,4})\)/g;
    const matches=[...source.matchAll(re)];
    if(!matches.length||matches[0].index!==0) {
      throw new Error("GS1-128 payload must use AI syntax such as (00)SSCC or (01)GTIN(10)LOT.");
    }
    const elements=[];
    for(let i=0;i<matches.length;i+=1){
      const ai=matches[i][1];
      const rule=GS1_AI_RULES[ai];
      if(!rule) throw new Error(`Unsupported GS1 Application Identifier (${ai}).`);
      const dataStart=matches[i].index+matches[i][0].length;
      const dataEnd=i+1<matches.length?matches[i+1].index:source.length;
      const raw=source.slice(dataStart,dataEnd);
      const data=raw.trim();
      if(!data) throw new Error(`AI (${ai}) data is empty.`);
      if(rule.numeric&&!/^\d+$/.test(data)) throw new Error(`AI (${ai}) requires numeric data.`);
      if(rule.fixed&&data.length!==rule.fixed) throw new Error(`AI (${ai}) requires exactly ${rule.fixed} characters.`);
      if(rule.max&&data.length>rule.max) throw new Error(`AI (${ai}) allows at most ${rule.max} characters.`);
      if(rule.checkDigit) validateGs1CheckDigit(data,ai);
      if(!rule.numeric) assertAscii(data);
      elements.push({ai,data,rule});
    }
    return elements;
  }

  function gs1HumanReadable(elements) {
    return elements.map((e)=>`(${e.ai})${e.data}`).join("");
  }

  function gs1Code128Values(text) {
    const elements=parseGs1AiText(text);
    const values=[104,102]; // Start B + FNC1 declares GS1-128.
    for(let i=0;i<elements.length;i+=1){
      const e=elements[i];
      const raw=e.ai+e.data;
      assertAscii(raw);
      for(const ch of raw) values.push(ch.charCodeAt(0)-32);
      if(e.rule.variable&&i<elements.length-1) values.push(102);
    }
    let checksum=104;
    for(let i=1;i<values.length;i+=1) checksum+=values[i]*i;
    checksum%=103;
    values.push(checksum,106);
    return {values,elements,hri:gs1HumanReadable(elements)};
  }

  function code128BarsFromValues(values, options={}) {
    const quiet=Number(options.quietModules??10);
    const moduleMm=Number(options.moduleMm??0.45);
    const heightMm=Number(options.heightMm??24);
    let x=quiet*moduleMm;
    let black=true;
    const bars=[];
    for(const value of values){
      const pattern=CODE128_PATTERNS[value];
      if(!pattern) throw new Error(`Invalid Code 128 value ${value}.`);
      for(const widthDigit of pattern){
        const w=Number(widthDigit)*moduleMm;
        if(black) bars.push({x,y:0,w,h:heightMm});
        x+=w;
        black=!black;
      }
    }
    return {bars,widthMm:x+quiet*moduleMm,heightMm,quietModules:quiet,moduleMm};
  }

  function gs1_128Bars(text, options={}) {
    const model=gs1Code128Values(text);
    const resolved={
      moduleMm:Number(options.moduleMm??0.495),
      heightMm:Number(options.heightMm??31.75),
      quietModules:Number(options.quietModules??10)
    };
    if(resolved.moduleMm<0.495||resolved.moduleMm>0.94) throw new Error("GS1-128 logistics profile X-dimension must be 0.495–0.940 mm.");
    if(resolved.heightMm<31.75) throw new Error("GS1-128 logistics profile bar height must be at least 31.75 mm.");
    if(resolved.quietModules<10) throw new Error("GS1-128 quiet zones must be at least 10X.");
    return {
      symbology:"GS1-128",
      ...code128BarsFromValues(model.values,resolved),
      values:model.values,
      elements:model.elements,
      payload:model.hri,
      hri:model.hri
    };
  }

  function normalizeSscc(value) {
    const digits=normalizeGs1Identifier(value);
    if(!/^\d+$/.test(digits)) throw new Error("SSCC accepts digits only.");
    if(digits.length===17) return digits+gs1CheckDigit(digits);
    if(digits.length!==18) throw new Error("SSCC requires 17 digits plus calculated check digit, or a complete 18-digit SSCC.");
    validateGs1CheckDigit(digits,"00");
    return digits;
  }

  function ssccGs1Text(value) {
    return `(00)${normalizeSscc(value)}`;
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
    gs1CheckDigit,
    normalizeItf14,
    itf14Bars,
    itf14Svg,
    GS1_AI_RULES,
    parseGs1AiText,
    gs1Code128Values,
    gs1_128Bars,
    normalizeSscc,
    ssccGs1Text,
    qrMatrix,
    qrPreviewMatrix,
    qrPreviewSvg
  };
});
