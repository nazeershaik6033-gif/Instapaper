// Turns the sources list the app sends (as a GitHub issue body) into routine-sources.json.
// Usage: node scripts/apply-sources.mjs <issue-body.txt> <routine-sources.json>
// The body is JSON, optionally inside a ```json fence: {"urls":[...],"accounts":[...]}.
// Anything that is not exactly that shape is rejected, so a stray or hostile issue cannot
// put arbitrary content into the file. Exit code 0 = file written, 1 = rejected (reason on stderr).
import fs from 'node:fs';

const [,, bodyPath, outPath = 'routine-sources.json'] = process.argv;
const PLATFORMS = new Set(['telegram', 'instagram', 'x', 'threads', 'bluesky', 'mastodon', 'reddit']);
const fail = msg => { console.error('rejected: ' + msg); process.exit(1); };

const raw = fs.readFileSync(bodyPath, 'utf8');
const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
if (a < 0 || b <= a) fail('no JSON object in the issue body');
let data;
try { data = JSON.parse(raw.slice(a, b + 1)); } catch (e) { fail('not valid JSON'); }
if (!data || typeof data !== 'object' || !Array.isArray(data.urls)) fail('"urls" must be a list');

const url = u => typeof u === 'string' && u.length <= 600 && /^https?:\/\/[^\s"'<>]+$/i.test(u);
const str = (s, n) => typeof s === 'string' ? s.slice(0, n) : '';

const urls = [...new Set(data.urls.filter(url))];
if (urls.length !== data.urls.length) fail('"urls" has an entry that is not an http(s) link');
if (urls.length > 400) fail('too many urls');

const accounts = [];
for (const x of (Array.isArray(data.accounts) ? data.accounts : [])) {
  if (!x || typeof x !== 'object' || !PLATFORMS.has(x.platform)) fail('unknown platform in "accounts"');
  const acc = { platform: x.platform, handle: str(x.handle, 80), name: str(x.name, 120), profile: str(x.profile, 300) };
  if (x.feed) { if (!url(x.feed)) fail('an account feed is not an http(s) link'); acc.feed = x.feed; }
  if (acc.profile && !url(acc.profile)) acc.profile = '';
  if (!acc.handle && !acc.feed) continue;
  accounts.push(acc);
}
if (accounts.length > 200) fail('too many accounts');

fs.writeFileSync(outPath, JSON.stringify(accounts.length ? { urls, accounts } : { urls }, null, 1) + '\n');
console.log(`applied: ${urls.length} urls, ${accounts.length} accounts`);
