/* Instapaper — Insights: the Home dashboard and the small activity log behind it.
   Saved items, highlights, notes, transcripts and My Routine check-offs already carry dates, so
   those compare week-on-week and month-on-month straight away. Time spent reading/watching and
   items finished/watched have no dates in the library, so they are logged per day from now on
   (localStorage, on this device only). Loaded before app.js; app.js globals are used at call time. */
(function(){
'use strict';
const {Fragment,useState,useMemo}=React;

/* ============================== activity log ============================== */
const KEY='insta_activity_v1';
const ymdOf=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
let LOG=null;
function load(){if(LOG)return LOG;try{LOG=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){LOG={}}if(!LOG.days)LOG.days={};return LOG}
let saveT=0;
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{
  const keys=Object.keys(LOG.days).sort();while(keys.length>430)delete LOG.days[keys.shift()];
  localStorage.setItem(KEY,JSON.stringify(LOG))}catch(e){}},400)}
/* read · watch (seconds), fin · wat (items finished / watched), words (words in finished articles), op (opens), rt (routine/news items opened) */
function track(k,n){const L=load();const d=ymdOf(Date.now());const day=L.days[d]||(L.days[d]={});day[k]=(day[k]||0)+(n==null?1:n);if(!L.since)L.since=Date.now();save()}
let lastTouch=Date.now();
['touchstart','pointerdown','scroll','keydown','wheel'].forEach(ev=>window.addEventListener(ev,()=>{lastTouch=Date.now()},{capture:true,passive:true}));
/* counts reading time only while you're actually using the reader */
function tick(isVideo,sec){
  if(document.visibilityState!=='visible')return;
  if(!isVideo&&Date.now()-lastTouch>120000)return;
  track(isVideo?'watch':'read',sec);
}
const recent=new Map();
function once(key){const t=recent.get(key);if(t&&Date.now()-t<3000)return false;recent.set(key,Date.now());return true}
/* called for every article change: picks out "finished", "watched" and "opened" */
function diff(a,n){
  try{
    if((a.progress||0)<0.97&&(n.progress||0)>=0.97&&once('f'+n.id)){if(n.isVideo)track('wat');else{track('fin');if(n.words)track('words',n.words)}}
    if((n.opens||0)>(a.opens||0)&&once('o'+n.id+n.opens))track('op');
  }catch(e){}
}

/* ============================== periods ============================== */
const DAY=86400000;
const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime()};
/* "this week" = Monday → now, compared with the same span of last week; months the same way */
function periods(kind){
  const now=Date.now(),today=startOfDay(now);
  if(kind==='month'){
    const d=new Date(today);const start=new Date(d.getFullYear(),d.getMonth(),1).getTime();
    const prevStart=new Date(d.getFullYear(),d.getMonth()-1,1).getTime();
    const dayN=Math.round((today-start)/DAY);
    const prevLen=Math.round((start-prevStart)/DAY);
    const prevEnd=prevStart+Math.min(dayN+1,prevLen)*DAY;
    const len=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    return{start,end:now,prevStart,prevEnd,prevFullEnd:start,len,prevLen,label:'This month',prevLabel:'same days last month',
      name:d.toLocaleDateString([],{month:'long'}),prevName:new Date(prevStart).toLocaleDateString([],{month:'long'})};
  }
  const dow=(new Date(today).getDay()+6)%7; // Monday = 0
  const start=today-dow*DAY,prevStart=start-7*DAY;
  return{start,end:now,prevStart,prevEnd:prevStart+(now-start),prevFullEnd:start,len:7,prevLen:7,label:'This week',prevLabel:'same days last week',name:'This week',prevName:'Last week'};
}
const inR=(t,a,b)=>t>=a&&t<b;

