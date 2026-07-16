/* Instapaper — premium reading app (PWA)
   All premium features unlocked, free forever. */
'use strict';
const {Fragment,useState,useEffect,useMemo,useRef,useCallback,useDeferredValue,createElement:ce}=React;
const h=(t,p,...c)=>ce(t,p,...c);

/* ============================== constants ============================== */
const STORE_KEY='instapaper_v1';
const APP_VERSION='1.2.0';
/* True when running inside the Naz Trades journal (embedded in an iframe).
   In that case the header shows a Back arrow that returns to the journal. */
const EMBEDDED=(()=>{try{return window.self!==window.parent}catch(e){return true}})();
const exitToHost=()=>{try{window.parent.postMessage({type:'arthveda-reader-back'},'*')}catch(e){}};

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

const DEFAULT_SETTINGS={theme:'light',font:'Lora',fontSize:19,lineHeight:1.62,sort:'newest',filter:'all',typeFilter:'article',readFilter:'unread',hideRead:false,ttsRate:1,ttsVoice:'',wpm:380,justify:false,aiKey:'',aiModel:'deepseek/deepseek-r1-0528:free',aiLang:'English',aiProvider:'claude',geminiKey:'',geminiModel:'gemini-2.5-flash',briefRegion:'IN',briefCategory:'',blogSel:'',lenFilter:'',srcFilter:'',briefStarred:[],briefMuted:[],backupEvery:7,lastBackupAt:0,backupSnoozeUntil:0};

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
    if(/not a valid model/i.test(msg))msg+=' — Tip: rerank and embedding models can\'t chat. Pick a chat model in Settings → AI (e.g. Llama 3.3 70B free).';
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
    else if(res.status===403)msg='This Gemini API key isn\'t allowed to use '+model+'.';
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

/* ---------- Gemini video understanding (YouTube URL) ----------
   Gemini can "watch" a YouTube video passed as a fileData part and return a
   transcript / summary / answer. Only Gemini supports this — text-only models
   (OpenRouter) cannot, so aiVideo requires the Gemini provider. */
