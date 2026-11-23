/* Instapaper — in-app viewer for YouTube, Instagram and X.
   Their full sites refuse to load inside other apps (X-Frame-Options), and Smart view can't run the
   scripts they're built from. What they DO allow inside other apps is their own embeds:
   - YouTube: the youtube-nocookie player for videos, shorts and playlists; search, channel and
     "up next" lists are read from YouTube's page data (ytInitialData) through the page fetchers
   - Instagram: post / reel embeds (and the profile embed where Instagram serves it)
   - X: post embeds and the profile timeline embed
   Anything needing your account (feeds, comments, DMs) still needs the real app or Safari.
   Loaded before browser.js; app.js globals (h, Icons, Spinner, fetchRawAcross…) are used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef}=React;

/* ============================== URL matching ============================== */
const RESERVED_IG=new Set(['explore','accounts','direct','reels','stories','about','developer','legal','p','reel','tv','web','challenge','emails','session','graphql','api','oauth']);
const RESERVED_X=new Set(['home','explore','search','i','notifications','messages','settings','login','logout','signup','compose','tos','privacy','hashtag','intent','share']);
function match(url){
  let u;try{u=new URL(url)}catch(e){return null}
  if(!/^https?:$/.test(u.protocol))return null;
  const host=u.hostname.toLowerCase().replace(/^(www|m|mobile)\./,'');
  const parts=u.pathname.split('/').filter(Boolean);
  if(host==='youtu.be'&&parts[0])return{kind:'yt',type:'video',id:parts[0].slice(0,11),t:u.searchParams.get('t')};
  if(/^(youtube\.com|music\.youtube\.com|youtube-nocookie\.com)$/.test(host)){
    const v=u.searchParams.get('v');
    if(u.pathname==='/watch'&&v)return{kind:'yt',type:'video',id:v.slice(0,11),t:u.searchParams.get('t'),list:u.searchParams.get('list')};
    if(/^(shorts|live|embed|v)$/.test(parts[0]||'')&&parts[1]&&parts[1]!=='videoseries')return{kind:'yt',type:'video',id:parts[1].slice(0,11),short:parts[0]==='shorts'};
    if(u.pathname==='/playlist'&&u.searchParams.get('list'))return{kind:'yt',type:'playlist',list:u.searchParams.get('list')};
    if(u.pathname==='/results')return{kind:'yt',type:'search',q:u.searchParams.get('search_query')||u.searchParams.get('q')||''};
    if(parts[0]&&(parts[0][0]==='@'||/^(channel|c|user)$/.test(parts[0])))return{kind:'yt',type:'channel',path:'/'+(parts[0][0]==='@'?parts[0]:parts.slice(0,2).join('/'))};
    return{kind:'yt',type:'home'};
  }
  if(host==='instagram.com'){
    if(/^(p|reel|reels|tv)$/.test(parts[0]||'')&&parts[1])return{kind:'ig',type:'post',code:parts[1],reel:parts[0]!=='p'};
    if(parts.length>=3&&/^(p|reel|tv)$/.test(parts[1]))return{kind:'ig',type:'post',code:parts[2],reel:parts[1]!=='p'};
    if(parts[0]&&!RESERVED_IG.has(parts[0])&&/^[\w.]{1,30}$/.test(parts[0]))return{kind:'ig',type:'profile',user:parts[0]};
    return{kind:'ig',type:'home'};
  }
  if(host==='x.com'||host==='twitter.com'){
    if(parts[1]==='status'&&/^\d+$/.test(parts[2]||''))return{kind:'x',type:'post',id:parts[2],user:parts[0]};
    if(parts[0]&&!RESERVED_X.has(parts[0].toLowerCase())&&/^\w{1,15}$/.test(parts[0]))return{kind:'x',type:'profile',user:parts[0]};
    return{kind:'x',type:'home'};
  }
  return null;
}
const enabled=()=>true;
const handles=url=>{const X=window.InstaShields;return!!match(url)&&(!X||X.inAppSite(url))};
const LABEL={yt:'YouTube',ig:'Instagram',x:'X'};
function titleFor(url){
  const m=match(url);if(!m)return'';
  if(m.kind==='yt')return m.type==='search'?(m.q+' — YouTube'):m.type==='channel'?m.path.slice(1)+' — YouTube':'YouTube';
  if(m.kind==='ig')return m.type==='profile'?'@'+m.user+' · Instagram':'Instagram';
  return m.type==='profile'?'@'+m.user+' · X':m.type==='post'?'Post · X':'X';
}

/* ============================== recents ============================== */
const RKEY='insta_social_recent';
const recents=()=>{try{return JSON.parse(localStorage.getItem(RKEY)||'[]')||[]}catch(e){return[]}};
function addRecent(item){
  try{const l=recents().filter(x=>x.url!==item.url);l.unshift(Object.assign({at:Date.now()},item));localStorage.setItem(RKEY,JSON.stringify(l.slice(0,60)))}catch(e){}
}

