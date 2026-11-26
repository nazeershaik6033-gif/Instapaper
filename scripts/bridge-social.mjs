// Free feeds for accounts with no public feed (Instagram, X, Threads), so RSS.app is only a backup.
// For each such account in routine-sources.json it tries the free sources in scripts/bridges.json in
// order (the self-hosted RSS-Bridge / RSSHub the feed job starts, public Nitter mirrors), then the
// account's own RSS.app link if it has one. The first that returns real posts wins, and its feed is
// stored in feeds.json under "social:<platform>:<handle>" (the app reads it from there) together with
// which source worked. A source that worked last time is tried first.
// Usage: node scripts/bridge-social.mjs routine-sources.json feeds.json
//   env RSSBRIDGE_URL (e.g. http://localhost:3000) and RSSHUB_URL (e.g. http://localhost:1200), optional
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIDGED, snapKey, realPosts } from './feed-utils.mjs';

const [,, srcPath = 'routine-sources.json', feedsPath = 'feeds.json'] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES = JSON.parse(fs.readFileSync(path.join(here, 'bridges.json'), 'utf8'));
const KEEP_OLD_MS = 3 * 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const accounts = (Array.isArray(src.accounts) ? src.accounts : []).filter(a => a && BRIDGED.has(a.platform) && (a.handle || a.feed));
const snap = fs.existsSync(feedsPath) ? JSON.parse(fs.readFileSync(feedsPath, 'utf8')) : { fetchedAt: Date.now(), feeds: {} };
snap.feeds = snap.feeds || {};

