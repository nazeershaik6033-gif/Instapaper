/* Folio — Books (a ReadEra-style reader)
   Upload EPUB, PDF, MOBI/AZW3, FB2, DOCX, TXT or Markdown files and read them on-device, offline:
   - swipe/tap page turns (or continuous scroll), resume exactly where you left off
   - shelves (Reading · To read · Finished · Favourites), bookmarks, highlights with notes
   - reading stats: time per book, daily streak, pages per day, time left
   Files + parsed text live in their own IndexedDB ("instapaper-books"); nothing leaves the device.
   Loaded before app.js; everything from app.js (h, Icons, Svg, P, Sheet, THEMES…) is used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef,useCallback,useMemo,useLayoutEffect}=React;

/* ============================== storage ============================== */
const BK_DB='instapaper-books';
let _db=null;
function bdb(){
  if(_db)return _db;
  _db=new Promise((res,rej)=>{
    let r;try{r=indexedDB.open(BK_DB,1)}catch(e){return rej(e)}
    r.onupgradeneeded=e=>{const db=e.target.result;
      if(!db.objectStoreNames.contains('books'))db.createObjectStore('books',{keyPath:'id'});
      if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'});
      if(!db.objectStoreNames.contains('parsed'))db.createObjectStore('parsed',{keyPath:'id'});
    };
    r.onsuccess=e=>{const db=e.target.result;db.onclose=db.onversionchange=()=>{_db=null;try{db.close()}catch(x){}};res(db)};r.onerror=()=>{_db=null;rej(r.error)};
  });
  return _db;
}
/* iOS can drop the connection of a backgrounded app; a closed connection reopens once */
function tx1(store,mode,fn){return bdb().then(db=>new Promise((res,rej)=>{const t=db.transaction(store,mode);let out;const r=fn(t.objectStore(store));
  if(r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)}))}
function tx(store,mode,fn){return tx1(store,mode,fn).catch(e=>{if(e&&e.name==='InvalidStateError'){_db=null;return tx1(store,mode,fn)}throw e})}
const dbAll=s=>tx(s,'readonly',st=>st.getAll());
const dbGet=(s,id)=>tx(s,'readonly',st=>st.get(id));
const dbPut=(s,v)=>tx(s,'readwrite',st=>st.put(v));
const dbDel=(s,id)=>tx(s,'readwrite',st=>st.delete(id));

const bid=()=>'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const byRecent=(a,b)=>(b.openedAt||b.addedAt||0)-(a.openedAt||a.addedAt||0);

/* a tiny shared store so the library and the reader see the same book records */
const Store={list:null,subs:new Set(),loading:null,saveT:{},
  load(){
    if(this.list)return Promise.resolve(this.list);
    if(!this.loading)this.loading=dbAll('books').then(l=>{this.list=(l||[]).sort(byRecent);this.emit();return this.list})
      .catch(()=>{this.list=[];this.emit();return this.list});
    return this.loading;
  },
  emit(){const l=this.list;this.subs.forEach(f=>{try{f(l)}catch(e){}})},
  get(id){return(this.list||[]).find(b=>b.id===id)||null},
  /* patch in memory at once; write to IndexedDB (debounced when `soon`) */
  patch(id,p,soon){
    let nb=null;
    this.list=(this.list||[]).map(b=>{if(b.id!==id)return b;nb={...b,...(typeof p==='function'?p(b):p)};return nb});
    this.emit();
    if(nb){clearTimeout(this.saveT[id]);
      const w=()=>{const cur=this.get(id);if(cur)dbPut('books',cur).catch(()=>{})};
      if(soon)this.saveT[id]=setTimeout(w,1500);else w()}
    return nb;
  },
  flush(id){clearTimeout(this.saveT[id]);const cur=this.get(id);if(cur)return dbPut('books',cur).catch(()=>{})},
  add(b){this.list=[b,...(this.list||[]).filter(x=>x.id!==b.id)];this.emit()},
  remove(id){this.list=(this.list||[]).filter(b=>b.id!==id);this.emit();
    dbDel('books',id).catch(()=>{});dbDel('files',id).catch(()=>{});dbDel('parsed',id).catch(()=>{})}
};
function useBooks(){
  const [l,setL]=useState(Store.list);
  useEffect(()=>{const f=x=>setL(x);Store.subs.add(f);Store.load().then(f);return()=>{Store.subs.delete(f)}},[]);
  return l;
}