async function geminiVideo(key,model,prompt,url,maxTokens,onWait){
  const body={contents:[{role:'user',parts:[{fileData:{fileUri:url}},{text:prompt}]}],generationConfig:{maxOutputTokens:maxTokens||4096,temperature:0.3}};
  let res;
  for(let attempt=0;;attempt++){
    res=await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},180000);
    if(res.status===429&&attempt<2){
      const wait=(attempt+1)*6;
      if(onWait)onWait('Rate limited — retrying in '+wait+'s…');
      await sleep(wait*1000);
      continue;
    }
    break;
  }
  if(!res.ok){
    let msg='Gemini video request failed ('+res.status+')';
    try{const j=await res.json();if(j&&j.error&&j.error.message)msg=String(j.error.message)}catch(e){}
    if(res.status===400&&/api key/i.test(msg))msg='Invalid Gemini API key — check it in Settings → AI.';
    else if(res.status===400)msg='Gemini couldn\'t read this video. It may be private, age-restricted, or region-locked.';
    else if(res.status===403)msg='This Gemini API key isn\'t allowed to use '+model+'.';
    else if(res.status===429)msg='Gemini free-tier quota hit — wait a minute and try again, or use Gemini 2.5 Flash in Settings → AI.';
    throw new Error(msg);
  }
  const j=await res.json();
  const cand=j&&j.candidates&&j.candidates[0];
  const out=cand&&cand.content&&cand.content.parts?cand.content.parts.map(p=>p.text||'').join(''):'';
  if(!out.trim()){
    if(cand&&cand.finishReason==='SAFETY')throw new Error('Gemini blocked this video (safety filters).');
    throw new Error('Empty response — the video may be too long for the free tier, or has no usable audio.');
  }
  return out.trim();
}
function aiVideo(S,prompt,url,maxTokens,onWait){
  if(S.aiProvider!=='gemini'||!S.geminiKey)
    return Promise.reject(new Error('Video AI is powered by Google Gemini. Open Settings → AI, switch to Gemini, and add a free key from aistudio.google.com/apikey.'));
  return geminiVideo(S.geminiKey,S.geminiModel||'gemini-2.5-flash',prompt,url,maxTokens,onWait);
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
const aiReady=S=>S.aiProvider==='claude'?true:S.aiProvider==='gemini'?!!S.geminiKey:!!S.aiKey;
function aiModelLabel(S){
  if(S.aiProvider==='claude')return'Claude app';
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
function fmtDateShort(ts){if(!ts)return'';const d=new Date(ts);const o={day:'numeric',month:'short'};if(new Date().getFullYear()!==d.getFullYear())o.year='numeric';return d.toLocaleDateString(undefined,o)}
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

/* ---------- daily brief: youtube channel resolution + latest video (RSS) ---------- */
function ymd(d){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
function parseYtChannelId(url){const m=String(url||'').match(/channel\/(UC[\w-]{20,})/);return m?m[1]:''}
/* Turn anything a user might paste into a real YouTube page URL we can scrape:
   a full link, youtube.com/@handle, @handle, /c/Name, /user/Name, or a bare name. */
function ytTargetUrl(input){
  let s=String(input||'').trim();
  if(!s)return'';
  // explicit @handle with no domain  →  /@handle
  if(/^@[\w.\-]+$/.test(s))return'https://www.youtube.com/'+s;
  // contains a youtube domain already → just ensure a protocol
  if(/(?:^|\.)(?:youtube\.com|youtu\.be)\//i.test(s)||/youtube\.com|youtu\.be/i.test(s)){
    if(!/^https?:\/\//i.test(s))s='https://'+s.replace(/^\/+/,'');
    return s;
  }
  // bare token (no slash / space) → treat as a channel handle
  if(/^[\w.\-]+$/.test(s))return'https://www.youtube.com/@'+s.replace(/^@/,'');
  // some other URL
  if(!/^https?:\/\//i.test(s))s='https://'+s.replace(/^\/+/,'');
  return s;
}
function scanYtChannelId(raw){
  const m=String(raw||'').match(/"(?:channelId|externalId|browseId)":"(UC[\w-]{20,})"/)
    ||raw.match(/itemprop="(?:channelId|identifier)"\s+content="(UC[\w-]{20,})"/)
    ||raw.match(/rel="canonical"[^>]*href="[^"]*channel\/(UC[\w-]{20,})/)
    ||raw.match(/href="[^"]*channel\/(UC[\w-]{20,})"[^>]*rel="canonical"/)
    ||raw.match(/channel\/(UC[\w-]{20,})/);
  return m?m[1]:'';
}
/* YouTube's own resolve_url endpoint maps a handle/custom URL straight to a
   channel id as small JSON — and, unlike the public channel page, it isn't
   gated behind the cookie-consent wall that breaks scraping through proxies.
   Needs a POST, so route it through corsproxy.io (which forwards method+body). */
const YT_INNERTUBE_KEY='AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
async function resolveYtViaApi(pageUrl){
  const target='https://www.youtube.com/youtubei/v1/navigation/resolve_url?key='+YT_INNERTUBE_KEY+'&prettyPrint=false';
  const body=JSON.stringify({context:{client:{clientName:'WEB',clientVersion:'2.20240726.00.00',hl:'en',gl:'US'}},url:pageUrl});
  const wraps=[
    u=>['https://corsproxy.io/?url='+encodeURIComponent(u),{}],
    u=>['https://api.allorigins.win/raw?url='+encodeURIComponent(u),{}]
  ];
  for(const w of wraps){
    try{
      const [pu]=w(target);
      const res=await fetchWithTimeout(pu,{method:'POST',headers:{'Content-Type':'application/json'},body},20000);
      if(!res.ok)continue;
      const txt=await res.text();
      const m=txt.match(/"browseId":"(UC[\w-]{20,})"/)||txt.match(/"(?:channelId|externalId)":"(UC[\w-]{20,})"/);
      if(m)return m[1];
    }catch(e){}
  }
  return'';
}
/* Resolve a handle/name to its UC… channel id. Try the resolve_url API first
   (small, consent-proof), then fall back to scraping the page through every
   proxy and finally the Jina reader. */
async function resolveYtChannelId(url){
  const direct=parseYtChannelId(url);if(direct)return direct;
  const u=ytTargetUrl(url);if(!u)return'';
  const api=await resolveYtViaApi(u);if(api)return api;
  for(const p of PROXIES){
    try{
      const res=await fetchWithTimeout(p(u),{},25000);
      if(!res.ok)continue;
      const raw=await res.text();
      const id=scanYtChannelId(raw);
      if(id)return id;
    }catch(e){}
  }
  try{
    const res=await fetchWithTimeout('https://r.jina.ai/'+u,{},20000);
    if(res.ok){const id=scanYtChannelId(await res.text());if(id)return id}
  }catch(e){}
  return'';
}
async function fetchYtVideos(channelId){
  const raw=await fetchRawAcross('https://www.youtube.com/feeds/videos.xml?channel_id='+channelId,t=>/<entry[\s>]/i.test(t));
  const doc=new DOMParser().parseFromString(raw,'text/xml');
  const entries=[].slice.call(doc.getElementsByTagName('entry'),0,20);
  return entries.map(entry=>{
    const tx=t=>{const n=entry.getElementsByTagName(t)[0];return n?(n.textContent||'').trim():''};
    const videoId=tx('yt:videoId')||tx('videoId');if(!videoId)return null;
    const tn=entry.getElementsByTagName('media:thumbnail')[0];
    const thumb=(tn&&tn.getAttribute('url'))||('https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg');
    return{videoId,title:tx('title'),publishedMs:Date.parse(tx('published'))||0,thumb};
  }).filter(Boolean);
}
function tmin(t){const m=/^(\d{1,2}):(\d{2})/.exec(t||'');return m?(+m[1])*60+(+m[2]):0}
function fmtClock(t){const m=/^(\d{1,2}):(\d{2})/.exec(t||'00:00');if(!m)return t||'';let h=+m[1];const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m[2]+' '+ap}
/* Roll out every slot occurrence across yesterday→tomorrow, then locate, for the
   selected slot, its most recent boundary (≤ now), the previous boundary (window
   start), and the end of its window (next boundary, capped at now). */
function briefWindow(slots,selId,now){
  const sorted=(slots||[]).slice().sort((a,b)=>tmin(a.time)-tmin(b.time));
  if(!sorted.length)return null;
  const nowTs=now.getTime(),occ=[];
  for(let off=-1;off<=1;off++){const d=new Date(now);d.setDate(d.getDate()+off);
    for(const s of sorted){const t=new Date(d);t.setHours(0,0,0,0);t.setMinutes(tmin(s.time));occ.push({slot:s,ts:t.getTime(),date:ymd(t)})}}
  occ.sort((a,b)=>a.ts-b.ts);
  let activeIdx=-1;for(let i=0;i<occ.length;i++)if(occ[i].ts<=nowTs)activeIdx=i;
  const activeSlotId=activeIdx>=0?occ[activeIdx].slot.id:sorted[sorted.length-1].id;
  const sel=selId||activeSlotId;
  let iIdx=-1;for(let i=0;i<occ.length;i++)if(occ[i].slot.id===sel&&occ[i].ts<=nowTs)iIdx=i;
  if(iIdx<0){ // selected slot hasn't occurred yet today → upcoming
    const up=occ.find(o=>o.slot.id===sel&&o.ts>nowTs);
    return{activeSlotId,sel,future:up?up.ts:null,start:0,end:0,key:''};
  }
  const inst=occ[iIdx],prev=occ[iIdx-1],next=occ[iIdx+1];
  return{activeSlotId,sel,future:null,start:prev?prev.ts:0,end:next?Math.min(next.ts,nowTs):nowTs,key:inst.date+'#'+sel,instTs:inst.ts};
}
function tgHandle(url){
  const s=String(url||'').trim().replace(/^@/,'');
  const m=s.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{3,})/i);
  if(m)return m[1];
  if(/^[A-Za-z0-9_]{3,}$/.test(s))return s;
  return'';
}
/* True only for a URL that will actually resolve in a browser — a real host with
   a dot and no stray spaces. Guards against turning a plain name like
   "Diary of a CEO" into a dead link such as "https://Diary of a CEO". */
function isNavigableUrl(u){try{const x=new URL(String(u));return!!x.hostname&&x.hostname.includes('.')&&!/\s/.test(String(u))}catch(e){return false}}
/* Always return a link the routine item can open. If we can't build a real URL
   for the source, fall back to a search on the right platform so tapping the
   item lands on the channel/site instead of nothing. */
function routineOpenUrl(kind,raw,name){
  const q=String(name||raw||'').trim();
  const ytSearch='https://www.youtube.com/results?search_query='+encodeURIComponent(q);
  const webSearch='https://www.google.com/search?q='+encodeURIComponent(q);
  if(kind==='youtube'){
    // trust an explicit @handle or a real youtube.com/youtu.be link; otherwise
    // a guessed handle can 404, so send people to YouTube search results.
    const explicit=/^@[\w.\-]+$/.test(raw)||/youtube\.com|youtu\.be/i.test(raw);
    if(explicit){const u=ytTargetUrl(raw);if(isNavigableUrl(u))return u}
    return ytSearch;
  }
  if(kind==='telegram'){
    const hnd=tgHandle(raw);if(hnd)return'https://t.me/'+hnd;
    const u=normalizeUrl(raw);return isNavigableUrl(u)?u:webSearch;
  }
  const u=normalizeUrl(raw);return isNavigableUrl(u)?u:webSearch;
}
async function fetchTelegram(handle){ // public channel preview at t.me/s/<handle>
  const raw=await fetchRawAcross('https://t.me/s/'+encodeURIComponent(handle),t=>/tgme_widget_message/.test(t));
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const msgs=[].slice.call(doc.querySelectorAll('.tgme_widget_message'));
  return msgs.map(m=>{
    const post=m.getAttribute('data-post')||'';
    const te=m.querySelector('.tgme_widget_message_text');
    let title=te?(te.textContent||'').trim():'';
    const time=m.querySelector('time[datetime]');
    const publishedMs=time?Date.parse(time.getAttribute('datetime'))||0:0;
    let thumb='';const ph=m.querySelector('.tgme_widget_message_photo_wrap,.tgme_widget_message_video_thumb');
    if(ph){const mt=(ph.getAttribute('style')||'').match(/url\(['"]?(.*?)['"]?\)/);if(mt)thumb=mt[1]}
    if(!title)title=thumb?'📷 Media post':'Post';
    return{id:post||String(publishedMs),title:title.slice(0,220),url:post?'https://t.me/'+post:'https://t.me/'+handle,publishedMs,thumb};
  }).filter(e=>e.publishedMs).sort((a,b)=>b.publishedMs-a.publishedMs).slice(0,25);
}
function parseRssText(raw){ // RSS <item> or Atom <entry> — news, blogs, Reddit, bridges
  const doc=new DOMParser().parseFromString(raw,'text/xml');
  let nodes=[].slice.call(doc.getElementsByTagName('item')),atom=false;
  if(!nodes.length){nodes=[].slice.call(doc.getElementsByTagName('entry'));atom=true}
  return nodes.slice(0,25).map(n=>{
    const tx=t=>{const e=n.getElementsByTagName(t)[0];return e?(e.textContent||'').trim():''};
    let link='';
    if(atom){const ls=n.getElementsByTagName('link');for(let i=0;i<ls.length;i++){if((ls[i].getAttribute('rel')||'alternate')==='alternate'){link=ls[i].getAttribute('href')||'';break}}if(!link&&ls[0])link=ls[0].getAttribute('href')||''}
    else link=tx('link')||tx('guid');
    return{id:link||tx('title'),title:(tx('title')||'Untitled').slice(0,220),url:link,publishedMs:Date.parse(tx('pubDate')||tx('published')||tx('updated')||tx('dc:date'))||0,thumb:''};
  }).filter(e=>e.url).sort((a,b)=>b.publishedMs-a.publishedMs);
}
async function fetchRss(url){
  const raw=await fetchRawAcross(url,t=>/<(?:item|entry)[\s>]/i.test(t));
  return parseRssText(raw);
}
/* Fast fetch for feed discovery: race a direct request against every CORS
   proxy in parallel (short timeout each) instead of trying them one at a
   time — trades completeness for speed, since discoverFeed may need to
   probe several candidate URLs before finding a feed. */
async function fetchFast(url,ms){
  ms=ms||9000;
  const attempt=async fetcher=>{
    const res=await fetcher();
    if(!res.ok)throw new Error('http '+res.status);
    const text=await res.text();
    if(!text)throw new Error('empty response');
    return text;
  };
  return await Promise.any([
    attempt(()=>fetchWithTimeout(url,{},ms)),
    ...CORS_PROXIES.map(p=>attempt(()=>fetchWithTimeout(p(url),{},ms)))
  ]);
}
/* Resolve a page-or-feed URL to its best RSS/Atom feed URL for the Blogs section,
   or '' if none can be found (caller then treats it as a homepage bookmark). */
const BLOG_FEED_PATHS=['/feed','/rss.xml','/atom.xml','/index.xml','/feed.xml','/rss','/feeds/posts/default'];
const looksLikeFeed=t=>/<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]|<(?:item|entry)[\s>]/i.test(t||'');
async function discoverFeed(url){
  const base=normalizeUrl(url);
  if(!base)return'';
  let html='';
  try{html=await fetchFast(base)}catch(e){html=''}
  // 1) the pasted URL is already a feed
  if(html&&looksLikeFeed(html)){try{if(parseRssText(html).length)return base}catch(e){}}
  // 2) autodiscover via <link rel="alternate" type="application/rss+xml|atom+xml">
  if(html){
    try{
      const doc=new DOMParser().parseFromString(html,'text/html');
      const links=doc.querySelectorAll('link[rel~="alternate"][type]');
      for(let i=0;i<links.length;i++){
        const type=(links[i].getAttribute('type')||'').toLowerCase();
        if(type.indexOf('rss')>=0||type.indexOf('atom')>=0||type.indexOf('xml')>=0){
          const abs=absUrl(links[i].getAttribute('href')||'',base);
          if(abs)return abs;
        }
      }
    }catch(e){}
  }
  // 3) probe common feed paths — all candidates in parallel, first valid one wins
  let origin='';try{origin=new URL(base).origin}catch(e){origin=''}
  if(origin){
    const settled=await Promise.allSettled(BLOG_FEED_PATHS.map(async p=>{
      const text=await fetchFast(origin+p,7000);
      if(!looksLikeFeed(text)||!parseRssText(text).length)throw new Error('not a feed');
      return origin+p;
    }));
    for(let i=0;i<BLOG_FEED_PATHS.length;i++){
      if(settled[i].status==='fulfilled')return settled[i].value;
    }
  }
  return'';
}
function hasFeed(it){return(it.kind==='youtube'&&it.channelId)||(it.kind==='telegram'&&it.handle)||(it.kind==='rss'&&it.feedUrl)}
async function fetchFeed(it){
  if(it.kind==='youtube'&&it.channelId){const vs=await fetchYtVideos(it.channelId);return vs.map(x=>({id:x.videoId,title:x.title,url:'https://www.youtube.com/watch?v='+x.videoId,publishedMs:x.publishedMs,thumb:x.thumb}))}
  if(it.kind==='telegram'&&it.handle)return await fetchTelegram(it.handle);
  if(it.kind==='rss'&&it.feedUrl)return await fetchRss(it.feedUrl);
  return null;
}
/* Adds a My Routine source from the top-level store updater (used by the AI
   "Add to My Routine" flow, which has no BriefView instance to call into). */
function addBriefSourceViaUpdate(update,f){
  const raw=(f.raw||'').trim();if(!raw)return null;
  const patch={kind:f.kind,channelId:'',handle:'',feedUrl:'',url:''};
  if(f.kind==='youtube'){patch.url=routineOpenUrl('youtube',raw,f.name)}
  else if(f.kind==='telegram'){patch.handle=tgHandle(raw);patch.url=routineOpenUrl('telegram',raw,f.name)}
  else if(f.kind==='rss'){patch.feedUrl=normalizeUrl(raw)||raw;patch.url=isNavigableUrl(patch.feedUrl)?patch.feedUrl:routineOpenUrl('link',raw,f.name)}
  else{patch.url=routineOpenUrl('link',raw,f.name)}
  let ytName='';if(f.kind==='youtube'){const hm=raw.match(/@([\w.\-]+)/)||(/^[\w.\-]+$/.test(raw)&&!/youtu/i.test(raw)?[null,raw]:null);if(hm)ytName='@'+hm[1]}
  patch.name=(f.name||'').trim()||(patch.handle?'@'+patch.handle:'')||ytName||domainOf(patch.url)||'Item';
  const itemId=uid();
  update(d=>({...d,brief:{...d.brief,items:(d.brief.items||[]).concat([{id:itemId,groupId:f.groupId||null,addedAt:Date.now(),...patch}])}}));
  (async()=>{
    let cid='';
    if(f.kind==='youtube'){
      try{cid=await resolveYtChannelId(raw)}catch(e){}
      if(cid)update(d=>({...d,brief:{...d.brief,items:(d.brief.items||[]).map(x=>x.id===itemId?{...x,channelId:cid,url:'https://www.youtube.com/channel/'+cid}:x)}}));
    }
    const probe={kind:patch.kind,channelId:cid,handle:patch.handle,feedUrl:patch.feedUrl};
    if(hasFeed(probe)){try{const es=await fetchFeed(probe);if(es)update(d=>({...d,brief:{...d.brief,feeds:{...(d.brief.feeds||{}),[itemId]:{fetchedAt:Date.now(),entries:es}}}}))}catch(e){}}
  })();
  return{id:itemId,name:patch.name,kind:patch.kind,url:patch.url};
}
/* Ask the AI to turn a free-text description ("Vaibhav Sisinty's YouTube
   channel", a pasted link, "@handle") into a structured source the same
   shape saveItem() expects. Always returns {kind,query,name,group} or
   {error}. */
async function aiResolveSource(S,text){
  const out=await aiChat(S,[
    {role:'system',content:'You turn a short free-text description of a YouTube channel, Telegram channel, X/other social account, website, or RSS feed into a structured source to follow. Respond with ONLY a single-line compact JSON object, no markdown fences, no commentary, of the exact shape: {"kind":"youtube"|"telegram"|"rss"|"link","query":"...","name":"a short clean display name","group":"a short one-or-two-word category guess such as Social, Sports, Tech, News, Podcasts, Finance — empty string if unclear"}. CRITICAL — "query" must be something that opens directly in a browser, never a plain display name: for kind "youtube" give the channel\'s exact @handle (e.g. "@TheDiaryOfACEO") or its full youtube.com URL — never the human-readable name; for kind "telegram" give "@name" or a t.me/name URL; for kind "rss" give the full feed or site URL starting with https://; for kind "link" give the full https:// profile or homepage URL. Use your knowledge to recall the real handle/URL. If the input names a specific X/Instagram/Twitter/WhatsApp account with no usable feed, use kind "link" and query as its full profile URL. If the input is unusable or not a channel/account/site at all, respond with exactly {"error":"short reason"}.'},
    {role:'user',content:text}],300,()=>{});
  const m=out.match(/\{[\s\S]*\}/);
  if(!m)throw new Error('Could not understand that — try rephrasing');
  let obj;try{obj=JSON.parse(m[0])}catch(e){throw new Error('Could not understand that — try rephrasing')}
  if(obj.error)throw new Error(obj.error);
  if(!obj.query||!['youtube','telegram','rss','link'].includes(obj.kind))throw new Error('Could not understand that — try rephrasing');
  return obj;
}
const BRIEF_SLOTS0=[{id:'m',name:'Morning',time:'08:00'},{id:'a',name:'Afternoon',time:'14:00'},{id:'n',name:'Night',time:'20:00'}];
const BRIEF0={groups:[],items:[],slots:BRIEF_SLOTS0.map(s=>({...s})),done:{key:'',ids:[]},feeds:{},yt:{},seen:{}};
function extractFirstUrl(text){const m=String(text||'').match(/https?:\/\/[^\s"'<>]+/);return m?m[0]:''}
function htmlToText(html){const d=document.createElement('div');d.innerHTML=html;return(d.textContent||'').replace(/\s+/g,' ').trim()}
function countWords(text){const t=String(text||'').trim();return t?t.split(/\s+/).length:0}
function readMinutes(words){return Math.max(1,Math.round(words/220))}
function copyText(text){try{navigator.clipboard.writeText(text)}catch(e){try{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta)}catch(e2){}}}
function shareText(title,text,url){if(navigator.share){navigator.share({title:title||'',text:text||'',url:url||undefined}).catch(()=>{})}else{copyText([title,text,url].filter(Boolean).join('\n'))}}
function vibrate(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}
/* Hand a prompt to the Claude app / claude.ai — no API key, uses the user's own
   Claude subscription. On iOS a claude.ai link opens the installed app (else the
   site, already signed in). We also copy the full prompt so if the composer
   doesn't auto-fill, the user can paste it in one tap. */
function openInClaude(prompt,toastFn){
  const text=String(prompt||'').trim();if(!text)return false;
  copyText(text);
  const capped=text.length>1500?text.slice(0,1500)+'\n\n[Full prompt copied to clipboard — paste to continue]':text;
  openExternalUrl('https://claude.ai/new?q='+encodeURIComponent(capped));
  if(toastFn)toastFn('Prompt copied — opening Claude. Paste it if it doesn’t appear.');
  return true;
}

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
  let parts=clean.match(/[^.!?…]+[.!?…]+[""'')\]]*\s*|[^.!?…]+$/g)||[clean];
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

const PROXIES=[u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),u=>'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(u),u=>'https://corsproxy.io/?url='+encodeURIComponent(u)];
/* Fetch a URL through the proxy pool — every proxy races in parallel and the
   first response that passes the `ok` validator wins, so one slow or dead
   proxy no longer stalls the load. The longest failing body is kept as a
   last-resort fallback. */
function fetchRawAcross(url,ok){
  return new Promise((resolve,reject)=>{
    let pending=PROXIES.length,best='',lastErr=null,done=false;
    PROXIES.forEach(async p=>{
      try{
        const res=await fetchWithTimeout(p(url),{},18000);
        if(!res.ok)throw new Error('proxy '+res.status);
        const text=await res.text();
        if(!text)throw new Error('empty proxy response');
        if(!ok||ok(text)){if(!done){done=true;resolve(text)}return}
        if(text.length>best.length)best=text;
        throw new Error('proxy body failed validation');
      }catch(e){if(!lastErr)lastErr=e}
      finally{
        if(--pending===0&&!done){
          if(best)resolve(best);
          else reject(lastErr||new Error('all proxies failed'));
        }
      }
    });
  });
}
function fetchRawHtml(url){return fetchRawAcross(url,t=>t.length>200)}

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

/* ---- social posts (X / Instagram / Telegram) saved as link cards ---- */
const PLATFORM_LABEL={x:'X',instagram:'Instagram',telegram:'Telegram'};
function socialOf(url){
  const u=String(url||'');
  let m;
  if(m=u.match(/(?:^|\/\/)(?:www\.)?(?:x\.com|twitter\.com|nitter\.[^/]+)\/([A-Za-z0-9_]{1,15})\b/i)){
    const h=m[1]; if(/^(home|search|explore|i|messages|notifications|settings|hashtag)$/i.test(h))return{platform:'x',handle:''}; return{platform:'x',handle:h};
  }
  if(/instagram\.com\/(?:p|reel|reels|tv)\//i.test(u))return{platform:'instagram',handle:''};
  if(m=u.match(/instagram\.com\/([A-Za-z0-9_.]{1,40})\/?(?:\?|$)/i))return{platform:'instagram',handle:m[1]};
  if(m=u.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{3,})/i)){
    if(/^(joinchat|s|share|proxy|addstickers)$/i.test(m[1]))return{platform:'telegram',handle:''}; return{platform:'telegram',handle:m[1]};
  }
  return null;
}
/* X / Twitter serves no metadata to browsers or proxies, so status links are
   read through the public fxtwitter / vxtwitter mirror APIs instead — that's
   what gives the WhatsApp-style card its real author, text, and photo. */
function xStatusOf(url){
  const m=String(url||'').match(/(?:\/\/|\.)(?:twitter\.com|x\.com)\/(?:i\/web\/status\/|(?:#!\/)?(\w{1,20})\/status(?:es)?\/)(\d+)/i);
  return m?{user:m[1]||'i',id:m[2]}:null;
}
async function fetchJsonAnyhow(url){
  try{
    const res=await fetchWithTimeout(url,{},15000);
    if(res.ok)return await res.json();
  }catch(e){}
  return JSON.parse(await fetchRawAcross(url,t=>/^\s*[{[]/.test(t)));
}
async function fetchXPost(st){
  let t=null;
  try{const j=await fetchJsonAnyhow('https://api.fxtwitter.com/'+st.user+'/status/'+st.id);t=j&&j.tweet}catch(e){}
  if(!t){
    try{
      const v=await fetchJsonAnyhow('https://api.vxtwitter.com/'+st.user+'/status/'+st.id);
      if(v&&(v.text||v.user_screen_name))t={
        text:v.text,
        author:{name:v.user_name,screen_name:v.user_screen_name,avatar_url:v.user_profile_image_url},
        media:{photos:(v.media_extended||[]).filter(m=>m.type==='image').map(m=>({url:m.url})),
               videos:(v.media_extended||[]).filter(m=>m.type!=='image').map(m=>({thumbnail_url:m.thumbnail_url}))},
        created_timestamp:v.date_epoch
      };
    }catch(e){}
  }
  if(!t)return null;
  const au=t.author||{},media=t.media||{};
  const photo=(media.photos||[])[0],video=(media.videos||[])[0];
  const handle=au.screen_name?'@'+au.screen_name:'';
  return{
    title:au.name&&handle?au.name+' ('+handle+') on X':(au.name||handle||'Post')+' on X',
    image:safeUrl((photo&&photo.url)||(video&&video.thumbnail_url)||au.avatar_url||''),
    desc:String(t.text||'').trim(),
    author:handle||au.name||'',
    publishedAt:t.created_timestamp?t.created_timestamp*1000:0
  };
}
// Best-effort Open Graph metadata for a social link; degrades to an empty card.
async function fetchSocialMeta(url){
  const st=xStatusOf(url);
  if(st){try{const p=await fetchXPost(st);if(p&&(p.title||p.image||p.desc))return p}catch(e){}}
  try{
    const raw=await fetchRawHtml(url);
    const doc=new DOMParser().parseFromString(raw,'text/html');
    const meta=sel=>{const el=doc.querySelector(sel);return el?(el.getAttribute('content')||'').trim():''};
    return{
      title:meta('meta[property="og:title"]')||meta('meta[name="twitter:title"]')||'',
      image:safeUrl(absUrl(meta('meta[property="og:image"]')||meta('meta[name="twitter:image"]')||'',url)),
      desc:meta('meta[property="og:description"]')||meta('meta[name="twitter:description"]')||meta('meta[name="description"]')||''
    };
  }catch(e){return{title:'',image:'',desc:''}}
}

/* returns a full article record (without id/folder) */
async function fetchArticleData(url){
  const vid=ytIdOf(url);
  if(vid){
    const m=await fetchYouTubeMeta(url,vid);
    return{url,title:m.title,source:'YouTube',author:m.author,image:m.image,html:'',text:'',excerpt:m.author?('Video by '+m.author):'Saved video',words:0,readMin:0,isVideo:true,videoId:vid,publishedAt:0};
  }
  const soc=socialOf(url);
  if(soc){
    const label=PLATFORM_LABEL[soc.platform]||'Post';
    const handle=soc.handle?('@'+soc.handle):'';
    const m=await fetchSocialMeta(url);
    return{url,
      title:(m.title||(handle?handle+' on '+label:label+' post')).trim(),
      source:label,author:m.author||handle,
      image:m.image||'',html:'',text:'',
      excerpt:(m.desc||'').slice(0,300).trim(),
      words:0,readMin:0,isVideo:false,videoId:null,
      isPost:true,platform:soc.platform,publishedAt:m.publishedAt||0};
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
/* Maps built-in topic IDs to human-readable search queries used when sources are filtered */
const TOPIC_TO_QUERY={'':'india','WORLD':'world news india','NATION':'india national','BUSINESS':'india business','TECHNOLOGY':'india technology','SCIENCE':'india science','HEALTH':'india health','SPORTS':'india sports','ENTERTAINMENT':'india entertainment'};
/* Preset Indian news sources shown in the Headlines customisation panel */
const PRESET_SOURCES=[
  {domain:'ndtv.com',label:'NDTV',rss:'https://feeds.feedburner.com/ndtvnews-top-stories',epaper:null},
  {domain:'thehindu.com',label:'The Hindu',rss:'https://www.thehindu.com/feeder/default.rss',epaper:'https://epaper.thehindu.com'},
  {domain:'hindustantimes.com',label:'Hindustan Times',rss:'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',epaper:'https://epaper.hindustantimes.com'},
  {domain:'timesofindia.indiatimes.com',label:'Times of India',rss:'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',epaper:'https://epaper.timesofindia.com'},
  {domain:'economictimes.indiatimes.com',label:'Economic Times',rss:'https://economictimes.indiatimes.com/rssfeedstopstories.cms',epaper:'https://epaper.economictimes.com'},
  {domain:'indiatoday.in',label:'India Today',rss:null,epaper:null},
  {domain:'indianexpress.com',label:'Indian Express',rss:'https://indianexpress.com/feed/',epaper:'https://epaper.indianexpress.com'},
  {domain:'livemint.com',label:'Mint',rss:'https://www.livemint.com/rss/news',epaper:'https://epaper.livemint.com'},
  {domain:'business-standard.com',label:'Business Standard',rss:'https://www.business-standard.com/rss/home_page_top_stories.rss',epaper:'https://epaper.business-standard.com'},
  {domain:'thewire.in',label:'The Wire',rss:'https://thewire.in/feed',epaper:null},
  {domain:'scroll.in',label:'Scroll',rss:'https://scroll.in/feed',epaper:null},
  {domain:'theprint.in',label:'The Print',rss:'https://theprint.in/feed/',epaper:null},
  {domain:'moneycontrol.com',label:'MoneyControl',rss:null,epaper:null},
  {domain:'deccanherald.com',label:'Deccan Herald',rss:'https://www.deccanherald.com/rss/national.xml',epaper:'https://epaper.deccanherald.com'},
  {domain:'firstpost.com',label:'Firstpost',rss:'https://www.firstpost.com/rss/',epaper:null},
  {domain:'outlookindia.com',label:'Outlook India',rss:'https://www.outlookindia.com/feed/',epaper:'https://epaper.outlookindia.com'},
  {domain:'zeenews.india.com',label:'Zee News',rss:null,epaper:null},
  {domain:'news18.com',label:'News18',rss:null,epaper:null},
  {domain:'wionews.com',label:'WION',rss:'https://www.wionews.com/rss',epaper:null},
  {domain:'aninews.in',label:'ANI',rss:null,epaper:null},
  {domain:'eenadu.net',label:'Eenadu',rss:null,epaper:'https://epaper.eenadu.net'},
  {domain:'sakshi.com',label:'Sakshi',rss:null,epaper:'https://epaper.sakshi.com'},
  {domain:'andhrajyothy.com',label:'Andhra Jyothi',rss:null,epaper:'https://epaper.andhrajyothy.com'},
];
/* Direct RSS feeds from Indian news outlets — not blocked by proxies unlike Google News */
const DIRECT_FEEDS={
  '':['https://timesofindia.indiatimes.com/rssfeedstopstories.cms','https://www.thehindu.com/feeder/default.rss','https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml'],
  'NATION':['https://timesofindia.indiatimes.com/rssfeeds/296589292.cms','https://www.thehindu.com/news/national/feeder/default.rss'],
  'WORLD':['https://timesofindia.indiatimes.com/rssfeeds/296589297.cms','https://www.thehindu.com/news/international/feeder/default.rss'],
  'BUSINESS':['https://timesofindia.indiatimes.com/rssfeeds/1898055.cms','https://www.thehindu.com/business/feeder/default.rss'],
  'TECHNOLOGY':['https://timesofindia.indiatimes.com/rssfeeds/66949542.cms','https://www.thehindu.com/sci-tech/technology/feeder/default.rss'],
  'SCIENCE':['https://timesofindia.indiatimes.com/rssfeeds/32952.cms','https://www.thehindu.com/sci-tech/science/feeder/default.rss'],
  'HEALTH':['https://timesofindia.indiatimes.com/rssfeeds/3908999.cms'],
  'SPORTS':['https://timesofindia.indiatimes.com/rssfeeds/4719148.cms','https://www.thehindu.com/sport/feeder/default.rss'],
  'ENTERTAINMENT':['https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms'],
};
function briefFeedUrl(region,topic,sources,customQuery){
  const qs='hl='+region.hl+'&gl='+region.gl+'&ceid='+region.ceid;
  const activeSrc=(sources||[]).filter(s=>s.enabled);
  if(activeSrc.length||customQuery){
    const siteStr=activeSrc.map(s=>'site:'+s.domain).join(' OR ');
    const base=customQuery||(TOPIC_TO_QUERY[topic||'']||'india');
    const q=siteStr?base+' ('+siteStr+')':base;
    return'https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&'+qs;
  }
  return topic
    ?'https://news.google.com/rss/headlines/section/topic/'+topic+'?'+qs
    :'https://news.google.com/rss?'+qs;
}
/* Parse any standard RSS/Atom XML into clean headline items. */
function parseGNewsXml(xml,defaultSource){
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  if(doc.querySelector('parsererror'))throw new Error('Could not read the news feed');
  const childText=(parent,tag)=>{const e=parent.getElementsByTagName(tag)[0];return e?e.textContent.trim():''};
  const items=[];
  const nodes=doc.getElementsByTagName('item');
  for(let i=0;i<nodes.length;i++){
    const it=nodes[i];
    const link=childText(it,'link')||childText(it,'guid');
    let title=childText(it,'title');
    if(!link||!title)continue;
    const srcEl=it.getElementsByTagName('source')[0];
    let source=srcEl?srcEl.textContent.trim():defaultSource||'';
    if(source&&title.endsWith(' - '+source))title=title.slice(0,-(source.length+3)).trim();
    else if(!source){const m=title.match(/^(.+) - ([^-]{2,40})$/);if(m){title=m[1].trim();source=m[2].trim()}}
    const pub=childText(it,'pubDate')||childText(it,'updated');
    let publishedAt=0;if(pub){const d=Date.parse(pub);if(!isNaN(d))publishedAt=d}
    items.push({title,url:link,source,publishedAt});
  }
  return items;
}
const CORS_PROXIES=[
  u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
  u=>'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(u),
  u=>'https://corsproxy.io/?url='+encodeURIComponent(u),
  u=>'https://corsproxy.org/?'+encodeURIComponent(u),
  u=>'https://thingproxy.freeboard.io/fetch/'+u,
  u=>'https://api.cors.lol/?url='+encodeURIComponent(u),
  u=>'https://cors-proxy.fringe.zone/'+u,
  u=>'https://proxy.cors.sh/'+u,
];
/* Fetch one RSS URL through the proxy pool. Direct fetch first, then proxies, rss2json last (it caches). */
async function fetchOneFeed(feedUrl,defaultSource){
  /* Cache-bust so proxies re-fetch instead of serving stale content */
  const sep=feedUrl.includes('?')?'&':'?';
  const freshUrl=feedUrl+sep+'_t='+Date.now();
  const parseXml=async text=>{
    if(!text||text.length<100||!text.includes('<item>'))throw new Error('not rss');
    return parseGNewsXml(text,defaultSource);
  };
  const tryDirect=async()=>{
    const res=await fetchWithTimeout(freshUrl,{cache:'no-store'},8000);
    if(!res.ok)throw new Error('direct '+res.status);
    return parseXml(await res.text());
  };
  const tryProxy=async p=>{
    const res=await fetchWithTimeout(p(freshUrl),{},12000);
    if(!res.ok)throw new Error('proxy '+res.status);
    return parseXml(await res.text());
  };
  const tryRss2json=async()=>{
    const res=await fetchWithTimeout('https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(feedUrl)+'&count=30',{},15000);
    if(!res.ok)throw new Error('rss2json '+res.status);
    const json=await res.json();
    if(json.status!=='ok'||!Array.isArray(json.items)||!json.items.length)throw new Error('rss2json empty');
    return json.items.map(it=>{
      let title=it.title||'';const source=it.author||defaultSource||'';
      if(source&&title.endsWith(' - '+source))title=title.slice(0,-(source.length+3)).trim();
      return{title,url:it.link,source,publishedAt:it.pubDate?new Date(it.pubDate).getTime():0};
    }).filter(it=>it.title&&it.url);
  };
  /* Try direct + all proxies in parallel; fall back to rss2json only if all fail */
  try{return await Promise.any([tryDirect(),...CORS_PROXIES.map(p=>tryProxy(p))]);}
  catch(e){return tryRss2json();}
}
/* Fetch headlines: tries direct Indian news RSS feeds first, Google News as fallback. */
/* Drop duplicate stories when several outlets' feeds are merged. Keeps the first
   (most recent, since callers sort by date) of any headlines that normalize equal. */
function dedupeHeadlines(items){
  const seen=new Set(),out=[];
  for(const it of items){
    const key=String(it.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(key&&seen.has(key))continue;
    if(key)seen.add(key);
    out.push(it);
  }
  return out;
}
async function fetchBrief(regionId,topic,sources,customQuery){
  const region=briefRegion(regionId);
  /* Enrich saved source entries that predate the rss: field by merging with PRESET_SOURCES */
  const srcMap=Object.fromEntries(PRESET_SOURCES.map(s=>[s.domain,s]));
  const enriched=(sources||[]).map(s=>s.rss!==undefined?s:{...srcMap[s.domain],...s});
  const activeSrc=enriched.filter(s=>s.enabled);
  /* When specific sources selected: fetch their RSS feeds directly */
  if(activeSrc.length&&!customQuery){
    const rssSrcs=activeSrc.filter(s=>s.rss);
    if(rssSrcs.length){
      const settled=await Promise.allSettled(rssSrcs.map(s=>fetchOneFeed(s.rss,s.label)));
      const all=[];
      settled.forEach(r=>{if(r.status==='fulfilled')all.push(...r.value)});
      if(all.length){
        all.sort((a,b)=>b.publishedAt-a.publishedAt);
        return dedupeHeadlines(all).slice(0,40);
      }
    }
    /* No RSS-capable sources among selection — fall through to default feeds */
  }
  /* Custom query: use Google News search */
  if(customQuery){
    const feedUrl=briefFeedUrl(region,topic,sources,customQuery);
    let items;
    try{items=await fetchOneFeed(feedUrl,'Google News')}
    catch(e){throw new Error('Could not load headlines — check your connection and try again')}
    if(!items.length)throw new Error('No stories found');
    return items;
  }
  /* Default: fetch all direct feeds in parallel and merge results */
  const directUrls=DIRECT_FEEDS[topic||'']||DIRECT_FEEDS[''];
  const sourceNames={'timesofindia.indiatimes.com':'Times of India','thehindu.com':'The Hindu','hindustantimes.com':'Hindustan Times'};
  const getSrc=u=>{const h=Object.keys(sourceNames).find(k=>u.includes(k));return sourceNames[h]||''};
  const settled=await Promise.allSettled(directUrls.map(u=>fetchOneFeed(u,getSrc(u))));
  const all=[];
  settled.forEach(r=>{if(r.status==='fulfilled')all.push(...r.value)});
  if(all.length){
    all.sort((a,b)=>b.publishedAt-a.publishedAt);
    return dedupeHeadlines(all).slice(0,40);
  }
  throw new Error('Could not load headlines — check your connection and try again');
}
/* headlines cache — the brief shows instantly from the last fetch and refreshes in the background */
const BRIEF_TTL=20*60*1000;
function briefCacheKey(regionId,sources){
  const en=(sources||[]).filter(s=>s.enabled).map(s=>s.domain).sort().join(',');
  return'brief_v2:'+(regionId||'IN')+':'+(en||'default');
}
function readBriefCache(regionId,sources){
  try{
    const c=JSON.parse(localStorage.getItem(briefCacheKey(regionId,sources))||'null');
    if(c&&Array.isArray(c.items)&&c.items.length)return c;
  }catch(e){}
  return null;
}
function writeBriefCache(regionId,sources,items){
  try{localStorage.setItem(briefCacheKey(regionId,sources),JSON.stringify({at:Date.now(),items}))}catch(e){}
}
/* cached-first load used by the story circles on Home */
async function loadBriefCached(regionId,sources){
  const c=readBriefCache(regionId,sources);
  if(c&&Date.now()-c.at<BRIEF_TTL)return c.items;
  try{
    const items=await fetchBrief(regionId,'',sources,null);
    writeBriefCache(regionId,sources,items);
    return items;
  }catch(e){
    if(c)return c.items; // stale headlines beat a spinner
    throw e;
  }
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
  d.siteFolders=Array.isArray(d.siteFolders)?d.siteFolders:[];
  d.feeds=Array.isArray(d.feeds)?d.feeds:[];
  d.feeds.forEach(f=>{if(typeof f.groupId==='undefined')f.groupId=null});
  d.blogGroups=Array.isArray(d.blogGroups)?d.blogGroups:[];
  if(!d.blogFeeds||typeof d.blogFeeds!=='object')d.blogFeeds={};
  if(!d.blogSeen||typeof d.blogSeen!=='object')d.blogSeen={};
  // Threads — topic timelines that mix notes, links, images & saved articles,
  // optionally auto-fed by an RSS source. entries are stored newest-first.
  d.threads=Array.isArray(d.threads)?d.threads:[];
  d.threads.forEach(t=>{t.entries=Array.isArray(t.entries)?t.entries:[]});
  if(!d.threadFeeds||typeof d.threadFeeds!=='object')d.threadFeeds={};
  if(!d.threadSeen||typeof d.threadSeen!=='object')d.threadSeen={};
  d.vault=d.vault&&d.vault.ct?d.vault:null;
  if(!d.brief||typeof d.brief!=='object')d.brief={};
  d.brief.groups=Array.isArray(d.brief.groups)?d.brief.groups:[];
  d.brief.items=Array.isArray(d.brief.items)?d.brief.items:[];
  if(!d.brief.seeded&&!d.brief.items.length){ // first run: seed a Social group
    const gid=uid(),now=Date.now();
    d.brief.groups=[{id:gid,name:'Social'}].concat(d.brief.groups);
    d.brief.items=[['YouTube','https://www.youtube.com'],['Telegram','https://web.telegram.org'],['Instagram','https://www.instagram.com'],['X','https://x.com'],['WhatsApp','https://web.whatsapp.com']]
      .map((s,i)=>({id:uid(),groupId:gid,kind:'link',name:s[0],url:s[1],channelId:'',addedAt:now+i}));
  }
  d.brief.seeded=true;
  if(!Array.isArray(d.brief.slots)||!d.brief.slots.length)d.brief.slots=BRIEF_SLOTS0.map(s=>({...s}));
  d.brief.done=normalizeDone(d.brief.done);
  if(!d.brief.yt||typeof d.brief.yt!=='object')d.brief.yt={};
  if(!d.brief.feeds||typeof d.brief.feeds!=='object')d.brief.feeds={};
  if(!d.seeded){d.articles.unshift(makeSeed());d.seeded=true}
  return d;
}

/* ============================== media store (IndexedDB) ============================== */
/* Photos & files are far too large for localStorage, so their blobs + metadata live
   in IndexedDB. This subsystem is intentionally separate from the article store and is
   NOT included in the backup export (see Settings). */
const MEDIA_DB='instapaper-media',MEDIA_VER=1;
let _mediaDB=null;
function mediaDB(){
  if(_mediaDB)return _mediaDB;
  _mediaDB=new Promise((res,rej)=>{
    let r;try{r=indexedDB.open(MEDIA_DB,MEDIA_VER)}catch(e){return rej(e)}
    r.onupgradeneeded=e=>{const db=e.target.result;
      if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'id'});
      if(!db.objectStoreNames.contains('albums'))db.createObjectStore('albums',{keyPath:'id'});
    };
    r.onsuccess=e=>res(e.target.result);
    r.onerror=()=>rej(r.error);
  });
  return _mediaDB;
}
function idbAll(store){return mediaDB().then(db=>new Promise((res,rej)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)}))}
function idbPut(store,val){return mediaDB().then(db=>new Promise((res,rej)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(val);t.oncomplete=()=>res(val);t.onerror=()=>rej(t.error)}))}
function idbDel(store,id){return mediaDB().then(db=>new Promise((res,rej)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).delete(id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)}))}

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
  calendar:s=>Svg({size:s},h('rect',{x:3.5,y:5,width:17,height:15,rx:2.2,stroke:'currentColor',strokeWidth:1.7}),P('M3.5 9.5h17M8 3.2v3.6M16 3.2v3.6')),
  sun:s=>Svg({size:s},h('circle',{cx:12,cy:12,r:4.2,stroke:'currentColor',strokeWidth:1.7}),P('M12 2.6v2.4M12 19v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.6 12h2.4M19 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7')),
  flame:s=>Svg({size:s},h('path',{d:'M12 2.5c.7 2.6-.8 4-2 5.2C8.8 9 7.8 10.6 7.8 12.6a4.2 4.2 0 0 0 8.4 0c0-1.2-.4-2.3-1.1-3.2 1 .4 1.8 1.2 2.2 2.5C18.4 8.7 16.5 5.2 12 2.5Z',fill:'currentColor',stroke:'none'})),
  bell:(s,fill)=>Svg({size:s},h('path',{d:'M6 9.5a6 6 0 0 1 12 0c0 4.5 1.2 5.8 1.8 6.5H4.2C4.8 15.3 6 14 6 9.5Z',fill:fill?'currentColor':'none',stroke:'currentColor',strokeWidth:1.7,strokeLinejoin:'round'}),P('M10 19.5a2 2 0 0 0 4 0')),
  chart:s=>Svg({size:s},P('M4 4v16h16'),h('rect',{x:7,y:11,width:3,height:6,rx:1,fill:'currentColor'}),h('rect',{x:12,y:8,width:3,height:9,rx:1,fill:'currentColor'}),h('rect',{x:17,y:5,width:3,height:12,rx:1,fill:'currentColor'})),
  newspaper:s=>Svg({size:s},P('M4 5.5h12.5v13H5.3c-.7 0-1.3-.6-1.3-1.3V5.5Z'),P('M16.5 8.5H19c.6 0 1 .4 1 1v7.7c0 .7-.6 1.3-1.3 1.3'),P('M6.8 8.5h6.9M6.8 11.5h6.9M6.8 14.5h4.4')),
  phone:s=>Svg({size:s},h('rect',{x:6.5,y:2.5,width:11,height:19,rx:2.6,stroke:'currentColor',strokeWidth:1.7}),P('M10.5 18.6h3')),
  send:s=>Svg({size:s},h('path',{d:'M21 4 3 11l6 2.4L11 20l3.2-4.6L21 4Z',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinejoin:'round'}),P('M21 4 9.4 13.4')),
  rss:s=>Svg({size:s},h('circle',{cx:6,cy:18,r:1.6,fill:'currentColor'}),P('M5 11.5a7.5 7.5 0 0 1 7.5 7.5M5 5.5a13.5 13.5 0 0 1 13.5 13.5')),
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
  image:s=>Svg({size:s},h('rect',{x:3.5,y:4.5,width:17,height:15,rx:2.4,stroke:'currentColor',strokeWidth:1.7}),h('circle',{cx:8.5,cy:9.5,r:1.6,stroke:'currentColor',strokeWidth:1.5}),P('M4 16.5 9 12l3.5 3 3-2.5 4.5 4')),
  camera:s=>Svg({size:s},P('M3.5 8.5c0-1 .8-1.8 1.8-1.8h2L9 4.5h6L16.7 6.7h2c1 0 1.8.8 1.8 1.8v9c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8v-9Z'),h('circle',{cx:12,cy:12.5,r:3.4,stroke:'currentColor',strokeWidth:1.7})),
  file:s=>Svg({size:s},P('M6.5 4c0-.8.7-1.5 1.5-1.5h5l4 4V20c0 .8-.7 1.5-1.5 1.5H8c-.8 0-1.5-.7-1.5-1.5V4Z'),P('M13 2.5V6.5h4')),
  pin:(s,fill)=>Svg({size:s},h('path',{d:'M9 3.5h6l-.8 5 2.8 3.2H7l2.8-3.2-.8-5Z',fill:fill?'currentColor':'none',stroke:'currentColor',strokeWidth:1.6,strokeLinejoin:'round'}),P('M12 11.7V20')),
  crop:s=>Svg({size:s},P('M6.5 2.5v15h15'),P('M2.5 6.5h15v15')),
  rotate:s=>Svg({size:s},P('M20 11a8 8 0 1 0-2.3 5.6'),P('M20 5v6h-6')),
  drag:s=>Svg({size:s},h('circle',{cx:8,cy:7,r:1.5,fill:'currentColor'}),h('circle',{cx:16,cy:7,r:1.5,fill:'currentColor'}),h('circle',{cx:8,cy:12,r:1.5,fill:'currentColor'}),h('circle',{cx:16,cy:12,r:1.5,fill:'currentColor'}),h('circle',{cx:8,cy:17,r:1.5,fill:'currentColor'}),h('circle',{cx:16,cy:17,r:1.5,fill:'currentColor'})),
  news:s=>Svg({size:s},P('M4 6.2C4 5.5 4.5 5 5.2 5h11.6c.7 0 1.2.5 1.2 1.2V18a1.8 1.8 0 0 0 1.8 1.8H6.8A2.8 2.8 0 0 1 4 17V6.2Z'),P('M7 8.5h7M7 12h7M7 15.5h4'),P('M18 9.5h1.5c.6 0 1 .4 1 1V18')),
  thread:s=>Svg({size:s},h('circle',{cx:6,cy:6,r:2.2,stroke:'currentColor',strokeWidth:1.7}),h('circle',{cx:6,cy:18,r:2.2,stroke:'currentColor',strokeWidth:1.7}),P('M6 8.2v7.6'),P('M11 6h9M11 18h9M11 12h6')),
  star:(s,fill)=>Svg({size:s},h('path',{d:'M12 3.6l2.5 5.1 5.6.8-4.05 3.95.96 5.6L12 16.4l-5.01 2.65.96-5.6L3.9 9.5l5.6-.8L12 3.6Z',stroke:'currentColor',strokeWidth:1.6,strokeLinejoin:'round',fill:fill?'currentColor':'none'})),
  mute:s=>Svg({size:s},P('M4.5 9.5v5h3l4 3.5v-12l-4 3.5h-3Z'),P('M15.5 9.5l4 5M19.5 9.5l-4 5'))
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

/* AssistiveTouch-style quick-action grid (the restyled "+" popup) */
function TouchGrid({onClose,actions,anchorBottom}){
  return h('div',{style:{position:'fixed',inset:0,zIndex:75}},
    h('div',{onClick:onClose,className:'fdin',style:{position:'absolute',inset:0,background:'rgba(0,0,0,.3)'}}),
    h('div',{className:'ppin',style:{position:'fixed',right:14,bottom:anchorBottom,
      width:'min(78vw,300px)',background:'rgba(40,40,44,.92)',backdropFilter:'blur(22px)',WebkitBackdropFilter:'blur(22px)',
      border:'1px solid rgba(255,255,255,.08)',borderRadius:24,padding:'16px 8px 12px',boxShadow:'0 16px 50px rgba(0,0,0,.5)',
      display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'2px'}},
      actions.map((a,i)=>h('button',{key:i,onClick:()=>{onClose();a.onClick()},className:'act90 trt',
        style:{display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'10px 2px',color:'#fff'}},
        h('span',{style:{width:46,height:46,borderRadius:'50%',background:'rgba(255,255,255,.15)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}},a.icon),
        h('span',{style:{fontSize:10.5,fontWeight:500,textAlign:'center',lineHeight:1.15,color:'rgba(255,255,255,.9)',maxWidth:74}},a.label)))));
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
function ArticleRow({a,T,scopeType,onOpen,onLongPress,onSwipeLeft,onSwipeRight,selecting,selected,onToggleSelect,snippet,disabledSelect,onMarkDone}){
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
  if(a.isPost)footer='Open post';
  else if(a.isVideo)footer=done?'Watched':'Video';
  else if(done)footer='Completed';
  else if(prog>0.01)footer=Math.round(prog*100)+'% · '+a.readMin+' min read';
  else footer=a.words?a.readMin+' min read':'Saved link';
  const metaLine=[a.source,a.author?('by '+a.author):''].filter(Boolean).join(' · ');
  const isCard=!!(a.isPost&&a.image); // social posts with media render as a WhatsApp-style rich card

  // eenadu-style card: headline + right thumbnail + meta only — no body/excerpt text.
  return h('div',{style:{position:'relative',padding:'5px 12px',background:T.bg,overflow:'hidden'}},
    dx!==0?h('div',{style:{position:'absolute',top:5,bottom:5,left:12,right:12,borderRadius:13,display:'flex',alignItems:'center',justifyContent:dx<0?'flex-end':'flex-start',padding:'0 22px',background:dx<0?leftAction.bg:'#d4564a',color:'#fff',fontSize:14,fontWeight:600}},dx<0?leftAction.label:(a.liked?'Unlike':'Like')):null,
    h('div',{onTouchStart:start,onTouchMove:move,onTouchEnd:end,onMouseDown:start,onMouseMove:e=>{if(e.buttons)move(e)},onMouseUp:end,onMouseLeave:clearLp,onClick:click,onContextMenu:e=>{e.preventDefault();if(!selecting)onLongPress()},
      style:{display:'flex',gap:12,padding:isCard?0:'13px 14px',borderRadius:13,border:'1px solid '+T.hair,background:T.card,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.05)',transform:'translateX('+dx+'px)',transition:drag.current.lock==='h'?'none':'transform 220ms cubic-bezier(.2,.9,.2,1)',touchAction:'pan-y',cursor:'pointer',opacity:selecting&&disabledSelect?0.35:1}},
      selecting?h('div',{style:{display:'flex',alignItems:'center',color:selected?T.accent:T.sub,flexShrink:0,paddingLeft:isCard?12:0}},Icons.checkCircle(24,selected)):null,
      isCard?h('div',{style:{flex:1,minWidth:0}},
        h('img',{src:a.image,alt:'',loading:'lazy',style:{width:'100%',aspectRatio:'1.91 / 1',objectFit:'cover',display:'block',background:T.thumbBg},onError:e=>{e.target.style.display='none'}}),
        h('div',{style:{padding:'11px 14px 12px'}},
          h('div',{style:{fontSize:15.5,fontWeight:650,lineHeight:1.35,color:T.fg,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title),
          snippet?h('div',{style:{fontSize:13.5,color:T.meta,lineHeight:1.45,marginTop:4,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},snippet):null,
          h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:9,fontSize:12,color:T.sub}},
            h('span',{style:{display:'flex'}},Icons.link(13)),
            h('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},domainOf(a.url)||a.source),
            h('span',{style:{flexShrink:0,color:T.accent,fontWeight:600}},timeAgo(a.addedAt)),
            a.pinned?h('span',{style:{color:T.accent,display:'flex',flexShrink:0}},Icons.pin(12,true)):null,
            a.liked?h('span',{style:{color:'#d4564a',display:'flex'}},Icons.heart(12,true)):null,
            a.tags.slice(0,2).map(t=>h('span',{key:t,style:{color:T.accent,flexShrink:0}},'#'+t))
          )
        )
      ):h('div',{style:{flex:1,minWidth:0,display:'flex',flexDirection:'column',justifyContent:'space-between'}},
        h('div',null,
          h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:16.5,fontWeight:600,lineHeight:1.32,color:T.fg,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title),
          snippet?h('div',{style:{fontSize:13,color:T.meta,lineHeight:1.45,marginTop:5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},snippet):null),
        h('div',null,
          h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:7,fontSize:11.5,color:T.sub}},
            metaLine?h('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'55%'}},metaLine):null,
            a.addedAt?h('span',{style:{whiteSpace:'nowrap',color:T.accent,fontWeight:600}},timeAgo(a.addedAt)):null,
            a.pinned?h('span',{style:{color:T.accent,display:'flex'}},Icons.pin(12,true)):null,
            a.liked?h('span',{style:{color:'#d4564a',display:'flex'}},Icons.heart(12,true)):null,
            h('span',{style:{whiteSpace:'nowrap'}},footer),
            a.highlights.length?h('span',{style:{display:'flex',alignItems:'center',gap:3}},Icons.highlight(12),String(a.highlights.length)):null,
            a.tags.slice(0,2).map(t=>h('span',{key:t,style:{color:T.accent}},'#'+t))
          ),
          !done&&prog>0.01?h('div',{style:{height:2.5,background:T.hair,borderRadius:2,marginTop:7,overflow:'hidden',maxWidth:120}},h('div',{style:{height:'100%',width:(prog*100)+'%',background:T.sub,borderRadius:2}})):null)
      ),
      !isCard&&(a.image||a.isVideo)?h('div',{style:{width:92,height:72,borderRadius:8,background:T.thumbBg,flexShrink:0,position:'relative',overflow:'hidden',alignSelf:'center'}},
        a.image?h('img',{src:a.image,alt:'',loading:'lazy',style:{width:'100%',height:'100%',objectFit:'cover',display:'block'},onError:e=>{e.target.style.display='none'}}):null,
        a.isVideo?h('div',{style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}},
          h('div',{style:{width:30,height:30,borderRadius:'50%',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',paddingLeft:2}},Icons.play(15,true))):null,
        a.isVideo&&onMarkDone?h('button',{onTouchStart:e=>e.stopPropagation(),onTouchEnd:e=>{e.stopPropagation();onMarkDone()},onMouseDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();onMarkDone()},style:{position:'absolute',bottom:3,right:3,padding:0,width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',color:done?T.accent:'rgba(255,255,255,.9)',filter:done?'none':'drop-shadow(0 1px 2px rgba(0,0,0,.6))'}},Icons.checkCircle(20,done)):null
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

function Sidebar({T,scope,folders,onScope,onClose,onFolderLongPress,onBrowse,onSettings}){
  const is=(t,id)=>scope.type===t&&(id===undefined||scope.id===id);
  const go=(t,id)=>{onScope({type:t,id});onClose()};
  const [q,setQ]=useState('');
  const m=s=>!q.trim()||(s||'').toLowerCase().includes(q.trim().toLowerCase());
  const NAV=[
    {key:'search',icon:Icons.search(22),label:'Search',active:is('search'),onClick:()=>go('search')},
    {key:'home',icon:Icons.home(22),label:'Home',active:is('home'),onClick:()=>go('home')},
    {key:'liked',icon:Icons.heart(22),label:'Liked',active:is('liked'),onClick:()=>go('liked')},
    {key:'archive',icon:Icons.archive(22),label:'Archive',active:is('archive'),onClick:()=>go('archive')},
    {key:'photos',icon:Icons.image(22),label:'Photos',active:is('photos'),onClick:()=>go('photos')},
    {key:'notes',icon:Icons.notes(22),label:'Notes',active:is('notes'),onClick:()=>go('notes')},
    {key:'threads',icon:Icons.thread(22),label:'Threads',active:is('threads'),onClick:()=>go('threads')},
    {key:'tags',icon:Icons.tag(22),label:'Tags',active:is('tags'),onClick:()=>go('tags')},
    {key:'settings',icon:Icons.gear(22),label:'Settings',active:false,onClick:()=>{onClose();onSettings()}}
  ];
  const navF=NAV.filter(n=>m(n.label));
  const foldersF=folders.filter(f=>m(f.name));
  const noMatch=q.trim()&&!navF.length&&!foldersF.length;
  return h('div',{style:{position:'fixed',inset:0,zIndex:60}},
    h('div',{onClick:onClose,className:'fdin',style:{position:'absolute',inset:0,background:T.overlay}}),
    h('div',{className:'slid',style:{position:'absolute',top:0,bottom:0,left:0,width:'min(82vw, 330px)',background:T.bg,color:T.fg,display:'flex',flexDirection:'column',boxShadow:'8px 0 40px rgba(0,0,0,.25)'}},
      h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',padding:'calc(8px + '+SAFE_T+') 10px 6px'}},
        h('button',{onClick:onClose,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.menu(24))),
      h('div',{style:{flexShrink:0,padding:'2px 14px 8px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:9,background:T.search,borderRadius:11,padding:'9px 12px'}},
          h('span',{style:{color:T.sub,display:'flex'}},Icons.search(17)),
          h('input',{value:q,onChange:e=>setQ(e.target.value),placeholder:'Search menu',autoCapitalize:'none',autoCorrect:'off',
            style:{flex:1,border:'none',background:'transparent',color:T.fg,fontSize:15.5,minWidth:0}}),
          q?h('button',{onClick:()=>setQ(''),className:'act90',style:{color:T.sub,display:'flex',padding:2}},Icons.x(16)):null)),
      h('div',{className:'sy',style:{flex:1,overflowY:'auto'}},
        navF.map(n=>h(SidebarItem,{key:n.key,T,icon:n.icon,label:n.label,active:n.active,onClick:n.onClick})),
        foldersF.map(f=>h(FolderItem,{key:f.id,T,folder:f,active:is('folder',f.id),onClick:()=>go('folder',f.id),onLongPress:()=>onFolderLongPress(f)})),
        noMatch?h('div',{style:{padding:'18px 22px',color:T.sub,fontSize:14}},'No matches'):null,
        h('div',{style:{height:'calc(20px + '+SAFE_B+')'}})
      )
    ));
}

/* ============================== collapsible group header ============================== */
function CollapsibleGroup({T,label,badge,children,defaultOpen}){
  const [open,setOpen]=useState(defaultOpen!==false);
  return h('div',null,
    h('button',{onClick:()=>setOpen(o=>!o),className:'act98',style:{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'12px 16px',textAlign:'left',background:T.card,borderBottom:'1px solid '+T.hair,color:T.fg}},
      h('span',{style:{display:'flex',color:T.sub,transform:open?'rotate(90deg)':'none',transition:'transform 180ms'}},Icons.chevR(15)),
      h('span',{style:{flex:1,fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},label),
      badge>0?h('span',{style:{background:T.accent,color:'#fff',borderRadius:10,padding:'1px 7px',fontSize:11.5,fontWeight:700,minWidth:20,textAlign:'center',flexShrink:0}},String(badge)):null
    ),
    open?children:null);
}

/* ============================== My Routine (Videos grouped by channel) ============================== */
function MyRoutine({T,videos,onOpen,onLongPress,onMarkDone,onSwipeLeft,onSwipeRight,selectState,onToggleSelect}){
  const channels=useMemo(()=>{
    const map=new Map();
    videos.forEach(v=>{const k=v.source||'Other';if(!map.has(k))map.set(k,[]);map.get(k).push(v)});
    return[...map.entries()].map(([name,vids])=>({name,videos:vids,newCount:vids.filter(v=>(v.progress||0)<0.97).length}));
  },[videos]);
  return h('div',null,channels.map(ch=>h(CollapsibleGroup,{key:ch.name,T,label:ch.name,badge:ch.newCount},
    ch.videos.map(v=>h(ArticleRow,{key:v.id,a:v,T,scopeType:'videos',
      onOpen:()=>onOpen(v.id),onLongPress:()=>onLongPress(v.id),
      onMarkDone:()=>onMarkDone(v.id,(v.progress||0)>=0.97?0:1),
      onSwipeLeft:()=>onSwipeLeft(v),onSwipeRight:()=>onSwipeRight(v),
      selecting:!!selectState,selected:selectState?selectState.ids.includes(v.id):false,
      disabledSelect:selectState&&selectState.mode==='playlist'&&(v.isVideo||!v.text),
      onToggleSelect:()=>onToggleSelect(v.id)}))
  )));
}

/* ============================== Grouped Archive / History ============================== */
function GroupedArchive({T,articles,onOpen,onLongPress,onSwipeLeft,onSwipeRight,selectState,onToggleSelect}){
  const groups=useMemo(()=>{
    const d=new Date();d.setHours(0,0,0,0);const today=d.getTime();
    const buckets=[
      {key:'today',label:'Today',items:[]},
      {key:'yesterday',label:'Yesterday',items:[]},
      {key:'week',label:'This week',items:[]},
      {key:'month',label:'This month',items:[]},
      {key:'older',label:'Older',items:[]}
    ];
    articles.forEach(a=>{
      const t=a.addedAt||0;
      if(t>=today)buckets[0].items.push(a);
      else if(t>=today-86400000)buckets[1].items.push(a);
      else if(t>=today-6*86400000)buckets[2].items.push(a);
      else if(t>=today-29*86400000)buckets[3].items.push(a);
      else buckets[4].items.push(a);
    });
    return buckets.filter(b=>b.items.length);
  },[articles]);
  return h('div',null,groups.map((g,i)=>h(CollapsibleGroup,{key:g.key,T,label:g.label,badge:0,defaultOpen:i===0},
    g.items.map(a=>h(ArticleRow,{key:a.id,a,T,scopeType:'archive',
      onOpen:()=>onOpen(a.id),onLongPress:()=>onLongPress(a.id),
      onSwipeLeft:()=>onSwipeLeft(a),onSwipeRight:()=>onSwipeRight(a),
      selecting:!!selectState,selected:selectState?selectState.ids.includes(a.id):false,
      disabledSelect:selectState&&selectState.mode==='playlist'&&(a.isVideo||!a.text),
      onToggleSelect:()=>onToggleSelect(a.id)}))
  )));
}

/* ============================== ooo menu ============================== */
const SORTS=[['newest','Newest first'],['oldest','Oldest first'],['longest','Longest'],['shortest','Shortest'],['popular','Most popular'],['title','Title A–Z']];
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

/* ============================== note to self (WhatsApp "message yourself") ============================== */
function QuickNoteSheet({T,onSave,onClose}){
  const [text,setText]=useState('');
  return h(Sheet,{T,onClose,title:'Note to self'},
    h('div',{style:{padding:'4px 20px 0'}},
      h('textarea',{value:text,onChange:e=>setText(e.target.value),rows:6,autoFocus:true,
        placeholder:'Jot down a thought, an idea, a quote — it’s saved like an article, searchable and readable offline.',
        style:{width:'100%',padding:'13px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15.5,lineHeight:1.55,resize:'vertical',fontFamily:"'Lora',Georgia,serif",minHeight:150}}),
      h('div',{style:{fontSize:11.5,color:T.sub,marginTop:8,lineHeight:1.5}},'Formatting: **bold** · *italic* · # heading · - list · blank line = new paragraph')),
    h(PrimaryBtn,{T,label:'Save note',disabled:!text.trim(),onClick:()=>onSave(text.trim())}));
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
  const norm=t=>String(t||'').trim().replace(/^#/,'').toLowerCase().replace(/\s+/g,'-');
  const add=t=>{t=norm(t);if(t&&!tags.includes(t))setTags([...tags,t]);setInput('')};
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
    h(PrimaryBtn,{T,label:'Save',onClick:()=>{const t=norm(input);onSave(t&&!tags.includes(t)?[...tags,t]:tags)}}));
}

function ConfirmSheet({T,title,message,confirmLabel,onConfirm,onClose}){
  return h(Sheet,{T,onClose,title},
    message?h('div',{style:{padding:'2px 20px 4px',fontSize:14.5,color:T.meta,lineHeight:1.5}},message):null,
    h(PrimaryBtn,{T,label:confirmLabel,danger:true,onClick:onConfirm}),
    h('button',{onClick:onClose,className:'act98',style:{display:'block',width:'100%',padding:'14px',marginTop:4,color:T.meta,fontSize:15.5,fontWeight:500,textAlign:'center'}},'Cancel'));
}

/* ============================== article action sheet ============================== */
function ArticleSheet({T,a,reading,onAction,onClose}){
  const act=k=>()=>onAction(k);
  return h(Sheet,{T,onClose},
    h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair}},
      h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:17,fontWeight:600,lineHeight:1.3}},a.title),
      h('div',{style:{fontSize:12.5,color:T.sub,marginTop:3}},a.source||'')),
    h(ARow,{T,icon:Icons.checkCircle(21,(a.progress||0)>=0.97),label:(a.progress||0)>=0.97?(a.isVideo?'Mark as unwatched':'Mark as unread'):(a.isVideo?'Mark as watched':'Mark as read'),onClick:act('read')}),
    h(ARow,{T,icon:Icons.search(21),label:reading?'Search in article':'Search',sub:reading?'Find words in this article':'Search all your articles, posts and videos',onClick:act('search')}),
    h(ARow,{T,icon:Icons.pin(21,a.pinned),label:a.pinned?'Unpin':'Pin to top',onClick:act('pin')}),
    h(ARow,{T,icon:Icons.heart(21,a.liked),label:a.liked?'Unlike':'Like',onClick:act('like')}),
    h(ARow,{T,icon:Icons.archive(21),label:a.archived?'Move to Home':'Archive',onClick:act('archive')}),
    h(ARow,{T,icon:Icons.folder(21),label:'Move to folder…',onClick:act('move')}),
    h(ARow,{T,icon:Icons.tag(21),label:'Edit tags…',onClick:act('tags')}),
    h(ARow,{T,icon:Icons.calendar(21),label:'Edit date',sub:a.addedAt?('Saved '+fmtDate(a.addedAt)):'Set the saved date',onClick:act('date')}),
    !a.isVideo&&a.text?h(ARow,{T,icon:Icons.headphones(21),label:'Listen',sub:'Text-to-speech',onClick:act('listen')}):null,
    !a.isVideo&&a.text?h(ARow,{T,icon:Icons.bolt(21),label:'Speed read',sub:'Up to 3× faster',onClick:act('speed')}):null,
    !a.isVideo&&a.html?h(ARow,{T,icon:Icons.pencil(21),label:'Edit content',sub:'Remove unwanted parts or edit the text',onClick:act('edit')}):null,
    !a.isVideo&&a.text?h(ARow,{T,icon:Icons.ai(21),label:'AI assist',sub:'Summarize · Translate · Rewrite · Ask',onClick:act('ai')}):null,
    a.isVideo?h(ARow,{T,icon:Icons.ai(21),label:'AI assist',sub:'Summarize · Transcript · Ask · Listen',onClick:act('ai')}):null,
    h(ARow,{T,icon:Icons.share(21),label:'Share…',onClick:act('share')}),
    a.url?h(ARow,{T,icon:Icons.copy(21),label:'Copy link',onClick:act('copy')}):null,
    a.url?h(ARow,{T,icon:Icons.globe(21),label:'Open original',onClick:act('open')}):null,
    h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:act('delete')}));
}

function DateSheet({T,article,onClose,onSave}){
  const pad=n=>String(n).padStart(2,'0');
  const init=article.addedAt?new Date(article.addedAt):new Date();
  const [val,setVal]=useState(init.getFullYear()+'-'+pad(init.getMonth()+1)+'-'+pad(init.getDate()));
  return h(Sheet,{T,onClose,title:'Edit date'},
    h('div',{style:{padding:'4px 20px calc(18px + '+SAFE_B+')'}},
      h('div',{style:{fontSize:13,color:T.sub,marginBottom:12,lineHeight:1.45}},'The date this entry shows as saved on. Changing it also re-sorts the list when sorted by date.'),
      h('input',{type:'date',value:val,onChange:e=>setVal(e.target.value),
        style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:14}}),
      h('button',{onClick:()=>{const d=val?new Date(val+'T12:00:00'):null;onSave(d&&!isNaN(d.getTime())?d.getTime():(article.addedAt||Date.now()))},className:'act96',
        style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},'Save date')));
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
      h('button',{onClick:()=>{shareText('',('"'+hl.text+'"')+(note?'\n\n'+note:''),article.url)},className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.share(20),'Share'),
      h('button',{onClick:()=>{copyText('"'+hl.text+'"'+(article.url?' — '+article.url:''))},className:'act95',style:{color:T.meta,display:'flex',flexDirection:'column',alignItems:'center',gap:4,fontSize:11.5}},Icons.copy(20),'Copy'),
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
function fixReaderMedia(root){
  // Scraped article HTML often carries fixed pixel widths (old <table> layouts,
  // embed <iframe>s, <img width="900">) that force horizontal scroll on a phone.
  // Bootstrap's img-fluid/table-responsive utilities are built exactly for this.
  if(!root)return;
  root.querySelectorAll('img,video').forEach(el=>{
    el.classList.add('img-fluid');
    el.loading='lazy';el.decoding='async';
  });
  root.querySelectorAll('iframe,embed,object').forEach(el=>el.classList.add('w-100'));
  root.querySelectorAll('table').forEach(t=>{
    if(t.parentElement&&t.parentElement.classList.contains('table-responsive'))return;
    const wrap=document.createElement('div');
    wrap.className='table-responsive';
    t.parentNode.insertBefore(wrap,t);
    wrap.appendChild(t);
  });
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
function Reader({a,T,S,patch,onAction,toastFn,addHighlight,onHighlightTap,onRetry,findReq}){
  const scrollRef=useRef(null),contentRef=useRef(null);
  const [aaOpen,setAaOpen]=useState(false);
  const [selbar,setSelbar]=useState(null);
  const [retrying,setRetrying]=useState(false);
  const [find,setFind]=useState(null); // {q} — find-in-article bar
  const [findPos,setFindPos]=useState({count:0,idx:0});
  const findMarks=useRef([]);
  const [blockPopup,setBlockPopup]=useState(null); // {el,top,left} — long-pressed a non-text block (image/embed/table)
  const blockPress=useRef({t:null,x:0,y:0,el:null});
  const restored=useRef(null),lastSaved=useRef(a.progress||0);
  const pendingProgress=useRef(null),progressTimer=useRef(null);

  // the top-level child of contentRef (a "block") that contains a given node — same
  // unit EditBlocksSheet works on, so removing one here stays consistent with that flow.
  const findBlockEl=node=>{
    const root=contentRef.current;
    let el=node;
    while(el&&el.nodeType!==1)el=el.parentNode;
    while(el&&el!==root&&el.parentNode!==root)el=el.parentNode;
    return(el&&el!==root)?el:null;
  };
  const removeBlockEl=blockEl=>{
    const root=contentRef.current;
    if(!root||!blockEl)return;
    const html=Array.from(root.children).filter(c=>c!==blockEl).map(c=>c.outerHTML).join('\n');
    const text=htmlToText(html);
    if(!text){toastFn("Can't remove the last block");return}
    const words=countWords(text);
    patch({html,text,excerpt:text.slice(0,220),words,readMin:readMinutes(words)});
    toastFn('Block removed');
  };
  // mode: 'above' keeps blockEl and everything after it; 'below' keeps blockEl and everything before it —
  // same range-clear EditBlocksSheet's long-press menu offers, for junk lists (e.g. a wall of "Gold Rate…"
  // links) that need clearing in bulk rather than one block at a time.
  const removeBlockRange=(blockEl,mode)=>{
    const root=contentRef.current;
    if(!root||!blockEl)return;
    const children=Array.from(root.children);
    const idx=children.indexOf(blockEl);
    if(idx<0)return;
    const kept=mode==='above'?children.slice(idx):children.slice(0,idx+1);
    const html=kept.map(c=>c.outerHTML).join('\n');
    const text=htmlToText(html);
    if(!text){toastFn("That would remove everything — not saved");return}
    const words=countWords(text);
    patch({html,text,excerpt:text.slice(0,220),words,readMin:readMinutes(words)});
    toastFn(mode==='above'?'Removed everything above':'Removed everything below');
  };

  useEffect(()=>()=>{ // flush any pending progress write when switching articles or closing
    clearTimeout(progressTimer.current);
    if(pendingProgress.current!=null){patch({progress:pendingProgress.current});pendingProgress.current=null}
  },[a.id]);

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

  useEffect(()=>{ // tame oversized scraped media, then re-anchor highlights
    const el=contentRef.current;
    if(el&&a.html){fixReaderMedia(el);applyHighlights(el,a.highlights)}
  },[a.id,a.html,a.highlights]);

  useEffect(()=>{ // selection toolbar
    let t=null;
    const onSel=()=>{clearTimeout(t);t=setTimeout(()=>{
      const sel=window.getSelection();
      if(sel&&!sel.isCollapsed&&sel.rangeCount&&contentRef.current&&contentRef.current.contains(sel.anchorNode)){
        const text=sel.toString().replace(/\s+/g,' ').trim();
        if(text.length>1){
          const r=sel.getRangeAt(0).getBoundingClientRect();
          setSelbar({top:Math.max(r.top-56,56),left:clamp(r.left+r.width/2,110,window.innerWidth-110),text,blockEl:findBlockEl(sel.anchorNode)});
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
    if(blockPopup)setBlockPopup(null);
    const max=el.scrollHeight-el.clientHeight;
    const p=max>0?clamp(el.scrollTop/max,0,1):1;
    if(Math.abs(p-lastSaved.current)>0.02||(p>=0.97&&lastSaved.current<0.97)){
      lastSaved.current=p;
      // debounce the actual (app-wide) state write until the scroll gesture settles —
      // writing on every threshold tick forces a full app re-render mid-scroll, fighting
      // the browser's native momentum scrolling and making it feel stuttery.
      pendingProgress.current=p;
      clearTimeout(progressTimer.current);
      progressTimer.current=setTimeout(()=>{patch({progress:pendingProgress.current});pendingProgress.current=null},300);
    }
  };

  /* ---------- find in article ---------- */
  const clearFinds=()=>{
    const root=contentRef.current;
    findMarks.current=[];
    if(!root)return;
    root.querySelectorAll('mark.fnd').forEach(m=>{const p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});
    root.normalize();
  };
  const gotoMatch=(i,marks)=>{
    const ms=marks||findMarks.current;
    ms.forEach((m,j)=>m.classList.toggle('cur',j===i));
    const m=ms[i],el=scrollRef.current;
    if(m&&el){
      const r=m.getBoundingClientRect(),er=el.getBoundingClientRect();
      el.scrollTo({top:el.scrollTop+r.top-er.top-er.height*0.35,behavior:'smooth'});
    }
  };
  const runFind=q=>{
    clearFinds();
    const root=contentRef.current;
    if(!root||!q||q.trim().length<2){setFindPos({count:0,idx:0});return}
    const needle=q.trim().toLowerCase();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
    const texts=[];let n;
    while((n=walker.nextNode()))texts.push(n);
    const marks=[];
    for(const node of texts){
      if(marks.length>=200)break;
      let t=node;
      while(t&&marks.length<200){
        const i=t.nodeValue.toLowerCase().indexOf(needle);
        if(i<0)break;
        const hit=t.splitText(i);
        t=hit.splitText(needle.length);
        const m=document.createElement('mark');
        m.className='fnd';
        hit.parentNode.insertBefore(m,hit);
        m.appendChild(hit);
        marks.push(m);
      }
    }
    findMarks.current=marks;
    setFindPos({count:marks.length,idx:0});
    if(marks.length)gotoMatch(0,marks);
  };
  const navFind=dir=>{
    const c=findPos.count;if(!c)return;
    const i=(findPos.idx+dir+c)%c;
    setFindPos(s=>({...s,idx:i}));
    gotoMatch(i);
  };
  const closeFind=()=>{clearFinds();setFind(null);setFindPos({count:0,idx:0})};
  useEffect(()=>{if(findReq)setFind(f=>f||{q:''})},[findReq]);
  useEffect(()=>{ // debounce the actual DOM walk while typing
    if(!find)return;
    const t=setTimeout(()=>runFind(find.q),250);
    return()=>clearTimeout(t);
  },[find&&find.q]);
  useEffect(()=>{setFind(null);setFindPos({count:0,idx:0});findMarks.current=[]},[a.id]); // reset when switching articles
  useEffect(()=>{setBlockPopup(null);setSelbar(null)},[a.id,a.html]); // stale block/selection refs after content changes

  const clearSel=()=>{try{window.getSelection().removeAllRanges()}catch(e){}setSelbar(null)};
  const selAct=kind=>{
    const text=selbar.text;
    if(kind==='hl')addHighlight(text,false);
    else if(kind==='note')addHighlight(text,true);
    else if(kind==='copy'){copyText(text);toastFn('Copied')}
    else if(kind==='share')shareText(a.title,'"'+text+'"',a.url);
    else if(kind==='remove')removeBlockEl(selbar.blockEl);
    clearSel();
  };

  /* long-press a block with no selectable text (image/embed/table/divider) to remove it directly */
  const clearBlockPress=()=>{if(blockPress.current.t){clearTimeout(blockPress.current.t);blockPress.current.t=null}};
  const startBlockPress=e=>{
    const t=e.touches?e.touches[0]:e;
    blockPress.current.x=t.clientX;blockPress.current.y=t.clientY;
    blockPress.current.el=findBlockEl(e.target);
    clearBlockPress();
    if(!blockPress.current.el)return;
    blockPress.current.t=setTimeout(()=>{
      const sel=window.getSelection();
      if(sel&&!sel.isCollapsed)return; // text selection already claimed this press — let Highlight/Note/Copy/Remove win instead
      const el=blockPress.current.el;
      vibrate(10);
      const r=el.getBoundingClientRect();
      setBlockPopup({el,top:Math.max(r.top-134,56),left:clamp(r.left+r.width/2,110,window.innerWidth-110)});
    },480);
  };
  const moveBlockPress=e=>{
    if(!e.touches)return;
    const t=e.touches[0];
    if(Math.abs(t.clientX-blockPress.current.x)>10||Math.abs(t.clientY-blockPress.current.y)>10)clearBlockPress();
  };

  const doRetry=async()=>{setRetrying(true);try{await onRetry()}catch(e){toastFn('Still couldn\'t download this page')}setRetrying(false)};

  const tb=(icon,onClick,opts)=>h('button',{onClick,className:'act90 trt',style:Object.assign({},iconBtnS,{color:(opts&&opts.color)||T.fg})},icon);
  const heroDupe=a.image&&a.html&&a.html.indexOf(escapeHtml(a.image))>-1;
  const metaBits=[a.source,a.author?'by '+a.author:'',a.publishedAt?'on '+fmtDate(a.publishedAt):''].filter(Boolean).join(' · ');

  return h('div',{style:{position:'fixed',inset:0,zIndex:40,background:T.bg,color:T.fg,display:'flex',flexDirection:'column'},className:'fdin'},
    h('div',{style:{position:'absolute',top:0,left:0,right:0,height:'calc(2px + '+SAFE_T+')',zIndex:5,background:T.bg}},
      h('div',{style:{position:'absolute',bottom:0,left:0,height:2,width:((a.progress||0)*100)+'%',background:T.sub,transition:'width 300ms'}})),
    find?h('div',{className:'fdin',style:{position:'absolute',top:'calc(8px + '+SAFE_T+')',left:10,right:10,zIndex:45,display:'flex',alignItems:'center',gap:6,background:T.menuBg,border:'1px solid '+T.hair,borderRadius:12,padding:'6px 10px',boxShadow:'0 8px 30px rgba(0,0,0,.28)'}},
      h('span',{style:{display:'flex',color:T.sub,flexShrink:0}},Icons.search(16)),
      h('input',{autoFocus:true,value:find.q,onChange:e=>setFind({q:e.target.value}),placeholder:'Find in article',enterKeyHint:'search',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
        onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();navFind(1)}else if(e.key==='Escape')closeFind()},
        style:{flex:1,minWidth:0,border:'none',background:'transparent',color:T.menuFg||T.fg,fontSize:16,padding:'4px 0'}}),
      h('span',{style:{fontSize:12.5,color:T.sub,flexShrink:0,minWidth:34,textAlign:'center'}},findPos.count?((findPos.idx+1)+'/'+findPos.count):(find.q.trim().length>1?'0/0':'')),
      h('button',{onClick:()=>navFind(-1),'aria-label':'Previous match',className:'act90',style:{display:'flex',color:findPos.count?(T.menuFg||T.fg):T.sub,padding:5,transform:'rotate(-90deg)'}},Icons.chevR(18)),
      h('button',{onClick:()=>navFind(1),'aria-label':'Next match',className:'act90',style:{display:'flex',color:findPos.count?(T.menuFg||T.fg):T.sub,padding:5,transform:'rotate(90deg)'}},Icons.chevR(18)),
      h('button',{onClick:closeFind,'aria-label':'Close find bar',className:'act90',style:{display:'flex',color:T.sub,padding:5}},Icons.x(18))):null,
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
          onTouchStart:startBlockPress,onTouchMove:moveBlockPress,onTouchEnd:clearBlockPress,
          onMouseDown:startBlockPress,onMouseUp:clearBlockPress,onMouseLeave:clearBlockPress,
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
      [['Highlight','hl'],['Note','note'],['Copy','copy'],['Share','share']].concat(selbar.blockEl?[['Remove','remove']]:[]).map(([l,k],i)=>h('button',{key:k,onClick:()=>selAct(k),style:{padding:'11px 14px',color:k==='remove'?'#ff6b5c':'#f2f2f3',fontSize:13.5,fontWeight:500,borderLeft:i?'1px solid #3a3a3f':'none'}},l))):null,
    blockPopup?h(Fragment,null,
      h('div',{onClick:()=>setBlockPopup(null),style:{position:'fixed',inset:0,zIndex:65}}),
      h('div',{className:'fdin',style:{position:'fixed',top:blockPopup.top,left:blockPopup.left,transform:'translateX(-50%)',zIndex:66,minWidth:200,background:'#26262a',borderRadius:12,overflow:'hidden',boxShadow:'0 6px 24px rgba(0,0,0,.35)'}},
        [['Remove above',()=>removeBlockRange(blockPopup.el,'above'),h('span',{style:{display:'flex',transform:'rotate(-90deg)'}},Icons.chevR(15))],
         ['Remove this block',()=>removeBlockEl(blockPopup.el),Icons.trash(15)],
         ['Remove below',()=>removeBlockRange(blockPopup.el,'below'),h('span',{style:{display:'flex',transform:'rotate(90deg)'}},Icons.chevR(15))]
        ].map(([l,fn,icon],i)=>h('button',{key:l,onClick:()=>{fn();setBlockPopup(null)},
          style:{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 14px',color:'#ff6b5c',fontSize:13.5,fontWeight:500,borderTop:i?'1px solid #3a3a3f':'none',textAlign:'left'}},
          icon,l)))):null,
    h('div',{style:{position:'absolute',bottom:0,left:0,right:0,display:'flex',alignItems:'center',justifyContent:'space-around',background:T.bg,borderTop:'1px solid '+T.hair,padding:'5px 6px calc(5px + '+SAFE_B+')'}},
      tb(Icons.back(23),()=>onAction('close')),
      tb(Icons.heart(23,a.liked),()=>onAction('like'),{color:a.liked?'#d4564a':T.fg}),
      tb(Icons.archive(23),()=>onAction('archive')),
      h('button',{onClick:()=>setAaOpen(!aaOpen),className:'act90 trt',style:Object.assign({},iconBtnS,{color:T.fg,fontFamily:'Georgia,serif',fontSize:19,fontWeight:500})},'Aa'),
      (a.isVideo||a.text)?tb(Icons.ai(23),()=>onAction('ai')):null,
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
  else if(/[.!?…][""')\]]*$/.test(word))m*=2.3;
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
function HeadlinesConfig({T,initCats,initSrcs,onSave,onClose}){
  const [tab,setTab]=useState('cats');
  const [cats,setCats]=useState(initCats);
  const [srcs,setSrcs]=useState(initSrcs);
  const [newLabel,setNewLabel]=useState('');
  const [newQuery,setNewQuery]=useState('');
  const [newDomain,setNewDomain]=useState('');
  const [newSrcLabel,setNewSrcLabel]=useState('');
  const [newEpaper,setNewEpaper]=useState('');
  const toggleCat=id=>setCats(cs=>cs.map(c=>c.id===id?{...c,enabled:!c.enabled}:c));
  const deleteCat=id=>setCats(cs=>cs.filter(c=>c.id!==id));
  const addCat=()=>{const nm=newLabel.trim();if(!nm)return;setCats(cs=>cs.concat([{id:'custom_'+uid(),label:nm,enabled:true,custom:true,query:newQuery.trim()||nm}]));setNewLabel('');setNewQuery('')};
  const toggleSrc=d=>setSrcs(ss=>ss.map(s=>s.domain===d?{...s,enabled:!s.enabled}:s));
  const deleteSrc=d=>setSrcs(ss=>ss.filter(s=>s.domain!==d));
  const addSrc=()=>{const raw=newDomain.trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();if(!raw)return;const l=newSrcLabel.trim()||raw;if(srcs.find(s=>s.domain===raw))return;const ep=newEpaper.trim()||null;setSrcs(ss=>ss.concat([{domain:raw,label:l,enabled:true,custom:true,epaper:ep}]));setNewDomain('');setNewSrcLabel('');setNewEpaper('')};
  const save=()=>{onSave({headlinesCategories:cats,headlinesSources:srcs});onClose()};
  const tabBtn=(label,key)=>h('button',{onClick:()=>setTab(key),className:'act95',style:{flex:1,padding:'9px',borderRadius:11,fontSize:14,fontWeight:600,border:'none',background:tab===key?T.fg:T.card,color:tab===key?T.bg:T.sub}},label);
  const toggle=(on,onClick)=>h('button',{onClick,className:'act90',style:{width:44,height:26,borderRadius:13,background:on?T.accent:T.hair,position:'relative',flexShrink:0,padding:0,display:'flex',alignItems:'center',transition:'background .2s'}},
    h('div',{style:{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',left:on?20:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.25)'}}));
  const inp=(val,set,ph,opts)=>h('input',Object.assign({value:val,onChange:e=>set(e.target.value),placeholder:ph,style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'10px 12px',fontSize:14.5,marginBottom:8,boxSizing:'border-box'}},opts||{}));
  return h(Sheet,{T,title:'Customise Headlines',maxH:'94%',onClose},
    h('div',{style:{display:'flex',gap:8,padding:'0 16px 10px'}},tabBtn('Categories','cats'),tabBtn('Sources','srcs')),
    tab==='cats'?h('div',null,
      h('div',{style:{padding:'0 16px 8px',fontSize:12.5,color:T.sub,lineHeight:1.5}},'Toggle categories or add custom ones (e.g. "Cricket", "Politics").'),
      cats.map(c=>h('div',{key:c.id,style:{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',borderBottom:'1px solid '+T.hair}},
        h('div',{style:{flex:1}},
          h('div',{style:{fontSize:15,color:T.fg}},c.label),
          c.custom&&c.query&&c.query!==c.label?h('div',{style:{fontSize:11.5,color:T.sub,marginTop:1}},c.query):null),
        c.custom?h('button',{onClick:()=>deleteCat(c.id),className:'act90',style:{display:'flex',color:T.danger,padding:4,marginRight:2}},Icons.trash(17)):null,
        toggle(c.enabled,()=>toggleCat(c.id)))),
      h('div',{style:{padding:'14px 16px',borderTop:'1px solid '+T.hair}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:T.sub,marginBottom:8}},'Add category'),
        inp(newLabel,setNewLabel,'Name  (e.g. Cricket)'),
        inp(newQuery,setNewQuery,'Search query — optional, defaults to name'),
        h('button',{onClick:addCat,disabled:!newLabel.trim(),className:'act96',style:{width:'100%',padding:'11px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:600,opacity:newLabel.trim()?1:0.4}},'Add category')))
    :h('div',null,
      h('div',{style:{padding:'0 16px 8px',fontSize:12.5,color:T.sub,lineHeight:1.5}},'Select news channels to filter by. When none are on, all sources are shown.'),
      srcs.map(s=>h('div',{key:s.domain,style:{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',borderBottom:'1px solid '+T.hair}},
        h('div',{style:{flex:1}},
          h('div',{style:{fontSize:15,color:T.fg}},s.label),
          h('div',{style:{display:'flex',alignItems:'center',gap:6,marginTop:2,flexWrap:'wrap'}},
            h('a',{href:'https://'+s.domain,target:'_blank',rel:'noopener noreferrer',style:{display:'flex',alignItems:'center',gap:2,color:T.sub,fontSize:11.5,textDecoration:'none'},onClick:e=>e.stopPropagation()},
              s.domain,Icons.external(11)),
            s.epaper?h('a',{href:s.epaper,target:'_blank',rel:'noopener noreferrer',style:{display:'flex',alignItems:'center',gap:2,color:T.accent,fontSize:11.5,fontWeight:500,textDecoration:'none'},onClick:e=>e.stopPropagation()},
              'ePaper',Icons.external(11)):h('span',{style:{display:'flex',alignItems:'center',gap:2,color:T.sub,fontSize:11.5,opacity:.6}},'No ePaper'))),
        s.custom?h('button',{onClick:()=>deleteSrc(s.domain),className:'act90',style:{display:'flex',color:T.danger,padding:4,marginRight:2}},Icons.trash(17)):null,
        toggle(s.enabled,()=>toggleSrc(s.domain)))),
      h('div',{style:{padding:'14px 16px',borderTop:'1px solid '+T.hair}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:T.sub,marginBottom:8}},'Add source'),
        inp(newDomain,setNewDomain,'Domain  (e.g. theprint.in)',{inputMode:'url',autoCapitalize:'none',autoCorrect:'off'}),
        inp(newSrcLabel,setNewSrcLabel,'Display name  (e.g. The Print)'),
        inp(newEpaper,setNewEpaper,'ePaper URL  (optional)',{inputMode:'url',autoCapitalize:'none',autoCorrect:'off'}),
        h('button',{onClick:addSrc,disabled:!newDomain.trim(),className:'act96',style:{width:'100%',padding:'11px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:600,opacity:newDomain.trim()?1:0.4}},'Add source'))),
    h('div',{style:{padding:'16px',flexShrink:0}},
      h('button',{onClick:save,className:'act96',style:{width:'100%',padding:'13px',borderRadius:12,background:T.accent,color:'#fff',fontSize:15,fontWeight:600}},'Save changes')));
}
/* stable key + colour-coded round avatar for a publisher/source name */
const srcKey=s=>String(s||'').trim().toLowerCase();
const SRC_COLORS=['#c0392b','#2980b9','#27ae60','#8e44ad','#d35400','#16a085','#2c3e50','#c2185b','#00838f','#6d4c41'];
function srcColor(name){const s=srcKey(name);let n=0;for(let i=0;i<s.length;i++)n=(n*31+s.charCodeAt(i))>>>0;return SRC_COLORS[n%SRC_COLORS.length]}
function SrcAvatar({name,size}){
  const s=size||34;
  return h('span',{style:{width:s,height:s,borderRadius:'50%',flexShrink:0,background:srcColor(name),color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:WORDMARK,fontSize:s*0.46,fontWeight:600}},(String(name||'N').trim()[0]||'N').toUpperCase());
}
/* one headline row — colour avatar, source + time, title; long-press to star/mute the source */
function BriefStoryRow({T,it,busy,dim,starred,onOpen,onLongPress}){
  const lp=useLongPress(onLongPress);
  return h('div',{style:{padding:'5px 12px'}},
    h('button',Object.assign({onClick:onOpen},lp,{className:'act98',
      style:{display:'flex',gap:12,width:'100%',textAlign:'left',padding:'14px 14px 13px',borderRadius:13,border:'1px solid '+T.hair,background:T.card,boxShadow:'0 1px 3px rgba(0,0,0,.05)',color:T.fg,alignItems:'flex-start',opacity:dim?0.5:1}}),
      h(SrcAvatar,{name:it.source,size:34}),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:6,marginBottom:4,fontSize:11.5,color:T.sub,overflow:'hidden'}},
          it.source?h('span',{style:{fontWeight:600,color:T.meta,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'58%'}},it.source):null,
          starred?h('span',{style:{color:'#e2a600',display:'flex',flexShrink:0}},Icons.star(11,true)):null,
          it.source&&it.publishedAt?h('span',null,'·'):null,
          it.publishedAt?h('span',{style:{flexShrink:0,color:T.accent,fontWeight:600}},timeAgo(it.publishedAt)):null),
        h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:16.5,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},it.title)),
      h('div',{style:{flexShrink:0,width:22,display:'flex',justifyContent:'center',paddingTop:8,color:T.sub}},
        busy?h(Spinner,{T,size:17}):Icons.download(18))));
}
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
function DailyBrief({T,regionId,onConfig,onOpenItem,showRegion=true,headlinesCategories,headlinesSources,starred,muted,onOpenUrl}){
  const [items,setItems]=useState(null);
  const [err,setErr]=useState('');
  const [busyUrl,setBusyUrl]=useState('');
  const [configOpen,setConfigOpen]=useState(false);
  const [srcAction,setSrcAction]=useState(null); // source name for the star/mute sheet
  const [briefTab,setBriefTab]=useState('sources');
  const starList=starred||[],muteList=muted||[];
  const sset=new Set(starList.map(srcKey)),mset=new Set(muteList.map(srcKey));
  const toggleStar=name=>{const k=srcKey(name);onConfig({briefStarred:sset.has(k)?starList.filter(x=>srcKey(x)!==k):starList.concat([name])})};
  const toggleMute=name=>{const k=srcKey(name);onConfig({briefMuted:mset.has(k)?muteList.filter(x=>srcKey(x)!==k):muteList.concat([name])})};
  const reqRef=useRef(0);
  const allCats=headlinesCategories||BRIEF_CATEGORIES.map(c=>({...c,enabled:true,custom:false,query:''}));
  // saved source lists can predate fields (like epaper) later added to PRESET_SOURCES —
  // backfill those from the current master list without touching the user's own choices.
  const allSrcs=(headlinesSources||PRESET_SOURCES.map(s=>({...s,enabled:false,custom:false}))).map(s=>{
    const m=PRESET_SOURCES.find(p=>p.domain===s.domain);
    return m?{...s,rss:s.rss!=null?s.rss:m.rss,epaper:s.epaper!=null?s.epaper:m.epaper}:s;
  });
  const enabledSrcs=allSrcs.filter(s=>s.enabled);
  const load=useCallback(force=>{
    const id=++reqRef.current;
    setErr('');
    // cached headlines show instantly; the network refresh happens behind them
    const c=readBriefCache(regionId,headlinesSources);
    setItems(c?c.items:null);
    if(c&&Date.now()-c.at<BRIEF_TTL&&!force)return;
    fetchBrief(regionId,'',headlinesSources,null)
      .then(r=>{writeBriefCache(regionId,headlinesSources,r);if(id===reqRef.current)setItems(r)})
      .catch(e=>{if(id===reqRef.current&&!c){setErr((e&&e.message)||'Could not load the brief');setItems([])}});
  },[regionId,headlinesSources]);
  useEffect(()=>{load(false)},[load]);
  const region=briefRegion(regionId);
  const open=async it=>{if(busyUrl)return;setBusyUrl(it.url);try{await onOpenItem(it)}finally{setBusyUrl('')}};
  const openUrl=url=>{if(onOpenUrl)onOpenUrl(url)};
  let newsBody;
  if(items===null){
    newsBody=h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:'70px 40px',color:T.meta}},
      h(Spinner,{T,size:24}),
      h('div',{style:{fontSize:14}},'Gathering today\'s '+region.label+' headlines…'));
  }else if(err){
    newsBody=h('div',{style:{padding:'60px 40px',textAlign:'center',color:T.sub}},
      h('div',{style:{display:'flex',justifyContent:'center',marginBottom:14,opacity:.5}},Icons.newspaper(40)),
      h('div',{style:{fontSize:16.5,fontWeight:600,color:T.meta,marginBottom:6}},'Couldn\'t load the brief'),
      h('div',{style:{fontSize:13.5,lineHeight:1.5,marginBottom:18}},err+'. Check your connection and try again.'),
      h('button',{onClick:load,className:'act95',style:{display:'inline-flex',alignItems:'center',gap:8,padding:'11px 22px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:600}},Icons.refresh(17),'Try again'));
  }else{
    // hide muted publishers; float starred publishers to the top (stable within each group)
    const visible=items.filter(it=>!mset.has(srcKey(it.source)));
    const ordered=[...visible.filter(it=>sset.has(srcKey(it.source))),...visible.filter(it=>!sset.has(srcKey(it.source)))];
    newsBody=ordered.length?h('div',{style:{padding:'5px 0'}},
      ordered.map((it,i)=>h(BriefStoryRow,{key:it.url+i,T,it,busy:busyUrl===it.url,dim:busyUrl&&busyUrl!==it.url,
        starred:sset.has(srcKey(it.source)),onOpen:()=>open(it),onLongPress:()=>it.source&&setSrcAction(it.source)})),
      h('div',{style:{padding:'16px 24px 8px',textAlign:'center',fontSize:11.5,color:T.sub,lineHeight:1.5}},
        'Tap a story to save it · long-press to star ★ or mute a source. Headlines via Google News.'))
    :h('div',{style:{padding:'54px 40px',textAlign:'center',color:T.sub}},
      h('div',{style:{display:'flex',justifyContent:'center',marginBottom:12,opacity:.5}},Icons.newspaper(38)),
      h('div',{style:{fontSize:15.5,fontWeight:600,color:T.meta,marginBottom:6}},'Everything here is muted'),
      h('div',{style:{fontSize:13,lineHeight:1.5}},'Long-press a story and un-mute its source to see headlines again.'));
  }
  const sourcesBody=enabledSrcs.length===0
    ?h('div',{style:{padding:'60px 40px',textAlign:'center',color:T.sub}},
        h('div',{style:{display:'flex',justifyContent:'center',marginBottom:14,opacity:.5}},Icons.newspaper(40)),
        h('div',{style:{fontSize:16,fontWeight:600,color:T.meta,marginBottom:6}},'No sources selected'),
        h('div',{style:{fontSize:13.5,lineHeight:1.5}},'Tap the settings icon above to choose your preferred news sources.'))
    :h('div',null,
        enabledSrcs.map(s=>h('div',{key:s.domain,style:{display:'flex',alignItems:'center',gap:12,padding:'15px 16px',borderBottom:'1px solid '+T.hair}},
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontSize:15.5,fontWeight:600,color:T.fg,marginBottom:5}},s.label),
            h('div',{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
              h('button',{onClick:()=>openUrl('https://'+s.domain),className:'act95',
                style:{display:'inline-flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,background:T.card,color:T.meta,fontSize:12.5,fontWeight:500}},
                Icons.globe(13),'Website'),
              s.epaper?h('button',{onClick:()=>openUrl(s.epaper),className:'act95',
                style:{display:'inline-flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,background:T.card,color:T.accent,fontSize:12.5,fontWeight:500}},
                Icons.external(13),'ePaper'):h('span',{
                style:{display:'inline-flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,background:T.card,color:T.sub,fontSize:12.5,fontWeight:500,opacity:.6}},
                Icons.external(13),'No ePaper'))))));
  const tabBar=h('div',{style:{display:'flex',borderBottom:'1px solid '+T.hair}},
    [['Top Stories','stories'],['Sources','sources']].map(([label,key])=>{
      const active=briefTab===key;
      return h('button',{key,onClick:()=>setBriefTab(key),className:'act95',
        style:{flex:1,padding:'11px 8px',fontSize:14,fontWeight:active?600:500,
          color:active?T.accent:T.sub,background:'none',border:'none',
          borderBottom:'2px solid '+(active?T.accent:'transparent'),
          marginBottom:-1,transition:'color .15s,border-color .15s'}},label);
    }));
  return h('div',null,
    h(BriefStories,{T,S:{briefRegion:regionId},sources:headlinesSources||null,onRead:onOpenItem}),
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'2px 16px 8px',flexShrink:0}},
      showRegion?h('div',{style:{flex:1,fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},'Region'):h('div',{style:{flex:1}}),
      h('button',{onClick:()=>setConfigOpen(true),className:'act90 trt',style:Object.assign({},iconBtnS,{width:34,height:34,color:T.fg}),title:'Customise'},Icons.gear(18)),
      h('button',{onClick:()=>load(true),disabled:items===null,className:'act90 trt',style:Object.assign({},iconBtnS,{width:34,height:34,color:T.fg,opacity:items===null?0.4:1}),title:'Refresh'},Icons.refresh(18))),
    showRegion?h(BriefChips,{T,options:BRIEF_REGIONS,selected:regionId,onSelect:id=>onConfig({briefRegion:id})}):null,
    tabBar,
    h('div',null,briefTab==='stories'?newsBody:sourcesBody),
    configOpen?h(HeadlinesConfig,{T,initCats:allCats,initSrcs:allSrcs,onSave:onConfig,onClose:()=>setConfigOpen(false)}):null,
    srcAction?(()=>{const isStar=sset.has(srcKey(srcAction)),isMuted=mset.has(srcKey(srcAction));
      return h(Sheet,{T,onClose:()=>setSrcAction(null)},
        h('div',{style:{display:'flex',alignItems:'center',gap:12,padding:'4px 20px 14px',borderBottom:'1px solid '+T.hair}},
          h(SrcAvatar,{name:srcAction,size:38}),
          h('div',{style:{fontSize:16.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},srcAction)),
        h(ARow,{T,icon:Icons.star(21,isStar),label:isStar?'Unstar this source':'Star this source',
          sub:isStar?'Starred sources float to the top':'Float this source’s stories to the top',
          onClick:()=>{toggleStar(srcAction);setSrcAction(null)}}),
        h(ARow,{T,icon:Icons.mute(21),label:isMuted?'Un-mute this source':'Mute this source',danger:!isMuted,
          sub:isMuted?'Its stories are hidden right now':'Hide this source’s stories from the brief',
          onClick:()=>{toggleMute(srcAction);setSrcAction(null)}}));
    })():null);
}

/* ============================== story circles (WhatsApp Status-style headlines) ============================== */
function StoryViewer({T,items,index,onIndex,onClose,onRead}){
  const [busy,setBusy]=useState(false);
  const it=items[index];
  const next=()=>{index<items.length-1?onIndex(index+1):onClose()};
  const prev=()=>{if(index>0)onIndex(index-1)};
  useEffect(()=>{ // auto-advance like a status story
    if(busy)return;
    const t=setTimeout(next,8000);
    return()=>clearTimeout(t);
  },[index,busy]);
  const read=async()=>{
    if(busy)return;
    setBusy(true);
    try{await onRead(it)}finally{setBusy(false);onClose()}
  };
  if(!it)return null;
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:80,background:'linear-gradient(165deg,#232a38 0%,#12141c 70%,#0c0d12 100%)',color:'#f4f4f6',display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{style:{display:'flex',gap:4,padding:'calc(10px + '+SAFE_T+') 12px 0',flexShrink:0}},
      items.map((_,i)=>h('div',{key:i,style:{flex:1,height:2.5,borderRadius:2,background:i<index?'#f4f4f6':i===index?'rgba(244,244,246,.85)':'rgba(244,244,246,.28)'}}))),
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'12px 10px 0',flexShrink:0}},
      h('button',{onClick:onClose,'aria-label':'Back',className:'act90',style:Object.assign({},iconBtnS,{color:'#f4f4f6'})},Icons.back(24)),
      h('div',{style:{width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,.14)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:WORDMARK,fontSize:16,flexShrink:0}},(it.source||'N')[0].toUpperCase()),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:13.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},it.source||'Headlines'),
        it.publishedAt?h('div',{style:{fontSize:11.5,color:'rgba(244,244,246,.6)'}},timeAgo(it.publishedAt)):null),
      h('button',{onClick:onClose,'aria-label':'Close',className:'act90',style:Object.assign({},iconBtnS,{color:'#f4f4f6'})},Icons.x(22))),
    h('div',{style:{flex:1,position:'relative',display:'flex',alignItems:'center',padding:'0 28px'}},
      h('div',{onClick:prev,style:{position:'absolute',left:0,top:0,bottom:0,width:'33%'}}),
      h('div',{onClick:next,style:{position:'absolute',right:0,top:0,bottom:0,width:'33%'}}),
      h('div',{style:{width:'100%',pointerEvents:'none'}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'rgba(244,244,246,.55)',marginBottom:14}},'Story '+(index+1)+' of '+items.length),
        h('div',{style:{fontFamily:"'Lora',Georgia,serif",fontSize:26,fontWeight:600,lineHeight:1.32}},it.title))),
    h('div',{style:{padding:'0 22px calc(26px + '+SAFE_B+')',flexShrink:0}},
      h('button',{onClick:read,disabled:busy,className:'act95',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:9,width:'100%',padding:'15px',borderRadius:13,background:'#f4f4f6',color:'#16181f',fontSize:15.5,fontWeight:650}},
        busy?h(Spinner,{T:THEMES.light,size:17}):Icons.download(18),busy?'Saving story…':'Save & read offline'),
      h('div',{style:{textAlign:'center',fontSize:11.5,color:'rgba(244,244,246,.5)',marginTop:12}},'Tap right for the next story · left to go back')));
}

function BriefStories({T,S,sources,onRead}){
  const [items,setItems]=useState(null); // null = loading
  const [open,setOpen]=useState(-1);
  const [seen,setSeen]=useState(()=>{try{return JSON.parse(localStorage.getItem('brief_seen_v1')||'[]')}catch(e){return[]}});
  useEffect(()=>{
    let alive=true;
    setItems(null);
    loadBriefCached(S.briefRegion||'IN',sources)
      .then(r=>{if(alive)setItems(r.slice(0,14))})
      .catch(()=>{if(alive)setItems([])});
    return()=>{alive=false};
  },[S.briefRegion,sources]);
  const markSeen=it=>{
    if(!it||seen.includes(it.url))return;
    const ns=[...seen,it.url].slice(-300);
    setSeen(ns);
    try{localStorage.setItem('brief_seen_v1',JSON.stringify(ns))}catch(e){}
  };
  useEffect(()=>{if(open>=0&&items)markSeen(items[open])},[open,items]);
  if(items&&!items.length)return null; // offline with no cache — hide the row quietly
  const circle=(it,i)=>{
    const unseen=!seen.includes(it.url);
    return h('button',{key:it.url+i,onClick:()=>setOpen(i),className:'act95',style:{width:66,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',gap:5}},
      h('div',{style:{width:62,height:62,borderRadius:'50%',padding:2.5,background:unseen?'conic-gradient(from 210deg,'+T.accent+',#3f9d63,#e8c547,'+T.accent+')':T.hair}},
        h('div',{style:{width:'100%',height:'100%',borderRadius:'50%',background:T.card,border:'2.5px solid '+T.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:WORDMARK,fontSize:21,color:T.fg,overflow:'hidden'}},(it.source||'N')[0].toUpperCase())),
      h('div',{style:{fontSize:10.5,color:unseen?T.meta:T.sub,fontWeight:unseen?600:400,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},it.source||'News'));
  };
  return h('div',{style:{borderBottom:'1px solid '+T.hair,paddingBottom:4}},
    h('div',{style:{display:'flex',alignItems:'center',padding:'8px 16px 8px',fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},
      h('span',{style:{flex:1}},'Today’s stories')),
    h('div',{className:'sx',style:{display:'flex',gap:12,overflowX:'auto',padding:'0 16px 8px'}},
      items===null
        ?[0,1,2,3,4,5].map(i=>h('div',{key:i,style:{width:66,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',gap:5}},
            h('div',{style:{width:62,height:62,borderRadius:'50%',background:T.card}}),
            h('div',{style:{width:44,height:8,borderRadius:4,background:T.card}})))
        :items.map(circle)),
    open>=0&&items?h(StoryViewer,{T,items,index:open,onIndex:setOpen,onClose:()=>setOpen(-1),onRead}):null);
}

/* ============================== blogs view ============================== */
/* Add / edit / reorder saved blogs; feed autodiscovery runs on save. */
/* one blog's row — favicon-less rss icon, name, "N new" badge, expand to preview posts */
function BlogFeedRow({T,f,entries,loading,newCount,collapsed,onToggleCollapse,onOpen,onVisitSite,onEntry,onLongPress,busyUrl}){
  const lp=useLongPress(onLongPress);
  if(!f.feedUrl){
    return h('div',Object.assign({},lp,{style:{display:'flex',gap:10,padding:'11px 4px',alignItems:'center'}}),
      h('div',{onClick:onOpen,style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:11,cursor:'pointer'}},
        h('span',{style:{width:32,height:32,borderRadius:9,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}},
          h('img',{src:faviconUrl(f.site),alt:'',style:{width:19,height:19},onError:e=>{e.target.style.opacity=0}})),
        h('div',{style:{minWidth:0}},
          h('div',{style:{fontSize:14.5,fontWeight:500,color:T.fg,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},f.name),
          h('div',{style:{fontSize:11.5,color:T.danger,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'No feed — opens in browser'))),
      h('span',{onClick:onOpen,style:{color:T.sub,display:'flex',cursor:'pointer',flexShrink:0}},Icons.external(17)));
  }
  const es=entries||[];
  const card=e=>{const busy=busyUrl===e.url;return h('button',{key:e.id||e.url,onClick:()=>onEntry(e),disabled:busy,className:'act98',
    style:{display:'flex',gap:8,width:'100%',textAlign:'left',background:T.card,borderRadius:10,overflow:'hidden',alignItems:'flex-start',padding:'8px 10px',opacity:busyUrl&&!busy?0.5:1}},
    h('span',{style:{color:'#e8801f',marginTop:1,flexShrink:0,display:'flex'}},Icons.rss(13)),
    h('div',{style:{flex:1,minWidth:0}},
      h('div',{style:{fontSize:12.5,color:T.fg,lineHeight:1.35,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},e.title||'Untitled'),
      e.publishedMs?h('div',{style:{fontSize:11,color:T.sub,marginTop:3}},fmtDateShort(e.publishedMs)):null),
    h('span',{style:{flexShrink:0,color:T.sub,display:'flex',paddingTop:2}},busy?h(Spinner,{T,size:14}):Icons.download(15)));};
  return h('div',Object.assign({},lp,{style:{display:'flex',gap:8,padding:'10px 4px',alignItems:'flex-start'}}),
    h('div',{style:{flex:1,minWidth:0}},
      h('div',{style:{display:'flex',alignItems:'center',gap:6}},
        h('div',{onClick:onToggleCollapse,style:{display:'flex',alignItems:'center',gap:6,cursor:'pointer',flex:1,minWidth:0}},
          h('span',{style:{color:'#e8801f',display:'flex',flexShrink:0}},Icons.rss(15)),
          h('div',{style:{fontSize:14,fontWeight:600,color:T.fg,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},f.name),
          loading?h(Spinner,{T,size:12}):(newCount?h('span',{style:{flexShrink:0,fontSize:9,fontWeight:700,color:'#fff',background:'#e8801f',borderRadius:5,padding:'2px 6px'}},newCount+' new'):null)),
        onVisitSite?h('button',{onClick:onVisitSite,className:'act90','aria-label':'Visit site',title:'Visit site',style:{display:'flex',flexShrink:0,color:T.sub,padding:3}},Icons.globe(15)):null,
        h('button',{onClick:onToggleCollapse,className:'act90',style:{display:'flex',flexShrink:0,color:T.sub,padding:2,transform:collapsed?'none':'rotate(90deg)',transition:'transform 160ms'}},Icons.chevR(13))),
      collapsed?null:(es.length?h('div',{style:{marginTop:7,display:'flex',flexDirection:'column',gap:6}},es.slice(0,8).map(card))
        :h('div',{style:{marginTop:5,fontSize:12,color:T.sub}},loading?'Loading…':'No posts found yet.'))));
}

/* "Ask Claude about my blogs" — hand recent posts to the Claude app, no API key */
function BlogsClaudeSheet({T,feeds,blogFeeds,seen,onClose,toastFn}){
  const [modes,setModes]=useState({summarize:true,newsletter:false});
  const groupsData=useMemo(()=>feeds.filter(f=>f.feedUrl).map(f=>{
    const c=blogFeeds[f.id];const since=seen[f.id]||0;
    const entries=(c&&c.entries?c.entries:[]).filter(e=>e.url).slice().sort((a,b)=>b.publishedMs-a.publishedMs).slice(0,8)
      .map(e=>({...e,isNew:e.publishedMs>since,sourceName:f.name}));
    return{feed:f,entries};
  }).filter(g=>g.entries.length),[feeds,blogFeeds,seen]);
  const [sel,setSel]=useState(null);
  useEffect(()=>{if(sel===null){const s=new Set();groupsData.forEach(g=>g.entries.forEach(e=>{if(e.isNew)s.add(e.url)}));setSel(s)}},[]);// eslint-disable-line
  const selSet=sel||new Set();
  const toggleEntry=url=>setSel(prev=>{const s=new Set(prev||[]);s.has(url)?s.delete(url):s.add(url);return s});
  const toggleMode=k=>setModes(m=>({...m,[k]:!m[k]}));
  const newCount=groupsData.reduce((n,g)=>n+g.entries.filter(e=>e.isNew).length,0);
  const selectAllNew=()=>{const s=new Set();groupsData.forEach(g=>g.entries.forEach(e=>{if(e.isNew)s.add(e.url)}));setSel(s)};
  const modeRow=(key,label,sub)=>h('button',{key,onClick:()=>toggleMode(key),className:'act95',style:{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 4px',textAlign:'left'}},
    h('span',{style:{display:'flex',flexShrink:0,color:modes[key]?T.accent:T.sub}},Icons.checkCircle(21,modes[key])),
    h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14.5,color:T.fg,fontWeight:500}},label),h('div',{style:{fontSize:12,color:T.sub,marginTop:1}},sub)));
  const entryRow=e=>h('button',{key:e.url,onClick:()=>toggleEntry(e.url),className:'act95',style:{display:'flex',alignItems:'flex-start',gap:9,width:'100%',padding:'6px 4px',textAlign:'left'}},
    h('span',{style:{display:'flex',flexShrink:0,color:selSet.has(e.url)?T.accent:T.sub,marginTop:1}},Icons.checkCircle(18,selSet.has(e.url))),
    h('div',{style:{flex:1,minWidth:0}},
      h('div',{style:{fontSize:13.5,color:T.fg,lineHeight:1.35}},e.title||'Untitled'),
      e.isNew?h('span',{style:{fontSize:10,fontWeight:700,color:T.accent,letterSpacing:'.03em'}},'NEW'):null));
  const anyMode=modes.summarize||modes.newsletter;
  const doAsk=()=>{
    const chosen=[];groupsData.forEach(g=>g.entries.forEach(e=>{if(selSet.has(e.url))chosen.push(e)}));
    if(!chosen.length){toastFn('Pick at least one item');return}
    const instrParts=[];
    if(modes.summarize)instrParts.push('Summarize the key points across everything below, grouped by theme, as concise bullets.');
    if(modes.newsletter)instrParts.push('Compile everything into a polished, ready-to-send newsletter — a short friendly intro, one section per topic with a couple of sentences each, and a closing line.');
    if(!instrParts.length){toastFn('Pick what Claude should do');return}
    const lines=chosen.map((e,i)=>(i+1)+'. '+e.sourceName+' — '+(e.title||'Untitled')+'\n   '+e.url);
    const p=instrParts.join(' ')+'\n\n----- MY BLOGS — SELECTED ITEMS ('+chosen.length+') -----\n'+lines.join('\n');
    if(openInClaude(p,toastFn))onClose();
  };
  return h(Sheet,{T,title:'Ask Claude about my blogs',onClose},
    h('div',{style:{padding:'0 20px calc(18px + '+SAFE_B+')'}},
      h('div',{style:{fontSize:13,color:T.meta,marginBottom:12,lineHeight:1.5}},'Send your ',h('strong',{style:{color:T.fg}},'Blogs'),' updates to the ',h('strong',{style:{color:T.fg}},'Claude app'),' — no API key.'),
      h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:2}},'What should Claude do?'),
      modeRow('summarize','Summarize','Key points across everything selected'),
      modeRow('newsletter','Newsletter','Compile into a ready-to-send newsletter'),
      groupsData.length?h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'18px 0 4px'}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},'Items · '+selSet.size+' selected'),
        h('div',{style:{display:'flex',gap:14}},
          h('button',{onClick:selectAllNew,style:{fontSize:12.5,color:T.accent,fontWeight:600}},'New ('+newCount+')'),
          h('button',{onClick:()=>setSel(new Set()),style:{fontSize:12.5,color:T.sub,fontWeight:600}},'Clear'))):null,
      groupsData.length?groupsData.map(g=>h('div',{key:g.feed.id,style:{marginBottom:8}},
        h('div',{style:{fontSize:12,fontWeight:600,color:T.meta,padding:'6px 0 2px'}},g.feed.name),
        g.entries.map(entryRow))):h('div',{style:{padding:'10px 0',fontSize:13.5,color:T.sub,lineHeight:1.5}},'No blog posts with recent updates yet — add blogs first.'),
      h(PrimaryBtn,{T,label:'Ask Claude',disabled:!(anyMode&&selSet.size),style:{margin:'16px 0 0',width:'100%'},onClick:doAsk}),
      h('div',{style:{fontSize:11.5,color:T.sub,textAlign:'center',margin:'10px 0 4px',lineHeight:1.5}},'Opens the Claude app if installed, otherwise claude.ai. The full list is copied to your clipboard as a backup.')));
}

/* ============================== Threads ============================== */
/* A Thread is a topic you follow over time (like an X thread of a developing
   story). Its timeline mixes four entry kinds — note / link / image / saved
   article — shown newest-first, and can optionally be auto-fed by an RSS
   source whose new posts appear inline alongside your own entries. */
const THREAD_COLORS=['#d4564a','#e8801f','#e0a020','#5cb85c','#2bb5a0','#3aa0e0','#6a7ef0','#9b59b6','#e0517f'];

/* merge a thread's manual entries with its cached feed items, newest-first */
function threadTimeline(thread,feedCache){
  const manual=(thread.entries||[]).map(e=>({...e,_ts:e.createdAt||0}));
  const feed=((feedCache&&feedCache.entries)||[]).map(e=>({
    id:'feed:'+(e.id||e.url),kind:'feed',url:e.url,title:e.title,image:e.image||'',
    source:thread.feedTitle||thread.site||domainOf(e.url||''),_ts:e.publishedMs||0,createdAt:e.publishedMs||0}));
  return manual.concat(feed).sort((a,b)=>b._ts-a._ts);
}

/* image entry — resolves the blob from the loaded media array by mediaId */
function ThreadImg({m,style,onClick,alt}){
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!m||!m.blob){setUrl('');return}const u=URL.createObjectURL(m.blob);setUrl(u);return()=>URL.revokeObjectURL(u)},[m&&m.blob]);
  if(!url)return h('div',{onClick,style:Object.assign({background:'#8884'},style||{})});
  return h('img',{src:url,alt:alt||'',onClick,style:Object.assign({objectFit:'cover',display:'block'},style||{})});
}

/* one topic row in the list (own component so useLongPress obeys hook rules) */
function ThreadCard({T,thread,newCount,preview,onOpen,onLongPress}){
  const lp=useLongPress(onLongPress);
  const count=(thread.entries||[]).length;
  return h('button',Object.assign({onClick:onOpen,className:'act98',
    style:{display:'flex',gap:12,width:'100%',textAlign:'left',alignItems:'center',padding:'13px 14px',marginBottom:10,borderRadius:14,border:'1px solid '+T.hair,background:T.card,color:T.fg}},lp),
    h('span',{style:{width:10,height:10,borderRadius:5,flexShrink:0,background:thread.color||THREAD_COLORS[0]}}),
    h('div',{style:{flex:1,minWidth:0}},
      h('div',{style:{display:'flex',alignItems:'center',gap:8}},
        h('div',{style:{fontSize:16,fontWeight:600,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},thread.title),
        newCount?h('span',{style:{flexShrink:0,fontSize:9.5,fontWeight:700,color:'#fff',background:'#d4564a',borderRadius:999,padding:'2px 7px'}},newCount+' new'):null),
      h('div',{style:{fontSize:12.5,color:T.sub,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},preview),
      h('div',{style:{fontSize:11,color:T.sub,marginTop:4,display:'flex',gap:8,alignItems:'center'}},
        thread.feedUrl?h('span',{style:{display:'inline-flex',alignItems:'center',gap:3,color:'#e8801f'}},Icons.rss(11),'Live'):null,
        h('span',null,count+(count===1?' entry':' entries')),
        thread.updatedAt?h('span',null,'· '+timeAgo(thread.updatedAt)):null)),
    h('span',{style:{color:T.sub,display:'flex',flexShrink:0}},Icons.chevR(16)));
}

/* the topic list — cards you tap into, plus "＋ New topic" */
function ThreadsView({T,S,threads,threadFeeds,seen,media,articles,onThreads,onThreadFeeds,onSeen,addThreadImage,removeThreadMedia,onOpenItem,onOpenArticle,onBrowse,toastFn}){
  const [openId,setOpenId]=useState(null);
  const [form,setForm]=useState(null); // {id?,title,color,url}
  const [busy,setBusy]=useState(false);
  const [act,setAct]=useState(null); // thread for the action sheet

  useEffect(()=>{ // best-effort refresh of each thread's RSS source
    let live=true;
    (async()=>{for(const t of threads){
      if(!t.feedUrl)continue;
      const c=threadFeeds[t.id];if(c&&Date.now()-(c.fetchedAt||0)<20*60*1000)continue;
      try{const es=await fetchRss(t.feedUrl);if(es&&live)onThreadFeeds(m=>({...m,[t.id]:{fetchedAt:Date.now(),entries:es}}))}catch(e){}
    }})();
    return()=>{live=false};
  },[]);// eslint-disable-line

  const patchThread=(id,fn)=>onThreads(list=>list.map(t=>t.id===id?fn(t):t));
  const newCountFor=t=>{const c=threadFeeds[t.id];if(!c||!c.entries)return 0;const since=seen[t.id]||0;return c.entries.filter(e=>(e.publishedMs||0)>since).length};
  const openThread=id=>{setOpenId(id);onSeen(m=>({...m,[id]:Date.now()}))};

  const saveForm=async()=>{
    const title=(form.title||'').trim();if(!title){toastFn('Give the topic a name');return}
    const url=normalizeUrl(form.url||'');
    setBusy(true);
    let feedUrl='',site='';
    if(url){site=url;try{feedUrl=await discoverFeed(url)}catch(e){feedUrl=''}}
    setBusy(false);
    if(form.id){
      patchThread(form.id,t=>({...t,title,color:form.color,site:site||t.site||'',feedUrl:url?feedUrl:t.feedUrl}));
    }else{
      const id=uid();
      onThreads(list=>[{id,title,color:form.color,site,feedUrl,createdAt:Date.now(),updatedAt:Date.now(),entries:[]},...list]);
      onSeen(m=>({...m,[id]:Date.now()}));
      if(feedUrl){try{const es=await fetchRss(feedUrl);if(es)onThreadFeeds(m=>({...m,[id]:{fetchedAt:Date.now(),entries:es}}))}catch(e){}}
    }
    setForm(null);
  };
  const deleteThread=t=>{
    const imgIds=(t.entries||[]).filter(e=>e.kind==='image'&&e.mediaId).map(e=>e.mediaId);
    if(imgIds.length&&removeThreadMedia)removeThreadMedia(imgIds);
    onThreads(list=>list.filter(x=>x.id!==t.id));
    onThreadFeeds(m=>{const n={...m};delete n[t.id];return n});
    setAct(null);toastFn('Topic deleted');
  };

  if(openId){
    const thread=threads.find(t=>t.id===openId);
    if(!thread){setOpenId(null);return null}
    return h(ThreadDetail,{T,S,thread,feedCache:threadFeeds[thread.id],media,articles,
      onBack:()=>setOpenId(null),
      onPatch:fn=>patchThread(thread.id,fn),
      onEdit:()=>setForm({id:thread.id,title:thread.title,color:thread.color||THREAD_COLORS[0],url:thread.site||''}),
      addThreadImage,removeThreadMedia,onOpenItem,onOpenArticle,onBrowse,toastFn,
      formNode:form?h(ThreadForm,{T,form,setForm,busy,onSave:saveForm}):null});
  }

  const preview=t=>{
    const tl=threadTimeline(t,threadFeeds[t.id]);
    if(!tl.length)return'No entries yet';
    const e=tl[0];
    if(e.kind==='note')return e.text||'Note';
    if(e.kind==='image')return'📷 Photo';
    if(e.kind==='article'){const a=articles.find(x=>x.id===e.articleId);return a?a.title:'Saved article'}
    return e.title||e.url||'Link';
  };

  return h('div',null,
    h('div',{style:{display:'flex',gap:8,padding:'12px 14px 6px'}},
      h('button',{onClick:()=>setForm({title:'',color:THREAD_COLORS[0],url:''}),className:'act95',
        style:{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 15px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14,fontWeight:600}},Icons.plus(17),'New topic')),
    threads.length?h('div',{style:{padding:'4px 14px 0'}},
      threads.map(t=>h(ThreadCard,{key:t.id,T,thread:t,newCount:newCountFor(t),preview:preview(t),
        onOpen:()=>openThread(t.id),onLongPress:()=>setAct(t)})),
      h('div',{style:{height:'calc(24px + '+SAFE_B+')'}}))
      :h(EmptyState,{T,icon:Icons.thread(40),title:'No topics yet',sub:'Create a topic to follow a series of events over time. Add notes, links, photos and saved articles — or attach a source to pull updates in automatically.'}),

    act?h(Sheet,{T,onClose:()=>setAct(null)},
      h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair,fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},act.title),
      h(ARow,{T,icon:Icons.pencil(21),label:'Edit topic',onClick:()=>{const t=act;setAct(null);setForm({id:t.id,title:t.title,color:t.color||THREAD_COLORS[0],url:t.site||''})}}),
      h(ARow,{T,icon:Icons.trash(21),label:'Delete topic',danger:true,onClick:()=>deleteThread(act)})):null,

    form?h(ThreadForm,{T,form,setForm,busy,onSave:saveForm}):null);
}

/* create / edit a topic — name, colour, and an optional source URL */
function ThreadForm({T,form,setForm,busy,onSave}){
  const inp=(val,key,ph,opts)=>h('input',Object.assign({value:val,onChange:e=>setForm(f=>({...f,[key]:e.target.value})),placeholder:ph,
    style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'11px 12px',fontSize:15,marginBottom:10,boxSizing:'border-box'}},opts||{}));
  return h(Sheet,{T,onClose:()=>setForm(null),title:form.id?'Edit topic':'New topic'},
    h('div',{style:{padding:'6px 20px 20px'}},
      inp(form.title,'title','Topic name  (e.g. India Elections 2026)',{autoFocus:true}),
      h('div',{style:{display:'flex',gap:9,flexWrap:'wrap',margin:'2px 0 14px'}},
        THREAD_COLORS.map(c=>h('button',{key:c,onClick:()=>setForm(f=>({...f,color:c})),'aria-label':'Colour',
          style:{width:30,height:30,borderRadius:'50%',background:c,border:form.color===c?'3px solid '+T.fg:'3px solid transparent',flexShrink:0}}))),
      h('div',{style:{fontSize:12,color:T.sub,margin:'2px 0 6px'}},'Source (optional) — attach a website or RSS feed to auto-pull updates'),
      inp(form.url,'url','https://example.com  (optional)',{inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false}),
      h(PrimaryBtn,{T,label:busy?'Saving…':(form.id?'Save':'Create topic'),disabled:busy,style:{width:'100%',margin:'8px 0 0'},onClick:onSave})));
}

/* one entry in a topic's timeline (own component for hook-safe long-press) */
function ThreadEntryRow({T,entry:e,thread,media,articles,busyUrl,onOpenLink,onOpenArticle,onLongPress}){
  const lp=useLongPress(onLongPress||(()=>{}));
  const stamp=h('div',{style:{fontSize:11,color:T.sub,marginTop:6}},e.kind==='feed'?(e.source?e.source+' · ':'')+timeAgo(e._ts):timeAgo(e._ts||e.createdAt));
  let inner;
  if(e.kind==='note'){
    inner=h('div',{style:{fontSize:15,color:T.fg,lineHeight:1.55,whiteSpace:'pre-wrap',wordBreak:'break-word'}},e.text);
  }else if(e.kind==='image'){
    const m=media.find(x=>x.id===e.mediaId);
    inner=m?h(ThreadImg,{m,alt:e.caption||'',style:{width:'100%',maxHeight:340,borderRadius:10}})
      :h('div',{style:{fontSize:13,color:T.sub,fontStyle:'italic'}},'Photo removed');
  }else if(e.kind==='article'){
    const a=articles.find(x=>x.id===e.articleId);
    inner=a?h('button',{onClick:()=>onOpenArticle(a.id),className:'act98',style:{display:'flex',gap:11,width:'100%',textAlign:'left',background:T.bg,border:'1px solid '+T.hair,borderRadius:11,overflow:'hidden',padding:8,color:T.fg,alignItems:'center'}},
        a.image?h('img',{src:a.image,alt:'',style:{width:54,height:54,borderRadius:8,objectFit:'cover',flexShrink:0}}):h('span',{style:{width:54,height:54,borderRadius:8,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:T.sub}},Icons.archive(20)),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:14,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title),
          h('div',{style:{fontSize:11.5,color:T.sub,marginTop:3}},(a.source||'Saved')+(a.readMin?' · '+a.readMin+' min':''))))
      :h('div',{style:{fontSize:13,color:T.sub,fontStyle:'italic'}},'Article removed from library');
  }else{ // link or feed
    const busy=busyUrl===e.url;
    inner=h('button',{onClick:()=>onOpenLink({title:e.title,url:e.url,source:e.source,publishedAt:e._ts||0}),disabled:busy,className:'act98',
      style:{display:'flex',gap:11,width:'100%',textAlign:'left',background:T.bg,border:'1px solid '+T.hair,borderRadius:11,overflow:'hidden',padding:8,color:T.fg,alignItems:'center',opacity:busyUrl&&!busy?0.5:1}},
      e.image?h('img',{src:e.image,alt:'',style:{width:54,height:54,borderRadius:8,objectFit:'cover',flexShrink:0},onError:ev=>{ev.target.style.display='none'}}):h('span',{style:{width:54,height:54,borderRadius:8,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#e8801f'}},e.kind==='feed'?Icons.rss(20):Icons.link(19)),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:14,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},e.title||e.url),
        h('div',{style:{fontSize:11.5,color:T.sub,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},e.source||domainOf(e.url||''))),
      h('span',{style:{flexShrink:0,color:T.sub,display:'flex'}},busy?h(Spinner,{T,size:15}):Icons.download(16)));
  }
  return h('div',Object.assign({},onLongPress?lp:{},{style:{position:'relative',paddingLeft:26,paddingBottom:16}}),
    h('span',{style:{position:'absolute',left:5,top:6,width:9,height:9,borderRadius:5,background:thread.color||THREAD_COLORS[0],zIndex:1}}),
    h('span',{style:{position:'absolute',left:9,top:14,bottom:-2,width:1.5,background:T.hair}}),
    h('div',{style:{background:T.card,border:'1px solid '+T.hair,borderRadius:13,padding:'11px 13px'}},inner,stamp));
}

/* one topic's timeline + composer */
function ThreadDetail({T,S,thread,feedCache,media,articles,onBack,onPatch,onEdit,addThreadImage,removeThreadMedia,onOpenItem,onOpenArticle,onBrowse,toastFn,formNode}){
  const [add,setAdd]=useState(null); // 'note' | 'link' | 'article' | null
  const [noteText,setNoteText]=useState('');
  const [linkUrl,setLinkUrl]=useState('');
  const [linkBusy,setLinkBusy]=useState(false);
  const [q,setQ]=useState('');
  const [busyUrl,setBusyUrl]=useState('');
  const [actEntry,setActEntry]=useState(null);
  const fileRef=useRef(null);
  const tl=useMemo(()=>threadTimeline(thread,feedCache),[thread,feedCache]);

  const addEntry=entry=>onPatch(t=>({...t,updatedAt:Date.now(),entries:[{id:uid(),createdAt:Date.now(),...entry},...(t.entries||[])]}));
  const removeEntry=e=>{
    if(e.kind==='image'&&e.mediaId&&removeThreadMedia)removeThreadMedia([e.mediaId]);
    onPatch(t=>({...t,entries:(t.entries||[]).filter(x=>x.id!==e.id)}));
    setActEntry(null);
  };
  const doNote=()=>{const tx=noteText.trim();if(!tx)return;addEntry({kind:'note',text:tx});setNoteText('');setAdd(null)};
  const doLink=async()=>{
    const u=normalizeUrl(linkUrl);if(!u){toastFn('Enter a valid link');return}
    setLinkBusy(true);
    let meta={title:domainOf(u)||u,image:'',source:domainOf(u)};
    try{const r=await fetchArticleData(u);meta={title:r.title||meta.title,image:r.image||'',source:r.source||meta.source}}catch(e){}
    setLinkBusy(false);
    addEntry({kind:'link',url:u,title:meta.title,image:meta.image,source:meta.source});
    setLinkUrl('');setAdd(null);
  };
  const onPickImage=async e=>{
    const f=e.target.files&&e.target.files[0];e.target.value='';
    if(!f)return;
    const id=await addThreadImage(f,thread.id);
    if(id)addEntry({kind:'image',mediaId:id,caption:''});
    else toastFn('Couldn\'t add that image');
  };
  const pickArticle=a=>{addEntry({kind:'article',articleId:a.id});setAdd(null);setQ('')};
  const openLink=async it=>{if(busyUrl)return;setBusyUrl(it.url);try{await onOpenItem(it)}finally{setBusyUrl('')}};

  const composer=h('div',{className:'sx',style:{display:'flex',gap:8,padding:'10px 14px',borderBottom:'1px solid '+T.hair,overflowX:'auto'}},
    [['note','Note',Icons.note(16)],['link','Link',Icons.link(16)],['image','Photo',Icons.image(16)],['article','Article',Icons.archive(16)]].map(([k,label,icon])=>
      h('button',{key:k,onClick:()=>k==='image'?(fileRef.current&&fileRef.current.click()):setAdd(k),className:'act95',
        style:{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 13px',borderRadius:999,border:'1px solid '+T.hair,background:T.card,color:T.fg,fontSize:13,fontWeight:500,flexShrink:0}},
        h('span',{style:{color:T.accent,display:'flex'}},icon),label)));

  return h('div',null,
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderBottom:'1px solid '+T.hair}},
      h('button',{onClick:onBack,className:'act90',style:{display:'flex',color:T.fg,padding:4}},Icons.back(22)),
      h('span',{style:{width:10,height:10,borderRadius:5,flexShrink:0,background:thread.color||THREAD_COLORS[0]}}),
      h('div',{style:{flex:1,minWidth:0,fontSize:17,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},thread.title),
      thread.site?h('button',{onClick:()=>onBrowse(thread.site),className:'act90',style:{display:'flex',color:T.sub,padding:6},title:'Visit source'},Icons.globe(18)):null,
      h('button',{onClick:onEdit,className:'act90',style:{display:'flex',color:T.sub,padding:6},title:'Edit topic'},Icons.gear(18))),
    composer,
    h('input',{ref:fileRef,type:'file',accept:'image/*',onChange:onPickImage,style:{display:'none'}}),
    h('div',{style:{padding:'14px 14px 0'}},
      tl.length?tl.map(e=>h(ThreadEntryRow,{key:e.id,T,entry:e,thread,media,articles,busyUrl,
        onOpenLink:openLink,onOpenArticle,onLongPress:e.kind==='feed'?null:()=>setActEntry(e)}))
        :h('div',{style:{textAlign:'center',color:T.sub,fontSize:14,padding:'40px 24px',lineHeight:1.5}},'Nothing here yet. Use the buttons above to add a note, link, photo or saved article — the newest appears on top.'),
      h('div',{style:{height:'calc(24px + '+SAFE_B+')'}})),

    add==='note'?h(Sheet,{T,onClose:()=>setAdd(null),title:'Add a note'},
      h('div',{style:{padding:'6px 20px 20px'}},
        h('textarea',{value:noteText,onChange:e=>setNoteText(e.target.value),placeholder:'Write anything — your take, a summary, what happened…',autoFocus:true,rows:5,
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'11px 12px',fontSize:15,lineHeight:1.5,boxSizing:'border-box',resize:'vertical'}}),
        h(PrimaryBtn,{T,label:'Add note',disabled:!noteText.trim(),style:{width:'100%',margin:'12px 0 0'},onClick:doNote}))):null,

    add==='link'?h(Sheet,{T,onClose:()=>setAdd(null),title:'Add a link'},
      h('div',{style:{padding:'6px 20px 20px'}},
        h('input',{value:linkUrl,onChange:e=>setLinkUrl(e.target.value),placeholder:'https://…',autoFocus:true,inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'11px 12px',fontSize:15,boxSizing:'border-box'}}),
        h('div',{style:{fontSize:12,color:T.sub,margin:'8px 2px 0'}},'We\'ll grab the title and preview image. Tap the card later to save & read it offline.'),
        h(PrimaryBtn,{T,label:linkBusy?'Fetching…':'Add link',disabled:linkBusy||!linkUrl.trim(),style:{width:'100%',margin:'12px 0 0'},onClick:doLink}))):null,

    add==='article'?h(Sheet,{T,onClose:()=>{setAdd(null);setQ('')},title:'Add a saved article'},
      h('div',{style:{padding:'4px 16px 16px'}},
        h('input',{value:q,onChange:e=>setQ(e.target.value),placeholder:'Search your library',autoFocus:true,autoCapitalize:'none',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.search,color:T.fg,borderRadius:10,padding:'10px 12px',fontSize:15,boxSizing:'border-box',marginBottom:8}}),
        (()=>{const ql=q.trim().toLowerCase();
          const list=articles.filter(a=>!a.archived&&(a.title||'')&&(!ql||(a.title||'').toLowerCase().includes(ql)||(a.source||'').toLowerCase().includes(ql))).slice(0,40);
          return list.length?list.map(a=>h('button',{key:a.id,onClick:()=>pickArticle(a),className:'act98',
            style:{display:'flex',gap:10,width:'100%',textAlign:'left',padding:'9px 6px',alignItems:'center',color:T.fg,borderBottom:'1px solid '+T.hair}},
            a.image?h('img',{src:a.image,alt:'',style:{width:42,height:42,borderRadius:7,objectFit:'cover',flexShrink:0}}):h('span',{style:{width:42,height:42,borderRadius:7,background:T.card,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',color:T.sub}},Icons.note(18)),
            h('div',{style:{flex:1,minWidth:0}},
              h('div',{style:{fontSize:14,fontWeight:500,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title),
              h('div',{style:{fontSize:11.5,color:T.sub,marginTop:2}},a.source||'Saved'))))
            :h('div',{style:{textAlign:'center',color:T.sub,fontSize:13.5,padding:'24px 12px'}},q.trim()?'No matching articles':'Your library is empty — save something first.');
        })())):null,

    actEntry?h(Sheet,{T,onClose:()=>setActEntry(null)},
      h(ARow,{T,icon:Icons.trash(21),label:'Delete entry',danger:true,onClick:()=>removeEntry(actEntry)})):null,

    formNode);
}

/* Blogs — grouped like My Routine: collapsible groups of feeds, drag to reorder,
   edit/delete/add per group, "N new" badges, and the same AI actions. No
   checklist/streaks — tapping a post still saves it for offline reading. */
function BlogsView({T,S,feeds,groups,blogFeeds,seen,onFeeds,onGroups,onBlogFeeds,onSeen,onOpenItem,onBrowse,toastFn}){
  const [collapsed,setCollapsed]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem('insta_blogs_collapsed')||'[]'))}catch(e){return new Set()}});
  const toggleCollapse=key=>setCollapsed(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);try{localStorage.setItem('insta_blogs_collapsed',JSON.stringify([...n]))}catch(e){}return n});
  const [dragOver,setDragOver]=useState(-1);
  const dragInfo=useRef({active:false,srcIdx:0,startY:0});
  const numGroupsRef=useRef(groups.length);numGroupsRef.current=groups.length;
  const startGroupDrag=(idx,e)=>{
    const y=e.touches?e.touches[0].clientY:e.clientY;
    dragInfo.current={active:true,srcIdx:idx,startY:y};
    setDragOver(idx);
    const onMove=ev=>{
      if(!dragInfo.current.active)return;
      const y2=ev.touches?ev.touches[0].clientY:ev.clientY;
      const dy=y2-dragInfo.current.startY;
      const ng=numGroupsRef.current;
      const step=Math.round(dy/80);
      setDragOver(Math.min(Math.max(dragInfo.current.srcIdx+step,0),ng-1));
    };
    const onEnd=ev=>{
      if(!dragInfo.current.active)return;
      dragInfo.current.active=false;
      const y2=(ev.changedTouches&&ev.changedTouches[0])?ev.changedTouches[0].clientY:ev.clientY||0;
      const dy=y2-dragInfo.current.startY;
      const ng=numGroupsRef.current;
      const src=dragInfo.current.srcIdx;
      const step=Math.round(dy/80);
      const dst=Math.min(Math.max(src+step,0),ng-1);
      if(src!==dst)onGroups(gs=>{const a=[...gs];const[mv]=a.splice(src,1);a.splice(dst,0,mv);return a});
      setDragOver(-1);
      window.removeEventListener('touchmove',onMove);window.removeEventListener('touchend',onEnd);
      window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onEnd);
    };
    window.addEventListener('touchmove',onMove,{passive:true});window.addEventListener('touchend',onEnd);
    window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onEnd);
  };
  const [busyUrl,setBusyUrl]=useState('');
  const [act,setAct]=useState(null); // feed for long-press action sheet
  const [edit,setEdit]=useState(null); // {id?,groupId,name,url}
  const [moveIt,setMoveIt]=useState(null); // feed being moved to a group
  const [grp,setGrp]=useState(null); // {} new | {rename:id}
  const [gName,setGName]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const toggleSearch=()=>setSearchOpen(o=>{const n=!o;if(!n)setQuery('');return n});
  const [aiBusy,setAiBusy]=useState(false);
  const [digest,setDigest]=useState(null);
  const [claudeOpen,setClaudeOpen]=useState(false);

  useEffect(()=>{ // best-effort refresh of each feed's recent items (persisted cache)
    let live=true;
    (async()=>{for(const f of feeds){
      if(!f.feedUrl)continue;
      const c=blogFeeds[f.id];if(c&&Date.now()-(c.fetchedAt||0)<20*60*1000)continue;
      try{const es=await fetchRss(f.feedUrl);if(es&&live)onBlogFeeds(m=>({...m,[f.id]:{fetchedAt:Date.now(),entries:es}}))}catch(e){}
    }})();
    return()=>{live=false};
  },[]);// eslint-disable-line

  const newEntriesFor=f=>{const c=blogFeeds[f.id];if(!c||!c.entries)return[];const since=seen[f.id]||0;return c.entries.filter(e=>e.publishedMs>since)};
  const open=async it=>{if(busyUrl)return;setBusyUrl(it.url);try{await onOpenItem(it)}finally{setBusyUrl('')}};
  const saveFeed=async f=>{
    const site=normalizeUrl(f.url);if(!site)return;
    setBusy(true);
    let feedUrl='';try{feedUrl=await discoverFeed(site)}catch(e){feedUrl=''}
    setBusy(false);
    const name=(f.name||'').trim()||domainOf(site)||f.url;
    let feedId=f.id;
    if(f.id)onFeeds(list=>list.map(x=>x.id===f.id?{...x,name,site,feedUrl}:x));
    else{
      feedId=uid();
      onFeeds(list=>list.concat([{id:feedId,name,site,feedUrl,groupId:f.groupId||null}]));
      onSeen(m=>({...m,[feedId]:Date.now()})); // a brand-new feed's back catalog isn't "new"
    }
    setEdit(null);
    if(feedUrl){try{const es=await fetchRss(feedUrl);if(es)onBlogFeeds(m=>({...m,[feedId]:{fetchedAt:Date.now(),entries:es}}))}catch(e){}}
  };
  const refreshAll=()=>{feeds.forEach(f=>{if(!f.feedUrl)return;fetchRss(f.feedUrl).then(es=>{if(es)onBlogFeeds(m=>({...m,[f.id]:{fetchedAt:Date.now(),entries:es}}))}).catch(()=>{})})};
  const itemRow=f=>{
    const c=blogFeeds[f.id]||{};
    const entries=(c.entries||[]).slice().sort((a,b)=>b.publishedMs-a.publishedMs);
    const nc=f.feedUrl?newEntriesFor(f).length:0;
    const isCollapsed=collapsed.has(f.id);
    return h(BlogFeedRow,{key:f.id,T,f,entries,loading:!!(f.feedUrl&&!c.entries),newCount:nc,
      collapsed:isCollapsed,
      onToggleCollapse:f.feedUrl?()=>{toggleCollapse(f.id);if(isCollapsed)onSeen(m=>({...m,[f.id]:Date.now()}))}:null,
      onOpen:()=>{if(!f.feedUrl)onBrowse(f.site)},
      onVisitSite:f.site?()=>onBrowse(f.site):null,
      onEntry:e=>open({title:e.title,url:e.url,source:f.name,publishedAt:e.publishedMs}),
      onLongPress:()=>setAct(f),
      busyUrl});
  };
  const sectionHead=(g,list,gIdx)=>{
    const key=g?g.id:'_other';
    const isOpen=!collapsed.has(key);
    const groupNew=list.reduce((n,f)=>n+(f.feedUrl?newEntriesFor(f).length:0),0);
    return h('div',{style:{display:'flex',alignItems:'center',gap:6}},
      h('button',{onClick:()=>toggleCollapse(key),className:'act95','aria-label':isOpen?'Collapse group':'Expand group',
        style:{display:'flex',alignItems:'center',gap:7,padding:'8px 12px',borderRadius:999,background:T.card,border:'1px solid '+T.hair,minWidth:0,overflow:'hidden'}},
        h('span',{style:{display:'flex',color:T.sub,flexShrink:0,transform:isOpen?'rotate(90deg)':'none',transition:'transform 160ms'}},Icons.chevR(12)),
        h('span',{style:{width:8,height:8,borderRadius:4,flexShrink:0,background:g?groupColor(g.id):T.sub}}),
        h('span',{style:{fontSize:12.5,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:T.meta,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},g?g.name:'Other'),
        groupNew?h('span',{style:{fontSize:10,fontWeight:700,color:'#fff',background:'#d4564a',borderRadius:999,padding:'2px 7px',flexShrink:0}},groupNew+' new'):h('span',{style:{fontSize:11,color:T.sub,flexShrink:0}},String(list.length))),
      g?h('button',{onMouseDown:e=>startGroupDrag(gIdx,e),onTouchStart:e=>startGroupDrag(gIdx,e),className:'act90','aria-label':'Reorder group',style:{display:'flex',flexShrink:0,color:T.sub,padding:6,cursor:'grab'}},Icons.drag(16)):null,
      h('div',{style:{flex:1}}),
      g?h('button',{onClick:()=>{setGName(g.name);setGrp({rename:g.id})},className:'act90','aria-label':'Rename group',style:{display:'flex',flexShrink:0,color:T.sub,padding:4,borderRadius:6}},Icons.pencil(15)):null,
      g?h('button',{onClick:()=>{onGroups(gs=>gs.filter(x=>x.id!==g.id));onFeeds(list=>list.map(x=>x.groupId===g.id?{...x,groupId:null}:x))},className:'act90','aria-label':'Delete group',style:{display:'flex',flexShrink:0,color:T.danger,padding:4,borderRadius:6}},Icons.trash(15)):null,
      h('button',{onClick:()=>setEdit({groupId:g?g.id:null,name:'',url:''}),className:'act90','aria-label':'Add blog',style:{display:'flex',flexShrink:0,color:T.accent,padding:4,borderRadius:6}},Icons.plus(18)));
  };
  const digestSource=()=>{
    const out=[];
    for(const f of feeds){if(!f.feedUrl)continue;for(const e of newEntriesFor(f))out.push(f.name+': '+(e.title||'').slice(0,160))}
    if(!out.length){
      const all=[];for(const f of feeds){const c=blogFeeds[f.id];if(c&&c.entries)for(const e of c.entries)all.push({name:f.name,e})}
      all.sort((a,b)=>b.e.publishedMs-a.e.publishedMs);
      for(const{name,e}of all.slice(0,20))out.push(name+': '+(e.title||'').slice(0,160));
    }
    return out.slice(0,60);
  };
  const runDigest=async()=>{
    if(!aiReady(S)){toastFn('Connect an AI key in Settings first');return}
    const lines=digestSource();if(!lines.length){toastFn('Nothing new to summarize');return}
    setAiBusy(true);setDigest(null);
    try{const out=await aiChat(S,[
      {role:'system',content:'You turn a list of new blog posts someone follows into a short, skimmable briefing.'},
      {role:'user',content:'These are new posts from blogs I follow. Group them by theme and give me a concise briefing of 4–8 bullet points on what actually matters, then a final line starting with "Worth your time:" naming the single most important post. Respond entirely in '+(S.aiLang||'English')+'.\n\n'+lines.join('\n')}],
      1200,()=>{});
      setDigest({text:out})}
    catch(e){setDigest({err:(e&&e.message)||'Could not summarize right now'})}
    setAiBusy(false);
  };
  const totalNew=feeds.reduce((n,f)=>n+(f.feedUrl?newEntriesFor(f).length:0),0);
  const q=query.trim().toLowerCase();
  const matchQ=f=>!q||f.name.toLowerCase().includes(q);
  const sections=groups.map(g=>({g,list:feeds.filter(f=>f.groupId===g.id)}));
  const ungrouped=feeds.filter(f=>!f.groupId||!groups.some(g=>g.id===f.groupId));
  if(ungrouped.length)sections.push({g:null,list:ungrouped});

  const rowBtn=(icon,onClick,active,label,disabled)=>h('button',{onClick,disabled,'aria-label':label,className:'act98',style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',padding:'9px 12px',borderRadius:10,background:active?T.accent:'transparent',color:active?'#fff':T.sub,border:'1px solid '+(active?T.accent:T.hair),opacity:disabled?.5:1}},icon);
  const rowBtnBadge=(icon,onClick,label,badge,disabled)=>h('div',{style:{position:'relative',flexShrink:0}},
    rowBtn(icon,onClick,false,label,disabled),
    badge?h('span',{style:{position:'absolute',top:-4,right:-4,minWidth:16,height:16,padding:'0 4px',borderRadius:8,background:T.danger,color:'#fff',fontSize:9.5,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}},badge):null);

  return h('div',null,
    h('div',{style:{display:'flex',gap:8,padding:'12px 14px 4px'}},
      rowBtn(Icons.search(17),toggleSearch,searchOpen,'Search'),
      rowBtn(Icons.plus(17),()=>{setGName('');setGrp({})},false,'New group'),
      rowBtn(Icons.refresh(17),refreshAll,false,'Refresh all'),
      rowBtnBadge(aiBusy?h(Spinner,{T,size:15}):Icons.ai(17),runDigest,'Summarize what’s new',totalNew>0?String(totalNew):'',aiBusy),
      rowBtn(Icons.send(17),()=>setClaudeOpen(true),false,'Ask Claude about my blogs')),
    (feeds.length&&searchOpen)?h('div',{style:{padding:'0 14px 10px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:9,background:T.search,border:'1px solid '+(q?T.accent:T.hair),borderRadius:12,padding:'9px 12px'}},
        h('span',{style:{display:'flex',color:q?T.accent:T.sub,flexShrink:0}},Icons.search(17)),
        h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:'Search blogs',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          style:{flex:1,minWidth:0,border:'none',background:'transparent',color:T.fg,fontSize:15,outline:'none'}}),
        query?h('button',{onClick:()=>setQuery(''),className:'act90','aria-label':'Clear search',style:{display:'flex',color:T.sub,flexShrink:0,padding:2}},Icons.x(17)):null)):null,
    h('div',{style:{padding:'2px 14px 0'}},
      (feeds.length||groups.length)?(()=>{
        const isDragging=dragOver!==-1;
        const rendered=sections.map(({g,list},gIdx)=>{
          const key=g?g.id:'_other';
          const flist=list.filter(matchQ);
          if(q&&!flist.length)return null;
          const dragThis=isDragging&&dragInfo.current.srcIdx===gIdx;
          const dropHere=isDragging&&dragOver===gIdx&&dragInfo.current.srcIdx!==gIdx;
          const itemsOpen=!(collapsed.has(key)&&!q);
          return h('div',{key,style:{opacity:dragThis?0.4:1,transition:'opacity 120ms',marginBottom:14}},
            h('div',{style:{borderRadius:999,outline:dropHere?'2px solid '+T.accent:'none',outlineOffset:3}},sectionHead(g,list,gIdx)),
            itemsOpen?h('div',{style:{marginTop:6,background:T.bg,borderRadius:14,border:'1px solid '+T.hair,boxShadow:'0 1px 2px rgba(0,0,0,.04)',padding:'4px 13px 6px'}},
              flist.length?flist.map(itemRow):h('div',{style:{fontSize:13,color:T.sub,padding:'8px 4px 12px'}},'Nothing here yet — tap + to add.')):null);
        });
        return q&&!rendered.some(Boolean)?h('div',{style:{textAlign:'center',color:T.sub,fontSize:14,padding:'34px 20px'}},'No blogs match “'+query.trim()+'”.'):rendered;
      })()
        :h(EmptyState,{T,icon:Icons.rss(40),title:'No blogs yet',sub:'Add your favorite blogs and read their latest posts here, grouped the way you like.'}),
      !feeds.length?h('div',{style:{padding:'0 26px',textAlign:'center'}},
        h('button',{onClick:()=>setEdit({groupId:null,name:'',url:''}),className:'act95',style:{display:'inline-flex',alignItems:'center',gap:8,padding:'11px 22px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:600}},Icons.plus(17),'Add a blog')):null,
      h('div',{style:{height:'calc(24px + '+SAFE_B+')'}})),

    digest?h(Sheet,{T,title:'What’s new',onClose:()=>setDigest(null)},
      h('div',{style:{padding:'0 20px calc(18px + '+SAFE_B+')'}},
        digest.err?h('div',{style:{color:T.danger,fontSize:14,lineHeight:1.5}},digest.err)
          :h(Fragment,null,
            h('div',{style:{fontSize:11.5,color:T.sub,marginBottom:10}},'Summarized by '+aiModelLabel(S)),
            h('div',{style:{fontSize:15,color:T.fg,lineHeight:1.62,whiteSpace:'pre-wrap'}},digest.text),
            h('div',{style:{display:'flex',gap:8,marginTop:18}},
              h('button',{onClick:()=>{copyText(digest.text);toastFn('Copied')},className:'act95',style:{flex:1,padding:'12px',borderRadius:11,background:T.card,color:T.fg,fontSize:14,fontWeight:600}},'Copy'),
              h('button',{onClick:()=>setDigest(null),className:'act95',style:{flex:1,padding:'12px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14,fontWeight:600}},'Done'))))):null,

    claudeOpen?h(BlogsClaudeSheet,{T,feeds,blogFeeds,seen,onClose:()=>setClaudeOpen(false),toastFn}):null,

    act?h(Sheet,{T,onClose:()=>setAct(null)},
      h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair,fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},act.name),
      h(ARow,{T,icon:Icons.globe(21),label:'Open site',onClick:()=>{const f=act;setAct(null);onBrowse(f.site)}}),
      h(ARow,{T,icon:Icons.pencil(21),label:'Edit',onClick:()=>{const f=act;setAct(null);setEdit({id:f.id,groupId:f.groupId,name:f.name,url:f.site})}}),
      h(ARow,{T,icon:Icons.folder(21),label:'Move to group…',onClick:()=>{const f=act;setAct(null);setMoveIt(f)}}),
      h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:()=>{onFeeds(list=>list.filter(x=>x.id!==act.id));setAct(null)}})):null,

    moveIt?h(Sheet,{T,title:'Move to group',onClose:()=>setMoveIt(null)},
      h(ARow,{T,icon:Icons.x(21),label:'No group (Other)',onClick:()=>{onFeeds(list=>list.map(x=>x.id===moveIt.id?{...x,groupId:null}:x));setMoveIt(null)}}),
      groups.map(g=>h(ARow,{key:g.id,T,icon:Icons.folder(21),label:g.name,onClick:()=>{onFeeds(list=>list.map(x=>x.id===moveIt.id?{...x,groupId:g.id}:x));setMoveIt(null)}})),
      groups.length?null:h('div',{style:{padding:'14px 20px',color:T.sub,fontSize:13.5}},'No groups yet — create one with "New group".')):null,

    grp?h(Sheet,{T,title:grp.rename?'Rename group':'New group',onClose:()=>setGrp(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:gName,autoFocus:true,onChange:e=>setGName(e.target.value),placeholder:'Group name (e.g. Design, Cooking)',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:12}}),
        h('button',{onClick:()=>{const nm=gName.trim()||'Group';if(grp.rename)onGroups(gs=>gs.map(g=>g.id===grp.rename?{...g,name:nm}:g));else onGroups(gs=>gs.concat([{id:uid(),name:nm}]));setGrp(null)},className:'act96',style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},grp.rename?'Rename':'Create'))):null,

    edit?h(Sheet,{T,title:edit.id?'Edit blog':'Add blog',onClose:()=>setEdit(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:edit.name,onChange:e=>setEdit({...edit,name:e.target.value}),placeholder:'Name (optional)',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:10}}),
        h('input',{value:edit.url,onChange:e=>setEdit({...edit,url:e.target.value}),placeholder:'Blog URL or feed (https://…)',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          onKeyDown:e=>{if(e.key==='Enter')saveFeed(edit)},
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:6}}),
        h('div',{style:{fontSize:11.5,color:T.sub,marginBottom:12,lineHeight:1.45}},'Paste a blog homepage — we\'ll find its feed automatically. Sites without a feed open in the browser.'),
        h('button',{onClick:()=>saveFeed(edit),disabled:busy||!normalizeUrl(edit.url),className:'act96',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600,opacity:(busy||!normalizeUrl(edit.url))?.6:1}},busy?h(Spinner,{T,size:15}):null,busy?'Finding feed…':(edit.id?'Save':'Add')))):null);
}

/* ============================== notes & tags views ============================== */
function EmptyState({T,icon,title,sub}){
  return h('div',{style:{padding:'80px 40px',textAlign:'center',color:T.sub}},
    h('div',{style:{display:'flex',justifyContent:'center',marginBottom:14,opacity:.5}},icon),
    h('div',{style:{fontSize:16.5,fontWeight:600,color:T.meta,marginBottom:6}},title),
    h('div',{style:{fontSize:13.5,lineHeight:1.5}},sub));
}

/* ============================== photos / media ============================== */
function MediaThumb({T,m,onClick,onLongPress}){
  const [url,setUrl]=useState('');
  const lp=useLongPress(onLongPress);
  useEffect(()=>{
    if(m.kind!=='image'||!m.blob){setUrl('');return}
    const u=URL.createObjectURL(m.blob);setUrl(u);
    return()=>URL.revokeObjectURL(u);
  },[m.blob]);
  return h('div',Object.assign({onClick},lp,{style:{position:'relative',paddingTop:'100%',borderRadius:10,overflow:'hidden',background:T.thumbBg||T.card,cursor:'pointer'}}),
    m.kind==='image'&&url
      ?h('img',{src:url,alt:m.caption||m.name,style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}})
      :h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:8,color:T.sub}},
        Icons.file(30),h('div',{style:{fontSize:10.5,textAlign:'center',overflow:'hidden',maxHeight:28,lineHeight:1.2,wordBreak:'break-word'}},m.name)),
    m.pinned?h('div',{style:{position:'absolute',top:5,left:5,color:'#fff',filter:'drop-shadow(0 1px 2px rgba(0,0,0,.55))',display:'flex'}},Icons.pin(14,true)):null,
    m.favorite?h('div',{style:{position:'absolute',top:5,right:5,color:'#fff',filter:'drop-shadow(0 1px 2px rgba(0,0,0,.55))',display:'flex'}},Icons.heart(15,true)):null,
    m.caption?h('div',{style:{position:'absolute',left:0,right:0,bottom:0,padding:'14px 6px 5px',fontSize:11,color:'#fff',background:'linear-gradient(transparent,rgba(0,0,0,.6))',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},m.caption):null
  );
}

function PhotoEditor({T,m,onSave,onClose}){
  const isImage=m.kind==='image';
  const [caption,setCaption]=useState(m.caption||'');
  const [blob,setBlob]=useState(m.blob);
  const [url,setUrl]=useState('');
  const [crop,setCrop]=useState(null); // {x,y,w,h} in displayed px
  const [busy,setBusy]=useState(false);
  const imgRef=useRef(null),drag=useRef(null);
  const dirty=blob!==m.blob||caption!==(m.caption||'');
  useEffect(()=>{
    if(!isImage||!blob){setUrl('');return}
    const u=URL.createObjectURL(blob);setUrl(u);
    return()=>URL.revokeObjectURL(u);
  },[blob]);
  const loadImg=u=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u});
  const toBlob=cv=>new Promise(res=>cv.toBlob(b=>res(b),m.mime==='image/png'?'image/png':'image/jpeg',0.92));
  const rotate=async dir=>{ // dir: +1 cw, -1 ccw
    setBusy(true);
    try{
      const u=URL.createObjectURL(blob);const img=await loadImg(u);URL.revokeObjectURL(u);
      const cv=document.createElement('canvas');cv.width=img.naturalHeight;cv.height=img.naturalWidth;
      const ctx=cv.getContext('2d');
      ctx.translate(cv.width/2,cv.height/2);ctx.rotate(dir*Math.PI/2);ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
      setBlob(await toBlob(cv));setCrop(null);
    }catch(e){}
    setBusy(false);
  };
  const applyCrop=async()=>{
    if(!crop||crop.w<10||crop.h<10){setCrop(null);return}
    setBusy(true);
    try{
      const img=imgRef.current,r=img.getBoundingClientRect();
      const sx=img.naturalWidth/r.width,sy=img.naturalHeight/r.height;
      const cv=document.createElement('canvas');
      cv.width=Math.max(1,Math.round(crop.w*sx));cv.height=Math.max(1,Math.round(crop.h*sy));
      const u=URL.createObjectURL(blob);const im=await loadImg(u);URL.revokeObjectURL(u);
      cv.getContext('2d').drawImage(im,crop.x*sx,crop.y*sy,crop.w*sx,crop.h*sy,0,0,cv.width,cv.height);
      setBlob(await toBlob(cv));setCrop(null);
    }catch(e){}
    setBusy(false);
  };
  const cStart=e=>{const r=imgRef.current.getBoundingClientRect();const p=e.touches?e.touches[0]:e;drag.current={x0:p.clientX-r.left,y0:p.clientY-r.top,r};setCrop({x:drag.current.x0,y:drag.current.y0,w:0,h:0})};
  const cMove=e=>{if(!drag.current)return;const p=e.touches?e.touches[0]:e,r=drag.current.r;const x=clamp(p.clientX-r.left,0,r.width),y=clamp(p.clientY-r.top,0,r.height),x0=drag.current.x0,y0=drag.current.y0;setCrop({x:Math.min(x,x0),y:Math.min(y,y0),w:Math.abs(x-x0),h:Math.abs(y-y0)})};
  const cEnd=()=>{drag.current=null;setCrop(c=>c&&(c.w<10||c.h<10)?null:c)};
  const tbBtn=(icon,label,onClick,disabled)=>h('button',{onClick,disabled,className:'act90',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:4,color:T.fg,fontSize:11,opacity:disabled?.4:1,flex:1,padding:'8px 0'}},icon,label);
  return h('div',{style:{position:'fixed',inset:0,zIndex:80,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',paddingTop:SAFE_T}},
    h('div',{style:{display:'flex',alignItems:'center',padding:'8px 12px',flexShrink:0}},
      h('button',{onClick:onClose,className:'act90',style:{color:T.sub,fontSize:15.5,padding:6}},'Cancel'),
      h('div',{style:{flex:1,textAlign:'center',fontSize:16,fontWeight:600}},'Edit'),
      h('button',{onClick:()=>onSave({caption,blob:blob!==m.blob?blob:undefined}),disabled:!dirty||busy,className:'act90',style:{color:dirty&&!busy?T.accent:T.sub,fontSize:15.5,fontWeight:600,padding:6}},'Save')),
    h('div',{className:'sy',style:{flex:1,overflowY:'auto',padding:'0 16px'}},
      isImage&&url?h('div',{style:{position:'relative',userSelect:'none',touchAction:'none',margin:'4px auto 12px',display:'flex',justifyContent:'center'}},
        h('div',{style:{position:'relative',display:'inline-block'},onMouseDown:cStart,onMouseMove:cMove,onMouseUp:cEnd,onTouchStart:cStart,onTouchMove:cMove,onTouchEnd:cEnd},
          h('img',{ref:imgRef,src:url,alt:'',draggable:false,style:{maxWidth:'100%',maxHeight:'52vh',display:'block',borderRadius:8}}),
          crop?h('div',{style:{position:'absolute',left:crop.x,top:crop.y,width:crop.w,height:crop.h,border:'2px solid #fff',boxShadow:'0 0 0 9999px rgba(0,0,0,.45)',pointerEvents:'none'}}):null)
      ):h('div',{style:{padding:'40px 0',textAlign:'center',color:T.sub}},Icons.file(46),h('div',{style:{marginTop:10,fontSize:14}},m.name)),
      busy?h('div',{style:{textAlign:'center',color:T.sub,fontSize:13,marginBottom:10}},'Working…'):null,
      h('div',{style:{fontSize:12.5,color:T.sub,marginBottom:6,fontWeight:600,letterSpacing:'.03em',textTransform:'uppercase'}},'Caption'),
      h('input',{value:caption,onChange:e=>setCaption(e.target.value),placeholder:'Add a caption',
        style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'11px 13px',fontSize:15,marginBottom:16}})),
    isImage?h('div',{style:{flexShrink:0,borderTop:'1px solid '+T.hair,display:'flex',padding:'4px 8px calc(6px + '+SAFE_B+')'}},
      tbBtn(Icons.rotate(22),'Left',()=>rotate(-1),busy),
      tbBtn(h('span',{style:{transform:'scaleX(-1)',display:'flex'}},Icons.rotate(22)),'Right',()=>rotate(1),busy),
      crop&&crop.w>10?tbBtn(Icons.crop(22),'Apply crop',applyCrop,busy):tbBtn(Icons.crop(22),'Drag to crop',()=>{},true)
    ):h('div',{style:{paddingBottom:SAFE_B}}));
}

function PhotosView({T,S,media,albums,onPick,onPickToAlbum,onUpdate,onDelete,onAddAlbum,onRenameAlbum,onDeleteAlbum,toastFn}){
  const [tab,setTab]=useState('all'); // all | albums | favourites
  const [openAlbum,setOpenAlbum]=useState(null); // albumId being viewed
  const [actM,setActM]=useState(null); // media for action sheet
  const [moveM,setMoveM]=useState(null); // media for move-to-album sheet
  const [editM,setEditM]=useState(null); // media being edited
  const [mkAlbum,setMkAlbum]=useState(null); // {forMedia?} create-album sheet
  const [albName,setAlbName]=useState('');
  const [viewer,setViewer]=useState(null); // media for fullscreen view
  const [addMenu,setAddMenu]=useState(null); // albumId — "add to album" chooser
  const [addExisting,setAddExisting]=useState(null); // albumId — pick existing photos
  const [sel,setSel]=useState({}); // selected media ids in the existing-photo picker
  const sortP=arr=>arr.slice().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.addedAt||0)-(a.addedAt||0));

  const tabBtn=(id,label)=>h('button',{onClick:()=>{setTab(id);setOpenAlbum(null)},className:'act95',style:{flex:1,padding:'9px 0',fontSize:14,fontWeight:tab===id?600:500,color:tab===id?T.fg:T.sub,borderBottom:'2px solid '+(tab===id?T.fg:'transparent')}},label);
  const grid=items=>items.length
    ?h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,padding:'8px'}},
      items.map(m=>h(MediaThumb,{key:m.id,T,m,onClick:()=>setViewer(m),onLongPress:()=>setActM(m)})))
    :h(EmptyState,{T,icon:Icons.image(40),title:'No photos yet',sub:'Tap + and choose Take photo, Photo library, or Upload files to add images and documents here.'});

  let content;
  if(tab==='all')content=grid(sortP(media));
  else if(tab==='favourites')content=grid(sortP(media.filter(m=>m.favorite)));
  else{ // albums
    if(openAlbum){
      const al=albums.find(a=>a.id===openAlbum);
      content=h('div',null,
        h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px'}},
          h('button',{onClick:()=>setOpenAlbum(null),className:'act90',style:{display:'flex',color:T.fg}},Icons.back(20)),
          h('div',{style:{fontSize:16,fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},al?al.name:'Album'),
          h('button',{onClick:()=>setAddMenu(openAlbum),className:'act90',style:{display:'flex',color:T.accent},title:'Add photos'},Icons.plus(21)),
          h('button',{onClick:()=>{setAlbName(al?al.name:'');setMkAlbum({rename:openAlbum})},className:'act90',style:{display:'flex',color:T.sub}},Icons.pencil(19)),
          h('button',{onClick:()=>{onDeleteAlbum(openAlbum);setOpenAlbum(null);toastFn('Album deleted')},className:'act90',style:{display:'flex',color:T.danger}},Icons.trash(19))),
        grid(sortP(media.filter(m=>m.albumId===openAlbum))));
    }else{
      content=h('div',null,
        h('button',{onClick:()=>{setAlbName('');setMkAlbum({})},className:'act98',style:{display:'flex',alignItems:'center',gap:10,width:'calc(100% - 16px)',margin:'10px 8px',padding:'13px 14px',borderRadius:11,border:'1px dashed '+T.hair,color:T.fg,fontSize:15,fontWeight:500}},Icons.plus(19),'New album'),
        albums.length?h('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,padding:'2px 8px 8px'}},
          albums.map(al=>{const ms=sortP(media.filter(m=>m.albumId===al.id));const cover=ms.find(m=>m.kind==='image');
            return h('button',{key:al.id,onClick:()=>setOpenAlbum(al.id),className:'act96',style:{textAlign:'left',background:'none'}},
              h('div',{style:{position:'relative',paddingTop:'72%',borderRadius:11,overflow:'hidden',background:T.card}},
                cover?h(AlbumCover,{m:cover}):h('div',{style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:T.sub}},Icons.image(30))),
              h('div',{style:{fontSize:14,fontWeight:600,color:T.fg,marginTop:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},al.name),
              h('div',{style:{fontSize:12,color:T.sub}},ms.length+(ms.length===1?' item':' items')));
          }))
          :h('div',{style:{padding:'30px 30px',textAlign:'center',color:T.sub,fontSize:13.5,lineHeight:1.5}},'Create an album to group photos. Long-press any photo and choose "Move to album".'));
    }
  }
  const isImg=actM&&actM.kind==='image';
  return h('div',null,
    h('div',{style:{display:'flex',borderBottom:'1px solid '+T.hair,position:'sticky',top:0,background:T.bg,zIndex:2}},
      tabBtn('all','All photos'),tabBtn('albums','Albums'),tabBtn('favourites','Favourites')),
    content,
    h('div',{style:{height:'calc(30px + '+SAFE_B+')'}}),

    viewer?h(MediaViewer,{T,m:viewer,onClose:()=>setViewer(null),onActions:()=>{const mm=viewer;setViewer(null);setActM(mm)}}):null,

    actM?h(Sheet,{T,onClose:()=>setActM(null)},
      h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair,fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},actM.caption||actM.name),
      h(ARow,{T,icon:Icons.pin(21,actM.pinned),label:actM.pinned?'Unpin':'Pin to top',onClick:()=>{onUpdate(actM.id,m=>({pinned:!m.pinned}));setActM(null)}}),
      h(ARow,{T,icon:Icons.heart(21,actM.favorite),label:actM.favorite?'Remove favourite':'Add to favourites',onClick:()=>{onUpdate(actM.id,m=>({favorite:!m.favorite}));setActM(null)}}),
      h(ARow,{T,icon:Icons.folder(21),label:'Move to album…',onClick:()=>{const mm=actM;setActM(null);setMoveM(mm)}}),
      h(ARow,{T,icon:Icons.pencil(21),label:isImg?'Edit (caption · crop · rotate)':'Edit caption',onClick:()=>{const mm=actM;setActM(null);setEditM(mm)}}),
      h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:()=>{onDelete(actM.id);setActM(null)}})):null,

    moveM?h(Sheet,{T,title:'Move to album',onClose:()=>setMoveM(null)},
      h(ARow,{T,icon:Icons.plus(21),label:'New album…',onClick:()=>{const mm=moveM;setMoveM(null);setAlbName('');setMkAlbum({forMedia:mm.id})}}),
      moveM.albumId?h(ARow,{T,icon:Icons.x(21),label:'Remove from album',onClick:()=>{onUpdate(moveM.id,{albumId:null});setMoveM(null);toastFn('Removed from album')}}):null,
      albums.map(al=>h(ARow,{key:al.id,T,icon:Icons.folder(21),label:al.name,onClick:()=>{onUpdate(moveM.id,{albumId:al.id});setMoveM(null);toastFn('Moved to '+al.name)}})),
      albums.length?null:h('div',{style:{padding:'14px 20px',color:T.sub,fontSize:13.5}},'No albums yet — create one above.')):null,

    mkAlbum?h(Sheet,{T,title:mkAlbum.rename?'Rename album':'New album',onClose:()=>setMkAlbum(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:albName,autoFocus:true,onChange:e=>setAlbName(e.target.value),placeholder:'Album name',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:12}}),
        h('button',{onClick:async()=>{const nm=albName.trim()||'New album';
            if(mkAlbum.rename){onRenameAlbum(mkAlbum.rename,nm)}
            else{const id=await onAddAlbum(nm);if(mkAlbum.forMedia){onUpdate(mkAlbum.forMedia,{albumId:id});toastFn('Moved to '+nm)}else{setTab('albums');setOpenAlbum(id)}}
            setMkAlbum(null)},className:'act96',style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},mkAlbum.rename?'Rename':'Create')) ):null,

    editM?h(PhotoEditor,{T,m:editM,onClose:()=>setEditM(null),onSave:patch=>{onUpdate(editM.id,patch.blob?{caption:patch.caption,blob:patch.blob}:{caption:patch.caption});setEditM(null);toastFn('Saved')}}):null,

    addMenu?h(Sheet,{T,title:'Add to album',onClose:()=>setAddMenu(null)},
      h(ARow,{T,icon:Icons.camera(21),label:'Take photo',sub:'Capture straight into this album',onClick:()=>{const id=addMenu;setAddMenu(null);onPickToAlbum(id,'image/*','environment')}}),
      h(ARow,{T,icon:Icons.image(21),label:'Upload photos / files',sub:'Add new files to this album',onClick:()=>{const id=addMenu;setAddMenu(null);onPickToAlbum(id,'')}}),
      h(ARow,{T,icon:Icons.folder(21),label:'Add from existing photos',sub:'Pick from photos you already have',onClick:()=>{const id=addMenu;setAddMenu(null);setSel({});setAddExisting(id)}})):null,

    addExisting?(()=>{const avail=sortP(media.filter(m=>m.albumId!==addExisting));const ids=Object.keys(sel).filter(k=>sel[k]);
      return h(Sheet,{T,maxH:'90%',onClose:()=>setAddExisting(null)},
        h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'4px 16px 10px',borderBottom:'1px solid '+T.hair}},
          h('button',{onClick:()=>setAddExisting(null),className:'act90',style:{color:T.sub,fontSize:15,padding:6}},'Cancel'),
          h('div',{style:{flex:1,textAlign:'center',fontSize:15,fontWeight:600}},'Add photos'),
          h('button',{onClick:()=>{ids.forEach(id=>onUpdate(id,{albumId:addExisting}));setAddExisting(null);toastFn(ids.length+(ids.length===1?' photo added':' photos added'))},disabled:!ids.length,className:'act90',style:{color:ids.length?T.accent:T.sub,fontSize:15,fontWeight:600,padding:6}},'Add'+(ids.length?' ('+ids.length+')':''))),
        avail.length?h('div',{className:'sy',style:{overflowY:'auto',maxHeight:'66vh'}},
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,padding:'8px'}},
            avail.map(m=>h('div',{key:m.id,style:{position:'relative'}},
              h(MediaThumb,{T,m,onClick:()=>setSel(s=>Object.assign({},s,{[m.id]:!s[m.id]})),onLongPress:()=>{}}),
              h('div',{style:{position:'absolute',top:6,right:6,color:sel[m.id]?T.accent:'#fff',filter:'drop-shadow(0 1px 2px rgba(0,0,0,.6))',display:'flex',pointerEvents:'none'}},Icons.checkCircle(20,!!sel[m.id]))))))
          :h('div',{style:{padding:'30px 24px',textAlign:'center',color:T.sub,fontSize:13.5,lineHeight:1.5}},'No other photos to add. Use Take photo or Upload to add new ones.'));
    })():null
  );
}

