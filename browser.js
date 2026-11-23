/* Instapaper — Browser + Browser Agent (React)
   An on-device rebuild of the browser-use agent loop for iPhone:
   - multi-tab browser with two views per tab:
       Live  — the real site in an iframe (full JavaScript, your cookies; some sites refuse embedding)
       Smart — the page fetched through a proxy and rendered on-device without page scripts, so it
               always opens, links/forms work, and the agent can read and drive it
   - the agent sees an indexed list of interactive elements ([12]<a href=…>text</a>), decides
     actions as JSON (search, go_to_url, click, input_text, send_keys, scroll, extract, tabs,
     files, done…), runs them, and loops with memory, a todo.md file system and step history
   - models: Gemini, OpenRouter, Claude (Anthropic API) or OpenAI with your own key, or
     Browser Use Cloud (beta) for a real remote Chromium
   Loaded before app.js; everything from app.js (h, Icons, Sheet, fetch helpers…) is used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef,useCallback,useMemo}=React;

/* ============================== config ============================== */
const AGENT_DEFAULTS={maxSteps:25,maxActions:5,maxFailures:3,thinking:false,flash:false,highlight:true,depth:3,engine:'duckduckgo',allowed:'',instructions:'',jsRender:true};
const PROVIDERS={
  gemini:{label:'Gemini',keyField:'geminiKey',keyUrl:'https://aistudio.google.com/apikey',keyHint:'AIza…',
    models:[['gemini-2.5-flash','Gemini 2.5 Flash (free tier)'],['gemini-2.5-pro','Gemini 2.5 Pro'],['gemini-2.5-flash-lite','Gemini 2.5 Flash-Lite']],def:'gemini-2.5-flash'},
  openrouter:{label:'OpenRouter',keyField:'aiKey',keyUrl:'https://openrouter.ai/keys',keyHint:'sk-or-…',models:null,def:''},
  anthropic:{label:'Claude',keyField:'anthropicKey',keyUrl:'https://console.anthropic.com/settings/keys',keyHint:'sk-ant-…',
    models:[['claude-sonnet-5-5','Claude Sonnet 5.5'],['claude-opus-5-5','Claude Opus 5.5'],['claude-haiku-5-5','Claude Haiku 5.5 (fast)']],def:'claude-sonnet-5-5'},
  openai:{label:'OpenAI',keyField:'openaiKey',keyUrl:'https://platform.openai.com/api-keys',keyHint:'sk-…',
    models:[['gpt-5-mini','GPT-5 mini'],['gpt-5','GPT-5'],['gpt-4.1-mini','GPT-4.1 mini']],def:'gpt-5-mini'},
  cloud:{label:'Browser Use Cloud',keyField:'browserUseKey',keyUrl:'https://cloud.browser-use.com',keyHint:'bu_…',models:[],def:''}
};
const PROVIDER_ORDER=['gemini','openrouter','anthropic','openai','cloud'];
const LIVE_SANDBOX='allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';
const HL_COLORS=['#e5484d','#2f9e44','#1c7ed6','#f08c00','#9c36b5','#0c8599','#d6336c','#5f3dc4','#e8590c','#2b8a3e','#c92a2a','#1971c2'];
const EXAMPLES=[
  'Find the top 5 stories on Hacker News right now, with links',
  'Search Wikipedia for the Chola dynasty and give me 5 key facts',
  'Find this week’s weather forecast for Hyderabad',
  'Summarize the current page in 5 bullet points',
  'Compare the 3 cheapest flights from Hyderabad to Delhi next Friday',
  'Find 3 well-reviewed vegetarian recipes for dinner and save them to my reading list'
];

function agentOpts(S){return Object.assign({},AGENT_DEFAULTS,S.agent||{})}
function agentProvider(S){
  if(S.agentProvider&&PROVIDERS[S.agentProvider])return S.agentProvider;
  if(S.geminiKey)return'gemini';
  if(S.aiKey)return'openrouter';
  if(S.anthropicKey)return'anthropic';
  if(S.openaiKey)return'openai';
  return'gemini';
}
function agentCfg(S){
  const provider=agentProvider(S);
  const P=PROVIDERS[provider];
  const models=S.agentModels||{};
  let model=models[provider]||'';
  if(!model)model=provider==='openrouter'?(S.aiModel||'meta-llama/llama-3.3-70b-instruct:free'):provider==='gemini'?(S.geminiModel||P.def):P.def;
  return{provider,model,key:String(S[P.keyField]||'').trim(),label:P.label};
}
function modelLabel(cfg){
  if(cfg.provider==='cloud')return'Browser Use Cloud';
  const P=PROVIDERS[cfg.provider];
  const list=P.models||(typeof AI_MODELS!=='undefined'?AI_MODELS:[]);
  const m=list.find(x=>x[0]===cfg.model);
  return m?m[1]:(cfg.model||P.label);
}

/* ============================== small utils ============================== */
const trunc=(s,n)=>{s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'…':s};
const squish=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const num=(v,d)=>{const n=Number(v);return isFinite(n)?n:d};
function hostOf(u){try{return new URL(u).hostname.toLowerCase()}catch(e){return''}}
function allowedHost(url,allowed){
  const list=String(allowed||'').split(/[\s,]+/).map(s=>s.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'')).filter(Boolean);
  if(!list.length)return true;
  const host=hostOf(url);if(!host)return false;
  return list.some(p=>{const d=p.replace(/^\*\./,'');return host===d||host.endsWith('.'+d)});
}
function looksLikeHtml(s){return/<(html|head|body|div|p|a|title|meta|!doctype)[\s>]/i.test(String(s).slice(0,4000))}
function fmtTime(ts){try{return new Date(ts).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}catch(e){return''}}
function fmtWhen(ts){
  if(!ts)return'';const d=new Date(ts),now=new Date();
  if(d.toDateString()===now.toDateString())return'Today '+fmtTime(ts);
  return d.toLocaleDateString([],{month:'short',day:'numeric'})+' '+fmtTime(ts);
}
function nowStamp(){const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())}

/* keep the screen awake while the agent works — iOS suspends background pages */
const WL={l:null,want:false,
  async on(){this.want=true;try{if(navigator.wakeLock&&!this.l){this.l=await navigator.wakeLock.request('screen');this.l.addEventListener('release',()=>{this.l=null})}}catch(e){}},
  off(){this.want=false;try{if(this.l)this.l.release()}catch(e){}this.l=null}};
document.addEventListener('visibilitychange',()=>{if(WL.want&&document.visibilityState==='visible')WL.on()});
const waitVisible=()=>document.visibilityState==='visible'?Promise.resolve():new Promise(r=>{const f=()=>{if(document.visibilityState==='visible'){document.removeEventListener('visibilitychange',f);r()}};document.addEventListener('visibilitychange',f)});

/* styles the browser needs (progress bar, result typography…) */
(function injectCss(){
  const st=document.createElement('style');
  st.textContent=
    '@keyframes buind{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}'+
    '.bu-prog{position:absolute;top:0;left:0;right:0;height:2.5px;overflow:hidden;z-index:6;pointer-events:none}'+
    '.bu-prog>i{display:block;width:40%;height:100%;animation:buind 1.05s ease-in-out infinite}'+
    '@keyframes bupulse{0%,100%{opacity:1}50%{opacity:.35}}.bu-pulse{animation:bupulse 1.2s ease-in-out infinite}'+
    '.bu-scroll{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}'+
    '.bu-res,.bu-res *{-webkit-user-select:text!important;user-select:text!important}'+
    '.bu-res p{margin:0 0 .75em}.bu-res ul,.bu-res ol{padding-left:1.3em;margin:0 0 .75em}.bu-res li{margin-bottom:.3em}'+
    '.bu-res a{color:inherit;text-decoration:underline;text-underline-offset:2px}.bu-res h2,.bu-res h3,.bu-res h4,.bu-res h5{margin:.9em 0 .4em;font-size:1.04em}'+
    '.bu-res pre{white-space:pre-wrap;font-size:.85em}.bu-res img{max-width:100%;border-radius:8px}.bu-res table{border-collapse:collapse}'+
    '.bu-ta{-webkit-user-select:text!important;user-select:text!important}';
  (document.head||document.documentElement).appendChild(st);
})();

/* ============================== page loading (Smart view) ============================== */
async function proxyPost(url,body){
  /* only corsproxy.io passes POST bodies through */
  const res=await fetchWithTimeout('https://corsproxy.io/?url='+encodeURIComponent(url),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body},25000);
  if(!res.ok)throw new Error('form post failed ('+res.status+')');
  return res.text();
}
/* Jina Reader renders the page in a real headless browser and hands back the resulting HTML —
   this is how JavaScript-built sites still show content in Smart view */
async function fetchRendered(url){
  const res=await fetchWithTimeout('https://r.jina.ai/'+url,{headers:{'X-Return-Format':'html'}},25000);
  if(!res.ok)throw new Error('renderer '+res.status);
  const t=await res.text();
  if(!t||t.length<150)throw new Error('empty render');
  return t;
}
const BOT_RX=/just a moment|attention required|access denied|are you a robot|verify you are (a )?human|checking your browser|enable javascript and cookies|pardon our interruption|request blocked|unusual traffic|captcha/i;
const STRIP_SEL='script,iframe,frame,frameset,object,embed,applet,base,portal,meta[http-equiv],link[rel~="preload"],link[rel~="modulepreload"],link[rel~="prefetch"],link[rel~="prerender"],link[rel~="manifest"],link[rel~="serviceworker"]';
function preparePage(raw,url){
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const hadScripts=doc.querySelectorAll('script').length;
  let refresh='';
  const mr=doc.querySelector('meta[http-equiv="refresh" i]');
  if(mr){const m=/url\s*=\s*['"]?([^'"]+)/i.exec(mr.getAttribute('content')||'');if(m)refresh=absUrl(m[1].trim(),url)}
  /* embedded frames become plain links */
  doc.querySelectorAll('iframe[src]').forEach(f=>{
    const src=absUrl(f.getAttribute('src')||'',url);
    if(/^https?:/.test(src)&&!/doubleclick|googlesyndication|adservice|amazon-adsystem/.test(src)){
      const a=doc.createElement('a');a.href=src;a.textContent='▶ Embedded content: '+(domainOf(src)||src);
      a.setAttribute('style','display:block;padding:10px 12px;margin:8px 0;border:1px solid #ccc;border-radius:8px;font:14px -apple-system,system-ui,sans-serif;color:#1c7ed6;text-decoration:none');
      f.replaceWith(a);
    }
  });
  doc.querySelectorAll('link[rel~="preload"][as="style"]').forEach(l=>{l.setAttribute('rel','stylesheet');l.removeAttribute('as')});
  doc.querySelectorAll('link[rel~="stylesheet"][media="print"][onload],link[rel~="stylesheet"][media="none"][onload]').forEach(l=>l.setAttribute('media','all'));
  const blocked=BOT_RX.test(squish(doc.title||''))||BOT_RX.test(squish((doc.body&&doc.body.textContent)||'').slice(0,600));
  doc.querySelectorAll(STRIP_SEL).forEach(n=>n.remove());
  /* no scripts run here, so <noscript> fallbacks are exactly what we want */
  doc.querySelectorAll('noscript').forEach(n=>{const f=doc.createDocumentFragment();while(n.firstChild)f.appendChild(n.firstChild);n.replaceWith(f)});
  const all=doc.getElementsByTagName('*');
  for(let i=0;i<all.length;i++){
    const el=all[i];
    const names=el.getAttributeNames?el.getAttributeNames():[];
    for(const nm of names){
      const ln=nm.toLowerCase();
      if(ln.startsWith('on')){if(ln==='onclick')el.setAttribute('data-bu-js','1');el.removeAttribute(nm);continue}
      if(ln==='href'||ln==='src'||ln==='action'||ln==='formaction'||ln==='xlink:href'){
        const v=(el.getAttribute(nm)||'').trim();
        if(/^(javascript|vbscript|data:text\/html)/i.test(v)){el.removeAttribute(nm);el.setAttribute('data-bu-js','1')}
      }
    }
    const tag=el.tagName;
    if(tag==='IMG'||tag==='SOURCE'){
      const lazy=el.getAttribute('data-src')||el.getAttribute('data-lazy-src')||el.getAttribute('data-original')||el.getAttribute('data-url')||el.getAttribute('data-hi-res-src');
      const src=el.getAttribute('src')||'';
      if(lazy&&(!src||/^data:/.test(src)||/blank|placeholder|spacer|pixel|lazy/i.test(src)))el.setAttribute('src',lazy);
      const ls=el.getAttribute('data-srcset')||el.getAttribute('data-lazy-srcset');
      if(ls)el.setAttribute('srcset',ls);
    }
  }
  let head=doc.head;if(!head){head=doc.createElement('head');doc.documentElement.prepend(head)}
  const base=doc.createElement('base');base.setAttribute('href',url);base.setAttribute('target','_self');head.prepend(base);
  const cs=doc.createElement('meta');cs.setAttribute('charset','utf-8');head.prepend(cs);
  const st=doc.createElement('style');
  st.textContent='html{-webkit-text-size-adjust:100%}img,video{max-width:100%;height:auto}'+
    '.async-hide,[data-aos],.aos-init,.lazyload,.lazyloading,.lazyloaded,.wow,.animate__animated,.fade-in,.fadeIn,.reveal,.js-reveal,[data-animate],[data-scroll]{opacity:1!important;visibility:visible!important;transform:none!important;animation:none!important}';
  head.appendChild(st);
  let textLen=0;
  if(doc.body){
    const w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())){const p=n.parentNode&&n.parentNode.nodeName;if(p==='STYLE'||p==='TEMPLATE')continue;textLen+=squish(n.nodeValue).length;if(textLen>4000)break}
  }
  const title=squish(doc.title||'');
  return{srcdoc:'<!DOCTYPE html>'+doc.documentElement.outerHTML,title,textLen,thin:textLen<250||blocked,blocked,hadScripts,refresh};
}
function revealPage(doc,win){
  try{
    const fix=(el,prop,val)=>{try{el.style.setProperty(prop,val,'important')}catch(e){}};
    const vw=win.innerWidth||390,vh=win.innerHeight||700;
    [doc.documentElement,doc.body].forEach((el,i)=>{
      if(!el)return;const cs=win.getComputedStyle(el);
      if(cs.display==='none')fix(el,'display','block');
      if(cs.visibility==='hidden')fix(el,'visibility','visible');
      if(parseFloat(cs.opacity)<0.1)fix(el,'opacity','1');
      if(cs.overflowY==='hidden'||cs.overflow==='hidden')fix(el,'overflow-y',i===0?'auto':'visible'); // scroll locks left by loaders/modals
      if(i===1&&/fixed/.test(cs.position))fix(el,'position','static');
    });
    const RX=/preload|loader|loading|spinner|overlay|modal|backdrop|consent|cookie|paywall|gdpr|splash|interstitial|popup|wall/i;
    const all=doc.body?doc.body.getElementsByTagName('*'):[];
    for(let i=0;i<all.length&&i<6000;i++){
      const el=all[i];if(el.hasAttribute('data-bu-ov'))continue;
      const cs=win.getComputedStyle(el);
      if(cs.display==='none')continue;
      if(cs.position==='fixed'){
        const r=el.getBoundingClientRect();
        if(r.width>=vw*0.85&&r.height>=vh*0.7){
          const t=squish(el.textContent).length;const tag=(el.id||'')+' '+(el.getAttribute('class')||'');
          if(t<150||(RX.test(tag)&&t<2500))fix(el,'display','none');
        }
      }else if(cs.opacity==='0'&&cs.position!=='absolute'&&squish(el.textContent).length>30)fix(el,'opacity','1');
    }
  }catch(e){}
}
function visibleTextLen(doc,win){
  if(!doc||!doc.body)return 0;
  const w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let n,len=0,c=0;const seen=new Map();
  while((n=w.nextNode())&&c++<8000){
    const v=n.nodeValue;if(!v||!/\S/.test(v))continue;
    const p=n.parentElement;if(!p||SKIP_TAGS[p.tagName]||p.closest('[data-bu-ov]'))continue;
    let vis=seen.get(p);
    if(vis==null){vis=elVisible(p,win);if(vis){const r=p.getBoundingClientRect();vis=r.width>0&&r.height>0}seen.set(p,vis)}
    if(vis){len+=v.trim().length;if(len>600)return len}
  }
  return len;
}
function looksBlank(doc,win){
  if(!doc||!doc.body)return true;
  if(visibleTextLen(doc,win)>=150)return false;
  let imgs=0;doc.querySelectorAll('img').forEach(im=>{if(imgs<3){const r=im.getBoundingClientRect();if(r.width>120&&r.height>80&&elVisible(im,win))imgs++}});
  return imgs<2;
}
function readerShell(title,html,url){
  return'<html><head><title>'+escapeHtml(title||'')+'</title><style>body{margin:0;padding:18px 18px 40px;font:17px/1.6 Georgia,serif;color:#1c1c1e;background:#fff}h1{font:700 24px/1.25 -apple-system,system-ui,sans-serif;margin:0 0 6px}.src{font:13px -apple-system,system-ui,sans-serif;color:#888;margin-bottom:18px}img{max-width:100%;height:auto;border-radius:6px}a{color:#1c7ed6}pre{white-space:pre-wrap}</style></head><body><h1>'+escapeHtml(title||domainOf(url))+'</h1><div class="src">Reader view · '+escapeHtml(domainOf(url))+'</div><article>'+html+'</article></body></html>';
}
function textShell(text,url){
  return'<html><head><title>'+escapeHtml(domainOf(url))+'</title></head><body style="margin:0;padding:14px;background:#fff"><pre style="white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,Menlo,monospace;color:#222">'+escapeHtml(String(text).slice(0,400000))+'</pre></body></html>';
}
/* The proxy pool fetches the raw page; the remote renderer (a real headless browser) joins the race
   after 2.5s, or at once if the raw page is an empty JavaScript shell. The first full page wins. */
