import assert from "node:assert/strict";
import { renderEmbeddedArtworkPdf, prepareProductionCustomElements } from "../worker/production-renderer.js";

function putU16(b,o,v){b[o]=(v>>>8)&255;b[o+1]=v&255;}
function putI16(b,o,v){putU16(b,o,v<0?0x10000+v:v);}
function putU32(b,o,v){b[o]=(v>>>24)&255;b[o+1]=(v>>>16)&255;b[o+2]=(v>>>8)&255;b[o+3]=v&255;}
function tagBytes(tag){return [...tag].map(ch=>ch.charCodeAt(0));}
function align4(n){return (n+3)&~3;}

function makeSyntheticTrueType(){
  const tables=[];
  const head=new Uint8Array(54);
  putU32(head,0,0x00010000);
  putU16(head,18,1000);
  putI16(head,36,0);putI16(head,38,-200);putI16(head,40,1000);putI16(head,42,800);
  putI16(head,50,0);
  tables.push(["head",head]);

  const hhea=new Uint8Array(36);
  putU32(hhea,0,0x00010000);
  putI16(hhea,4,800);putI16(hhea,6,-200);
  putU16(hhea,34,128);
  tables.push(["hhea",hhea]);

  const hmtx=new Uint8Array(128*4);
  for(let i=0;i<128;i++){putU16(hmtx,i*4,600);putI16(hmtx,i*4+2,0);}
  tables.push(["hmtx",hmtx]);

  const maxp=new Uint8Array(6);
  putU32(maxp,0,0x00010000);putU16(maxp,4,128);
  tables.push(["maxp",maxp]);

  const cmap=new Uint8Array(12+32);
  putU16(cmap,0,0);putU16(cmap,2,1);
  putU16(cmap,4,3);putU16(cmap,6,1);putU32(cmap,8,12);
  const s=12;
  putU16(cmap,s,4);putU16(cmap,s+2,32);putU16(cmap,s+4,0);
  putU16(cmap,s+6,4);putU16(cmap,s+8,4);putU16(cmap,s+10,1);putU16(cmap,s+12,0);
  putU16(cmap,s+14,126);putU16(cmap,s+16,0xffff);putU16(cmap,s+18,0);
  putU16(cmap,s+20,32);putU16(cmap,s+22,0xffff);
  putI16(cmap,s+24,0);putI16(cmap,s+26,1);
  putU16(cmap,s+28,0);putU16(cmap,s+30,0);
  tables.push(["cmap",cmap]);

  tables.push(["glyf",new Uint8Array(0)]);
  tables.push(["loca",new Uint8Array((128+1)*2)]);

  const num=tables.length;
  let offset=12+num*16;
  const layout=tables.map(([tag,data])=>{
    offset=align4(offset);
    const item={tag,data,offset,length:data.length};
    offset+=data.length;
    return item;
  });
  const out=new Uint8Array(align4(offset));
  putU32(out,0,0x00010000);putU16(out,4,num);
  let p=12;
  for(const t of layout){
    out.set(tagBytes(t.tag),p);
    putU32(out,p+4,0);
    putU32(out,p+8,t.offset);
    putU32(out,p+12,t.length);
    out.set(t.data,t.offset);
    p+=16;
  }
  return out;
}

const snapshot={
  order:{contractNo:"HT24010213",market:"US"},
  product:{sku:"KF210215US-02PM-001"},
  package:{total:3,index:1,netWeight:74.1,grossWeight:80.7,length:47.24,width:23.62,height:7.87,weightUnit:"LBS",dimensionUnit:"INCH"},
  factory:{id:"factory-real",name:"Factory Real",crn:"3203960FM4",country:"China"},
  origin:{country:"China"},
  codes:{barcode:"KF210215US02PM001",qr:"https://example.com/KF210215US-02PM-001",profile:"250x80"},
  template:{code:"US_SIDE_SEAL",version:"2026.05.20",printProfile:"US_SIDE_SEAL_K_ONLY_V1"},
  artwork:{revision:"R03",status:"approved"}
};

function makeSyntheticCmykIcc(){
  const icc=new Uint8Array(132);
  putU32(icc,0,132);
  icc[8]=4;icc[9]=0x30;
  icc.set(new TextEncoder().encode("prtr"),12);
  icc.set(new TextEncoder().encode("CMYK"),16);
  icc.set(new TextEncoder().encode("XYZ "),20);
  icc.set(new TextEncoder().encode("acsp"),36);
  putU32(icc,128,0);
  return icc;
}

const customSnapshot={
  ...snapshot,
  artwork:{
    ...snapshot.artwork,
    safeMarginMm:22,
    elements:[{
      id:"custom-visible",type:"text",name:"Bound SKU",visible:true,
      x:260,y:1060,w:180,h:20,rotation:0,locked:false,
      panelId:"TOP_FACE",constrainToPanel:true,safeAreaExempt:false,
      bindingKey:"product.sku",text:"",fontSizePt:10,fontWeight:"normal",textAlign:"left",
      wrapText:false,lineHeight:1.2,autoFitText:true,minFontSizePt:7,
      blockType:"",blockVersion:""
    }]
  }
};
const customRendered=renderEmbeddedArtworkPdf({snapshot:customSnapshot,fontBytes:makeSyntheticTrueType(),qrEcc:"M",mode:"production"});
assert.ok(customRendered.bytes.length>0);
assert.equal(customRendered.customElements.count,1);
assert.deepEqual(customRendered.customElements.types,["text"]);
assert.equal(customRendered.artwork.elements[0].text,"KF210215US-02PM-001");

