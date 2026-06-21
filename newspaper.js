/* =====================================================================
   THE DAILY BRIEF — a personalized digital newspaper
   Pure vanilla JS. Fetches live news, lays it out like a real broadsheet,
   remembers your taste, and refreshes itself every six hours.
   ===================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "dailybrief_v1";
  var SIX_HOURS = 6 * 60 * 60 * 1000;
  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");

  /* ---------------- preset topics (mirrors the setup screen) ---------- */
  var PRESET_TOPICS = [
    "Tech", "AI", "Finance", "Cricket", "Sports", "Science",
    "Politics", "Entertainment", "Health", "Business", "Climate", "Space"
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
    space: ["space", "spaceflight"]
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
    return d + "d ago";
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
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); },
    function (u) { return "https://thingproxy.freeboard.io/fetch/" + u; }
  ];

  function proxiedFetch(url) {
    var i = 0;
    function attempt() {
      if (i >= PROXIES.length) return Promise.reject(new Error("all proxies failed"));
      var px = PROXIES[i++](url);
      return fetch(px, { method: "GET" }).then(function (r) {
        if (!r.ok) throw new Error("status " + r.status);
        return r.text();
      }).catch(function () { return attempt(); });
    }
    return attempt();
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

  /* ---- Google News RSS: breadth + freshness, great for custom topics  */
  function fetchGoogleNews(topic) {
    var url = "https://news.google.com/rss/search?q=" + encodeURIComponent(topic) +
              "&hl=en-US&gl=US&ceid=US:en";
    return proxiedFetch(url).then(function (txt) {
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
        // Google formats titles as "Headline - Source"
        if (!source && / - /.test(titleRaw)) {
          var parts = titleRaw.split(" - ");
          source = parts.pop();
          title = parts.join(" - ");
        } else if (source && title.indexOf(" - " + source) > -1) {
          title = title.replace(" - " + source, "");
        }
        var summary = stripTags(decodeEntities(descRaw)).slice(0, 240);
        out.push({
          title: decodeEntities(title).trim(),
          url: link.trim(),
          source: (source || "Google News").trim(),
          date: pub ? new Date(pub) : new Date(),
          image: "",
          score: 0,
          topic: topic,
          summary: summary
        });
      });
      return out;
    });
  }

  /* ---- fetch one topic: merge both sources, dedupe, rank ------------ */
  function fetchTopic(topic) {
    var results = [];
    return fetchReddit(topic).catch(function () { return []; })
      .then(function (r) { results = results.concat(r); return fetchGoogleNews(topic).catch(function () { return []; }); })
      .then(function (g) {
        results = results.concat(g);
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
        // rank: images + score + recency
        merged.sort(function (a, b) {
          var sa = (a.image ? 50 : 0) + Math.min(a.score, 5000) / 50 + recencyBoost(a.date);
          var sb = (b.image ? 50 : 0) + Math.min(b.score, 5000) / 50 + recencyBoost(b.date);
          return sb - sa;
        });
        return merged.slice(0, 12);
      });
  }
  function recencyBoost(date) {
    var h = (Date.now() - date.getTime()) / 3600000;
    if (h < 6) return 30; if (h < 24) return 18; if (h < 72) return 8; return 0;
  }

  function fetchAll(topics) {
    return Promise.all(topics.map(function (t) {
      return fetchTopic(t).then(function (arts) { return { topic: t, articles: arts }; })
        .catch(function () { return { topic: t, articles: [] }; });
    }));
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
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/></svg>'
  };

  /* =====================================================================
     SETUP SCREEN
     ===================================================================== */
  function renderSetup(existing) {
    var draft = {
      topics: existing ? existing.topics.slice() : ["Tech", "AI", "Finance", "Business"],
      style: existing ? existing.style : "serious"
    };

    app.innerHTML = "";
    var root = el("div", "setup");
    var inner = el("div", "setup-inner");

    // masthead
    var mh = el("div", "setup-masthead");
    mh.appendChild(el("h1", "disp", "The Daily Brief"));
    mh.appendChild(el("div", "tag", "Curated exclusively for you."));
    inner.appendChild(mh);

    /* ---- step 1: topics ---- */
    var s1 = el("div", "step");
    var h1 = el("div", "step-head ui", '<span class="n">1.</span> Select your topics');
    s1.appendChild(h1);
    s1.appendChild(el("div", "rule"));
    var chips = el("div", "chips");
    s1.appendChild(chips);

    function renderChips() {
      chips.innerHTML = "";
      // presets first
      PRESET_TOPICS.forEach(function (t) {
        var on = draft.topics.some(function (x) { return x.toLowerCase() === t.toLowerCase(); });
        var c = el("button", "chip ui" + (on ? " on" : ""), esc(t));
        c.onclick = function () { toggleTopic(t); };
        chips.appendChild(c);
      });
      // custom topics not in presets
      draft.topics.forEach(function (t) {
        if (PRESET_TOPICS.some(function (p) { return p.toLowerCase() === t.toLowerCase(); })) return;
        var c = el("button", "chip on ui", esc(t) + ' <span class="x">×</span>');
        c.onclick = function () { toggleTopic(t); };
        chips.appendChild(c);
      });
    }
    function toggleTopic(t) {
      var idx = -1;
      draft.topics.forEach(function (x, i) { if (x.toLowerCase() === t.toLowerCase()) idx = i; });
      if (idx > -1) draft.topics.splice(idx, 1);
      else draft.topics.push(t);
      renderChips(); updateCta();
    }
    renderChips();

    // add custom
    var addrow = el("div", "addrow");
    var inp = el("input", "ui");
    inp.type = "text"; inp.placeholder = "Add another topic…";
    var addbtn = el("button", "ui", "Add");
    function addCustom() {
      var v = inp.value.trim();
      if (!v) return;
      if (!draft.topics.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) {
        draft.topics.push(v);
      }
      inp.value = ""; renderChips(); updateCta(); inp.focus();
    }
    addbtn.onclick = addCustom;
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });
    addrow.appendChild(inp); addrow.appendChild(addbtn);
    s1.appendChild(addrow);
    inner.appendChild(s1);

    /* ---- step 2: style ---- */
    var s2 = el("div", "step");
    s2.appendChild(el("div", "step-head ui", '<span class="n">2.</span> Choose your style'));
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
      prefs = {
        topics: draft.topics.slice(),
        style: draft.style,
        lastRefresh: 0,
        cache: (existing && existing.cache) ? existing.cache : null,
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
    var fresh = forceFetch || !prefs.cache ||
      (Date.now() - (prefs.lastRefresh || 0) > SIX_HOURS);

    if (!fresh && prefs.cache) {
      renderPaper(reviveCache(prefs.cache));
      scheduleAutoRefresh();
      return;
    }

    var loader = showLoading();
    app.appendChild(loader);
    isRefreshing = true;

    fetchAll(prefs.topics).then(function (sections) {
      isRefreshing = false;
      // keep only sections that returned something; if everything failed, surface a friendly state
      var nonEmpty = sections.filter(function (s) { return s.articles.length; });
      if (!nonEmpty.length) {
        renderError(loader);
        return;
      }
      prefs.lastRefresh = Date.now();
      prefs.cache = serializeCache(sections);
      savePrefs();
      renderPaper(sections);
      scheduleAutoRefresh();
    }).catch(function () {
      isRefreshing = false;
      renderError(loader);
    });
  }

  function serializeCache(sections) {
    return sections.map(function (s) {
      return {
        topic: s.topic,
        articles: s.articles.map(function (a) {
          return [a.title, a.url, a.source, a.date.getTime(), a.image, a.score, a.summary];
        })
      };
    });
  }
  function reviveCache(cache) {
    return cache.map(function (s) {
      return {
        topic: s.topic,
        articles: s.articles.map(function (a) {
          return { title: a[0], url: a[1], source: a[2], date: new Date(a[3]), image: a[4], score: a[5], topic: s.topic, summary: a[6] };
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
      return ((b.image ? 100 : 0) + b.score) - ((a.image ? 100 : 0) + a.score);
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
    var phone = el("button", "iconbtn", ICON.phone);
    phone.title = "Add to home screen";
    phone.onclick = function () { toast("Tap your browser’s Share button → “Add to Home Screen” to install."); };
    left.appendChild(phone);
    left.appendChild(el("span", null, "Personal Edition"));
    top.appendChild(left);
    top.appendChild(el("span", null, "Vol. I · " + (STYLES[prefs.style] || STYLES.serious).label + " edition"));
    m.appendChild(top);

    var title = el("div", "mast-title");
    title.appendChild(el("h1", "disp", "THE DAILY BRIEF"));
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
