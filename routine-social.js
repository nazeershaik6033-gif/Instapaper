/* Instapaper — My Routine › Social: social-app updates in an Instagram-style form
   - Feed cards for photo and text posts (avatar ring when new · picture · actions · caption with "more")
   - Video posts (Instagram reels, X / Telegram videos) open a full-screen Reels viewer: swipe up for the
     next one, actions down the right side, account + caption at the bottom
   - 💬 caption & your private notes · ➤ share · ✓ done · ⋯ About this post (AI summary, ask, open, save, copy)
   Instagram's own likes/comments need your account, so the actions work inside this app.
   Loaded before app.js; app.js globals (h, Icons, Sheet, aiChat, shareText, openExternalUrl…) are used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef,useMemo}=React;

const PLAT={
  instagram:{label:'Instagram',c:'#d6249f'},x:{label:'X',c:'#111'},threads:{label:'Threads',c:'#101010'},bluesky:{label:'Bluesky',c:'#1185fe'},
  mastodon:{label:'Mastodon',c:'#6364ff'},reddit:{label:'Reddit',c:'#ff4500'},telegram:{label:'Telegram',c:'#229ED9'},
  substack:{label:'Substack',c:'#ff6719'}
};
/* overlays render on <body>: My Routine's full-screen layer is its own stacking context, under the bottom bar */
const toBody=el=>window.ReactDOM&&ReactDOM.createPortal?ReactDOM.createPortal(el,document.body):el;
const IG_RING='linear-gradient(45deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 80%,#4f5bd5)';
/* which social app (if any) an item in My Routine belongs to */
function platformOf(it){
  if(!it)return null;if(it.platform&&PLAT[it.platform])return it.platform;if(it.kind==='telegram')return'telegram';
  const u=String(it.feedUrl||'')+' '+String(it.url||'');
  if(/instagram\.com|\/instagram\//i.test(u))return'instagram';
  if(/(^|\/\/|\.)(x|twitter)\.com|\/twitter\//i.test(u))return'x';
  if(/threads\.net|\/threads\//i.test(u))return'threads';
  if(/bsky\.app/i.test(u))return'bluesky';
  if(/reddit\.com/i.test(u))return'reddit';
  if(/substack\.com/i.test(u))return'substack';
  if(/(^|\/\/)(t|telegram)\.me\//i.test(u))return'telegram';
  if(/\/@[\w.]+(\.rss)?\b/.test(u)&&!/youtube/i.test(u))return'mastodon';
  return null;
}
const isSocial=it=>!!platformOf(it);
function isVideoPost(p){
  const e=p&&p.e;if(!e)return false;
  if(e.video)return true;
  if(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|tv)\//i.test(e.url||''))return true;
  if(/video_thumb|amplify_video|ext_tw_video/i.test(e.thumb||''))return true;
  return false;
}
/* an embeddable player for the post, where the platform offers one */
function embedOf(p){
  const u=(p&&p.e&&p.e.url)||'';let m;
  if((m=/instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/i.exec(u)))return'https://www.instagram.com/'+(m[1]==='p'?'p':'reel')+'/'+m[2]+'/embed/';
  if((m=/(?:x|twitter)\.com\/[\w]+\/status\/(\d+)/i.exec(u)))return'https://platform.twitter.com/embed/Tweet.html?id='+m[1]+'&theme=dark&dnt=true';
  if((m=/t\.me\/([\w]+)\/(\d+)/i.exec(u)))return'https://t.me/'+m[1]+'/'+m[2]+'?embed=1&mode=tme&dark=1';
  return'';
}
const ago=ms=>{if(!ms)return'';const d=Date.now()-ms;if(d<60000)return'now';if(d<3600000)return Math.round(d/60000)+'m';if(d<86400000)return Math.round(d/3600000)+'h';if(d<7*86400000)return Math.round(d/86400000)+'d';
  return new Date(ms).toLocaleDateString([],{day:'numeric',month:'short'})};
const captionOf=e=>{const c=String(e.caption||'').trim(),x=String(e.excerpt||'').trim(),t=String(e.title||'').trim();
  const best=[c,x,t].sort((a,b)=>b.length-a.length)[0]||'';return best.replace(/^📷 Media post$/,'')};
const handleOf=it=>{const h0=it.socialHandle||it.handle||'';return h0?(/^r\//.test(h0)?h0:'@'+String(h0).replace(/^@/,'')):''};
const displayName=it=>String(it.name||handleOf(it)||'Account').replace(/\s·\s(Instagram|X|Threads|Bluesky|Mastodon|Reddit|Telegram|Substack)$/,'');

const SI={ /* outline icons in Instagram's spirit */
  comment:s=>Svg({size:s},P('M20.5 11.6a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.6-4.5A8.4 8.4 0 1 1 20.5 11.6Z')),
  send:s=>Svg({size:s},P('M21 3.5 10.2 14.3'),P('M21 3.5 14.4 20.5l-4.2-6.2L3.5 10.1 21 3.5Z')),
  done:(s,on)=>Svg({size:s},on?h('circle',{cx:12,cy:12,r:9,fill:'currentColor'}):h('circle',{cx:12,cy:12,r:8.6,stroke:'currentColor',strokeWidth:1.8,fill:'none'}),
    h('path',{d:'M8 12.3l2.7 2.7L16.2 9.5',stroke:on?'#000':'currentColor',strokeWidth:2,fill:'none',strokeLinecap:'round',strokeLinejoin:'round'})),
  reel:s=>Svg({size:s},h('rect',{x:3.5,y:3.5,width:17,height:17,rx:4.5,stroke:'currentColor',strokeWidth:1.7}),P('M3.8 8.4h16.4M8.6 3.8l2.6 4.6M14.2 3.8l2.6 4.6'),h('path',{d:'M10.4 11.6v4.8l4.2-2.4-4.2-2.4Z',fill:'currentColor'})),
  dots:s=>Svg({size:s},h('circle',{cx:5.5,cy:12,r:1.6,fill:'currentColor'}),h('circle',{cx:12,cy:12,r:1.6,fill:'currentColor'}),h('circle',{cx:18.5,cy:12,r:1.6,fill:'currentColor'}))
};

function Avatar({it,size,ring,seen}){
  const p=platformOf(it)||'instagram',c=(PLAT[p]||PLAT.instagram).c;const s=size||34;
  const letter=(displayName(it).replace(/^@/,'')[0]||'?').toUpperCase();
  return h('span',{style:{width:s+6,height:s+6,borderRadius:'50%',padding:2,background:ring?(seen?'rgba(255,255,255,.28)':IG_RING):'transparent',display:'inline-flex',flexShrink:0,boxSizing:'border-box'}},
    h('span',{style:{width:'100%',height:'100%',borderRadius:'50%',background:'#000',padding:2,boxSizing:'border-box',display:'flex'}},
      h('span',{style:{flex:1,borderRadius:'50%',background:c,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:Math.round(s*.42),border:p==='x'||p==='threads'?'1px solid #333':'none'}},letter)));
}

/* ---------- sheets ---------- */
function CaptionSheet({T,p,note,onNote,onOpen,onClose}){
  const [t,setT]=useState(note||'');const e=p.e,it=p.it,pl=PLAT[platformOf(it)]||{label:''};
  const save=()=>{if((note||'')!==t)onNote(e.url,t.trim())};
  return h(Sheet,{T,onClose:()=>{save();onClose()},title:null,z:72,maxH:'86%'},
    h('div',{style:{padding:'4px 18px 18px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:12}},h(Avatar,{it,size:30}),
        h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14.5,fontWeight:700}},displayName(it)),h('div',{style:{fontSize:12,color:T.sub}},pl.label+(e.publishedMs?' · '+ago(e.publishedMs):'')+(e.author?' · '+e.author:'')))),
      h('div',{style:{fontSize:15,lineHeight:1.55,whiteSpace:'pre-wrap',wordBreak:'break-word'}},captionOf(e)||'No caption.'),
      h('button',{onClick:()=>{save();onOpen(p)},className:'act95',style:{marginTop:10,fontSize:13,fontWeight:650,color:T.accent}},'Open post →'),
      h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:T.sub,margin:'18px 0 6px'}},'Your notes'),
      h('textarea',{value:t,onChange:x=>setT(x.target.value),onBlur:save,rows:4,placeholder:'Private notes on this post — only on this phone',
        style:{width:'100%',boxSizing:'border-box',padding:'11px 13px',borderRadius:12,border:'1px solid '+T.hair,background:T.card,color:T.fg,fontSize:15,fontFamily:UIF,resize:'vertical'}}),
      h('div',{style:{fontSize:12,color:T.sub,lineHeight:1.5,marginTop:8}},pl.label+' comments and likes need your account, so they stay in the '+pl.label+' app.')));
}
const aboutCache=new Map();
function AboutSheet({T,S,p,done,saved,onDone,onSave,onOpen,onClose,toastFn}){
  const e=p.e,it=p.it,pl=PLAT[platformOf(it)]||{label:'post'};
  const ready=typeof aiReady==='function'&&aiReady(S||{})&&S.aiProvider!=='claude';
  const [sum,setSum]=useState(aboutCache.get(e.url)||'');const [busy,setBusy]=useState('');const [q,setQ]=useState('');const [ans,setAns]=useState([]);
  const ctx='Platform: '+pl.label+'\nAccount: '+displayName(it)+(e.author?' ('+e.author+')':'')+'\nPosted: '+(e.publishedMs?new Date(e.publishedMs).toDateString():'unknown')+'\nLink: '+e.url+'\nCaption / text:\n'+captionOf(e);
  const sys='You explain social media posts briefly and neutrally. Use only the post details given; if they are thin, say what can and can’t be told. Answer in '+((S&&S.aiLang)||'English')+'.';
  useEffect(()=>{if(!ready||sum)return;let dead=false;setBusy('Summarizing…');
    aiChat(S,[{role:'system',content:sys},{role:'user',content:'In 2–3 sentences, what is this post about and why might it matter?\n\n'+ctx}],500,w=>setBusy(String(w||'Summarizing…')))
      .then(o=>{if(dead)return;const t=String(o||'');aboutCache.set(e.url,t);setSum(t)}).catch(er=>{if(!dead)setSum('⚠︎ '+((er&&er.message)||'Couldn’t summarize'))}).finally(()=>{if(!dead)setBusy('')});
    return()=>{dead=true}},[]);
  const ask=async()=>{const qq=q.trim();if(!qq)return;setQ('');
    if(S&&S.aiProvider==='claude'){openInClaude(qq+'\n\n'+ctx,toastFn);return}
    if(!ready){toastFn&&toastFn('Turn on AI in Settings → AI Assistant first');return}
    setBusy('Thinking…');try{const o=await aiChat(S,[{role:'system',content:sys},{role:'user',content:ctx+'\n\nQuestion: '+qq}],700,w=>setBusy(String(w||'Thinking…')));setAns(a=>a.concat([{q:qq,a:String(o||'')}]))}
    catch(er){setAns(a=>a.concat([{q:qq,a:'⚠︎ '+((er&&er.message)||'Something went wrong')}]))}setBusy('')};
  const md=t=>{try{return mdToHtml(t)}catch(x){return t}};
  const row=(icon,label,fn,danger)=>h('button',{onClick:fn,className:'act98',style:{display:'flex',alignItems:'center',gap:14,width:'100%',padding:'13px 16px',textAlign:'left',color:danger?T.danger:T.fg,fontSize:15,borderTop:'0.5px solid '+T.hair}},h('span',{style:{display:'flex',color:danger?T.danger:T.fg}},icon),label);
  return h(Sheet,{T,onClose,title:null,z:72,maxH:'88%'},
    h('div',{style:{padding:'2px 16px 16px'}},
      h('div',{style:{fontSize:16,fontWeight:700,margin:'2px 2px 8px'}},'About this post'),
      ready||S&&S.aiProvider==='claude'?h('div',{style:{fontSize:14.5,lineHeight:1.5,margin:'0 2px'}},
          busy&&!sum?h('div',{style:{display:'flex',alignItems:'center',gap:8,color:T.sub}},h(Spinner,{T,size:14}),busy):sum?h('div',{className:'bkai',dangerouslySetInnerHTML:{__html:md(sum)}}):
          S&&S.aiProvider==='claude'?h('div',{style:{color:T.sub,fontSize:13.5}},'Ask below — the Claude app opens with this post.'):null)
        :h('div',{style:{fontSize:13,color:T.sub,lineHeight:1.5,margin:'0 2px'}},'Turn on AI in Settings → AI Assistant for a quick summary of each post.'),
      ans.map((x,i)=>h('div',{key:i,style:{marginTop:12}},h('div',{style:{fontSize:13,fontWeight:700,color:T.sub}},x.q),h('div',{className:'bkai',style:{fontSize:14.5,lineHeight:1.5},dangerouslySetInnerHTML:{__html:md(x.a)}}))),
      busy&&sum?h('div',{style:{display:'flex',alignItems:'center',gap:8,color:T.sub,fontSize:13,marginTop:10}},h(Spinner,{T,size:13}),busy):null,
      h('div',{style:{display:'flex',alignItems:'center',gap:8,margin:'14px 0 14px',padding:'4px 4px 4px 14px',borderRadius:22,background:T.card}},
        h('span',{style:{display:'flex',color:'#a855f7'}},Icons.ai(17)),
        h('input',{value:q,onChange:x=>setQ(x.target.value),onKeyDown:x=>{if(x.key==='Enter')ask()},placeholder:'Ask about this post…',enterKeyHint:'send',style:{flex:1,minWidth:0,border:'none',background:'transparent',color:T.fg,fontSize:15.5,outline:'none',padding:'8px 0'}}),
        h('button',{onClick:ask,'aria-label':'Ask',className:'act90',style:{width:34,height:34,borderRadius:17,display:'flex',alignItems:'center',justifyContent:'center',color:q.trim()?T.fg:T.sub}},Icons.send(16))),
      h('div',{style:{borderRadius:14,background:T.card,overflow:'hidden'}},
        row(Icons.external?Icons.external(19):Icons.globe(19),'Open in '+pl.label,()=>{onClose();openExternalUrl(e.url)}),
        row(Icons.globe(19),'View here',()=>{onClose();onOpen(p)}),
        row(Icons.download(19),saved?'Saved to library':'Save to library',()=>{if(!saved)onSave(p);onClose()})),
      h('div',{style:{borderRadius:14,background:T.card,overflow:'hidden',marginTop:10}},
        row(Icons.copy(19),'Copy link',()=>{try{navigator.clipboard.writeText(e.url)}catch(x){}toastFn&&toastFn('Link copied');onClose()}),
        row(Icons.checkCircle?Icons.checkCircle(19,done):SI.done(19,false),done?'Mark as not done':'Mark as done',()=>{onDone(p);onClose()}))));
}