/* ============================== metrics ============================== */
function routineCount(brief,a,b){
  let n=0;const done=brief&&brief.done||{};
  for(const k in done){const day=String(k).split('#')[0];const t=Date.parse(day+'T12:00:00');if(isFinite(t)&&inR(t,a,b)&&Array.isArray(done[k]))n+=done[k].length}
  return n;
}
function streakDays(){try{return typeof loadStreakDays==='function'?loadStreakDays():[]}catch(e){return[]}}
function logSum(k,a,b){const L=load();let n=0;for(const d in L.days){const t=Date.parse(d+'T12:00:00');if(inR(t,a,b))n+=L.days[d][k]||0}return n}
function compute(data,a,b){
  const arts=Array.isArray(data.articles)?data.articles:[];
  const m={saved:0,vsaved:0,hl:0,notes:0,tr:0,sources:{},tags:{}};
  for(const x of arts){
    if(inR(x.addedAt||0,a,b)){if(x.isVideo)m.vsaved++;else m.saved++;if(x.source)m.sources[x.source]=(m.sources[x.source]||0)+1;(x.tags||[]).forEach(t=>m.tags[t]=(m.tags[t]||0)+1)}
    if(x.transcriptAt&&inR(x.transcriptAt,a,b))m.tr++;
    for(const hl of x.highlights||[]){
      const t=hl.updatedAt||hl.createdAt||0;
      if(!inR(hl.createdAt||t,a,b))continue;
      if(hl.note&&String(hl.note).trim())m.notes++;
      if(hl.text&&!/^📝/.test(hl.text))m.hl++;
    }
  }
  m.readMin=Math.round(logSum('read',a,b)/60);m.watchMin=Math.round(logSum('watch',a,b)/60);
  m.fin=logSum('fin',a,b);m.wat=logSum('wat',a,b);m.words=logSum('words',a,b);m.opens=logSum('op',a,b);m.rtOpen=logSum('rt',a,b);
  m.routine=routineCount(data.brief,a,b);
  m.briefDays=streakDays().filter(d=>inR(Date.parse(d+'T12:00:00'),a,b)).length;
  return m;
}
/* per-day series for the chart */
function series(data,kind,a,len){
  const out=new Array(len).fill(0);
  const idx=t=>Math.floor((startOfDay(t)-a)/DAY);
  if(kind==='saved'){(data.articles||[]).forEach(x=>{const i=idx(x.addedAt||0);if(i>=0&&i<len)out[i]++})}
  else if(kind==='hl'){(data.articles||[]).forEach(x=>(x.highlights||[]).forEach(hl=>{if(!hl.createdAt||/^📝/.test(hl.text||''))return;const i=idx(hl.createdAt);if(i>=0&&i<len)out[i]++}))}
  else{const L=load();for(const d in L.days){const i=idx(Date.parse(d+'T12:00:00'));if(i>=0&&i<len)out[i]+=Math.round(((L.days[d].read||0)+(L.days[d].watch||0))/60)}}
  return out;
}
function streak(data){
  const L=load();const active=new Set(Object.keys(L.days).filter(d=>{const x=L.days[d];return(x.read||0)>=60||(x.watch||0)>=60||x.fin||x.wat}));
  (data.articles||[]).forEach(x=>{(x.highlights||[]).forEach(hl=>{if(hl.createdAt)active.add(ymdOf(hl.createdAt))})});
  let n=0;let t=Date.now();
  if(!active.has(ymdOf(t)))t-=DAY; // today isn't over yet
  while(active.has(ymdOf(t))){n++;t-=DAY}
  return n;
}

