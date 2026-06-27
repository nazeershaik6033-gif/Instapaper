/* Instapaper — premium reading app (PWA)
   All premium features unlocked, free forever. */
'use strict';
const {Fragment,useState,useEffect,useMemo,useRef,useCallback,createElement:ce}=React;
const h=(t,p,...c)=>ce(t,p,...c);

/* ============================== constants ============================== */
const STORE_KEY='instapaper_v1';
const APP_VERSION='1.0.0';

const THEMES={
  light:{id:'light',label:'Light',bg:'#ffffff',fg:'#1c1c1e',sub:'#9a9aa0',meta:'#76767c',hair:'#e8e8ec',card:'#f4f4f6',search:'#efeff1',sheet:'#ffffff',overlay:'rgba(0,0,0,.42)',menuBg:'#ffffff',menuFg:'#1c1c1e',menuHair:'#ececef',accent:'#3478c6',danger:'#d0342c',hl:'rgba(255,222,60,.5)',thumbBg:'#ececee',statusbar:'#ffffff',swatch:'#ffffff'},
  sepia:{id:'sepia',label:'Sepia',bg:'#f9f2e4',fg:'#39322a',sub:'#9d927c',meta:'#7e7361',hair:'#e9e0cc',card:'#f1e8d5',search:'#efe6d2',sheet:'#f9f2e4',overlay:'rgba(40,30,10,.42)',menuBg:'#f7efe0',menuFg:'#39322a',menuHair:'#e6dcc6',accent:'#9a6a31',danger:'#c04a3a',hl:'rgba(255,210,80,.5)',thumbBg:'#ece2cc',statusbar:'#f9f2e4',swatch:'#f9f2e4'},
  dark:{id:'dark',label:'Dark',bg:'#1c1c1e',fg:'#dededf',sub:'#7c7c82',meta:'#98989e',hair:'#2d2d30',card:'#26262a',search:'#2a2a2e',sheet:'#222226',overlay:'rgba(0,0,0,.55)',menuBg:'#2c2c30',menuFg:'#ededee',menuHair:'#3a3a3f',accent:'#7fb3e8',danger:'#e06a5e',hl:'rgba(255,214,70,.32)',thumbBg:'#2e2e33',statusbar:'#1c1c1e',swatch:'#1c1c1e'},
  black:{id:'black',label:'Black',bg:'#000000',fg:'#cfcfd1',sub:'#6e6e74',meta:'#8c8c92',hair:'#1d1d20',card:'#121215',search:'#1a1a1e',sheet:'#101013',overlay:'rgba(0,0,0,.62)',menuBg:'#1c1c20',menuFg:'#e6e6e8',menuHair:'#2c2c31',accent:'#7fb3e8',danger:'#e06a5e',hl:'rgba(255,214,70,.3)',thumbBg:'#17171b',statusbar:'#000000',swatch:'#000000'}
};
const isDarkTheme=t=>t==='dark'||t==='black';

const FONTS=[
  {id:'Lora',label:'Lora',css:"'Lora',Georgia,serif"},
  {id:'Georgia',label:'Georgia',css:"Georgia,'Times New Roman',serif"},
  {id:'Merriweather',label:'Merriweather',css:"'Merriweather',Georgia,serif"},
  {id:'PT Serif',label:'PT Serif',css:"'PT Serif',Georgia,serif"},
  {id:'Literata',label:'Literata',css:"'Literata',Georgia,serif"},
  {id:'Inter',label:'Inter',css:"'Inter',-apple-system,system-ui,sans-serif"},
  {id:'System',label:'San Francisco',css:"-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif"}
];
/* Indic fallbacks keep Telugu / Hindi text rendering beautifully in every font */
const INDIC_FALLBACK=",'Noto Serif Telugu','Noto Serif Devanagari'";
const fontCss=id=>{const f=FONTS.find(f=>f.id===id);return(f?f.css:FONTS[0].css)+INDIC_FALLBACK};
const WORDMARK="'Playfair Display','Lora',Georgia,serif";
const UIF="-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif";

const DEFAULT_SETTINGS={theme:'light',font:'Lora',fontSize:19,lineHeight:1.62,sort:'newest',filter:'all',ttsRate:1,ttsVoice:'',wpm:380,justify:false,aiKey:'',aiModel:'deepseek/deepseek-r1-0528:free',aiLang:'English',aiProvider:'openrouter',geminiKey:'',geminiModel:'gemini-2.5-flash',briefRegion:'IN',briefCategory:'',backupEvery:7,lastBackupAt:0,backupSnoozeUntil:0};

/* models OpenRouter has retired — saved settings get migrated to the new default */
const DEAD_MODELS=['deepseek/deepseek-chat-v3-0324:free','deepseek/deepseek-r1:free'];

/* ============================== AI (OpenRouter) ============================== */
const AI_MODELS=[
  ['deepseek/deepseek-r1-0528:free','DeepSeek R1 0528 (free)'],
  ['deepseek/deepseek-r1-0528-qwen3-8b:free','DeepSeek R1 0528 Qwen3 8B (free)'],
  ['meta-llama/llama-3.3-70b-instruct:free','Llama 3.3 70B (free)'],
  ['qwen/qwen3-235b-a22b:free','Qwen3 235B (free)'],
  ['google/gemini-2.0-flash-exp:free','Gemini 2.0 Flash (free)'],
  ['mistralai/mistral-small-3.1-24b-instruct:free','Mistral Small 3.1 (free)'],
  ['deepseek/deepseek-chat-v3-0324','DeepSeek V3 (paid)'],
  ['openai/gpt-4o-mini','GPT-4o mini (paid)'],
  ['anthropic/claude-3.5-haiku','Claude 3.5 Haiku (paid)'],
  ['google/gemini-2.5-flash','Gemini 2.5 Flash (paid)']
];
const AI_LANGS=['Telugu','Hindi','English','Tamil','Kannada','Malayalam','Marathi','Bengali','Urdu','Spanish','French','German','Japanese','Chinese'];
const LANG_CODES={Telugu:'te',Hindi:'hi',English:'en',Tamil:'ta',Kannada:'kn',Malayalam:'ml',Marathi:'mr',Bengali:'bn',Urdu:'ur',Spanish:'es',French:'fr',German:'de',Japanese:'ja',Chinese:'zh'};
const REWRITE_STYLES=[['Simplify','Rewrite it in plain, simple language that anyone can understand'],['Shorten','Rewrite it at half the length, keeping every key idea'],['Expand','Rewrite it with richer detail and explanation'],['Make formal','Rewrite it in a formal, professional tone'],['Make casual','Rewrite it in a friendly, conversational tone'],['Bullet points','Rewrite it as well-organized bullet points']];

/* Indic + common language codes for TTS voice selection — stored as 'lang:xx-XX' in ttsVoice */
const INDIC_TTS_LANGS=[
  ['te-IN','Telugu'],['hi-IN','Hindi'],['ta-IN','Tamil'],['kn-IN','Kannada'],
  ['ml-IN','Malayalam'],['mr-IN','Marathi'],['bn-IN','Bengali'],['en-IN','English (India)'],
  ['en-US','English (US)'],['en-GB','English (UK)']
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function openRouterChat(key,model,messages,maxTokens,onWait){
  let res;
  for(let attempt=0;;attempt++){
    res=await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json','X-Title':'Instapaper PWA'},
      body:JSON.stringify({model,messages,max_tokens:maxTokens||2048,temperature:0.4})
    },120000);
    if(res.status===429&&attempt<2){ // free tiers burst-limit easily — back off and retry
      const wait=(attempt+1)*6;
      if(onWait)onWait('Rate limited — retrying in '+wait+'s…');
      await sleep(wait*1000);
      continue;
    }
    break;
  }
  if(!res.ok){
    let msg='AI request failed ('+res.status+')';
    try{const j=await res.json();if(j&&j.error&&j.error.message)msg=String(j.error.message)}catch(e){}
    if(res.status===401)msg='Invalid OpenRouter API key — check it in the AI settings.';
    else if(res.status===402)msg='Out of OpenRouter credits — switch to a (free) model or top up.';
    else if(res.status===429)msg='OpenRouter rate limit. Free models allow ~20 requests/min and 50/day (1,000/day once you buy $10 credit one time). Wait a minute, pick another :free model, or switch to Google Gemini in Settings → AI.';
    if(/not a valid model/i.test(msg))msg+=' — Tip: rerank and embedding models can’t chat. Pick a chat model in Settings → AI (e.g. Llama 3.3 70B free).';
    throw new Error(msg);
  }
  const j=await res.json();
  const m=j&&j.choices&&j.choices[0]&&j.choices[0].message;
  let out=m&&m.content;
  if(!out||!String(out).trim())out=m&&m.reasoning; // some reasoning models put text here
  out=String(out||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim(); // strip R1 thinking blocks
  if(!out)throw new Error('Empty AI response — try another model.');
  return out;
}

/* ---------- Google Gemini (direct API) ---------- */
const GEMINI_MODELS=[
  ['gemini-2.5-flash','Gemini 2.5 Flash (fast, free tier)'],
  ['gemini-2.5-pro','Gemini 2.5 Pro (best quality)'],
  ['gemini-2.5-flash-lite','Gemini 2.5 Flash-Lite (fastest)'],
  ['gemini-2.0-flash','Gemini 2.0 Flash']
];
async function geminiChat(key,model,messages,maxTokens,onWait){
  const sys=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  const contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const body={contents,generationConfig:{maxOutputTokens:maxTokens||2048,temperature:0.4}};
  if(sys)body.systemInstruction={parts:[{text:sys}]};
  let res;
  for(let attempt=0;;attempt++){
    res=await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},120000);
    if(res.status===429&&attempt<2){
      const wait=(attempt+1)*6;
      if(onWait)onWait('Rate limited — retrying in '+wait+'s…');
      await sleep(wait*1000);
      continue;
    }
    break;
  }
  if(!res.ok){
    let msg='Gemini request failed ('+res.status+')';
    try{const j=await res.json();if(j&&j.error&&j.error.message)msg=String(j.error.message)}catch(e){}
    if(res.status===400&&/api key/i.test(msg))msg='Invalid Gemini API key — check it in the AI settings.';
    else if(res.status===403)msg='This Gemini API key isn’t allowed to use '+model+'.';
    else if(res.status===429)msg='Gemini free-tier quota hit — wait a minute and try again, or switch provider in Settings → AI.';
    throw new Error(msg);
  }
  const j=await res.json();
  const cand=j&&j.candidates&&j.candidates[0];
  const out=cand&&cand.content&&cand.content.parts?cand.content.parts.map(p=>p.text||'').join(''):'';
  if(!out.trim()){
    if(cand&&cand.finishReason==='SAFETY')throw new Error('Gemini blocked this content (safety filters) — try another model.');
    throw new Error('Empty Gemini response — try another model.');
  }
  return out.trim();
}

/* live model catalog from OpenRouter — only models that can actually chat */
async function fetchOpenRouterModels(){
  const res=await fetchWithTimeout('https://openrouter.ai/api/v1/models',{},20000);
  if(!res.ok)throw new Error('model list failed ('+res.status+')');
  const j=await res.json();
  const list=(j.data||[]).filter(m=>{
    if(!m||!m.id)return false;
    if(/rerank|embed|guard|moderation/i.test(m.id))return false; // not chat models
    const a=m.architecture||{};
    const outs=a.output_modalities||[];
    if(outs.length&&outs.indexOf('text')<0)return false;
    return true;
  }).map(m=>({
    id:m.id,
    name:m.name||m.id,
    free:/:free$/.test(m.id)||!!(m.pricing&&m.pricing.prompt==='0'&&m.pricing.completion==='0')
  })).filter(m=>m.free); // free models only
  list.sort((a,b)=>a.name.localeCompare(b.name));
  if(!list.length)throw new Error('empty model list');
  return list;
}

/* one entry point for every AI feature — routes to the chosen provider */
function aiChat(S,messages,maxTokens,onWait){
  if(S.aiProvider==='gemini')return geminiChat(S.geminiKey,S.geminiModel||'gemini-2.5-flash',messages,maxTokens,onWait);
  return openRouterChat(S.aiKey,S.aiModel,messages,maxTokens,onWait);
}
const aiReady=S=>S.aiProvider==='gemini'?!!S.geminiKey:!!S.aiKey;
function aiModelLabel(S){
  if(S.aiProvider==='gemini'){const m=GEMINI_MODELS.find(x=>x[0]===S.geminiModel);return m?m[1]:(S.geminiModel||'Gemini')}
  const m=AI_MODELS.find(x=>x[0]===S.aiModel);return m?m[1]:S.aiModel;
}

/* ============================== password vault (AES-256-GCM, PBKDF2) ============================== */
const VAULT_ITER=310000;
function bufToB64(buf){const a=new Uint8Array(buf);let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return btoa(s)}
function b64ToBuf(s){const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
async function vaultKey(pass,salt,iter){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function vaultEncrypt(pass,entries){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await vaultKey(pass,salt,VAULT_ITER);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(entries)));
  return{v:1,iter:VAULT_ITER,salt:bufToB64(salt),iv:bufToB64(iv),ct:bufToB64(ct)};
}
async function vaultDecrypt(pass,blob){
  const key=await vaultKey(pass,b64ToBuf(blob.salt),blob.iter||VAULT_ITER);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBuf(blob.iv)},key,b64ToBuf(blob.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* Opens a URL in the system browser — reliable in PWA standalone mode on iOS where
   window.open() gets blocked as a popup. */
function openExternalUrl(url){
  try{
    const a=document.createElement('a');
    a.href=String(url);a.target='_blank';a.rel='noopener noreferrer';
    a.style.cssText='position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(a);a.click();
    setTimeout(()=>{try{document.body.removeChild(a)}catch(e){}},500);
  }catch(e){try{window.open(String(url),'_blank')}catch(e2){}}
}

/* ============================== in-app browser helpers ============================== */
function browserTarget(input){
  const t=String(input||'').trim();
  if(!t)return'';
  const search='https://www.google.com/search?igu=1&q='+encodeURIComponent(t);
  if(/\s/.test(t)||!t.includes('.'))return search;
  return normalizeUrl(t)||search;
}
function faviconUrl(siteOrUrl){
  let d=String(siteOrUrl||'');
  if(!/^https?:/i.test(d))d='https://'+d;
  const host=domainOf(d)||d;
  return'https://www.google.com/s2/favicons?sz=64&domain='+encodeURIComponent(host);
}


/* detect Indic scripts so text-to-speech picks a matching voice (Telugu, Hindi, …) */
function detectSpeechLang(s){
  if(/[ఀ-౿]/.test(s))return'te-IN';
  if(/[ऀ-ॿ]/.test(s))return'hi-IN';
  if(/[஀-௿]/.test(s))return'ta-IN';
  if(/[ಀ-೿]/.test(s))return'kn-IN';
  if(/[ഀ-ൿ]/.test(s))return'ml-IN';
  if(/[ঀ-৿]/.test(s))return'bn-IN';
  if(/[؀-ۿ]/.test(s))return'ur-IN';
  return'';
}
function pickVoiceFor(lang,preferredName){
  try{
    const voices=speechSynthesis.getVoices();
    if(lang){
      const base=lang.split('-')[0].toLowerCase();
      return voices.find(v=>v.lang&&v.lang.toLowerCase()===lang.toLowerCase())||voices.find(v=>v.lang&&v.lang.toLowerCase().indexOf(base)===0)||null;
    }
    if(preferredName){
      // 'lang:xx-XX' sentinels → match by language code
      if(preferredName.startsWith('lang:')){
        const code=preferredName.slice(5);
        const base=code.split('-')[0].toLowerCase();
        return voices.find(v=>v.lang&&v.lang.toLowerCase()===code.toLowerCase())||voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith(base))||null;
      }
      return voices.find(v=>v.name===preferredName)||null;
    }
  }catch(e){}
  return null;
}

/* ============================== tiny utils ============================== */
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch(e){return''}}
function fmtDate(ts){if(!ts)return'';const d=new Date(ts);return d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}
function timeAgo(ts){if(!ts)return'';const s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60)return'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  if(s<604800)return Math.floor(s/86400)+'d ago';
  return fmtDate(ts);}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function unescapeEnt(s){const d=document.createElement('textarea');d.innerHTML=s;return d.value}
