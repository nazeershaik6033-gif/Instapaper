/* Instapaper — Scan text (OCR) + your personal knowledge base
   - Read text from camera photos, the photo library (several pages at once), scanned PDFs and
     images already in Photos. On-device OCR (Tesseract, works offline once its language files
     are downloaded) with an optional "Enhance with AI" pass that re-reads a page with your AI's vision.
   - Save the result as an article: tags, a folder, the page images (Photos → "Scans" album) and an
     optional template (Study notes, Receipt, Meeting notes, Clipping or your own) whose fields
     AI can fill in.
   - Scans & Docs hub: search + filter by template / tag, related items, Ask AI across your docs
     (answers cite their sources), and Markdown export (one file, or everything as a .zip).
   Loaded before app.js; app.js globals (h, Icons, Sheet, aiChat, mdToHtml, htmlToMd…) are used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef,useMemo,useCallback}=React;

/* ============================== OCR engines ============================== */
const TESS_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const OCR_LANGS=[['eng','English'],['tel','Telugu'],['hin','Hindi'],['tam','Tamil'],['kan','Kannada'],['mal','Malayalam'],['mar','Marathi'],['ben','Bengali'],['guj','Gujarati'],['urd','Urdu'],['ara','Arabic'],['fra','French'],['deu','German'],['spa','Spanish']];
let _tess=null;
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(_tess)return _tess;
  _tess=new Promise((res,rej)=>{const s=document.createElement('script');s.src=TESS_URL;s.crossOrigin='anonymous';
    s.onload=()=>window.Tesseract?res(window.Tesseract):rej(new Error('Text recognition failed to load'));
    s.onerror=()=>{_tess=null;rej(new Error('Connect to the internet once to set up text recognition'))};document.head.appendChild(s)});
  return _tess;
}
let _worker=null,_workerLangs='',_onLog=null;
async function getWorker(langs){
  const key=langs.join('+');
  if(_worker&&_workerLangs===key)return _worker;
  const T=await loadTesseract();
  if(_worker){try{await _worker.terminate()}catch(e){}_worker=null}
  _worker=await T.createWorker(langs,1,{logger:m=>{if(_onLog)try{_onLog(m)}catch(e){}}});
  _workerLangs=key;return _worker;
}
/* normalise OCR output: join wrapped lines into paragraphs, re-join hyphenated words */
function cleanOcr(t){
  return String(t||'').replace(/\r/g,'').replace(/([A-Za-z])-\n([a-z])/g,'$1$2')
    .split(/\n\s*\n/).map(p=>p.replace(/\s*\n\s*/g,' ').replace(/[ \t]{2,}/g,' ').trim()).filter(Boolean).join('\n\n');
}
async function ocrCanvas(canvas,langs,onProgress){
  const w=await getWorker(langs);
  _onLog=m=>{if(m&&m.status==='recognizing text'&&onProgress)onProgress(m.progress||0)};
  try{const {data}=await w.recognize(canvas);return{text:cleanOcr(data.text),conf:Math.round(data.confidence||0)}}
  finally{_onLog=null}
}
/* image / file → canvas (EXIF-rotated, capped so OCR stays fast and memory-safe on phones) */
async function blobToCanvas(blob,maxSide){
  maxSide=maxSide||2200;
  let bmp=null;try{bmp=await createImageBitmap(blob,{imageOrientation:'from-image'})}catch(e){}
  if(!bmp){const url=URL.createObjectURL(blob);try{bmp=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Couldn’t read this image'));i.src=url})}finally{setTimeout(()=>URL.revokeObjectURL(url),2000)}}
  const W=bmp.width||bmp.naturalWidth,H=bmp.height||bmp.naturalHeight;const k=Math.min(1,maxSide/Math.max(W,H));
  const c=document.createElement('canvas');c.width=Math.round(W*k);c.height=Math.round(H*k);
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(bmp,0,0,c.width,c.height);
  return c;
}
async function pdfToCanvases(blob,onPage,maxPages){
  const B=window.InstaBooks;if(!B||!B.openPdf)throw new Error('PDF support isn’t loaded');
  const doc=await B.openPdf(blob);const n=Math.min(doc.numPages,maxPages||60);const out=[];
  for(let i=1;i<=n;i++){const pg=await doc.getPage(i);const v0=pg.getViewport({scale:1});const sc=Math.min(2.4,2000/Math.max(v0.width,v0.height));
    const v=pg.getViewport({scale:sc});const c=document.createElement('canvas');c.width=Math.round(v.width);c.height=Math.round(v.height);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:x,viewport:v}).promise;out.push(c);onPage&&onPage(i,n)}
  try{doc.destroy()}catch(e){}
  return out;
}
function thumbOf(canvas,w,q){const k=(w||220)/canvas.width;const c=document.createElement('canvas');c.width=Math.round(canvas.width*k);c.height=Math.round(canvas.height*k);
  c.getContext('2d').drawImage(canvas,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q||.7)}
const canvasBlob=(c,q)=>new Promise(res=>c.toBlob(b=>res(b),'image/jpeg',q||.85));

/* ---------- AI: vision transcription, field extraction ---------- */
const aiOk=S=>!!S&&typeof aiReady==='function'&&aiReady(S)&&S.aiProvider!=='claude';
async function aiTranscribe(S,canvas,onWait){
  const k=Math.min(1,1600/Math.max(canvas.width,canvas.height));let c=canvas;
  if(k<1){c=document.createElement('canvas');c.width=Math.round(canvas.width*k);c.height=Math.round(canvas.height*k);c.getContext('2d').drawImage(canvas,0,0,c.width,c.height)}
  const data=c.toDataURL('image/jpeg',.85).split(',')[1];
  const out=await aiChat(S,[{role:'system',content:'You are a meticulous OCR engine.'},
    {role:'user',content:[{type:'text',text:'Transcribe ALL the text in this image exactly, in natural reading order (respect columns). Use Markdown for headings, lists and tables. Keep the original language and spelling. Output only the transcription — no commentary.'},
      {type:'image',mime:'image/jpeg',data}]}],4000,onWait);
  return String(out||'').replace(/^```(?:markdown|md)?\s*/i,'').replace(/```\s*$/,'').trim();
}
async function aiFillFields(S,text,fields,onWait){
  const out=await aiChat(S,[{role:'system',content:'You extract structured data from documents. Reply with JSON only.'},
    {role:'user',content:'Extract these fields from the document below. Reply with ONLY a JSON object with exactly these keys: '+JSON.stringify(fields)+'. Use "" when a field is not present. Keep values short; use "; " to separate multiple items.\n\nDOCUMENT:\n'+String(text).slice(0,14000)}],1200,onWait);
  const m=/\{[\s\S]*\}/.exec(String(out||''));if(!m)throw new Error('The AI didn’t return fields — try again');
  const j=JSON.parse(m[0]);const r={};fields.forEach(f=>{const v=j[f];r[f]=Array.isArray(v)?v.join('; '):v==null?'':String(v)});return r;
}

