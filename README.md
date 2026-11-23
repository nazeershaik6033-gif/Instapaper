# Instapaper — Your Personal Reading App

A premium read-it-later app, rebuilt as an installable web app (PWA). **Every premium feature is unlocked, free forever — no subscription.** Everything is stored privately on your device.

## Features

**Core**
- Save any link — the article is downloaded, stripped of clutter, and stored for **offline reading** (airplanes, subways, anywhere)
- Beautiful, mobile-optimized text view with serif typography
- YouTube links saved as **Videos** with thumbnails and an in-app player
- Reading progress tracked per article ("16 min read", %, Completed)
- Swipe left to archive, swipe right to like, long-press for all actions

**Premium (all unlocked)**
- 🔎 **Full-text search** across everything you've ever saved
- ✏️ **Unlimited highlights & notes** — select any text in an article
- 🎧 **Text-to-speech** with adjustable speed and voice, plus **Playlists** to listen to multiple articles seamlessly — auto-detects Telugu / Hindi / other Indic text and speaks it with a matching voice
- ⚡ **Speed reading** — words flashed one at a time at up to 700 wpm, with smart pacing
- 📁 Folders, tags, and sorting by date / length / popularity
- 🎨 Fonts, text size, line spacing, and four themes (Light, Sepia, Dark, Black) — one-tap theme cycling from the header
- 💾 Full backup export / import — with **automatic backup reminders**: pick a schedule (off / 3 days / weekly / 2 weeks / monthly) in **Settings → Syncing & Backup** and the home screen nudges you to export a fresh backup with one tap when one is due

**Daily Brief**
- 📰 A built-in news digest in the sidebar — fresh headlines pulled from Google News
- 🌐 **Pick your region** — switch between **Global** and **India** (plus the US, UK, Australia, Canada, Singapore, and UAE) right from the top of the brief
- 🗂️ **Pick a category** — Top stories, World, National, Business, Technology, Science, Health, Sports, or Entertainment
- Tap any headline to save the full article for **offline reading**; your region and category choices are remembered

**Photos & files**
- 📷 **Photos section** (sidebar → Photos) — add images and files via the **+** button: **Take photo**, **Photo library**, or **Upload files** (images, PDFs, anything)
- 🗂 Three tabs — **All photos**, **Albums**, and **Favourites**; **pin** photos to the top, group them into **albums**, and **favourite** the best ones
- ✂️ **Edit** any photo — add a caption, **crop**, and **rotate**; **move**, edit, or delete from any tab
- Photos are stored privately on-device in IndexedDB (kept out of the backup file so backups stay small)

**Reading state & auto-archive**
- Articles and videos track a **read / watched** state. Finishing an article (scrolling to the end, or finishing TTS / Speed Read) or marking a video watched **auto-moves it to Archive**, keeping Home and Videos as clean "to-do" lists. Nothing is deleted — find everything you've finished under Archive or the **Read** filter.
- **Filter & sort pills** — quick **Filter** (All / Unread / Liked / Articles / Videos / Completed) and **Sort** (Newest / Oldest / Longest / Shortest / Popular) chips sit right under the search bar on every list.
- **Mark videos as watched** — right in the video player, or via long-press → Mark as watched.

**AI for videos**
- Open the **✦ AI assistant** on any saved video for **Summarize** (key points + takeaway) and **Ask about this video** (Q&A answered from the video) — in English, Telugu, Hindi, Tamil, and more.
- **Transcript** — under *Watch on YouTube* in the reader. The label previews the saved transcript; tap it for the transcript window:
  - A **paste box** saved with the video: Paste, Copy, Share, Clear. Edits save as you type.
  - **Translate** with online AI (Gemini or OpenRouter, whichever has a key). Telugu, Hindi and English are one tap; the app detects which of the three the transcript is in and offers the other two (more languages under *More languages*). Each translation is saved and shown as a tab next to *Original*.
  - **Full screen** (also the ⤢ icon on the label): read the transcript at reader size and switch between *Original* and translations. Select any text and tap **Highlight** or **Note**. The **Highlights** tab lists only your highlights (tap one to jump to it, **Remove** one, **Copy all** or **Clear all**). Tap a highlight in the text for **Remove highlight** / Note / Copy, or select over one and tap **Unhighlight**, and **Notes** is a notepad for the video. A bar under the tabs shows **words read of the total and % read**; the app remembers where you stopped (per language) and reopens there, and the reader's label shows the % too. **✎ Edit** lets you tap any paragraph — long pasted walls of text are split into sentence-sized parts — and fix just that part (Save / Cancel / Delete). Highlights and notes are also on your Notes page.
  - **Get the transcript**: **Whisper on my Mac** (free, any length — see *Video transcripts* below; fills the box when done, even if you left), **Gemini** (fills the box; keep the app open), the **Claude app**, or a website — **TurboScribe**, **NoteGPT**, **YouTubeToTranscript**, **Tactiq**: the link is copied and the site opens; copy the transcript there, come back, tap **Paste**.

