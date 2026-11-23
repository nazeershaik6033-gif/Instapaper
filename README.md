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

**Content editing**
- 🧹 **Remove blocks** — saved a page with leftover junk? Long-press → Edit content → tap unwanted paragraphs/images to delete them
- 📝 **Edit text** — edit the title and full article text (simple markdown formatting) and save your own version

**Browser & Browser Agent** (sidebar → Browse)
- 🌐 Safari-style browser built for iPhone: tabs (with a tab switcher), back/forward, find on page, share, open in Safari, and one-tap **Save page to Instapaper**. Tabs are remembered between launches.
- Two views per tab — tap the **LIVE / SMART** badge in the address bar to switch:
  - **Live** — the real site with its JavaScript and your logins (some sites refuse to load inside apps)
  - **Smart** — the page is fetched and rendered on your phone without its scripts, so it always opens; links, forms, dropdowns and checkboxes still work. Script-heavy sites are pre-rendered remotely so they still show content.
- ✦ **Browser Agent** — a rebuild of [browser-use](https://github.com/browser-use/browser-use) that runs on your iPhone. Give it a task in plain words and watch it work:
  - sees each page as numbered interactive elements (drawn as colored boxes on the page) and acts on them: **search** (DuckDuckGo / Bing / Google), **go to URL**, **click**, **type**, **send keys**, **scroll**, **scroll to text**, **dropdowns**, **back / forward / refresh**, **open / switch / close tabs**, **wait**
  - **extract** reads a whole page with AI to pull out exactly what you asked for
  - keeps **memory**, a **todo.md** checklist and its own **files** (results.md, extracted notes) across steps; evaluates each step and changes approach when stuck
  - **save to reading list**: ask it to save pages and they land in your Instapaper library
  - live step timeline (evaluation, memory, next goal, actions, optional thinking), **pause / resume / stop**, **follow-up tasks** in the same session, **continue** an interrupted run, full **history** of past runs
  - final answer with sources: copy, share, **listen** (Telugu/Hindi voices auto-detected), or **save as a note**
  - settings: max steps, actions per step, max failures, thinking, flash mode, highlight elements, page view depth, search engine, **allowed domains**, custom instructions
  - models: **Gemini** (free key — recommended), **OpenRouter**, **Claude** (Anthropic API), **OpenAI**, or **Browser Use Cloud** (beta — runs on a real cloud Chromium you can watch live)
  - keeps the screen awake while it works (iOS pauses apps in the background)
- ⭐ Save your favorite sites with favicons — add, rename, reorder, remove
- 🔐 **Encrypted password vault** — AES-256-GCM with a passcode (PBKDF2, 310k iterations); copy username/password with one tap while logging in in Live view. Nothing ever leaves your device; backups carry the vault still encrypted.

> Smart view and the agent run without your cookies, so they can't use sites you're logged into, and buttons that only work with JavaScript do nothing there (the agent is told this and works around it). Pages are fetched through public proxies, so don't use Smart view for anything private.

**Settings** are organized like the classic app: General → Appearance, Behavior, Voices, AI Assistant, Logged-In Sites, Syncing & Backup.

**AI assistant (✦ icon in the header, on any page)**
- Two providers, pick either in Settings:
  - **OpenRouter** (free key at [openrouter.ai/keys](https://openrouter.ai/keys)) — DeepSeek R1, Llama, Qwen, Mistral free tiers plus paid models, or any custom model id
  - **Google Gemini** (free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) — Gemini 2.5 Flash / Pro / Flash-Lite with a generous free tier
- **Summarize** any article into key points + takeaway
- **Translate** into Telugu, Hindi, Tamil, Kannada, and many more — read the result, listen to it spoken aloud (తెలుగు / हिन्दी voices), or save it as a new article
- **Rewrite** — simplify, shorten, expand, change tone, or convert to bullet points
- **Ask** questions about any article (or chat freely without one)
- AI results can be copied, shared, spoken aloud, or saved to Notes

## How to install on your iPhone

1. Enable GitHub Pages for this repository: **Settings → Pages → Deploy from a branch → select your branch and `/ (root)` → Save**
2. Open the published URL in **Safari** on your iPhone
3. Tap the **Share** button → **Add to Home Screen**
4. Launch it from your home screen — it runs full screen and works offline

## Notes

- Saving a **new** article needs an internet connection (the page is fetched through public read-it-later proxies). Reading everything you've already saved works fully offline.
- All data lives in your browser's local storage on the device. Turn on **automatic backup reminders** (Settings → Syncing & Backup) and export regularly — your backup file is the only copy if your library is precious to you. Deleting/reinstalling the app can wipe its local storage, so keep a recent backup file somewhere safe.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, styles, fonts |
| `app.js` | The reading app |
| `browser.js` | In-app browser + Browser Agent |
| `sw.js` | Service worker — offline caching |
| `manifest.json` | PWA manifest (icons, share target) |
| `icon-*.png` | App icons |
