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
- Open the **✦ AI assistant** on any saved video for **Summarize** (key points + takeaway), **Full transcript** (auto-fetched speech-to-text you can read, listen to, or save), and **Ask about this video** (Q&A answered from the transcript) — in English, Telugu, Hindi, Tamil, and more.

**Content editing**
- 🧹 **Remove blocks** — saved a page with leftover junk? Long-press → Edit content → tap unwanted paragraphs/images to delete them, or tap **✦ Suggest blocks to remove** to let AI pre-select the boilerplate (you review and Save)
- 📝 **Edit text** — edit the title and full article text (simple markdown formatting) and save your own version

**Browser & Logged-In Sites**
- 🌐 Built-in browser (sidebar → Browse, or Settings → Logged-In Sites): Google search by default, popups allowed, one-tap "Open in browser" for sites that refuse embedding
- 💾 **Save / Share from the browser** — reading any page in the built-in browser? Tap **Save** to download & clean it straight into your reading list, or **Share** to send the link out via the system share sheet
- 📥 **Share into Instapaper** — once installed to your home screen, Instapaper appears in your phone's share sheet, so you can share a link from any app and it lands in your Save dialog
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

## Notes

- Saving a **new** article needs an internet connection (the page is fetched through public read-it-later proxies). Reading everything you've already saved works fully offline.
- All data lives in your browser's local storage on the device. Turn on **automatic backup reminders** (Settings → Syncing & Backup) and export regularly — your backup file is the only copy if your library is precious to you. Deleting/reinstalling the app can wipe its local storage, so keep a recent backup file somewhere safe.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, styles, fonts |
| `app.js` | The entire application |
| `sw.js` | Service worker — offline caching |
| `manifest.json` | PWA manifest (icons, share target) |
| `icon-*.png` | App icons |