/* ============================== reading stats ============================== */
const STATS_KEY='insta_book_stats_v1';
function loadStats(){try{const s=JSON.parse(localStorage.getItem(STATS_KEY));if(s&&s.days)return s}catch(e){}return{days:{}}}
function dayKey(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function addStat(sec,pages){
  const s=loadStats(),k=dayKey(),d=s.days[k]||{sec:0,pages:0};
  d.sec+=sec||0;d.pages+=pages||0;s.days[k]=d;
  try{localStorage.setItem(STATS_KEY,JSON.stringify(s))}catch(e){}
}
function readStreak(s){
  let n=0;const d=new Date();
  if(!((s.days[dayKey(d)]||{}).sec>=60))d.setDate(d.getDate()-1);
  while((s.days[dayKey(d)]||{}).sec>=60){n++;d.setDate(d.getDate()-1)}
  return n;
}
function fmtDur(sec){sec=Math.max(0,Math.round(sec||0));if(sec<60)return sec?'<1 min':'0 min';const m=Math.round(sec/60);if(m<60)return m+' min';const hh=Math.floor(m/60),mm=m%60;return hh+' h'+(mm?' '+mm+' min':'')}

/* ============================== formats ============================== */
const BOOK_EXT={epub:'epub',pdf:'pdf',txt:'txt',text:'txt',md:'md',markdown:'md',docx:'docx',fb2:'fb2',mobi:'mobi',azw:'mobi',azw3:'mobi',prc:'mobi',kf8:'mobi'};
const ACCEPT='.epub,.pdf,.txt,.md,.markdown,.docx,.fb2,.mobi,.azw,.azw3,.prc,application/epub+zip,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/x-mobipocket-ebook';
const FORMAT_LABEL={epub:'EPUB',pdf:'PDF',txt:'TXT',md:'Markdown',docx:'DOCX',fb2:'FB2',mobi:'MOBI'};
function bookFormat(f){
  const n=String((f&&f.name)||'').toLowerCase();const m=/\.([a-z0-9]+)$/.exec(n);const e=m&&m[1];
  if(e&&BOOK_EXT[e])return BOOK_EXT[e];
  const t=(f&&f.type)||'';
  if(t==='application/epub+zip')return'epub';if(t==='application/pdf')return'pdf';if(t==='text/markdown')return'md';
  if(t==='text/plain')return'txt';if(t.includes('wordprocessingml'))return'docx';if(t==='application/x-mobipocket-ebook')return'mobi';
  return null;
}
const isBookFile=f=>!!bookFormat(f);
const baseName=n=>String(n||'Untitled').replace(/\.[a-z0-9]+$/i,'').replace(/[_]+/g,' ').trim()||'Untitled';

/* ---------- text decoding (BOM / XML-declared encodings) ---------- */
function decodeText(bytes,enc){
  if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if(!enc){const head=new TextDecoder('latin1').decode(bytes.subarray(0,300));const m=/encoding\s*=\s*["']([\w.-]+)["']/i.exec(head);if(m)enc=m[1]}
  if(enc){try{return new TextDecoder(enc).decode(bytes)}catch(e){}}
  const u=new TextDecoder('utf-8').decode(bytes);
  /* lots of replacement characters → it was a legacy single-byte text */
  const bad=(u.slice(0,20000).match(/�/g)||[]).length;
  if(bad>8){try{return new TextDecoder('windows-1252').decode(bytes)}catch(e){}}
  return u;
}
const MIME={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',bmp:'image/bmp'};
const mimeOf=n=>MIME[(/\.([a-z0-9]+)$/i.exec(n||'')||[])[1]?.toLowerCase()]||'application/octet-stream';
function sniffImage(b){if(b[0]===0xFF&&b[1]===0xD8)return'image/jpeg';if(b[0]===0x89&&b[1]===0x50)return'image/png';if(b[0]===0x47&&b[1]===0x49)return'image/gif';if(b[0]===0x42&&b[1]===0x4D)return'image/bmp';return null}

/* ---------- minimal zip reader (EPUB / DOCX) using the browser's own inflate ---------- */
async function readZip(blob){
  const len=blob.size,tailLen=Math.min(len,65557);
  const tail=new DataView(await blob.slice(len-tailLen).arrayBuffer());
  let eocd=-1;for(let i=tailLen-22;i>=0;i--){if(tail.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('This file isn’t a valid book archive');
  const cnt=tail.getUint16(eocd+10,true),cdSize=tail.getUint32(eocd+12,true),cdOff=tail.getUint32(eocd+16,true);
  const cd=new DataView(await blob.slice(cdOff,cdOff+cdSize).arrayBuffer());
  const entries=new Map(),lower=new Map(),dec=new TextDecoder();let p=0;
  for(let i=0;i<cnt&&p+46<=cd.byteLength;i++){
    if(cd.getUint32(p,true)!==0x02014b50)break;
    const method=cd.getUint16(p+10,true),csize=cd.getUint32(p+20,true),nl=cd.getUint16(p+28,true),el=cd.getUint16(p+30,true),cl=cd.getUint16(p+32,true),off=cd.getUint32(p+42,true);
    const name=dec.decode(new Uint8Array(cd.buffer,cd.byteOffset+p+46,nl));
    const e={method,csize,off};entries.set(name,e);lower.set(name.toLowerCase(),e);p+=46+nl+el+cl;
  }
  const find=n=>entries.get(n)||lower.get(String(n).toLowerCase())||null;
  async function bytes(name){
    const e=find(name);if(!e)return null;
    const lh=new DataView(await blob.slice(e.off,e.off+30).arrayBuffer());
    const start=e.off+30+lh.getUint16(26,true)+lh.getUint16(28,true);
    const raw=blob.slice(start,start+e.csize);
    if(e.method===0)return new Uint8Array(await raw.arrayBuffer());
    if(e.method===8){
      if(typeof DecompressionStream==='undefined')throw new Error('Update iOS (16.4 or newer) to open this book');
      return new Uint8Array(await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    throw new Error('Unsupported compression in this book');
  }
  return{names:[...entries.keys()],has:n=>!!find(n),bytes,
    text:async n=>{const b=await bytes(n);return b?decodeText(b):null},
    blob:async(n,type)=>{const b=await bytes(n);return b?new Blob([b],{type:type||mimeOf(n)}):null}};
}

/* ---------- paths ---------- */
function dirOf(p){const i=p.lastIndexOf('/');return i<0?'':p.slice(0,i+1)}
function resolvePath(base,rel){
  rel=String(rel||'').trim();if(!rel)return'';
  try{rel=decodeURIComponent(rel)}catch(e){}
  if(rel.startsWith('/'))return rel.slice(1);
  const parts=(dirOf(base)+rel).split('/'),out=[];
  for(const s of parts){if(s==='..')out.pop();else if(s!=='.'&&s!=='')out.push(s)}
  return out.join('/');
}
const isExternal=u=>/^(https?:|mailto:|tel:)/i.test(String(u||'').trim());
const xmlDoc=(s,type)=>{const d=new DOMParser().parseFromString(s,type||'application/xml');return d.getElementsByTagName('parsererror').length?null:d};
const htmlDoc=s=>new DOMParser().parseFromString(s,'text/html');
const byLocal=(root,name)=>{if(!root)return[];const out=[];const all=root.getElementsByTagName('*');for(let i=0;i<all.length;i++)if(all[i].localName===name)out.push(all[i]);return out};
const firstLocal=(root,name)=>byLocal(root,name)[0]||null;
const attrLocal=(el,name)=>{if(!el||!el.attributes)return null;for(const a of el.attributes)if(a.localName===name)return a.value;return null};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA=s=>esc(s).replace(/"/g,'&quot;');

/* ---------- safe serializer: any (X)HTML/XML DOM → clean reader HTML ---------- */
const DROP=new Set(['script','style','link','meta','iframe','object','embed','form','input','button','select','textarea','noscript','title','head','audio','video','canvas','template','map','area']);
const BLOCK=new Set(['p','div','h1','h2','h3','h4','h5','h6','blockquote','pre','ul','ol','li','dl','dt','dd','table','thead','tbody','tfoot','tr','td','th','caption','figure','figcaption','section','article','aside','header','footer','nav','hr','br','center','main']);
const INLINE=new Set(['em','i','strong','b','u','s','sub','sup','small','big','code','abbr','cite','q','mark','del','ins','span','a','img','font','tt','kbd','var','dfn','samp','strike']);
const RENAME={center:'div',font:'span',tt:'code',strike:'s',section:'div',article:'div',aside:'div',header:'div',footer:'div',nav:'div',main:'div',big:'span'};
/* ctx: {id(id)→prefixed id, href(raw)→{ext}|{internal}, src(raw)→key, chars} */
function serialize(node,ctx){
  let out='';
  const kids=node.childNodes;
  for(let i=0;i<kids.length;i++){
    const n=kids[i];
    if(n.nodeType===3){const t=n.data;ctx.chars+=t.replace(/\s+/g,' ').length;out+=esc(t);continue}
    if(n.nodeType!==1)continue;
    const tag=(n.localName||'').toLowerCase();
    if(DROP.has(tag))continue;
    if(tag==='svg'){ /* EPUB covers are often <svg><image xlink:href=…/></svg> */
      const im=firstLocal(n,'image');const src=im&&(attrLocal(im,'href'));
      if(src){const k=ctx.src(src);if(k)out+='<img data-bksrc="'+escA(k)+'" alt="">'}
      continue;
    }
    if(tag==='img'||tag==='image'){
      const src=n.getAttribute('src')||attrLocal(n,'href');const k=src&&ctx.src(src);
      if(k)out+='<img data-bksrc="'+escA(k)+'" alt="'+escA(n.getAttribute('alt')||'')+'">';
      continue;
    }
    if(tag==='br'){out+='<br>';continue}
    if(tag==='hr'){out+='<hr>';continue}
    const known=BLOCK.has(tag)||INLINE.has(tag);
    const inner=serialize(n,ctx);
    if(!known){out+=inner;continue}
    const t=RENAME[tag]||tag;
    let attrs='';
    const id=n.getAttribute('id')||n.getAttribute('name');
    if(id)attrs+=' id="'+escA(ctx.id(id))+'"';
    const st=(n.getAttribute('style')||'')+' '+(n.getAttribute('class')||'')+' '+(n.getAttribute('align')||'');
    if(tag==='center'||/text-align\s*:\s*center|\bcenter\b|\bcentered\b/i.test(st))attrs+=' class="bkc"';
    if(tag==='a'){
      const href=n.getAttribute('href')||attrLocal(n,'href');
      if(href){const r=ctx.href(href);
        if(r&&r.ext)attrs+=' href="'+escA(r.ext)+'" target="_blank" rel="noopener"';
        else if(r&&r.internal)attrs+=' data-bkhref="'+escA(r.internal)+'"';}
    }
    if(tag==='td'||tag==='th'){const cs=n.getAttribute('colspan'),rs=n.getAttribute('rowspan');if(cs)attrs+=' colspan="'+escA(cs)+'"';if(rs)attrs+=' rowspan="'+escA(rs)+'"'}
    if(tag==='ol'&&n.getAttribute('start'))attrs+=' start="'+escA(n.getAttribute('start'))+'"';
    if(tag==='a'&&!attrs&&!inner)continue;
    out+='<'+t+attrs+'>'+inner+'</'+t+'>';
  }
  return out;
}
function textLen(html){const d=htmlDoc('<body>'+html);return(d.body.textContent||'').replace(/\s+/g,' ').trim().length}

/* Long chapters make page layout slow, so anything bigger than ~45k characters is split at
   top-level block boundaries into "parts" that read on seamlessly. */
const PART_MAX=45000;
function splitHtml(html){
  const d=htmlDoc('<body>'+html);let root=d.body;
  while(root.children.length===1&&root.childNodes.length<=3&&root.firstElementChild&&/^(div|section)$/i.test(root.firstElementChild.tagName))root=root.firstElementChild;
  const parts=[];let cur='',n=0;
  for(const c of Array.from(root.childNodes)){
    const s=c.nodeType===1?c.outerHTML:c.nodeType===3?esc(c.data):'';const l=(c.textContent||'').length;
    if(n+l>PART_MAX&&n>2000){parts.push(cur);cur='';n=0}
    cur+=s;n+=l;
  }
  if(cur||!parts.length)parts.push(cur);
  return parts;
}

/* chapters [{title, html, anchor ids…}] + toc [{title, chIdx (pre-split), id, level}] → final book model */
function finalize(raw,toc,opts){
  if(opts&&opts.merge&&raw.length>1){
    const out=[],map=[];let carry=null;
    raw.forEach((c,i)=>{
      const small=textLen(c.html)<220&&!/<img/i.test(c.html)&&i<raw.length-1;
      if(carry){c={title:carry.title||c.title,html:carry.html+c.html};carry=null}
      map[i]=out.length;
      if(small){carry=c;return}
      out.push(c);
    });
    if(carry)out.push(carry);
    toc=(toc||[]).map(e=>({...e,ch:map[e.ch]!=null?map[e.ch]:e.ch})).filter((e,i,a)=>!a.slice(0,i).some(x=>x.ch===e.ch&&x.title===e.title));
    raw=out;
  }
  const chapters=[],firstPart=[];
  raw.forEach((c,i)=>{
    firstPart[i]=chapters.length;
    const parts=c.html.length>PART_MAX*1.6?splitHtml(c.html):[c.html];
    parts.forEach((p,j)=>chapters.push({t:c.title||'',html:p,part:j,src:i}));
  });
  const idMap={};
  chapters.forEach((c,i)=>{c.n=textLen(c.html);const re=/\sid="([^"]+)"/g;let m;while((m=re.exec(c.html)))if(!(m[1] in idMap))idMap[m[1]]=i});
  let t=(toc||[]).map(e=>{const ch=e.id&&e.id in idMap?idMap[e.id]:(firstPart[e.ch]!=null?firstPart[e.ch]:-1);return{title:e.title,ch,id:e.id||null,level:e.level||0}}).filter(e=>e.ch>=0&&e.title);
  if(!t.length){
    t=chapters.map((c,i)=>({c,i})).filter(({c})=>c.part===0).map(({c,i})=>{
      const m=/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(c.html);const ht=m?htmlDoc('<body>'+m[1]).body.textContent.trim():'';
      return{title:c.t||ht||('Section '+(c.src+1)),ch:i,id:null,level:0}}).filter(e=>e.title);
  }
  /* chapter titles for the reader footer: nearest toc entry at or before */
  let last='';const byCh={};t.forEach(e=>{if(!(e.ch in byCh))byCh[e.ch]=e.title});
  chapters.forEach((c,i)=>{if(byCh[i])last=byCh[i];c.t=c.t||last||(opts&&opts.title)||''});
  return{v:PARSE_V,chapters:chapters.map(c=>({t:c.t,html:c.html,n:c.n})),toc:t,idMap,images:(opts&&opts.images)||null};
}
const PARSE_V=1;

/* ---------- EPUB ---------- */
async function parseEpub(blob){
  const z=await readZip(blob);
  const cont=xmlDoc(await z.text('META-INF/container.xml')||'');
  const opfPath=cont&&attrLocal(firstLocal(cont,'rootfile'),'full-path');
  if(!opfPath)throw new Error('This EPUB has no package file');
  const opf=xmlDoc(await z.text(opfPath)||'');if(!opf)throw new Error('This EPUB’s package file is broken');
  const meta=firstLocal(opf,'metadata');
  const title=(firstLocal(meta,'title')||{}).textContent||'';
  const author=byLocal(meta,'creator').map(e=>e.textContent.trim()).filter(Boolean).join(', ');
  const items={};byLocal(opf,'item').forEach(it=>{items[it.getAttribute('id')]={href:resolvePath(opfPath,it.getAttribute('href')),type:it.getAttribute('media-type')||'',props:it.getAttribute('properties')||''}});
  const spineEl=firstLocal(opf,'spine');
  const spine=byLocal(spineEl,'itemref').map(r=>items[r.getAttribute('idref')]).filter(Boolean)
    .filter(it=>/x?html|xml/i.test(it.type)||/\.x?html?$/i.test(it.href));
  if(!spine.length)throw new Error('This EPUB has no readable chapters');
  const fileIdx={};spine.forEach((it,i)=>{fileIdx[it.href]=i});
  /* cover */
  let cover=Object.values(items).find(it=>/cover-image/.test(it.props));
  if(!cover){const cm=byLocal(meta,'meta').find(m=>m.getAttribute('name')==='cover');if(cm)cover=items[cm.getAttribute('content')]}
  if(!cover)cover=Object.values(items).find(it=>/^image\//.test(it.type)&&/cover/i.test(it.href));
  /* table of contents: EPUB3 nav, else NCX */
  const toc=[];
  const addTocHref=(label,href,level,base)=>{const [p,frag]=String(href||'').split('#');const path=p?resolvePath(base,p):'';const ch=fileIdx[path];
    if(ch==null||!label)return;toc.push({title:label.replace(/\s+/g,' ').trim(),ch,id:frag?('c'+ch+'-'+frag):null,level})};
  const navItem=Object.values(items).find(it=>/\bnav\b/.test(it.props));
  if(navItem){
    const nd=xmlDoc(await z.text(navItem.href)||'','application/xhtml+xml')||htmlDoc(await z.text(navItem.href)||'');
    const navs=byLocal(nd,'nav');const nav=navs.find(n=>/toc/.test(attrLocal(n,'type')||''))||navs[0];
    const walk=(ol,lvl)=>{for(const li of Array.from(ol.children).filter(c=>c.localName==='li')){
      const a=Array.from(li.children).find(c=>c.localName==='a'||c.localName==='span');
      if(a&&a.localName==='a')addTocHref(a.textContent,a.getAttribute('href'),lvl,navItem.href);
      const sub=Array.from(li.children).find(c=>c.localName==='ol');if(sub)walk(sub,lvl+1)}};
    const ol=nav&&Array.from(nav.children).find(c=>c.localName==='ol');if(ol)walk(ol,0);
  }
  if(!toc.length){
    const ncxItem=items[spineEl&&spineEl.getAttribute('toc')]||Object.values(items).find(it=>/ncx/.test(it.type));
    const nd=ncxItem&&xmlDoc(await z.text(ncxItem.href)||'');
    const walk=(el,lvl)=>{for(const np of Array.from(el.children).filter(c=>c.localName==='navPoint')){
      const lab=firstLocal(firstLocal(np,'navLabel'),'text');const c=firstLocal(np,'content');
      if(lab&&c)addTocHref(lab.textContent,c.getAttribute('src'),lvl,ncxItem.href);walk(np,lvl+1)}};
    const nm=nd&&firstLocal(nd,'navMap');if(nm)walk(nm,0);
  }
  /* chapters */
  const raw=[];
  for(let i=0;i<spine.length;i++){
    const it=spine[i];const s=await z.text(it.href)||'';
    const d=xmlDoc(s,'application/xhtml+xml')||htmlDoc(s);
    const body=firstLocal(d,'body')||d.documentElement;
    const ctx={chars:0,
      id:id=>'c'+i+'-'+id,
      src:src=>isExternal(src)||/^data:/i.test(src)?null:'z:'+resolvePath(it.href,src.split('#')[0]),
      href:href=>{if(isExternal(href))return{ext:href};const [p,frag]=href.split('#');const path=p?resolvePath(it.href,p):it.href;const ch=fileIdx[path];
        if(ch==null)return null;return{internal:frag?('c'+ch+'-'+frag):('@'+ch)}}};
    raw.push({title:'',html:serialize(body,ctx)});
  }
  return{title:title.trim(),author,coverKey:cover?'z:'+cover.href:null,coverFallback:true,model:finalize(raw,toc,{title})};
}

/* ---------- FB2 ---------- */
async function parseFb2(blob){
  const d=xmlDoc(decodeText(new Uint8Array(await blob.arrayBuffer())));
  if(!d)throw new Error('This FB2 file is broken');
  const images={};
  byLocal(d,'binary').forEach(b=>{try{const bin=atob((b.textContent||'').replace(/\s+/g,''));const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    images['b:'+b.getAttribute('id')]=new Blob([u],{type:b.getAttribute('content-type')||sniffImage(u)||'image/jpeg'})}catch(e){}});
  const ti=firstLocal(d,'title-info');
  const title=((firstLocal(ti,'book-title')||{}).textContent||'').trim();
  const author=byLocal(ti,'author').map(a=>['first-name','middle-name','last-name'].map(k=>(firstLocal(a,k)||{}).textContent||'').join(' ').replace(/\s+/g,' ').trim()).filter(Boolean).join(', ');
  const cp=firstLocal(firstLocal(ti,'coverpage'),'image');const coverKey=cp?('b:'+String(attrLocal(cp,'href')||'').replace(/^#/,'')):null;
  /* FB2 tags → reader HTML */
  const MAP={p:'p',emphasis:'em',strong:'strong',strikethrough:'s',sub:'sub',sup:'sup',code:'code',epigraph:'blockquote',cite:'blockquote',poem:'div',stanza:'div',v:'p','text-author':'p',subtitle:'h4',table:'table',tr:'tr',td:'td',th:'th',section:'div',a:'a',title:'h2'};
  const fb=(node,depth)=>{let out='';for(const n of Array.from(node.childNodes)){
    if(n.nodeType===3){out+=esc(n.data);continue}if(n.nodeType!==1)continue;
    const t=n.localName;
    if(t==='empty-line'){out+='<br>';continue}
    if(t==='image'){const k='b:'+String(attrLocal(n,'href')||'').replace(/^#/,'');out+='<img data-bksrc="'+escA(k)+'" alt="">';continue}
    if(t==='binary'||t==='description')continue;
    let tag=MAP[t]||'';let attrs='';const id=n.getAttribute('id');if(id)attrs+=' id="'+escA('f-'+id)+'"';
    if(t==='title')tag=depth>1?'h3':'h2';
    if(t==='text-author'||t==='v')attrs+=t==='v'?' class="bkv"':' class="bkta"';
    if(t==='a'){const href=attrLocal(n,'href')||'';if(href.startsWith('#'))attrs+=' data-bkhref="'+escA('f-'+href.slice(1))+'"';else if(isExternal(href))attrs+=' href="'+escA(href)+'" target="_blank" rel="noopener"'}
    const inner=fb(n,t==='section'?depth+1:depth);
    out+=tag?('<'+tag+attrs+'>'+inner+'</'+tag+'>'):inner}
    return out};
  const bodies=byLocal(d,'body');const main=bodies.find(b=>!b.getAttribute('name'))||bodies[0];
  if(!main)throw new Error('This FB2 file has no text');
  const raw=[];let lead='';
  for(const n of Array.from(main.childNodes)){
    if(n.nodeType===1&&n.localName==='section')raw.push({title:((firstLocal(n,'title')||{}).textContent||'').replace(/\s+/g,' ').trim(),html:fb(n,1)});
    else if(n.nodeType===1)lead+=fb({childNodes:[n]},1);
  }
  if(lead.trim())raw.unshift({title:title||'Title',html:lead});
  bodies.filter(b=>b!==main).forEach(b=>raw.push({title:b.getAttribute('name')==='notes'?'Notes':'Appendix',html:fb(b,1)}));
  return{title,author,coverKey:coverKey&&images[coverKey]?coverKey:null,model:finalize(raw,raw.map((c,i)=>({title:c.title,ch:i})),{title,images,merge:true})};
}

/* ---------- DOCX ---------- */
async function parseDocx(blob,name){
  const z=await readZip(blob);
  const doc=xmlDoc(await z.text('word/document.xml')||'');if(!doc)throw new Error('This Word document is broken');
  const rels={};const rd=xmlDoc(await z.text('word/_rels/document.xml.rels')||'');
  if(rd)byLocal(rd,'Relationship').forEach(r=>{rels[r.getAttribute('Id')]={target:r.getAttribute('Target'),ext:r.getAttribute('TargetMode')==='External'}});
  const styles={};const sd=xmlDoc(await z.text('word/styles.xml')||'');
  if(sd)byLocal(sd,'style').forEach(s=>{const nm=firstLocal(s,'name');styles[attrLocal(s,'styleId')]=nm?(attrLocal(nm,'val')||''):''});
  const core=xmlDoc(await z.text('docProps/core.xml')||'');
  const title=((core&&firstLocal(core,'title')||{}).textContent||'').trim()||baseName(name);
  const author=((core&&firstLocal(core,'creator')||{}).textContent||'').trim();
  const imgKey=id=>{const r=rels[id];return r&&!r.ext?'z:'+resolvePath('word/document.xml',r.target):null};
  const on=el=>el&&attrLocal(el,'val')!=='0'&&attrLocal(el,'val')!=='false';
  const runs=node=>{let out='';for(const c of Array.from(node.children)){
    const t=c.localName;
    if(t==='r'){const pr=firstLocal(c,'rPr');let s='';
      for(const k of Array.from(c.children)){const kn=k.localName;
        if(kn==='t')s+=esc(k.textContent);else if(kn==='tab')s+='&emsp;';else if(kn==='br'||kn==='cr')s+='<br>';
        else if(kn==='drawing'||kn==='pict'||kn==='object'){const bl=firstLocal(k,'blip')||firstLocal(k,'imagedata');const id=bl&&(attrLocal(bl,'embed')||attrLocal(bl,'id'));const key=id&&imgKey(id);if(key)s+='<img data-bksrc="'+escA(key)+'" alt="">'}}
      if(pr&&s){if(on(Array.from(pr.children).find(x=>x.localName==='b')))s='<strong>'+s+'</strong>';if(on(Array.from(pr.children).find(x=>x.localName==='i')))s='<em>'+s+'</em>';
        if(Array.from(pr.children).some(x=>x.localName==='u'&&attrLocal(x,'val')!=='none'))s='<u>'+s+'</u>';if(on(Array.from(pr.children).find(x=>x.localName==='strike')))s='<s>'+s+'</s>';
        const va=Array.from(pr.children).find(x=>x.localName==='vertAlign');if(va){const v=attrLocal(va,'val');if(v==='superscript')s='<sup>'+s+'</sup>';else if(v==='subscript')s='<sub>'+s+'</sub>'}}
      out+=s}
    else if(t==='hyperlink'){const r=rels[attrLocal(c,'id')];const inner=runs(c);out+=r&&r.ext&&isExternal(r.target)?'<a href="'+escA(r.target)+'" target="_blank" rel="noopener">'+inner+'</a>':inner}
    else if(t==='ins'||t==='smartTag'||t==='sdt'||t==='sdtContent'||t==='fldSimple')out+=runs(c)}
    return out};
  const raw=[];let cur={title:'',html:''};let list=false;
  const headLevel=p=>{const pr=firstLocal(p,'pPr');const ps=pr&&Array.from(pr.children).find(x=>x.localName==='pStyle');const id=ps?attrLocal(ps,'val'):'';const nm=(styles[id]||id||'').toLowerCase();
    if(nm==='title')return 1;const m=/heading\s*(\d)/.exec(nm)||/^heading(\d)$/.exec(String(id).toLowerCase());return m?+m[1]:0};
  const paras=Array.from((firstLocal(doc,'body')||doc).children);
  const levels=paras.filter(p=>p.localName==='p').map(headLevel).filter(Boolean);const top=levels.length?Math.min(...levels):0;
  const para=p=>{const pr=firstLocal(p,'pPr');const jc=pr&&Array.from(pr.children).find(x=>x.localName==='jc');const c=jc&&attrLocal(jc,'val')==='center'?' class="bkc"':'';return{inner:runs(p),c,isList:!!(pr&&firstLocal(pr,'numPr'))}};
  for(const el of paras){
    if(el.localName==='p'){
      const lv=headLevel(el);const {inner,c,isList}=para(el);
      if(isList!==list){cur.html+=isList?'<ul>':'</ul>';list=isList}
      if(lv){const txt=htmlDoc('<body>'+inner).body.textContent.trim();
        if(lv===top&&txt&&(cur.html.replace(/<[^>]+>/g,'').trim()||raw.length)){if(list){cur.html+='</ul>';list=false}raw.push(cur);cur={title:txt,html:''}}
        else if(lv===top&&!cur.title)cur.title=txt;
        cur.html+='<h'+Math.min(6,lv+1)+c+'>'+inner+'</h'+Math.min(6,lv+1)+'>'}
      else cur.html+=isList?'<li>'+inner+'</li>':(inner?'<p'+c+'>'+inner+'</p>':'<p><br></p>');
    }else if(el.localName==='tbl'){
      if(list){cur.html+='</ul>';list=false}
      cur.html+='<table>'+byLocal(el,'tr').map(tr=>'<tr>'+Array.from(tr.children).filter(x=>x.localName==='tc').map(tc=>'<td>'+Array.from(tc.children).filter(x=>x.localName==='p').map(p=>runs(p)).join('<br>')+'</td>').join('')+'</tr>').join('')+'</table>';
    }
  }
  if(list)cur.html+='</ul>';
  raw.push(cur);
  const chs=raw.filter(c=>c.html.trim());
  return{title,author,coverKey:null,model:finalize(chs,top?chs.map((c,i)=>({title:c.title,ch:i})).filter(e=>e.title):[],{title,merge:true})};
}

/* ---------- TXT / Markdown ---------- */
function mdInline(s){
  s=esc(s);
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)[^)]*\)/g,'<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)[^)]*\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,(m,a,b)=>'<strong>'+(a||b)+'</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>').replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g,'$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g,'<s>$1</s>');
  return s;
}
function bkMdToHtml(text){
  const lines=text.replace(/\r\n?/g,'\n').split('\n');let out='',para=[],list=null,quote=[],fence=null;
  const flushP=()=>{if(para.length){out+='<p>'+mdInline(para.join(' '))+'</p>';para=[]}};
  const flushL=()=>{if(list){out+='<'+list.t+'>'+list.items.map(i=>'<li>'+mdInline(i)+'</li>').join('')+'</'+list.t+'>';list=null}};
  const flushQ=()=>{if(quote.length){out+='<blockquote>'+bkMdToHtml(quote.join('\n'))+'</blockquote>';quote=[]}};
  for(const ln of lines){
    if(fence!==null){if(/^\s*```/.test(ln)){out+='<pre><code>'+esc(fence)+'</code></pre>';fence=null}else fence+=(fence?'\n':'')+ln;continue}
    if(/^\s*```/.test(ln)){flushP();flushL();flushQ();fence='';continue}
    if(/^\s*>/.test(ln)){flushP();flushL();quote.push(ln.replace(/^\s*>\s?/,''));continue}else flushQ();
    const hm=/^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(ln);
    if(hm){flushP();flushL();out+='<h'+hm[1].length+'>'+mdInline(hm[2])+'</h'+hm[1].length+'>';continue}
    if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)){flushP();flushL();out+='<hr>';continue}
    const lm=/^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(ln);
    if(lm){flushP();const t=/\d/.test(lm[1])?'ol':'ul';if(!list||list.t!==t){flushL();list={t,items:[]}}list.items.push(lm[2]);continue}
    if(!ln.trim()){flushP();flushL();continue}
    if(list&&/^\s{2,}/.test(ln)){list.items[list.items.length-1]+=' '+ln.trim();continue}
    flushL();para.push(ln.trim());
  }
  if(fence!==null)out+='<pre><code>'+esc(fence)+'</code></pre>';
  flushP();flushL();flushQ();
  return out;
}
const TXT_HEAD=/^(chapter|part|book|prologue|epilogue|preface|introduction|foreword|afterword|section|act|глава|часть|अध्याय)\b[\s\S]{0,70}$/i;
function txtToHtml(text){
  text=text.replace(/\r\n?/g,'\n');
  const blank=/\n\s*\n/.test(text);
  const blocks=blank?text.split(/\n\s*\n+/):text.split('\n');
  return blocks.map(b=>{const t=b.replace(/\s*\n\s*/g,' ').trim();if(!t)return'';
    const caps=t.length<60&&/[A-Z]/.test(t)&&t===t.toUpperCase()&&/[A-Z]{3}/.test(t);
    if(t.length<80&&(TXT_HEAD.test(t)||caps||/^[IVXLC]+\.?$/.test(t)))return'<h2>'+esc(t)+'</h2>';
    return'<p>'+esc(t)+'</p>'}).join('');
}
function chaptersByHeading(html,re){
  const pieces=html.split(re);const raw=[];let cur={title:'',html:''};
  for(const p of pieces){
    if(re.test(p)||/^<h[12][ >]/i.test(p)){
      if(cur.html.replace(/<[^>]+>/g,'').trim())raw.push(cur);
      const hm=/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(p);cur={title:hm?htmlDoc('<body>'+hm[1]).body.textContent.replace(/\s+/g,' ').trim():'',html:p};
    }else cur.html+=p;
  }
  if(cur.html.trim())raw.push(cur);
  return raw;
}
async function parseText(blob,name,md){
  const text=decodeText(new Uint8Array(await blob.arrayBuffer()));
  const html=md?bkMdToHtml(text):txtToHtml(text);
  const raw=chaptersByHeading(html,/(?=<h[12][ >])/i);
  const title=(md&&(/^#\s+(.+)$/m.exec(text)||[])[1])||baseName(name);
  return{title:title.trim(),author:'',coverKey:null,model:finalize(raw.length?raw:[{title:'',html}],raw.filter(c=>c.title).map(c=>({title:c.title,ch:raw.indexOf(c)})),{title,merge:true})};
}

/* ---------- MOBI / AZW / AZW3 (PalmDOC) ---------- */
function palmdoc(src){
  const out=new Uint8Array(Math.max(8192,src.length*8));let o=0,i=0;
  while(i<src.length){const c=src[i++];
    if(c===0||(c>=9&&c<=0x7f))out[o++]=c;
    else if(c<=8){for(let k=0;k<c&&i<src.length;k++)out[o++]=src[i++]}
    else if(c<=0xbf){const v=((c<<8)|src[i++])&0x3fff;const dist=v>>3,len=(v&7)+3;for(let k=0;k<len;k++){out[o]=out[o-dist];o++}}
    else{out[o++]=32;out[o++]=c^0x80}}
  return out.subarray(0,o);
}
function trailingSize(r,flags){
  let num=0;
  const entry=size=>{let bit=0,res=0;while(true){const v=r[size-1];res|=(v&0x7f)<<bit;bit+=7;size--;if((v&0x80)||bit>=28||size===0)return res}};
  for(let f=flags>>1;f;f>>=1)if(f&1)num+=entry(r.length-num);
  if(flags&1)num+=(r[r.length-num-1]&3)+1;
  return num;
}
async function parseMobi(blob,name){
  const buf=new Uint8Array(await blob.arrayBuffer());const dv=new DataView(buf.buffer);
  if(buf.length<86)throw new Error('This MOBI file is broken');
  const nrec=dv.getUint16(76);const offs=[];for(let i=0;i<nrec;i++)offs.push(dv.getUint32(78+i*8));offs.push(buf.length);
  const rec=i=>buf.subarray(offs[i],offs[i+1]);
  const r0=rec(0),d0=new DataView(r0.buffer,r0.byteOffset,r0.byteLength);
  const compression=d0.getUint16(0),textRecs=d0.getUint16(8),textLen=d0.getUint32(4),enc=d0.getUint16(12);
  if(enc!==0)throw new Error('This book is DRM-protected, so it can’t be opened');
  if(compression===17480)throw new Error('This MOBI uses Huffman compression, which isn’t supported — convert it to EPUB');
  let title=new TextDecoder('latin1').decode(buf.subarray(0,32)).replace(/\0.*$/,'').replace(/_/g,' '),author='',encoding='windows-1252',firstImg=-1,extra=0,coverOff=-1;
  const magic=String.fromCharCode(r0[16],r0[17],r0[18],r0[19]);
  if(magic==='MOBI'){
    const hl=d0.getUint32(20);if(d0.getUint32(28)===65001)encoding='utf-8';
    firstImg=d0.getUint32(108);
    const fo=d0.getUint32(84),fl=d0.getUint32(88);if(fo&&fl&&fo+fl<=r0.length)title=new TextDecoder(encoding).decode(r0.subarray(fo,fo+fl));
    if(hl>=0xE4&&r0.length>=244)extra=d0.getUint16(242);
    if(d0.getUint32(128)&0x40){let p=16+hl;
      if(String.fromCharCode(r0[p],r0[p+1],r0[p+2],r0[p+3])==='EXTH'){const n=d0.getUint32(p+8);p+=12;
        for(let i=0;i<n&&p+8<=r0.length;i++){const t=d0.getUint32(p),l=d0.getUint32(p+4);const data=r0.subarray(p+8,p+l);
          if(t===100)author+=(author?', ':'')+new TextDecoder(encoding).decode(data);
          else if(t===503)title=new TextDecoder(encoding).decode(data);
          else if(t===201&&data.length>=4)coverOff=new DataView(data.buffer,data.byteOffset,4).getUint32(0);
          p+=l}}}
  }
  const chunks=[];let total=0;
  for(let i=1;i<=textRecs&&i<nrec;i++){let r=rec(i);r=r.subarray(0,r.length-trailingSize(r,extra));const u=compression===2?palmdoc(r):r;chunks.push(u);total+=u.length}
  const all=new Uint8Array(total);let o=0;for(const c of chunks){all.set(c,o);o+=c.length}
  const html=new TextDecoder(encoding).decode(all.subarray(0,textLen||total));
  const images={};
  const imgRec=idx=>{const ri=firstImg+idx;if(firstImg<0||ri<=0||ri>=nrec)return null;const key='m:'+ri;if(!images[key]){const b=rec(ri);const t=sniffImage(b);if(!t)return null;images[key]=new Blob([b],{type:t})}return key};
  const pieces=html.split(/<mbp:pagebreak[^>]*>/i);const raw=[];
  for(const p of pieces){
    if(!p.replace(/<[^>]+>/g,'').trim()&&!/<img/i.test(p))continue;
    const d=htmlDoc(p.replace(/<(\/?)mbp:[^>]*>/gi,''));
    const ctx={chars:0,id:id=>'m-'+id,
      src:src=>{const m=/kindle:embed:([0-9A-V]+)/i.exec(src||'');return m?imgRec(parseInt(m[1],32)-1):null},
      href:h=>isExternal(h)?{ext:h}:null};
    d.querySelectorAll('img[recindex]').forEach(im=>{const k=imgRec(parseInt(im.getAttribute('recindex'),10)-1);if(k)im.setAttribute('src','__'+k);else im.remove()});
    const src0=ctx.src;ctx.src=s=>String(s).startsWith('__')?String(s).slice(2):src0(s);
    raw.push({title:'',html:serialize(d.body,ctx)});
  }
  if(!raw.length)throw new Error('No readable text was found in this MOBI file');
  let all2=raw;
  if(raw.length===1){const byH=chaptersByHeading(raw[0].html,/(?=<h[12][ >])/i);if(byH.length>1)all2=byH}
  const coverKey=coverOff>=0?imgRec(coverOff):null;
  return{title:title.trim()||baseName(name),author,coverKey,model:finalize(all2,[],{title,images,merge:true})};
}

/* ---------- PDF (pdf.js, loaded on demand and cached for offline use by the service worker) ---------- */
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let _pdfjs=null;
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(_pdfjs)return _pdfjs;
  _pdfjs=new Promise((res,rej)=>{const s=document.createElement('script');s.src=PDFJS+'pdf.min.js';s.crossOrigin='anonymous';
    s.onload=()=>{const L=window.pdfjsLib;if(!L)return rej(new Error('PDF reader failed to load'));L.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js';res(L)};
    s.onerror=()=>{_pdfjs=null;rej(new Error('Connect to the internet once to set up the PDF reader'))};document.head.appendChild(s)});
  return _pdfjs;
}
async function openPdf(blob){const L=await loadPdfJs();return L.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise}
async function pdfToc(doc){
  try{const ol=await doc.getOutline();if(!ol)return[];const out=[];
    const walk=async(items,lvl)=>{for(const it of items){let ch=-1;
      try{let dest=it.dest;if(typeof dest==='string')dest=await doc.getDestination(dest);if(dest&&dest[0])ch=typeof dest[0]==='number'?dest[0]:await doc.getPageIndex(dest[0])}catch(e){}
      if(ch>=0)out.push({title:String(it.title||'').trim(),ch,id:null,level:lvl});if(it.items&&it.items.length&&lvl<4)await walk(it.items,lvl+1)}};
    await walk(ol,0);return out.filter(e=>e.title)}catch(e){return[]}
}

/* ---------- covers ---------- */
async function thumbFromBlob(blob){
  try{
    const url=URL.createObjectURL(blob);
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const w=200,h=Math.round(w*img.naturalHeight/Math.max(1,img.naturalWidth));
    const c=document.createElement('canvas');c.width=w;c.height=Math.min(h,400);c.getContext('2d').drawImage(img,0,0,w,h);
    URL.revokeObjectURL(url);return c.toDataURL('image/jpeg',.78);
  }catch(e){return null}
}
async function pdfThumb(doc){
  try{const pg=await doc.getPage(1);const v0=pg.getViewport({scale:1});const v=pg.getViewport({scale:200/v0.width});
    const c=document.createElement('canvas');c.width=Math.round(v.width);c.height=Math.round(v.height);
    await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.toDataURL('image/jpeg',.78)}catch(e){return null}
}

/* ---------- where a book's file lives ----------
   stored: 'file' (a copy in the app) · 'text' (only the extracted text is kept) · 'linked' (read from a
   folder you linked, on browsers that allow it — Chrome on Mac/Windows/Android; not Safari on iPhone) */
const STORE_MODE_KEY='insta_books_store';
const storeMode=()=>{try{return localStorage.getItem(STORE_MODE_KEY)||'copy'}catch(e){return'copy'}};
const canLinkFolder=()=>typeof window.showDirectoryPicker==='function';
async function folderRec(){try{return await dbGet('files','__folder')}catch(e){return null}}
async function folderPerm(rec,ask){
  if(!rec||!rec.handle)return false;
  try{let p=await rec.handle.queryPermission({mode:'read'});if(p!=='granted'&&ask)p=await rec.handle.requestPermission({mode:'read'});return p==='granted'}catch(e){return false}
}
async function linkedFile(path,ask){
  const rec=await folderRec();if(!rec)throw new Error('The linked folder isn’t connected any more — link it again in Books → Storage');
  if(!(await folderPerm(rec,ask)))throw new Error('Allow access to the linked folder to open this book');
  const parts=String(path).split('/');let dir=rec.handle;
  for(const seg of parts.slice(0,-1))dir=await dir.getDirectoryHandle(seg);
  return(await dir.getFileHandle(parts[parts.length-1])).getFile();
}
async function getBookFile(book,ask){
  if(book.stored==='linked'&&book.linked)return linkedFile(book.linked,ask!==false);
  const f=await dbGet('files',book.id);
  if(!f||!f.blob)throw new Error(book.stored==='text'?'Only the text of this book is kept — re-link the original file from its ⋯ menu to see pages and pictures':'The book file is missing');
  return f.blob;
}
async function scanFolder(dir,onFound){
  const out=[];
  const walk=async(d,prefix,depth)=>{for await(const [name,hd] of d.entries()){
    if(name.startsWith('.'))continue;
    if(hd.kind==='directory'&&depth<3)await walk(hd,prefix+name+'/',depth+1);
    else if(hd.kind==='file'&&isBookFile({name}))out.push({path:prefix+name,handle:hd})}};
  await walk(dir,'',0);
  await Store.load();const known=new Set((Store.list||[]).filter(b=>b.linked).map(b=>b.linked));
  const fresh=out.filter(x=>!known.has(x.path));
  for(let i=0;i<fresh.length;i++){onFound&&onFound(i,fresh.length,fresh[i].path);try{const f=await fresh[i].handle.getFile();await importFiles([f],null,{linked:fresh[i].path})}catch(e){}}
  return{total:out.length,added:fresh.length};
}
async function linkFolder(){
  const dir=await window.showDirectoryPicker({mode:'read'});
  await dbPut('files',{id:'__folder',handle:dir,name:dir.name,at:Date.now()});
  return dir;
}
/* text of every PDF page (or its OCR text) → a reflowable book, for "keep text only" */
async function pdfTextModel(doc,ocrPages){
  const raw=[];
  for(let i=0;i<doc.numPages;i++){
    const pt=await pdfPageText(doc,i);let t=pt.nl||'';
    if(t.replace(/\s+/g,'').length<10&&ocrPages&&ocrPages[i])t=ocrPages[i];
    const paras=t.split(/\n\s*\n|\n(?=[A-Z0-9“"‘(\[•\-–—])/).map(x=>x.replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);
    raw.push({title:'Page '+(i+1),html:'<h3 class="bkc">Page '+(i+1)+'</h3>'+paras.map(x=>'<p>'+esc(x)+'</p>').join('')});
  }
  const chars=raw.reduce((n,c)=>n+c.html.replace(/<[^>]+>/g,'').length,0);
  return{model:finalize(raw,raw.map((c,i)=>({title:c.title,ch:i})),{}),chars};
}

/* ---------- parse dispatcher + cache ---------- */
const memParsed=new Map();
async function parseFile(format,blob,name){
  if(format==='epub')return parseEpub(blob);
  if(format==='fb2')return parseFb2(blob);
  if(format==='docx')return parseDocx(blob,name);
  if(format==='mobi')return parseMobi(blob,name);
  if(format==='md'||format==='txt')return parseText(blob,name,format==='md');
  throw new Error('Unsupported format');
}
async function getModel(book){
  if(memParsed.has(book.id))return memParsed.get(book.id);
  let rec=null;try{rec=await dbGet('parsed',book.id)}catch(e){}
  if(rec&&rec.v===PARSE_V&&rec.model){memParsed.set(book.id,rec.model);return rec.model}
  const blob=await getBookFile(book);
  const r=await parseFile(book.format,blob,book.name);
  try{await dbPut('parsed',{id:book.id,v:PARSE_V,model:r.model})}catch(e){}
  memParsed.set(book.id,r.model);return r.model;
}

/* ---------- import ---------- */
async function importFiles(fileList,onProgress,opts){
  opts=opts||{};const textOnly=!opts.linked&&(opts.textOnly!=null?opts.textOnly:storeMode()==='text');
  await Store.load();
  const files=Array.from(fileList||[]).filter(isBookFile);const added=[],failed=[];
  for(let i=0;i<files.length;i++){
    const f=files[i],format=bookFormat(f);
    onProgress&&onProgress(i,files.length,f.name);
    try{
      const id=bid();let title=baseName(f.name),author='',cover=null,pages=0,model=null,pdfScanned=false;
      if(format==='pdf'){
        const doc=await openPdf(f).catch(e=>{throw e});pages=doc.numPages;
        try{const m=await doc.getMetadata();const t=m&&m.info&&m.info.Title;if(t&&String(t).trim().length>2)title=String(t).trim();const a=m&&m.info&&m.info.Author;if(a)author=String(a).trim()}catch(e){}
        cover=await pdfThumb(doc);
        if(textOnly){const r=await pdfTextModel(doc);if(r.chars>pages*40)model=r.model;else pdfScanned=true}
        try{doc.destroy()}catch(e){}
      }else{
        const r=await parseFile(format,f,f.name);model=r.model;
        if(r.title)title=r.title;author=r.author||'';
        if(r.coverKey){let b=null;
          if(r.coverKey.startsWith('z:')){try{const z=await readZip(f);b=await z.blob(r.coverKey.slice(2))}catch(e){}}
          else if(model.images)b=model.images[r.coverKey];
          if(b)cover=await thumbFromBlob(b)}
        if(!cover&&format==='epub'){ /* first image in the book */
          const m=/data-bksrc="(z:[^"]+)"/.exec(model.chapters.slice(0,3).map(c=>c.html).join(''));
          if(m){try{const z=await readZip(f);const b=await z.blob(m[1].slice(2));if(b)cover=await thumbFromBlob(b)}catch(e){}}}
      }
      const now=Date.now();
      const book={id,title,author,format,name:f.name,size:f.size,addedAt:now,openedAt:0,cover,shelf:'toread',fav:false,
        pos:{ch:0,frac:0},progress:0,pages,chapters:model?model.chapters.length:pages,total:model?model.chapters.reduce((s,c)=>s+Math.max(c.n,300),0):0,
        bookmarks:[],highlights:[],readSec:0,speed:null,
        stored:opts.linked?'linked':(textOnly&&model?'text':'file'),linked:opts.linked||null,textOnly:format==='pdf'&&textOnly&&!!model};
      if(book.stored==='file')await dbPut('files',{id,blob:f});
      if(pdfScanned&&textOnly)failed.push({name:f.name,error:'Scanned PDF — kept a full copy (open it and use “Make searchable” to read its text)'});
      if(model){try{await dbPut('parsed',{id,v:PARSE_V,model})}catch(e){}memParsed.set(id,model)}
      await dbPut('books',book);Store.add(book);added.push(book);
    }catch(e){failed.push({name:f.name,error:(e&&e.message)||'Couldn’t open this file'})}
  }
  return{added,failed};
}

/* storage actions (library + book menu) */
async function makeTextOnly(b){
  if(b.format==='pdf'){
    const blob=await getBookFile(b);const doc=await openPdf(blob);docOcr.set(doc,b.ocrPages||{});
    let r;try{r=await pdfTextModel(doc,b.ocrPages)}finally{try{doc.destroy()}catch(e){}}
    if(r.chars<(b.pages||1)*40)throw new Error('This PDF is scanned — open it and tap “Make searchable” first, then keep text only');
    await dbPut('parsed',{id:b.id,v:PARSE_V,model:r.model});memParsed.set(b.id,r.model);
    await dbDel('files',b.id);Store.patch(b.id,{stored:'text',textOnly:true});return'Kept the text — the PDF copy was removed';
  }
  await getModel(b);await dbDel('files',b.id);Store.patch(b.id,{stored:'text'});
  return'Kept the text — the file copy was removed';
}
async function relinkBook(b,file){
  if(bookFormat(file)!==b.format&&!(b.format==='mobi'&&bookFormat(file)==='mobi'))throw new Error('That’s a '+(FORMAT_LABEL[bookFormat(file)]||'different')+' file — pick the original '+FORMAT_LABEL[b.format]);
  if(b.size&&Math.abs(file.size-b.size)>Math.max(2048,b.size*.02)&&!confirm('“'+file.name+'” looks different from the original. Use it anyway?'))return null;
  await dbPut('files',{id:b.id,blob:file});Store.patch(b.id,{stored:'file',textOnly:false,size:file.size,name:file.name,linked:null});
  return'Original file re-linked';
}
const STORED_LABEL={file:'Full copy in the app',text:'Text only (no file copy)',linked:'Read from your linked folder'};

/* ============================== UI helpers ============================== */
const BI={ /* book-specific icons (Svg/P come from app.js) */
  book:s=>Svg({size:s},P('M4.5 5.2c0-.7.6-1.2 1.3-1.2H11c.6 0 1 .4 1 1v14.6c0-.8-.7-1.4-1.5-1.4H5.8c-.7 0-1.3-.6-1.3-1.3V5.2Z'),P('M19.5 5.2c0-.7-.6-1.2-1.3-1.2H13c-.6 0-1 .4-1 1v14.6c0-.8.7-1.4 1.5-1.4h4.7c.7 0 1.3-.6 1.3-1.3V5.2Z')),
  bookmark:(s,fill)=>Svg({size:s},h('path',{d:'M7 4h10c.6 0 1 .4 1 1v15l-6-3.8L6 20V5c0-.6.4-1 1-1Z',stroke:'currentColor',strokeWidth:1.7,strokeLinejoin:'round',fill:fill?'currentColor':'none'})),
  toc:s=>Svg({size:s},P('M9 6.5h11M9 12h11M9 17.5h11'),h('circle',{cx:4.8,cy:6.5,r:1.1,fill:'currentColor'}),h('circle',{cx:4.8,cy:12,r:1.1,fill:'currentColor'}),h('circle',{cx:4.8,cy:17.5,r:1.1,fill:'currentColor'})),
  aa:s=>Svg({size:s},P('M3.5 18.5 8 6.5l4.5 12M5.2 14.2h5.6'),P('M14.5 18.5l3-8 3 8M15.6 15.8h3.8')),
  pages:s=>Svg({size:s},P('M5 5.5h6.2c.5 0 .8.3.8.8V19c0-.6-.5-1-1-1H5V5.5ZM19 5.5h-6.2c-.5 0-.8.3-.8.8V19c0-.6.5-1 1-1h6V5.5Z')),
  scroll:s=>Svg({size:s},h('rect',{x:6,y:3.5,width:12,height:17,rx:2,stroke:'currentColor',strokeWidth:1.7}),P('M9.5 8h5M9.5 11.5h5M9.5 15h3')),
  stats:s=>Svg({size:s},P('M5 19.5V12M10 19.5V6M15 19.5v-5M20 19.5V9')),
  grid:s=>Svg({size:s},h('rect',{x:4,y:4,width:6.5,height:6.5,rx:1.5,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:13.5,y:4,width:6.5,height:6.5,rx:1.5,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:4,y:13.5,width:6.5,height:6.5,rx:1.5,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:13.5,y:13.5,width:6.5,height:6.5,rx:1.5,stroke:'currentColor',strokeWidth:1.7})),
  up:s=>Svg({size:s},P('M6 14.5l6-6 6 6')),down:s=>Svg({size:s},P('M6 9.5l6 6 6-6'))
};
const NOHL=[];
const HL_COLORS=[['y','rgba(255,214,70,.45)','#f3c93b'],['g','rgba(110,205,120,.42)','#5cbf6a'],['b','rgba(100,170,255,.4)','#5a9cf0'],['p','rgba(255,120,170,.4)','#f07aa6']];
const hlBg=c=>(HL_COLORS.find(x=>x[0]===c)||HL_COLORS[0])[1];
const COVER_TINTS=[['#3b4a6b','#1c2333'],['#6b3b3b','#2b1a1a'],['#2f5d50','#14271f'],['#5b4a2e','#261f12'],['#4a3b6b','#1d1730'],['#2e4f6b','#132331'],['#6b5a3b','#2a2416'],['#3d3d45','#18181c']];
function tintFor(s){let x=0;for(const c of String(s||''))x=(x*31+c.charCodeAt(0))>>>0;return COVER_TINTS[x%COVER_TINTS.length]}
function Cover({book,radius,big}){
  const [c1,c2]=tintFor(book.title);
  const box={position:'relative',width:'100%',paddingTop:'150%',borderRadius:radius||8,overflow:'hidden',background:'linear-gradient(160deg,'+c1+','+c2+')',boxShadow:'0 6px 18px rgba(0,0,0,.22), inset 0 0 0 .5px rgba(255,255,255,.08)'};
  return h('div',{style:box},
    book.cover?h('img',{src:book.cover,alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}):
      h('div',{style:{position:'absolute',inset:0,padding:big?'16px 14px':'10px 9px',display:'flex',flexDirection:'column',color:'#f4efe6'}},
        h('div',{style:{position:'absolute',left:big?10:6,top:0,bottom:0,width:2,background:'rgba(255,255,255,.12)'}}),
        h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:big?17:12.5,fontWeight:600,lineHeight:1.2,display:'-webkit-box',WebkitLineClamp:5,WebkitBoxOrient:'vertical',overflow:'hidden',paddingLeft:big?8:5}},book.title),
        h('div',{style:{flex:1}}),
        book.author?h('div',{style:{fontSize:big?11.5:9.5,opacity:.75,paddingLeft:big?8:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},book.author):null,
        h('div',{style:{fontSize:big?10:8.5,fontWeight:700,letterSpacing:'.08em',opacity:.55,paddingLeft:big?8:5,marginTop:3}},FORMAT_LABEL[book.format]||'')),
    h('div',{style:{position:'absolute',left:0,top:0,bottom:0,width:'7%',background:'linear-gradient(90deg,rgba(0,0,0,.22),rgba(255,255,255,.06) 70%,transparent)'}}));
}
const pct=p=>Math.floor(Math.max(0,Math.min(1,p||0))*100)+'%';
function ProgressBar({T,value,thin}){
  return h('div',{style:{height:thin?3:4,borderRadius:3,background:T.hair,overflow:'hidden'}},
    h('div',{style:{height:'100%',width:(Math.max(0,Math.min(1,value||0))*100)+'%',background:T.fg,borderRadius:3,transition:'width 300ms'}}));
}

/* ============================== library ============================== */
const SHELVES=[['reading','Reading'],['toread','To read'],['finished','Finished'],['fav','Favourites'],['all','All']];
function timeLeftBook(b){
  if(b.format==='pdf'){const per=b.readSec&&b.pagesRead?b.readSec/b.pagesRead:90;return(b.pages||0)*(1-(b.progress||0))*per}
  const sp=(b.speed&&b.speed.sec>120)?b.speed.chars/b.speed.sec:18;return(b.total||0)*(1-(b.progress||0))/sp;
}
function BooksLibrary({T,query,toastFn}){
  const books=useBooks();
  const [shelf,setShelfS]=useState(()=>{try{return localStorage.getItem('insta_books_shelf')||'all'}catch(e){return'all'}});
  const setShelf=s=>{setShelfS(s);try{localStorage.setItem('insta_books_shelf',s)}catch(e){}};
  const [busy,setBusy]=useState(null);
  const [act,setAct]=useState(null);
  const [statsOpen,setStatsOpen]=useState(false);
  const [storageOpen,setStorageOpen]=useState(false);
  useEffect(()=>{ /* a linked folder (Chrome on desktop/Android): pick up new books silently */
    let dead=false;(async()=>{const rec=await folderRec();if(!rec||!(await folderPerm(rec,false))||dead)return;
      try{const r=await scanFolder(rec.handle);if(r.added&&!dead)toastFn&&toastFn(r.added+' new '+(r.added===1?'book':'books')+' from “'+rec.name+'”')}catch(e){}})();
    return()=>{dead=true};
  },[]);
  const inputRef=useRef(null);
  const stats=useMemo(()=>loadStats(),[books]);
  const today=stats.days[dayKey()]||{sec:0,pages:0};
  const str=readStreak(stats);
  if(!books)return h('div',{style:{display:'flex',justifyContent:'center',padding:40}},h(Spinner,{T}));
  const q=String(query||'').trim().toLowerCase();
  const inShelf=b=>shelf==='all'||(shelf==='fav'?b.fav:b.shelf===shelf);
  const list=books.filter(b=>inShelf(b)&&(!q||(b.title||'').toLowerCase().includes(q)||(b.author||'').toLowerCase().includes(q))).sort(byRecent);
  const cont=books.filter(b=>b.shelf==='reading').sort(byRecent)[0];
  const count=k=>k==='all'?books.length:k==='fav'?books.filter(b=>b.fav).length:books.filter(b=>b.shelf===k).length;
  const open=b=>window.dispatchEvent(new CustomEvent('insta-book-open',{detail:{id:b.id}}));
  const onFiles=async fs=>{
    const arr=Array.from(fs||[]);if(!arr.length)return;
    const ok=arr.filter(isBookFile);if(!ok.length){toastFn&&toastFn('Those files aren’t books');return}
    setBusy({i:0,n:ok.length,name:ok[0].name});
    const r=await importFiles(ok,(i,n,name)=>setBusy({i,n,name}));
    setBusy(null);
    if(r.added.length)toastFn&&toastFn(r.added.length===1?'Added “'+r.added[0].title+'”':r.added.length+' books added');
    if(r.failed.length)setTimeout(()=>toastFn&&toastFn(r.failed[0].name+': '+r.failed[0].error),r.added.length?2200:0);
  };
  const upload=()=>{const el=inputRef.current;if(el){el.value='';el.click()}};
  return h('div',{style:{padding:'4px 16px 0'}},
    h('input',{ref:inputRef,type:'file',multiple:true,accept:ACCEPT,style:{display:'none'},onChange:e=>onFiles(e.target.files)}),
    /* stats strip */
    h('button',{onClick:()=>setStatsOpen(true),className:'act98',style:{display:'flex',width:'100%',alignItems:'stretch',gap:0,borderRadius:16,background:T.card,color:T.fg,padding:'12px 4px',marginBottom:16,textAlign:'center'}},
      [[fmtDur(today.sec),'today'],[String(Math.round(today.pages)),'pages today'],[str+(str===1?' day':' days'),'streak'],[String(books.filter(b=>b.shelf==='finished').length),'finished']].map(([v,l],i)=>
        h('div',{key:l,style:{flex:1,borderLeft:i?'1px solid '+T.hair:'none',padding:'0 4px'}},
          h('div',{style:{fontSize:16,fontWeight:750,letterSpacing:'-.01em'}},v),
          h('div',{style:{fontSize:11,color:T.sub,marginTop:2}},l)))),
    /* continue reading */
    cont&&!q?h('button',{onClick:()=>open(cont),className:'act98',style:{display:'flex',gap:14,width:'100%',textAlign:'left',color:T.fg,padding:14,borderRadius:18,background:T.card,marginBottom:18,alignItems:'center'}},
      h('div',{style:{width:74,flexShrink:0}},h(Cover,{book:cont,radius:6})),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:T.sub}},'Continue reading'),
        h('div',{style:{fontSize:17,fontWeight:700,lineHeight:1.25,marginTop:5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},cont.title),
        cont.author?h('div',{style:{fontSize:12.5,color:T.sub,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},cont.author):null,
        h('div',{style:{marginTop:10}},h(ProgressBar,{T,value:cont.progress})),
        h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:11.5,color:T.sub,marginTop:5}},
          h('span',null,pct(cont.progress)+' read'),h('span',null,fmtDur(timeLeftBook(cont))+' left')))):null,
    /* shelves */
    h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',margin:'0 -16px',padding:'0 16px 14px'}},
      SHELVES.map(([k,l])=>h('button',{key:k,onClick:()=>setShelf(k),className:'act95',style:{flexShrink:0,display:'flex',alignItems:'center',gap:6,padding:'7px 13px',borderRadius:999,fontSize:13,fontWeight:600,
        background:shelf===k?T.fg:'transparent',color:shelf===k?T.bg:T.fg,border:'1px solid '+(shelf===k?T.fg:T.hair)}},l,
        h('span',{style:{fontSize:11,fontWeight:750,opacity:.6}},count(k))))),
    h('div',{style:{display:'flex',justifyContent:'flex-end',margin:'-6px 0 10px'}},
      h('button',{onClick:()=>setStorageOpen(true),className:'act95',style:{display:'flex',alignItems:'center',gap:6,fontSize:12.5,fontWeight:650,color:T.sub}},Icons.folder(15),
        'Storage · '+(()=>{const n=books.reduce((s2,b)=>s2+((b.stored==='file'||!b.stored)?(b.size||0):0),0);return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB'})())),
    busy?h('div',{className:'fdin',style:{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,background:T.card,marginBottom:14,fontSize:13}},
      h(Spinner,{T,size:15}),h('span',{style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'Adding '+(busy.n>1?(busy.i+1)+' of '+busy.n+' · ':'')+busy.name)):null,
    /* grid */
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',columnGap:14,rowGap:22}},
      h('button',{onClick:upload,className:'act98',style:{display:'block',width:'100%',color:T.sub,textAlign:'left'}},
        h('div',{style:{position:'relative',width:'100%',paddingTop:'150%',borderRadius:8,border:'1.5px dashed '+T.hair}},
          h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}},
            h('span',{style:{width:40,height:40,borderRadius:20,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',color:T.fg}},Icons.plus(20)),
            h('span',{style:{fontSize:12,fontWeight:650,color:T.fg}},'Add books'),
            h('span',{style:{fontSize:10,lineHeight:1.35,textAlign:'center',padding:'0 8px'}},'EPUB · PDF · MOBI · FB2 · DOCX · TXT')))),
      list.map(b=>h(BookCard,{key:b.id,T,b,onOpen:open,onAct:setAct}))),
    !list.length&&books.length?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13.5,padding:'26px 10px 0'}},q?'No books match “'+query.trim()+'”.':'Nothing on this shelf yet.'):null,
    !books.length?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13.5,lineHeight:1.5,padding:'22px 18px 0'}},'Your books stay on this device and work offline. Pick up where you left off, bookmark pages, highlight passages and watch your reading streak grow.'):null,
    h('div',{style:{height:'calc(30px + env(safe-area-inset-bottom))'}}),
    /* sheets render on <body>: the library lives inside an animated (transformed) page, which would trap position:fixed */
    act?toBody(h(BookActions,{T,book:act,onClose:()=>setAct(null),toastFn,onOpen:()=>{setAct(null);open(act)}})):null,
    statsOpen?toBody(h(StatsSheet,{T,books,onClose:()=>setStatsOpen(false)})):null,
    storageOpen?toBody(h(StorageSheet,{T,books,onClose:()=>setStorageOpen(false),toastFn})):null);
}
const toBody=el=>window.ReactDOM&&ReactDOM.createPortal?ReactDOM.createPortal(el,document.body):el;
function useLongPressLite(cb){
  const t=useRef(null),fired=useRef(false);
  const start=()=>{fired.current=false;clearTimeout(t.current);t.current=setTimeout(()=>{fired.current=true;try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}cb()},480)};
  const cancel=()=>clearTimeout(t.current);
  return{fired,handlers:{onTouchStart:start,onTouchMove:cancel,onTouchEnd:cancel,onContextMenu:e=>{e.preventDefault();fired.current=true;cb()}}};
}
function BookCard({T,b,onOpen,onAct}){
  const lp=useLongPressLite(()=>onAct(b));
  return h('div',{style:{minWidth:0}},
    h('button',Object.assign({onClick:()=>{if(!lp.fired.current)onOpen(b)},className:'act98',style:{display:'block',width:'100%',textAlign:'left',color:T.fg}},lp.handlers),
      h('div',{style:{position:'relative'}},h(Cover,{book:b}),
        b.shelf==='finished'?h('span',{style:{position:'absolute',right:6,top:6,width:22,height:22,borderRadius:11,background:'rgba(0,0,0,.6)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}},Icons.check(13)):null,
        b.fav?h('span',{style:{position:'absolute',right:8,top:0,color:'#f3c93b',filter:'drop-shadow(0 1px 2px rgba(0,0,0,.4))'}},BI.bookmark(18,true)):null),
      h('div',{style:{fontSize:13,fontWeight:650,lineHeight:1.25,marginTop:8,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},b.title),
      h('div',{style:{fontSize:11.5,color:T.sub,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},b.author||FORMAT_LABEL[b.format])),
    h('div',{style:{display:'flex',alignItems:'center',gap:6,marginTop:6}},
      h('div',{style:{flex:1}},h(ProgressBar,{T,value:b.progress,thin:true})),
      h('span',{style:{fontSize:10.5,fontWeight:650,color:b.progress?T.fg:T.sub}},b.shelf==='finished'?'Done':b.progress?pct(b.progress):'New'),
      h('button',{onClick:()=>onAct(b),'aria-label':'Book options',className:'act90',style:{display:'flex',color:T.sub,padding:2,marginRight:-4}},Icons.dots(16))));
}
function BookActions({T,book,onClose,onOpen,toastFn}){
  const b=Store.get(book.id)||book;
  const [confirm,setConfirm]=useState(false);const [busy,setBusy]=useState(false);const relinkRef=useRef(null);
  const run=async fn=>{setBusy(true);try{const m=await fn();if(m)toastFn&&toastFn(m);onClose()}catch(e){toastFn&&toastFn((e&&e.message)||'Something went wrong')}setBusy(false)};
  const move=s=>{Store.patch(b.id,{shelf:s,finishedAt:s==='finished'?Date.now():b.finishedAt,progress:s==='finished'?1:b.progress});toastFn&&toastFn('Moved to '+(SHELVES.find(x=>x[0]===s)||[])[1]);onClose()};
  const share=async()=>{try{const blob=await getBookFile(b);const file=new File([blob],b.name||(b.title+'.'+b.format),{type:blob.type||'application/octet-stream'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:b.title});return}
    const u=URL.createObjectURL(file);const a=document.createElement('a');a.href=u;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}catch(e){}};
  return h(Sheet,{T,onClose,title:null,z:90},
    h('div',{style:{display:'flex',gap:14,padding:'12px 20px 16px',borderBottom:'1px solid '+T.hair}},
      h('div',{style:{width:58,flexShrink:0}},h(Cover,{book:b,radius:5})),
      h('div',{style:{minWidth:0,flex:1}},
        h('div',{style:{fontSize:16.5,fontWeight:700,lineHeight:1.25}},b.title),
        h('div',{style:{fontSize:12.5,color:T.sub,marginTop:3}},[b.author,FORMAT_LABEL[b.format],b.size?(b.size/1048576).toFixed(1)+' MB':''].filter(Boolean).join(' · ')),
        h('div',{style:{fontSize:12.5,color:T.sub,marginTop:3}},pct(b.progress)+' read · '+fmtDur(b.readSec)+' spent reading'),
        h('div',{style:{fontSize:12,color:T.sub,marginTop:3}},STORED_LABEL[b.stored||'file']))),
    h('input',{ref:relinkRef,type:'file',accept:ACCEPT,style:{display:'none'},onChange:e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)run(()=>relinkBook(b,f))}}),
    h(ARow,{T,icon:BI.book(21),label:b.progress?'Continue reading':'Start reading',onClick:onOpen}),
    SHELVES.filter(([k])=>k!=='all'&&k!=='fav'&&k!==b.shelf).map(([k,l])=>h(ARow,{key:k,T,icon:k==='finished'?Icons.checkCircle(21):k==='reading'?Icons.play(21):Icons.clock(21),label:'Move to '+l,onClick:()=>move(k)})),
    h(ARow,{T,icon:BI.bookmark(21,b.fav),label:b.fav?'Remove from Favourites':'Add to Favourites',onClick:()=>{Store.patch(b.id,{fav:!b.fav});onClose()}}),
    h(ARow,{T,icon:Icons.pencil(21),label:'Rename',onClick:()=>{const t=prompt('Book title',b.title);if(t&&t.trim()){Store.patch(b.id,{title:t.trim()});onClose()}}}),
    b.progress?h(ARow,{T,icon:Icons.refresh(21),label:'Start over',sub:'Reset progress to the beginning',onClick:()=>{Store.patch(b.id,{pos:{ch:0,frac:0},progress:0,shelf:'toread'});onClose()}}):null,
    (b.stored||'file')==='file'?h(ARow,{T,icon:Icons.file(21),label:busy?'Working…':'Keep text only',sub:'Remove the file copy; keep text, progress and highlights',onClick:()=>run(()=>makeTextOnly(b))}):null,
    b.stored==='text'?h(ARow,{T,icon:Icons.link(21),label:busy?'Working…':'Re-link the original file',sub:'Pick it from Files to bring back pages and pictures',onClick:()=>relinkRef.current&&relinkRef.current.click()}):null,
    b.stored!=='text'?h(ARow,{T,icon:Icons.share(21),label:'Share or save the file',onClick:share}):null,
    h(ARow,{T,icon:Icons.trash(21),label:confirm?'Tap again to delete for good':'Delete book',danger:true,onClick:()=>{if(!confirm){setConfirm(true);return}Store.remove(b.id);memParsed.delete(b.id);toastFn&&toastFn('Book deleted');onClose()}}));
}
function StorageSheet({T,books,onClose,toastFn}){
  const [est,setEst]=useState(null);const [mode,setModeS]=useState(storeMode);const [busy,setBusy]=useState(null);const [folder,setFolder]=useState(undefined);
  const relinkRef=useRef(null),relinkFor=useRef(null);
  useEffect(()=>{try{navigator.storage.estimate().then(setEst).catch(()=>{})}catch(e){}folderRec().then(r=>setFolder(r||null))},[books&&books.length]);
  const setMode=m=>{setModeS(m);try{localStorage.setItem(STORE_MODE_KEY,m)}catch(e){}};
  const mb=n=>n>=1073741824?(n/1073741824).toFixed(1)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  const fileBytes=b=>b.stored==='file'||!b.stored?(b.size||0):0;
  const total=books.reduce((s,b)=>s+fileBytes(b),0);
  const list=[...books].sort((a,b)=>fileBytes(b)-fileBytes(a));
  const run=async(b,fn)=>{setBusy(b.id);try{const m=await fn();if(m)toastFn&&toastFn(m)}catch(e){toastFn&&toastFn((e&&e.message)||'Something went wrong')}setBusy(null)};
  const link=async()=>{try{const dir=await linkFolder();setFolder({name:dir.name});setBusy('folder');const r=await scanFolder(dir);toastFn&&toastFn(r.added?r.added+' books added from “'+dir.name+'”':'Linked “'+dir.name+'” — no new books found')}catch(e){if(e&&e.name!=='AbortError')toastFn&&toastFn((e&&e.message)||'Couldn’t link the folder')}setBusy(null)};
  const rescan=async()=>{const rec=await folderRec();if(!rec)return;if(!(await folderPerm(rec,true))){toastFn&&toastFn('Allow access to the folder to rescan');return}
    setBusy('folder');try{const r=await scanFolder(rec.handle);toastFn&&toastFn(r.added?r.added+' new books added':'No new books in the folder')}catch(e){toastFn&&toastFn('Couldn’t read the folder')}setBusy(null)};
  const seg=(opts,val,on)=>h('div',{style:{display:'flex',gap:4,background:T.card,borderRadius:11,padding:3}},
    opts.map(([v,l])=>h('button',{key:v,onClick:()=>on(v),className:'act95',style:{flex:1,padding:'8px 4px',borderRadius:8,fontSize:13,fontWeight:650,background:val===v?T.bg:'transparent',color:val===v?T.fg:T.sub,boxShadow:val===v?'0 1px 3px rgba(0,0,0,.12)':'none'}},l)));
  const lab=t=>h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,margin:'18px 0 8px'}},t);
  return h(Sheet,{T,onClose,title:'Storage',z:90,maxH:'90%'},
    h('input',{ref:relinkRef,type:'file',accept:ACCEPT,style:{display:'none'},onChange:e=>{const f=e.target.files&&e.target.files[0];e.target.value='';const b=relinkFor.current;if(f&&b)run(b,()=>relinkBook(b,f))}}),
    h('div',{style:{padding:'0 18px 20px'}},
      h('div',{style:{display:'flex',gap:10}},
        [[mb(total),'book files in the app'],[est&&est.usage?mb(est.usage):'—','used by this app'],[est&&est.quota?mb(est.quota):'—','available']].map(([v,l])=>
          h('div',{key:l,style:{flex:1,background:T.card,borderRadius:14,padding:'11px 12px'}},h('div',{style:{fontSize:16,fontWeight:750}},v),h('div',{style:{fontSize:11,color:T.sub,marginTop:2}},l)))),
      lab('New books'),
      seg([['copy','Keep a copy'],['text','Text only']],mode,setMode),
      h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,marginTop:8}},mode==='text'?'Only the text, your progress, bookmarks and highlights are kept — no duplicate of the file. Pictures and PDF pages need the original: re-link it from the book’s ⋯ menu when you want them.':'The whole file is copied into the app so books open offline with every picture and page.'),
      lab('Linked folder'),
      canLinkFolder()?(folder?h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',borderRadius:14,background:T.card}},
          h('span',{style:{display:'flex',color:T.sub}},Icons.folder(20)),h('div',{style:{flex:1,minWidth:0,fontSize:14.5,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},folder.name),
          h('button',{onClick:rescan,disabled:busy==='folder',className:'act95',style:{fontSize:13,fontWeight:650,color:T.accent,padding:'4px 6px'}},busy==='folder'?'Scanning…':'Rescan'),
          h('button',{onClick:async()=>{await dbDel('files','__folder');setFolder(null);toastFn&&toastFn('Folder unlinked — its books stay listed but need the folder to open')},className:'act95',style:{fontSize:13,fontWeight:650,color:T.danger,padding:'4px 6px'}},'Unlink'))
        :h('button',{onClick:link,className:'act95',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:'12px',borderRadius:14,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:650}},Icons.folder(18),'Link a folder of books'))
        :h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,padding:'11px 12px',borderRadius:14,background:T.card}},'Safari on iPhone doesn’t let web apps keep a link to a Files folder — every file you pick is handed over as a copy. Choose “Text only” above to avoid duplicates, and re-link the original when you need pages or pictures. On a Mac, PC or Android phone (Chrome), you can link a folder here and books are read straight from it.'),
      canLinkFolder()?h('div',{style:{fontSize:12,color:T.sub,lineHeight:1.5,marginTop:8}},'Books in the folder are read in place — nothing is copied except the text for quick opening. New files appear when you rescan.'):null,
      lab('Books'),
      list.map(b=>h('div',{key:b.id,style:{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'0.5px solid '+T.hair}},
        h('div',{style:{width:32,flexShrink:0}},h(Cover,{book:b,radius:3})),
        h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},b.title),
          h('div',{style:{fontSize:12,color:T.sub,marginTop:2}},FORMAT_LABEL[b.format]+' · '+(fileBytes(b)?mb(fileBytes(b)):'no file copy')+' · '+(b.stored==='linked'?'linked':b.stored==='text'?'text only':'full copy'))),
        busy===b.id?h(Spinner,{T,size:16}):
        b.stored==='text'?h('button',{onClick:()=>{relinkFor.current=b;relinkRef.current.click()},className:'act95',style:{fontSize:12.5,fontWeight:650,color:T.accent,padding:'6px 4px',flexShrink:0}},'Re-link file'):
        b.stored==='linked'?null:
        h('button',{onClick:()=>run(b,()=>makeTextOnly(b)),className:'act95',style:{fontSize:12.5,fontWeight:650,color:T.accent,padding:'6px 4px',flexShrink:0}},'Keep text only'))),
      !books.length?h('div',{style:{fontSize:13,color:T.sub,padding:'10px 0'}},'No books yet.'):null));
}
function StatsSheet({T,books,onClose}){
  const s=loadStats();const days=[];const d=new Date();d.setDate(d.getDate()-6);
  for(let i=0;i<7;i++){const k=dayKey(d);days.push({k,l:d.toLocaleDateString([],{weekday:'short'}).slice(0,2),sec:(s.days[k]||{}).sec||0,pages:(s.days[k]||{}).pages||0});d.setDate(d.getDate()+1)}
  const max=Math.max(600,...days.map(x=>x.sec));
  const total=Object.values(s.days).reduce((a,x)=>a+(x.sec||0),0);
  const week=days.reduce((a,x)=>a+x.sec,0);
  const yr=new Date().getFullYear();
  const fin=books.filter(b=>b.shelf==='finished'&&b.finishedAt&&new Date(b.finishedAt).getFullYear()===yr).length;
  const top=[...books].filter(b=>b.readSec>0).sort((a,b)=>b.readSec-a.readSec).slice(0,6);
  const tile=(v,l)=>h('div',{style:{flex:1,background:T.card,borderRadius:14,padding:'12px 12px'}},h('div',{style:{fontSize:19,fontWeight:760}},v),h('div',{style:{fontSize:11.5,color:T.sub,marginTop:2}},l));
  return h(Sheet,{T,onClose,title:'Reading stats',z:90,maxH:'86%'},
    h('div',{style:{padding:'6px 18px 18px'}},
      h('div',{style:{display:'flex',gap:10}},tile(readStreak(s)+' 🔥','day streak'),tile(fmtDur(week),'this week'),tile(String(fin),'finished in '+yr)),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'20px 0 10px'}},'Last 7 days'),
      h('div',{style:{display:'flex',alignItems:'flex-end',gap:8,height:120}},
        days.map(x=>h('div',{key:x.k,style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6,height:'100%',justifyContent:'flex-end'}},
          h('div',{style:{fontSize:10,color:T.sub}},x.sec>=60?Math.round(x.sec/60)+'m':''),
          h('div',{style:{width:'100%',maxWidth:28,height:Math.max(3,(x.sec/max)*84),borderRadius:6,background:x.k===dayKey()?T.fg:hexA(T.fg,.35)}}),
          h('div',{style:{fontSize:11,color:x.k===dayKey()?T.fg:T.sub,fontWeight:x.k===dayKey()?700:500}},x.l)))),
      h('div',{style:{fontSize:13,color:T.sub,marginTop:14}},'Pages this week: '+Math.round(days.reduce((a,x)=>a+x.pages,0))+' · All-time reading: '+fmtDur(total)),
      top.length?h(Fragment,null,
        h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'20px 0 6px'}},'Time per book'),
        top.map(b=>h('div',{key:b.id,style:{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom:'1px solid '+T.hair}},
          h('div',{style:{width:30,flexShrink:0}},h(Cover,{book:b,radius:3})),
          h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},b.title),
            h('div',{style:{fontSize:12,color:T.sub}},pct(b.progress)+' read')),
          h('div',{style:{fontSize:13,fontWeight:650}},fmtDur(b.readSec))))):null));
}