/* ---------- Reels viewer (video posts) ---------- */
function Reels({T,posts,start,isDone,onDone,onAction,onClose}){
  const ref=useRef(null);const [idx,setIdx]=useState(start||0);const [playing,setPlaying]=useState(null);const [more,setMore]=useState(false);
  useEffect(()=>{const el=ref.current;if(el)el.scrollTop=(start||0)*el.clientHeight},[]);
  const onScroll=()=>{const el=ref.current;if(!el)return;const i=Math.round(el.scrollTop/Math.max(1,el.clientHeight));if(i!==idx){setIdx(i);setPlaying(null);setMore(false)}};
  const rail=(icon,label,fn,on)=>h('button',{onClick:fn,'aria-label':label,className:'act90',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:4,color:on?'#34c759':'#fff',filter:'drop-shadow(0 1px 3px rgba(0,0,0,.5))'}},
    icon,h('span',{style:{fontSize:11,fontWeight:600,color:'#fff'}},label));
  return h('div',{className:'fdin',style:{position:'fixed',inset:0,zIndex:60,background:'#000',color:'#fff',fontFamily:UIF}},
    h('div',{ref,onScroll,style:{position:'absolute',inset:0,overflowY:'auto',scrollSnapType:'y mandatory',WebkitOverflowScrolling:'touch'}},
      posts.map((p,i)=>{const e=p.e,it=p.it,near=Math.abs(i-idx)<=1,done=isDone(p),emb=embedOf(p),pl=PLAT[platformOf(it)]||{label:''},cap=captionOf(e);
        return h('div',{key:e.url+i,style:{position:'relative',height:'100%',scrollSnapAlign:'start',scrollSnapStop:'always',overflow:'hidden',background:'#000'}},
          near&&e.thumb?h('img',{src:e.thumb,alt:'',referrerPolicy:'no-referrer',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'blur(28px) brightness(.45)',transform:'scale(1.2)'}}):null,
          playing===i&&emb?h('iframe',{src:emb,allow:'autoplay; encrypted-media; picture-in-picture; fullscreen',allowFullScreen:true,style:{position:'absolute',left:0,right:0,top:'calc(52px + env(safe-area-inset-top))',bottom:'calc(150px + env(safe-area-inset-bottom))',width:'100%',height:'calc(100% - 202px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',border:0,background:'#000'}}):
          h('button',{onClick:()=>{if(emb)setPlaying(i);else onAction('open',p)},'aria-label':'Play',style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}},
            near&&e.thumb?h('img',{src:e.thumb,alt:'',referrerPolicy:'no-referrer',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}}):null,
            h('span',{style:{position:'relative',width:72,height:72,borderRadius:36,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}},Icons.play(30,true))),
          /* right rail */
          h('div',{style:{position:'absolute',right:10,bottom:'calc(118px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',alignItems:'center',gap:20,zIndex:2}},
            rail(SI.comment(28),'Caption',()=>onAction('caption',p)),
            rail(SI.send(27),'Share',()=>onAction('share',p)),
            rail(SI.done(29,done),done?'Done':'Done?',()=>onDone(p),done),
            rail(SI.dots(26),'More',()=>onAction('about',p))),
          /* account + caption */
          h('div',{style:{position:'absolute',left:0,right:64,bottom:'calc(26px + env(safe-area-inset-bottom))',padding:'0 14px',zIndex:2,textShadow:'0 1px 4px rgba(0,0,0,.6)'}},
            h('div',{style:{display:'flex',alignItems:'center',gap:9}},h(Avatar,{it,size:28}),
              h('span',{style:{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},displayName(it)),
              h('span',{style:{fontSize:11.5,padding:'2px 7px',borderRadius:6,border:'1px solid rgba(255,255,255,.5)',fontWeight:600,flexShrink:0}},pl.label)),
            cap?h('button',{onClick:()=>more&&i===idx?onAction('caption',p):setMore(true),style:{display:'block',textAlign:'left',color:'#fff',fontSize:13.5,lineHeight:1.4,marginTop:8,width:'100%'}},
              more&&i===idx?h('span',{style:{display:'-webkit-box',WebkitLineClamp:7,WebkitBoxOrient:'vertical',overflow:'hidden'}},cap)
                :h(Fragment,null,cap.length>58?cap.slice(0,56).replace(/\s+\S*$/,'')+'… ':cap+' ',cap.length>58?h('span',{style:{opacity:.65}},'more'):null)):null,
            h('div',{style:{fontSize:11.5,opacity:.7,marginTop:6}},(p.isNew&&!done?'New · ':'')+ago(e.publishedMs))));
      })),
    h('div',{style:{position:'absolute',left:0,right:0,top:0,padding:'calc(8px + env(safe-area-inset-top)) 10px 8px',display:'flex',alignItems:'center',gap:8,background:'linear-gradient(to bottom,rgba(0,0,0,.6),transparent)',zIndex:3}},
      h('button',{onClick:onClose,'aria-label':'Close reels',className:'act90',style:{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}},Icons.back(24)),
      h('div',{style:{fontSize:17,fontWeight:750}},'Reels'),h('div',{style:{flex:1}}),
      h('span',{style:{fontSize:12.5,opacity:.75}},(idx+1)+' / '+posts.length)));
}