function raceLoad(url,o){
  return new Promise(resolve=>{
    let done=false,pPrep=null,pDone=false,jStarted=false,jDone=false,jPrep=null,err=null,timer=0;
    const fin=r=>{if(done)return;done=true;clearTimeout(timer);resolve(Object.assign({err},r))};
    const check=()=>{
      if(done)return;
      if(pPrep&&pPrep.text!=null)return fin({text:pPrep.text});
      if(pPrep&&!pPrep.thin)return fin({prep:pPrep,via:'proxy'});
      if(jPrep&&!jPrep.thin)return fin({prep:jPrep,via:'rendered'});
      if(!pDone)return;
      if(!jStarted&&(o.jsRender!==false||!pPrep)){startJ();return}
      if(jStarted&&!jDone)return;
      const best=[pPrep&&{prep:pPrep,via:'proxy'},jPrep&&{prep:jPrep,via:'rendered'}].filter(Boolean).sort((a,b)=>b.prep.textLen-a.prep.textLen)[0];
      fin(best||{});
    };
    const startJ=()=>{if(jStarted||done)return;jStarted=true;
      fetchRendered(url).then(t=>{jPrep=preparePage(t,url)}).catch(e=>{if(!err)err=e}).then(()=>{jDone=true;check()})};
    fetchRawHtml(url).then(raw=>{pPrep=looksLikeHtml(raw)?preparePage(raw,url):{text:raw}}).catch(e=>{err=e}).then(()=>{pDone=true;check()});
    timer=setTimeout(startJ,2500);
    setTimeout(()=>{ // never let one page load hang the agent: take the best page so far
      if(done)return;
      if(pPrep&&pPrep.text!=null)return fin({text:pPrep.text});
      const best=[pPrep&&{prep:pPrep,via:'proxy'},jPrep&&{prep:jPrep,via:'rendered'}].filter(Boolean).sort((a,b)=>b.prep.textLen-a.prep.textLen)[0];
      fin(best||{});
    },20000);
  });
}
async function fetchSmartPage(req,o){
  const url=req.url;
  if(/\.pdf(\?|#|$)/i.test(url)){
    const rd=await fetchViaJina(url);
    const p=preparePage(readerShell(rd.title,rd.html,url),url);
    return{url,title:rd.title||domainOf(url),srcdoc:p.srcdoc,via:'reader'};
  }
  let err=null,via='proxy',prep=null;
  if(req.method==='POST'){
    try{const raw=await proxyPost(url,req.body||'');prep=looksLikeHtml(raw)?preparePage(raw,url):null;
      if(!prep)return{url,title:domainOf(url),srcdoc:preparePage(textShell(raw,url),url).srcdoc,via:'text'}}catch(e){err=e}
  }else{
    const r=await raceLoad(url,o);
    err=r.err;
    if(r.text!=null)return{url,title:domainOf(url),srcdoc:preparePage(textShell(r.text,url),url).srcdoc,via:'text'};
    if(r.prep){prep=r.prep;via=r.via}
    if(prep&&via==='proxy'&&prep.refresh&&prep.thin&&prep.refresh!==url&&!req._hop)return fetchSmartPage({url:prep.refresh,_hop:1},o);
  }
  if(!prep&&req.method!=='POST'){
    try{const rd=await fetchViaJina(url);prep=preparePage(readerShell(rd.title,rd.html,url),url);via='reader'}catch(e){}
  }
  if(!prep)throw err||new Error('could not load the page');
  return{url,title:prep.title||domainOf(url),srcdoc:prep.srcdoc,via};
}

/* ---------- web search (DuckDuckGo → Bing → Google), rendered as a clean results page ---------- */
const ENGINES={
  duckduckgo:{label:'DuckDuckGo',url:q=>'https://html.duckduckgo.com/html/?q='+encodeURIComponent(q),show:q=>'https://duckduckgo.com/?q='+encodeURIComponent(q)},
  bing:{label:'Bing',url:q=>'https://www.bing.com/search?setlang=en&q='+encodeURIComponent(q),show:q=>'https://www.bing.com/search?q='+encodeURIComponent(q)},
  google:{label:'Google',url:q=>'https://www.google.com/search?hl=en&gbv=1&q='+encodeURIComponent(q),show:q=>'https://www.google.com/search?q='+encodeURIComponent(q)}
};
function decodeResultUrl(href,engine){
  try{
    const u=new URL(href,engine==='duckduckgo'?'https://duckduckgo.com':engine==='bing'?'https://www.bing.com':'https://www.google.com');
    if(engine==='duckduckgo'&&u.searchParams.get('uddg'))return u.searchParams.get('uddg');
    if(engine==='google'&&u.pathname==='/url')return u.searchParams.get('q')||u.searchParams.get('url')||'';
    if(engine==='bing'&&/\/ck\/a/.test(u.pathname)){
      const v=u.searchParams.get('u')||'';
      if(v.startsWith('a1')){const b=v.slice(2).replace(/-/g,'+').replace(/_/g,'/');return atob(b+'==='.slice((b.length+3)%4))}
    }
    return u.href;
  }catch(e){return''}
}
function parseResults(raw,engine){
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const out=[];const seen=new Set();
  const push=(title,href,snip)=>{
    const url=decodeResultUrl(href,engine);
    if(!/^https?:/.test(url)||seen.has(url))return;
    if(/duckduckgo\.com\/y\.js|bing\.com\/aclick|googleadservices/.test(url))return;
    seen.add(url);out.push({title:squish(title)||url,url,snippet:squish(snip)});
  };
  if(engine==='duckduckgo'){
    doc.querySelectorAll('.result').forEach(r=>{
      if(r.classList.contains('result--ad'))return;
      const a=r.querySelector('a.result__a');if(!a)return;
      const sn=r.querySelector('.result__snippet');
      push(a.textContent,a.getAttribute('href')||'',sn?sn.textContent:'');
    });
  }else if(engine==='bing'){
    doc.querySelectorAll('li.b_algo').forEach(r=>{
      const a=r.querySelector('h2 a');if(!a)return;
      const sn=r.querySelector('.b_caption p,.b_lineclamp2,.b_lineclamp3,.b_paractl');
      push(a.textContent,a.getAttribute('href')||'',sn?sn.textContent:'');
    });
  }else{
    doc.querySelectorAll('a[href^="/url?"]').forEach(a=>{
      const h3=a.querySelector('h3,span');if(!h3)return;
      let box=a.closest('div');let sn='';
      for(let i=0;i<3&&box;i++){const t=squish(box.textContent);if(t.length>squish(a.textContent).length+40){sn=t.replace(squish(a.textContent),'');break}box=box.parentElement}
      push(h3.textContent,a.getAttribute('href')||'',sn.slice(0,300));
    });
  }
  return out.slice(0,20);
}
function webSearch(query,engine){
  const order=[engine||'duckduckgo','duckduckgo','bing','google'].filter((e,i,a)=>ENGINES[e]&&a.indexOf(e)===i);
  const fetchOk=(u,ok)=>typeof fetchRawAcross==='function'?fetchRawAcross(u,ok,15000):fetchRawHtml(u);
  return new Promise((resolve,reject)=>{
    let done=false,left=order.length,lastErr=null;const timers=[];
    order.forEach((e,i)=>timers.push(setTimeout(async()=>{
      if(done){left--;return}
      try{
        const raw=await fetchOk(ENGINES[e].url(query),t=>parseResults(t,e).length>0);
        const res=parseResults(raw,e);
        if(res.length&&!done){done=true;timers.forEach(clearTimeout);resolve({engine:e,results:res});return}
        lastErr=new Error(ENGINES[e].label+' returned no results');
      }catch(err){lastErr=err}
      if(--left===0&&!done)reject(lastErr||new Error('search failed'));
    },i*1800)));
  });
}
function searchPageHtml(query,engine,results){
  const items=results.map(r=>'<div class="r"><a href="'+escapeHtml(r.url)+'"><span class="t">'+escapeHtml(r.title)+'</span></a><div class="u">'+escapeHtml(domainOf(r.url))+'</div>'+(r.snippet?'<p>'+escapeHtml(trunc(r.snippet,260))+'</p>':'')+'</div>').join('');
  return'<html><head><title>'+escapeHtml(query)+' — Search</title><style>'+
    'body{margin:0;padding:12px 16px 40px;font:15px/1.45 -apple-system,system-ui,sans-serif;color:#1c1c1e;background:#fff}'+
    'form{display:flex;gap:8px;margin:2px 0 6px}input{flex:1;font-size:16px;padding:10px 12px;border:1px solid #d0d0d6;border-radius:10px;min-width:0}'+
    'button{font-size:15px;padding:0 14px;border:0;border-radius:10px;background:#1c1c1e;color:#fff}.via{font-size:12px;color:#8a8a90;margin:0 0 8px}'+
    '.r{padding:12px 0;border-bottom:1px solid #eee}.r a{text-decoration:none}.t{font-size:16.5px;font-weight:600;color:#1a5fb4}.u{font-size:12.5px;color:#2b8a3e;margin-top:2px;word-break:break-all}.r p{margin:5px 0 0;color:#444;font-size:14px}'+
    '</style></head><body><form data-bu-search="1" data-engine="'+escapeHtml(engine)+'"><input name="q" value="'+escapeHtml(query)+'" aria-label="Search"><button type="submit">Search</button></form>'+
    '<div class="via">'+results.length+' results from '+escapeHtml(ENGINES[engine].label)+'</div>'+items+'</body></html>';
}

/* ============================== DOM state for the agent ============================== */
const SKIP_TAGS={SCRIPT:1,STYLE:1,NOSCRIPT:1,TEMPLATE:1,HEAD:1,META:1,LINK:1,TITLE:1,svg:1,SVG:1,CANVAS:1,VIDEO:0,AUDIO:0,MAP:1,OBJECT:1};
const BLOCK_TAGS={P:1,DIV:1,SECTION:1,ARTICLE:1,MAIN:1,ASIDE:1,HEADER:1,FOOTER:1,NAV:1,UL:1,OL:1,LI:1,DL:1,DT:1,DD:1,TABLE:1,THEAD:1,TBODY:1,TR:1,BLOCKQUOTE:1,PRE:1,FIGURE:1,FIGCAPTION:1,FORM:1,FIELDSET:1,LEGEND:1,H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,HR:1,ADDRESS:1,DETAILS:1,CAPTION:1};
const ROLE_RX=/^(button|link|checkbox|radio|tab|menuitem|menuitemcheckbox|menuitemradio|option|switch|combobox|textbox|searchbox|slider|spinbutton|treeitem)$/;
function isInteractive(el){
  const t=el.tagName;
  if(t==='A')return el.hasAttribute('href')||el.hasAttribute('data-bu-js');
  if(t==='INPUT')return(el.getAttribute('type')||'').toLowerCase()!=='hidden';
  if(t==='BUTTON'||t==='SELECT'||t==='TEXTAREA'||t==='SUMMARY')return true;
  const role=el.getAttribute('role');if(role&&ROLE_RX.test(role))return true;
  const ce=el.getAttribute('contenteditable');if(ce!=null&&ce!=='false')return true;
  if(el.hasAttribute('data-bu-js')||el.hasAttribute('data-href'))return true;
  return false;
}
function elVisible(el,win){
  try{
    if(el.checkVisibility){
      if(el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return true;
      return win.getComputedStyle(el).display==='contents';
    }
    const cs=win.getComputedStyle(el);
    return!(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0');
  }catch(e){return true}
}
function elText(el){
  let t='';
  try{t=el.innerText!=null?el.innerText:el.textContent}catch(e){t=el.textContent}
  t=squish(t);
  if(!t){const img=el.querySelector&&el.querySelector('img[alt]');if(img)t=squish(img.getAttribute('alt'))}
  return t;
}
function shortHref(href,pageUrl){
  try{const u=new URL(href,pageUrl);const p=new URL(pageUrl);
    if(u.host===p.host)return trunc(u.pathname+u.search+u.hash,70)||'/';
    return trunc(u.host.replace(/^www\./,'')+u.pathname+u.search,80);
  }catch(e){return trunc(href,70)}
}
function elSig(el){return el.tagName+'|'+(el.getAttribute('href')||el.getAttribute('name')||el.getAttribute('aria-label')||'')+'|'+elText(el).slice(0,40)}
function fmtEl(el,idx,mark,pageUrl){
  const tag=el.tagName.toLowerCase();
  const at=[];
  const add=(k,v)=>{v=squish(v);if(v)at.push(k+'='+(/[\s"=<>]/.test(v)?JSON.stringify(trunc(v,60)):trunc(v,60)))};
  const type=(el.getAttribute('type')||'').toLowerCase();
  if(tag==='input'||tag==='button')add('type',type);
  add('role',el.getAttribute('role'));
  add('name',el.getAttribute('name'));
  add('placeholder',el.getAttribute('placeholder'));
  add('aria-label',el.getAttribute('aria-label'));
  if(!elText(el))add('title',el.getAttribute('title'));
  if(tag==='a'&&el.getAttribute('href'))add('href',shortHref(el.getAttribute('href'),pageUrl));
  if(tag==='input'||tag==='textarea'){
    if(type==='checkbox'||type==='radio')at.push('checked='+(!!el.checked));
    else if(type==='password'){if(el.value)at.push('value=•••')}
    else if(el.value)add('value',el.value);
  }
  if(tag==='select'){
    const o=el.selectedOptions&&el.selectedOptions[0];
    if(o)add('selected',o.textContent);
    at.push('options='+el.options.length);
  }
  const ex=el.getAttribute('aria-expanded');if(ex)at.push('expanded='+ex);
  if(el.disabled)at.push('disabled');
  if(el.hasAttribute('data-bu-js')&&tag!=='a')at.push('needs-js');
  let text='';
  if(tag!=='input'&&tag!=='textarea'&&tag!=='select')text=trunc(elText(el),90);
  return(mark?'*':'')+'['+idx+']<'+tag+(at.length?' '+at.join(' '):'')+(text?'>'+text+'</'+tag+'>':' />');
}
/* Walks the live Smart-view document and produces browser-use style state text.
   mode 'agent' : viewport window (+depth screens below), indexed interactive elements
   mode 'all'   : whole page as readable markdown-ish text (for extract) */
function captureState(doc,win,o){
  o=o||{};
  const all=o.mode==='all';
  const pageUrl=o.url||'';
  const vh=win.innerHeight||700,vw=win.innerWidth||390;
  const se=doc.scrollingElement||doc.documentElement;
  const sy=se.scrollTop||win.scrollY||0;
  const total=Math.max(se.scrollHeight||0,doc.body?doc.body.scrollHeight:0,vh);
  const topLim=-vh*0.15,botLim=vh*Math.max(1,o.depth||2);
  const out=[];let line='';const els=[];const sigs=new Set();
  const prev=o.prevSigs;
  let budget=all?12000:7000;
  let inView=true;
  const flush=()=>{const s=squish(line);if(s&&s!=='-'&&s!=='|')out.push(s);line=''};
  const walk=node=>{
    for(let c=node.firstChild;c;c=c.nextSibling){
      if(--budget<0)return;
      if(c.nodeType===3){if(inView){const v=c.nodeValue;if(v&&/\S/.test(v))line+=' '+v}continue}
      if(c.nodeType!==1)continue;
      const tag=c.tagName;
      if(SKIP_TAGS[tag]||c.hasAttribute('data-bu-ov'))continue;
      if(tag==='BR'){flush();continue}
      if(!elVisible(c,win))continue;
      let r=null;
      try{r=c.getBoundingClientRect()}catch(e){}
      const sized=r&&(r.width>0||r.height>0);
      const here=all?true:(sized?(r.bottom>topLim&&r.top<botLim):inView);
      if(isInteractive(c)){
        if(!here||(!sized&&!all))continue;
        if(all){
          const t=elText(c);const href=c.tagName==='A'?c.getAttribute('href'):'';
          if(t)line+=' '+(o.links&&href?'['+t+']('+absUrl(href,pageUrl)+')':t);
          continue;
        }
        flush();
        const sig=elSig(c);sigs.add(sig);
        const idx=els.length+1;els.push(c);
        out.push(fmtEl(c,idx,prev&&prev.size&&!prev.has(sig),pageUrl));
        continue;
      }
      if(tag==='IMG'){
        if(here){const alt=squish(c.getAttribute('alt'));if(alt.length>2)line+=' [image: '+trunc(alt,70)+']'}
        continue;
      }
      if(tag==='HR'){flush();continue}
      const block=BLOCK_TAGS[tag];
      const hm=/^H([1-6])$/.exec(tag);
      if(block)flush();
      if(hm&&here)line='#'.repeat(+hm[1])+' ';
      else if(tag==='LI'&&here)line='- ';
      else if((tag==='TD'||tag==='TH')&&here&&/\S/.test(line))line+=' | ';
      const saved=inView;inView=here;
      walk(c);
      inView=saved;
      if(block)flush();
    }
  };
  if(doc.body)walk(doc.body);
  flush();
  /* drop immediate duplicate lines (menus repeated for mobile/desktop, etc.) */
  const lines=[];for(const l of out)if(lines[lines.length-1]!==l)lines.push(l);
  let text=lines.join('\n');
  const maxChars=o.maxChars||(all?60000:14000);
  let truncated=false;
  if(text.length>maxChars){text=text.slice(0,maxChars);truncated=true}
  const above=sy,below=Math.max(0,total-(sy+(all?total:vh*Math.max(1,o.depth||2))));
  return{text,truncated,els,sigs,vh,vw,sy,total,above,below};
}
function stateText(cap){
  const pg=px=>(px/cap.vh).toFixed(1);
  let s='';
  s+=cap.above>8?'... '+Math.round(cap.above)+' pixels above ('+pg(cap.above)+' pages) - scroll up to see more ...\n':'[Start of page]\n';
  s+=cap.text||'(no readable content in this part of the page)';
  if(cap.truncated)s+='\n... (element list truncated — scroll or use extract) ...';
  s+=cap.below>8?'\n... '+Math.round(cap.below)+' pixels below ('+pg(cap.below)+' pages) - scroll down to see more, or use extract to read the whole page ...':'\n[End of page]';
  return s;
}
/* browser-use style numbered boxes drawn on the page */
function clearOverlay(doc){try{doc.querySelectorAll('[data-bu-ov]').forEach(n=>n.remove())}catch(e){}}
function drawOverlay(doc,win,els){
  clearOverlay(doc);
  if(!els||!els.length)return;
  const box=doc.createElement('div');
  box.setAttribute('data-bu-ov','1');
  box.setAttribute('style','position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none');
  const sx=win.scrollX||0,sy=win.scrollY||0;
  let html='';
  els.slice(0,220).forEach((el,i)=>{
    let r;try{r=el.getBoundingClientRect()}catch(e){return}
    if(!r||(!r.width&&!r.height))return;
    const c=HL_COLORS[i%HL_COLORS.length];
    const top=r.top+sy,left=r.left+sx;
    html+='<div style="position:absolute;box-sizing:border-box;left:'+left+'px;top:'+top+'px;width:'+Math.max(4,r.width)+'px;height:'+Math.max(4,r.height)+'px;border:2px solid '+c+';background:'+c+'1f;border-radius:3px"></div>'+
      '<div style="position:absolute;left:'+Math.max(0,left+r.width-2)+'px;top:'+Math.max(0,top-1)+'px;transform:translate(-100%,0);background:'+c+';color:#fff;font:700 10px/1.25 -apple-system,system-ui,sans-serif;padding:1px 4px;border-radius:3px">'+(i+1)+'</div>';
  });
  box.innerHTML=html;
  doc.documentElement.appendChild(box);
}
function flashEl(el){
  try{
    const doc=el.ownerDocument,win=doc.defaultView;
    el.scrollIntoView({block:'center',inline:'nearest'});
    const r=el.getBoundingClientRect();
    const d=doc.createElement('div');d.setAttribute('data-bu-ov','1');
    d.setAttribute('style','position:absolute;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:3px solid #e5484d;border-radius:5px;background:rgba(229,72,77,.18);left:'+(r.left+win.scrollX-3)+'px;top:'+(r.top+win.scrollY-3)+'px;width:'+(r.width+6)+'px;height:'+(r.height+6)+'px;transition:opacity .5s');
    doc.documentElement.appendChild(d);
    setTimeout(()=>{d.style.opacity='0'},650);setTimeout(()=>{try{d.remove()}catch(e){}},1200);
  }catch(e){}
}
function findTextNode(doc,text){
  const q=squish(text).toLowerCase();if(!q||!doc.body)return null;
  const w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){
    const p=n.parentElement;if(!p||p.closest('[data-bu-ov],script,style'))continue;
    if(squish(n.nodeValue).toLowerCase().includes(q))return p;
  }
  /* text split over several nodes — fall back to the smallest element containing it */
  let best=null;
  doc.body.querySelectorAll('p,li,td,th,h1,h2,h3,h4,h5,h6,span,a,div,label').forEach(el=>{
    if(squish(el.textContent).toLowerCase().includes(q)){if(!best||best.contains(el))best=el}
  });
  return best;
}
function isSubmitter(b){
  const t=(b.getAttribute('type')||'').toLowerCase();
  if(b.tagName==='BUTTON')return t===''||t==='submit';
  return t==='submit'||t==='image';
}
function defaultSubmitter(form){return form.querySelector('button:not([type]),button[type=submit],input[type=submit],input[type=image]')}

/* ============================== LLM providers ============================== */
async function httpJSON(url,opts,ms,onWait,label){
  let res;
  for(let a=0;;a++){
    try{res=await fetchWithTimeout(url,opts,ms||120000)}
    catch(e){
      if(a<1){await sleep(1500);continue}
      const er=new Error(label+': '+(e&&e.name==='AbortError'?'request timed out':'network error — check your connection'));er.network=true;throw er;
    }
    if((res.status===429||res.status===529||res.status>=500)&&a<2){
      const w=(a+1)*7;
      if(onWait)onWait(label+(res.status===429?' rate limit':' is busy')+' — retrying in '+w+'s…');
      await sleep(w*1000);continue;
    }
    break;
  }
  let j=null;try{j=await res.json()}catch(e){}
  if(!res.ok){
    let m=j&&j.error?(j.error.message||j.error):(j&&(j.message||j.detail))||('HTTP '+res.status);
    if(typeof m!=='string')m=JSON.stringify(m);
    if(res.status===401||res.status===403)m='invalid or unauthorized API key ('+m+')';
    const er=new Error(label+': '+m);er.status=res.status;throw er;
  }
  return j||{};
}
async function llmCall(cfg,messages,o){
  o=o||{};
  const P=PROVIDERS[cfg.provider];
  if(!cfg.key){const e=new Error('Add your '+P.label+' API key in Agent settings.');e.status=401;throw e}
  const sys=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
  const conv=messages.filter(m=>m.role!=='system');
  const json=o.json!==false;
  const maxT=o.maxTokens||3000;
  let text='';
  if(cfg.provider==='gemini'){
    const body={contents:conv.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:Math.max(maxT,8192),temperature:0.2}};
    if(json)body.generationConfig.responseMimeType='application/json';
    if(/^gemini-2\.5-flash/.test(cfg.model))body.generationConfig.thinkingConfig={thinkingBudget:0}; // hidden reasoning roughly triples latency
    if(sys)body.systemInstruction={parts:[{text:sys}]};
    const j=await httpJSON('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(cfg.model)+':generateContent?key='+encodeURIComponent(cfg.key),
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},150000,o.onWait,'Gemini');
    const c=j.candidates&&j.candidates[0];
    text=c&&c.content&&c.content.parts?c.content.parts.map(x=>x.text||'').join(''):'';
    if(!text.trim())throw new Error(c&&c.finishReason==='SAFETY'?'Gemini blocked this content (safety filter).':'Gemini returned an empty response.');
  }else if(cfg.provider==='anthropic'){
    const body={model:cfg.model,max_tokens:maxT,messages:conv.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}))};
    if(sys)body.system=sys;
    const j=await httpJSON('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'x-api-key':cfg.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
      body:JSON.stringify(body)},150000,o.onWait,'Claude');
    text=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
  }else if(cfg.provider==='openai'){
    const body={model:cfg.model,messages:(sys?[{role:'system',content:sys}]:[]).concat(conv),max_completion_tokens:Math.max(maxT,6000)};
    if(json)body.response_format={type:'json_object'};
    if(/^gpt-5/.test(cfg.model))body.reasoning_effort='minimal';
    const j=await httpJSON('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'},body:JSON.stringify(body)},150000,o.onWait,'OpenAI');
    const m=j.choices&&j.choices[0]&&j.choices[0].message;text=m&&m.content||'';
  }else{
    const mk=withFmt=>{const b={model:cfg.model,messages:(sys?[{role:'system',content:sys}]:[]).concat(conv),max_tokens:maxT,temperature:0.2};if(withFmt)b.response_format={type:'json_object'};return b};
    const send=b=>httpJSON('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json','X-Title':'Instapaper PWA'},body:JSON.stringify(b)},150000,o.onWait,'OpenRouter');
    let j;
    try{j=await send(mk(json))}catch(e){if(json&&e.status===400)j=await send(mk(false));else throw e}
    const m=j.choices&&j.choices[0]&&j.choices[0].message;
    text=(m&&(m.content||m.reasoning))||'';
  }
  text=String(text||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  if(!text)throw new Error(P.label+' returned an empty response — try another model.');
  return text;
}
/* tolerant JSON: code fences, prose around it, trailing commas, raw newlines inside strings */
function parseJSONLoose(s){
  s=String(s||'');
  const fence=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence&&fence[1].includes('{'))s=fence[1];
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<a){const e=new Error('The model did not reply with JSON.');e.parse=true;throw e}
  let body=s.slice(a,b+1);
  try{return JSON.parse(body)}catch(e){}
  let fixed='',inStr=false,esc=false;
  for(const ch of body){
    if(inStr){
      if(esc){fixed+=ch;esc=false;continue}
      if(ch==='\\'){fixed+=ch;esc=true;continue}
      if(ch==='"'){inStr=false;fixed+=ch;continue}
      if(ch==='\n'){fixed+='\\n';continue}
      if(ch==='\r')continue;
      if(ch==='\t'){fixed+='\\t';continue}
      fixed+=ch;
    }else{if(ch==='"')inStr=true;fixed+=ch}
  }
  fixed=fixed.replace(/,\s*([}\]])/g,'$1');
  try{return JSON.parse(fixed)}catch(e){const er=new Error('The model replied with malformed JSON.');er.parse=true;throw er}
}

