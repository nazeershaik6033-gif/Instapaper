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
- 💾 Full backup export / import

**Content editing**
- 🧹 **Remove blocks** — saved a page with leftover junk? Long-press → Edit content → tap unwanted paragraphs/images to delete them
- 📝 **Edit text** — edit the title and full article text (simple markdown formatting) and save your own version

**Browser & Logged-In Sites**
- 🌐 Built-in browser (sidebar → Browse, or Settings → Logged-In Sites): Google search by default, popups allowed, one-tap "Open in browser" for sites that refuse embedding
- ⭐ Save your favorite sites with favicons — add, rename, reorder, remove
- 🔐 **Encrypted password vault** — AES-256-GCM with a passcode (PBKDF2, 310k iterations); copy username/password with one tap while logging in. Nothing ever leaves your device; backups carry the vault still encrypted.

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

## The Daily Brief — your personalized newspaper

A second, standalone app lives at **`newspaper.html`**: a personalized digital
newspaper that reads like a real broadsheet.

- **Setup once** — pick your topics (Tech, AI, Cricket, Finance… or type your own)
  and a reading style: **Serious** (broadsheet), **Punchy** (snappy), or **gen z**
  (casual slang). The whole paper's tone bends to your choice.
- **Live news** — headlines are pulled from real sources (Reddit's top posts for
  ranking + images, and Google News RSS for breadth), merged, de-duplicated, and
  ranked by importance and freshness.
- **Real newspaper layout** — bold masthead, a lead hero story with image, an
  "Also in the news" rail, multi-column sections with section dividers, pull
  quotes, kickers, bylines, and proper serif typography.
- **Auto-refreshes every 6 hours** (and on return to the tab), shows the last
  refresh time, and a manual **Refresh** button.
- **Remembers you** — preferences and the last edition are stored in the browser,
  so it loads instantly (and shows your last edition if you're offline).
- **Settings (⚙) anytime**, fully mobile responsive, installable to your phone's
  home screen (📱 icon in the header).

Open `newspaper.html` directly, or add it as a home-screen app the same way as
below.

## How to install on your iPhone

1. Enable GitHub Pages for this repository: **Settings → Pages → Deploy from a branch → select your branch and `/ (root)` → Save**
2. Open the published URL in **Safari** on your iPhone
3. Tap the **Share** button → **Add to Home Screen**
4. Launch it from your home screen — it runs full screen and works offline

## Notes

- Saving a **new** article needs an internet connection (the page is fetched through public read-it-later proxies). Reading everything you've already saved works fully offline.
- All data lives in your browser's local storage on the device. Use **Settings → Export backup** regularly if your library is precious to you.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, styles, fonts |
| `app.js` | The entire application |
| `sw.js` | Service worker — offline caching |
| `manifest.json` | PWA manifest (icons, share target) |
| `icon-*.png` | App icons |