function AlbumCover({m}){
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!m||!m.blob)return;const u=URL.createObjectURL(m.blob);setUrl(u);return()=>URL.revokeObjectURL(u)},[m&&m.blob]);
  return url?h('img',{src:url,alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}):null;
}

function MediaViewer({T,m,onClose,onActions}){
  const [url,setUrl]=useState('');
  const [z,setZ]=useState({s:1,x:0,y:0}); // scale + pan offset (px)
  const g=useRef({});        // active gesture
  const lastTap=useRef(0);
  useEffect(()=>{if(!m||!m.blob)return;const u=URL.createObjectURL(m.blob);setUrl(u);return()=>URL.revokeObjectURL(u)},[m&&m.blob]);
  useEffect(()=>{setZ({s:1,x:0,y:0})},[m&&m.id]); // reset zoom when the photo changes
  const isImage=m.kind==='image';
  const setScale=ns=>setZ(p=>{const s=clamp(ns,1,5);return s<=1?{s:1,x:0,y:0}:{s,x:p.x,y:p.y}});
  const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const tStart=e=>{
    if(e.touches.length===2)g.current={mode:'pinch',d0:dist(e.touches)||1,s0:z.s};
    else if(e.touches.length===1)g.current={mode:'pan',x0:e.touches[0].clientX,y0:e.touches[0].clientY,zx:z.x,zy:z.y,moved:false};
  };
  const tMove=e=>{
    const c=g.current;if(!c.mode)return;
    if(c.mode==='pinch'&&e.touches.length===2){e.preventDefault();setScale(c.s0*dist(e.touches)/c.d0)}
    else if(c.mode==='pan'&&e.touches.length===1&&z.s>1){e.preventDefault();const dx=e.touches[0].clientX-c.x0,dy=e.touches[0].clientY-c.y0;if(Math.abs(dx)+Math.abs(dy)>4)c.moved=true;setZ(p=>({...p,x:c.zx+dx,y:c.zy+dy}))}
  };
  const tEnd=e=>{
    const c=g.current;g.current={};
    if(c.mode==='pan'&&!c.moved){ // tap → double-tap toggles zoom
      const now=Date.now();
      if(now-lastTap.current<300){lastTap.current=0;setZ(p=>p.s>1?{s:1,x:0,y:0}:{s:2.5,x:0,y:0})}
      else lastTap.current=now;
    }
  };
  const zoomed=z.s>1.01;
  const ctlBtn=(label,onClick,dis)=>h('button',{onClick,disabled:dis,className:'act90',style:{color:'#fff',opacity:dis?.35:1,width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:500,lineHeight:1}},label);
  return h('div',{style:{position:'fixed',inset:0,zIndex:78,background:'rgba(0,0,0,.96)',display:'flex',flexDirection:'column',paddingTop:SAFE_T}},
    h('div',{style:{display:'flex',alignItems:'center',padding:'8px 12px'}},
      h('button',{onClick:onClose,className:'act90',style:{color:'#fff',display:'flex',padding:6}},Icons.x(24)),
      h('div',{style:{flex:1}}),
      isImage?ctlBtn('−',()=>setScale(z.s-0.5),!zoomed):null,
      isImage?ctlBtn('+',()=>setScale(z.s+0.5),z.s>=5):null,
      h('button',{onClick:onActions,className:'act90',style:{color:'#fff',display:'flex',padding:6}},Icons.dots(24))),
    h('div',{onClick:()=>{if(!zoomed)onClose()},style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',padding:'0 8px'}},
      isImage&&url
        ?h('img',{src:url,alt:m.caption||m.name,onClick:e=>e.stopPropagation(),draggable:false,
          onTouchStart:tStart,onTouchMove:tMove,onTouchEnd:tEnd,
          style:{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',touchAction:'none',willChange:'transform',transform:'translate('+z.x+'px,'+z.y+'px) scale('+z.s+')',transition:g.current.mode?'none':'transform .18s ease'}})
        :h('div',{style:{textAlign:'center',color:'#fff'}},Icons.file(60),h('div',{style:{marginTop:12,fontSize:15}},m.name),
          url?h('a',{href:url,download:m.name,onClick:e=>e.stopPropagation(),style:{display:'inline-block',marginTop:16,color:'#fff',border:'1px solid rgba(255,255,255,.5)',borderRadius:10,padding:'9px 18px',fontSize:14}},'Open / download'):null)),
    m.caption&&isImage?h('div',{style:{color:'#fff',textAlign:'center',padding:'10px 20px calc(14px + '+SAFE_B+')',fontSize:14,lineHeight:1.4}},m.caption):h('div',{style:{height:'calc(10px + '+SAFE_B+')'}}));
}

/* ============================== daily brief ============================== */
const BRIEF_KIND={youtube:{c:'#d4564a',ic:s=>Icons.video(s)},telegram:{c:'#3aa0e0',ic:s=>Icons.send(s)},rss:{c:'#e8801f',ic:s=>Icons.rss(s)}};
function BriefItem({T,item,entries,feedy,done,onToggle,onOpen,onEntry,onLongPress,collapsed,onToggleCollapse}){
  const lp=useLongPress(onLongPress);
  const check=h('button',{onClick:e=>{e.stopPropagation();onToggle()},className:'act90',style:{display:'flex',flexShrink:0,color:done?T.accent:T.sub,padding:2,marginTop:1}},Icons.checkCircle(24,done));
  if(feedy){
    const es=entries||[],K=BRIEF_KIND[item.kind]||BRIEF_KIND.rss;
    const card=e=>h('button',{key:e.id,onClick:()=>onEntry(e),className:'act98',style:{display:'flex',gap:e.thumb?0:8,width:'100%',textAlign:'left',background:T.card,borderRadius:10,overflow:'hidden',alignItems:e.thumb?'stretch':'flex-start',padding:e.thumb?0:'8px 10px'}},
      e.thumb?h('div',{style:{width:92,flexShrink:0,position:'relative',background:T.hair,aspectRatio:'16 / 9'}},
        h('img',{src:e.thumb,alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'},onError:ev=>{ev.target.style.opacity=0}}),
        item.kind==='youtube'?h('span',{style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',filter:'drop-shadow(0 1px 3px rgba(0,0,0,.6))'}},Icons.play(18,true)):null)
        :h('span',{style:{color:K.c,marginTop:1,flexShrink:0,display:'flex'}},K.ic(13)),
      h('div',{style:{flex:1,minWidth:0,padding:e.thumb?'6px 10px':0}},
        h('div',{style:{fontSize:12.5,color:T.fg,lineHeight:1.35,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},e.title||'Update'),
        e.publishedMs?h('div',{style:{fontSize:11,color:T.sub,marginTop:3}},fmtDateShort(e.publishedMs)):null));
    return h('div',Object.assign({},lp,{style:{display:'flex',gap:8,padding:'10px 4px',alignItems:'flex-start'}}),check,
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:6}},
          h('div',{onClick:onOpen,style:{display:'flex',alignItems:'center',gap:6,cursor:'pointer',flex:1,minWidth:0}},
            h('span',{style:{color:K.c,display:'flex',flexShrink:0}},K.ic(15)),
            h('div',{style:{fontSize:14,fontWeight:600,color:T.fg,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',opacity:done?.55:1}},item.name),
            es.length?h('span',{style:{flexShrink:0,fontSize:9,fontWeight:700,color:'#fff',background:K.c,borderRadius:5,padding:'2px 6px'}},es.length+' new'):null),
          onToggleCollapse?h('button',{onClick:()=>onToggleCollapse(),className:'act90',style:{display:'flex',flexShrink:0,color:T.sub,padding:2,transform:collapsed?'none':'rotate(90deg)',transition:'transform 160ms'}},Icons.chevR(13)):null),
        collapsed?null:(es.length?h('div',{style:{marginTop:7,display:'flex',flexDirection:'column',gap:6}},es.slice(0,6).map(card),
          es.length>6?h('button',{onClick:onOpen,style:{fontSize:12,color:T.accent,fontWeight:600,textAlign:'left',padding:'2px'}},'+'+(es.length-6)+' more'):null)
          :h('div',{onClick:onOpen,style:{marginTop:5,fontSize:12,color:T.sub,cursor:'pointer'}},'No new posts since the last brief.'))));
  }
  return h('div',Object.assign({},lp,{style:{display:'flex',gap:10,padding:'11px 4px',alignItems:'center'}}),check,
    h('div',{onClick:onOpen,style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:11,cursor:'pointer'}},
      h('span',{style:{width:32,height:32,borderRadius:9,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}},
        h('img',{src:faviconUrl(item.url),alt:'',style:{width:19,height:19},onError:e=>{e.target.style.opacity=0}})),
      h('div',{style:{minWidth:0}},
        h('div',{style:{fontSize:14.5,fontWeight:500,color:T.fg,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:done?'line-through':'none',opacity:done?.55:1}},item.name),
        h('div',{style:{fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},domainOf(item.url)))),
    h('span',{onClick:onOpen,style:{color:T.sub,display:'flex',cursor:'pointer',flexShrink:0}},Icons.external(17)));
}
const BRIEF_LOG_KEY='insta_brief_log_v1';
const BRIEF_LASTWIN_KEY='insta_brief_lastwin_v1';
const LOG_MAX_AGE=14*24*60*60*1000;
const loadBriefLog=()=>{try{return JSON.parse(localStorage.getItem(BRIEF_LOG_KEY)||'[]')}catch(e){return[]}};
const saveBriefLog=l=>{try{localStorage.setItem(BRIEF_LOG_KEY,JSON.stringify(l))}catch(e){}};
const fmtLogDate=ts=>{const d=new Date(ts),now=new Date(),diff=Math.floor((now-d)/86400000);const ds=d.toLocaleDateString('en',{month:'short',day:'numeric'});if(diff===0)return'Today · '+ds;if(diff===1)return'Yesterday · '+ds;return ds};
/* brief "done" is a map of windowKey -> [itemIds] so checking items off in one
   time-slot is never wiped by another. Reads tolerate the old {key,ids} shape. */
function normalizeDone(done){
  const src=(done&&Array.isArray(done.ids)&&typeof done.key==='string')?(done.key?{[done.key]:done.ids}:{}):(done||{});
  const cutoff=ymd(new Date(Date.now()-30*86400000));const m={};
  for(const k in src){if(!Array.isArray(src[k]))continue;if((k.split('#')[0]||'')>=cutoff)m[k]=src[k].slice()}
  return m;
}
function briefDoneIds(done,key){
  if(!done||!key)return[];
  if(Array.isArray(done[key]))return done[key];
  if(done.key===key&&Array.isArray(done.ids))return done.ids;
  return[];
}
/* Streak engine — a day counts once you clear a whole routine window. */
const BRIEF_STREAK_KEY='insta_brief_streak_v1';
const loadStreakDays=()=>{try{const a=JSON.parse(localStorage.getItem(BRIEF_STREAK_KEY)||'[]');return Array.isArray(a)?a.filter(x=>typeof x==='string'):[]}catch(e){return[]}};
const saveStreakDays=a=>{try{localStorage.setItem(BRIEF_STREAK_KEY,JSON.stringify(a.slice(-400)))}catch(e){}};
const loadBriefFocus=()=>{try{return localStorage.getItem('insta_brief_focus')||'all'}catch(e){return'all'}};
function computeStreak(days){
  const set=new Set(days);if(!set.size)return{current:0,best:0};
  const sorted=[...set].sort();let best=1,run=1;
  for(let i=1;i<sorted.length;i++){const p=new Date(sorted[i-1]+'T00:00:00'),c=new Date(sorted[i]+'T00:00:00');const diff=Math.round((c-p)/86400000);if(diff===1){run++;if(run>best)best=run}else if(diff>1)run=1}
  let current=0;const d=new Date();d.setHours(0,0,0,0);
  if(!set.has(ymd(d))){d.setDate(d.getDate()-1);if(!set.has(ymd(d)))return{current:0,best}}
  while(set.has(ymd(d))){current++;d.setDate(d.getDate()-1)}
  return{current,best:Math.max(best,current)};
}
const BRIEF_PALETTE=['#d4564a','#e8801f','#e0a020','#5cb85c','#2bb5a0','#3aa0e0','#6a7ef0','#9b59b6','#e0517f'];
function groupColor(id){let n=0;const s=String(id||'');for(let i=0;i<s.length;i++)n=(n*31+s.charCodeAt(i))>>>0;return BRIEF_PALETTE[n%BRIEF_PALETTE.length]}
function hexA(hex,a){const m=/^#?([0-9a-fA-F]{6})$/.exec(hex||'');if(!m)return hex||'transparent';const n=parseInt(m[1],16);return'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'}
function BriefView({T,S,brief,onBrief,toastFn,onAskClaude}){
  const groups=brief.groups||[],items=brief.items||[],feeds=brief.feeds||{};
  const snoozedNow=id=>{const u=brief.snoozed&&brief.snoozed[id];return!!(u&&u>Date.now())};
  const vis=items.filter(i=>!snoozedNow(i.id));
  const slots=(brief.slots&&brief.slots.length?brief.slots:BRIEF_SLOTS0).slice().sort((a,b)=>tmin(a.time)-tmin(b.time));
  const now=new Date();
  const [sel,setSel]=useState(null); // slot id being viewed (null = current/active)
  const win=briefWindow(slots,sel,now)||{activeSlotId:'',sel:'',start:0,end:0,key:'',future:null};
  const curSlot=slots.find(s=>s.id===win.sel)||slots[0]||{name:'Routine',time:'00:00'};
  const doneIds=briefDoneIds(brief.done,win.key);
  const [act,setAct]=useState(null);
  const [moveIt,setMoveIt]=useState(null);
  const [edit,setEdit]=useState(null);
  const [grp,setGrp]=useState(null);
  const [gName,setGName]=useState('');
  const [busy,setBusy]=useState(false);
  const [slotSheet,setSlotSheet]=useState(false);
  const [reorderMode,setReorderMode]=useState(false); // shows per-group drag handles only while active
  // Per-group collapse for the brief; persisted so it survives reloads.
  const [collapsed,setCollapsed]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem('insta_brief_collapsed')||'[]'))}catch(e){return new Set()}});
  const toggleCollapse=key=>setCollapsed(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);try{localStorage.setItem('insta_brief_collapsed',JSON.stringify([...n]))}catch(e){}return n});
  /* Group reordering: press-and-drag the handle beside any group's name pill,
     any time — no separate "reorder mode" to enter or exit. dragOver===-1
     means idle; while dragging it tracks which group index is under the
     pointer, both to preview the drop position and to flag the current
     group being dragged (dragInfo.current.srcIdx). */
  const [dragOver,setDragOver]=useState(-1);
  const dragInfo=useRef({active:false,srcIdx:0,startY:0});
  const numGroupsRef=useRef(groups.length);numGroupsRef.current=groups.length;
  const startGroupDrag=(idx,e)=>{
    const y=e.touches?e.touches[0].clientY:e.clientY;
    dragInfo.current={active:true,srcIdx:idx,startY:y};
    setDragOver(idx);
    const onMove=ev=>{
      if(!dragInfo.current.active)return;
      const y2=ev.touches?ev.touches[0].clientY:ev.clientY;
      const dy=y2-dragInfo.current.startY;
      const ng=numGroupsRef.current;
      const step=Math.round(dy/80);
      setDragOver(Math.min(Math.max(dragInfo.current.srcIdx+step,0),ng-1));
    };
    const onEnd=ev=>{
      if(!dragInfo.current.active)return;
      dragInfo.current.active=false;
      const y2=(ev.changedTouches&&ev.changedTouches[0])?ev.changedTouches[0].clientY:ev.clientY||0;
      const dy=y2-dragInfo.current.startY;
      const ng=numGroupsRef.current;
      const src=dragInfo.current.srcIdx;
      const step=Math.round(dy/80);
      const dst=Math.min(Math.max(src+step,0),ng-1);
      if(src!==dst)onBrief(b=>{const gs=[...b.groups];const[mv]=gs.splice(src,1);gs.splice(dst,0,mv);return{...b,groups:gs}});
      setDragOver(-1);
      window.removeEventListener('touchmove',onMove);window.removeEventListener('touchend',onEnd);
      window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onEnd);
    };
    window.addEventListener('touchmove',onMove,{passive:true});window.addEventListener('touchend',onEnd);
    window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onEnd);
  };
  const [briefLog,setBriefLog]=useState(loadBriefLog);
  const [streakDays,setStreakDays]=useState(loadStreakDays);
  const [focus,setFocus]=useState(loadBriefFocus);
  const setFocusP=v=>{setFocus(v);try{localStorage.setItem('insta_brief_focus',v)}catch(e){}};
  const [query,setQuery]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const toggleSearch=()=>setSearchOpen(o=>{const n=!o;if(!n)setQuery('');return n});
  useEffect(()=>{
    if(!win.key)return;
    let stored=null;try{stored=JSON.parse(localStorage.getItem(BRIEF_LASTWIN_KEY)||'null')}catch(e){}
    if(stored&&stored.key&&stored.key!==win.key){
      const oldDoneIds=briefDoneIds(brief.done,stored.key);
      const seenMap=brief.seen||{};
      const missed=[];
      for(const it of items){
        const snz=brief.snoozed&&brief.snoozed[it.id];
        if(oldDoneIds.includes(it.id)||!hasFeed(it)||(snz&&snz>=stored.end))continue;
        const c=feeds[it.id];if(!c||!c.entries)continue;
        const es=c.entries.filter(e=>e.publishedMs>=stored.start&&e.publishedMs<=stored.end&&!seenMap[e.url]);
        if(!es.length)continue;
        const g=groups.find(x=>x.id===it.groupId);
        missed.push({id:it.id,name:it.name,url:it.url,kind:it.kind,groupId:it.groupId,groupName:g?g.name:null,entries:es.map(e=>({title:e.title,url:e.url,publishedMs:e.publishedMs}))});
      }
      if(missed.length){
        const entry={id:uid(),windowKey:stored.key,slotName:stored.slotName,snapshotAt:Date.now(),start:stored.start,end:stored.end,items:missed};
        const cutoff=Date.now()-LOG_MAX_AGE;
        const newLog=[entry,...briefLog].filter(e=>e.snapshotAt>cutoff).slice(0,300);
        setBriefLog(newLog);saveBriefLog(newLog);
      }
    }
    try{localStorage.setItem(BRIEF_LASTWIN_KEY,JSON.stringify({key:win.key,start:win.start,end:win.end,slotName:curSlot.name}))}catch(e){}
  },[win.key]);
  useEffect(()=>{ // best-effort refresh of each feed's recent items
    let live=true;
    (async()=>{for(const it of items){
      if(!hasFeed(it))continue;
      const c=feeds[it.id];if(c&&Date.now()-(c.fetchedAt||0)<20*60*1000)continue;
      try{const es=await fetchFeed(it);if(es&&live)onBrief(b=>({...b,feeds:{...(b.feeds||{}),[it.id]:{fetchedAt:Date.now(),entries:es}}}))}catch(e){}
    }})();
    return()=>{live=false};
  },[]);
  const newEntries=it=>{const c=feeds[it.id];if(!c||!c.entries)return[];return c.entries.filter(e=>e.publishedMs>=win.start&&e.publishedMs<=win.end).sort((a,b)=>b.publishedMs-a.publishedMs)};
  const toggle=id=>{if(!win.key)return;vibrate(8);onBrief(b=>{const map=normalizeDone(b.done);const cur=map[win.key]||[];map[win.key]=cur.includes(id)?cur.filter(x=>x!==id):cur.concat([id]);return{...b,done:map}})};
  const markSeen=urls=>{const list=(urls||[]).filter(Boolean);if(!list.length)return;onBrief(b=>{const s=Object.assign({},b.seen||{});const t=Date.now();list.forEach(u=>{s[u]=t});const cut=t-30*86400000;for(const k in s){if(s[k]<cut)delete s[k]}return{...b,seen:s}})};
  const open=it=>{const u=normalizeUrl(it.url)||it.url;if(u)openExternalUrl(u)};
  const openEntry=e=>{if(e&&e.url){markSeen([e.url]);openExternalUrl(e.url)}};
  const removeItem=id=>onBrief(b=>{const fd=Object.assign({},b.feeds);delete fd[id];return{...b,items:b.items.filter(x=>x.id!==id),feeds:fd}});
  const setItemGroup=(id,groupId)=>onBrief(b=>({...b,items:b.items.map(x=>x.id===id?{...x,groupId}:x)}));
  const setSlot=(id,patch)=>onBrief(b=>({...b,slots:(b.slots||[]).map(s=>s.id===id?{...s,...patch}:s)}));
  const saveItem=f=>{
    const raw=(f.url||'').trim();if(!raw){toastFn('Enter a link or handle');return}
    const patch={kind:f.kind,channelId:f.channelId||'',handle:'',feedUrl:'',url:''};
    if(f.kind==='youtube'){patch.url=patch.channelId?'https://www.youtube.com/channel/'+patch.channelId:(ytTargetUrl(raw)||raw)}
    else if(f.kind==='telegram'){patch.handle=tgHandle(raw);patch.url=patch.handle?'https://t.me/'+patch.handle:(normalizeUrl(raw)||raw)}
    else if(f.kind==='rss'){patch.feedUrl=normalizeUrl(raw)||raw;patch.url=patch.feedUrl}
    else{patch.url=normalizeUrl(raw)||raw}
    let ytName='';if(f.kind==='youtube'){const hm=raw.match(/@([\w.\-]+)/)||(/^[\w.\-]+$/.test(raw)&&!/youtu/i.test(raw)?[null,raw]:null);if(hm)ytName='@'+hm[1]}
    patch.name=(f.name||'').trim()||(patch.handle?'@'+patch.handle:'')||ytName||domainOf(patch.url)||'Item';
    if(f.kind==='telegram'&&!patch.handle)toastFn('Couldn\'t read that Telegram handle');
    // Add/patch the item immediately — never block the sheet on the network.
    let itemId=f.id;
    if(f.id)onBrief(b=>({...b,items:b.items.map(x=>x.id===f.id?{...x,...patch}:x)}));
    else{itemId=uid();const ni={id:itemId,groupId:f.groupId||null,addedAt:Date.now(),...patch};onBrief(b=>({...b,items:b.items.concat([ni])}))}
    setEdit(null);
    // Resolve a YouTube channel id (if needed) and fetch the first feed batch in
    // the background, patching the item once they arrive.
    (async()=>{
      let cid=patch.channelId;
      if(f.kind==='youtube'&&!cid){
        try{cid=await resolveYtChannelId(raw)}catch(e){}
        if(cid)onBrief(b=>({...b,items:b.items.map(x=>x.id===itemId?{...x,channelId:cid,url:'https://www.youtube.com/channel/'+cid}:x)}));
        else toastFn('Couldn\'t find that channel — it\'ll still open as a link');
      }
      const probe={kind:patch.kind,channelId:cid,handle:patch.handle,feedUrl:patch.feedUrl};
      if(hasFeed(probe)){try{const es=await fetchFeed(probe);if(es)onBrief(b=>({...b,feeds:{...(b.feeds||{}),[itemId]:{fetchedAt:Date.now(),entries:es}}}))}catch(e){}}
    })();
  };
  const total=vis.length,doneN=vis.filter(i=>doneIds.includes(i.id)).length;
  const newCount=win.future?0:vis.reduce((n,it)=>n+(hasFeed(it)?newEntries(it).length:0),0);
  useEffect(()=>{ // clearing a whole routine window banks today toward your streak
    if(win.future||!total||doneN!==total)return;
    const t=ymd(new Date());if(streakDays.includes(t))return;
    const nd=streakDays.concat([t]).slice(-400);setStreakDays(nd);saveStreakDays(nd);
    toastFn('Routine complete 🔥');
  },[doneN,total,win.future]);
  const streak=computeStreak(streakDays);
  const [statsOpen,setStatsOpen]=useState(false);
  const [aiBusy,setAiBusy]=useState(false);
  const [digest,setDigest]=useState(null);
  const remindOn=!!brief.remind;
  const snooze=(id,ms)=>{onBrief(b=>({...b,snoozed:{...(b.snoozed||{}),[id]:Date.now()+ms}}));toastFn('Snoozed')};
  const toggleRemind=async()=>{
    if(remindOn){onBrief(b=>({...b,remind:false}));toastFn('Reminders off');return}
    let perm=(typeof Notification!=='undefined')?Notification.permission:'denied';
    if(perm==='default'){try{perm=await Notification.requestPermission()}catch(e){}}
    if(perm!=='granted'){toastFn('Allow notifications to get routine reminders');return}
    onBrief(b=>({...b,remind:true}));toastFn('Reminders on — you’ll be nudged at each routine time');
  };
  useEffect(()=>{ // nudge once when an active window has new content (while the app is open)
    if(!remindOn||win.future||!win.key||newCount<=0)return;
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    let last=null;try{last=localStorage.getItem('insta_brief_notified')}catch(e){}
    if(last===win.key)return;
    try{localStorage.setItem('insta_brief_notified',win.key)}catch(e){}
    try{new Notification((curSlot.name||'Routine')+' · '+newCount+' new',{body:'New updates are waiting in your routine.',icon:'icon-192.png',tag:'insta-routine'})}catch(e){}
  },[win.key,newCount,remindOn]);
  const digestSource=()=>{const out=[];for(const it of vis){if(!hasFeed(it))continue;for(const e of newEntries(it))out.push((it.name||'Source')+': '+(e.title||'').slice(0,160))}
    if(!out.length){for(const entry of briefLog.slice(0,8))for(const it of entry.items)for(const e of it.entries)out.push((it.name||'Source')+': '+(e.title||'').slice(0,160))}
    return out.slice(0,60)};
  const runDigest=async()=>{
    if(!aiReady(S)){toastFn('Connect an AI key in Settings first');return}
    const lines=digestSource();if(!lines.length){toastFn('Nothing new to summarize');return}
    setAiBusy(true);setDigest(null);
    try{const out=await aiChat(S,[
      {role:'system',content:'You turn a list of new posts from feeds someone follows into a short, skimmable briefing.'},
      {role:'user',content:'These are new posts from channels and sites I follow. Group them by theme and give me a concise briefing of 4–8 bullet points on what actually matters, then a final line starting with "Worth your time:" naming the single most important item. Respond entirely in '+(S.aiLang||'English')+'.\n\n'+lines.join('\n')}],
      1200,()=>{});
      setDigest({text:out})}
    catch(e){setDigest({err:(e&&e.message)||'Could not summarize right now'})}
    setAiBusy(false);
  };
  const q=query.trim().toLowerCase();
  const matchQ=it=>!q||(((it.name||'')+' '+domainOf(it.url)).toLowerCase().indexOf(q)>=0);
  const passesFocus=it=>matchQ(it)&&(focus==='todo'?!doneIds.includes(it.id):focus==='new'?(hasFeed(it)&&!win.future&&newEntries(it).length>0):focus==='completed'?doneIds.includes(it.id):true);
  const sections=groups.map(g=>({g,list:vis.filter(i=>i.groupId===g.id)}));
  const ungrouped=vis.filter(i=>!i.groupId||!groups.some(g=>g.id===i.groupId));
  if(ungrouped.length)sections.push({g:null,list:ungrouped});
  const itemRow=it=>h(BriefItem,{key:it.id,T,item:it,feedy:hasFeed(it),entries:win.future?[]:newEntries(it),done:doneIds.includes(it.id),onToggle:()=>toggle(it.id),onOpen:()=>open(it),onEntry:openEntry,onLongPress:()=>setAct(it),collapsed:hasFeed(it)&&collapsed.has(it.id),onToggleCollapse:hasFeed(it)?()=>toggleCollapse(it.id):null});
  const sectionHead=(g,list,gIdx)=>{
    const key=g?g.id:'_other';
    const isOpen=!collapsed.has(key);
    const groupNew=win.future?0:list.reduce((n,it)=>n+(hasFeed(it)?newEntries(it).length:0),0);
    return h('div',{style:{display:'flex',alignItems:'center',gap:6}},
      h('button',{onClick:()=>toggleCollapse(key),className:'act95','aria-label':isOpen?'Collapse group':'Expand group',
        style:{display:'flex',alignItems:'center',gap:7,padding:'8px 12px',borderRadius:999,background:T.card,border:'1px solid '+T.hair,minWidth:0,overflow:'hidden',flex:1}},
        h('span',{style:{display:'flex',color:T.sub,flexShrink:0,transform:isOpen?'rotate(90deg)':'none',transition:'transform 160ms'}},Icons.chevR(12)),
        h('span',{style:{width:8,height:8,borderRadius:4,flexShrink:0,background:g?groupColor(g.id):T.sub}}),
        h('span',{style:{fontSize:12.5,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:T.meta,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,minWidth:0,textAlign:'left'}},g?g.name:'Other'),
        groupNew?h('span',{style:{fontSize:10,fontWeight:700,color:'#fff',background:'#d4564a',borderRadius:999,padding:'2px 7px',flexShrink:0}},groupNew+' new'):h('span',{style:{fontSize:11,color:T.sub,flexShrink:0}},String(list.length))),
      g&&reorderMode?h('button',{onMouseDown:e=>startGroupDrag(gIdx,e),onTouchStart:e=>startGroupDrag(gIdx,e),className:'act90','aria-label':'Reorder group',style:{display:'flex',flexShrink:0,color:T.sub,padding:6,cursor:'grab'}},Icons.drag(16)):null,
      g?h('button',{onClick:()=>{setGName(g.name);setGrp({rename:g.id})},className:'act90','aria-label':'Rename group',style:{display:'flex',flexShrink:0,color:T.sub,padding:4,borderRadius:6}},Icons.pencil(15)):null,
      g?h('button',{onClick:()=>{onBrief(b=>({...b,items:b.items.map(i=>i.groupId===g.id?{...i,groupId:null}:i),groups:b.groups.filter(x=>x.id!==g.id)}))},className:'act90','aria-label':'Delete group',style:{display:'flex',flexShrink:0,color:T.danger,padding:4,borderRadius:6}},Icons.trash(15)):null,
      h('button',{onClick:()=>setEdit({groupId:g?g.id:null,kind:'link',name:'',url:''}),className:'act90','aria-label':'Add item',style:{display:'flex',flexShrink:0,color:T.accent,padding:4,borderRadius:6}},Icons.plus(18)));
  };
  // Brief history as a collapsible section (open when '_history' is in the set).
  const histMissed=briefLog.reduce((n,e)=>n+e.items.reduce((m,i)=>m+i.entries.length,0),0);
  const historySection=()=>{const isOpen=collapsed.has('_history');return h('div',{style:{marginTop:8,borderTop:'1px solid '+T.hair}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'14px 4px 4px'}},
      h('button',{onClick:()=>toggleCollapse('_history'),className:'act90','aria-label':isOpen?'Collapse history':'Expand history',style:{display:'flex',color:T.sub,padding:3,transform:isOpen?'rotate(90deg)':'none',transition:'transform 160ms'}},Icons.chevR(15)),
      h('div',{onClick:()=>toggleCollapse('_history'),style:{flex:1,fontSize:12,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}},'History'+(histMissed?' · '+histMissed+' missed':'')),
      briefLog.length?h('button',{onClick:()=>{setBriefLog([]);saveBriefLog([])},className:'act90','aria-label':'Clear history',style:{display:'flex',color:T.danger,padding:3}},Icons.trash(16)):null),
    isOpen?(briefLog.length===0
      ?h('div',{style:{fontSize:12.5,color:T.sub,padding:'6px 4px 10px',lineHeight:1.5}},'Updates you miss are saved here automatically for 14 days, so you can catch up later.')
      :h('div',null,briefLog.map(entry=>h('div',{key:entry.id,style:{padding:'8px 2px 10px',borderBottom:'1px solid '+T.hair}},
        h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:4}},
          h('div',{style:{flex:1,fontSize:12.5,fontWeight:600,color:T.fg}},entry.slotName+' · '+fmtLogDate(entry.snapshotAt)),
          h('span',{style:{fontSize:11,fontWeight:600,color:'#fff',background:'#d4564a',borderRadius:999,padding:'2px 8px'}},entry.items.reduce((n,i)=>n+i.entries.length,0)+' missed')),
        entry.items.map(it=>h('div',{key:it.id,style:{padding:'2px 0 6px'}},
          h('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',color:T.sub,marginBottom:3}},it.name+(it.groupName?' · '+it.groupName:'')),
          it.entries.map(e=>h('div',{key:e.url||e.publishedMs,onClick:()=>openExternalUrl(e.url),style:{display:'flex',gap:10,padding:'4px 0',cursor:'pointer',alignItems:'flex-start'}},
            h('span',{style:{fontSize:11,color:T.meta,flexShrink:0,paddingTop:2}},new Date(e.publishedMs).toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'})),
            h('span',{style:{fontSize:13,color:T.fg,flex:1,lineHeight:1.4}},(e.title||'(no title)').slice(0,150)))))))))):null);};

  const focusOpts=[['all','All'],['todo','To‑do'],['new','New'],['completed','Completed']];
  const focusRow=total?h('div',{className:'sx',style:{display:'flex',gap:6,overflowX:'auto',padding:'8px 14px 10px'}},
    focusOpts.map(([v,l])=>{const active=focus===v;const cnt=v==='todo'?vis.filter(i=>!doneIds.includes(i.id)).length:v==='new'?newCount:v==='completed'?doneN:vis.length;
      return h('button',{key:v,onClick:()=>setFocusP(v),className:'act95',style:{flexShrink:0,display:'flex',alignItems:'center',gap:6,padding:'6px 13px',borderRadius:16,fontSize:12.5,fontWeight:600,border:'1px solid '+(active?T.fg:T.hair),background:active?T.fg:'transparent',color:active?T.bg:T.sub}},
        l,h('span',{style:{fontSize:11,fontWeight:700,opacity:.75}},String(cnt)))})):null;
  const searchRow=(total&&searchOpen)?h('div',{style:{padding:'0 14px 10px'}},
    h('div',{style:{display:'flex',alignItems:'center',gap:9,background:T.search,border:'1px solid '+(q?T.accent:T.hair),borderRadius:12,padding:'9px 12px',transition:'border-color 160ms'}},
      h('span',{style:{display:'flex',color:q?T.accent:T.sub,flexShrink:0}},Icons.search(17)),
      h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:'Search channels & sites',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
        style:{flex:1,minWidth:0,border:'none',background:'transparent',color:T.fg,fontSize:15,outline:'none'}}),
      query?h('button',{onClick:()=>setQuery(''),className:'act90','aria-label':'Clear search',style:{display:'flex',color:T.sub,flexShrink:0,padding:2}},Icons.x(17)):null)):null;
  const rowBtn=(icon,onClick,active,label,disabled)=>h('button',{onClick,disabled,'aria-label':label,className:'act98',style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',padding:'9px 12px',borderRadius:10,background:active?T.accent:'transparent',color:active?'#fff':T.sub,border:'1px solid '+(active?T.accent:T.hair),opacity:disabled?.5:1}},icon);
  const rowBtnBadge=(icon,onClick,label,badge,disabled)=>h('div',{style:{position:'relative',flexShrink:0}},
    rowBtn(icon,onClick,false,label,disabled),
    badge?h('span',{style:{position:'absolute',top:-4,right:-4,minWidth:16,height:16,padding:'0 4px',borderRadius:8,background:T.danger,color:'#fff',fontSize:9.5,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}},badge):null);
  return h('div',null,
    h('div',{style:{display:'flex',gap:8,padding:'12px 14px 4px'}},
      rowBtn(Icons.search(17),toggleSearch,searchOpen,'Search'),
      rowBtn(Icons.plus(17),()=>{setGName('');setGrp({})},false,'New group'),
      rowBtn(Icons.drag(17),()=>setReorderMode(m=>!m),reorderMode,reorderMode?'Done reordering':'Reorder groups'),
      rowBtn(Icons.bell(17,remindOn),toggleRemind,remindOn,'Routine reminders'),
      rowBtn(Icons.chart(17),()=>setStatsOpen(true),false,'Routine stats'),
      rowBtnBadge(aiBusy?h(Spinner,{T,size:15}):Icons.ai(17),runDigest,'Summarize what’s new',newCount>0?String(newCount):'',aiBusy),
      onAskClaude?rowBtn(Icons.send(17),onAskClaude,false,'Ask Claude about my routine'):null),
    h('div',{className:'sx',style:{display:'flex',gap:6,overflowX:'auto',padding:'10px 14px 8px'}},
      slots.map(s=>h('button',{key:s.id,onClick:()=>setSel(s.id),className:'act95',
        style:{flexShrink:0,padding:'8px 18px',borderRadius:20,fontSize:14,fontWeight:600,border:'none',
          background:s.id===win.sel?T.fg:'transparent',color:s.id===win.sel?T.bg:T.sub}},
        s.name+(s.id===win.activeSlotId?' •':''))),
      h('button',{onClick:()=>setSlotSheet(true),className:'act90',style:{flexShrink:0,display:'flex',alignItems:'center',color:T.sub,padding:'0 8px'}},Icons.calendar(18))),
    focusRow,
    searchRow,
    h('div',{style:{padding:'2px 14px 0'}},
      win.future?h('div',{style:{fontSize:13,color:T.sub,padding:'14px 4px',lineHeight:1.5}},'This routine begins at '+fmtClock(curSlot.time)+'. New content since your last check will appear here then.'):null,
      total?(()=>{
        const isDragging=dragOver!==-1;
        const rendered=sections.map(({g,list},gIdx)=>{
          const key=g?g.id:'_other';
          const flist=list.filter(passesFocus);
          if((focus!=='all'||q)&&!isDragging&&!flist.length)return null;
          const dragThis=isDragging&&dragInfo.current.srcIdx===gIdx;
          const dropHere=isDragging&&dragOver===gIdx&&dragInfo.current.srcIdx!==gIdx;
          const itemsOpen=!(collapsed.has(key)&&!q);
          return h('div',{key,style:{opacity:dragThis?0.4:1,transition:'opacity 120ms',marginBottom:14}},
            h('div',{style:{borderRadius:999,outline:dropHere?'2px solid '+T.accent:'none',outlineOffset:3}},sectionHead(g,list,gIdx)),
            itemsOpen?h('div',{style:{marginTop:6,background:T.bg,borderRadius:14,border:'1px solid '+T.hair,boxShadow:'0 1px 2px rgba(0,0,0,.04)',padding:'4px 13px 6px'}},
              flist.length?flist.map(itemRow):h('div',{style:{fontSize:13,color:T.sub,padding:'8px 4px 12px'}},focus==='all'?'Nothing here yet — tap + to add.':'Nothing matches this filter.')):null);
        });
        return q&&!rendered.some(Boolean)?h('div',{style:{textAlign:'center',color:T.sub,fontSize:14,padding:'34px 20px'}},'No channels or sites match “'+query.trim()+'”.'):rendered;
      })()
        :h(EmptyState,{T,icon:Icons.sun(40),title:'My Routine',sub:'Group the social apps, websites and YouTube channels you go through each day, then check them off.'}),
      historySection(),
      h('div',{style:{height:'calc(24px + '+SAFE_B+')'}})),

    statsOpen?h(Sheet,{T,title:'Your routine stats',onClose:()=>setStatsOpen(false)},(()=>{
      const set=new Set(streakDays);
      const days=[];for(let i=34;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push({k:ymd(d),done:set.has(ymd(d))})}
      const last7=days.slice(-7).filter(d=>d.done).length;
      const stat=(big,lbl,accent)=>h('div',{style:{flex:1,textAlign:'center',padding:'14px 4px',background:T.card,borderRadius:14}},
        h('div',{style:{fontSize:23,fontWeight:800,color:accent||T.fg,display:'flex',alignItems:'center',justifyContent:'center',gap:3}},big),
        h('div',{style:{fontSize:10.5,fontWeight:700,color:T.sub,marginTop:3,textTransform:'uppercase',letterSpacing:'.05em'}},lbl));
      return h('div',{style:{padding:'0 18px calc(20px + '+SAFE_B+')'}},
        h('div',{style:{display:'flex',gap:10,marginBottom:20}},
          stat(h(Fragment,null,h('span',{style:{display:'flex',color:'#e8801f'}},Icons.flame(19)),String(streak.current)),'Current','#e8801f'),
          stat(String(streak.best),'Best'),
          stat(last7+'/7','This week',T.accent)),
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:10}},'Last 5 weeks'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:5}},days.map(d=>h('div',{key:d.k,title:d.k,style:{width:'calc((100% - 30px)/7)',aspectRatio:'1',borderRadius:6,background:d.done?T.accent:T.card,border:'1px solid '+T.hair}}))),
        h('div',{style:{fontSize:12.5,color:T.sub,marginTop:16,lineHeight:1.55}},'A square fills in each day you clear a whole routine window. Keep the streak alive! 🔥'));
    })()):null,

    digest?h(Sheet,{T,title:'What’s new',onClose:()=>setDigest(null)},
      h('div',{style:{padding:'0 20px calc(18px + '+SAFE_B+')'}},
        digest.err?h('div',{style:{color:T.danger,fontSize:14,lineHeight:1.5}},digest.err)
          :h(Fragment,null,
            h('div',{style:{fontSize:11.5,color:T.sub,marginBottom:10}},'Summarized by '+aiModelLabel(S)),
            h('div',{style:{fontSize:15,color:T.fg,lineHeight:1.62,whiteSpace:'pre-wrap'}},digest.text),
            h('div',{style:{display:'flex',gap:8,marginTop:18}},
              h('button',{onClick:()=>{copyText(digest.text);toastFn('Copied')},className:'act95',style:{flex:1,padding:'12px',borderRadius:11,background:T.card,color:T.fg,fontSize:14,fontWeight:600}},'Copy'),
              h('button',{onClick:()=>setDigest(null),className:'act95',style:{flex:1,padding:'12px',borderRadius:11,background:T.fg,color:T.bg,fontSize:14,fontWeight:600}},'Done'))))):null,

    slotSheet?h(Sheet,{T,title:'Brief times',maxH:'90%',onClose:()=>setSlotSheet(false)},
      h('div',{style:{padding:'0 16px calc(18px + '+SAFE_B+')'}},
        h('div',{style:{fontSize:12.5,color:T.sub,margin:'2px 2px 12px',lineHeight:1.45}},'Each brief shows everything new since the previous one. Add as many as you like.'),
        slots.map(s=>h('div',{key:s.id,style:{display:'flex',alignItems:'center',gap:8,marginBottom:10}},
          h('input',{value:s.name,onChange:e=>setSlot(s.id,{name:e.target.value}),placeholder:'Name',
            style:{flex:1,minWidth:0,border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'10px 12px',fontSize:14.5}}),
          h('input',{type:'time',value:s.time,onChange:e=>setSlot(s.id,{time:e.target.value||s.time}),
            style:{border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'10px 10px',fontSize:14.5,colorScheme:(T.id==='dark'||T.id==='black')?'dark':'light'}}),
          (brief.slots||[]).length>1?h('button',{onClick:()=>{if(sel===s.id)setSel(null);onBrief(b=>({...b,slots:(b.slots||[]).filter(x=>x.id!==s.id)}))},className:'act90',style:{display:'flex',color:T.danger,padding:5}},Icons.trash(18)):null)),
        h('button',{onClick:()=>onBrief(b=>({...b,slots:(b.slots||[]).concat([{id:uid(),name:'Routine',time:'12:00'}])})),className:'act98',style:{display:'flex',alignItems:'center',gap:8,marginTop:6,padding:'11px 14px',borderRadius:11,border:'1px dashed '+T.hair,color:T.fg,fontSize:14,fontWeight:500}},Icons.plus(18),'Add a routine'))):null,

    act?h(Sheet,{T,onClose:()=>setAct(null)},
      h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair,fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},act.name),
      h(ARow,{T,icon:Icons.external(21),label:act.kind==='youtube'?'Open channel':'Open',onClick:()=>{const it=act;setAct(null);open(it)}}),
      hasFeed(act)&&feeds[act.id]&&feeds[act.id].entries&&feeds[act.id].entries[0]?h(ARow,{T,icon:Icons.play(21,true),label:'Open latest',onClick:()=>{const e=feeds[act.id].entries[0];setAct(null);openEntry(e)}}):null,
      h(ARow,{T,icon:Icons.checkCircle(21,doneIds.includes(act.id)),label:doneIds.includes(act.id)?'Mark not done':'Mark done',onClick:()=>{toggle(act.id);setAct(null)}}),
      h(ARow,{T,icon:Icons.pencil(21),label:'Edit',onClick:()=>{const it=act;setAct(null);setEdit({id:it.id,groupId:it.groupId,kind:it.kind,name:it.name,url:it.url,channelId:it.channelId})}}),
      h(ARow,{T,icon:Icons.folder(21),label:'Move to group…',onClick:()=>{const it=act;setAct(null);setMoveIt(it)}}),
      h(ARow,{T,icon:Icons.calendar(21),label:'Snooze 1 hour',onClick:()=>{snooze(act.id,3600000);setAct(null)}}),
      h(ARow,{T,icon:Icons.moon(21),label:'Snooze until tomorrow',onClick:()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+1);snooze(act.id,Math.max(60000,d.getTime()-Date.now()));setAct(null)}}),
      h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:()=>{removeItem(act.id);setAct(null)}})):null,

    moveIt?h(Sheet,{T,title:'Move to group',onClose:()=>setMoveIt(null)},
      h(ARow,{T,icon:Icons.x(21),label:'No group (Other)',onClick:()=>{setItemGroup(moveIt.id,null);setMoveIt(null)}}),
      groups.map(g=>h(ARow,{key:g.id,T,icon:Icons.folder(21),label:g.name,onClick:()=>{setItemGroup(moveIt.id,g.id);setMoveIt(null)}})),
      groups.length?null:h('div',{style:{padding:'14px 20px',color:T.sub,fontSize:13.5}},'No groups yet — create one with "New group".')):null,

    grp?h(Sheet,{T,title:grp.rename?'Rename group':'New group',onClose:()=>setGrp(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:gName,autoFocus:true,onChange:e=>setGName(e.target.value),placeholder:'Group name (e.g. Social, Markets)',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:12}}),
        h('button',{onClick:()=>{const nm=gName.trim()||'Group';if(grp.rename)onBrief(b=>({...b,groups:b.groups.map(g=>g.id===grp.rename?{...g,name:nm}:g)}));else onBrief(b=>({...b,groups:b.groups.concat([{id:uid(),name:nm}])}));setGrp(null)},className:'act96',style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},grp.rename?'Rename':'Create'))):null,

    edit?h(Sheet,{T,title:edit.id?'Edit item':'Add item',onClose:()=>setEdit(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}},
          [['link','Site / app'],['youtube','YouTube'],['telegram','Telegram'],['rss','RSS / News']].map(([k,lbl])=>h('button',{key:k,onClick:()=>setEdit({...edit,kind:k}),className:'act95',style:{flex:'1 0 auto',padding:'9px 10px',borderRadius:10,fontSize:13,fontWeight:600,border:'1px solid '+(edit.kind===k?T.accent:T.hair),color:edit.kind===k?T.accent:T.sub,background:edit.kind===k?T.card:'transparent'}},lbl))),
        h('input',{value:edit.name,onChange:e=>setEdit({...edit,name:e.target.value}),placeholder:'Name (optional)',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:10}}),
        h('input',{value:edit.url,onChange:e=>setEdit({...edit,url:e.target.value,channelId:'',handle:'',feedUrl:''}),placeholder:edit.kind==='youtube'?'@handle, channel link, or name':edit.kind==='telegram'?'t.me/durov or @durov':edit.kind==='rss'?'https://…/feed.xml':'https://…',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:6}}),
        h('div',{style:{fontSize:11.5,color:T.sub,marginBottom:12,lineHeight:1.45}},
          edit.kind==='youtube'?'Paste a channel URL, an @handle, or just the handle name (youtube.com/@handle, @handle, or /channel/…). The brief shows its new videos.'
          :edit.kind==='telegram'?'Public channel only (t.me/<name> or @name). The brief shows its new posts.'
          :edit.kind==='rss'?'Any RSS/Atom feed — a news site, blog, Substack, subreddit (.../.rss), or an X/Instagram bridge URL.'
          :'A site or app shortcut — opens in your browser. Use this for accounts with no public feed (Instagram, X, WhatsApp).'),
        h('button',{onClick:()=>saveItem(edit),disabled:busy,className:'act96',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600,opacity:busy?.6:1}},busy?h(Spinner,{T,size:15}):null,busy?'Fetching…':(edit.id?'Save':'Add')))):null);
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
  if(!tags.length)return h(EmptyState,{T,icon:Icons.tag(40),title:'No tags yet',sub:'Long-press any article and choose "Edit tags" to organize your reading with tags.'});
  return h('div',null,tags.map(t=>
    h('button',{key:t,onClick:()=>onPick(t),className:'act98 trc',style:{display:'flex',alignItems:'center',gap:16,width:'100%',padding:'16px 18px',textAlign:'left',color:T.fg,borderBottom:'1px solid '+T.hair}},
      h('span',{style:{display:'flex',color:T.meta}},Icons.tag(20)),
      h('span',{style:{flex:1,fontSize:16}},'#'+t),
      h('span',{style:{fontSize:13,color:T.sub}},String(counts[t])),
      h('span',{style:{display:'flex',color:T.sub}},Icons.chevR(16)))));
}