/* ============================== reader ============================== */
const PREFS_KEY='insta_book_prefs_v1';
const DEF_PREFS={size:19,font:'Literata',line:1.6,margin:22,align:'justify',theme:'app',mode:'paged',pdfZoom:1};
function loadPrefs(){try{return{...DEF_PREFS,...(JSON.parse(localStorage.getItem(PREFS_KEY))||{})}}catch(e){return{...DEF_PREFS}}}

/* image keys → object URLs for one open book */
function makeSession(book,model){
  const urls=new Map();let zipP=null;
  const getZip=()=>zipP||(zipP=getBookFile(book,false).then(b=>readZip(b)));
  return{
    img(key){
      if(urls.has(key))return urls.get(key);
      const p=(async()=>{let b=null;
        if(key.startsWith('z:'))b=await(await getZip()).blob(key.slice(2));
        else if(model&&model.images)b=model.images[key];
        return b?URL.createObjectURL(b):null})().catch(()=>null);
      urls.set(key,p);return p;
    },
    close(){urls.forEach(p=>p.then(u=>u&&URL.revokeObjectURL(u)));urls.clear()}
  };
}
/* fill a chapter element: html, images, highlights */
function fillChapter(el,html,session,hls,onImg){
  el.innerHTML=html;
  el.querySelectorAll('img[data-bksrc]').forEach(img=>{
    session.img(img.getAttribute('data-bksrc')).then(u=>{if(u){img.onload=onImg;img.src=u}else img.remove()});
  });
  applyHighlights(el,hls||[]);
}
/* wrap text-offset ranges of `root` in elements made by r.make() — used for highlights and search hits */
function wrapRanges(root,ranges){
  if(!root||!ranges.length)return;
  const nodes=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let pos=0;
  while(w.nextNode()){const n=w.currentNode;nodes.push([n,pos,pos+n.data.length]);pos+=n.data.length}
  const byNode=new Map();
  for(const r of ranges)for(const [n,s,e] of nodes){if(e<=r.start||s>=r.end)continue;
    const seg={from:Math.max(r.start,s)-s,to:Math.min(r.end,e)-s,r};if(!byNode.has(n))byNode.set(n,[]);byNode.get(n).push(seg)}
  byNode.forEach((list,n)=>{list.sort((a,b)=>b.from-a.from);
    for(const sg of list){if(sg.to<=sg.from||sg.to>n.data.length)continue;
      if(sg.to<n.data.length)n.splitText(sg.to);const mid=sg.from>0?n.splitText(sg.from):n;
      const m=sg.r.make();mid.parentNode.insertBefore(m,mid);m.appendChild(mid)}});
}
function unwrapMarks(root,sel){
  if(!root)return;const ms=root.querySelectorAll(sel);if(!ms.length)return;
  ms.forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});root.normalize();
}
function applyHighlights(root,hls){
  wrapRanges(root,(hls||[]).map(hl=>({start:hl.start,end:hl.end,make:()=>{const m=document.createElement('mark');m.className='bkhl';m.setAttribute('data-hid',hl.id);m.style.background=hlBg(hl.color);return m}})));
}
function paintSearch(root,list,cur){
  unwrapMarks(root,'mark.bksr');
  if(list&&list.length)wrapRanges(root,list.map(m=>({start:m.start,end:m.end,make:()=>{const k=document.createElement('mark');k.className='bksr'+(m===cur?' cur':'');return k}})));
}
/* the on-screen box of the character at a text offset */
function rectAtOffset(root,off){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let pos=0;
  while(w.nextNode()){const n=w.currentNode;const L=n.data.length;
    if(off<pos+L){const r=document.createRange();const o=Math.max(0,off-pos);r.setStart(n,o);r.setEnd(n,Math.min(L,o+1));const rs=r.getClientRects();return rs[0]||r.getBoundingClientRect()}
    pos+=L}
  return null;
}
/* plain text of every chapter (same text the rendered page has, so offsets line up) */
const textCache=new WeakMap();
function chapterTexts(model){
  let t=textCache.get(model);
  if(!t){t=model.chapters.map(c=>htmlDoc('<body>'+c.html).body.textContent||'');textCache.set(model,t)}
  return t;
}
/* PDF text, per page, with the position of every text run (for search + highlight boxes) */
const pdfTexts=new WeakMap();
const docOcr=new WeakMap(); /* doc → {pageIndex: OCR text} for scanned PDFs */
function pdfPageText(doc,i){
  let m=pdfTexts.get(doc);if(!m){m=new Map();pdfTexts.set(doc,m)}
  if(m.has(i))return m.get(i);
  const p=(async()=>{const pg=await doc.getPage(i+1);const tc=await pg.getTextContent();const vp=pg.getViewport({scale:1});
    let text='',nl='';const items=[];
    for(const it of tc.items){if(typeof it.str!=='string')continue;items.push({it,start:text.length});text+=it.str;nl+=it.str;if(it.hasEOL){text+=' ';nl+='\n'}}
    const ocr=docOcr.get(doc);
    if(text.replace(/\s+/g,'').length<10&&ocr&&ocr[i])return{text:ocr[i],nl:ocr[i],items:[],vp,ocr:true}; /* scanned page: use its OCR text */
    return{text,nl,items,vp}})().catch(()=>({text:'',nl:'',items:[],vp:null}));
  m.set(i,p);return p;
}
let _mctx=null;
function measureW(t){if(!t)return 0;try{if(!_mctx){_mctx=document.createElement('canvas').getContext('2d');_mctx.font='100px Helvetica, Arial, sans-serif'}return _mctx.measureText(t).width}catch(e){return t.length}}
function pdfMarkRects(pt,marks){
  const out=[];if(!pt||!pt.vp||!window.pdfjsLib)return out;const vp=pt.vp;
  for(const mk of marks)for(const {it,start} of pt.items){const len=it.str.length;if(!len||start+len<=mk.start||start>=mk.end)continue;
    const s=Math.max(mk.start,start)-start,e=Math.min(mk.end,start+len)-start;
    const tx=window.pdfjsLib.Util.transform(vp.transform,it.transform);const fh=Math.hypot(tx[2],tx[3])||10;const w=(it.width||0)*(vp.scale||1);
    const full=measureW(it.str)||len;const a=measureW(it.str.slice(0,s))/full,b=measureW(it.str.slice(0,e))/full; /* proportional to real glyph widths */
    out.push({cur:mk.cur,left:(tx[4]+w*a)/vp.width*100,top:(tx[5]-fh*.92)/vp.height*100,width:Math.max(.4,w*(b-a)/vp.width*100),height:fh*1.18/vp.height*100})}
  return out;
}