**Daily Brief**
- 📰 A built-in news digest in the sidebar — fresh headlines pulled from Google News
- 🌐 **Pick your region** — switch between **Global** and **India** (plus the US, UK, Australia, Canada, Singapore, and UAE) right from the top of the brief
- 🗂️ **Pick a category** — Top stories, World, National, Business, Technology, Science, Health, Sports, or Entertainment
- Tap any headline to save the full article for **offline reading**; your region and category choices are remembered

**Content editing**
- 🧹 **Remove blocks** — saved a page with leftover junk? Long-press → Edit content → tap unwanted paragraphs/images to delete them, or tap **✦ Suggest blocks to remove** to let AI pre-select the boilerplate (you review and Save)
- 📝 **Edit text** — edit the title and full article text (simple markdown formatting) and save your own version

**Article page — magazine layout** (Aa → Layout: Magazine / Classic)
- 📄 Every article opens with a centred header like the Dribbble *Blog page*: a pill with the source (or tag), a big bold title, the article's summary, and an author line with the site icon, date and minutes to read; then a large rounded hero image
- Magazine typography: bold sans section headings, a dark-bar pull quote style, rounded images, roomier paragraphs — your chosen font, size and spacing still apply to the text
- 🔗 **Read More** at the end: more posts from the same blog (with their pictures), then more from the same source and what's waiting in Home — tap one to open it; plus *View original* and *Share article*
- **Classic** in Aa brings back the original plain layout

**Blogs — magazine view** (Latest / Manage switch at the top)
- 📰 **Latest** is a magazine of every post from the blogs you follow: a big headline with how many are new, **category pills** (All posts, New, and one per group), the newest post as a large **featured card** with excerpt, then a two-column grid of image cards (blog, bold title, date, author, red dot for new). *Read more posts* loads more; *Mark all as read* clears the new dots
- 🖼 Post pictures come from the feeds themselves (media images, enclosures or the first picture in the post); blogs without pictures get a tasteful colour cover with their icon and name
- 🔎 Search filters posts by title, blog or excerpt; the AI digest and *Ask Claude about my blogs* stay in the toolbar
- ⚙️ **Manage** is the previous screen — groups, adding, editing, reordering and moving blogs

**My Routine — Today (watch-first)**
- ▶️ My Routine opens on **Today**: one Shorts-style swipe feed of everything new since this morning's routine window, with pills for **Today**, each group, and **Earlier** (the catch-up days, one pill per day). **Manage** opens the full list — channels, groups, routine times — and **Today** brings you back
- 🔴 **Play today's videos** — a playlist of today's new YouTube videos, oldest first, skipping ones you marked Done. Tap play once and each video **starts the next when it ends** (Autoplay on/off); ⏮ ⏭ or swipe the player; an **Up next** list to jump anywhere
- Every YouTube video in the feed and the playlist has **Done · Save · Transcript · Summary · More** (Newspaper edition, Translate, Notes & highlights, Share, Copy link, Open in YouTube). Swiping never marks anything; **Done** does. Full-screen Shorts now sit above the app's header and + button, so the ✕ / minimise header always works

**Newspaper editions of transcripts**
- 📝 **Transcript** on a video saves it to your library (once) and opens the transcript box: tap *YouTubeToTranscript* (opens straight to that video), copy, come back, **Paste** — then **Read as newspaper**
- 📰 The **AI newspaper edition**: masthead, section label, headline, standfirst, an *In this edition* box of key points, section headings, pull quotes and a drop cap. The AI only lays out the page — your transcript's words are never rewritten (no key → the same layout with plain parts)
- Read it your way: **fonts** (Newsprint, Lora, Literata, Merriweather, Sans — Telugu and Hindi always render), **text size**, **paper** (Newsprint / White / Sepia / Night), **one or two columns**, a **Contents** list that jumps to each section, a reading-progress bar; select text to **Highlight** or copy; a **Notes** pad per video; **Translate** into Telugu, Hindi, English and more — each language gets its own edition
- ⤓ **Download** as **PDF** (Print → Save to Files), a self-contained **HTML file**, or **Save to my library** as an article; every newspaper also appears on the **Editions** shelf on Home