/* ============================== actions ============================== */
const ACTIONS={
  search:{d:'Search the web and open the results page in the current tab. Prefer this over typing into a search engine yourself.',p:'{"query": string, "engine"?: "duckduckgo"|"bing"|"google"}'},
  go_to_url:{d:'Open a URL in the current tab, or in a new tab with new_tab=true.',p:'{"url": string, "new_tab"?: boolean}'},
  go_back:{d:'Go back to the previous page in this tab.',p:'{}'},
  go_forward:{d:'Go forward in this tab’s history.',p:'{}'},
  refresh:{d:'Reload the current page.',p:'{}'},
  wait:{d:'Wait a few seconds (max 10).',p:'{"seconds"?: number}'},
  click:{d:'Click an element by its [index]. Links navigate (new_tab=true opens them in a new tab), submit buttons submit their form, checkboxes/radios toggle, <summary> expands.',p:'{"index": number, "new_tab"?: boolean}'},
  input_text:{d:'Type text into an input, textarea or contenteditable element. clear=false appends instead of replacing. Typing does not submit — click the submit button or send_keys Enter.',p:'{"index": number, "text": string, "clear"?: boolean}'},
  send_keys:{d:'Send keys to the focused element: "Enter" submits its form; also "Tab", "Escape", "Backspace", "PageDown", "PageUp", "Home", "End", "Space", or literal text to type.',p:'{"keys": string}'},
  scroll:{d:'Scroll the page — or a scrollable element given by index — down or up by a number of pages (0.5 to 10).',p:'{"down": boolean, "num_pages"?: number, "index"?: number}'},
  scroll_to_text:{d:'Scroll to the first occurrence of some text on the page.',p:'{"text": string}'},
  get_dropdown_options:{d:'List all options of a <select> dropdown.',p:'{"index": number}'},
  select_dropdown_option:{d:'Choose an option of a <select> dropdown by its visible text (or value).',p:'{"index": number, "text": string}'},
  extract:{d:'Read the WHOLE current page (not only what is listed) with an AI extractor and return the information matching your query — best for long pages, tables, lists, prices, articles. Set extract_links=true when you need URLs. The result is shown once in <read_state>; save important parts to a file.',p:'{"query": string, "extract_links"?: boolean, "start_from_char"?: number}'},
  switch_tab:{d:'Switch to another open tab by its id.',p:'{"tab_id": number}'},
  close_tab:{d:'Close a tab by its id.',p:'{"tab_id": number}'},
  write_file:{d:'Write (or append=true to add to) a file in your file system. Allowed: .md .txt .json .csv',p:'{"file_name": string, "content": string, "append"?: boolean}'},
  read_file:{d:'Read a file from your file system (shown once in <read_state>).',p:'{"file_name": string}'},
  replace_file_str:{d:'Replace text inside a file, e.g. "- [ ] step" → "- [x] step" in todo.md.',p:'{"file_name": string, "old_str": string, "new_str": string}'},
  save_to_library:{d:'Save a web page to the user’s Instapaper reading list for offline reading (defaults to the current page). Use only when the user asks to save, bookmark or keep pages.',p:'{"url"?: string}'},
  done:{d:'Finish and report to the user. text = the complete final answer in markdown (include the key facts and source links — it is the ONLY thing the user sees). success=true only if the whole request was completed. files_to_display = file names to attach.',p:'{"text": string, "success": boolean, "files_to_display"?: string[]}'}
};
const INDEX_ACTIONS=new Set(['click','input_text','send_keys','get_dropdown_options','select_dropdown_option']);
const ALIASES={search_google:'search',web_search:'search',google_search:'search',navigate:'go_to_url',open_url:'go_to_url',goto:'go_to_url',go_to:'go_to_url',open_tab:'go_to_url',back:'go_back',forward:'go_forward',reload:'refresh',
  click_element_by_index:'click',click_element:'click',input:'input_text',type:'input_text',type_text:'input_text',fill:'input_text',keys:'send_keys',press:'send_keys',
  extract_structured_data:'extract',extract_content:'extract',extract_page_content:'extract',find_text:'scroll_to_text',dropdown_options:'get_dropdown_options',select_dropdown:'select_dropdown_option',
  replace_file:'replace_file_str',finish:'done',complete:'done',save_page:'save_to_library'};
function normActions(out){
  let list=out.action||out.actions||out.next_actions||[];
  if(!Array.isArray(list))list=[list];
  const res=[];
  for(const item of list){
    if(!item||typeof item!=='object')continue;
    let name,params;
    if(typeof item.action_name==='string'){name=item.action_name;params=item.params||item.parameters||item.args||{}}
    else if(typeof item.name==='string'&&(item.params||item.parameters||item.args||item.arguments)){name=item.name;params=item.params||item.parameters||item.args||item.arguments}
    else if(typeof item.action==='string'){name=item.action;params=item.params||Object.assign({},item,{action:undefined})}
    else{const k=Object.keys(item)[0];if(!k)continue;name=k;params=item[k]}
    name=String(name).trim();
    name=ACTIONS[name]?name:(ALIASES[name]||name);
    if(params==null||typeof params!=='object'){
      const v=params;params={};
      if(v!=null){const first={search:'query',go_to_url:'url',click:'index',scroll_to_text:'text',send_keys:'keys',extract:'query',done:'text',switch_tab:'tab_id',close_tab:'tab_id',read_file:'file_name',wait:'seconds'}[name];if(first)params[first]=v}
    }
    if(name==='go_to_url'&&(item.open_tab||Object.keys(item)[0]==='open_tab'))params.new_tab=true;
    res.push({name,params});
  }
  return res;
}
function idxOf(p){return Math.round(num(p.index!=null?p.index:p.element_index!=null?p.element_index:p.idx,NaN))}
function actionLabel(a){
  const p=a.params||{};
  switch(a.name){
    case'search':return'search “'+trunc(p.query||'',60)+'”';
    case'go_to_url':return(p.new_tab?'new tab ':'open ')+trunc(String(p.url||'').replace(/^https?:\/\/(www\.)?/,''),60);
    case'click':return'click ['+idxOf(p)+']'+(p.new_tab?' in new tab':'');
    case'input_text':return'type “'+trunc(p.text||'',40)+'” into ['+idxOf(p)+']';
    case'send_keys':return'press '+trunc(p.keys||'',30);
    case'scroll':return'scroll '+(p.down===false?'up':'down')+' '+(p.num_pages||1)+' page'+((p.num_pages||1)==1?'':'s')+(p.index!=null?' in ['+p.index+']':'');
    case'scroll_to_text':return'find “'+trunc(p.text||'',40)+'”';
    case'extract':return'extract “'+trunc(p.query||'',50)+'”';
    case'select_dropdown_option':return'select “'+trunc(p.text||'',30)+'” in ['+idxOf(p)+']';
    case'get_dropdown_options':return'list options of ['+idxOf(p)+']';
    case'switch_tab':return'switch to tab '+p.tab_id;
    case'close_tab':return'close tab '+p.tab_id;
    case'write_file':return(p.append?'append to ':'write ')+(p.file_name||'');
    case'read_file':return'read '+(p.file_name||'');
    case'replace_file_str':return'edit '+(p.file_name||'');
    case'save_to_library':return'save to reading list';
    case'wait':return'wait '+(p.seconds||3)+'s';
    case'done':return'done';
    default:return a.name.replace(/_/g,' ');
  }
}
function statusLabel(a){
  const p=a.params||{};
  switch(a.name){
    case'search':return'Searching “'+trunc(p.query||'',40)+'”…';
    case'go_to_url':return'Opening '+(domainOf(p.url)||'page')+'…';
    case'click':return'Clicking ['+idxOf(p)+']…';
    case'input_text':return'Typing into ['+idxOf(p)+']…';
    case'extract':return'Reading the whole page…';
    case'scroll':return'Scrolling…';
    case'done':return'Writing the answer…';
    default:return trunc(actionLabel(a),48).replace(/^./,c=>c.toUpperCase())+'…';
  }
}

/* ============================== agent prompt ============================== */
function systemPrompt(o,opts){
  const flash=!!opts.flash;const think=opts.thinking&&!flash;
  const acts=Object.keys(ACTIONS).filter(k=>!o.only||o.only.includes(k)).map(k=>'- '+k+': '+ACTIONS[k].d+'\n  params: '+ACTIONS[k].p).join('\n');
  const shape=flash
    ?'{\n  "memory": "1-2 sentences: what you did and what is left",\n  "next_goal": "the immediate next goal",\n  "action": [{"action_name": {params}}]\n}'
    :'{\n'+(think?'  "thinking": "structured reasoning about the state, your progress and what to do next",\n':'')+
     '  "evaluation_previous_goal": "one sentence: did the previous action succeed, fail, or is it uncertain — and why",\n'+
     '  "memory": "1-3 specific sentences: what you have done, key facts found so far, what is left (e.g. 3 of 5 items collected)",\n'+
     '  "next_goal": "the next immediate goal and the action that achieves it, in one sentence",\n'+
     '  "action": [{"action_name": {params}}, ...]\n}';
  let s='You are a browser automation agent working in an iterative loop. Your goal is to accomplish the task in <user_request> by operating a web browser, step by step.\n\n'+
  '<environment>\nYou drive a lightweight browser that runs on the user’s iPhone. Pages are fetched through a proxy and shown WITHOUT running page JavaScript and WITHOUT the user’s logins or cookies.\n'+
  '- Links, GET/POST forms, inputs, selects, checkboxes and <details> work.\n'+
  '- Buttons marked needs-js (menus, "load more", infinite scroll, JS-only search boxes) do nothing. Prefer direct URLs, site search URLs (e.g. https://en.wikipedia.org/w/index.php?search=…), the search action, or extract.\n'+
  '- JavaScript-built sites are pre-rendered by a remote renderer when possible; if a page is still empty, try another source.\n'+
  '- You cannot log in or pay. Never invent credentials.\n</environment>\n\n'+
  '<input>\nEach step you receive:\n1. <agent_history>: your previous steps and the results of their actions.\n2. <agent_state>: <user_request>, <file_system>, <todo_contents>, <step_info>.\n3. <browser_state>: current URL, open tabs, and the content of the visible part of the page with numbered interactive elements.\n4. <read_state>: shown only right after extract or read_file — this content is shown ONCE, so save what matters.\n</input>\n\n'+
  '<browser_state>\nInteractive elements look like [index]<tag attributes>text</tag>. Only elements with a numeric [index] can be used, and only indexes from the CURRENT browser_state are valid. Lines without an index are page text. Elements starting with *[ are new since the previous step. "... pixels below" means more content — scroll, or use extract to read everything at once.\n</browser_state>\n\n'+
  '<browser_rules>\n- If research is needed, use search, or open sources in new tabs.\n- If the page changes after an action, later index-based actions in that step are skipped and you get the new state next step.\n- When filling a form, type into each field, then click the submit button (or send_keys Enter).\n- If an action fails twice, try a different approach (another element, URL, site or search query).\n- Follow the user’s instructions about specific sites, filters and formats exactly.\n- Use extract for long pages instead of scrolling many times.\n</browser_rules>\n\n'+
  '<file_system>\nYou have a small persistent file system. todo.md starts empty: for tasks with several parts, write a checklist there first and tick items with replace_file_str as you finish them. For long research tasks, accumulate findings in results.md. Never claim file contents you have not written or read.\n</file_system>\n\n'+
  '<task_completion_rules>\nCall done when: the request is fully completed; OR you reach the last allowed step; OR it is truly impossible to continue.\n- done must be the only action in its step.\n- success=true only if every part of the request is completed and verified; otherwise false.\n- Put everything the user needs in done.text — clear markdown, specific facts, numbers and source links. Do not just say "see file".\n- Only report information you actually saw on pages. Never make things up.\n</task_completion_rules>\n\n'+
  '<action_rules>\nYou may chain up to '+opts.maxActions+' actions per step; they run in order. After an action loads a new page, later actions that use element indexes (click, input_text, send_keys, dropdowns) are skipped — but actions without indexes (go_to_url, search, extract, scroll_to_text, files, save_to_library, done) still run. So chain freely, e.g. [go_to_url, extract], or several input_text then click.\n</action_rules>\n\n'+
  '<speed_rules>\nThe user is waiting on a phone — finish in as FEW steps as possible.\n- Information tasks: search → open the best result with go_to_url and extract in the SAME step → done. Search result snippets may already answer simple questions; if so, call done right away.\n- If you already know the right site, go_to_url directly (or its search URL) instead of searching.\n- Prefer extract over scrolling through long pages.\n- Skip todo.md for simple tasks.\n</speed_rules>\n\n'+
  (think?'<reasoning_rules>\nIn "thinking": review the history and the current state, judge whether the previous step worked, track progress against the request and todo.md, notice loops (repeating the same action without progress) and change approach, and decide the next action(s).\n</reasoning_rules>\n\n':'')+
  '<available_actions>\n'+acts+'\n</available_actions>\n\n'+
  '<output>\nRespond with ONE valid JSON object and nothing else — no markdown fences, no text outside JSON. Format:\n'+shape+'\nThe action list must never be empty. Example action list: [{"input_text": {"index": 3, "text": "iphone 17"}}, {"click": {"index": 4}}]\n</output>';
  if(opts.allowed&&String(opts.allowed).trim())s+='\n\n<allowed_domains>\nYou may only visit these domains (and their subdomains): '+String(opts.allowed).split(/[\s,]+/).filter(Boolean).join(', ')+'\n</allowed_domains>';
  if(opts.instructions&&String(opts.instructions).trim())s+='\n\n<user_instructions>\n'+String(opts.instructions).trim()+'\n</user_instructions>';
  return s;
}