/* ---------- feed links: free feeds turn on with one tap; Instagram / X / Threads get a free bridge feed from
   the GitHub feed job, with an RSS.app link as the backup for accounts the bridges can't reach ---------- */
const FREE_FEED={telegram:1,reddit:1,bluesky:1,mastodon:1,substack:1};
function FeedSetup({T,platform,accounts,onAutoFeed,onSetFeed,onProfile,onClose,toastFn}){
  const pl=PLAT[platform]||{label:'this app'};const free=!!FREE_FEED[platform];
  const [busy,setBusy]=useState(null);
  const auto=async a=>{setBusy(a.it.id);await onAutoFeed(a.it);setBusy(null)};
  /* free platforms: accounts with no feed yet; bridged ones: accounts the free bridge isn't bringing posts for */
  const waiting=accounts.filter(a=>free?!a.feed:!a.entries);
  const connect=a=>{if(!window.openFeedConnect)return;const ids=(a?(waiting.some(x=>x.it.id===a.it.id)?waiting:[a]):waiting).map(x=>x.it.id);window.openFeedConnect(ids,a&&a.it.id);onClose&&onClose()};
  const pill=(label,fn,primary,key)=>h('button',{key,onClick:fn,className:'act95',style:{padding:'8px 12px',borderRadius:16,fontSize:13,fontWeight:650,background:primary?T.fg:T.card,color:primary?T.bg:T.fg}},label);
  return h(Sheet,{T,onClose,title:'New posts from '+pl.label,z:74,maxH:'88%'},
    h('div',{style:{padding:'0 18px 18px'}},
      h('div',{style:{fontSize:13,color:T.sub,lineHeight:1.5,marginBottom:10}},free?pl.label+' has free public feeds — turn one on per account to get New counts and posts here.':
        pl.label+' has no public feed, so your GitHub feed job makes one for each account for free (RSS-Bridge, RSSHub, Nitter), every 15 minutes, once your sources are synced. If '+pl.label+' blocks it for an account, add an RSS.app link as a backup. Without posts, the account still opens as a live profile.'),
      !free&&waiting.length>1?h('button',{onClick:()=>connect(null),className:'act95',style:{width:'100%',padding:'12px',borderRadius:12,background:T.fg,color:T.bg,fontSize:14.5,fontWeight:650,marginBottom:6}},'Add RSS.app backup for '+waiting.length+' accounts'):null,
      accounts.map(a=>h('div',{key:a.it.id,style:{padding:'12px 0',borderTop:'1px solid '+T.hair}},
        h('div',{style:{display:'flex',alignItems:'center',gap:10}},h(Avatar,{it:a.it,size:30}),
          h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14.5,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},displayName(a.it)),
            h('div',{style:{fontSize:12,color:a.feed&&!a.entries?T.danger:T.sub}},a.feed?(a.entries?a.entries+' posts in its feed'+(!free&&a.it.feedUrl?' · RSS.app backup set':''):free?'Feed linked but not returning posts':'Free feed not reachable yet'+(a.it.feedUrl?' · RSS.app backup set':'')):'No feed yet')),
          busy===a.it.id?h(Spinner,{T,size:16}):null),
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}},
          free?pill(a.feed?'Reconnect feed':'Turn on feed',()=>auto(a),true,'f')
            /* the same guided RSS.app flow as Settings → Social RSS feed */
            :pill(a.it.feedUrl?'Change RSS.app backup':'Add RSS.app backup',()=>connect(a),!a.entries,'c'),
          pill('Live profile',()=>onProfile(a.it),false,'v')))),
      !accounts.length?h('div',{style:{fontSize:13,color:T.sub}},'All accounts here are connected.'):null));
}