/* ============================== content editors ============================== */
function EditBlockRow({T,html,removed,onToggle,onLongPress}){
  const lp=useLongPress(onLongPress);
  return h('div',{onClick:()=>{if(!lp.firedRef.current.fired)onToggle()},
    onTouchStart:lp.onTouchStart,onTouchMove:lp.onTouchMove,onTouchEnd:lp.onTouchEnd,
    onMouseDown:lp.onMouseDown,onMouseUp:lp.onMouseUp,onMouseLeave:lp.onMouseLeave,
    onContextMenu:e=>{e.preventDefault();onLongPress()},
    style:{display:'flex',gap:10,alignItems:'flex-start',borderRadius:10,padding:'10px 12px',marginBottom:8,cursor:'pointer',border:'1.5px solid '+(removed?T.danger:T.hair),opacity:removed?0.45:1,background:removed?'transparent':T.card}},
    h('span',{style:{width:22,height:22,borderRadius:6,flexShrink:0,marginTop:1,border:'2px solid '+(removed?T.danger:T.sub),background:removed?T.danger:'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}},removed?Icons.check(14):null),
    h('div',{className:'rc',style:{fontFamily:"'Lora',Georgia,serif",fontSize:14,lineHeight:1.5,color:T.fg,'--accent':T.accent,'--hl':T.hl,'--hair':T.hair,'--card':T.card,'--meta':T.meta,pointerEvents:'none',maxHeight:170,overflow:'hidden',flex:1,minWidth:0},dangerouslySetInnerHTML:{__html:html}}));
}
function EditBlocksSheet({T,article,onSave,onClose}){
  const blocks=useMemo(()=>{
    const d=document.createElement('div');d.innerHTML=article.html;
    return Array.from(d.children).map(c=>c.outerHTML);
  },[article.id]);
  const [removed,setRemoved]=useState({});
  const [rangeMenu,setRangeMenu]=useState(null); // index of the long-pressed block, or null
  const count=Object.keys(removed).filter(k=>removed[k]).length;
  const toggle=i=>setRemoved(r=>({...r,[i]:!r[i]}));
  const removeRange=(from,to)=>{ // inclusive
    setRemoved(r=>{
      const n={...r};
      for(let j=from;j<=to;j++)n[j]=true;
      return n;
    });
    setRangeMenu(null);
  };
  const canSave=count<blocks.length;
  return h(Sheet,{T,onClose,title:'Remove blocks',maxH:'94%'},
    h('div',{style:{padding:'0 20px 8px'}},
      h('div',{style:{fontSize:12.5,color:T.meta,lineHeight:1.5}},'Tap the parts you want to remove, or long-press a block to clear everything above or below it, then tap Save.')),
    h('div',{style:{padding:'0 14px calc(76px + '+SAFE_B+')'}}, // bottom padding keeps the last block clear of the floating Save button
      blocks.map((b,i)=>h(EditBlockRow,{key:i,T,html:b,removed:!!removed[i],onToggle:()=>toggle(i),onLongPress:()=>setRangeMenu(i)}))),
    h('button',{onClick:()=>onSave(blocks.filter((_,i)=>!removed[i]).join('\n')),disabled:!canSave,className:'act90 trt',
      'aria-label':count?('Save — remove '+count+' block'+(count>1?'s':'')):'Save',
      style:{position:'fixed',right:18,bottom:'calc(18px + '+SAFE_B+')',width:58,height:58,borderRadius:'50%',background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 6px 22px rgba(0,0,0,.32)',opacity:canSave?1:0.4}},
      Icons.download(24),
      count?h('span',{style:{position:'absolute',top:-3,right:-3,minWidth:20,height:20,padding:'0 5px',borderRadius:10,background:T.danger,color:'#fff',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}},count):null),
    rangeMenu!==null?h(Sheet,{T,onClose:()=>setRangeMenu(null),title:'Block '+(rangeMenu+1)+' of '+blocks.length,z:95},
      h(ARow,{T,icon:h('span',{style:{display:'flex',transform:'rotate(-90deg)'}},Icons.chevR(20)),label:'Remove everything above',sub:'Clears the top through this block',onClick:()=>removeRange(0,rangeMenu)}),
      h(ARow,{T,icon:h('span',{style:{display:'flex',transform:'rotate(90deg)'}},Icons.chevR(20)),label:'Remove everything below',sub:'Clears this block through the end',onClick:()=>removeRange(rangeMenu,blocks.length-1)})):null);
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
function AISheet({T,S,article,articles,brief,initialView,update,onClose,onSaveCopy,onSaveNote,toastFn}){
  const [ctx,setCtx]=useState(article||null);
  const [view,setView]=useState(initialView||'menu'); // menu | langs | styles | ask | result | addRoutine | addRoutineConfirm | claude | claudeLib | claudeRoutine
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [result,setResult]=useState(null); // {kind,text,lang}
  const [question,setQuestion]=useState('');
  const [keyDraft,setKeyDraft]=useState('');
  const [routineText,setRoutineText]=useState('');
  const [routinePick,setRoutinePick]=useState(null); // {kind,query,name,groupId}
  const [claudeText,setClaudeText]=useState('');
  const [routineSel,setRoutineSel]=useState(null); // Set of entry urls picked for the Claude routine digest; null = not yet defaulted
  const [routineModes,setRoutineModes]=useState({transcript:false,summarize:true,newsletter:false});
  const [speaking,setSpeaking]=useState(false);
  const sess=useRef(0);
  const speakingRef=useRef(false);
  useEffect(()=>()=>{sess.current++;if(speakingRef.current){try{speechSynthesis.cancel()}catch(e){}}},[]);

  const ready=aiReady(S);
  const outLang=S.aiLang||'English';
  const setLang=l=>update(d=>({...d,settings:{...d.settings,aiLang:l}}));
  const ctxText=ctx?((ctx.title||'')+'\n\n'+(ctx.text||'')).slice(0,15000):'';
  const isVid=!!(ctx&&ctx.isVideo); // videos are summarised/transcribed via Gemini's video understanding

  /* Recent entries per My Routine source, newest first, capped per source so the
     picker stays scannable. isNew mirrors BriefView's current window so "what's
     new" defaults to checked without forcing the user to hand-pick everything. */
  const routineGroups=useMemo(()=>{
    if(!brief)return[];
    const slots=(brief.slots&&brief.slots.length?brief.slots:BRIEF_SLOTS0);
    const win=briefWindow(slots,null,new Date())||{start:0,end:0};
    const snoozedNow=id=>{const u=brief.snoozed&&brief.snoozed[id];return!!(u&&u>Date.now())};
    return(brief.items||[]).filter(it=>hasFeed(it)&&!snoozedNow(it.id)).map(it=>{
      const c=(brief.feeds||{})[it.id];
      const entries=(c&&c.entries?c.entries:[]).filter(e=>e.url).slice().sort((a,b)=>b.publishedMs-a.publishedMs).slice(0,8)
        .map(e=>({...e,isNew:e.publishedMs>=win.start&&e.publishedMs<=win.end,isVideo:it.kind==='youtube',sourceName:it.name}));
      return{item:it,entries};
    }).filter(g=>g.entries.length);
  },[brief]);
  useEffect(()=>{ // default-select this window's new items the first time the picker opens
    if(view==='claudeRoutine'&&routineSel===null){
      const s=new Set();
      routineGroups.forEach(g=>g.entries.forEach(e=>{if(e.isNew)s.add(e.url)}));
      setRoutineSel(s);
    }
  },[view]);
  const toggleRoutineEntry=url=>setRoutineSel(prev=>{const s=new Set(prev||[]);s.has(url)?s.delete(url):s.add(url);return s});
  const toggleRoutineMode=k=>setRoutineModes(m=>({...m,[k]:!m[k]}));
  const selectAllNewRoutine=()=>{const s=new Set();routineGroups.forEach(g=>g.entries.forEach(e=>{if(e.isNew)s.add(e.url)}));setRoutineSel(s)};

  const run=async(label,fn)=>{
    setError('');setBusy(label);
    try{await fn()}catch(e){setError((e&&e.message)||'Something went wrong');setView('menu')}
    setBusy('');
  };
  /* Claude-app provider: compose the request and hand it to the Claude app —
     no API key, no waiting inside Instapaper */
  const usingClaude=(S.aiProvider||'openrouter')==='claude';
  const claudeArticleBlock=()=>ctx?'\n\n----- '+(isVid?'VIDEO':'ARTICLE')+' -----\n'+(ctx.title||'')+(ctx.url?'\nSource: '+ctx.url:'')+(ctx.text?'\n\n'+String(ctx.text).slice(0,6000):''):'';
  const handOff=p=>{if(openInClaude(p+claudeArticleBlock(),toastFn))onClose()};
  const doSummarize=()=>{
    if(usingClaude)return handOff('Summarize this '+(isVid?'video (fetch its transcript yourself)':'article')+' as 5-8 concise bullet points followed by one line starting with "Takeaway:". Respond entirely in '+outLang+'.');
    run('Summarizing…',async()=>{
    const out=isVid
      ?await aiVideo(S,'Summarize this video as 5–8 concise bullet points covering the key ideas, followed by one line starting with "Takeaway:". Respond entirely in '+outLang+'.',ctx.url,1600,setBusy)
      :await aiChat(S,[
        {role:'system',content:'You are a precise reading assistant.'},
        {role:'user',content:'Summarize the following article as 5–8 concise bullet points followed by one line starting with "Takeaway:". Respond entirely in '+outLang+'.\n\n'+ctxText}],1600,setBusy);
    setResult({kind:'Summary',text:out,lang:outLang});setView('result');
  })};
  const doTranscript=()=>{
    if(usingClaude)return handOff('Fetch the transcript of this video yourself and transcribe everything spoken into clean, readable text with natural paragraphs. No timestamps, speaker labels, or commentary'+(outLang!=='English'?' — translated into '+outLang:'')+'.');
    run('Transcribing…',async()=>{
    const out=await aiVideo(S,'Transcribe everything spoken in this video into clean, readable text. Use natural paragraphs. Do NOT add timestamps, speaker labels, or any commentary — output only the spoken words'+(outLang!=='English'?', translated into '+outLang:'')+'.',ctx.url,8192,setBusy);
    setResult({kind:'Transcript',text:out,lang:outLang,transcript:true});setView('result');
  })};
  const doTranslate=lang=>{
    if(usingClaude)return handOff('Translate this article into '+lang+'. Keep the same paragraphs. Output only the translation.');
    run('Translating…',async()=>{
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
  })};
  const doRewrite=([style,instr])=>{
    if(usingClaude)return handOff(instr+'. Respond entirely in '+outLang+', output only the rewritten text.');
    run('Rewriting…',async()=>{
    const out=await aiChat(S,[
      {role:'system',content:'You are an expert editor.'},
      {role:'user',content:instr+'. Respond entirely in '+outLang+', output only the rewritten text.\n\n'+ctxText}],4000,setBusy);
    setResult({kind:'Rewrite — '+style,text:out,lang:outLang,rewrite:true});setView('result');
  })};
  const doAsk=()=>{const q=question.trim();if(!q)return;
    if(usingClaude)return handOff(q+(ctx?'\n\nAnswer using the '+(isVid?'video (fetch its transcript yourself)':'article')+' below. Respond in '+outLang+'.':''));
    run('Thinking…',async()=>{
    let out;
    if(isVid){
      out=await aiVideo(S,'Answer this question about the video. Be concise and concrete, using only what the video actually says. Respond in '+outLang+'.\n\nQuestion: '+q,ctx.url,2000,setBusy);
    }else{
      const msgs=ctx
        ?[{role:'system',content:'Answer using the article below. Be concise and concrete. Respond in '+outLang+'.\n\nARTICLE:\n'+ctxText},{role:'user',content:q}]
        :[{role:'system',content:'You are a helpful assistant. Respond in '+outLang+'.'},{role:'user',content:q}];
      out=await aiChat(S,msgs,2000,setBusy);
    }
    setResult({kind:'Answer',text:out,lang:outLang});setView('result');
  })};
  const doResolveRoutine=()=>{
    const t=routineText.trim();if(!t)return;
    run('Looking that up…',async()=>{
      const obj=await aiResolveSource(S,t);
      const groups=(brief&&brief.groups)||[];
      const gLower=(obj.group||'').trim().toLowerCase();
      const matched=gLower?groups.find(g=>g.name.toLowerCase()===gLower||g.name.toLowerCase().includes(gLower)||gLower.includes(g.name.toLowerCase())):null;
      setRoutinePick({kind:obj.kind,query:obj.query,name:obj.name||obj.query,groupId:matched?matched.id:null});
      setView('addRoutineConfirm');
    });
  };
  const doAddRoutine=()=>{
    if(!routinePick)return;
    const added=addBriefSourceViaUpdate(update,{kind:routinePick.kind,raw:routinePick.query,name:routinePick.name,groupId:routinePick.groupId});
    if(!added){toastFn('Nothing to add');return}
    toastFn('Added "'+added.name+'" to My Routine');
    setRoutineText('');setRoutinePick(null);setView('menu');
  };
  const CLAUDE_PRESETS=[
    'Summarize this in clear bullet points',
    'Give me the key takeaways and why they matter',
    'Translate this into '+(outLang==='English'?'Telugu':outLang),
    'Explain this simply, like I\'m new to the topic',
    'What are the strongest counterarguments?',
    'Turn this into a short thread I can post'
  ];
  const CLAUDE_LIB_PRESETS=[
    'What should I read next and why?',
    'Summarize the main themes across my saved reading',
    'Group these into topics for me',
    'Which of these are worth my time today?'
  ];
  const doClaude=()=>{
    const cmd=claudeText.trim();
    let p=cmd||(ctx?'Summarize this article and give me the key takeaways.':'');
    if(!p){toastFn('Type what Claude should do');return}
    if(ctx){
      p+='\n\n----- ARTICLE -----\n'+(ctx.title||'')+(ctx.url?'\nSource: '+ctx.url:'')+'\n\n'+String(ctx.text||'').slice(0,6000);
    }
    if(openInClaude(p,toastFn)){setClaudeText('');onClose()}
  };
  /* Free-form Q&A over the whole saved library, handed to the Claude app. We
     send a compact index (title · source · length · link) of everything saved;
     openInClaude copies the full index to the clipboard when it overflows the URL. */
  const doClaudeLibrary=()=>{
    const arts=(articles||[]).filter(a=>a&&(a.title||a.text));
    if(!arts.length){toastFn('Nothing saved yet');return}
    const q=claudeText.trim()||'Help me decide what to read next and summarize the main themes across these.';
    const index=arts.slice(0,60).map((a,i)=>(i+1)+'. '+(a.title||'Untitled')+' — '+(a.source||domainOf(a.url)||'')+(a.readMin?' · '+a.readMin+' min':'')+(a.url?'\n   '+a.url:'')).join('\n');
    const p=q+'\n\n----- MY SAVED READING LIBRARY ('+arts.length+' item'+(arts.length===1?'':'s')+') -----\n'+index;
    if(openInClaude(p,toastFn)){setClaudeText('');onClose()}
  };
  /* Hand a picked set of My Routine updates (articles + videos) to the Claude
     app. The three modes combine into one instruction — e.g. Transcript +
     Newsletter asks Claude to pull each video's transcript itself (we have no
     API key to fetch it locally) and fold everything into a newsletter. */
  const doClaudeRoutine=()=>{
    const sel=routineSel||new Set();
    const chosen=[];
    routineGroups.forEach(g=>g.entries.forEach(e=>{if(sel.has(e.url))chosen.push(e)}));
    if(!chosen.length){toastFn('Pick at least one item');return}
    const m=routineModes;
    const instrParts=[];
    if(m.transcript)instrParts.push('For any YouTube video links below, fetch the transcript yourself and base your response on the actual spoken content, not just the title.');
    if(m.summarize)instrParts.push('Summarize the key points across everything below, grouped by theme, as concise bullets.');
    if(m.newsletter)instrParts.push('Compile everything into a polished, ready-to-send newsletter — a short friendly intro, one section per topic with a couple of sentences each, and a closing line.');
    if(!instrParts.length){toastFn('Pick what Claude should do');return}
    const lines=chosen.map((e,i)=>(i+1)+'. '+(e.isVideo?'[Video] ':'')+e.sourceName+' — '+(e.title||'Untitled')+'\n   '+e.url);
    const p=instrParts.join(' ')+'\n\n----- MY ROUTINE — SELECTED ITEMS ('+chosen.length+') -----\n'+lines.join('\n');
    if(openInClaude(p,toastFn)){setRoutineSel(null);onClose()}
  };

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
  if(view==='claude'){
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px'}},
        h('div',{style:{fontSize:13,color:T.meta,marginBottom:10,lineHeight:1.5}},'Send a command to the ',h('strong',{style:{color:T.fg}},'Claude app'),' — no API key needed, it uses your own Claude account.'),
        ctx?h('div',{style:{fontSize:12.5,color:T.accent,marginBottom:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'Includes this article: '+ctx.title):null,
        h('textarea',{value:claudeText,onChange:e=>setClaudeText(e.target.value),rows:3,placeholder:ctx?'What should Claude do with this article?':'Type anything for Claude to do…',autoFocus:true,
          style:{width:'100%',padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15,lineHeight:1.5,resize:'none',fontFamily:UIF}}),
        ctx?h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginTop:10}},
          CLAUDE_PRESETS.map(p=>chip(p,claudeText===p,()=>setClaudeText(p)))):null,
        h(PrimaryBtn,{T,label:'Open in Claude',style:{margin:'14px 0 0',width:'100%'},onClick:doClaude}),
        h('div',{style:{fontSize:11.5,color:T.sub,textAlign:'center',marginTop:10,lineHeight:1.5}},'Opens the Claude app if installed, otherwise claude.ai. The full prompt is copied to your clipboard as a backup.')));
  }else if(view==='claudeLib'){
    const n=(articles||[]).filter(a=>a&&(a.title||a.text)).length;
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px'}},
        h('div',{style:{fontSize:13,color:T.meta,marginBottom:10,lineHeight:1.5}},'Ask ',h('strong',{style:{color:T.fg}},'Claude'),' anything about everything you\'ve saved — no API key. It receives an index of your ',h('strong',{style:{color:T.fg}},n+' saved item'+(n===1?'':'s')),' (titles, sources, links) to reason over.'),
        h('textarea',{value:claudeText,onChange:e=>setClaudeText(e.target.value),rows:3,placeholder:'e.g. Which of my saved articles cover AI policy? Build me a reading plan.',autoFocus:true,
          style:{width:'100%',padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15,lineHeight:1.5,resize:'none',fontFamily:UIF}}),
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',marginTop:10}},
          CLAUDE_LIB_PRESETS.map(p=>chip(p,claudeText===p,()=>setClaudeText(p)))),
        h(PrimaryBtn,{T,label:'Ask Claude',disabled:!n,style:{margin:'14px 0 0',width:'100%'},onClick:doClaudeLibrary}),
        h('div',{style:{fontSize:11.5,color:T.sub,textAlign:'center',marginTop:10,lineHeight:1.5}},'Opens the Claude app if installed, otherwise claude.ai. The full library index is copied to your clipboard as a backup.')));
  }else if(view==='claudeRoutine'){
    const sel=routineSel||new Set();
    const m=routineModes;
    const newCount=routineGroups.reduce((n,g)=>n+g.entries.filter(e=>e.isNew).length,0);
    const anyMode=m.transcript||m.summarize||m.newsletter;
    const modeRow=(key,label,sub)=>h('button',{key,onClick:()=>toggleRoutineMode(key),className:'act95',style:{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 4px',textAlign:'left'}},
      h('span',{style:{display:'flex',flexShrink:0,color:m[key]?T.accent:T.sub}},Icons.checkCircle(21,m[key])),
      h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14.5,color:T.fg,fontWeight:500}},label),h('div',{style:{fontSize:12,color:T.sub,marginTop:1}},sub)));
    const entryRow=e=>h('button',{key:e.url,onClick:()=>toggleRoutineEntry(e.url),className:'act95',style:{display:'flex',alignItems:'flex-start',gap:9,width:'100%',padding:'6px 4px',textAlign:'left'}},
      h('span',{style:{display:'flex',flexShrink:0,color:sel.has(e.url)?T.accent:T.sub,marginTop:1}},Icons.checkCircle(18,sel.has(e.url))),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:13.5,color:T.fg,lineHeight:1.35}},(e.isVideo?'▶ ':'')+(e.title||'Untitled')),
        e.isNew?h('span',{style:{fontSize:10,fontWeight:700,color:T.accent,letterSpacing:'.03em'}},'NEW'):null));
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px'}},
        h('div',{style:{fontSize:13,color:T.meta,marginBottom:12,lineHeight:1.5}},'Send your ',h('strong',{style:{color:T.fg}},'My Routine'),' updates to the ',h('strong',{style:{color:T.fg}},'Claude app'),' — no API key.'),
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:2}},'What should Claude do?'),
        modeRow('transcript','Transcript','For videos — Claude fetches the transcript itself'),
        modeRow('summarize','Summarize','Key points across everything selected'),
        modeRow('newsletter','Newsletter','Compile into a ready-to-send newsletter'),
        routineGroups.length?h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'18px 0 4px'}},
          h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},'Items · '+sel.size+' selected'),
          h('div',{style:{display:'flex',gap:14}},
            h('button',{onClick:selectAllNewRoutine,style:{fontSize:12.5,color:T.accent,fontWeight:600}},'New ('+newCount+')'),
            h('button',{onClick:()=>setRoutineSel(new Set()),style:{fontSize:12.5,color:T.sub,fontWeight:600}},'Clear'))):null,
        routineGroups.length?routineGroups.map(g=>h('div',{key:g.item.id,style:{marginBottom:8}},
          h('div',{style:{fontSize:12,fontWeight:600,color:T.meta,padding:'6px 0 2px'}},g.item.name),
          g.entries.map(entryRow))):h('div',{style:{padding:'10px 0',fontSize:13.5,color:T.sub,lineHeight:1.5}},'No routine items with recent updates yet — add channels, accounts, or sites in My Routine first.'),
        h(PrimaryBtn,{T,label:'Ask Claude',disabled:!(anyMode&&sel.size),style:{margin:'16px 0 0',width:'100%'},onClick:doClaudeRoutine}),
        h('div',{style:{fontSize:11.5,color:T.sub,textAlign:'center',margin:'10px 0 4px',lineHeight:1.5}},'Opens the Claude app if installed, otherwise claude.ai. The full list is copied to your clipboard as a backup.')));
  }else if(!ready){
    const prov=S.aiProvider||'openrouter';
    const isGem=prov==='gemini';
    body=h('div',{style:{padding:'0 20px'}},
      h('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},
        chip('Claude app',false,()=>{update(d=>({...d,settings:{...d.settings,aiProvider:'claude'}}));toastFn('AI now opens in the Claude app — no key needed')}),
        chip('OpenRouter',!isGem,()=>update(d=>({...d,settings:{...d.settings,aiProvider:'openrouter'}}))),
        chip('Google Gemini',isGem,()=>update(d=>({...d,settings:{...d.settings,aiProvider:'gemini'}})))),
      h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,marginBottom:12,padding:'10px 12px',borderRadius:10,background:T.card}},'✦ Tip: pick "Claude app" above to use Summarize, Translate, Rewrite, and Ask with no API key at all — each opens ready-made in the Claude app.'),
      h('div',{style:{fontSize:14,color:T.meta,lineHeight:1.55,marginBottom:14}},
        isGem?'Connect a free Google Gemini API key to unlock AI summaries, translation (Telugu, Hindi & more), rewriting, and Q&A. Create one in seconds at ':'Connect a free OpenRouter API key to unlock AI summaries, translation (Telugu, Hindi & more), rewriting, and Q&A. Create one in seconds at ',
        isGem?h('a',{href:'https://aistudio.google.com/apikey',target:'_blank',rel:'noopener',style:{color:T.accent}},'aistudio.google.com/apikey')
             :h('a',{href:'https://openrouter.ai/keys',target:'_blank',rel:'noopener',style:{color:T.accent}},'openrouter.ai/keys'),'.'),
      h('input',{value:keyDraft,onChange:e=>setKeyDraft(e.target.value),placeholder:isGem?'AIza…':'sk-or-v1-…',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
        style:{width:'100%',padding:'13px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:14,fontFamily:'ui-monospace,monospace'}}),
      h(PrimaryBtn,{T,label:'Save key',disabled:!keyDraft.trim(),style:{margin:'14px 0 0',width:'100%'},onClick:()=>{update(d=>({...d,settings:{...d.settings,[isGem?'geminiKey':'aiKey']:keyDraft.trim()}}));toastFn('AI connected')}}),
      h('div',{style:{display:'flex',alignItems:'center',gap:10,margin:'18px 0 4px'}},h('div',{style:{flex:1,height:1,background:T.hair}}),h('span',{style:{fontSize:12,color:T.sub}},'or, no key needed'),h('div',{style:{flex:1,height:1,background:T.hair}})),
      h(ARow,{T,icon:Icons.send(20),label:ctx?'Use the Claude app instead':'Open in Claude',sub:'Send commands to Claude with your own account',onClick:()=>{setClaudeText('');setView('claude')}}),
      ctx?null:h(ARow,{T,icon:Icons.folder(20),label:'Ask Claude about my library',sub:'Q&A across everything you\'ve saved',onClick:()=>{setClaudeText('');setView('claudeLib')}}),
      ctx?null:h(ARow,{T,icon:Icons.newspaper(20),label:'Ask Claude about my routine',sub:'Transcript, summary, or newsletter',onClick:()=>{setView('claudeRoutine')}}));
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
        (result.translation||result.rewrite||result.transcript)&&ctx?h(PrimaryBtn,{T,style:{margin:'16px 0 0',width:'100%'},label:'Save as new article',onClick:()=>onSaveCopy(ctx,result)}):null));
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
  }else if(view==='addRoutine'){
    body=h('div',null,backBtn,
      h('div',{style:{padding:'0 20px'}},
        h('div',{style:{fontSize:13,color:T.meta,marginBottom:10,lineHeight:1.45}},'Describe a channel, account, or paste a link — the AI will figure out what it is and add it to My Routine.'),
        h('textarea',{value:routineText,onChange:e=>setRoutineText(e.target.value),rows:3,placeholder:'e.g. Vaibhav Sisinty’s YouTube channel, or @mufaddal_vohra, or a link',autoFocus:true,
          style:{width:'100%',padding:'12px 14px',borderRadius:11,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:15,lineHeight:1.5,resize:'none',fontFamily:UIF}}),
        h(PrimaryBtn,{T,label:'Find it',disabled:!routineText.trim(),style:{margin:'12px 0 0',width:'100%'},onClick:doResolveRoutine})));
  }else if(view==='addRoutineConfirm'&&routinePick){
    const groups=(brief&&brief.groups)||[];
    const KIND_LABEL={youtube:'YouTube channel',telegram:'Telegram channel',rss:'RSS / News feed',link:'Site / app'};
    body=h('div',null,
      h('button',{onClick:()=>{setRoutinePick(null);setView('addRoutine')},className:'act95',style:{display:'flex',alignItems:'center',gap:5,color:T.accent,fontSize:14.5,fontWeight:500,padding:'2px 20px 10px'}},Icons.back(16),'Try again'),
      h('div',{style:{padding:'0 20px 6px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:12,background:T.card}},
          h('span',{style:{color:T.accent,display:'flex',flexShrink:0}},Icons.ai(20)),
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontSize:15.5,fontWeight:600,color:T.fg,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},routinePick.name),
            h('div',{style:{fontSize:12,color:T.sub,marginTop:2}},KIND_LABEL[routinePick.kind])))),
      groups.length?h('div',{style:{padding:'10px 20px 4px'}},
        h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,marginBottom:8}},'Group'),
        h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto'}},
          chip('No group',routinePick.groupId===null,()=>setRoutinePick(p=>({...p,groupId:null}))),
          groups.map(g=>chip(g.name,routinePick.groupId===g.id,()=>setRoutinePick(p=>({...p,groupId:g.id}))))))
        :null,
      h('div',{style:{padding:'16px 20px 0'}},h(PrimaryBtn,{T,label:'Add to My Routine',onClick:doAddRoutine})));
  }else if(!ctx){
    body=h('div',null,
      error?h('div',{style:{margin:'0 20px 12px',padding:'11px 14px',borderRadius:10,background:T.card,fontSize:13,color:T.danger,lineHeight:1.45}},error):null,
      h(ARow,{T,icon:Icons.send(20),label:'Open in Claude',sub:'Send any command to the Claude app — no API key',onClick:()=>{setClaudeText('');setView('claude')}}),
      h(ARow,{T,icon:Icons.folder(20),label:'Ask Claude about my library',sub:'Q&A across everything you\'ve saved — no API key',onClick:()=>{setClaudeText('');setView('claudeLib')}}),
      h(ARow,{T,icon:Icons.newspaper(20),label:'Ask Claude about my routine',sub:'Transcript, summary, or newsletter from what you follow',onClick:()=>{setView('claudeRoutine')}}),
      h(ARow,{T,icon:Icons.ai(20),label:'Ask AI anything',sub:'Chat with the built-in AI'+(ready?'':' (needs a key)'),onClick:()=>setView('ask')}),
      h(ARow,{T,icon:Icons.sun(20),label:'Add to My Routine',sub:'Follow a channel, account, or site',onClick:()=>{setRoutineText('');setRoutinePick(null);setView('addRoutine')}}));
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
      isVid?[
        h(ARow,{key:'sum',T,icon:Icons.notes(20),label:'Summarize',sub:'Key points + takeaway in '+outLang,onClick:doSummarize}),
        h(ARow,{key:'tr',T,icon:Icons.headphones(20),label:'Full transcript',sub:'Speech-to-text · save & listen',onClick:doTranscript}),
        h(ARow,{key:'ask',T,icon:Icons.ai(20),label:'Ask about this video',sub:'Any question, answered from the video',onClick:()=>setView('ask')}),
        h(ARow,{key:'cl',T,icon:Icons.send(20),label:'Open in Claude',sub:'Hand this video to the Claude app — no API key',onClick:()=>{setClaudeText('');setView('claude')}})
      ]:[
        h(ARow,{key:'sum',T,icon:Icons.notes(20),label:'Summarize',sub:'Key points + takeaway in '+outLang,onClick:doSummarize}),
        h(ARow,{key:'tl',T,icon:Icons.globe(20),label:'Translate',sub:'Telugu, Hindi, and many more',onClick:()=>setView('langs')}),
        h(ARow,{key:'rw',T,icon:Icons.pencil(20),label:'Rewrite',sub:'Simplify · Shorten · Change tone',onClick:()=>setView('styles')}),
        h(ARow,{key:'ask',T,icon:Icons.ai(20),label:'Ask about this article',sub:'Any question, answered from the text',onClick:()=>setView('ask')}),
        h(ARow,{key:'cl',T,icon:Icons.send(20),label:'Open in Claude',sub:'Hand this article to the Claude app — no API key',onClick:()=>{setClaudeText('');setView('claude')}})
      ]);
  }

  return h(Sheet,{T,onClose:busy?()=>{}:onClose,title:'✦ AI Assistant',maxH:'92%'},
    body,
    ready&&!busy?h('div',{style:{padding:'14px 20px 0',fontSize:11.5,color:T.sub,textAlign:'center'}},
      usingClaude?'Opens in the Claude app — free, no API key. Change in Settings → AI.':'Model: '+aiModelLabel(S)+' — change in Settings'):null);
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
        if(p1!==p2){setVerr('Passcodes don\'t match');return}
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
function BookmarkTile({T,site,onOpen,onLongPress}){
  const lp=useLongPress(onLongPress);
  return h('button',Object.assign({onClick:onOpen},lp,{className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7,minWidth:0,background:'none'}}),
    h('span',{style:{width:54,height:54,borderRadius:14,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}},
      h('img',{src:faviconUrl(site.url),alt:'',style:{width:30,height:30},onError:e=>{e.target.style.opacity=0}})),
    h('span',{style:{fontSize:11.5,color:T.meta,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},site.name));
}

