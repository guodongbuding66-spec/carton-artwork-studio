(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CartonZip = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function u16(n){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n,true);return b;}
  function u32(n){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n>>>0,true);return b;}
  function join(parts){const total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
  function bytes(value){
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new TextEncoder().encode(String(value ?? ""));
  }
  function crc32(data){
    let c=0xffffffff;
    for(let i=0;i<data.length;i++){c^=data[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}
    return (c^0xffffffff)>>>0;
  }
  function dosParts(date){
    const d=date instanceof Date?date:new Date(date||Date.now());
    return {
      time:((d.getHours()&31)<<11)|((d.getMinutes()&63)<<5)|((Math.floor(d.getSeconds()/2))&31),
      date:(((Math.max(1980,d.getFullYear())-1980)&127)<<9)|(((d.getMonth()+1)&15)<<5)|(d.getDate()&31)
    };
  }
  function createZipBytes(files, options = {}){
    const enc=new TextEncoder(), locals=[], centrals=[];
    const stamp=dosParts(options.date);
    let offset=0;
    for(const file of files||[]){
      const name=enc.encode(String(file.name||"file"));
      const data=bytes(file.data);
      const crc=crc32(data);
      const local=join([
        u32(0x04034b50),u16(20),u16(0),u16(0),u16(stamp.time),u16(stamp.date),
        u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data
      ]);
      const central=join([
        u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(stamp.time),u16(stamp.date),
        u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name
      ]);
      locals.push(local);centrals.push(central);offset+=local.length;
    }
    const centralSize=centrals.reduce((n,b)=>n+b.length,0);
    const eocd=join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(offset),u16(0)]);
    return join([...locals,...centrals,eocd]);
  }
  function createZipBlob(files, options = {}) {
    return new Blob([createZipBytes(files, options)], { type: "application/zip" });
  }
  return { crc32, createZipBytes, createZipBlob };
});