/* ---------- pinch / pan / double-tap / swipe surface (PDF pages, images) ---------- */
function ZoomPan({children,resetKey,onSwipe,onTap,onZoomOut,onZoom,canPrev,canNext,className,maxZ}){
  const box=useRef(null);
  const [st,setSt]=useState({z:1,x:0,y:0,anim:false});const S=useRef(st);S.current=st;
  const [drag,setDrag]=useState(0);const dragR=useRef(0);dragR.current=drag;
  const g=useRef(null),tapT=useRef(null),lastTap=useRef({t:0,x:0,y:0}),lastTouch=useRef(0);
  const MZ=maxZ||6;
  useEffect(()=>{setSt({z:1,x:0,y:0,anim:false});setDrag(0)},[resetKey]);
  useEffect(()=>()=>clearTimeout(tapT.current),[]);
  const size=()=>{const el=box.current;return el?{W:el.clientWidth,H:el.clientHeight}:{W:1,H:1}};
  const fitXY=(z,x,y)=>{const {W,H}=size();if(z<=1)return{x:(W-W*z)/2,y:(H-H*z)/2};return{x:Math.min(0,Math.max(W-W*z,x)),y:Math.min(0,Math.max(H-H*z,y))}};
  const set=(z,x,y,anim)=>{const c=fitXY(z,x,y);setSt({z,x:c.x,y:c.y,anim:!!anim})};
  const zoomAt=(nz,px,py,anim)=>{const s=S.current;const cx=(px-s.x)/s.z,cy=(py-s.y)/s.z;set(nz,px-cx*nz,py-cy*nz,anim)};
  const local=t=>{const r=box.current.getBoundingClientRect();return{x:t.clientX-r.left,y:t.clientY-r.top}};
  const tapAt=(x,y)=>{
    const now=Date.now(),L=lastTap.current;
    if(now-L.t<300&&Math.hypot(x-L.x,y-L.y)<40){clearTimeout(tapT.current);lastTap.current={t:0,x:0,y:0};
      if(S.current.z>1.05){set(1,0,0,true);onZoom&&onZoom(1)}else{zoomAt(2.5,x,y,true);onZoom&&onZoom(2.5)}return}
    lastTap.current={t:now,x,y};const z=S.current.z;clearTimeout(tapT.current);
    tapT.current=setTimeout(()=>onTap&&onTap(x,size().W,z),250);
  };
  const onTS=e=>{lastTouch.current=Date.now();const ts=e.touches;
    if(ts.length>=2){clearTimeout(tapT.current);const a=local(ts[0]),b=local(ts[1]);const s=S.current;setDrag(0);
      g.current={mode:'pinch',d0:Math.hypot(a.x-b.x,a.y-b.y)||1,z0:s.z,cx:((a.x+b.x)/2-s.x)/s.z,cy:((a.y+b.y)/2-s.y)/s.z};return}
    const p=local(ts[0]);g.current={mode:S.current.z>1.02?'pan':'swipe',x0:p.x,y0:p.y,sx:S.current.x,sy:S.current.y,t:Date.now(),moved:false,on:false}};
  const onTM=e=>{const s=g.current;if(!s)return;const ts=e.touches;
    if(s.mode==='pinch'){if(ts.length<2)return;const a=local(ts[0]),b=local(ts[1]);
      const nz=Math.max(.5,Math.min(MZ,s.z0*Math.hypot(a.x-b.x,a.y-b.y)/s.d0));const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      const c=fitXY(nz,mx-s.cx*nz,my-s.cy*nz);setSt({z:nz,x:c.x,y:c.y,anim:false});return}
    const p=local(ts[0]);const dx=p.x-s.x0,dy=p.y-s.y0;if(Math.abs(dx)>6||Math.abs(dy)>6)s.moved=true;
    if(s.mode==='pan'){set(S.current.z,s.sx+dx,s.sy+dy,false);return}
    if(!s.on){if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2)s.on=true;else return}
    setDrag((dx>0&&!canPrev)||(dx<0&&!canNext)?dx*.25:dx)};
  const onTE=e=>{const s=g.current;if(!s)return;lastTouch.current=Date.now();
    if(s.mode==='pinch'){
      if(e.touches.length===1){const p=local(e.touches[0]);g.current={mode:'pan',x0:p.x,y0:p.y,sx:S.current.x,sy:S.current.y,t:Date.now(),moved:true}}
      else if(e.touches.length===0)g.current=null;
      if(e.touches.length<2){const z=S.current.z;if(z<.82){set(1,0,0,true);onZoomOut&&onZoomOut()}else if(z<1.02)set(1,0,0,true);else onZoom&&onZoom(z)}
      return}
    if(e.touches.length)return;
    g.current=null;
    if(s.mode==='swipe'&&s.on){const W=size().W;const dx=dragR.current;setDrag(0);const dt=Date.now()-s.t;
      if(dx<-W*.18||(dx<-35&&dt<260))onSwipe&&onSwipe(1);else if(dx>W*.18||(dx>35&&dt<260))onSwipe&&onSwipe(-1);return}
    if(s.moved||Date.now()-s.t>350)return;
    tapAt(s.x0,s.y0)};
  const onClick=e=>{if(Date.now()-lastTouch.current<800)return;const p=local(e);tapAt(p.x,p.y)};
  const onWheel=e=>{if(!e.ctrlKey)return;const p=local(e);const nz=Math.max(1,Math.min(MZ,S.current.z*Math.exp(-e.deltaY/120)));zoomAt(nz,p.x,p.y,false);onZoom&&onZoom(nz)};
  return h('div',{ref:box,onTouchStart:onTS,onTouchMove:onTM,onTouchEnd:onTE,onTouchCancel:onTE,onClick,onWheel,className,
      style:{position:'absolute',inset:0,overflow:'hidden',touchAction:'none'}},
    h('div',{style:{position:'absolute',inset:0,transform:'translate3d('+drag+'px,0,0)',transition:drag?'none':'transform 300ms cubic-bezier(.2,.85,.25,1)'}},
      h('div',{style:{width:'100%',height:'100%',transformOrigin:'0 0',transform:'translate3d('+st.x+'px,'+st.y+'px,0) scale('+st.z+')',
        transition:st.anim?'transform 280ms cubic-bezier(.2,.85,.25,1)':'none',willChange:'transform'}},children)));
}
function ImageViewer({src,onClose}){
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:70,background:'#000'}},
    h(ZoomPan,{resetKey:src,onTap:(x,W,z)=>{if(z<=1.02)onClose()},onZoomOut:onClose,maxZ:8},
      h('img',{src,alt:'',style:{width:'100%',height:'100%',objectFit:'contain',display:'block',userSelect:'none',WebkitUserSelect:'none'}})),
    h('button',{onClick:onClose,'aria-label':'Close image',className:'act90',style:{position:'absolute',left:12,top:'calc(10px + env(safe-area-inset-top))',width:38,height:38,borderRadius:19,
      background:'rgba(255,255,255,.16)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}},Icons.x(19)),
    h('div',{style:{position:'absolute',left:0,right:0,bottom:'calc(16px + env(safe-area-inset-bottom))',textAlign:'center',color:'rgba(255,255,255,.55)',fontSize:12,fontFamily:UIF,pointerEvents:'none'}},'Pinch or double-tap to zoom'));
}

function rangeOffsets(root,range){
  const pre=document.createRange();pre.selectNodeContents(root);pre.setEnd(range.startContainer,range.startOffset);
  const start=pre.toString().length;return{start,end:start+range.toString().length};
}
function snippetAt(x,y){
  try{let node=null,off=0;
    if(document.caretRangeFromPoint){const r=document.caretRangeFromPoint(x,y);if(r){node=r.startContainer;off=r.startOffset}}
    else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){node=p.offsetNode;off=p.offset}}
    if(!node)return'';
    let txt=node.nodeType===3?node.data.slice(off):'';
    let n=node;while(txt.length<90&&n){n=nextText(n);if(n)txt+=' '+n.data}
    return txt.replace(/\s+/g,' ').trim().slice(0,90);
  }catch(e){return''}
}
function nextText(n){while(n){if(n.firstChild&&n.nodeType===1){n=n.firstChild}else{while(n&&!n.nextSibling)n=n.parentNode;if(!n)return null;n=n.nextSibling}if(n&&n.nodeType===3&&n.data.trim())return n}return null}