function Browser({T,sites,onSites,folders,onFolders,vault,onChangeVault,session,initialUrl,onClose}){
  const [input,setInput]=useState('');
  const [vaultOpen,setVaultOpen]=useState(false);
  const [addForm,setAddForm]=useState(null); // {name,url,folderId}
  const go=t=>{const u=browserTarget(t);if(!u)return;setInput(u);openExternalUrl(u)}; // hand off to the system browser — embedding goes blank on any site that blocks framing
  useEffect(()=>{if(initialUrl)go(initialUrl)},[]);
  const [actSite,setActSite]=useState(null);
  const [moveSite,setMoveSite]=useState(null);
  const [editSite,setEditSite]=useState(null);
  const [mkFolder,setMkFolder]=useState(null);
  const [fName,setFName]=useState('');
  const setSiteFolder=(id,folderId)=>onSites(list=>list.map(s=>s.id===id?{...s,folderId}:s));
  const tbtn=(icon,onClick)=>h('button',{onClick,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,width:38})},icon);
  const lblS={fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'4px 2px 12px'};
  const addBtn=(onClick)=>h('button',{onClick,className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7}},
    h('span',{style:{width:54,height:54,borderRadius:14,border:'1.5px dashed '+T.sub,display:'flex',alignItems:'center',justifyContent:'center',color:T.sub}},Icons.plus(22)),
    h('span',{style:{fontSize:11.5,color:T.sub}},'Add'));
  const tile=st=>h(BookmarkTile,{key:st.id,T,site:st,onOpen:()=>go(st.url),onLongPress:()=>setActSite(st)});
  const grid=children=>h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}},children);
  const loose=sites.filter(s=>!s.folderId||!folders.some(f=>f.id===s.folderId));
  const homeBody=h('div',null,
    folders.map(f=>{
      const fSites=sites.filter(s=>s.folderId===f.id);
      return h('div',{key:f.id,style:{marginBottom:20}},
        h('div',{style:{display:'flex',alignItems:'center',marginBottom:8}},
          h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,flex:1}},f.name),
          h('button',{onClick:()=>{setFName(f.name);setMkFolder({rename:f.id})},className:'act90',style:{display:'flex',color:T.sub}},Icons.pencil(15)),
          h('button',{onClick:()=>{onSites(list=>list.map(s=>s.folderId===f.id?{...s,folderId:null}:s));onFolders(list=>list.filter(x=>x.id!==f.id))},className:'act90',style:{display:'flex',color:T.danger}},Icons.trash(15))),
        grid([...fSites.map(tile),addBtn(()=>setAddForm({name:'',url:'',folderId:f.id}))]));
    }),
    h('div',{style:lblS},'Bookmarks'),
    grid([...loose.map(tile),addBtn(()=>setAddForm({name:'',url:'',folderId:null}))]),
    h('button',{onClick:()=>{setFName('');setMkFolder({})},className:'act98',style:{display:'flex',alignItems:'center',gap:8,marginTop:18,padding:'11px 14px',borderRadius:11,border:'1px dashed '+T.hair,color:T.fg,fontSize:14,fontWeight:500}},Icons.plus(18),'New folder'),
    h('div',{style:{fontSize:12,color:T.sub,marginTop:16,lineHeight:1.5}},'Tapping a bookmark or entering an address opens it in your browser. Long-press a bookmark to rename, move to a folder, or delete. Tap the key icon to copy a saved password while logging in.'));
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:90,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{style:{display:'flex',alignItems:'center',gap:4,padding:'calc(6px + '+SAFE_T+') 8px 6px',flexShrink:0}},
      h('button',{onClick:onClose,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.x(22)),
      h('div',{style:{flex:1,display:'flex',alignItems:'center',gap:8,background:T.search,borderRadius:11,padding:'8px 12px',minWidth:0}},
        h('span',{style:{color:T.sub,display:'flex'}},Icons.search(15)),
        h('input',{value:input,onChange:e=>setInput(e.target.value),placeholder:'Search Google or enter address',inputMode:'text',enterKeyHint:'go',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          onKeyDown:e=>{if(e.key==='Enter')go(input)},
          onFocus:e=>{try{e.target.select()}catch(err){}},
          style:{flex:1,border:'none',background:'transparent',color:T.fg,fontSize:14,minWidth:0}}),
        input?h('button',{onClick:()=>setInput(''),className:'act90',style:{color:T.sub,display:'flex',padding:2}},Icons.x(15)):null),
      tbtn(Icons.key(19),()=>setVaultOpen(true))),
    h('div',{className:'sy',style:{flex:1,overflowY:'auto',padding:'14px 16px calc(20px + '+SAFE_B+')'}},homeBody),

    actSite?h(Sheet,{T,onClose:()=>setActSite(null)},
      h('div',{style:{padding:'6px 20px 12px',borderBottom:'1px solid '+T.hair,fontSize:14.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},actSite.name),
      h(ARow,{T,icon:Icons.external(21),label:'Open',onClick:()=>{const s=actSite;setActSite(null);go(s.url)}}),
      h(ARow,{T,icon:Icons.pencil(21),label:'Rename',onClick:()=>{const s=actSite;setActSite(null);setEditSite({id:s.id,name:s.name,url:s.url})}}),
      h(ARow,{T,icon:Icons.folder(21),label:'Move to folder…',onClick:()=>{const s=actSite;setActSite(null);setMoveSite(s)}}),
      h(ARow,{T,icon:Icons.trash(21),label:'Delete',danger:true,onClick:()=>{onSites(list=>list.filter(x=>x.id!==actSite.id));setActSite(null)}})):null,

    moveSite?h(Sheet,{T,title:'Move to folder',onClose:()=>setMoveSite(null)},
      h(ARow,{T,icon:Icons.plus(21),label:'New folder…',onClick:()=>{const s=moveSite;setMoveSite(null);setFName('');setMkFolder({forSite:s.id})}}),
      moveSite.folderId?h(ARow,{T,icon:Icons.x(21),label:'Remove from folder',onClick:()=>{setSiteFolder(moveSite.id,null);setMoveSite(null)}}):null,
      folders.map(f=>h(ARow,{key:f.id,T,icon:Icons.folder(21),label:f.name,onClick:()=>{setSiteFolder(moveSite.id,f.id);setMoveSite(null)}})),
      folders.length?null:h('div',{style:{padding:'14px 20px',color:T.sub,fontSize:13.5}},'No folders yet — create one above.')):null,

    mkFolder?h(Sheet,{T,title:mkFolder.rename?'Rename folder':'New folder',onClose:()=>setMkFolder(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:fName,autoFocus:true,onChange:e=>setFName(e.target.value),placeholder:'Folder name',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:12}}),
        h('button',{onClick:()=>{const nm=fName.trim()||'New folder';
            if(mkFolder.rename){onFolders(list=>list.map(f=>f.id===mkFolder.rename?{...f,name:nm}:f))}
            else{const id=uid();onFolders(list=>list.concat([{id,name:nm}]));if(mkFolder.forSite)setSiteFolder(mkFolder.forSite,id)}
            setMkFolder(null)},className:'act96',style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},mkFolder.rename?'Rename':'Create'))):null,

    editSite?h(Sheet,{T,title:'Edit bookmark',onClose:()=>setEditSite(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:editSite.name,onChange:e=>setEditSite({...editSite,name:e.target.value}),placeholder:'Name',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:10}}),
        h('input',{value:editSite.url,onChange:e=>setEditSite({...editSite,url:e.target.value}),placeholder:'https://…',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:12}}),
        h('button',{onClick:()=>{const u=normalizeUrl(editSite.url);if(!u)return;onSites(list=>list.map(x=>x.id===editSite.id?{...x,name:editSite.name.trim()||domainOf(u),url:u}:x));setEditSite(null)},className:'act96',style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},'Save'))):null,

    addForm?h(Sheet,{T,title:'Add bookmark',onClose:()=>setAddForm(null)},
      h('div',{style:{padding:'4px 18px 18px'}},
        h('input',{value:addForm.name,autoFocus:true,onChange:e=>setAddForm({...addForm,name:e.target.value}),placeholder:'Name (optional)',
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:10}}),
        h('input',{value:addForm.url,onChange:e=>setAddForm({...addForm,url:e.target.value}),placeholder:'https://…',inputMode:'url',enterKeyHint:'done',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          style:{width:'100%',border:'1px solid '+T.hair,background:T.card,color:T.fg,borderRadius:10,padding:'12px 13px',fontSize:15,marginBottom:12}}),
        h('button',{onClick:()=>{const u=normalizeUrl(addForm.url);if(!u)return;onSites(list=>list.concat([{id:uid(),name:addForm.name.trim()||domainOf(u),url:u,folderId:addForm.folderId||null}]));setAddForm(null)},className:'act96',style:{width:'100%',padding:'13px',borderRadius:11,background:T.fg,color:T.bg,fontSize:15,fontWeight:600}},'Add bookmark'))):null,
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
        'Instapaper · v'+APP_VERSION,h('br'),'Your personal read-it-later app. Everything is stored privately on this device.'));
  }else if(page==='appearance'){
    content=h(Fragment,null,
      h('div',{style:{padding:'14px 20px 0',fontSize:14.5,fontWeight:600}},'Theme'),
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
      h('div',{style:{padding:'18px 20px 8px',fontSize:12,color:T.sub,lineHeight:1.5}},'Pick your theme above. Line spacing and per-article tweaks live in the Aa menu inside the reader.'));
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
          [['claude','Claude app'],['openrouter','OpenRouter'],['gemini','Google Gemini']].map(([id,label])=>
            h('button',{key:id,onClick:()=>set({aiProvider:id}),className:'act95 trc',
              style:{flex:1,padding:'10px 0',borderRadius:11,fontSize:13.5,fontWeight:600,background:(S.aiProvider||'openrouter')===id?T.fg:T.card,color:(S.aiProvider||'openrouter')===id?T.bg:T.meta}},label))),
        (S.aiProvider||'openrouter')==='claude'
          ?h(Fragment,null,
            h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.6,marginBottom:10}},'No API key needed. Summarize, Translate, Rewrite, and Ask open ready-made in the ',h('strong',null,'Claude app'),' (or claude.ai in the browser) with the article attached — answers appear in Claude, where you can keep chatting.'),
            h('div',{style:{padding:'12px 14px',borderRadius:10,background:T.card,fontSize:12.5,color:T.meta,lineHeight:1.6}},'💡 Install the Claude app from the App Store / Play Store for the smoothest hand-off. Prefer results inside Instapaper? Switch to OpenRouter or Gemini with a free API key.'))
          :(S.aiProvider||'openrouter')==='gemini'
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
    case 'home':return !a.archived&&!a.folderId;
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
    case 'title':a.sort((x,y)=>(x.title||'').localeCompare(y.title||'',undefined,{sensitivity:'base'}));break;
    default:a.sort((x,y)=>(y.addedAt||0)-(x.addedAt||0));
  }
  return a;
}
function scopeTitle(scope,folders){
  switch(scope.type){
    case 'home':return 'Instapaper';
    case 'search':return 'Search';
    case 'liked':return 'Liked';
    case 'archive':return 'Archive';
    case 'videos':return 'Videos';
    case 'photos':return 'Photos';
    case 'brief':return 'My Routine';
    case 'headlines':return 'India Headlines';
    case 'blogs':return 'Blogs';
    case 'notes':return 'Notes';
    case 'threads':return 'Threads';
    case 'tags':return 'Tags';
    case 'brief':return 'Daily Brief';
    case 'tag':return '#'+scope.id;
    case 'folder':{const f=folders.find(f=>f.id===scope.id);return f?f.name:'Folder'}
    default:return 'Instapaper';
  }
}
const EMPTY_STATES={
  search:['Search everything','Type above to search across all your articles, posts and videos — titles, tags and full text.'],
  home:['No articles yet','Tap + in the sidebar to save your first link.'],
  liked:['No liked articles','Tap the heart inside an article, or swipe right on it.'],
  archive:['Archive is empty','Swipe left on an article to archive it when you\'re done.'],
  videos:['No videos saved','Save a YouTube link and it will show up here.'],
  folder:['This folder is empty','Long-press an article and choose "Move to folder".'],
  tag:['Nothing with this tag','Long-press an article and choose "Edit tags".']
};

