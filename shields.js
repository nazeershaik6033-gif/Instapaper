/* Instapaper — Shields: privacy and power features for the in-app browser, modelled on Cromite
   (https://github.com/uazo/cromite). Cromite patches Chromium itself; this app is a web page, so
   each feature is rebuilt with what a PWA can do:
   - ad & tracker blocking in Smart view: a built-in list plus EasyList / EasyPrivacy / Peter Lowe /
     Fanboy lists (Adblock Plus syntax: ||host^, path rules, @@ exceptions, ##cosmetic, #@#), and
     your own rules; blocked images, frames, pixels and ad boxes are removed before the page renders
   - per-site settings (Cromite "site settings"): shields, images, JavaScript (Live/Smart), pop-ups,
     autoplay, force-dark, zoom, custom CSS and an element picker that remembers what you hid
   - URL hygiene: tracking parameters stripped, redirect wrappers unwrapped, AMP skipped,
     http upgraded to https, no referrer sent
   - private tabs (always-incognito option), history retention, clear browsing data, page source,
     address-bar suggestions, bookmark import/export, privacy search engines
   Loaded before browser.js; app.js globals (h, Icons, Sheet…) are used at call time. */
(function(){
'use strict';
const {Fragment,useState,useEffect,useRef,useMemo}=React;
const UI=()=>window.InstaUI||{};

/* ============================== settings ============================== */
const DEFAULTS={
  on:true,        // shields (ad & tracker blocking) on by default
  cosmetic:true,  // remove ad boxes / empty ad slots
  cleanUrls:true, // strip utm_*, fbclid, gclid…
  unwrap:true,    // google.com/url?q=, l.facebook.com… → the real link
  deamp:true,     // google.com/amp/s/… → the publisher's page
  https:true,     // http:// → https://
  referrer:true,  // send no Referer header from Smart pages; strict policy in Live view
  popups:false,   // block pop-ups / new windows in Live view (off: many logins need them)
  autoplay:true,  // stop video/audio autoplay in Smart view
  images:true,    // load images
  dark:false,     // force dark pages
  incognito:false,// every new tab is private
  hist:'all',     // history kept: off | 1 | 7 | 30 | 90 | all (days)
  listMode:false, // tab switcher as a list
  homeUrl:'',     // new tabs open this page
  socialInApp:true,// YouTube / Instagram / X open in the in-app viewer
  noApps:true,    // iPhone: open links in Safari, never let YouTube/Instagram… apps take them
  addrEngine:'',  // '' = the default search engine; or ddglite/startpage/brave/mojeek/ecosia
  lists:['easylist','easyprivacy']
};
const FILTER_LISTS=[
  {id:'easylist',name:'EasyList',sub:'The main ad-blocking list',url:'https://raw.githubusercontent.com/easylist/easylist/gh-pages/easylist.txt'},
  {id:'easyprivacy',name:'EasyPrivacy',sub:'Trackers, analytics and tracking pixels',url:'https://raw.githubusercontent.com/easylist/easylist/gh-pages/easyprivacy.txt'},
  {id:'pgl',name:'Peter Lowe’s list',sub:'Ad and tracking servers (small, fast)',url:'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/thirdparties/pgl.yoyo.org/as/serverlist'},
  {id:'annoy',name:'Fanboy Annoyances',sub:'Cookie banners, newsletter pop-ups, “open in app” bars',url:'https://raw.githubusercontent.com/easylist/easylist/gh-pages/fanboy-annoyance.txt'},
  {id:'social',name:'Fanboy Social',sub:'Social share buttons and like widgets',url:'https://raw.githubusercontent.com/easylist/easylist/gh-pages/fanboy-social.txt'}
];
const ADDR_ENGINES={
  ddglite:{label:'DuckDuckGo Lite',sub:'No JavaScript — perfect for Smart view',url:q=>'https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(q)},
  startpage:{label:'Startpage',sub:'Google results without tracking',url:q=>'https://www.startpage.com/do/search?q='+encodeURIComponent(q)},
  brave:{label:'Brave Search',sub:'Independent index',url:q=>'https://search.brave.com/search?q='+encodeURIComponent(q)},
  mojeek:{label:'Mojeek',sub:'Independent, no tracking',url:q=>'https://www.mojeek.com/search?q='+encodeURIComponent(q)},
  ecosia:{label:'Ecosia',sub:'Plants trees',url:q=>'https://www.ecosia.org/search?q='+encodeURIComponent(q)},
  googleen:{label:'Google (English)',sub:'Forces English results, no tracking parameters',url:q=>'https://www.google.com/search?hl=en&pws=0&q='+encodeURIComponent(q)}
};
const HIST_OPTS=[['off','Off'],['1','1 day'],['7','7 days'],['30','30 days'],['90','90 days'],['all','Forever']];

const SH={g:Object.assign({},DEFAULTS),sites:{},rules:'',rulesBuilt:null,booted:false};
function sync(S){
  S=S||{};
  SH.g=Object.assign({},DEFAULTS,S.shields||{});
  SH.sites=S.siteShields&&typeof S.siteShields==='object'?S.siteShields:{};
  const r=String(S.filterRules||'');
  if(r!==SH.rules){SH.rules=r;scheduleBuild()}
  if(!SH.booted){SH.booted=true;bootLists()}
}
const cfg=()=>SH.g;

/* ============================== hosts ============================== */
function hostOf(u){try{return new URL(u).hostname.toLowerCase()}catch(e){return''}}
const siteKey=u=>hostOf(u).replace(/^www\./,'');
const SLD_RX=/^(co|com|net|org|gov|edu|ac|nic|gen|firm|ind|res|ltd|plc|me|ne|or|go|mil|nom|sch)\.[a-z]{2}$/;
function baseDomain(host){
  const p=String(host||'').split('.');if(p.length<=2)return host;
  return SLD_RX.test(p.slice(-2).join('.'))?p.slice(-3).join('.'):p.slice(-2).join('.');
}
/* host, then each parent domain: a.b.example.com → a.b.example.com, b.example.com, example.com, com */
function suffixes(host){const out=[];let h=host;while(h){out.push(h);const i=h.indexOf('.');if(i<0)break;h=h.slice(i+1)}return out}
function suffixGet(map,host){for(const s of suffixes(host)){const v=map.get?map.get(s):map[s];if(v)return v}return 0}
function suffixHas(set,host){for(const s of suffixes(host))if(set.has(s))return true;return false}

/* effective settings for one site: global defaults, then parent-domain overrides, then the exact host */
function siteCfg(url){
  const g=cfg();const host=siteKey(url);let o={};
  const p=host.split('.');
  for(let i=Math.max(0,p.length-2);i>=0;i--){const k=p.slice(i).join('.');if(SH.sites[k])o=Object.assign({},o,SH.sites[k])}
  const pick=(k,d)=>o[k]!=null?o[k]:d;
  return{host,shields:pick('shields',g.on),cosmetic:pick('cosmetic',g.cosmetic),images:pick('images',g.images),dark:pick('dark',g.dark),
    popups:pick('popups',!g.popups),autoplay:pick('autoplay',g.autoplay),js:o.js||'',zoom:num(o.zoom,100),css:o.css||'',hide:Array.isArray(o.hide)?o.hide:[],
    custom:!!SH.sites[host]};
}
function num(v,d){const n=Number(v);return isFinite(n)&&n>0?n:d}

/* ============================== URL hygiene ============================== */
const TRACK_RX=/^(utm_[a-z0-9_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|igsh|yclid|ymclid|_hsenc|_hsmi|__hssc|__hstc|__hsfp|hsctatracking|mkt_tok|vero_id|vero_conv|oly_anon_id|oly_enc_id|rb_clickid|s_cid|ref_src|ref_url|twclid|ttclid|li_fat_id|epik|_openstat|wickedid|soc_src|soc_trk|ncid|cmpid|icid|_ga|_gl|srsltid|sc_cid|trkcampaign|ga_source|ga_medium|ga_campaign|ga_content|ga_term|guccounter|guce_referrer|guce_referrer_sig|at_medium|at_campaign|pk_campaign|pk_kwd|pk_source|pk_medium|piwik_campaign|mtm_[a-z]+|share_id|smid|smtyp|cvid|ocid|_branch_match_id|_bta_tid|_bta_c|mbid|ml_subscriber|ml_subscriber_hash|irclickid|irgwc|cjevent|zanpid|ranmid|raneaid|ransiteid|sr_share|wt_mc|wt_zmc|xtor|ss_source|ss_campaign_id|_kx|vgo_ee|__s|_trkparms|_trksid|campid|customid|mkevt|mkcid|mkrid|toolid)$/i;
const GOOGLE_RX=/^(ved|ei|sca_esv|sca_upv|sxsrf|rlz|oq|aqs|sourceid|ie|gs_lcp|gs_lp|gs_ssp|uact|sclient|bih|biw|dpr|iflsig|stick|source|client|sa|usg|cd|cad|ust|psig|opi|fbs|prmd)$/i;
function cleanUrl(u){
  try{
    const x=new URL(u);if(!/^https?:$/.test(x.protocol)||!x.search)return u;
    const host=x.hostname;
    const g=/(^|\.)google\.[a-z.]+$/.test(host)&&/^\/(search|webhp|$)/.test(x.pathname);
    const yt=/(^|\.)(youtube\.com|youtu\.be|spotify\.com|music\.youtube\.com)$/.test(host);
    const amz=/(^|\.)amazon\.[a-z.]+$/.test(host);
    let changed=false;
    for(const k of Array.from(x.searchParams.keys())){
      if(TRACK_RX.test(k)||(g&&GOOGLE_RX.test(k))||(yt&&(k==='si'||k==='pp'||k==='feature'))||(amz&&/^(pd_rd_[a-z]+|pf_rd_[a-z]+|_encoding|psc|content-id|ref_|crid|sprefix|qid|sr|dib|dib_tag)$/i.test(k))){x.searchParams.delete(k);changed=true}
    }
    if(!changed)return u;
    let out=x.href;if(!x.searchParams.toString())out=out.replace('?','').replace(/\?(?=#|$)/,'');
    return out;
  }catch(e){return u}
}
const UNWRAP=[
  [/(^|\.)google\.[a-z.]+$/,/^\/url$/,['q','url']],
  [/^(l|lm)\.facebook\.com$/,/^\/l\.php/,['u']],
  [/^l\.instagram\.com$/,/^\/?$/,['u']],
  [/^l\.threads\.net$/,/^\/?$/,['u']],
  [/^out\.reddit\.com$/,/./,['url']],
  [/(^|\.)youtube\.com$/,/^\/redirect/,['q']],
  [/^t\.umblr\.com$/,/^\/redirect/,['z']],
  [/^slack-redir\.net$/,/^\/link/,['url']],
  [/^steamcommunity\.com$/,/^\/linkfilter/,['url','u']],
  [/(^|\.)duckduckgo\.com$/,/^\/l\/?$/,['uddg']],
  [/^away\.vk\.com$/,/^\/away\.php/,['to']],
  [/^disq\.us$/,/^\/url/,['url']],
  [/^(www\.)?linkedin\.com$/,/^\/redir\/redirect/,['url']],
  [/^exit\.sc$/,/./,['url']],
  [/^href\.li$/,/./,[]]
];
function unwrapUrl(u){
  for(let hop=0;hop<3;hop++){
    let x;try{x=new URL(u)}catch(e){return u}
    let next='';
    for(const [hr,pr,keys] of UNWRAP){
      if(!hr.test(x.hostname)||!pr.test(x.pathname))continue;
      if(!keys.length){next=decodeURIComponent(x.search.slice(1));break}
      for(const k of keys){const v=x.searchParams.get(k);if(v){next=v.replace(/:[A-Za-z0-9_-]{20,}$/,'');break}}
      if(next)break;
    }
    if(!next||!/^https?:\/\//i.test(next))return u;
    u=next;
  }
  return u;
}
function deAmp(u){
  try{
    const x=new URL(u);
    let m=/^\/amp\/(s\/)?(.+)$/.exec(x.pathname);
    if(m&&/(^|\.)google\.[a-z.]+$/.test(x.hostname))return(m[1]?'https://':'http://')+m[2]+x.search;
    m=/^\/[cv]\/(s\/)?(.+)$/.exec(x.pathname);
    if(m&&/\.cdn\.ampproject\.org$/.test(x.hostname))return(m[1]?'https://':'http://')+m[2]+x.search;
  }catch(e){}
  return u;
}
function upgradeHttps(u){
  if(!/^http:\/\//i.test(u))return u;
  const host=hostOf(u);
  if(!host||host==='localhost'||/\.local$/.test(host)||/^[\d.]+$/.test(host)||host.includes(':'))return u;
  return'https://'+u.slice(7);
}
/* every navigation passes through here */
function navUrl(u){
  const g=cfg();if(!/^https?:/i.test(String(u||'')))return u;
  if(g.unwrap)u=unwrapUrl(u);
  if(g.deamp)u=deAmp(u);
  if(g.cleanUrls)u=cleanUrl(u);
  if(g.https)u=upgradeHttps(u);
  return u;
}
/* links you copy or share leave without trackers whatever the settings */
const shareUrl=u=>cleanUrl(unwrapUrl(String(u||'')));

/* ============================== filter engine ============================== */
/* Adblock Plus / uBlock syntax subset. Network rules match the resources a Smart page would load
   (images, media, frames, stylesheets, ad links); cosmetic rules remove elements before render. */
const BUILTIN=`! built-in (always on)
||doubleclick.net^
||googlesyndication.com^
||googleadservices.com^
||google-analytics.com^
||googletagmanager.com^
||googletagservices.com^
||adservice.google.com^
||pagead2.googlesyndication.com^
||imasdk.googleapis.com^
||amazon-adsystem.com^
||adnxs.com^
||adsrvr.org^
||taboola.com^
||outbrain.com^
||outbrainimg.com^
||criteo.com^
||criteo.net^
||scorecardresearch.com^
||quantserve.com^
||quantcount.com^
||moatads.com^
||pubmatic.com^
||rubiconproject.com^
||openx.net^
||casalemedia.com^
||advertising.com^
||yieldmo.com^
||sharethrough.com^
||smartadserver.com^
||teads.tv^
||mgid.com^
||revcontent.com^
||zedo.com^
||media.net^
||contextweb.com^
||bidswitch.net^
||3lift.com^
||triplelift.com^
||indexww.com^
||sovrn.com^
||lijit.com^
||gumgum.com^
||adform.net^
||serving-sys.com^
||adroll.com^
||hotjar.com^
||mixpanel.com^
||segment.io^
||clarity.ms^
||bat.bing.com^
||ads.linkedin.com^
||px.ads.linkedin.com^
||analytics.twitter.com^
||ads-twitter.com^
||adsafeprotected.com^
||doubleverify.com^
||innovid.com^
||spotxchange.com^
||springserve.com^
||undertone.com^
||adpushup.com^
||clmbtech.com^
||colombiaonline.com^
||izooto.com^
||vdo.ai^
||inmobi.com^
||propellerads.com^
||popads.net^
||popcash.net^
||adsterra.com^
||exoclick.com^
||juicyads.com^
||trafficjunky.net^
||hilltopads.net^
||onclickads.net^
||mc.yandex.ru^
||zergnet.com^
||nativo.com^
||kargo.com^
||33across.com^
||sonobi.com^
||emxdgt.com^
||smaato.net^
||chartbeat.com^
||chartbeat.net^
||imrworldwide.com^
||krxd.net^
||bluekai.com^
||exelator.com^
||demdex.net^
||everesttech.net^
||omtrdc.net^
||2o7.net^
||mathtag.com^
||rlcdn.com^
||agkn.com^
||tapad.com^
||bounceexchange.com^
||fullstory.com^
||mouseflow.com^
||crazyegg.com^
||static.cloudflareinsights.com^
||adgebra.co.in^
||affinity.com^
||adcolony.com^
||unityads.unity3d.com^
||ad.doubleclick.net^
||securepubads.g.doubleclick.net^
||ib.adnxs.com^
||cdn.onesignal.com^
||pushcrew.com^
||pushengage.com^
||wzrkt.com^
||clevertap-prod.com^
||branch.io^$third-party
||app.link^$third-party
||facebook.com/tr
||facebook.com/plugins/like.php
||connect.facebook.net^
||platform.twitter.com/widgets
/pagead/
/adserver/
/ads/banner
/doubleclick/
##.adsbygoogle
##ins.adsbygoogle
##amp-ad
##amp-embed
##amp-sticky-ad
##.ad-banner
##.ad-container
##.ad-slot
##.ad-unit
##.ad-wrapper
##.ad-placeholder
##.ad-block
##.adBox
##.adBanner
##.adContainer
##.adWrapper
##.advert
##.advertisement
##.advertisment
##.banner-ad
##.dfp-ad
##.google-ad
##.gpt-ad
##.sponsored-content
##.sponsored-post
##.native-ad
##.taboola
##.trc_rbox_container
##.OUTBRAIN
##.ob-widget
##.ob-smartfeed-wrapper
##.mgid-container
##.colombia
##.colombiaAd
##.colombia_ad
##[id^="div-gpt-ad"]
##[id^="google_ads_iframe"]
##[id^="taboola-"]
##[id^="outbrain_widget"]
##[data-google-query-id]
##[data-ad-slot]
##[data-adunit]
##[data-ad-unit]
##div[aria-label="advertisement" i]
##div[aria-label="Advertisement"]
`;
const ANNOY_BUILTIN=`! built-in annoyances
##.cc-window
##.cc-banner
##.cookie-banner
##.cookie-notice
##.cookie-consent
##.cookieConsent
##.cookie-bar
##.gdpr-banner
##.consent-banner
###cookie-notice
###cookie-banner
###cookie-law-info-bar
###onetrust-banner-sdk
###onetrust-consent-sdk
###CybotCookiebotDialog
###usercentrics-root
###qc-cmp2-container
##.fc-consent-root
###didomi-host
##.truste_overlay
##.smartbanner
##.app-banner
##.open-in-app
##.subscribe-popup
##.newsletter-popup
##.push-notification-prompt
###izooto-optin
`;
const BAD_SEL=/:-abp-|:has-text|:contains\(|:matches-|:xpath|:upward|:remove|:style\(|:min-text|:watch-attr|:others\(|:if\(|:if-not|:nth-ancestor|:spath|:shadow|^\+js|^script:|^\^|:not\(\s*\)|:matches\(/;
const SKIP_OPT=/^(~?domain|from|to|denyallow|method|header|csp|redirect|redirect-rule|removeparam|queryprune|rewrite|replace|urltransform|uritransform|permissions|popup|popunder|badfilter|1p|first-party|~third-party|~3p|elemhide|ehide|generichide|ghide|specifichide|shide|document|doc|genericblock|cname|webrtc|websocket|ping|beacon|inline-script|inline-font|strict1p|strict3p|xhr|xmlhttprequest|object-subrequest|script)(=|$)/;
function newEngine(){return{block:new Map(),allow:new Set(),siteOff:new Set(),cosOff:new Set(),genOff:new Set(),pBlock:[],pAllow:[],
  gClass:new Set(),gId:new Set(),gComplex:[],gExc:new Set(),site:new Map(),siteExc:new Map(),rules:0,rxBlock:null,rxAllow:null,gChunks:[]}}
const addMap=(m,k,v)=>{let a=m.get(k);if(!a){a=[];m.set(k,a)}a.push(v)};
function patternToRx(p){
  let pre='',s=p;
  if(s.startsWith('||')){pre='^[a-z-]+:\\/\\/(?:[^\\/?#]*\\.)?';s=s.slice(2)}
  else if(s[0]==='|'){pre='^';s=s.slice(1)}
  let end='';if(s.endsWith('|')){end='$';s=s.slice(0,-1)}
  if(!pre)s=s.replace(/^\*+/,'');
  s=s.replace(/\*+$/,'');
  if(s.replace(/[*^]/g,'').length<4)return''; // too short to be safe ("ad", "-ad-")
  let out='';
  for(const c of s)out+=c==='*'?'.*':c==='^'?'(?:[^\\w.%-]|$)':c.replace(/[.+?${}()|[\]\\\/]/g,'\\$&');
  return pre+out+end;
}
function hostFromPattern(l){const m=/^\|\|([a-z0-9.\-]+)\^?/i.exec(l);return m?m[1].toLowerCase().replace(/^www\./,''):''}
function parseInto(E,text){
  const lines=String(text||'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    let l=lines[i].trim();
    if(!l||l[0]==='!'||l[0]==='[')continue;
    if(l[0]==='#'&&!l.startsWith('##')&&!l.startsWith('#@#'))continue; // hosts-file comment
    /* cosmetic */
    let ci=l.indexOf('#@#'),sep=3,exc=true;
    if(ci<0){ci=l.indexOf('##');sep=2;exc=false}
    if(ci>-1){
      if(/#[?$%]#|#@[?$%]#/.test(l))continue;
      const doms=l.slice(0,ci),sel=l.slice(ci+sep).trim();
      if(!sel||BAD_SEL.test(sel))continue;
      const inc=doms?doms.split(',').map(d=>d.trim().toLowerCase().replace(/^www\./,'')).filter(d=>d&&d[0]!=='~'&&!d.includes('*')&&!d.includes('/')):[];
      if(doms&&!inc.length)continue;
      if(exc){if(!inc.length)E.gExc.add(sel);else inc.forEach(d=>addMap(E.siteExc,d,sel))}
      else if(!inc.length){const m=/^([.#])([A-Za-z_][\w-]*)$/.exec(sel);if(m)(m[1]==='.'?E.gClass:E.gId).add(m[2]);else E.gComplex.push(sel)}
      else inc.forEach(d=>addMap(E.site,d,sel));
      E.rules++;continue;
    }
    /* hosts file / plain domain list */
    let m=/^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)\s+([a-z0-9][a-z0-9.\-]*\.[a-z]{2,})\s*(#.*)?$/i.exec(l);
    if(m){const h=m[1].toLowerCase();if(h!=='localhost'&&h!=='localhost.localdomain'){E.block.set(h,1);E.rules++}continue}
    if(/^[a-z0-9][a-z0-9\-]*(\.[a-z0-9\-]+)+$/i.test(l)&&!l.includes('/')){E.block.set(l.toLowerCase(),1);E.rules++;continue}
    /* network */
    let allow=false;if(l.startsWith('@@')){allow=true;l=l.slice(2)}
    let opts=[];
    const di=l.lastIndexOf('$');
    if(di>-1&&/^[\w~,=|.\-*:]+$/.test(l.slice(di+1))){opts=l.slice(di+1).toLowerCase().split(',');l=l.slice(0,di)}
    if(l.length>2&&l[0]==='/'&&l.endsWith('/'))continue; // regex rule
    if(allow){
      const h=hostFromPattern(l);
      if(opts.some(o=>o==='document'||o==='doc')){if(h&&!opts.some(o=>o.startsWith('domain=')))E.siteOff.add(h);continue}
      if(opts.some(o=>o==='elemhide'||o==='ehide')){if(h)E.cosOff.add(h);continue}
      if(opts.some(o=>o==='generichide'||o==='ghide')){if(h)E.genOff.add(h);continue}
    }
    if(opts.some(o=>SKIP_OPT.test(o)))continue;
    const third=opts.includes('third-party')||opts.includes('3p');
    m=/^\|\|([a-z0-9.\-]+)(\^\|?|\^?)$/i.exec(l);
    if(m){const h=m[1].toLowerCase();if(allow)E.allow.add(h);else{const cur=E.block.get(h);E.block.set(h,cur===1||!third?1:2)}E.rules++;continue}
    const rx=patternToRx(l);if(!rx)continue;
    (allow?E.pAllow:E.pBlock).push([ruleToken(l),rx]);E.rules++;
  }
}
/* The longest literal run in a rule that is bounded on both sides, so it is guaranteed to be a
   whole [a-z0-9%] run of any URL the rule matches. Rules are indexed by it (as uBlock does): a URL
   is only tested against the rules whose token appears in it. */
const COMMON_TOK=new Set(['http','https','www','com','net','org','html','php','js','css','gif','png','jpg','jpeg','webp','svg','json','min','static','cdn','img','images','assets']);
function ruleToken(p){
  let s=p.toLowerCase(),boundedStart=false;
  if(s.startsWith('||')){s=s.slice(2);boundedStart=true}else if(s[0]==='|'){s=s.slice(1);boundedStart=true}
  let boundedEnd=false;if(s.endsWith('|')){s=s.slice(0,-1);boundedEnd=true}
  const isTok=c=>/[a-z0-9%]/.test(c);
  let best='';
  for(let i=0;i<s.length;){
    if(!isTok(s[i])){i++;continue}
    let j=i;while(j<s.length&&isTok(s[j]))j++;
    const before=i===0?(boundedStart?'|':''):s[i-1];
    const after=j===s.length?(boundedEnd?'|':''):s[j];
    const ok=b=>b&&b!=='*';
    const t=s.slice(i,j);
    if(ok(before)&&ok(after)&&t.length>=3&&!COMMON_TOK.has(t)&&t.length>best.length)best=t;
    i=j;
  }
  return best;
}
function indexRules(list){
  const idx=new Map(),rest=[];
  for(const [tok,src] of list){
    if(tok){let a=idx.get(tok);if(!a){a=[];idx.set(tok,a)}a.push({src,re:null})}
    else rest.push(src);
  }
  return{idx,fb:compileRx(rest)};
}
function testRules(R,url){
  const toks=url.toLowerCase().match(/[a-z0-9%]{3,}/g)||[];
  const seen=new Set();
  for(const t of toks){
    if(seen.has(t))continue;seen.add(t);
    const a=R.idx.get(t);if(!a)continue;
    for(const r of a){
      if(!r.re){try{r.re=new RegExp(r.src,'i')}catch(e){r.re=/(?!)/}}
      if(r.re.test(url))return true;
    }
  }
  for(const r of R.fb)if(r.test(url))return true;
  return false;
}
function compileRx(list){
  const out=[];
  for(let i=0;i<list.length;i+=200){
    const part=list.slice(i,i+200);
    try{out.push(new RegExp(part.join('|'),'i'))}
    catch(e){part.forEach(s=>{try{out.push(new RegExp(s,'i'))}catch(e2){}})}
  }
  return out;
}
let scratchDoc=null;
function validSel(sel){
  try{if(!scratchDoc)scratchDoc=document.implementation.createHTMLDocument('');scratchDoc.querySelector(sel);return true}catch(e){return false}
}
function chunkSelectors(list){
  const out=[];
  for(let i=0;i<list.length;i+=60){
    const part=list.slice(i,i+60);const joined=part.join(',');
    if(validSel(joined))out.push(joined);
    else part.forEach(s=>{if(validSel(s))out.push(s)});
  }
  return out;
}
function finishEngine(E){
  E.rxBlock=indexRules(E.pBlock);E.rxAllow=indexRules(E.pAllow);E.pBlock=E.pAllow=null;
  const gc=E.gComplex.filter(s=>!E.gExc.has(s));
  E.gChunks=chunkSelectors(gc);
  E.gExc.forEach(s=>{const m=/^([.#])([A-Za-z_][\w-]*)$/.exec(s);if(m)(m[1]==='.'?E.gClass:E.gId).delete(m[2])});
  return E;
}
let ENG=null,ENG_BUILT_AT=0;
const LIST_TEXT={};   // id → text loaded from Cache Storage
function buildEngine(){
  const E=newEngine();
  parseInto(E,BUILTIN);
  if(cfg().lists.includes('annoy')||cfg().cosmetic)parseInto(E,ANNOY_BUILTIN);
  for(const id of cfg().lists)if(LIST_TEXT[id])parseInto(E,LIST_TEXT[id]);
  parseInto(E,SH.rules);
  ENG=finishEngine(E);ENG_BUILT_AT=Date.now();
  SH.rulesBuilt=SH.rules;
  emit();
  return ENG;
}
let buildTimer=0;
function scheduleBuild(ms){clearTimeout(buildTimer);buildTimer=setTimeout(buildEngine,ms==null?60:ms)}
const engine=()=>ENG||buildEngine();
const listeners=new Set();
function emit(){listeners.forEach(f=>{try{f()}catch(e){}})}
function useShieldVersion(){const [,setV]=useState(0);useEffect(()=>{const f=()=>setV(v=>v+1);listeners.add(f);return()=>listeners.delete(f)},[])}

/* ---------- filter list storage (Cache Storage survives app updates; see sw.js) ---------- */
const LIST_CACHE='insta-filters-v1';
const META_KEY='insta_filter_meta';
const listMeta=()=>{try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')||{}}catch(e){return{}}};
function setListMeta(id,p){try{const m=listMeta();m[id]=Object.assign({},m[id]||{},p);localStorage.setItem(META_KEY,JSON.stringify(m))}catch(e){}}
async function readList(id){
  try{const c=await caches.open(LIST_CACHE);const r=await c.match('/filters/'+id);return r?await r.text():''}catch(e){return''}
}
async function writeList(id,text){try{const c=await caches.open(LIST_CACHE);await c.put('/filters/'+id,new Response(text,{headers:{'Content-Type':'text/plain'}}))}catch(e){}}
async function dropList(id){try{const c=await caches.open(LIST_CACHE);await c.delete('/filters/'+id)}catch(e){}delete LIST_TEXT[id];setListMeta(id,{at:0,rules:0,size:0,err:''})}
const updating=new Set();
async function updateList(id){
  const L=FILTER_LISTS.find(x=>x.id===id);if(!L||updating.has(id))return false;
  updating.add(id);emit();
  try{
    const r=await fetch(L.url,{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const t=await r.text();
    if(t.length<500)throw new Error('list looks empty');
    LIST_TEXT[id]=t;await writeList(id,t);
    const E=newEngine();parseInto(E,t);
    setListMeta(id,{at:Date.now(),rules:E.rules,size:t.length,err:''});
    scheduleBuild(30);
    return true;
  }catch(e){setListMeta(id,{err:String(e&&e.message||e)});return false}
  finally{updating.delete(id);emit()}
}
async function bootLists(){
  const ids=cfg().lists.slice();
  for(const id of ids){const t=await readList(id);if(t)LIST_TEXT[id]=t}
  buildEngine();
  /* refresh enabled lists that are missing or a week old, one at a time, in the background */
  const meta=listMeta();
  setTimeout(async()=>{
    if(navigator.onLine===false)return;
    for(const id of cfg().lists){const m=meta[id]||{};if(!LIST_TEXT[id]||Date.now()-(m.at||0)>7*86400000)await updateList(id)}
  },LIST_TEXT[ids[0]]?8000:1500);
}
async function setListEnabled(id,on,set){
  const lists=cfg().lists.filter(x=>x!==id).concat(on?[id]:[]);
  set({shields:Object.assign({},cfg(),{lists})});
  SH.g=Object.assign({},SH.g,{lists});
  if(on){const t=await readList(id);if(t){LIST_TEXT[id]=t;scheduleBuild(30)}else await updateList(id)}
  else{delete LIST_TEXT[id];scheduleBuild(30)}
}

/* ---------- matching ---------- */
function netBlocked(E,url,pageHost){
  const host=hostOf(url);if(!host)return'';
  if(suffixHas(E.allow,host))return'';
  const b=suffixGet(E.block,host);
  if(b===1||(b===2&&baseDomain(host)!==baseDomain(pageHost)))return host;
  if(E.rxBlock&&testRules(E.rxBlock,url))return E.rxAllow&&testRules(E.rxAllow,url)?'':host;
  return'';
}
function isBlockedUrl(url,pageUrl){
  const sc=siteCfg(pageUrl||url);if(!sc.shields)return false;
  const E=engine();if(suffixHas(E.siteOff,siteKey(pageUrl||url)))return false;
  return!!netBlocked(E,url,hostOf(pageUrl||url));
}

/* ============================== applying shields to a Smart page ============================== */
function begin(url){
  const sc=siteCfg(url);const E=engine();
  const host=hostOf(url);
  const on=sc.shields&&!suffixHas(E.siteOff,host.replace(/^www\./,''));
  return{url,sc,E,host,on,blocked:0,hidden:0,cleaned:0,hosts:{}};
}
/* for <iframe>s before they become links: true = drop it */
function frameBlocked(st,src){
  if(!st||!st.on)return false;
  const b=netBlocked(st.E,src,st.host);
  if(b){st.blocked++;st.hosts[b]=(st.hosts[b]||0)+1;return true}
  return false;
}
const DARK_CSS='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}'+
  'img,video,picture,canvas,iframe,embed,object,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
function srcOf(el){
  const tag=el.tagName;
  if(tag==='A')return el.getAttribute('href')||'';
  if(tag==='LINK')return el.getAttribute('href')||'';
  if(tag==='OBJECT')return el.getAttribute('data')||'';
  let s=el.getAttribute('src')||'';
  if(!s&&(tag==='SOURCE'||tag==='IMG')){const ss=el.getAttribute('srcset')||'';s=ss.trim().split(/\s+/)[0]||''}
  return s;
}
function abs(u,base){try{return new URL(u,base).href}catch(e){return''}}
function removeEl(el){try{el.remove()}catch(e){}}
/* runs after scripts are stripped; mutates doc, returns stats */
function apply(doc,st){
  if(!st)return null;
  const {sc,E,url}=st;const g=cfg();
  const body=doc.body;
  if(st.on&&body){
    /* network: images, media, frames, stylesheets, ad links */
    const kill=[];
    doc.querySelectorAll('img,source,video,audio,track,iframe,embed,object,link[rel~="stylesheet"],input[type=image],a[href]').forEach(el=>{
      const raw=srcOf(el);if(!raw||/^(data|blob|about|javascript|#)/i.test(raw))return;
      const u=abs(raw,url);if(!/^https?:/.test(u))return;
      if(el.tagName==='A'){
        if(!el.querySelector('img,picture,video,iframe'))return; // text links stay (search results, citations)
      }
      const b=netBlocked(E,u,st.host);
      if(b){kill.push(el);st.blocked++;st.hosts[b]=(st.hosts[b]||0)+1}
    });
    /* tracking pixels: 1×1 images */
    doc.querySelectorAll('img[width][height]').forEach(im=>{
      const w=parseInt(im.getAttribute('width'),10),hgt=parseInt(im.getAttribute('height'),10);
      if(w<=2&&hgt<=2&&!kill.includes(im)){kill.push(im);st.blocked++;const hh=hostOf(abs(srcOf(im),url))||'pixel';st.hosts[hh]=(st.hosts[hh]||0)+1}
    });
    kill.forEach(el=>{const p=el.parentElement;removeEl(el);if(p&&p.tagName==='PICTURE'&&!p.querySelector('img,source'))removeEl(p)});
    /* cosmetic */
    if(sc.cosmetic&&!suffixHas(E.cosOff,st.host.replace(/^www\./,'')))st.hidden+=cosmetic(doc,st);
  }
  /* the element picker's choices apply even with shields off */
  if(sc.hide.length&&body)sc.hide.forEach(sel=>{try{doc.querySelectorAll(sel).forEach(el=>{if(el!==body&&el!==doc.documentElement){removeEl(el);st.hidden++}})}catch(e){}});
  /* URL hygiene for links on the page */
  if(body&&(g.cleanUrls||g.unwrap||g.deamp))doc.querySelectorAll('a[href]').forEach(a=>{
    const raw=a.getAttribute('href')||'';if(!/^https?:/i.test(raw))return;
    const c=navUrl(raw);if(c!==raw){a.setAttribute('href',c);st.cleaned++}
  });
  if(!sc.images&&body){
    doc.querySelectorAll('img,picture,source[srcset],video[poster]').forEach(el=>{if(el.tagName==='VIDEO')el.removeAttribute('poster');else removeEl(el)});
  }
  if(sc.autoplay)doc.querySelectorAll('video[autoplay],audio[autoplay]').forEach(v=>{v.removeAttribute('autoplay');v.setAttribute('preload','none')});
  let head=doc.head;if(!head){head=doc.createElement('head');doc.documentElement.prepend(head)}
  if(g.referrer){
    const m=doc.createElement('meta');m.setAttribute('name','referrer');m.setAttribute('content','no-referrer');head.prepend(m);
  }
  let css='';
  if(!sc.images)css+='*{background-image:none!important}';
  if(sc.dark)css+=DARK_CSS;
  if(sc.zoom&&sc.zoom!==100)css+='html{zoom:'+(sc.zoom/100)+'}';
  if(sc.css)css+=String(sc.css).replace(/<\/style/gi,'');
  if(css){const s=doc.createElement('style');s.setAttribute('data-shields','1');s.textContent=css;head.appendChild(s)}
  return{blocked:st.blocked,hidden:st.hidden,cleaned:st.cleaned,hosts:st.hosts,on:st.on};
}
function cosmetic(doc,st){
  const {E,host}=st;const bare=host.replace(/^www\./,'');
  const kill=new Set();
  const exc=new Set();
  suffixes(bare).forEach(k=>{const a=E.siteExc.get(k);if(a)a.forEach(s=>exc.add(s))});
  const body=doc.body;
  if(!suffixHas(E.genOff,bare)){
    const all=body.getElementsByTagName('*');
    for(let i=0;i<all.length;i++){
      const el=all[i];
      if(el.id&&E.gId.has(el.id)&&!exc.has('#'+el.id)){kill.add(el);continue}
      const cl=el.classList;
      for(let j=0;j<cl.length;j++){if(E.gClass.has(cl[j])&&!exc.has('.'+cl[j])){kill.add(el);break}}
    }
    for(const sel of E.gChunks){
      if(exc.size&&exc.has(sel))continue;
      try{doc.querySelectorAll(sel).forEach(el=>kill.add(el))}catch(e){}
    }
  }
  suffixes(bare).forEach(k=>{const a=E.site.get(k);if(a)a.forEach(sel=>{if(exc.has(sel))return;try{doc.querySelectorAll(sel).forEach(el=>kill.add(el))}catch(e){}})});
  let n=0;
  kill.forEach(el=>{
    if(el===body||el===doc.documentElement||el.tagName==='MAIN'||el.tagName==='HEAD')return;
    /* guard against a rule hitting the article itself */
    if(el.querySelector&&el.querySelector('h1')&&(el.textContent||'').length>3000)return;
    if(!el.isConnected)return;
    removeEl(el);n++;
  });
  return n;
}

/* ============================== element picker ============================== */
const okName=s=>/^[A-Za-z][\w-]{0,40}$/.test(s)&&!/\d{3,}/.test(s)&&!/^(css|sc|jsx|svelte|emotion|styled)-/.test(s);
function cssEsc(s){try{return CSS.escape(s)}catch(e){return s.replace(/[^\w-]/g,'\\$&')}}
function selectorFor(el){
  if(!el||el.nodeType!==1)return'';
  const doc=el.ownerDocument;
  if(el.id&&okName(el.id))return'#'+cssEsc(el.id);
  const parts=[];let n=el;
  for(let d=0;n&&n.nodeType===1&&n.tagName!=='BODY'&&n.tagName!=='HTML'&&d<5;d++){
    if(n.id&&okName(n.id)){parts.unshift('#'+cssEsc(n.id));break}
    let s=n.tagName.toLowerCase();
    const cls=Array.from(n.classList).filter(c=>okName(c)&&!/^(active|open|show|visible|hidden|selected|is-|has-)/.test(c)).slice(0,2);
    if(cls.length)s+='.'+cls.map(cssEsc).join('.');
    else{const p=n.parentElement;if(p){const sib=Array.from(p.children).filter(x=>x.tagName===n.tagName);if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(n)+1)+')'}}
    parts.unshift(s);
    try{if(cls.length&&doc.querySelectorAll(parts.join(' > ')).length===1)break}catch(e){}
    n=n.parentElement;
  }
  return parts.join(' > ');
}

/* ============================== site settings writes ============================== */
function setSite(set,S,key,patch){
  const all=Object.assign({},S.siteShields||{});
  if(patch===null)delete all[key];
  else{
    const cur=Object.assign({},all[key]||{},patch);
    Object.keys(cur).forEach(k=>{if(cur[k]==null||(Array.isArray(cur[k])&&!cur[k].length)||(k==='css'&&!cur[k]))delete cur[k]});
    if(Object.keys(cur).length)all[key]=cur;else delete all[key];
  }
  SH.sites=all;
  set({siteShields:all});
}
function setG(set,patch){const n=Object.assign({},cfg(),patch);SH.g=n;set({shields:n})}

/* ============================== history ============================== */
function histDays(){const v=cfg().hist;return v==='all'?0:v==='off'?-1:Number(v)||0}
function trimHistory(list){
  const d=histDays();if(!Array.isArray(list))return[];
  if(d<0)return[];
  if(!d)return list;
  const cut=Date.now()-d*86400000;return list.filter(x=>(x.at||0)>=cut);
}
function recordVisit(update,url,title){
  if(histDays()<0||!/^https?:/.test(url||''))return;
  update(d=>{
    let list=Array.isArray(d.siteHistory)?d.siteHistory:[];
    list=typeof recordBrowserVisit==='function'?recordBrowserVisit(list,url,title):list;
    return Object.assign({},d,{siteHistory:trimHistory(list)});
  });
}

/* ============================== address bar suggestions ============================== */
function suggest(q,src){
  q=String(q||'').trim().toLowerCase();if(!q)return[];
  const out=[];const seen=new Set();
  const score=(url,title)=>{
    const u=String(url||'').toLowerCase().replace(/^https?:\/\/(www\.)?/,'');const t=String(title||'').toLowerCase();
    if(u.startsWith(q))return 3;if(t.startsWith(q))return 2.5;
    if(u.includes(q))return 2;if(t.includes(q))return 1.5;
    const words=q.split(/\s+/);if(words.length>1&&words.every(w=>u.includes(w)||t.includes(w)))return 1;
    return 0;
  };
  (src.tabs||[]).forEach(t=>{if(!t.url||t.active)return;const s=score(t.url,t.title);if(s){out.push({kind:'tab',url:t.url,title:t.title||t.url,id:t.id,s:s+1});seen.add(t.url)}});
  (src.sites||[]).forEach(b=>{if(seen.has(b.url))return;const s=score(b.url,b.name);if(s){out.push({kind:'bookmark',url:b.url,title:b.name||b.url,s:s+0.6});seen.add(b.url)}});
  (src.history||[]).forEach(x=>{if(seen.has(x.url))return;const s=score(x.url,x.name);if(s){out.push({kind:'history',url:x.url,title:x.name||x.url,s:s+Math.min(0.5,(x.count||1)/20),at:x.at});seen.add(x.url)}});
  out.sort((a,b)=>b.s-a.s||(b.at||0)-(a.at||0));
  return out.slice(0,10);
}

/* ============================== bookmarks HTML (Netscape format) ============================== */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function bookmarksHtml(sites,folders){
  const now=Math.floor(Date.now()/1000);
  const row=s=>'<DT><A HREF="'+esc(s.url)+'" ADD_DATE="'+now+'">'+esc(s.name||s.url)+'</A>\n';
  let out='<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  (folders||[]).forEach(f=>{
    const items=(sites||[]).filter(s=>s.folderId===f.id);
    out+='<DT><H3 ADD_DATE="'+now+'">'+esc(f.name)+'</H3>\n<DL><p>\n'+items.map(row).join('')+'</DL><p>\n';
  });
  const fids=new Set((folders||[]).map(f=>f.id));
  (sites||[]).filter(s=>!s.folderId||!fids.has(s.folderId)).forEach(s=>{out+=row(s)});
  return out+'</DL><p>\n';
}
function parseBookmarksHtml(html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const out=[];
  doc.querySelectorAll('a[href]').forEach(a=>{
    const url=a.getAttribute('href')||'';if(!/^https?:/i.test(url))return;
    let folder='';let dl=a.closest('dl');
    while(dl){const prev=dl.previousElementSibling;const h3=prev&&(prev.tagName==='H3'?prev:prev.querySelector&&prev.querySelector('h3'));
      const dt=dl.parentElement&&dl.parentElement.tagName==='DT'?dl.parentElement.querySelector(':scope > h3'):null;
      const hh=h3||dt;if(hh){folder=(hh.textContent||'').trim();break}dl=dl.parentElement&&dl.parentElement.closest('dl')}
    out.push({url,name:(a.textContent||'').trim()||url,folder});
  });
  /* plain text / JSON fallbacks */
  if(!out.length){String(html).split(/\s+/).forEach(w=>{if(/^https?:\/\/\S+$/i.test(w))out.push({url:w,name:w,folder:''})})}
  return out;
}
function importBookmarks(update,items){
  let added=0;
  update(d=>{
    const sites=(d.sites||[]).slice();const folders=(d.siteFolders||[]).slice();
    const have=new Set(sites.map(s=>s.url));
    const fid=name=>{if(!name)return null;let f=folders.find(x=>x.name===name);if(!f){f={id:uid(),name};folders.push(f)}return f.id};
    items.forEach(it=>{if(have.has(it.url))return;have.add(it.url);sites.push({id:uid(),name:it.name,url:it.url,folderId:fid(it.folder)});added++});
    return Object.assign({},d,{sites,siteFolders:folders});
  });
  return added;
}
function downloadText(name,text,type){
  const blob=new Blob([text],{type:type||'text/plain'});
  try{
    const file=new File([blob],name,{type:type||'text/plain'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){navigator.share({files:[file],title:name}).catch(()=>{});return}
  }catch(e){}
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);try{a.remove()}catch(e){}},1500);
}

/* ============================== icons ============================== */
const SI={
  shield:(s,fill)=>Svg({size:s},P('M12 3.2 5 6v5.6c0 4.3 3 7.8 7 9.2 4-1.4 7-4.9 7-9.2V6l-7-2.8Z',fill?{fill:'currentColor'}:{})),
  shieldOff:s=>Svg({size:s},P('M12 3.2 5 6v5.6c0 4.3 3 7.8 7 9.2 4-1.4 7-4.9 7-9.2V6l-7-2.8Z'),P('M4 4l16 16')),
  mask:s=>Svg({size:s},P('M3.5 10c0-1.4 1.1-2.5 2.5-2.5h12c1.4 0 2.5 1.1 2.5 2.5v1.2c0 2.6-2.1 4.8-4.8 4.8-1.5 0-2.4-.9-3.7-2.2-1.3 1.3-2.2 2.2-3.7 2.2C5.6 16 3.5 13.8 3.5 11.2Z'),h('circle',{cx:8,cy:11,r:1.3,fill:'currentColor'}),h('circle',{cx:16,cy:11,r:1.3,fill:'currentColor'})),
  code:s=>Svg({size:s},P('M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5')),
  pick:s=>Svg({size:s},P('M5 5l5.5 14 2-6 6-2L5 5Z')),
  reader:s=>Svg({size:s},P('M4 5.5h16M4 10h16M4 14.5h10M4 19h7')),
  eraser:s=>Svg({size:s},P('M8.5 19.5h11M4.8 14.7l8.9-8.9a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8l-7.7 7.7a2 2 0 0 1-1.4.6H8.3a2 2 0 0 1-1.4-.6l-2.1-2.1a1.5 1.5 0 0 1 0-2.2Z')),
  bookmark:s=>Svg({size:s},P('M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z')),
  list:s=>Svg({size:s},P('M8.5 6.5h11M8.5 12h11M8.5 17.5h11'),h('circle',{cx:4.8,cy:6.5,r:1,fill:'currentColor'}),h('circle',{cx:4.8,cy:12,r:1,fill:'currentColor'}),h('circle',{cx:4.8,cy:17.5,r:1,fill:'currentColor'})),
  grid:s=>Svg({size:s},h('rect',{x:4,y:4,width:7,height:7,rx:1.6,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:13,y:4,width:7,height:7,rx:1.6,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:4,y:13,width:7,height:7,rx:1.6,stroke:'currentColor',strokeWidth:1.7}),h('rect',{x:13,y:13,width:7,height:7,rx:1.6,stroke:'currentColor',strokeWidth:1.7}))
};

/* ============================== UI ============================== */
const fmtSize=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?Math.round(n/1024)+' KB':n+' B';
function ago(ts){if(!ts)return'never';const s=(Date.now()-ts)/1000;if(s<90)return'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';return Math.round(s/86400)+' days ago'}
const pad={padding:'0 20px'};
const small=T=>({fontSize:12,color:T.sub,lineHeight:1.5});

/* per-site shields panel: what was blocked here, and this site's settings */
function SiteShieldSheet({T,S,set,tab,onReload,onPick,onClose,onOpenSettings}){
  const {Switch,Row,Stepper,Chip,SectionTitle,inputS}=UI();
  useShieldVersion();
  const url=tab&&tab.url||'';const key=siteKey(url);
  const sc=siteCfg(url);const st=tab&&tab.shield;
  const [showHosts,setShowHosts]=useState(false);
  const [css,setCss]=useState(sc.css);
  const dirty=useRef(false);
  const patch=p=>{setSite(set,S,key,p);dirty.current=true};
  const close=()=>{if(dirty.current)onReload();onClose()};
  const hosts=st&&st.hosts?Object.entries(st.hosts).sort((a,b)=>b[1]-a[1]):[];
  const smart=tab&&tab.mode==='smart';
  return h(Sheet,{T,onClose:close,title:'Shields',z:97,maxH:'92%'},
    h('div',{style:Object.assign({},pad,{paddingBottom:18,fontFamily:UIF})},
      h('div',{style:{display:'flex',alignItems:'center',gap:12,padding:'4px 0 12px'}},
        h('span',{style:{width:44,height:44,borderRadius:12,background:sc.shields?'#2f9e44':T.card,color:sc.shields?'#fff':T.sub,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},sc.shields?SI.shield(24,true):SI.shieldOff(24)),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:16,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},key||'This page'),
          h('div',{style:small(T)},sc.shields?'Shields are up on this site':'Shields are down on this site'))),
      smart?h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:6}},
        [[st?st.blocked:0,'ads & trackers blocked'],[st?st.hidden:0,'elements removed'],[st?st.cleaned:0,'links cleaned']].map(([n,l],i)=>
          h('div',{key:i,style:{background:T.card,borderRadius:12,padding:'10px 8px',textAlign:'center'}},
            h('div',{style:{fontSize:22,fontWeight:700}},n||0),h('div',{style:{fontSize:11,color:T.sub,lineHeight:1.3,marginTop:2}},l)))):
        h('div',{style:Object.assign({},small(T),{background:T.card,borderRadius:12,padding:'10px 12px',marginBottom:6})},'This tab is in Live view — the real site runs with its own scripts, so blocking can’t reach inside it. Pop-up, referrer and HTTPS settings still apply. Switch to Smart view to block ads and trackers.'),
      hosts.length?h('button',{onClick:()=>setShowHosts(v=>!v),style:{fontSize:13,color:T.accent,fontWeight:600,padding:'6px 0'}},(showHosts?'Hide':'Show')+' blocked servers ('+hosts.length+')'):null,
      showHosts?h('div',{style:{background:T.card,borderRadius:10,padding:'6px 10px',margin:'4px 0'}},hosts.map(([hh,n])=>h('div',{key:hh,style:{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'4px 0',borderBottom:'1px solid '+T.hair}},h('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},hh),h('span',{style:{color:T.sub,marginLeft:8}},n)))):null,
      SectionTitle({T,children:'This site'}),
      h(Row,{T,label:'Shields',sub:'Block ads, trackers and tracking pixels'},h(Switch,{T,on:sc.shields,onChange:v=>patch({shields:v})})),
      h(Row,{T,label:'Remove ad boxes',sub:'Cosmetic filtering — empty ad slots and banners'},h(Switch,{T,on:sc.cosmetic,onChange:v=>patch({cosmetic:v})})),
      h(Row,{T,label:'Images',sub:'Turn off to save data'},h(Switch,{T,on:sc.images,onChange:v=>patch({images:v})})),
      h(Row,{T,label:'Force dark',sub:'Darken this site'},h(Switch,{T,on:sc.dark,onChange:v=>patch({dark:v})})),
      h(Row,{T,label:'Block autoplay',sub:'Videos and audio wait for a tap'},h(Switch,{T,on:sc.autoplay,onChange:v=>patch({autoplay:v})})),
      h(Row,{T,label:'Allow pop-ups',sub:'Live view: new windows and login pop-ups'},h(Switch,{T,on:sc.popups,onChange:v=>patch({popups:v})})),
      h(Row,{T,label:'JavaScript',sub:sc.js==='live'?'Allowed — always opens in Live view':sc.js==='smart'?'Blocked — always opens in Smart view':'Follows your default view'},
        h('div',{style:{display:'flex',gap:6}},[['','Auto'],['live','On'],['smart','Off']].map(([v,l])=>h(Chip,{key:l,T,active:sc.js===v,onClick:()=>patch({js:v||null}),style:{padding:'6px 10px'}},l)))),
      h(Row,{T,label:'Page zoom',sub:'Smart view'},h(Stepper,{T,value:sc.zoom,min:50,max:250,step:10,onChange:v=>patch({zoom:v===100?null:v}),fmt:v=>v+'%'})),
      SectionTitle({T,children:'Hidden elements'}),
      sc.hide.length?sc.hide.map((sel,i)=>h('div',{key:i,style:{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid '+T.hair}},
        h('code',{style:{flex:1,minWidth:0,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},sel),
        h('button',{onClick:()=>patch({hide:sc.hide.filter(x=>x!==sel)}),style:{color:T.danger,fontSize:13,fontWeight:600}},'Remove'))):
        h('div',{style:small(T)},'Nothing hidden yet. Tap “Hide an element” and then tap any banner, box or bar on the page.'),
      smart?h('div',{style:{marginTop:10}},h(Chip,{T,onClick:()=>{onClose();onPick()}},'✂︎ Hide an element…')):null,
      SectionTitle({T,children:'Custom CSS for this site'}),
      h('textarea',{value:css,onChange:e=>setCss(e.target.value),onBlur:()=>{if(css!==sc.css)patch({css:css||null})},placeholder:'e.g. body { font-size: 19px }  .sidebar { display: none }',rows:3,spellCheck:false,autoCapitalize:'none',
        style:Object.assign(inputS(T),{fontFamily:'ui-monospace,Menlo,monospace',fontSize:13,resize:'vertical'})}),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}},
        sc.custom?h(Chip,{T,onClick:()=>{setSite(set,S,key,null);dirty.current=true;setCss('')}},'Reset this site'):null,
        h(Chip,{T,onClick:()=>{onClose();onOpenSettings()}},'All privacy settings →'))));
}

/* global Privacy & Shields settings */
function ShieldSettingsSheet({T,S,set,data,update,onClose,toastFn,onClearData,safari}){
  const {Switch,Row,Chip,SectionTitle,inputS}=UI();
  useShieldVersion();
  const g=cfg();const meta=listMeta();
  const [rules,setRules]=useState(S.filterRules||'');
  const [home,setHome]=useState(g.homeUrl||'');
  const fileRef=useRef(null);
  const sw=(k,label,sub)=>h(Row,{T,label,sub},h(Switch,{T,on:!!g[k],onChange:v=>setG(set,{[k]:v})}));
  const E=ENG;
  const total=E?E.rules:0;
  const siteKeys=Object.keys(S.siteShields||{});
  return h(Sheet,{T,onClose,title:'Privacy & Shields',z:97,maxH:'94%'},
    h('div',{style:Object.assign({},pad,{paddingBottom:24,fontFamily:UIF})},
      h('div',{style:small(T)},'Inspired by Cromite. Changes save automatically and apply to the next page you open.'),
      safari?h(SafariBlock,{T}):null,
      safari?null:SectionTitle({T,children:'Shields'}),
      safari?null:h(Fragment,null,
      sw('on','Block ads & trackers','Smart view removes ad, tracker and pixel requests before the page draws'),
      sw('cosmetic','Remove ad boxes & cookie banners','Cosmetic filtering of empty slots, consent walls and “open in app” bars'),
      sw('autoplay','Block autoplay','Videos and audio wait until you tap play'),
      sw('images','Load images','Turn off for a fast, text-only web'),
      sw('dark','Force dark pages','Darken every site (Smart view)')),
      SectionTitle({T,children:'Tracking protection'}),
      sw('cleanUrls','Strip tracking parameters','Removes utm_*, fbclid, gclid, igshid, Google’s rlz/ved… from every link'),
      sw('unwrap','Skip redirect wrappers','google.com/url, l.facebook.com, out.reddit.com… go straight to the site'),
      sw('deamp','Skip AMP pages','Opens the publisher’s real page instead of Google AMP'),
      sw('https','Upgrade to HTTPS','Every http:// link opens over https://'),
      sw('referrer','Hide where you came from','Pages don’t learn which site linked you there'),
      sw('socialInApp','YouTube, Instagram & X inside the app','Videos, posts, reels and profiles open in the app’s own viewer instead of Safari'),
      sw('noApps','Keep links in Safari','Stops YouTube, Instagram, Amazon… opening their apps instead of the website (iOS 17+)'),
      safari?null:sw('popups','Block pop-ups in Live view','Allow them per site from the shield; logins sometimes need them'),
      safari?null:h(Fragment,null,
      SectionTitle({T,children:'Filter lists'}),
      h('div',{style:small(T)},'Built-in list is always on. '+(total?total.toLocaleString()+' rules active.':'')),
      FILTER_LISTS.map(L=>{
        const on=g.lists.includes(L.id);const m=meta[L.id]||{};const busy=updating.has(L.id);
        return h(Row,{key:L.id,T,label:L.name,sub:L.sub+(on?' · '+(busy?'downloading…':m.err?'⚠ '+m.err:m.at?(m.rules||0).toLocaleString()+' rules · '+fmtSize(m.size||0)+' · updated '+ago(m.at):'not downloaded yet'):'')},
          h(Switch,{T,on,onChange:v=>setListEnabled(L.id,v,set)}));
      }),
      h('div',{style:{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}},
        h(Chip,{T,onClick:async()=>{toastFn('Updating filter lists…');let ok=0;for(const id of g.lists)if(await updateList(id))ok++;toastFn(ok+' of '+g.lists.length+' lists updated')}},'↻ Update lists now')),
      SectionTitle({T,children:'My filters'}),
      h('div',{style:Object.assign({},small(T),{marginBottom:6})},'Adblock Plus syntax: ',h('code',null,'||ads.example.com^'),' blocks a server, ',h('code',null,'example.com##.promo'),' hides on one site, ',h('code',null,'##.banner'),' everywhere, ',h('code',null,'@@||site.com^'),' allows.'),
      h('textarea',{value:rules,onChange:e=>setRules(e.target.value),rows:5,spellCheck:false,autoCapitalize:'none',autoCorrect:'off',placeholder:'One rule per line',
        style:Object.assign(inputS(T),{fontFamily:'ui-monospace,Menlo,monospace',fontSize:13,resize:'vertical'})}),
      h('div',{style:{display:'flex',gap:8,marginTop:8}},h(Chip,{T,active:rules!==(S.filterRules||''),onClick:()=>{set({filterRules:rules});SH.rules=rules;scheduleBuild(20);toastFn('Filters saved')}},'Save filters'))),
      SectionTitle({T,children:safari?'Search':'Search & new tabs'}),
      h('div',{style:Object.assign({},small(T),{marginBottom:8})},'Address-bar search engine. “Default” uses the engine from Settings → Browser & Sites (also used by the agent).'),
      h('div',{style:{display:'flex',gap:7,flexWrap:'wrap'}},
        h(Chip,{T,active:!g.addrEngine,onClick:()=>setG(set,{addrEngine:''})},'Default'),
        Object.keys(ADDR_ENGINES).map(k=>h(Chip,{key:k,T,active:g.addrEngine===k,onClick:()=>setG(set,{addrEngine:k})},ADDR_ENGINES[k].label))),
      g.addrEngine?h('div',{style:Object.assign({},small(T),{marginTop:6})},ADDR_ENGINES[g.addrEngine].sub):null,
      safari?null:h(Fragment,null,
      h('div',{style:{fontSize:14,fontWeight:500,margin:'14px 0 6px'}},'Home page for new tabs'),
      h('input',{value:home,onChange:e=>setHome(e.target.value),onBlur:()=>setG(set,{homeUrl:normalizeUrl(home)||''}),placeholder:'Leave empty for the start page',inputMode:'url',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,style:inputS(T)}),
      sw('listMode','Tab switcher as a list','Instead of the grid of cards')),
      SectionTitle({T,children:'Private browsing'}),
      safari?sw('incognito','Private mode','Sites you open aren’t added to History (also the mask button)'):sw('incognito','Always open private tabs','New tabs aren’t remembered and don’t add to history'),
      h('div',{style:{fontSize:14,fontWeight:500,margin:'12px 0 6px'}},'Keep browsing history'),
      h('div',{style:{display:'flex',gap:7,flexWrap:'wrap'}},HIST_OPTS.map(([v,l])=>h(Chip,{key:v,T,active:g.hist===v,onClick:()=>{setG(set,{hist:v});update(d=>Object.assign({},d,{siteHistory:trimHistory(d.siteHistory||[])}))}},l))),
      h('div',{style:{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}},h(Chip,{T,onClick:onClearData,style:{color:T.danger}},'Clear browsing data…')),
      SectionTitle({T,children:'Bookmarks'}),
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
        h(Chip,{T,onClick:()=>{downloadText('bookmarks-'+new Date().toISOString().slice(0,10)+'.html',bookmarksHtml(data.sites||[],data.siteFolders||[]),'text/html');toastFn('Bookmarks exported')}},'Export (HTML)'),
        h(Chip,{T,onClick:()=>fileRef.current&&fileRef.current.click()},'Import from Chrome / Safari / Firefox…'),
        h('input',{ref:fileRef,type:'file',accept:'.html,.htm,text/html,.txt',style:{display:'none'},onChange:async e=>{
          const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
          const items=parseBookmarksHtml(await f.text());
          if(!items.length){toastFn('No links found in that file');return}
          const n=importBookmarks(update,items);toastFn(n?'Imported '+n+' bookmark'+(n>1?'s':''):'All of those are already saved')}})),
      siteKeys.length?h(Fragment,null,
        SectionTitle({T,children:'Sites with custom settings ('+siteKeys.length+')'}),
        siteKeys.map(k=>h('div',{key:k,style:{display:'flex',alignItems:'center',gap:8,padding:'9px 0',borderBottom:'1px solid '+T.hair}},
          h('span',{style:{flex:1,minWidth:0,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},k),
          h('span',{style:{fontSize:11.5,color:T.sub}},Object.keys(S.siteShields[k]).join(', ')),
          h('button',{onClick:()=>setSite(set,S,k,null),style:{color:T.danger,fontSize:13,fontWeight:600}},'Reset')))):null));
}

/* Safari is a separate app: the only way to block ads inside it from here is encrypted DNS that
   drops ad and tracker servers for the whole phone — an iOS configuration profile */
function SafariBlock({T}){
  const {SectionTitle}=UI();
  const base=location.href.replace(/[#?].*$/,'').replace(/[^/]*$/,'');
  const btn=(label,sub,file)=>h('button',{onClick:()=>openExternalUrl(base+file),className:'act98',style:{display:'block',width:'100%',textAlign:'left',padding:'12px 14px',borderRadius:12,background:T.fg,color:T.bg,marginTop:8}},
    h('span',{style:{display:'block',fontSize:15,fontWeight:650}},label),h('span',{style:{display:'block',fontSize:12,opacity:.75,marginTop:2}},sub));
  return h(Fragment,null,
    SectionTitle({T,children:'Block ads in Safari'}),
    h('div',{style:small(T)},'Links from this screen open in Safari, which this app can’t reach inside. Install an ad-blocking DNS profile and Safari (and every other app) stops loading ad and tracker servers — the same idea as Cromite’s built-in blocker, for the whole phone.'),
    btn('Install AdGuard DNS','Recommended · blocks ads & trackers','adblock-adguard.mobileconfig'),
    btn('Install Mullvad DNS','Alternative · no logging','adblock-mullvad.mobileconfig'),
    h('div',{style:Object.assign({},small(T),{marginTop:8})},'After tapping: Allow the download → open Settings → “Profile Downloaded” → Install. Turn it off or remove it any time in Settings → General → VPN & Device Management. YouTube ads aren’t blocked by DNS.'));
}

/* clear browsing data (Cromite keeps Chromium's dialog; this is the PWA version) */
function ClearDataSheet({T,update,onClose,onClearTabs,toastFn}){
  const {SectionTitle,Chip}=UI();
  const [range,setRange]=useState('all');
  const [pick,setPick]=useState({history:true,tabs:false,smart:true,sites:false,runs:false,lists:false});
  const tg=k=>setPick(p=>Object.assign({},p,{[k]:!p[k]}));
  const box=(k,label,sub)=>h('button',{onClick:()=>tg(k),className:'act98',style:{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'12px 0',borderBottom:'1px solid '+T.hair,color:T.fg}},
    h('span',{style:{width:22,height:22,borderRadius:6,border:'2px solid '+(pick[k]?T.accent:T.hair),background:pick[k]?T.accent:'transparent',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}},pick[k]?'✓':''),
    h('span',{style:{flex:1}},h('span',{style:{display:'block',fontSize:15}},label),sub?h('span',{style:{display:'block',fontSize:12,color:T.sub,marginTop:2}},sub):null));
  const go=async()=>{
    const ms={hour:3600000,day:86400000,week:7*86400000}[range]||0;const cut=ms?Date.now()-ms:0;
    update(d=>{
      const n=Object.assign({},d);
      if(pick.history)n.siteHistory=cut?(d.siteHistory||[]).filter(x=>(x.at||0)<cut):[];
      if(pick.runs)n.agentRuns=cut?(d.agentRuns||[]).filter(r=>(r.startedAt||0)<cut):[];
      if(pick.sites)n.settings=Object.assign({},d.settings,{siteShields:{}});
      return n;
    });
    if(pick.sites)SH.sites={};
    if(pick.smart){try{localStorage.removeItem('insta_smart_blocked')}catch(e){}}
    if(pick.lists){for(const L of FILTER_LISTS)await dropList(L.id);scheduleBuild(10)}
    if(pick.tabs)onClearTabs();
    toastFn('Browsing data cleared');onClose();
  };
  return h(Sheet,{T,onClose,title:'Clear browsing data',z:98,maxH:'90%'},
    h('div',{style:Object.assign({},pad,{fontFamily:UIF})},
      SectionTitle({T,children:'Time range'}),
      h('div',{style:{display:'flex',gap:7,flexWrap:'wrap',marginBottom:6}},[['hour','Last hour'],['day','Last 24 hours'],['week','Last 7 days'],['all','All time']].map(([v,l])=>h(Chip,{key:v,T,active:range===v,onClick:()=>setRange(v)},l))),
      box('history','Browsing history','Also clears Most visited on the Browse screen'),
      box('tabs','Open tabs','Closes every tab'),
      box('smart','Smart-view memory','Sites remembered as needing Live view'),
      box('runs','Agent history','Browser Agent task runs'),
      box('sites','Site settings','Per-site shields, zoom, CSS and hidden elements'),
      box('lists','Downloaded filter lists','They download again next time')),
    h(PrimaryBtn,{T,danger:true,label:'Clear data',onClick:go,disabled:!Object.values(pick).some(Boolean)}),
    h('div',{style:{height:10}}));
}

/* browsing history with search */
function HistorySheet({T,history,onOpen,onRemove,onClear,onClose}){
  const {inputS}=UI();
  const [q,setQ]=useState('');
  const list=useMemo(()=>{const s=q.trim().toLowerCase();return(history||[]).filter(x=>!s||String(x.url).toLowerCase().includes(s)||String(x.name||'').toLowerCase().includes(s)).slice(0,300)},[history,q]);
  let lastDay='';
  return h(Sheet,{T,onClose,title:'History',z:97,maxH:'90%'},
    h('div',{style:Object.assign({},pad,{paddingBottom:16,fontFamily:UIF})},
      h('input',{value:q,onChange:e=>setQ(e.target.value),placeholder:'Search history',enterKeyHint:'search',style:Object.assign(inputS(T),{marginBottom:6})}),
      histDays()<0?h('div',{style:Object.assign({},small(T),{margin:'6px 0'})},'History is turned off in Privacy & Shields.'):null,
      list.length?list.map(x=>{
        const day=new Date(x.at||0).toDateString();const head=day!==lastDay?(lastDay=day,h('div',{key:'d'+day,style:{fontSize:11.5,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:T.sub,margin:'14px 0 2px'}},day===new Date().toDateString()?'Today':day)):null;
        return h(Fragment,{key:x.url},head,
          h('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid '+T.hair}},
            h('button',{onClick:()=>onOpen(x.url),className:'act98',style:{flex:1,minWidth:0,textAlign:'left',color:T.fg}},
              h('span',{style:{display:'block',fontSize:14.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},x.name||x.url),
              h('span',{style:{display:'block',fontSize:11.5,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(domainOf(x.url)||x.url)+' · '+new Date(x.at||0).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(x.count>1?' · '+x.count+' visits':''))),
            h('button',{onClick:()=>onRemove(x.url),'aria-label':'Remove',className:'act90',style:{color:T.sub,display:'flex',padding:6}},Icons.x(15))));
      }):h('div',{style:Object.assign({},small(T),{padding:'20px 0',textAlign:'center'})},q?'Nothing matches.':'No history yet.'),
      (history||[]).length?h('button',{onClick:onClear,style:{color:T.danger,fontSize:14,fontWeight:600,marginTop:14}},'Clear all history'):null));
}

/* page source viewer */
function SourceSheet({T,url,html,loading,onClose,toastFn}){
  const lines=html?html.split('\n').length:0;
  return h(Sheet,{T,onClose,title:'Page source',z:97,maxH:'92%'},
    h('div',{style:Object.assign({},pad,{paddingBottom:16,fontFamily:UIF})},
      h('div',{style:Object.assign({},small(T),{marginBottom:8,wordBreak:'break-all'})},url+(html?' · '+lines.toLocaleString()+' lines · '+fmtSize(html.length):'')),
      loading?h('div',{style:{display:'flex',alignItems:'center',gap:10,color:T.sub,fontSize:13.5,padding:'20px 0'}},h(Spinner,{T,size:16}),'Fetching the original HTML…'):
        h(Fragment,null,
          h('div',{style:{display:'flex',gap:8,marginBottom:8}},
            h('button',{onClick:()=>{copyText(html);toastFn('Source copied')},className:'act95',style:{padding:'7px 12px',borderRadius:16,background:T.card,color:T.fg,fontSize:13}},'Copy'),
            h('button',{onClick:()=>downloadText((siteKey(url)||'page')+'.html',html,'text/html'),className:'act95',style:{padding:'7px 12px',borderRadius:16,background:T.card,color:T.fg,fontSize:13}},'Save file')),
          h('pre',{className:'bu-ta',style:{margin:0,padding:12,borderRadius:10,background:T.card,color:T.fg,fontSize:11.5,lineHeight:1.45,fontFamily:'ui-monospace,Menlo,monospace',whiteSpace:'pre-wrap',wordBreak:'break-all',maxHeight:'62vh',overflow:'auto'}},String(html||'').slice(0,300000)+(html&&html.length>300000?'\n\n… (truncated — use Copy or Save file for all of it)':'')))));
}

/* address-bar suggestions */
function SuggestList({T,q,items,engineLabel,onSearch,onOpen,onTab}){
  if(!q)return null;
  const ic={tab:BIc('tabs'),bookmark:SI.bookmark(16),history:BIc('clock')};
  const row=(key,icon,title,sub,onClick)=>h('button',{key,onMouseDown:e=>e.preventDefault(),onClick,className:'act98',style:{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'11px 16px',borderBottom:'1px solid '+T.hair,color:T.fg}},
    h('span',{style:{color:T.sub,display:'flex',width:18,justifyContent:'center',flexShrink:0}},icon),
    h('span',{style:{flex:1,minWidth:0}},h('span',{style:{display:'block',fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},title),
      sub?h('span',{style:{display:'block',fontSize:12,color:T.sub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},sub):null));
  return h('div',{className:'sy bu-scroll',style:{position:'absolute',inset:0,zIndex:30,background:T.bg,overflowY:'auto'}},
    row('s',Icons.search(16),q,'Search '+engineLabel,()=>onSearch(q)),
    items.map((it,i)=>row(i,ic[it.kind],it.title,(it.kind==='tab'?'Switch to tab · ':it.kind==='bookmark'?'Bookmark · ':'')+(domainOf(it.url)||it.url),()=>it.kind==='tab'?onTab(it.id):onOpen(it.url))));
}
function BIc(name){try{const B=window.InstaUI&&window.InstaUI.BI;return B&&B[name]?B[name](16):null}catch(e){return null}}

/* ============================== export ============================== */
window.InstaShields={
  DEFAULTS,FILTER_LISTS,ADDR_ENGINES,sync,cfg,siteCfg,siteKey,navUrl,shareUrl,cleanUrl,unwrapUrl,deAmp,upgradeHttps,
  begin,frameBlocked,apply,isBlockedUrl,selectorFor,setSite,setG,recordVisit,trimHistory,suggest,
  bookmarksHtml,parseBookmarksHtml,importBookmarks,downloadText,engine,buildEngine,parseInto,newEngine,finishEngine,netBlocked,updateList,
  icons:SI,SiteShieldSheet,ShieldSettingsSheet,ClearDataSheet,HistorySheet,SourceSheet,SuggestList
};
})();