/* ============================== YouTube data ============================== */
function jsonAfter(html,name){
  const i=html.search(new RegExp('(?:var\\s+|window\\[["\']|\\b)'+name+'["\']?\\]?\\s*=\\s*\\{'));
  if(i<0)return null;
  const start=html.indexOf('{',i);let depth=0,inStr=false,esc=false;
  for(let k=start;k<html.length&&k<start+4e6;k++){
    const c=html[k];
    if(inStr){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inStr=false;continue}
    if(c==='"')inStr=true;else if(c==='{')depth++;else if(c==='}'){if(--depth===0){try{return JSON.parse(html.slice(start,k+1))}catch(e){return null}}}
  }
  return null;
}
const txt=t=>!t?'':typeof t==='string'?t:t.simpleText||t.content||(Array.isArray(t.runs)?t.runs.map(r=>r.text).join(''):'');
/* walk YouTube's page data and pull out every video it lists, whatever renderer it's in */
function videosIn(data,limit){
  const out=[];const seen=new Set();
  const push=v=>{if(v.id&&/^[\w-]{11}$/.test(v.id)&&!seen.has(v.id)&&v.title){seen.add(v.id);out.push(v)}};
  const walk=(o,d)=>{
    if(!o||typeof o!=='object'||d>40||out.length>=(limit||60))return;
    if(Array.isArray(o)){for(const x of o)walk(x,d+1);return}
    const r=o.videoRenderer||o.compactVideoRenderer||o.gridVideoRenderer||o.playlistVideoRenderer||o.videoWithContextRenderer||o.playlistPanelVideoRenderer;
    if(r&&r.videoId){
      push({id:r.videoId,title:txt(r.title)||txt(r.headline),channel:txt(r.ownerText||r.shortBylineText||r.longBylineText),
        len:txt(r.lengthText),views:txt(r.shortViewCountText||r.viewCountText),when:txt(r.publishedTimeText),
        channelUrl:chanUrl(r.ownerText||r.shortBylineText||r.longBylineText)});
    }
    if(o.lockupViewModel&&o.lockupViewModel.contentId&&/VIDEO/.test(o.lockupViewModel.contentType||'VIDEO')){
      const L=o.lockupViewModel;const md=L.metadata&&L.metadata.lockupMetadataViewModel||{};
      const rows=(((md.metadata||{}).contentMetadataViewModel||{}).metadataRows||[]).map(r=>(r.metadataParts||[]).map(p=>txt(p.text)).filter(Boolean));
      let len='';try{JSON.stringify(L.contentImage).replace(/"text":"(\d{1,2}(?::\d\d){1,2})"/,(m,a)=>{len=a;return m})}catch(e){}
      push({id:L.contentId,title:txt(md.title),channel:(rows[0]||[])[0]||'',views:(rows[1]||[]).join(' · '),len});
    }
    if(o.shortsLockupViewModel){
      const S=o.shortsLockupViewModel;let id='';
      try{id=S.onTap.innertubeCommand.reelWatchEndpoint.videoId}catch(e){}
      if(!id){const m=/"videoId":"([\w-]{11})"/.exec(JSON.stringify(S));if(m)id=m[1]}
      push({id,title:txt(S.overlayMetadata&&S.overlayMetadata.primaryText)||txt(S.accessibilityText),views:txt(S.overlayMetadata&&S.overlayMetadata.secondaryText),short:true});
    }
    if(o.reelItemRenderer&&o.reelItemRenderer.videoId){const R=o.reelItemRenderer;push({id:R.videoId,title:txt(R.headline),views:txt(R.viewCountText),short:true})}
    for(const k in o)if(o[k]&&typeof o[k]==='object')walk(o[k],d+1);
  };
  walk(data,0);
  return out;
}
function chanUrl(t){
  try{const run=(t.runs||[])[0];const ep=run.navigationEndpoint;const u=(ep.commandMetadata.webCommandMetadata.url)||(ep.browseEndpoint.canonicalBaseUrl);return u?'https://www.youtube.com'+u:''}catch(e){return''}
}
/* ---------- sources ----------
   YouTube's own pages through the public page fetchers are big (~1 MB) and often refused, so every
   lookup races them against public Invidious and Piped mirrors (open JSON APIs). The first source
   with results wins; the one that worked is remembered and tried first next time. */
