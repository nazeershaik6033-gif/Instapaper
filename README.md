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
- 🎧 **Text-to-speech** with adjustable speed and voice, plus **Playlists** to listen to multiple articles seamlessly
- ⚡ **Speed reading** — words flashed one at a time at up to 700 wpm, with smart pacing
- 📁 Folders, tags, and sorting by date / length / popularity
- 🎨 Fonts, text size, line spacing, and four themes (Light, Sepia, Dark, Black)
- 💾 Full backup export / import

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
