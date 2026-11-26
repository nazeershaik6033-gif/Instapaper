/* Evolve — Newspaper editions of video transcripts.
   A transcript (pasted from youtubetotranscript.com or any other source) becomes a newspaper page:
   masthead, kicker, headline, standfirst, "In this edition" key points, section headings, pull
   quotes and a drop cap. AI only *arranges* the page — it picks the headline, summary, where each
   section starts and which existing sentences become pull quotes. The transcript's own words are
   never rewritten. Without an AI key the same layout is used with the video's title and plain
   "Part" breaks.
   The reader: fonts, size, paper themes, one or two columns, contents (tap to jump), progress,
   highlights and notes (stored on the video, so they appear on the Notes page), translations,
   and downloads — PDF (print / Save to Files), a standalone HTML file, or a copy in the library.
   Loaded before app.js; app.js globals (h, aiChat, translateEngine…) are used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef,useMemo}=React;

/* ============================== text → paragraphs ============================== */
function cleanTranscript(t){
  return String(t||'').replace(/\r/g,'')
    .replace(/^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?[\])]?\s*(-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)?\s*/gm,'') // timestamps
    .replace(/^\s*\d+\s*$/gm,'') // SRT cue numbers
    .replace(/\[(music|applause|laughter|inaudible|సంగీతం|संगीत)\]/gi,'')
    .replace(/[ \t ]+/g,' ').replace(/\n[ \t]+/g,'\n').trim();
}
const wc=s=>String(s).trim().split(/\s+/).filter(Boolean).length;
function paragraphsOf(text){
  const t=cleanTranscript(text);if(!t)return[];
  const blocks=t.split(/\n{2,}/).map(s=>s.replace(/\n+/g,' ').trim()).filter(Boolean);
  const split=[];
  for(const b of blocks){
    if(wc(b)<=140){split.push(b);continue}
    const sents=b.split(/(?<=[.!?।॥])\s+/);
    if(sents.length>1){let cur='';for(const s of sents){if(cur&&wc(cur+' '+s)>110){split.push(cur);cur=s}else cur=cur?cur+' '+s:s}if(cur)split.push(cur)}
    else{const w=b.split(/\s+/);for(let i=0;i<w.length;i+=90)split.push(w.slice(i,i+90).join(' '))}
  }
  /* one caption per line → many scraps: join them into readable paragraphs */
  const out=[];let acc='';
  for(const p of split){
    if(wc(p)>=30){if(acc){out.push(acc);acc=''}out.push(p);continue}
    acc=acc?acc+' '+p:p;
    if(wc(acc)>=75&&/[.!?।॥]$/.test(acc)||wc(acc)>=110){out.push(acc);acc=''}
  }
  if(acc)out.push(acc);
  return out;
}
const scriptOf=s=>/[ఀ-౿]/.test(s)?'te':/[ऀ-ॿ]/.test(s)?'hi':'en';
const langName=k=>k==='orig'?'Original':k;

