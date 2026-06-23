/* =====================================================================
   THE DAILY BRIEF — a personalized digital newspaper
   Pure vanilla JS. Fetches live news, lays it out like a real broadsheet,
   remembers your taste, and refreshes itself every six hours.
   ===================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "dailybrief_v1";
  var CACHE_VER = 3; // bump when ranking/shape changes so old editions refetch
  var SIX_HOURS = 6 * 60 * 60 * 1000;
  // Only ever show recent stories — anything older than this is dropped outright,
  // so the paper can never surface stale, years-old "evergreen" search hits.
  var FRESH_MS = 14 * 24 * 60 * 60 * 1000;
  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");

  /* ---------------- preset topics (mirrors the setup screen) ---------- */
  var PRESET_TOPICS = [
    "Tech", "AI", "Finance", "Cricket", "Sports", "Science",
    "Politics", "Entertainment", "Health", "Business", "Climate", "Space",
    "Telangana & AP", "Trending"
  ];

  /* ---------------- reading styles ----------------------------------- */
  var STYLES = {
    serious: {
      label: "Serious",
      tagline: "Curated for you.",
      desc: "Authoritative, formal, like a broadsheet",
      footer: "Read responsibly. The world is complicated."
    },
    punchy: {
      label: "Punchy",
      tagline: "The news, minus the boring bits.",
      desc: "Snappy, engaging, like a smart blog",
      footer: "Short. Sharp. Yours."
    },
    genz: {
      label: "gen z",
      tagline: "no cap, just the stories that hit 🫶",
      desc: "No cap, lowkey, it's giving news energy",
      footer: "stay informed bestie. it's giving newspaper ✨"
    }
  };

  /* ---------------- regions (Google News editions) ------------------- */
  /* "India" and "Global" lead; the rest let you pick any other country.
     Each maps to the Google News edition params (hl / gl / ceid). */
  var REGIONS = [
    { id: "IN",     label: "India",          hl: "en-IN", gl: "IN", ceid: "IN:en" },
    { id: "global", label: "Global",         hl: "en-US", gl: "US", ceid: "US:en" },
    { id: "US",     label: "United States",  hl: "en-US", gl: "US", ceid: "US:en" },
    { id: "GB",     label: "United Kingdom", hl: "en-GB", gl: "GB", ceid: "GB:en" },
    { id: "AU",     label: "Australia",      hl: "en-AU", gl: "AU", ceid: "AU:en" },
    { id: "CA",     label: "Canada",         hl: "en-CA", gl: "CA", ceid: "CA:en" },
    { id: "SG",     label: "Singapore",      hl: "en-SG", gl: "SG", ceid: "SG:en" },
    { id: "AE",     label: "UAE",            hl: "en-AE", gl: "AE", ceid: "AE:en" }
  ];
  var DEFAULT_REGION = "IN";
  function regionById(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return REGIONS[0];
  }
  // a specific country (not "Global") is selected → bias the paper toward its edition
  function isRegional() { return !!(prefs && prefs.region && prefs.region !== "global"); }

  /* gen-z reaction openers used to flavour deks (deterministic pick) */
  var GENZ_OPENERS = [
    "ok so basically", "not gonna lie,", "lowkey huge:", "the way that",
    "bestie,", "no cap,", "it's giving:", "real talk:", "wait this is actually big —",
    "plot twist:", "tell me why", "the internet is unwell over this —"
  ];
  var PUNCHY_OPENERS = [
    "Here's the deal:", "Quick one —", "Big if true:", "Heads up:",
    "What you need to know:", "The short version:", "Worth your time:", "ICYMI:"
  ];

  /* topic -> a couple of focused subreddits for richer, on-topic results */
  var TOPIC_SUBS = {
    tech: ["technology", "technews", "gadgets"],
    ai: ["artificial", "MachineLearning", "OpenAI"],
    finance: ["finance", "investing", "economics"],
    cricket: ["Cricket"],
    sports: ["sports"],
    science: ["science", "EverythingScience"],
    politics: ["politics", "worldnews"],
    entertainment: ["entertainment", "movies", "television"],
    health: ["Health", "medicine"],
    business: ["business", "Economics"],
    climate: ["climate", "environment"],
    space: ["space", "spaceflight"],
    "telangana & ap": ["hyderabad", "india", "andhra"],
    trending: ["india", "viral", "trending"]
  };

  /* ---------------- state -------------------------------------------- */
  var prefs = loadPrefs();
  var refreshTimer = null;
  var isRefreshing = false;

  /* =====================================================================
     STORAGE
     ===================================================================== */
  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p.topics || !p.topics.length) return null;
      if (!p.region) p.region = DEFAULT_REGION; // older papers had no region
      if (p.cacheVer !== CACHE_VER) { p.cache = null; p.lastRefresh = 0; } // drop pre-region editions
      return p;
    } catch (e) { return null; }
  }
  function savePrefs() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  /* =====================================================================
     SMALL HELPERS
     ===================================================================== */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function decodeEntities(s) {
    var t = document.createElement("textarea");
    t.innerHTML = s || "";
    return t.value;
  }
  function stripTags(s) {
    var d = document.createElement("div");
    d.innerHTML = s || "";
    return (d.textContent || d.innerText || "").trim();
  }
  function hashStr(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  function pick(arr, seed) { return arr[seed % arr.length]; }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  function fmtAgo(date) {
    var ms = Date.now() - date.getTime();
    var m = Math.round(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.round(h / 24);
    if (d <= 30) return d + "d ago";
    // anything older falls back to a real date rather than an absurd "3366d ago"
    var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return mon[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }
  function fmtClock(date) {
    var h = date.getHours(), m = date.getMinutes();
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  }
  function fmtLongDate(date) {
    var days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    var mon = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY",
      "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    return days[date.getDay()] + ", " + mon[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }
  function editionNo() {
    // a stable, ever-incrementing edition number based on the date
    var epoch = new Date(2024, 0, 1).getTime();
    return Math.floor((Date.now() - epoch) / 86400000) + 100;
  }

  /* =====================================================================
     NETWORK — live news via Reddit (images + ranking) and Google News RSS
     Both routed through public CORS proxies with graceful fallback.
     ===================================================================== */
  var PROXIES = [
    function (u) { return "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u); },
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); },
    function (u) { return "https://thingproxy.freeboard.io/fetch/" + u; }
  ];

  // one fetch with a hard timeout so a hung proxy can never freeze the app
  function timedFetch(u, timeoutMs) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    return fetch(u, { method: "GET", signal: ctrl.signal }).then(function (r) {
      if (!r.ok) throw new Error("status " + r.status);
      return r.text();
    }).then(function (t) {
      clearTimeout(to);
      if (!t) throw new Error("empty");
      return t;
    }, function (e) { clearTimeout(to); throw e; });
  }

  // race ALL proxies in parallel, take the first that succeeds (fast + resilient)
  function proxiedFetch(url, timeoutMs) {
    timeoutMs = timeoutMs || 6500;
    var attempts = PROXIES.map(function (mk) { return timedFetch(mk(url), timeoutMs); });
    if (Promise.any) return Promise.any(attempts);
    // fallback for older engines without Promise.any
    return new Promise(function (resolve, reject) {
      var left = attempts.length;
      attempts.forEach(function (p) {
        p.then(resolve, function () { if (--left === 0) reject(new Error("all proxies failed")); });
      });
    });
  }

  /* ---- Reddit: best for images + a real "importance" score ---------- */
  function fetchReddit(topic) {
    var key = topic.toLowerCase().trim();
    var subs = TOPIC_SUBS[key];
    var url;
    if (subs && subs.length) {
      url = "https://www.reddit.com/r/" + subs.join("+") + "/top.json?t=week&limit=18";
    } else {
      url = "https://www.reddit.com/search.json?q=" + encodeURIComponent(topic) +
            "&sort=top&t=week&limit=18&type=link";
    }
    return proxiedFetch(url).then(function (txt) {
      var json = JSON.parse(txt);
      var children = (json.data && json.data.children) || [];
      var out = [];
      children.forEach(function (c) {
        var d = c.data;
        if (!d || d.stickied || d.over_18) return;
        var link = d.url_overridden_by_dest || d.url;
        if (!link || /redd\.it|reddit\.com\/gallery|v\.redd\.it/.test(link)) link = "https://www.reddit.com" + d.permalink;
        var img = "";
        if (d.preview && d.preview.images && d.preview.images[0]) {
          var src = d.preview.images[0].source;
          if (src && src.url) img = decodeEntities(src.url);
        }
        if (!img && d.thumbnail && /^https?:/.test(d.thumbnail)) img = d.thumbnail;
        var src2 = d.domain ? d.domain.replace(/^www\./, "") : "Reddit";
        if (/redd\.it|reddit\.com/.test(src2)) src2 = "r/" + d.subreddit;
        out.push({
          title: decodeEntities(d.title),
          url: link,
          source: src2,
          date: new Date((d.created_utc || 0) * 1000),
          image: img,
          score: d.score || 0,
          topic: topic,
          summary: stripTags(decodeEntities(d.selftext || "")).slice(0, 240)
        });
      });
      return out;
    });
  }

  /* ---- Google News RSS: breadth + freshness, great for custom topics.
     Tries rss2json (direct CORS, no proxy) first, then a proxied raw feed. */

  // When India is selected, the first query is restricted to these media houses
  // so the paper leads with Indian journalism, not global wire services.
  var INDIA_SOURCES = "(site:ndtv.com OR site:timesofindia.com OR site:thehindu.com" +
    " OR site:hindustantimes.com OR site:indiatoday.in OR site:indianexpress.com" +
    " OR site:livemint.com OR site:news18.com OR site:economictimes.indiatimes.com" +
    " OR site:deccanherald.com OR site:telegraphindia.com OR site:thewire.in" +
    " OR site:scroll.in OR site:theprint.in OR site:wionews.com)";

  // Topic-specific source overrides: for regional/geographic topics, swap in
  // localised outlets instead of the national Indian house list.
  // Key = topic name lowercased (substring match).
  var TOPIC_SOURCES = {
    "telangana": "(site:eenadu.net OR site:andhrajyothi.com OR site:sakshi.com" +
      " OR site:telanganatoday.com OR site:deccanchronicle.com OR site:thehansindia.com" +
      " OR site:newindianexpress.com OR site:tv9telugu.com OR site:ntv.in" +
      " OR site:thenewsminute.com OR site:siasat.com)",
    // "Trending" section: viral news, YouTube Shorts/Reels round-ups, social trends
    "trending": "(site:youtube.com OR site:ndtv.com OR site:indiatoday.in" +
      " OR site:timesofindia.com OR site:news18.com OR site:hindustantimes.com" +
      " OR site:scroll.in OR site:theprint.in OR site:thequint.com OR site:scoopwhoop.com)"
  };


  // fetch one Google News RSS URL — rss2json first, proxy fallback
  function fetchOneGoogleRss(rss, topic) {
    return timedFetch("https://api.rss2json.com/v1/api.json?count=16&rss_url=" +
        encodeURIComponent(rss), 6500)
      .then(function (txt) {
        var j = JSON.parse(txt);
        if (!j.items || !j.items.length) throw new Error("empty");
        return j.items.map(function (it) {
          var src = "", title = (it.title || "");
          if (/ - /.test(title)) { var p = title.split(" - "); src = p.pop(); title = p.join(" - "); }
          var img = it.thumbnail || (it.enclosure && it.enclosure.link) || "";
          return {
            title: decodeEntities(title).trim(),
            url: (it.link || "").trim(),
            source: (src || "Google News").trim(),
            date: it.pubDate ? new Date(it.pubDate.replace(" ", "T")) : new Date(),
            image: /^https?:/.test(img) ? img : "",
            score: 0, topic: topic, regional: isRegional(),
            summary: stripTags(decodeEntities(it.description || it.content || "")).slice(0, 240)
          };
        });
      })
      .catch(function () { return proxiedFetch(rss).then(function (txt) { return parseGoogleRss(topic, txt); }); });
  }

  // Topic-specific search query overrides (replaces the topic name in the query).
  var TOPIC_QUERIES = {
    "trending": "trending viral India reels shorts"
  };

  function fetchGoogleNews(topic) {
    var r = regionById(prefs && prefs.region);
    // "when:7d" pins Google News to the last week, so we get today's headlines for
    // the topic instead of relevance-ranked evergreen articles from years ago.
    var qBase = TOPIC_QUERIES[topic.toLowerCase()] || topic;
    var q = qBase + " when:7d";
    // ceid must NOT be pre-encoded here: the rss2json/proxy layer encodes the whole
    // URL once, and Google News matches the ceid value EXACTLY — a stray "%3A" for
    // the colon makes it ignore the edition and fall back to US/global content.
    var base = "&hl=" + r.hl + "&gl=" + r.gl + "&ceid=" + r.ceid;

    if (r.id !== "IN") {
      // All other regions: single query, same as before.
      var rss = "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + base;
      return fetchOneGoogleRss(rss, topic);
    }

    // India: run TWO queries in parallel —
    //   1. restricted to the appropriate media house list for this topic
    //      (regional outlets for geographic topics, national houses otherwise)
    //   2. general India edition (catches any topic with thin coverage in the list)
    // Merge with house-list articles leading; dedupe by URL.
    var topicKey = topic.toLowerCase();
    var sourceFilter = INDIA_SOURCES;
    for (var tk in TOPIC_SOURCES) {
      if (topicKey.indexOf(tk) > -1) { sourceFilter = TOPIC_SOURCES[tk]; break; }
    }
    var rssIndia = "https://news.google.com/rss/search?q=" +
      encodeURIComponent(q + " " + sourceFilter) + base;
    var rssGeneral = "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + base;
    return Promise.all([
      fetchOneGoogleRss(rssIndia, topic).catch(function () { return []; }),
      fetchOneGoogleRss(rssGeneral, topic).catch(function () { return []; })
    ]).then(function (parts) {
      var fromIndia = parts[0];
      var fromGeneral = parts[1];
      // Mark Indian-house articles so ranking sorts them to the top.
      fromIndia = fromIndia.map(function (a) { return Object.assign({}, a, { regional: true }); });
      // Append general results that aren't already in the Indian set.
      var seen = {};
      fromIndia.forEach(function (a) { if (a.url) seen[a.url] = true; });
      var extras = fromGeneral.filter(function (a) { return a.url && !seen[a.url]; });
      return fromIndia.concat(extras).slice(0, 20);
    });
  }

  function parseGoogleRss(topic, txt) {
    var doc = new DOMParser().parseFromString(txt, "text/xml");
    var items = doc.querySelectorAll("item");
    var out = [];
    Array.prototype.slice.call(items, 0, 16).forEach(function (it) {
      var titleRaw = (it.querySelector("title") || {}).textContent || "";
      var link = (it.querySelector("link") || {}).textContent || "";
      var pub = (it.querySelector("pubDate") || {}).textContent || "";
      var descRaw = (it.querySelector("description") || {}).textContent || "";
      var sourceTag = it.querySelector("source");
      var source = sourceTag ? sourceTag.textContent : "";
      var title = titleRaw;
      if (!source && / - /.test(titleRaw)) { var parts = titleRaw.split(" - "); source = parts.pop(); title = parts.join(" - "); }
      else if (source && title.indexOf(" - " + source) > -1) { title = title.replace(" - " + source, ""); }
      out.push({
        title: decodeEntities(title).trim(),
        url: link.trim(),
        source: (source || "Google News").trim(),
        date: pub ? new Date(pub) : new Date(),
        image: "", score: 0, topic: topic, regional: isRegional(),
        summary: stripTags(decodeEntities(descRaw)).slice(0, 240)
      });
    });
    return out;
  }

  /* ---- Hacker News (Algolia): direct CORS, no proxy, very reliable ---- */
  function fetchHN(topic) {
    // Restrict to stories created within the fresh window so HN can't surface
    // years-old threads for the topic.
    var since = Math.floor((Date.now() - FRESH_MS) / 1000);
    return timedFetch("https://hn.algolia.com/api/v1/search?query=" +
        encodeURIComponent(topic) + "&tags=story&hitsPerPage=12" +
        "&numericFilters=created_at_i%3E" + since, 6000)
      .then(function (txt) {
        var j = JSON.parse(txt);
        return (j.hits || []).filter(function (h) { return h.url && h.title; }).map(function (h) {
          var host = "Hacker News";
          try { host = new URL(h.url).hostname.replace(/^www\./, ""); } catch (e) {}
          return {
            title: h.title, url: h.url, source: host,
            date: new Date(h.created_at), image: "",
            score: h.points || 0, topic: topic,
            summary: stripTags(decodeEntities(h.story_text || "")).slice(0, 240)
          };
        });
      });
  }


  /* ---- fetch one topic: all sources in parallel, merge, dedupe, rank */
  function fetchTopic(topic) {
    return Promise.all([
      fetchGoogleNews(topic).catch(function () { return []; }),
      fetchReddit(topic).catch(function () { return []; }),
      fetchHN(topic).catch(function () { return []; })
    ]).then(function (parts) {
        var results = parts[0].concat(parts[1]).concat(parts[2]);
        // hard freshness gate: drop anything older than the fresh window so a
        // stale article can never reach the page, regardless of its score/image
        var now = Date.now();
        results = results.filter(function (a) {
          return a.date && (now - a.date.getTime()) < FRESH_MS;
        });
        // dedupe by normalized title
        var seen = {}, merged = [];
        results.forEach(function (a) {
          if (!a.title || a.title.length < 12) return;
          var k = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
          if (seen[k]) {
            // prefer the version that has an image
            if (!seen[k].image && a.image) seen[k].image = a.image;
            return;
          }
          seen[k] = a; merged.push(a);
        });
        // rank: a selected country edition leads, then recency dominates (so the
        // freshest story wins), with images/score only as a gentle tie-breaker
        merged.sort(function (a, b) {
          if (!!a.regional !== !!b.regional) return (b.regional ? 1 : 0) - (a.regional ? 1 : 0);
          var sa = recencyBoost(a.date) * 4 + (a.image ? 20 : 0) + Math.min(a.score, 5000) / 100;
          var sb = recencyBoost(b.date) * 4 + (b.image ? 20 : 0) + Math.min(b.score, 5000) / 100;
          return sb - sa;
        });
        return merged.slice(0, 12);
      });
  }
  function recencyBoost(date) {
    // smooth decay across the whole fresh window so the newest story always ranks
    // ahead of an older one (not just a coarse 3-tier step that flattens to 0)
    var h = (Date.now() - date.getTime()) / 3600000;
    if (h <= 0) return 40;
    var days = h / 24;
    return Math.max(0, 40 - days * (40 / 14)); // 40 now → 0 at 14 days
  }

  // fetch every topic in parallel, but never wait longer than deadlineMs —
  // whatever has arrived by then is rendered (partial results are fine)
  function fetchAll(topics, deadlineMs) {
    return new Promise(function (resolve) {
      var out = topics.map(function (t) { return { topic: t, articles: [] }; });
      var done = 0, settled = false;
      function finish() { if (!settled) { settled = true; clearTimeout(timer); resolve(out); } }
      var timer = setTimeout(finish, deadlineMs || 8000);
      topics.forEach(function (t, i) {
        fetchTopic(t).then(function (arts) { out[i].articles = arts; }, function () {})
          .then(function () { if (++done === topics.length) finish(); });
      });
    });
  }

  /* =====================================================================
     TONE — bend the copy to the chosen reading style
     ===================================================================== */
  function toneDek(text, art, style) {
    var t = (text || "").trim();
    if (style === "serious") return t;
    var seed = hashStr(art.title);
    if (style === "punchy") {
      // trim to one tight sentence, add a snappy opener sometimes
      if (!t) return pick(PUNCHY_OPENERS, seed) + " " + shortTitle(art.title);
      var first = firstSentence(t).slice(0, 150);
      return (seed % 3 === 0 ? pick(PUNCHY_OPENERS, seed) + " " : "") + first;
    }
    // gen z
    var base = t ? firstSentence(t).slice(0, 130) : shortTitle(art.title);
    base = base.charAt(0).toLowerCase() + base.slice(1);
    return pick(GENZ_OPENERS, seed) + " " + base + (/[.!?]$/.test(base) ? "" : "...");
  }
  function shortTitle(t) {
    return (t || "").split(/[:\-—]/)[0].trim().slice(0, 120);
  }
  function firstSentence(t) {
    var m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t || "");
    return (m ? m[0] : (t || "")).trim();
  }
  function toneSectionLabel(topic, style) {
    if (style === "genz") return topic.toLowerCase();
    return topic.toUpperCase();
  }
  function tagline() {
    return STYLES[prefs.style] ? STYLES[prefs.style].tagline : STYLES.serious.tagline;
  }

  /* =====================================================================
     ICONS
     ===================================================================== */
  var ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/></svg>'
  };

  /* go back to the Instapaper reading app — works in the browser and in the
     standalone PWA (where history.back() may have nowhere to go) */
  function backToApp() {
    var target = new URL("index.html", window.location.href).href;
    var here = window.location.href;
    if (window.history.length > 1) {
      window.history.back();
      // if back() didn't navigate (no in-app history), force it
      setTimeout(function () { if (window.location.href === here) window.location.href = target; }, 300);
    } else {
      window.location.href = target;
    }
  }

  /* =====================================================================
     SETUP SCREEN
     ===================================================================== */
  function renderSetup(existing) {
    var draft = {
      topics: existing ? existing.topics.slice() : ["Tech", "AI", "Finance", "Business"],
      style: existing ? existing.style : "serious",
      region: existing && existing.region ? existing.region : DEFAULT_REGION
    };

    app.innerHTML = "";
    var root = el("div", "setup");
    var inner = el("div", "setup-inner");

    // top bar: back to the Instapaper app + (when a paper already exists) home
    var backRow = el("div", "setup-back");
    var backBtn = el("button", "backbtn", ICON.back + "<span>Instapaper</span>");
    backBtn.title = "Back to Instapaper";
    backBtn.onclick = backToApp;
    backRow.appendChild(backBtn);
    if (existing && existing.cache) {
      var homeBtn = el("button", "backbtn", "<span>Daily Brief</span>" + ICON.home);
      homeBtn.title = "Back to your paper";
      homeBtn.onclick = function () { buildAndRender(false); };
      backRow.appendChild(homeBtn);
    }
    inner.appendChild(backRow);

    // masthead
    var mh = el("div", "setup-masthead");
    mh.appendChild(el("h1", "disp", "The Daily Brief"));
    mh.appendChild(el("div", "tag", "Curated exclusively for you."));
    inner.appendChild(mh);

    /* ---- step 1: topics ---- */
    var s1 = el("div", "step");
    var h1 = el("div", "step-head ui", '<span class="n">2.</span> Select your topics');
    s1.appendChild(h1);
    s1.appendChild(el("div", "rule"));
    var editing = -1; // index of the topic currently being renamed
    function dupTopic(name, skipIdx) {
      return draft.topics.some(function (x, i) { return i !== skipIdx && x.toLowerCase() === name.toLowerCase(); });
    }

    // ---- your topics: each one can be edited or deleted ----
    s1.appendChild(el("div", "sublabel ui", "Your topics"));
    var pills = el("div", "tpills");
    s1.appendChild(pills);

    function renderTopics() {
      pills.innerHTML = "";
      if (!draft.topics.length) {
        pills.appendChild(el("div", "tempty ui", "No topics yet — add one below or tap a suggestion."));
        return;
      }
      draft.topics.forEach(function (t, i) {
        if (editing === i) {
          var ed = el("div", "tpill editing");
          var ein = el("input", "ui"); ein.type = "text"; ein.value = t;
          var save = el("button", "tbtn save", ICON.check); save.title = "Save";
          function commit() {
            var v = ein.value.trim();
            if (v && !dupTopic(v, i)) draft.topics[i] = v;
            editing = -1; renderTopics(); renderSuggest(); updateCta();
          }
          save.onclick = commit;
          ein.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { editing = -1; renderTopics(); }
          });
          ed.appendChild(ein); ed.appendChild(save);
          pills.appendChild(ed);
          setTimeout(function () { ein.focus(); ein.select(); }, 0);
          return;
        }
        var pill = el("div", "tpill");
        pill.appendChild(el("span", "tname", esc(t)));
        var edit = el("button", "tbtn", ICON.pencil); edit.title = "Edit topic";
        edit.onclick = function () { editing = i; renderTopics(); };
        var del = el("button", "tbtn del", ICON.close); del.title = "Delete topic";
        del.onclick = function () {
          draft.topics.splice(i, 1); editing = -1;
          renderTopics(); renderSuggest(); updateCta();
        };
        pill.appendChild(edit); pill.appendChild(del);
        pills.appendChild(pill);
      });
    }

    // ---- suggestions: preset topics you haven't added yet ----
    var sugLbl = el("div", "sublabel ui", "Suggested");
    s1.appendChild(sugLbl);
    var suggest = el("div", "chips");
    s1.appendChild(suggest);
    function renderSuggest() {
      suggest.innerHTML = "";
      var avail = PRESET_TOPICS.filter(function (p) {
        return !draft.topics.some(function (t) { return t.toLowerCase() === p.toLowerCase(); });
      });
      var none = !avail.length;
      sugLbl.style.display = none ? "none" : "";
      suggest.style.display = none ? "none" : "";
      avail.forEach(function (p) {
        var c = el("button", "chip ui", '<span class="plus">+</span> ' + esc(p));
        c.onclick = function () { draft.topics.push(p); renderTopics(); renderSuggest(); updateCta(); };
        suggest.appendChild(c);
      });
    }

    renderTopics();
    renderSuggest();

    // ---- add a custom topic ----
    var addrow = el("div", "addrow");
    var inp = el("input", "ui");
    inp.type = "text"; inp.placeholder = "Add another topic…";
    var addbtn = el("button", "ui", "Add");
    function addCustom() {
      var v = inp.value.trim();
      if (!v) return;
      if (!dupTopic(v, -1)) draft.topics.push(v);
      inp.value = ""; renderTopics(); renderSuggest(); updateCta(); inp.focus();
    }
    addbtn.onclick = addCustom;
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });
    addrow.appendChild(inp); addrow.appendChild(addbtn);
    s1.appendChild(addrow);

    /* ---- step 1: region (shown first) ---- */
    var sR = el("div", "step");
    sR.appendChild(el("div", "step-head ui", '<span class="n">1.</span> Choose your region'));
    sR.appendChild(el("div", "rule"));
    sR.appendChild(el("div", "sublabel ui", "News edition — India-specific, Global, or another country"));
    var regionChips = el("div", "chips");
    REGIONS.forEach(function (r) {
      var c = el("button", "chip ui" + (draft.region === r.id ? " on" : ""), esc(r.label));
      c.onclick = function () {
        draft.region = r.id;
        regionChips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); });
        c.classList.add("on");
      };
      regionChips.appendChild(c);
    });
    sR.appendChild(regionChips);
    inner.appendChild(sR);   // 1. region
    inner.appendChild(s1);   // 2. topics

    /* ---- step 3: style ---- */
    var s2 = el("div", "step");
    s2.appendChild(el("div", "step-head ui", '<span class="n">3.</span> Choose your style'));
    s2.appendChild(el("div", "rule"));
    var styleGrid = el("div", "styles");
    ["serious", "punchy", "genz"].forEach(function (key) {
      var st = STYLES[key];
      var card = el("div", "style-card " + key + (draft.style === key ? " on" : ""));
      card.appendChild(el("h3", null, esc(st.label)));
      card.appendChild(el("p", null, esc(st.desc)));
      card.onclick = function () {
        draft.style = key;
        styleGrid.querySelectorAll(".style-card").forEach(function (c) { c.classList.remove("on"); });
        card.classList.add("on");
      };
      styleGrid.appendChild(card);
    });
    s2.appendChild(styleGrid);
    inner.appendChild(s2);

    /* ---- CTA ---- */
    inner.appendChild(el("div", "cta-rule"));
    var ctaWrap = el("div", "cta-wrap");
    var cta = el("button", "cta", existing ? "Update My Paper" : "Read My Paper");
    function updateCta() { cta.disabled = draft.topics.length === 0; }
    cta.onclick = function () {
      if (!draft.topics.length) return;
      // if topics or region changed, drop the old cache so we don't flash stale sections
      var changed = !existing ||
        existing.topics.join("|").toLowerCase() !== draft.topics.join("|").toLowerCase() ||
        existing.region !== draft.region;
      prefs = {
        topics: draft.topics.slice(),
        style: draft.style,
        region: draft.region,
        lastRefresh: changed ? 0 : (existing.lastRefresh || 0),
        cache: (existing && existing.cache && !changed) ? existing.cache : null,
        cacheVer: CACHE_VER,
        edition: editionNo()
      };
      savePrefs();
      buildAndRender(true);
    };
    ctaWrap.appendChild(cta);
    var pill = el("div", "phone-pill ui", ICON.phone + " Add to your phone’s home screen for the full newspaper experience");
    ctaWrap.appendChild(pill);
    inner.appendChild(ctaWrap);

    updateCta();
    root.appendChild(inner);
    app.appendChild(root);
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     LOADING SCREEN
     ===================================================================== */
  function showLoading() {
    var l = el("div", "loading");
    l.innerHTML = '<h2 class="disp">The Daily Brief</h2>' +
      '<p class="ui">' + esc(tagline()) + '</p>' +
      '<div class="press"></div>' +
      '<p class="ui" style="margin-top:22px">Setting today’s type…</p>';
    return l;
  }

  /* =====================================================================
     BUILD: fetch (or use cache) then render the paper
     ===================================================================== */
  function buildAndRender(forceFetch) {
    app.innerHTML = "";
    var hasCache = !!(prefs.cache && prefs.cache.length);
    var stale = forceFetch || !hasCache ||
      (Date.now() - (prefs.lastRefresh || 0) > SIX_HOURS);

    // INSTANT: if we have a cached edition, show it immediately — no spinner.
    if (hasCache) {
      renderPaper(reviveCache(prefs.cache));
      scheduleAutoRefresh();
      if (stale) backgroundRefresh();   // quietly fetch newer stories
      return;
    }

    // First ever load: show the loader, but fetch fast with a hard deadline.
    var loader = showLoading();
    app.appendChild(loader);
    isRefreshing = true;
    fetchAll(prefs.topics, 10000).then(function (sections) {
      isRefreshing = false;
      var nonEmpty = sections.filter(function (s) { return s.articles.length; });
      if (!nonEmpty.length) { renderError(loader); return; }
      prefs.lastRefresh = Date.now();
      prefs.cache = serializeCache(sections);
      prefs.cacheVer = CACHE_VER;
      savePrefs();
      renderPaper(sections);
      scheduleAutoRefresh();
    }).catch(function () { isRefreshing = false; renderError(loader); });
  }

  // refresh in the background without blocking the page; swap in when ready
  function backgroundRefresh() {
    if (isRefreshing) return;
    isRefreshing = true;
    fetchAll(prefs.topics, 12000).then(function (sections) {
      isRefreshing = false;
      var nonEmpty = sections.filter(function (s) { return s.articles.length; });
      if (!nonEmpty.length) return;   // network down — keep the cached edition
      prefs.lastRefresh = Date.now();
      prefs.cache = serializeCache(sections);
      prefs.cacheVer = CACHE_VER;
      savePrefs();
      renderPaper(sections);
      scheduleAutoRefresh();
      toast("Updated with the latest.");
    }, function () { isRefreshing = false; });
  }

  function serializeCache(sections) {
    return sections.map(function (s) {
      return {
        topic: s.topic,
        articles: s.articles.map(function (a) {
          return [a.title, a.url, a.source, a.date.getTime(), a.image, a.score, a.summary, a.regional ? 1 : 0];
        })
      };
    });
  }
  function reviveCache(cache) {
    return cache.map(function (s) {
      return {
        topic: s.topic,
        articles: s.articles.map(function (a) {
          return { title: a[0], url: a[1], source: a[2], date: new Date(a[3]), image: a[4], score: a[5], topic: s.topic, summary: a[6], regional: !!a[7] };
        })
      };
    });
  }

  function renderError(loader) {
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    if (prefs.cache) { renderPaper(reviveCache(prefs.cache)); toast("Couldn’t reach the wire — showing your last edition."); return; }
    app.innerHTML = "";
    var e = el("div", "loading");
    e.innerHTML = '<h2 class="disp">Off the wire</h2>' +
      '<p class="ui">We couldn’t reach the newsroom just now.</p>' +
      '<button class="cta" style="margin-top:28px">Try again</button>';
    e.querySelector("button").onclick = function () { buildAndRender(true); };
    app.appendChild(e);
  }

  /* =====================================================================
     RENDER THE NEWSPAPER
     ===================================================================== */
  function renderPaper(sections) {
    app.innerHTML = "";
    var style = prefs.style;

    // flatten a global pool for the front page, keep per-section for below
    var allArts = [];
    sections.forEach(function (s) { s.articles.forEach(function (a) { allArts.push(a); }); });

    var wrap = el("div", "wrap");

    /* -------- masthead -------- */
    wrap.appendChild(buildMasthead(sections));

    var paper = el("div", "paper");

    /* -------- lead / hero block -------- */
    // choose the strongest story (prefer image + score) as the lead
    var ranked = allArts.slice().sort(function (a, b) {
      if (!!a.regional !== !!b.regional) return (b.regional ? 1 : 0) - (a.regional ? 1 : 0);
      var sa = recencyBoost(a.date) * 3 + (a.image ? 60 : 0) + a.score;
      var sb = recencyBoost(b.date) * 3 + (b.image ? 60 : 0) + b.score;
      return sb - sa;
    });
    var used = {};
    var lead = ranked[0];
    if (lead) {
      used[lead.url] = true;
      paper.appendChild(buildLead(lead, ranked.slice(1, 6), used, style));
    }

    /* -------- per-topic sections -------- */
    sections.forEach(function (sec, si) {
      var arts = sec.articles.filter(function (a) { return !used[a.url]; });
      if (!arts.length) return;
      arts.forEach(function (a) { used[a.url] = true; });
      paper.appendChild(buildSection(sec.topic, arts, style, si));
    });

    /* -------- footer -------- */
    var foot = el("div", "paper-footer ui");
    var st = STYLES[style] || STYLES.serious;
    foot.innerHTML = '<div class="big disp">The Daily Brief</div>' +
      esc(st.footer) + '<br/>' +
      'Edition No. ' + (prefs.edition || editionNo()) +
      ' · Auto-refreshes every 6 hours · Last set ' + fmtClock(new Date(prefs.lastRefresh || Date.now()));
    paper.appendChild(foot);

    wrap.appendChild(paper);
    app.appendChild(wrap);
    window.scrollTo(0, 0);
  }

  function buildMasthead(sections) {
    var m = el("div", "masthead");

    var top = el("div", "topbar ui");
    var left = el("div", "left");
    var back = el("button", "backbtn", ICON.back + "<span>Instapaper</span>");
    back.title = "Back to Instapaper";
    back.onclick = backToApp;
    left.appendChild(back);
    var phone = el("button", "iconbtn", ICON.phone);
    phone.title = "Add to home screen";
    phone.onclick = function () { toast("Tap your browser’s Share button → “Add to Home Screen” to install."); };
    left.appendChild(phone);
    left.appendChild(el("span", null, regionById(prefs.region).label + " Edition"));
    top.appendChild(left);
    top.appendChild(el("span", null, "Vol. I · " + (STYLES[prefs.style] || STYLES.serious).label + " edition"));
    m.appendChild(top);

    var title = el("div", "mast-title");
    var h1 = el("h1", "disp masthome", "THE DAILY BRIEF");
    h1.title = "Back to the front page";
    h1.onclick = function () { window.scrollTo({ top: 0, behavior: "smooth" }); };
    title.appendChild(h1);
    var sub = el("div", "mast-sub");
    sub.appendChild(el("div", "curated", tagline()));
    var ed = el("div", "edition");
    ed.innerHTML = '<div class="d">' + esc(fmtLongDate(new Date())) + '</div>NO. ' + (prefs.edition || editionNo());
    sub.appendChild(ed);
    title.appendChild(sub);
    m.appendChild(title);

    // section bar
    var bar = el("div", "sectionbar");
    var navs = el("div", "navs ui");
    navs.appendChild(el("span", "lbl", "Sections:"));
    sections.forEach(function (s) {
      if (!s.articles.length) return;
      var a = el("a", null, toneSectionLabel(s.topic, prefs.style));
      a.href = "#sec-" + slug(s.topic);
      navs.appendChild(a);
    });
    bar.appendChild(navs);

    var upd = el("div", "updated ui");
    var lastStr = "Updated: " + fmtClock(new Date(prefs.lastRefresh || Date.now()));
    var updSpan = el("span", null, lastStr);
    upd.appendChild(updSpan);
    var rbtn = el("button", "refreshbtn", ICON.refresh + "<span>Refresh</span>");
    rbtn.onclick = function () {
      if (isRefreshing) return;
      rbtn.querySelector("svg").classList.add("spin");
      toast("Pulling the latest off the wire…");
      buildAndRender(true);
    };
    upd.appendChild(rbtn);
    var gear = el("button", "iconbtn", ICON.gear);
    gear.title = "Edit preferences";
    gear.onclick = function () { renderSetup(prefs); };
    upd.appendChild(gear);
    bar.appendChild(upd);

    m.appendChild(bar);
    return m;
  }

  function buildLead(lead, sideArts, used, style) {
    var block = el("div", "lead");

    var main = el("a", "lead-main art");
    main.href = lead.url; main.target = "_blank"; main.rel = "noopener";
    if (lead.image) {
      var iw = el("div", "imgwrap");
      var img = el("img");
      img.src = lead.image; img.alt = ""; img.loading = "lazy";
      img.onerror = function () { iw.style.display = "none"; };
      iw.appendChild(img); main.appendChild(iw);
    }
    main.appendChild(byline(lead, style));
    main.appendChild(el("h2", "headline", esc(lead.title)));
    var dek = toneDek(lead.summary, lead, style);
    if (dek) main.appendChild(el("p", "dek", esc(dek)));
    block.appendChild(main);

    // side column: "Also in the news"
    var side = el("div", "lead-side");
    side.appendChild(el("div", "sidehead ui", style === "genz" ? "also poppin’ off" : "Also in the news"));
    var count = 0;
    sideArts.forEach(function (a) {
      if (used[a.url] || count >= 4) return;
      used[a.url] = true; count++;
      var sa = el("a", "side-art art");
      sa.href = a.url; sa.target = "_blank"; sa.rel = "noopener";
      sa.appendChild(el("div", "kicker", esc(toneSectionLabel(a.topic, style))));
      sa.appendChild(el("h3", "headline", esc(a.title)));
      sa.appendChild(byline(a, style));
      side.appendChild(sa);
    });
    block.appendChild(side);
    return block;
  }

  function buildSection(topic, arts, style, idx) {
    var sec = el("div", "section");
    sec.id = "sec-" + slug(topic);

    var head = el("div", "section-head");
    head.appendChild(el("h2", "disp", esc(toneSectionLabel(topic, style))));
    head.appendChild(el("div", "line"));
    head.appendChild(el("div", "count ui", arts.length + (arts.length === 1 ? " story" : " stories")));
    sec.appendChild(head);

    var cols = el("div", "cols");

    // build a pull quote from a strong headline in this section, dropped mid-column
    var quoteAt = arts.length >= 5 ? 3 : -1;

    arts.forEach(function (a, i) {
      if (i === quoteAt) {
        var pq = el("div", "pullquote");
        var qsrc = arts[(i + 1) % arts.length];
        pq.innerHTML = '<div class="q">“' + esc(shortTitle(qsrc.title)) + '”</div>' +
          '<div class="a">— ' + esc(qsrc.source) + '</div>';
        cols.appendChild(pq);
      }
      var art = el("a", "art" + (i === 0 ? " feat" : ""));
      art.href = a.url; art.target = "_blank"; art.rel = "noopener";
      if (a.image && i === 0) {
        var iw = el("div", "imgwrap");
        var img = el("img"); img.src = a.image; img.alt = ""; img.loading = "lazy";
        img.onerror = function () { iw.style.display = "none"; };
        iw.appendChild(img); art.appendChild(iw);
      }
      art.appendChild(el("div", "kicker", esc(toneSectionLabel(topic, style))));
      art.appendChild(el("h3", "headline", esc(a.title)));
      var dek = (i < 4) ? toneDek(a.summary, a, style) : "";
      if (dek) art.appendChild(el("p", "dek", esc(dek)));
      art.appendChild(byline(a, style));
      cols.appendChild(art);
    });

    sec.appendChild(cols);
    return sec;
  }

  function byline(a, style) {
    var b = el("div", "byline ui");
    var sep = '<span class="dot">·</span>';
    b.innerHTML = '<span>' + esc(a.source) + '</span>' + sep + '<span>' + esc(fmtAgo(a.date)) + '</span>';
    return b;
  }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

  /* =====================================================================
     AUTO-REFRESH (every 6 hours, also re-checks on focus)
     ===================================================================== */
  function scheduleAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (prefs && Date.now() - (prefs.lastRefresh || 0) >= SIX_HOURS && !isRefreshing) {
        buildAndRender(true);
      }
    }, 60 * 1000);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && prefs &&
        Date.now() - (prefs.lastRefresh || 0) >= SIX_HOURS && !isRefreshing) {
      buildAndRender(true);
    }
  });

  /* =====================================================================
     BOOT
     ===================================================================== */
  if (!prefs) {
    renderSetup(null);
  } else {
    if (!prefs.edition) prefs.edition = editionNo();
    buildAndRender(false);
  }
})();