const ytFetch=url=>fetchRawAcross(url+(url.includes('?')?'&':'?')+'hl=en&gl=IN&ucbcb=1',t=>t.includes('ytInitialData')||t.includes('ytInitialPlayerResponse'),15000);
const INV_DEFAULT=['https://inv.nadeko.net','https://invidious.nerdvpn.de','https://yewtu.be','https://invidious.f5.si','https://iv.melmac.space','https://invidious.privacyredirect.com','https://inv.tux.pizza'];
const PIPED_DEFAULT=['https://pipedapi.kavin.rocks','https://api.piped.private.coffee','https://pipedapi.adminforge.de','https://pipedapi.r4fo.com'];
const SRC_KEY='insta_yt_sources';
const srcState=()=>{try{return JSON.parse(localStorage.getItem(SRC_KEY)||'{}')||{}}catch(e){return{}}};
function saveSrc(p){try{localStorage.setItem(SRC_KEY,JSON.stringify(Object.assign(srcState(),p)))}catch(e){}}
let instLoad=null;
function invInstances(){
  if(instLoad)return instLoad;
  const st=srcState();
  instLoad=(async()=>{
    if(st.inv&&Date.now()-(st.invAt||0)<86400000)return st.inv;
    try{
      const r=await fetchWithTimeout('https://api.invidious.io/instances.json?sort_by=health',{},6000);
      const j=await r.json();
      const list=j.filter(x=>x[1]&&x[1].api&&x[1].type==='https').map(x=>x[1].uri.replace(/\/$/,'')).slice(0,8);
      if(list.length){saveSrc({inv:list,invAt:Date.now()});return list}
    }catch(e){}
    return INV_DEFAULT;
  })();
  return instLoad;
}
const fmtLen=s=>{s=Number(s)||0;if(!s)return'';const hh=Math.floor(s/3600),mm=Math.floor(s%3600/60),ss=s%60;return(hh?hh+':'+String(mm).padStart(2,'0'):mm)+':'+String(ss).padStart(2,'0')};
const fmtViews=n=>{n=Number(n);if(!isFinite(n)||n<0)return'';return(n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':n)+' views'};
const invV=v=>({id:v.videoId,title:v.title,channel:v.author,channelUrl:v.authorId?'https://www.youtube.com/channel/'+v.authorId:'',len:v.liveNow?'LIVE':fmtLen(v.lengthSeconds),views:v.viewCountText||fmtViews(v.viewCount),when:v.publishedText||''});
const pipedId=u=>{const m=/[?&]v=([\w-]{11})/.exec(u||'')||/\/shorts\/([\w-]{11})/.exec(u||'');return m?m[1]:''};
const pipedV=v=>({id:pipedId(v.url),title:v.title,channel:v.uploaderName,channelUrl:v.uploaderUrl?'https://www.youtube.com'+v.uploaderUrl:'',len:v.duration>0?fmtLen(v.duration):'',views:fmtViews(v.views),when:v.uploadedDate||'',short:!!v.isShort});
async function getJSON(u,ms){const r=await fetchWithTimeout(u,{},ms||9000);if(!r.ok)throw new Error(r.status);return r.json()}
/* run every source; the first that returns something usable wins */
function race(sources,usable,ms){
  return new Promise((resolve,reject)=>{
    let left=sources.length,done=false,lastErr=null;
    const pref=srcState().best||'';
    sources.sort((a,b)=>(b.id===pref)-(a.id===pref));
    const timer=setTimeout(()=>{if(!done){done=true;reject(new Error('timed out'))}},ms||25000);
    sources.forEach((src,i)=>setTimeout(()=>{
      if(done){left--;return}
      src.run().then(r=>{if(done)return;if(usable(r)){done=true;clearTimeout(timer);saveSrc({best:src.id});resolve(r)}else throw new Error('empty')})
        .catch(e=>{lastErr=e}).then(()=>{if(--left===0&&!done){done=true;clearTimeout(timer);reject(lastErr||new Error('no source answered'))}});
    },i<5?0:Math.min(6000,(i-4)*900)));
  });
}
async function sourcesFor(build){
  const inv=await invInstances();
  const out=[{id:'yt',run:build.yt}];
  inv.forEach(b=>build.inv&&out.push({id:'inv:'+b,run:()=>build.inv(b)}));
  PIPED_DEFAULT.forEach(b=>build.piped&&out.push({id:'piped:'+b,run:()=>build.piped(b)}));
  return out;
}
const cache=new Map();
function cached(key,fn){if(cache.has(key))return cache.get(key);const p=fn().catch(e=>{cache.delete(key);throw e});cache.set(key,p);return p}
const dropCache=key=>cache.delete(key);
const hasList=r=>Array.isArray(r)&&r.length>0;
function ytSearch(q){return cached('s:'+q,async()=>race(await sourcesFor({
  yt:async()=>videosIn(jsonAfter(await ytFetch('https://www.youtube.com/results?search_query='+encodeURIComponent(q)),'ytInitialData'),40),
  inv:async b=>(await getJSON(b+'/api/v1/search?type=video&region=IN&q='+encodeURIComponent(q))).filter(v=>v.videoId).map(invV),
  piped:async b=>((await getJSON(b+'/search?filter=videos&q='+encodeURIComponent(q))).items||[]).filter(v=>pipedId(v.url)).map(pipedV)
}),hasList))}
function ytVideo(id){return cached('v:'+id,async()=>race(await sourcesFor({
  yt:async()=>{
    const html=await ytFetch('https://www.youtube.com/watch?v='+id);
    const pr=jsonAfter(html,'ytInitialPlayerResponse')||{};const vd=pr.videoDetails||{};
    const mf=(pr.microformat||{}).playerMicroformatRenderer||{};
    const d=jsonAfter(html,'ytInitialData')||{};
    let related=[];try{related=videosIn(d.contents.twoColumnWatchNextResults.secondaryResults,30)}catch(e){}
    if(!related.length)related=videosIn(d,30);
    return{title:vd.title||'',author:vd.author||'',channelId:vd.channelId||'',desc:vd.shortDescription||'',views:vd.viewCount?Number(vd.viewCount).toLocaleString()+' views':'',date:mf.publishDate||'',related:related.filter(v=>v.id!==id)};
  },
  inv:async b=>{const v=await getJSON(b+'/api/v1/videos/'+id+'?region=IN');
    return{title:v.title,author:v.author,channelId:v.authorId,desc:v.description||'',views:v.viewCount?Number(v.viewCount).toLocaleString()+' views':'',date:v.publishedText||'',related:(v.recommendedVideos||[]).map(invV).filter(x=>x.id&&x.id!==id)}},
  piped:async b=>{const v=await getJSON(b+'/streams/'+id);
    const desc=String(v.description||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    return{title:v.title,author:v.uploader,channelId:String(v.uploaderUrl||'').replace('/channel/',''),desc,views:fmtViews(v.views),date:v.uploadDate||'',related:(v.relatedStreams||[]).filter(x=>x.type!=='playlist'&&x.type!=='channel').map(pipedV).filter(x=>x.id&&x.id!==id)}}
}),r=>r&&r.title))}
function ytChannel(path){return cached('c:'+path,async()=>race(await sourcesFor({
  yt:async()=>{
    const html=await ytFetch('https://www.youtube.com'+path+'/videos');
    const d=jsonAfter(html,'ytInitialData')||{};
    let name='',avatar='',subs='';
    try{const m=d.metadata.channelMetadataRenderer;name=m.title;avatar=(m.avatar.thumbnails.slice(-1)[0]||{}).url}catch(e){}
    try{const hd=JSON.stringify(d.header||{});const sm=/"content":"([^"]*subscribers[^"]*)"/.exec(hd)||/"simpleText":"([^"]*subscribers[^"]*)"/.exec(hd);if(sm)subs=sm[1]}catch(e){}
    return{name,avatar,subs,videos:videosIn(d,60)};
  },
  inv:async b=>{
    let ucid=/^\/channel\/(UC[\w-]{20,})/.exec(path);ucid=ucid&&ucid[1];
    if(!ucid){const r=await getJSON(b+'/api/v1/resolveurl?url='+encodeURIComponent('https://www.youtube.com'+path));ucid=r.ucid}
    const c=await getJSON(b+'/api/v1/channels/'+ucid);
    let vids=c.latestVideos||[];
    if(!vids.length){try{const v=await getJSON(b+'/api/v1/channels/'+ucid+'/videos');vids=Array.isArray(v)?v:(v.videos||[])}catch(e){}}
    const av=(c.authorThumbnails||[]).slice(-1)[0];
    return{name:c.author,avatar:av&&av.url&&(av.url.startsWith('//')?'https:'+av.url:av.url),subs:c.subCount?fmtViews(c.subCount).replace('views','subscribers'):'',videos:vids.map(invV)};
  },
  piped:async b=>{const c=await getJSON(b+path.replace(/^\/(user|c)\//,'/$1/'));
    return{name:c.name,avatar:c.avatarUrl,subs:c.subscriberCount>0?fmtViews(c.subscriberCount).replace('views','subscribers'):'',videos:(c.relatedStreams||[]).map(pipedV).filter(x=>x.id)}}
}),r=>r&&hasList(r.videos)))}
function ytPlaylist(list){return cached('p:'+list,async()=>race(await sourcesFor({
  yt:async()=>{const html=await ytFetch('https://www.youtube.com/playlist?list='+encodeURIComponent(list));const d=jsonAfter(html,'ytInitialData')||{};let title='';try{title=d.metadata.playlistMetadataRenderer.title}catch(e){}return{title,videos:videosIn(d,100)}},
  inv:async b=>{const p=await getJSON(b+'/api/v1/playlists/'+encodeURIComponent(list));return{title:p.title,videos:(p.videos||[]).map(invV)}},
  piped:async b=>{const p=await getJSON(b+'/playlists/'+encodeURIComponent(list));return{title:p.name,videos:(p.relatedStreams||[]).map(pipedV).filter(x=>x.id)}}
}),r=>r&&hasList(r.videos)))}
async function oembedTitle(url){
  try{const r=await fetchWithTimeout('https://noembed.com/embed?url='+encodeURIComponent(url),{},9000);const j=await r.json();return{title:j.title||'',author:j.author_name||''}}catch(e){return{}}
}

/* ============================== UI ============================== */
const watchUrl=id=>'https://www.youtube.com/watch?v='+id;
const thumb=id=>'https://i.ytimg.com/vi/'+id+'/mqdefault.jpg';
function useLoad(fn,deps,key){
  const [st,setSt]=useState({loading:true,data:null,err:'',slow:false});
  const [n,setN]=useState(0);
  useEffect(()=>{let live=true;setSt({loading:true,data:null,err:'',slow:false});
    const t=setTimeout(()=>{if(live)setSt(x=>x.loading?Object.assign({},x,{slow:true}):x)},6000);
    fn().then(data=>{if(live)setSt({loading:false,data,err:'',slow:false})},e=>{if(live)setSt({loading:false,data:null,err:String(e&&e.message||e),slow:false})}).then(()=>clearTimeout(t));
    return()=>{live=false;clearTimeout(t)}},deps.concat([n]));
  st.retry=()=>{if(key)dropCache(key);setN(x=>x+1)};
  return st;
}
function Pill({T,children,onClick,primary}){
  return h('button',{onClick,className:'act95',style:{padding:'8px 13px',borderRadius:18,background:primary?T.fg:T.card,color:primary?T.bg:T.fg,fontSize:13,fontWeight:600,whiteSpace:'nowrap',flexShrink:0}},children);
}
function Note({T,children}){return h('div',{style:{fontSize:12.5,color:T.sub,lineHeight:1.5,margin:'10px 0'}},children)}
function Loading({T,label}){return h('div',{style:{display:'flex',alignItems:'center',gap:10,color:T.sub,fontSize:13.5,padding:'22px 2px'}},h(Spinner,{T,size:16}),label||'Loading…')}
function SearchBar({T,placeholder,initial,onSearch}){
  const [q,setQ]=useState(initial||'');
  return h('form',{onSubmit:e=>{e.preventDefault();const v=q.trim();if(v){onSearch(v);try{document.activeElement.blur()}catch(err){}}},style:{display:'flex',gap:8,margin:'2px 0 12px'}},
    h('input',{value:q,onChange:e=>setQ(e.target.value),placeholder,enterKeyHint:'search',autoCapitalize:'none',autoCorrect:'off',
      style:{flex:1,minWidth:0,padding:'10px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16}}),
    h('button',{type:'submit',className:'act95',style:{padding:'0 15px',borderRadius:10,background:T.fg,color:T.bg,fontWeight:600,fontSize:14.5}},'Search'));
}
function VideoRow({T,v,onNav}){
  return h('button',{onClick:()=>onNav(v.short?'https://www.youtube.com/shorts/'+v.id:watchUrl(v.id)),className:'act98',style:{display:'flex',gap:11,width:'100%',textAlign:'left',padding:'8px 0',color:T.fg}},
    h('span',{style:{position:'relative',width:150,height:84,borderRadius:9,overflow:'hidden',background:T.card,flexShrink:0}},
      h('img',{src:thumb(v.id),alt:'',loading:'lazy',style:{width:'100%',height:'100%',objectFit:'cover'}}),
      v.len||v.short?h('span',{style:{position:'absolute',right:5,bottom:5,background:'rgba(0,0,0,.8)',color:'#fff',fontSize:10.5,fontWeight:600,padding:'1px 5px',borderRadius:4}},v.short?'SHORT':v.len):null),
    h('span',{style:{flex:1,minWidth:0}},
      h('span',{style:{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',fontSize:14,fontWeight:600,lineHeight:1.3}},v.title),
      h('span',{style:{display:'block',fontSize:12,color:T.sub,marginTop:4,lineHeight:1.35}},[v.channel,v.views,v.when].filter(Boolean).join(' · '))));
}
function Actions({T,url,onSaveUrl,toastFn,label}){
  const clean=window.InstaShields?window.InstaShields.shareUrl(url):url;
  return h('div',{className:'sx',style:{display:'flex',gap:8,overflowX:'auto',padding:'10px 0 4px'}},
    onSaveUrl?h(Pill,{T,primary:true,onClick:async()=>{const m=await onSaveUrl(clean);if(m&&toastFn)toastFn(m)}},'＋ Save'):null,
    h(Pill,{T,onClick:()=>shareText('','',clean)},'Share'),
    h(Pill,{T,onClick:()=>{copyText(clean);toastFn&&toastFn('Link copied')}},'Copy link'),
    h(Pill,{T,onClick:()=>openExternalUrl(clean)},'Open in '+(label||'app')+' ↗'));
}
function RecentList({T,kind,onNav,title}){
  const l=recents().filter(x=>x.kind===kind).slice(0,20);
  if(!l.length)return null;
  return h(Fragment,null,
    h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'16px 0 4px'}},title||'Recently opened'),
    l.map(x=>h('button',{key:x.url,onClick:()=>onNav(x.url),className:'act98',style:{display:'flex',alignItems:'center',gap:10,width:'100%',textAlign:'left',padding:'9px 0',borderBottom:'1px solid '+T.hair,color:T.fg}},
      x.thumb?h('img',{src:x.thumb,alt:'',style:{width:56,height:32,objectFit:'cover',borderRadius:5,flexShrink:0}}):null,
      h('span',{style:{flex:1,minWidth:0,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},x.title||x.url))));
}
/* embeds that report their height by postMessage (Instagram, X) */
function AutoFrame({src,minH,host,title,T}){
  const ref=useRef(null);const [hgt,setH]=useState(minH||560);
  useEffect(()=>{
    const f=e=>{
      if(!ref.current||e.source!==ref.current.contentWindow)return;
      let d=e.data;if(typeof d==='string'){try{d=JSON.parse(d)}catch(err){return}}
      let n=0;
      try{if(d&&d.type==='MEASURE')n=d.details.height}catch(err){}
      try{const t=d&&d['twttr.embed'];if(t&&/resize/.test(t.method))n=t.params[0].height}catch(err){}
      if(n>100)setH(Math.min(Math.ceil(n)+8,6000));
    };
    window.addEventListener('message',f);return()=>window.removeEventListener('message',f);
  },[]);
  return h('iframe',{ref,src,title,allow:'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write',allowFullScreen:true,referrerPolicy:'strict-origin-when-cross-origin',
    style:{width:'100%',height:hgt,border:0,borderRadius:12,background:T.card,display:'block'}});
}

/* ---------- YouTube ---------- */
function YouTube({T,m,url,onNav,onSaveUrl,toastFn,onTitle}){
  const search=q=>onNav('https://www.youtube.com/results?search_query='+encodeURIComponent(q));
  const top=h(SearchBar,{T,placeholder:'Search YouTube',initial:m.type==='search'?m.q:'',onSearch:search,key:'sb'+(m.q||'')});
  if(m.type==='video')return h(YtVideo,{T,m,url,onNav,onSaveUrl,toastFn,onTitle,top});
  if(m.type==='search')return h(Fragment,null,top,h(YtList,{T,load:()=>ytSearch(m.q),deps:[m.q],ckey:'s:'+m.q,url,onNav,empty:'No results — try other words.'}));
  if(m.type==='channel')return h(Fragment,null,top,h(YtChannel,{T,m,url,onNav,onSaveUrl,toastFn,onTitle}));
  if(m.type==='playlist')return h(Fragment,null,top,h(YtPlaylist,{T,m,url,onNav,onSaveUrl,toastFn,onTitle}));
  return h(Fragment,null,
    h('div',{style:{fontSize:22,fontWeight:750,margin:'4px 0 12px'}},'YouTube'),top,
    h(Note,{T},'Videos play right here in YouTube’s privacy-enhanced player. Your home feed, subscriptions and comments need your account, so they only work in the YouTube app or Safari.'),
    h(RecentList,{T,kind:'yt',onNav,title:'Recently watched'}));
}
function YtList({T,load,deps,onNav,empty,ckey,url}){
  const st=useLoad(load,deps,ckey);
  if(st.loading)return h(Loading,{T,label:st.slow?'Still loading — trying other sources…':'Loading from YouTube…'});
  if(st.err||!st.data)return h(Failed,{T,retry:st.retry,url});
  if(!st.data.length)return h(Note,{T},empty);
  return h('div',null,st.data.map(v=>h(VideoRow,{key:v.id,T,v,onNav})));
}
function Failed({T,retry,url}){
  return h('div',{style:{padding:'14px 0'}},
    h(Note,{T},'Couldn’t reach YouTube right now — the free servers this uses are busy or blocked. Videos still play; lists like this one need those servers.'),
    h('div',{style:{display:'flex',gap:8}},h(Pill,{T,primary:true,onClick:retry},'Try again'),url?h(Pill,{T,onClick:()=>openExternalUrl(url)},'Open in Safari ↗'):null));
}
function YtVideo({T,m,url,onNav,onSaveUrl,toastFn,onTitle,top}){
  const st=useLoad(()=>ytVideo(m.id),[m.id],'v:'+m.id);
  const [more,setMore]=useState(false);
  const [lite,setLite]=useState({});
  useEffect(()=>{oembedTitle(watchUrl(m.id)).then(setLite)},[m.id]);
  const d=st.data||{};const title=d.title||lite.title||'';
  useEffect(()=>{if(title){onTitle&&onTitle(title+' — YouTube');addRecent({kind:'yt',url:watchUrl(m.id),title,thumb:thumb(m.id)})}},[title]);
  const start=m.t?'&start='+parseInt(String(m.t).replace(/s$/,''),10):'';
  const src='https://www.youtube-nocookie.com/embed/'+m.id+'?playsinline=1&rel=0&modestbranding=1&autoplay=1'+start+(m.list?'&list='+encodeURIComponent(m.list):'');
  return h(Fragment,null,
    h('div',{style:{position:'relative',width:'calc(100% + 32px)',margin:'-14px -16px 0',paddingTop:m.short?'min(160%, 72vh)':'56.25%',background:'#000'}},
      h('iframe',{key:m.id,src,title:title||'YouTube video',allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',allowFullScreen:true,referrerPolicy:'strict-origin-when-cross-origin',
        style:{position:'absolute',inset:0,width:'100%',height:'100%',border:0}})),
    h('div',{style:{fontSize:17,fontWeight:700,lineHeight:1.3,marginTop:12}},title||(st.loading?'':'YouTube video')),
    h('div',{style:{fontSize:12.5,color:T.sub,marginTop:4}},[d.views,d.date].filter(Boolean).join(' · ')),
    (d.author||lite.author)?h('button',{onClick:()=>d.channelId&&onNav('https://www.youtube.com/channel/'+d.channelId),className:'act98',style:{display:'flex',alignItems:'center',gap:8,marginTop:10,color:T.fg,fontSize:14.5,fontWeight:650}},
      h('span',{style:{width:30,height:30,borderRadius:15,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}},(d.author||lite.author||'?')[0]),d.author||lite.author,d.channelId?h('span',{style:{color:T.sub,fontWeight:400}},' ›'):null):null,
    h(Actions,{T,url:watchUrl(m.id),onSaveUrl,toastFn,label:'YouTube'}),
    d.desc?h('div',{onClick:()=>setMore(v=>!v),style:{background:T.card,borderRadius:12,padding:'10px 12px',marginTop:8,fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word',
      maxHeight:more?'none':84,overflow:'hidden',position:'relative',cursor:'pointer'}},d.desc,more?null:h('span',{style:{position:'absolute',right:10,bottom:6,background:T.card,color:T.accent,fontWeight:600,paddingLeft:6}},'…more')):null,
    h('div',{style:{marginTop:14}},top),
    st.loading?h(Loading,{T,label:st.slow?'Still loading — trying other sources…':'Loading up next…'}):st.err?h(Failed,{T,retry:st.retry}):d.related&&d.related.length?h(Fragment,null,
      h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'2px 0 4px'}},'Up next'),
      d.related.map(v=>h(VideoRow,{key:v.id,T,v,onNav}))):null);
}
function YtChannel({T,m,url,onNav,onSaveUrl,toastFn,onTitle}){
  const st=useLoad(()=>ytChannel(m.path),[m.path],'c:'+m.path);
  const d=st.data||{};
  useEffect(()=>{if(d.name){onTitle&&onTitle(d.name+' — YouTube');addRecent({kind:'yt',url:'https://www.youtube.com'+m.path,title:d.name,thumb:d.avatar})}},[d.name]);
  return h(Fragment,null,
    h('div',{style:{display:'flex',alignItems:'center',gap:12,margin:'2px 0 4px'}},
      d.avatar?h('img',{src:d.avatar,alt:'',style:{width:54,height:54,borderRadius:27}}):null,
      h('div',null,h('div',{style:{fontSize:19,fontWeight:750}},d.name||m.path.slice(1)),d.subs?h('div',{style:{fontSize:12.5,color:T.sub}},d.subs):null)),
    h(Actions,{T,url:'https://www.youtube.com'+m.path,onSaveUrl:null,toastFn,label:'YouTube'}),
    st.loading?h(Loading,{T,label:st.slow?'Still loading — trying other sources…':'Loading videos…'}):st.err?h(Failed,{T,retry:st.retry,url:'https://www.youtube.com'+m.path}):
      (d.videos||[]).length?d.videos.map(v=>h(VideoRow,{key:v.id,T,v,onNav})):h(Note,{T},'No videos found.'));
}
function YtPlaylist({T,m,url,onNav,onSaveUrl,toastFn,onTitle}){
  const st=useLoad(()=>ytPlaylist(m.list),[m.list],'p:'+m.list);const d=st.data||{};
  useEffect(()=>{if(d.title)onTitle&&onTitle(d.title+' — YouTube')},[d.title]);
  return h(Fragment,null,
    h('div',{style:{position:'relative',width:'100%',paddingTop:'56.25%',background:'#000',borderRadius:12,overflow:'hidden'}},
      h('iframe',{src:'https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(m.list)+'&playsinline=1&rel=0',title:'Playlist',allow:'autoplay; encrypted-media; picture-in-picture; fullscreen',allowFullScreen:true,referrerPolicy:'strict-origin-when-cross-origin',style:{position:'absolute',inset:0,width:'100%',height:'100%',border:0}})),
    h('div',{style:{fontSize:17,fontWeight:700,marginTop:12}},d.title||'Playlist'),
    h(Actions,{T,url,onSaveUrl:null,toastFn,label:'YouTube'}),
    st.loading?h(Loading,{T}):(d.videos||[]).map((v,i)=>h(VideoRow,{key:v.id+i,T,v:Object.assign({},v,{}),onNav:()=>onNav(watchUrl(v.id)+'&list='+encodeURIComponent(m.list))})));
}

/* ---------- Instagram ---------- */
function PasteBox({T,placeholder,onGo,hint}){
  const [v,setV]=useState('');
  const go=()=>{const u=normalizeUrl(v.trim());if(u)onGo(u)};
  return h('div',null,
    h('div',{style:{display:'flex',gap:8,margin:'2px 0 4px'}},
      h('input',{value:v,onChange:e=>setV(e.target.value),placeholder,enterKeyHint:'go',autoCapitalize:'none',autoCorrect:'off',onKeyDown:e=>{if(e.key==='Enter')go()},
        style:{flex:1,minWidth:0,padding:'10px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16}}),
      h('button',{onClick:async()=>{try{const t=await navigator.clipboard.readText();const u=extractUrl(t);if(u){setV(u);onGo(u)}}catch(e){}},className:'act95',style:{padding:'0 13px',borderRadius:10,background:T.card,color:T.fg,fontWeight:600,fontSize:14}},'Paste'),
      h('button',{onClick:go,className:'act95',style:{padding:'0 15px',borderRadius:10,background:T.fg,color:T.bg,fontWeight:600,fontSize:14}},'Open')),
    hint?h(Note,{T},hint):null);
}
const extractUrl=t=>{const m=/https?:\/\/\S+/.exec(String(t||''));return m?m[0]:''};
function Instagram({T,m,url,onNav,onSaveUrl,toastFn,onTitle}){
  const [fail,setFail]=useState(false);
  useEffect(()=>{
    if(m.type==='post'){onTitle&&onTitle((m.reel?'Reel':'Post')+' · Instagram');addRecent({kind:'ig',url,title:(m.reel?'Reel ':'Post ')+m.code})}
    if(m.type==='profile'){onTitle&&onTitle('@'+m.user+' · Instagram');addRecent({kind:'ig',url:'https://www.instagram.com/'+m.user+'/',title:'@'+m.user})}
  },[url]);
  const paste=h(PasteBox,{T,placeholder:'Instagram link or @username',onGo:u=>onNav(u)});
  if(m.type==='post')return h(Fragment,null,
    h(AutoFrame,{T,key:m.code,src:'https://www.instagram.com/'+(m.reel?'reel':'p')+'/'+m.code+'/embed/captioned/',minH:620,title:'Instagram post'}),
    h(Actions,{T,url:'https://www.instagram.com/'+(m.reel?'reel':'p')+'/'+m.code+'/',onSaveUrl,toastFn,label:'Instagram'}),
    h(Note,{T},'Private posts and stories can’t be shown outside Instagram.'),
    h('div',{style:{marginTop:10}},paste),h(RecentList,{T,kind:'ig',onNav}));
  if(m.type==='profile')return h(Fragment,null,
    h('div',{style:{fontSize:19,fontWeight:750,margin:'2px 0 8px'}},'@'+m.user),
    h(AutoFrame,{T,key:m.user,src:'https://www.instagram.com/'+encodeURIComponent(m.user)+'/embed/',minH:700,title:'Instagram profile'}),
    h(Actions,{T,url:'https://www.instagram.com/'+m.user+'/',onSaveUrl:null,toastFn,label:'Instagram'}),
    h(Note,{T},'Instagram shows a preview of public profiles here. Tap a post to open it in this viewer, or use the Instagram app for the full profile. Blank? Instagram may be limiting profiles outside the app right now — open a post link instead.'),
    h('div',{style:{marginTop:6}},paste),h(RecentList,{T,kind:'ig',onNav}));
  return h(Fragment,null,
    h('div',{style:{fontSize:22,fontWeight:750,margin:'4px 0 12px'}},'Instagram'),paste,
    h(Note,{T},'Open any post, reel or public profile link here — share it from Instagram with “Copy link” and tap Paste. Your feed, stories and messages need your account, so they only work in the Instagram app.'),
    h(RecentList,{T,kind:'ig',onNav}));
}

/* ---------- X ---------- */
function XView({T,m,url,onNav,onSaveUrl,toastFn,onTitle}){
  const theme=typeof isDarkTheme==='function'&&isDarkTheme(T.id)?'dark':'light';
  useEffect(()=>{
    if(m.type==='post'){onTitle&&onTitle('Post by @'+m.user+' · X');addRecent({kind:'x',url,title:'@'+m.user+' · post'})}
    if(m.type==='profile'){onTitle&&onTitle('@'+m.user+' · X');addRecent({kind:'x',url:'https://x.com/'+m.user,title:'@'+m.user})}
  },[url]);
  const paste=h(PasteBox,{T,placeholder:'X link or @username',onGo:u=>onNav(u)});
  const user=h('form',{onSubmit:e=>{e.preventDefault();const v=e.target.elements.u.value.trim().replace(/^@/,'');if(v)onNav('https://x.com/'+v)},style:{display:'flex',gap:8,margin:'8px 0'}},
    h('input',{name:'u',placeholder:'@username',autoCapitalize:'none',autoCorrect:'off',style:{flex:1,minWidth:0,padding:'10px 12px',borderRadius:10,border:'1px solid '+T.hair,background:T.search,color:T.fg,fontSize:16}}),
    h('button',{type:'submit',className:'act95',style:{padding:'0 15px',borderRadius:10,background:T.fg,color:T.bg,fontWeight:600,fontSize:14}},'View posts'));
  if(m.type==='post')return h(Fragment,null,
    h(AutoFrame,{T,key:m.id,src:'https://platform.twitter.com/embed/Tweet.html?id='+m.id+'&theme='+theme+'&dnt=true&lang=en',minH:420,title:'Post on X'}),
    h(Actions,{T,url:'https://x.com/'+m.user+'/status/'+m.id,onSaveUrl,toastFn,label:'X'}),
    h('button',{onClick:()=>onNav('https://x.com/'+m.user),className:'act98',style:{color:T.accent,fontSize:14,fontWeight:600,padding:'8px 0'}},'More from @'+m.user+' ›'),
    h('div',{style:{marginTop:6}},paste),h(RecentList,{T,kind:'x',onNav}));
  if(m.type==='profile')return h(Fragment,null,
    h('div',{style:{fontSize:19,fontWeight:750,margin:'2px 0 8px'}},'@'+m.user),
    h(Actions,{T,url:'https://x.com/'+m.user,onSaveUrl:null,toastFn,label:'X'}),
    h('iframe',{key:m.user,src:'https://syndication.twitter.com/srv/timeline-profile/screen-name/'+encodeURIComponent(m.user)+'?dnt=true&theme='+theme+'&lang=en',title:'Posts by @'+m.user,referrerPolicy:'strict-origin-when-cross-origin',
      style:{width:'100%',height:'72vh',border:0,borderRadius:12,background:T.card,display:'block',marginTop:6}}),
    h(Note,{T},'X shows recent posts by public accounts here (it sometimes shows only the most popular ones). Replies, search and your timeline need your account.'),
    paste,h(RecentList,{T,kind:'x',onNav}));
  return h(Fragment,null,
    h('div',{style:{fontSize:22,fontWeight:750,margin:'4px 0 12px'}},'X'),user,paste,
    h(Note,{T},'Open any post or public profile here. Your timeline, search and messages need your account, so they only work in the X app.'),
    h(RecentList,{T,kind:'x',onNav}));
}

function View({T,url,onNav,onSaveUrl,toastFn,onTitle}){
  const m=match(url);
  const body=!m?null:m.kind==='yt'?h(YouTube,{T,m,url,onNav,onSaveUrl,toastFn,onTitle}):m.kind==='ig'?h(Instagram,{T,m,url,onNav,onSaveUrl,toastFn,onTitle}):h(XView,{T,m,url,onNav,onSaveUrl,toastFn,onTitle});
  return h('div',{className:'sy bu-scroll',style:{position:'absolute',inset:0,overflowY:'auto',padding:'14px 16px 40px',background:T.bg,color:T.fg,fontFamily:UIF}},body);
}

window.InstaSocial={match,handles,enabled,titleFor,label:k=>LABEL[k]||'',View,ytSearch,ytVideo,ytChannel,videosIn,jsonAfter};
})();
