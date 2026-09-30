import assert from "node:assert/strict";
import { renderEmbeddedArtworkPdf } from "../worker/production-renderer.js";

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

const font=makeSyntheticTrueType();
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

console.log("Embedded TrueType production renderer tests passed.");
