const MAX_SVG_BYTES=512*1024;
const ALLOWED_TAGS=new Set(["svg","g","path","rect","line","polyline","polygon","circle","ellipse"]);
const BLOCKED_PATTERNS=[
  /<!doctype/i,/<!entity/i,/<script\b/i,/<foreignobject\b/i,/<image\b/i,/<text\b/i,
  /<use\b/i,/<style\b/i,/<filter\b/i,/<mask\b/i,/<pattern\b/i,/<clippath\b/i,
  /<symbol\b/i,/<defs\b/i,/<iframe\b/i,/<a\b/i,/\bhref\s*=/i,/xlink:href\s*=/i,
  /\bstyle\s*=/i,/\bon[a-z]+\s*=/i,/url\s*\(/i,/\btransform\s*=/i
];

function fail(code,detail=""){
  const e=new Error(code);
  e.code=code;
  e.detail=detail;
  throw e;
}

function decodeBase64(value){
  if(typeof atob==="function"){
    const s=atob(value);
    const out=new Uint8Array(s.length);
    for(let i=0;i<s.length;i+=1) out[i]=s.charCodeAt(i)&255;
    return out;
  }
  fail("SVG_BASE64_UNAVAILABLE");
}

function decodeSvgDataUrl(dataUrl){
  const m=/^data:image\/svg\+xml;base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(String(dataUrl||""));
  if(!m) fail("SVG_DATA_URL_INVALID");
  const bytes=decodeBase64(m[1].replace(/\s+/g,""));
  if(!bytes.length||bytes.length>MAX_SVG_BYTES) fail("SVG_SIZE_INVALID",String(bytes.length));
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}

function attrs(text){
  const out={};
  const raw=String(text||"");
  const attrRe=/([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while((m=attrRe.exec(raw))) out[m[1]]=m[3]??m[4]??"";
  const stripped=raw.replace(attrRe," ").replace(/\/\s*$/," ").trim();
  if(stripped) fail("SVG_ATTRIBUTE_SYNTAX_UNSUPPORTED",stripped.slice(0,120));
  return out;
}

function num(v,name){
  const s=String(v??"").trim();
  if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) fail("SVG_NUMBER_INVALID",name);
  const n=Number(s);
  if(!Number.isFinite(n)) fail("SVG_NUMBER_INVALID",name);
  return n;
}

function nums(v,name){
  const parts=String(v??"").trim().split(/[\s,]+/).filter(Boolean);
  return parts.map((x,i)=>num(x,`${name}[${i}]`));
}

function blackOrNone(value,defaultValue){
  const v=String(value??defaultValue??"").trim().toLowerCase().replace(/\s+/g,"");
  if(v==="none") return "none";
  if(v==="black"||v==="#000"||v==="#000000"||v==="rgb(0,0,0)") return "black";
  fail("SVG_COLOR_NOT_K_ONLY",v||"(empty)");
}

function paint(a,{defaultFill="black",defaultStroke="none"}={}){
  const allowed=new Set(["id","fill","stroke","stroke-width","fill-rule"]);
  for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ATTRIBUTE_NOT_ALLOWED",k);
  const fill=blackOrNone(a.fill,defaultFill);
  const stroke=blackOrNone(a.stroke,defaultStroke);
  const strokeWidth=a["stroke-width"]===undefined?1:num(a["stroke-width"],"stroke-width");
  if(strokeWidth<0||strokeWidth>1000) fail("SVG_STROKE_WIDTH_INVALID");
  const fillRule=String(a["fill-rule"]||"nonzero").toLowerCase();
  if(!["nonzero","evenodd"].includes(fillRule)) fail("SVG_FILL_RULE_UNSUPPORTED",fillRule);
  if(fill==="none"&&stroke==="none") fail("SVG_INVISIBLE_ELEMENT");
  return {fill,stroke,strokeWidth,fillRule};
}

function tokenizePath(d){
  const src=String(d||"").trim();
  if(!src) fail("SVG_PATH_EMPTY");
  if(/[Aa]/.test(src)) fail("SVG_PATH_ARC_UNSUPPORTED");
  const tokens=src.match(/[A-Za-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)||[];
  const reconstructed=tokens.join("");
  const compact=src.replace(/[\s,]+/g,"");
  if(reconstructed.toLowerCase()!==compact.toLowerCase()) fail("SVG_PATH_TOKEN_INVALID");
  return tokens;
}

function parsePath(d){
  const t=tokenizePath(d);
  let i=0,cmd="",cx=0,cy=0,sx=0,sy=0,lastC=null,lastQ=null;
  const out=[];
  const isCmd=(x)=>/^[A-Za-z]$/.test(x||"");
  const read=()=>{ if(i>=t.length||isCmd(t[i])) fail("SVG_PATH_NUMBER_EXPECTED"); return Number(t[i++]); };
  const point=(relative,x,y)=>relative?[cx+x,cy+y]:[x,y];

  while(i<t.length){
    if(isCmd(t[i])) cmd=t[i++];
    if(!cmd) fail("SVG_PATH_COMMAND_EXPECTED");
    const rel=cmd===cmd.toLowerCase();
    const up=cmd.toUpperCase();

    if(up==="Z"){
      out.push({op:"Z"});cx=sx;cy=sy;lastC=null;lastQ=null;cmd="";continue;
    }
    if(up==="M"){
      let first=true;
      while(i<t.length&&!isCmd(t[i])){
        const [x,y]=point(rel,read(),read());
        out.push({op:first?"M":"L",x,y});
        cx=x;cy=y;if(first){sx=x;sy=y;}first=false;
      }
      lastC=null;lastQ=null;continue;
    }
    if(up==="L"){
      while(i<t.length&&!isCmd(t[i])){
        const [x,y]=point(rel,read(),read());out.push({op:"L",x,y});cx=x;cy=y;
      }
      lastC=null;lastQ=null;continue;
    }
    if(up==="H"){
      while(i<t.length&&!isCmd(t[i])){
        const x=rel?cx+read():read();out.push({op:"L",x,y:cy});cx=x;
      }
      lastC=null;lastQ=null;continue;
    }
    if(up==="V"){
      while(i<t.length&&!isCmd(t[i])){
        const y=rel?cy+read():read();out.push({op:"L",x:cx,y});cy=y;
      }
      lastC=null;lastQ=null;continue;
    }
    if(up==="C"){
      while(i<t.length&&!isCmd(t[i])){
        let x1=read(),y1=read(),x2=read(),y2=read(),x=read(),y=read();
        if(rel){x1+=cx;y1+=cy;x2+=cx;y2+=cy;x+=cx;y+=cy;}
        out.push({op:"C",x1,y1,x2,y2,x,y});cx=x;cy=y;lastC=[x2,y2];lastQ=null;
      }
      continue;
    }
    if(up==="S"){
      while(i<t.length&&!isCmd(t[i])){
        let x2=read(),y2=read(),x=read(),y=read();
        if(rel){x2+=cx;y2+=cy;x+=cx;y+=cy;}
        const x1=lastC?2*cx-lastC[0]:cx, y1=lastC?2*cy-lastC[1]:cy;
        out.push({op:"C",x1,y1,x2,y2,x,y});cx=x;cy=y;lastC=[x2,y2];lastQ=null;
      }
      continue;
    }
    if(up==="Q"){
      while(i<t.length&&!isCmd(t[i])){
        let qx=read(),qy=read(),x=read(),y=read();
        if(rel){qx+=cx;qy+=cy;x+=cx;y+=cy;}
        const x1=cx+(2/3)*(qx-cx),y1=cy+(2/3)*(qy-cy);
        const x2=x+(2/3)*(qx-x),y2=y+(2/3)*(qy-y);
        out.push({op:"C",x1,y1,x2,y2,x,y});cx=x;cy=y;lastQ=[qx,qy];lastC=null;
      }
      continue;
    }
    if(up==="T"){
      while(i<t.length&&!isCmd(t[i])){
        let x=read(),y=read();if(rel){x+=cx;y+=cy;}
        const qx=lastQ?2*cx-lastQ[0]:cx,qy=lastQ?2*cy-lastQ[1]:cy;
        const x1=cx+(2/3)*(qx-cx),y1=cy+(2/3)*(qy-cy);
        const x2=x+(2/3)*(qx-x),y2=y+(2/3)*(qy-y);
        out.push({op:"C",x1,y1,x2,y2,x,y});cx=x;cy=y;lastQ=[qx,qy];lastC=null;
      }
      continue;
    }
    fail("SVG_PATH_COMMAND_UNSUPPORTED",cmd);
  }
  if(!out.length) fail("SVG_PATH_EMPTY");
  return out;
}

function rectPrimitive(a){
  const allowed=new Set(["id","x","y","width","height","fill","stroke","stroke-width","fill-rule","rx","ry"]);
  for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ATTRIBUTE_NOT_ALLOWED",k);
  if(a.rx!==undefined||a.ry!==undefined) fail("SVG_ROUNDED_RECT_UNSUPPORTED");
  const x=num(a.x??0,"x"),y=num(a.y??0,"y"),w=num(a.width,"width"),h=num(a.height,"height");
  if(w<=0||h<=0) fail("SVG_GEOMETRY_INVALID","rect");
  return {kind:"rect",x,y,w,h,...paint(a)};
}
function linePrimitive(a){
  const allowed=new Set(["id","x1","y1","x2","y2","fill","stroke","stroke-width","fill-rule"]);
  for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ATTRIBUTE_NOT_ALLOWED",k);
  return {kind:"line",x1:num(a.x1??0,"x1"),y1:num(a.y1??0,"y1"),x2:num(a.x2??0,"x2"),y2:num(a.y2??0,"y2"),...paint(a,{defaultFill:"none",defaultStroke:"black"})};
}
function pointsPrimitive(a,closed){
  const allowed=new Set(["id","points","fill","stroke","stroke-width","fill-rule"]);
  for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ATTRIBUTE_NOT_ALLOWED",k);
  const v=nums(a.points,"points");
  if(v.length<4||v.length%2) fail("SVG_POINTS_INVALID");
  const points=[];for(let i=0;i<v.length;i+=2) points.push([v[i],v[i+1]]);
  return {kind:closed?"polygon":"polyline",points,...paint(a,{defaultFill:closed?"black":"none",defaultStroke:closed?"none":"black"})};
}
function ellipsePrimitive(a,circle=false){
  const allowed=new Set(circle
    ? ["id","cx","cy","r","fill","stroke","stroke-width","fill-rule"]
    : ["id","cx","cy","rx","ry","fill","stroke","stroke-width","fill-rule"]);
  for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ATTRIBUTE_NOT_ALLOWED",k);
  const cx=num(a.cx??0,"cx"),cy=num(a.cy??0,"cy");
  const rx=num(circle?a.r:a.rx,circle?"r":"rx"),ry=circle?rx:num(a.ry,"ry");
  if(rx<=0||ry<=0) fail("SVG_GEOMETRY_INVALID","ellipse");
  return {kind:"ellipse",cx,cy,rx,ry,...paint(a)};
}

function validateRootAttributes(a){
  const allowed=new Set(["xmlns","viewBox","viewbox","width","height","preserveAspectRatio","id"]);
  for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ROOT_ATTRIBUTE_NOT_ALLOWED",k);
}

export function parseControlledSvgDataUrl(dataUrl){
  let xml=decodeSvgDataUrl(dataUrl);
  if(BLOCKED_PATTERNS.some(re=>re.test(xml))) fail("SVG_UNSAFE_OR_UNSUPPORTED_FEATURE");
  xml=xml.replace(/<\?xml[\s\S]*?\?>/gi,"").replace(/<!--([\s\S]*?)-->/g,"");
  const root=/<svg\b([^>]*)>/i.exec(xml);
  if(!root) fail("SVG_ROOT_MISSING");
  const rootAttrs=attrs(root[1]);
  validateRootAttributes(rootAttrs);
  const vb=nums(rootAttrs.viewBox??rootAttrs.viewbox,"viewBox");
  if(vb.length!==4||vb[2]<=0||vb[3]<=0) fail("SVG_VIEWBOX_INVALID");
  const primitives=[];
  const openTag=/<([A-Za-z][\w:-]*)\b([^>]*)\/?\s*>/g;
  let m;
  while((m=openTag.exec(xml))){
    const tag=m[1].toLowerCase();
    if(!ALLOWED_TAGS.has(tag)) fail("SVG_TAG_NOT_ALLOWED",tag);
    const a=attrs(m[2]);
    if(tag==="svg"){validateRootAttributes(a);continue;}
    if(tag==="g"){
      const allowed=new Set(["id"]);
      for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_GROUP_ATTRIBUTE_NOT_ALLOWED",k);
      continue;
    }
    if(tag==="path"){
      const allowed=new Set(["id","d","fill","stroke","stroke-width","fill-rule"]);
      for(const k of Object.keys(a)) if(!allowed.has(k)) fail("SVG_ATTRIBUTE_NOT_ALLOWED",k);
      primitives.push({kind:"path",commands:parsePath(a.d),...paint(a)});
    }else if(tag==="rect") primitives.push(rectPrimitive(a));
    else if(tag==="line") primitives.push(linePrimitive(a));
    else if(tag==="polyline") primitives.push(pointsPrimitive(a,false));
    else if(tag==="polygon") primitives.push(pointsPrimitive(a,true));
    else if(tag==="circle") primitives.push(ellipsePrimitive(a,true));
    else if(tag==="ellipse") primitives.push(ellipsePrimitive(a,false));
  }
  const stripped=xml.replace(/<[^>]+>/g,"").trim();
  if(stripped) fail("SVG_TEXT_CONTENT_NOT_ALLOWED",stripped.slice(0,80));
  if(!primitives.length) fail("SVG_NO_DRAWABLE_PRIMITIVES");
  return {
    profile:"CAS_SVG_K_ONLY_1",
    viewBox:{x:vb[0],y:vb[1],w:vb[2],h:vb[3]},
    primitives,
    primitiveCount:primitives.length
  };
}