function safeUrl(u){u=String(u||'').trim();return/^https?:\/\//i.test(u)?u:''}
function normalizeUrl(u){u=String(u||'').trim();if(!u)return'';if(!/^https?:\/\//i.test(u))u='https://'+u;try{new URL(u);return u}catch(e){return''}}
function extractFirstUrl(text){const m=String(text||'').match(/https?:\/\/[^\s"'<>]+/);return m?m[0]:''}
function htmlToText(html){const d=document.createElement('div');d.innerHTML=html;return(d.textContent||'').replace(/\s+/g,' ').trim()}
function countWords(text){const t=String(text||'').trim();return t?t.split(/\s+/).length:0}
function readMinutes(words){return Math.max(1,Math.round(words/220))}
function copyText(text){try{navigator.clipboard.writeText(text)}catch(e){try{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta)}catch(e2){}}}
function shareText(title,text,url){if(navigator.share){navigator.share({title:title||'',text:text||'',url:url||undefined}).catch(()=>{})}else{copyText([title,text,url].filter(Boolean).join('\n'))}}
function vibrate(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}

/* ============================== markdown -> safe HTML ============================== */
function mdInline(s){
  s=s.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+&quot;[^&]*&quot;)?\)/g,(m,alt,src)=>{
    const u=safeUrl(unescapeEnt(src));return u?'<img src="'+escapeHtml(u)+'" alt="'+alt+'" loading="lazy"/>':''});
  s=s.replace(/\[([^\]]+)\]\((\S+?)(?:\s+&quot;[^&]*&quot;)?\)/g,(m,t,href)=>{
    const u=safeUrl(unescapeEnt(href));return u?'<a href="'+escapeHtml(u)+'" target="_blank" rel="noopener">'+t+'</a>':t});
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/__([^_]+)__/g,'<strong>$1</strong>');
  s=s.replace(/(^|[\s(>])\*([^*\n]+)\*(?=$|[\s).,;:!?<])/g,'$1<em>$2</em>');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  return s;
}
function mdToHtml(md){
  const lines=escapeHtml(String(md).replace(/\r/g,'')).split('\n');
  const out=[];let para=[],list=null,quote=[],code=null;
  const flushPara=()=>{if(para.length){const t=para.join(' ').trim();if(t)out.push('<p>'+mdInline(t)+'</p>');para=[]}};
  const flushList=()=>{if(list){out.push('<'+list.tag+'>'+list.items.map(i=>'<li>'+mdInline(i)+'</li>').join('')+'</'+list.tag+'>');list=null}};
  const flushQuote=()=>{if(quote.length){out.push('<blockquote><p>'+mdInline(quote.join(' '))+'</p></blockquote>');quote=[]}};
  const flushAll=()=>{flushPara();flushList();flushQuote()};
  for(let i=0;i<lines.length;i++){
    const ln=lines[i];
    if(code!==null){if(/^```/.test(ln)){out.push('<pre>'+code.join('\n')+'</pre>');code=null}else code.push(ln);continue}
    if(/^```/.test(ln)){flushAll();code=[];continue}
    if(/^\s*$/.test(ln)){flushAll();continue}
    let m;
    if(m=ln.match(/^(#{1,6})\s+(.*)$/)){flushAll();const lvl=Math.min(6,m[1].length+1);out.push('<h'+lvl+'>'+mdInline(m[2].replace(/\s*#+\s*$/,''))+'</h'+lvl+'>');continue}
    if(/^(\s*([-*_])\s*\2\s*\2[\s\2]*)$/.test(ln)){flushAll();out.push('<hr/>');continue}
    if(m=ln.match(/^\s*&gt;\s?(.*)$/)){flushPara();flushList();quote.push(m[1]);continue}
    if(m=ln.match(/^\s*[-*+]\s+(.*)$/)){flushPara();flushQuote();if(!list||list.tag!=='ul'){flushList();list={tag:'ul',items:[]}}list.items.push(m[1]);continue}
    if(m=ln.match(/^\s*\d+\.\s+(.*)$/)){flushPara();flushQuote();if(!list||list.tag!=='ol'){flushList();list={tag:'ol',items:[]}}list.items.push(m[1]);continue}
    flushList();flushQuote();para.push(ln.trim());
  }
  if(code!==null)out.push('<pre>'+code.join('\n')+'</pre>');
  flushAll();
  return out.join('\n');
}

/* ============================== HTML -> markdown (for the content editor) ============================== */
function htmlToMd(html){
  const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
  const root=doc.body.firstChild;
  if(!root)return'';
  const inline=node=>{
    let s='';
    for(const c of node.childNodes){
      if(c.nodeType===3)s+=c.nodeValue;
      else if(c.nodeType===1){
        const t=c.tagName;
        if(t==='STRONG'||t==='B')s+='**'+inline(c)+'**';
        else if(t==='EM'||t==='I')s+='*'+inline(c)+'*';
        else if(t==='CODE')s+='`'+inline(c)+'`';
        else if(t==='A')s+='['+(inline(c)||'link')+']('+(c.getAttribute('href')||'')+')';
        else if(t==='IMG')s+='!['+(c.getAttribute('alt')||'')+']('+(c.getAttribute('src')||'')+')';
        else if(t==='BR')s+='\n';
        else s+=inline(c);
      }
    }
    return s;
  };
  const out=[];
  const walk=node=>{
    for(const c of Array.from(node.children||[])){
      const t=c.tagName;let m;
      if((m=/^H([1-6])$/.exec(t)))out.push('#'.repeat(Math.max(1,+m[1]-1))+' '+inline(c).replace(/\s+/g,' ').trim());
      else if(t==='P'){const s=inline(c).trim();if(s)out.push(s)}
      else if(t==='BLOCKQUOTE')out.push(inline(c).trim().split('\n').map(l=>'> '+l.trim()).filter(l=>l!=='>').join('\n'));
      else if(t==='UL')out.push(Array.from(c.children).map(li=>'- '+inline(li).replace(/\s+/g,' ').trim()).join('\n'));
      else if(t==='OL')out.push(Array.from(c.children).map((li,i)=>(i+1)+'. '+inline(li).replace(/\s+/g,' ').trim()).join('\n'));
      else if(t==='PRE')out.push('```\n'+c.textContent.replace(/\n*$/,'')+'\n```');
      else if(t==='HR')out.push('---');
      else if(t==='IMG')out.push('!['+(c.getAttribute('alt')||'')+']('+(c.getAttribute('src')||'')+')');
      else if(t==='FIGURE'||t==='DIV'||t==='SECTION'||t==='ARTICLE')walk(c);
      else{const s=inline(c).trim();if(s)out.push(s)}
    }
  };
  walk(root);
  return out.join('\n\n');
}

/* plain-text paragraphs of an article (used for chunked AI translation) */
function blockTexts(html){
  try{
    const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
    const out=[];
    doc.body.firstChild.querySelectorAll('p,h2,h3,h4,h5,h6,li,blockquote,figcaption').forEach(n=>{
      if(n.tagName==='P'&&n.parentElement&&n.parentElement.closest('blockquote,li'))return;
      const t=(n.textContent||'').replace(/\s+/g,' ').trim();
      if(t)out.push(t);
    });
    if(out.length)return out;
  }catch(e){}
  const flat=htmlToText(html);
  return flat?[flat]:[];
}
function chunkParas(paras,max){
  max=max||2400;
  const chunks=[];let cur=[];let len=0;
  const flush=()=>{if(cur.length){chunks.push(cur.join('\n\n'));cur=[];len=0}};
  for(let p of paras){
    if(p.length>max){flush();while(p.length>max){chunks.push(p.slice(0,max));p=p.slice(max)}}
    if(len+p.length>max)flush();
    if(p)cur.push(p);len+=p.length+2;
  }
  flush();
  return chunks;
}

/* ============================== sentence + word tooling ============================== */
function toSentences(text){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)return[];
  let parts=clean.match(/[^.!?…]+[.!?…]+["”'’)\]]*\s*|[^.!?…]+$/g)||[clean];
  parts=parts.map(p=>p.trim()).filter(Boolean);
  // merge very short fragments with the previous sentence
  const merged=[];
  for(const p of parts){
    if(merged.length&&(p.length<6||merged[merged.length-1].length<6))merged[merged.length-1]+=' '+p;
    else merged.push(p);
  }
  // keep utterances comfortably sized for speech engines
  const out=[];
  for(const s of merged){
    if(s.length<=260){out.push(s);continue}
    let rest=s;
    while(rest.length>260){
      let cut=rest.lastIndexOf(', ',250);if(cut<120)cut=rest.lastIndexOf(' ',250);if(cut<60)cut=250;
      out.push(rest.slice(0,cut+1).trim());rest=rest.slice(cut+1);
    }
    if(rest.trim())out.push(rest.trim());
  }
  return out;
}
function orpIndex(word){const n=word.replace(/[^A-Za-z0-9À-ɏ]/g,'').length||word.length;if(n<=1)return 0;if(n<=5)return 1;if(n<=9)return 2;if(n<=13)return 3;return 4}

/* ============================== article fetching ============================== */
function ytIdOf(url){const m=String(url||'').match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);return m?m[1]:null}

async function fetchWithTimeout(url,opts,ms){
  const ctrl=('AbortController'in window)?new AbortController():null;
  const t=ctrl?setTimeout(()=>ctrl.abort(),ms||20000):null;
  try{return await fetch(url,Object.assign({},opts,ctrl?{signal:ctrl.signal}:{}))}
  finally{if(t)clearTimeout(t)}
}

async function fetchViaJina(url){
  const res=await fetchWithTimeout('https://r.jina.ai/'+url,{},25000);
  if(!res.ok)throw new Error('reader '+res.status);
  const body=await res.text();
  if(!body||body.length<40)throw new Error('empty reader response');
  let title='',published='',md=body;
  const idx=body.indexOf('Markdown Content:');
  if(idx>-1){
    const head=body.slice(0,idx);md=body.slice(idx+'Markdown Content:'.length).replace(/^\n+/,'');
    const tm=head.match(/^Title:\s*(.+)$/m);if(tm)title=tm[1].trim();
    const pm=head.match(/^Published Time:\s*(.+)$/m);if(pm)published=pm[1].trim();
  }
  const html=mdToHtml(md);
  const text=htmlToText(html);
  if(text.length<120)throw new Error('reader returned too little text');
  // first image in content as hero candidate
  let image='';const im=html.match(/<img src="([^"]+)"/);if(im)image=unescapeEnt(im[1]);
  let publishedAt=0;if(published){const d=Date.parse(published);if(!isNaN(d))publishedAt=d}
  return{title,html,text,image,publishedAt,author:''};
}

const PROXIES=[u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),u=>'https://corsproxy.io/?url='+encodeURIComponent(u)];
async function fetchRawHtml(url){
  let lastErr=null;
  for(const p of PROXIES){
    try{
      const res=await fetchWithTimeout(p(url),{},25000);
      if(!res.ok)throw new Error('proxy '+res.status);
      const text=await res.text();
      if(text&&text.length>200)return text;
      throw new Error('empty proxy response');
    }catch(e){lastErr=e}
  }
  throw lastErr||new Error('all proxies failed');
}

const SAN_ALLOW={P:'p',H1:'h2',H2:'h2',H3:'h3',H4:'h4',H5:'h5',H6:'h6',BLOCKQUOTE:'blockquote',UL:'ul',OL:'ol',LI:'li',PRE:'pre',CODE:'code',EM:'em',I:'em',STRONG:'strong',B:'strong',A:'a',IMG:'img',FIGURE:'figure',FIGCAPTION:'figcaption',BR:'br',HR:'hr',MARK:'em',CITE:'cite',SUP:'sup',SUB:'sub'};
function absUrl(u,base){try{return new URL(u,base).href}catch(e){return''}}
function sanitizeNode(node,base){
  if(node.nodeType===3)return escapeHtml(node.nodeValue);
  if(node.nodeType!==1)return'';
  const tag=SAN_ALLOW[node.tagName];
  let kids='';
  for(const c of node.childNodes)kids+=sanitizeNode(c,base);
  if(!tag)return kids;
  if(tag==='br')return'<br/>';
  if(tag==='hr')return'<hr/>';
  if(tag==='img'){
    let src=node.getAttribute('src')||node.getAttribute('data-src')||node.getAttribute('data-lazy-src')||'';
    if(!src){const ss=node.getAttribute('srcset')||node.getAttribute('data-srcset')||'';if(ss)src=ss.split(',')[0].trim().split(/\s+/)[0]}
    src=absUrl(src,base);
    if(!/^https?:/.test(src))return'';
    const alt=escapeHtml(node.getAttribute('alt')||'');
    return'<img src="'+escapeHtml(src)+'" alt="'+alt+'" loading="lazy"/>';
  }
  if(tag==='a'){
    const href=absUrl(node.getAttribute('href')||'',base);
    if(!/^https?:/.test(href))return kids;
    return'<a href="'+escapeHtml(href)+'" target="_blank" rel="noopener">'+kids+'</a>';
  }
  if(!kids.trim()&&tag!=='figure')return'';
  return'<'+tag+'>'+kids+'</'+tag+'>';
}
function extractFromHtml(rawHtml,url){
  const doc=new DOMParser().parseFromString(rawHtml,'text/html');
  const meta=sel=>{const el=doc.querySelector(sel);return el?(el.getAttribute('content')||'').trim():''};
  const title=meta('meta[property="og:title"]')||meta('meta[name="twitter:title"]')||(doc.querySelector('title')?doc.querySelector('title').textContent.trim():'');
  const image=absUrl(meta('meta[property="og:image"]')||meta('meta[name="twitter:image"]')||'',url);
  const author=meta('meta[name="author"]')||meta('meta[property="article:author"]')||'';
  let publishedAt=0;const pub=meta('meta[property="article:published_time"]')||meta('meta[name="date"]');
  if(pub){const d=Date.parse(pub);if(!isNaN(d))publishedAt=d}
  doc.querySelectorAll('script,style,noscript,svg,form,iframe,nav,footer,header,aside,button,select,input,video,audio,[role="navigation"],[aria-hidden="true"],.ad,.ads,.advert,.share,.social,.comments,.related').forEach(n=>{try{n.remove()}catch(e){}});
  // pick the container with the densest paragraph text
  const scores=new Map();
  doc.body&&doc.body.querySelectorAll('p').forEach(p=>{
    const t=(p.textContent||'').trim();
    if(t.length<25)return;
    const sc=t.length+(t.match(/,/g)||[]).length*12;
    let par=p.parentElement,mult=1;
    while(par&&par!==doc.body&&mult>0.2){scores.set(par,(scores.get(par)||0)+sc*mult);mult*=0.5;par=par.parentElement}
  });
  let best=doc.body,bestScore=0;
  scores.forEach((sc,el)=>{if(sc>bestScore){bestScore=sc;best=el}});
  if(!best)throw new Error('no content found');
  let html=sanitizeNode(best,url).replace(/(<p>\s*<\/p>)+/g,'');
  const text=htmlToText(html);
  if(text.length<160)throw new Error('could not extract article text');
  return{title,html,text,image,author:typeof author==='string'?author.replace(/^https?:\/\/\S+$/,''):'',publishedAt};
}

async function fetchYouTubeMeta(url,id){
  let title='YouTube Video',author='';
  try{
    const res=await fetchWithTimeout('https://noembed.com/embed?url='+encodeURIComponent(url),{},12000);
    if(res.ok){const j=await res.json();if(j&&j.title){title=j.title;author=j.author_name||''}}
  }catch(e){}
  if(title==='YouTube Video'){
    try{
      const raw=await fetchRawHtml('https://www.youtube.com/oembed?url='+encodeURIComponent(url)+'&format=json');
      const j=JSON.parse(raw);if(j&&j.title){title=j.title;author=j.author_name||''}
    }catch(e){}
  }
  return{title,author,image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'};
}

/* returns a full article record (without id/folder) */
async function fetchArticleData(url){
  const vid=ytIdOf(url);
  if(vid){
    const m=await fetchYouTubeMeta(url,vid);
    return{url,title:m.title,source:'YouTube',author:m.author,image:m.image,html:'',text:'',excerpt:m.author?('Video by '+m.author):'Saved video',words:0,readMin:0,isVideo:true,videoId:vid,publishedAt:0};
  }
  let res=null,err1=null;
  try{res=await fetchViaJina(url)}catch(e){err1=e}
  if(!res){
    const raw=await fetchRawHtml(url); // throws if all proxies fail
    res=extractFromHtml(raw,url);
  }
  const text=res.text;
  const words=countWords(text);
  return{
    url,
    title:(res.title||domainOf(url)||'Untitled').trim(),
    source:domainOf(url),
    author:(res.author||'').trim(),
    image:safeUrl(res.image||''),
    html:res.html,text,
    excerpt:text.slice(0,220).trim(),
    words,readMin:readMinutes(words),
    isVideo:false,videoId:null,
    publishedAt:res.publishedAt||0
  };
}

/* ============================== daily brief (news) ============================== */
/* Regions to read the brief from — "Global" and "India" are the two headline
   regions; the rest let you pick any other country. */
const BRIEF_REGIONS=[
  {id:'global',label:'Global',flag:'🌐',hl:'en-US',gl:'US',ceid:'US:en'},
  {id:'IN',label:'India',flag:'🇮🇳',hl:'en-IN',gl:'IN',ceid:'IN:en'},
  {id:'US',label:'United States',flag:'🇺🇸',hl:'en-US',gl:'US',ceid:'US:en'},
  {id:'GB',label:'United Kingdom',flag:'🇬🇧',hl:'en-GB',gl:'GB',ceid:'GB:en'},
  {id:'AU',label:'Australia',flag:'🇦🇺',hl:'en-AU',gl:'AU',ceid:'AU:en'},
  {id:'CA',label:'Canada',flag:'🇨🇦',hl:'en-CA',gl:'CA',ceid:'CA:en'},
  {id:'SG',label:'Singapore',flag:'🇸🇬',hl:'en-SG',gl:'SG',ceid:'SG:en'},
  {id:'AE',label:'UAE',flag:'🇦🇪',hl:'en-AE',gl:'AE',ceid:'AE:en'}
];
/* News categories — empty topic id means Google News "Top stories". */
const BRIEF_CATEGORIES=[
  {id:'',label:'Top stories'},
  {id:'WORLD',label:'World'},
  {id:'NATION',label:'National'},
  {id:'BUSINESS',label:'Business'},
  {id:'TECHNOLOGY',label:'Technology'},
  {id:'SCIENCE',label:'Science'},
  {id:'HEALTH',label:'Health'},
  {id:'SPORTS',label:'Sports'},
  {id:'ENTERTAINMENT',label:'Entertainment'}
];
const briefRegion=id=>BRIEF_REGIONS.find(r=>r.id===id)||BRIEF_REGIONS[0];
function briefFeedUrl(region,topic){
  const qs='hl='+region.hl+'&gl='+region.gl+'&ceid='+encodeURIComponent(region.ceid);
  return topic
    ?'https://news.google.com/rss/headlines/section/topic/'+topic+'?'+qs
    :'https://news.google.com/rss?'+qs;
}
/* Fetch + parse a Google News RSS feed into clean headline items. */
async function fetchBrief(regionId,topic){
  const region=briefRegion(regionId);
  const xml=await fetchRawHtml(briefFeedUrl(region,topic)); // through CORS proxies
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  if(doc.querySelector('parsererror'))throw new Error('Could not read the news feed');
  const childText=(parent,tag)=>{const e=parent.getElementsByTagName(tag)[0];return e?e.textContent.trim():''};
  const items=[];
  const nodes=doc.getElementsByTagName('item');
  for(let i=0;i<nodes.length;i++){
    const it=nodes[i];
    const link=childText(it,'link');
    let title=childText(it,'title');
    if(!link||!title)continue;
    const srcEl=it.getElementsByTagName('source')[0];
    let source=srcEl?srcEl.textContent.trim():'';
    // Google News titles read "Headline - Source"; split the source off the end.
    if(source&&title.endsWith(' - '+source))title=title.slice(0,-(source.length+3)).trim();
    else if(!source){const m=title.match(/^(.+) - ([^-]{2,40})$/);if(m){title=m[1].trim();source=m[2].trim()}}
    const pub=childText(it,'pubDate');
    let publishedAt=0;if(pub){const d=Date.parse(pub);if(!isNaN(d))publishedAt=d}
    items.push({title,url:link,source,publishedAt});
  }
  if(!items.length)throw new Error('No stories found for this region');
  return items;
}

/* ============================== seed content ============================== */
const WELCOME_HTML=[
'<p><em>Welcome! This is your own premium reading app — every feature unlocked, no subscription, forever free.</em></p>',
'<h2>Save anything</h2>',
'<p>Tap the round <strong>+</strong> button on the home screen and paste any link. The article is downloaded, stripped of clutter, and stored on your device so you can read it <strong>offline</strong> — on airplanes, subways, elevators, anywhere. If a page still has unwanted bits, long-press it and choose <strong>Edit content</strong> to remove blocks or edit the text.</p>',
'<h2>AI superpowers</h2>',
'<p>Tap the <strong>✦ AI</strong> icon in the header (or inside any article) to <strong>summarize</strong>, <strong>translate</strong> into Telugu, Hindi and many other languages, <strong>rewrite</strong>, or <strong>ask questions</strong> about an article — powered by your own free OpenRouter API key (DeepSeek, Llama, and more). Translations can be saved as new articles and even read aloud in తెలుగు or हिन्दी.</p>',
'<p>YouTube links are saved as <strong>Videos</strong> with their thumbnail, ready to watch from the Videos folder.</p>',
'<h2>A reading experience you control</h2>',
'<p>Inside any article tap <strong>Aa</strong> to choose fonts, text size, line spacing, and four color themes — Light, Sepia, Dark, and Black.</p>',
'<h2>Highlights &amp; notes — unlimited</h2>',
'<p>Select any text in an article to <mark>highlight it</mark> or attach a note. Find that great quote you want to remember! Everything you mark is collected in the <strong>Notes</strong> section of the sidebar.</p>',
'<h2>Listen with text-to-speech</h2>',
'<p>Have articles narrated to you. Open an article, tap <strong>⋯ → Listen</strong>, turn up the volume and relax. Build a <strong>Playlist</strong> from the ○○○ menu to listen to multiple articles seamlessly, back to back.</p>',
'<h2>Speed reading</h2>',
'<p>Get through articles up to <strong>3× faster</strong>. Tap <strong>⋯ → Speed Read</strong> in any article and words are flashed one at a time at your chosen pace.</p>',
'<h2>Stay organized</h2>',
'<p>Create folders from the <strong>+</strong> button, tag articles, sort your list by date, length, or popularity, and use <strong>full-text search</strong> to find anything you have ever saved.</p>',
'<h2>Install on your home screen</h2>',
'<p>In Safari tap the Share button, then <strong>Add to Home Screen</strong>. The app opens full screen and works completely offline.</p>',
'<p>Happy reading!</p>'].join('\n');

function makeSeed(){
  const html=WELCOME_HTML,text=htmlToText(html),words=countWords(text);
  return{
    id:'welcome',url:'',title:'Welcome to Instapaper',source:'Instapaper',author:'your reading app',
    image:'',html,text,excerpt:text.slice(0,220),words,readMin:readMinutes(words),
    isVideo:false,videoId:null,publishedAt:Date.now(),addedAt:Date.now(),
    liked:false,archived:false,folderId:null,tags:[],progress:0,opens:0,highlights:[]
  };
}

/* ============================== storage ============================== */
function loadStore(){
  let d=null;
  try{d=JSON.parse(localStorage.getItem(STORE_KEY)||'null')}catch(e){d=null}
  if(!d||typeof d!=='object')d={};
  d.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});
  if(DEAD_MODELS.includes(d.settings.aiModel))d.settings.aiModel=DEFAULT_SETTINGS.aiModel;
  d.articles=Array.isArray(d.articles)?d.articles:[];
  d.folders=Array.isArray(d.folders)?d.folders:[];
  d.articles.forEach(a=>{a.tags=Array.isArray(a.tags)?a.tags:[];a.highlights=Array.isArray(a.highlights)?a.highlights:[]});
  d.sites=Array.isArray(d.sites)?d.sites:[];
  d.vault=d.vault&&d.vault.ct?d.vault:null;
  if(!d.seeded){d.articles.unshift(makeSeed());d.seeded=true}
  return d;
}

/* ============================== icons ============================== */
function Svg(props,...kids){
  return h('svg',Object.assign({xmlns:'http://www.w3.org/2000/svg',width:props.size||22,height:props.size||22,viewBox:props.vb||'0 0 24 24',fill:'none',style:Object.assign({display:'block',flexShrink:0},props.style||{})},{}),...kids);
}
function P(d,extra){return h('path',Object.assign({d,stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round'},extra||{}))}
const Icons={
  menu:s=>Svg({size:s},P('M3.5 6.5h17M3.5 12h17M3.5 17.5h17')),
  dots:s=>Svg({size:s},h('circle',{cx:5,cy:12,r:1.9,stroke:'currentColor',strokeWidth:1.5}),h('circle',{cx:12,cy:12,r:1.9,stroke:'currentColor',strokeWidth:1.5}),h('circle',{cx:19,cy:12,r:1.9,stroke:'currentColor',strokeWidth:1.5})),
  search:s=>Svg({size:s},h('circle',{cx:11,cy:11,r:6.5,stroke:'currentColor',strokeWidth:1.7}),P('M16 16l4.2 4.2')),
  home:s=>Svg({size:s},P('M4 11.2 12 4l8 7.2'),P('M5.8 9.8V20h12.4V9.8'),P('M10 20v-5h4v5')),
  heart:(s,fill)=>Svg({size:s},h('path',{d:'M12 20.2S4 14.8 4 9.6C4 6.9 6.1 5 8.5 5c1.5 0 2.8.8 3.5 2 .7-1.2 2-2 3.5-2C17.9 5 20 6.9 20 9.6c0 5.2-8 10.6-8 10.6Z',stroke:'currentColor',strokeWidth:1.7,strokeLinejoin:'round',fill:fill?'currentColor':'none'})),
  archive:s=>Svg({size:s},h('rect',{x:3.5,y:5,width:17,height:4.4,rx:1,stroke:'currentColor',strokeWidth:1.7}),P('M5.2 9.4V19h13.6V9.4'),P('M9.8 13h4.4')),
  video:s=>Svg({size:s},h('rect',{x:3.5,y:5.5,width:17,height:13,rx:2.6,stroke:'currentColor',strokeWidth:1.7}),h('path',{d:'M10.3 9.3v5.4l4.8-2.7-4.8-2.7Z',fill:'currentColor'})),
  notes:s=>Svg({size:s},P('M4 5.8C4 4.8 4.8 4 5.8 4h12.4c1 0 1.8.8 1.8 1.8v9.4c0 1-.8 1.8-1.8 1.8H9l-3.6 3v-3H5.8c-1 0-1.8-.8-1.8-1.8V5.8Z'),P('M8 8.6h8M8 12h5.5')),
  tag:s=>Svg({size:s},P('M4 5.5C4 4.7 4.7 4 5.5 4h5.2c.4 0 .8.2 1.1.4l7.7 7.7c.6.6.6 1.6 0 2.2l-5.2 5.2c-.6.6-1.6.6-2.2 0L4.4 11.8a1.6 1.6 0 0 1-.4-1.1V5.5Z'),h('circle',{cx:8.6,cy:8.6,r:1.3,fill:'currentColor'})),
  folder:s=>Svg({size:s},P('M3.5 7c0-1 .8-1.8 1.8-1.8h4l2 2.2h7.4c1 0 1.8.8 1.8 1.8v8c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8V7Z'),P('M3.5 10h17')),
  plus:s=>Svg({size:s},P('M12 4.5v15M4.5 12h15')),
  gear:s=>Svg({size:s},h('circle',{cx:12,cy:12,r:3.2,stroke:'currentColor',strokeWidth:1.7}),P('M12 3.2v2.2M12 18.6v2.2M20.8 12h-2.2M5.4 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8')),
  back:s=>Svg({size:s},P('M14.5 5.5 8 12l6.5 6.5')),
  chevR:s=>Svg({size:s},P('M9.5 5.5 16 12l-6.5 6.5')),
  share:s=>Svg({size:s},P('M12 3.5v11M8.2 7 12 3.3 15.8 7'),P('M6.5 11H5.8C4.8 11 4 11.8 4 12.8v6c0 1 .8 1.8 1.8 1.8h12.4c1 0 1.8-.8 1.8-1.8v-6c0-1-.8-1.8-1.8-1.8h-.7')),
  play:(s,fill)=>Svg({size:s},h('path',{d:'M7.5 5.2v13.6L19 12 7.5 5.2Z',fill:fill?'currentColor':'none',stroke:'currentColor',strokeWidth:1.7,strokeLinejoin:'round'})),
  pause:s=>Svg({size:s},h('rect',{x:6.4,y:5,width:3.6,height:14,rx:1,fill:'currentColor'}),h('rect',{x:14,y:5,width:3.6,height:14,rx:1,fill:'currentColor'})),
  skipB:s=>Svg({size:s},h('path',{d:'M19 6.5v11L11.5 12 19 6.5Z',fill:'currentColor'}),h('rect',{x:5.5,y:6,width:2.2,height:12,rx:1,fill:'currentColor'})),
  skipF:s=>Svg({size:s},h('path',{d:'M5 6.5v11L12.5 12 5 6.5Z',fill:'currentColor'}),h('rect',{x:16.3,y:6,width:2.2,height:12,rx:1,fill:'currentColor'})),
  headphones:s=>Svg({size:s},P('M4.5 17v-4.5a7.5 7.5 0 0 1 15 0V17'),P('M4.5 13.8h2.2c.7 0 1.3.6 1.3 1.3v3.1c0 .7-.6 1.3-1.3 1.3H5.8c-.7 0-1.3-.6-1.3-1.3v-4.4ZM19.5 13.8h-2.2c-.7 0-1.3.6-1.3 1.3v3.1c0 .7.6 1.3 1.3 1.3h.9c.7 0 1.3-.6 1.3-1.3v-4.4Z')),
  bolt:s=>Svg({size:s},P('M13 3 5.5 13.5h5L11 21l7.5-10.5h-5L13 3Z')),
  sort:s=>Svg({size:s},P('M8 5v14M8 5 4.8 8.2M8 5l3.2 3.2'),P('M16 19V5M16 19l-3.2-3.2M16 19l3.2-3.2')),
  filter:s=>Svg({size:s},P('M4 7h16M7 12h10M10 17h4')),
  checkCircle:(s,fill)=>Svg({size:s},h('circle',{cx:12,cy:12,r:8.5,stroke:'currentColor',strokeWidth:1.7,fill:fill?'currentColor':'none'}),fill?P('M8.5 12.2l2.4 2.4 4.6-4.8',{stroke:'#fff',strokeWidth:2}):P('M8.5 12.2l2.4 2.4 4.6-4.8')),
  playlist:s=>Svg({size:s},P('M4 6.5h11M4 11h11M4 15.5h6'),h('circle',{cx:16.7,cy:16.8,r:2.3,stroke:'currentColor',strokeWidth:1.6}),P('M19 16.8V9.5l2.5-.8')),
  trash:s=>Svg({size:s},P('M4.5 6.5h15M9.5 6V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V6'),P('M6.3 6.5 7 19c.05.9.8 1.5 1.7 1.5h6.6c.9 0 1.65-.6 1.7-1.5l.7-12.5'),P('M10 10.5v6M14 10.5v6')),
  pencil:s=>Svg({size:s},P('M14.5 5.5 18.5 9.5M4.5 19.5l.8-3.6L16.5 4.7c.7-.7 1.9-.7 2.6 0l.2.2c.7.7.7 1.9 0 2.6L8.1 18.7l-3.6.8Z')),
  x:s=>Svg({size:s},P('M6 6l12 12M18 6 6 18')),
  link:s=>Svg({size:s},P('M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 1 0-5.7-5.7L11.6 6.7'),P('M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 1 0 5.7 5.7l1.5-1.5')),
  copy:s=>Svg({size:s},h('rect',{x:8.5,y:8.5,width:11,height:11,rx:2,stroke:'currentColor',strokeWidth:1.7}),P('M5.5 14.5h-.2A1.8 1.8 0 0 1 3.5 12.7V5.3c0-1 .8-1.8 1.8-1.8h7.4c1 0 1.8.8 1.8 1.8v.2')),
  check:s=>Svg({size:s},P('M5 12.5l4.5 4.5L19 7.5')),
  highlight:s=>Svg({size:s},P('M8.5 13.5 5 17v2.5h6L14.5 16'),P('M9 13l7.8-7.8c.7-.7 1.9-.7 2.6 0l.2.2-.2-.2c.7.7.7 1.9 0 2.6L11.6 15.6 9 13Z')),
  note:s=>Svg({size:s},P('M5 5.8C5 4.8 5.8 4 6.8 4h10.4c1 0 1.8.8 1.8 1.8v8.9L14.7 19H6.8c-1 0-1.8-.8-1.8-1.8V5.8Z'),P('M14.7 19v-4.3H19')),
  moon:s=>Svg({size:s},P('M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z')),
  globe:s=>Svg({size:s},h('circle',{cx:12,cy:12,r:8.5,stroke:'currentColor',strokeWidth:1.7}),P('M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5Z')),
  download:s=>Svg({size:s},P('M12 4v11M8 11.2 12 15.2 16 11.2'),P('M4.5 16.5v2c0 1 .8 1.8 1.8 1.8h11.4c1 0 1.8-.8 1.8-1.8v-2')),
  upload:s=>Svg({size:s},P('M12 15V4M8 7.8 12 3.8 16 7.8'),P('M4.5 16.5v2c0 1 .8 1.8 1.8 1.8h11.4c1 0 1.8-.8 1.8-1.8v-2')),
  ai:s=>Svg({size:s},P('M11 3.8 12.7 8.6 17.5 10.3 12.7 12 11 16.8 9.3 12 4.5 10.3 9.3 8.6 11 3.8Z'),P('M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',{strokeWidth:1.4})),
  contrast:s=>Svg({size:s},h('circle',{cx:12,cy:12,r:8.5,stroke:'currentColor',strokeWidth:1.7}),h('path',{d:'M12 3.5a8.5 8.5 0 0 1 0 17V3.5Z',fill:'currentColor'})),
  blocks:s=>Svg({size:s},h('rect',{x:4,y:4,width:16,height:6.5,rx:1.5,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:4,y:13.5,width:9,height:6.5,rx:1.5,stroke:'currentColor',strokeWidth:1.7}),P('M16.5 15.2l3 3M19.5 15.2l-3 3')),
  refresh:s=>Svg({size:s},P('M19.5 12a7.5 7.5 0 1 1-2.2-5.3'),P('M19.6 3.6v3.6h-3.6')),
  external:s=>Svg({size:s},P('M9.5 5H6.8C5.8 5 5 5.8 5 6.8v10.4c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8V14.5'),P('M13.5 4.5h6v6'),P('M19 5l-7.5 7.5')),
  key:s=>Svg({size:s},h('circle',{cx:8,cy:15,r:4,stroke:'currentColor',strokeWidth:1.7}),P('M11 12 19.5 3.5M16 7l2.5 2.5M13.5 9.5l1.8 1.8')),
  news:s=>Svg({size:s},P('M4 6.2C4 5.5 4.5 5 5.2 5h11.6c.7 0 1.2.5 1.2 1.2V18a1.8 1.8 0 0 0 1.8 1.8H6.8A2.8 2.8 0 0 1 4 17V6.2Z'),P('M7 8.5h7M7 12h7M7 15.5h4'),P('M18 9.5h1.5c.6 0 1 .4 1 1V18'))
};
/* ============================== shared UI ============================== */
const iconBtnS={width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,flexShrink:0};
const SAFE_T='env(safe-area-inset-top)';
const SAFE_B='env(safe-area-inset-bottom)';

function useLongPress(cb){
  const ref=useRef({t:null,x:0,y:0,fired:false});
  const clear=()=>{if(ref.current.t){clearTimeout(ref.current.t);ref.current.t=null}};
  return{
    onTouchStart:e=>{const t=e.touches[0];ref.current.x=t.clientX;ref.current.y=t.clientY;ref.current.fired=false;clear();ref.current.t=setTimeout(()=>{ref.current.fired=true;vibrate(10);cb()},480)},
    onTouchMove:e=>{const t=e.touches[0];if(Math.abs(t.clientX-ref.current.x)>10||Math.abs(t.clientY-ref.current.y)>10)clear()},
    onTouchEnd:clear,
    onMouseDown:()=>{ref.current.fired=false;clear();ref.current.t=setTimeout(()=>{ref.current.fired=true;cb()},480)},
    onMouseUp:clear,onMouseLeave:clear,
    onContextMenu:e=>{e.preventDefault()},
    firedRef:ref
  };
}

function Sheet({T,onClose,title,children,maxH,z}){
  return h('div',{style:{position:'fixed',inset:0,zIndex:z||70}},
    h('div',{onClick:onClose,className:'fdin',style:{position:'absolute',inset:0,background:T.overlay}}),
    h('div',{className:'shn',style:{position:'absolute',left:0,right:0,bottom:0,background:T.sheet,color:T.fg,borderRadius:'16px 16px 0 0',maxHeight:maxH||'88%',display:'flex',flexDirection:'column',boxShadow:'0 -8px 40px rgba(0,0,0,.25)'}},
      h('div',{style:{width:38,height:5,borderRadius:3,background:T.hair,margin:'8px auto 0',flexShrink:0}}),
      title?h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 18px 6px',flexShrink:0}},
        h('div',{style:{fontSize:18,fontWeight:600,fontFamily:UIF}},title),
        h('button',{onClick:onClose,className:'act90 trt',style:Object.assign({},iconBtnS,{color:T.sub})},Icons.x(20))):null,
      h('div',{className:'sy',style:{overflowY:'auto',flex:'0 1 auto',paddingBottom:'calc(6px + '+SAFE_B+')'}},children)
    ));
}

function ARow({T,icon,label,sub,danger,onClick,right,active}){
  return h('button',{onClick,className:'act98 trc',style:{display:'flex',alignItems:'center',gap:16,width:'100%',padding:'15px 20px',textAlign:'left',color:danger?T.danger:T.fg,borderBottom:'1px solid '+T.hair}},
    icon?h('span',{style:{color:danger?T.danger:T.meta,display:'flex'}},icon):null,
    h('span',{style:{flex:1,minWidth:0}},
      h('span',{style:{display:'block',fontSize:16.5,fontWeight:active?600:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},label),
      sub?h('span',{style:{display:'block',fontSize:12.5,color:T.sub,marginTop:2}},sub):null),
    right||null);
}

function PrimaryBtn({T,label,onClick,danger,disabled,style}){
  return h('button',{onClick,disabled,className:'act98 trc',style:Object.assign({display:'block',width:'calc(100% - 40px)',margin:'14px 20px 0',padding:'15px',borderRadius:12,background:danger?T.danger:T.fg,color:danger?'#fff':T.bg,fontSize:16.5,fontWeight:600,opacity:disabled?0.45:1,textAlign:'center'},style||{})},label);
}

function Toast({T,toast}){
  if(!toast)return null;
  return h('div',{className:'fdin',style:{position:'fixed',left:0,right:0,bottom:'calc(34px + '+SAFE_B+')',display:'flex',justifyContent:'center',zIndex:120,pointerEvents:'none'}},
    h('div',{style:{background:isDarkTheme(T.id)?'#3a3a3f':'#26262a',color:'#f2f2f3',padding:'11px 20px',borderRadius:24,fontSize:14.5,fontWeight:500,maxWidth:'82%',boxShadow:'0 6px 24px rgba(0,0,0,.3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},toast));
}

function Spinner({T,size}){
  const s=size||18;
  return h('span',{className:'spin',style:{width:s,height:s,borderRadius:'50%',border:'2.5px solid '+T.hair,borderTopColor:T.fg,display:'inline-block',flexShrink:0}});
}

/* gentle home-screen nudge to export a backup when one is due */
function BackupBanner({T,never,onExport,onLater}){
  return h('div',{className:'fdin',style:{margin:'0 16px 10px',padding:'12px 14px',borderRadius:12,background:T.card,border:'1px solid '+T.hair,display:'flex',alignItems:'center',gap:12}},
    h('span',{style:{color:T.accent,display:'flex',flexShrink:0}},Icons.download(22)),
    h('div',{style:{flex:1,minWidth:0}},
      h('div',{style:{fontSize:14,fontWeight:600}},never?'Back up your library':'Time to back up'),
      h('div',{style:{fontSize:12,color:T.meta,marginTop:1,lineHeight:1.4}},'Your reading lives only on this device. Save a backup file so you never lose it.')),
    h('button',{onClick:onExport,className:'act95',style:{flexShrink:0,padding:'9px 14px',borderRadius:9,background:T.fg,color:T.bg,fontSize:13,fontWeight:600}},'Export'),
    h('button',{onClick:onLater,'aria-label':'Remind me later',className:'act90',style:{flexShrink:0,padding:'8px',color:T.sub,display:'flex'}},Icons.x(16)));
}

/* ============================== article row ============================== */
function ArticleRow({a,T,scopeType,onOpen,onLongPress,onSwipeLeft,onSwipeRight,selecting,selected,onToggleSelect,snippet,disabledSelect}){
  const [dx,setDx]=useState(0);
  const drag=useRef({x:0,y:0,lock:null,moved:false});
  const lp=useRef(null);
  const clearLp=()=>{if(lp.current){clearTimeout(lp.current);lp.current=null}};
  const leftAction=scopeType==='archive'?{label:'Unarchive',bg:'#4a90d9'}:{label:'Archive',bg:'#3f9d63'};
  const fired=useRef(false);

  const start=e=>{
    const t=e.touches?e.touches[0]:e;
    drag.current={x:t.clientX,y:t.clientY,lock:null,moved:false};
    fired.current=false;
    if(!selecting){clearLp();lp.current=setTimeout(()=>{fired.current=true;vibrate(10);onLongPress()},480)}
  };
  const move=e=>{
    const t=e.touches?e.touches[0]:e;
    const ddx=t.clientX-drag.current.x,ddy=t.clientY-drag.current.y;
    if(Math.abs(ddx)>8||Math.abs(ddy)>8){drag.current.moved=true;clearLp()}
    if(!e.touches)return;
    if(!drag.current.lock){
      if(Math.abs(ddx)>14&&Math.abs(ddx)>Math.abs(ddy)*1.4)drag.current.lock='h';
      else if(Math.abs(ddy)>12)drag.current.lock='v';
    }
    if(drag.current.lock==='h'&&!selecting)setDx(clamp(ddx,-130,130));
  };
  const end=()=>{
    clearLp();
    if(drag.current.lock==='h'&&!selecting){
      if(dx<=-72)onSwipeLeft();
      else if(dx>=72)onSwipeRight();
    }
    setDx(0);drag.current.lock=null;
  };
  const click=()=>{
    if(fired.current||drag.current.moved)return;
    if(selecting){if(!disabledSelect)onToggleSelect()}
    else onOpen();
  };
  const prog=a.progress||0;
  const done=prog>=0.97;
  let footer;
  if(a.isVideo)footer=done?'Watched':'Video';
  else if(done)footer='Completed';
  else if(prog>0.01)footer=Math.round(prog*100)+'% · '+a.readMin+' min read';
  else footer=a.words?a.readMin+' min read':'Saved link';
  const metaLine=[a.source,a.author?('by '+a.author):''].filter(Boolean).join(' · ');

  return h('div',{style:{position:'relative',overflow:'hidden',background:T.bg}},
    dx!==0?h('div',{style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:dx<0?'flex-end':'flex-start',padding:'0 22px',background:dx<0?leftAction.bg:'#d4564a',color:'#fff',fontSize:14,fontWeight:600}},dx<0?leftAction.label:(a.liked?'Unlike':'Like')):null,
    h('div',{onTouchStart:start,onTouchMove:move,onTouchEnd:end,onMouseDown:start,onMouseMove:e=>{if(e.buttons)move(e)},onMouseUp:end,onMouseLeave:clearLp,onClick:click,onContextMenu:e=>{e.preventDefault();if(!selecting)onLongPress()},
      style:{display:'flex',gap:14,padding:'16px 16px 14px',borderBottom:'1px solid '+T.hair,transform:'translateX('+dx+'px)',transition:drag.current.lock==='h'?'none':'transform 220ms cubic-bezier(.2,.9,.2,1)',background:T.bg,touchAction:'pan-y',cursor:'pointer',opacity:selecting&&disabledSelect?0.35:1}},
      selecting?h('div',{style:{display:'flex',alignItems:'center',color:selected?T.accent:T.sub,flexShrink:0}},Icons.checkCircle(24,selected)):null,
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:17.5,fontWeight:600,lineHeight:1.3,color:T.fg,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title),
        metaLine?h('div',{style:{fontSize:12.5,color:T.sub,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},metaLine):null,
        snippet?h('div',{style:{fontSize:13.5,color:T.meta,lineHeight:1.45,marginTop:5}},snippet)
          :(a.excerpt?h('div',{style:{fontSize:13.5,color:T.meta,lineHeight:1.45,marginTop:5,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.excerpt):null),
        h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:7,fontSize:11.5,color:T.sub}},
          a.liked?h('span',{style:{color:'#d4564a',display:'flex'}},Icons.heart(12,true)):null,
          h('span',null,footer),
          a.highlights.length?h('span',{style:{display:'flex',alignItems:'center',gap:3}},Icons.highlight(12),String(a.highlights.length)):null,
          a.tags.slice(0,3).map(t=>h('span',{key:t,style:{color:T.accent}},'#'+t))
        ),
        !done&&prog>0.01?h('div',{style:{height:2.5,background:T.hair,borderRadius:2,marginTop:7,overflow:'hidden',maxWidth:120}},h('div',{style:{height:'100%',width:(prog*100)+'%',background:T.sub,borderRadius:2}})):null
      ),
      (a.image||a.isVideo)?h('div',{style:{width:64,height:64,borderRadius:5,background:T.thumbBg,flexShrink:0,position:'relative',overflow:'hidden'}},
        a.image?h('img',{src:a.image,alt:'',loading:'lazy',style:{width:'100%',height:'100%',objectFit:'cover',display:'block'},onError:e=>{e.target.style.display='none'}}):null,
        a.isVideo?h('div',{style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}},
          h('div',{style:{width:30,height:30,borderRadius:'50%',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',paddingLeft:2}},Icons.play(15,true))):null
      ):null
    ));
}

/* ============================== sidebar ============================== */
function SidebarItem({T,icon,label,active,onClick,lp}){
  return h('button',Object.assign({onClick,className:'act98 trc',style:{display:'flex',alignItems:'center',gap:18,width:'100%',padding:'16px 22px',textAlign:'left',color:T.fg,borderBottom:'1px solid '+T.hair}},lp||{}),
    h('span',{style:{color:T.fg,display:'flex'}},icon),
    h('span',{style:{fontSize:16.5,fontWeight:active?650:400}},label));
}
function FolderItem({T,folder,active,onClick,onLongPress}){
  const lp=useLongPress(onLongPress);
  return h('button',{onClick:()=>{if(!lp.firedRef.current.fired)onClick()},onTouchStart:lp.onTouchStart,onTouchMove:lp.onTouchMove,onTouchEnd:lp.onTouchEnd,onMouseDown:lp.onMouseDown,onMouseUp:lp.onMouseUp,onMouseLeave:lp.onMouseLeave,onContextMenu:e=>{e.preventDefault();onLongPress()},
    className:'act98 trc',style:{display:'flex',alignItems:'center',gap:18,width:'100%',padding:'16px 22px',textAlign:'left',color:T.fg,borderBottom:'1px solid '+T.hair}},
    h('span',{style:{display:'flex'}},Icons.folder(22)),
    h('span',{style:{fontSize:16.5,fontWeight:active?650:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},folder.name));
}

function Sidebar({T,scope,folders,onScope,onClose,onFolderLongPress,onBrowse}){
  const is=(t,id)=>scope.type===t&&(id===undefined||scope.id===id);
  const go=(t,id)=>{onScope({type:t,id});onClose()};
  return h('div',{style:{position:'fixed',inset:0,zIndex:60}},
    h('div',{onClick:onClose,className:'fdin',style:{position:'absolute',inset:0,background:T.overlay}}),
    h('div',{className:'slid',style:{position:'absolute',top:0,bottom:0,left:0,width:'min(82vw, 330px)',background:T.bg,color:T.fg,display:'flex',flexDirection:'column',boxShadow:'8px 0 40px rgba(0,0,0,.25)'}},
      h('div',{style:{paddingTop:'calc(8px + '+SAFE_T+')',flexShrink:0,display:'flex',alignItems:'center',padding:'calc(8px + '+SAFE_T+') 10px 6px'}},
        h('button',{onClick:onClose,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.menu(24))),
      h('div',{className:'sy',style:{flex:1,overflowY:'auto'}},
        h(SidebarItem,{T,icon:Icons.home(22),label:'Home',active:is('home'),onClick:()=>go('home')}),
        h(SidebarItem,{T,icon:Icons.heart(22),label:'Liked',active:is('liked'),onClick:()=>go('liked')}),
        h(SidebarItem,{T,icon:Icons.archive(22),label:'Archive',active:is('archive'),onClick:()=>go('archive')}),
        h(SidebarItem,{T,icon:Icons.video(22),label:'Videos',active:is('videos'),onClick:()=>go('videos')}),
        h(SidebarItem,{T,icon:Icons.notes(22),label:'Notes',active:is('notes'),onClick:()=>go('notes')}),
        h(SidebarItem,{T,icon:Icons.tag(22),label:'Tags',active:is('tags'),onClick:()=>go('tags')}),
        h(SidebarItem,{T,icon:Icons.news(22),label:'Daily Brief',active:is('brief'),onClick:()=>go('brief')}),
        h(SidebarItem,{T,icon:Icons.globe(22),label:'Browse',active:false,onClick:()=>{onClose();onBrowse()}}),
        folders.map(f=>h(FolderItem,{key:f.id,T,folder:f,active:is('folder',f.id),onClick:()=>go('folder',f.id),onLongPress:()=>onFolderLongPress(f)})),
        h('div',{style:{height:'calc(20px + '+SAFE_B+')'}})
      )
    ));
}

/* ============================== ooo menu ============================== */
const SORTS=[['newest','Newest first'],['oldest','Oldest first'],['longest','Longest'],['shortest','Shortest'],['popular','Most popular']];
const FILTERS=[['all','All'],['unread','Unread'],['liked','Liked'],['articles','Articles'],['videos','Videos'],['completed','Completed']];

function MenuPopover({T,settings,onPick,onSelectMode,onPlaylistMode,onSettings,showListOps,onClose}){
  const [open,setOpen]=useState(null);
  const row=(label,iconRight,onClick,opts)=>h('button',{onClick,className:'act98',style:{display:'flex',alignItems:'center',width:'100%',padding:'13px 16px',color:T.menuFg,textAlign:'left',borderBottom:'1px solid '+T.menuHair,gap:10}},
    opts&&opts.chev?h('span',{style:{display:'flex',transform:open===opts.chev?'rotate(90deg)':'none',transition:'transform 160ms',color:T.menuFg}},Icons.chevR(15)):null,
    h('span',{style:{flex:1,fontSize:16}},label),
    h('span',{style:{display:'flex',color:T.menuFg,opacity:.85}},iconRight||null));
  const sub=(items,key,active)=>open===key?h('div',{className:'fdin'},items.map(([v,l])=>h('button',{key:v,onClick:()=>onPick(key,v),className:'act98',style:{display:'flex',alignItems:'center',width:'100%',padding:'11px 16px 11px 42px',color:T.menuFg,textAlign:'left',gap:10,borderBottom:'1px solid '+T.menuHair,fontSize:15,opacity:v===active?1:.78,fontWeight:v===active?600:400}},
    h('span',{style:{flex:1}},l),v===active?h('span',{style:{display:'flex'}},Icons.check(16)):null))):null;
  return h('div',{style:{position:'fixed',inset:0,zIndex:55}},
    h('div',{onClick:onClose,style:{position:'absolute',inset:0}}),
    h('div',{className:'fdin',style:{position:'absolute',top:'calc(54px + '+SAFE_T+')',right:10,width:248,background:T.menuBg,borderRadius:13,overflow:'hidden',boxShadow:'0 10px 44px rgba(0,0,0,.4)',maxHeight:'70vh',overflowY:'auto'}},
      showListOps?h(Fragment,null,
        row('Sort',Icons.sort(19),()=>setOpen(open==='sort'?null:'sort'),{chev:'sort'}),
        sub(SORTS,'sort',settings.sort),
        row('Filter',Icons.filter(19),()=>setOpen(open==='filter'?null:'filter'),{chev:'filter'}),
        sub(FILTERS,'filter',settings.filter),
        row('Select',Icons.checkCircle(19),onSelectMode),
        row('Playlist',Icons.playlist(19),onPlaylistMode)):null,
      row('Settings',Icons.gear(19),onSettings)
    ));
}

/* ============================== add link sheet ============================== */
function AddSheet({T,folders,prefill,defaultFolder,onSave,onSaveStub,onClose}){
  const [url,setUrl]=useState(prefill||'');
  const [folderId,setFolderId]=useState(defaultFolder||null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const inputRef=useRef(null);
  useEffect(()=>{const t=setTimeout(()=>{if(inputRef.current&&!prefill)inputRef.current.focus()},250);return()=>clearTimeout(t)},[]);
  const doPaste=async()=>{try{const t=await navigator.clipboard.readText();const u=extractFirstUrl(t)||t.trim();if(u)setUrl(u)}catch(e){setErr('Clipboard unavailable — paste manually.')}};
  const doSave=async()=>{
    const u=normalizeUrl(url);
    if(!u){setErr('Please enter a valid link.');return}
    setErr('');setBusy(true);
    try{await onSave(u,folderId)}
    catch(e){setBusy(false);setErr('Could not download this page'+(e&&e.message?' ('+e.message+')':'')+'. You can still save the link and try again later.')}
  };
  const chip=(id,name)=>h('button',{key:id||'home',onClick:()=>setFolderId(id),className:'act95 trc',style:{padding:'8px 14px',borderRadius:18,fontSize:13.5,fontWeight:500,background:folderId===id?T.fg:T.card,color:folderId===id?T.bg:T.fg,flexShrink:0}},name);
  return h(Sheet,{T,onClose:busy?()=>{}:onClose,title:'Save a link'},
    h('div',{style:{padding:'4px 20px 0'}},
      h('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        h('input',{ref:inputRef,value:url,onChange:e=>{setUrl(e.target.value);setErr('')},placeholder:'https://…',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,disabled:busy,
          onKeyDown:e=>{if(e.key==='Enter')doSave()},
          style:{flex:1,padding:'13px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15.5,minWidth:0}}),
        h('button',{onClick:doPaste,disabled:busy,className:'act95',style:{padding:'12px 14px',borderRadius:11,background:T.card,color:T.fg,fontSize:14,fontWeight:600,flexShrink:0}},'Paste')),
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginTop:14,paddingBottom:2}},
        chip(null,'Home'),folders.map(f=>chip(f.id,f.name))),
      err?h('div',{style:{marginTop:12,fontSize:13.5,color:T.danger,lineHeight:1.45}},err):null,
      busy?h('div',{style:{display:'flex',alignItems:'center',gap:10,marginTop:16,color:T.meta,fontSize:14.5}},h(Spinner,{T}),'Downloading and cleaning up the article…'):null),
    h(PrimaryBtn,{T,label:busy?'Saving…':'Save',onClick:doSave,disabled:busy||!url.trim()}),
    err&&!busy?h('button',{onClick:()=>onSaveStub(normalizeUrl(url),folderId),className:'act98',style:{display:'block',width:'100%',padding:'14px',marginTop:4,color:T.accent,fontSize:15,fontWeight:500,textAlign:'center'}},'Save link without content'):null);
}

/* ============================== folder / move / tags / confirm sheets ============================== */
function FolderEditSheet({T,folder,onSave,onDelete,onClose}){
  const [name,setName]=useState(folder?folder.name:'');
  return h(Sheet,{T,onClose,title:folder?'Edit folder':'New folder'},
    h('div',{style:{padding:'4px 20px 0'}},
      h('input',{value:name,onChange:e=>setName(e.target.value),placeholder:'Folder name',autoFocus:!folder,
        onKeyDown:e=>{if(e.key==='Enter'&&name.trim())onSave(name.trim())},
        style:{width:'100%',padding:'13px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16}})),
    h(PrimaryBtn,{T,label:folder?'Save':'Create folder',onClick:()=>onSave(name.trim()),disabled:!name.trim()}),
    folder?h('button',{onClick:onDelete,className:'act98',style:{display:'block',width:'100%',padding:'14px',marginTop:4,color:T.danger,fontSize:15,fontWeight:500,textAlign:'center'}},'Delete folder'):null);
}

function MoveSheet({T,folders,onMove,onNewFolder,onClose,count}){
  return h(Sheet,{T,onClose,title:'Move '+(count>1?count+' articles':'to folder')},
    h(ARow,{T,icon:Icons.home(21),label:'Home',onClick:()=>onMove(null)}),
    folders.map(f=>h(ARow,{key:f.id,T,icon:Icons.folder(21),label:f.name,onClick:()=>onMove(f.id)})),
    h(ARow,{T,icon:Icons.plus(21),label:'New folder…',onClick:onNewFolder}));
}

function TagsSheet({T,article,allTags,onSave,onClose}){
  const [tags,setTags]=useState(article.tags.slice());
  const [input,setInput]=useState('');
  const add=t=>{t=t.trim().replace(/^#/,'').toLowerCase().replace(/\s+/g,'-');if(t&&!tags.includes(t))setTags([...tags,t]);setInput('')};
  const sugg=allTags.filter(t=>!tags.includes(t)&&(!input||t.startsWith(input.toLowerCase()))).slice(0,12);
  return h(Sheet,{T,onClose,title:'Tags'},
    h('div',{style:{padding:'4px 20px 0'}},
      tags.length?h('div',{style:{display:'flex',flexWrap:'wrap',gap:8,marginBottom:14}},
        tags.map(t=>h('button',{key:t,onClick:()=>setTags(tags.filter(x=>x!==t)),className:'act95',style:{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:16,background:T.fg,color:T.bg,fontSize:13.5,fontWeight:500}},'#'+t,Icons.x(13)))):h('div',{style:{fontSize:13.5,color:T.sub,marginBottom:14}},'No tags yet — add one below.'),
      h('div',{style:{display:'flex',gap:8}},
        h('input',{value:input,onChange:e=>setInput(e.target.value),placeholder:'Add a tag…',autoCapitalize:'none',
          onKeyDown:e=>{if(e.key==='Enter')add(input)},
          style:{flex:1,padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15}}),
        h('button',{onClick:()=>add(input),disabled:!input.trim(),className:'act95',style:{padding:'12px 16px',borderRadius:11,background:T.card,color:T.fg,fontSize:14,fontWeight:600,opacity:input.trim()?1:.4}},'Add')),
      sugg.length?h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginTop:12}},
        sugg.map(t=>h('button',{key:t,onClick:()=>add(t),className:'act95',style:{padding:'7px 12px',borderRadius:16,background:T.card,color:T.meta,fontSize:13,flexShrink:0}},'#'+t))):null),
    h(PrimaryBtn,{T,label:'Save',onClick:()=>onSave(tags)}));
}

function ConfirmSheet({T,title,message,confirmLabel,onConfirm,onClose}){
  return h(Sheet,{T,onClose,title},
    message?h('div',{style:{padding:'2px 20px 4px',fontSize:14.5,color:T.meta,lineHeight:1.5}},message):null,
    h(PrimaryBtn,{T,label:confirmLabel,danger:true,onClick:onConfirm}),
    h('button',{onClick:onClose,className:'act98',style:{display:'block',width:'100%',padding:'14px',marginTop:4,color:T.meta,fontSize:15.5,fontWeight:500,textAlign:'center'}},'Cancel'));
}

/* ============================== article action sheet ============================== */
function ArticleSheet({T,a,onAction,onClose}){
  const act=k=>()=>onAction(k);
  return h(Sheet,{T,onClose},
    h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair}},
      h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:17,fontWeight:600,lineHeight:1.3}},a.title),
      h('div',{style:{fontSize:12.5,color:T.sub,marginTop:3}},a.source||'')),
    h(ARow,{T,icon:Icons.heart(21,a.liked),label:a.liked?'Unlike':'Like',onClick:act('like')}),
    h(ARow,{T,icon:Icons.archive(21),label:a.archived?'Move to Home':'Archive',onClick:act('archive')}),
    h(ARow,{T,icon:Icons.folder(21),label:'Move to folder…',onClick:act('move')}),
    h(ARow,{T,icon:Icons.tag(21),label:'Edit tags…',onClick:act('tags')}),
    !a.isVideo&&a.text?h(ARow,{T,icon:Icons.headphones(21),label:'Listen',sub:'Text-to-speech',onClick:act('listen')}):null,
    !a.isVideo&&a.text?h(ARow,{T,icon:Icons.bolt(21),label:'Speed read',sub:'Up to 3× faster',onClick:act('speed')}):null,
    !a.isVideo&&a.html?h(ARow,{T,icon:Icons.pencil(21),label:'Edit content',sub:'Remove unwanted parts or edit the text',onClick:act('edit')}):null,
    !a.isVideo&&a.text?h(ARow,{T,icon:Icons.ai(21),label:'AI assist',sub:'Summarize · Translate · Rewrite · Ask',onClick:act('ai')}):null,
    h(ARow,{T,icon:Icons.share(21),label:'Share…',onClick:act('share')}),
    a.url?h(ARow,{T,icon:Icons.copy(21),label:'Copy link',onClick:act('copy')}):null,
    a.url?h(ARow,{T,icon:Icons.globe(21),label:'Open original',onClick:act('open')}):null,
    h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:act('delete')}));
}

/* ============================== highlight sheet ============================== */
function HighlightSheet({T,article,hl,onSaveNote,onDelete,onClose}){
  const [note,setNote]=useState(hl.note||'');
  return h(Sheet,{T,onClose,title:'Highlight'},
    h('div',{style:{padding:'2px 20px 0'}},
      h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:15.5,lineHeight:1.55,padding:'12px 14px',borderLeft:'3px solid #e8c547',background:T.card,borderRadius:'0 10px 10px 0',maxHeight:150,overflowY:'auto'}},hl.text),
      h('div',{style:{fontSize:12,color:T.sub,marginTop:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},article.title),
      h('textarea',{value:note,onChange:e=>setNote(e.target.value),placeholder:'Add a note…',rows:3,
        style:{width:'100%',marginTop:14,padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15,lineHeight:1.5,resize:'none',fontFamily:UIF}})),
    h(PrimaryBtn,{T,label:'Save note',onClick:()=>onSaveNote(note.trim())}),
    h('div',{style:{display:'flex',justifyContent:'center',gap:26,marginTop:10}},
      h('button',{onClick:()=>{shareText('',('“'+hl.text+'”')+(note?'\n\n'+note:''),article.url)},className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.share(20),'Share'),
      h('button',{onClick:()=>{copyText('“'+hl.text+'”'+(article.url?' — '+article.url:''))},className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.copy(20),'Copy'),
      h('button',{onClick:onDelete,className:'act95',style:{color:T.danger,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.trash(20),'Delete')));
}
/* ============================== highlight engine ============================== */
function unwrapMarks(root){
  root.querySelectorAll('mark.hl').forEach(m=>{
    const p=m.parentNode;if(!p)return;
    while(m.firstChild)p.insertBefore(m.firstChild,m);
    p.removeChild(m);
  });
  root.normalize();
}
function buildTextIndex(root){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
  const entries=[];let norm='',last=' ',node;
  while((node=walker.nextNode())){
    const raw=node.nodeValue;
    for(let i=0;i<raw.length;i++){
      const ch=raw[i];
      if(/\s/.test(ch)){if(last!==' '){norm+=' ';entries.push({node,off:i});last=' '}}
      else{norm+=ch;entries.push({node,off:i});last=ch}
    }
  }
  return{norm,entries};
}
function applyHighlights(root,highlights){
  unwrapMarks(root);
  for(const hl of highlights){
    const t=String(hl.text||'').replace(/\s+/g,' ').trim();
    if(!t)continue;
    try{
      const{norm,entries}=buildTextIndex(root);
      const i=norm.indexOf(t);
      if(i<0)continue;
      const s=entries[i],e=entries[i+t.length-1];
      const nodes=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
      let n,started=false;
      while((n=walker.nextNode())){
        if(n===s.node)started=true;
        if(started)nodes.push(n);
        if(n===e.node)break;
      }
      for(const nd of nodes){
        let target=nd,st=(nd===s.node?s.off:0),en=(nd===e.node?e.off+1:nd.nodeValue.length);
        if(en<=st)continue;
        if(st>0){target=target.splitText(st);en-=st}
        if(en<target.nodeValue.length)target.splitText(en);
        if(!target.nodeValue.trim())continue;
        const mark=document.createElement('mark');
        mark.className='hl'+(hl.note?' hln':'');
        mark.setAttribute('data-hid',hl.id);
        target.parentNode.insertBefore(mark,target);
        mark.appendChild(target);
      }
    }catch(err){/* a highlight that cannot be re-anchored stays available in Notes */}
  }
}

/* ============================== Aa appearance popover ============================== */
function AaPopover({T,S,update,onClose}){
  const set=p=>update(d=>({...d,settings:{...d.settings,...p}}));
  const spacingBtn=(lh,label)=>h('button',{key:label,onClick:()=>set({lineHeight:lh}),className:'act95 trc',style:{flex:1,padding:'10px 0',borderRadius:10,background:Math.abs(S.lineHeight-lh)<0.01?T.card:'transparent',color:T.menuFg,display:'flex',flexDirection:'column',alignItems:'center',gap:3}},
    h('span',{style:{display:'flex',flexDirection:'column',gap:label==='tight'?2:label==='normal'?3.5:5}},[0,1,2].map(i=>h('span',{key:i,style:{width:22,height:1.6,background:'currentColor',display:'block'}}))));
  return h('div',{style:{position:'fixed',inset:0,zIndex:65}},
    h('div',{onClick:onClose,style:{position:'absolute',inset:0}}),
    h('div',{className:'shn',style:{position:'absolute',left:10,right:10,bottom:'calc(64px + '+SAFE_B+')',background:T.menuBg,color:T.menuFg,borderRadius:16,boxShadow:'0 12px 48px rgba(0,0,0,.4)',padding:'16px 16px 14px',maxWidth:430,margin:'0 auto'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:14}},
        h('button',{onClick:()=>set({fontSize:clamp(S.fontSize-1,15,26)}),className:'act95',style:{flex:1,padding:'11px 0',borderRadius:10,background:T.card,color:T.menuFg,fontSize:14,fontFamily:'Georgia,serif'}},'A'),
        h('div',{style:{fontSize:13,color:T.sub,minWidth:42,textAlign:'center'}},S.fontSize+'px'),
        h('button',{onClick:()=>set({fontSize:clamp(S.fontSize+1,15,26)}),className:'act95',style:{flex:1,padding:'8px 0',borderRadius:10,background:T.card,color:T.menuFg,fontSize:21,fontFamily:'Georgia,serif'}},'A')),
      h('div',{style:{display:'flex',gap:8,marginBottom:14}},spacingBtn(1.45,'tight'),spacingBtn(1.62,'normal'),spacingBtn(1.85,'loose')),
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginBottom:16,paddingBottom:2}},
        FONTS.map(f=>h('button',{key:f.id,onClick:()=>set({font:f.id}),className:'act95 trc',style:{padding:'9px 15px',borderRadius:10,background:S.font===f.id?T.card:'transparent',border:'1px solid '+(S.font===f.id?T.sub:T.menuHair),color:T.menuFg,fontSize:14.5,fontFamily:f.css,flexShrink:0,whiteSpace:'nowrap'}},f.label))),
      h('div',{style:{display:'flex',justifyContent:'space-around'}},
        Object.values(THEMES).map(t=>h('button',{key:t.id,onClick:()=>set({theme:t.id}),className:'act90 trt',style:{width:40,height:40,borderRadius:'50%',background:t.swatch,border:S.theme===t.id?('2.5px solid '+T.accent):('1.5px solid '+(t.id==='light'?'#d5d5d8':T.menuHair)),display:'flex',alignItems:'center',justifyContent:'center',color:t.fg,fontFamily:'Georgia,serif',fontSize:15}},'A')))
    ));
}

/* ============================== reader ============================== */
function Reader({a,T,S,patch,onAction,toastFn,addHighlight,onHighlightTap,onRetry}){
  const scrollRef=useRef(null),contentRef=useRef(null);
  const [aaOpen,setAaOpen]=useState(false);
  const [selbar,setSelbar]=useState(null);
  const [retrying,setRetrying]=useState(false);
  const restored=useRef(null),lastSaved=useRef(a.progress||0);

  useEffect(()=>{ // restore reading position once per article
    if(restored.current===a.id)return;
    restored.current=a.id;
    lastSaved.current=a.progress||0;
    requestAnimationFrame(()=>{
      const el=scrollRef.current;if(!el)return;
      const max=el.scrollHeight-el.clientHeight;
      if(max>0&&a.progress>0.01&&a.progress<0.97)el.scrollTop=a.progress*max;
    });
  },[a.id]);

  useEffect(()=>{ // re-anchor highlights whenever they change
    const el=contentRef.current;
    if(el&&a.html)applyHighlights(el,a.highlights);
  },[a.id,a.html,a.highlights]);

  useEffect(()=>{ // selection toolbar
    let t=null;
    const onSel=()=>{clearTimeout(t);t=setTimeout(()=>{
      const sel=window.getSelection();
      if(sel&&!sel.isCollapsed&&sel.rangeCount&&contentRef.current&&contentRef.current.contains(sel.anchorNode)){
        const text=sel.toString().replace(/\s+/g,' ').trim();
        if(text.length>1){
          const r=sel.getRangeAt(0).getBoundingClientRect();
          setSelbar({top:Math.max(r.top-56,56),left:clamp(r.left+r.width/2,110,window.innerWidth-110),text});
          return;
        }
      }
      setSelbar(null);
    },220)};
    document.addEventListener('selectionchange',onSel);
    return()=>{document.removeEventListener('selectionchange',onSel);clearTimeout(t)};
  },[a.id]);

  const onScroll=()=>{
    const el=scrollRef.current;if(!el)return;
    if(selbar)setSelbar(null);
    const max=el.scrollHeight-el.clientHeight;
    const p=max>0?clamp(el.scrollTop/max,0,1):1;
    if(Math.abs(p-lastSaved.current)>0.02||(p>=0.97&&lastSaved.current<0.97)){
      lastSaved.current=p;
      patch({progress:p});
    }
  };

  const clearSel=()=>{try{window.getSelection().removeAllRanges()}catch(e){}setSelbar(null)};
  const selAct=kind=>{
    const text=selbar.text;
    if(kind==='hl')addHighlight(text,false);
    else if(kind==='note')addHighlight(text,true);
    else if(kind==='copy'){copyText(text);toastFn('Copied')}
    else if(kind==='share')shareText(a.title,'“'+text+'”',a.url);
    clearSel();
  };

  const doRetry=async()=>{setRetrying(true);try{await onRetry()}catch(e){toastFn('Still couldn’t download this page')}setRetrying(false)};

  const tb=(icon,onClick,opts)=>h('button',{onClick,className:'act90 trt',style:Object.assign({},iconBtnS,{color:(opts&&opts.color)||T.fg})},icon);
  const heroDupe=a.image&&a.html&&a.html.indexOf(escapeHtml(a.image))>-1;
  const metaBits=[a.source,a.author?'by '+a.author:'',a.publishedAt?'on '+fmtDate(a.publishedAt):''].filter(Boolean).join(' · ');

  return h('div',{style:{position:'fixed',inset:0,zIndex:40,background:T.bg,color:T.fg,display:'flex',flexDirection:'column'},className:'fdin'},
    h('div',{style:{position:'absolute',top:0,left:0,right:0,height:'calc(2px + '+SAFE_T+')',zIndex:5,background:T.bg}},
      h('div',{style:{position:'absolute',bottom:0,left:0,height:2,width:((a.progress||0)*100)+'%',background:T.sub,transition:'width 300ms'}})),
    h('div',{ref:scrollRef,onScroll,className:'sy',
      onClick:e=>{const m=e.target.closest?e.target.closest('mark.hl'):null;if(m){e.preventDefault();onHighlightTap(m.getAttribute('data-hid'))}},
      style:{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',paddingTop:'calc(26px + '+SAFE_T+')',paddingBottom:'calc(76px + '+SAFE_B+')'}},
      h('div',{style:{maxWidth:660,margin:'0 auto',padding:'0 22px'}},
        h('h1',{style:{fontFamily:fontCss(S.font),fontSize:Math.min(S.fontSize+8,30),fontWeight:700,lineHeight:1.25,margin:'0 0 10px',color:T.fg,userSelect:'text',WebkitUserSelect:'text'}},a.title),
        metaBits?h('div',{style:{fontSize:13,color:T.meta,marginBottom:22,lineHeight:1.5}},metaBits):h('div',{style:{height:10}}),
        a.isVideo?h('div',null,
          h('div',{style:{position:'relative',paddingTop:'56.25%',borderRadius:10,overflow:'hidden',background:'#000',marginBottom:18}},
            h('iframe',{src:'https://www.youtube-nocookie.com/embed/'+a.videoId+'?playsinline=1',allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',allowFullScreen:true,style:{position:'absolute',inset:0,width:'100%',height:'100%',border:0}})),
          a.author?h('div',{style:{fontSize:14.5,color:T.meta,marginBottom:14}},a.author):null,
          a.url?h('a',{href:a.url,target:'_blank',rel:'noopener',style:{color:T.accent,fontSize:14}},'Watch on YouTube'):null
        ):null,
        !a.isVideo&&!heroDupe&&a.image?h('img',{src:a.image,alt:'',style:{width:'100%',borderRadius:8,marginBottom:22,display:'block'},onError:e=>{e.target.style.display='none'}}):null,
        !a.isVideo&&a.html?h('div',{ref:contentRef,className:'rc',
          style:{fontFamily:fontCss(S.font),fontSize:S.fontSize,lineHeight:S.lineHeight,color:T.fg,
            '--accent':T.accent,'--hl':T.hl,'--hair':T.hair,'--card':T.card,'--meta':T.meta},
          dangerouslySetInnerHTML:{__html:a.html}}):null,
        !a.isVideo&&!a.html?h('div',{style:{padding:'34px 0',textAlign:'center'}},
          h('div',{style:{color:T.sub,marginBottom:6,display:'flex',justifyContent:'center'}},Icons.download(34)),
          h('div',{style:{fontSize:15.5,fontWeight:600,marginBottom:6}},'No offline copy yet'),
          h('div',{style:{fontSize:13.5,color:T.meta,lineHeight:1.5,marginBottom:18}},'This link was saved without its content. Download it now to read offline.'),
          h('button',{onClick:doRetry,disabled:retrying,className:'act95',style:{padding:'12px 26px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600,display:'inline-flex',alignItems:'center',gap:8}},retrying?h(Spinner,{T,size:15}):null,retrying?'Downloading…':'Download article'),
          a.url?h('div',{style:{marginTop:14}},h('a',{href:a.url,target:'_blank',rel:'noopener',style:{color:T.accent,fontSize:14}},'Open original page')):null
        ):null,
        a.url&&a.html&&!a.isVideo?h('div',{style:{margin:'34px 0 0',paddingTop:18,borderTop:'1px solid '+T.hair}},
          h('a',{href:a.url,target:'_blank',rel:'noopener',style:{color:T.accent,fontSize:14}},'View original · '+(a.source||a.url))):null
      )),
    selbar?h('div',{className:'fdin',style:{position:'fixed',top:selbar.top,left:selbar.left,transform:'translateX(-50%)',zIndex:66,display:'flex',background:'#26262a',borderRadius:11,overflow:'hidden',boxShadow:'0 6px 24px rgba(0,0,0,.35)'}},
      [['Highlight','hl'],['Note','note'],['Copy','copy'],['Share','share']].map(([l,k],i)=>h('button',{key:k,onClick:()=>selAct(k),style:{padding:'11px 14px',color:'#f2f2f3',fontSize:13.5,fontWeight:500,borderLeft:i?'1px solid #3a3a3f':'none'}},l))):null,
    h('div',{style:{position:'absolute',bottom:0,left:0,right:0,display:'flex',alignItems:'center',justifyContent:'space-around',background:T.bg,borderTop:'1px solid '+T.hair,padding:'5px 6px calc(5px + '+SAFE_B+')'}},
      tb(Icons.back(23),()=>onAction('close')),
      tb(Icons.heart(23,a.liked),()=>onAction('like'),{color:a.liked?'#d4564a':T.fg}),
      tb(Icons.archive(23),()=>onAction('archive')),
      h('button',{onClick:()=>setAaOpen(!aaOpen),className:'act90 trt',style:Object.assign({},iconBtnS,{color:T.fg,fontFamily:'Georgia,serif',fontSize:19,fontWeight:500})},'Aa'),
      a.text&&!a.isVideo?tb(Icons.ai(23),()=>onAction('ai')):null,
      tb(Icons.dots(23),()=>onAction('sheet'))),
    aaOpen?h(AaPopover,{T,S,update:onAction.update,onClose:()=>setAaOpen(false)}):null
  );
}

/* ============================== TTS player ============================== */
const RATES=[0.8,0.9,1,1.1,1.25,1.5,1.75,2];

function MiniPlayer({T,ui,title,onToggle,onNextArticle,onStop,onOpen}){
  return h('div',{className:'shn',style:{position:'fixed',left:10,right:10,bottom:'calc(12px + '+SAFE_B+')',zIndex:50,background:'#26262a',color:'#f2f2f3',borderRadius:14,display:'flex',alignItems:'center',padding:'8px 8px',boxShadow:'0 8px 30px rgba(0,0,0,.4)',gap:4}},
    h('button',{onClick:onToggle,className:'act90',style:Object.assign({},iconBtnS,{color:'#fff'})},ui.playing?Icons.pause(22):Icons.play(22,true)),
    h('div',{onClick:onOpen,style:{flex:1,minWidth:0,cursor:'pointer'}},
      h('div',{style:{fontSize:13.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},title),
      h('div',{style:{fontSize:11,color:'#9a9aa0',marginTop:1}},(ui.queue.length>1?('Article '+(ui.qi+1)+' of '+ui.queue.length+' · '):'')+(ui.total?Math.round((ui.si/Math.max(1,ui.total))*100)+'%':''))),
    ui.queue.length>1?h('button',{onClick:onNextArticle,className:'act90',style:Object.assign({},iconBtnS,{color:'#fff'})},Icons.skipF(20)):null,
    h('button',{onClick:onStop,className:'act90',style:Object.assign({},iconBtnS,{color:'#9a9aa0'})},Icons.x(19)));
}

function TTSPlayerSheet({T,ui,articles,settings,onToggle,onSkipSent,onJumpArticle,onJumpTo,onRate,onVoice,voices,onClose}){
  const cur=articles.find(x=>x.id===ui.queue[ui.qi]);
  if(!cur)return null;
  const pct=ui.total?Math.round((ui.si/ui.total)*100):0;
  return h(Sheet,{T,onClose,title:'Listening'},
    h('div',{style:{padding:'0 22px'}},
      h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:19,fontWeight:600,lineHeight:1.3}},cur.title),
      h('div',{style:{fontSize:13,color:T.sub,marginTop:4}},[cur.source,cur.readMin?cur.readMin+' min':''].filter(Boolean).join(' · ')),
      h('div',{style:{height:4,background:T.hair,borderRadius:3,marginTop:18,overflow:'hidden'}},
        h('div',{style:{height:'100%',width:pct+'%',background:T.accent,borderRadius:3,transition:'width 300ms'}})),
      h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:11.5,color:T.sub,marginTop:6}},
        h('span',null,'Sentence '+Math.min(ui.si+1,ui.total)+' of '+ui.total),
        h('span',null,pct+'%')),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'center',gap:18,marginTop:22}},
        h('button',{onClick:()=>onJumpArticle(-1),disabled:ui.qi===0,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,opacity:ui.qi===0?.3:1})},Icons.skipB(24)),
        h('button',{onClick:()=>onSkipSent(-1),className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.back(22)),
        h('button',{onClick:onToggle,className:'act95',style:{width:66,height:66,borderRadius:'50%',background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:ui.playing?0:4}},ui.playing?Icons.pause(28):Icons.play(28,true)),
        h('button',{onClick:()=>onSkipSent(1),className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.chevR(22)),
        h('button',{onClick:()=>onJumpArticle(1),disabled:ui.qi>=ui.queue.length-1,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,opacity:ui.qi>=ui.queue.length-1?.3:1})},Icons.skipF(24))),
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginTop:24,justifyContent:'safe center'}},
        RATES.map(r=>h('button',{key:r,onClick:()=>onRate(r),className:'act95 trc',style:{padding:'7px 13px',borderRadius:16,fontSize:13,fontWeight:600,background:settings.ttsRate===r?T.fg:T.card,color:settings.ttsRate===r?T.bg:T.meta,flexShrink:0}},r+'×'))),
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginTop:14,justifyContent:'safe center'}},
        [['','Default'],...INDIC_TTS_LANGS.map(([code,label])=>['lang:'+code,label])].map(([val,label])=>
          h('button',{key:val,onClick:()=>onVoice(val),className:'act95 trc',
            style:{padding:'6px 12px',borderRadius:16,fontSize:12.5,fontWeight:600,flexShrink:0,
              background:(settings.ttsVoice||'')===(val)?T.fg:T.card,
              color:(settings.ttsVoice||'')===(val)?T.bg:T.meta}},label))),
      ui.queue.length>1?h('div',{style:{marginTop:20}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:6}},'Playlist'),
        ui.queue.map((id,i)=>{
          const qa=articles.find(x=>x.id===id);if(!qa)return null;
          return h('button',{key:id,onClick:()=>onJumpTo(i),className:'act98',style:{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'11px 2px',textAlign:'left',borderBottom:'1px solid '+T.hair,color:i===ui.qi?T.accent:T.fg}},
            h('span',{style:{fontSize:12,color:T.sub,width:18,flexShrink:0}},String(i+1)),
            h('span',{style:{flex:1,fontSize:14.5,fontWeight:i===ui.qi?600:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},qa.title),
            i===ui.qi&&ui.playing?h('span',{style:{display:'flex',color:T.accent}},Icons.headphones(16)):null);
        })):null
    ));
}