/* ============================== agent runner (browser-use loop) ============================== */
class AgentRunner{
  constructor({ctl,cfg,opts,run,onUpdate,onSaveUrl}){
    this.ctl=ctl;this.cfg=cfg;this.opts=opts;this.onUpdate=onUpdate;this.onSaveUrl=onSaveUrl;
    this.run=run;this.stopped=false;this.paused=false;this.gateR=null;this.prevSigs=null;this.lastState=null;this.focusEl=null;
    this.taskStart=run.taskStart||0;
  }
  emit(){if(this.onUpdate)this.onUpdate(Object.assign({},this.run,{steps:this.run.steps.slice()}))}
  status(t){this.run.statusText=t;this.emit()}
  pause(){if(this.run.status!=='running')return;this.paused=true;this.run.status='paused';this.status('Paused')}
  resume(){if(!this.paused)return;this.paused=false;this.run.status='running';this.status('Resuming…');if(this.gateR){const r=this.gateR;this.gateR=null;r()}}
  stop(){this.stopped=true;if(this.gateR){const r=this.gateR;this.gateR=null;r()}}
  gate(){return this.paused&&!this.stopped?new Promise(r=>{this.gateR=r}):Promise.resolve()}
  realSteps(){return this.run.steps.filter(s=>!s.sys)}
  async start(){
    WL.on();
    this.run.status='running';this.emit();
    try{await this.loop()}
    catch(e){this.finish(false,null,'Agent crashed: '+(e&&e.message||e))}
    finally{WL.off()}
  }
  finish(success,text,error){
    this.run.status=error?'failed':'done';
    this.run.success=!!success&&!error;
    if(text!=null)this.run.result=text;
    if(error)this.run.error=error;
    this.run.endedAt=Date.now();this.run.statusText='';
    this.emit();
  }
  async loop(){
    let failures=0;
    const o=this.opts;
    while(!this.stopped){
      const stepNo=this.realSteps().length+1;
      const taskSteps=stepNo-this.taskStart;
      if(taskSteps>o.maxSteps){this.finish(false,'Stopped after '+o.maxSteps+' steps without finishing. Increase "Max steps" in Agent settings or add a follow-up to continue.',null);return}
      await this.gate();if(this.stopped)break;
      this.status('Reading the page…');
      let state;
      try{state=await this.ctl.agentState(o,this.prevSigs,this.prevUrl)}catch(e){state={url:'',title:'',tabsText:'',dom:'(could not read the page: '+(e.message||e)+')',els:[]}}
      if(this.stopped)break;
      this.prevSigs=state.sigs||null;this.prevUrl=state.url;this.lastState=state;
      const last=taskSteps>=o.maxSteps;
      const sig=s=>s.url+'|'+(s.results||[]).filter(r=>r.name!=='note').map(r=>r.label).join(',');
      const rec=this.realSteps().filter(s=>!s.error).slice(-3);
      this.nudge='';
      if(rec.length>=2&&sig(rec[rec.length-1])===sig(rec[rec.length-2]))this.nudge='You repeated the same action on the same page and nothing changed. Change approach NOW: a different element, go_back, another result or site, a new search — or call done with what you have.';
      else if(state.blank&&rec.length&&rec[rec.length-1].url===state.url)this.nudge='You are still on a blank page. Leave it now: go_back, open another search result, or try a different site.';
      const msgs=this.messages(state,stepNo,last);
      this.status('Thinking…');
      let out=null,raw='',err=null;
      for(let attempt=0;attempt<3&&!out&&!this.stopped;attempt++){
        try{
          const m=attempt&&raw?msgs.concat([{role:'assistant',content:trunc(raw,3000)},{role:'user',content:'Your previous reply was not a valid JSON object in the required format. Reply again with ONLY the JSON object.'}]):msgs;
          raw=await llmCall(this.cfg,m,{json:true,maxTokens:o.thinking&&!o.flash?3500:2000,onWait:t=>this.status(t)});
          out=parseJSONLoose(raw);
          if(!normActions(out).length){out=null;const e=new Error('The model returned no actions.');e.parse=true;throw e}
        }catch(e){
          err=e;out=null;
          if(e.status===401||e.status===403||e.status===400&&!e.parse)break;
          if(e.network&&document.visibilityState!=='visible'){this.status('Paused while the app is in the background…');await waitVisible();attempt--;continue}
          if(!e.parse)break;
        }
      }
      if(this.stopped)break;
      if(!out){
        failures++;
        this.run.steps.push({n:stepNo,at:Date.now(),url:state.url,title:state.title,error:String(err&&err.message||err),results:[]});
        this.emit();
        if(err&&(err.status===401||err.status===403||/api key/i.test(err.message||''))){this.finish(false,null,String(err.message));return}
        if(failures>=o.maxFailures){this.finish(false,null,'Stopped after '+failures+' failed steps in a row. Last error: '+String(err&&err.message||err));return}
        await sleep(1200);continue;
      }
      const step={n:stepNo,at:Date.now(),url:state.url,title:state.title,thinking:String(out.thinking||''),eval:String(out.evaluation_previous_goal||out.evaluation||''),memory:String(out.memory||''),next:String(out.next_goal||out.next||''),results:[]};
      this.run.steps.push(step);this.emit();
      let acts=normActions(out);
      const doneIdx=acts.findIndex(a=>a.name==='done');
      if(doneIdx>0)acts=acts.slice(0,doneIdx);
      else if(doneIdx===0)acts=acts.slice(0,1);
      if(last&&!acts.some(a=>a.name==='done'))acts=[{name:'done',params:{text:'I ran out of steps before finishing.\n\n'+(step.memory||''),success:false}}];
      acts=acts.slice(0,Math.max(1,o.maxActions));
      let anyOk=false;
      for(let i=0;i<acts.length;i++){
        await this.gate();if(this.stopped)break;
        const a=acts[i];
        this.status(statusLabel(a));
        let r;
        try{r=await this.exec(a,state)}catch(e){r={error:String(e&&e.message||e)}}
        r=r||{};
        step.results.push(Object.assign({name:a.name,label:actionLabel(a)},r));
        this.emit();
        if(r.done){this.finish(r.success,r.text,null);return}
        if(!r.error)anyOk=true;
        if(r.changed&&i<acts.length-1){
          /* actions using element indexes are stale after a navigation; the rest (extract, files, done…) still run */
          const rest=acts.slice(i+1);const keep=rest.filter(x=>!INDEX_ACTIONS.has(x.name)&&!(x.name==='scroll'&&x.params&&x.params.index!=null));
          if(keep.length<rest.length){step.results.push({name:'note',label:'page changed',text:'Page changed — '+(rest.length-keep.length)+' action(s) using old element indexes were skipped.'});this.emit()}
          acts=acts.slice(0,i+1).concat(keep);
        }
      }
      failures=anyOk?0:failures+1;
      if(failures>=o.maxFailures){this.finish(false,null,'Stopped after '+failures+' failed steps in a row.');return}
    }
    if(this.stopped){
      this.run.status='stopped';this.run.statusText='';this.run.endedAt=Date.now();this.emit();
    }
  }
  messages(state,stepNo,last){
    const o=this.opts,run=this.run;
    const sysP=systemPrompt(last?{only:['done']}:{},o);
    /* history — recent steps verbatim, older ones condensed to their memory */
    const items=run.steps;
    const real=items.filter(s=>!s.sys);
    const keepFrom=real.length>14?real[real.length-12].n:0;
    let hist='<sys>Agent initialized</sys>\n';
    let condensed=[];
    for(const s of items){
      if(s.sys){hist+='<sys>'+s.sys+'</sys>\n';continue}
      if(keepFrom&&s.n<keepFrom){if(s.memory)condensed.push('Step '+s.n+': '+trunc(s.memory,220));continue}
      if(condensed.length){hist+='<sys>Earlier steps (condensed):\n'+condensed.join('\n')+'</sys>\n';condensed=[]}
      hist+='<step_'+s.n+'>\n';
      if(s.error)hist+='Error: '+trunc(s.error,400)+'\n';
      else{
        if(s.eval)hist+='Evaluation of Previous Step: '+trunc(s.eval,400)+'\n';
        if(s.memory)hist+='Memory: '+trunc(s.memory,600)+'\n';
        if(s.next)hist+='Next Goal: '+trunc(s.next,300)+'\n';
        const rs=(s.results||[]).filter(r=>r.name!=='note'||r.text);
        if(rs.length){
          hist+='Action Results:\n';
          const nA=rs.filter(r=>r.name!=='note').length;let k=0;
          rs.forEach(r=>{hist+=(r.name==='note'?'Note: ':'Action '+(++k)+'/'+nA+': ')+(r.error?'ERROR — '+trunc(r.error,400):trunc(r.memory||r.text||'ok',500))+'\n'});
        }
      }
      hist+='</step_'+s.n+'>\n';
    }
    if(condensed.length)hist+='<sys>Earlier steps (condensed):\n'+condensed.join('\n')+'</sys>\n';
    const tasks=run.tasks||[run.task];
    let req=tasks[0];
    if(tasks.length>1)req+='\n\n'+tasks.slice(1).map((t,i)=>(i===tasks.length-2?'Follow-up request (CURRENT — focus on this, earlier requests are finished): ':'Earlier follow-up: ')+t).join('\n');
    const files=run.files||{};
    const fs=Object.keys(files).map(k=>'- '+k+' — '+(files[k]?String(files[k]).split('\n').length+' lines':'empty')).join('\n')||'(no files)';
    const todo=files['todo.md']&&String(files['todo.md']).trim()?trunc(files['todo.md'],3000):'[todo.md is empty — write a checklist if the task has several parts]';
    let msg='<agent_history>\n'+hist+'</agent_history>\n\n<agent_state>\n<user_request>\n'+req+'\n</user_request>\n<file_system>\n'+fs+'\n</file_system>\n<todo_contents>\n'+todo+'\n</todo_contents>\n<step_info>\nStep '+stepNo+' (step '+(stepNo-this.taskStart)+' of at most '+o.maxSteps+' for the current request)\nCurrent date and time: '+nowStamp()+'\n</step_info>\n</agent_state>\n\n';
    msg+='<browser_state>\n'+state.tabsText+'\n'+(state.pageInfo?state.pageInfo+'\n':'')+'Interactive elements and text of the current page:\n'+state.dom+'\n</browser_state>\n';
    const prev=real[real.length-1];
    const reads=prev?(prev.results||[]).filter(r=>r.readOnce):[];
    if(reads.length)msg+='\n<read_state>\n'+reads.map(r=>r.readOnce).join('\n\n').slice(0,40000)+'\n</read_state>\n';
    if(this.nudge)msg+='\n<sys>'+this.nudge+'</sys>\n';
    if(last)msg+='\n<sys>This is your LAST step. You must call done now — report everything you found, set success=false if incomplete.</sys>\n';
    return[{role:'system',content:sysP},{role:'user',content:msg}];
  }
  fileName(p){
    const n=String(p.file_name||p.filename||p.name||'').trim().replace(/^\/+/,'');
    if(!/^[\w\-. ]{1,60}\.(md|txt|json|csv)$/i.test(n))throw new Error('Invalid file name "'+n+'" — use names like results.md, data.csv');
    return n;
  }
  async exec(a,state){
    const p=a.params||{};const ctl=this.ctl;const o=this.opts;
    const files=this.run.files||(this.run.files={'todo.md':''});
    const elAt=()=>{
      const i=idxOf(p);
      const el=state.els&&state.els[i-1];
      if(!i||!el)throw new Error('Element ['+(isNaN(i)?p.index:i)+'] does not exist in the current page state. Use an index from the latest browser_state.');
      if(!el.isConnected)throw new Error('Element ['+i+'] is no longer on the page (the page changed).');
      return el;
    };
    switch(a.name){
      case'search':{
        const q=squish(p.query||p.q||'');if(!q)throw new Error('search needs a query');
        const r=await ctl.search(ctl.activeId(),q,p.engine||o.engine);
        return{text:'Searched '+ENGINES[r.engine].label+' for “'+q+'” — '+r.count+' results',changed:true};
      }
      case'go_to_url':{
        let url=normalizeUrl(p.url||'');if(!url)throw new Error('Invalid URL: '+p.url);
        if(!allowedHost(url,o.allowed))throw new Error('Blocked: '+hostOf(url)+' is not in your allowed domains (Agent settings).');
        if(p.new_tab){const id=await ctl.newTab(url,{mode:'smart'});const t=ctl.tab(id);return{text:'Opened '+url+' in new tab '+(t?t.n:'')+(t&&t.error?' (failed: '+t.error+')':''),changed:true}}
        const t=await ctl.navigate(ctl.activeId(),{url},{mode:'smart'});
        if(t&&t.error)throw new Error('Could not load '+url+': '+t.error);
        return{text:'Opened '+url,changed:true};
      }
      case'go_back':{const ok=await ctl.back(ctl.activeId());if(!ok)throw new Error('No previous page in this tab');return{text:'Went back',changed:true}}
      case'go_forward':{const ok=await ctl.forward(ctl.activeId());if(!ok)throw new Error('No next page in this tab');return{text:'Went forward',changed:true}}
      case'refresh':{await ctl.reload(ctl.activeId());return{text:'Reloaded the page',changed:true}}
      case'wait':{const s=Math.min(10,Math.max(0,num(p.seconds,3)));await sleep(s*1000);return{text:'Waited '+s+'s'}}
      case'click':{
        const el=elAt();flashEl(el);await sleep(80);
        const r=await ctl.clickEl(ctl.activeId(),el,{newTab:!!p.new_tab,allowed:o.allowed});
        return r;
      }
      case'input_text':{
        const el=elAt();const text=String(p.text!=null?p.text:p.value!=null?p.value:'');
        flashEl(el);
        const tag=el.tagName;
        if(tag==='SELECT')return this.exec({name:'select_dropdown_option',params:{index:idxOf(p),text}},state);
        if(tag==='INPUT'||tag==='TEXTAREA'){
          const t=(el.getAttribute('type')||'').toLowerCase();
          if(/^(checkbox|radio|submit|button|image|reset|file)$/.test(t))throw new Error('['+idxOf(p)+'] is a '+t+' — use click instead');
          el.value=p.clear===false?el.value+text:text;
        }else if(el.isContentEditable||el.getAttribute('contenteditable')!=null){el.textContent=p.clear===false?el.textContent+text:text}
        else throw new Error('['+idxOf(p)+'] is not a text field');
        try{el.focus({preventScroll:true})}catch(e){}
        this.focusEl=el;
        return{text:'Typed “'+trunc(text,80)+'” into ['+idxOf(p)+']'};
      }
      case'send_keys':{
        const keys=String(p.keys||p.key||'');
        const doc=ctl.doc(ctl.activeId());if(!doc)throw new Error('No page loaded');
        const win=doc.defaultView;
        let el=this.focusEl&&this.focusEl.isConnected?this.focusEl:doc.activeElement;
        const k=keys.trim().toLowerCase();
        if(k==='enter'||k==='return'){
          const form=el&&el.form||(el&&el.closest&&el.closest('form'));
          if(!form)throw new Error('Nothing to submit — the focused element is not in a form. Click a button or link instead.');
          return ctl.submit(ctl.activeId(),form,defaultSubmitter(form));
        }
        if(k==='pagedown'||k==='space'){win.scrollBy(0,win.innerHeight*0.9);return{text:'Scrolled down'}}
        if(k==='pageup'){win.scrollBy(0,-win.innerHeight*0.9);return{text:'Scrolled up'}}
        if(k==='end'||k==='control+end'){win.scrollTo(0,1e7);return{text:'Scrolled to the bottom'}}
        if(k==='home'||k==='control+home'){win.scrollTo(0,0);return{text:'Scrolled to the top'}}
        if(k==='escape'){try{el&&el.blur()}catch(e){}this.focusEl=null;return{text:'Pressed Escape'}}
        if(k==='tab'){
          const list=(this.lastState&&this.lastState.els)||[];const i=list.indexOf(el);const nx=list[i+1];
          if(nx){try{nx.focus()}catch(e){}this.focusEl=nx;return{text:'Moved focus to ['+(i+2)+']'}}
          return{text:'Pressed Tab'};
        }
        if(k==='backspace'){if(el&&'value'in el){el.value=String(el.value).slice(0,-1);return{text:'Deleted one character'}}throw new Error('No text field is focused')}
        if(el&&'value'in el&&/^(INPUT|TEXTAREA)$/.test(el.tagName)){el.value+=keys;return{text:'Typed “'+trunc(keys,60)+'”'}}
        throw new Error('Unsupported keys "'+keys+'" here — use input_text, click or scroll');
      }
      case'scroll':{
        const doc=ctl.doc(ctl.activeId());if(!doc)throw new Error('No page loaded');
        const win=doc.defaultView;const pages=Math.min(10,Math.max(0.25,num(p.num_pages!=null?p.num_pages:p.pages,1)));
        const dir=p.down===false||p.direction==='up'?-1:1;
        if(p.index!=null){
          const el=elAt();
          let box=el;while(box&&box!==doc.body&&!(box.scrollHeight>box.clientHeight+4))box=box.parentElement;
          if(box&&box!==doc.body){box.scrollBy(0,dir*pages*box.clientHeight);await sleep(200);return{text:'Scrolled ['+idxOf(p)+'] '+(dir>0?'down':'up')}}
        }
        const before=win.scrollY;
        win.scrollBy(0,dir*pages*win.innerHeight);
        await sleep(120);
        if(Math.abs(win.scrollY-before)<2)return{text:dir>0?'Already at the bottom of the page':'Already at the top of the page'};
        return{text:'Scrolled '+(dir>0?'down':'up')+' '+pages+' page'+(pages===1?'':'s')};
      }
      case'scroll_to_text':{
        const doc=ctl.doc(ctl.activeId());if(!doc)throw new Error('No page loaded');
        const el=findTextNode(doc,p.text||'');
        if(!el)throw new Error('Text “'+trunc(p.text||'',60)+'” not found on the page');
        flashEl(el);await sleep(300);
        return{text:'Scrolled to “'+trunc(p.text,60)+'”'};
      }
      case'get_dropdown_options':{
        const el=elAt();
        let opts=[];
        if(el.tagName==='SELECT')opts=Array.from(el.options).map((op,i)=>i+': text='+JSON.stringify(squish(op.textContent))+(op.value!==squish(op.textContent)?' value='+JSON.stringify(op.value):'')+(op.selected?' (selected)':''));
        else el.querySelectorAll('[role=option],option,li').forEach((op,i)=>{if(i<200)opts.push(i+': '+JSON.stringify(squish(op.textContent)))});
        if(!opts.length)throw new Error('['+idxOf(p)+'] has no options');
        const txt=opts.slice(0,200).join('\n');
        return{text:'Options of ['+idxOf(p)+']:\n'+trunc(txt,1500),memory:'Listed '+opts.length+' options of ['+idxOf(p)+']',readOnce:'Options of ['+idxOf(p)+']:\n'+txt};
      }
      case'select_dropdown_option':{
        const el=elAt();if(el.tagName!=='SELECT')throw new Error('['+idxOf(p)+'] is not a <select> — click it or its options instead');
        const want=squish(p.text||p.option||p.value||'').toLowerCase();
        const op=Array.from(el.options).find(x=>squish(x.textContent).toLowerCase()===want)||Array.from(el.options).find(x=>String(x.value).toLowerCase()===want)||Array.from(el.options).find(x=>squish(x.textContent).toLowerCase().includes(want));
        if(!op)throw new Error('Option “'+p.text+'” not found — use get_dropdown_options');
        el.value=op.value;op.selected=true;flashEl(el);
        return{text:'Selected “'+squish(op.textContent)+'” in ['+idxOf(p)+']'};
      }
      case'extract':{
        const q=String(p.query||p.goal||'').trim()||'the main content of the page';
        const doc=ctl.doc(ctl.activeId());if(!doc)throw new Error('No page loaded');
        const tab=ctl.tab(ctl.activeId());
        const cap=captureState(doc,doc.defaultView,{mode:'all',links:!!p.extract_links,url:tab.url,maxChars:400000});
        const start=Math.max(0,Math.round(num(p.start_from_char,0)));
        const chunk=cap.text.slice(start,start+40000);
        const more=cap.text.length>start+40000;
        this.status('Reading the whole page…');
        const ans=await llmCall(this.cfg,[
          {role:'system',content:'You extract information from a web page for a browser agent. Answer the query using ONLY the page content. Be complete but concise; keep names, numbers, prices, dates and URLs exact. Use markdown lists or tables for multiple items. If the information is not on the page, say so plainly and mention what the page contains instead.'},
          {role:'user',content:'<query>\n'+q+'\n</query>\n<page url="'+tab.url+'" title="'+escapeHtml(tab.title||'')+'">\n'+chunk+'\n</page>'+(more?'\n(The page continues — call extract again with start_from_char='+(start+40000)+' for the rest.)':'')}
        ],{json:false,maxTokens:2500,onWait:t=>this.status(t)});
        let memory='Extracted “'+trunc(q,60)+'” from '+domainOf(tab.url)+(more?' (first part of the page)':'');
        if(ans.length>1400){
          let k=1;while(files['extracted_'+k+'.md'])k++;
          files['extracted_'+k+'.md']='# '+q+'\nSource: '+tab.url+'\n\n'+ans;
          memory+=' — saved to extracted_'+k+'.md';
        }
        return{text:trunc(ans,1200),memory,readOnce:'<extracted_content query="'+escapeHtml(q)+'" url="'+tab.url+'">\n'+ans+'\n</extracted_content>'};
      }
      case'switch_tab':{
        const id=ctl.idByN(num(p.tab_id!=null?p.tab_id:p.page_id,NaN));if(!id)throw new Error('No tab with id '+p.tab_id);
        await ctl.activate(id);return{text:'Switched to tab '+p.tab_id,changed:true};
      }
      case'close_tab':{
        const id=ctl.idByN(num(p.tab_id!=null?p.tab_id:p.page_id,NaN));if(!id)throw new Error('No tab with id '+p.tab_id);
        const wasActive=id===ctl.activeId();ctl.closeTab(id);return{text:'Closed tab '+p.tab_id,changed:wasActive};
      }
      case'write_file':{
        const n=this.fileName(p);let c=String(p.content!=null?p.content:p.text||'');
        files[n]=p.append&&files[n]?files[n].replace(/\n?$/,'\n')+c:c;
        if(JSON.stringify(files).length>300000)throw new Error('File system is full (300 KB)');
        return{text:(p.append?'Appended to ':'Wrote ')+n+' ('+String(files[n]).split('\n').length+' lines)'};
      }
      case'read_file':{
        const n=this.fileName(p);if(files[n]==null)throw new Error('File '+n+' does not exist. Files: '+Object.keys(files).join(', '));
        return{text:'Read '+n,memory:'Read '+n,readOnce:'<file name="'+n+'">\n'+trunc(files[n],20000)+'\n</file>'};
      }
      case'replace_file_str':{
        const n=this.fileName(p);if(files[n]==null)throw new Error('File '+n+' does not exist');
        const old=String(p.old_str!=null?p.old_str:p.old||'');if(!old||!files[n].includes(old))throw new Error('Text to replace not found in '+n);
        files[n]=files[n].replace(old,String(p.new_str!=null?p.new_str:p.new||''));
        return{text:'Updated '+n};
      }
      case'save_to_library':{
        const url=normalizeUrl(p.url||'')||(ctl.tab(ctl.activeId())||{}).url;
        if(!url)throw new Error('No page to save');
        this.status('Saving to your reading list…');
        const msg=this.onSaveUrl?await this.onSaveUrl(url):'Saved';
        return{text:msg+': '+url};
      }
      case'done':{
        let text=String(p.text!=null?p.text:p.result||p.answer||'').trim()||'(no answer text)';
        const show=Array.isArray(p.files_to_display)?p.files_to_display.filter(f=>files[f]!=null):[];
        this.run.shownFiles=show;
        return{done:true,success:p.success!==false,text};
      }
      default:throw new Error('Unknown action "'+a.name+'". Available: '+Object.keys(ACTIONS).join(', '));
    }
  }
}