**My Routine**
- 🗂 **Groups are tabs down the left** — a sticky side rail lists every group as a flat row with a colour dot and a count (or a red number when something's new); the pane beside it shows just that group's channels and their new posts, so content starts at the top of the screen instead of below a stack of cards
- ⏴ **Collapse the rail** — the small arrow above it shrinks the rail to a slim column of colour-ringed dots (still badged when something's new), freeing width for reading; tap a dot to switch groups without expanding back
- 📋 **All** — the first rail entry keeps the full stacked sweep of every group, exactly as before
- ▶️ **Shorts** — the ▶ Shorts button on any group opens its updates as a YouTube-Shorts-style vertical swipe feed: big picture or video, channel and title at the bottom, **Done / Save / Share / Open** down the right. Videos play only when you tap them; swiping just moves on — an update is checked off only with **Done** (and when every new update of a channel is done, the channel is ticked for this routine window). Maximise / minimise between full screen and inline, and **Set as default** to choose how it opens
- ⏪ **Catch-up** — pinned above everything else and badged with what you missed. Updates you didn't open before a routine window rolled over are grouped **by day first** (Today / Yesterday / Fri, 29 Aug), then by window, then by source. Opening an item marks it read and drops the badge; **＋ Save to Home** next to each update adds it to your library (videos instantly, with title, channel and thumbnail); **Mark all read** clears a whole day at once
- 📌 **Pin to keep** — catch-up is swept after 14 days; pin anything you want to hold on to and it moves to a **Pinned** list that survives the sweep
- 👉 **Swipe** left or right anywhere in the content pane to move to the next or previous group
- 🕐 **One routine window at a time** — the screen follows the current window (Morning / Afternoon / Night); tap the window pill in the toolbar to look at another one or edit the times
- ✏️ **Group management in one sheet** — the folder icon opens Groups, where you rename, reorder (which reorders the rail) and delete; deleting a group keeps its channels and moves them to "Other"

**Browser & Logged-In Sites**
- 🌐 Built-in browser (sidebar → Browse, or Settings → Logged-In Sites): Google search by default, popups allowed, one-tap "Open in browser" for sites that refuse embedding
- 💾 **Save / Share from the browser** — reading any page in the built-in browser? Tap **Save** to download & clean it straight into your reading list, or **Share** to send the link out via the system share sheet
- 📥 **Share into Instapaper** — once installed to your home screen, Instapaper appears in your phone's share sheet, so you can share a link from any app and it lands in your Save dialog
- ⭐ Save your favorite sites with favicons — add, rename, reorder, remove
- 🎯 **Icons that always look right** — each site's icon is fetched sharp, and if a site has no usable icon you get a clean coloured letter tile instead of a blurry generic globe or an empty square
- 📋 **Scannable list, not a sparse grid** — bookmarks are compact rows showing the site name, its address, and when you last opened it, so a whole screen of links fits at a glance
- ✏️ **Edit mode** — rename, reorder and delete live behind the pencil in the top bar, so the everyday screen is just your links
- 🔎 **Search your saved links** — type in the top bar to filter every bookmark by any letter or word (name, address, or folder); press Enter to open an address or search Google instead
- ↩️ **Picks up where you left off** — open a site and come back within 30 minutes and the Browser reopens exactly as you left it, instead of bouncing you to the home page
- ✋ **Drag to organise** — tap **Edit**, then drag the handle beside a link to reorder it or drop it straight onto another group; drag the handle beside a group name to reorder groups
- 🕘 **Most visited & History** — your most-opened sites sit at the top, and a searchable History lists everything you've opened, with one-tap re-open, per-entry remove, and Clear all
- ➕ **Quick add** — add the address you just typed in one tap, or hit **+** on any folder and the link is pulled from your clipboard with the name and icon filled in automatically
- 🛟 **Safer edit controls** — rename and delete only appear in Edit mode, are full-size and well-separated, and nothing is ever deleted without a confirmation (deleting a folder keeps its bookmarks and moves them to Bookmarks)
- 🔐 **Encrypted password vault** — AES-256-GCM with a passcode (PBKDF2, 310k iterations); copy username/password with one tap while logging in. Nothing ever leaves your device; backups carry the vault still encrypted.

**In-app browser & Browser Agent** (✦ in the browser's header, or ⋯ on a bookmark → Open in app browser)
- Safari-style tabs, back/forward, find on page, share, and one-tap **Save page to Instapaper**; tabs are remembered between launches
- **Smart** view renders any page on your phone without its scripts (so it always opens; links, forms and dropdowns work, script-heavy sites are pre-rendered remotely); **Live** view shows the real site — tap the badge in the address bar to switch
- ✦ **Browser Agent** — a rebuild of [browser-use](https://github.com/browser-use/browser-use) that runs on the iPhone: give it a task and it searches, opens pages, clicks, types, scrolls, reads whole pages with AI, manages tabs, keeps a todo.md and notes, saves pages to your library, and reports back with sources. Live step timeline, pause/resume/stop, follow-ups, continue, run history; answers can be copied, shared, read aloud or saved as notes
- Models: **Gemini** (free key, recommended), OpenRouter, Claude (Anthropic API), OpenAI, or Browser Use Cloud (beta). Settings: max steps, actions per step, thinking, flash mode, highlights, allowed domains, custom instructions, search engine
- Smart view and the agent don't use your logins, and pages go through public proxies — don't use them for anything private
- 🇮🇳 **India mode** (Agent settings → India, on by default): Indian search results, and the agent knows you're in India. Many Indian sites (e.g. Eenadu e-paper) refuse servers abroad, which is where the free page fetchers run, so they open in Live view automatically. To open them in Smart view and with the agent, add a **Jina API key** (pages are then fetched and rendered through an Indian connection), and/or deploy `worker/feed-proxy.js` with a `KEY` secret and set the Feed proxy to `https://<worker>.workers.dev/?key=<KEY>&url=` — the worker runs in the Cloudflare data centre nearest you

**Home insights** (top of Home — tap *Hide insights* to fold it away)
- 🗂 **Your library by week & month** — Home is split into *This week · Last week · Earlier this month · Last month* and then one heading per month, each with its dates, item count, unread count and minutes to read; tap a heading to fold it (when sorted by Newest/Oldest)
- 🔽 Every insights section folds on its own (and shows a one-line summary while folded)
- 🗓 A premium dashboard with a **Week / Month** switch: everything is compared with the **same days of last week / last month**, with ▲/▼ percentage changes
- ✦ Hero card with reading & watching time, your **day streak**, how much is left to read (with total minutes) and to watch, plus plain-language insights (“You saved 12 items — 4 more than last week”, busiest day, top source)
- 📊 **Trend** chart, this period against the last, day by day — Saved, Highlights or Minutes; tap a day for its numbers
- **Reading** (saved, finished, time, words), **Videos & transcripts** (saved, watched, watch time, transcripts), **Highlights & notes** (with top sources and tags), **Routine & news** (updates caught up, routine days done, updates opened) and a **Continue** row of everything half-read
- Saved items, highlights, notes, transcripts and routine check-offs count from their own dates, so comparisons work straight away; reading/watching time, finished and watched are tracked on the device from the day you update

**YouTube, Instagram & X inside the app** (their full sites refuse to load inside other apps, so they get their own viewer)
- ▶️ **YouTube** — any video, short or playlist link plays right in the app in YouTube’s privacy-enhanced player, with title, channel, description and **Up next**; **search YouTube**, open **channels** (latest videos) and see **Recently watched**. Save / Share / Copy link / Safari / YouTube app buttons on every video
- 📷 **Instagram** — posts and reels open in Instagram’s own embed (with captions); public profiles show Instagram’s profile preview; paste any link with one tap
- 𝕏 **X** — posts open in X’s embed; public profiles show recent posts; type an @username or paste a link
- Only when opened from the **Browse section** (the Browse screen and the in-app browser, which shows an **APP** badge). Everywhere else in the app these links open in their installed apps as usual. Feeds, stories, comments and messages need your account, so they still need the real app
- **Privacy & Shields → Open inside the app (from Browse)** is the list of sites this applies to: remove any of them, or add others (e.g. reddit.com) — added sites open in the in-app browser instead of Safari

**Shields — privacy & ad blocking** (inspired by [Cromite](https://github.com/uazo/cromite); shield icon in the address bar, or ⋯ → Privacy & Shields)
- 🛡 **Built-in ad & tracker blocker** for Smart view: ad, tracker and tracking-pixel requests are removed before the page draws, and ad boxes, empty ad slots and cookie banners are cleaned out. A green shield with a count shows what was blocked; tap it for the numbers and the list of blocked servers
- 📜 **Filter lists** — a built-in list is always on; **EasyList** and **EasyPrivacy** download automatically, and **Peter Lowe’s list**, **Fanboy Annoyances** (cookie walls, newsletter pop-ups, “open in app” bars) and **Fanboy Social** are one tap away. Lists update weekly, survive app updates, and **My filters** takes your own Adblock Plus rules (`||ads.example.com^`, `example.com##.promo`, `@@||site.com^`)
- ⚙️ **Per-site settings** (like Cromite’s site settings): shields, ad-box removal, images, force dark, autoplay, pop-ups, **JavaScript** (On = always open in Live view, Off = always Smart), page zoom and custom CSS
- ✂️ **Hide an element** — tap any banner, box or bar on a page (“Select bigger” to grow the selection) and it stays hidden on that site; undo from the shield
- 🧹 **Tracking protection** — strips `utm_*`, `fbclid`, `gclid`, `igshid`, Google’s `rlz`/`ved`… from every link, skips redirect wrappers (google.com/url, l.facebook.com, out.reddit.com…), skips Google AMP, upgrades http to https, sends no referrer; **Copy link** and **Share** always send the clean link. Optional pop-up blocking for Live view
- 🕶 **Private tabs** (⋯ → New private tab, or the mask in the tab switcher) are never saved and leave no history; **Always open private tabs** makes it the default
- 🕘 **History** with search, per-entry remove and a **keep history for** setting (off / 1 / 7 / 30 / 90 days / forever); **Clear browsing data** by time range (history, tabs, agent runs, site settings, Smart-view memory, filter lists)
- 🔎 **Address-bar suggestions** from open tabs, your sites and history; extra search engines for the address bar — **DuckDuckGo Lite**, Startpage, Brave Search, Mojeek, Ecosia, Google (English, no tracking parameters)
- 📖 **Reader view**, **View page source**, **Add to your sites**, **Bookmark all tabs**, **Use as home page** (new tabs open it), **import/export bookmarks** as HTML (works with Chrome, Safari and Firefox exports), a **list view** for the tab switcher, and a confirmation before **Close all**
- 🧭 **On the default Browse screen too** (links that open in Safari): the 🛡 button opens Privacy & Shields with **Block ads in Safari** — one tap installs an ad-blocking DNS profile (**AdGuard DNS** or **Mullvad DNS**, encrypted DNS over HTTPS) that blocks ad and tracker servers in Safari and every app; remove it any time in Settings → General → VPN & Device Management. Links are cleaned (no tracking parameters, redirect wrappers or AMP, https) before Safari opens them, searches use your privacy search engine, and the 🕶 button turns on **Private mode** so nothing is added to History
- Live view runs the real site, so blocking can’t reach inside it — use Smart view for ad-free pages. Cromite’s engine-level protections (fingerprinting, WebRTC, JIT…) need a real browser build and aren’t possible in a web app

**Settings** are organized like the classic app: **Start → Home page**, General → Appearance, Behavior, Voices, AI Assistant, Logged-In Sites, Syncing & Backup, and **App → Force reload**.
- 🏠 **Home page** — pick which screen opens on launch: My Routine, Headlines, **Home/Library** (the default), Photos, Blogs, Liked, Archive, Notes, Threads, or Tags.
- 🔄 **Force reload to latest version** — drops the cached app shell and service worker and reloads so you get the newest deployed build immediately. Your saved articles, notes, photos and settings are untouched.

**AI assistant (✦ icon in the header, on any page)**
- **Open in Claude — no API key.** Hand any command (with or without an article) straight to the **Claude app** on your phone using your own Claude account — no key, no setup. On an article it packages your instruction plus the article text; tap a quick preset (summarize, key takeaways, translate, explain simply, counterarguments, turn into a thread) or type your own. It opens the Claude app (or claude.ai if the app isn't installed) with the prompt pre-filled, and always copies the full prompt to your clipboard as a one-tap paste backup. This unlocks the full power of Claude — anything Claude can do — with zero configuration.
- **Ask Claude about my library** — free-form Q&A over everything you've saved, no API key. Claude receives a compact index (titles, sources, links) of your saved articles and answers things like "which of these cover AI policy?" or "build me a reading plan."
- **Ask Claude about my routine** — no API key. Pick which updates from your **My Routine** channels (articles and videos) to send, then check any combination of **Transcript** (Claude fetches each video's transcript itself), **Summarize**, and **Newsletter** (a polished, ready-to-send write-up) — Claude does exactly that with the items you picked. Reachable from the ✦ menu or with one tap right on the My Routine screen.
- Prefer a built-in, in-app model instead? Connect either provider in Settings:
  - **OpenRouter** (free key at [openrouter.ai/keys](https://openrouter.ai/keys)) — DeepSeek R1, Llama, Qwen, Mistral free tiers plus paid models, or any custom model id
  - **Google Gemini** (free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) — Gemini 2.5 Flash / Pro / Flash-Lite with a generous free tier
- **Summarize** any article into key points + takeaway
- **Translate** into Telugu, Hindi, Tamil, Kannada, and many more — read the result, listen to it spoken aloud (తెలుగు / हिन्दी voices), or save it as a new article
- **Rewrite** — simplify, shorten, expand, change tone, or convert to bullet points
- **Ask** questions about any article (or chat freely without one) — open the assistant from an article's own menu to work with it directly
- **Add to My Routine** — describe a channel, account, or paste a link (e.g. "Diary of a CEO YouTube channel" or "@mufaddal_vohra") and the AI figures out what it is and adds it as a My Routine source. It resolves to the **real destination** (the actual YouTube channel, Telegram, or site) and, if an exact link can't be determined, falls back to a live search on the right platform — so a routine item always opens somewhere real, never a dead link.
- AI results can be copied, shared, spoken aloud, or saved to Notes

## The Daily Brief — your personalized newspaper (📱 header icon)

Tap the **phone icon** in the header to open **`newspaper.html`**: a standalone,
premium personalized newspaper (separate from the in-app Daily Brief checklist).

- **Setup once** — pick topics (Tech, AI, Cricket, Finance… or type your own), a
  **region** (India-specific, Global, or another country — US, UK, Australia, Canada,
  Singapore, UAE), and a reading style: **Serious**, **Punchy**, or **gen z** — the
  whole paper's tone follows.
- **Live news** — real headlines pulled from Reddit's top posts (images + ranking)
  and Google News RSS (breadth + any custom topic), merged, de-duped, and ranked.
- **Real broadsheet layout** — bold masthead, lead hero story, "Also in the news"
  rail, multi-column sections, dividers, pull quotes, kickers, bylines, serif type.
- **Auto-refreshes every 6 hours** (and on tab focus), with a last-refresh time and a
  manual Refresh button. Preferences + last edition are saved in the browser
  (instant loads, offline-friendly). Edit anytime via the ⚙ gear. Fully responsive.

## How to install on your iPhone

1. Enable GitHub Pages for this repository: **Settings → Pages → Deploy from a branch → select your branch and `/ (root)` → Save**
2. Open the published URL in **Safari** on your iPhone
3. Tap the **Share** button → **Add to Home Screen**
4. Launch it from your home screen — it runs full screen and works offline

## Server-side refresh (reliable My Routine updates)

My Routine reads YouTube / Telegram / RSS in the browser through free public proxies, which are often blocked.
A GitHub Action fetches the same sources from a server instead and the app reads the result first:

1. In the app tap **Fix this for good: set up server refresh** (shown in Catch-up when feeds fail), or **Settings → Behavior → Server-side refresh → Save sources to GitHub**.
2. GitHub opens a new `routine-sources.json` with your sources already filled in — press **Commit new file**.
3. That commit starts the **Refresh feeds** workflow by itself (Actions tab shows the run). After that it runs on GitHub's schedule
   and publishes `feeds.json` to the `feeds-data` branch (so `main` stays clean).
   When you add or remove sources, tap **Update sources on GitHub**: the list is copied and the file's edit page opens — paste and commit.

The app shows that snapshot instantly, then still fetches live anything the snapshot doesn't cover or that is more than
20 minutes old — and **Refresh** always fetches live. The status line under the tabs says how current the list really is.

**On-time server refresh.** GitHub's scheduler is best-effort: on a quiet repo it skips most runs and fires a few times a
day at random times (the Actions history shows gaps of 5–8 hours), so the server copy can be hours old at your routine time.
If you deployed `worker/feed-proxy.js` on Cloudflare, its optional `scheduled` handler fixes that: add a `GH_TOKEN` secret
(a fine-grained token for this repo with *Actions: Read and write*) and a Cron Trigger such as `45 * * * *`, and the
worker starts the GitHub job on time. Instructions are at the bottom of the worker file.
Note: GitHub pauses scheduled workflows in repos with no activity for 60 days — re-run the workflow if that happens.

## Video transcripts (Whisper on your Mac)

`.github/workflows/transcribe.yml` runs `scripts/transcribe.py`, adapted from
[bulk_transcribe_youtube_videos_from_playlist](https://github.com/Dicklesworthstone/bulk_transcribe_youtube_videos_from_playlist):
pytubefix downloads the audio (yt-dlp is the fallback) and the free, open-source **faster-whisper** turns it into text with
voice-activity filtering. Nothing is paid — only OpenAI's hosted Whisper API costs money, and this doesn't use it.
The result is published as `t/<id>.json` on the `transcripts-data` branch and the app fills the video's transcript with it.

YouTube refuses downloads from GitHub's servers ("confirm you're not a bot"), so run the job **on your own Mac**: it becomes a
*self-hosted runner* (GitHub's free, official agent) and picks up the job when you tap **Transcript → Whisper on my Mac** on your
iPhone. Home internet isn't blocked, and there's no length limit.

**One-time setup on the Mac**

1. Install the tools (with [Homebrew](https://brew.sh)): `brew install python@3.12 deno`
   (`deno` lets yt-dlp read YouTube; add `node` too if you like — pytubefix uses it).
2. On GitHub open this repo → **Settings → Actions → Runners → New self-hosted runner** → **macOS** (ARM64 for Apple silicon).
   Run the *Download* and *Configure* commands it shows in Terminal. When `config.sh` asks for **additional labels**, type `whisper`.
3. Start it: `./run.sh` (stays in that Terminal window), or run it in the background at login:
   `./svc.sh install && ./svc.sh start`.
4. **Safety** — this repo is public, so on GitHub go to **Settings → Actions → General → Fork pull request workflows from outside
   collaborators** and pick **Require approval for all outside collaborators**. Then nobody else's pull request can run code on your Mac.
   The transcription job itself can only be started by someone with write access (you, through the app).

**On the iPhone**

1. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new): repository access *only this repo*,
   permission **Actions: Read and write**.
2. In the app: **Settings → AI → Video transcripts**: *Run Whisper on* **My Mac**, paste the token, pick a model
   (Small is the default; on an Apple-silicon Mac a 1-hour video takes roughly 8 minutes with Small).
3. On a video: tap **Transcript** under *Watch on YouTube* → **Whisper on my Mac**. You can close the app; progress shows on the label,
   and the transcript fills in when it's done. If the Mac is asleep the job waits until the runner is back.

The workflow file must also be on the repo's **default branch** for GitHub to accept the app's request (the job itself runs the
copy on `main`).

## Notes

- Saving a **new** article needs an internet connection (the page is fetched through public read-it-later proxies). Reading everything you've already saved works fully offline.
- All data lives in your browser's local storage on the device. Turn on **automatic backup reminders** (Settings → Syncing & Backup) and export regularly — your backup file is the only copy if your library is precious to you. Deleting/reinstalling the app can wipe its local storage, so keep a recent backup file somewhere safe.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, styles, fonts |
| `app.js` | The entire application |
| `browser.js` | In-app browser and Browser Agent |
| `adblock-*.mobileconfig` | iOS ad-blocking DNS profiles (AdGuard, Mullvad) offered on the Browse screen |
| `edition.js` | Newspaper editions of transcripts: AI layout, reader, downloads, Editions shelf |
| `insights.js` | Home insights dashboard and the on-device activity log |
| `social.js` | In-app viewer for YouTube, Instagram and X |
| `shields.js` | Shields — ad & tracker blocking, filter lists, per-site settings, tracking protection |
| `sw.js` | Service worker — offline caching |
| `manifest.json` | PWA manifest (icons, share target) |
| `icon-*.png` | App icons |