/* ============================== speed reader ============================== */
function speedDelay(word,wpm){
  let m=1;
  if(word.length>9)m*=1.35;
  if(/[,;:—–]$/.test(word))m*=1.7;
  else if(/[.!?…]["”')\]]*$/.test(word))m*=2.3;
  return(60000/wpm)*m;
}
function SpeedReader({a,T,S,onClose,onFinish,saveWpm}){
  const words=useMemo(()=>a.text.split(/\s+/).filter(Boolean),[a.id]);
  const [idx,setIdx]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [wpm,setWpm]=useState(S.wpm||380);
  const idxRef=useRef(0),playRef=useRef(false),tRef=useRef(null),wpmRef=useRef(wpm);
  wpmRef.current=wpm;
  const stop=()=>{playRef.current=false;setPlaying(false);if(tRef.current)clearTimeout(tRef.current)};
  const step=()=>{
    if(!playRef.current)return;
    const i=idxRef.current;
    if(i>=words.length-1){stop();onFinish();return}
    idxRef.current=i+1;setIdx(i+1);
    tRef.current=setTimeout(step,speedDelay(words[i+1],wpmRef.current));
  };
  const play=()=>{
    if(idxRef.current>=words.length-1){idxRef.current=0;setIdx(0)}
    playRef.current=true;setPlaying(true);
    tRef.current=setTimeout(step,speedDelay(words[idxRef.current],wpmRef.current));
  };
  const toggle=()=>{playing?stop():play()};
  const skip=d=>{const wasPlaying=playRef.current;stop();const n=clamp(idxRef.current+d,0,words.length-1);idxRef.current=n;setIdx(n);if(wasPlaying)play()};
  useEffect(()=>()=>{if(tRef.current)clearTimeout(tRef.current)},[]);
  const word=words[idx]||'';
  const o=orpIndex(word);
  const minLeft=Math.max(0,Math.round((words.length-idx)/wpm));
  const fsz=word.length>16?26:34;
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:85,background:T.bg,color:T.fg,display:'flex',flexDirection:'column'}},
    h('div',{style:{display:'flex',alignItems:'center',padding:'calc(8px + '+SAFE_T+') 8px 0'}},
      h('button',{onClick:()=>{stop();onClose()},className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.x(22)),
      h('div',{style:{flex:1,textAlign:'center',fontSize:13.5,color:T.meta,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',padding:'0 6px'}},a.title),
      h('div',{style:{width:42,textAlign:'center',fontSize:12.5,color:T.sub,flexShrink:0}},Math.round((idx/Math.max(1,words.length-1))*100)+'%')),
    h('div',{onClick:toggle,style:{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',cursor:'pointer',padding:'0 14px'}},
      h('div',{style:{borderTop:'1px solid '+T.hair,position:'relative',height:0,marginBottom:28}},
        h('div',{style:{position:'absolute',left:'50%',top:-1,width:2,height:10,background:'#d0342c',transform:'translateX(-50%)'}})),
      h('div',{style:{display:'flex',alignItems:'baseline',fontFamily:fontCss(S.font),fontSize:fsz,fontWeight:500,minHeight:48}},
        h('span',{style:{flex:1,textAlign:'right',whiteSpace:'pre'}},word.slice(0,o)),
        h('span',{style:{color:'#d0342c',whiteSpace:'pre'}},word[o]||''),
        h('span',{style:{flex:1,textAlign:'left',whiteSpace:'pre'}},word.slice(o+1))),
      h('div',{style:{borderTop:'1px solid '+T.hair,position:'relative',height:0,marginTop:28}},
        h('div',{style:{position:'absolute',left:'50%',top:-9,width:2,height:10,background:'#d0342c',transform:'translateX(-50%)'}})),
      !playing?h('div',{style:{textAlign:'center',fontSize:12.5,color:T.sub,marginTop:30}},idx>=words.length-1&&idx>0?'Finished — tap to restart':'Tap to '+(idx>0?'resume':'start')):null),
    h('div',{style:{padding:'0 22px calc(20px + '+SAFE_B+')'}},
      h('div',{style:{height:3,background:T.hair,borderRadius:2,overflow:'hidden',marginBottom:18}},
        h('div',{style:{height:'100%',width:((idx/Math.max(1,words.length-1))*100)+'%',background:T.accent}})),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'center',gap:26,marginBottom:18}},
        h('button',{onClick:()=>skip(-10),className:'act90',style:{color:T.meta,fontSize:13,fontWeight:600,padding:10}},'−10'),
        h('button',{onClick:toggle,className:'act95',style:{width:62,height:62,borderRadius:'50%',background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:playing?0:4}},playing?Icons.pause(26):Icons.play(26,true)),
        h('button',{onClick:()=>skip(10),className:'act90',style:{color:T.meta,fontSize:13,fontWeight:600,padding:10}},'+10')),
      h('div',{style:{display:'flex',alignItems:'center',gap:14}},
        h('input',{type:'range',min:150,max:700,step:10,value:wpm,onChange:e=>{const v=+e.target.value;setWpm(v);saveWpm(v)},style:{flex:1,accentColor:T.accent}}),
        h('div',{style:{fontSize:12.5,color:T.meta,width:104,textAlign:'right',flexShrink:0}},wpm+' wpm · ~'+minLeft+' min')))
  );
}

/* ============================== daily brief view ============================== */
function BriefChips({T,options,selected,onSelect}){
  return h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',padding:'2px 16px 10px',flexShrink:0}},
    options.map(o=>{
      const active=o.id===selected;
      return h('button',{key:o.id||'_top',onClick:()=>onSelect(o.id),className:'act95 trc',
        style:{flexShrink:0,padding:'7px 14px',borderRadius:18,fontSize:13.5,fontWeight:active?600:500,whiteSpace:'nowrap',
          background:active?T.fg:T.card,color:active?T.bg:T.fg,border:'1px solid '+(active?T.fg:T.hair)}},
        (o.flag?o.flag+' ':'')+o.label);
    }));
}
function DailyBrief({T,regionId,category,onConfig,onOpenItem}){
  const [items,setItems]=useState(null); // null = loading
  const [err,setErr]=useState('');
  const [busyUrl,setBusyUrl]=useState('');
  const reqRef=useRef(0);
  const load=useCallback(()=>{
    const id=++reqRef.current;
    setItems(null);setErr('');
    fetchBrief(regionId,category)
      .then(r=>{if(id===reqRef.current)setItems(r)})
      .catch(e=>{if(id===reqRef.current){setErr((e&&e.message)||'Could not load the brief');setItems([])}});
  },[regionId,category]);
  useEffect(load,[load]);
  const region=briefRegion(regionId);
  const open=async it=>{
    if(busyUrl)return;
    setBusyUrl(it.url);
    try{await onOpenItem(it)}finally{setBusyUrl('')}
  };
  let body;
  if(items===null){
    body=h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:'70px 40px',color:T.meta}},
      h(Spinner,{T,size:24}),
      h('div',{style:{fontSize:14}},'Gathering today’s '+region.label+' headlines…'));
  }else if(err){
    body=h('div',{style:{padding:'60px 40px',textAlign:'center',color:T.sub}},
      h('div',{style:{display:'flex',justifyContent:'center',marginBottom:14,opacity:.5}},Icons.news(40)),
      h('div',{style:{fontSize:16.5,fontWeight:600,color:T.meta,marginBottom:6}},'Couldn’t load the brief'),
      h('div',{style:{fontSize:13.5,lineHeight:1.5,marginBottom:18}},err+'. Check your connection and try again.'),
      h('button',{onClick:load,className:'act95',style:{display:'inline-flex',alignItems:'center',gap:8,padding:'11px 22px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:600}},Icons.refresh(17),'Try again'));
  }else{
    body=h('div',null,
      items.map((it,i)=>{
        const busy=busyUrl===it.url;
        return h('button',{key:it.url+i,onClick:()=>open(it),className:'act98',
          style:{display:'flex',gap:12,width:'100%',textAlign:'left',padding:'15px 16px 14px',borderBottom:'1px solid '+T.hair,color:T.fg,alignItems:'flex-start',opacity:busyUrl&&!busy?0.5:1}},
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:17,fontWeight:600,lineHeight:1.32,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},it.title),
            h('div',{style:{display:'flex',alignItems:'center',gap:7,marginTop:6,fontSize:11.5,color:T.sub,overflow:'hidden'}},
              it.source?h('span',{style:{fontWeight:600,color:T.meta,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'62%'}},it.source):null,
              it.source&&it.publishedAt?h('span',null,'·'):null,
              it.publishedAt?h('span',{style:{flexShrink:0}},timeAgo(it.publishedAt)):null)),
          h('div',{style:{flexShrink:0,width:24,display:'flex',justifyContent:'center',paddingTop:2,color:T.sub}},
            busy?h(Spinner,{T,size:17}):Icons.download(18)));
      }),
      h('div',{style:{padding:'16px 24px 8px',textAlign:'center',fontSize:11.5,color:T.sub,lineHeight:1.5}},
        'Tap a story to save it for offline reading. Headlines via Google News.'));
  }
  return h('div',null,
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'2px 16px 8px',flexShrink:0}},
      h('div',{style:{flex:1,fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},'Region'),
      h('button',{onClick:load,disabled:items===null,className:'act90 trt',style:Object.assign({},iconBtnS,{width:34,height:34,color:T.fg,opacity:items===null?0.4:1}),title:'Refresh'},Icons.refresh(18))),
    h(BriefChips,{T,options:BRIEF_REGIONS,selected:regionId,onSelect:id=>onConfig({briefRegion:id})}),
    h('div',{style:{padding:'2px 16px 8px',fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},'Category'),
    h(BriefChips,{T,options:BRIEF_CATEGORIES,selected:category,onSelect:id=>onConfig({briefCategory:id})}),
    h('div',{style:{borderTop:'1px solid '+T.hair}},body));
}