const boldSnapshot={
  ...customSnapshot,
  artwork:{
    ...customSnapshot.artwork,
    elements:[{...customSnapshot.artwork.elements[0],id:"bold-custom",fontWeight:"bold"}]
  }
};
assert.throws(
  ()=>renderEmbeddedArtworkPdf({snapshot:boldSnapshot,fontBytes:makeSyntheticTrueType(),qrEcc:"M",mode:"production"}),
  (e)=>e?.code==="PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED"&&e?.detail?.[0]?.reason==="CUSTOM_BOLD_FONT_NOT_QUALIFIED"
);

const uploadedSnapshot={
  ...customSnapshot,
  artwork:{
    ...customSnapshot.artwork,
    elements:[{
      id:"uploaded-logo",type:"image",name:"Logo",visible:true,
      x:260,y:1060,w:60,h:30,rotation:0,locked:false,
      panelId:"TOP_FACE",constrainToPanel:true,safeAreaExempt:false,
      sourceType:"uploaded-vector",vectorDataUrl:"data:image/svg+xml;base64,PHN2Zy8+",
      dataUrl:"data:image/jpeg;base64,AA==",pixelWidth:1800,pixelHeight:900
    }]
  }
};
assert.throws(
  ()=>renderEmbeddedArtworkPdf({snapshot:uploadedSnapshot,fontBytes:makeSyntheticTrueType(),qrEcc:"M",mode:"production"}),
  (e)=>e?.code==="PRODUCTION_CUSTOM_ELEMENTS_NOT_QUALIFIED"&&e?.detail?.[0]?.reason==="UPLOADED_GRAPHIC_NOT_PRODUCTION_QUALIFIED"
);

const preparedText=prepareProductionCustomElements(customRendered.artwork,[{
  id:"factory-real",name:"Factory Real",crn:"3203960FM4",country:"China"
}]);
assert.equal(preparedText[0].renderLines.length,1);

const generatedSnapshot={
  ...snapshot,
  artwork:{
    ...snapshot.artwork,
    safeMarginMm:22,
    elements:[
      {
        id:"custom-qr",type:"qr-generated",name:"QR",visible:true,
        x:260,y:1060,w:45,h:45,rotation:0,locked:false,panelId:"TOP_FACE",constrainToPanel:true,safeAreaExempt:false,
        payload:"https://example.com/custom",bindingKey:"",ecc:"M"
      },
      {
        id:"custom-code",type:"barcode",name:"Case Code",visible:true,
        x:360,y:1060,w:100,h:40,rotation:0,locked:false,panelId:"TOP_FACE",constrainToPanel:true,safeAreaExempt:false,
        payload:"CASE123456",bindingKey:"",symbology:"CODE128B",humanReadable:true,
        moduleMm:.42,barHeightMm:28,quietModules:10
      }
    ]
  }
};
const generatedRendered=renderEmbeddedArtworkPdf({snapshot:generatedSnapshot,fontBytes:makeSyntheticTrueType(),qrEcc:"M",mode:"production"});
assert.equal(generatedRendered.customElements.count,2);
assert.ok(generatedRendered.customElements.types.includes("qr-generated"));
assert.ok(generatedRendered.customElements.types.includes("barcode"));
assert.ok(generatedRendered.artwork.elements.find(x=>x.id==="custom-code").barcodeModel?.bars?.length>0);

const hiddenCustomSnapshot={
  ...snapshot,
  artwork:{
    ...snapshot.artwork,
    elements:[{id:"custom-hidden",type:"text",visible:false,text:"NOT PRINTED"}]
  }
};

const font=makeSyntheticTrueType();
const hiddenRendered=renderEmbeddedArtworkPdf({snapshot:hiddenCustomSnapshot,fontBytes:font,qrEcc:"M",mode:"production"});
assert.ok(hiddenRendered.bytes.length>0,"Hidden custom elements may remain in canonical history without entering production output");

const rendered=renderEmbeddedArtworkPdf({snapshot,fontBytes:font,qrEcc:"M",mode:"production"});
const latin1=Buffer.from(rendered.bytes).toString("latin1");

assert.ok(latin1.startsWith("%PDF-1.4"));
assert.ok(latin1.includes("/Subtype /Type0"));
assert.ok(latin1.includes("/Subtype /CIDFontType2"));
assert.ok(latin1.includes("/FontFile2"));
assert.ok(latin1.includes("/ToUnicode"));
assert.ok(latin1.includes("/CIDToGIDMap /Identity"));
assert.ok(!latin1.includes("/BaseFont /Helvetica"));
assert.ok(rendered.bytes.length>font.length);
assert.equal(rendered.qr.ecc,"M");
assert.equal(rendered.barcode.symbology,"CODE128-B");

const icc=makeSyntheticCmykIcc();
const candidate=renderEmbeddedArtworkPdf({
  snapshot,
  fontBytes:font,
  iccBytes:icc,
  pdfxProfile:"PDF/X-4",
  outputConditionIdentifier:"TEST-CMYK",
  qrEcc:"M",
  mode:"proof"
});
const candidateText=Buffer.from(candidate.bytes).toString("latin1");
assert.ok(candidateText.startsWith("%PDF-1.6"));
assert.ok(candidateText.includes("/OutputIntents"));
assert.ok(candidateText.includes("/S /GTS_PDFX"));
assert.ok(candidateText.includes("/DestOutputProfile"));
assert.ok(candidateText.includes("/Type /Metadata"));
assert.ok(candidateText.includes("/TrimBox"));
assert.ok(candidateText.includes("/BleedBox"));
assert.ok(candidateText.includes("/GTS_PDFXVersion (PDF/X-4)"));
assert.equal(candidate.pdfxCandidate.profile,"PDF/X-4");
assert.equal(candidate.pdfxCandidate.structural.ok,true);

console.log("Embedded TrueType and PDF/X-4 candidate renderer tests passed.");