/* ============================== the edition (AI layout) ============================== */
function plainEdition(a,paras){
  const sections=[];const step=paras.length>14?Math.ceil(paras.length/Math.ceil(paras.length/8)):0;
  if(step)for(let i=0;i<paras.length;i+=step)sections.push({start:i+1,heading:'Part '+(sections.length+1)});
  const first=(paras[0]||'').split(/(?<=[.!?।])\s+/)[0]||'';
  return{plain:true,kicker:'Transcript',headline:a.title||'Transcript',standfirst:first.length>220?first.slice(0,217)+'…':first,keyPoints:[],sections,quotes:[]};
}
function looseJSON(s){
  const t=String(s||'').replace(/```(?:json)?/gi,'');const i=t.indexOf('{'),j=t.lastIndexOf('}');
  if(i<0||j<i)throw new Error('no JSON');
  try{return JSON.parse(t.slice(i,j+1))}catch(e){return JSON.parse(t.slice(i,j+1).replace(/,\s*([}\]])/g,'$1'))}
}
const norm=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
async function buildEdition(S,a,paras,lang,onStatus){
  const eng=typeof translateEngine==='function'?translateEngine(S):null;
  if(!eng)return Object.assign(plainEdition(a,paras),{noKey:true});
  const total=paras.reduce((n,p)=>n+p.length,0);
  const cap=total>60000?Math.max(160,Math.floor(60000/paras.length)):100000;
  const numbered=paras.map((p,i)=>'['+(i+1)+'] '+(p.length>cap?p.slice(0,cap)+'…':p)).join('\n');
  const language=lang==='orig'?({te:'Telugu',hi:'Hindi',en:'English'}[scriptOf(paras.join(' ').slice(0,4000))]):lang;
  onStatus&&onStatus('Laying out the front page…');
  const out=await aiChat(eng,[
    {role:'system',content:'You are the front-page editor of a quality newspaper. You receive the transcript of a video, split into numbered paragraphs. You never rewrite or summarise the paragraphs themselves — you only design the page around them. Reply with JSON only.'},
    {role:'user',content:'Video: "'+(a.title||'')+'"'+(a.author?' by '+a.author:'')+'.\nWrite every field in '+language+' (the language of the transcript).\n\nReturn exactly this JSON:\n{"kicker": "1-3 word section label, like a newspaper section", "headline": "a sharp newspaper headline, at most 12 words", "standfirst": "one or two sentences that sum up the story", "keyPoints": ["3 to 5 short sentences: the most important takeaways"], "sections": [{"start": <paragraph number where this section begins; the first must be 1>, "heading": "2-6 word section heading"}], "quotes": [{"para": <paragraph number>, "text": "one striking sentence copied word for word from that paragraph"}]}\nUse '+(paras.length<8?'2-3':paras.length<30?'3-6':'5-9')+' sections in order and 1-3 quotes.\n\nParagraphs:\n'+numbered}],
    2500,m=>onStatus&&onStatus(m));
  const j=looseJSON(out);
  const n=paras.length;
  let sections=(Array.isArray(j.sections)?j.sections:[]).map(s=>({start:Math.round(Number(s.start)),heading:String(s.heading||'').trim()})).filter(s=>s.start>=1&&s.start<=n&&s.heading);
  sections=sections.sort((x,y)=>x.start-y.start).filter((s,i,arr)=>!i||s.start!==arr[i-1].start);
  const quotes=(Array.isArray(j.quotes)?j.quotes:[]).map(q=>({para:Math.round(Number(q.para)),text:String(q.text||'').trim().replace(/^["“'‘]|["”'’]$/g,'')}))
    .filter(q=>q.para>=1&&q.para<=n&&q.text.length>12&&norm(paras[q.para-1]).includes(norm(q.text))).slice(0,3);
  return{kicker:String(j.kicker||'').trim().slice(0,40),headline:String(j.headline||a.title||'').trim().slice(0,160),standfirst:String(j.standfirst||'').trim().slice(0,400),
    keyPoints:(Array.isArray(j.keyPoints)?j.keyPoints:[]).map(x=>String(x).trim()).filter(Boolean).slice(0,6),sections,quotes,model:typeof aiModelLabel==='function'?aiModelLabel(eng):''};
}

/* ============================== appearance ============================== */
const PREF_KEY='insta_edition_prefs';
const FONTS=[['news','Newsprint',"'PT Serif'"],['lora','Lora',"'Lora'"],['literata','Literata',"'Literata'"],['merri','Merriweather',"'Merriweather'"],['sans','Sans',"'Inter',-apple-system,system-ui"]];
const THEMES=[['paper','Newsprint','#f3eee2','#1c1a16','#c9bd9e','#8a2b1d'],['white','White','#ffffff','#141414','#d6d6d6','#b3261e'],['sepia','Sepia','#ecdcbf','#3b2c1a','#c4a77a','#8a3b12'],['dark','Night','#141311','#e9e3d6','#3a362e','#e08a6d']];
const INDIC=",'Noto Serif Telugu','Noto Serif Devanagari',Georgia,serif";
const loadPrefs=()=>{try{return Object.assign({font:'news',size:18,theme:'paper',focus:false,awake:false},JSON.parse(localStorage.getItem(PREF_KEY)||'{}'),{cols:1})}catch(e){return{font:'news',size:18,theme:'paper',cols:1}}};
const themeOf=id=>THEMES.find(t=>t[0]===id)||THEMES[0];
const fontOf=id=>(FONTS.find(f=>f[0]===id)||FONTS[0])[2]+INDIC;
const HEAD="'Playfair Display'"+INDIC;
const dateLine=t=>new Date(t||Date.now()).toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const thumbOf=a=>a.videoId?'https://i.ytimg.com/vi/'+a.videoId+'/hqdefault.jpg':(a.image||'');

/* ============================== export (HTML / PDF / library) ============================== */
function editionBodyHtml(a,ed,paras){
  const starts={};(ed.sections||[]).forEach(s=>{starts[s.start-1]=s.heading});
  const quotes={};(ed.quotes||[]).forEach(q=>{(quotes[q.para-1]=quotes[q.para-1]||[]).push(q.text)});
  let body='';
  paras.forEach((p,i)=>{
    if(starts[i]&&i>0)body+='<h2>'+esc(starts[i])+'</h2>';
    body+='<p'+(i===0?' class="drop"':'')+'>'+esc(p)+'</p>';
    (quotes[i]||[]).forEach(q=>{body+='<blockquote>'+esc(q)+'</blockquote>'});
  });
  return body;
}
function editionHtml(a,ed,paras,prefs,lang){
  const th=themeOf(prefs.theme==='dark'?'paper':prefs.theme);
  const font=fontOf(prefs.font);
  const keys=(ed.keyPoints||[]).length?'<aside class="keys"><div class="kh">In this edition</div><ul>'+ed.keyPoints.map(k=>'<li>'+esc(k)+'</li>').join('')+'</ul></aside>':'';
  const img=thumbOf(a);
  return '<!DOCTYPE html><html lang="'+({te:'te',hi:'hi'}[scriptOf(paras.join(' ').slice(0,3000))]||'en')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(ed.headline||a.title)+'</title>'+
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Literata:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600&family=Noto+Serif+Telugu:wght@400;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">'+
    '<style>'+editionCss(th,font,prefs.size||18,prefs.cols||1)+'@media print{body{background:#fff}.paper{box-shadow:none;margin:0;max-width:none}a{color:inherit}}</style></head><body><article class="paper">'+
    '<header class="mast"><div class="dl"><span>'+esc(dateLine(Date.now()))+'</span><span>'+esc(a.author||a.source||'')+'</span></div><div class="mt">The Daily Transcript</div><div class="rule"></div></header>'+
    (ed.kicker?'<div class="kicker">'+esc(ed.kicker)+'</div>':'')+'<h1>'+esc(ed.headline||a.title)+'</h1>'+(ed.standfirst?'<p class="stand">'+esc(ed.standfirst)+'</p>':'')+
    '<div class="by">From <b>'+esc(a.author||a.source||'YouTube')+'</b>'+(lang&&lang!=='orig'?' · '+esc(lang)+' edition':'')+' · '+Math.max(1,Math.round(paras.join(' ').split(/\s+/).length/230))+' min read</div>'+
    (img?'<figure><img src="'+esc(img)+'" alt=""><figcaption>'+esc(a.title||'')+(a.url?' — <a href="'+esc(a.url)+'">watch the video</a>':'')+'</figcaption></figure>':'')+
    keys+'<div class="cols">'+editionBodyHtml(a,ed,paras)+'</div><div class="end">— End of edition —</div></article></body></html>';
}
function editionCss(th,font,size,cols){
  const [,,bg,ink,rule,accent]=th;
  return 'body{margin:0;background:'+bg+';color:'+ink+';font-family:'+font+';-webkit-text-size-adjust:100%}'+
    '.paper{max-width:760px;margin:0 auto;padding:22px 20px 40px}'+
    '.mast{text-align:center;margin-bottom:14px}.dl{display:flex;justify-content:space-between;gap:10px;font:600 11px/1.4 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.7;border-bottom:1px solid '+rule+';padding-bottom:6px}'+
    '.mt{font-family:'+HEAD+';font-weight:900;font-size:34px;letter-spacing:-.01em;margin:10px 0 6px}.rule{border-top:3px double '+ink+';}'+
    '.kicker{font:700 11.5px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:'+accent+';margin:18px 0 8px}'+
    'h1{font-family:'+HEAD+';font-weight:900;font-size:'+Math.round(size*1.75)+'px;line-height:1.12;letter-spacing:-.015em;margin:0 0 12px}'+
    '.stand{font-style:italic;font-size:'+Math.round(size*1.12)+'px;line-height:1.5;margin:0 0 12px;opacity:.9}'+
    '.by{font:500 12.5px/1.5 Inter,system-ui,sans-serif;opacity:.75;border-top:1px solid '+rule+';border-bottom:1px solid '+rule+';padding:7px 0;margin-bottom:16px}'+
    'figure{margin:0 0 16px}figure img{width:100%;display:block;border-radius:2px;filter:saturate(.92)}figcaption{font:italic 12.5px/1.45 '+font+';opacity:.75;margin-top:6px}'+
    '.keys{border:1px solid '+rule+';border-left:4px solid '+accent+';padding:12px 14px;margin:0 0 18px}.kh{font:700 11px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:'+accent+';margin-bottom:8px}.keys ul{margin:0;padding-left:18px}.keys li{margin:4px 0;line-height:1.45;font-size:'+Math.round(size*.92)+'px}'+
    '.cols{column-count:'+cols+';column-gap:26px;column-rule:1px solid '+rule+'}'+
    'p{font-size:'+size+'px;line-height:1.62;margin:0 0 .9em;text-align:'+(cols>1?'justify':'left')+';hyphens:auto;-webkit-hyphens:auto}'+
    'p.drop::first-letter{float:left;font-family:'+HEAD+';font-weight:900;font-size:'+Math.round(size*3.3)+'px;line-height:.85;margin:4px 8px 0 0;color:'+accent+'}'+
    'h2{font-family:'+HEAD+';font-weight:700;font-size:'+Math.round(size*1.15)+'px;margin:1.3em 0 .5em;padding-top:.5em;border-top:1px solid '+rule+';break-after:avoid}'+
    'blockquote{margin:1em 0;padding:.6em 0;border-top:2px solid '+ink+';border-bottom:1px solid '+rule+';font-family:'+HEAD+';font-style:italic;font-size:'+Math.round(size*1.3)+'px;line-height:1.3;break-inside:avoid}blockquote::before{content:"“";color:'+accent+';font-size:1.6em;line-height:0;vertical-align:-.35em;margin-right:4px}'+
    'mark{background:rgba(255,214,10,.45);color:inherit;border-radius:2px;padding:0 1px}'+
    '.end{text-align:center;font:600 12px Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin-top:24px}';
}
function printHtml(html){
  /* print a hidden copy of the edition: iPhone → Share → Print → pinch → Save to Files gives a PDF */
  const id='ed-print-frame';const old=document.getElementById(id);if(old)old.remove();
  const f=document.createElement('iframe');f.id=id;f.setAttribute('aria-hidden','true');
  f.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(f);
  f.onload=()=>{setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){try{window.print()}catch(e2){}}},700)};
  f.srcdoc=html;
}

/* ============================== Google Translate (the app) ============================== */
/* Safari can't read results back from another app, so: send a part to Google Translate (the text is
   also copied), copy the translation there, come back and tap “Paste translation”. */
const GT_LANGS=[['Telugu','te'],['Hindi','hi'],['English','en'],['Tamil','ta'],['Kannada','kn'],['Malayalam','ml'],['Marathi','mr'],['Bengali','bn'],['Gujarati','gu'],['Urdu','ur'],['Arabic','ar'],['Spanish','es'],['French','fr'],['German','de']];
const GT_MAX=4500; /* Google Translate takes up to 5,000 characters at a time */
function gtParts(paras){const out=[];let cur='';for(const p of paras){if(cur&&cur.length+p.length+2>GT_MAX){out.push(cur);cur=''}
  if(p.length>GT_MAX){for(let i=0;i<p.length;i+=GT_MAX)out.push(p.slice(i,i+GT_MAX));continue}cur+=(cur?'\n\n':'')+p}if(cur)out.push(cur);return out}
/* the app opens straight from the tap (a delayed fallback would be blocked as a pop-up); the text is
   also on the clipboard in case the app opens without it — just paste it there */
function openGoogleTranslate(text,tl,web){
  try{copyText(text)}catch(e){}
  const q='sl=auto&tl='+encodeURIComponent(tl||'en')+'&text='+encodeURIComponent(text);
  if(web){const u='https://translate.google.com/?'+q+'&op=translate';if(typeof openExternalUrl==='function')openExternalUrl(u);else window.open(u,'_blank');return}
  try{window.location.href='googletranslate://?'+q}catch(e){}
}
async function readClipboard(){try{if(navigator.clipboard&&navigator.clipboard.readText)return await navigator.clipboard.readText()}catch(e){}return null}

/* ============================== PDF ============================== */
const LIBS={h2c:'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',pdf:'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'};
const _libs={};
function loadLib(k){if(_libs[k])return _libs[k];_libs[k]=new Promise((res,rej)=>{const s2=document.createElement('script');s2.src=LIBS[k];s2.crossOrigin='anonymous';
  s2.onload=()=>res();s2.onerror=()=>{delete _libs[k];rej(new Error('Connect to the internet once to set up PDF export'))};document.head.appendChild(s2)});return _libs[k]}
async function shareBlob(blob,name){
  try{const f=new File([blob],name,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}
  const u=URL.createObjectURL(blob);const x=document.createElement('a');x.href=u;x.download=name;document.body.appendChild(x);x.click();setTimeout(()=>{URL.revokeObjectURL(u);x.remove()},2000);
}
/* exact look: render the page as you see it (any script), cut into A4 pages between paragraphs */
async function imagePdf(article,bg,name,onStep){
  await loadLib('h2c');await loadLib('pdf');
  const W=720;const box=document.createElement('div');
  box.style.cssText='position:fixed;left:-12000px;top:0;width:'+W+'px;background:'+bg+';z-index:-1';
  const clone=article.cloneNode(true);clone.style.maxWidth=W+'px';clone.style.margin='0';clone.style.padding='34px 40px 40px';
  clone.querySelectorAll('mark.ed-find').forEach(m=>{m.className=m.classList.contains('ed-hl')?'ed-hl':''});
  clone.querySelectorAll('button').forEach(b=>{if(!b.closest('figcaption'))b.remove()});
  clone.querySelectorAll('[data-i],[data-p]').forEach(el=>{el.style.opacity='1'});
  /* the renderer can't draw ::first-letter drop caps or auto-hyphenation faithfully */
  clone.querySelectorAll('.ed-drop').forEach(el=>el.classList.remove('ed-drop'));
  /* a highlight that wraps lines would be painted as one big box — split it into one span per word */
  clone.querySelectorAll('mark').forEach(m=>{const bgc=getComputedStyle(m).backgroundColor||'rgba(255,214,10,.45)';const frag=document.createDocumentFragment();
    String(m.textContent).split(/(\s+)/).forEach(w=>{if(!w)return;if(/^\s+$/.test(w)){frag.appendChild(document.createTextNode(w));return}
      const sp=document.createElement('span');sp.textContent=w;sp.style.background=bgc;sp.style.borderRadius='2px';frag.appendChild(sp)});
    m.replaceWith(frag)});
  clone.querySelectorAll('p,li,blockquote,h1,h2').forEach(el=>{el.style.hyphens='manual';el.style.webkitHyphens='manual'});
  box.appendChild(clone);document.body.appendChild(box);
  try{
    onStep&&onStep('Rendering the page…');
    const scale=2;const cv=await window.html2canvas(box,{scale,backgroundColor:bg,useCORS:true,logging:false,windowWidth:W});
    const top0=box.getBoundingClientRect().top;
    const breaks=[...box.querySelectorAll('p,h1,h2,blockquote,li,figure,aside,header')].map(el=>Math.round((el.getBoundingClientRect().bottom-top0)*scale)).filter(y=>y>0).sort((a,b)=>a-b);
    const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'pt',format:'a4',compress:true});
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const pageH=Math.floor(cv.width*ph/pw);
    let y=0,n=0;
    while(y<cv.height-4){
      let end=Math.min(cv.height,y+pageH);
      if(end<cv.height){const ok=breaks.filter(b=>b>y+pageH*.55&&b<=end);if(ok.length)end=ok[ok.length-1]}
      const c=document.createElement('canvas');c.width=cv.width;c.height=pageH;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);
      x.drawImage(cv,0,y,cv.width,end-y,0,0,cv.width,end-y);
      if(n)doc.addPage();doc.addImage(c.toDataURL('image/jpeg',.88),'JPEG',0,0,pw,ph);n++;y=end;onStep&&onStep('Page '+n+'…');
    }
    return new Blob([doc.output('arraybuffer')],{type:'application/pdf'});
  }finally{box.remove()}
}
const nonLatin=t=>/[^\u0000-ɏḀ-ỿ -⁯₠-⃏℀-⅏]/.test(t);
/* selectable text: a clean typeset PDF with real text (Latin scripts) + your highlights and notes */
async function textPdf(a,view,paras,hls,note,name){
  await loadLib('pdf');const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'pt',format:'a4',compress:true});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),M=56,TW=pw-2*M;let y=M;
  const clean=t=>String(t||'').replace(/\s+/g,' ').trim();
  const block=(t,o)=>{o=Object.assign({font:'times',style:'normal',size:11.5,lh:1.45,gap:8,indent:0,color:[20,20,20]},o||{});
    t=clean(t);if(!t)return;doc.setFont(o.font,o.style);doc.setFontSize(o.size);doc.setTextColor(o.color[0],o.color[1],o.color[2]);
    const lines=doc.splitTextToSize(t,TW-o.indent);const L=o.size*o.lh;
    for(const ln of lines){if(y+L>ph-M){doc.addPage();y=M}doc.text(ln,M+o.indent,y+o.size);y+=L}y+=o.gap;
  };
  const rule=()=>{if(y+10>ph-M){doc.addPage();y=M}doc.setDrawColor(180);doc.line(M,y,pw-M,y);y+=12};
  block('THE DAILY TRANSCRIPT',{font:'helvetica',style:'bold',size:9,color:[120,40,30],gap:4});
  block(view.headline||a.title,{style:'bold',size:22,lh:1.2,gap:8});
  if(view.standfirst)block(view.standfirst,{style:'italic',size:13,gap:8});
  block('From '+(a.author||a.source||'YouTube')+' · '+paras.join(' ').split(/\s+/).length.toLocaleString()+' words',{font:'helvetica',size:9,color:[110,110,110],gap:10});rule();
  if((view.keyPoints||[]).length){block('In this edition',{font:'helvetica',style:'bold',size:10,gap:4});view.keyPoints.forEach(k=>block('• '+k,{size:11,gap:3,indent:8}));y+=6;rule()}
  const starts={};(view.sections||[]).forEach(s2=>{starts[s2.start-1]=s2.heading});
  const quotes={};(view.quotes||[]).forEach(q=>{(quotes[q.para-1]=quotes[q.para-1]||[]).push(q.text)});
  paras.forEach((p,i)=>{if(starts[i]&&i>0){y+=6;block(starts[i],{style:'bold',size:14,gap:6})}block(p);(quotes[i]||[]).forEach(q=>block('“'+q+'”',{style:'italic',size:13,indent:16,gap:10,color:[90,30,20]}))});
  if(hls.length){y+=10;rule();block('Highlights',{font:'helvetica',style:'bold',size:12,gap:6});hls.forEach(x=>block('“'+x.text+'”',{style:'italic',size:11,indent:8,gap:6}))}
  if(String(note||'').trim()){y+=6;rule();block('Notes',{font:'helvetica',style:'bold',size:12,gap:6});String(note).split(/\n+/).forEach(l=>block(l,{size:11,gap:4}))}
  return new Blob([doc.output('arraybuffer')],{type:'application/pdf'});
}
const EdIcons={
  marker:s=>Svg({size:s},P('M15.2 4.3l4.5 4.5-8.9 8.9H6.3v-4.5l8.9-8.9Z'),P('M12.9 6.6l4.5 4.5'),P('M4 20.5h9')),
  find:s=>Svg({size:s},h('circle',{cx:10.5,cy:10.5,r:6,stroke:'currentColor',strokeWidth:1.7,fill:'none'}),P('M15 15l5 5')),
  up:s=>Svg({size:s},P('M6 14.5l6-6 6 6')),down:s=>Svg({size:s},P('M6 9.5l6 6 6-6')),
  lang:s=>Svg({size:s},P('M4 6h8M8 4.5V6M10.5 6c-.6 3-2.6 5.4-5.5 6.8M6.4 8.6c1 1.7 2.5 3 4.3 3.8'),P('M12.5 20l3.8-9 3.7 9M13.8 17h5'))
};

/* ============================== reader ============================== */
function EditionReader({T,S,a,patch,toastFn,onClose,onSaveToLibrary,initialLang,onOpenVideo,initialPanel}){
  const tr=a.transcriptTr||{};
  const langs=['orig'].concat(Object.keys(tr).filter(k=>String(tr[k]||'').trim()));
  const [lang,setLang]=useState(initialLang&&langs.includes(initialLang)?initialLang:'orig');
  const [prefs,setPrefs]=useState(loadPrefs);
  const [panel,setPanel]=useState(initialPanel==='translate'?'lang':initialPanel==='notes'?null:(initialPanel||null));
  const [busy,setBusy]=useState('');
  const [err,setErr]=useState('');
  const [prog,setProg]=useState(0);
  const [selBar,setSelBar]=useState(null); // {text} | {remove:id}
  const [find,setFind]=useState(null); // {q, idx}
  const [nh,setNh]=useState(initialPanel==='notes'?'notes':null); // notes & highlights page: 'notes' | 'hl'
  const [gt,setGt]=useState(null); // Google Translate hand-off: {lang,code,parts:[{src,out}]}
  const [focusIdx,setFocusIdx]=useState(0);
  const scRef=useRef(null);const alive=useRef(true);
  useEffect(()=>()=>{alive.current=false},[]);
  const setP=p=>setPrefs(x=>{const n=Object.assign({},x,p);try{localStorage.setItem(PREF_KEY,JSON.stringify(n))}catch(e){}return n});
  const text=lang==='orig'?(a.transcript||''):(tr[lang]||'');
  const paras=useMemo(()=>paragraphsOf(text),[text]);
  const stored=(a.editions||{})[lang];
  const ed=stored&&stored.len===text.length?stored:null;
  const view=ed||plainEdition(a,paras);
  const build=async force=>{
    if(!paras.length)return;
    if(!force&&ed)return;
    setErr('');setBusy('Laying out the front page…');
    try{
      const res=await buildEdition(S,a,paras,lang,m=>alive.current&&setBusy(m));
      if(res.noKey){if(alive.current){setBusy('');if(force)setErr('Add a free Gemini or OpenRouter key in Settings → AI for headlines, sections and pull quotes.')}if(!force)return}
      patch(x=>({editions:Object.assign({},x.editions||{},{[lang]:Object.assign(res,{len:text.length,at:Date.now()})})}));
    }catch(e){if(alive.current)setErr('Couldn’t lay out the page with AI ('+((e&&e.message)||'error')+') — showing the plain edition.')}
    if(alive.current)setBusy('');
  };
  useEffect(()=>{if(!ed&&paras.length&&typeof translateEngine==='function'&&translateEngine(S))build(false)},[lang,text.length]);
  /* reading progress */
  const onScroll=()=>{const el=scRef.current;if(!el)return;const m=el.scrollHeight-el.clientHeight;setProg(m>0?Math.min(1,el.scrollTop/m):1);
    if(prefs.focus){const line=el.getBoundingClientRect().top+el.clientHeight*.35;let cur=0;for(const n of el.querySelectorAll('[data-i]')){if(n.getBoundingClientRect().top<=line)cur=+n.getAttribute('data-i');else break}if(cur!==focusIdx)setFocusIdx(cur)}};
  /* keep the screen on while reading (Aa → Keep screen awake) */
  useEffect(()=>{if(!prefs.awake||!navigator.wakeLock)return;let lock=null,dead=false;
    const get=()=>{if(document.visibilityState==='visible')navigator.wakeLock.request('screen').then(l=>{if(dead)l.release();else lock=l}).catch(()=>{})};
    get();document.addEventListener('visibilitychange',get);
    return()=>{dead=true;document.removeEventListener('visibilitychange',get);try{lock&&lock.release()}catch(e){}}},[prefs.awake]);
  /* highlights live on the video (src:'edition'), so they also show on the Notes page */
  const hls=(a.highlights||[]).filter(x=>x&&x.text&&x.kind!==(typeof VIDEO_NOTES_KIND!=='undefined'?VIDEO_NOTES_KIND:'videoNotes'));
  useEffect(()=>{
    const f=()=>{
      const sel=window.getSelection&&window.getSelection();const el=scRef.current;
      if(!sel||sel.isCollapsed||!el||!el.contains(sel.anchorNode)){setSelBar(b=>b&&b.text?null:b);return}
      const t=String(sel).replace(/\s+/g,' ').trim();
      const pe=sel.anchorNode&&(sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentElement);const pp=pe&&pe.closest&&pe.closest('[data-i]');
      /* a selection can run across paragraphs: keep the selected piece of each one so every paragraph gets marked */
      const parts=[];
      try{const rg=sel.getRangeAt(0);
        el.querySelectorAll('[data-i]').forEach(n=>{if(!rg.intersectsNode(n))return;const r=document.createRange();r.selectNodeContents(n);
          if(n.contains(rg.startContainer))r.setStart(rg.startContainer,rg.startOffset);if(n.contains(rg.endContainer))r.setEnd(rg.endContainer,rg.endOffset);
          const pt=r.toString().trim();if(pt)parts.push({para:Number(n.getAttribute('data-i')),text:pt})})}catch(e){}
      if(parts.length>1){const full=parts.map(x=>x.text).join('\n\n');setSelBar({text:full.slice(0,8000),para:parts[0].para,parts:parts.slice(0,40)});return}
      if(t.length>2)setSelBar({text:t.slice(0,1200),para:pp?Number(pp.getAttribute('data-i')):null});
    };
    document.addEventListener('selectionchange',f);return()=>document.removeEventListener('selectionchange',f);
  },[]);
  const addHl=(t,para,parts)=>{patch(x=>({highlights:(x.highlights||[]).concat([{id:uid(),text:t,createdAt:Date.now(),src:'edition',lang,para:para==null?undefined:para,parts:parts&&parts.length>1?parts:undefined}])}));try{window.getSelection().removeAllRanges()}catch(e){}setSelBar(null);toastFn('Highlighted — also on your Notes page')};
  const delHl=id=>{patch(x=>({highlights:(x.highlights||[]).filter(y=>y.id!==id)}));setSelBar(null)};
  const findHits=useMemo(()=>{const q=(find&&find.q||'').trim().toLowerCase();if(q.length<2)return[];const out=[];
    paras.forEach((p,pi)=>{const pl=p.toLowerCase();let i=pl.indexOf(q);while(i>=0&&out.length<999){out.push({pi,i,len:q.length});i=pl.indexOf(q,i+q.length)}});return out},[find&&find.q,paras]);
  useEffect(()=>{if(!find||!findHits.length)return;const el=scRef.current&&scRef.current.querySelector('mark.ed-cur');if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},[find&&find.idx,findHits]);
  const marked=(p,pi)=>{
    const rs=[];
    for(const hl of hls){if(hl.src==='edition'&&hl.lang&&hl.lang!==lang)continue;
      for(const sg of (hl.parts&&hl.parts.length?hl.parts:[{para:hl.para,text:hl.text}])){
        if(hl.src==='edition'&&sg.para!=null&&sg.para!==pi)continue;const st=String(sg.text||'');if(!st)continue;
        let i=p.indexOf(st);if(i<0&&st.length>40)i=p.indexOf(st.slice(0,40));
        if(i>=0)rs.push({s:i,e:i+Math.min(st.length,p.length-i),hl:hl.id})}}
    findHits.forEach((m,k)=>{if(m.pi===pi)rs.push({s:m.i,e:m.i+m.len,find:true,cur:k===(find&&find.idx)})});
    if(!rs.length)return p;
    const cuts=new Set([0,p.length]);rs.forEach(r=>{cuts.add(r.s);cuts.add(r.e)});const pts=[...cuts].sort((x,y)=>x-y);const out=[];
    for(let k=0;k<pts.length-1;k++){const a0=pts[k],b0=pts[k+1];if(b0<=a0)continue;const seg=p.slice(a0,b0);const cov=rs.filter(r=>r.s<=a0&&r.e>=b0);
      if(!cov.length){out.push(seg);continue}
      const f=cov.find(r=>r.find),hh=cov.find(r=>r.hl);
      out.push(h('mark',{key:k,className:f?('ed-find'+(f.cur?' ed-cur':'')+(hh?' ed-hl':'')):undefined,'data-hl':hh?hh.hl:undefined,onClick:hh?ev=>{ev.stopPropagation();setSelBar({remove:hh.hl})}:undefined},seg))}
    return out;
  };
  /* notes: one notepad per video, the same one the transcript view uses */
  const NK=typeof VIDEO_NOTES_KIND!=='undefined'?VIDEO_NOTES_KIND:'videoNotes';
  const noteObj=(a.highlights||[]).find(x=>x.kind===NK);
  const [note,setNote]=useState(noteObj?noteObj.note||'':'');
  const saveNote=v=>patch(x=>{const hs=(x.highlights||[]).filter(y=>y.kind!==NK);if(!v.trim())return{highlights:hs};const old=(x.highlights||[]).find(y=>y.kind===NK);
    return{highlights:hs.concat([{id:old?old.id:uid(),kind:NK,text:'📝 My notes',note:v,createdAt:old?old.createdAt:Date.now(),updatedAt:Date.now()}])}});
  const addToNotes=t=>{const v=(note.trim()?note.replace(/\s+$/,'')+'\n\n':'')+'• '+String(t).trim();setNote(v);saveNote(v);try{window.getSelection().removeAllRanges()}catch(e){}setSelBar(null);toastFn('Copied to notes')};
  const noteRef=useRef(null);
  const [hlSort,setHlSort]=useState(()=>{try{return localStorage.getItem('insta_ed_hlsort')||'new'}catch(e){return'new'}});
  const flipHlSort=()=>setHlSort(v=>{const n=v==='new'?'old':'new';try{localStorage.setItem('insta_ed_hlsort',n)}catch(e){}return n});
  const copyAll=()=>{const nt=note.trim();const hs=hls.slice().sort((x,y)=>(x.createdAt||0)-(y.createdAt||0));
    if(!nt&&!hs.length){toastFn('Nothing to copy yet');return}
    copyText([(view.headline||a.title||'').trim(),nt?'Notes\n'+nt:'',hs.length?'Highlights\n'+hs.map(x=>'“'+x.text.trim()+'”').join('\n\n'):''].filter(Boolean).join('\n\n'));
    toastFn(nt&&hs.length?'Notes & highlights copied':nt?'Notes copied':'Highlights copied')};
  const noteT=useRef(null);const editNote=v=>{setNote(v);clearTimeout(noteT.current);noteT.current=setTimeout(()=>saveNote(v),700)};
  const jumpHl=x=>{setNh(null);setTimeout(()=>{const root=scRef.current;if(!root)return;const m=root.querySelector('mark[data-hl="'+x.id+'"]');
    const el=m||(x.para!=null?root.querySelector('[data-i="'+x.para+'"]'):null);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});if(m){m.classList.add('ed-flash');setTimeout(()=>m.classList.remove('ed-flash'),1400)}}else toastFn('That highlight is in another language edition')},60)};
  const startGt=(name,code)=>{setPanel(null);const src=paragraphsOf(a.transcript||'');if(!src.length){toastFn('No transcript to translate');return}
    setGt(g=>g&&g.lang===name?g:{lang:name,code,parts:gtParts(src).map(t=>({src:t,out:''}))})};
  const pastePart=async i=>{const t=await readClipboard();
    if(t==null){toastFn('Couldn’t read the clipboard — paste into the box instead');setGt(g=>({...g,manual:i}));return}
    if(!t.trim()){toastFn('The clipboard is empty — copy the translation in Google Translate first');return}
    if(t.trim()===gt.parts[i].src.trim()){toastFn('That’s still the original text — copy the translation in Google Translate, then paste');return}
    setGt(g=>({...g,parts:g.parts.map((p2,k)=>k===i?{...p2,out:t.trim()}:p2),manual:null}));toastFn('Part '+(i+1)+' pasted')};
  const finishGt=()=>{const out=gt.parts.map(p2=>p2.out).join('\n\n');patch(x=>({transcriptTr:Object.assign({},x.transcriptTr||{},{[gt.lang]:out})}));setLang(gt.lang);toastFn(gt.lang+' edition ready');setGt(null)};
  const [pdfBusy,setPdfBusy]=useState('');
  /* translate here too */
  const translate=async target=>{
    setPanel(null);
    const eng=typeof translateEngine==='function'?translateEngine(S):null;
    if(!eng){setErr('Translation uses online AI — add a free Gemini or OpenRouter key in Settings → AI.');return}
    const src=a.transcript||'';if(!src.trim())return;
    setErr('');
    try{
      const chunks=transcriptChunks(src,eng.aiProvider==='gemini'?6000:2400);const out=[];
      for(let i=0;i<chunks.length;i++){
        if(alive.current)setBusy('Translating into '+target+(chunks.length>1?' — part '+(i+1)+' of '+chunks.length:'')+'…');
        out.push(await aiChat(eng,[{role:'system',content:'You are a professional translator. Translate the user text into '+target+'. It is a transcript of spoken words, so use natural, everyday '+target+' as people actually speak it. Keep paragraph breaks. Output only the translation.'},{role:'user',content:chunks[i]}],8000,m=>alive.current&&setBusy(m)));
        if(i<chunks.length-1)await new Promise(r=>setTimeout(r,1200));
      }
      patch(x=>({transcriptTr:Object.assign({},x.transcriptTr||{},{[target]:out.join('\n\n')})}));
      if(alive.current){setLang(target);toastFn(target+' edition ready')}
    }catch(e){if(alive.current)setErr((e&&e.message)||'Translation failed')}
    if(alive.current)setBusy('');
  };
  const th=themeOf(prefs.theme);const [,,bg,ink,rule,accent]=th;
  const font=fontOf(prefs.font);const size=prefs.size;
  const cols=prefs.cols;
  const starts={};(view.sections||[]).forEach(s=>{starts[s.start-1]=s.heading});
  const quotes={};(view.quotes||[]).forEach(q=>{(quotes[q.para-1]=quotes[q.para-1]||[]).push(q.text)});
  const words=paras.join(' ').split(/\s+/).filter(Boolean).length;
  const jump=i=>{const el=scRef.current&&scRef.current.querySelector('[data-p="'+i+'"]');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});setPanel(null)};
  const fileBase=(view.headline||a.title||'edition').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,60)||'edition';
  const html=()=>editionHtml(a,view,paras,prefs,lang);
  const makePdf=async kind=>{setPanel(null);setFind(null);setPdfBusy(kind==='img'?'Preparing PDF…':'Typesetting PDF…');
    try{await new Promise(r=>setTimeout(r,80));const art=scRef.current&&scRef.current.querySelector('article');
      const blob=kind==='img'?await imagePdf(art,bg,fileBase,m=>alive.current&&setPdfBusy(m)):await textPdf(a,view,paras,hls.filter(x=>x.src!=='edition'||!x.lang||x.lang===lang),note,fileBase);
      if(alive.current)setPdfBusy('');await shareBlob(blob,fileBase+'.pdf')}
    catch(e){if(alive.current){setPdfBusy('');setErr((e&&e.message)||'PDF failed')}}};
  const saveCopy=()=>{
    const body=(view.keyPoints&&view.keyPoints.length?'<h3>In this edition</h3><ul>'+view.keyPoints.map(k=>'<li>'+esc(k)+'</li>').join('')+'</ul>':'')+(view.standfirst?'<p><em>'+esc(view.standfirst)+'</em></p>':'')+editionBodyHtml(a,view,paras);
    onSaveToLibrary({title:view.headline||a.title,html:body,text:paras.join('\n\n'),words,image:thumbOf(a),standfirst:view.standfirst,lang,videoId:a.videoId});
    setPanel(null);
  };
  const chip=(on,label,onClick,key)=>h('button',{key:key||label,onClick,className:'act95',style:{flexShrink:0,padding:'7px 12px',borderRadius:16,fontSize:13,fontWeight:600,background:on?ink:'transparent',color:on?bg:ink,border:'1px solid '+(on?ink:rule)}},label);
  const sheet=(title,children)=>h('div',{style:{position:'absolute',inset:0,zIndex:5}},
    h('div',{onClick:()=>setPanel(null),style:{position:'absolute',inset:0,background:'rgba(0,0,0,.35)'}}),
    h('div',{style:{position:'absolute',left:0,right:0,bottom:0,background:bg,color:ink,borderRadius:'16px 16px 0 0',padding:'12px 18px calc(18px + env(safe-area-inset-bottom))',maxHeight:'75%',overflowY:'auto',boxShadow:'0 -10px 40px rgba(0,0,0,.3)',fontFamily:"'Inter',-apple-system,system-ui,sans-serif"}},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}},h('div',{style:{fontSize:17,fontWeight:700}},title),h('button',{onClick:()=>setPanel(null),'aria-label':'Close',style:{color:ink,display:'flex',padding:4}},Icons.x(19))),
      children));
  const row=(label,sub,onClick,icon)=>h('button',{onClick,className:'act98',style:{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'12px 0',borderBottom:'1px solid '+rule,color:ink}},
    icon?h('span',{style:{display:'flex',opacity:.8}},icon):null,h('span',{style:{flex:1}},h('span',{style:{display:'block',fontSize:15,fontWeight:600}},label),sub?h('span',{style:{display:'block',fontSize:12,opacity:.65,marginTop:2}},sub):null));
  const tbtn=(icon,label,onClick)=>h('button',{onClick,'aria-label':label,className:'act90',style:{display:'flex',alignItems:'center',justifyContent:'center',width:38,height:38,color:ink,flexShrink:0}},icon);
  const tabs=langs.concat(['+']);
  const node=h('div',{style:{position:'fixed',inset:0,zIndex:400,background:bg,color:ink,display:'flex',flexDirection:'column'}},
    h('style',null,'.ed-drop::first-letter{float:left;font-family:'+HEAD+';font-weight:900;font-size:'+Math.round(size*3.3)+'px;line-height:.85;margin:4px 8px 0 0;color:'+accent+'}.ed-paper mark.ed-find{background:rgba(255,149,0,.28);box-shadow:0 0 0 1px rgba(255,149,0,.45)}.ed-paper mark.ed-cur{background:rgba(255,149,0,.75)}.ed-paper mark.ed-flash{animation:edfl 1.3s ease}@keyframes edfl{0%,60%{background:rgba(255,149,0,.8)}}.ed-paper mark{background:rgba(255,214,10,.45);color:inherit;border-radius:2px;padding:0 1px}.ed-paper ::selection{background:rgba(255,214,10,.5)}.ed-paper,.ed-paper *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}'),
    /* toolbar */
    h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:2,padding:'calc(4px + env(safe-area-inset-top)) 6px 4px',borderBottom:'1px solid '+rule,fontFamily:"'Inter',-apple-system,system-ui,sans-serif"}},
      tbtn(Icons.x(21),'Close',onClose),
      h('button',{onClick:()=>setPanel('lang'),'aria-label':'Language & translate',className:'act95',style:{display:'flex',alignItems:'center',gap:5,height:32,padding:'0 9px',borderRadius:16,border:'1px solid '+rule,color:ink,flexShrink:0}},
        EdIcons.lang(18),h('span',{style:{fontSize:12.5,fontWeight:700}},lang==='orig'?'Original':((GT_LANGS.find(x=>x[0]===lang)||[lang,lang.slice(0,2)])[1]).toUpperCase())),
      h('div',{style:{flex:1}}),
      tbtn(EdIcons.find(19),'Find in edition',()=>setFind(f=>f?null:{q:'',idx:0})),
      tbtn(EdIcons.marker(20),'Notes & highlights',()=>setNh(hls.length&&!note.trim()?'hl':'notes')),
      tbtn(Icons.menu?Icons.menu(19):'☰','Contents',()=>setPanel('contents')),
      tbtn(h('span',{style:{fontFamily:'Georgia,serif',fontSize:18,fontWeight:600}},'Aa'),'Appearance',()=>setPanel('aa')),
      tbtn(Icons.download(19),'Download',()=>setPanel('download')),
      tbtn(Icons.dots(19),'More',()=>setPanel('more'))),
    h('div',{style:{height:2.5,background:rule,flexShrink:0}},h('div',{style:{height:'100%',width:(prog*100)+'%',background:accent,transition:'width 120ms'}})),
    find?h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderBottom:'1px solid '+rule,fontFamily:"'Inter',system-ui,sans-serif"}},
      h('div',{style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:7,border:'1px solid '+rule,borderRadius:10,padding:'6px 10px'}},
        h('span',{style:{display:'flex',opacity:.6}},EdIcons.find(15)),
        h('input',{autoFocus:true,value:find.q,onChange:e=>setFind({q:e.target.value,idx:0}),onKeyDown:e=>{if(e.key==='Enter'&&findHits.length)setFind(f=>({...f,idx:(f.idx+1)%findHits.length}))},placeholder:'Find in edition',enterKeyHint:'search',
          style:{flex:1,minWidth:0,border:'none',background:'transparent',color:ink,fontSize:16,outline:'none',padding:0}}),
        h('span',{style:{fontSize:12,opacity:.65,flexShrink:0}},find.q.trim().length>1?(findHits.length?(find.idx+1)+' of '+findHits.length:'No matches'):'')),
      tbtn(EdIcons.up(18),'Previous match',()=>findHits.length&&setFind(f=>({...f,idx:(f.idx-1+findHits.length)%findHits.length}))),
      tbtn(EdIcons.down(18),'Next match',()=>findHits.length&&setFind(f=>({...f,idx:(f.idx+1)%findHits.length}))),
      tbtn(Icons.x(17),'Close find',()=>setFind(null))):null,
    pdfBusy?h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:9,padding:'8px 14px',fontSize:12.5,fontFamily:"'Inter',system-ui,sans-serif",borderBottom:'1px solid '+rule}},h(Spinner,{T,size:13}),pdfBusy):null,
    busy||err?h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:9,padding:'8px 14px',fontSize:12.5,fontFamily:"'Inter',system-ui,sans-serif",background:err?'rgba(179,38,30,.1)':'transparent',color:err?accent:ink,borderBottom:'1px solid '+rule}},
      busy?h(Spinner,{T,size:13}):null,busy||err,err?h('button',{onClick:()=>setErr(''),style:{marginLeft:'auto',color:ink,display:'flex'}},Icons.x(14)):null):null,
    /* the paper */
    h('div',{ref:scRef,onScroll,className:'ed-paper',style:{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',fontFamily:font,WebkitUserSelect:'text',userSelect:'text'}},
      !paras.length?h('div',{style:{padding:40,textAlign:'center',fontFamily:"'Inter',system-ui",opacity:.7}},'No transcript yet — paste one first.'):
      h('article',{style:{maxWidth:760,margin:'0 auto',padding:'18px 18px 60px'}},
        h('header',{style:{textAlign:'center',marginBottom:12}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:10,fontFamily:"'Inter',system-ui",fontSize:10.5,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',opacity:.7,borderBottom:'1px solid '+rule,paddingBottom:6}},
            h('span',null,dateLine(Date.now())),h('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},a.author||a.source||'')),
          h('div',{style:{fontFamily:HEAD,fontWeight:900,fontSize:31,letterSpacing:'-.01em',margin:'9px 0 6px',lineHeight:1.05}},'The Daily Transcript'),
          h('div',{style:{borderTop:'3px double '+ink}})),
        view.kicker?h('div',{style:{fontFamily:"'Inter',system-ui",fontSize:11.5,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:accent,margin:'16px 0 8px'}},view.kicker):null,
        h('h1',{style:{fontFamily:HEAD,fontWeight:900,fontSize:Math.round(size*1.7),lineHeight:1.12,letterSpacing:'-.015em',margin:'6px 0 12px'}},view.headline||a.title),
        view.standfirst?h('p',{style:{fontStyle:'italic',fontSize:Math.round(size*1.1),lineHeight:1.5,margin:'0 0 12px',opacity:.9}},view.standfirst):null,
        h('div',{style:{fontFamily:"'Inter',system-ui",fontSize:12.5,opacity:.75,borderTop:'1px solid '+rule,borderBottom:'1px solid '+rule,padding:'7px 0',marginBottom:16}},
          'From ',h('b',null,a.author||a.source||'YouTube'),(lang!=='orig'?' · '+lang+' edition':'')+' · '+Math.max(1,Math.round(words/230))+' min read'+(view.plain?'':' · laid out by AI')),
        thumbOf(a)?h('figure',{style:{margin:'0 0 16px'}},
          h('img',{src:thumbOf(a),alt:'',style:{width:'100%',display:'block',filter:'saturate(.92)'}}),
          h('figcaption',{style:{fontStyle:'italic',fontSize:12.5,opacity:.75,marginTop:6}},a.title,onOpenVideo?h('button',{onClick:onOpenVideo,style:{color:accent,fontStyle:'normal',fontWeight:600,marginLeft:6,fontSize:12.5}},'▶ Watch'):null)):null,
        (view.keyPoints||[]).length?h('aside',{style:{border:'1px solid '+rule,borderLeft:'4px solid '+accent,padding:'12px 14px',margin:'0 0 18px'}},
          h('div',{style:{fontFamily:"'Inter',system-ui",fontSize:11,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:accent,marginBottom:8}},'In this edition'),
          h('ul',{style:{margin:0,paddingLeft:18}},view.keyPoints.map((k,i)=>h('li',{key:i,style:{margin:'4px 0',lineHeight:1.45,fontSize:Math.round(size*.92)}},k)))):null,
        h('div',null,
          paras.map((p,i)=>h(Fragment,{key:i},
            starts[i]&&i>0?h('h2',{'data-p':i,style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(size*1.15),margin:'1.3em 0 .5em',paddingTop:'.5em',borderTop:'1px solid '+rule,breakAfter:'avoid'}},starts[i]):null,
            h('p',{'data-p':starts[i]&&i>0?undefined:i,'data-i':i,className:i===0?'ed-drop':undefined,style:{fontSize:size,lineHeight:1.62,margin:'0 0 .9em',textAlign:'left',hyphens:'auto',WebkitHyphens:'auto',
              opacity:prefs.focus&&i!==focusIdx?.28:1,transition:'opacity 260ms'}},marked(p,i)),
            (quotes[i]||[]).map((q,k)=>h('blockquote',{key:k,style:{margin:'1em 0',padding:'.6em 0',borderTop:'2px solid '+ink,borderBottom:'1px solid '+rule,fontFamily:HEAD,fontStyle:'italic',fontSize:Math.round(size*1.28),lineHeight:1.3,breakInside:'avoid'}},
              h('span',{style:{color:accent,fontSize:'1.6em',lineHeight:0,verticalAlign:'-.35em',marginRight:4}},'“'),q))))),
        h('div',{style:{textAlign:'center',fontFamily:"'Inter',system-ui",fontSize:12,fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',opacity:.55,marginTop:24}},'— End of edition —'),
        h('div',{style:{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:16,fontFamily:"'Inter',system-ui"}},
          chip(false,'⤓ Download',()=>setPanel('download')),chip(false,'Notes & highlights',()=>setNh('notes')),view.plain?chip(false,'✦ Lay out with AI',()=>build(true)):null))),
    /* selection / highlight bar */
    !selBar&&paras.length?h('div',{style:{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:'calc(12px + env(safe-area-inset-bottom))',zIndex:3,padding:'6px 12px',borderRadius:16,
      background:bg,border:'1px solid '+rule,boxShadow:'0 4px 16px rgba(0,0,0,.12)',fontFamily:"'Inter',system-ui,sans-serif",fontSize:12,fontWeight:600,whiteSpace:'nowrap',pointerEvents:'none',opacity:.92}},
      words.toLocaleString()+' words · '+Math.round(prog*100)+'% read · '+(prog>=.99?'done':Math.max(1,Math.round(words*(1-prog)/230))+' min left')):null,
    selBar?h('div',{style:{position:'absolute',left:8,right:8,bottom:'calc(14px + env(safe-area-inset-bottom))',zIndex:4,display:'flex',gap:7,justifyContent:'center',alignItems:'center',flexWrap:'wrap',fontFamily:"'Inter',system-ui"}},
      selBar.text?h(Fragment,null,
        h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>addHl(selBar.text,selBar.para,selBar.parts),className:'act95',style:{padding:'10px 16px',borderRadius:20,background:ink,color:bg,fontWeight:650,fontSize:14,boxShadow:'0 6px 20px rgba(0,0,0,.25)'}},'Highlight'),
        h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>addToNotes(selBar.text),className:'act95',style:{padding:'10px 14px',borderRadius:20,background:bg,color:ink,border:'1px solid '+rule,fontWeight:650,fontSize:14,boxShadow:'0 6px 20px rgba(0,0,0,.12)'}},'+ Notes'),
        h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>{copyText(selBar.text);toastFn('Copied')},className:'act95',style:{padding:'10px 14px',borderRadius:20,background:bg,color:ink,border:'1px solid '+rule,fontWeight:600,fontSize:14}},'Copy'),
        h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>openGoogleTranslate(selBar.text,lang==='orig'?((GT_LANGS.find(x=>x[0]===((S&&S.aiLang)||'Telugu'))||['','te'])[1]):'en'),'aria-label':'Translate in Google Translate',className:'act95',
          style:{width:42,height:42,borderRadius:21,background:bg,color:ink,border:'1px solid '+rule,display:'flex',alignItems:'center',justifyContent:'center'}},EdIcons.lang(19)))
      :h(Fragment,null,
        h('button',{onClick:()=>delHl(selBar.remove),className:'act95',style:{padding:'10px 16px',borderRadius:20,background:ink,color:bg,fontWeight:650,fontSize:14}},'Remove highlight'),
        h('button',{onClick:()=>setSelBar(null),className:'act95',style:{padding:'10px 16px',borderRadius:20,background:bg,color:ink,border:'1px solid '+rule,fontWeight:600,fontSize:14}},'Cancel'))):null,
    /* panels */
    panel==='aa'?sheet('Appearance',h(Fragment,null,
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'4px 0 8px'}},'Font'),
      h('div',{className:'sx',style:{display:'flex',gap:7,overflowX:'auto'}},FONTS.map(([id,l,f])=>h('button',{key:id,onClick:()=>setP({font:id}),className:'act95',style:{flexShrink:0,padding:'8px 13px',borderRadius:12,fontFamily:f+INDIC,fontSize:15,background:prefs.font===id?ink:'transparent',color:prefs.font===id?bg:ink,border:'1px solid '+(prefs.font===id?ink:rule)}},l))),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 6px'}},'Text size · '+size+'px'),
      h('div',{style:{display:'flex',alignItems:'center',gap:10}},h('span',{style:{fontSize:13}},'A'),h('input',{type:'range',min:14,max:28,step:1,value:size,onChange:e=>setP({size:Number(e.target.value)}),style:{flex:1,accentColor:accent}}),h('span',{style:{fontSize:20}},'A')),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 8px'}},'Paper'),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},THEMES.map(t=>h('button',{key:t[0],onClick:()=>setP({theme:t[0]}),className:'act95',style:{display:'flex',alignItems:'center',gap:7,padding:'7px 12px',borderRadius:12,background:t[2],color:t[3],border:'2px solid '+(prefs.theme===t[0]?accent:t[4]),fontSize:13.5,fontWeight:600}},t[1]))),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 8px'}},'Reading'),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        chip(!!prefs.focus,(prefs.focus?'✓ ':'')+'Focus mode',()=>{setP({focus:!prefs.focus});setTimeout(onScroll,30)},'focus'),
        chip(!!prefs.awake,(prefs.awake?'✓ ':'')+'Keep screen awake',()=>{if(!navigator.wakeLock&&!prefs.awake)toastFn('This iOS version can’t keep the screen awake');setP({awake:!prefs.awake})},'awake')),
      h('div',{style:{fontSize:12,opacity:.6,marginTop:8,lineHeight:1.45}},'Focus mode dims everything except the paragraph you’re reading.'))):null,
    panel==='contents'?sheet('Contents',h(Fragment,null,
      (view.sections||[]).length?view.sections.map((s,i)=>row((i+1)+'. '+s.heading,null,()=>jump(s.start-1))):h('div',{style:{fontSize:13.5,opacity:.7,padding:'8px 0'}},'This edition has no sections yet.'+(view.plain?' Tap “Lay out with AI” for headings.':'')),
      row('Back to the top',null,()=>{scRef.current&&scRef.current.scrollTo({top:0,behavior:'smooth'});setPanel(null)}),
      (view.keyPoints||[]).length?h('div',{style:{marginTop:14}},h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,marginBottom:6}},'Key points'),view.keyPoints.map((k,i)=>h('div',{key:i,style:{fontSize:14,lineHeight:1.45,margin:'5px 0'}},'• '+k))):null)):null,
    panel==='download'?sheet('Download this edition',h(Fragment,null,
      row('PDF — exact look','Pages exactly as you see them, with highlights; any language. Share → Save to Files',()=>makePdf('img'),Icons.download(19)),
      nonLatin(paras.join(' ').slice(0,4000)+(view.headline||''))?row('PDF — selectable text','Not available for Telugu / Hindi text — use the exact look',()=>toastFn('Use “PDF — exact look” for this language'),Icons.file?Icons.file(19):Icons.download(19))
        :row('PDF — selectable text','Real text you can search and copy, plus your highlights and notes at the end',()=>makePdf('txt'),Icons.file?Icons.file(19):Icons.download(19)),
      row('HTML file','A single file with this layout and fonts; opens offline in any browser',()=>{setPanel(null);(window.InstaShields?window.InstaShields.downloadText:dl)(fileBase+'.html',html(),'text/html')},Icons.file?Icons.file(19):Icons.download(19)),
      row('Save to my library','A copy in Home with highlights, notes and listen-aloud — also on the Editions shelf',saveCopy,Icons.plus(19)))):null,
    panel==='more'?sheet('Edition',h(Fragment,null,
      row(view.plain?'Lay out with AI':'Lay out again with AI','New headline, sections and pull quotes',()=>{setPanel(null);build(true)},Icons.ai(19)),
      row('Notes & highlights','Your notepad and every highlight',()=>{setPanel(null);setNh('notes')},Icons.notes?Icons.notes(19):null),
      row('Copy transcript',lang==='orig'?'The original text':lang+' text',()=>{copyText(text);toastFn('Transcript copied');setPanel(null)},Icons.copy(19)),
      a.url?row('Share the video',null,()=>{shareText(view.headline||a.title,'',a.url);setPanel(null)},Icons.share(19)):null)):null,
    panel==='lang'?sheet('Language',h(Fragment,null,
      langs.map(k=>row(k==='orig'?'Original':k+' edition',k===lang?'Reading now':null,()=>{setLang(k);setPanel(null)},k===lang?Icons.check(18):h('span',{style:{width:18}}))),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 4px'}},'Translate with Google Translate'),
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:7,padding:'6px 0'}},GT_LANGS.filter(([n])=>!langs.includes(n)).map(([n,c])=>chip(false,n,()=>startGt(n,c),c))),
      h('div',{style:{fontSize:12,opacity:.65,marginTop:8,lineHeight:1.5}},'Opens the Google Translate app with the text (it’s also copied). Copy the translation there, come back and tap “Paste translation”. Each language becomes its own edition.'))):null,
    gt?h('div',{style:{position:'absolute',inset:0,zIndex:6,background:bg,color:ink,display:'flex',flexDirection:'column',fontFamily:"'Inter',-apple-system,system-ui,sans-serif"}},
      h('div',{style:{display:'flex',alignItems:'center',gap:6,padding:'calc(6px + env(safe-area-inset-top)) 8px 8px',borderBottom:'1px solid '+rule}},
        tbtn(Icons.back(21),'Back',()=>setGt(null)),h('div',{style:{flex:1,fontSize:16.5,fontWeight:700}},'Translate to '+gt.lang),
        h('span',{style:{fontSize:12.5,opacity:.7,paddingRight:8}},gt.parts.filter(p2=>p2.out).length+' / '+gt.parts.length)),
      h('div',{style:{flex:1,overflowY:'auto',padding:'12px 16px calc(24px + env(safe-area-inset-bottom))'}},
        h('div',{style:{fontSize:13,lineHeight:1.5,opacity:.8,marginBottom:12}},gt.parts.length>1?'Google Translate takes up to 5,000 characters at a time, so the transcript is split into '+gt.parts.length+' parts. For each part:':'Three steps:',
          h('ol',{style:{margin:'6px 0 0',paddingLeft:20}},h('li',null,'Tap ',h('b',null,'Open in Google Translate')),h('li',null,'In Google Translate, tap the ',h('b',null,'copy'),' icon under the translation'),h('li',null,'Come back and tap ',h('b',null,'Paste translation')))),
        gt.parts.map((p2,i)=>h('div',{key:i,style:{border:'1px solid '+rule,borderRadius:14,padding:12,marginBottom:10,background:p2.out?'rgba(52,199,89,.08)':'transparent'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},h('b',{style:{fontSize:14}},'Part '+(i+1)),h('span',{style:{fontSize:12,opacity:.6}},p2.src.length.toLocaleString()+' characters'),
            p2.out?h('span',{style:{marginLeft:'auto',fontSize:12.5,fontWeight:700,color:'#2e9e4f'}},'✓ Translated'):null),
          h('div',{style:{fontSize:13,opacity:.75,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},p2.out||p2.src),
          gt.manual===i?h('textarea',{autoFocus:true,rows:4,placeholder:'Paste the translation here',onBlur:e=>{const v=e.target.value.trim();if(v)setGt(g=>({...g,parts:g.parts.map((q2,k)=>k===i?{...q2,out:v}:q2),manual:null}))},
            style:{width:'100%',boxSizing:'border-box',marginTop:8,padding:10,borderRadius:10,border:'1px solid '+rule,background:'transparent',color:ink,fontSize:15}}):null,
          h('div',{style:{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}},
            chip(false,'Open in Google Translate',()=>openGoogleTranslate(p2.src,gt.code),'o'+i),chip(!!p2.out,p2.out?'Paste again':'Paste translation',()=>pastePart(i),'p'+i)),
          h('button',{onClick:()=>openGoogleTranslate(p2.src,gt.code,true),style:{marginTop:8,fontSize:12,color:ink,opacity:.6,textDecoration:'underline'}},'App didn’t open? Use translate.google.com'))),
        h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:6}},
          h('button',{onClick:finishGt,disabled:!gt.parts.every(p2=>p2.out),className:'act95',style:{padding:'11px 18px',borderRadius:22,background:ink,color:bg,fontWeight:700,fontSize:14.5,opacity:gt.parts.every(p2=>p2.out)?1:.4}},'Save '+gt.lang+' edition')))):null,
    nh?h('div',{style:{position:'absolute',inset:0,zIndex:6,background:bg,color:ink,display:'flex',flexDirection:'column',fontFamily:"'Inter',-apple-system,system-ui,sans-serif"}},
      h('div',{style:{display:'flex',alignItems:'center',gap:6,padding:'calc(6px + env(safe-area-inset-top)) 8px 8px'}},
        tbtn(Icons.back(21),'Back to the edition',()=>{saveNote(note);setNh(null)}),h('div',{style:{flex:1,fontSize:17,fontWeight:700}},'Notes & highlights'),
        tbtn(Icons.copy(20),'Copy notes and all highlights',copyAll)),
      h('div',{style:{display:'flex',gap:4,margin:'0 14px 10px',padding:3,borderRadius:12,border:'1px solid '+rule}},
        [['notes','Notes'],['hl','Highlights · '+hls.length]].map(([k,l])=>h('button',{key:k,onClick:()=>setNh(k),style:{flex:1,padding:'8px 6px',borderRadius:9,fontSize:14,fontWeight:650,background:nh===k?ink:'transparent',color:nh===k?bg:ink}},l))),
      nh==='notes'?h('div',{style:{flex:1,display:'flex',flexDirection:'column',padding:'0 14px calc(14px + env(safe-area-inset-bottom))',minHeight:0}},
          h('textarea',{ref:noteRef,value:note,onChange:e=>editNote(e.target.value),onBlur:()=>saveNote(note),placeholder:'Thoughts, takeaways, things to look up… Select text in the edition and tap “Add to notes” to collect quotes here.',
            style:{flex:1,width:'100%',boxSizing:'border-box',padding:14,borderRadius:14,border:'1px solid '+rule,background:'transparent',color:ink,fontFamily:font,fontSize:Math.max(16,size-1),lineHeight:1.55,resize:'none'}}),
          h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:10}},
            h('span',{style:{fontSize:12,opacity:.6,flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},(note.trim()?note.trim().split(/\s+/).length:0)+' words · saved'),
            [['top',Icons.toTop(17),'Scroll to top'],['bottom',Icons.toBottom(17),'Scroll to bottom']].map(([k,ic,l])=>h('button',{key:k,onClick:()=>{const t=noteRef.current;if(t)t.scrollTo({top:k==='top'?0:t.scrollHeight,behavior:'smooth'})},'aria-label':l,title:l,className:'act90',
              style:{display:'flex',alignItems:'center',justifyContent:'center',width:32,height:32,borderRadius:16,border:'1px solid '+rule,color:ink,flexShrink:0}},ic)),
            chip(false,'Copy',()=>{copyText(note);toastFn('Notes copied')},'cp'),chip(false,'Share',()=>shareText((view.headline||a.title)+' — notes',note,''),'sh')))
      :h('div',{style:{flex:1,overflowY:'auto',padding:'0 14px calc(20px + env(safe-area-inset-bottom))'}},
          hls.length>1?h('div',{style:{display:'flex',justifyContent:'flex-end',paddingBottom:4}},
            h('button',{onClick:flipHlSort,className:'act95',style:{display:'flex',alignItems:'center',gap:5,fontSize:12.5,fontWeight:650,color:ink,opacity:.75,padding:'4px 0'}},Icons.sort(14),hlSort==='new'?'Newest first':'Oldest first')):null,
          hls.length?hls.slice().sort((x,y)=>hlSort==='new'?(y.createdAt||0)-(x.createdAt||0):(x.createdAt||0)-(y.createdAt||0)).map(x=>h('div',{key:x.id,style:{padding:'12px 0',borderBottom:'1px solid '+rule}},
            h('button',{onClick:()=>jumpHl(x),style:{display:'block',width:'100%',textAlign:'left',color:ink,fontFamily:font,fontSize:15.5,lineHeight:1.5}},
              (x.parts&&x.parts.length?x.parts.map(pt=>pt.text):[x.text]).map((t,k)=>h('span',{key:k,style:{display:'block',marginTop:k?10:0}},h('span',{style:{background:'rgba(255,214,10,.35)',borderRadius:2,padding:'1px 2px',WebkitBoxDecorationBreak:'clone',boxDecorationBreak:'clone'}},t)))),
            h('div',{style:{display:'flex',alignItems:'center',gap:14,marginTop:8,fontSize:12.5}},
              h('span',{style:{opacity:.55,flex:1}},(x.lang&&x.lang!=='orig'?x.lang+' · ':'')+(x.createdAt?new Date(x.createdAt).toLocaleDateString([],{day:'numeric',month:'short'}):'')),
              h('button',{onClick:()=>jumpHl(x),style:{color:accent,fontWeight:650}},'Go to'),
              h('button',{onClick:()=>addToNotes(x.text),style:{color:ink,fontWeight:650,opacity:.8}},'+ Notes'),
              h('button',{onClick:()=>{copyText(x.text);toastFn('Copied')},'aria-label':'Copy highlight',title:'Copy',style:{color:ink,opacity:.7,display:'flex'}},Icons.copy(15)),
              h('button',{onClick:()=>delHl(x.id),'aria-label':'Remove highlight',style:{color:ink,opacity:.55,display:'flex'}},Icons.x(15)))))
          :h('div',{style:{textAlign:'center',opacity:.65,fontSize:14,lineHeight:1.55,padding:'40px 20px'}},'No highlights yet. Select text in the edition and tap Highlight.'))):null);
  return ReactDOM.createPortal(node,document.body);
}
function dl(name,text,type){const b=new Blob([text],{type});const u=URL.createObjectURL(b);const x=document.createElement('a');x.href=u;x.download=name;document.body.appendChild(x);x.click();setTimeout(()=>{URL.revokeObjectURL(u);x.remove()},1500)}

/* ============================== Editions shelf ============================== */
function EditionsShelf({T,articles,onOpen,papers,onOpenPaper,onCombine}){
  const list=(articles||[]).filter(a=>a.isVideo&&a.transcript&&String(a.transcript).trim())
    .map(a=>{const eds=a.editions||{};const latest=Object.keys(eds).reduce((m,k)=>Math.max(m,eds[k].at||0),0);return{a,at:latest||a.transcriptAt||0,ed:eds.orig||eds[Object.keys(eds)[0]]}})
    .sort((x,y)=>y.at-x.at).slice(0,20);
  if(!list.length&&!(papers&&papers.length))return null;
  const SERIF="'Playfair Display'"+INDIC;
  return h('div',{style:{padding:'14px 0 4px'}},
    h('div',{style:{display:'flex',alignItems:'baseline',justifyContent:'space-between',padding:'0 16px 10px'}},
      h('div',{style:{fontSize:19,fontWeight:700,fontFamily:"ui-serif,'New York',Georgia,serif"}},'Editions'),
      h('div',{style:{display:'flex',alignItems:'center',gap:10}},
        h('div',{style:{fontSize:12,color:T.sub}},((papers||[]).length?papers.length+' paper'+(papers.length>1?'s':'')+' · ':'')+list.length+' edition'+(list.length===1?'':'s')),
        onCombine&&((papers||[]).length||list.length>1)?h('button',{onClick:onCombine,className:'act95',style:{fontSize:12.5,fontWeight:700,color:T.accent,padding:'4px 10px',borderRadius:12,background:T.card}},'Combine'):null)),
    h('div',{className:'sx',style:{display:'flex',gap:12,overflowX:'auto',padding:'0 16px 6px'}},
      PapersShelfCards({T,papers,onOpen:onOpenPaper}),
      list.map(({a,ed})=>h('button',{key:a.id,onClick:()=>onOpen(a.id),className:'act98',style:{flexShrink:0,width:200,textAlign:'left',background:T.card,color:T.fg,borderRadius:10,padding:'10px 12px 12px',border:'1px solid '+T.hair}},
        h('div',{style:{textAlign:'center',fontFamily:SERIF,fontWeight:900,fontSize:13,borderBottom:'2px double '+T.fg,paddingBottom:4,marginBottom:7}},'The Daily Transcript'),
        h('div',{style:{fontFamily:SERIF,fontWeight:800,fontSize:15,lineHeight:1.2,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},(ed&&ed.headline)||a.title),
        h('div',{style:{fontSize:11,color:T.sub,marginTop:6,fontFamily:"'Inter',system-ui",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(a.author||a.source||'')+(ed?'':' · tap to lay out'))))));
}


/* ============================== the daily paper ==============================
   You tick today's videos; each ticked video needs a transcript (Get opens youtubetotranscript for
   that video, Paste saves what you copied). "Make the paper" writes a short news story per video
   with AI — headline, standfirst, ~250 words, key points, one verbatim quote — strictly from its
   transcript, and binds them into one paper: date and time made, contents grouped by channel, each
   story with its channel and time, and the full transcript under every story. */
async function buildStory(S,a,onStatus){
  const paras=paragraphsOf(a.transcript||'');
  const full=paras.join('\n\n');
  const eng=typeof translateEngine==='function'?translateEngine(S):null;
  const plain=()=>{const first=(paras[0]||'').split(/(?<=[.!?।])\s+/)[0]||'';const w=full.split(/\s+/);
    return{plain:true,headline:a.title,standfirst:first.slice(0,220),story:w.slice(0,230).join(' ')+(w.length>230?'…':''),keyPoints:[],quote:''}};
  if(!eng)return plain();
  const language={te:'Telugu',hi:'Hindi',en:'English'}[scriptOf(full.slice(0,4000))];
  const src=full.length>24000?full.slice(0,24000)+'…':full;
  const out=await aiChat(eng,[
    {role:'system',content:'You are a reporter at a quality daily newspaper. You write only from the transcript you are given — never add facts, names or numbers that are not in it. Reply with JSON only.'},
    {role:'user',content:'Turn this video transcript into a newspaper story, written in '+language+'.\nVideo: "'+(a.title||'')+'"'+(a.author?' — channel: '+a.author:'')+'\n\nReturn exactly: {"headline": "at most 12 words", "standfirst": "one sentence", "story": "a 200-260 word news story in 3-5 short paragraphs separated by blank lines", "keyPoints": ["3 short takeaways"], "quote": "one striking sentence copied word for word from the transcript"}\n\nTranscript:\n'+src}],
    1800,m=>onStatus&&onStatus(m));
  const j=looseJSON(out);
  let quote=String(j.quote||'').trim().replace(/^["“'‘]|["”'’]$/g,'');
  if(quote&&!norm(full).includes(norm(quote)))quote='';
  return{headline:String(j.headline||a.title).trim().slice(0,160),standfirst:String(j.standfirst||'').trim().slice(0,300),story:String(j.story||'').trim(),
    keyPoints:(Array.isArray(j.keyPoints)?j.keyPoints:[]).map(x=>String(x).trim()).filter(Boolean).slice(0,4),quote,model:typeof aiModelLabel==='function'?aiModelLabel(eng):''};
}
const ytThumb=id=>id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';
const vidOf=u=>{const m=String(u||'').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);return m?m[1]:''};
const timeOf=t=>t?new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
function PaperBuilder({T,S,posts,articles,ensure,patchArticle,onBuilt,onClose,toastFn}){
  const byVid=vid=>(articles||[]).find(x=>!x.isEdition&&x.videoId===vid);
  const rows=posts.map(p=>{const vid=vidOf(p.e.url);const a=byVid(vid);return{p,vid,a,ready:!!(a&&a.transcript&&String(a.transcript).trim())}});
  const [ticked,setTicked]=useState(()=>new Set(rows.filter(r=>r.ready).map(r=>r.vid)));
  const [busy,setBusy]=useState('');const [stop,setStop]=useState(false);const stopRef=useRef(false);
  const tick=v=>setTicked(s=>{const n=new Set(s);n.has(v)?n.delete(v):n.add(v);return n});
  const readyTicked=rows.filter(r=>ticked.has(r.vid)&&r.ready);
  const waiting=rows.filter(r=>ticked.has(r.vid)&&!r.ready);
  const get=r=>{copyText(r.p.e.url);openExternalUrl('https://youtubetotranscript.com/transcript?v='+r.vid);toastFn('Copy the transcript there, come back and tap Paste')};
  const paste=async r=>{
    let t='';try{t=await navigator.clipboard.readText()}catch(err){}
    if(!t||t.trim().length<80){const m=window.prompt('Paste the transcript for “'+(r.p.e.title||'this video')+'”');t=m||''}
    if(t.trim().length<80){toastFn('That doesn’t look like a transcript');return}
    const id=r.a?r.a.id:ensure(r.p.e,r.p.it.name);if(!id)return;
    patchArticle(id,{transcript:t.trim(),transcriptSrc:'YouTubeToTranscript',transcriptAt:Date.now()});
    setTicked(s=>new Set(s).add(r.vid));toastFn('Transcript saved');
  };
  const make=async()=>{
    if(!readyTicked.length)return;
    stopRef.current=false;setStop(false);
    const stories=[];
    for(let k=0;k<readyTicked.length;k++){
      if(stopRef.current)break;
      const r=readyTicked[k];const a=byVid(r.vid);if(!a)continue;
      setBusy('Writing story '+(k+1)+' of '+readyTicked.length+' — '+(a.title||'').slice(0,60));
      let st;try{st=await buildStory(S,a,m=>setBusy('Story '+(k+1)+' of '+readyTicked.length+': '+m))}catch(err){st=null}
      if(!st){const first=paragraphsOf(a.transcript||'');st={plain:true,headline:a.title,standfirst:'',story:first.slice(0,3).join('\n\n'),keyPoints:[],quote:''}}
      stories.push(Object.assign({articleId:a.id,videoId:r.vid,channel:r.p.it.name||a.author||'',publishedMs:r.p.e.publishedMs||a.publishedAt||0,title:a.title},st));
      if(k<readyTicked.length-1&&!stopRef.current)await new Promise(res=>setTimeout(res,900)); // stay under free-tier per-minute limits
    }
    setBusy('');
    if(!stories.length){toastFn('No stories were written');return}
    onBuilt({id:uid(),at:Date.now(),date:new Date().toDateString(),stories});
  };
  return ReactDOM.createPortal(h('div',{style:{position:'fixed',inset:0,zIndex:400,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'calc(8px + env(safe-area-inset-top)) 12px 8px',borderBottom:'1px solid '+T.hair}},
      h('button',{onClick:onClose,'aria-label':'Close',className:'act90',style:{display:'flex',color:T.fg,padding:6}},Icons.x(21)),
      h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:17,fontWeight:750}},'Make today’s paper'),
        h('div',{style:{fontSize:12,color:T.sub}},dateLine(Date.now())+' · '+ticked.size+' ticked · '+readyTicked.length+' ready'))),
    h('div',{style:{display:'flex',gap:8,padding:'10px 14px',flexWrap:'wrap'}},
      h('button',{onClick:()=>setTicked(new Set(rows.map(r=>r.vid))),className:'act95',style:{padding:'6px 12px',borderRadius:14,border:'1px solid '+T.hair,fontSize:12.5,fontWeight:600,color:T.fg}},'Tick all'),
      h('button',{onClick:()=>setTicked(new Set(rows.filter(r=>r.ready).map(r=>r.vid))),className:'act95',style:{padding:'6px 12px',borderRadius:14,border:'1px solid '+T.hair,fontSize:12.5,fontWeight:600,color:T.fg}},'Only ready'),
      h('button',{onClick:()=>setTicked(new Set()),className:'act95',style:{padding:'6px 12px',borderRadius:14,border:'1px solid '+T.hair,fontSize:12.5,fontWeight:600,color:T.fg}},'None')),
    h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,padding:'0 14px 8px'}},'Tick the videos for the paper. Videos without a transcript: tap ',h('b',null,'Get'),' (opens youtubetotranscript on that video), copy the transcript, come back and tap ',h('b',null,'Paste'),'.'),
    h('div',{className:'sy',style:{flex:1,overflowY:'auto',padding:'0 0 12px'}},
      rows.map(r=>h('div',{key:r.vid||r.p.e.url,style:{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderBottom:'1px solid '+T.hair}},
        h('button',{onClick:()=>tick(r.vid),'aria-label':ticked.has(r.vid)?'Untick':'Tick',style:{width:24,height:24,borderRadius:7,flexShrink:0,border:'2px solid '+(ticked.has(r.vid)?T.accent:T.hair),background:ticked.has(r.vid)?T.accent:'transparent',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800}},ticked.has(r.vid)?'✓':''),
        h('img',{src:ytThumb(r.vid),alt:'',loading:'lazy',style:{width:86,aspectRatio:'16 / 9',objectFit:'cover',borderRadius:7,flexShrink:0,background:T.card}}),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:13.5,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},r.p.e.title),
          h('div',{style:{fontSize:11.5,color:T.sub,marginTop:3}},r.p.it.name+' · '+timeOf(r.p.e.publishedMs)),
          r.ready?h('div',{style:{fontSize:11.5,fontWeight:700,color:'#2f9e44',marginTop:3}},'✓ Transcript ready'):
            h('div',{style:{display:'flex',gap:6,marginTop:6}},
              h('button',{onClick:()=>get(r),className:'act95',style:{padding:'5px 11px',borderRadius:12,border:'1px solid '+T.hair,fontSize:12,fontWeight:650,color:T.fg}},'Get ↗'),
              h('button',{onClick:()=>paste(r),className:'act95',style:{padding:'5px 11px',borderRadius:12,background:T.fg,color:T.bg,fontSize:12,fontWeight:650}},'Paste')))))),
    h('div',{style:{borderTop:'1px solid '+T.hair,padding:'10px 14px calc(12px + env(safe-area-inset-bottom))'}},
      busy?h('div',{style:{display:'flex',alignItems:'center',gap:10,fontSize:13,color:T.meta,marginBottom:10}},h(Spinner,{T,size:15}),h('span',{style:{flex:1}},busy),
        h('button',{onClick:()=>{stopRef.current=true;setStop(true)},style:{color:T.danger,fontWeight:600,fontSize:13}},stop?'Stopping…':'Stop')):null,
      waiting.length&&!busy?h('div',{style:{fontSize:12,color:T.sub,marginBottom:8}},waiting.length+' ticked video'+(waiting.length>1?'s':'')+' still need a transcript and will be left out.'):null,
      h('button',{onClick:make,disabled:!readyTicked.length||!!busy,className:'act98',style:{width:'100%',padding:'14px',borderRadius:13,background:readyTicked.length&&!busy?T.fg:T.card,color:readyTicked.length&&!busy?T.bg:T.sub,fontSize:16,fontWeight:700}},
        '📰  Make the paper · '+readyTicked.length+' stor'+(readyTicked.length===1?'y':'ies')),
      h('div',{style:{fontSize:11.5,color:T.sub,textAlign:'center',marginTop:7}},(typeof translateEngine==='function'&&translateEngine(S))?'Each story is written by AI from that video’s transcript only.':'No AI key: stories use the transcript’s opening — add a Gemini/OpenRouter key for written stories.'))),document.body);
}
function paperStoriesHtml(paper,articles,withFull){
  const byId=id=>(articles||[]).find(x=>x.id===id);
  const chans=[];paper.stories.forEach((s,i)=>{let c=chans.find(x=>x.name===s.channel);if(!c){c={name:s.channel,items:[]};chans.push(c)}c.items.push(i)});
  let toc='<nav class="toc"><div class="kh">In today’s paper</div>'+chans.map(c=>'<div class="tc"><div class="tch">'+esc(c.name)+'</div>'+c.items.map(i=>'<a href="#s'+i+'"><span>'+(i+1)+'</span>'+esc(paper.stories[i].headline)+'</a>').join('')+'</div>').join('')+'</nav>';
  let body='';
  paper.stories.forEach((s,i)=>{
    const a=byId(s.articleId);
    body+='<section class="story" id="s'+i+'"><div class="kicker">'+esc(s.channel)+(s.publishedMs?' · '+esc(timeOf(s.publishedMs)):'')+'</div><h2>'+esc(s.headline)+'</h2>'+(s.standfirst?'<p class="stand">'+esc(s.standfirst)+'</p>':'')+
      (s.videoId?'<figure><img src="'+esc(ytThumb(s.videoId))+'" alt=""><figcaption>'+esc(s.title||'')+' — <a href="https://www.youtube.com/watch?v='+esc(s.videoId)+'">watch</a></figcaption></figure>':'')+
      String(s.story||'').split(/\n{2,}/).filter(Boolean).map((p,k)=>'<p'+(i===0&&k===0?' class="drop"':'')+'>'+esc(p)+'</p>').join('')+
      ((s.keyPoints||[]).length?'<aside class="keys"><div class="kh">Key points</div><ul>'+s.keyPoints.map(k=>'<li>'+esc(k)+'</li>').join('')+'</ul></aside>':'')+
      (s.quote?'<blockquote>'+esc(s.quote)+'</blockquote>':'')+
      (withFull&&a&&a.transcript?'<details><summary>Full transcript</summary>'+paragraphsOf(a.transcript).map(p=>'<p>'+esc(p)+'</p>').join('')+'</details>':'')+'</section>';
  });
  return{toc,body};
}
function paperHtml(paper,articles,prefs,withFull){
  const th=themeOf(prefs.theme==='dark'?'paper':prefs.theme);const font=fontOf(prefs.font);
  const {toc,body}=paperStoriesHtml(paper,articles,withFull);
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Daily Transcript — '+esc(dateLine(paper.at))+'</title>'+
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Literata:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600&family=Noto+Serif+Telugu:wght@400;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">'+
    '<style>'+editionCss(th,font,prefs.size||18,prefs.cols||1)+'.toc{border:1px solid '+th[4]+';padding:12px 14px;margin:0 0 20px}.tc{margin:8px 0}.tch{font:700 11px Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:4px}.toc a{display:flex;gap:8px;color:inherit;text-decoration:none;padding:3px 0;font-weight:600}.toc a span{opacity:.5;min-width:18px}.story{border-top:3px double '+th[3]+';padding-top:14px;margin-top:22px;break-inside:avoid-page}.story h2{font-size:'+Math.round((prefs.size||18)*1.5)+'px;border:0;padding:0;margin:4px 0 8px;font-weight:900}details{margin-top:10px}summary{font:600 13px Inter,system-ui,sans-serif;cursor:pointer;opacity:.75}@media print{details{display:none}}</style></head><body><article class="paper">'+
    '<header class="mast"><div class="dl"><span>'+esc(dateLine(paper.at))+'</span><span>Made '+esc(timeOf(paper.at))+' · '+paper.stories.length+' stories</span></div><div class="mt">The Daily Transcript</div><div class="rule"></div></header>'+toc+body+'<div class="end">— End of today’s paper —</div></article></body></html>';
}
function PaperReader({T,S,paper,articles,toastFn,onClose,onDelete,onOpenEdition,onSaveToLibrary,onPostToBlogs,onPublish}){
  const [prefs,setPrefs]=useState(loadPrefs);const [panel,setPanel]=useState(null);const [prog,setProg]=useState(0);const [open,setOpen]=useState({});
  const scRef=useRef(null);
  const setP=p=>setPrefs(x=>{const n=Object.assign({},x,p);try{localStorage.setItem(PREF_KEY,JSON.stringify(n))}catch(e){}return n});
  const th=themeOf(prefs.theme);const [,,bg,ink,rule,accent]=th;const font=fontOf(prefs.font);const size=prefs.size;
  const byId=id=>(articles||[]).find(x=>x.id===id);
  const chans=[];paper.stories.forEach((s,i)=>{let c=chans.find(x=>x.name===s.channel);if(!c){c={name:s.channel,items:[]};chans.push(c)}c.items.push(i)});
  const jump=i=>{const el=scRef.current&&scRef.current.querySelector('#ps'+i);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});setPanel(null)};
  const onScroll=()=>{const el=scRef.current;if(!el)return;const m=el.scrollHeight-el.clientHeight;setProg(m>0?Math.min(1,el.scrollTop/m):1)};
  const words=paper.stories.reduce((n,s)=>n+String(s.story||'').split(/\s+/).length,0);
  const chip=(on,label,onClick)=>h('button',{key:label,onClick,className:'act95',style:{flexShrink:0,padding:'7px 12px',borderRadius:16,fontSize:13,fontWeight:600,background:on?ink:'transparent',color:on?bg:ink,border:'1px solid '+(on?ink:rule)}},label);
  const sheet=(title,children)=>h('div',{style:{position:'absolute',inset:0,zIndex:5}},
    h('div',{onClick:()=>setPanel(null),style:{position:'absolute',inset:0,background:'rgba(0,0,0,.35)'}}),
    h('div',{style:{position:'absolute',left:0,right:0,bottom:0,background:bg,color:ink,borderRadius:'16px 16px 0 0',padding:'12px 18px calc(18px + env(safe-area-inset-bottom))',maxHeight:'78%',overflowY:'auto',boxShadow:'0 -10px 40px rgba(0,0,0,.3)',fontFamily:"'Inter',-apple-system,system-ui,sans-serif"}},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}},h('div',{style:{fontSize:17,fontWeight:700}},title),h('button',{onClick:()=>setPanel(null),'aria-label':'Close',style:{color:ink,display:'flex',padding:4}},Icons.x(19))),children));
  const row=(label,sub,onClick)=>h('button',{onClick,className:'act98',style:{display:'block',width:'100%',textAlign:'left',padding:'12px 0',borderBottom:'1px solid '+rule,color:ink}},h('span',{style:{display:'block',fontSize:15,fontWeight:600}},label),sub?h('span',{style:{display:'block',fontSize:12,opacity:.65,marginTop:2}},sub):null);
  const tbtn=(icon,label,onClick)=>h('button',{onClick,'aria-label':label,className:'act90',style:{display:'flex',alignItems:'center',justifyContent:'center',width:38,height:38,color:ink,flexShrink:0}},icon);
  const sans="'Inter',-apple-system,system-ui,sans-serif";
  const tocBox=h('nav',{style:{border:'1px solid '+rule,padding:'12px 14px',margin:'0 0 18px'}},
    h('div',{style:{fontFamily:sans,fontSize:11,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:accent,marginBottom:6}},'In today’s paper'),
    chans.map(c=>h('div',{key:c.name,style:{margin:'8px 0'}},
      h('div',{style:{fontFamily:sans,fontSize:10.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',opacity:.6,marginBottom:3}},c.name),
      c.items.map(i=>h('button',{key:i,onClick:()=>jump(i),style:{display:'flex',gap:8,width:'100%',textAlign:'left',padding:'4px 0',color:ink,fontFamily:font,fontWeight:700,fontSize:Math.round(size*.9),lineHeight:1.3}},
        h('span',{style:{opacity:.45,minWidth:20,fontFamily:sans,fontSize:12,paddingTop:2}},String(i+1)),paper.stories[i].headline)))));
  const node=h('div',{style:{position:'fixed',inset:0,zIndex:400,background:bg,color:ink,display:'flex',flexDirection:'column'}},
    h('style',null,'.pp-drop::first-letter{float:left;font-family:'+HEAD+';font-weight:900;font-size:'+Math.round(size*3.3)+'px;line-height:.85;margin:4px 8px 0 0;color:'+accent+'}.pp,.pp *{-webkit-user-select:text!important;user-select:text!important}'),
    h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:2,padding:'calc(4px + env(safe-area-inset-top)) 6px 4px',borderBottom:'1px solid '+rule,fontFamily:sans}},
      tbtn(Icons.x(21),'Close',onClose),
      h('div',{style:{flex:1,minWidth:0,fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(paper.label||'Today’s paper')+' · '+new Date(paper.at).toLocaleDateString([],{day:'numeric',month:'short'})),
      tbtn(Icons.menu(19),'Contents',()=>setPanel('contents')),
      tbtn(h('span',{style:{fontFamily:'Georgia,serif',fontSize:18,fontWeight:600}},'Aa'),'Appearance',()=>setPanel('aa')),
      tbtn(Icons.download(19),'Download',()=>setPanel('download')),
      tbtn(Icons.dots(19),'More',()=>setPanel('more'))),
    h('div',{style:{height:2.5,background:rule,flexShrink:0}},h('div',{style:{height:'100%',width:(prog*100)+'%',background:accent}})),
    h('div',{ref:scRef,onScroll,className:'pp',style:{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',fontFamily:font}},
      h('article',{style:{maxWidth:760,margin:'0 auto',padding:'18px 18px 60px'}},
        h('header',{style:{textAlign:'center',marginBottom:14}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:10,fontFamily:sans,fontSize:10.5,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',opacity:.7,borderBottom:'1px solid '+rule,paddingBottom:6}},
            h('span',null,dateLine(paper.at)),h('span',null,'Made '+timeOf(paper.at)+' · '+paper.stories.length+' stories')),
          h('div',{style:{fontFamily:HEAD,fontWeight:900,fontSize:34,letterSpacing:'-.01em',margin:'10px 0 6px',lineHeight:1.05}},paperMast(paper)),
          h('div',{style:{borderTop:'3px double '+ink}}),
          paper.label&&paper.kind!=='day'?h('div',{style:{fontFamily:HEAD,fontStyle:'italic',fontSize:17,marginTop:8}},paper.label):null,
          h('div',{style:{fontFamily:sans,fontSize:12,opacity:.7,marginTop:6}},chans.length+' channel'+(chans.length>1?'s':'')+' · about '+Math.max(1,Math.round(words/230))+' min of stories · full transcripts under each story')),
        tocBox,
        paper.stories.map((s,i)=>{const a=byId(s.articleId);const isOpen=!!open[i];
          return h('section',{key:i,id:'ps'+i,style:{borderTop:'3px double '+ink,paddingTop:14,marginTop:24}},
            h('div',{style:{fontFamily:sans,fontSize:11.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:accent}},s.channel+(s.publishedMs?' · '+timeOf(s.publishedMs):'')),
            h('h2',{style:{fontFamily:HEAD,fontWeight:900,fontSize:Math.round(size*1.5),lineHeight:1.15,letterSpacing:'-.01em',margin:'6px 0 8px'}},s.headline),
            s.standfirst?h('p',{style:{fontStyle:'italic',fontSize:Math.round(size*1.05),lineHeight:1.5,margin:'0 0 12px',opacity:.9}},s.standfirst):null,
            s.videoId?h('figure',{style:{margin:'0 0 12px'}},h('img',{src:ytThumb(s.videoId),alt:'',style:{width:'100%',display:'block',filter:'saturate(.92)'}}),
              h('figcaption',{style:{fontStyle:'italic',fontSize:12.5,opacity:.75,marginTop:5}},s.title,' ',h('button',{onClick:()=>openExternalUrl('https://www.youtube.com/watch?v='+s.videoId),style:{color:accent,fontStyle:'normal',fontWeight:600,fontSize:12.5}},'▶ Watch'))):null,
            h('div',{style:{columnCount:prefs.cols,columnGap:24,columnRule:prefs.cols>1?'1px solid '+rule:'none'}},
              String(s.story||'').split(/\n{2,}/).filter(Boolean).map((p,k)=>h('p',{key:k,className:i===0&&k===0?'pp-drop':undefined,style:{fontSize:size,lineHeight:1.62,margin:'0 0 .9em',textAlign:prefs.cols>1?'justify':'left',hyphens:'auto',WebkitHyphens:'auto'}},p))),
            (s.keyPoints||[]).length?h('aside',{style:{border:'1px solid '+rule,borderLeft:'4px solid '+accent,padding:'10px 13px',margin:'6px 0 12px'}},
              h('div',{style:{fontFamily:sans,fontSize:10.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:accent,marginBottom:6}},'Key points'),
              h('ul',{style:{margin:0,paddingLeft:18}},s.keyPoints.map((k,j)=>h('li',{key:j,style:{margin:'3px 0',lineHeight:1.45,fontSize:Math.round(size*.92)}},k)))):null,
            s.quote?h('blockquote',{style:{margin:'10px 0',padding:'.5em 0',borderTop:'2px solid '+ink,borderBottom:'1px solid '+rule,fontFamily:HEAD,fontStyle:'italic',fontSize:Math.round(size*1.25),lineHeight:1.3}},h('span',{style:{color:accent,fontSize:'1.5em',lineHeight:0,verticalAlign:'-.35em',marginRight:4}},'“'),s.quote):null,
            h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',margin:'10px 0 0',fontFamily:sans}},
              a&&a.transcript?chip(isOpen,isOpen?'Hide full transcript':'Read full transcript',()=>setOpen(o=>Object.assign({},o,{[i]:!o[i]}))):null,
              a?chip(false,'Open its own edition',()=>onOpenEdition(a.id)):null,
              h('span',{style:{fontSize:11,opacity:.55,alignSelf:'center'}},s.plain?'From the transcript':'Story written by AI from the transcript')),
            isOpen&&a?h('div',{style:{marginTop:12,paddingTop:10,borderTop:'1px solid '+rule}},paragraphsOf(a.transcript).map((p,k)=>h('p',{key:k,style:{fontSize:Math.round(size*.95),lineHeight:1.6,margin:'0 0 .85em'}},p))):null);
        }),
        h('div',{style:{textAlign:'center',fontFamily:sans,fontSize:12,fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',opacity:.55,marginTop:28}},'— End of the paper —'))),
    panel==='contents'?sheet('Contents',tocBox):null,
    panel==='aa'?sheet('Appearance',h(Fragment,null,
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'4px 0 8px'}},'Font'),
      h('div',{className:'sx',style:{display:'flex',gap:7,overflowX:'auto'}},FONTS.map(([id,l,f])=>h('button',{key:id,onClick:()=>setP({font:id}),className:'act95',style:{flexShrink:0,padding:'8px 13px',borderRadius:12,fontFamily:f+INDIC,fontSize:15,background:prefs.font===id?ink:'transparent',color:prefs.font===id?bg:ink,border:'1px solid '+(prefs.font===id?ink:rule)}},l))),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 6px'}},'Text size · '+size+'px'),
      h('input',{type:'range',min:14,max:28,step:1,value:size,onChange:ev=>setP({size:Number(ev.target.value)}),style:{width:'100%',accentColor:accent}}),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 8px'}},'Paper'),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},THEMES.map(t=>h('button',{key:t[0],onClick:()=>setP({theme:t[0]}),className:'act95',style:{padding:'7px 12px',borderRadius:12,background:t[2],color:t[3],border:'2px solid '+(prefs.theme===t[0]?accent:t[4]),fontSize:13.5,fontWeight:600}},t[1]))),
      null)):null,
    panel==='download'?sheet('Share or download',h(Fragment,null,
      onPostToBlogs?row('Post to my Blogs','Appears in Blogs → Saved posts · My papers (private, on this phone)',()=>{setPanel(null);onPostToBlogs(paper)}):null,
      onPublish?row('Publish as a public web page','A page anyone with the link can read, on your free GitHub site',()=>{setPanel(null);onPublish(paper)}):null,
      row('PDF','The stories, contents and key points — Print → Share → Save to Files',()=>{setPanel(null);printHtml(paperHtml(paper,articles,prefs,false))}),
      row('HTML file','Everything, with each full transcript folded under its story',()=>{setPanel(null);(window.InstaShields?window.InstaShields.downloadText:dl)('daily-transcript-'+new Date(paper.at).toISOString().slice(0,10)+'.html',paperHtml(paper,articles,prefs,true),'text/html')}),
      row('Save to my library','The whole paper as one article, with highlights and listen-aloud',()=>{setPanel(null);const {toc,body}=paperStoriesHtml(paper,articles,false);onSaveToLibrary({title:paperMast(paper)+' — '+(paper.label&&paper.kind!=='day'?paper.label:dateLine(paper.at)),html:body.replace(/<section[^>]*>/g,'<div>').replace(/<\/section>/g,'</div><hr>'),text:paper.stories.map(s=>s.headline+'\n\n'+s.story).join('\n\n'),words,standfirst:paper.stories.length+' stories from '+chans.length+' channels',lang:'paper-'+paper.id})}))):null,
    panel==='more'?sheet('Paper',h(Fragment,null,
      onDelete?row('Delete this paper','Transcripts and videos stay in your library',()=>{if(window.confirm('Delete this paper?')){onDelete();}})
        :h('div',{style:{fontSize:13.5,opacity:.7,lineHeight:1.5,padding:'4px 2px'}},'This paper is made automatically from your editions and always stays up to date. To remove a story, delete that video’s transcript.'))):null);
  return ReactDOM.createPortal(node,document.body);
}
/* ---------- papers made from your editions ----------
   Every transcribed video can be a story. Without any AI call, a story takes its edition's headline and
   standfirst (or the video title and first sentence) and the first ~230 words of the transcript; the full
   transcript stays one tap away under it. Day papers and the weekly digest are rebuilt from your library
   every time, so they are always up to date; papers you combine by hand are kept. */
const dayKey=t=>{const d=new Date(t);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()};
const weekStart=t=>{const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()};
const txArticles=articles=>(articles||[]).filter(a=>a.isVideo&&!a.isEdition&&a.transcript&&String(a.transcript).trim().length>80);
const storyAt=a=>{const eds=a.editions||{};const t=Object.keys(eds).reduce((m,k)=>Math.max(m,eds[k].at||0),0);return t||a.transcriptAt||a.addedAt||0};
function storyFromArticle(a){
  const ed=(a.editions||{}).orig||null;const paras=paragraphsOf(a.transcript||'');const w=paras.join('\n\n').split(/\s+/);
  let story=w.slice(0,230).join(' ');if(w.length>230)story+='…';
  const first=((paras[0]||'').split(/(?<=[.!?।])\s+/)[0]||'').slice(0,220);
  const pq=ed&&Array.isArray(ed.pullQuotes)?ed.pullQuotes[0]:'';
  return{articleId:a.id,videoId:a.videoId||vidOf(a.url),channel:a.author||a.source||'',publishedMs:a.publishedAt||0,title:a.title,plain:true,
    headline:(ed&&ed.headline)||a.title||'Untitled',standfirst:(ed&&ed.standfirst)||first,story,keyPoints:[],quote:typeof pq==='string'?pq:((pq&&pq.text)||'')};
}
function papersFromEditions(articles){
  const list=txArticles(articles).map(a=>({a,at:storyAt(a)})).filter(x=>x.at).sort((x,y)=>y.at-x.at);
  const now=Date.now(),today=dayKey(now),yest=dayKey(now-86400000),out=[];
  const days={};list.forEach(x=>{(days[dayKey(x.at)]=days[dayKey(x.at)]||[]).push(x)});
  Object.keys(days).forEach(k=>{const xs=days[k];if(xs.length<2||now-xs[0].at>14*86400000)return;
    const at=xs[0].at;const name=k===today?'Today’s paper':k===yest?'Yesterday’s paper':new Date(at).toLocaleDateString([],{weekday:'long'})+'’s paper';
    out.push({id:'day:'+k,kind:'day',virtual:true,at,label:name,stories:xs.map(x=>storyFromArticle(x.a))})});
  const weeks={};list.forEach(x=>{const w=weekStart(x.at);(weeks[w]=weeks[w]||[]).push(x)});
  const thisW=weekStart(now);
  Object.keys(weeks).map(Number).sort((a,b)=>b-a).slice(0,2).forEach(w=>{const xs=weeks[w];if(xs.length<2)return;
    out.push({id:'week:'+w,kind:'week',virtual:true,at:xs[0].at,label:w===thisW?'This week’s digest':'Last week’s digest',stories:xs.map(x=>storyFromArticle(x.a))})});
  return out.sort((x,y)=>(x.kind==='week')-(y.kind==='week')||y.at-x.at);
}
/* Combine: tick any transcribed videos and make one paper of them (kept in your papers) */
function CombinePicker({T,articles,onMake,onClose}){
  const list=txArticles(articles).map(a=>({a,at:storyAt(a)})).sort((x,y)=>y.at-x.at).slice(0,60);
  const [sel,setSel]=useState(()=>new Set());const [title,setTitle]=useState('');
  const tick=id=>setSel(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n});
  const chosen=list.filter(x=>sel.has(x.a.id));
  return ReactDOM.createPortal(h('div',{style:{position:'fixed',inset:0,zIndex:400,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'calc(8px + env(safe-area-inset-top)) 12px 8px',borderBottom:'1px solid '+T.hair}},
      h('button',{onClick:onClose,'aria-label':'Close',className:'act90',style:{display:'flex',color:T.fg,padding:6}},Icons.x(21)),
      h('div',{style:{flex:1,fontSize:17,fontWeight:750}},'Combine into one paper'),
      h('button',{onClick:()=>setSel(new Set(list.map(x=>x.a.id)))  ,style:{fontSize:14,fontWeight:600,color:T.accent,padding:6}},'All')),
    h('div',{style:{padding:'10px 16px 4px'}},h('input',{value:title,onChange:e=>setTitle(e.target.value),placeholder:'Title (optional), e.g. Investing notes',
      style:{width:'100%',boxSizing:'border-box',padding:'11px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16}})),
    h('div',{style:{flex:1,overflowY:'auto',padding:'6px 10px 20px'}},
      !list.length?h('div',{style:{padding:'40px 20px',textAlign:'center',color:T.sub,lineHeight:1.6}},'No transcribed videos yet. Transcribe a video (My Routine → ⌄ → Transcribe) and it can join a paper.'):
      list.map(({a,at})=>{const on=sel.has(a.id);const ed=(a.editions||{}).orig;
        return h('button',{key:a.id,onClick:()=>tick(a.id),className:'act98',style:{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'10px 6px',borderBottom:'1px solid '+T.hair,color:T.fg}},
          h('span',{style:{width:22,height:22,borderRadius:11,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+(on?T.accent:T.hair),background:on?T.accent:'transparent',color:'#fff'}},on?Icons.check(13):null),
          a.videoId?h('img',{src:ytThumb(a.videoId),alt:'',style:{width:72,height:40,objectFit:'cover',borderRadius:6,flexShrink:0}}):null,
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontSize:14.5,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},(ed&&ed.headline)||a.title),
            h('div',{style:{fontSize:12,color:T.sub,marginTop:2}},(a.author||'')+' · '+new Date(at).toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'}))));
      })),
    h('div',{style:{padding:'10px 16px calc(12px + env(safe-area-inset-bottom))',borderTop:'1px solid '+T.hair}},
      h('button',{disabled:chosen.length<1,onClick:()=>onMake({id:uid(),kind:'custom',at:Date.now(),label:title.trim()||('Your paper · '+chosen.length+' stories'),stories:chosen.map(x=>storyFromArticle(x.a))}),className:'act95',
        style:{width:'100%',padding:14,borderRadius:13,background:T.accent,color:'#fff',fontSize:15.5,fontWeight:700,opacity:chosen.length?1:.45}},chosen.length?'Make the paper · '+chosen.length+(chosen.length===1?' story':' stories'):'Tick the videos to combine'))),document.body);
}
const paperMast=p=>p&&p.kind==='week'?'The Weekly Transcript':'The Daily Transcript';
function PapersShelfCards({T,papers,onOpen}){
  const SERIF="'Playfair Display'"+INDIC;
  /* same card as an edition (follows the theme: light, sepia, dark, black); the accent date line marks it as a daily paper */
  return(papers||[]).slice(0,10).map(p=>h('button',{key:'p'+p.id,onClick:()=>onOpen(p.id),className:'act98',style:{flexShrink:0,width:200,textAlign:'left',background:T.card,color:T.fg,borderRadius:10,padding:'10px 12px 12px',border:'1px solid '+T.hair}},
    h('div',{style:{textAlign:'center',fontFamily:SERIF,fontWeight:900,fontSize:13,borderBottom:'2px double '+T.fg,paddingBottom:4,marginBottom:7}},paperMast(p)),
    h('div',{style:{fontFamily:"'Inter',system-ui",fontSize:10.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:T.accent,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(p.label||new Date(p.at).toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'}))+' · '+p.stories.length+' stories'),
    h('div',{style:{fontFamily:SERIF,fontWeight:800,fontSize:14.5,lineHeight:1.2,marginTop:5,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},(p.stories[0]||{}).headline||'')));
}
window.InstaEdition={paragraphsOf,cleanTranscript,buildEdition,plainEdition,editionHtml,EditionReader,EditionsShelf,PaperBuilder,PaperReader,buildStory,paperHtml,paperStoriesHtml,papersFromEditions,CombinePicker,storyFromArticle};
})();