/* ============================== notes & tags views ============================== */
function EmptyState({T,icon,title,sub}){
  return h('div',{style:{padding:'80px 40px',textAlign:'center',color:T.sub}},
    h('div',{style:{display:'flex',justifyContent:'center',marginBottom:14,opacity:.5}},icon),
    h('div',{style:{fontSize:16.5,fontWeight:600,color:T.meta,marginBottom:6}},title),
    h('div',{style:{fontSize:13.5,lineHeight:1.5}},sub));
}

function NotesList({T,articles,onOpenArticle,onOpenHighlight}){
  const items=[];
  for(const a of articles)for(const hl of a.highlights)items.push({a,hl});
  items.sort((x,y)=>(y.hl.createdAt||0)-(x.hl.createdAt||0));
  if(!items.length)return h(EmptyState,{T,icon:Icons.notes(40),title:'No highlights yet',sub:'Select text inside any article to highlight it or attach a note. Everything you mark shows up here.'});
  return h('div',null,items.map(({a,hl})=>
    h('div',{key:hl.id,style:{padding:'16px 16px 14px',borderBottom:'1px solid '+T.hair}},
      h('div',{onClick:()=>onOpenArticle(a.id),style:{cursor:'pointer'}},
        h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:15.5,lineHeight:1.55,padding:'10px 14px',borderLeft:'3px solid #e8c547',background:T.card,borderRadius:'0 10px 10px 0',color:T.fg}},hl.text),
        hl.note?h('div',{style:{fontSize:14,color:T.meta,fontStyle:'italic',marginTop:8,display:'flex',gap:7,alignItems:'flex-start'}},
          h('span',{style:{display:'flex',marginTop:2,flexShrink:0}},Icons.note(15)),hl.note):null),
      h('div',{style:{display:'flex',alignItems:'center',marginTop:8}},
        h('div',{onClick:()=>onOpenArticle(a.id),style:{flex:1,fontSize:12,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}},a.title+(hl.createdAt?' · '+fmtDate(hl.createdAt):'')),
        h('button',{onClick:()=>onOpenHighlight(a.id,hl.id),className:'act90',style:{color:T.sub,padding:'4px 6px'}},Icons.dots(18))))));
}

