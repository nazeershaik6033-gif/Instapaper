/* Instapaper — Newspaper editions of video transcripts.
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
const loadPrefs=()=>{try{return Object.assign({font:'news',size:18,theme:'paper',cols:1},JSON.parse(localStorage.getItem(PREF_KEY)||'{}'))}catch(e){return{font:'news',size:18,theme:'paper',cols:1}}};
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

/* ============================== reader ============================== */
function EditionReader({T,S,a,patch,toastFn,onClose,onSaveToLibrary,initialLang,onOpenVideo,initialPanel}){
  const tr=a.transcriptTr||{};
  const langs=['orig'].concat(Object.keys(tr).filter(k=>String(tr[k]||'').trim()));
  const [lang,setLang]=useState(initialLang&&langs.includes(initialLang)?initialLang:'orig');
  const [prefs,setPrefs]=useState(loadPrefs);
  const [panel,setPanel]=useState(initialPanel||null);
  const [busy,setBusy]=useState('');
  const [err,setErr]=useState('');
  const [prog,setProg]=useState(0);
  const [selBar,setSelBar]=useState(null); // {text} | {remove:id}
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
  const onScroll=()=>{const el=scRef.current;if(!el)return;const m=el.scrollHeight-el.clientHeight;setProg(m>0?Math.min(1,el.scrollTop/m):1)};
  /* highlights live on the video (src:'edition'), so they also show on the Notes page */
  const hls=(a.highlights||[]).filter(x=>x&&x.text&&x.kind!==(typeof VIDEO_NOTES_KIND!=='undefined'?VIDEO_NOTES_KIND:'videoNotes'));
  useEffect(()=>{
    const f=()=>{
      const sel=window.getSelection&&window.getSelection();const el=scRef.current;
      if(!sel||sel.isCollapsed||!el||!el.contains(sel.anchorNode)){setSelBar(b=>b&&b.text?null:b);return}
      const t=String(sel).replace(/\s+/g,' ').trim();
      const pe=sel.anchorNode&&(sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentElement);const pp=pe&&pe.closest&&pe.closest('[data-i]');
      if(t.length>2)setSelBar({text:t.slice(0,1200),para:pp?Number(pp.getAttribute('data-i')):null});
    };
    document.addEventListener('selectionchange',f);return()=>document.removeEventListener('selectionchange',f);
  },[]);
  const addHl=(t,para)=>{patch(x=>({highlights:(x.highlights||[]).concat([{id:uid(),text:t,createdAt:Date.now(),src:'edition',lang,para:para==null?undefined:para}])}));try{window.getSelection().removeAllRanges()}catch(e){}setSelBar(null);toastFn('Highlighted — also on your Notes page')};
  const delHl=id=>{patch(x=>({highlights:(x.highlights||[]).filter(y=>y.id!==id)}));setSelBar(null)};
  const marked=(p,pi)=>{
    const hits=[];for(const hl of hls){if(hl.src==='edition'&&((hl.lang&&hl.lang!==lang)||(hl.para!=null&&hl.para!==pi)))continue;let i=p.indexOf(hl.text);if(i<0&&hl.text.length>40)i=p.indexOf(hl.text.slice(0,40));if(i>=0)hits.push({i,len:Math.min(hl.text.length,p.length-i),id:hl.id})}
    if(!hits.length)return p;
    hits.sort((x,y)=>x.i-y.i);const out=[];let pos=0;
    hits.forEach((m,k)=>{if(m.i<pos)return;out.push(p.slice(pos,m.i));out.push(h('mark',{key:k,onClick:ev=>{ev.stopPropagation();setSelBar({remove:m.id})}},p.slice(m.i,m.i+m.len)));pos=m.i+m.len});
    out.push(p.slice(pos));return out;
  };
  /* notes: one notepad per video, the same one the transcript view uses */
  const NK=typeof VIDEO_NOTES_KIND!=='undefined'?VIDEO_NOTES_KIND:'videoNotes';
  const noteObj=(a.highlights||[]).find(x=>x.kind===NK);
  const [note,setNote]=useState(noteObj?noteObj.note||'':'');
  const saveNote=v=>patch(x=>{const hs=(x.highlights||[]).filter(y=>y.kind!==NK);if(!v.trim())return{highlights:hs};const old=(x.highlights||[]).find(y=>y.kind===NK);
    return{highlights:hs.concat([{id:old?old.id:uid(),kind:NK,text:'📝 My notes',note:v,createdAt:old?old.createdAt:Date.now(),updatedAt:Date.now()}])}});
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
    h('style',null,'.ed-drop::first-letter{float:left;font-family:'+HEAD+';font-weight:900;font-size:'+Math.round(size*3.3)+'px;line-height:.85;margin:4px 8px 0 0;color:'+accent+'}.ed-paper mark{background:rgba(255,214,10,.45);color:inherit;border-radius:2px;padding:0 1px}.ed-paper ::selection{background:rgba(255,214,10,.5)}.ed-paper,.ed-paper *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}'),
    /* toolbar */
    h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:2,padding:'calc(4px + env(safe-area-inset-top)) 6px 4px',borderBottom:'1px solid '+rule,fontFamily:"'Inter',-apple-system,system-ui,sans-serif"}},
      tbtn(Icons.x(21),'Close',onClose),
      h('div',{className:'sx',style:{flex:1,minWidth:0,display:'flex',gap:6,overflowX:'auto',padding:'4px 2px'}},
        tabs.map(k=>k==='+'?h('button',{key:'+',onClick:()=>setPanel('translate'),className:'act95',style:{flexShrink:0,padding:'5px 10px',borderRadius:14,fontSize:12.5,fontWeight:600,color:accent,border:'1px dashed '+rule}},'+ Translate')
          :h('button',{key:k,onClick:()=>setLang(k),className:'act95',style:{flexShrink:0,padding:'5px 11px',borderRadius:14,fontSize:12.5,fontWeight:650,background:lang===k?ink:'transparent',color:lang===k?bg:ink,border:'1px solid '+(lang===k?ink:rule)}},langName(k)))),
      tbtn(Icons.menu?Icons.menu(19):'☰','Contents',()=>setPanel('contents')),
      tbtn(h('span',{style:{fontFamily:'Georgia,serif',fontSize:18,fontWeight:600}},'Aa'),'Appearance',()=>setPanel('aa')),
      tbtn(Icons.download(19),'Download',()=>setPanel('download')),
      tbtn(Icons.dots(19),'More',()=>setPanel('more'))),
    h('div',{style:{height:2.5,background:rule,flexShrink:0}},h('div',{style:{height:'100%',width:(prog*100)+'%',background:accent,transition:'width 120ms'}})),
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
        h('div',{style:{columnCount:cols,columnGap:24,columnRule:cols>1?'1px solid '+rule:'none'}},
          paras.map((p,i)=>h(Fragment,{key:i},
            starts[i]&&i>0?h('h2',{'data-p':i,style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(size*1.15),margin:'1.3em 0 .5em',paddingTop:'.5em',borderTop:'1px solid '+rule,breakAfter:'avoid'}},starts[i]):null,
            h('p',{'data-p':starts[i]&&i>0?undefined:i,'data-i':i,className:i===0?'ed-drop':undefined,style:{fontSize:size,lineHeight:1.62,margin:'0 0 .9em',textAlign:cols>1?'justify':'left',hyphens:'auto',WebkitHyphens:'auto'}},marked(p,i)),
            (quotes[i]||[]).map((q,k)=>h('blockquote',{key:k,style:{margin:'1em 0',padding:'.6em 0',borderTop:'2px solid '+ink,borderBottom:'1px solid '+rule,fontFamily:HEAD,fontStyle:'italic',fontSize:Math.round(size*1.28),lineHeight:1.3,breakInside:'avoid'}},
              h('span',{style:{color:accent,fontSize:'1.6em',lineHeight:0,verticalAlign:'-.35em',marginRight:4}},'“'),q))))),
        h('div',{style:{textAlign:'center',fontFamily:"'Inter',system-ui",fontSize:12,fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',opacity:.55,marginTop:24}},'— End of edition —'),
        h('div',{style:{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:16,fontFamily:"'Inter',system-ui"}},
          chip(false,'⤓ Download',()=>setPanel('download')),chip(false,'Notes',()=>setPanel('notes')),view.plain?chip(false,'✦ Lay out with AI',()=>build(true)):null))),
    /* selection / highlight bar */
    selBar?h('div',{style:{position:'absolute',left:12,right:12,bottom:'calc(14px + env(safe-area-inset-bottom))',zIndex:4,display:'flex',gap:8,justifyContent:'center',fontFamily:"'Inter',system-ui"}},
      selBar.text?h(Fragment,null,
        h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>addHl(selBar.text,selBar.para),className:'act95',style:{padding:'10px 16px',borderRadius:20,background:ink,color:bg,fontWeight:650,fontSize:14,boxShadow:'0 6px 20px rgba(0,0,0,.25)'}},'Highlight'),
        h('button',{onMouseDown:e=>e.preventDefault(),onClick:()=>{copyText(selBar.text);toastFn('Copied')},className:'act95',style:{padding:'10px 16px',borderRadius:20,background:bg,color:ink,border:'1px solid '+rule,fontWeight:600,fontSize:14}},'Copy'))
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
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 8px'}},'Columns'),
      h('div',{style:{display:'flex',gap:8}},chip(cols===1,'One column',()=>setP({cols:1})),chip(cols===2,'Two columns',()=>setP({cols:2}))))):null,
    panel==='contents'?sheet('Contents',h(Fragment,null,
      (view.sections||[]).length?view.sections.map((s,i)=>row((i+1)+'. '+s.heading,null,()=>jump(s.start-1))):h('div',{style:{fontSize:13.5,opacity:.7,padding:'8px 0'}},'This edition has no sections yet.'+(view.plain?' Tap “Lay out with AI” for headings.':'')),
      row('Back to the top',null,()=>{scRef.current&&scRef.current.scrollTo({top:0,behavior:'smooth'});setPanel(null)}),
      (view.keyPoints||[]).length?h('div',{style:{marginTop:14}},h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,marginBottom:6}},'Key points'),view.keyPoints.map((k,i)=>h('div',{key:i,style:{fontSize:14,lineHeight:1.45,margin:'5px 0'}},'• '+k))):null)):null,
    panel==='download'?sheet('Download this edition',h(Fragment,null,
      row('PDF','Opens Print — pinch out on the preview, then Share → Save to Files',()=>{setPanel(null);printHtml(html())},Icons.download(19)),
      row('HTML file','A single file with this layout and fonts; opens offline in any browser',()=>{setPanel(null);(window.InstaShields?window.InstaShields.downloadText:dl)(fileBase+'.html',html(),'text/html')},Icons.file?Icons.file(19):Icons.download(19)),
      row('Save to my library','A copy in Home with highlights, notes and listen-aloud — also on the Editions shelf',saveCopy,Icons.plus(19)))):null,
    panel==='more'?sheet('Edition',h(Fragment,null,
      row(view.plain?'Lay out with AI':'Lay out again with AI','New headline, sections and pull quotes',()=>{setPanel(null);build(true)},Icons.ai(19)),
      row('Notes','Your notepad for this video',()=>setPanel('notes'),Icons.notes?Icons.notes(19):null),
      row('Copy transcript',lang==='orig'?'The original text':lang+' text',()=>{copyText(text);toastFn('Transcript copied');setPanel(null)},Icons.copy(19)),
      a.url?row('Share the video',null,()=>{shareText(view.headline||a.title,'',a.url);setPanel(null)},Icons.share(19)):null)):null,
    panel==='notes'?sheet('Notes',h(Fragment,null,
      h('textarea',{value:note,onChange:e=>setNote(e.target.value),onBlur:()=>saveNote(note),rows:8,placeholder:'Thoughts, takeaways, things to look up…',style:{width:'100%',padding:12,borderRadius:10,border:'1px solid '+rule,background:'transparent',color:ink,fontSize:16,lineHeight:1.5,fontFamily:font}}),
      h('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:8}},chip(true,'Save notes',()=>{saveNote(note);toastFn('Notes saved');setPanel(null)})),
      hls.length?h('div',{style:{marginTop:14}},h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,marginBottom:6}},'Highlights · '+hls.length),
        hls.slice().reverse().map(x=>h('div',{key:x.id,style:{display:'flex',gap:8,alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid '+rule}},
          h('div',{style:{flex:1,fontSize:14,lineHeight:1.45,background:'rgba(255,214,10,.25)',padding:'2px 4px'}},x.text),
          h('button',{onClick:()=>delHl(x.id),'aria-label':'Remove',style:{color:ink,opacity:.6,display:'flex',padding:4}},Icons.x(14))))):null)):null,
    panel==='translate'?sheet('Translate this edition',h(Fragment,null,
      ['Telugu','Hindi','English','Tamil','Kannada','Malayalam','Marathi','Bengali'].filter(l=>!langs.includes(l)).map(l=>row(l,null,()=>translate(l))),
      h('div',{style:{fontSize:12,opacity:.65,marginTop:10,lineHeight:1.5}},'Uses your Gemini or OpenRouter key. Each translation is saved with the video and gets its own edition.'))):null);
  return ReactDOM.createPortal(node,document.body);
}
function dl(name,text,type){const b=new Blob([text],{type});const u=URL.createObjectURL(b);const x=document.createElement('a');x.href=u;x.download=name;document.body.appendChild(x);x.click();setTimeout(()=>{URL.revokeObjectURL(u);x.remove()},1500)}