/* ============================== error boundary ============================== */
class Boundary extends React.Component{
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  componentDidCatch(){try{const s=document.getElementById('spl');if(s)s.classList.add('hide')}catch(e){}}
  render(){
    if(this.state.err)return ce('div',{style:{position:'fixed',inset:0,zIndex:300,minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,fontFamily:UIF,padding:30,textAlign:'center',background:'#fff',color:'#1c1c1e'}},
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

  const [scope,setScope]=useState({type:'headlines'});
  const [query,setQuery]=useState('');
  const [searchScope,setSearchScope]=useState('all'); // all|title|source|tags
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
  const [filterMenu,setFilterMenu]=useState(false); // reader list type-filter dropdown
  const [sortMenu,setSortMenu]=useState(false); // reader list sort dropdown
  const [media,setMedia]=useState([]); // {id,kind,mime,name,caption,albumId,favorite,pinned,addedAt,blob}
  const [albums,setAlbums]=useState([]); // {id,name,createdAt}
  const fileInputRef=useRef(null); // hidden <input> reused for take-photo / library / files
  const pendingAlbumRef=useRef(null); // when set, the next upload lands straight in this album
  const vaultSess=useRef({}); // unlocked password-vault session (memory only, never persisted)
  const listScrollRef=useRef(null); // main list scroller — used to jump to top from the wordmark
  const searchRef=useRef(null); // global search field — focused when entering the Search scope
  const [findReq,setFindReq]=useState(0); // bumping this opens the Reader's find-in-article bar
  useEffect(()=>{if(scope.type==='search'){const t=setTimeout(()=>{if(searchRef.current)searchRef.current.focus()},60);return()=>clearTimeout(t)}},[scope.type]);
  const toastT=useRef(null);
  const toastFn=useCallback(msg=>{setToast(msg);if(toastT.current)clearTimeout(toastT.current);toastT.current=setTimeout(()=>setToast(null),2000)},[]);

  /* ---------- media (photos & files) — declared after toastFn so its useCallback deps resolve ---------- */
  useEffect(()=>{ // load media + albums from IndexedDB once
    let live=true;
    Promise.all([idbAll('media').catch(()=>[]),idbAll('albums').catch(()=>[])]).then(([m,al])=>{
      if(!live)return;
      m.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
      setMedia(m);setAlbums(al);
    });
    return()=>{live=false};
  },[]);
  const addFiles=useCallback(async(fileList)=>{
    const files=Array.from(fileList||[]);if(!files.length)return;
    const tgt=pendingAlbumRef.current||null;pendingAlbumRef.current=null;
    const recs=[];
    for(const f of files){
      const rec={id:uid(),kind:f.type.startsWith('image/')?'image':'file',mime:f.type||'application/octet-stream',name:f.name||'Untitled',caption:'',albumId:tgt,favorite:false,pinned:false,addedAt:Date.now()+recs.length,blob:f};
      try{await idbPut('media',rec);recs.push(rec)}catch(e){}
    }
    if(recs.length){setMedia(prev=>[...recs.reverse(),...prev]);toastFn(recs.length+(recs.length>1?' items added':' item added'))}
  },[toastFn]);
  const updateMedia=useCallback(async(id,patch)=>{
    let updated=null;
    setMedia(prev=>prev.map(m=>{if(m.id!==id)return m;updated={...m,...(typeof patch==='function'?patch(m):patch)};return updated}));
    if(updated)try{await idbPut('media',updated)}catch(e){}
  },[]);
  const deleteMedia=useCallback(async ids=>{
    const arr=Array.isArray(ids)?ids:[ids];
    setMedia(prev=>prev.filter(m=>!arr.includes(m.id)));
    for(const id of arr)try{await idbDel('media',id)}catch(e){}
    toastFn(arr.length>1?arr.length+' items deleted':'Deleted');
  },[toastFn]);
  /* Threads store their photos in the media DB tagged with threadId so they
     stay out of the Photos gallery; return the new id to reference in an entry. */
  const addThreadImage=useCallback(async(file,threadId)=>{
    if(!file)return null;
    const rec={id:uid(),kind:'image',mime:file.type||'image/jpeg',name:file.name||'Thread photo',caption:'',albumId:null,threadId:threadId||true,favorite:false,pinned:false,addedAt:Date.now(),blob:file};
    try{await idbPut('media',rec);setMedia(prev=>[rec,...prev]);return rec.id}catch(e){return null}
  },[]);
  const removeThreadMedia=useCallback(async ids=>{
    const arr=(Array.isArray(ids)?ids:[ids]).filter(Boolean);
    if(!arr.length)return;
    setMedia(prev=>prev.filter(m=>!arr.includes(m.id)));
    for(const id of arr)try{await idbDel('media',id)}catch(e){}
  },[]);
  const addAlbum=useCallback(async name=>{
    const al={id:uid(),name:name||'New album',createdAt:Date.now()};
    setAlbums(prev=>[...prev,al]);try{await idbPut('albums',al)}catch(e){}
    return al.id;
  },[]);
  const renameAlbum=useCallback(async(id,name)=>{
    let updated=null;
    setAlbums(prev=>prev.map(a=>{if(a.id!==id)return a;updated={...a,name};return updated}));
    if(updated)try{await idbPut('albums',updated)}catch(e){}
  },[]);
  const deleteAlbum=useCallback(async id=>{ // album removed; its photos stay (albumId cleared)
    setAlbums(prev=>prev.filter(a=>a.id!==id));
    try{await idbDel('albums',id)}catch(e){}
    setMedia(prev=>prev.map(m=>{if(m.albumId!==id)return m;const u={...m,albumId:null};idbPut('media',u).catch(()=>{});return u}));
  },[]);
  const pickFiles=useCallback((accept,capture)=>{
    const el=fileInputRef.current;if(!el)return;
    el.value='';el.accept=accept||'';if(capture)el.setAttribute('capture',capture);else el.removeAttribute('capture');
    el.click();
  },[]);

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

  useEffect(()=>{ // host (Naz Trades) can deep-link into a section via postMessage
    const onNav=e=>{const d=e&&e.data;if(!d||d.type!=='reader-nav')return;
      setSidebar(false);setMenuOpen(false);
      if(d.scope==='browse'){setBrowserO({url:''})}
      else{setBrowserO(null);setScope({type:d.scope||'home'})}
    };
    window.addEventListener('message',onNav);
    return()=>window.removeEventListener('message',onNav);
  },[]);

  useEffect(()=>{ // keep system chrome in sync with theme
    document.body.style.background=T.bg;
    const m=document.querySelector('meta[name="theme-color"]');
    if(m)m.setAttribute('content',T.statusbar);
    // Tell the host app (Naz Trades) so the iOS status bar matches the reader theme.
    if(EMBEDDED){try{window.parent.postMessage({type:'instapaper-theme',color:T.statusbar},'*')}catch(e){}}
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
  const ttsLoad=(qi,si)=>{const st=tts.current;st.qi=qi;
    const a=dataRef.current.articles.find(x=>x.id===st.queue[qi]);
    st.sentences=a&&a.text?toSentences((a.title?a.title+'. ':'')+a.text):[];
    st.si=clamp(si||0,0,Math.max(0,st.sentences.length-1));};
  /* remember where listening stopped so playback resumes there next time (like a voice note) */
  const saveTtsPos=useCallback(()=>{
    const st=tts.current;const id=st.queue[st.qi];if(!id)return;
    patchArticle(id,{ttsPos:st.si>=st.sentences.length-1?0:st.si});
  },[patchArticle]);
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
        patchArticle(st2.queue[st2.qi],{ttsPos:0}); // finished — next listen starts fresh
        if(st2.qi+1<st2.queue.length){ttsLoad(st2.qi+1,0);speak()}
        else{st2.playing=false;syncTts()}
      }else speak();
    };
    u.onend=fin;u.onerror=fin;
    st.playing=true;syncTts();
    try{speechSynthesis.speak(u)}catch(e){st.playing=false;syncTts()}
  },[syncTts,patchArticle]);
  const startTts=(ids,startId)=>{
    if(!('speechSynthesis'in window)){toastFn('Text-to-speech is not supported on this device');return}
    const st=tts.current;
    st.queue=ids.filter(id=>{const a=byId(id);return a&&!a.isVideo&&a.text});
    if(!st.queue.length){toastFn('Nothing to listen to — these items have no text');return}
    let qi=0;if(startId){const k=st.queue.indexOf(startId);if(k>-1)qi=k}
    const first=byId(st.queue[qi]);
    ttsLoad(qi,first&&first.ttsPos>0?first.ttsPos:0);
    if(st.si>0)toastFn('Resuming where you left off');
    speakCur();setTtsOpen(true);
  };
  const ttsToggle=()=>{const st=tts.current;
    if(st.playing){st.session++;st.playing=false;try{speechSynthesis.cancel()}catch(e){}saveTtsPos();syncTts()}
    else if(st.queue.length)speakCur();
  };
  const ttsStop=()=>{const st=tts.current;saveTtsPos();st.session++;st.playing=false;st.queue=[];try{speechSynthesis.cancel()}catch(e){}setTtsUI(null);setTtsOpen(false)};
  const ttsSkipSent=d=>{const st=tts.current;st.si=clamp(st.si+d,0,Math.max(0,st.sentences.length-1));if(st.playing)speakCur();else syncTts()};
  const ttsJumpArticle=d=>{const st=tts.current;const ni=st.qi+d;if(ni<0||ni>=st.queue.length)return;saveTtsPos();ttsLoad(ni,0);if(st.playing)speakCur();else syncTts()};
  const ttsJumpTo=i=>{ttsLoad(i,0);speakCur()};
  const ttsSetRate=r=>{update(d=>({...d,settings:{...d.settings,ttsRate:r}}));if(tts.current.playing)setTimeout(speakCur,60)};
  const ttsSetVoice=v=>{update(d=>({...d,settings:{...d.settings,ttsVoice:v}}));if(tts.current.playing)setTimeout(speakCur,60)};