/* ============================== templates ============================== */
const BUILTIN_TEMPLATES=[
  {id:'study',name:'Study notes',icon:'📘',fields:['Topic','Summary','Key terms','Questions to review']},
  {id:'receipt',name:'Receipt',icon:'🧾',fields:['Date','Vendor','Total','Category','Items']},
  {id:'meeting',name:'Meeting notes',icon:'🗓️',fields:['Date','Attendees','Decisions','Action items']},
  {id:'clipping',name:'Clipping',icon:'📰',fields:['Headline','Publication','Date','Key points']}
];
const TPL_KEY='insta_ocr_templates_v1';
function customTemplates(){try{return JSON.parse(localStorage.getItem(TPL_KEY))||[]}catch(e){return[]}}
function saveCustomTemplates(l){try{localStorage.setItem(TPL_KEY,JSON.stringify(l))}catch(e){}}
function allTemplates(){return BUILTIN_TEMPLATES.concat(customTemplates())}
const tplById=id=>allTemplates().find(t=>t.id===id)||null;

/* ============================== knowledge base helpers ============================== */
const isScan=a=>!!(a&&(a.scan||a.source==='Scan'));
const STOP=new Set('the a an and or of to in on for is are was were be been with as at by from that this it its into about what which who whom how why when where do does did my your our their i you we they he she them his her not no yes can could should would will just than then so if any all some more most other such only own same too very also there here have has had'.split(' '));
const stem=w=>w.length>5?w.replace(/(ies|es|s|ing|ed|ly)$/,''):w.length>4?w.replace(/s$/,''):w; /* banks→bank, rates→rate, raising→rais */
const terms=s=>(String(s||'').toLowerCase().match(/[\p{L}\p{M}\p{N}]{2,}/gu)||[]).filter(w=>!STOP.has(w)&&w.length>2).map(stem);
function chunkText(t,size){const out=[];const paras=String(t||'').split(/\n\s*\n/);let cur='';
  for(const p of paras){if(cur&&cur.length+p.length>size){out.push(cur);cur=''}cur+=(cur?'\n\n':'')+p;while(cur.length>size*1.6){out.push(cur.slice(0,size));cur=cur.slice(size)}}
  if(cur.trim())out.push(cur);return out}
/* tiny BM25-ish retrieval over article chunks */
function searchDocs(articles,q,k){
  const qt=[...new Set(terms(q))];if(!qt.length)return[];
  const chunks=[];articles.forEach(a=>chunkText(a.text||'',1100).forEach((c,i)=>chunks.push({a,i,c,tl:c.toLowerCase(),title:(a.title||'').toLowerCase()})));
  const N=chunks.length||1;const df={};qt.forEach(t=>{df[t]=chunks.reduce((n,ch)=>n+(ch.tl.includes(t)?1:0),0)});
  const scored=chunks.map(ch=>{let s=0;for(const t of qt){if(!df[t])continue;let tf=0,i=ch.tl.indexOf(t);while(i>=0&&tf<20){tf++;i=ch.tl.indexOf(t,i+t.length)}
      if(tf)s+=Math.log(1+N/df[t])*(tf*2.2)/(tf+1.2);if(ch.title.includes(t))s+=1.5}
    return{...ch,s}}).filter(x=>x.s>0).sort((x,y)=>y.s-x.s);
  const out=[],perDoc={};for(const x of scored){perDoc[x.a.id]=(perDoc[x.a.id]||0)+1;if(perDoc[x.a.id]>3)continue;out.push(x);if(out.length>=(k||8))break}
  return out;
}
function relatedTo(a,articles,n){
  const tags=new Set((a.tags||[]).filter(t=>t!=='scan'));const mine=terms((a.title||'')+' '+String(a.text||'').slice(0,3000));
  const freq={};mine.forEach(t=>{freq[t]=(freq[t]||0)+1});const top=Object.entries(freq).sort((x,y)=>y[1]-x[1]).slice(0,14).map(x=>x[0]);
  return articles.filter(b=>b.id!==a.id&&!b.isVideo).map(b=>{const bt=(b.title+' '+String(b.text||'').slice(0,4000)).toLowerCase();
      let s=(b.tags||[]).filter(t=>tags.has(t)).length*3;top.forEach(t=>{if(bt.includes(t))s+=1});if(a.template&&b.template===a.template)s+=2;return{b,s}})
    .filter(x=>x.s>=3).sort((x,y)=>y.s-x.s).slice(0,n||5).map(x=>x.b);
}

/* ============================== Markdown export ============================== */
const yq=v=>'"'+String(v==null?'':v).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,' ')+'"';
function articleToMd(a){
  const t=a.template?tplById(a.template):null;
  const fm=['---','title: '+yq(a.title||'Untitled')];
  if(a.source)fm.push('source: '+yq(a.source));if(a.url)fm.push('url: '+yq(a.url));if(a.author)fm.push('author: '+yq(a.author));
  fm.push('saved: '+new Date(a.addedAt||Date.now()).toISOString().slice(0,10));
  if((a.tags||[]).length)fm.push('tags: ['+a.tags.map(yq).join(', ')+']');
  if(t)fm.push('template: '+yq(t.name));
  if(a.fields&&Object.keys(a.fields).length){fm.push('fields:');Object.entries(a.fields).forEach(([k,v])=>fm.push('  '+yq(k)+': '+yq(v)))}
  if(a.scan)fm.push('scan: {pages: '+(a.scan.pages||1)+', engine: '+yq(a.scan.engine||'')+'}');
  fm.push('---','');
  let body='';try{body=a.html&&typeof htmlToMd==='function'?htmlToMd(a.html):''}catch(e){}
  if(!body)body=a.text||'';
  const fieldsMd=a.fields&&Object.keys(a.fields).length?Object.entries(a.fields).filter(([,v])=>v).map(([k,v])=>'- **'+k+':** '+v).join('\n')+'\n\n':'';
  return fm.join('\n')+'# '+(a.title||'Untitled')+'\n\n'+fieldsMd+body.trim()+'\n';
}
const slug=s=>String(s||'untitled').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'untitled';
let _crcT=null;
function crc32(u){if(!_crcT){_crcT=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;_crcT[n]=c>>>0}}
  let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=_crcT[(c^u[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
/* store-only zip (Markdown is tiny; no compressor needed) */
function makeZip(files){
  const enc=new TextEncoder();const parts=[],cent=[];let off=0;const d=new Date();
  const time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const f of files){const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);
    lh.setUint16(10,time,true);lh.setUint16(12,date,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);
    parts.push(lh,name,data);
    const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(12,time,true);ch.setUint16(14,date,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,off,true);cent.push(ch,name);
    off+=30+name.length+data.length}
  const csize=cent.reduce((s,x)=>s+(x.byteLength||x.length),0);
  const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,csize,true);e.setUint32(16,off,true);
  return new Blob([...parts,...cent,e],{type:'application/zip'});
}
async function shareOrSave(blob,name){
  try{const f=new File([blob],name,{type:blob.type||'application/octet-stream'});
    if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}
  const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);
}
const exportOne=a=>shareOrSave(new Blob([articleToMd(a)],{type:'text/markdown'}),slug(a.title)+'.md');
function exportMany(list,name){
  const used={};const files=list.map(a=>{let n=slug(a.title);used[n]=(used[n]||0)+1;if(used[n]>1)n+='-'+used[n];return{name:n+'.md',data:articleToMd(a)}});
  const d=new Date().toISOString().slice(0,10);
  return shareOrSave(makeZip(files),(name||'instapaper-docs')+'-'+d+'.zip');
}