/* ---------- Browser Use Cloud (beta): a real remote Chromium runs the task ---------- */
async function cloudFetch(key,path,opts){
  let res;
  try{res=await fetchWithTimeout('https://api.browser-use.com/api/v4'+path,Object.assign({},opts,{headers:{'X-Browser-Use-API-Key':key,'Content-Type':'application/json'}}),30000)}
  catch(e){const er=new Error('Could not reach Browser Use Cloud from this app (network or browser security blocked the request).');er.network=true;throw er}
  let j=null;try{j=await res.json()}catch(e){}
  if(!res.ok){
    let m=j&&(j.detail||j.message||j.error)||('HTTP '+res.status);if(typeof m!=='string')m=JSON.stringify(m);
    const er=new Error('Browser Use Cloud: '+(res.status===401||res.status===403?'invalid API key — ':'')+m);er.status=res.status;throw er;
  }
  return j||{};
}
const pick=(o,...ks)=>{for(const k of ks){const v=k.split('.').reduce((a,p)=>a&&a[p],o);if(v!=null&&v!=='')return v}return undefined};
class CloudRunner{
  constructor({ctl,cfg,run,onUpdate}){this.ctl=ctl;this.cfg=cfg;this.run=run;this.onUpdate=onUpdate;this.stopped=false}
  emit(){if(this.onUpdate)this.onUpdate(Object.assign({},this.run,{steps:this.run.steps.slice()}))}
  status(t){this.run.statusText=t;this.emit()}
  pause(){} resume(){}
  async stop(){
    this.stopped=true;
    if(this.id){for(const [m,path,body] of [['PATCH','/runs/'+this.id,{action:'stop'}],['POST','/runs/'+this.id+'/stop',{}]]){try{await cloudFetch(this.cfg.key,path,{method:m,body:JSON.stringify(body)});break}catch(e){}}}
    this.run.status='stopped';this.run.endedAt=Date.now();this.run.statusText='';this.emit();
  }
  async start(){
    WL.on();
    this.run.status='running';this.status('Starting a cloud browser…');
    try{
      const tasks=this.run.tasks||[this.run.task];
      const task=tasks.length>1?tasks[0]+'\n\nFollow-up: '+tasks[tasks.length-1]:tasks[0];
      const body={task};
      const startUrl=this.run.startUrl;if(startUrl)body.task+='\n\nStart at: '+startUrl;
      const j=await cloudFetch(this.cfg.key,'/runs',{method:'POST',body:JSON.stringify(body)});
      this.id=pick(j,'id','runId','run_id','task_id','data.id');
      if(!this.id)throw new Error('Browser Use Cloud did not return a run id.');
      this.run.cloudId=this.id;
      let shownLive=false,seen=0;const t0=Date.now();
      while(!this.stopped&&Date.now()-t0<60*60000){
        await sleep(2500);
        if(document.visibilityState!=='visible')await waitVisible();
        let r;try{r=await cloudFetch(this.cfg.key,'/runs/'+encodeURIComponent(this.id),{method:'GET'})}catch(e){if(e.network){continue}throw e}
        const live=pick(r,'liveUrl','live_url','session.liveUrl','session.live_url','browser.liveUrl','browser.live_url');
        if(live&&!shownLive&&/^https:/.test(live)){shownLive=true;this.run.liveUrl=live;this.ctl.newTab(live,{mode:'live',title:'Cloud browser (live)'})}
        const steps=pick(r,'steps','data.steps')||[];
        if(Array.isArray(steps)&&steps.length>seen){
          for(const s of steps.slice(seen)){
            this.run.steps.push({n:this.run.steps.length+1,at:Date.now(),url:pick(s,'url','pageUrl')||'',eval:String(pick(s,'evaluationPreviousGoal','evaluation_previous_goal')||''),memory:String(pick(s,'memory')||''),next:String(pick(s,'nextGoal','next_goal','goal','summary')||''),
              results:(pick(s,'actions')||[]).map(x=>({name:'cloud',label:typeof x==='string'?trunc(x,80):trunc(JSON.stringify(x),80)}))});
          }
          seen=steps.length;
        }
        const st=String(pick(r,'status','state','data.status')||'').toLowerCase();
        this.status('Cloud: '+(st||'running')+'…');
        if(/finish|complete|succe|done|fail|error|stop|cancel|timeout/.test(st)){
          const out=pick(r,'output','result','finalResult','final_result','data.output');
          const okFlag=pick(r,'isSuccess','success','is_success');
          this.run.status=/fail|error|timeout/.test(st)?'failed':/stop|cancel/.test(st)?'stopped':'done';
          this.run.success=okFlag!=null?!!okFlag:this.run.status==='done';
          this.run.result=out!=null?(typeof out==='string'?out:'```\n'+JSON.stringify(out,null,2)+'\n```'):(this.run.status==='done'?'(The cloud run finished without a text result.)':'');
          if(this.run.status==='failed')this.run.error='Cloud run '+st;
          this.run.endedAt=Date.now();this.run.statusText='';this.emit();
          return;
        }
      }
    }catch(e){
      this.run.status='failed';this.run.error=String(e.message||e);this.run.endedAt=Date.now();this.run.statusText='';this.emit();
    }finally{WL.off()}
  }
}

function compactRun(r){
  return Object.assign({},r,{
    statusText:'',
    steps:(r.steps||[]).slice(-80).map(s=>s.sys?s:Object.assign({},s,{thinking:trunc(s.thinking||'',900),results:(s.results||[]).map(x=>({name:x.name,label:x.label,text:trunc(x.text||'',500),memory:x.memory?trunc(x.memory,300):undefined,error:x.error?trunc(x.error,400):undefined}))})),
    files:Object.fromEntries(Object.entries(r.files||{}).map(([k,v])=>[k,trunc(v,30000)]))
  });
}

/* ============================== keyboard inset (iOS) ============================== */
function useKbInset(){
  const [inset,setInset]=useState(0);
  useEffect(()=>{
    const vv=window.visualViewport;if(!vv)return;
    const f=()=>{const v=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));setInset(v>60?v:0)};
    vv.addEventListener('resize',f);vv.addEventListener('scroll',f);f();
    return()=>{vv.removeEventListener('resize',f);vv.removeEventListener('scroll',f)};
  },[]);
  return inset;
}

/* ============================== icons ============================== */
const BI={
  tabs:s=>Svg({size:s},h('rect',{x:7.5,y:7.5,width:12,height:12,rx:2.4,stroke:'currentColor',strokeWidth:1.7}),P('M16.5 4.5H6.9c-1.3 0-2.4 1.1-2.4 2.4v9.6')),
  clock:s=>Svg({size:s},h('circle',{cx:12,cy:12,r:8.5,stroke:'currentColor',strokeWidth:1.7}),P('M12 7.5V12l3 2')),
  stop:s=>Svg({size:s},h('rect',{x:6.5,y:6.5,width:11,height:11,rx:2,fill:'currentColor'})),
  send:s=>Svg({size:s},P('M12 19V5.5M6.5 11 12 5.5 17.5 11')),
  down:s=>Svg({size:s},P('M6 9.5 12 15.5l6-6')),
  up:s=>Svg({size:s},P('M6 14.5 12 8.5l6 6')),
  file:s=>Svg({size:s},P('M7 3.5h6.5L18 8v11.2c0 .7-.6 1.3-1.3 1.3H7.3c-.7 0-1.3-.6-1.3-1.3V4.8c0-.7.6-1.3 1.3-1.3Z'),P('M13.5 3.5V8H18')),
  bolt:s=>Svg({size:s},P('M13 3 5.5 13.5h5L11 21l7.5-10.5h-5L13 3Z')),
  speaker:s=>Svg({size:s},P('M4.5 9.5h3l4.5-4v13l-4.5-4h-3z'),P('M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11')),
  find:s=>Svg({size:s},h('circle',{cx:10.5,cy:10.5,r:5.5,stroke:'currentColor',strokeWidth:1.7}),P('M14.6 14.6 19.5 19.5M8 10.5h5'))
};

/* ============================== small UI pieces ============================== */
function Switch({T,on,onChange}){
  return h('button',{onClick:()=>onChange(!on),role:'switch','aria-checked':on,className:'trc',style:{width:50,height:30,borderRadius:15,background:on?'#34c759':T.hair,position:'relative',flexShrink:0}},
    h('span',{className:'trt',style:{position:'absolute',top:2,left:2,width:26,height:26,borderRadius:13,background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,.3)',transform:on?'translateX(20px)':'none'}}));
}
function Row({T,label,sub,children}){
  return h('div',{style:{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid '+T.hair}},
    h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:15,fontWeight:500}},label),sub?h('div',{style:{fontSize:12,color:T.sub,marginTop:2,lineHeight:1.4}},sub):null),
    children);
}
function Stepper({T,value,min,max,step,onChange,fmt}){
  const b=(d,t)=>h('button',{onClick:()=>onChange(Math.min(max,Math.max(min,+(value+d).toFixed(2)))),className:'act90',style:{width:34,height:34,borderRadius:9,background:T.card,color:T.fg,fontSize:18,fontWeight:600}},t);
  return h('div',{style:{display:'flex',alignItems:'center',gap:8,flexShrink:0}},b(-(step||1),'−'),h('span',{style:{minWidth:34,textAlign:'center',fontSize:15,fontWeight:600}},fmt?fmt(value):value),b(step||1,'+'));
}
const inputS=T=>({width:'100%',padding:'11px 13px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16});
function SectionTitle({T,children}){return h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'20px 0 4px'}},children)}
function Chip({T,children,onClick,active,style}){
  return h('button',{onClick,className:'act95',style:Object.assign({padding:'7px 12px',borderRadius:16,background:active?T.fg:T.card,color:active?T.bg:T.fg,fontSize:13,fontWeight:500,whiteSpace:'nowrap',flexShrink:0},style||{})},children);
}

/* ============================== agent settings ============================== */
function AgentSettings({T,S,set,onClose}){
  const o=agentOpts(S);const cfg=agentCfg(S);
  const [prov,setProv]=useState(cfg.provider);
  const P=PROVIDERS[prov];
  const [show,setShow]=useState(false);
  const setO=p=>set({agent:Object.assign({},S.agent||{},p)});
  const models=P.models||(typeof AI_MODELS!=='undefined'?AI_MODELS:[]);
  const curModel=(S.agentModels||{})[prov]||(prov==='openrouter'?S.aiModel:prov==='gemini'?(S.geminiModel||P.def):P.def)||'';
  const setModel=m=>set({agentModels:Object.assign({},S.agentModels||{},{[prov]:m})});
  const choose=id=>{setProv(id);set({agentProvider:id})};
  return h(Sheet,{T,onClose,title:'Agent settings',z:97,maxH:'92%'},
    h('div',{style:{padding:'0 20px 20px',fontFamily:UIF}},
      SectionTitle({T,children:'Model'}),
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',padding:'6px 0 4px'}},
        PROVIDER_ORDER.map(id=>h(Chip,{key:id,T,active:prov===id,onClick:()=>choose(id)},PROVIDERS[id].label+(id==='cloud'?' (beta)':'')))),
      h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,margin:'8px 0 10px'}},
        prov==='cloud'?'Runs the task on a real Chromium in Browser Use’s cloud (JavaScript, logins in the cloud browser, captchas). You can watch it live in a tab. Paid service — uses your Browser Use API key. Experimental: if their API changes, use one of the on-device models instead.'
        :prov==='gemini'?'Recommended: fast, follows the agent format well, generous free tier.'
        :prov==='openrouter'?'Free models work but some struggle with long agent tasks — pick a large one (Llama 3.3 70B, Qwen3 235B, DeepSeek).'
        :prov==='anthropic'?'Claude models via the Anthropic API (pay-as-you-go). Excellent at multi-step browsing.'
        :'OpenAI models via the OpenAI API (pay-as-you-go).'),
      h('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        h('input',{type:show?'text':'password',value:S[P.keyField]||'',onChange:e=>set({[P.keyField]:e.target.value.trim()}),placeholder:P.label+' API key ('+P.keyHint+')',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,style:inputS(T)}),
        h('button',{onClick:()=>setShow(!show),className:'act90',style:{color:T.accent,fontSize:13,fontWeight:600,padding:'0 4px'}},show?'Hide':'Show')),
      h('button',{onClick:()=>openExternalUrl(P.keyUrl),style:{color:T.accent,fontSize:13,fontWeight:500,marginTop:8}},'Get a '+P.label+' key ↗'),
      prov!=='cloud'?h(Fragment,null,
        h('div',{style:{fontSize:13,fontWeight:600,margin:'14px 0 6px'}},'Model'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}},models.slice(0,10).map(m=>h(Chip,{key:m[0],T,active:curModel===m[0],onClick:()=>setModel(m[0]),style:{fontSize:12}},m[1]))),
        h('input',{value:curModel,onChange:e=>setModel(e.target.value.trim()),placeholder:'or type any model id',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,style:inputS(T)})):null,
      h('div',{style:{fontSize:11.5,color:T.sub,marginTop:8,lineHeight:1.5}},'Keys stay on this device (and in your backup file). Requests go straight from your iPhone to the provider.'),

      SectionTitle({T,children:'Behavior'}),
      h(Row,{T,label:'Max steps',sub:'Per task; the agent must finish by then'},h(Stepper,{T,value:o.maxSteps,min:3,max:100,step:1,onChange:v=>setO({maxSteps:v})})),
      h(Row,{T,label:'Actions per step',sub:'How many actions it may chain at once'},h(Stepper,{T,value:o.maxActions,min:1,max:10,step:1,onChange:v=>setO({maxActions:v})})),
      h(Row,{T,label:'Max failures',sub:'Stop after this many failed steps in a row'},h(Stepper,{T,value:o.maxFailures,min:1,max:10,step:1,onChange:v=>setO({maxFailures:v})})),
      h(Row,{T,label:'Thinking',sub:'Reason before each step (better results, a bit slower)'},h(Switch,{T,on:o.thinking,onChange:v=>setO({thinking:v})})),
      h(Row,{T,label:'Flash mode',sub:'Minimal output for speed — memory + actions only'},h(Switch,{T,on:o.flash,onChange:v=>setO({flash:v})})),
      h(Row,{T,label:'Highlight elements',sub:'Draw numbered boxes on what the agent can click'},h(Switch,{T,on:o.highlight,onChange:v=>setO({highlight:v})})),
      h(Row,{T,label:'Render JavaScript pages',sub:'Pre-render script-heavy sites remotely when they come back empty'},h(Switch,{T,on:o.jsRender,onChange:v=>setO({jsRender:v})})),
      h(Row,{T,label:'Page view depth',sub:'Screens of the page the agent sees per step'},h(Stepper,{T,value:o.depth,min:1,max:8,step:1,onChange:v=>setO({depth:v})})),
      h('div',{style:{padding:'12px 0',borderBottom:'1px solid '+T.hair}},
        h('div',{style:{fontSize:15,fontWeight:500,marginBottom:8}},'Search engine'),
        h('div',{style:{display:'flex',gap:8}},Object.keys(ENGINES).map(e=>h(Chip,{key:e,T,active:o.engine===e,onClick:()=>setO({engine:e})},ENGINES[e].label)))),
      SectionTitle({T,children:'Allowed domains'}),
      h('textarea',{className:'bu-ta',value:o.allowed,onChange:e=>setO({allowed:e.target.value}),rows:2,placeholder:'Leave empty to allow all. One per line, e.g. wikipedia.org',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,style:Object.assign(inputS(T),{resize:'vertical',lineHeight:1.45})}),
      SectionTitle({T,children:'Custom instructions'}),
      h('textarea',{className:'bu-ta',value:o.instructions,onChange:e=>setO({instructions:e.target.value}),rows:3,placeholder:'Added to the agent’s system prompt, e.g. “Answer in Telugu” or “Prefer Indian news sites”.',style:Object.assign(inputS(T),{resize:'vertical',lineHeight:1.45})}),
      SectionTitle({T,children:'Browser'}),
      h('div',{style:{display:'flex',gap:8,marginTop:8}},
        h(Chip,{T,active:(S.browserView||'live')==='live',onClick:()=>set({browserView:'live'})},'Open pages in Live view'),
        h(Chip,{T,active:S.browserView==='smart',onClick:()=>set({browserView:'smart'})},'Smart view')),
      h('div',{style:{fontSize:12,color:T.sub,lineHeight:1.5,marginTop:8}},'Live shows the real site (scripts and your logins) but some sites refuse to load inside apps. Smart always loads, without scripts, and is what the agent uses.'),
      h('button',{onClick:()=>set({agent:{}}),style:{color:T.danger,fontSize:13.5,fontWeight:500,marginTop:18}},'Reset behavior to defaults')));
}