  /* ---------- saving links ---------- */
  const addByUrl=async(url,folderId)=>{
    const dup=dataRef.current.articles.find(a=>a.url===url);
    if(dup){setAddS(null);toastFn('Already in your list');return}
    // Social posts save instantly as link cards — enrich Open Graph data later.
    const soc=socialOf(url);
    if(soc){
      const id=uid();const label=PLATFORM_LABEL[soc.platform]||'Post';const handle=soc.handle?('@'+soc.handle):'';
      const base=handle?handle+' on '+label:label+' post';
      const article={id,url,title:base,source:label,author:handle,image:'',html:'',text:'',excerpt:'',words:0,readMin:0,isVideo:false,videoId:null,isPost:true,platform:soc.platform,publishedAt:0,addedAt:Date.now(),liked:false,archived:false,folderId:folderId||null,tags:[],progress:0,opens:0,highlights:[]};
      update(d=>({...d,articles:[article,...d.articles]}));
      setAddS(null);toastFn(label+' post saved');
      (async()=>{const m=await fetchSocialMeta(url);if(m&&(m.title||m.image||m.desc))patchArticle(id,x=>({title:(x.title===base&&m.title)?m.title:x.title,image:x.image||m.image||'',excerpt:x.excerpt||(m.desc?m.desc.slice(0,300).trim():''),author:m.author||x.author,publishedAt:x.publishedAt||m.publishedAt||0}))})();
      return;
    }
    const rec=await fetchArticleData(url); // throws on failure -> AddSheet shows error
    const article=Object.assign(rec,{id:uid(),addedAt:Date.now(),liked:false,archived:false,folderId:folderId||null,tags:[],progress:0,opens:0,highlights:[]});
    update(d=>({...d,articles:[article,...d.articles]}));
    setAddS(null);
    toastFn(article.isPost?(article.source+' post saved'):article.isVideo?'Video saved':'Saved — '+article.readMin+' min read');
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
      toastFn('Couldn\'t fetch that story — opening it instead');
      setBrowserO({url:it.url});
    }
  };

  /* save a quick "note to self" as a searchable offline article */
  const saveQuickNote=text=>{
    const first=text.split('\n')[0].replace(/^#+\s*/,'').replace(/\*\*?/g,'').trim();
    const title=first.length>64?first.slice(0,64)+'…':(first||'Note');
    const html=mdToHtml(text);
    const plain=htmlToText(html);
    if(!plain)return;
    const words=countWords(plain);
    update(d=>({...d,articles:[{id:uid(),url:'',title,source:'My note',author:'',image:'',html,text:plain,excerpt:plain.slice(0,220),words,readMin:readMinutes(words),isVideo:false,videoId:null,publishedAt:Date.now(),addedAt:Date.now(),liked:false,archived:false,folderId:null,tags:['note'],progress:0,opens:0,highlights:[]},...d.articles]}));
    setSheet(null);toastFn('Note saved');
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
  const openArticle=id=>{const a=byId(id);patchArticle(id,x=>({opens:(x.opens||0)+1}));if(a&&a.isPost){if(a.url)openExternalUrl(a.url);return}setReadingId(id)};
  const doAction=(id,key)=>{
    const a=byId(id);if(!a&&key!=='close')return;
    switch(key){
      case 'close':setReadingId(null);break;
      case 'read':{const now=(a.progress||0)<0.97;patchArticle(id,{progress:now?1:0});toastFn(now?(a.isVideo?'Marked as watched':'Marked as read'):(a.isVideo?'Marked as unwatched':'Marked as unread'));setSheet(null);break}
      case 'like':patchArticle(id,x=>({liked:!x.liked}));break;
      case 'pin':patchArticle(id,x=>({pinned:!x.pinned}));toastFn(a.pinned?'Unpinned':'Pinned to top');setSheet(null);break;
      case 'archive':{const now=!a.archived;patchArticle(id,{archived:now});toastFn(now?'Archived':'Moved to Home');setSheet(null);break}
      case 'move':setSheet({type:'move',ids:[id]});break;
      case 'tags':setSheet({type:'tags',id});break;
      case 'date':setSheet({type:'date',id});break;
      case 'listen':setSheet(null);startTts([id]);break;
      case 'speed':setSheet(null);setSpeedId(id);break;
      case 'share':setSheet(null);shareText(a.title,'',a.url||'');break;
      case 'copy':setSheet(null);copyText(a.url);toastFn('Link copied');break;
      case 'open':setSheet(null);openExternalUrl(a.url);break;
      case 'delete':setSheet({type:'confirm',kind:'delete',ids:[id]});break;
      case 'sheet':setSheet({type:'article',id});break;
      case 'search':
        setSheet(null);
        // while reading, Search finds text inside the open article; from a list it's still global
        if(readingId&&readingId===id)setFindReq(x=>x+1);
        else{setReadingId(null);setQuery('');setScope({type:'search'})}
        break;
      case 'edit':setSheet({type:'editChoice',id});break;
      case 'ai':setSheet(null);setAiOpen({articleId:id});break;
    }
  };
  const openNewspaper=()=>{
    // route to The Daily Brief — the personalized newspaper (latest build)
    window.location.href=new URL('newspaper.html',window.location.href).href;
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
    update(d=>({...d,articles:[{id:uid(),url:orig.url,title,source:orig.source,author:orig.author,image:orig.image||'',html,text,excerpt:text.slice(0,220),words,readMin:readMinutes(words),isVideo:false,videoId:null,publishedAt:0,addedAt:Date.now(),liked:false,archived:false,folderId:orig.folderId||null,tags:[...new Set([...orig.tags,result.translation?'translated':result.transcript?'transcript':'rewritten'])],progress:0,opens:0,highlights:[],lang:LANG_CODES[result.lang]||''},...d.articles]}));
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
      d.siteFolders=Array.isArray(d.siteFolders)?d.siteFolders:[];
      d.feeds=Array.isArray(d.feeds)?d.feeds:[];
      d.vault=d.vault&&d.vault.ct?d.vault:null;
      d.seeded=true;
      update(()=>d);setScope({type:'home'});toastFn('Backup restored — '+d.articles.length+' articles');
    }catch(e){toastFn('That file doesn\'t look like a backup')}
  };
  const eraseAll=()=>{
    try{localStorage.removeItem(STORE_KEY)}catch(e){}
    update(()=>({settings:Object.assign({},DEFAULT_SETTINGS),articles:[makeSeed()],folders:[],seeded:true}));
    setScope({type:'home'});setSheet(null);setSettingsOpen(false);toastFn('Everything erased');
  };

  /* ---------- derived list ---------- */
  // defer the query so filtering a large library never blocks typing
  const dq=useDeferredValue(query);
  const q=dq.trim().toLowerCase();
  const list=useMemo(()=>{
    let arr;
    if(q){
      const sc=searchScope;
      const hay=a=>sc==='title'?(a.title||'')
        :sc==='source'?((a.source||'')+' '+(a.author||''))
        :sc==='tags'?(a.tags||[]).join(' ')
        :((a.title||'')+' '+(a.author||'')+' '+(a.source||'')+' '+(a.tags||[]).join(' ')+' '+(a.text||''));
      arr=data.articles.filter(a=>hay(a).toLowerCase().includes(q));
    }
    else{
      arr=data.articles.filter(a=>inScope(a,scope));
      // Type and read-status are independent filters.
      if(S.typeFilter==='article')arr=arr.filter(a=>!a.isVideo&&!a.isPost);
      else if(S.typeFilter==='video')arr=arr.filter(a=>a.isVideo);
      else if(S.typeFilter==='post')arr=arr.filter(a=>a.isPost);
      if(S.readFilter==='unread')arr=arr.filter(a=>(a.progress||0)<0.97);
      else if(S.readFilter==='read')arr=arr.filter(a=>(a.progress||0)>=0.97);
      // reading-length band by estimated minutes
      if(S.lenFilter==='short')arr=arr.filter(a=>(a.readMin||0)>0&&(a.readMin||0)<5);
      else if(S.lenFilter==='medium')arr=arr.filter(a=>(a.readMin||0)>=5&&(a.readMin||0)<=15);
      else if(S.lenFilter==='long')arr=arr.filter(a=>(a.readMin||0)>15);
      // single-publisher filter
      if(S.srcFilter)arr=arr.filter(a=>(a.source||'').trim().toLowerCase()===S.srcFilter);
    }
    arr=sortArticles(arr,S.sort);
    if(!q)arr=[...arr.filter(a=>a.pinned),...arr.filter(a=>!a.pinned)]; // pinned float to the top
    return arr;
  },[data,scope,q,searchScope,S.sort,S.typeFilter,S.readFilter,S.lenFilter,S.srcFilter]);
  const unreadCount=useMemo(()=>data.articles.filter(a=>inScope(a,scope)&&(a.progress||0)<0.97).length,[data.articles,scope]);
  // publishers present in the library, for the source filter picker
  const libSources=useMemo(()=>{const m=new Map();data.articles.forEach(a=>{const name=(a.source||'').trim();if(!name)return;const k=name.toLowerCase();const e=m.get(k);if(e)e.count++;else m.set(k,{key:k,name,count:1})});return[...m.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))},[data.articles]);
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
  const isArticleScope=!['notes','tags','photos','brief','headlines','blogs','threads'].includes(scope.type);
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
  // Tapping the wordmark returns Home and scrolls the list back to the top.
  const goHome=()=>{
    setQuery('');
    setScope({type:'home'});
    const el=listScrollRef.current;
    if(el)el.scrollTo({top:0,behavior:'smooth'});
    requestAnimationFrame(()=>{const e2=listScrollRef.current;if(e2)e2.scrollTop=0});
  };
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
      h('button',{onClick:goHome,className:'act90','aria-label':'Go to top of Home',style:{marginLeft:2,padding:'2px 6px',textAlign:'left',fontFamily:WORDMARK,fontSize:21,fontWeight:600,letterSpacing:'.2px',color:T.fg,background:'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'52%'}},scopeTitle(scope,data.folders)),
      h('div',{style:{flex:1}}),
      headerBtn(Icons.ai(22),()=>setAiOpen({})),
      headerBtn(Icons.rss(22),()=>{setScope({type:'blogs'});setQuery('')}),
      headerBtn(Icons.phone(22),()=>{setScope({type:'brief'});setQuery('')}),
      headerBtn(Icons.newspaper(22),()=>{setScope({type:'headlines'});setQuery('')}),
      headerBtn(Icons.globe(22),()=>setBrowserO({url:''})),
      EMBEDDED?headerBtn(Icons.back(23),exitToHost):null);
  }

  /* ---------- main area ---------- */
  let body;
  if(scope.type==='notes')body=h(NotesList,{T,articles:data.articles,onOpenArticle:openArticle,onOpenHighlight:(aid,hid)=>setSheet({type:'highlight',aid,hid})});
  else if(scope.type==='photos')body=h(PhotosView,{T,S,media:media.filter(m=>!m.threadId),albums,onPick:pickFiles,onPickToAlbum:(albumId,accept,capture)=>{pendingAlbumRef.current=albumId;pickFiles(accept,capture)},onUpdate:updateMedia,onDelete:deleteMedia,onAddAlbum:addAlbum,onRenameAlbum:renameAlbum,onDeleteAlbum:deleteAlbum,toastFn});
  else if(scope.type==='brief')body=h(BriefView,{T,S,brief:data.brief,
    onBrief:b=>update(d=>({...d,brief:typeof b==='function'?b(d.brief):b})),toastFn,
    onAskClaude:()=>setAiOpen({routine:true})});
  else if(scope.type==='headlines')body=h(DailyBrief,{T,regionId:'IN',showRegion:false,
    headlinesCategories:S.headlinesCategories||null,headlinesSources:S.headlinesSources||null,
    starred:S.briefStarred||[],muted:S.briefMuted||[],
    onConfig:patch=>update(d=>({...d,settings:{...d.settings,...patch}})),onOpenItem:addBriefItem,
    onOpenUrl:url=>setBrowserO({url})});
  else if(scope.type==='blogs')body=h(BlogsView,{T,S,feeds:data.feeds||[],groups:data.blogGroups||[],
    blogFeeds:data.blogFeeds||{},seen:data.blogSeen||{},
    onFeeds:fn=>update(d=>({...d,feeds:fn(d.feeds||[])})),
    onGroups:fn=>update(d=>({...d,blogGroups:fn(d.blogGroups||[])})),
    onBlogFeeds:fn=>update(d=>({...d,blogFeeds:fn(d.blogFeeds||{})})),
    onSeen:fn=>update(d=>({...d,blogSeen:fn(d.blogSeen||{})})),
    onOpenItem:addBriefItem,onBrowse:u=>setBrowserO({url:u}),toastFn});
  else if(scope.type==='threads')body=h(ThreadsView,{T,S,threads:data.threads||[],threadFeeds:data.threadFeeds||{},seen:data.threadSeen||{},
    media,articles:data.articles,
    onThreads:fn=>update(d=>({...d,threads:fn(d.threads||[])})),
    onThreadFeeds:fn=>update(d=>({...d,threadFeeds:fn(d.threadFeeds||{})})),
    onSeen:fn=>update(d=>({...d,threadSeen:fn(d.threadSeen||{})})),
    addThreadImage,removeThreadMedia,
    onOpenItem:addBriefItem,onOpenArticle:openArticle,onBrowse:u=>setBrowserO({url:u}),toastFn});
  else if(scope.type==='tags')body=h(TagsList,{T,articles:data.articles,onPick:t=>setScope({type:'tag',id:t})});
  else if(scope.type==='videos'&&!q&&list.length){
    body=h(MyRoutine,{T,videos:list,
      onOpen:openArticle,
      onLongPress:id=>setSheet({type:'article',id}),
      onMarkDone:(id,progress)=>{patchArticle(id,{progress});toastFn(progress>=0.97?'Marked as watched':'Marked as unwatched')},
      onSwipeLeft:v=>{patchArticle(v.id,{archived:true});toastFn('Archived')},
      onSwipeRight:v=>{patchArticle(v.id,x=>({liked:!x.liked}));toastFn(v.liked?'Unliked':'Liked')},
      selectState:selecting,onToggleSelect:toggleSelect});
  }else if(scope.type==='archive'&&!q&&list.length){
    body=h(GroupedArchive,{T,articles:list,
      onOpen:openArticle,
      onLongPress:id=>setSheet({type:'article',id}),
      onSwipeLeft:v=>{patchArticle(v.id,{archived:false});toastFn('Moved to Home')},
      onSwipeRight:v=>{patchArticle(v.id,x=>({liked:!x.liked}));toastFn(v.liked?'Unliked':'Liked')},
      selectState:selecting,onToggleSelect:toggleSelect});
  }else if(!list.length){
    const[et,es]=q?['No results','Nothing matches "'+query.trim()+'" in your articles — full-text search covers everything you\'ve saved.']:(EMPTY_STATES[scope.type]||EMPTY_STATES.home);
    body=h(EmptyState,{T,icon:q?Icons.search(40):Icons.archive(40),title:et,sub:es});
  }else{
    body=h('div',null,
      q?h('div',{style:{padding:'10px 16px 4px',fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},list.length+' result'+(list.length===1?'':'s')+' · '+({all:'searching everything',title:'in titles',source:'in sources',tags:'in tags'}[searchScope]||'searching everything')):null,
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

  return h('div',{className:'appframe'},
    h('div',{style:{height:'100dvh',display:'flex',flexDirection:'column',background:T.bg,color:T.fg,fontFamily:UIF,overflow:'hidden',paddingTop:SAFE_T}},
      header,
      isArticleScope&&!selecting?h('div',{style:{padding:'2px 16px 10px',flexShrink:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:9,background:T.search,borderRadius:11,padding:'9px 12px'}},
          h('span',{style:{color:T.sub,display:'flex'}},Icons.search(17)),
          h('input',{ref:searchRef,value:query,onChange:e=>setQuery(e.target.value),placeholder:'Search',
            style:{flex:1,border:'none',background:'transparent',color:T.fg,fontSize:15.5,minWidth:0}}),
          query?h('button',{onClick:()=>{setQuery('');setSearchScope('all')},className:'act90',style:{color:T.sub,display:'flex',padding:2}},Icons.x(16)):null),
        q?h('div',{className:'sx',style:{display:'flex',gap:6,overflowX:'auto',marginTop:8}},
          [['all','Everything'],['title','Title'],['source','Source'],['tags','Tags']].map(([v,l])=>{
            const on=searchScope===v;
            return h('button',{key:v,onClick:()=>setSearchScope(v),className:'act95 trc',
              style:{flexShrink:0,padding:'5px 11px',borderRadius:999,fontSize:12.5,fontWeight:on?600:500,whiteSpace:'nowrap',color:on?T.accent:T.sub,background:on?T.card:'transparent',border:'1px solid '+(on?T.accent:T.hair)}},l);
          })):null,
        (!q&&scope.type!=='archive'&&scope.type!=='search')?(()=>{const chip=on=>({display:'flex',alignItems:'center',gap:4,fontSize:12.5,fontWeight:600,color:on?T.accent:T.sub,background:on?T.card:'transparent',border:'1px solid '+(on?T.accent:T.hair),borderRadius:999,padding:'5px 9px',cursor:'pointer',whiteSpace:'nowrap'});
          const setS=patch=>update(d=>({...d,settings:{...d.settings,...patch}}));
          const mlabel=t=>h('div',{key:'lbl-'+t,style:{padding:'8px 15px 4px',fontSize:10.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub}},t);
          const mrow=(label,active,onClick)=>h('button',{key:label,onClick,className:'act98',
            style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,width:'100%',padding:'10px 15px',color:T.menuFg,fontSize:14,fontWeight:active?600:400,background:'transparent',textAlign:'left'}},
            h('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},label),active?h('span',{style:{display:'flex',color:T.accent,flexShrink:0}},Icons.check(16)):null);
          const LENGTHS=[['','Any length'],['short','Short · under 5m'],['medium','Medium · 5–15m'],['long','Long · 15m+']];
          const TYPES=[['all','All'],['article','Article'],['video','Video'],['post','Post']];
          const curType=(TYPES.find(t=>t[0]===S.typeFilter)||TYPES[0])[1];
          const SORT_SHORT={newest:'Newest',oldest:'Oldest',longest:'Longest',shortest:'Shortest',popular:'Popular',title:'Title A–Z'};
          const curSort=SORT_SHORT[S.sort]||(SORTS.find(s=>s[0]===S.sort)||SORTS[0])[1];
          return h('div',{style:{display:'flex',alignItems:'center',gap:6,marginTop:8,flexWrap:'nowrap'}},
            h('div',{style:{position:'relative',flexShrink:0}},
              h('button',{onClick:()=>{setSortMenu(false);setFilterMenu(v=>!v)},className:'act90',style:chip(S.typeFilter!=='all'||!!S.lenFilter||!!S.srcFilter)},Icons.filter(14),curType),
              filterMenu?h(Fragment,null,
                h('div',{onClick:()=>setFilterMenu(false),style:{position:'fixed',inset:0,zIndex:29}}),
                h('div',{className:'fdin sy',style:{position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:30,background:T.menuBg,border:'1px solid '+T.menuHair,borderRadius:12,overflow:'hidden',minWidth:210,maxHeight:'62vh',overflowY:'auto',boxShadow:'0 12px 36px rgba(0,0,0,.45)'}},
                  mlabel('Type'),
                  TYPES.map(([v,l])=>mrow(l,v===S.typeFilter,()=>setS({typeFilter:v}))),
                  mlabel('Length'),
                  LENGTHS.map(([v,l])=>mrow(l,(S.lenFilter||'')===v,()=>setS({lenFilter:v}))),
                  libSources.length?mlabel('Source'):null,
                  libSources.length?mrow('All sources',!S.srcFilter,()=>setS({srcFilter:''})):null,
                  libSources.map(s=>mrow(s.name+'  ('+s.count+')',S.srcFilter===s.key,()=>setS({srcFilter:S.srcFilter===s.key?'':s.key}))),
                  (S.typeFilter!=='all'||S.lenFilter||S.srcFilter)?h('button',{key:'__reset',onClick:()=>{setS({typeFilter:'all',lenFilter:'',srcFilter:''});setFilterMenu(false)},className:'act98',style:{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'11px 15px',color:T.accent,fontSize:13.5,fontWeight:600,borderTop:'1px solid '+T.menuHair,background:'transparent'}},'Reset filters'):null)):null),
            h('button',{onClick:()=>setS({readFilter:S.readFilter==='read'?'unread':'read'}),className:'act90',style:Object.assign({},chip(true),{flexShrink:0}),title:'Toggle read / unread'},S.readFilter==='read'?'Read':'Unread',
              S.readFilter!=='read'&&unreadCount>0?h('span',{style:{minWidth:17,height:17,padding:'0 5px',borderRadius:9,background:T.accent,color:'#fff',fontSize:10.5,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}},unreadCount>99?'99+':String(unreadCount)):null),
            h('button',{onClick:()=>setSelecting({mode:'select',ids:[]}),className:'act90',style:Object.assign({},chip(false),{flexShrink:0}),title:'Select multiple'},Icons.checkCircle(14),'Select'),
            h('div',{style:{flex:1,minWidth:0}}),
            h('div',{style:{position:'relative',flexShrink:0}},
              h('button',{onClick:()=>{setFilterMenu(false);setSortMenu(v=>!v)},className:'act90',style:chip(true),title:'Sort'},Icons.sort(14),curSort),
              sortMenu?h(Fragment,null,
                h('div',{onClick:()=>setSortMenu(false),style:{position:'fixed',inset:0,zIndex:29}}),
                h('div',{className:'fdin',style:{position:'absolute',top:'calc(100% + 6px)',right:0,zIndex:30,background:T.menuBg,border:'1px solid '+T.menuHair,borderRadius:12,overflow:'hidden',minWidth:180,boxShadow:'0 12px 36px rgba(0,0,0,.45)'}},
                  SORTS.map(([v,l])=>h('button',{key:v,onClick:()=>{setS({sort:v});setSortMenu(false)},className:'act98',
                    style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,width:'100%',padding:'11px 15px',color:T.menuFg,fontSize:14.5,fontWeight:v===S.sort?600:400,background:'transparent',textAlign:'left'}},
                    l,v===S.sort?h('span',{style:{display:'flex',color:T.accent}},Icons.check(16)):null)))):null));
        })():null):null,
      backupDue&&!selecting?h(BackupBanner,{T,never:backupNever,onExport:exportBackup,onLater:snoozeBackup}):null,
      h('div',{ref:listScrollRef,className:'sy',style:{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',paddingBottom:ttsUI?100:16}},
        body),
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
      onRetry:()=>retryFetch(reading.id),findReq}):null,

    !selecting&&!reading?h('button',{onClick:()=>setSheet({type:'plus'}),className:'act90 trt',
      style:{position:'fixed',right:18,bottom:'calc('+(ttsUI?94:24)+'px + '+SAFE_B+')',width:56,height:56,borderRadius:'50%',background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 6px 22px rgba(0,0,0,.32)',zIndex:32}},Icons.plus(25)):null,

    sidebar?h(Sidebar,{T,scope,folders:data.folders,onScope:s=>{setScope(s);setQuery('');setSelecting(null)},onClose:()=>setSidebar(false),
      onBrowse:()=>setBrowserO({url:''}),
      onSettings:()=>setSettingsOpen(true),
      onFolderLongPress:f=>{setSidebar(false);setSheet({type:'folder',folder:f})}}):null,

    menuOpen?h(MenuPopover,{T,settings:S,showListOps:isArticleScope,onClose:()=>setMenuOpen(false),
      onPick:(kind,v)=>{update(d=>({...d,settings:{...d.settings,[kind]:v}}));setMenuOpen(false)},
      onSelectMode:()=>{setMenuOpen(false);setSelecting({mode:'select',ids:[]})},
      onPlaylistMode:()=>{setMenuOpen(false);setSelecting({mode:'playlist',ids:[]});toastFn('Tap articles to build your playlist')},
      onSettings:()=>{setMenuOpen(false);setSettingsOpen(true)}}):null,

    h('input',{ref:fileInputRef,type:'file',multiple:true,style:{display:'none'},
      onChange:e=>{const fs=e.target.files;if(fs&&fs.length){addFiles(fs);if(scope.type!=='photos')setScope({type:'photos'})}}}),

    addS?h(AddSheet,{T,folders:data.folders,prefill:addS.prefill,defaultFolder:scope.type==='folder'?scope.id:null,
      onSave:addByUrl,onSaveStub:saveStub,onClose:()=>setAddS(null)}):null,

    sheet&&sheet.type==='plus'?h(TouchGrid,{onClose:()=>setSheet(null),anchorBottom:'calc('+(ttsUI?94:24)+'px + 70px + '+SAFE_B+')',actions:[
      {icon:Icons.link(24),label:'Save a link',onClick:()=>setAddS({prefill:''})},
      {icon:Icons.note(24),label:'Note to self',onClick:()=>setSheet({type:'quickNote'})},
      {icon:Icons.camera(24),label:'Take photo',onClick:()=>pickFiles('image/*','environment')},
      {icon:Icons.image(24),label:'Photo library',onClick:()=>pickFiles('image/*')},
      {icon:Icons.file(24),label:'Upload files',onClick:()=>pickFiles('')},
      {icon:Icons.folder(24),label:'New folder',onClick:()=>setSheet({type:'folder'})}
    ]}):null,

    sheet&&sheet.type==='quickNote'?h(QuickNoteSheet,{T,onClose:()=>setSheet(null),onSave:saveQuickNote}):null,

    sheet&&sheet.type==='article'?(()=>{const a=byId(sheet.id);return a?h(ArticleSheet,{T,a,reading:readingId===sheet.id,onClose:()=>setSheet(null),onAction:k=>doAction(sheet.id,k)}):null})():null,

    sheet&&sheet.type==='move'?h(MoveSheet,{T,folders:data.folders,count:sheet.ids.length,onClose:()=>setSheet(null),
      onMove:fid=>moveArticles(sheet.ids,fid),
      onNewFolder:()=>setSheet({type:'folder',afterMoveIds:sheet.ids})}):null,

    sheet&&sheet.type==='tags'?(()=>{const a=byId(sheet.id);return a?h(TagsSheet,{T,article:a,allTags,onClose:()=>setSheet(null),
      onSave:tags=>{patchArticle(sheet.id,{tags});setSheet(null);toastFn('Tags saved')}}):null})():null,

    sheet&&sheet.type==='date'?(()=>{const a=byId(sheet.id);return a?h(DateSheet,{T,article:a,onClose:()=>setSheet(null),
      onSave:ts=>{patchArticle(sheet.id,{addedAt:ts});setSheet(null);toastFn('Date updated')}}):null})():null,

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
      articles:sortArticles(data.articles.filter(a=>!a.archived),'newest'),brief:data.brief,
      initialView:aiOpen.routine?'claudeRoutine':null,
      update,toastFn,onClose:()=>setAiOpen(null),onSaveCopy:saveAiCopy,onSaveNote:saveAiNote}):null,

    sheet&&sheet.type==='confirm'?h(ConfirmSheet,{T,
      title:sheet.kind==='delete'?('Delete '+(sheet.ids.length>1?sheet.ids.length+' articles?':'article?')):sheet.kind==='clearArchive'?'Clear archive?':'Erase everything?',
      message:sheet.kind==='delete'?'This also removes any highlights and notes in '+(sheet.ids.length>1?'these articles':'this article')+'. This can\'t be undone.':sheet.kind==='clearArchive'?'All archived articles and their highlights will be permanently removed.':'All articles, highlights, folders, and settings will be permanently removed from this device.',
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
      folders:data.siteFolders||[],
      onFolders:fn=>update(d=>({...d,siteFolders:fn(d.siteFolders||[])})),
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