// last run's copy (keeps an account's posts through a bad hour) and which source worked for it
let old = {}, oldBridges = {}, oldMiss = {};
const repo = process.env.GITHUB_REPOSITORY;
if (repo && !process.env.NO_OLD) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/feeds-data/feeds.json`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) { const j = await r.json(); old = j.feeds || {}; oldBridges = j.bridges || {}; oldMiss = j.videoMiss || {}; }
  } catch { /* first run */ }
}

async function get(url, ms) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, body: '', why: String(e && e.message || e) }; }
}

// which self-hosted bridges are up
const bases = {};
for (const [name, env] of [['RSSBRIDGE', 'RSSBRIDGE_URL'], ['RSSHUB', 'RSSHUB_URL']]) {
  const b = (process.env[env] || '').replace(/\/+$/, '');
  if (!b) continue;
  const r = await get(b + '/', 8000);
  if (r.status) bases[name] = b; else console.log(`${name} at ${b} is not answering; skipping it`);
}

function candidatesFor(a) {
  const list = [];
  for (const c of CANDIDATES[a.platform] || []) {
    if (!a.handle) break;
    if (c.needs && !process.env[c.needs]) continue;
    let url = c.url, skip = false;
    url = url.replace(/\{(RSSBRIDGE|RSSHUB)\}/g, (_, k) => { if (!bases[k]) skip = true; return bases[k] || ''; });
    if (skip) continue;
    list.push({ via: c.via, url: url.replace(/\{handle\}/g, encodeURIComponent(a.handle.replace(/^@/, ''))) });
  }
  const last = (oldBridges[snapKey(a.platform, a.handle || a.feed)] || {}).via;
  const i = list.findIndex(c => c.via === last);
  if (i > 0) list.unshift(...list.splice(i, 1));
  if (a.feed) list.push({ via: /rss\.app/i.test(a.feed) ? 'RSS.app (backup)' : 'Your feed link (backup)', url: a.feed, backup: true });
  return list;
}

/* Instagram reels: RSS-Bridge's anonymous read leaves the video address empty (<source src="">). Each post's public
   embed page usually still carries it ("video_url"), so fill it in: then the app can play the reel itself instead
   of sending you to the Instagram app. */
const unesc = s => s.replace(/\\u0026/g, '&').replace(/\\u003[dD]/g, '=').replace(/\\\//g, '/').replace(/\\/g, '');
async function embedVideoUrl(code) {
  for (const path of ['embed/captioned/', 'embed/']) {
    const r = await get('https://www.instagram.com/p/' + code + '/' + path, 15000);
    if (!r.ok || !r.body) continue;
    const m = /video_url\\*"\s*:\s*\\*"(https?:[^"]+?)\\*"/.exec(r.body) || /<video[^>]+src="(https?:[^"]+)"/.exec(r.body);
    if (m) return unesc(m[1]).replace(/&amp;/g, '&');
  }
  return '';
}
const videoStats = { needed: 0, found: 0, tried: 0, sample: '' };
/* reels whose embed page had no video: not asked again for a day, and at most a few new ones per pass, so these
   lookups can't get the GitHub runner blocked by Instagram (which would also stop the photo feeds) */
const videoMiss = Object.fromEntries(Object.entries(oldMiss).filter(([, t]) => Date.now() - t < 24 * 3600e3));
const LOOKUPS_PER_PASS = 4;
/* video addresses found on an earlier run, reused while they're valid (Instagram's links carry their expiry as
   oe=<hex unix time>), so each reel's embed page is read about once instead of every 15 minutes */
const knownVideos = new Map();
for (const v of Object.values(old)) {
  for (const part of String((v && v.body) || '').split(/(?=<entry[\s>])/)) {
    const code = (/instagram\.com\/(?:p|reel)\/([\w-]+)/.exec(part) || [])[1];
    const src = ((/source src=(?:"|&quot;)(https?:.*?)(?:"|&quot;)/.exec(part) || [])[1] || '').replace(/&amp;(amp;)?/g, '&');
    if (!code || !src) continue;
    const oe = parseInt((/[?&;]oe=([0-9A-Fa-f]+)/.exec(src) || [])[1] || '0', 16) * 1000;
    if (!oe || oe - Date.now() > 3 * 3600e3) knownVideos.set(code, src);
  }
}
async function fillVideos(body) {
  const parts = body.split(/(?=<entry[\s>])/);
  for (let i = 0; i < parts.length; i++) {
    // an empty video address, as plain HTML (<source src="">) or escaped inside Atom (&lt;source src=&quot;&quot;)
    const empty = /(<|&lt;)source src=(""|&quot;&quot;)/.exec(parts[i]);
    if (!empty) continue;
    const code = (/instagram\.com\/(?:p|reel)\/([\w-]+)/.exec(parts[i]) || [])[1];
    if (!code) continue;
    videoStats.needed++;
    let v = knownVideos.get(code) || '';
    if (!v && !videoMiss[code] && videoStats.tried < LOOKUPS_PER_PASS) { videoStats.tried++; v = await embedVideoUrl(code); if (!v) videoMiss[code] = Date.now(); }
    if (!v) continue;
    videoStats.found++; if (!videoStats.sample) videoStats.sample = v;
    const safe = v.replace(/&/g, '&amp;').replace(/"/g, '%22');
    parts[i] = parts[i].replace(empty[0], empty[1] === '<' ? '<source src="' + safe + '"' : '&lt;source src=&quot;' + safe + '&quot;');
  }
  return parts.join('');
}

const bridges = {};
let ok = 0, kept = 0, failed = 0;
async function one(a) {
  const key = snapKey(a.platform, a.handle || a.feed);
  const tried = [];
  for (const c of candidatesFor(a)) {
    const r = await get(c.url, c.url.startsWith('http://localhost') ? 45000 : 20000);
    const posts = r.ok ? realPosts(r.body) : [];
    if (posts.length) {
      const body = a.platform === 'instagram' ? await fillVideos(r.body) : r.body;
      snap.feeds[key] = { at: Date.now(), body, via: c.via };
      bridges[key] = { via: c.via, backup: !!c.backup, ok: true, at: Date.now(), posts: posts.length, tried };
      ok++; return;
    }
    tried.push(c.via + ': ' + (r.ok ? 'no posts' : r.status ? 'http ' + r.status : (r.why || 'no answer').slice(0, 60)));
  }
  if (old[key] && Date.now() - (old[key].at || 0) < KEEP_OLD_MS) {
    snap.feeds[key] = old[key]; kept++;
    bridges[key] = { via: old[key].via || '', ok: false, stale: true, at: old[key].at, tried };
  } else { failed++; bridges[key] = { ok: false, at: Date.now(), tried }; }
  console.log(`${a.platform} @${a.handle || a.feed}: no source worked (${tried.join('; ') || 'nothing to try'})`);
}

let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (next < accounts.length) await one(accounts[next++]); }));
snap.bridges = bridges;
/* can a phone play those videos from another site? (Instagram's CDN may send Cross-Origin-Resource-Policy:
   same-origin, which browsers obey for <video> too.) Recorded so the app and the status page can tell. */
if (videoStats.sample) {
  try {
    const r = await fetch(videoStats.sample, { headers: { 'User-Agent': UA, Range: 'bytes=0-1' }, signal: AbortSignal.timeout(15000) });
    videoStats.probe = { status: r.status, type: r.headers.get('content-type') || '', corp: r.headers.get('cross-origin-resource-policy') || '', acao: r.headers.get('access-control-allow-origin') || '' };
  } catch (e) { videoStats.probe = { error: String(e && e.message || e).slice(0, 80) }; }
  delete videoStats.sample;
}
snap.videoStats = videoStats;
snap.videoMiss = videoMiss;
console.log('instagram videos:', JSON.stringify(videoStats));
fs.writeFileSync(feedsPath, JSON.stringify(snap));
console.log(`bridged accounts: ${ok} live, ${kept} kept from an earlier run, ${failed} not reachable, of ${accounts.length}` +
  ` (bridges up: ${Object.keys(bases).join(', ') || 'none'})`);