/* ============================== step + result views ============================== */
function evalTone(T,s){
  const t=String(s||'').toLowerCase();
  if(/^(fail|error|unsuccess)|\b(failed|did not|didn’t|didn't|unable|not found|couldn|no results)\b/.test(t))return T.danger;
  if(/^(success|succeeded|done|ok)|\b(successful|successfully|succeeded|worked|completed)\b/.test(t))return'#2f9e44';
  return T.sub;
}
function StepCard({T,s}){
  const [open,setOpen]=useState(false);
  if(s.sys)return h('div',{style:{fontSize:12.5,color:T.sub,padding:'6px 2px 10px',fontStyle:'italic',lineHeight:1.45}},s.sys);
  return h('div',{style:{background:T.card,borderRadius:12,padding:'11px 13px',marginBottom:10}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
      h('span',{style:{fontSize:12,fontWeight:700,color:T.fg}},'Step '+s.n),
      s.url?h('img',{src:faviconUrl(s.url),alt:'',style:{width:13,height:13,borderRadius:3},onError:e=>{e.target.style.display='none'}}):null,
      h('span',{style:{flex:1,minWidth:0,fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},s.url?domainOf(s.url):''),
      h('span',{style:{fontSize:11,color:T.sub}},fmtTime(s.at))),
    s.error?h('div',{style:{fontSize:13,color:T.danger,lineHeight:1.45}},'⚠ '+s.error):null,
    s.eval?h('div',{style:{display:'flex',gap:7,fontSize:13,lineHeight:1.45,marginBottom:4}},h('span',{style:{width:7,height:7,borderRadius:4,background:evalTone(T,s.eval),flexShrink:0,marginTop:6}}),h('span',{style:{color:T.meta}},s.eval)):null,
    s.memory?h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.45,marginBottom:4}},'🧠 '+s.memory):null,
    s.next?h('div',{style:{fontSize:13.5,color:T.fg,lineHeight:1.45,fontWeight:500,marginBottom:4}},'🎯 '+s.next):null,
    (s.results||[]).map((r,i)=>h('div',{key:i,style:{marginTop:5,fontSize:12.5,lineHeight:1.4}},
      h('span',{style:{display:'inline-block',padding:'2px 7px',borderRadius:6,background:T.bg,color:r.error?T.danger:T.fg,fontFamily:'ui-monospace,Menlo,monospace',fontSize:11.5,marginRight:6}},r.label||r.name),
      r.error?h('span',{style:{color:T.danger}},r.error):(r.name==='done'?null:h('span',{style:{color:T.sub,whiteSpace:'pre-wrap'}},trunc(r.text||'',r.name==='extract'?400:220))))),
    s.thinking?h('div',null,
      h('button',{onClick:()=>setOpen(!open),style:{fontSize:12,color:T.accent,marginTop:7,fontWeight:500}},open?'Hide thinking':'Show thinking'),
      open?h('div',{className:'bu-res',style:{fontSize:12.5,color:T.meta,whiteSpace:'pre-wrap',lineHeight:1.5,marginTop:5}},s.thinking):null):null);
}
function speak(text){
  try{
    speechSynthesis.cancel();
    const parts=typeof toSentences==='function'?toSentences(text):[text];
    const lang=detectSpeechLang(text);
    const v=pickVoiceFor(lang,'');
    parts.forEach(p=>{const u=new SpeechSynthesisUtterance(p);if(lang)u.lang=lang;if(v)u.voice=v;speechSynthesis.speak(u)});
  }catch(e){}
}
function ResultCard({T,run,onOpenLink,onSaveNote,onFiles,toastFn}){
  const [speaking,setSpeaking]=useState(false);
  const html=useMemo(()=>mdToHtml(String(run.result||'')),[run.result]);
  const plain=useMemo(()=>htmlToText(html),[html]);
  const ok=run.status==='done'&&run.success;
  const btn=(icon,label,fn)=>h('button',{onClick:fn,className:'act95',style:{display:'flex',alignItems:'center',gap:6,padding:'8px 11px',borderRadius:10,background:T.bg,color:T.fg,fontSize:12.5,fontWeight:600}},icon,label);
  const md='# '+trunc(run.task,120)+'\n\n'+String(run.result||'');
  return h('div',{style:{border:'1.5px solid '+(ok?'#2f9e44':run.status==='failed'?T.danger:T.hair),borderRadius:14,padding:'13px 14px',marginBottom:12,background:T.card}},
    h('div',{style:{fontSize:13,fontWeight:700,color:ok?'#2f9e44':run.status==='failed'?T.danger:'#e8590c',marginBottom:8}},
      ok?'✓ Task completed':run.status==='failed'?'✕ The agent stopped':run.status==='stopped'?'■ Stopped by you':'⚠ Finished — may be incomplete'),
    run.error?h('div',{style:{fontSize:13,color:T.danger,marginBottom:8,lineHeight:1.45}},run.error):null,
    run.result?h('div',{className:'bu-res',onClick:e=>{const a=e.target.closest&&e.target.closest('a[href]');if(a){e.preventDefault();onOpenLink(a.href)}},
      style:{fontSize:15,lineHeight:1.55,color:T.fg,wordBreak:'break-word'},dangerouslySetInnerHTML:{__html:html}}):null,
    (run.shownFiles||[]).length?h('div',{style:{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}},run.shownFiles.map(f=>h(Chip,{key:f,T,onClick:()=>onFiles(f)},'📄 '+f))):null,
    run.result?h('div',{className:'sx',style:{display:'flex',gap:7,marginTop:12,overflowX:'auto'}},
      btn(Icons.copy(15),'Copy',()=>{copyText(String(run.result));toastFn('Copied')}),
      btn(Icons.share(15),'Share',()=>shareText(trunc(run.task,80),String(run.result),'')),
      btn(BI.speaker(15),speaking?'Stop':'Listen',()=>{if(speaking){try{speechSynthesis.cancel()}catch(e){}setSpeaking(false)}else{speak(plain);setSpeaking(true)}}),
      btn(Icons.note(15),'Save note',()=>onSaveNote(md))):null);
}
function FilesSheet({T,files,focus,onSaveNote,onClose,toastFn}){
  const names=Object.keys(files||{});
  const [cur,setCur]=useState(focus&&files[focus]!=null?focus:names.find(n=>files[n])||names[0]);
  const content=cur?String(files[cur]||''):'';
  return h(Sheet,{T,onClose,title:'Agent files',z:97,maxH:'90%'},
    h('div',{style:{padding:'0 20px 16px'}},
      h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',padding:'4px 0 10px'}},names.map(n=>h(Chip,{key:n,T,active:n===cur,onClick:()=>setCur(n)},n))),
      content?h('div',{className:'bu-res',style:{fontSize:14,lineHeight:1.55,background:T.card,borderRadius:12,padding:'12px 14px',maxHeight:'50vh',overflowY:'auto'},dangerouslySetInnerHTML:{__html:/\.md$/.test(cur)?mdToHtml(content):'<pre>'+escapeHtml(content)+'</pre>'}})
        :h('div',{style:{fontSize:13.5,color:T.sub,padding:'10px 0'}},'This file is empty.'),
      content?h('div',{style:{display:'flex',gap:10,marginTop:12}},
        h('button',{onClick:()=>{copyText(content);toastFn('Copied')},className:'act98',style:{flex:1,padding:12,borderRadius:10,background:T.card,color:T.fg,fontSize:14,fontWeight:600}},'Copy'),
        h('button',{onClick:()=>shareText(cur,content,''),className:'act98',style:{flex:1,padding:12,borderRadius:10,background:T.card,color:T.fg,fontSize:14,fontWeight:600}},'Share'),
        h('button',{onClick:()=>onSaveNote(/\.md$/.test(cur)?content:'# '+cur+'\n\n```\n'+content+'\n```'),className:'act98',style:{flex:1,padding:12,borderRadius:10,background:T.fg,color:T.bg,fontSize:14,fontWeight:600}},'Save note')):null));
}
function RunsSheet({T,runs,onOpen,onDelete,onClear,onClose}){
  return h(Sheet,{T,onClose,title:'Agent history',z:97,maxH:'85%'},
    h('div',{style:{padding:'0 20px 16px'}},
      runs.length?runs.map(r=>h('div',{key:r.id,style:{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderBottom:'1px solid '+T.hair}},
        h('span',{style:{fontSize:15,flexShrink:0,width:20,textAlign:'center',color:r.status==='done'&&r.success?'#2f9e44':r.status==='failed'?T.danger:T.sub}},r.status==='done'?(r.success?'✓':'⚠'):r.status==='failed'?'✕':r.status==='stopped'?'■':'…'),
        h('button',{onClick:()=>onOpen(r),style:{flex:1,minWidth:0,textAlign:'left',color:T.fg}},
          h('div',{style:{fontSize:14.5,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',lineHeight:1.35}},r.task),
          h('div',{style:{fontSize:12,color:T.sub,marginTop:2}},fmtWhen(r.startedAt)+' · '+(r.steps||[]).filter(s=>!s.sys).length+' steps'+(r.provider?' · '+(PROVIDERS[r.provider]||{}).label:''))),
        h('button',{onClick:()=>onDelete(r.id),className:'act90',style:{color:T.sub,padding:6}},Icons.trash(16))))
      :h('div',{style:{fontSize:14,color:T.sub,padding:'14px 0'}},'No agent runs yet.'),
      runs.length?h('button',{onClick:onClear,style:{color:T.danger,fontSize:14,fontWeight:500,marginTop:16}},'Clear history'):null));
}

/* ============================== agent panel ============================== */
function AgentPanel(props){
  const {T,S,run,snap,setSnap,task,setTask,kb,hasPage,useCur,setUseCur,cfg,onStart,onPause,onResume,onStop,onFollowUp,onContinue,onNew,onSettings,onHistory,onOpenLink,onSaveNote,toastFn,recent,onOpenRun}=props;
  const listRef=useRef(null);
  const drag=useRef(null);
  const [follow,setFollow]=useState('');
  const [filesO,setFilesO]=useState(null);
  const running=run&&(run.status==='running'||run.status==='paused');
  const finished=run&&!running;
  const ready=!!cfg.key;
  useEffect(()=>{const el=listRef.current;if(el&&run)el.scrollTop=el.scrollHeight},[run&&run.steps.length,run&&run.steps.length&&(run.steps[run.steps.length-1].results||[]).length,run&&run.status]);
  const onTS=e=>{drag.current={y:e.touches[0].clientY,t:Date.now()}};
  const onTE=e=>{
    const d=drag.current;drag.current=null;if(!d)return;
    const dy=(e.changedTouches[0].clientY-d.y);
    if(Math.abs(dy)<40)return;
    const order=['peek','half','full'];let i=order.indexOf(snap);
    i=dy<0?Math.min(2,i+1):i-1;
    if(i<0){setSnap(running?'peek':null);return}
    setSnap(order[i]);
  };
  const steps=run?run.steps:[];
  const realN=steps.filter(s=>!s.sys).length;
  const o=agentOpts(S);
  const statusLine=run?(run.status==='paused'?'Paused':run.statusText||(running?'Working…':'')):'';

  if(snap==='peek'){
    return h('div',{onTouchStart:onTS,onTouchEnd:onTE,className:'fdin',style:{position:'absolute',left:10,right:10,bottom:'calc(58px + '+SAFE_B+')',zIndex:30,background:T.sheet,color:T.fg,borderRadius:16,boxShadow:'0 6px 28px rgba(0,0,0,.28)',border:'1px solid '+T.hair,display:'flex',alignItems:'center',gap:10,padding:'9px 10px 9px 14px'}},
      running?(run.status==='paused'?h('span',{style:{color:T.sub,display:'flex'}},Icons.pause(16)):h(Spinner,{T,size:16})):h('span',{style:{color:run&&run.success?'#2f9e44':T.accent,display:'flex'}},Icons.ai(18)),
      h('button',{onClick:()=>setSnap('half'),style:{flex:1,minWidth:0,textAlign:'left',color:T.fg}},
        h('div',{style:{fontSize:13.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},run?(running?'Step '+Math.max(1,realN)+' · '+statusLine:run.status==='done'?(run.success?'Done — tap to see the answer':'Finished — tap to see'):run.status==='failed'?'Agent stopped — tap for details':'Stopped'):'Browser agent'),
        h('div',{style:{fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},run?run.task:'Tap to give it a task')),
      running?h('button',{onClick:run.status==='paused'?onResume:onPause,className:'act90',style:Object.assign({},iconBtnS,{width:36,height:36,color:T.fg})},run.status==='paused'?Icons.play(18,true):Icons.pause(16)):null,
      running?h('button',{onClick:onStop,className:'act90',style:Object.assign({},iconBtnS,{width:36,height:36,color:T.danger})},BI.stop(15)):null,
      h('button',{onClick:()=>setSnap('half'),className:'act90',style:Object.assign({},iconBtnS,{width:36,height:36,color:T.sub})},BI.up(20)));
  }
  const height=snap==='full'?'calc(100% - 52px - '+SAFE_T+')':'58%';
  return h('div',{className:'shn',style:{position:'absolute',left:0,right:0,bottom:kb||0,height:kb?'calc(100% - '+kb+'px - 52px - '+SAFE_T+')':height,zIndex:30,background:T.sheet,color:T.fg,borderRadius:'18px 18px 0 0',boxShadow:'0 -8px 36px rgba(0,0,0,.26)',display:'flex',flexDirection:'column',fontFamily:UIF}},
    h('div',{onTouchStart:onTS,onTouchEnd:onTE,style:{flexShrink:0,touchAction:'none'}},
      h('div',{onClick:()=>setSnap(snap==='full'?'half':'full'),style:{width:40,height:5,borderRadius:3,background:T.hair,margin:'8px auto 2px'}}),
      h('div',{style:{display:'flex',alignItems:'center',gap:4,padding:'2px 8px 6px 16px'}},
        h('span',{style:{color:T.accent,display:'flex'}},Icons.ai(20)),
        h('div',{style:{flex:1,minWidth:0,marginLeft:6}},
          h('div',{style:{fontSize:16,fontWeight:650}},'Browser Agent'),
          h('button',{onClick:onSettings,style:{display:'block',fontSize:11.5,color:T.sub,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},modelLabel(cfg)+' · '+o.maxSteps+' steps max ›')),
        h('button',{onClick:onHistory,className:'act90',style:Object.assign({},iconBtnS,{width:38,color:T.fg})},BI.clock(20)),
        h('button',{onClick:onSettings,className:'act90',style:Object.assign({},iconBtnS,{width:38,color:T.fg})},Icons.gear(20)),
        h('button',{onClick:()=>setSnap(running||run?'peek':null),className:'act90',style:Object.assign({},iconBtnS,{width:38,color:T.fg})},BI.down(22)))),
    h('div',{ref:listRef,className:'bu-scroll sy',style:{flex:1,padding:'4px 16px 12px'}},
      !run?h(Fragment,null,
        !ready?h('div',{style:{background:T.card,borderRadius:12,padding:'12px 14px',marginBottom:12,fontSize:13.5,lineHeight:1.5}},
          h('div',{style:{fontWeight:600,marginBottom:4}},'Connect an AI model first'),
          'The agent needs a model that can plan and act. Gemini has a free key that works well.',
          h('button',{onClick:onSettings,style:{display:'block',color:T.accent,fontWeight:600,marginTop:8}},'Open Agent settings ›')):null,
        h('textarea',{className:'bu-ta',value:task,onChange:e=>setTask(e.target.value),rows:3,placeholder:'What should the agent do? e.g. “Find the 3 best-rated budget phones under ₹20,000 and compare them”',
          onKeyDown:e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();onStart()}},
          style:Object.assign(inputS(T),{resize:'none',lineHeight:1.45,minHeight:84,fontFamily:UIF})}),
        h('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:10}},
          hasPage?h(Chip,{T,active:useCur,onClick:()=>setUseCur(!useCur)},useCur?'✓ Start on this page':'Start on this page'):null,
          h('div',{style:{flex:1}}),
          h('button',{onClick:onStart,disabled:!task.trim(),className:'act95',style:{display:'flex',alignItems:'center',gap:7,padding:'10px 18px',borderRadius:22,background:T.fg,color:T.bg,fontSize:15,fontWeight:650,opacity:task.trim()?1:.4}},Icons.play(15,true),'Run')),
        SectionTitle({T,children:'Try'}),
        h('div',{style:{display:'flex',flexDirection:'column',gap:7,marginTop:6}},EXAMPLES.map(x=>h('button',{key:x,onClick:()=>setTask(x),className:'act98',style:{textAlign:'left',fontSize:13.5,color:T.fg,background:T.card,borderRadius:11,padding:'10px 12px',lineHeight:1.4}},x))),
        recent&&recent.length?h(Fragment,null,
          SectionTitle({T,children:'Recent'}),
          recent.slice(0,4).map(r=>h('button',{key:r.id,onClick:()=>onOpenRun(r),className:'act98',style:{display:'flex',gap:9,width:'100%',textAlign:'left',padding:'10px 2px',borderBottom:'1px solid '+T.hair,color:T.fg}},
            h('span',{style:{color:r.success?'#2f9e44':T.sub,width:16,flexShrink:0}},r.status==='done'?(r.success?'✓':'⚠'):r.status==='failed'?'✕':'■'),
            h('span',{style:{flex:1,minWidth:0,fontSize:13.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},r.task),
            h('span',{style:{fontSize:11.5,color:T.sub,flexShrink:0}},fmtWhen(r.startedAt))))):null,
        h('div',{style:{fontSize:11.5,color:T.sub,lineHeight:1.55,marginTop:16}},'The agent browses in Smart view: it searches, opens pages, clicks links, fills forms, scrolls, reads whole pages, keeps a todo list and notes, and reports back with sources. Pages run without their scripts and without your logins.'))
      :h(Fragment,null,
        h('div',{style:{fontSize:15,fontWeight:600,lineHeight:1.4,margin:'2px 0 4px'}},run.task),
        (run.tasks||[]).slice(1).map((t,i)=>h('div',{key:i,style:{fontSize:13.5,lineHeight:1.4,color:T.meta,margin:'2px 0'}},'↳ '+t)),
        h('div',{style:{fontSize:11.5,color:T.sub,marginBottom:12}},fmtWhen(run.startedAt)+' · '+realN+' step'+(realN===1?'':'s')+(run.provider?' · '+(PROVIDERS[run.provider]||{}).label:'')),
        steps.map((s,i)=>h(StepCard,{key:i,T,s})),
        running?h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 2px 4px',color:T.sub,fontSize:13.5}},run.status==='paused'?Icons.pause(15):h(Spinner,{T,size:15}),h('span',{className:run.status==='paused'?'':'bu-pulse'},statusLine)):null,
        finished?h(ResultCard,{T,run,onOpenLink,onSaveNote,onFiles:f=>setFilesO(f),toastFn}):null,
        finished&&Object.keys(run.files||{}).some(k=>run.files[k])?h('button',{onClick:()=>setFilesO(''),style:{fontSize:13,color:T.accent,fontWeight:600,marginBottom:10}},'📄 View agent files ('+Object.keys(run.files).filter(k=>run.files[k]).length+')'):null)),
    run?h('div',{style:{flexShrink:0,borderTop:'1px solid '+T.hair,padding:'10px 12px calc(10px + '+(kb?'0px':SAFE_B)+')',display:'flex',gap:8,alignItems:'center'}},
      running?h(Fragment,null,
        h('button',{onClick:run.status==='paused'?onResume:onPause,className:'act95',style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'12px',borderRadius:12,background:T.card,color:T.fg,fontSize:15,fontWeight:600}},run.status==='paused'?Icons.play(15,true):Icons.pause(14),run.status==='paused'?'Resume':'Pause'),
        h('button',{onClick:onStop,className:'act95',style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'12px',borderRadius:12,background:T.danger,color:'#fff',fontSize:15,fontWeight:600}},BI.stop(13),'Stop'))
      :h(Fragment,null,
        h('button',{onClick:onNew,className:'act90',style:{padding:'0 6px',color:T.accent,fontSize:14,fontWeight:600,flexShrink:0}},'New'),
        run.status!=='done'&&run.provider!=='cloud'?h('button',{onClick:onContinue,className:'act90',style:{padding:'0 6px',color:T.accent,fontSize:14,fontWeight:600,flexShrink:0}},'Continue'):null,
        h('input',{value:follow,onChange:e=>setFollow(e.target.value),placeholder:'Ask a follow-up…',enterKeyHint:'send',
          onKeyDown:e=>{if(e.key==='Enter'&&follow.trim()){onFollowUp(follow.trim());setFollow('')}},
          style:Object.assign(inputS(T),{flex:1,minWidth:0,padding:'10px 12px',borderRadius:20})}),
        h('button',{onClick:()=>{if(follow.trim()){onFollowUp(follow.trim());setFollow('')}},disabled:!follow.trim(),className:'act90',style:{width:38,height:38,borderRadius:19,background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',opacity:follow.trim()?1:.35,flexShrink:0}},BI.send(18)))):null,
    filesO!=null&&run?h(FilesSheet,{T,files:run.files||{},focus:filesO,onSaveNote,onClose:()=>setFilesO(null),toastFn}):null);
}

/* ============================== the browser ============================== */
function newTabObj(n,url,mode){return{id:uid(),n,url:url||'',title:url?domainOf(url):'',mode:mode||'live',srcdoc:'',loading:false,error:'',hist:url?[{url}]:[],hi:url?0:-1,via:'',liveKey:0,stale:!!url}}
function restoreTabs(saved,initialUrl,S){
  let tabs=[];let n=0;
  if(saved&&Array.isArray(saved.tabs))tabs=saved.tabs.filter(t=>t&&t.id).slice(0,12).map(t=>{n=Math.max(n,t.n||0);return Object.assign(newTabObj(t.n||++n,safeUrl(t.url),t.mode==='smart'?'smart':'live'),{id:t.id,title:t.title||domainOf(t.url)})});
  let active=saved&&tabs.find(t=>t.id===saved.active)?saved.active:(tabs[0]&&tabs[0].id);
  const iu=safeUrl(initialUrl);
  if(iu){
    const ex=tabs.find(t=>t.url===iu);
    if(ex)active=ex.id;
    else{const t=newTabObj(n+1,iu,S.browserView==='smart'?'smart':'live');tabs.push(t);active=t.id}
  }else if(initialUrl===''&&saved){ /* opened from the menu: land on a fresh start page */
    const blank=tabs.find(t=>!t.url);
    if(blank)active=blank.id;else{const t=newTabObj(n+1,'');tabs.push(t);active=t.id}
  }
  if(!tabs.length){const t=newTabObj(1,'');tabs.push(t);active=t.id}
  return{tabs,active};
}

function BUBrowser(props){
  const {T,S,update,data,sites,onSites,vault,onChangeVault,session,initialUrl,onClose,onSaveUrl,onSaveNote,toastFn}=props;
  const set=useCallback(p=>update(d=>({...d,settings:{...d.settings,...p}})),[update]);
  const init=useMemo(()=>restoreTabs(data.browser,initialUrl,S),[]);
  const tabsRef=useRef(init.tabs);
  const [tabs,_setTabs]=useState(init.tabs);
  const setTabs=useCallback(fn=>{const next=typeof fn==='function'?fn(tabsRef.current):fn;tabsRef.current=next;_setTabs(next)},[]);
  const activeRef=useRef(init.active);
  const [activeId,_setActive]=useState(init.active);
  const setActive=useCallback(id=>{activeRef.current=id;_setActive(id)},[]);
  const frames=useRef({});const waiters=useRef({});const seqs=useRef({});const pendingScroll=useRef({});
  const [view,setView]=useState('page');
  const [addr,setAddr]=useState('');const [addrFocus,setAddrFocus]=useState(false);
  const [snap,setSnap]=useState(null);
  const [run,setRun]=useState(null);
  const runnerRef=useRef(null);
  const [task,setTask]=useState('');
  const [useCur,setUseCur]=useState(true);
  const [sheet,setSheet]=useState(null);
  const [findQ,setFindQ]=useState('');
  const [hideHint,setHideHint]=useState({});
  const kb=useKbInset();
  const o=agentOpts(S);const cfg=agentCfg(S);
  const oRef=useRef(o);oRef.current=o;
  const runs=Array.isArray(data.agentRuns)?data.agentRuns:[];

  const getTab=id=>tabsRef.current.find(t=>t.id===id);
  const active=tabs.find(t=>t.id===activeId)||tabs[0];
  const patchTab=useCallback((id,p)=>setTabs(ts=>ts.map(t=>t.id===id?Object.assign({},t,typeof p==='function'?p(t):p):t)),[]);

  /* persist tabs (urls/titles only) */
  const tabsKey=JSON.stringify(tabs.map(t=>[t.id,t.n,t.url,t.title,t.mode]))+activeId;
  useEffect(()=>{
    const tm=setTimeout(()=>update(d=>({...d,browser:{tabs:tabsRef.current.map(t=>({id:t.id,n:t.n,url:t.url,title:t.title,mode:t.mode})),active:activeRef.current}})),400);
    return()=>clearTimeout(tm);
  },[tabsKey]);
  /* mark runs that were cut off by an app restart */
  useEffect(()=>{
    if(runs.some(r=>r.status==='running'||r.status==='paused'))update(d=>({...d,agentRuns:(d.agentRuns||[]).map(r=>r.status==='running'||r.status==='paused'?{...r,status:'stopped',error:'Interrupted when the app was closed — tap Continue to pick up where it left off.'}:r)}));
  },[]);
  useEffect(()=>{if(!addrFocus)setAddr(active&&active.url?active.url:'')},[active&&active.url,addrFocus,activeId]);
  /* restored Smart tabs load lazily when shown */
  useEffect(()=>{
    const t=active;
    if(t&&t.stale&&t.url&&!t.loading){
      if(t.mode==='smart')loadSmart(t.id,{url:t.url},{push:false});
      else patchTab(t.id,{stale:false});
    }
  },[activeId,active&&active.stale]);
  /* stop the agent if the browser closes */
  useEffect(()=>()=>{if(runnerRef.current)runnerRef.current.stop();WL.off()},[]);

  /* ---------- page loading ---------- */
  function saveScroll(id){
    const t=getTab(id);const fr=frames.current[id];
    if(t&&t.hi>=0&&t.hist[t.hi]&&fr&&t.mode==='smart'){try{t.hist[t.hi].scrollY=fr.contentWindow.scrollY}catch(e){}}
  }
  async function loadSmart(id,req,lo){
    lo=lo||{};
    const seq=(seqs.current[id]=(seqs.current[id]||0)+1);
    saveScroll(id);
    patchTab(id,{loading:true,error:'',mode:'smart',stale:false,url:req.url||((getTab(id)||{}).url)});
    let page;
    try{
      if(req.search){
        const r=await webSearch(req.search,req.engine||oRef.current.engine);
        page={url:ENGINES[r.engine].show(req.search),title:req.search+' — Search',srcdoc:preparePage(searchPageHtml(req.search,r.engine,r.results),'https://duckduckgo.com/').srcdoc,via:'search',engine:r.engine,count:r.results.length};
      }else if(req.cached){page=req.cached}
      else page=await fetchSmartPage(req,oRef.current);
    }catch(e){
      if(seqs.current[id]!==seq)return getTab(id);
      patchTab(id,{loading:false,error:String(e&&e.message||e),srcdoc:''});
      return getTab(id);
    }
    if(seqs.current[id]!==seq||!getTab(id))return getTab(id);
    const loaded=new Promise(res=>{waiters.current[id]=res;setTimeout(res,9000)});
    if(lo.scrollY)pendingScroll.current[id]=lo.scrollY;
    patchTab(id,t=>{
      let hist=t.hist.slice(),hi=t.hi;
      const entry={url:page.url,req:req.search?{search:req.search,engine:page.engine}:(req.method==='POST'?{url:req.url,method:'POST',body:req.body}:{url:page.url}),page,title:page.title};
      if(lo.push!==false){hist=hist.slice(0,hi+1).concat([entry]);hi=hist.length-1}
      else if(hi>=0)hist[hi]=Object.assign({},hist[hi],entry);
      else{hist=[entry];hi=0}
      /* keep cached page HTML only for recent entries */
      hist.forEach((h2,i)=>{if(Math.abs(i-hi)>3&&h2.page)hist[i]=Object.assign({},h2,{page:null})});
      return{srcdoc:page.srcdoc,title:page.title,url:page.url,via:page.via,loading:false,error:'',blank:false,note:'',hist,hi};
    });
    await loaded;
    if(!req.search&&req.method!=='POST'&&!req.cached)await rescueBlank(id,seq,page);
    const t=getTab(id);
    return Object.assign({},t,{count:page.count,engine:page.engine});
  }
  async function rescueBlank(id,seq,page){
    const chain=[];
    if(page.via!=='rendered'&&page.via!=='reader'&&page.via!=='text'&&oRef.current.jsRender!==false)chain.push('rendered');
    if(page.via!=='reader'&&page.via!=='text')chain.push('reader');
    const frameDoc=()=>{const fr=frames.current[id];try{return fr&&fr.contentDocument&&{doc:fr.contentDocument,win:fr.contentWindow}}catch(e){return null}};
    for(const kind of chain){
      if(seqs.current[id]!==seq)return;
      const f=frameDoc();if(!f||!looksBlank(f.doc,f.win))break;
      patchTab(id,{loading:true,note:'Page looks blank here — loading a '+(kind==='rendered'?'fully rendered':'reader')+' copy…'});
      let alt=null;
      try{
        if(kind==='rendered'){const p=preparePage(await fetchRendered(page.url),page.url);if(p.textLen>=150&&!p.blocked)alt={srcdoc:p.srcdoc,title:p.title||page.title,via:'rendered'}}
        else{const rd=await fetchViaJina(page.url);alt={srcdoc:preparePage(readerShell(rd.title,rd.html,page.url),page.url).srcdoc,title:rd.title||page.title,via:'reader'}}
      }catch(e){}
      if(seqs.current[id]!==seq)return;
      if(!alt){patchTab(id,{loading:false,note:''});continue}
      const l2=new Promise(res=>{waiters.current[id]=res;setTimeout(res,9000)});
      patchTab(id,t=>{const hist=t.hist.slice();if(t.hi>=0&&hist[t.hi])hist[t.hi]=Object.assign({},hist[t.hi],{page:Object.assign({},page,alt)});return{srcdoc:alt.srcdoc,title:alt.title,via:alt.via,loading:false,note:'',hist}});
      await l2;
    }
    if(seqs.current[id]!==seq)return;
    const f=frameDoc();
    patchTab(id,{loading:false,note:'',blank:!!(f&&looksBlank(f.doc,f.win))});
  }
  function navLive(id,url,push){
    patchTab(id,t=>{
      let hist=t.hist.slice(),hi=t.hi;
      if(push!==false){hist=hist.slice(0,hi+1).concat([{url,req:{url}}]);hi=hist.length-1}
      return{url,mode:'live',title:domainOf(url),liveKey:(t.liveKey||0)+1,error:'',loading:false,stale:false,srcdoc:'',hist,hi};
    });
  }
  function onFrameLoad(id){
    const fr=frames.current[id];if(!fr)return;
    let doc;try{doc=fr.contentDocument}catch(e){return}
    if(!doc||!doc.body||doc.__bu)return;
    doc.__bu=1;
    const win=fr.contentWindow;
    doc.addEventListener('click',e=>{
      const tg=e.target&&e.target.nodeType===1?e.target:e.target&&e.target.parentElement;if(!tg||!tg.closest)return;
      const a=tg.closest('a[href]');
      if(a){
        e.preventDefault();
        const raw=a.getAttribute('href')||'';
        if(raw.startsWith('#')){const t=doc.getElementById(decodeURIComponent(raw.slice(1)))||doc.getElementsByName(raw.slice(1))[0];if(t)t.scrollIntoView({behavior:'smooth'});return}
        const tab=getTab(id);const href=absUrl(raw,tab&&tab.url);
        if(/^https?:/.test(href)){if(a.getAttribute('target')==='_blank')ctl.newTab(href,{mode:'smart'});else ctl.navigate(id,{url:href},{mode:'smart'})}
        else if(/^(mailto|tel|sms|maps):/i.test(href))openExternalUrl(href);
        return;
      }
      const b=tg.closest('button,input[type=submit],input[type=image]');
      if(b&&b.form&&isSubmitter(b)){e.preventDefault();ctl.submit(id,b.form,b)}
    },true);
    doc.addEventListener('keydown',e=>{
      if(e.key!=='Enter')return;const t=e.target;
      if(t&&t.tagName==='INPUT'&&t.form&&!/^(checkbox|radio|button|submit|reset|file)$/i.test(t.type||'')){e.preventDefault();ctl.submit(id,t.form,defaultSubmitter(t.form));try{t.blur()}catch(err){}}
    },true);
    revealPage(doc,win);
    const y=pendingScroll.current[id];if(y){delete pendingScroll.current[id];try{win.scrollTo(0,y)}catch(e){}}
    const w=waiters.current[id];if(w){delete waiters.current[id];w()}
  }

  /* ---------- the controller the agent (and the UI) drives ---------- */
  const ctl=useMemo(()=>({
    activeId:()=>activeRef.current,
    tab:id=>getTab(id),
    idByN:n=>{const t=tabsRef.current.find(x=>x.n===n);return t&&t.id},
    doc:id=>{const fr=frames.current[id];try{return fr&&fr.contentDocument}catch(e){return null}},
    async navigate(id,req,no){
      if(typeof req==='string')req={url:req};
      const t=getTab(id);if(!t)return null;
      const mode=(no&&no.mode)||t.mode||'live';
      if(mode==='live'){navLive(id,req.url);return getTab(id)}
      return loadSmart(id,req,{});
    },
    async search(id,q,engine){
      const t=await loadSmart(id,{search:q,engine},{});
      if(t&&t.error)throw new Error('Search failed: '+t.error);
      return{engine:t.engine||engine||'duckduckgo',count:t.count||0};
    },
    async newTab(url,no){
      no=no||{};
      const n=Math.max(0,...tabsRef.current.map(t=>t.n))+1;
      const t=newTabObj(n,'',no.mode||'smart');
      t.stale=false;
      setTabs(ts=>ts.concat([t]));setActive(t.id);setView('page');
      if(url){
        if((no.mode||'smart')==='live'){navLive(t.id,url);if(no.title)patchTab(t.id,{title:no.title})}
        else await loadSmart(t.id,{url},{});
      }
      return t.id;
    },
    async activate(id){
      setActive(id);setView('page');
      const t=getTab(id);
      if(t&&t.url&&(t.stale||t.mode==='live'))await loadSmart(id,{url:t.url},{push:false});
    },
    closeTab(id){
      const ts=tabsRef.current;const i=ts.findIndex(t=>t.id===id);if(i<0)return;
      delete frames.current[id];
      let rest=ts.filter(t=>t.id!==id);
      if(!rest.length)rest=[newTabObj(1,'')];
      setTabs(rest);
      if(activeRef.current===id)setActive((rest[Math.min(i,rest.length-1)]||rest[0]).id);
    },
    async back(id){
      const t=getTab(id);if(!t||t.hi<=0)return false;
      const e=t.hist[t.hi-1];
      saveScroll(id);
      patchTab(id,{hi:t.hi-1});
      if(t.mode==='live'&&!e.page){patchTab(id,x=>({url:e.url,liveKey:(x.liveKey||0)+1,title:domainOf(e.url)}));return true}
      if(e.page)await loadSmart(id,{url:e.url,cached:e.page},{push:false,scrollY:e.scrollY});
      else await loadSmart(id,e.req||{url:e.url},{push:false,scrollY:e.scrollY});
      return true;
    },
    async forward(id){
      const t=getTab(id);if(!t||t.hi>=t.hist.length-1)return false;
      const e=t.hist[t.hi+1];
      saveScroll(id);
      patchTab(id,{hi:t.hi+1});
      if(t.mode==='live'&&!e.page){patchTab(id,x=>({url:e.url,liveKey:(x.liveKey||0)+1,title:domainOf(e.url)}));return true}
      if(e.page)await loadSmart(id,{url:e.url,cached:e.page},{push:false,scrollY:e.scrollY});
      else await loadSmart(id,e.req||{url:e.url},{push:false});
      return true;
    },
    async reload(id){
      const t=getTab(id);if(!t||!t.url)return;
      if(t.mode==='live'){patchTab(id,x=>({liveKey:(x.liveKey||0)+1}));return}
      const e=t.hist[t.hi];
      await loadSmart(id,(e&&e.req)||{url:t.url},{push:false});
    },
    async submit(id,form,submitter){
      const t=getTab(id);if(!t)return{error:'No tab'};
      if(form.hasAttribute('data-bu-search')){
        const q=squish((form.querySelector('[name=q]')||{}).value||'');
        if(!q)return{error:'Type a search query first'};
        const r=await ctl.search(id,q,form.getAttribute('data-engine')||oRef.current.engine);
        return{text:'Searched “'+q+'” — '+r.count+' results',changed:true};
      }
      const sm=submitter&&submitter.getAttribute&&submitter.getAttribute('formmethod');
      const method=String(sm||form.getAttribute('method')||'get').toLowerCase();
      const sa=submitter&&submitter.getAttribute&&submitter.getAttribute('formaction');
      const action=absUrl(sa||form.getAttribute('action')||t.url,t.url);
      if(!/^https?:/.test(action))return{error:'This form cannot be submitted here (needs JavaScript).'};
      const params=new URLSearchParams();
      for(const el of Array.from(form.elements)){
        if(!el.name||el.disabled)continue;
        const ty=String(el.type||'').toLowerCase();
        if(/^(submit|image|button|reset)$/.test(ty)){if(el===submitter)params.append(el.name,el.value||'');continue}
        if(ty==='file')continue;
        if((ty==='checkbox'||ty==='radio')&&!el.checked)continue;
        if(el.tagName==='SELECT'){Array.from(el.selectedOptions).forEach(op=>params.append(el.name,op.value));continue}
        params.append(el.name,el.value==null?'':el.value);
      }
      let r;
      if(method==='post'){r=await loadSmart(id,{url:action,method:'POST',body:params.toString()},{})}
      else{const u=new URL(action);u.search=params.toString();u.hash='';r=await loadSmart(id,{url:u.href},{})}
      if(r&&r.error)return{error:'Form submitted but the result failed to load: '+r.error,changed:true};
      return{text:'Submitted the form → '+(r&&r.url||action),changed:true};
    },
    async clickEl(id,el,co){
      const t=getTab(id);
      const a=el.closest&&el.closest('a[href]');
      if(a){
        const raw=a.getAttribute('href')||'';
        if(raw.startsWith('#')){const d=el.ownerDocument;const tg=d.getElementById(decodeURIComponent(raw.slice(1)));if(tg)tg.scrollIntoView();return{text:'Jumped to section '+raw}}
        const href=absUrl(raw,t.url);
        if(!/^https?:/.test(href))return{error:'That link ('+trunc(href,40)+') can’t be opened in the browser.'};
        if(!allowedHost(href,co.allowed))return{error:'Blocked: '+hostOf(href)+' is not in your allowed domains.'};
        if(co.newTab){const nid=await ctl.newTab(href,{mode:'smart'});const nt=getTab(nid);return{text:'Opened '+href+' in new tab '+(nt?nt.n:''),changed:true}}
        const r=await loadSmart(id,{url:href},{});
        if(r&&r.error)return{error:'Clicked link but '+href+' failed to load: '+r.error,changed:true};
        return{text:'Clicked link → '+href,changed:true};
      }
      const tag=el.tagName;const ty=String(el.getAttribute('type')||'').toLowerCase();
      if(el.form&&(tag==='BUTTON'||tag==='INPUT')&&isSubmitter(el))return ctl.submit(id,el.form,el);
      if(tag==='INPUT'&&(ty==='checkbox'||ty==='radio')){el.click();return{text:ty+' is now '+(el.checked?'checked':'unchecked')}}
      if(tag==='SELECT')return{text:'That is a dropdown — use get_dropdown_options and select_dropdown_option.'};
      if(tag==='INPUT'||tag==='TEXTAREA'||el.isContentEditable){try{el.focus()}catch(e){}return{text:'Focused the field — use input_text to type.'}}
      if(tag==='SUMMARY'){el.click();const d=el.parentElement;return{text:'Section '+(d&&d.open?'expanded':'collapsed')}}
      const dh=el.getAttribute('data-href')||el.getAttribute('data-url');
      if(dh){const href=absUrl(dh,t.url);if(/^https?:/.test(href)){await loadSmart(id,{url:href},{});return{text:'Opened '+href,changed:true}}}
      const lab=el.closest&&el.closest('label');
      if(lab){lab.click();return{text:'Clicked the label'}}
      try{el.click()}catch(e){}
      return{error:'Clicked, but nothing happened — this control needs the page’s JavaScript, which Smart view doesn’t run. Try a link, a direct URL, search, or extract.'};
    },
    async agentState(ao,prevSigs,prevUrl){
      let t=getTab(activeRef.current);
      if(t&&t.url&&!t.loading&&(t.mode==='live'||t.stale||(!t.srcdoc&&!t.error))){const e=t.hist[t.hi];await loadSmart(t.id,(e&&e.req&&!e.req.search?e.req:{url:t.url}),{push:false});}
      for(let i=0;i<240&&(t=getTab(activeRef.current))&&t.loading;i++)await sleep(250);
      t=getTab(activeRef.current);
      await sleep(40);
      const tabsText='Current tab: '+(t?t.n:'?')+'\nAvailable tabs:\n'+tabsRef.current.map(x=>'Tab '+x.n+': '+(x.url||'about:blank')+(x.title?' - '+trunc(x.title,60):'')).join('\n');
      if(!t||!t.url)return{url:'',title:'',tabsText,dom:'Empty tab — nothing loaded yet. Use search or go_to_url to begin.',els:[],sigs:null};
      if(t.error)return{url:t.url,title:t.title,tabsText,dom:'This page failed to load: '+t.error+'\nTry another URL, go_back, or search.',els:[],sigs:null};
      const fr=frames.current[t.id];let doc=null,win=null;
      try{doc=fr&&fr.contentDocument;win=fr&&fr.contentWindow}catch(e){}
      if(!doc||!doc.body)return{url:t.url,title:t.title,tabsText,dom:'(page is still loading — wait or refresh)',els:[],sigs:null};
      clearOverlay(doc);
      const cap=captureState(doc,win,{depth:ao.depth,prevSigs:prevUrl===t.url?prevSigs:null,url:t.url});
      if(ao.highlight)drawOverlay(doc,win,cap.els);
      const via=t.via==='rendered'?' (pre-rendered with JavaScript)':t.via==='reader'?' (reader text only — page could not be loaded directly)':'';
      const blank=looksBlank(doc,win);
      let dom=stateText(cap);
      if(blank)dom='⚠ THIS PAGE IS BLANK in this browser (it needs JavaScript, blocks automated browsers, or has no content). A rendered copy and a reader copy were already tried. Do NOT wait, scroll or refresh — go_back and use another result, go_to_url a different site, or search again with other words.\n'+dom;
      return{url:t.url,title:t.title,tabsText,blank,
        pageInfo:'Current page: '+t.url+(t.title?' — '+trunc(t.title,80):'')+via+'\nPage info: '+cap.vw+'x'+cap.vh+'px viewport, '+cap.total+'px total height, '+(cap.above/cap.vh).toFixed(1)+' pages above, '+(cap.below/cap.vh).toFixed(1)+' pages below',
        dom,els:cap.els,sigs:cap.sigs};
    }
  }),[]);

  /* ---------- agent control ---------- */
  const saveRun=useCallback(r=>{
    update(d=>{const list=(d.agentRuns||[]).filter(x=>x.id!==r.id);return{...d,agentRuns:[compactRun(r)].concat(list).slice(0,25)}});
  },[update]);
  const lastSaved=useRef(0);
  const onRunUpdate=useCallback(r=>{
    setRun(r);
    const fin=!(r.status==='running'||r.status==='paused');
    if(fin||Date.now()-lastSaved.current>4000){lastSaved.current=Date.now();saveRun(r)}
    if(fin){vibrate(20);runnerRef.current=null;Object.values(frames.current).forEach(fr=>{try{clearOverlay(fr.contentDocument)}catch(e){}})}
  },[saveRun]);
  const launch=(runObj)=>{
    const c=agentCfg(S);
    const R=c.provider==='cloud'?CloudRunner:AgentRunner;
    const runner=new R({ctl,cfg:c,opts:agentOpts(S),run:runObj,onUpdate:onRunUpdate,onSaveUrl});
    runnerRef.current=runner;
    setRun(Object.assign({},runObj));setSnap(s=>s==='full'?'full':'half');
    runner.start();
  };
  const startTask=async()=>{
    const tk=task.trim();if(!tk)return;
    const c=agentCfg(S);
    if(!c.key){setSheet('settings');toastFn('Add an API key for the agent first');return}
    if(runnerRef.current)return;
    const t=getTab(activeRef.current);
    let startUrl='';
    if(useCur&&t&&t.url)startUrl=t.url;
    else if(t&&t.url){await ctl.newTab('',{mode:'smart'})}
    const r={id:uid(),task:tk,tasks:[tk],status:'running',steps:[],files:{'todo.md':''},startedAt:Date.now(),provider:c.provider,model:c.model,startUrl,taskStart:0};
    if(startUrl)r.steps.push({sys:'Started on the current page: '+startUrl});
    setTask('');
    launch(r);
  };
  const followUp=text=>{
    if(!run||runnerRef.current)return;
    const realN=run.steps.filter(s=>!s.sys).length;
    const r=Object.assign({},run,{tasks:(run.tasks||[run.task]).concat([text]),status:'running',error:'',result:run.result,success:false,taskStart:realN,resumedAt:Date.now(),shownFiles:[]});
    r.steps=run.steps.concat([{sys:'Previous answer: '+trunc(run.result||'(none)',1500)},{sys:'New follow-up request from the user: '+text}]);
    r.result=null;
    launch(r);
  };
  const continueRun=()=>{
    if(!run||runnerRef.current)return;
    const realN=run.steps.filter(s=>!s.sys).length;
    const r=Object.assign({},run,{status:'running',error:'',result:null,success:false,taskStart:realN,resumedAt:Date.now()});
    r.steps=run.steps.concat([{sys:'The user asked you to continue the task from where you stopped.'}]);
    launch(r);
  };
  const stopRun=()=>{if(runnerRef.current){runnerRef.current.stop();toastFn('Stopping the agent…')}};
  const openRun=r=>{if(runnerRef.current)return;setRun(Object.assign({},r));setSheet(null);setSnap('half')};

  /* ---------- UI actions ---------- */
  const goAddr=v=>{
    const t0=String(v||'').trim();if(!t0)return;
    const tab=getTab(activeRef.current);
    const isUrl=!/\s/.test(t0)&&t0.includes('.')&&normalizeUrl(t0);
    const mode=tab.url?tab.mode:(S.browserView==='smart'?'smart':'live');
    if(mode==='live')navLive(tab.id,isUrl?normalizeUrl(t0):browserTarget(t0));
    else if(isUrl)loadSmart(tab.id,{url:normalizeUrl(t0)},{});
    else loadSmart(tab.id,{search:t0,engine:o.engine},{});
    setView('page');
    try{document.activeElement&&document.activeElement.blur()}catch(e){}
  };
  const openSite=url=>{const tab=getTab(activeRef.current);const mode=S.browserView==='smart'?'smart':'live';if(mode==='live')navLive(tab.id,url);else loadSmart(tab.id,{url},{})};
  const switchView=()=>{
    const t=getTab(activeRef.current);if(!t||!t.url)return;
    if(t.mode==='live')loadSmart(t.id,{url:t.url},{push:false});
    else navLive(t.id,t.url,false);
  };
  const openLink=href=>{if(/^https?:/.test(href))ctl.newTab(href,{mode:S.browserView==='smart'?'smart':'live'})};
  const findOnPage=()=>{
    const doc=ctl.doc(activeRef.current);if(!doc||!findQ.trim())return;
    const el=findTextNode(doc,findQ);
    if(el){flashEl(el);setSheet(null)}else toastFn('Not found on this page');
  };
  const tryClose=()=>{if(runnerRef.current)setSheet('confirmClose');else onClose()};
  const running=run&&(run.status==='running'||run.status==='paused');

  /* ---------- render ---------- */
  const tb=(icon,onClick,dis,label)=>h('button',{onClick,disabled:dis,'aria-label':label,className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,opacity:dis?0.3:1})},icon);
  const canBack=active&&active.hi>0,canFwd=active&&active.hi<active.hist.length-1;
  const showHint=active&&active.url&&active.mode==='live'&&!hideHint[active.id];

  const startPage=h('div',{className:'sy bu-scroll',style:{position:'absolute',inset:0,overflowY:'auto',padding:'16px 16px 120px',background:T.bg,color:T.fg}},
    h('button',{onClick:()=>setSnap('half'),className:'act98',style:{display:'flex',alignItems:'center',gap:14,width:'100%',textAlign:'left',padding:'16px',borderRadius:16,background:T.card,marginBottom:22,color:T.fg}},
      h('span',{style:{width:44,height:44,borderRadius:12,background:T.fg,color:T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},Icons.ai(24)),
      h('span',{style:{flex:1,minWidth:0}},
        h('span',{style:{display:'block',fontSize:16,fontWeight:650}},'Ask the browser agent'),
        h('span',{style:{display:'block',fontSize:12.5,color:T.sub,marginTop:3,lineHeight:1.4}},'It searches, clicks, reads and fills forms for you — then reports back with sources.')),
      h('span',{style:{color:T.sub}},Icons.chevR(18))),
    h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'4px 2px 12px'}},'Your sites'),
    h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}},
      sites.map(st=>h('button',{key:st.id,onClick:()=>openSite(st.url),className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7,minWidth:0}},
        h('span',{style:{width:54,height:54,borderRadius:14,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}},
          h('img',{src:faviconUrl(st.url),alt:'',style:{width:30,height:30},onError:e=>{e.target.style.opacity=0}})),
        h('span',{style:{fontSize:11.5,color:T.meta,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},st.name))),
      h('button',{onClick:()=>setSheet('addSite'),className:'act95',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:7}},
        h('span',{style:{width:54,height:54,borderRadius:14,border:'1.5px dashed '+T.sub,display:'flex',alignItems:'center',justifyContent:'center',color:T.sub}},Icons.plus(22)),
        h('span',{style:{fontSize:11.5,color:T.sub}},'Add'))),
    runs.length?h(Fragment,null,
      h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'26px 2px 6px'}},'Recent agent tasks'),
      runs.slice(0,4).map(r=>h('button',{key:r.id,onClick:()=>openRun(r),className:'act98',style:{display:'flex',gap:10,width:'100%',textAlign:'left',padding:'11px 2px',borderBottom:'1px solid '+T.hair,color:T.fg}},
        h('span',{style:{color:r.status==='done'&&r.success?'#2f9e44':T.sub,width:16,flexShrink:0}},r.status==='done'?(r.success?'✓':'⚠'):r.status==='failed'?'✕':'■'),
        h('span',{style:{flex:1,minWidth:0,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},r.task),
        h('span',{style:{fontSize:11.5,color:T.sub,flexShrink:0}},fmtWhen(r.startedAt))))):null,
    h('div',{style:{fontSize:12,color:T.sub,marginTop:22,lineHeight:1.55}},
      h('b',null,'Live'),' shows the real site with its scripts and your logins. ',h('b',null,'Smart'),' always opens pages (even ones that block apps) and lets the agent drive them. Tap the Live/Smart badge in the address bar to switch.'));

  const pageArea=h('div',{style:{position:'relative',flex:1,overflow:'hidden',background:T.bg}},
    tabs.map(t=>{
      const isA=t.id===activeId;
      let body=null;
      if(!t.url)body=isA?startPage:null;
      else if(t.mode==='live')body=h('iframe',{key:'live'+t.liveKey,src:t.url,sandbox:LIVE_SANDBOX,allow:'fullscreen; clipboard-write; geolocation',referrerPolicy:'no-referrer-when-downgrade',title:t.title||'page',
        style:{position:'absolute',inset:0,width:'100%',height:'100%',border:0,background:'#fff'}});
      else body=h('iframe',{srcDoc:t.srcdoc||'',sandbox:'allow-same-origin',title:t.title||'page',ref:el=>{if(el)frames.current[t.id]=el},onLoad:()=>onFrameLoad(t.id),
        style:{position:'absolute',inset:0,width:'100%',height:'100%',border:0,background:'#fff'}});
      return h('div',{key:t.id,style:{position:'absolute',inset:0,visibility:isA&&view==='page'?'visible':'hidden',zIndex:isA?2:1}},
        body,
        t.loading?h('div',{className:'bu-prog'},h('i',{style:{background:T.accent}})):null,
        t.note?h('div',{style:{position:'absolute',top:10,left:12,right:12,zIndex:7,display:'flex',justifyContent:'center',pointerEvents:'none'}},
          h('div',{style:{background:'rgba(28,28,30,.86)',color:'#fff',fontSize:12.5,fontWeight:500,padding:'7px 13px',borderRadius:16,display:'flex',alignItems:'center',gap:8}},h(Spinner,{T,size:12}),t.note)):null,
        t.blank&&!t.loading&&t.mode==='smart'&&!t.error?h('div',{style:{position:'absolute',left:12,right:12,bottom:12,zIndex:7,background:T.sheet,color:T.fg,border:'1px solid '+T.hair,borderRadius:14,boxShadow:'0 6px 24px rgba(0,0,0,.18)',padding:'12px 14px'}},
          h('div',{style:{fontSize:14,fontWeight:600}},'This page can’t be shown in Smart view'),
          h('div',{style:{fontSize:12.5,color:T.sub,margin:'3px 0 10px',lineHeight:1.45}},'It needs its own JavaScript or blocks automated browsers.'),
          h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},h(Chip,{T,onClick:()=>navLive(t.id,t.url,false)},'Live view'),h(Chip,{T,onClick:()=>openExternalUrl(t.url)},'Open in Safari ↗'),h(Chip,{T,onClick:()=>ctl.back(t.id)},'Go back'))):null,
        t.loading&&!t.srcdoc&&t.mode==='smart'?h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,background:T.bg,color:T.sub,fontSize:13.5}},h(Spinner,{T,size:22}),'Loading '+(domainOf(t.url)||'page')+'…'):null,
        t.error&&t.url?h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,padding:28,background:T.bg,color:T.fg,textAlign:'center'}},
          h('div',{style:{fontSize:17,fontWeight:600}},'Couldn’t open this page'),
          h('div',{style:{fontSize:13,color:T.sub,lineHeight:1.5,maxWidth:320}},t.error),
          h('div',{style:{display:'flex',gap:10,marginTop:8,flexWrap:'wrap',justifyContent:'center'}},
            h(Chip,{T,onClick:()=>ctl.reload(t.id)},'Retry'),
            h(Chip,{T,onClick:()=>navLive(t.id,t.url,false)},'Live view'),
            h(Chip,{T,onClick:()=>openExternalUrl(t.url)},'Open in Safari ↗'))):null);
    }),
    view==='tabs'?h(TabsGrid,{T,tabs,activeId,onPick:id=>{ctl.activate(id).catch(()=>{});setView('page')},onClose:id=>ctl.closeTab(id),onNew:()=>{ctl.newTab('',{mode:S.browserView==='smart'?'smart':'live'});setView('page')},onDone:()=>setView('page'),onCloseAll:()=>{setTabs([newTabObj(1,'')]);setActive(tabsRef.current[0].id);setView('page')}}):null);

  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:90,background:T.bg,color:T.fg,display:'flex',flexDirection:'column',fontFamily:UIF}},
    /* address bar */
    h('div',{style:{display:'flex',alignItems:'center',gap:4,padding:'calc(6px + '+SAFE_T+') 8px 6px',flexShrink:0,borderBottom:'1px solid '+T.hair}},
      h('button',{onClick:tryClose,'aria-label':'Close browser',className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,width:38})},Icons.x(22)),
      h('div',{style:{flex:1,display:'flex',alignItems:'center',gap:7,background:T.search,borderRadius:11,padding:'0 6px 0 8px',minWidth:0,height:40}},
        active&&active.url&&!addrFocus?h('button',{onClick:switchView,className:'act95',title:'Switch view',style:{flexShrink:0,fontSize:10.5,fontWeight:700,letterSpacing:'.03em',padding:'3px 6px',borderRadius:6,background:active.mode==='smart'?T.fg:T.bg,color:active.mode==='smart'?T.bg:T.fg,border:'1px solid '+T.hair}},active.mode==='smart'?'SMART':'LIVE'):h('span',{style:{color:T.sub,display:'flex'}},Icons.search(15)),
        h('input',{value:addrFocus?addr:(active&&active.url?(domainOf(active.url)||active.url):''),onChange:e=>setAddr(e.target.value),placeholder:'Search or enter address',inputMode:'url',enterKeyHint:'go',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
          onKeyDown:e=>{if(e.key==='Enter')goAddr(addr)},
          onFocus:e=>{setAddrFocus(true);setAddr(active&&active.url||'');const el=e.target;setTimeout(()=>{try{el.select()}catch(err){}},30)},
          onBlur:()=>setTimeout(()=>setAddrFocus(false),120),
          style:{flex:1,border:'none',background:'transparent',color:T.fg,fontSize:16,minWidth:0,textAlign:addrFocus?'left':'center'}}),
        active&&active.url&&!addrFocus?h('button',{onClick:()=>active.loading?null:ctl.reload(active.id),className:'act90',style:{color:T.sub,display:'flex',padding:4}},active.loading?h(Spinner,{T,size:14}):Icons.refresh(16)):null),
      h('button',{onClick:()=>setSheet('vault'),'aria-label':'Passwords',className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,width:38})},Icons.key(19))),
    pageArea,
    showHint&&view==='page'?h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:10,padding:'6px 12px',borderTop:'1px solid '+T.hair,background:T.bg}},
      h('span',{style:{flex:1,fontSize:11.5,color:T.sub,lineHeight:1.35}},'Blank page? This site may block apps.'),
      h('button',{onClick:switchView,style:{color:T.accent,fontWeight:600,fontSize:12.5}},'Smart view'),
      h('button',{onClick:()=>openExternalUrl(active.url),style:{color:T.accent,fontWeight:600,fontSize:12.5}},'Safari ↗'),
      h('button',{onClick:()=>setHideHint(x=>({...x,[active.id]:1})),style:{color:T.sub,display:'flex',padding:2}},Icons.x(14))):null,
    /* toolbar */
    h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-around',padding:'4px 6px calc(4px + '+SAFE_B+')',borderTop:'1px solid '+T.hair,background:T.bg}},
      tb(Icons.back(22),()=>ctl.back(activeId),!canBack,'Back'),
      tb(Icons.chevR(22),()=>ctl.forward(activeId),!canFwd,'Forward'),
      h('button',{onClick:()=>setSnap(snap&&snap!=='peek'?(running||run?'peek':null):'half'),className:'act95','aria-label':'Browser agent',style:{display:'flex',alignItems:'center',gap:7,height:38,padding:'0 15px',borderRadius:19,background:running?T.accent:T.fg,color:running?'#fff':T.bg,fontSize:14,fontWeight:650}},
        running?(run.status==='paused'?Icons.pause(14):h('span',{className:'spin',style:{width:14,height:14,borderRadius:'50%',border:'2px solid rgba(255,255,255,.4)',borderTopColor:'#fff',display:'inline-block'}})):Icons.ai(17),running?'Step '+Math.max(1,run.steps.filter(s=>!s.sys).length):'Agent'),
      h('button',{onClick:()=>setView(view==='tabs'?'page':'tabs'),'aria-label':'Tabs',className:'act90',style:Object.assign({},iconBtnS,{color:T.fg,position:'relative'})},BI.tabs(22),
        h('span',{style:{position:'absolute',top:13,left:0,right:0,textAlign:'center',fontSize:9.5,fontWeight:700,paddingLeft:3}},tabs.length)),
      tb(Icons.dots(22),()=>setSheet('menu'),false,'More')),
    snap&&!(snap==='peek'&&view==='tabs')?h(AgentPanel,{T,S,run,snap,setSnap,task,setTask,kb,hasPage:!!(active&&active.url),useCur,setUseCur,cfg,
      onStart:startTask,onPause:()=>runnerRef.current&&runnerRef.current.pause(),onResume:()=>runnerRef.current&&runnerRef.current.resume(),onStop:stopRun,
      onFollowUp:followUp,onContinue:continueRun,onNew:()=>{if(!runnerRef.current){setRun(null)}},onSettings:()=>setSheet('settings'),onHistory:()=>setSheet('runs'),
      onOpenLink:openLink,onSaveNote,toastFn,recent:runs,onOpenRun:openRun}):null,

    sheet==='menu'?h(Sheet,{T,onClose:()=>setSheet(null),z:95},
      active&&active.url?h(Fragment,null,
        h('div',{style:{padding:'6px 20px 10px',fontSize:13,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},active.title||active.url),
        h(ARow,{T,icon:Icons.download(21),label:'Save page to Instapaper',sub:'Download it for offline reading',onClick:async()=>{setSheet(null);const m=await onSaveUrl(active.url);if(m)toastFn(m)}}),
        h(ARow,{T,icon:Icons.globe(21),label:active.mode==='smart'?'Switch to Live view':'Switch to Smart view',sub:active.mode==='smart'?'The real site with scripts and your logins':'Always loads; works with the agent',onClick:()=>{setSheet(null);switchView()}}),
        active.mode==='smart'?h(ARow,{T,icon:BI.find(21),label:'Find on page',onClick:()=>setSheet('find')}):null,
        h(ARow,{T,icon:Icons.share(21),label:'Share',onClick:()=>{setSheet(null);shareText(active.title,'',active.url)}}),
        h(ARow,{T,icon:Icons.copy(21),label:'Copy link',onClick:()=>{setSheet(null);copyText(active.url);toastFn('Link copied')}}),
        h(ARow,{T,icon:Icons.external(21),label:'Open in Safari',onClick:()=>{setSheet(null);openExternalUrl(active.url)}})):null,
      h(ARow,{T,icon:Icons.plus(21),label:'New tab',onClick:()=>{setSheet(null);ctl.newTab('',{mode:S.browserView==='smart'?'smart':'live'})}}),
      h(ARow,{T,icon:Icons.ai(21),label:'Agent settings',sub:modelLabel(cfg),onClick:()=>setSheet('settings')}),
      h(ARow,{T,icon:BI.clock(21),label:'Agent history',onClick:()=>setSheet('runs')}),
      h(ARow,{T,icon:Icons.key(21),label:'Passwords',onClick:()=>setSheet('vault')})):null,
    sheet==='find'?h(Sheet,{T,onClose:()=>setSheet(null),title:'Find on page',z:95},
      h('div',{style:{display:'flex',gap:8,padding:'4px 20px 16px'}},
        h('input',{value:findQ,onChange:e=>setFindQ(e.target.value),autoFocus:true,enterKeyHint:'search',placeholder:'Text to find',onKeyDown:e=>{if(e.key==='Enter')findOnPage()},style:inputS(T)}),
        h('button',{onClick:findOnPage,className:'act95',style:{padding:'0 16px',borderRadius:10,background:T.fg,color:T.bg,fontWeight:600}},'Find'))):null,
    sheet==='settings'?h(AgentSettings,{T,S,set,onClose:()=>setSheet(null)}):null,
    sheet==='runs'?h(RunsSheet,{T,runs,onOpen:openRun,onClose:()=>setSheet(null),
      onDelete:id=>update(d=>({...d,agentRuns:(d.agentRuns||[]).filter(r=>r.id!==id)})),
      onClear:()=>{update(d=>({...d,agentRuns:[]}));setSheet(null)}}):null,
    sheet==='vault'?h(Sheet,{T,onClose:()=>setSheet(null),title:'Passwords',z:95},h('div',{style:{padding:'0 20px'}},h(VaultPanel,{T,vault,onChange:onChangeVault,session}))):null,
    sheet==='addSite'?h(AddSiteSheet,{T,onAdd:(name,url)=>{onSites(list=>list.concat([{id:uid(),name:name||domainOf(url),url}]));setSheet(null)},onClose:()=>setSheet(null)}):null,
    sheet==='confirmClose'?h(Sheet,{T,onClose:()=>setSheet(null),title:'The agent is still working'},
      h('div',{style:{padding:'2px 20px 4px',fontSize:14.5,color:T.meta,lineHeight:1.5}},'Closing the browser stops the agent. Its progress is kept in Agent history.'),
      h(PrimaryBtn,{T,label:'Stop agent and close',danger:true,onClick:()=>{stopRun();setSheet(null);onClose()}}),
      h('button',{onClick:()=>setSheet(null),className:'act98',style:{display:'block',width:'100%',padding:'14px',marginTop:4,color:T.meta,fontSize:15.5,fontWeight:500,textAlign:'center'}},'Keep browsing')):null);
}