/* ============================== small UI bits ============================== */
const lab=(T,t)=>h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,margin:'16px 0 8px'}},t);
const chip=(T,on,label,onClick,key)=>h('button',{key:key||label,onClick,className:'act95',style:{flexShrink:0,padding:'7px 13px',borderRadius:999,fontSize:13,fontWeight:600,
  background:on?T.fg:'transparent',color:on?T.bg:T.fg,border:'1px solid '+(on?T.fg:T.hair)}},label);
const pill=(T,label,onClick,primary,disabled,icon)=>h('button',{onClick,disabled,className:'act95',style:{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,padding:'12px 16px',borderRadius:14,
  background:primary?T.fg:T.card,color:primary?T.bg:T.fg,fontSize:14.5,fontWeight:650,opacity:disabled?.45:1,flexShrink:0}},icon||null,label);
const field=(T,props)=>h('input',Object.assign({style:{width:'100%',boxSizing:'border-box',padding:'11px 13px',borderRadius:12,border:'1px solid '+T.hair,background:T.card,color:T.fg,fontSize:16,outline:'none'}},props));
function Screen({T,title,onBack,right,children,z}){
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:z||92,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{style:{display:'flex',alignItems:'center',gap:4,padding:'calc(6px + env(safe-area-inset-top)) 8px 6px',flexShrink:0,borderBottom:'0.5px solid '+T.hair}},
      h('button',{onClick:onBack,'aria-label':'Back',className:'act90',style:{width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',color:T.fg}},Icons.back(23)),
      h('div',{style:{flex:1,minWidth:0,fontSize:17,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},title),right||null),
    h('div',{className:'sy',style:{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch'}},children));
}
const ScanIcon=s=>Svg({size:s},P('M4 8V6.2C4 5 5 4 6.2 4H8M16 4h1.8C19 4 20 5 20 6.2V8M20 16v1.8c0 1.2-1 2.2-2.2 2.2H16M8 20H6.2C5 20 4 19 4 17.8V16'),P('M8 9.5h8M8 12.5h8M8 15.5h5'));

/* ============================== the scan flow ============================== */
const LANG_KEY='insta_ocr_langs';
function OcrFlow({T,S,folders,initial,onClose,onSave,toastFn}){
  const [pages,setPages]=useState([]); /* {id,canvas,thumb,text,conf,engine,status,prog} */
  const [langs,setLangsS]=useState(()=>{try{return JSON.parse(localStorage.getItem(LANG_KEY))||['eng']}catch(e){return['eng']}});
  const setLangs=l=>{const v=l.length?l:['eng'];setLangsS(v);try{localStorage.setItem(LANG_KEY,JSON.stringify(v))}catch(e){}};
  const [step,setStep]=useState('pages');const [busy,setBusy]=useState('');const [err,setErr]=useState('');
  const [title,setTitle]=useState('');const [tags,setTags]=useState('');const [folderId,setFolderId]=useState(null);
  const [tpl,setTpl]=useState(null);const [fields,setFields]=useState({});const [keepImgs,setKeepImgs]=useState(true);
  const [moreLangs,setMoreLangs]=useState(false);
  const camRef=useRef(null),libRef=useRef(null),pdfRef=useRef(null);
  const addFiles=async files=>{
    const list=Array.from(files||[]);if(!list.length)return;setErr('');
    for(const f of list){
      try{
        if(/pdf$/i.test(f.type)||/\.pdf$/i.test(f.name||'')){setBusy('Opening PDF…');
          const cs=await pdfToCanvases(f,(i,n)=>setBusy('Rendering page '+i+' of '+n+'…'));
          setPages(p=>p.concat(cs.map(c=>({id:Math.random().toString(36).slice(2),canvas:c,thumb:thumbOf(c),text:'',conf:null,status:'new'}))))}
        else{setBusy('Preparing image…');const c=await blobToCanvas(f);setPages(p=>p.concat([{id:Math.random().toString(36).slice(2),canvas:c,thumb:thumbOf(c),text:'',conf:null,status:'new'}]))}
      }catch(e){setErr((f.name?f.name+': ':'')+((e&&e.message)||'Couldn’t read this file'))}
    }
    setBusy('');
  };
  useEffect(()=>{if(initial&&initial.files&&initial.files.length)addFiles(initial.files)},[]);
  const move=(i,d)=>setPages(p=>{const a=p.slice();const j=i+d;if(j<0||j>=a.length)return p;[a[i],a[j]]=[a[j],a[i]];return a});
  const recognize=async()=>{
    if(!pages.length)return;setStep('run');setErr('');
    try{
      setBusy('Loading text recognition ('+langs.map(l=>(OCR_LANGS.find(x=>x[0]===l)||[l,l])[1]).join(' + ')+')…');
      await getWorker(langs);
      for(let i=0;i<pages.length;i++){
        setBusy('Reading page '+(i+1)+' of '+pages.length+'…');
        setPages(p=>p.map((x,k)=>k===i?{...x,status:'run',prog:0}:x));
        const r=await ocrCanvas(pages[i].canvas,langs,pr=>setPages(p=>p.map((x,k)=>k===i?{...x,prog:pr}:x)));
        setPages(p=>p.map((x,k)=>k===i?{...x,text:r.text,conf:r.conf,engine:'tesseract',status:'done'}:x));
      }
      setStep('review');
    }catch(e){setErr((e&&e.message)||'Text recognition failed');setStep('pages')}
    setBusy('');
  };
  useEffect(()=>{if(step==='review'&&!title){const first=(pages.map(p=>p.text).join('\n').split('\n').find(l=>l.trim().length>3)||'Scan').trim();setTitle(first.length>70?first.slice(0,70)+'…':first)}},[step]);
  const enhance=async idx=>{
    if(!aiOk(S)){toastFn&&toastFn(S&&S.aiProvider==='claude'?'The Claude app can’t read images here — pick Gemini or OpenRouter in Settings → AI':'Turn on AI in Settings → AI Assistant first');return}
    const ids=idx==null?pages.map((_,i)=>i):[idx];
    for(const i of ids){
      setPages(p=>p.map((x,k)=>k===i?{...x,status:'ai'}:x));
      try{const t=await aiTranscribe(S,pages[i].canvas,w=>setBusy(String(w||'')));setPages(p=>p.map((x,k)=>k===i?{...x,text:t,engine:'ai',conf:null,status:'done'}:x))}
      catch(e){setPages(p=>p.map((x,k)=>k===i?{...x,status:'done'}:x));toastFn&&toastFn((e&&e.message)||'AI couldn’t read this page');break}
    }
    setBusy('');
  };
  const fullText=pages.map(p=>p.text).filter(Boolean).join('\n\n');
  const fillAi=async()=>{if(!tpl)return;if(!(typeof aiReady==='function'&&aiReady(S))||S.aiProvider==='claude'){toastFn&&toastFn('Fill fields with AI needs Gemini or OpenRouter in Settings → AI');return}
    setBusy('Filling fields…');try{setFields(await aiFillFields(S,fullText,tpl.fields,w=>setBusy(String(w||''))))}catch(e){toastFn&&toastFn((e&&e.message)||'Couldn’t fill the fields')}setBusy('')};
  const save=async()=>{
    const text=fullText.trim();if(!text){toastFn&&toastFn('No text to save yet');return}
    setBusy('Saving…');
    const html=typeof mdToHtml==='function'?mdToHtml(text):'<p>'+text.replace(/\n\n/g,'</p><p>')+'</p>';
    const plain=typeof htmlToText==='function'?htmlToText(html):text;
    const words=typeof countWords==='function'?countWords(plain):plain.split(/\s+/).length;
    const engines=[...new Set(pages.map(p=>p.engine).filter(Boolean))];
    const confs=pages.map(p=>p.conf).filter(x=>x!=null);
    const tagList=['scan'].concat(tags.split(',').map(t=>t.trim().toLowerCase().replace(/^#/,'')).filter(Boolean));
    const fl=tpl?Object.fromEntries(tpl.fields.map(f=>[f,(fields[f]||'').trim()])):null;
    const a={id:(typeof uid==='function'?uid():Date.now().toString(36)),url:'',title:title.trim()||'Scan',source:'Scan',author:'',image:pages[0]?thumbOf(pages[0].canvas,180,.62):'',html,text:plain,
      excerpt:plain.slice(0,220),words,readMin:typeof readMinutes==='function'?readMinutes(words):Math.max(1,Math.round(words/230)),isVideo:false,videoId:null,publishedAt:Date.now(),addedAt:Date.now(),
      liked:false,archived:false,folderId,tags:[...new Set(tagList)],progress:0,opens:0,highlights:[],
      scan:{pages:pages.length,engine:engines.join('+')||'tesseract',langs,conf:confs.length?Math.round(confs.reduce((s,x)=>s+x,0)/confs.length):null},
      template:tpl?tpl.id:null,fields:fl};
    const blobs=keepImgs?await Promise.all(pages.map(p=>canvasBlob(p.canvas))):[];
    try{await onSave(a,blobs.filter(Boolean))}catch(e){setBusy('');toastFn&&toastFn('Couldn’t save: '+((e&&e.message)||'error'));return}
    setBusy('');onClose(a.id);
  };
  const langName=l=>(OCR_LANGS.find(x=>x[0]===l)||[l,l])[1];
  const inputs=h(Fragment,null,
    h('input',{ref:camRef,type:'file',accept:'image/*',capture:'environment',style:{display:'none'},onChange:e=>{addFiles(e.target.files);e.target.value=''}}),
    h('input',{ref:libRef,type:'file',accept:'image/*',multiple:true,style:{display:'none'},onChange:e=>{addFiles(e.target.files);e.target.value=''}}),
    h('input',{ref:pdfRef,type:'file',accept:'application/pdf,.pdf,image/*',multiple:true,style:{display:'none'},onChange:e=>{addFiles(e.target.files);e.target.value=''}}));
  const srcBtns=h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}},
    [[Icons.camera(24),'Camera',()=>camRef.current.click()],[Icons.image(24),'Photos',()=>libRef.current.click()],[Icons.file(24),'PDF / files',()=>pdfRef.current.click()]].map(([ic,l,fn])=>
      h('button',{key:l,onClick:fn,className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7,padding:'16px 6px',borderRadius:16,background:T.card,color:T.fg,fontSize:13,fontWeight:600}},ic,l)));
  const busyBar=busy?h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:14,background:T.card,margin:'12px 0',fontSize:13.5}},h(Spinner,{T,size:16}),h('span',{style:{flex:1}},busy)):null;
  const errBar=err?h('div',{style:{padding:'10px 14px',borderRadius:12,background:hexA(T.danger,.1),color:T.danger,fontSize:13.5,margin:'12px 0'}},err):null;
  if(step==='review'){
    const tpls=allTemplates();
    return h(Screen,{T,title:'Review text',onBack:()=>setStep('pages')},
      h('div',{style:{padding:'12px 16px calc(40px + env(safe-area-inset-bottom))'}},
        busyBar,
        lab(T,'Title'),field(T,{value:title,onChange:e=>setTitle(e.target.value),placeholder:'Title'}),
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'18px 0 8px'}},
          h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub}},'Text · '+pages.length+(pages.length>1?' pages':' page')),
          pages.length>1?h('button',{onClick:()=>enhance(null),className:'act95',style:{display:'flex',alignItems:'center',gap:5,fontSize:12.5,fontWeight:650,color:T.accent}},Icons.ai(14),'Enhance all with AI'):null),
        pages.map((p,i)=>h('div',{key:p.id,style:{display:'flex',gap:10,marginBottom:12,alignItems:'flex-start'}},
          h('div',{style:{width:54,flexShrink:0}},h('img',{src:p.thumb,alt:'',style:{width:'100%',borderRadius:6,display:'block',boxShadow:'0 1px 5px rgba(0,0,0,.2)'}}),
            h('div',{style:{fontSize:10.5,color:p.conf!=null&&p.conf<65?T.danger:T.sub,textAlign:'center',marginTop:4}},p.engine==='ai'?'AI':p.conf!=null?p.conf+'%':'')),
          h('div',{style:{flex:1,minWidth:0}},
            h('textarea',{value:p.text,onChange:e=>{const v=e.target.value;setPages(ps=>ps.map((x,k)=>k===i?{...x,text:v}:x))},rows:Math.min(12,Math.max(4,Math.ceil((p.text||'').length/40))),
              style:{width:'100%',boxSizing:'border-box',padding:'10px 12px',borderRadius:12,border:'1px solid '+T.hair,background:T.card,color:T.fg,fontSize:14.5,lineHeight:1.5,fontFamily:UIF,resize:'vertical'}}),
            h('button',{onClick:()=>enhance(i),disabled:p.status==='ai',className:'act95',style:{display:'inline-flex',alignItems:'center',gap:5,marginTop:6,fontSize:12.5,fontWeight:650,color:p.conf!=null&&p.conf<65?T.danger:T.accent}},
              p.status==='ai'?h(Spinner,{T,size:12}):Icons.ai(14),p.status==='ai'?'Reading with AI…':(p.conf!=null&&p.conf<65?'Low confidence — enhance with AI':'Enhance with AI'))))),
        lab(T,'Template'),
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',paddingBottom:2}},
          chip(T,!tpl,'None',()=>{setTpl(null);setFields({})},'none'),
          tpls.map(t=>chip(T,tpl&&tpl.id===t.id,(t.icon?t.icon+' ':'')+t.name,()=>{setTpl(t);setFields(f=>Object.fromEntries(t.fields.map(k=>[k,f[k]||''])))},t.id))),
        tpl?h('div',{style:{marginTop:12,padding:14,borderRadius:16,background:T.card}},
          tpl.fields.map(f=>h('div',{key:f,style:{marginBottom:10}},
            h('div',{style:{fontSize:12,color:T.sub,marginBottom:4,fontWeight:600}},f),
            h('input',{value:fields[f]||'',onChange:e=>{const v=e.target.value;setFields(x=>({...x,[f]:v}))},style:{width:'100%',boxSizing:'border-box',padding:'9px 11px',borderRadius:10,border:'1px solid '+T.hair,background:T.bg,color:T.fg,fontSize:15,outline:'none'}}))),
          h('button',{onClick:fillAi,className:'act95',style:{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:650,color:T.accent,marginTop:2}},Icons.ai(15),'Fill fields with AI')):null,
        lab(T,'Tags'),field(T,{value:tags,onChange:e=>setTags(e.target.value),placeholder:'e.g. economics, exam, receipts (comma-separated)',autoCapitalize:'none'}),
        (folders||[]).length?h(Fragment,null,lab(T,'Folder'),
          h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto'}},chip(T,!folderId,'Home',()=>setFolderId(null),'home'),folders.map(f=>chip(T,folderId===f.id,f.name,()=>setFolderId(f.id),f.id)))):null,
        h('label',{style:{display:'flex',alignItems:'center',gap:10,margin:'18px 0 6px',fontSize:14.5}},
          h('input',{type:'checkbox',checked:keepImgs,onChange:e=>setKeepImgs(e.target.checked),style:{width:20,height:20}}),'Keep page images in Photos → Scans'),
        h('div',{style:{display:'flex',gap:10,marginTop:18}},
          h('div',{style:{flex:1,display:'flex'}},pill(T,'Save as article',save,true,!!busy||!fullText.trim(),Icons.check(18))))));
  }
  return h(Screen,{T,title:'Scan text',onBack:()=>onClose(null)},
    inputs,
    h('div',{style:{padding:'14px 16px calc(40px + env(safe-area-inset-bottom))'}},
      !pages.length?h('div',{style:{textAlign:'center',padding:'10px 10px 18px'}},
        h('div',{style:{display:'inline-flex',width:58,height:58,borderRadius:18,background:T.card,alignItems:'center',justifyContent:'center',color:T.fg,marginBottom:10}},ScanIcon(30)),
        h('div',{style:{fontSize:20,fontWeight:750,letterSpacing:'-.01em'}},'Turn pages into text'),
        h('div',{style:{fontSize:13.5,color:T.sub,lineHeight:1.5,marginTop:6}},'Photograph book pages, notes or receipts, or pick photos and scanned PDFs. Add as many pages as you like — they become one article.')):null,
      srcBtns,
      busyBar,errBar,
      pages.length?h(Fragment,null,
        lab(T,pages.length+(pages.length>1?' pages — in this order':' page')),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12}},
          pages.map((p,i)=>h('div',{key:p.id,style:{position:'relative'}},
            h('img',{src:p.thumb,alt:'',style:{width:'100%',aspectRatio:'3/4',objectFit:'cover',borderRadius:10,display:'block',boxShadow:'0 2px 8px rgba(0,0,0,.18)',background:'#fff'}}),
            p.status==='run'||p.status==='done'?h('div',{style:{position:'absolute',left:6,right:6,bottom:6,height:4,borderRadius:2,background:'rgba(0,0,0,.25)',overflow:'hidden'}},
              h('div',{style:{height:'100%',width:((p.status==='done'?1:p.prog||0)*100)+'%',background:'#34c759',transition:'width 200ms'}})):null,
            h('span',{style:{position:'absolute',left:6,top:6,minWidth:20,height:20,borderRadius:10,background:'rgba(0,0,0,.6)',color:'#fff',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}},i+1),
            step==='pages'?h('div',{style:{position:'absolute',right:4,top:4,display:'flex',gap:3}},
              i>0?h('button',{onClick:()=>move(i,-1),'aria-label':'Move earlier',style:{width:24,height:24,borderRadius:12,background:'rgba(0,0,0,.55)',color:'#fff',fontSize:13,lineHeight:'24px'}},'‹'):null,
              i<pages.length-1?h('button',{onClick:()=>move(i,1),'aria-label':'Move later',style:{width:24,height:24,borderRadius:12,background:'rgba(0,0,0,.55)',color:'#fff',fontSize:13,lineHeight:'24px'}},'›'):null,
              h('button',{onClick:()=>setPages(ps=>ps.filter(x=>x.id!==p.id)),'aria-label':'Remove page',style:{width:24,height:24,borderRadius:12,background:'rgba(0,0,0,.55)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}},Icons.x(12))):null))),
        lab(T,'Language of the text'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:8}},
          OCR_LANGS.filter(([k],i)=>i<3||moreLangs||langs.includes(k)).map(([k,l])=>chip(T,langs.includes(k),l,()=>setLangs(langs.includes(k)?langs.filter(x=>x!==k):langs.concat(k)),k)),
          moreLangs?null:h('button',{onClick:()=>setMoreLangs(true),className:'act95',style:{padding:'7px 13px',borderRadius:999,fontSize:13,fontWeight:600,color:T.accent}},'More…')),
        h('div',{style:{fontSize:12,color:T.sub,lineHeight:1.5,marginTop:8}},'Recognition runs on your phone. The first time, each language downloads once (about 2–15 MB) and then works offline. Afterwards you can re-read any page with AI for photos, tables or handwriting.'),
        h('div',{style:{display:'flex',marginTop:18}},h('div',{style:{flex:1,display:'flex'}},pill(T,step==='run'?'Reading…':'Recognize text',recognize,true,step==='run'||!pages.length||!!busy&&step!=='run',ScanIcon(18))))):null));
}

/* ============================== Ask across my docs ============================== */
function AskDocs({T,S,articles,onOpen,onClose,toastFn}){
  const [scope,setScope]=useState('scans');const [q,setQ]=useState('');const [busy,setBusy]=useState('');const [res,setRes]=useState(null);
  const corpus=useMemo(()=>articles.filter(a=>!a.isVideo&&a.text&&(scope==='all'||isScan(a)||a.source==='My note')),[articles,scope]);
  const ready=typeof aiReady==='function'&&aiReady(S||{});const claude=S&&S.aiProvider==='claude';
  const ask=async()=>{
    const query=q.trim();if(!query)return;
    const hits=searchDocs(corpus,query,8);
    if(!hits.length){setRes({answer:'Nothing in '+(scope==='all'?'your library':'your scans and notes')+' mentions that yet.',hits:[]});return}
    const src=hits.map((x,i)=>'['+(i+1)+'] '+x.a.title+'\n'+x.c).join('\n\n---\n\n');
    const prompt='Answer my question using ONLY the sources below (my own saved documents). Cite sources inline like [1] or [2][3]. If the sources don’t contain the answer, say so plainly. Be concise.\n\nQUESTION: '+query+'\n\nSOURCES:\n'+src;
    if(claude){openInClaude(prompt,toastFn);return}
    if(!ready){setRes({answer:'Turn on AI in Settings → AI Assistant to get answers — meanwhile, here are the most relevant passages:',hits});return}
    setBusy('Reading your documents…');setRes(null);
    try{const out=await aiChat(S,[{role:'system',content:'You answer questions about the user’s personal documents, citing sources by number. Answer in '+((S&&S.aiLang)||'the language of the question')+'.'},{role:'user',content:prompt}],1400,w=>setBusy(String(w||'Thinking…')));
      setRes({answer:String(out||''),hits})}
    catch(e){setRes({answer:(e&&e.message)||'Something went wrong',hits,err:true})}
    setBusy('');
  };
  const md=t=>{try{return mdToHtml(t)}catch(e){return t}};
  return h(Sheet,{T,onClose,title:null,z:96,maxH:'92%'},
    h('div',{style:{padding:'6px 18px 0'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:10}},
        h('span',{style:{width:34,height:34,borderRadius:11,background:hexA(T.accent,.14),color:T.accent,display:'flex',alignItems:'center',justifyContent:'center'}},Icons.ai(19)),
        h('div',{style:{flex:1}},h('div',{style:{fontSize:17,fontWeight:700}},'Ask my docs'),h('div',{style:{fontSize:11.5,color:T.sub}},corpus.length+' documents · answers cite their sources')),
        h('button',{onClick:onClose,'aria-label':'Close',className:'act90',style:{display:'flex',color:T.sub,padding:6}},Icons.x(19))),
      h('div',{style:{display:'flex',gap:6,margin:'14px 0 10px'}},chip(T,scope==='scans','Scans & notes',()=>setScope('scans')),chip(T,scope==='all','Everything saved',()=>setScope('all'))),
      h('div',{style:{display:'flex',gap:8}},
        field(T,{value:q,onChange:e=>setQ(e.target.value),onKeyDown:e=>{if(e.key==='Enter')ask()},placeholder:'e.g. What did my notes say about inflation?',enterKeyHint:'send'}),
        h('button',{onClick:ask,disabled:!q.trim()||!!busy,'aria-label':'Ask',className:'act90',style:{width:44,height:44,borderRadius:22,background:q.trim()?T.fg:T.card,color:q.trim()?T.bg:T.sub,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},Icons.send(18))),
      busy?h('div',{style:{display:'flex',alignItems:'center',gap:9,color:T.sub,fontSize:13.5,padding:'16px 0'}},h(Spinner,{T,size:15}),busy):null,
      res?h('div',{style:{padding:'14px 0 4px'}},
        h('div',{className:'bkai',style:{fontSize:15,lineHeight:1.55,color:res.err?T.danger:T.fg},dangerouslySetInnerHTML:{__html:md(res.answer)}}),
        res.hits.length?h(Fragment,null,lab(T,'Sources'),
          res.hits.map((x,i)=>h('button',{key:i,onClick:()=>onOpen(x.a.id),className:'act98',style:{display:'flex',gap:10,width:'100%',textAlign:'left',padding:'10px 0',borderBottom:'0.5px solid '+T.hair,color:T.fg}},
            h('span',{style:{fontSize:12,fontWeight:750,color:T.accent,minWidth:22}},'['+(i+1)+']'),
            h('span',{style:{flex:1,minWidth:0}},h('span',{style:{display:'block',fontSize:14,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},x.a.title),
              h('span',{style:{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',fontSize:12.5,color:T.sub,marginTop:2}},x.c.slice(0,200)))))):null):null,
      h('div',{style:{height:'calc(16px + env(safe-area-inset-bottom))'}})));
}

/* ============================== templates manager ============================== */
function TemplatesSheet({T,onClose}){
  const [list,setList]=useState(customTemplates);const [name,setName]=useState('');const [flds,setFlds]=useState('');
  const add=()=>{const fs=flds.split(/[\n,]/).map(s=>s.trim()).filter(Boolean);if(!name.trim()||!fs.length)return;
    const t={id:'c'+Date.now().toString(36),name:name.trim(),icon:'🗂️',fields:fs};const l=list.concat(t);setList(l);saveCustomTemplates(l);setName('');setFlds('')};
  const del=id=>{const l=list.filter(t=>t.id!==id);setList(l);saveCustomTemplates(l)};
  const row=(t,custom)=>h('div',{key:t.id,style:{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'0.5px solid '+T.hair}},
    h('span',{style:{fontSize:20}},t.icon||'🗂️'),
    h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:15,fontWeight:650}},t.name),h('div',{style:{fontSize:12.5,color:T.sub,marginTop:2}},t.fields.join(' · '))),
    custom?h('button',{onClick:()=>del(t.id),'aria-label':'Delete template',className:'act90',style:{color:T.sub,display:'flex',padding:6}},Icons.trash(17)):null);
  return h(Sheet,{T,onClose,title:'Templates',z:96,maxH:'88%'},
    h('div',{style:{padding:'0 18px 18px'}},
      h('div',{style:{fontSize:13,color:T.sub,lineHeight:1.5}},'A template gives every scan the same fields, so you can filter, compare and export them later. AI can fill the fields from the text.'),
      BUILTIN_TEMPLATES.map(t=>row(t,false)),list.map(t=>row(t,true)),
      lab(T,'New template'),
      field(T,{value:name,onChange:e=>setName(e.target.value),placeholder:'Name, e.g. Book notes'}),
      h('textarea',{value:flds,onChange:e=>setFlds(e.target.value),rows:3,placeholder:'Fields, one per line or comma-separated — e.g. Book, Chapter, Big idea, Quote',
        style:{width:'100%',boxSizing:'border-box',marginTop:8,padding:'11px 13px',borderRadius:12,border:'1px solid '+T.hair,background:T.card,color:T.fg,fontSize:15,fontFamily:UIF,resize:'vertical'}}),
      h('div',{style:{display:'flex',marginTop:10}},pill(T,'Add template',add,true,!name.trim()||!flds.trim(),Icons.plus(16)))));
}
function ApplyTemplate({T,S,a,onSave,onClose,toastFn}){
  const tpls=allTemplates();const [tpl,setTpl]=useState(a.template?tplById(a.template):null);
  const [fields,setFields]=useState(a.fields||{});const [busy,setBusy]=useState('');
  const fill=async()=>{if(!tpl)return;if(!(typeof aiReady==='function'&&aiReady(S))||S.aiProvider==='claude'){toastFn&&toastFn('Fill fields with AI needs Gemini or OpenRouter in Settings → AI');return}
    setBusy('Filling fields…');try{setFields(await aiFillFields(S,a.text||'',tpl.fields,w=>setBusy(String(w||''))))}catch(e){toastFn&&toastFn((e&&e.message)||'Couldn’t fill the fields')}setBusy('')};
  return h(Sheet,{T,onClose,title:'Template & fields',z:96,maxH:'90%'},
    h('div',{style:{padding:'0 18px 18px'}},
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',paddingBottom:2}},
        chip(T,!tpl,'None',()=>setTpl(null),'none'),tpls.map(t=>chip(T,tpl&&tpl.id===t.id,(t.icon?t.icon+' ':'')+t.name,()=>setTpl(t),t.id))),
      tpl?h('div',{style:{marginTop:12}},tpl.fields.map(f=>h('div',{key:f,style:{marginBottom:10}},h('div',{style:{fontSize:12,color:T.sub,marginBottom:4,fontWeight:600}},f),
        field(T,{value:fields[f]||'',onChange:e=>{const v=e.target.value;setFields(x=>({...x,[f]:v}))}}))),
        h('button',{onClick:fill,className:'act95',style:{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:650,color:T.accent}},busy?h(Spinner,{T,size:13}):Icons.ai(15),busy||'Fill fields with AI')):null,
      h('div',{style:{display:'flex',marginTop:16}},pill(T,'Save',()=>{onSave({template:tpl?tpl.id:null,fields:tpl?Object.fromEntries(tpl.fields.map(f=>[f,(fields[f]||'').trim()])):null});onClose()},true,false,Icons.check(17)))));
}

/* ============================== Scans & Docs hub ============================== */
function ScansHub({T,S,articles,folders,onClose,onOpen,onUpdate,onDelete,onNewScan,toastFn}){
  const scans=useMemo(()=>articles.filter(isScan).sort((x,y)=>(y.addedAt||0)-(x.addedAt||0)),[articles]);
  const [q,setQ]=useState('');const [tf,setTf]=useState('all');const [tag,setTag]=useState(null);
  const [sheet,setSheet]=useState(null); /* {type:'ask'|'tpl'|'item'|'apply', a} */
  const inRefs={camera:useRef(null),photos:useRef(null),pdf:useRef(null)};
  const picked=e=>{const fs=Array.from(e.target.files||[]);e.target.value='';if(fs.length)onNewScan(fs)};
  const tpls=allTemplates();
  const tagCounts={};scans.forEach(a=>(a.tags||[]).forEach(t=>{if(t!=='scan')tagCounts[t]=(tagCounts[t]||0)+1}));
  const topTags=Object.entries(tagCounts).sort((x,y)=>y[1]-x[1]).slice(0,12).map(x=>x[0]);
  const ql=q.trim().toLowerCase();
  const list=scans.filter(a=>(tf==='all'||(tf==='none'?!a.template:a.template===tf))&&(!tag||(a.tags||[]).includes(tag))&&
    (!ql||(a.title||'').toLowerCase().includes(ql)||(a.text||'').toLowerCase().includes(ql)||Object.values(a.fields||{}).some(v=>String(v).toLowerCase().includes(ql))));
  const usedTpls=tpls.filter(t=>scans.some(a=>a.template===t.id));
  const fmt=ms=>new Date(ms||Date.now()).toLocaleDateString([],{day:'numeric',month:'short',year:new Date(ms).getFullYear()===new Date().getFullYear()?undefined:'numeric'});
  const card=a=>{const t=a.template?tplById(a.template):null;const fv=a.fields?Object.entries(a.fields).filter(([,v])=>v).slice(0,2):[];
    return h('div',{key:a.id,style:{display:'flex',gap:12,padding:'12px 0',borderBottom:'0.5px solid '+T.hair}},
      h('button',{onClick:()=>onOpen(a.id),className:'act98',style:{display:'flex',gap:12,flex:1,minWidth:0,textAlign:'left',color:T.fg}},
        h('div',{style:{width:56,height:72,borderRadius:8,overflow:'hidden',background:'#fff',flexShrink:0,boxShadow:'0 1px 6px rgba(0,0,0,.16)'}},a.image?h('img',{src:a.image,alt:'',style:{width:'100%',height:'100%',objectFit:'cover'}}):null),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:15,fontWeight:650,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title),
          h('div',{style:{fontSize:12,color:T.sub,marginTop:3}},[fmt(a.addedAt),(a.scan&&a.scan.pages>1)?a.scan.pages+' pages':null,t?((t.icon||'')+' '+t.name):null].filter(Boolean).join(' · ')),
          fv.length?h('div',{style:{fontSize:12.5,color:T.meta,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},fv.map(([k,v])=>k+': '+v).join(' · ')):
            h('div',{style:{fontSize:12.5,color:T.meta,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},a.excerpt||''),
          (a.tags||[]).filter(t=>t!=='scan').length?h('div',{style:{display:'flex',gap:5,flexWrap:'wrap',marginTop:6}},(a.tags||[]).filter(t=>t!=='scan').slice(0,4).map(t=>h('span',{key:t,style:{fontSize:11,padding:'2px 7px',borderRadius:6,background:T.card,color:T.sub}},'#'+t))):null)),
      h('button',{onClick:()=>setSheet({type:'item',a}),'aria-label':'More',className:'act90',style:{color:T.sub,display:'flex',padding:'4px 2px',alignSelf:'flex-start'}},Icons.dots(18)))};
  const itemSheet=sheet&&sheet.type==='item'?(()=>{const a=sheet.a;const rel=relatedTo(a,articles,5);
    return h(Sheet,{T,onClose:()=>setSheet(null),z:95},
      h('div',{style:{padding:'4px 20px 12px',borderBottom:'1px solid '+T.hair,fontSize:15.5,fontWeight:650}},a.title),
      h(ARow,{T,icon:BIc.tpl(21),label:a.template?'Edit template & fields':'Apply a template',sub:'Structured fields you can filter and export',onClick:()=>setSheet({type:'apply',a})}),
      h(ARow,{T,icon:Icons.download(21),label:'Export as Markdown',onClick:()=>{setSheet(null);exportOne(a)}}),
      h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:()=>{setSheet(null);onDelete(a.id)}}),
      rel.length?h('div',{style:{padding:'14px 20px 4px'}},h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,marginBottom:4}},'Related'),
        rel.map(b=>h('button',{key:b.id,onClick:()=>{setSheet(null);onOpen(b.id)},className:'act98',style:{display:'block',width:'100%',textAlign:'left',padding:'9px 0',borderBottom:'0.5px solid '+T.hair,color:T.fg}},
          h('div',{style:{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},b.title),h('div',{style:{fontSize:12,color:T.sub}},b.source||''))),
        h('div',{style:{height:'calc(10px + env(safe-area-inset-bottom))'}})):null)})():null;
  return h(Screen,{T,title:'Scans & Docs',onBack:onClose,z:90,
      right:h(Fragment,null,
        h('button',{onClick:()=>setSheet({type:'ask'}),'aria-label':'Ask my docs',className:'act90',style:{width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',color:T.fg}},Icons.ai(21)),
        h('button',{onClick:()=>setSheet({type:'menu'}),'aria-label':'More options',className:'act90',style:{width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',color:T.fg}},Icons.dots(21)))},
    h('input',{ref:inRefs.camera,type:'file',accept:'image/*',capture:'environment',style:{display:'none'},onChange:picked}),
    h('input',{ref:inRefs.photos,type:'file',accept:'image/*',multiple:true,style:{display:'none'},onChange:picked}),
    h('input',{ref:inRefs.pdf,type:'file',accept:'application/pdf,.pdf,image/*',multiple:true,style:{display:'none'},onChange:picked}),
    h('div',{style:{padding:'12px 16px calc(40px + env(safe-area-inset-bottom))'}},
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}},
        [[Icons.camera(23),'Camera','camera'],[Icons.image(23),'Photos','photos'],[Icons.file(23),'PDF / files','pdf']].map(([ic,l,k])=>
          h('button',{key:k,onClick:()=>inRefs[k].current&&inRefs[k].current.click(),className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'14px 6px',borderRadius:16,background:T.card,color:T.fg,fontSize:12.5,fontWeight:600}},ic,l))),
      h('button',{onClick:()=>setSheet({type:'ask'}),className:'act98',style:{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'13px 14px',borderRadius:16,margin:'12px 0 6px',background:hexA(T.accent,.09),color:T.fg}},
        h('span',{style:{color:T.accent,display:'flex'}},Icons.ai(22)),
        h('span',{style:{flex:1}},h('span',{style:{display:'block',fontSize:14.5,fontWeight:650}},'Ask my docs'),h('span',{style:{display:'block',fontSize:12,color:T.sub,marginTop:1}},'Questions across everything you’ve scanned, with sources')),
        Icons.chevR?Icons.chevR(16):null),
      h('div',{style:{display:'flex',alignItems:'center',gap:8,background:T.search||T.card,borderRadius:12,padding:'9px 12px',margin:'12px 0'}},
        h('span',{style:{display:'flex',color:T.sub}},Icons.search(16)),
        h('input',{value:q,onChange:e=>setQ(e.target.value),placeholder:'Search scans, text and fields',style:{flex:1,minWidth:0,border:'none',background:'transparent',color:T.fg,fontSize:16,outline:'none'}})),
      scans.length?h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',margin:'0 -16px',padding:'0 16px 8px'}},
        chip(T,tf==='all','All · '+scans.length,()=>setTf('all'),'all'),
        usedTpls.map(t=>chip(T,tf===t.id,(t.icon?t.icon+' ':'')+t.name,()=>setTf(t.id),t.id)),
        scans.some(a=>!a.template)&&usedTpls.length?chip(T,tf==='none','No template',()=>setTf('none'),'none'):null):null,
      topTags.length?h('div',{className:'sx',style:{display:'flex',gap:6,overflowX:'auto',margin:'0 -16px',padding:'0 16px 6px'}},
        topTags.map(t=>h('button',{key:t,onClick:()=>setTag(tag===t?null:t),className:'act95',style:{flexShrink:0,fontSize:12,padding:'5px 10px',borderRadius:8,background:tag===t?T.fg:T.card,color:tag===t?T.bg:T.sub,fontWeight:600}},'#'+t))):null,
      list.map(card),
      !scans.length?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13.5,lineHeight:1.55,padding:'30px 14px'}},'Nothing scanned yet. Photograph a page, pick photos or a scanned PDF — the text becomes a searchable article you can tag, template, ask questions about and export.'):
      !list.length?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13.5,padding:'24px 10px'}},'No scans match.'):null),
    itemSheet,
    sheet&&sheet.type==='menu'?h(Sheet,{T,onClose:()=>setSheet(null),z:95},
      h(ARow,{T,icon:BIc.tpl(21),label:'Templates',sub:'Built-in and your own field sets',onClick:()=>setSheet({type:'tpl'})}),
      h(ARow,{T,icon:Icons.download(21),label:'Export '+(list.length===scans.length?'all':'these '+list.length)+' as Markdown',sub:'A .zip of .md files with front matter (tags, template fields)',onClick:()=>{setSheet(null);if(list.length)exportMany(list,'instapaper-scans');else toastFn&&toastFn('Nothing to export')}})):null,
    sheet&&sheet.type==='ask'?h(AskDocs,{T,S,articles,onOpen:id=>{setSheet(null);onOpen(id)},onClose:()=>setSheet(null),toastFn}):null,
    sheet&&sheet.type==='tpl'?h(TemplatesSheet,{T,onClose:()=>setSheet(null)}):null,
    sheet&&sheet.type==='apply'?h(ApplyTemplate,{T,S,a:sheet.a,onSave:p=>{onUpdate(sheet.a.id,p);toastFn&&toastFn('Saved')},onClose:()=>setSheet(null),toastFn}):null);
}
const BIc={tpl:s=>Svg({size:s},h('rect',{x:4,y:4,width:16,height:16,rx:3,stroke:'currentColor',strokeWidth:1.7}),P('M8 9h8M8 12.5h8M8 16h4.5'))};

/* fields card shown at the top of an article in the reader */
function FieldsCard({T,a}){
  if(!a||!a.fields)return null;const t=a.template?tplById(a.template):null;const rows=Object.entries(a.fields).filter(([,v])=>v);if(!rows.length)return null;
  return h('div',{style:{margin:'0 0 20px',padding:'12px 14px',borderRadius:14,background:T.card,fontFamily:UIF}},
    t?h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,marginBottom:6}},(t.icon?t.icon+' ':'')+t.name):null,
    rows.map(([k,v])=>h('div',{key:k,style:{display:'flex',gap:10,padding:'5px 0',fontSize:14,lineHeight:1.4,borderTop:'0.5px solid '+T.hair}},
      h('div',{style:{width:'34%',flexShrink:0,color:T.sub,fontWeight:600}},k),h('div',{style:{flex:1,minWidth:0}},v))));
}

window.InstaOCR={OcrFlow,ScansHub,FieldsCard,exportOne,exportMany,articleToMd,ocrCanvas,blobToCanvas,pdfToCanvases,getWorker,OCR_LANGS,ScanIcon,isScan,searchDocs,makeZip};
})();