function TagsList({T,articles,onPick}){
  const counts={};
  for(const a of articles)for(const t of a.tags)counts[t]=(counts[t]||0)+1;
  const tags=Object.keys(counts).sort();
  if(!tags.length)return h(EmptyState,{T,icon:Icons.tag(40),title:'No tags yet',sub:'Long-press any article and choose “Edit tags” to organize your reading with tags.'});
  return h('div',null,tags.map(t=>
    h('button',{key:t,onClick:()=>onPick(t),className:'act98 trc',style:{display:'flex',alignItems:'center',gap:16,width:'100%',padding:'16px 18px',textAlign:'left',color:T.fg,borderBottom:'1px solid '+T.hair}},
      h('span',{style:{display:'flex',color:T.meta}},Icons.tag(20)),
      h('span',{style:{flex:1,fontSize:16}},'#'+t),
      h('span',{style:{fontSize:13,color:T.sub}},String(counts[t])),
      h('span',{style:{display:'flex',color:T.sub}},Icons.chevR(16)))));
}

/* ============================== content editors ============================== */
function EditBlocksSheet({T,article,onSave,onClose}){
  const blocks=useMemo(()=>{
    const d=document.createElement('div');d.innerHTML=article.html;
    return Array.from(d.children).map(c=>c.outerHTML);
  },[article.id]);
  const [removed,setRemoved]=useState({});
  const count=Object.keys(removed).filter(k=>removed[k]).length;
  const toggle=i=>setRemoved(r=>({...r,[i]:!r[i]}));
  return h(Sheet,{T,onClose,title:'Remove blocks',maxH:'94%'},
    h('div',{style:{padding:'0 20px 8px'}},
      h('button',{onClick:()=>onSave(blocks.filter((_,i)=>!removed[i]).join('\n')),disabled:count>=blocks.length,className:'act98',
        style:{display:'block',width:'100%',padding:'14px',borderRadius:12,background:T.fg,color:T.bg,fontSize:16,fontWeight:600,textAlign:'center',opacity:count>=blocks.length?0.45:1}},
        count?('Save — remove '+count+' block'+(count>1?'s':'')):'Save'),
      h('div',{style:{fontSize:12.5,color:T.meta,lineHeight:1.5,marginTop:8}},'Tick the parts you want to remove, then save your cleaned-up copy.')),
    h('div',{style:{padding:'0 14px'}},
      blocks.map((b,i)=>h('div',{key:i,onClick:()=>toggle(i),
        style:{display:'flex',gap:10,alignItems:'flex-start',borderRadius:10,padding:'10px 12px',marginBottom:8,cursor:'pointer',border:'1.5px solid '+(removed[i]?T.danger:T.hair),opacity:removed[i]?0.45:1,background:removed[i]?'transparent':T.card}},
        h('span',{style:{width:22,height:22,borderRadius:6,flexShrink:0,marginTop:1,border:'2px solid '+(removed[i]?T.danger:T.sub),background:removed[i]?T.danger:'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}},removed[i]?Icons.check(14):null),
        h('div',{className:'rc',style:{fontFamily:"'Lora',Georgia,serif",fontSize:14,lineHeight:1.5,color:T.fg,'--accent':T.accent,'--hl':T.hl,'--hair':T.hair,'--card':T.card,'--meta':T.meta,pointerEvents:'none',maxHeight:170,overflow:'hidden',flex:1,minWidth:0},dangerouslySetInnerHTML:{__html:b}})))));
}

function EditTextSheet({T,article,onSave,onClose}){
  const [title,setTitle]=useState(article.title);
  const [md,setMd]=useState(()=>htmlToMd(article.html));
  return h(Sheet,{T,onClose,title:'Edit text',maxH:'94%'},
    h('div',{style:{padding:'0 20px'}},
      h('input',{value:title,onChange:e=>setTitle(e.target.value),placeholder:'Title',
        style:{width:'100%',padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16,fontWeight:600,fontFamily:"'Lora',Georgia,serif"}}),
      h('textarea',{value:md,onChange:e=>setMd(e.target.value),rows:14,spellCheck:false,
        style:{width:'100%',marginTop:10,padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14.5,lineHeight:1.55,resize:'vertical',fontFamily:"'Lora',Georgia,serif",minHeight:240}}),
      h('div',{style:{fontSize:11.5,color:T.sub,marginTop:8,lineHeight:1.5}},'Formatting: **bold** · *italic* · # heading · - list · > quote · ![](image-url) · blank line = new paragraph')),
    h(PrimaryBtn,{T,label:'Save',disabled:!md.trim(),onClick:()=>onSave(title.trim()||article.title,mdToHtml(md))}));
}

/* ============================== AI assistant ============================== */
function AISheet({T,S,article,articles,update,onClose,onSaveCopy,onSaveNote,toastFn}){
  const [ctx,setCtx]=useState(article||null);
  const [view,setView]=useState('menu'); // menu | langs | styles | ask | result
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [result,setResult]=useState(null); // {kind,text,lang}
  const [question,setQuestion]=useState('');
  const [keyDraft,setKeyDraft]=useState('');
  const [speaking,setSpeaking]=useState(false);
  const sess=useRef(0);
  const speakingRef=useRef(false);
  useEffect(()=>()=>{sess.current++;if(speakingRef.current){try{speechSynthesis.cancel()}catch(e){}}},[]);

  const ready=aiReady(S);
  const outLang=S.aiLang||'English';
  const setLang=l=>update(d=>({...d,settings:{...d.settings,aiLang:l}}));
  const ctxText=ctx?((ctx.title||'')+'\n\n'+(ctx.text||'')).slice(0,15000):'';

  const run=async(label,fn)=>{
    setError('');setBusy(label);
    try{await fn()}catch(e){setError((e&&e.message)||'Something went wrong');setView('menu')}
    setBusy('');
  };
  const doSummarize=()=>run('Summarizing…',async()=>{
    const out=await aiChat(S,[
      {role:'system',content:'You are a precise reading assistant.'},
      {role:'user',content:'Summarize the following article as 5–8 concise bullet points followed by one line starting with "Takeaway:". Respond entirely in '+outLang+'.\n\n'+ctxText}],1600,setBusy);
    setResult({kind:'Summary',text:out,lang:outLang});setView('result');
  });
  const doTranslate=lang=>run('Translating…',async()=>{
    const paras=[ctx.title,...blockTexts(ctx.html||('<p>'+escapeHtml(ctx.text)+'</p>'))].filter(Boolean);
    const chunks=chunkParas(paras,2400);
    const out=[];
    for(let i=0;i<chunks.length;i++){
      setBusy('Translating part '+(i+1)+' of '+chunks.length+'…');
      out.push(await aiChat(S,[
        {role:'system',content:'You are a professional translator. Translate the user text into '+lang+'. Keep the same paragraphs, separated by blank lines. Output ONLY the translation, no commentary.'},
        {role:'user',content:chunks[i]}],4000,setBusy));
      if(i<chunks.length-1)await sleep(1200); // stay under free-tier per-minute limits
    }
    setResult({kind:'Translation',text:out.join('\n\n'),lang,translation:true});setView('result');
  });
  const doRewrite=([style,instr])=>run('Rewriting…',async()=>{
    const out=await aiChat(S,[
      {role:'system',content:'You are an expert editor.'},
      {role:'user',content:instr+'. Respond entirely in '+outLang+', output only the rewritten text.\n\n'+ctxText}],4000,setBusy);
    setResult({kind:'Rewrite — '+style,text:out,lang:outLang,rewrite:true});setView('result');
  });
  const doAsk=()=>{const q=question.trim();if(!q)return;run('Thinking…',async()=>{
    const msgs=ctx
      ?[{role:'system',content:'Answer using the article below. Be concise and concrete. Respond in '+outLang+'.\n\nARTICLE:\n'+ctxText},{role:'user',content:q}]
      :[{role:'system',content:'You are a helpful assistant. Respond in '+outLang+'.'},{role:'user',content:q}];
    const out=await aiChat(S,msgs,2000,setBusy);
    setResult({kind:'Answer',text:out,lang:outLang});setView('result');
  })};

  const listen=()=>{
    if(speaking){sess.current++;speakingRef.current=false;setSpeaking(false);try{speechSynthesis.cancel()}catch(e){}return}
    if(!('speechSynthesis'in window)||!result){toastFn('Speech not supported');return}
    const sents=toSentences(result.text);let i=0;const my=++sess.current;
    speakingRef.current=true;setSpeaking(true);
    const next=()=>{
      if(sess.current!==my)return;
      if(i>=sents.length){speakingRef.current=false;setSpeaking(false);return}
      const u=new SpeechSynthesisUtterance(sents[i++]);
      const lng=detectSpeechLang(u.text);
      if(lng){u.lang=lng;const v=pickVoiceFor(lng,'');if(v)u.voice=v}
      else{
        if(S.ttsVoice&&S.ttsVoice.startsWith('lang:'))u.lang=S.ttsVoice.slice(5);
        const v=pickVoiceFor('',S.ttsVoice);if(v)u.voice=v;
      }
      u.rate=S.ttsRate||1;
      let done=false;const fin=()=>{if(done)return;done=true;next()};
      u.onend=fin;u.onerror=fin;
      try{speechSynthesis.speak(u)}catch(e){speakingRef.current=false;setSpeaking(false)}
    };
    try{speechSynthesis.cancel()}catch(e){}
    next();
  };

  const chip=(label,active,onClick)=>h('button',{key:label,onClick,className:'act95 trc',style:{padding:'8px 14px',borderRadius:18,fontSize:13.5,fontWeight:500,background:active?T.fg:T.card,color:active?T.bg:T.fg,flexShrink:0}},label);
  const backBtn=h('button',{onClick:()=>{setView('menu');setResult(null)},className:'act95',style:{display:'flex',alignItems:'center',gap:5,color:T.accent,fontSize:14.5,fontWeight:500,padding:'2px 20px 10px'}},Icons.back(16),'AI menu');

  let body;
  if(!ready){
    const prov=S.aiProvider||'openrouter';
    const isGem=prov==='gemini';
    body=h('div',{style:{padding:'0 20px'}},
      h('div',{style:{display:'flex',gap:8,marginBottom:14}},
        chip('OpenRouter',!isGem,()=>update(d=>({...d,settings:{...d.settings,aiProvider:'openrouter'}}))),
        chip('Google Gemini',isGem,()=>update(d=>({...d,settings:{...d.settings,aiProvider:'gemini'}})))),
      h('div',{style:{fontSize:14,color:T.meta,lineHeight:1.55,marginBottom:14}},
        isGem?'Connect a free Google Gemini API key to unlock AI summaries, translation (Telugu, Hindi & more), rewriting, and Q&A. Create one in seconds at ':'Connect a free OpenRouter API key to unlock AI summaries, translation (Telugu, Hindi & more), rewriting, and Q&A. Create one in seconds at ',
        isGem?h('a',{href:'https://aistudio.google.com/apikey',target:'_blank',rel:'noopener',style:{color:T.accent}},'aistudio.google.com/apikey')
             :h('a',{href:'https://openrouter.ai/keys',target:'_blank',rel:'noopener',style:{color:T.accent}},'openrouter.ai/keys'),'.'),
      h('input',{value:keyDraft,onChange:e=>setKeyDraft(e.target.value),placeholder:isGem?'AIza…':'sk-or-v1-…',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
        style:{width:'100%',padding:'13px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,fontFamily:'ui-monospace,monospace'}}),
      h(PrimaryBtn,{T,label:'Save key',disabled:!keyDraft.trim(),style:{margin:'14px 0 0',width:'100%'},onClick:()=>{update(d=>({...d,settings:{...d.settings,[isGem?'geminiKey':'aiKey']:keyDraft.trim()}}));toastFn('AI connected')}}));
  }else if(busy){
    body=h('div',{style:{padding:'30px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:14}},
      h(Spinner,{T,size:26}),
      h('div',{style:{fontSize:14.5,color:T.meta}},busy),
      h('div',{style:{fontSize:12,color:T.sub}},aiModelLabel(S)),
      h('button',{onClick:onClose,className:'act95',style:{marginTop:6,color:T.danger,fontSize:14,fontWeight:500,padding:'8px 18px'}},'Cancel'));
  }else if(view==='result'&&result){
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px'}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:8}},result.kind+(result.lang?' · '+result.lang:'')),
        h('div',{className:'rc',style:{fontFamily:fontCss(S.font),fontSize:16,lineHeight:1.62,color:T.fg,whiteSpace:'pre-wrap',maxHeight:'46vh',overflowY:'auto',padding:'14px 16px',background:T.card,borderRadius:12,userSelect:'text',WebkitUserSelect:'text'}},result.text),
        h('div',{style:{display:'flex',justifyContent:'space-around',marginTop:14}},
          h('button',{onClick:listen,className:'act95',style:{color:speaking?T.accent:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},speaking?Icons.pause(20):Icons.headphones(20),speaking?'Stop':'Listen'),
          h('button',{onClick:()=>{copyText(result.text);toastFn('Copied')},className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.copy(20),'Copy'),
          h('button',{onClick:()=>shareText(ctx?ctx.title:'AI',result.text,ctx?ctx.url:''),className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.share(20),'Share'),
          ctx?h('button',{onClick:()=>{onSaveNote(ctx,result.kind,result.text);},className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.note(20),'To Notes'):null),
        (result.translation||result.rewrite)&&ctx?h(PrimaryBtn,{T,style:{margin:'16px 0 0',width:'100%'},label:'Save as new article',onClick:()=>onSaveCopy(ctx,result)}):null));
  }else if(view==='langs'){
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px 4px',fontSize:14,color:T.meta}},'Translate this article into:'),
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:8,padding:'10px 20px'}},
        AI_LANGS.map(l=>chip(l,false,()=>doTranslate(l)))));
  }else if(view==='styles'){
    body=h('div',null,backBtn,
      REWRITE_STYLES.map(st=>h(ARow,{key:st[0],T,icon:Icons.pencil(20),label:st[0],sub:st[1],onClick:()=>doRewrite(st)})));
  }else if(view==='ask'){
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px'}},
        ctx?h('div',{style:{fontSize:12.5,color:T.sub,marginBottom:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'About: '+ctx.title):null,
        h('textarea',{value:question,onChange:e=>setQuestion(e.target.value),rows:3,placeholder:ctx?'e.g. What are the main arguments?':'Ask anything…',autoFocus:true,
          style:{width:'100%',padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15,lineHeight:1.5,resize:'none',fontFamily:UIF}}),
        h(PrimaryBtn,{T,label:'Ask AI',disabled:!question.trim(),style:{margin:'12px 0 0',width:'100%'},onClick:doAsk})));
  }else if(!ctx){
    const pick=articles.filter(a=>!a.isVideo&&a.text).slice(0,15);
    body=h('div',null,
      h('div',{style:{padding:'0 20px 6px',fontSize:14,color:T.meta}},'Pick an article to work with:'),
      pick.length?pick.map(a=>h(ARow,{key:a.id,T,icon:Icons.notes(19),label:a.title,sub:(a.source||'')+(a.readMin?' · '+a.readMin+' min':''),onClick:()=>setCtx(a)})):h('div',{style:{padding:'10px 20px',fontSize:13.5,color:T.sub}},'No readable articles saved yet.'),
      h(ARow,{T,icon:Icons.ai(20),label:'Ask AI anything',sub:'Chat without an article',onClick:()=>setView('ask')}));
  }else{
    body=h('div',null,
      h('div',{style:{padding:'0 20px 10px'}},
        h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:15.5,fontWeight:600,lineHeight:1.35}},ctx.title),
        article?null:h('button',{onClick:()=>setCtx(null),style:{fontSize:12.5,color:T.accent,marginTop:4}},'Choose a different article')),
      h('div',{style:{padding:'0 20px 12px'}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:7}},'Reply language'),
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto'}},
          ['English','Telugu','Hindi'].concat(AI_LANGS.filter(l=>!['English','Telugu','Hindi'].includes(l)).slice(0,4)).map(l=>chip(l,outLang===l,()=>setLang(l))))),
      error?h('div',{style:{margin:'0 20px 12px',padding:'11px 14px',borderRadius:10,background:T.card,fontSize:13,color:T.danger,lineHeight:1.45}},error):null,
      h(ARow,{T,icon:Icons.notes(20),label:'Summarize',sub:'Key points + takeaway in '+outLang,onClick:doSummarize}),
      h(ARow,{T,icon:Icons.globe(20),label:'Translate',sub:'Telugu, Hindi, and many more',onClick:()=>setView('langs')}),
      h(ARow,{T,icon:Icons.pencil(20),label:'Rewrite',sub:'Simplify · Shorten · Change tone',onClick:()=>setView('styles')}),
      h(ARow,{T,icon:Icons.ai(20),label:'Ask about this article',sub:'Any question, answered from the text',onClick:()=>setView('ask')}));
  }

  return h(Sheet,{T,onClose:busy?()=>{}:onClose,title:'✦ AI Assistant',maxH:'92%'},
    body,
    ready&&!busy?h('div',{style:{padding:'14px 20px 0',fontSize:11.5,color:T.sub,textAlign:'center'}},'Model: '+aiModelLabel(S)+' — change in Settings'):null);
}

