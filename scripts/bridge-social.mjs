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
let old = {}, oldBridges = {};
const repo = process.env.GITHUB_REPOSITORY;
if (repo && !process.env.NO_OLD) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/feeds-data/feeds.json`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) { const j = await r.json(); old = j.feeds || {}; oldBridges = j.bridges || {}; }
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

const bridges = {};
let ok = 0, kept = 0, failed = 0;
async function one(a) {
  const key = snapKey(a.platform, a.handle || a.feed);
  const tried = [];
  for (const c of candidatesFor(a)) {
    const r = await get(c.url, c.url.startsWith('http://localhost') ? 45000 : 20000);
    const posts = r.ok ? realPosts(r.body) : [];
    if (posts.length) {
      snap.feeds[key] = { at: Date.now(), body: r.body, via: c.via };
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
fs.writeFileSync(feedsPath, JSON.stringify(snap));
console.log(`bridged accounts: ${ok} live, ${kept} kept from an earlier run, ${failed} not reachable, of ${accounts.length}` +
  ` (bridges up: ${Object.keys(bases).join(', ') || 'none'})`);
