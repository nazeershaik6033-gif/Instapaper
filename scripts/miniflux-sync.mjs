// Adds every source in My Routine to your Miniflux (https://miniflux.app), so you can read it all in
// Miniflux too. Only adds what's missing; it never removes or changes a feed you have there.
//   YouTube channels, Substacks, Bluesky, Reddit, Mastodon, websites → their own feeds
//   Telegram, Instagram, X, Threads → the per-account feeds the job publishes on the social-feed branch
//     (free bridge first, RSS.app backup), since Miniflux can't read those platforms by itself
// Usage: MINIFLUX_URL=https://reader.example.com MINIFLUX_TOKEN=… node scripts/miniflux-sync.mjs routine-sources.json out/social/index.json
// Make the token in Miniflux: Settings → API Keys → Create a new API key.
import fs from 'node:fs';
import { LABEL } from './feed-utils.mjs';

const [,, srcPath = 'routine-sources.json', indexPath = 'out/social/index.json'] = process.argv;
const BASE = (process.env.MINIFLUX_URL || '').replace(/\/+$/, ''), TOKEN = process.env.MINIFLUX_TOKEN || '';
if (!BASE || !TOKEN) { console.log('MINIFLUX_URL / MINIFLUX_TOKEN not set; nothing to do'); process.exit(0); }

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
let index = { accounts: [] };
try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { /* no social feed yet */ }

async function api(p, opts = {}) {
  const r = await fetch(BASE + '/v1' + p, { ...opts, headers: { 'X-Auth-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${p}: http ${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

/* what should be in Miniflux: [{url, category}] */
const want = new Map();
const add = (url, category) => { if (url && /^https?:\/\//i.test(url) && !want.has(url)) want.set(url, category); };
const accountFeeds = new Set((src.accounts || []).map(a => a.feed).filter(Boolean));
const accts = new Map((index.accounts || []).map(s => [s.platform + ':' + (s.handle || s.feed), s]));
for (const a of src.accounts || []) {
  const s = accts.get(a.platform + ':' + (a.handle || a.feed));
  const cat = LABEL[a.platform] || 'Social';
  // only once the job has published posts for it (an empty account has no file yet; Miniflux would refuse it)
  if (['telegram', 'instagram', 'x', 'threads'].includes(a.platform)) add(s && s.status === 'ok' && s.accountFeed, cat);
  else add(a.feed || (s && s.accountFeed), cat);
}
for (const u of src.urls || []) {
  if (/\/\/t\.me\/s\//i.test(u) || accountFeeds.has(u)) continue; // covered by the account feeds above
  add(u, /youtube\.com\/feeds/i.test(u) ? 'YouTube' : /substack\.com/i.test(u) ? 'Substack' : 'Web');
}

const have = new Set((await api('/feeds')).map(f => f.feed_url));
const cats = new Map((await api('/categories')).map(c => [c.title.toLowerCase(), c.id]));
async function catId(title) {
  const k = title.toLowerCase();
  if (!cats.has(k)) cats.set(k, (await api('/categories', { method: 'POST', body: JSON.stringify({ title }) })).id);
  return cats.get(k);
}
let added = 0, failed = 0;
for (const [url, cat] of want) {
  if (have.has(url)) continue;
  try { await api('/feeds', { method: 'POST', body: JSON.stringify({ feed_url: url, category_id: await catId(cat) }) }); added++; }
  catch (e) { failed++; console.log('could not add', url, '-', e.message); }
}
console.log(`miniflux: ${added} feeds added, ${failed} failed, ${want.size - added - failed} already there`);