/* ---------- reflowable engine: paged (CSS columns) or continuous scroll ---------- */
function ReflowView({T,prefs,model,session,start,hls,apiRef,onPos,onTap,onHlTap,onLink,chromeH,search,onImage,onPinchSize}){
  const n=model.chapters.length;
  const wrapRef=useRef(null),innerRef=useRef(null),scrollRef=useRef(null);
  const [ch,setCh]=useState(Math.min(n-1,Math.max(0,start.ch|0)));
  const [page,setPage]=useState(0);const [pages,setPages]=useState(1);
  const [dims,setDims]=useState(null);
  const [drag,setDrag]=useState(0);const [anim,setAnim]=useState('');
  const pend=useRef({frac:start.frac||0,id:start.id||null});
  const fracRef=useRef(start.frac||0);
  const paged=prefs.mode!=='scroll';
  const G=40;
  /* measure the page box */
  useLayoutEffect(()=>{
    const el=wrapRef.current;if(!el)return;
    const m=()=>{const r=el.getBoundingClientRect();setDims(d=>d&&Math.abs(d.W-r.width)<1&&Math.abs(d.H-r.height)<1?d:{W:Math.floor(r.width),H:Math.floor(r.height)})};
    m();const ro=window.ResizeObserver?new ResizeObserver(m):null;if(ro)ro.observe(el);window.addEventListener('resize',m);
    return()=>{if(ro)ro.disconnect();window.removeEventListener('resize',m)};
  },[paged]);
  const hlsFor=c=>(hls||NOHL).filter(x=>x.ch===c);
  const hlKey=c=>(hls||NOHL).filter(x=>x.ch===c).map(x=>x.id+x.color).join(',');
  /* -------- paged -------- */
  const measure=useCallback(()=>{
    const inner=innerRef.current;if(!inner||!dims)return;
    const end=inner.querySelector('.bkend');if(!end)return;
    /* rects are measured relative to the column box and un-scaled (a chapter may be mid-animation) */
    const ir=inner.getBoundingClientRect(),er=end.getBoundingClientRect();const k=ir.width/Math.max(1,inner.offsetWidth)||1;
    const np=Math.max(1,Math.floor(((er.left-ir.left)/k+1)/(dims.W+G))+1);
    setPages(np);
    const p=pend.current;
    if(p&&p.match){const r=rectAtOffset(inner.querySelector('.bkbody'),p.match.start);
      const pg=r?Math.max(0,Math.min(np-1,Math.floor(((r.left-ir.left)/k+2)/(dims.W+G)))):0;setPage(pg);fracRef.current=pg/np;pend.current=null}
    else if(p&&p.id){const t=inner.querySelector('#'+CSS.escape(p.id));if(t){const tr=t.getBoundingClientRect();const pg=Math.max(0,Math.min(np-1,Math.floor(((tr.left-ir.left)/k+2)/(dims.W+G))));setPage(pg);fracRef.current=pg/np}pend.current=null}
    else if(p&&p.frac==='end'){setPage(np-1);fracRef.current=(np-1)/np;pend.current=null}
    else if(p&&typeof p.frac==='number'){const pg=Math.max(0,Math.min(np-1,Math.round(p.frac*np)));setPage(pg);fracRef.current=pg/np;pend.current=null}
    else setPage(pg=>Math.min(pg,np-1));
  },[dims]);
  const remeasure=useRef(null);
  const onImg=useCallback(()=>{clearTimeout(remeasure.current);remeasure.current=setTimeout(()=>{if(!pend.current)pend.current={frac:fracRef.current};measure()},120)},[measure]);
  useLayoutEffect(()=>{
    if(!paged||!dims)return;const inner=innerRef.current;if(!inner)return;
    const body=inner.querySelector('.bkbody');fillChapter(body,model.chapters[ch].html,session,hlsFor(ch),onImg);
    measure();
  },[paged,dims,ch,model]);
  useLayoutEffect(()=>{ /* typography change → keep the same spot */
    if(!paged||!dims)return;pend.current={frac:fracRef.current};measure();
  },[prefs.size,prefs.font,prefs.line,prefs.margin,prefs.align]);
  useEffect(()=>{ /* highlights changed → repaint this chapter, keep page */
    if(!paged||!dims)return;const inner=innerRef.current;if(!inner)return;
    const body=inner.querySelector('.bkbody');
    body.querySelectorAll('mark.bkhl').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);p.normalize()});
    applyHighlights(body,hlsFor(ch));
  },[hls]);
  useEffect(()=>{if(paged){fracRef.current=page/Math.max(1,pages);onPos({ch,frac:page/Math.max(1,pages),page,pages})}},[paged,ch,page,pages]);
  const goCh=(c,frac,id,dir,match)=>{c=Math.max(0,Math.min(n-1,c));pend.current={frac,id,match};if(c===ch){measure();return}
    setAnim(dir>0?'bkinR':dir<0?'bkinL':'bkfade');setCh(c)};
  const next=()=>{if(page<pages-1)setPage(page+1);else if(ch<n-1)goCh(ch+1,0,null,1);else onPos({ch,frac:1,page,pages,end:true})};
  const prev=()=>{if(page>0)setPage(page-1);else if(ch>0)goCh(ch-1,'end',null,-1)};
  /* -------- scroll -------- */
  const [range,setRange]=useState([ch,ch]);
  const prevH=useRef(null);
  const scrollTo=(c,frac,id,match)=>{
    setRange([c,c]);pend.current={frac,id,c,match};
  };
  useLayoutEffect(()=>{ /* after (re)render in scroll mode: position or compensate a prepend */
    if(paged)return;const sc=scrollRef.current;if(!sc)return;
    if(prevH.current!=null){sc.scrollTop+=sc.scrollHeight-prevH.current;prevH.current=null;return}
    const p=pend.current;if(!p)return;
    const sec=sc.querySelector('[data-ch="'+(p.c!=null?p.c:ch)+'"]');if(!sec)return;
    let y=sec.offsetTop;
    if(p.match){const r=rectAtOffset(sec.querySelector('.bkbody'),p.match.start);if(r)y=r.top-sc.getBoundingClientRect().top+sc.scrollTop-sc.clientHeight*.3}
    else if(p.id){const t=sec.querySelector('#'+CSS.escape(p.id));if(t)y=t.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop-12}
    else if(typeof p.frac==='number')y+=p.frac*sec.offsetHeight;
    sc.scrollTop=y;pend.current=null;
  });
  const onScroll=()=>{
    const sc=scrollRef.current;if(!sc)return;
    const top=sc.scrollTop+chromeH;let cur=range[0],sec=null;
    for(const s of sc.querySelectorAll('[data-ch]')){if(s.offsetTop<=top+2){cur=+s.getAttribute('data-ch');sec=s}}
    if(sec){const frac=Math.max(0,Math.min(1,(top-sec.offsetTop)/Math.max(1,sec.offsetHeight)));fracRef.current=frac;
      if(cur!==ch)setCh(cur);
      const vpPages=Math.max(1,Math.round(sec.offsetHeight/sc.clientHeight));
      onPos({ch:cur,frac,page:Math.min(vpPages-1,Math.floor(frac*vpPages)),pages:vpPages,end:cur===n-1&&sc.scrollTop+sc.clientHeight>=sc.scrollHeight-4})}
    if(sc.scrollHeight-sc.scrollTop-sc.clientHeight<sc.clientHeight*2&&range[1]<n-1)setRange(r=>[r[0],r[1]+1]);
    else if(sc.scrollTop<sc.clientHeight*.6&&range[0]>0){prevH.current=sc.scrollHeight;setRange(r=>[r[0]-1,r[1]])}
  };
  useEffect(()=>{if(!paged){pend.current={frac:fracRef.current,c:ch};setRange([ch,ch])}},[paged]);
  useLayoutEffect(()=>{if(!paged){pend.current={frac:fracRef.current,c:ch};setRange(r=>[...r])}},[prefs.size,prefs.font,prefs.line,prefs.margin]);
  const sKey=search?search.matches.length+':'+search.cur+':'+search.q:'';
  useEffect(()=>{ /* paint search hits in whatever chapters are on screen */
    const root=paged?innerRef.current:scrollRef.current;if(!root)return;
    root.querySelectorAll('.bkbody').forEach(body=>{const sec=body.closest('[data-ch]');const c=sec?+sec.getAttribute('data-ch'):ch;
      const list=search?search.matches.filter(m=>m.ch===c):null;const cur=search?search.matches[search.cur]:null;paintSearch(body,list,cur)});
  },[sKey,ch,range[0],range[1],paged,hls,dims]);
  /* -------- api for the shell -------- */
  apiRef.current={
    next,prev,
    goTo:(c,frac,id)=>{if(paged)goCh(c,frac||0,id||null,0);else scrollTo(c,frac||0,id||null)},
    goToMatch:m=>{if(paged)goCh(m.ch,null,null,0,m);else scrollTo(m.ch,0,null,m)},
    snippet:()=>{const el=wrapRef.current||scrollRef.current;if(!el)return'';const r=el.getBoundingClientRect();return snippetAt(r.left+prefs.margin*0+6,r.top+(paged?8:chromeH+8))}
  };
  /* -------- gestures (paged) -------- */
  const g=useRef(null);const swiped=useRef(false);const pinch=useRef(null);const [hud,setHud]=useState(null);
  const hasSel=()=>{const s=window.getSelection&&window.getSelection();return s&&!s.isCollapsed&&String(s).trim()};
  const pinchStart=e=>{if(e.touches.length!==2)return false;const a=e.touches[0],b=e.touches[1];pinch.current={d0:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)||1,s0:prefs.size};g.current=null;setDrag(0);return true};
  const pinchMove=e=>{const p=pinch.current;if(!p||e.touches.length<2)return false;const a=e.touches[0],b=e.touches[1];
    const ns=Math.max(13,Math.min(34,Math.round(p.s0*Math.pow(Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/p.d0,.85))));
    setHud(ns);if(ns!==prefs.size&&onPinchSize)onPinchSize(ns);return true};
  const pinchEnd=e=>{if(!pinch.current)return false;if(e.touches.length<2){pinch.current=null;swiped.current=true;setTimeout(()=>{swiped.current=false;setHud(null)},450)}return true};
  const onTS=e=>{if(pinchStart(e))return;if(!paged||e.touches.length>1||hasSel()){g.current=null;return}const t=e.touches[0];g.current={x:t.clientX,y:t.clientY,t:Date.now(),on:false}};
  const onTM=e=>{if(pinchMove(e))return;const s=g.current;if(!s)return;const t=e.touches[0];const dx=t.clientX-s.x,dy=t.clientY-s.y;
    if(!s.on){if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2)s.on=true;else if(Math.abs(dy)>12){g.current=null;return}else return}
    const edge=(dx>0&&page===0&&ch===0)||(dx<0&&page===pages-1&&ch===n-1);setDrag(edge?dx*.25:dx)};
  const onTE=e=>{if(pinchEnd(e))return;const s=g.current;g.current=null;if(!s||!s.on)return;swiped.current=true;setTimeout(()=>{swiped.current=false},350);
    const t=e.changedTouches[0];const dx=t.clientX-s.x,dt=Date.now()-s.t;const W=dims?dims.W:300;
    setDrag(0);if(dx<-W*.18||(dx<-35&&dt<260))next();else if(dx>W*.18||(dx>35&&dt<260))prev()};
  const onClick=e=>{
    const a=e.target.closest&&e.target.closest('[data-bkhref]');if(a){e.preventDefault();onLink(a.getAttribute('data-bkhref'));return}
    const mk=e.target.closest&&e.target.closest('mark.bkhl');if(mk&&!hasSel()){onHlTap(mk.getAttribute('data-hid'));return}
    if(e.target.closest&&e.target.closest('a[href]'))return;
    if(swiped.current||hasSel())return;
    const W=window.innerWidth,x=e.clientX;
    if(e.target.tagName==='IMG'&&e.target.src&&(!paged||(x>W*.22&&x<W*.78))&&onImage){onImage(e.target.src);return}
    if(paged&&x<W*.28)prev();else if(paged&&x>W*.72)next();else onTap();
  };
  useEffect(()=>{const k=e=>{if(e.target&&/input|textarea/i.test(e.target.tagName))return;
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();apiRef.current.next()}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();apiRef.current.prev()}};
    window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[]);
  const fontCss=(FONTS.find(f=>f.id===prefs.font)||FONTS[0]).css;
  const typo={fontFamily:fontCss,fontSize:prefs.size,lineHeight:prefs.line,textAlign:prefs.align,color:T.fg,hyphens:prefs.align==='justify'?'auto':'manual',WebkitHyphens:prefs.align==='justify'?'auto':'manual'};
  if(!paged){
    const secs=[];for(let c=range[0];c<=range[1];c++)secs.push(c);
    return h('div',{ref:scrollRef,onScroll,onClick,className:'bkrd',onTouchStart:pinchStart,onTouchMove:pinchMove,onTouchEnd:pinchEnd,onTouchCancel:pinchEnd,
        style:Object.assign({position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',touchAction:'pan-y',padding:'calc('+chromeH+'px + env(safe-area-inset-top)) '+prefs.margin+'px calc(90px + env(safe-area-inset-bottom))'},typo)},
      range[0]>0?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13,padding:'8px 0 18px',fontFamily:UIF}},'…'):null,
      secs.map(c=>h(ScrollChapter,{key:c,c,html:model.chapters[c].html,session,hls:hlsFor(c),hk:hlKey(c),T})),
      range[1]>=n-1?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13,padding:'34px 0 10px',fontFamily:UIF}},'— The End —'):null,
      hud?h(SizeHud,{T,size:hud}):null);
  }
  return h('div',{onTouchStart:onTS,onTouchMove:onTM,onTouchEnd:onTE,onClick,className:'bkrd',
      style:{position:'absolute',inset:0,overflow:'hidden',touchAction:'pan-y'}},
    h('div',{ref:wrapRef,style:{position:'absolute',left:prefs.margin,right:prefs.margin,top:'calc(44px + env(safe-area-inset-top))',bottom:'calc(40px + env(safe-area-inset-bottom))',overflow:'hidden'}},
      dims?h('div',{key:'s'+ch,className:anim,onAnimationEnd:()=>setAnim(''),style:{height:'100%'}},
        h('div',{ref:innerRef,style:Object.assign({height:dims.H,width:dims.W,columnWidth:dims.W+'px',columnGap:G+'px',columnFill:'auto',
            transform:'translate3d('+(-page*(dims.W+G)+drag)+'px,0,0)',transition:drag?'none':'transform 320ms cubic-bezier(.2,.85,.25,1)',willChange:'transform'},typo)},
          h('div',{className:'bkbody'}),h('span',{className:'bkend'}))):null),
    hud?h(SizeHud,{T,size:hud}):null);
}
function SizeHud({T,size}){
  return h('div',{className:'fdin',style:{position:'fixed',left:'50%',top:'42%',transform:'translate(-50%,-50%)',zIndex:9,padding:'10px 18px',borderRadius:16,
    background:'rgba(30,30,34,.82)',color:'#fff',fontFamily:UIF,fontSize:15,fontWeight:650,backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',pointerEvents:'none'}},
    h('span',{style:{fontSize:Math.min(26,size*.8),fontFamily:'Georgia,serif',marginRight:8}},'Aa'),size+' pt');
}
function ScrollChapter({c,html,session,hls,hk,T}){
  const ref=useRef(null);
  useLayoutEffect(()=>{fillChapter(ref.current,html,session,hls,null)},[html,hk]);
  return h('section',{'data-ch':c,style:{paddingBottom:28,borderBottom:'1px solid '+T.hair,marginBottom:28}},h('div',{ref,className:'bkbody'}));
}

/* ---------- PDF engine ----------
   Paged: one page fitted to the screen — pinch / double-tap to zoom, drag to pan, swipe or tap the
   edges to turn; pinching out past "fit" opens the page overview (like Preview).
   Scroll: a continuous column of pages — pinch to zoom the whole column (1×–4×). */
function PdfView({T,prefs,setPrefs,doc,start,apiRef,onPos,onTap,chromeH,search}){
  const n=doc.numPages;
  const [page,setPage]=useState(Math.min(n-1,Math.max(0,start.ch|0)));
  const [ratio,setRatio]=useState(1.414);
  const [dims,setDims]=useState(null);
  const [slide,setSlide]=useState(0);
  const [hiZ,setHiZ]=useState(1);
  const [overview,setOverview]=useState(false);
  const [zoom,setZoom]=useState(Math.max(1,prefs.pdfZoom||1));
  const [pz,setPz]=useState(null); /* live pinch in scroll mode: {s,ox,oy} */
  const wrapRef=useRef(null),scrollRef=useRef(null),pinch=useRef(null),pendScroll=useRef(null);
  const paged=prefs.mode!=='scroll';
  const marksBy=useMemo(()=>{const m={};if(search&&search.matches)search.matches.forEach((x,i)=>{(m[x.ch]=m[x.ch]||[]).push({start:x.start,end:x.end,cur:i===search.cur})});return m},[search]);
  useEffect(()=>{doc.getPage(1).then(p=>{const v=p.getViewport({scale:1});setRatio(v.height/v.width)}).catch(()=>{})},[doc]);
  useLayoutEffect(()=>{const el=wrapRef.current||scrollRef.current;if(!el)return;
    const m=()=>{const r=el.getBoundingClientRect();setDims({W:Math.floor(r.width),H:Math.floor(r.height)})};m();
    const ro=window.ResizeObserver?new ResizeObserver(m):null;if(ro)ro.observe(el);return()=>{if(ro)ro.disconnect()}},[paged]);
  useEffect(()=>{setHiZ(1)},[page]);
  useEffect(()=>{if(paged)onPos({ch:page,frac:0,page,pages:n,end:page===n-1})},[page,paged]);
  const go=p=>{p=Math.max(0,Math.min(n-1,p));if(p===page)return;setSlide(p>page?1:-1);setPage(p)};
  const next=()=>{if(page<n-1)go(page+1);else onPos({ch:page,frac:1,page,pages:n,end:true})};
  const scrollToPage=(p,frac)=>{const sc=scrollRef.current;if(!sc)return;const el=sc.querySelector('[data-pg="'+p+'"]');if(el)sc.scrollTop=el.offsetTop-chromeH-8+(frac||0)*el.offsetHeight};
  apiRef.current={next:()=>paged?next():null,prev:()=>paged?go(page-1):null,
    goTo:(c,frac)=>{if(paged)go(c);else{setPage(c);scrollToPage(c,frac)}},snippet:()=>'',
    overview:()=>setOverview(true),
    goToMatch:async m=>{if(paged){go(m.ch);return}const pt=await pdfPageText(doc,m.ch);const r=pdfMarkRects(pt,[{start:m.start,end:m.end}])[0];scrollToPage(m.ch,r?Math.max(0,r.top/100-.15):0)}};
  useEffect(()=>{if(!paged&&dims)requestAnimationFrame(()=>scrollToPage(page,start.ch===page?start.frac:0))},[paged,!!dims]);
  /* scroll mode: keep the pinch point steady when the zoom is committed */
  useLayoutEffect(()=>{const p=pendScroll.current;const sc=scrollRef.current;if(!p||!sc)return;pendScroll.current=null;sc.scrollLeft=p.x;sc.scrollTop=p.y},[zoom]);
  const onTap2=(x,W,z)=>{if(z>1.02){onTap();return}if(x<W*.28)go(page-1);else if(x>W*.72)next();else onTap()};
  const overviewEl=overview?h(PdfOverview,{T,doc,n,ratio,cur:page,W:dims?dims.W:window.innerWidth,onPick:i=>{setOverview(false);if(paged)go(i);else{setPage(i);requestAnimationFrame(()=>scrollToPage(i,0))}},onClose:()=>setOverview(false)}):null;
  if(!paged){
    const W=dims?dims.W:window.innerWidth;const pw=Math.round((W-16)*zoom);
    const onTS=e=>{if(e.touches.length===2){const sc=scrollRef.current,r=sc.getBoundingClientRect();const a=e.touches[0],b=e.touches[1];
      pinch.current={d0:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)||1,mx:(a.clientX+b.clientX)/2-r.left,my:(a.clientY+b.clientY)/2-r.top,sl:sc.scrollLeft,st:sc.scrollTop,s:1}}};
    const onTM=e=>{const p=pinch.current;if(!p||e.touches.length<2)return;const a=e.touches[0],b=e.touches[1];
      p.s=Math.max(.5,Math.min(4/zoom,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/p.d0));setPz({s:p.s,ox:p.sl+p.mx,oy:p.st+p.my})};
    const onTE=e=>{const p=pinch.current;if(!p||e.touches.length>=2)return;pinch.current=null;setPz(null);
      if(zoom<=1.01&&p.s<.8){setOverview(true);return}
      const nz=Math.max(1,Math.min(4,zoom*p.s));if(Math.abs(nz-zoom)<.02)return;const r=nz/zoom;
      pendScroll.current={x:Math.max(0,(p.sl+p.mx)*r-p.mx),y:Math.max(0,(p.st+p.my)*r-p.my)};setZoom(nz);setPrefs({pdfZoom:Math.round(nz*100)/100})};
    const onScroll=()=>{const sc=scrollRef.current;if(!sc)return;const top=sc.scrollTop+chromeH+10;let cur=0,el=null;
      for(const pg of sc.querySelectorAll('[data-pg]')){if(pg.offsetTop<=top){cur=+pg.getAttribute('data-pg');el=pg}else break}
      const frac=el?Math.max(0,Math.min(1,(top-el.offsetTop)/el.offsetHeight)):0;if(cur!==page)setPage(cur);
      onPos({ch:cur,frac,page:cur,pages:n,end:sc.scrollTop+sc.clientHeight>=sc.scrollHeight-4})};
    return h(Fragment,null,
      h('div',{ref:scrollRef,onScroll,onTouchStart:onTS,onTouchMove:onTM,onTouchEnd:onTE,onTouchCancel:onTE,onClick:()=>onTap(),
          style:{position:'absolute',inset:0,overflow:'auto',WebkitOverflowScrolling:'touch',touchAction:'pan-x pan-y',background:T.card}},
        h('div',{style:{padding:'calc('+chromeH+'px + env(safe-area-inset-top)) 8px calc(90px + env(safe-area-inset-bottom))',width:pw+16,boxSizing:'border-box',minWidth:'100%',
            transformOrigin:pz?(pz.ox+'px '+pz.oy+'px'):'0 0',transform:pz?'scale('+pz.s+')':'none'}},
          Array.from({length:n},(_,i)=>h(PdfPage,{key:i,doc,i,width:pw,ratio,lazy:true,T,marks:marksBy[i]})))),
      overviewEl);
  }
  const W=dims?dims.W:0,H=dims?dims.H:0;
  const fit=W&&H?(H/W>ratio?{w:W,h:Math.round(W*ratio)}:{w:Math.round(H/ratio),h:H}):null;
  return h('div',{style:{position:'absolute',inset:0,overflow:'hidden',background:T.card}},
    h('div',{ref:wrapRef,style:{position:'absolute',left:8,right:8,top:'calc(46px + env(safe-area-inset-top))',bottom:'calc(42px + env(safe-area-inset-bottom))'}},
      fit?h('div',{key:page,className:slide>0?'bkinR':slide<0?'bkinL':'',style:{position:'absolute',inset:0}},
        h(ZoomPan,{resetKey:page,onSwipe:d=>d>0?next():go(page-1),onTap:onTap2,onZoomOut:()=>setOverview(true),onZoom:z=>setHiZ(z>1.4?Math.min(3,z):1),canPrev:page>0,canNext:true},
          h('div',{style:{width:W,height:H,display:'flex',alignItems:'center',justifyContent:'center'}},
            h(PdfPage,{doc,i:page,width:fit.w,ratio,T,scale:hiZ,marks:marksBy[page]})))):null),
    overviewEl);
}
function PdfOverview({T,doc,n,ratio,cur,W,onPick,onClose}){
  const ref=useRef(null);const tw=Math.floor((Math.min(W,700)-16*2-12*2)/3);
  useEffect(()=>{const el=ref.current&&ref.current.querySelector('[data-cur="1"]');if(el)el.scrollIntoView({block:'center'})},[]);
  return h('div',{ref,className:'fdin',style:{position:'absolute',inset:0,zIndex:4,background:T.bg,overflowY:'auto',WebkitOverflowScrolling:'touch',fontFamily:UIF}},
    h('div',{style:{position:'sticky',top:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'calc(10px + env(safe-area-inset-top)) 16px 10px',background:hexA(T.bg,.92),backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)'}},
      h('div',{style:{fontSize:16,fontWeight:700}},n+' pages'),
      h('button',{onClick:onClose,className:'act95',style:{padding:'7px 14px',borderRadius:999,background:T.card,color:T.fg,fontSize:13.5,fontWeight:650}},'Done')),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,'+tw+'px)',gap:12,justifyContent:'center',padding:'6px 16px calc(30px + env(safe-area-inset-bottom))'}},
      Array.from({length:n},(_,i)=>h('button',{key:i,'data-cur':i===cur?'1':'0',onClick:()=>onPick(i),className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:5,color:i===cur?T.accent:T.sub}},
        h('div',{style:{borderRadius:4,boxShadow:i===cur?'0 0 0 2.5px '+T.accent:'none'}},h(PdfPage,{doc,i,width:tw,ratio,lazy:true,T,thumb:true})),
        h('span',{style:{fontSize:11.5,fontWeight:i===cur?700:500}},i+1)))));
}
function PdfPage({doc,i,width,ratio,lazy,T,scale,marks,thumb}){
  const ref=useRef(null),box=useRef(null);const [vis,setVis]=useState(!lazy);const [r,setR]=useState(ratio);const [rects,setRects]=useState(null);
  useEffect(()=>{if(!lazy)return;const el=box.current;if(!el||!window.IntersectionObserver){setVis(true);return}
    const io=new IntersectionObserver(es=>es.forEach(e=>setVis(e.isIntersecting)),{rootMargin:'1200px 0px'});io.observe(el);return()=>io.disconnect()},[lazy]);
  useEffect(()=>{
    if(!vis||!width)return;let task=null,dead=false;
    doc.getPage(i+1).then(pg=>{if(dead)return;const v0=pg.getViewport({scale:1});setR(v0.height/v0.width);
      const dpr=Math.min(3,window.devicePixelRatio||1);let sc=width*dpr*(scale||1)/v0.width;
      const px=v0.width*v0.height*sc*sc;if(px>14e6)sc*=Math.sqrt(14e6/px); /* stay under iOS canvas limits */
      const v=pg.getViewport({scale:sc});const c=ref.current;if(!c)return;
      const off=document.createElement('canvas');off.width=Math.round(v.width);off.height=Math.round(v.height);
      task=pg.render({canvasContext:off.getContext('2d'),viewport:v});
      return task.promise.then(()=>{if(dead||!ref.current)return;const cc=ref.current;cc.width=off.width;cc.height=off.height;cc.getContext('2d').drawImage(off,0,0)})}).catch(()=>{});
    return()=>{dead=true;try{task&&task.cancel()}catch(e){}};
  },[vis,width,i,doc,scale]);
  useEffect(()=>{if(lazy&&!vis&&ref.current){ref.current.width=0;ref.current.height=0}},[vis]);
  useEffect(()=>{let dead=false;if(!marks||!marks.length){setRects(null);return}
    pdfPageText(doc,i).then(pt=>{if(!dead)setRects(pdfMarkRects(pt,marks))});return()=>{dead=true}},[marks&&marks.map(m=>m.start+':'+m.cur).join(),doc,i]);
  return h('div',{ref:box,'data-pg':i,style:{position:'relative',width,height:Math.round(width*r),margin:lazy&&!thumb?'0 auto 10px':0,background:'#fff',boxShadow:thumb?'0 1px 6px rgba(0,0,0,.18)':'0 2px 14px rgba(0,0,0,.18)',borderRadius:thumb?4:2,overflow:'hidden'}},
    h('canvas',{ref,style:{width:'100%',height:'100%',display:'block'}}),
    rects?rects.map((x,k)=>h('div',{key:k,style:{position:'absolute',left:x.left+'%',top:x.top+'%',width:x.width+'%',height:x.height+'%',borderRadius:2,
      background:x.cur?'rgba(255,149,0,.55)':'rgba(255,214,70,.45)',mixBlendMode:'multiply',boxShadow:x.cur?'0 0 0 2px rgba(255,149,0,.9)':'none'}})):null);
}