/* ============================== UI ============================== */
const SERIF="ui-serif,'New York','Iowan Old Style',Georgia,serif";
const GOOD='#2f9e44',BAD='#e03131';
function delta(cur,prev){
  if(!cur&&!prev)return{txt:'—',tone:0};
  if(!prev)return{txt:'New',tone:1};
  const p=Math.round((cur-prev)/prev*100);
  if(p===0)return{txt:'Same',tone:0};
  return{txt:(p>0?'▲ ':'▼ ')+Math.abs(p)+'%',tone:p>0?1:-1};
}
function Delta({T,cur,prev,small}){
  const d=delta(cur,prev);
  return h('span',{title:'Previous: '+prev,style:{display:'inline-flex',alignItems:'center',padding:small?'1px 6px':'3px 8px',borderRadius:10,fontSize:small?10.5:12,fontWeight:700,fontVariantNumeric:'tabular-nums',
    color:d.tone>0?GOOD:d.tone<0?BAD:T.sub,background:d.tone>0?'rgba(47,158,68,.12)':d.tone<0?'rgba(224,49,49,.12)':T.card}},d.txt);
}
const fmtMin=m=>m>=60?Math.floor(m/60)+'h '+(m%60)+'m':m+'m';
const fmtN=n=>n>=10000?(n/1000).toFixed(n>=100000?0:1)+'K':String(n);
function Tile({T,label,cur,prev,fmt,sub}){
  return h('div',{style:{background:T.card,borderRadius:16,padding:'12px 13px 11px',minWidth:0}},
    h('div',{style:{fontSize:11,fontWeight:650,letterSpacing:'.04em',textTransform:'uppercase',color:T.sub,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},label),
    h('div',{style:{display:'flex',alignItems:'baseline',gap:7,marginTop:6,flexWrap:'wrap'}},
      h('span',{style:{fontSize:24,fontWeight:700,fontFamily:SERIF,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}},(fmt||fmtN)(cur)),
      h(Delta,{T,cur,prev,small:true})),
    h('div',{style:{fontSize:11,color:T.sub,marginTop:3}},sub||('vs '+(fmt||fmtN)(prev))));
}
/* every sub-section folds; what you fold is remembered */
const SEC_KEY='insta_dash_sections';
const secClosed=()=>{try{return new Set(JSON.parse(localStorage.getItem(SEC_KEY)||'[]'))}catch(e){return new Set()}};
function Section({T,title,right,children,id,summary}){
  const [open,setOpen]=useState(()=>!secClosed().has(id||title));
  const flip=()=>{const k=id||title;const s=secClosed();open?s.add(k):s.delete(k);try{localStorage.setItem(SEC_KEY,JSON.stringify([...s]))}catch(e){}setOpen(!open)};
  return h('div',{style:{marginTop:open?22:14}},
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,margin:'0 2px '+(open?10:0)+'px'}},
      h('button',{onClick:flip,'aria-expanded':open,className:'act95',style:{display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1,textAlign:'left',color:T.fg,padding:'2px 0'}},
        h('span',{style:{display:'flex',color:T.sub,transform:open?'rotate(90deg)':'none',transition:'transform 160ms'}},Icons.chevR(13)),
        h('span',{style:{fontSize:17,fontWeight:700,fontFamily:SERIF,flexShrink:0}},title),
        !open&&summary?h('span',{style:{fontSize:12,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},summary):null),
      open?(right||null):null),
    open?children:null);
}
/* Home library headings: This week · Last week · Earlier this month · Last month · then each month */
function bucketOf(t){
  const today=startOfDay(Date.now());const dow=(new Date(today).getDay()+6)%7;
  const wk=today-dow*DAY,lwk=wk-7*DAY;
  const d=new Date(today);const mo=new Date(d.getFullYear(),d.getMonth(),1).getTime(),pmo=new Date(d.getFullYear(),d.getMonth()-1,1).getTime();
  const rng=(a,b)=>{const f=x=>new Date(x).toLocaleDateString([],{day:'numeric',month:'short'});return f(a)+' – '+f(b)};
  t=t||0;
  if(t>=wk)return{key:'tw',label:'This week',sub:rng(wk,today)};
  if(t>=lwk)return{key:'lw',label:'Last week',sub:rng(lwk,wk-DAY)};
  if(t>=mo)return{key:'tm',label:'Earlier this month',sub:new Date(mo).toLocaleDateString([],{month:'long'})};
  if(t>=pmo)return{key:'lm',label:'Last month',sub:new Date(pmo).toLocaleDateString([],{month:'long',year:'numeric'})};
  if(!t)return{key:'old',label:'Older',sub:''};
  const x=new Date(t);return{key:'m'+x.getFullYear()+'-'+x.getMonth(),label:x.toLocaleDateString([],{month:'long',year:'numeric'}),sub:''};
}
const HG_KEY='insta_home_groups_closed';
const hgClosed=()=>{try{return new Set(JSON.parse(localStorage.getItem(HG_KEY)||'[]'))}catch(e){return new Set()}};
function TimeGroups({T,list,row}){
  const [closed,setClosed]=useState(hgClosed);
  const flip=k=>setClosed(prev=>{const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);try{localStorage.setItem(HG_KEY,JSON.stringify([...n]))}catch(e){}return n});
  const groups=[];const at={};
  for(const a of list){const b=bucketOf(a.addedAt);if(!(b.key in at)){at[b.key]=groups.length;groups.push(Object.assign({items:[]},b))}groups[at[b.key]].items.push(a)}
  return h('div',null,groups.map(g=>{
    const open=!closed.has(g.key);
    const unread=g.items.filter(a=>(a.progress||0)<0.97).length;
    const mins=g.items.filter(a=>!a.isVideo&&(a.progress||0)<0.97).reduce((s,a)=>s+(a.readMin||0),0);
    return h('div',{key:g.key},
      h('button',{onClick:()=>flip(g.key),'aria-expanded':open,className:'act98',style:{display:'flex',alignItems:'center',gap:10,width:'100%',textAlign:'left',padding:'16px 16px 8px',color:T.fg}},
        h('span',{style:{display:'flex',color:T.sub,transform:open?'rotate(90deg)':'none',transition:'transform 160ms'}},Icons.chevR(13)),
        h('span',{style:{flex:1,minWidth:0}},
          h('span',{style:{display:'block',fontSize:19,fontWeight:700,fontFamily:SERIF,letterSpacing:'-.01em'}},g.label),
          h('span',{style:{display:'block',fontSize:12,color:T.sub,marginTop:2}},[g.sub,g.items.length+' item'+(g.items.length===1?'':'s'),unread?unread+' unread':'all read',mins?fmtMin(mins)+' to read':''].filter(Boolean).join(' · '))),
        h('span',{style:{fontSize:12,fontWeight:700,color:T.sub,background:T.card,borderRadius:10,padding:'3px 9px',flexShrink:0,fontVariantNumeric:'tabular-nums'}},g.items.length)),
      open?g.items.map(row):null);
  }));
}
/* bar chart: this period (accent) over last period (grey), one bar pair per day; tap a day for values */
function Bars({T,cur,prev,labels,unit,curName,prevName}){
  const ghost=typeof isDarkTheme==='function'&&isDarkTheme(T.id)?'rgba(255,255,255,.24)':'rgba(0,0,0,.14)';
  const [sel,setSel]=useState(null);
  const max=Math.max(1,...cur,...prev);
  const n=cur.length;const H=96;
  const show=sel!=null?sel:null;
  return h('div',null,
    h('div',{style:{display:'flex',alignItems:'center',gap:14,fontSize:11.5,color:T.sub,margin:'0 2px 8px'}},
      h('span',{style:{display:'inline-flex',alignItems:'center',gap:6}},h('i',{style:{width:10,height:10,borderRadius:3,background:T.accent,display:'inline-block'}}),curName),
      h('span',{style:{display:'inline-flex',alignItems:'center',gap:6}},h('i',{style:{width:10,height:10,borderRadius:3,background:ghost,display:'inline-block'}}),prevName),
      h('span',{style:{marginLeft:'auto',color:T.fg,fontWeight:600,fontVariantNumeric:'tabular-nums'}},show!=null?(labels[show]+': '+cur[show]+' vs '+(prev[show]||0)+' '+unit):'')),
    h('div',{role:'img','aria-label':curName+' vs '+prevName+' per day',style:{position:'relative',height:H,display:'flex',alignItems:'flex-end',gap:n>10?2:6,borderBottom:'1px solid '+T.hair}},
      cur.map((v,i)=>{
        const pv=prev[i]||0;
        return h('button',{key:i,onClick:()=>setSel(sel===i?null:i),'aria-label':labels[i]+': '+v+' '+unit+', previous '+pv,
          style:{flex:1,minWidth:0,height:'100%',display:'flex',alignItems:'flex-end',justifyContent:'center',gap:n>10?1:3,padding:0,opacity:show!=null&&show!==i?0.45:1}},
          h('span',{style:{width:n>10?'45%':'38%',height:Math.max(2,pv/max*H),background:ghost,borderRadius:'3px 3px 0 0'}}),
          h('span',{style:{width:n>10?'45%':'38%',height:v?Math.max(3,v/max*H):2,background:v?T.accent:T.hair,borderRadius:'3px 3px 0 0'}}));
      })),
    h('div',{style:{display:'flex',gap:n>10?2:6,marginTop:5}},labels.map((l,i)=>h('span',{key:i,style:{flex:1,textAlign:'center',fontSize:10,color:T.sub,visibility:n>10&&i%5!==0&&i!==n-1?'hidden':'visible'}},l))));
}
function ProgressRing({p,size,T}){
  const r=(size-4)/2,c=2*Math.PI*r;
  return h('svg',{width:size,height:size,viewBox:'0 0 '+size+' '+size,style:{flexShrink:0}},
    h('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:T.hair,strokeWidth:3}),
    h('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:T.accent,strokeWidth:3,strokeLinecap:'round',strokeDasharray:c,strokeDashoffset:c*(1-p),transform:'rotate(-90 '+size/2+' '+size/2+')'}));
}
function greeting(){const h0=new Date().getHours();return h0<5?'Good night':h0<12?'Good morning':h0<17?'Good afternoon':'Good evening'}

function HomeDashboard({T,data,onOpen,onGo}){
  const [kind,setKind]=useState(()=>{try{return localStorage.getItem('insta_dash_period')||'week'}catch(e){return'week'}});
  const [chart,setChart]=useState('saved');
  const [open,setOpen]=useState(()=>{try{return localStorage.getItem('insta_dash_closed')!=='1'}catch(e){return true}});
  const setK=k=>{setKind(k);try{localStorage.setItem('insta_dash_period',k)}catch(e){}};
  const toggle=()=>{setOpen(v=>{try{localStorage.setItem('insta_dash_closed',v?'1':'0')}catch(e){}return!v})};
  const P=periods(kind);
  const cur=useMemo(()=>compute(data,P.start,P.end),[data,kind]);
  const prev=useMemo(()=>compute(data,P.prevStart,P.prevEnd),[data,kind]);
  const arts=Array.isArray(data.articles)?data.articles:[];
  const unread=arts.filter(a=>!a.archived&&!a.isVideo&&(a.progress||0)<0.97);
  const toWatch=arts.filter(a=>!a.archived&&a.isVideo&&(a.progress||0)<0.97);
  const queueMin=unread.reduce((s,a)=>s+(a.readMin||0),0);
  const going=arts.filter(a=>!a.archived&&(a.progress||0)>0.03&&(a.progress||0)<0.97).sort((x,y)=>(y.addedAt||0)-(x.addedAt||0)).slice(0,8);
  const st=streak(data);
  const L=load();const loggingSince=L.since||0;
  /* chart */
  const curS=series(data,chart,P.start,P.len);
  const prevS=series(data,chart,P.prevStart,P.prevLen);
  const labels=kind==='week'?['M','T','W','T','F','S','S']:curS.map((_,i)=>String(i+1));
  const unit=chart==='time'?'min':chart==='hl'?'highlights':'saved';
  const daysIn=Math.floor((startOfDay(Date.now())-P.start)/DAY);
  const curShow=curS.map((v,i)=>i<=daysIn?v:0);
  /* hero */
  const activeCur=cur.readMin+cur.watchMin,activePrev=prev.readMin+prev.watchMin;
  const heroTime=activeCur>0||activePrev>0;
  const heroVal=heroTime?fmtMin(activeCur):String(cur.saved+cur.vsaved);
  const heroLabel=heroTime?'reading & watching':'items saved';
  const topSrc=Object.entries(cur.sources).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const topTags=Object.entries(cur.tags).sort((a,b)=>b[1]-a[1]).slice(0,6);
  /* insight lines */
  const lines=[];
  const totalSaved=cur.saved+cur.vsaved,prevSaved=prev.saved+prev.vsaved;
  if(totalSaved||prevSaved)lines.push('You saved '+totalSaved+' item'+(totalSaved===1?'':'s')+(prevSaved!==totalSaved?' — '+Math.abs(totalSaved-prevSaved)+(totalSaved>prevSaved?' more':' fewer')+' than '+P.prevLabel:', same as '+P.prevLabel)+'.');
  if(activeCur&&activePrev)lines.push('Reading time is '+(activeCur>=activePrev?'up':'down')+' '+Math.abs(Math.round((activeCur-activePrev)/activePrev*100))+'% on '+P.prevLabel+'.');
  const best=curShow.indexOf(Math.max(...curShow));
  if(Math.max(...curShow)>0)lines.push('Busiest day: '+(kind==='week'?['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][best]:new Date(P.start+best*DAY).toLocaleDateString([],{day:'numeric',month:'short'}))+'.');
  if(topSrc[0])lines.push('Top source: '+topSrc[0][0]+' ('+topSrc[0][1]+').');
  const hd=h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}},
    h('div',{style:{minWidth:0}},
      h('div',{style:{fontSize:12,fontWeight:650,letterSpacing:'.08em',textTransform:'uppercase',color:T.sub}},new Date().toLocaleDateString([],{weekday:'long',day:'numeric',month:'long'})),
      h('div',{style:{fontSize:27,fontWeight:700,fontFamily:SERIF,letterSpacing:'-.015em',lineHeight:1.15,marginTop:3}},greeting())),
    h('button',{onClick:toggle,className:'act95',style:{padding:'7px 12px',borderRadius:16,background:T.card,color:T.fg,fontSize:12.5,fontWeight:600,flexShrink:0}},open?'Hide insights':'Show insights'));
  if(!open)return h('div',{style:{padding:'14px 16px 10px'}},hd);
  const seg=h('div',{style:{display:'inline-flex',background:T.card,borderRadius:12,padding:3,gap:2}},
    [['week','Week'],['month','Month']].map(([k,l])=>h('button',{key:k,onClick:()=>setK(k),className:'act95',style:{padding:'6px 16px',borderRadius:9,fontSize:13,fontWeight:650,background:kind===k?T.bg:'transparent',color:kind===k?T.fg:T.sub,boxShadow:kind===k?'0 1px 4px rgba(0,0,0,.12)':'none'}},l)));
  const grid=(...tiles)=>h('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}},...tiles);
  const dark=typeof isDarkTheme==='function'&&isDarkTheme(T.id);
  return h('div',{style:{padding:'14px 16px 6px',fontFamily:UIF}},
    hd,
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'16px 0 12px'}},seg,
      h('span',{style:{fontSize:11.5,color:T.sub}},'vs '+P.prevLabel)),
    /* hero */
    h('div',{style:{borderRadius:22,padding:'18px 18px 16px',color:'#fff',position:'relative',overflow:'hidden',
      background:dark?'linear-gradient(135deg,#2c2c4a 0%,#191926 100%)':'linear-gradient(135deg,#1f2a44 0%,#0f1424 100%)',border:dark?'1px solid rgba(255,255,255,.09)':'none',boxShadow:'0 10px 30px rgba(15,20,36,.25)'}},
      h('div',{style:{position:'absolute',right:-40,top:-40,width:160,height:160,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,255,255,.14),transparent 70%)'}}),
      h('div',{style:{fontSize:12,fontWeight:650,letterSpacing:'.08em',textTransform:'uppercase',opacity:.7}},P.label+' · '+heroLabel),
      h('div',{style:{display:'flex',alignItems:'baseline',gap:10,marginTop:6}},
        h('span',{style:{fontSize:44,fontWeight:700,fontFamily:SERIF,letterSpacing:'-.02em',fontVariantNumeric:'tabular-nums'}},heroVal),
        h(Delta,{T:Object.assign({},T,{sub:'rgba(255,255,255,.7)',card:'rgba(255,255,255,.12)'}),cur:heroTime?activeCur:totalSaved,prev:heroTime?activePrev:prevSaved})),
      h('div',{style:{display:'flex',gap:18,marginTop:12,fontSize:12.5,opacity:.85,flexWrap:'wrap'}},
        h('span',null,'🔥 ',h('b',null,st),' day streak'),
        h('span',null,'📚 ',h('b',null,unread.length),' to read · ',fmtMin(queueMin)),
        h('span',null,'▶ ',h('b',null,toWatch.length),' to watch'))),
    lines.length?h('div',{style:{marginTop:12,padding:'12px 14px',borderRadius:16,border:'1px solid '+T.hair,fontSize:13.5,lineHeight:1.55,color:T.fg}},
      lines.slice(0,3).map((l,i)=>h('div',{key:i,style:{display:'flex',gap:8}},h('span',{style:{color:T.accent}},'✦'),l))):null,
    /* trend */
    h(Section,{T,title:'Trend',id:'trend',right:h('div',{style:{display:'flex',gap:4}},[['saved','Saved'],['hl','Highlights'],['time','Minutes']].map(([k,l])=>
      h('button',{key:k,onClick:()=>setChart(k),className:'act95',style:{padding:'4px 9px',borderRadius:10,fontSize:11.5,fontWeight:650,background:chart===k?T.fg:'transparent',color:chart===k?T.bg:T.sub}},l)))},
      h('div',{style:{background:T.card,borderRadius:18,padding:'14px 12px 10px'}},
        h(Bars,{T,cur:curShow,prev:prevS.slice(0,P.len).concat(new Array(Math.max(0,P.len-prevS.length)).fill(0)),labels,unit,curName:P.name,prevName:P.prevName}))),
    h(Section,{T,title:'Reading',id:'reading',summary:cur.saved+' saved · '+cur.fin+' finished · '+fmtMin(cur.readMin)},grid(
      h(Tile,{key:1,T,label:'Articles saved',cur:cur.saved,prev:prev.saved}),
      h(Tile,{key:2,T,label:'Finished',cur:cur.fin,prev:prev.fin}),
      h(Tile,{key:3,T,label:'Time reading',cur:cur.readMin,prev:prev.readMin,fmt:fmtMin}),
      h(Tile,{key:4,T,label:'Words read',cur:cur.words,prev:prev.words}))),
    h(Section,{T,title:'Videos & transcripts',id:'videos',summary:cur.vsaved+' saved · '+cur.wat+' watched · '+cur.tr+' transcripts',right:h('button',{onClick:()=>onGo&&onGo('videos'),style:{fontSize:12.5,color:T.accent,fontWeight:600}},'Videos ›')},grid(
      h(Tile,{key:1,T,label:'Videos saved',cur:cur.vsaved,prev:prev.vsaved}),
      h(Tile,{key:2,T,label:'Watched',cur:cur.wat,prev:prev.wat}),
      h(Tile,{key:3,T,label:'Time watching',cur:cur.watchMin,prev:prev.watchMin,fmt:fmtMin}),
      h(Tile,{key:4,T,label:'Transcripts',cur:cur.tr,prev:prev.tr}))),
    h(Section,{T,title:'Highlights & notes',id:'hl',summary:cur.hl+' highlights · '+cur.notes+' notes',right:h('button',{onClick:()=>onGo&&onGo('notes'),style:{fontSize:12.5,color:T.accent,fontWeight:600}},'Notes ›')},
      grid(h(Tile,{key:1,T,label:'Highlights',cur:cur.hl,prev:prev.hl}),h(Tile,{key:2,T,label:'Notes',cur:cur.notes,prev:prev.notes})),
      topSrc.length?h('div',{style:{marginTop:12}},
        h('div',{style:{fontSize:11,fontWeight:650,letterSpacing:'.04em',textTransform:'uppercase',color:T.sub,margin:'0 2px 6px'}},'Top sources'),
        topSrc.map(([s,n])=>h('div',{key:s,style:{display:'flex',alignItems:'center',gap:10,padding:'6px 2px'}},
          h('span',{style:{flex:1,minWidth:0,fontSize:13.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},s),
          h('span',{style:{width:90,height:6,borderRadius:3,background:T.card,overflow:'hidden'}},h('i',{style:{display:'block',height:'100%',width:Math.round(n/topSrc[0][1]*100)+'%',background:T.accent,borderRadius:3}})),
          h('span',{style:{width:22,textAlign:'right',fontSize:12.5,color:T.sub,fontVariantNumeric:'tabular-nums'}},n)))):null,
      topTags.length?h('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}},topTags.map(([t,n])=>h('span',{key:t,style:{padding:'5px 10px',borderRadius:14,background:T.card,fontSize:12.5}},'#'+t+' ',h('span',{style:{color:T.sub}},n)))):null),
    h(Section,{T,title:'Routine & news',id:'routine',summary:cur.routine+' caught up · '+cur.rtOpen+' opened',right:h('button',{onClick:()=>onGo&&onGo('brief'),style:{fontSize:12.5,color:T.accent,fontWeight:600}},'My Routine ›')},grid(
      h(Tile,{key:1,T,label:'Updates caught up',cur:cur.routine,prev:prev.routine}),
      h(Tile,{key:2,T,label:'Routine days done',cur:cur.briefDays,prev:prev.briefDays}),
      h(Tile,{key:3,T,label:'Updates opened',cur:cur.rtOpen,prev:prev.rtOpen}),
      h(Tile,{key:4,T,label:'Items opened',cur:cur.opens,prev:prev.opens}))),
    going.length?h(Section,{T,title:'Continue',id:'continue',summary:going.length+' in progress'},
      h('div',{className:'sx',style:{display:'flex',gap:10,overflowX:'auto',margin:'0 -16px',padding:'0 16px 4px'}},
        going.map(a=>h('button',{key:a.id,onClick:()=>onOpen&&onOpen(a.id),className:'act98',style:{flexShrink:0,width:210,textAlign:'left',background:T.card,borderRadius:16,overflow:'hidden',color:T.fg}},
          a.image||a.videoId?h('img',{src:a.videoId?'https://i.ytimg.com/vi/'+a.videoId+'/mqdefault.jpg':a.image,alt:'',loading:'lazy',style:{width:'100%',height:96,objectFit:'cover',display:'block'},onError:e=>{e.target.style.display='none'}}):null,
          h('div',{style:{display:'flex',gap:9,alignItems:'center',padding:'10px 11px'}},
            h(ProgressRing,{T,p:a.progress||0,size:26}),
            h('div',{style:{minWidth:0}},
              h('div',{style:{fontSize:13,fontWeight:650,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.title||'Untitled'),
              h('div',{style:{fontSize:11,color:T.sub,marginTop:2}},Math.round((a.progress||0)*100)+'% · '+(a.source||''))))))))
      :null,
    h('div',{style:{fontSize:11,color:T.sub,lineHeight:1.5,margin:'16px 2px 4px'}},
      'Saved items, highlights, notes, transcripts and routine check-offs are counted from their dates. Time, finished and watched are tracked on this device'+(loggingSince?' since '+new Date(loggingSince).toLocaleDateString([],{day:'numeric',month:'short'}):' from today')+'.'),
    h('div',{style:{fontSize:11.5,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:T.sub,margin:'18px 2px 0'}},'Your library · by week & month'));
}

window.InstaStats={track,tick,diff,HomeDashboard,compute,periods,bucketOf,TimeGroups};
})();