/* ============================== Editions shelf ============================== */
function EditionsShelf({T,articles,onOpen,papers,onOpenPaper}){
  const list=(articles||[]).filter(a=>a.isVideo&&a.transcript&&String(a.transcript).trim())
    .map(a=>{const eds=a.editions||{};const latest=Object.keys(eds).reduce((m,k)=>Math.max(m,eds[k].at||0),0);return{a,at:latest||a.transcriptAt||0,ed:eds.orig||eds[Object.keys(eds)[0]]}})
    .sort((x,y)=>y.at-x.at).slice(0,20);
  if(!list.length&&!(papers&&papers.length))return null;
  const SERIF="'Playfair Display'"+INDIC;
  return h('div',{style:{padding:'14px 0 4px'}},
    h('div',{style:{display:'flex',alignItems:'baseline',justifyContent:'space-between',padding:'0 16px 10px'}},
      h('div',{style:{fontSize:19,fontWeight:700,fontFamily:"ui-serif,'New York',Georgia,serif"}},'Editions'),
      h('div',{style:{fontSize:12,color:T.sub}},((papers||[]).length?papers.length+' daily paper'+(papers.length>1?'s':'')+' · ':'')+list.length+' edition'+(list.length===1?'':'s'))),
    h('div',{className:'sx',style:{display:'flex',gap:12,overflowX:'auto',padding:'0 16px 6px'}},
      PapersShelfCards({T,papers,onOpen:onOpenPaper}),
      list.map(({a,ed})=>h('button',{key:a.id,onClick:()=>onOpen(a.id),className:'act98',style:{flexShrink:0,width:200,textAlign:'left',background:'#f3eee2',color:'#1c1a16',borderRadius:6,padding:'10px 12px 12px',boxShadow:'0 2px 10px rgba(0,0,0,.12)',border:'1px solid #d9cfb6'}},
        h('div',{style:{textAlign:'center',fontFamily:SERIF,fontWeight:900,fontSize:13,borderBottom:'2px double #1c1a16',paddingBottom:4,marginBottom:7}},'The Daily Transcript'),
        h('div',{style:{fontFamily:SERIF,fontWeight:800,fontSize:15,lineHeight:1.2,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},(ed&&ed.headline)||a.title),
        h('div',{style:{fontSize:11,opacity:.7,marginTop:6,fontFamily:"'Inter',system-ui",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(a.author||a.source||'')+(ed?'':' · tap to lay out'))))));
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
function PaperReader({T,S,paper,articles,toastFn,onClose,onDelete,onOpenEdition,onSaveToLibrary}){
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
      h('div',{style:{flex:1,minWidth:0,fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'Today’s paper · '+new Date(paper.at).toLocaleDateString([],{day:'numeric',month:'short'})),
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
          h('div',{style:{fontFamily:HEAD,fontWeight:900,fontSize:34,letterSpacing:'-.01em',margin:'10px 0 6px',lineHeight:1.05}},'The Daily Transcript'),
          h('div',{style:{borderTop:'3px double '+ink}}),
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
        h('div',{style:{textAlign:'center',fontFamily:sans,fontSize:12,fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',opacity:.55,marginTop:28}},'— End of today’s paper —'))),
    panel==='contents'?sheet('Contents',tocBox):null,
    panel==='aa'?sheet('Appearance',h(Fragment,null,
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'4px 0 8px'}},'Font'),
      h('div',{className:'sx',style:{display:'flex',gap:7,overflowX:'auto'}},FONTS.map(([id,l,f])=>h('button',{key:id,onClick:()=>setP({font:id}),className:'act95',style:{flexShrink:0,padding:'8px 13px',borderRadius:12,fontFamily:f+INDIC,fontSize:15,background:prefs.font===id?ink:'transparent',color:prefs.font===id?bg:ink,border:'1px solid '+(prefs.font===id?ink:rule)}},l))),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 6px'}},'Text size · '+size+'px'),
      h('input',{type:'range',min:14,max:28,step:1,value:size,onChange:ev=>setP({size:Number(ev.target.value)}),style:{width:'100%',accentColor:accent}}),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 8px'}},'Paper'),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},THEMES.map(t=>h('button',{key:t[0],onClick:()=>setP({theme:t[0]}),className:'act95',style:{padding:'7px 12px',borderRadius:12,background:t[2],color:t[3],border:'2px solid '+(prefs.theme===t[0]?accent:t[4]),fontSize:13.5,fontWeight:600}},t[1]))),
      h('div',{style:{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.6,margin:'16px 0 8px'}},'Columns'),
      h('div',{style:{display:'flex',gap:8}},chip(prefs.cols===1,'One column',()=>setP({cols:1})),chip(prefs.cols===2,'Two columns',()=>setP({cols:2}))))):null,
    panel==='download'?sheet('Download today’s paper',h(Fragment,null,
      row('PDF','The stories, contents and key points — Print → Share → Save to Files',()=>{setPanel(null);printHtml(paperHtml(paper,articles,prefs,false))}),
      row('HTML file','Everything, with each full transcript folded under its story',()=>{setPanel(null);(window.InstaShields?window.InstaShields.downloadText:dl)('daily-transcript-'+new Date(paper.at).toISOString().slice(0,10)+'.html',paperHtml(paper,articles,prefs,true),'text/html')}),
      row('Save to my library','The whole paper as one article, with highlights and listen-aloud',()=>{setPanel(null);const {toc,body}=paperStoriesHtml(paper,articles,false);onSaveToLibrary({title:'The Daily Transcript — '+dateLine(paper.at),html:body.replace(/<section[^>]*>/g,'<div>').replace(/<\/section>/g,'</div><hr>'),text:paper.stories.map(s=>s.headline+'\n\n'+s.story).join('\n\n'),words,standfirst:paper.stories.length+' stories from '+chans.length+' channels',lang:'paper-'+paper.id})}))):null,
    panel==='more'?sheet('Paper',h(Fragment,null,
      row('Delete this paper','Transcripts and videos stay in your library',()=>{if(window.confirm('Delete this paper?')){onDelete();}}))):null);
  return ReactDOM.createPortal(node,document.body);
}
function PapersShelfCards({T,papers,onOpen}){
  const SERIF="'Playfair Display'"+INDIC;
  return(papers||[]).slice(0,10).map(p=>h('button',{key:'p'+p.id,onClick:()=>onOpen(p.id),className:'act98',style:{flexShrink:0,width:200,textAlign:'left',background:'#1c1a16',color:'#f3eee2',borderRadius:6,padding:'10px 12px 12px',boxShadow:'0 2px 10px rgba(0,0,0,.18)'}},
    h('div',{style:{textAlign:'center',fontFamily:SERIF,fontWeight:900,fontSize:13,borderBottom:'2px double #f3eee2',paddingBottom:4,marginBottom:7}},'The Daily Transcript'),
    h('div',{style:{fontFamily:"'Inter',system-ui",fontSize:10.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',opacity:.7}},new Date(p.at).toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'})+' · '+p.stories.length+' stories'),
    h('div',{style:{fontFamily:SERIF,fontWeight:800,fontSize:14.5,lineHeight:1.2,marginTop:5,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},(p.stories[0]||{}).headline||'')));
}
window.InstaEdition={paragraphsOf,cleanTranscript,buildEdition,plainEdition,editionHtml,EditionReader,EditionsShelf,PaperBuilder,PaperReader,buildStory,paperHtml};
})();