/* ---------- reader shell ---------- */
function BookReader({T:appT,S,bookId,onClose,toastFn}){
  const books=useBooks();
  const book=(books||[]).find(b=>b.id===bookId)||Store.get(bookId);
  const [prefs,setPrefsS]=useState(loadPrefs);
  const setPrefs=p=>setPrefsS(prev=>{const n={...prev,...p};try{localStorage.setItem(PREFS_KEY,JSON.stringify(n))}catch(e){}return n});
  const T=prefs.theme==='app'?appT:(THEMES[prefs.theme]||appT);
  const [model,setModel]=useState(null);const [pdf,setPdf]=useState(null);const [err,setErr]=useState(null);
  const [chrome,setChrome]=useState(true);
  const [panel,setPanel]=useState(null); /* 'toc' | 'aa' | {hl} */
  const [pos,setPos]=useState(null);
  const [sel,setSel]=useState(null);
  const [scrub,setScrub]=useState(null);
  const [sr,setSr]=useState(null); /* find in book: {q,matches,cur,busy,list,done} */
  const [ai,setAi]=useState(null); /* {preset} */
  const [img,setImg]=useState(null);
  const srTok=useRef(0),srT=useRef(null),selRef=useRef(null);
  const [scanned,setScanned]=useState(false);const [ocrJob,setOcrJob]=useState(null);const ocrStop=useRef(false);
  const apiRef=useRef({});const session=useRef(null);const startRef=useRef(null);
  const lastAct=useRef(Date.now());const lastG=useRef(null);const speedAcc=useRef(0);
  const isPdf=book&&book.format==='pdf'&&!book.textOnly;
  if(book&&!startRef.current)startRef.current={...(book.pos||{ch:0,frac:0})};
  /* open */
  useEffect(()=>{
    if(!book)return;let dead=false;
    Store.patch(book.id,b=>({openedAt:Date.now(),shelf:b.shelf==='toread'?'reading':b.shelf}));
    (async()=>{try{
      if(isPdf){const blob=await getBookFile(book);const d=await openPdf(blob);if(dead){d.destroy();return}docOcr.set(d,book.ocrPages||{});
        const toc=await pdfToc(d);setPdf({doc:d,toc});if(!book.pages)Store.patch(book.id,{pages:d.numPages,chapters:d.numPages})}
      else{const m=await getModel(book);if(dead)return;session.current=makeSession(book,m);setModel(m);
        const total=m.chapters.reduce((s,c)=>s+Math.max(c.n,300),0);if(book.total!==total)Store.patch(book.id,{total,chapters:m.chapters.length})}
    }catch(e){if(!dead)setErr((e&&e.message)||'Couldn’t open this book')}})();
    const t=setTimeout(()=>setChrome(false),2200);
    return()=>{dead=true;clearTimeout(t);if(session.current)session.current.close();Store.flush(book.id)};
  },[bookId]);
  useEffect(()=>()=>{if(pdf)try{pdf.doc.destroy()}catch(e){}},[pdf]);
  useEffect(()=>{ /* a PDF whose first pages carry no text layer is a scan */
    if(!pdf)return;let dead=false;(async()=>{const a=await pdfPageText(pdf.doc,0);const n=pdf.doc.numPages;
      const raw=x=>x.ocr||x.text.replace(/\s+/g,'').length<10;
      if(!dead&&raw(a)){const b2=n>1?await pdfPageText(pdf.doc,Math.min(1,n-1)):a;if(!dead&&raw(b2))setScanned(true)}})();
    return()=>{dead=true;ocrStop.current=true};
  },[pdf]);
  const runPdfOcr=async()=>{
    const O=window.InstaOCR;if(!O||!pdf)return;const doc=pdf.doc,n=doc.numPages;ocrStop.current=false;
    let langs=['eng'];try{langs=JSON.parse(localStorage.getItem('insta_ocr_langs'))||['eng']}catch(e){}
    const done=(Store.get(book.id)||{}).ocrPages||{};const todo=[];for(let i=0;i<n;i++)if(!done[i])todo.push(i);
    setOcrJob({i:0,n:todo.length,p:0});
    try{
      for(let k=0;k<todo.length;k++){if(ocrStop.current)break;const i=todo[k];setOcrJob({i:k,n:todo.length,p:0});
        const pg=await doc.getPage(i+1);const v0=pg.getViewport({scale:1});const v=pg.getViewport({scale:Math.min(2.6,2000/Math.max(v0.width,v0.height))});
        const c=document.createElement('canvas');c.width=Math.round(v.width);c.height=Math.round(v.height);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
        await pg.render({canvasContext:x,viewport:v}).promise;
        const r=await O.ocrCanvas(c,langs,p=>setOcrJob(j=>j&&{...j,p}));
        const m=docOcr.get(doc)||{};m[i]=r.text;docOcr.set(doc,m);const pc=pdfTexts.get(doc);if(pc)pc.delete(i);
        Store.patch(book.id,b=>({ocrPages:{...(b.ocrPages||{}),[i]:r.text}}),true);
      }
      if(!ocrStop.current){Store.flush(book.id);toastFn&&toastFn('Done — this PDF is now searchable and works with Ask AI')}
    }catch(e){toastFn&&toastFn((e&&e.message)||'Text recognition failed')}
    setOcrJob(null);
  };
  /* weights for book-wide progress */
  const weights=useMemo(()=>{if(!model)return null;const w=model.chapters.map(c=>Math.max(c.n,300));const before=[];let s=0;w.forEach((x,i)=>{before[i]=s;s+=x});return{w,before,total:s}},[model]);
  const globalOf=p=>{if(!p)return 0;if(isPdf){const n=(pdf&&pdf.doc.numPages)||book.pages||1;return Math.min(1,(p.ch+(p.frac||0))/n)}
    if(!weights)return 0;return Math.min(1,(weights.before[p.ch]+(p.frac||0)*weights.w[p.ch])/weights.total)};
  const fromGlobal=g=>{if(isPdf){const n=(pdf&&pdf.doc.numPages)||1;const x=Math.min(n-1e-6,g*n);return{ch:Math.floor(x),frac:x-Math.floor(x)}}
    const t=g*weights.total;let c=0;while(c<weights.w.length-1&&weights.before[c+1]<=t)c++;return{ch:c,frac:Math.max(0,Math.min(.999,(t-weights.before[c])/weights.w[c]))}};
  const onPos=useCallback(p=>{
    setPos(p);lastAct.current=Date.now();
    if(!book)return;
    const g=p.end?1:globalOf(p);
    /* pages read today: forward progress, counted in page-sized steps */
    if(lastG.current!=null&&g>lastG.current){const n=isPdf?((pdf&&pdf.doc.numPages)||1):(weights?weights.total/1500:1);const d=(g-lastG.current)*n;if(d<=3)addStat(0,d)}
    const prevG=lastG.current;lastG.current=g;
    const patch={pos:{ch:p.ch,frac:p.frac||0},progress:Math.max(g,p.end?1:0)};
    if(p.end&&book.shelf!=='finished'){patch.shelf='finished';patch.finishedAt=Date.now();patch.progress=1;setTimeout(()=>toastFn&&toastFn('Finished “'+book.title+'” 🎉'),50)}
    if(prevG!=null&&g>prevG&&g-prevG<.05&&!isPdf&&weights)speedAcc.current+=(g-prevG)*weights.total;
    Store.patch(book.id,patch,true);
  },[book&&book.id,weights,pdf]);
  /* reading time: count 5-second ticks while visible and recently active */
  useEffect(()=>{
    const bump=()=>{lastAct.current=Date.now()};window.addEventListener('touchstart',bump,{passive:true});window.addEventListener('keydown',bump);
    const iv=setInterval(()=>{
      if(document.visibilityState!=='visible'||Date.now()-lastAct.current>120000||!book)return;
      addStat(5,0);
      const ch=speedAcc.current;speedAcc.current=0;
      Store.patch(book.id,b=>({readSec:(b.readSec||0)+5,speed:{chars:((b.speed&&b.speed.chars)||0)+ch,sec:((b.speed&&b.speed.sec)||0)+5}}),true);
    },5000);
    const vis=()=>{if(document.visibilityState==='hidden'&&book)Store.flush(book.id)};document.addEventListener('visibilitychange',vis);
    return()=>{clearInterval(iv);window.removeEventListener('touchstart',bump);window.removeEventListener('keydown',bump);document.removeEventListener('visibilitychange',vis)};
  },[book&&book.id]);
  useEffect(()=>{const pd=e=>e.preventDefault();document.addEventListener('gesturestart',pd,{passive:false});document.addEventListener('gesturechange',pd,{passive:false});
    return()=>{document.removeEventListener('gesturestart',pd);document.removeEventListener('gesturechange',pd)}},[]);
  const searchProp=useMemo(()=>sr&&sr.matches.length?{q:sr.q,matches:sr.matches,cur:sr.cur}:null,[sr&&sr.matches,sr&&sr.cur,sr&&sr.q]);
  /* text selection → highlight toolbar */
  useEffect(()=>{
    if(isPdf)return;let t=null;
    const on=()=>{clearTimeout(t);t=setTimeout(()=>{
      const s=window.getSelection();if(!s||s.isCollapsed||!String(s).trim()){setSel(null);return}
      const r=s.getRangeAt(0);const root=(r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentNode).closest('.bkbody');
      if(!root){setSel(null);return}
      const sec=root.closest('[data-ch]');const c=sec?+sec.getAttribute('data-ch'):(pos?pos.ch:0);
      const off=rangeOffsets(root,r);const rect=r.getBoundingClientRect();
      const v={ch:c,start:off.start,end:off.end,text:String(s).trim().slice(0,1200),y:rect.bottom,x:rect.left+rect.width/2};selRef.current=v;setSel(v);
    },220)};
    document.addEventListener('selectionchange',on);return()=>{clearTimeout(t);document.removeEventListener('selectionchange',on)};
  },[isPdf,pos&&pos.ch]);
  if(!book)return null;
  const hls=book.highlights||NOHL;
  const addHl=(color,withNote)=>{if(!sel)return;const hl={id:'h'+Date.now().toString(36),ch:sel.ch,start:sel.start,end:sel.end,text:sel.text,color,note:'',at:Date.now()};
    Store.patch(book.id,b=>({highlights:[...(b.highlights||[]),hl]}));try{window.getSelection().removeAllRanges()}catch(e){}setSel(null);if(withNote)setPanel({hl:hl.id,edit:true})};
  const g=pos?globalOf(pos):(book.progress||0);
  const curBm=pos&&(book.bookmarks||[]).find(bm=>bm.ch===pos.ch&&Math.abs(bm.frac-(pos.frac||0))<(1/Math.max(1,pos.pages||1))*0.99);
  const toggleBm=()=>{if(!pos)return;if(curBm){Store.patch(book.id,b=>({bookmarks:(b.bookmarks||[]).filter(x=>x.id!==curBm.id)}));toastFn&&toastFn('Bookmark removed');return}
    const snip=apiRef.current.snippet?apiRef.current.snippet():'';const bm={id:'k'+Date.now().toString(36),ch:pos.ch,frac:pos.frac||0,g,snip,at:Date.now()};
    Store.patch(book.id,b=>({bookmarks:[...(b.bookmarks||[]),bm].sort((a,b2)=>a.g-b2.g)}));toastFn&&toastFn('Bookmarked')};
  const chTitle=c=>isPdf?('Page '+(c+1)):(model&&model.chapters[c]?model.chapters[c].t:'');
  const goto=(c,frac,id)=>{apiRef.current.goTo&&apiRef.current.goTo(c,frac,id);setPanel(null)};
  const onLink=href=>{if(!model)return;if(href.startsWith('@')){goto(+href.slice(1),0);return}const c=model.idMap&&model.idMap[href];if(c!=null)goto(c,0,href)};
  const nPages=isPdf?((pdf&&pdf.doc.numPages)||book.pages||0):0;
  /* ---- find in book ---- */
  const snip=(t,a,b)=>[(a>60?'…':'')+t.slice(Math.max(0,a-60),a).replace(/\s+/g,' '),t.slice(a,b),t.slice(b,b+80).replace(/\s+/g,' ')+'…'];
  const runSearch=q=>{
    const tok=++srTok.current;const ql=q.trim().toLowerCase();
    if(ql.length<2){setSr(x=>x&&{...x,matches:[],cur:-1,busy:false,done:false});return}
    const startCh=pos?pos.ch:0;
    const finish=(matches,done)=>{if(tok!==srTok.current)return;
      let cur=matches.findIndex(m=>m.ch>=startCh);if(cur<0)cur=matches.length?0:-1;
      setSr(x=>x&&{...x,matches,cur,busy:!done,done})};
    if(!isPdf){const texts=chapterTexts(model);const out=[];
      for(let c=0;c<texts.length&&out.length<2000;c++){const tl=texts[c].toLowerCase();let i=tl.indexOf(ql);while(i>=0&&out.length<2000){out.push({ch:c,start:i,end:i+ql.length,snip:snip(texts[c],i,i+ql.length)});i=tl.indexOf(ql,i+ql.length)}}
      finish(out,true);return}
    (async()=>{const out=[];setSr(x=>x&&{...x,busy:true,prog:0});
      for(let i=0;i<nPages&&out.length<2000;i++){if(tok!==srTok.current)return;const pt=await pdfPageText(pdf.doc,i);const tl=pt.text.toLowerCase();let k=tl.indexOf(ql);
        while(k>=0&&out.length<2000){out.push({ch:i,start:k,end:k+ql.length,snip:snip(pt.text,k,k+ql.length)});k=tl.indexOf(ql,k+ql.length)}
        if(i%8===7){finish(out.slice(),false);setSr(x=>x&&{...x,prog:(i+1)/nPages})}}
      finish(out,true)})();
  };
  const onSearchInput=q=>{setSr(x=>({...(x||{}),q,list:true,matches:(x&&x.matches)||[],cur:-1}));clearTimeout(srT.current);srT.current=setTimeout(()=>runSearch(q),220)};
  const goMatch=i=>{if(!sr||!sr.matches.length)return;const n=sr.matches.length;const k=((i%n)+n)%n;setSr(x=>({...x,cur:k,list:false}));
    const m=sr.matches[k];if(apiRef.current.goToMatch)apiRef.current.goToMatch(m);try{document.activeElement&&document.activeElement.blur()}catch(e){}};
  const closeSearch=()=>{srTok.current++;setSr(null)};
  /* ---- text for the AI ---- */
  const getCtx=async(kind,preset)=>{
    const MAX=28000;
    if(!isPdf){const texts=chapterTexts(model);const p=pos||{ch:0,frac:0,pages:1};const t=texts[p.ch]||'';const off=Math.floor((p.frac||0)*t.length);
      const per=Math.max(900,Math.round(t.length/Math.max(1,p.pages||1)));
      if(kind==='page')return t.slice(off,off+Math.round(per*1.1));
      if(kind==='chapter')return(chTitle(p.ch)?chTitle(p.ch)+'\n\n':'')+t.slice(0,MAX);
      if(kind==='sel'&&preset){const tt=texts[preset.ch]||'';return tt.slice(Math.max(0,preset.start-700),preset.end+700)}
      let acc=t.slice(0,off+per);for(let c=p.ch-1;c>=0&&acc.length<MAX;c--)acc=texts[c]+'\n\n'+acc;
      return acc.length>MAX?'[…earlier text omitted…]\n'+acc.slice(-MAX):acc}
    const doc=pdf.doc,cur=pos?pos.ch:0;const pt=async i=>(await pdfPageText(doc,i)).text;
    if(kind==='page')return await pt(cur);
    if(kind==='chapter'){let s2='';for(let i=Math.max(0,cur-2);i<=Math.min(nPages-1,cur+2);i++)s2+='[Page '+(i+1)+']\n'+(await pt(i))+'\n\n';return s2.slice(0,MAX)}
    let acc='';for(let i=cur;i>=0&&acc.length<MAX;i--)acc='[Page '+(i+1)+']\n'+(await pt(i))+'\n\n'+acc;
    return acc.length>MAX?'[…]\n'+acc.slice(-MAX):acc;
  };
  const sp=(book.speed&&book.speed.sec>120)?book.speed.chars/book.speed.sec:18;
  const leftCh=!isPdf&&pos&&model?(model.chapters[pos.ch].n*(1-(pos.frac||0)))/sp:0;
  const leftBook=isPdf?(nPages*(1-g))*((book.readSec>300&&g>0)?book.readSec/Math.max(1,g*nPages):90):(weights?weights.total*(1-g)/sp:0);
  const footer=isPdf?('Page '+((pos?pos.ch:0)+1)+' of '+nPages):(pos?((pos.pages>1?(pos.page+1)+' / '+pos.pages+' · ':'')+chTitle(pos.ch)):'');
  const bar={position:'absolute',left:0,right:0,zIndex:3,background:hexA(T.bg,.94),backdropFilter:'saturate(180%) blur(20px)',WebkitBackdropFilter:'saturate(180%) blur(20px)',
    transition:'transform 280ms cubic-bezier(.2,.85,.25,1), opacity 220ms',fontFamily:UIF};
  const ib=(icon,onClick,label,active)=>h('button',{onClick,'aria-label':label,className:'act90',style:{width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',color:active?T.accent:T.fg,flexShrink:0}},icon);
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:46,background:T.bg,color:T.fg,overflow:'hidden'}},
    h('style',null,READER_CSS(T,prefs)),
    err?h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:30,textAlign:'center',gap:14,fontFamily:UIF}},
        h('div',{style:{color:T.sub}},BI.book(40)),h('div',{style:{fontSize:16,fontWeight:650}},'Couldn’t open this book'),h('div',{style:{fontSize:13.5,color:T.sub,lineHeight:1.5}},err),
        h('button',{onClick:onClose,className:'act95',style:{marginTop:6,padding:'10px 20px',borderRadius:999,background:T.fg,color:T.bg,fontWeight:650}},'Back to library')):
    (!model&&!pdf)?h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,fontFamily:UIF}},
        h('div',{style:{width:110}},h(Cover,{book,big:true})),h('div',{style:{display:'flex',alignItems:'center',gap:8,color:T.sub,fontSize:13.5}},h(Spinner,{T,size:15}),'Opening…')):
    isPdf?h(PdfView,{T,prefs,setPrefs,doc:pdf.doc,start:startRef.current,apiRef,onPos,onTap:()=>{if(sr&&sr.list){setSr(x=>({...x,list:false}));return}setChrome(c=>!c)},chromeH:chrome||sr?52:0,search:searchProp}):
      h(ReflowView,{T,prefs,model,session:session.current,start:startRef.current,hls,apiRef,onPos,onTap:()=>{if(sr&&sr.list){setSr(x=>({...x,list:false}));return}setChrome(c=>!c)},onHlTap:id=>setPanel({hl:id}),onLink,chromeH:prefs.mode==='scroll'?14:0,
        search:searchProp,onImage:setImg,onPinchSize:size=>setPrefs({size})}),
    /* quiet footer (always on, like a printed page) */
    (model||pdf)&&!chrome&&!sr?h('div',{style:{position:'absolute',left:prefs.margin,right:prefs.margin,bottom:'calc(12px + env(safe-area-inset-bottom))',display:'flex',justifyContent:'space-between',gap:12,fontSize:11,color:T.sub,fontFamily:UIF,pointerEvents:'none',zIndex:2}},
      h('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},footer),h('span',{style:{flexShrink:0}},pct(g))):null,
    curBm&&!chrome?h('div',{style:{position:'absolute',right:16,top:'env(safe-area-inset-top)',color:T.accent,zIndex:2,pointerEvents:'none'}},BI.bookmark(22,true)):null,
    /* top bar */
    h('div',{style:Object.assign({},bar,{top:0,paddingTop:'env(safe-area-inset-top)',borderBottom:'0.5px solid '+T.hair,transform:chrome||sr?'none':'translateY(-110%)',opacity:chrome||sr?1:0})},
      sr?h(SearchBar,{T,sr,isPdf,chTitle,onInput:onSearchInput,onStep:d=>goMatch(sr.cur+d),onPick:goMatch,onClose:closeSearch,onEnter:()=>goMatch(sr.cur<0?0:sr.cur)}):
      h('div',{style:{display:'flex',alignItems:'center',height:48,padding:'0 4px'}},
        ib(Icons.back(23),onClose,'Back to library'),
        h('div',{style:{flex:1,minWidth:0,textAlign:'center'}},
          h('div',{style:{fontSize:14.5,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},book.title),
          h('div',{style:{fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},pos?chTitle(pos.ch):(book.author||''))),
        ib(Icons.search(21),()=>{setSr({q:'',matches:[],cur:-1,busy:false,list:true});setChrome(true)},'Search in book'),
        ib(Icons.ai(21),()=>setAi({preset:null}),'Ask AI'),
        ib(BI.bookmark(21,!!curBm),toggleBm,curBm?'Remove bookmark':'Add bookmark',!!curBm))),
    /* bottom bar: scrubber + time left */
    (model||pdf)?h('div',{style:Object.assign({},bar,{bottom:0,paddingBottom:'calc(4px + env(safe-area-inset-bottom))',borderTop:'0.5px solid '+T.hair,transform:chrome&&!sr?'none':'translateY(110%)',opacity:chrome&&!sr?1:0})},
      h('div',{style:{padding:'10px 18px 0'}},
        scrub!=null?h('div',{style:{textAlign:'center',fontSize:12.5,fontWeight:600,marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},chTitle(fromGlobal(scrub).ch)+' · '+pct(scrub)):null,
        h('input',{type:'range',min:0,max:1000,value:Math.round((scrub!=null?scrub:g)*1000),className:'bkrange',
          onChange:e=>setScrub(+e.target.value/1000),
          onPointerUp:()=>{if(scrub!=null){const p=fromGlobal(Math.min(.9995,scrub));goto(p.ch,p.frac);setScrub(null)}},
          onTouchEnd:()=>{if(scrub!=null){const p=fromGlobal(Math.min(.9995,scrub));goto(p.ch,p.frac);setScrub(null)}},
          style:{width:'100%','--bkp':((scrub!=null?scrub:g)*100)+'%'}}),
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11.5,color:T.sub,marginTop:4,gap:10}},
          h('span',null,isPdf?('Page '+((pos?pos.ch:0)+1)+' of '+nPages):(pos&&pos.pages>1?'Page '+(pos.page+1)+' of '+pos.pages+' in chapter':'')),
          h('span',{style:{fontWeight:650,color:T.fg}},pct(g)),
          h('span',null,isPdf?fmtDur(leftBook)+' left':(fmtDur(leftCh)+' in chapter · '+fmtDur(leftBook)+' left')))),
      h('div',{style:{display:'flex',justifyContent:'space-around',padding:'6px 8px 0'}},
        [[BI.toc(21),'Contents',()=>setPanel('toc')],isPdf?[BI.grid(20),'Pages',()=>apiRef.current.overview&&apiRef.current.overview()]:null,[Icons.search(20),'Search',()=>setSr({q:'',matches:[],cur:-1,busy:false,list:true})],[Icons.ai(20),'Ask AI',()=>setAi({preset:null})],[BI.aa(21),'Text',()=>setPanel('aa')]]
          .filter(Boolean).map(([ic,l,fn])=>h('button',{key:l,onClick:fn,'aria-label':l==='Text'?'Text & layout':l,className:'act90',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:56,padding:'4px 2px',color:T.fg}},ic,
            h('span',{style:{fontSize:10.5,fontWeight:550,color:T.sub}},l))))):null,
    isPdf&&pdf&&(ocrJob||(scanned&&chrome&&!sr&&Object.keys(book.ocrPages||{}).length<nPages))?h('div',{className:'fdin',style:{position:'absolute',left:12,right:12,top:'calc(56px + env(safe-area-inset-top))',zIndex:4,
        display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:14,background:hexA(T.bg,.96),boxShadow:'0 6px 22px rgba(0,0,0,.16)',border:'0.5px solid '+T.hair,fontFamily:UIF,
        backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)'}},
      ocrJob?h(Fragment,null,h(Spinner,{T,size:16}),
          h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:13.5,fontWeight:650}},'Reading page '+(ocrJob.i+1)+' of '+ocrJob.n+'…'),
            h('div',{style:{height:3,borderRadius:2,background:T.hair,marginTop:6,overflow:'hidden'}},h('div',{style:{height:'100%',width:(((ocrJob.i+(ocrJob.p||0))/Math.max(1,ocrJob.n))*100)+'%',background:T.accent,transition:'width 300ms'}}))),
          h('button',{onClick:()=>{ocrStop.current=true},className:'act95',style:{fontSize:13,fontWeight:650,color:T.danger}},'Stop'))
        :h(Fragment,null,h('span',{style:{display:'flex',color:T.accent}},window.InstaOCR?window.InstaOCR.ScanIcon(20):Icons.file(20)),
          h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:13.5,fontWeight:650}},'Scanned PDF'),h('div',{style:{fontSize:12,color:T.sub}},Object.keys(book.ocrPages||{}).length?'Text read on '+Object.keys(book.ocrPages).length+' of '+nPages+' pages':'Read its text so you can search, select and Ask AI')),
          h('button',{onClick:runPdfOcr,className:'act95',style:{padding:'8px 12px',borderRadius:999,background:T.fg,color:T.bg,fontSize:13,fontWeight:650,flexShrink:0}},Object.keys(book.ocrPages||{}).length?'Continue':'Make searchable'))):null,
    /* selection toolbar */
    sel?h('div',{className:'fdin',style:{position:'fixed',zIndex:8,left:Math.max(10,Math.min(window.innerWidth-292,sel.x-141)),top:Math.min(window.innerHeight-120,sel.y+14),width:282,
        display:'flex',alignItems:'center',gap:4,padding:6,borderRadius:14,background:'#26262a',color:'#f2f2f3',boxShadow:'0 10px 30px rgba(0,0,0,.4)',fontFamily:UIF}},
      HL_COLORS.map(([k,,dot])=>h('button',{key:k,onMouseDown:e=>e.preventDefault(),onClick:()=>addHl(k),'aria-label':'Highlight',className:'act90',style:{width:30,height:30,borderRadius:15,background:dot,flexShrink:0,margin:'0 2px'}})),
      h('div',{style:{width:1,alignSelf:'stretch',background:'#3a3a3f',margin:'0 4px'}}),
      h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>{const v=sel;try{window.getSelection().removeAllRanges()}catch(e){}setSel(null);setAi({preset:v})},'aria-label':'Ask AI about this',className:'act90',style:{display:'flex',color:'#fff',padding:4}},Icons.ai(17)),
      h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>addHl('y',true),className:'act90',style:{display:'flex',alignItems:'center',gap:4,color:'#fff',fontSize:13,fontWeight:600,padding:'4px 6px'}},Icons.note(16),'Note'),
      h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>{try{navigator.clipboard.writeText(sel.text)}catch(e){}toastFn&&toastFn('Copied');setSel(null)},'aria-label':'Copy',className:'act90',style:{display:'flex',color:'#fff',padding:4}},Icons.copy(16))):null,
    panel==='toc'?h(ContentsPanel,{T,book,toc:isPdf?(pdf?pdf.toc:[]):(model?model.toc:[]),pos,isPdf,nPages,chTitle,onGo:goto,onClose:()=>setPanel(null),
      onDelBm:id=>Store.patch(book.id,b=>({bookmarks:(b.bookmarks||[]).filter(x=>x.id!==id)})),onHl:id=>setPanel({hl:id})}):null,
    panel==='aa'?h(AaPanel,{T,prefs,setPrefs,isPdf,onClose:()=>setPanel(null)}):null,
    ai?h(AiPanel,{T,S,book,isPdf,getCtx,preset:ai.preset,onClose:()=>setAi(null),toastFn}):null,
    img?h(ImageViewer,{src:img,onClose:()=>setImg(null)}):null,
    panel&&panel.hl?h(HlPanel,{T,book,id:panel.hl,edit:panel.edit,onClose:()=>setPanel(null),onGo:hl=>goto(hl.ch,0),chTitle}):null);
}
/* ---------- AI companion (uses the app's AI provider: Gemini / OpenRouter / Claude app) ---------- */
function AiPanel({T,S,book,isPdf,getCtx,preset,onClose,toastFn}){
  S=S||{};
  const claude=S.aiProvider==='claude';
  const ready=typeof aiReady==='function'?aiReady(S):false;
  const lang=S.aiLang||'English';
  const [msgs,setMsgs]=useState([]);const [busy,setBusy]=useState('');const [input,setInput]=useState('');
  const hist=useRef([]);const endRef=useRef(null);
  useEffect(()=>{if(endRef.current)endRef.current.scrollIntoView({block:'end',behavior:'smooth'})},[msgs.length,busy]);
  const who='“'+book.title+'”'+(book.author?' by '+book.author:'');
  const sys='You are a friendly, precise reading companion inside an e-book reader. The user is reading '+who+'. Only use the book text you are given; never reveal what happens after the point the user has reached unless they explicitly ask. Answer in '+lang+'. Be concise: short paragraphs and bullet points, no preamble.';
  const P={
    recap:c=>'Give me a spoiler-free recap of what I have read so far: a 2–3 sentence overview, then 4–8 bullet points of the key events or ideas in order, then one line starting with "Where you left off:".\n\nTEXT READ SO FAR (it ends where I stopped):\n'+c,
    chapter:c=>'Summarize this '+(isPdf?'section':'chapter')+' in 5–8 bullet points, then one line starting with "Takeaway:".\n\n'+c,
    page:c=>'Explain this page in plain language — what is happening or being argued — and gloss any difficult words, names or references.\n\nPAGE:\n'+c,
    who:c=>'List the main characters (fiction) or the key people, terms and concepts (non-fiction) in what I have read so far — one line each, spoiler-free.\n\nTEXT READ SO FAR:\n'+c,
    ideas:c=>'What are the key ideas, arguments or themes so far? 5–8 bullets with one sentence of explanation each.\n\nTEXT READ SO FAR:\n'+c,
    explain:(c,sel)=>'Explain this passage simply, with any context needed to understand it:\n“'+sel+'”\n\nSURROUNDING TEXT:\n'+c,
    define:(c,sel)=>'Define “'+sel+'” as it is used here: meaning, part of speech, a pronunciation hint and one simple example sentence.\n\nCONTEXT:\n'+c,
    translate:(c,sel)=>'Translate into '+lang+(lang==='English'?' (if it is already English, rewrite it in simple English and explain any idioms)':'')+'. Give the translation, then one line on anything tricky.\n\n“'+sel+'”',
    ask:(c,q)=>q+'\n\nAnswer using this text from the book (what I have read so far, ending where I stopped):\n'+c
  };
  const LABEL={recap:'Recap so far',chapter:isPdf?'Summarize these pages':'Summarize this chapter',page:'Explain this page',who:isPdf?'Key people & terms':'Who’s who',ideas:'Key ideas',explain:'Explain this',define:'Define',translate:'Translate'};
  const CTX={recap:'recap',chapter:'chapter',page:'page',who:'recap',ideas:'recap',explain:'sel',define:'sel',translate:'sel',ask:'recap'};
  const run=async(kind,q)=>{
    if(busy)return;
    const label=kind==='ask'?q:LABEL[kind];
    if(!ready&&!claude){toastFn&&toastFn('Turn on AI in Settings → AI Assistant first');return}
    setBusy('Reading the book…');
    let ctx='';try{ctx=await getCtx(CTX[kind],preset)}catch(e){}
    const first=!hist.current.length;
    const prompt=kind==='ask'?(first?P.ask(ctx,q):q):P[kind](ctx,preset&&preset.text);
    if(claude){setBusy('');openInClaude(sys+'\n\n'+prompt,toastFn);return}
    setMsgs(m=>[...m,{role:'user',content:label}]);setBusy('Thinking…');
    try{
      const out=await aiChat(S,[{role:'system',content:sys},...hist.current,{role:'user',content:prompt}],1600,w=>setBusy(typeof w==='string'&&w?w:'Thinking…'));
      hist.current=[...hist.current,{role:'user',content:prompt},{role:'assistant',content:String(out||'')}].slice(-6);
      setMsgs(m=>[...m,{role:'assistant',content:String(out||'')}]);
    }catch(e){setMsgs(m=>[...m,{role:'assistant',content:(e&&e.message)||'Something went wrong',err:true}])}
    setBusy('');
  };
  const send=()=>{const q=input.trim();if(!q)return;setInput('');run('ask',q)};
  const chips=(preset?['explain','define','translate']:[]).concat(['recap','page','chapter','who','ideas']);
  const md=t=>{try{return typeof mdToHtml==='function'?mdToHtml(t):esc(t)}catch(e){return esc(t)}};
  return h(Sheet,{T,onClose,title:null,z:62,maxH:'90%'},
    h('div',{style:{padding:'6px 18px 4px',display:'flex',alignItems:'center',gap:10}},
      h('span',{style:{width:34,height:34,borderRadius:11,background:hexA(T.accent,.14),color:T.accent,display:'flex',alignItems:'center',justifyContent:'center'}},Icons.ai(19)),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:17,fontWeight:700}},'Ask AI'),
        h('div',{style:{fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(ready||claude)?('Spoiler-free · '+(typeof aiModelLabel==='function'?aiModelLabel(S):'AI')):'Not set up yet')),
      h('button',{onClick:onClose,'aria-label':'Close',className:'act90',style:{display:'flex',color:T.sub,padding:6}},Icons.x(19))),
    !ready&&!claude?h('div',{style:{margin:'10px 18px',padding:'14px 16px',borderRadius:14,background:T.card,fontSize:13.5,lineHeight:1.5}},
      h('div',{style:{fontWeight:700,marginBottom:4}},'Turn on AI to use these'),
      'Open Settings → AI Assistant and add a free Gemini or OpenRouter key, or choose the Claude app. Your book text is only sent to the AI when you tap an action.'):null,
    preset?h('div',{style:{margin:'10px 18px 2px',padding:'10px 12px',borderLeft:'3px solid '+T.accent,background:T.card,borderRadius:'0 10px 10px 0',fontSize:14,lineHeight:1.45,fontFamily:"'Lora',Georgia,serif",
      display:'-webkit-box',WebkitLineClamp:4,WebkitBoxOrient:'vertical',overflow:'hidden'}},'“'+preset.text+'”'):null,
    h('div',{style:{padding:'8px 18px 0'}},
      msgs.map((m,i)=>m.role==='user'
        ?h('div',{key:i,style:{display:'flex',justifyContent:'flex-end',margin:'10px 0 6px'}},h('div',{style:{maxWidth:'85%',padding:'8px 13px',borderRadius:'16px 16px 4px 16px',background:T.fg,color:T.bg,fontSize:14,fontWeight:550}},m.content))
        :h('div',{key:i,style:{margin:'4px 0 10px'}},
          h('div',{className:'bkai',style:{fontSize:15,lineHeight:1.55,color:m.err?T.danger:T.fg},dangerouslySetInnerHTML:{__html:m.err?esc(m.content):md(m.content)}}),
          m.err?null:h('button',{onClick:()=>{try{navigator.clipboard.writeText(m.content)}catch(e){}toastFn&&toastFn('Copied')},className:'act95',style:{display:'inline-flex',alignItems:'center',gap:5,marginTop:6,fontSize:12,color:T.sub,fontWeight:600}},Icons.copy(13),'Copy'))),
      busy?h('div',{style:{display:'flex',alignItems:'center',gap:9,color:T.sub,fontSize:13.5,padding:'10px 0'}},h(Spinner,{T,size:15}),busy):null),
    h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',padding:'10px 18px 4px'}},
      chips.map(k=>h('button',{key:k,onClick:()=>run(k),disabled:!!busy,className:'act95',style:{flexShrink:0,padding:'8px 13px',borderRadius:999,fontSize:13,fontWeight:600,
        background:(k==='explain'&&preset)?T.fg:T.card,color:(k==='explain'&&preset)?T.bg:T.fg,opacity:busy?.5:1,border:'0.5px solid '+T.hair}},LABEL[k]))),
    h('div',{style:{display:'flex',gap:8,alignItems:'center',padding:'8px 18px 10px'}},
      h('input',{value:input,onChange:e=>setInput(e.target.value),onKeyDown:e=>{if(e.key==='Enter')send()},placeholder:msgs.length?'Ask a follow-up…':'Ask anything about this book…',enterKeyHint:'send',
        style:{flex:1,minWidth:0,padding:'11px 14px',borderRadius:14,border:'1px solid '+T.hair,background:T.card,color:T.fg,fontSize:16,outline:'none'}}),
      h('button',{onClick:send,disabled:!input.trim()||!!busy,'aria-label':'Send',className:'act90',style:{width:42,height:42,borderRadius:21,background:input.trim()?T.fg:T.card,color:input.trim()?T.bg:T.sub,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},Icons.send(18))),
    h('div',{ref:endRef,style:{height:4}}));
}

