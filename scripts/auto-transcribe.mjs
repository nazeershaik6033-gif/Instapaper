// Auto-paper: starts Whisper transcriptions for new long videos from the channels you picked in the app
// (My Routine → ⋯ → Auto-paper; sent as "auto" in routine-sources.json). Each one runs the "Transcribe video"
// workflow on your Mac (self-hosted runner labelled `whisper`; YouTube blocks GitHub's own servers). The
// result lands on the transcripts-data branch as t/auto-<videoId>.json, which the app picks up and turns into
// that day's paper. While the Mac is off, the jobs wait in GitHub's queue and run when it's back (up to a day).
// Usage: node scripts/auto-transcribe.mjs routine-sources.json feeds.json      (needs GH_TOKEN, GITHUB_REPOSITORY)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [,, srcPath = 'routine-sources.json', feedsPath = 'feeds.json'] = process.argv;
const PER_PASS = 4, NEW_WITHIN = 36 * 3600e3, RETRY_AFTER = 26 * 3600e3;
const repo = process.env.GITHUB_REPOSITORY;
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const auto = Array.isArray(src.auto) ? src.auto : [];
const snap = JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
// videos already sent to the Mac: kept with the snapshot (carried over by refresh-feeds.mjs) for 3 days
let state = snap.autoTx || {};
if (!Object.keys(state).length && repo && !process.env.NO_OLD) {
  try { const r = await fetch(`https://raw.githubusercontent.com/${repo}/feeds-data/feeds.json`, { signal: AbortSignal.timeout(15000) }); if (r.ok) state = (await r.json()).autoTx || {}; } catch { /* first run */ }
}
state = Object.fromEntries(Object.entries(state).filter(([, t]) => Date.now() - t < 3 * 86400e3));

const found = [];
for (const ch of auto) {
  const body = (snap.feeds[`https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`] || {}).body || '';
  for (const e of body.split('<entry>').slice(1)) {
    const vid = (/<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(e) || [])[1];
    const at = Date.parse((/<published>([^<]+)<\/published>/.exec(e) || [])[1] || '') || 0;
    if (!vid || Date.now() - at > NEW_WITHIN) continue;
    if (/youtube\.com\/shorts\//.test(e)) continue; // Shorts aren't papers
    found.push({ vid, at });
  }
}
found.sort((a, b) => b.at - a.at);
let started = 0, skipped = 0;
for (const { vid } of found) {
  if (started >= PER_PASS) break;
  if (state[vid] && Date.now() - state[vid] < RETRY_AFTER) { skipped++; continue; }
  // done already? (a transcript, or an error worth not repeating today)
  try { const r = await fetch(`https://raw.githubusercontent.com/${repo}/transcripts-data/t/auto-${vid}.json`, { signal: AbortSignal.timeout(10000) }); if (r.ok) { state[vid] = Date.now(); skipped++; continue; } } catch { /* not there */ }
  try {
    execFileSync('gh', ['workflow', 'run', 'transcribe.yml', '--repo', repo, '--ref', 'main',
      '-f', `url=https://www.youtube.com/watch?v=${vid}`, '-f', `request_id=auto-${vid}`, '-f', 'runner=mac', '-f', 'model=small'], { stdio: 'pipe' });
    state[vid] = Date.now(); started++;
  } catch (e) { console.log('could not start', vid, String(e.stderr || e.message).slice(0, 160)); }
}
snap.autoTx = state;
fs.writeFileSync(feedsPath, JSON.stringify(snap));
console.log(`auto-paper: ${auto.length} channels, ${found.length} new long videos, ${started} sent to the Mac, ${skipped} already done or waiting`);