/* ============================== password vault panel ============================== */
function VaultPanel({T,vault,onChange,session}){
  const [,force]=useState(0);
  const rerender=()=>force(x=>x+1);
  const s=session.current;
  const [p1,setP1]=useState('');
  const [p2,setP2]=useState('');
  const [verr,setVerr]=useState('');
  const [vbusy,setVbusy]=useState(false);
  const [form,setForm]=useState(null);
  const [reveal,setReveal]=useState({});
  const [confirmReset,setConfirmReset]=useState(false);
  const inp=(v,set,ph,type)=>h('input',{value:v,onChange:e=>set(e.target.value),placeholder:ph,type:type||'text',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
    style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,marginTop:8}});
  const btn=(label,onClick,opts)=>h('button',{onClick,disabled:!!(opts&&opts.dis),className:'act98',style:{display:'block',width:'100%',padding:'13px',borderRadius:11,background:(opts&&opts.ghost)?T.card:T.fg,color:(opts&&opts.ghost)?T.fg:T.bg,fontSize:15,fontWeight:600,textAlign:'center',marginTop:10,opacity:(opts&&opts.dis)?0.45:1}},label);
  const saveEntries=async entries=>{
    setVbusy(true);setVerr('');
    try{const blob=await vaultEncrypt(s.pass,entries);s.entries=entries;onChange(blob)}
    catch(e){setVerr('Could not encrypt — try again')}
    setVbusy(false);rerender();
  };
  if(!window.crypto||!crypto.subtle)
    return h('div',{style:{fontSize:13,color:T.sub,padding:'8px 0'}},'The password vault needs a secure (HTTPS) connection.');
  if(!vault){
    return h('div',null,
      h('div',{style:{fontSize:13,color:T.meta,lineHeight:1.55}},'Create a passcode-protected vault for your site logins. Everything is encrypted on this device with AES-256 and never leaves it. If you forget the passcode, the vault cannot be recovered.'),
      inp(p1,setP1,'Choose a passcode (min 4 characters)','password'),
      inp(p2,setP2,'Repeat passcode','password'),
      verr?h('div',{style:{fontSize:13,color:T.danger,marginTop:8}},verr):null,
      btn(vbusy?'Creating…':'Create vault',async()=>{
        if(p1.length<4){setVerr('Passcode must be at least 4 characters');return}
        if(p1!==p2){setVerr('Passcodes don’t match');return}
        setVbusy(true);setVerr('');
        try{const blob=await vaultEncrypt(p1,[]);session.current={unlocked:true,pass:p1,entries:[]};onChange(blob);setP1('');setP2('')}
        catch(e){setVerr('Could not create the vault')}
        setVbusy(false);rerender();
      },{dis:vbusy}));
  }
  if(!s.unlocked){
    return h('div',null,
      h('div',{style:{fontSize:13,color:T.meta}},'Vault is locked.'),
      inp(p1,setP1,'Passcode','password'),
      verr?h('div',{style:{fontSize:13,color:T.danger,marginTop:8}},verr):null,
      btn(vbusy?'Unlocking…':'Unlock',async()=>{
        setVbusy(true);setVerr('');
        try{const entries=await vaultDecrypt(p1,vault);session.current={unlocked:true,pass:p1,entries};setP1('')}
        catch(e){setVerr('Wrong passcode')}
        setVbusy(false);rerender();
      },{dis:vbusy||!p1}),
      h('button',{onClick:()=>{if(confirmReset){onChange(null);session.current={};setConfirmReset(false);rerender()}else setConfirmReset(true)},className:'act98',
        style:{display:'block',width:'100%',padding:'12px',marginTop:6,color:T.danger,fontSize:13.5,textAlign:'center'}},
        confirmReset?'Tap again — this erases ALL saved passwords':'Forgot passcode? Reset vault'));
  }
  const entries=s.entries||[];
  const startForm=ent=>{setForm(ent?{id:ent.id,site:ent.site,user:ent.user,pass:ent.pass}:{site:'',user:'',pass:''})};
  return h('div',null,
    form?h('div',{style:{border:'1px solid '+T.hair,borderRadius:12,padding:'4px 14px 14px',marginBottom:12}},
      inp(form.site,v=>setForm({...form,site:v}),'Site (e.g. eenadu.net)'),
      inp(form.user,v=>setForm({...form,user:v}),'Username / email'),
      inp(form.pass,v=>setForm({...form,pass:v}),'Password','password'),
      btn(vbusy?'Saving…':'Save password',()=>{
        if(!form.site.trim())return;
        const ent={id:form.id||uid(),site:form.site.trim(),user:form.user.trim(),pass:form.pass};
        saveEntries(form.id?entries.map(x=>x.id===form.id?ent:x):entries.concat([ent])).then(()=>setForm(null));
      },{dis:vbusy}),
      btn('Cancel',()=>setForm(null),{ghost:true}))
    :btn('+ Add password',()=>startForm(null),{ghost:true}),
    entries.map(ent=>h('div',{key:ent.id,style:{borderBottom:'1px solid '+T.hair,padding:'12px 2px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:8}},
        h('img',{src:faviconUrl(ent.site),alt:'',style:{width:18,height:18,borderRadius:4,flexShrink:0},onError:e=>{e.target.style.display='none'}}),
        h('div',{style:{flex:1,fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},ent.site),
        h('button',{onClick:()=>startForm(ent),className:'act90',style:{color:T.sub,padding:6}},Icons.pencil(16)),
        h('button',{onClick:()=>saveEntries(entries.filter(x=>x.id!==ent.id)),className:'act90',style:{color:T.danger,padding:6}},Icons.trash(16))),
      h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:6}},
        h('div',{style:{flex:1,fontSize:13,color:T.meta,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},ent.user||'—'),
        ent.user?h('button',{onClick:()=>copyText(ent.user),className:'act90',style:{color:T.accent,fontSize:12,fontWeight:600}},'Copy'):null),
      h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:4}},
        h('div',{style:{flex:1,fontSize:13,color:T.meta,fontFamily:'ui-monospace,monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},reveal[ent.id]?ent.pass:'••••••••'),
        h('button',{onClick:()=>setReveal(r=>({...r,[ent.id]:!r[ent.id]})),className:'act90',style:{color:T.sub,fontSize:12,fontWeight:600}},reveal[ent.id]?'Hide':'Show'),
        h('button',{onClick:()=>copyText(ent.pass),className:'act90',style:{color:T.accent,fontSize:12,fontWeight:600}},'Copy')))),
    entries.length===0&&!form?h('div',{style:{fontSize:13,color:T.sub,padding:'10px 0'}},'No passwords saved yet.'):null,
    verr?h('div',{style:{fontSize:13,color:T.danger,marginTop:8}},verr):null,
    btn('Lock vault',()=>{session.current={};rerender()},{ghost:true}));
}

/* ============================== saved sites manager ============================== */
function SitesManager({T,sites,onSites,onOpen}){
  const [form,setForm]=useState(null); // {id?,name,url}
  const move=(i,d)=>onSites(list=>{const a=list.slice();const j=i+d;if(j<0||j>=a.length)return list;const t=a[i];a[i]=a[j];a[j]=t;return a});
  const save=()=>{
    const u=normalizeUrl(form.url);
    const name=form.name.trim()||domainOf(u)||form.url;
    if(!u)return;
    if(form.id)onSites(list=>list.map(x=>x.id===form.id?{...x,name,url:u}:x));
    else onSites(list=>list.concat([{id:uid(),name,url:u}]));
    setForm(null);
  };
  return h('div',null,
    sites.map((st,i)=>h('div',{key:st.id,style:{display:'flex',alignItems:'center',gap:10,padding:'11px 0',borderBottom:'1px solid '+T.hair}},
      h('img',{src:faviconUrl(st.url),alt:'',style:{width:22,height:22,borderRadius:5,flexShrink:0},onError:e=>{e.target.style.display='none'}}),
      h('button',{onClick:()=>onOpen(st.url),style:{flex:1,minWidth:0,textAlign:'left',color:T.fg}},
        h('span',{style:{display:'block',fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},st.name),
        h('span',{style:{display:'block',fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},st.url)),
      h('button',{onClick:()=>move(i,-1),disabled:i===0,className:'act90',style:{color:T.sub,padding:'4px 6px',fontSize:15,opacity:i===0?0.3:1}},'▲'),
      h('button',{onClick:()=>move(i,1),disabled:i===sites.length-1,className:'act90',style:{color:T.sub,padding:'4px 6px',fontSize:15,opacity:i===sites.length-1?0.3:1}},'▼'),
      h('button',{onClick:()=>setForm({id:st.id,name:st.name,url:st.url}),className:'act90',style:{color:T.sub,padding:'4px 6px'}},Icons.pencil(16)),
      h('button',{onClick:()=>onSites(list=>list.filter(x=>x.id!==st.id)),className:'act90',style:{color:T.danger,padding:'4px 6px'}},Icons.trash(16)))),
    form?h('div',{style:{border:'1px solid '+T.hair,borderRadius:12,padding:'4px 14px 14px',marginTop:12}},
      h('input',{value:form.name,onChange:e=>setForm({...form,name:e.target.value}),placeholder:'Name (e.g. Eenadu)',
        style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,marginTop:8}}),
      h('input',{value:form.url,onChange:e=>setForm({...form,url:e.target.value}),placeholder:'https://…',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
        onKeyDown:e=>{if(e.key==='Enter')save()},
        style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,marginTop:8}}),
      h('div',{style:{display:'flex',gap:10,marginTop:10}},
        h('button',{onClick:save,disabled:!normalizeUrl(form.url),className:'act98',style:{flex:1,padding:'12px',borderRadius:10,background:T.fg,color:T.bg,fontSize:14,fontWeight:600,opacity:normalizeUrl(form.url)?1:0.45}},form.id?'Save':'Add site'),
        h('button',{onClick:()=>setForm(null),className:'act98',style:{flex:1,padding:'12px',borderRadius:10,background:T.card,color:T.fg,fontSize:14,fontWeight:600}},'Cancel')))
    :h('button',{onClick:()=>setForm({name:'',url:''}),className:'act98',style:{display:'block',width:'100%',padding:'12px',borderRadius:11,background:T.card,color:T.fg,fontSize:14,fontWeight:600,textAlign:'center',marginTop:12}},'+ Add a site'));
}

/* ============================== in-app browser ============================== */
function Browser({T,sites,onSites,vault,onChangeVault,session,initialUrl,onClose}){
  const [url,setUrl]=useState(initialUrl||'');
  const [input,setInput]=useState(initialUrl||'');
  const [frameKey,setFrameKey]=useState(0);
  const [vaultOpen,setVaultOpen]=useState(false);
  const [addForm,setAddForm]=useState(null);
  const go=t=>{const u=browserTarget(t);if(!u)return;setUrl(u);setInput(u)};
  const tbtn=(icon,onClick)=>h('button',{onClick,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,width:38})},icon);
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:90,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{style:{display:'flex',alignItems:'center',gap:4,padding:'calc(6px + '+SAFE_T+') 8px 6px',flexShrink:0}},
      h('button',{onClick:onClose,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.x(22)),
      h('div',{style:{flex:1,display:'flex',alignItems:'center',gap:8,background:T.search,borderRadius:11,padding:'8px 12px',minWidth:0}},
        h('span',{style:{color:T.sub,display:'flex'}},Icons.search(15)),
        h('input',{value:input,onChange:e=>setInput(e.target.value),placeholder:'Search Google or enter address',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          onKeyDown:e=>{if(e.key==='Enter')go(input)},
          onFocus:e=>{try{e.target.select()}catch(err){}},
          style:{flex:1,border:'none',background:'transparent',color:T.fg,fontSize:14,minWidth:0}}),
        url?h('button',{onClick:()=>{setUrl('');setInput('')},className:'act90',style:{color:T.sub,display:'flex',padding:2}},Icons.home(16)):null),
      url?tbtn(Icons.refresh(19),()=>setFrameKey(k=>k+1)):null,
      url?tbtn(Icons.external(19),()=>openExternalUrl(url)):null,
      tbtn(Icons.key(19),()=>setVaultOpen(true))),
    url?h(Fragment,null,
      h('iframe',{key:url+'|'+frameKey,src:url,
        sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
        allow:'fullscreen; clipboard-write',referrerPolicy:'no-referrer-when-downgrade',
        style:{flex:1,border:0,width:'100%',background:'#fff'}}),
      h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:10,padding:'7px 14px calc(7px + '+SAFE_B+')',borderTop:'1px solid '+T.hair}},
        h('span',{style:{flex:1,fontSize:11.5,color:T.sub,lineHeight:1.4}},'Blank page? The site may block embedding.'),
        h('button',{onClick:()=>openExternalUrl(url),style:{color:T.accent,fontWeight:600,fontSize:12.5,flexShrink:0}},'Open ↗')))
    :h('div',{className:'sy',style:{flex:1,overflowY:'auto',padding:'14px 16px calc(20px + '+SAFE_B+')'}},
      h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'4px 2px 12px'}},'Your sites'),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}},
        sites.map(st=>h('button',{key:st.id,onClick:()=>go(st.url),className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7,minWidth:0}},
          h('span',{style:{width:54,height:54,borderRadius:14,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}},
            h('img',{src:faviconUrl(st.url),alt:'',style:{width:30,height:30},onError:e=>{e.target.style.opacity=0}})),
          h('span',{style:{fontSize:11.5,color:T.meta,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},st.name))),
        h('button',{onClick:()=>setAddForm({name:'',url:''}),className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7}},
          h('span',{style:{width:54,height:54,borderRadius:14,border:'1.5px dashed '+T.sub,display:'flex',alignItems:'center',justifyContent:'center',color:T.sub}},Icons.plus(22)),
          h('span',{style:{fontSize:11.5,color:T.sub}},'Add'))),
      addForm?h('div',{style:{border:'1px solid '+T.hair,borderRadius:12,padding:'4px 14px 14px',marginTop:16}},
        h('input',{value:addForm.name,onChange:e=>setAddForm({...addForm,name:e.target.value}),placeholder:'Name',
          style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,marginTop:8}}),
        h('input',{value:addForm.url,onChange:e=>setAddForm({...addForm,url:e.target.value}),placeholder:'https://…',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,marginTop:8}}),
        h('div',{style:{display:'flex',gap:10,marginTop:10}},
          h('button',{onClick:()=>{const u=normalizeUrl(addForm.url);if(!u)return;onSites(list=>list.concat([{id:uid(),name:addForm.name.trim()||domainOf(u),url:u}]));setAddForm(null)},className:'act98',style:{flex:1,padding:'12px',borderRadius:10,background:T.fg,color:T.bg,fontSize:14,fontWeight:600}},'Add site'),
          h('button',{onClick:()=>setAddForm(null),className:'act98',style:{flex:1,padding:'12px',borderRadius:10,background:T.card,color:T.fg,fontSize:14,fontWeight:600}},'Cancel'))):null,
      h('div',{style:{fontSize:12,color:T.sub,marginTop:18,lineHeight:1.5}},'Reorder, rename, or remove sites in Settings → Logged-In Sites. Tap the key icon to copy a saved password while logging in.')),
    vaultOpen?h(Sheet,{T,onClose:()=>setVaultOpen(false),title:'Passwords',z:95},
      h('div',{style:{padding:'0 20px'}},
        h(VaultPanel,{T,vault,onChange:onChangeVault,session}))):null);
}