function SearchBar({T,sr,isPdf,chTitle,onInput,onStep,onPick,onClose,onEnter}){
  const n=sr.matches.length;
  const count=sr.q&&sr.q.trim().length>1?(n?((sr.cur>=0?sr.cur+1:0)+' of '+n+(sr.busy?'+':'')):(sr.busy?'Searching…':'No matches')):'';
  const nb=(icon,fn,label,dis)=>h('button',{onClick:fn,disabled:dis,'aria-label':label,className:'act90',style:{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',color:dis?T.sub:T.fg,flexShrink:0,opacity:dis?.5:1}},icon);
  return h('div',null,
    h('div',{style:{display:'flex',alignItems:'center',gap:4,height:48,padding:'0 6px'}},
      nb(Icons.x(20),onClose,'Close search'),
      h('div',{style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:7,background:T.search||T.card,borderRadius:11,padding:'7px 10px'}},
        h('span',{style:{display:'flex',color:T.sub,flexShrink:0}},Icons.search(15)),
        h('input',{autoFocus:true,value:sr.q||'',onChange:e=>onInput(e.target.value),onKeyDown:e=>{if(e.key==='Enter')onEnter()},placeholder:isPdf?'Find in document':'Find in book',enterKeyHint:'search',
          autoCapitalize:'none',autoCorrect:'off',spellCheck:false,style:{flex:1,minWidth:0,border:'none',background:'transparent',color:T.fg,fontSize:16,outline:'none',padding:0}}),
        count?h('span',{style:{fontSize:12,color:T.sub,flexShrink:0,fontVariantNumeric:'tabular-nums'}},count):null),
      nb(BI.up(20),()=>onStep(-1),'Previous match',!n),nb(BI.down(20),()=>onStep(1),'Next match',!n)),
    sr.busy&&sr.prog!=null?h('div',{style:{height:2,background:T.hair}},h('div',{style:{height:2,width:(sr.prog*100)+'%',background:T.accent,transition:'width 200ms'}})):null,
    sr.list&&n?h('div',{className:'sy',style:{maxHeight:'46vh',overflowY:'auto',borderTop:'0.5px solid '+T.hair}},
      sr.matches.slice(0,300).map((m,i)=>h('button',{key:i,onClick:()=>onPick(i),className:'act98',style:{display:'block',width:'100%',textAlign:'left',padding:'10px 16px',borderBottom:'0.5px solid '+T.hair,color:T.fg,background:i===sr.cur?hexA(T.accent,.08):'transparent'}},
        h('div',{style:{fontSize:11.5,color:T.sub,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},isPdf?'Page '+(m.ch+1):(chTitle(m.ch)||'Section '+(m.ch+1))),
        h('div',{style:{fontSize:13.5,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},m.snip[0],h('b',{style:{background:'rgba(255,214,70,.5)',borderRadius:2}},m.snip[1]),m.snip[2]))),
      n>300?h('div',{style:{padding:'10px 16px',fontSize:12,color:T.sub}},'Showing the first 300 — use the arrows for the rest'):null):null);
}
function READER_CSS(T,prefs){
  return '.bkrd .bkbody,.bkrd .bkbody *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default}'+
  '.bkrd .bkbody{word-wrap:break-word;overflow-wrap:break-word;-webkit-text-size-adjust:100%}'+
  '.bkrd .bkbody p{margin:0 0 .15em;text-indent:1.4em}.bkrd .bkbody p.bkc,.bkrd .bkbody .bkc{text-align:center;text-indent:0}'+
  '.bkrd .bkbody h1,.bkrd .bkbody h2,.bkrd .bkbody h3,.bkrd .bkbody h4{text-align:center;line-height:1.25;margin:1.1em 0 .8em;text-indent:0;font-weight:650;break-after:avoid}'+
  '.bkrd .bkbody h1{font-size:1.5em}.bkrd .bkbody h2{font-size:1.3em}.bkrd .bkbody h3{font-size:1.12em}'+
  '.bkrd .bkbody h1+p,.bkrd .bkbody h2+p,.bkrd .bkbody h3+p,.bkrd .bkbody hr+p{text-indent:0}'+
  '.bkrd .bkbody img{display:block;max-width:100%;max-height:calc(100vh - 140px);height:auto;margin:.8em auto;object-fit:contain;break-inside:avoid}'+
  '.bkrd .bkbody blockquote{margin:.8em 0 .8em 1em;padding-left:.8em;border-left:2px solid '+T.hair+';font-style:italic}'+
  '.bkrd .bkbody .bkv{text-indent:0;margin:0;text-align:left}.bkrd .bkbody .bkta{text-align:right;text-indent:0;font-style:italic}'+
  '.bkrd .bkbody hr{border:none;text-align:center;margin:1.2em 0}.bkrd .bkbody hr:after{content:"•  •  •";color:'+T.sub+';letter-spacing:.3em}'+
  '.bkrd .bkbody a[href],.bkrd .bkbody [data-bkhref]{color:'+T.accent+';text-decoration:none}'+
  '.bkrd .bkbody pre{white-space:pre-wrap;font-size:.85em;background:'+T.card+';padding:.6em .8em;border-radius:6px;text-align:left}'+
  '.bkrd .bkbody code{font-size:.9em}.bkrd .bkbody table{border-collapse:collapse;margin:.8em 0;font-size:.9em;text-indent:0}.bkrd .bkbody td,.bkrd .bkbody th{border:1px solid '+T.hair+';padding:.25em .45em;text-indent:0}'+
  '.bkrd .bkbody ul,.bkrd .bkbody ol{margin:.5em 0 .5em 1.3em;padding:0}.bkrd .bkbody li{text-indent:0;margin:.15em 0}'+
  '.bkrd mark.bkhl{color:inherit;border-radius:2px;padding:0 1px;-webkit-box-decoration-break:clone}'+
  '.bkrd mark.bksr{color:inherit;background:rgba(255,214,70,.5);border-radius:2px}.bkrd mark.bksr.cur{background:rgba(255,149,0,.75);box-shadow:0 0 0 2px rgba(255,149,0,.75)}'+
  '.bkrd .bkbody img{cursor:zoom-in}.bkai p{margin:.45em 0}.bkai ul,.bkai ol{padding-left:1.3em;margin:.45em 0}.bkai li{margin:.25em 0}.bkai h1,.bkai h2,.bkai h3{font-size:1.05em;margin:.8em 0 .3em}'+
  '.bkrd ::selection{background:'+hexA(T.accent,.3)+'}'+
  '.bkrange{-webkit-appearance:none;appearance:none;height:22px;background:transparent;margin:0}'+
  '.bkrange::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,'+T.fg+' var(--bkp),'+T.hair+' var(--bkp))}'+
  '.bkrange::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:'+T.bg+';border:.5px solid rgba(0,0,0,.08);box-shadow:0 2px 8px rgba(0,0,0,.3);margin-top:-8px}'+
  '.bkrange::-moz-range-track{height:4px;border-radius:2px;background:'+T.hair+'}.bkrange::-moz-range-progress{height:4px;background:'+T.fg+'}';
}
function ContentsPanel({T,book,toc,pos,isPdf,nPages,chTitle,onGo,onClose,onDelBm,onHl}){
  const [tab,setTab]=useState('toc');
  const listRef=useRef(null);
  const curIdx=useMemo(()=>{if(!pos)return-1;let k=-1;toc.forEach((e,i)=>{if(e.ch<=pos.ch)k=i});return k},[toc,pos]);
  useEffect(()=>{if(tab==='toc'&&listRef.current){const el=listRef.current.querySelector('[data-cur="1"]');if(el)el.scrollIntoView({block:'center'})}},[tab]);
  const bms=book.bookmarks||[],hls=[...(book.highlights||[])].sort((a,b)=>a.ch-b.ch||a.start-b.start);
  const tabs=[['toc','Contents'],['bm','Bookmarks · '+bms.length],['hl','Highlights · '+hls.length]].filter(([k])=>!(isPdf&&k==='hl'));
  const empty=t=>h('div',{style:{padding:'36px 24px',textAlign:'center',color:T.sub,fontSize:14,lineHeight:1.5}},t);
  return h(Sheet,{T,onClose,title:null,z:60,maxH:'90%'},
    h('div',{style:{display:'flex',gap:4,margin:'8px 16px 6px',background:T.card,borderRadius:11,padding:3}},
      tabs.map(([k,l])=>h('button',{key:k,onClick:()=>setTab(k),style:{flex:1,padding:'7px 4px',borderRadius:8,fontSize:12.5,fontWeight:650,background:tab===k?T.bg:'transparent',color:tab===k?T.fg:T.sub,boxShadow:tab===k?'0 1px 3px rgba(0,0,0,.12)':'none'}},l))),
    h('div',{ref:listRef,style:{minHeight:200}},
      tab==='toc'?(toc.length?toc.map((e,i)=>h('button',{key:i,'data-cur':i===curIdx?'1':'0',onClick:()=>onGo(e.ch,0,e.id),className:'act98',
          style:{display:'flex',alignItems:'center',gap:10,width:'100%',textAlign:'left',padding:'12px 18px 12px '+(18+e.level*16)+'px',borderBottom:'1px solid '+T.hair,color:i===curIdx?T.accent:T.fg,fontWeight:i===curIdx?650:e.level?400:500,fontSize:e.level?14:15}},
          h('span',{style:{flex:1,minWidth:0}},e.title),isPdf?h('span',{style:{fontSize:12,color:T.sub}},e.ch+1):null))
        :isPdf?Array.from({length:Math.min(nPages,400)},(_,i)=>h('button',{key:i,'data-cur':pos&&pos.ch===i?'1':'0',onClick:()=>onGo(i,0),className:'act98',style:{display:'block',width:'100%',textAlign:'left',padding:'11px 18px',borderBottom:'1px solid '+T.hair,color:pos&&pos.ch===i?T.accent:T.fg}},'Page '+(i+1))):empty('This book has no table of contents.')):null,
      tab==='bm'?(bms.length?bms.map(b=>h('div',{key:b.id,style:{display:'flex',alignItems:'center',borderBottom:'1px solid '+T.hair}},
          h('button',{onClick:()=>onGo(b.ch,b.frac),className:'act98',style:{flex:1,minWidth:0,textAlign:'left',padding:'12px 4px 12px 18px',color:T.fg}},
            h('div',{style:{fontSize:12,color:T.sub}},chTitle(b.ch)+' · '+pct(b.g)),
            h('div',{style:{fontSize:14.5,marginTop:3,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},b.snip?'“'+b.snip+'…”':'Bookmark')),
          h('button',{onClick:()=>onDelBm(b.id),'aria-label':'Delete bookmark',className:'act90',style:{padding:'12px 16px',color:T.sub,display:'flex'}},Icons.trash(17))))
        :empty('Tap the ribbon at the top to bookmark a page.')):null,
      tab==='hl'?(hls.length?hls.map(x=>h('button',{key:x.id,onClick:()=>onHl(x.id),className:'act98',style:{display:'block',width:'100%',textAlign:'left',padding:'12px 18px',borderBottom:'1px solid '+T.hair,color:T.fg}},
          h('div',{style:{fontSize:12,color:T.sub}},chTitle(x.ch)),
          h('div',{style:{fontSize:14.5,lineHeight:1.45,marginTop:4,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},h('span',{style:{background:hlBg(x.color),borderRadius:2}},x.text)),
          x.note?h('div',{style:{fontSize:13,color:T.meta,marginTop:6,display:'flex',gap:6}},Icons.note(14),x.note):null))
        :empty('Select text while reading to highlight it or add a note.')):null));
}
function HlPanel({T,book,id,edit,onClose,onGo,chTitle}){
  const hl=(book.highlights||[]).find(x=>x.id===id);
  const [note,setNote]=useState(hl?hl.note||'':'');
  if(!hl)return null;
  const save=p=>Store.patch(book.id,b=>({highlights:(b.highlights||[]).map(x=>x.id===id?{...x,...p}:x)}));
  return h(Sheet,{T,onClose:()=>{if(note!==(hl.note||''))save({note});onClose()},title:'Highlight',z:62},
    h('div',{style:{padding:'4px 18px 16px'}},
      h('div',{style:{fontSize:12,color:T.sub,marginBottom:6}},chTitle(hl.ch)),
      h('div',{style:{fontSize:15,lineHeight:1.5,fontFamily:"'Lora',Georgia,serif"}},h('span',{style:{background:hlBg(hl.color),borderRadius:2}},hl.text)),
      h('div',{style:{display:'flex',gap:10,margin:'16px 0 12px'}},
        HL_COLORS.map(([k,,dot])=>h('button',{key:k,onClick:()=>save({color:k}),'aria-label':'Colour',className:'act90',style:{width:30,height:30,borderRadius:15,background:dot,boxShadow:hl.color===k?'0 0 0 2.5px '+T.bg+', 0 0 0 4.5px '+dot:'none'}}))),
      h('textarea',{value:note,autoFocus:!!edit,onChange:e=>setNote(e.target.value),placeholder:'Add a note…',rows:3,
        style:{width:'100%',boxSizing:'border-box',border:'1px solid '+T.hair,borderRadius:12,padding:'10px 12px',background:T.card,color:T.fg,fontSize:15,fontFamily:UIF,resize:'vertical'}}),
      h('div',{style:{display:'flex',gap:10,marginTop:12}},
        h('button',{onClick:()=>{save({note});onClose()},className:'act95',style:{flex:1,padding:'12px',borderRadius:12,background:T.fg,color:T.bg,fontWeight:650,fontSize:15}},'Save'),
        h('button',{onClick:()=>{navigator.clipboard&&navigator.clipboard.writeText(hl.text+(note?'\n\n'+note:'')).catch(()=>{});},className:'act95',style:{padding:'12px 16px',borderRadius:12,background:T.card,color:T.fg,display:'flex'}},Icons.copy(18)),
        h('button',{onClick:()=>{Store.patch(book.id,b=>({highlights:(b.highlights||[]).filter(x=>x.id!==id)}));onClose()},className:'act95',style:{padding:'12px 16px',borderRadius:12,background:T.card,color:T.danger,display:'flex'}},Icons.trash(18)))));
}
function AaPanel({T,prefs,setPrefs,isPdf,onClose}){
  const seg=(opts,val,on)=>h('div',{style:{display:'flex',gap:4,background:T.card,borderRadius:11,padding:3}},
    opts.map(([v,l])=>h('button',{key:String(v),onClick:()=>on(v),className:'act95',style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 4px',borderRadius:8,fontSize:13,fontWeight:650,
      background:val===v?T.bg:'transparent',color:val===v?T.fg:T.sub,boxShadow:val===v?'0 1px 3px rgba(0,0,0,.12)':'none'}},l)));
  const lab=t=>h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,margin:'16px 0 8px'}},t);
  const step=(d)=>setPrefs({size:Math.max(13,Math.min(32,prefs.size+d))});
  return h(Sheet,{T,onClose,title:'Text & layout',z:60,maxH:'80%'},
    h('div',{style:{padding:'0 18px 18px'}},
      lab('Page turning'),
      seg([['paged',h(Fragment,null,BI.pages(17),'Swipe pages')],['scroll',h(Fragment,null,BI.scroll(17),'Scroll')]],prefs.mode,v=>setPrefs({mode:v})),
      lab('Theme'),
      h('div',{style:{display:'flex',gap:12}},[['app','App']].concat(Object.values(THEMES).map(t=>[t.id,t.label])).map(([id,l])=>{
        const th=id==='app'?null:THEMES[id];const on=prefs.theme===id;
        return h('button',{key:id,onClick:()=>setPrefs({theme:id}),className:'act90',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:5,flex:1}},
          h('span',{style:{width:40,height:40,borderRadius:20,background:th?th.bg:'linear-gradient(135deg,#fff 50%,#1c1c1e 50%)',color:th?th.fg:'#888',border:on?'2.5px solid '+T.accent:'1px solid '+T.hair,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,fontFamily:'Georgia,serif'}},th?'Aa':''),
          h('span',{style:{fontSize:11,color:on?T.fg:T.sub,fontWeight:on?650:500}},l))})),
      isPdf?h(Fragment,null,
        lab('Zoom (scroll mode)'),
        seg([[1,'Fit'],[1.25,'125%'],[1.5,'150%'],[2,'200%']],prefs.pdfZoom,v=>setPrefs({pdfZoom:v,mode:'scroll'}))):
      h(Fragment,null,
        lab('Text size'),
        h('div',{style:{display:'flex',alignItems:'center',gap:10}},
          h('button',{onClick:()=>step(-1),className:'act90',style:{width:48,height:40,borderRadius:11,background:T.card,color:T.fg,fontSize:14,fontWeight:700}},'A−'),
          h('div',{style:{flex:1,textAlign:'center',fontSize:14,fontWeight:650}},prefs.size+' pt'),
          h('button',{onClick:()=>step(1),className:'act90',style:{width:48,height:40,borderRadius:11,background:T.card,color:T.fg,fontSize:18,fontWeight:700}},'A+')),
        lab('Font'),
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',paddingBottom:2}},FONTS.map(f=>h('button',{key:f.id,onClick:()=>setPrefs({font:f.id}),className:'act95',
          style:{flexShrink:0,padding:'8px 13px',borderRadius:10,fontFamily:f.css,fontSize:14.5,background:prefs.font===f.id?T.fg:T.card,color:prefs.font===f.id?T.bg:T.fg}},f.label))),
        lab('Line spacing'),
        seg([[1.4,'Tight'],[1.6,'Normal'],[1.85,'Loose']],prefs.line,v=>setPrefs({line:v})),
        lab('Margins'),
        seg([[12,'Narrow'],[22,'Normal'],[34,'Wide']],prefs.margin,v=>setPrefs({margin:v})),
        lab('Alignment'),
        seg([['justify','Justified'],['left','Left']],prefs.align,v=>setPrefs({align:v})))));
}

window.InstaBooks={isBookFile,importFiles,BooksLibrary,BookReader,ACCEPT,useBooks,Store,openPdf,loadPdfJs};
})();