function AddSiteSheet({T,onAdd,onClose}){
  const [name,setName]=useState('');const [url,setUrl]=useState('');
  const u=normalizeUrl(url);
  return h(Sheet,{T,onClose,title:'Add a site',z:95},
    h('div',{style:{padding:'0 20px 4px'}},
      h('input',{value:name,onChange:e=>setName(e.target.value),placeholder:'Name',style:Object.assign(inputS(T),{marginBottom:8})}),
      h('input',{value:url,onChange:e=>setUrl(e.target.value),placeholder:'https://…',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,onKeyDown:e=>{if(e.key==='Enter'&&u)onAdd(name.trim(),u)},style:inputS(T)})),
    h(PrimaryBtn,{T,label:'Add site',disabled:!u,onClick:()=>u&&onAdd(name.trim(),u)}));
}

function TabsGrid({T,tabs,activeId,onPick,onClose,onNew,onDone,onCloseAll}){
  return h('div',{className:'fdin',style:{position:'absolute',inset:0,zIndex:20,background:isDarkTheme(T.id)?'#0d0d0f':'#e9e9ee',display:'flex',flexDirection:'column'}},
    h('div',{className:'sy bu-scroll',style:{flex:1,padding:'14px 14px 20px'}},
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}},
        tabs.map(t=>h('div',{key:t.id,onClick:()=>onPick(t.id),className:'act98',style:{background:T.bg,borderRadius:14,overflow:'hidden',boxShadow:t.id===activeId?'0 0 0 2.5px '+T.accent:'0 2px 10px rgba(0,0,0,.12)',cursor:'pointer'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:6,padding:'8px 6px 8px 10px',borderBottom:'1px solid '+T.hair}},
            t.url?h('img',{src:faviconUrl(t.url),alt:'',style:{width:15,height:15,borderRadius:3,flexShrink:0},onError:e=>{e.target.style.display='none'}}):h('span',{style:{color:T.sub,display:'flex'}},Icons.home(14)),
            h('span',{style:{flex:1,minWidth:0,fontSize:12.5,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:T.fg}},t.title||(t.url?domainOf(t.url):'Start page')),
            h('button',{onClick:e=>{e.stopPropagation();onClose(t.id)},'aria-label':'Close tab',className:'act90',style:{color:T.sub,display:'flex',padding:4}},Icons.x(15))),
          h('div',{style:{height:118,padding:'10px 11px',display:'flex',flexDirection:'column',gap:6,color:T.sub,fontSize:11.5,lineHeight:1.4}},
            h('div',{style:{display:'flex',gap:6}},
              h('span',{style:{padding:'2px 6px',borderRadius:5,background:T.card,color:T.fg,fontWeight:700,fontSize:9.5,letterSpacing:'.03em'}},t.url?(t.mode==='smart'?'SMART':'LIVE'):'NEW'),
              h('span',{style:{padding:'2px 6px',borderRadius:5,background:T.card,fontSize:9.5,fontWeight:700}},'TAB '+t.n)),
            h('div',{style:{overflow:'hidden',display:'-webkit-box',WebkitLineClamp:4,WebkitBoxOrient:'vertical',wordBreak:'break-all'}},t.url||'Search, open your sites, or ask the agent.')))))),
    h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 16px',background:T.bg,borderTop:'1px solid '+T.hair}},
      h('button',{onClick:onCloseAll,style:{color:T.danger,fontSize:14.5,fontWeight:500}},'Close all'),
      h('button',{onClick:onNew,'aria-label':'New tab',className:'act90',style:Object.assign({},iconBtnS,{color:T.fg})},Icons.plus(24)),
      h('button',{onClick:onDone,style:{color:T.accent,fontSize:15,fontWeight:650}},'Done')));
}

window.InstaBrowser=BUBrowser;
/* exposed for tests / debugging */
window.InstaBrowserAgent={captureState,stateText,preparePage,parseResults,searchPageHtml,normActions,parseJSONLoose,systemPrompt,allowedHost,AgentRunner,llmCall,ACTIONS};
})();
