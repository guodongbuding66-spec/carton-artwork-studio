function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start,start+length));
}

function u16be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset+1];
}

function u32be(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset+1] << 16) + (bytes[offset+2] << 8) + bytes[offset+3]) >>> 0;
}

export function inspectFont(bytesLike) {
  const bytes=bytesLike instanceof Uint8Array?bytesLike:new Uint8Array(bytesLike||[]);
  const errors=[];
  if(bytes.length<12) return {ok:false,errors:["Font asset is too small."],metadata:{}};
  const sig=ascii(bytes,0,4);
  const isTrueType=bytes[0]===0x00&&bytes[1]===0x01&&bytes[2]===0x00&&bytes[3]===0x00;
  const isOpenType=sig==="OTTO";
  const isAppleTrue=sig==="true";
  const isType1=sig==="typ1";
  if(!isTrueType&&!isOpenType&&!isAppleTrue&&!isType1) errors.push("Unsupported or invalid SFNT font signature.");
  const numTables=u16be(bytes,4);
  if(numTables<1||numTables>4096) errors.push("Font table count is invalid.");
  const expectedDirectoryEnd=12+numTables*16;
  if(expectedDirectoryEnd>bytes.length) {
    errors.push("Font table directory exceeds file size.");
  } else {
    const tags=new Set();
    for(let i=0;i<numTables;i+=1){
      const p=12+i*16;
      const tag=ascii(bytes,p,4);
      const offset=u32be(bytes,p+8);
      const length=u32be(bytes,p+12);
      if(!/^[ -~]{4}$/.test(tag)) errors.push(`Font table ${i} has an invalid tag.`);
      if(tags.has(tag)) errors.push(`Font table tag ${tag} is duplicated.`);
      tags.add(tag);
      if(offset>bytes.length||length>bytes.length||offset+length>bytes.length){
        errors.push(`Font table ${tag||i} exceeds file size.`);
      }
    }
  }
  return {
    ok:errors.length===0,
    errors,
    metadata:{
      container:isOpenType?"OpenType/CFF":isTrueType?"TrueType":isAppleTrue?"TrueType-Apple":isType1?"Type1-SFNT":"UNKNOWN",
      numTables,
      signature:isTrueType?"00010000":sig
    }
  };
}

export function inspectIcc(bytesLike) {
  const bytes=bytesLike instanceof Uint8Array?bytesLike:new Uint8Array(bytesLike||[]);
  const errors=[];
  if(bytes.length<132) return {ok:false,errors:["ICC profile is smaller than header + tag-count minimum."],metadata:{}};
  const declaredSize=u32be(bytes,0);
  const signature=ascii(bytes,36,4);
  if(signature!=="acsp") errors.push("ICC header signature 'acsp' is missing.");
  if(declaredSize<132) errors.push("ICC declared size is invalid.");
  if(declaredSize>bytes.length) errors.push("ICC declared size exceeds uploaded file size.");
  const tagCount=u32be(bytes,128);
  const tagTableEnd=132+tagCount*12;
  if(tagCount>4096) errors.push("ICC tag count is unreasonable.");
  if(tagTableEnd>bytes.length) errors.push("ICC tag table exceeds uploaded file size.");
  const major=bytes[8]||0;
  const minor=((bytes[9]||0)>>4)&0x0f;
  const bugfix=(bytes[9]||0)&0x0f;
  return {
    ok:errors.length===0,
    errors,
    metadata:{
      declaredSize,
      actualSize:bytes.length,
      profileClass:ascii(bytes,12,4).trim(),
      colorSpace:ascii(bytes,16,4).trim(),
      pcs:ascii(bytes,20,4).trim(),
      signature,
      version:`${major}.${minor}.${bugfix}`,
      tagCount
    }
  };
}

export function inspectProductionAsset(type, bytes) {
  const t=String(type||"").toUpperCase();
  if(t==="FONT") return inspectFont(bytes);
  if(t==="ICC_PROFILE") return inspectIcc(bytes);
  return {ok:false,errors:["Unsupported production asset type."],metadata:{}};
}

export function safeAssetCode(value) {
  return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9_.-]+/g,"_");
}