/* ---------- the feed ---------- */
function SocialFeed({T,S,posts:allPosts,accounts,platform,isDone,onDone,isSaved,onSave,onOpen,onProfile,onSetFeed,onAutoFeed,notesOf,onNote,toastFn,padTop,padBottom,hidden,emptyHint}){
  const [open,setOpen]=useState({});const [sheet,setSheet]=useState(null);const [reels,setReels]=useState(null);const [acct,setAcct]=useState(null);const [setup,setSetup]=useState(false);
  accounts=accounts||[];
  const posts=acct?allPosts.filter(p=>p.it.id===acct):allPosts;
  const videos=useMemo(()=>posts.filter(p=>!p.card&&isVideoPost(p)),[posts]);
  const needFeed=accounts.filter(a=>!a.feed||!a.entries);
  /* story-style account circles: gradient ring = new posts · tap to show only that account (or its live profile if it has no feed yet) */
  const tile=a=>{const on=acct===a.it.id;const handle=displayName(a.it).replace(/^@/,'');
    return h('button',{key:a.it.id,onClick:()=>{if(a.posts){setAcct(on?null:a.it.id)}else if(onProfile)onProfile(a.it)},className:'act95','aria-pressed':on,
      style:{display:'flex',flexDirection:'column',alignItems:'center',gap:5,width:66,flexShrink:0,color:'#fff',opacity:acct&&!on?.45:1}},
      h(Avatar,{it:a.it,size:52,ring:true,seen:!a.newN}),
      h('span',{style:{fontSize:11,maxWidth:66,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:on?700:500}},handle),
      !a.feed||!a.entries?h('span',{style:{fontSize:9.5,opacity:.55,marginTop:-3}},'profile'):null)};
  const act=(k,p)=>{if(k==='share')shareText(displayName(p.it)+' on '+((PLAT[platformOf(p.it)]||{}).label||''),'',p.e.url);else if(k==='open')onOpen(p);else setSheet({k,p})};
  const ib=(icon,label,fn,color)=>h('button',{onClick:fn,'aria-label':label,className:'act90',style:{display:'flex',padding:6,color:color||'#fff'}},icon);
  const card=(p,i)=>{
    const e=p.e,it=p.it,done=isDone(p),pl=PLAT[platformOf(it)]||{label:''},vid=isVideoPost(p),cap=captionOf(e),note=notesOf(e.url),exp=!!open[e.url];
    if(p.card)return h('div',{key:'card'+it.id,style:{margin:'0 0 18px',padding:'14px',borderRadius:16,background:'#121214',display:'flex',alignItems:'center',gap:12}},
      h(Avatar,{it,size:40}),
      h('div',{style:{flex:1,minWidth:0}},h('div',{style:{fontSize:14.5,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},displayName(it)),
        h('div',{style:{fontSize:12,color:'rgba(255,255,255,.55)',marginTop:2}},pl.label+' · no feed link yet — add one in Manage for new posts here')),
      h('button',{onClick:()=>onOpen(p),className:'act95',style:{padding:'8px 12px',borderRadius:10,background:'#fff',color:'#000',fontSize:13,fontWeight:700,flexShrink:0}},'View'));
    return h('article',{key:e.url+i,style:{marginBottom:22,opacity:done?.62:1,transition:'opacity 200ms'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'0 12px 8px'}},
        h(Avatar,{it,size:32,ring:true,seen:done||!p.isNew}),
        h('div',{style:{flex:1,minWidth:0,lineHeight:1.25}},
          h('div',{style:{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},displayName(it)),
          h('div',{style:{fontSize:11.5,color:'rgba(255,255,255,.55)'}},pl.label+(e.publishedMs?' · '+ago(e.publishedMs):'')+(p.isNew&&!done?' · New':''))),
        ib(SI.dots(20),'About this post',()=>act('about',p))),
      e.thumb?h('button',{onClick:()=>vid?setReels(Math.max(0,videos.indexOf(p))):onOpen(p),style:{position:'relative',display:'block',width:'100%',background:'#111'}},
          h('img',{src:e.thumb,alt:'',loading:'lazy',referrerPolicy:'no-referrer',onError:x=>{x.target.style.display='none'},style:{display:'block',width:'100%',aspectRatio:vid?'4 / 5':'auto',maxHeight:'68vh',minHeight:180,objectFit:'cover'}}),
          vid?h(Fragment,null,
            h('span',{style:{position:'absolute',right:10,top:10,display:'flex',color:'#fff',filter:'drop-shadow(0 1px 3px rgba(0,0,0,.6))'}},SI.reel(22)),
            h('span',{style:{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:62,height:62,borderRadius:31,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}},Icons.play(26,true))):null)
        :h('button',{onClick:()=>onOpen(p),style:{display:'block',width:'100%',textAlign:'left',padding:'22px 18px',background:'linear-gradient(135deg,#1c1c22,#101014)',color:'#fff',fontSize:18,lineHeight:1.45,fontWeight:500,whiteSpace:'pre-wrap',wordBreak:'break-word'}},
          h('span',{style:{display:'-webkit-box',WebkitLineClamp:8,WebkitBoxOrient:'vertical',overflow:'hidden'}},cap||e.title||'Post')),
      h('div',{style:{display:'flex',alignItems:'center',padding:'4px 6px 0'}},
        ib(SI.comment(25),'Caption and notes',()=>act('caption',p)),
        ib(SI.send(24),'Share',()=>act('share',p)),
        vid?ib(SI.reel(24),'Watch as reel',()=>setReels(Math.max(0,videos.indexOf(p)))):null,
        h('div',{style:{flex:1}}),
        h('button',{onClick:()=>onDone(p),'aria-label':done?'Mark as not done':'Mark as done',className:'act90',style:{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',color:done?'#34c759':'#fff',fontSize:13,fontWeight:650}},SI.done(25,done),done?'Done':'')),
      e.thumb&&cap?h('div',{style:{padding:'2px 14px 0',fontSize:14,lineHeight:1.42,color:'#f2f2f3'}},
        h('span',{style:exp?{whiteSpace:'pre-wrap',wordBreak:'break-word'}:{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},h('b',null,displayName(it)+' '),cap),
        !exp&&cap.length>90?h('button',{onClick:()=>setOpen(o=>({...o,[e.url]:true})),style:{color:'rgba(255,255,255,.55)',fontSize:14}},'more'):null):null,
      note?h('button',{onClick:()=>act('caption',p),style:{display:'block',textAlign:'left',margin:'6px 14px 0',fontSize:13,color:'rgba(255,255,255,.7)'}},'📝 '+note.slice(0,120)+(note.length>120?'…':'')):
        h('button',{onClick:()=>act('caption',p),style:{display:'block',margin:'6px 14px 0',fontSize:13,color:'rgba(255,255,255,.45)'}},'Add a note…'));
  };
  return h('div',{style:{position:'absolute',inset:0,background:'#000',color:'#fff',display:hidden?'none':'block'}},
    h('div',{className:'sy',style:{position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'calc('+(padTop||96)+'px + env(safe-area-inset-top)) 0 '+(padBottom||'90px')}},
      h('div',{style:{maxWidth:520,margin:'0 auto'}},
        accounts.length?h('div',{className:'sx',style:{display:'flex',gap:6,overflowX:'auto',padding:'4px 10px 8px'}},accounts.map(tile)):null,
        needFeed.length&&onSetFeed?h('button',{onClick:()=>setSetup(true),style:{display:'block',margin:'0 14px 14px',fontSize:12.5,color:'rgba(255,255,255,.6)',textAlign:'left'}},
          needFeed.length+' of '+accounts.length+' account'+(accounts.length>1?'s':'')+' show'+(needFeed.length===1?'s':'')+' only a live profile · ',h('span',{style:{color:'#fff',fontWeight:650,textDecoration:'underline'}},'Get new posts')):null,
        videos.length?h('button',{onClick:()=>setReels(0),className:'act98',style:{display:'flex',alignItems:'center',gap:10,margin:'2px 12px 16px',padding:'10px 14px',borderRadius:14,background:'#141417',color:'#fff',width:'calc(100% - 24px)',textAlign:'left'}},
          h('span',{style:{display:'flex',width:34,height:34,borderRadius:10,background:IG_RING,alignItems:'center',justifyContent:'center'}},SI.reel(19)),
          h('span',{style:{flex:1}},h('span',{style:{display:'block',fontSize:14.5,fontWeight:700}},'Reels'),h('span',{style:{display:'block',fontSize:12,color:'rgba(255,255,255,.55)'}},videos.length+' video'+(videos.length>1?'s':'')+' · swipe through full screen')),
          Icons.chevR?Icons.chevR(16):null):null,
        posts.map(card),
        !posts.length?h('div',{style:{textAlign:'center',padding:accounts.length?'36px 30px':'60px 30px',color:'rgba(255,255,255,.6)',fontSize:14,lineHeight:1.55}},
          accounts.length?(needFeed.length===accounts.length?'Tap an account above to see its latest posts, or connect feeds to get them here with New counts.':(emptyHint||'No new posts.')):'No accounts here yet — add them in ⋯ → Manage sources.'):null)),
    reels!=null&&videos.length?toBody(h(Reels,{T,posts:videos,start:reels,isDone,onDone,onAction:act,onClose:()=>setReels(null)})):null,
    setup?toBody(h(FeedSetup,{T,platform,accounts:needFeed.length?needFeed:accounts,onAutoFeed,onSetFeed,onProfile:it=>{setSetup(false);onProfile(it)},onClose:()=>setSetup(false),toastFn})):null,
    sheet&&sheet.k==='caption'?toBody(h(CaptionSheet,{T,p:sheet.p,note:notesOf(sheet.p.e.url),onNote,onOpen:p=>{setSheet(null);onOpen(p)},onClose:()=>setSheet(null)})):null,
    sheet&&sheet.k==='about'?toBody(h(AboutSheet,{T,S,p:sheet.p,done:isDone(sheet.p),saved:isSaved(sheet.p.e),onDone,onSave,onOpen,onClose:()=>setSheet(null),toastFn})):null);
}

/* its own name: window.InstaSocial belongs to social.js (the browser's YouTube / Instagram / X viewer) */
window.InstaRoutine={SocialFeed,isSocial,platformOf,isVideoPost};
})();