/* ============================== settings ============================== */
function SettingsSheet({T,S,data,voices,update,usageKB,onExport,onImport,onClearArchived,onEraseAll,onOpenBrowser,vaultSession,onClose}){
  const set=p=>update(d=>({...d,settings:{...d.settings,...p}}));
  const fileRef=useRef(null);
  const [page,setPage]=useState('root');
  /* live OpenRouter model catalog (cached for a day) */
  const orActive=(S.aiProvider||'openrouter')==='openrouter';
  const [orModels,setOrModels]=useState(null);
  const [orLoading,setOrLoading]=useState(false);
  const [orErr,setOrErr]=useState('');
  const [mq,setMq]=useState('');
  const loadOr=async()=>{
    setOrLoading(true);setOrErr('');
    try{
      const list=await fetchOpenRouterModels();
      setOrModels(list);
      try{localStorage.setItem('or_models_v1',JSON.stringify({at:Date.now(),list}))}catch(e){}
    }catch(e){setOrErr('Couldn\u2019t load the live list \u2014 using the built-in one.')}
    setOrLoading(false);
  };
  useEffect(()=>{
    if(page!=='ai'||!orActive||orModels)return;
    try{
      const c=JSON.parse(localStorage.getItem('or_models_v1')||'null');
      if(c&&Array.isArray(c.list)&&c.list.length&&Date.now()-c.at<86400000){setOrModels(c.list);return}
    }catch(e){}
    loadOr();
  },[page,orActive]);

  const head=t=>h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,padding:'22px 20px 8px'}},t);
  const archivedCount=data.articles.filter(a=>a.archived).length;
  const onSites=fn=>update(d=>({...d,sites:fn(d.sites||[])}));
  const navRow=(label,p2,icon,last)=>h('button',{onClick:()=>setPage(p2),className:'act98 trc',
    style:{display:'flex',alignItems:'center',gap:14,width:'100%',padding:'15px 16px',textAlign:'left',color:T.fg,borderBottom:last?'none':'1px solid '+T.hair}},
    h('span',{style:{display:'flex',color:T.meta}},icon),
    h('span',{style:{flex:1,fontSize:16}},label),
    h('span',{style:{display:'flex',color:T.sub}},Icons.chevR(16)));
  const PAGE_TITLES={appearance:'Appearance',behavior:'Behavior',voices:'Voices',ai:'AI Assistant',sites:'Logged-In Sites',data:'Syncing & Backup'};

  let content;
  if(page==='root'){
    content=h(Fragment,null,
      h('div',{style:{margin:'4px 20px 0',padding:'14px 16px',borderRadius:13,background:T.card,display:'flex',gap:12,alignItems:'center'}},
        h('span',{style:{display:'flex',color:'#3f9d63'}},Icons.checkCircle(26,true)),
        h('div',null,
          h('div',{style:{fontSize:15.5,fontWeight:650}},'Premium unlocked'),
          h('div',{style:{fontSize:12.5,color:T.meta,marginTop:2}},'Every feature, free forever. No subscription.'))),
      head('General'),
      h('div',{style:{margin:'0 16px',border:'1px solid '+T.hair,borderRadius:14,overflow:'hidden'}},
        navRow('Appearance','appearance',Icons.contrast(20)),
        navRow('Behavior','behavior',Icons.bolt(20)),
        navRow('Voices','voices',Icons.headphones(20)),
        navRow('AI Assistant','ai',Icons.ai(20)),
        navRow('Logged-In Sites','sites',Icons.globe(20)),
        navRow('Syncing & Backup','data',Icons.download(20),true)),
      h('div',{style:{padding:'22px 20px 8px',fontSize:12,color:T.sub,lineHeight:1.6,textAlign:'center'}},
        'Instapaper \u00b7 v'+APP_VERSION,h('br'),'Your personal read-it-later app. Everything is stored privately on this device.'));
  }else if(page==='appearance'){
    content=h(Fragment,null,
      h('div',{style:{display:'flex',justifyContent:'space-around',padding:'10px 20px 4px'}},
        Object.values(THEMES).map(t=>h('button',{key:t.id,onClick:()=>set({theme:t.id}),className:'act90 trt',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:6}},
          h('span',{style:{width:44,height:44,borderRadius:'50%',background:t.swatch,border:S.theme===t.id?('2.5px solid '+T.accent):('1.5px solid '+(t.id==='light'?'#d5d5d8':T.hair)),display:'flex',alignItems:'center',justifyContent:'center',color:t.fg,fontFamily:'Georgia,serif',fontSize:16}},'A'),
          h('span',{style:{fontSize:11.5,color:S.theme===t.id?T.fg:T.sub,fontWeight:S.theme===t.id?600:400}},t.label)))),
      h('div',{style:{display:'flex',alignItems:'center',gap:14,padding:'18px 20px 0'}},
        h('span',{style:{fontSize:14.5,flex:1}},'Reading font'),
        h('select',{value:S.font,onChange:e=>set({font:e.target.value}),style:{padding:'9px 12px',borderRadius:9,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14}},
          FONTS.map(f=>h('option',{key:f.id,value:f.id},f.label)))),
      h('div',{style:{display:'flex',alignItems:'center',gap:14,padding:'16px 20px 0'}},
        h('span',{style:{fontSize:14.5,flex:1}},'Text size'),
        h('button',{onClick:()=>set({fontSize:clamp(S.fontSize-1,15,26)}),className:'act95',style:{padding:'8px 16px',borderRadius:9,background:T.card,color:T.fg,fontSize:13,fontFamily:'Georgia,serif'}},'A'),
        h('span',{style:{fontSize:13,color:T.meta,width:40,textAlign:'center'}},S.fontSize+'px'),
        h('button',{onClick:()=>set({fontSize:clamp(S.fontSize+1,15,26)}),className:'act95',style:{padding:'5px 16px',borderRadius:9,background:T.card,color:T.fg,fontSize:19,fontFamily:'Georgia,serif'}},'A')),
      h('div',{style:{padding:'18px 20px 8px',fontSize:12,color:T.sub,lineHeight:1.5}},'Line spacing and per-article tweaks live in the Aa menu inside the reader. The header moon/sun icon cycles all four themes.'));
  }else if(page==='behavior'){
    content=h(Fragment,null,
      head('Speed reading'),
      h('div',{style:{display:'flex',alignItems:'center',gap:14,padding:'0 20px'}},
        h('input',{type:'range',min:150,max:700,step:10,value:S.wpm,onChange:e=>set({wpm:+e.target.value}),style:{flex:1,accentColor:T.accent}}),
        h('span',{style:{fontSize:13,color:T.meta,width:70,textAlign:'right'}},S.wpm+' wpm')),
      head('Gestures'),
      h('div',{style:{padding:'0 20px 8px',fontSize:13.5,color:T.meta,lineHeight:1.7}},
        'Swipe right on an article \u2014 Like',h('br'),
        'Swipe left \u2014 Archive (or unarchive)',h('br'),
        'Long-press \u2014 all actions',h('br'),
        'Select text in the reader \u2014 highlight or add a note'));
  }else if(page==='voices'){
    const teluguVoiceInstalled=voices.some(v=>v.lang&&v.lang.toLowerCase().startsWith('te'));
    content=h(Fragment,null,
      head('Speech rate'),
      h('div',{style:{padding:'0 20px'}},
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}},
          RATES.map(r=>h('button',{key:r,onClick:()=>set({ttsRate:r}),className:'act95 trc',style:{padding:'7px 13px',borderRadius:16,fontSize:13,fontWeight:600,background:S.ttsRate===r?T.fg:T.card,color:S.ttsRate===r?T.bg:T.meta,flexShrink:0}},r+'\u00d7')))),
      head('Voice language'),
      h('div',{style:{padding:'0 20px'}},
        h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,marginBottom:12}},'Pick a language for articles. Indic text (Telugu, Hindi\u2026) is also detected automatically and spoken in the right voice regardless of this setting.'),
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',paddingBottom:8}},
          [['','Default'],...INDIC_TTS_LANGS.map(([code,label])=>['lang:'+code,label])].map(([val,label])=>
            h('button',{key:val,onClick:()=>set({ttsVoice:val}),className:'act95 trc',
              style:{padding:'8px 14px',borderRadius:18,fontSize:13,fontWeight:600,flexShrink:0,
                background:(S.ttsVoice||'')===(val)?T.fg:T.card,
                color:(S.ttsVoice||'')===(val)?T.bg:T.fg}},label))),
        !teluguVoiceInstalled?h('div',{style:{marginTop:12,padding:'12px 14px',borderRadius:10,background:T.card,fontSize:12.5,color:T.sub,lineHeight:1.6}},
          '\u{1F4F1} To get a Telugu voice on iPhone: Settings \u2192 Accessibility \u2192 Spoken Content \u2192 Voices \u2192 Telugu \u2192 download a voice. Then restart this app.'):null,
        voices.length?h('div',{style:{marginTop:14}},
          h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:8}},'Or pick a specific installed voice'),
          h('select',{value:(S.ttsVoice&&!S.ttsVoice.startsWith('lang:'))?S.ttsVoice:'',
            onChange:e=>set({ttsVoice:e.target.value}),
            style:{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14}},
            h('option',{value:''},'(use language setting above)'),
            voices.map(v=>h('option',{key:v.name,value:v.name},v.name+' \u2014 '+v.lang)))):null));
  }else if(page==='ai'){
    content=h(Fragment,null,
      h('div',{style:{padding:'10px 20px 0'}},
        h('div',{style:{display:'flex',gap:8,marginBottom:12}},
          [['openrouter','OpenRouter'],['gemini','Google Gemini']].map(([id,label])=>
            h('button',{key:id,onClick:()=>set({aiProvider:id}),className:'act95 trc',
              style:{flex:1,padding:'10px 0',borderRadius:11,fontSize:14,fontWeight:600,background:(S.aiProvider||'openrouter')===id?T.fg:T.card,color:(S.aiProvider||'openrouter')===id?T.bg:T.meta}},label))),
        (S.aiProvider||'openrouter')==='gemini'
          ?h(Fragment,null,
            h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,marginBottom:10}},'Uses Google\u2019s Gemini API directly \u2014 generous free tier. Get a key at ',h('a',{href:'https://aistudio.google.com/apikey',target:'_blank',rel:'noopener',style:{color:T.accent}},'aistudio.google.com/apikey'),'.'),
            h('input',{value:S.geminiKey,onChange:e=>set({geminiKey:e.target.value.trim()}),placeholder:'API key \u2014 AIza\u2026',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
              style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:13.5,fontFamily:'ui-monospace,monospace'}}),
            h('select',{value:GEMINI_MODELS.some(m=>m[0]===S.geminiModel)?S.geminiModel:'custom',onChange:e=>{if(e.target.value!=='custom')set({geminiModel:e.target.value})},
              style:{width:'100%',marginTop:10,padding:'10px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14}},
              GEMINI_MODELS.map(m=>h('option',{key:m[0],value:m[0]},m[1])),
              h('option',{value:'custom'},'Custom model\u2026')),
            h('input',{value:S.geminiModel,onChange:e=>set({geminiModel:e.target.value.trim()}),placeholder:'model id, e.g. gemini-2.5-flash',autoCapitalize:'none',spellCheck:false,
              style:{width:'100%',marginTop:8,padding:'9px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.meta,fontSize:12,fontFamily:'ui-monospace,monospace'}}))
          :h(Fragment,null,
            h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,marginBottom:10}},'One key, many models (DeepSeek, Llama, Qwen\u2026). Get a free key at ',h('a',{href:'https://openrouter.ai/keys',target:'_blank',rel:'noopener',style:{color:T.accent}},'openrouter.ai/keys'),'.'),
            h('input',{value:S.aiKey,onChange:e=>set({aiKey:e.target.value.trim()}),placeholder:'API key \u2014 sk-or-v1-\u2026',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
              style:{width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:13.5,fontFamily:'ui-monospace,monospace'}}),
            (()=>{
              const live=orModels;
              const ql=mq.trim().toLowerCase();
              let opts=live?live.filter(m=>!ql||(m.id+' '+m.name).toLowerCase().includes(ql)).slice(0,200):null;
              if(opts&&!opts.some(m=>m.id===S.aiModel))opts=[{id:S.aiModel,name:S.aiModel,free:/:free$/.test(S.aiModel)}].concat(opts);
              return h(Fragment,null,
                live?h('input',{value:mq,onChange:e=>setMq(e.target.value),placeholder:'Search '+live.length+' free models\u2026 (e.g. llama)',autoCapitalize:'none',spellCheck:false,
                  style:{width:'100%',marginTop:10,padding:'9px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:13.5}}):null,
                h('select',{value:opts?S.aiModel:(AI_MODELS.some(m=>m[0]===S.aiModel)?S.aiModel:'custom'),onChange:e=>{if(e.target.value!=='custom')set({aiModel:e.target.value})},
                  style:{width:'100%',marginTop:10,padding:'10px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14}},
                  opts?opts.map(m=>h('option',{key:m.id,value:m.id},m.name))
                      :AI_MODELS.map(m=>h('option',{key:m[0],value:m[0]},m[1])),
                  opts?null:h('option',{value:'custom'},'Custom model\u2026')),
                h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:8,flexWrap:'wrap'}},
                  h('button',{onClick:loadOr,disabled:orLoading,className:'act95',style:{fontSize:12.5,color:T.accent,fontWeight:500,display:'flex',alignItems:'center',gap:6}},orLoading?h(Spinner,{T,size:12}):null,orLoading?'Loading\u2026':(live?'Refresh model list':'Load free OpenRouter models')),
                  h('span',{style:{fontSize:11.5,color:orErr?T.danger:T.sub}},orErr||(live?live.length+' free chat models, live from openrouter.ai':''))),
                h('input',{value:S.aiModel,onChange:e=>set({aiModel:e.target.value.trim()}),placeholder:'model id, e.g. deepseek/deepseek-r1-0528:free',autoCapitalize:'none',spellCheck:false,
                  style:{width:'100%',marginTop:8,padding:'9px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.meta,fontSize:12,fontFamily:'ui-monospace,monospace'}}));
            })())));
  }else if(page==='sites'){
    content=h(Fragment,null,
      h('div',{style:{padding:'8px 20px 0'}},
        h('button',{onClick:()=>onOpenBrowser(''),className:'act98',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:9,width:'100%',padding:'14px',borderRadius:12,background:T.fg,color:T.bg,fontSize:15.5,fontWeight:600}},Icons.globe(19),'Open browser')),
      head('Saved sites'),
      h('div',{style:{padding:'0 20px'}},
        h(SitesManager,{T,sites:data.sites||[],onSites,onOpen:u=>onOpenBrowser(u)})),
      head('Passwords'),
      h('div',{style:{padding:'0 20px 10px'}},
        h(VaultPanel,{T,vault:data.vault||null,onChange:blob=>update(d=>({...d,vault:blob})),session:vaultSession})));
  }else if(page==='data'){
    content=h(Fragment,null,
      h('div',{style:{padding:'10px 20px 6px',fontSize:13,color:T.sub,lineHeight:1.55}},
        data.articles.length+' articles \u00b7 '+Math.round(usageKB)+' KB stored on this device. There is no cloud account \u2014 your backup file IS your sync. Export it here and import it on another device.'),
      h(ARow,{T,icon:Icons.download(20),label:'Export backup',sub:'Articles, notes, highlights, sites, settings \u2014 and your encrypted vault',onClick:onExport}),
      h(ARow,{T,icon:Icons.upload(20),label:'Import backup',sub:'Restore from an exported file',onClick:()=>{if(fileRef.current)fileRef.current.click()}}),
      h('input',{ref:fileRef,type:'file',accept:'.json,application/json',style:{display:'none'},onChange:e=>{const f=e.target.files&&e.target.files[0];if(f)onImport(f);e.target.value=''}}),
      head('Automatic backups'),
      h('div',{style:{display:'flex',alignItems:'center',gap:14,padding:'4px 20px 6px'}},
        h('span',{style:{fontSize:14.5,flex:1}},'Remind me to back up'),
        h('select',{value:String(S.backupEvery||0),onChange:e=>set({backupEvery:+e.target.value}),style:{padding:'9px 12px',borderRadius:9,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14}},
          [['0','Off'],['3','Every 3 days'],['7','Weekly'],['14','Every 2 weeks'],['30','Monthly']].map(([v,l])=>h('option',{key:v,value:v},l)))),
      h('div',{style:{padding:'2px 20px 12px',fontSize:12,color:T.sub,lineHeight:1.5}},
        'Last backup: '+(S.lastBackupAt?timeAgo(S.lastBackupAt):'never')+'. When one is due, a reminder with a one-tap Export appears on the home screen.'),
      archivedCount?h(ARow,{T,icon:Icons.archive(20),label:'Clear archive',sub:archivedCount+' archived article'+(archivedCount>1?'s':''),onClick:onClearArchived}):null,
      h(ARow,{T,icon:Icons.trash(20),label:'Erase everything',danger:true,onClick:onEraseAll}));
  }

  return h(Sheet,{T,onClose,title:page==='root'?'Settings':PAGE_TITLES[page],maxH:'94%'},
    page!=='root'?h('button',{onClick:()=>setPage('root'),className:'act95',style:{display:'flex',alignItems:'center',gap:5,color:T.accent,fontSize:14.5,fontWeight:500,padding:'0 20px 6px'}},Icons.back(16),'Settings'):null,
    content);
}

/* ============================== list helpers ============================== */
function inScope(a,scope){
  switch(scope.type){
    case 'home':return !a.archived;
    case 'liked':return a.liked;
    case 'archive':return a.archived;
    case 'videos':return a.isVideo&&!a.archived;
    case 'folder':return a.folderId===scope.id&&!a.archived;
    case 'tag':return a.tags.includes(scope.id);
    default:return false;
  }
}
function sortArticles(arr,sort){
  const a=arr.slice();
  switch(sort){
    case 'oldest':a.sort((x,y)=>(x.addedAt||0)-(y.addedAt||0));break;
    case 'longest':a.sort((x,y)=>(y.words||0)-(x.words||0));break;
    case 'shortest':a.sort((x,y)=>(x.words||0)-(y.words||0));break;
    case 'popular':a.sort((x,y)=>((y.liked?2:0)+(y.opens||0))-((x.liked?2:0)+(x.opens||0))||(y.addedAt||0)-(x.addedAt||0));break;
    default:a.sort((x,y)=>(y.addedAt||0)-(x.addedAt||0));
  }
  return a;
}
function scopeTitle(scope,folders){
  switch(scope.type){
    case 'home':return 'Instapaper';
    case 'liked':return 'Liked';
    case 'archive':return 'Archive';
    case 'videos':return 'Videos';
    case 'notes':return 'Notes';
    case 'tags':return 'Tags';
    case 'brief':return 'Daily Brief';
    case 'tag':return '#'+scope.id;
    case 'folder':{const f=folders.find(f=>f.id===scope.id);return f?f.name:'Folder'}
    default:return 'Instapaper';
  }
}
const EMPTY_STATES={
  home:['No articles yet','Tap + in the sidebar to save your first link.'],
  liked:['No liked articles','Tap the heart inside an article, or swipe right on it.'],
  archive:['Archive is empty','Swipe left on an article to archive it when you’re done.'],
  videos:['No videos saved','Save a YouTube link and it will show up here.'],
  folder:['This folder is empty','Long-press an article and choose “Move to folder”.'],
  tag:['Nothing with this tag','Long-press an article and choose “Edit tags”.']
};

/* ============================== error boundary ============================== */
class Boundary extends React.Component{
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  componentDidCatch(){try{const s=document.getElementById('spl');if(s)s.classList.add('hide')}catch(e){}}
  render(){
    if(this.state.err)return ce('div',{style:{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,fontFamily:UIF,padding:30,textAlign:'center',background:'#fff',color:'#1c1c1e'}},
      ce('div',{style:{fontFamily:WORDMARK,fontSize:24,fontWeight:600}},'Instapaper'),
      ce('div',{style:{fontSize:14,color:'#76767c'}},'Something went wrong. Your articles are safe.'),
      ce('button',{onClick:()=>location.reload(),style:{padding:'12px 26px',borderRadius:11,background:'#1c1c1e',color:'#fff',fontSize:15,fontWeight:600}},'Reload'));
    return this.props.children;
  }
}

/* ============================== App ============================== */
function App(){
  const [data,setData]=useState(loadStore);
  const dataRef=useRef(data);
  const persist=useMemo(()=>{
    const fn=debounce(d=>{
      try{localStorage.setItem(STORE_KEY,JSON.stringify(d))}
      catch(e){if(!fn.warned){fn.warned=true;alert('Storage is full. Delete some articles (or clear the archive in Settings) so new saves can be kept offline.')}}
    },350);
    return fn;
  },[]);
  const update=useCallback(mut=>{setData(prev=>{
    const next=typeof mut==='function'?mut(prev):Object.assign({},prev,mut);
    dataRef.current=next;persist(next);return next;
  })},[persist]);
  const patchArticle=useCallback((id,patch)=>{update(d=>({...d,articles:d.articles.map(a=>a.id===id?{...a,...(typeof patch==='function'?patch(a):patch)}:a)}))},[update]);
  const byId=id=>dataRef.current.articles.find(a=>a.id===id);

  const S=data.settings;
  const T=THEMES[S.theme]||THEMES.light;

  const [scope,setScope]=useState({type:'home'});
  const [query,setQuery]=useState('');
  const [readingId,setReadingId]=useState(null);
  const [sidebar,setSidebar]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [addS,setAddS]=useState(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [selecting,setSelecting]=useState(null);
  const [sheet,setSheet]=useState(null);
  const [toast,setToast]=useState(null);
  const [ttsUI,setTtsUI]=useState(null);
  const [ttsOpen,setTtsOpen]=useState(false);
  const [speedId,setSpeedId]=useState(null);
  const [voices,setVoices]=useState([]);
  const [aiOpen,setAiOpen]=useState(null); // {articleId?} — header AI works on any page
  const [browserO,setBrowserO]=useState(null); // {url} — in-app browser
  const vaultSess=useRef({}); // unlocked password-vault session (memory only, never persisted)
  const toastT=useRef(null);
  const toastFn=useCallback(msg=>{setToast(msg);if(toastT.current)clearTimeout(toastT.current);toastT.current=setTimeout(()=>setToast(null),2000)},[]);

  useEffect(()=>{ // splash + launch params (?url= from share target, ?action=add)
    const spl=document.getElementById('spl');if(spl)spl.classList.add('hide');
    try{
      const p=new URLSearchParams(location.search);
      const u=p.get('url')||extractFirstUrl(p.get('text')||'')||extractFirstUrl(p.get('title')||'');
      if(u)setAddS({prefill:u});
      else if(p.get('action')==='add')setAddS({prefill:''});
      if([...p.keys()].length)history.replaceState(null,'',location.pathname);
    }catch(e){}
  },[]);

  useEffect(()=>{ // keep system chrome in sync with theme
    document.body.style.background=T.bg;
    const m=document.querySelector('meta[name="theme-color"]');
    if(m)m.setAttribute('content',T.statusbar);
  },[T]);

  useEffect(()=>{ // speech voices load async on most platforms
    if(!('speechSynthesis'in window))return;
    const load=()=>{try{const v=speechSynthesis.getVoices();if(v.length)setVoices(v)}catch(e){}};
    load();
    try{speechSynthesis.addEventListener('voiceschanged',load)}catch(e){speechSynthesis.onvoiceschanged=load}
    return()=>{try{speechSynthesis.removeEventListener('voiceschanged',load)}catch(e){}};
  },[]);

  /* ---------- text-to-speech engine ---------- */
  const tts=useRef({session:0,queue:[],qi:0,sentences:[],si:0,playing:false});
  const syncTts=useCallback(()=>{const st=tts.current;setTtsUI(st.queue.length?{queue:st.queue.slice(),qi:st.qi,si:st.si,total:st.sentences.length,playing:st.playing}:null)},[]);
  const ttsLoad=(qi,si)=>{const st=tts.current;st.qi=qi;st.si=si||0;
    const a=dataRef.current.articles.find(x=>x.id===st.queue[qi]);
    st.sentences=a&&a.text?toSentences((a.title?a.title+'. ':'')+a.text):[];};
  const speakCur=useCallback(function speak(){
    const st=tts.current;const sess=++st.session;
    try{speechSynthesis.cancel()}catch(e){}
    if(st.si>=st.sentences.length){
      if(st.qi+1<st.queue.length)ttsLoad(st.qi+1,0);
      else{st.playing=false;syncTts();return}
    }
    const sent=st.sentences[st.si];
    if(!sent){st.playing=false;syncTts();return}
    const u=new SpeechSynthesisUtterance(sent);
    const cfg=dataRef.current.settings;
    u.rate=cfg.ttsRate||1;
    const lng=detectSpeechLang(sent); // Telugu / Hindi / other Indic text gets a matching voice
    if(lng){u.lang=lng;const vv=pickVoiceFor(lng,'');if(vv)u.voice=vv}
    else if(cfg.ttsVoice){
      if(cfg.ttsVoice.startsWith('lang:'))u.lang=cfg.ttsVoice.slice(5);
      try{const v=pickVoiceFor('',cfg.ttsVoice);if(v)u.voice=v}catch(e){}
    }
    let handled=false;
    const fin=()=>{
      if(handled)return;handled=true;
      const st2=tts.current;
      if(st2.session!==sess||!st2.playing)return;
      st2.si++;
      if(st2.si>=st2.sentences.length){
        if(st2.qi+1<st2.queue.length){ttsLoad(st2.qi+1,0);speak()}
        else{st2.playing=false;syncTts()}
      }else speak();
    };
    u.onend=fin;u.onerror=fin;
    st.playing=true;syncTts();
    try{speechSynthesis.speak(u)}catch(e){st.playing=false;syncTts()}
  },[syncTts]);
  const startTts=(ids,startId)=>{
    if(!('speechSynthesis'in window)){toastFn('Text-to-speech is not supported on this device');return}
    const st=tts.current;
    st.queue=ids.filter(id=>{const a=byId(id);return a&&!a.isVideo&&a.text});
    if(!st.queue.length){toastFn('Nothing to listen to — these items have no text');return}
    let qi=0;if(startId){const k=st.queue.indexOf(startId);if(k>-1)qi=k}
    ttsLoad(qi,0);speakCur();setTtsOpen(true);
  };
  const ttsToggle=()=>{const st=tts.current;
    if(st.playing){st.session++;st.playing=false;try{speechSynthesis.cancel()}catch(e){}syncTts()}
    else if(st.queue.length)speakCur();
  };
  const ttsStop=()=>{const st=tts.current;st.session++;st.playing=false;st.queue=[];try{speechSynthesis.cancel()}catch(e){}setTtsUI(null);setTtsOpen(false)};
  const ttsSkipSent=d=>{const st=tts.current;st.si=clamp(st.si+d,0,Math.max(0,st.sentences.length-1));if(st.playing)speakCur();else syncTts()};
  const ttsJumpArticle=d=>{const st=tts.current;const ni=st.qi+d;if(ni<0||ni>=st.queue.length)return;ttsLoad(ni,0);if(st.playing)speakCur();else syncTts()};
  const ttsJumpTo=i=>{ttsLoad(i,0);speakCur()};
  const ttsSetRate=r=>{update(d=>({...d,settings:{...d.settings,ttsRate:r}}));if(tts.current.playing)setTimeout(speakCur,60)};
  const ttsSetVoice=v=>{update(d=>({...d,settings:{...d.settings,ttsVoice:v}}));if(tts.current.playing)setTimeout(speakCur,60)};

  /* ---------- saving links ---------- */
  const addByUrl=async(url,folderId)=>{
    const dup=dataRef.current.articles.find(a=>a.url===url);
    if(dup){setAddS(null);toastFn('Already in your list');return}
    const rec=await fetchArticleData(url); // throws on failure -> AddSheet shows error
    const article=Object.assign(rec,{id:uid(),addedAt:Date.now(),liked:false,archived:false,folderId:folderId||null,tags:[],progress:0,opens:0,highlights:[]});
    update(d=>({...d,articles:[article,...d.articles]}));
    setAddS(null);
    toastFn(article.isVideo?'Video saved':'Saved — '+article.readMin+' min read');
  };
  const saveStub=(url,folderId)=>{
    if(!url)return;
    const vid=ytIdOf(url);
    update(d=>({...d,articles:[{id:uid(),url,title:domainOf(url)||url,source:domainOf(url),author:'',image:vid?('https://i.ytimg.com/vi/'+vid+'/hqdefault.jpg'):'',html:'',text:'',excerpt:'',words:0,readMin:0,isVideo:!!vid,videoId:vid,publishedAt:0,addedAt:Date.now(),liked:false,archived:false,folderId:folderId||null,tags:[],progress:0,opens:0,highlights:[]},...d.articles]}));
    setAddS(null);toastFn('Link saved — download it later from the article');
  };
  const retryFetch=async id=>{
    const a=byId(id);if(!a||!a.url)return;
    const rec=await fetchArticleData(a.url);
    patchArticle(id,{title:rec.title,source:rec.source,author:rec.author,image:rec.image,html:rec.html,text:rec.text,excerpt:rec.excerpt,words:rec.words,readMin:rec.readMin,isVideo:rec.isVideo,videoId:rec.videoId,publishedAt:rec.publishedAt});
    toastFn('Article downloaded');
  };
  /* save a Daily Brief headline for offline reading, then open it */
  const addBriefItem=async it=>{
    const dup=dataRef.current.articles.find(a=>a.url===it.url);
    if(dup){openArticle(dup.id);return}
    try{
      const rec=await fetchArticleData(it.url);
      const article=Object.assign(rec,{
        title:rec.title||it.title,
        source:it.source||rec.source,
        publishedAt:rec.publishedAt||it.publishedAt||0,
        id:uid(),addedAt:Date.now(),liked:false,archived:false,folderId:null,tags:[],progress:0,opens:1,highlights:[]
      });
      update(d=>({...d,articles:[article,...d.articles]}));
      setReadingId(article.id);
      toastFn('Saved — '+article.readMin+' min read');
    }catch(e){
      toastFn('Couldn’t fetch that story — opening it instead');
      setBrowserO({url:it.url});
    }
  };

  /* ---------- article actions ---------- */
  const deleteArticles=ids=>{
    update(d=>({...d,articles:d.articles.filter(a=>!ids.includes(a.id))}));
    if(ids.includes(readingId))setReadingId(null);
    if(ids.includes(speedId))setSpeedId(null);
    const st=tts.current;
    if(st.queue.some(id=>ids.includes(id)))ttsStop();
    setSheet(null);setSelecting(null);toastFn('Deleted');
  };
  const openArticle=id=>{patchArticle(id,a=>({opens:(a.opens||0)+1}));setReadingId(id)};
  const doAction=(id,key)=>{
    const a=byId(id);if(!a&&key!=='close')return;
    switch(key){
      case 'close':setReadingId(null);break;
      case 'like':patchArticle(id,x=>({liked:!x.liked}));break;
      case 'archive':{const now=!a.archived;patchArticle(id,{archived:now});toastFn(now?'Archived':'Moved to Home');setSheet(null);break}
      case 'move':setSheet({type:'move',ids:[id]});break;
      case 'tags':setSheet({type:'tags',id});break;
      case 'listen':setSheet(null);startTts([id]);break;
      case 'speed':setSheet(null);setSpeedId(id);break;
      case 'share':setSheet(null);shareText(a.title,'',a.url||'');break;
      case 'copy':setSheet(null);copyText(a.url);toastFn('Link copied');break;
      case 'open':setSheet(null);openExternalUrl(a.url);break;
      case 'delete':setSheet({type:'confirm',kind:'delete',ids:[id]});break;
      case 'sheet':setSheet({type:'article',id});break;
      case 'edit':setSheet({type:'editChoice',id});break;
      case 'ai':setSheet(null);setAiOpen({articleId:id});break;
    }
  };
  const cycleTheme=()=>{
    const order=['light','sepia','dark','black'];
    const next=order[(order.indexOf(S.theme)+1)%order.length];
    update(d=>({...d,settings:{...d.settings,theme:next}}));
    toastFn(THEMES[next].label+' theme');
  };
  const saveEditedContent=(id,title,html)=>{
    const text=htmlToText(html);
    if(!text){toastFn('Nothing left — not saved');return}
    const words=countWords(text);
    patchArticle(id,Object.assign(title?{title}:{},{html,text,excerpt:text.slice(0,220),words,readMin:readMinutes(words)}));
    setSheet(null);toastFn('Content updated');
  };
  const saveAiCopy=(orig,result)=>{
    const paras=result.text.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
    const title=(result.translation&&paras.length>1?paras.shift():orig.title+' — '+result.kind).replace(/^#+\s*/,'');
    const html=paras.map(p=>'<p>'+escapeHtml(p).replace(/\n/g,'<br/>')+'</p>').join('\n');
    const text=htmlToText(html);
    const words=countWords(text);
    update(d=>({...d,articles:[{id:uid(),url:orig.url,title,source:orig.source,author:orig.author,image:orig.image||'',html,text,excerpt:text.slice(0,220),words,readMin:readMinutes(words),isVideo:false,videoId:null,publishedAt:0,addedAt:Date.now(),liked:false,archived:false,folderId:orig.folderId||null,tags:[...new Set([...orig.tags,result.translation?'translated':'rewritten'])],progress:0,opens:0,highlights:[],lang:LANG_CODES[result.lang]||''},...d.articles]}));
    setAiOpen(null);toastFn('Saved as new article');
  };
  const saveAiNote=(orig,kind,text)=>{
    patchArticle(orig.id,a=>({highlights:[...a.highlights,{id:uid(),text:'✦ AI '+kind,note:text.slice(0,6000),createdAt:Date.now()}]}));
    toastFn('Saved to Notes');
  };

  /* ---------- highlights ---------- */
  const addHighlight=(text,withNote)=>{
    if(!readingId)return;
    const hl={id:uid(),text:String(text).replace(/\s+/g,' ').trim(),note:'',createdAt:Date.now()};
    if(!hl.text)return;
    patchArticle(readingId,a=>({highlights:[...a.highlights,hl]}));
    if(withNote)setSheet({type:'highlight',aid:readingId,hid:hl.id});
    else toastFn('Highlighted');
  };

  /* ---------- folders ---------- */
  const saveFolder=(name,existing,afterMoveIds)=>{
    if(existing){update(d=>({...d,folders:d.folders.map(f=>f.id===existing.id?{...f,name}:f)}));setSheet(null);toastFn('Folder renamed')}
    else{
      const nf={id:uid(),name,createdAt:Date.now()};
      update(d=>({...d,folders:[...d.folders,nf],articles:afterMoveIds&&afterMoveIds.length?d.articles.map(a=>afterMoveIds.includes(a.id)?{...a,folderId:nf.id,archived:false}:a):d.articles}));
      setSheet(null);setSelecting(null);
      toastFn(afterMoveIds&&afterMoveIds.length?'Moved to '+name:'Folder created');
    }
  };
  const deleteFolder=f=>{
    update(d=>({...d,folders:d.folders.filter(x=>x.id!==f.id),articles:d.articles.map(a=>a.folderId===f.id?{...a,folderId:null}:a)}));
    if(scope.type==='folder'&&scope.id===f.id)setScope({type:'home'});
    setSheet(null);toastFn('Folder deleted — its articles moved to Home');
  };
  const moveArticles=(ids,folderId)=>{
    update(d=>({...d,articles:d.articles.map(a=>ids.includes(a.id)?{...a,folderId,archived:false}:a)}));
    setSheet(null);setSelecting(null);
    const f=dataRef.current.folders.find(f=>f.id===folderId);
    toastFn('Moved to '+(f?f.name:'Home'));
  };

  /* ---------- bulk selection ---------- */
  const toggleSelect=id=>setSelecting(s=>s?{...s,ids:s.ids.includes(id)?s.ids.filter(x=>x!==id):[...s.ids,id]}:s);
  const bulk=kind=>{
    const ids=selecting?selecting.ids:[];if(!ids.length)return;
    if(kind==='like'){const allLiked=ids.every(id=>{const a=byId(id);return a&&a.liked});update(d=>({...d,articles:d.articles.map(a=>ids.includes(a.id)?{...a,liked:!allLiked}:a)}));setSelecting(null);toastFn(allLiked?'Unliked':'Liked')}
    else if(kind==='archive'){const toArchive=scope.type!=='archive';update(d=>({...d,articles:d.articles.map(a=>ids.includes(a.id)?{...a,archived:toArchive}:a)}));setSelecting(null);toastFn(toArchive?'Archived':'Moved to Home')}
    else if(kind==='move')setSheet({type:'move',ids});
    else if(kind==='delete')setSheet({type:'confirm',kind:'delete',ids});
  };

  /* ---------- data management ---------- */
  const exportBackup=()=>{
    const blob=new Blob([JSON.stringify(dataRef.current,null,1)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const aEl=document.createElement('a');
    aEl.href=url;aEl.download='instapaper-backup-'+new Date().toISOString().slice(0,10)+'.json';aEl.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    update(d=>({...d,settings:{...d.settings,lastBackupAt:Date.now(),backupSnoozeUntil:0}}));
    toastFn('Backup downloaded');
  };
  const snoozeBackup=()=>update(d=>({...d,settings:{...d.settings,backupSnoozeUntil:Date.now()+(d.settings.backupEvery||7)*86400000}}));
  const importBackup=async file=>{
    try{
      const d=JSON.parse(await file.text());
      if(!d||!Array.isArray(d.articles))throw new Error('bad file');
      d.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});
  if(DEAD_MODELS.includes(d.settings.aiModel))d.settings.aiModel=DEFAULT_SETTINGS.aiModel;
      d.folders=Array.isArray(d.folders)?d.folders:[];
      d.articles.forEach(a=>{a.tags=Array.isArray(a.tags)?a.tags:[];a.highlights=Array.isArray(a.highlights)?a.highlights:[]});
      d.sites=Array.isArray(d.sites)?d.sites:[];
      d.vault=d.vault&&d.vault.ct?d.vault:null;
      d.seeded=true;
      update(()=>d);setScope({type:'home'});toastFn('Backup restored — '+d.articles.length+' articles');
    }catch(e){toastFn('That file doesn’t look like a backup')}
  };
  const eraseAll=()=>{
    try{localStorage.removeItem(STORE_KEY)}catch(e){}
    update(()=>({settings:Object.assign({},DEFAULT_SETTINGS),articles:[makeSeed()],folders:[],seeded:true}));
    setScope({type:'home'});setSheet(null);setSettingsOpen(false);toastFn('Everything erased');
  };

  /* ---------- derived list ---------- */
  const q=query.trim().toLowerCase();
  const list=useMemo(()=>{
    let arr;
    if(q){arr=data.articles.filter(a=>((a.title||'')+' '+(a.author||'')+' '+(a.source||'')+' '+a.tags.join(' ')+' '+(a.text||'')).toLowerCase().includes(q))}
    else{
      arr=data.articles.filter(a=>inScope(a,scope));
      const f=S.filter;
      if(f==='unread')arr=arr.filter(a=>(a.progress||0)<0.97);
      else if(f==='liked')arr=arr.filter(a=>a.liked);
      else if(f==='articles')arr=arr.filter(a=>!a.isVideo);
      else if(f==='videos')arr=arr.filter(a=>a.isVideo);
      else if(f==='completed')arr=arr.filter(a=>(a.progress||0)>=0.97);
    }
    return sortArticles(arr,S.sort);
  },[data,scope,q,S.sort,S.filter]);
  const snippetFor=a=>{
    if(!q||!a.text)return null;
    const i=a.text.toLowerCase().indexOf(q);
    if(i<0)return null;
    const s=Math.max(0,i-60),e=Math.min(a.text.length,i+q.length+90);
    return [(s>0?'…':'')+a.text.slice(s,i),h('span',{key:'m',style:{fontWeight:700,color:T.fg}},a.text.slice(i,i+q.length)),a.text.slice(i+q.length,e)+(e<a.text.length?'…':'')];
  };

  const reading=readingId?data.articles.find(a=>a.id===readingId):null;
  const speedA=speedId?data.articles.find(a=>a.id===speedId):null;
  const allTags=useMemo(()=>{const s=new Set();data.articles.forEach(a=>a.tags.forEach(t=>s.add(t)));return[...s].sort()},[data.articles]);
  const isArticleScope=!['notes','tags','brief'].includes(scope.type);
  const usageKB=useMemo(()=>{try{return(localStorage.getItem(STORE_KEY)||'').length/1024}catch(e){return 0}},[settingsOpen,data]);
  /* is an automatic backup reminder due? (data exists, reminders on, not snoozed) */
  const backupNever=!S.lastBackupAt;
  const backupDue=useMemo(()=>{
    const every=S.backupEvery||0;
    if(!every)return false;
    if(!data.articles.some(a=>a.id!=='welcome'))return false; // nothing worth backing up yet
    const now=Date.now();
    if(now<(S.backupSnoozeUntil||0))return false;
    return backupNever||now-S.lastBackupAt>=every*86400000;
  },[data.articles,S.backupEvery,S.lastBackupAt,S.backupSnoozeUntil,backupNever]);

  const readerAction=k=>doAction(readingId,k);
  readerAction.update=update;

  /* ---------- header ---------- */
  const headerBtn=(icon,onClick)=>h('button',{onClick,className:'act90 trt',style:Object.assign({},iconBtnS,{color:T.fg})},icon);
  let header;
  if(selecting){
    header=h('div',{style:{display:'flex',alignItems:'center',padding:'6px 8px 6px 4px',flexShrink:0}},
      h('button',{onClick:()=>setSelecting(null),style:{padding:'10px 14px',color:T.accent,fontSize:15.5,fontWeight:500}},'Cancel'),
      h('div',{style:{flex:1,textAlign:'center',fontSize:16,fontWeight:600}},
        selecting.mode==='playlist'?'Playlist · '+selecting.ids.length:selecting.ids.length+' selected'),
      h('div',{style:{width:70}}));
  }else{
    header=h('div',{style:{display:'flex',alignItems:'center',padding:'6px 8px',flexShrink:0,position:'relative'}},
      headerBtn(scope.type==='tag'?Icons.back(23):Icons.menu(23),()=>scope.type==='tag'?setScope({type:'tags'}):setSidebar(true)),
      h('div',{style:{position:'absolute',left:'50%',transform:'translateX(-50%)',maxWidth:'40%',textAlign:'center',fontFamily:WORDMARK,fontSize:21,fontWeight:600,letterSpacing:'.2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',pointerEvents:'none'}},scopeTitle(scope,data.folders)),
      h('div',{style:{flex:1}}),
      headerBtn(Icons.ai(22),()=>setAiOpen({})),
      headerBtn(Icons.contrast(22),cycleTheme),
      headerBtn(Icons.dots(22),()=>setMenuOpen(true)));
  }

  /* ---------- main area ---------- */
  let body;
  if(scope.type==='notes')body=h(NotesList,{T,articles:data.articles,onOpenArticle:openArticle,onOpenHighlight:(aid,hid)=>setSheet({type:'highlight',aid,hid})});
  else if(scope.type==='tags')body=h(TagsList,{T,articles:data.articles,onPick:t=>setScope({type:'tag',id:t})});
  else if(scope.type==='brief')body=h(DailyBrief,{T,regionId:S.briefRegion||'IN',category:S.briefCategory||'',
    onConfig:patch=>update(d=>({...d,settings:{...d.settings,...patch}})),onOpenItem:addBriefItem});
  else if(!list.length){
    const[et,es]=q?['No results','Nothing matches “'+query.trim()+'” in your articles — full-text search covers everything you’ve saved.']:(EMPTY_STATES[scope.type]||EMPTY_STATES.home);
    body=h(EmptyState,{T,icon:q?Icons.search(40):Icons.archive(40),title:et,sub:es});
  }else{
    body=h('div',null,
      q?h('div',{style:{padding:'10px 16px 4px',fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},list.length+' result'+(list.length>1?'s':'')+' · searching everything'):null,
      list.map(a=>h(ArticleRow,{key:a.id,a,T,scopeType:scope.type,
        onOpen:()=>openArticle(a.id),
        onLongPress:()=>setSheet({type:'article',id:a.id}),
        onSwipeLeft:()=>{const now=scope.type!=='archive';patchArticle(a.id,{archived:now});toastFn(now?'Archived':'Moved to Home')},
        onSwipeRight:()=>{patchArticle(a.id,x=>({liked:!x.liked}));toastFn(a.liked?'Unliked':'Liked')},
        selecting:!!selecting,
        selected:selecting?selecting.ids.includes(a.id):false,
        disabledSelect:selecting&&selecting.mode==='playlist'&&(a.isVideo||!a.text),
        onToggleSelect:()=>toggleSelect(a.id),
        snippet:snippetFor(a)})));
  }

  return h(Fragment,null,
    h('div',{style:{height:'100dvh',display:'flex',flexDirection:'column',background:T.bg,color:T.fg,fontFamily:UIF,overflow:'hidden',paddingTop:SAFE_T}},
      header,
      isArticleScope&&!selecting?h('div',{style:{padding:'2px 16px 10px',flexShrink:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:9,background:T.search,borderRadius:11,padding:'9px 12px'}},
          h('span',{style:{color:T.sub,display:'flex'}},Icons.search(17)),
          h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:'Search',
            style:{flex:1,border:'none',background:'transparent',color:T.fg,fontSize:15.5,minWidth:0}}),
          query?h('button',{onClick:()=>setQuery(''),className:'act90',style:{color:T.sub,display:'flex',padding:2}},Icons.x(16)):null)):null,
      backupDue&&!selecting?h(BackupBanner,{T,never:backupNever,onExport:exportBackup,onLater:snoozeBackup}):null,
      h('div',{className:'sy',style:{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',paddingBottom:ttsUI?100:16}},body),
      selecting?h('div',{style:{flexShrink:0,borderTop:'1px solid '+T.hair,background:T.bg,paddingBottom:SAFE_B}},
        selecting.mode==='playlist'
          ?h('button',{onClick:()=>{if(selecting.ids.length){const ids=selecting.ids;setSelecting(null);startTts(ids)}},disabled:!selecting.ids.length,className:'act98',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:9,width:'calc(100% - 32px)',margin:'10px 16px',padding:'14px',borderRadius:12,background:T.fg,color:T.bg,fontSize:15.5,fontWeight:600,opacity:selecting.ids.length?1:.4}},Icons.headphones(19),'Play '+(selecting.ids.length||'')+' article'+(selecting.ids.length===1?'':'s'))
          :h('div',{style:{display:'flex',justifyContent:'space-around',padding:'4px 0'}},
            h('button',{onClick:()=>bulk('like'),className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,opacity:selecting.ids.length?1:.35})},Icons.heart(22)),
            h('button',{onClick:()=>bulk('archive'),className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,opacity:selecting.ids.length?1:.35})},Icons.archive(22)),
            h('button',{onClick:()=>bulk('move'),className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,opacity:selecting.ids.length?1:.35})},Icons.folder(22)),
            h('button',{onClick:()=>bulk('delete'),className:'act90',style:Object.assign({},iconBtnS,{color:T.danger,opacity:selecting.ids.length?1:.35})},Icons.trash(22)))):null
    ),

    reading?h(Reader,{a:reading,T,S,patch:p=>patchArticle(reading.id,p),onAction:readerAction,toastFn,addHighlight,
      onHighlightTap:hid=>setSheet({type:'highlight',aid:reading.id,hid}),
      onRetry:()=>retryFetch(reading.id)}):null,

    !selecting&&!reading?h('button',{onClick:()=>setSheet({type:'plus'}),className:'act90 trt',
      style:{position:'fixed',right:18,bottom:'calc('+(ttsUI?94:24)+'px + '+SAFE_B+')',width:56,height:56,borderRadius:'50%',background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 6px 22px rgba(0,0,0,.32)',zIndex:32}},Icons.plus(25)):null,

    sidebar?h(Sidebar,{T,scope,folders:data.folders,onScope:s=>{setScope(s);setQuery('');setSelecting(null)},onClose:()=>setSidebar(false),
      onBrowse:()=>setBrowserO({url:''}),
      onFolderLongPress:f=>{setSidebar(false);setSheet({type:'folder',folder:f})}}):null,

    menuOpen?h(MenuPopover,{T,settings:S,showListOps:isArticleScope,onClose:()=>setMenuOpen(false),
      onPick:(kind,v)=>{update(d=>({...d,settings:{...d.settings,[kind]:v}}));setMenuOpen(false)},
      onSelectMode:()=>{setMenuOpen(false);setSelecting({mode:'select',ids:[]})},
      onPlaylistMode:()=>{setMenuOpen(false);setSelecting({mode:'playlist',ids:[]});toastFn('Tap articles to build your playlist')},
      onSettings:()=>{setMenuOpen(false);setSettingsOpen(true)}}):null,

    addS?h(AddSheet,{T,folders:data.folders,prefill:addS.prefill,defaultFolder:scope.type==='folder'?scope.id:null,
      onSave:addByUrl,onSaveStub:saveStub,onClose:()=>setAddS(null)}):null,

    sheet&&sheet.type==='plus'?h(Sheet,{T,onClose:()=>setSheet(null)},
      h(ARow,{T,icon:Icons.link(21),label:'Save a link',sub:'Article, video, or any web page',onClick:()=>{setSheet(null);setAddS({prefill:''})}}),
      h(ARow,{T,icon:Icons.folder(21),label:'New folder',sub:'Organize your reading',onClick:()=>setSheet({type:'folder'})})):null,

    sheet&&sheet.type==='article'?(()=>{const a=byId(sheet.id);return a?h(ArticleSheet,{T,a,onClose:()=>setSheet(null),onAction:k=>doAction(sheet.id,k)}):null})():null,

    sheet&&sheet.type==='move'?h(MoveSheet,{T,folders:data.folders,count:sheet.ids.length,onClose:()=>setSheet(null),
      onMove:fid=>moveArticles(sheet.ids,fid),
      onNewFolder:()=>setSheet({type:'folder',afterMoveIds:sheet.ids})}):null,

    sheet&&sheet.type==='tags'?(()=>{const a=byId(sheet.id);return a?h(TagsSheet,{T,article:a,allTags,onClose:()=>setSheet(null),
      onSave:tags=>{patchArticle(sheet.id,{tags});setSheet(null);toastFn('Tags saved')}}):null})():null,

    sheet&&sheet.type==='folder'?h(FolderEditSheet,{T,folder:sheet.folder||null,onClose:()=>setSheet(null),
      onSave:name=>{if(name)saveFolder(name,sheet.folder||null,sheet.afterMoveIds)},
      onDelete:()=>{if(sheet.folder)deleteFolder(sheet.folder)}}):null,

    sheet&&sheet.type==='highlight'?(()=>{
      const a=byId(sheet.aid);if(!a)return null;
      const hl=a.highlights.find(x=>x.id===sheet.hid);if(!hl)return null;
      return h(HighlightSheet,{T,article:a,hl,onClose:()=>setSheet(null),
        onSaveNote:note=>{patchArticle(sheet.aid,x=>({highlights:x.highlights.map(g=>g.id===sheet.hid?{...g,note}:g)}));setSheet(null);toastFn(note?'Note saved':'Note removed')},
        onDelete:()=>{patchArticle(sheet.aid,x=>({highlights:x.highlights.filter(g=>g.id!==sheet.hid)}));setSheet(null);toastFn('Highlight removed')}});
    })():null,

    sheet&&sheet.type==='editChoice'?(()=>{const a=byId(sheet.id);return a?h(Sheet,{T,onClose:()=>setSheet(null),title:'Edit content'},
      h(ARow,{T,icon:Icons.blocks(21),label:'Remove blocks',sub:'Tap unwanted paragraphs, images, or ads to delete them',onClick:()=>setSheet({type:'editBlocks',id:sheet.id})}),
      h(ARow,{T,icon:Icons.pencil(21),label:'Edit text',sub:'Edit the title and full text directly',onClick:()=>setSheet({type:'editText',id:sheet.id})})):null})():null,

    sheet&&sheet.type==='editBlocks'?(()=>{const a=byId(sheet.id);return a?h(EditBlocksSheet,{T,article:a,onClose:()=>setSheet(null),
      onSave:html=>saveEditedContent(sheet.id,null,html)}):null})():null,

    sheet&&sheet.type==='editText'?(()=>{const a=byId(sheet.id);return a?h(EditTextSheet,{T,article:a,onClose:()=>setSheet(null),
      onSave:(title,html)=>saveEditedContent(sheet.id,title,html)}):null})():null,

    aiOpen?h(AISheet,{T,S,article:aiOpen.articleId?byId(aiOpen.articleId):null,
      articles:sortArticles(data.articles.filter(a=>!a.archived),'newest'),
      update,toastFn,onClose:()=>setAiOpen(null),onSaveCopy:saveAiCopy,onSaveNote:saveAiNote}):null,

    sheet&&sheet.type==='confirm'?h(ConfirmSheet,{T,
      title:sheet.kind==='delete'?('Delete '+(sheet.ids.length>1?sheet.ids.length+' articles?':'article?')):sheet.kind==='clearArchive'?'Clear archive?':'Erase everything?',
      message:sheet.kind==='delete'?'This also removes any highlights and notes in '+(sheet.ids.length>1?'these articles':'this article')+'. This can’t be undone.':sheet.kind==='clearArchive'?'All archived articles and their highlights will be permanently removed.':'All articles, highlights, folders, and settings will be permanently removed from this device.',
      confirmLabel:sheet.kind==='delete'?'Delete':sheet.kind==='clearArchive'?'Clear archive':'Erase everything',
      onClose:()=>setSheet(null),
      onConfirm:()=>{
        if(sheet.kind==='delete')deleteArticles(sheet.ids);
        else if(sheet.kind==='clearArchive'){const ids=dataRef.current.articles.filter(a=>a.archived).map(a=>a.id);deleteArticles(ids);toastFn('Archive cleared')}
        else eraseAll();
      }}):null,

    settingsOpen?h(SettingsSheet,{T,S,data,voices,update,usageKB,onClose:()=>setSettingsOpen(false),
      onExport:exportBackup,onImport:importBackup,
      onClearArchived:()=>setSheet({type:'confirm',kind:'clearArchive'}),
      onEraseAll:()=>setSheet({type:'confirm',kind:'erase'}),
      onOpenBrowser:u=>setBrowserO({url:u||''}),
      vaultSession:vaultSess}):null,

    browserO?h(Browser,{T,sites:data.sites||[],
      onSites:fn=>update(d=>({...d,sites:fn(d.sites||[])})),
      vault:data.vault||null,
      onChangeVault:blob=>update(d=>({...d,vault:blob})),
      session:vaultSess,
      initialUrl:browserO.url,
      onClose:()=>setBrowserO(null)}):null,

    ttsUI&&!ttsOpen?(()=>{const cur=data.articles.find(a=>a.id===ttsUI.queue[ttsUI.qi]);
      return h(MiniPlayer,{T,ui:ttsUI,title:cur?cur.title:'Listening…',onToggle:ttsToggle,onNextArticle:()=>ttsJumpArticle(1),onStop:ttsStop,onOpen:()=>setTtsOpen(true)})})():null,

    ttsOpen&&ttsUI?h(TTSPlayerSheet,{T,ui:ttsUI,articles:data.articles,settings:S,voices,
      onToggle:ttsToggle,onSkipSent:ttsSkipSent,onJumpArticle:ttsJumpArticle,onJumpTo:ttsJumpTo,
      onRate:ttsSetRate,onVoice:ttsSetVoice,onClose:()=>setTtsOpen(false)}):null,

    speedA?h(SpeedReader,{a:speedA,T,S,onClose:()=>setSpeedId(null),
      onFinish:()=>{patchArticle(speedA.id,{progress:1});toastFn('Completed — nice!')},
      saveWpm:v=>update(d=>({...d,settings:{...d.settings,wpm:v}}))}):null,

    h(Toast,{T,toast})
  );
}

/* ============================== mount ============================== */
ReactDOM.createRoot(document.getElementById('root')).render(ce(Boundary,null,ce(App)));
