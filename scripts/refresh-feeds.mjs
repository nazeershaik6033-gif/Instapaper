// Fetches every feed listed in routine-sources.json from a server (no CORS, no public proxies)
// and writes feeds.json: { fetchedAt, feeds: { "<url>": { at, body } } }.
// Run by .github/workflows/refresh-feeds.yml; also runnable locally:  node scripts/refresh-feeds.mjs routine-sources.json out/feeds.json
import fs from 'node:fs';
import path from 'node:path';

const [,, srcPath = 'routine-sources.json', outPath = 'out/feeds.json'] = process.argv;
const KEEP_OLD_MS = 3 * 24 * 3600 * 1000; // a feed that keeps failing keeps its last good copy this long
const UA = 'Mozilla/5.0 (compatible; RoutineFeedRefresh/1.0)';

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const urls = [...new Set((src.urls || []).filter(u => /^https?:\/\//i.test(u)))];

// previous snapshot (so one failed fetch does not blank a source)
let old = {}, oldBridges = {};
const repo = process.env.GITHUB_REPOSITORY;
if (repo && !process.env.NO_OLD) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/feeds-data/feeds.json`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) { const j = await r.json(); old = j.feeds || {}; oldBridges = j.bridges || {}; }
  } catch { /* first run */ }
}

async function one(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
      if (r.ok) {
        const body = await r.text();
        if (body && body.length > 200) return { ok: true, at: Date.now(), body };
      }
      var why = 'http ' + r.status;
    } catch (e) { why = String(e && e.message || e); }
    await new Promise(res => setTimeout(res, 800));
  }
  return { ok: false, why };
}

const feeds = {};
let ok = 0, kept = 0, failed = 0;
let next = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    const r = await one(url);
    if (r.ok) { feeds[url] = { at: r.at, body: r.body }; ok++; }
    else if (old[url] && Date.now() - old[url].at < KEEP_OLD_MS) { feeds[url] = old[url]; kept++; console.log('kept old copy:', url, r.why); }
    else { failed++; console.log('FAILED:', url, r.why); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
// Instagram / X / Threads posts come from bridge-social.mjs, which runs after this in the 15-minute job.
// Carry the last copies over so a run of this script alone (the half-hourly job) doesn't drop them.
for (const [k, v] of Object.entries(old)) if (k.startsWith('social:') && v && Date.now() - (v.at || 0) < KEEP_OLD_MS) feeds[k] = v;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ fetchedAt: Date.now(), feeds, bridges: oldBridges }));
console.log(`feeds: ${ok} fetched, ${kept} kept from last run, ${failed} failed, of ${urls.length}`);
