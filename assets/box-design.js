(function (root, factory) {
  const domain = root.CartonDomain || (typeof module === "object" && module.exports ? require("./domain.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonBoxDesign = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (D) {
  "use strict";

  if (!D) throw new Error("CartonBoxDesign requires CartonDomain.");

  const MATERIALS = Object.freeze([
    { id:"E_FLUTE_WHITE", label:"E 楞白面瓦楞", family:"Corrugated", nominalThicknessMm:1.5 },
    { id:"B_FLUTE_KRAFT", label:"B 楞牛卡瓦楞", family:"Corrugated", nominalThicknessMm:3.0 },
    { id:"WHITE_CARD_350", label:"350g 白卡", family:"Folding carton", nominalThicknessMm:0.45 },
    { id:"KRAFT_BOARD_350", label:"350g 牛卡", family:"Folding carton", nominalThicknessMm:0.52 }
  ]);

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function n(value, fallback = 0) {
    const num=Number(value);
    return Number.isFinite(num)?num:fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min,Math.min(max,n(value,min)));
  }

  function settings(artwork = {}) {
    const materialId=String(artwork.materialId||"E_FLUTE_WHITE");
    const material=MATERIALS.find((x)=>x.id===materialId)||MATERIALS[0];
    return {
      boxType:String(artwork.boxType||"US_SIDE_SEAL"),
      materialId:material.id,
      material,
      paperThicknessMm:n(artwork.paperThicknessMm,material.nominalThicknessMm),
      bleedMm:n(artwork.bleedMm,3),
      dimensionMode:String(artwork.dimensionMode||"OUTER").toUpperCase()
    };
  }

  function dimensionsMm(artwork = {}) {
    return {
      lengthMm:Math.max(1,D.inchToMm(artwork.length)),
      widthMm:Math.max(1,D.inchToMm(artwork.width)),
      heightMm:Math.max(1,D.inchToMm(artwork.height))
    };
  }

  function metrics(artwork = {}) {
    const g=D.sideSealGeometry(artwork);
    const s=settings(artwork);
    const bleed=Math.max(0,s.bleedMm);
    const sheetWidthMm=g.totalWidth+bleed*2;
    const sheetHeightMm=g.totalHeight+bleed*2;
    const areaM2=(sheetWidthMm*sheetHeightMm)/1000000;
    const dims=dimensionsMm(artwork);
    return {
      ...s,
      ...dims,
      dielineWidthMm:g.totalWidth,
      dielineHeightMm:g.totalHeight,
      sheetWidthMm,
      sheetHeightMm,
      sheetAreaM2:areaM2,
      panelCount:g.panels.length,
      closingTabMm:g.closingTab
    };
  }

  function layerLegend() {
    return [
      { id:"cut",label:"Cut / 裁切线",color:"#18222d",dash:"" },
      { id:"crease",label:"Crease / 压痕线",color:"#e05b76",dash:"7 5" },
      { id:"bleed",label:"Bleed / 出血",color:"#1d9b69",dash:"5 4" },
      { id:"safe",label:"Safe / 安全区",color:"#3181d7",dash:"5 4" },
      { id:"dimension",label:"Dimension / 尺寸",color:"#7257d9",dash:"" }
    ];
  }

  function structureSvg(artwork = {}, options = {}) {
    const g=D.sideSealGeometry(artwork);
    const s=settings(artwork);
    const safe=Math.max(0,n(artwork.safeMarginMm,22));
    const bleed=Math.max(0,s.bleedMm);
    const showBleed=options.showBleed!==false;
    const showSafe=options.showSafe!==false;
    const showPanels=options.showPanels!==false;
    const showDimensions=options.showDimensions!==false;
    const pad=Math.max(55,bleed+45);
    const vb=[-pad,-pad,g.totalWidth+pad*2,g.totalHeight+pad*2].join(" ");

    const cut=`<g data-layer="cut" fill="none" stroke="#18222d" stroke-width="1.1" vector-effect="non-scaling-stroke">
      <rect x="${g.H}" y="0" width="${g.L}" height="${g.totalHeight}"/>
      <rect x="0" y="${g.H}" width="${g.totalWidth}" height="${g.W}"/>
      <rect x="0" y="${g.H+g.W+g.H}" width="${g.totalWidth}" height="${g.W}"/>
    </g>`;

    const creaseY=[g.H,g.H+g.W,g.H+g.W+g.H,g.H+g.W+g.H+g.W];
    const crease=`<g data-layer="crease" fill="none" stroke="#e05b76" stroke-width=".9" stroke-dasharray="7 5" vector-effect="non-scaling-stroke">
      <line x1="${g.H}" y1="0" x2="${g.H}" y2="${g.totalHeight}"/>
      <line x1="${g.H+g.L}" y1="0" x2="${g.H+g.L}" y2="${g.totalHeight}"/>
      ${creaseY.map((y)=>`<line x1="0" y1="${y}" x2="${g.totalWidth}" y2="${y}"/>`).join("")}
    </g>`;

    const bleedLayer=showBleed?`<g data-layer="bleed" fill="none" stroke="#1d9b69" stroke-width=".8" stroke-dasharray="5 4" opacity=".9" vector-effect="non-scaling-stroke">
      <rect x="${g.H-bleed}" y="${-bleed}" width="${g.L+bleed*2}" height="${g.totalHeight+bleed*2}"/>
      <rect x="${-bleed}" y="${g.H-bleed}" width="${g.totalWidth+bleed*2}" height="${g.W+bleed*2}"/>
      <rect x="${-bleed}" y="${g.H+g.W+g.H-bleed}" width="${g.totalWidth+bleed*2}" height="${g.W+bleed*2}"/>
    </g>`:"";

    const safeLayer=showSafe?`<g data-layer="safe" fill="none" stroke="#3181d7" stroke-width=".8" stroke-dasharray="5 4" opacity=".82" vector-effect="non-scaling-stroke">
      ${g.panels.map((p)=>{
        const w=Math.max(0,p.w-safe*2),h=Math.max(0,p.h-safe*2);
        return `<rect x="${p.x+safe}" y="${p.y+safe}" width="${w}" height="${h}"/>`;
      }).join("")}
    </g>`:"";

    const panelLabels=showPanels?`<g data-layer="panels" font-family="Arial,Helvetica,sans-serif" fill="#9aa6b2" font-size="12">
      ${g.panels.map((p)=>`<text x="${p.x+p.w/2}" y="${p.y+p.h/2}" text-anchor="middle">${esc(p.id)}</text>`).join("")}
    </g>`:"";

    const dims=showDimensions?`<g data-layer="dimensions" fill="none" stroke="#7257d9" stroke-width=".8" vector-effect="non-scaling-stroke" font-family="Arial,Helvetica,sans-serif" font-size="11">
      <defs><marker id="box-dim-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M7 0 L0 3.5 L7 7" fill="none" stroke="#7257d9" stroke-width="1"/></marker></defs>
      <line x1="${g.H}" y1="-22" x2="${g.H+g.L}" y2="-22" marker-start="url(#box-dim-arrow)" marker-end="url(#box-dim-arrow)"/>
      <text x="${g.H+g.L/2}" y="-28" text-anchor="middle" fill="#7257d9" stroke="none">L ${D.round(g.L,1)} mm</text>
      <line x1="${g.H+g.L+18}" y1="${g.H}" x2="${g.H+g.L+18}" y2="${g.H+g.W}" marker-start="url(#box-dim-arrow)" marker-end="url(#box-dim-arrow)"/>
      <text x="${g.H+g.L+26}" y="${g.H+g.W/2}" fill="#7257d9" stroke="none">W ${D.round(g.W,1)} mm</text>
      <line x1="-24" y1="0" x2="-24" y2="${g.H}" marker-start="url(#box-dim-arrow)" marker-end="url(#box-dim-arrow)"/>
      <text x="-34" y="${g.H/2}" text-anchor="end" fill="#7257d9" stroke="none">H ${D.round(g.H,1)} mm</text>
    </g>`:"";

    const meta=`<g data-layer="meta" font-family="Arial,Helvetica,sans-serif" fill="#52606d">
      <text x="${g.H}" y="${g.totalHeight+28}" font-size="11">${esc(s.boxType)} · ${esc(s.material.label)} · ${D.round(s.paperThicknessMm,2)} mm · Bleed ${D.round(bleed,1)} mm</text>
      <text x="${g.H}" y="${g.totalHeight+44}" font-size="9" fill="#8994a1">Technical preview · canonical geometry remains US_SIDE_SEAL</text>
    </g>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" data-box-dieline="US_SIDE_SEAL" viewBox="${vb}" width="${g.totalWidth}mm" height="${g.totalHeight}mm" aria-label="Parametric carton dieline">
      <rect x="${-pad}" y="${-pad}" width="${g.totalWidth+pad*2}" height="${g.totalHeight+pad*2}" fill="#fff"/>
      ${bleedLayer}${cut}${crease}${safeLayer}${panelLabels}${dims}${meta}
    </svg>`;
  }

  function faceLabel(name, subtitle = "") {
    return `<span class="box3d-face-name">${esc(name)}</span>${subtitle?`<small>${esc(subtitle)}</small>`:""}`;
  }

  function preview3dMarkup(artwork = {}, view = {}) {
    const m=metrics(artwork);
    const maxDim=Math.max(m.lengthMm,m.widthMm,m.heightMm,1);
    const scale=Math.min(1.05,320/maxDim);
    const bw=clamp(m.lengthMm*scale,150,360);
    const bd=clamp(m.widthMm*scale,80,250);
    const bh=clamp(m.heightMm*scale,70,230);
    const rx=n(view.rotateX,-18);
    const ry=n(view.rotateY,-32);
    const materialClass=String(m.materialId).toLowerCase().replace(/[^a-z0-9_-]+/g,"-");
    const sku=String(artwork.sku||"");
    return `<div class="box3d-stage" data-box3d-stage>
      <div class="box3d-grid"></div>
      <div class="box3d-object material-${esc(materialClass)}" data-box3d-object
        style="--bw:${bw.toFixed(1)}px;--bh:${bh.toFixed(1)}px;--bd:${bd.toFixed(1)}px;transform:rotateX(${rx}deg) rotateY(${ry}deg)">
        <div class="box3d-face box3d-front">${faceLabel("FRONT",sku)}</div>
        <div class="box3d-face box3d-back">${faceLabel("BACK")}</div>
        <div class="box3d-face box3d-left">${faceLabel("LEFT")}</div>
        <div class="box3d-face box3d-right">${faceLabel("RIGHT")}</div>
        <div class="box3d-face box3d-top">${faceLabel("TOP",artwork.templateCode||"")}</div>
        <div class="box3d-face box3d-bottom">${faceLabel("BOTTOM")}</div>
      </div>
      <div class="box3d-axis"><span>X</span><span>Y</span><span>Z</span></div>
    </div>`;
  }

  return {
    MATERIALS,
    settings,
    dimensionsMm,
    metrics,
    layerLegend,
    structureSvg,
    preview3dMarkup
  };
});
