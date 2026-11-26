// Builds your own RSS feeds from the social accounts in My Routine (Telegram, Instagram, X, Substack, …).
// Reads routine-sources.json ("accounts", sent by the app) and the feeds.json that refresh-feeds.mjs and
// bridge-social.mjs just filled, and writes into <outDir>:
//   all.xml               every account, newest first
//   <platform>.xml        one per platform (telegram.xml, instagram.xml, x.xml, substack.xml, …)
//   accounts/<key>.xml    one per account (My Routine reads Instagram / X / Threads accounts from here)
//   index.json            the links and each account's status, read by the app (Settings → Social RSS feed)
// Telegram channels are read from their public t.me/s/<handle> page; Substack, Bluesky, Mastodon and
// Reddit from their own feeds. Instagram, X and Threads come from a free bridge (bridge-social.mjs), with
// the account's RSS.app link, if it has one, as the backup.
// Run by .github/workflows/refresh-feeds-loop.yml:
//   node scripts/build-social-feed.mjs routine-sources.json feeds.json out/social
import fs from 'node:fs';
import path from 'node:path';
import { LABEL, BRIDGED, accountKey, snapKey, esc, cdata, parseTelegram, parseRss } from './feed-utils.mjs';

const [,, srcPath = 'routine-sources.json', feedsPath = 'feeds.json', outDir = 'out/social'] = process.argv;
const PER_ACCOUNT = 30, ALL_MAX = 300, PLATFORM_MAX = 150;

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const accounts = (Array.isArray(src.accounts) ? src.accounts : []).filter(a => a && a.platform && (a.handle || a.feed));
let feeds = {}, bridges = {}, videoStats = null;
try { const j = JSON.parse(fs.readFileSync(feedsPath, 'utf8')); feeds = j.feeds || {}; bridges = j.bridges || {}; videoStats = j.videoStats || null; } catch { /* nothing fetched */ }

const repo = process.env.GITHUB_REPOSITORY || 'nazeershaik6033-gif/Instapaper';
const base = `https://raw.githubusercontent.com/${repo}/social-feed/`;

/* ---------- collect ---------- */
const status = [], all = [], byPlatform = {}, byAccount = [];
for (const a of accounts) {
  const bridged = BRIDGED.has(a.platform);
  const key = bridged ? snapKey(a.platform, a.handle || a.feed) : a.platform === 'telegram' && a.handle ? 'https://t.me/s/' + encodeURIComponent(a.handle) : (a.feed || '');
  const who = (a.name || (a.handle ? '@' + a.handle : 'Account')).replace(/\s*·\s*\w+$/, '');
  const file = 'accounts/' + accountKey(a.platform, a.handle || a.feed) + '.xml';
  const st = { platform: a.platform, name: who, handle: a.handle || '', profile: a.profile || '', feed: a.feed || '', status: 'ok', posts: 0, accountFeed: base + file };
  if (bridged) { const b = bridges[key] || {}; st.via = b.via || ''; st.backup = !!b.backup; st.tried = b.tried || []; st.stale = !!b.stale; }
  if (!key) { st.status = 'needs-feed-link'; status.push(st); continue; }
  const got = feeds[key];
  if (!got || !got.body) { st.status = bridged ? (a.feed ? 'not-reachable' : 'not-reachable-no-backup') : 'not-fetched'; status.push(st); continue; }
  let posts = [];
  try { posts = a.platform === 'telegram' ? parseTelegram(got.body, a.handle) : parseRss(got.body); } catch { posts = []; }
  posts = posts.sort((p, q) => q.date - p.date).slice(0, PER_ACCOUNT);
  if (!posts.length) st.status = 'empty';
  st.posts = posts.length; st.latest = posts[0] ? posts[0].date : 0; st.fetchedAt = got.at || 0;
  status.push(st);
  const items = posts.map(p => ({ ...p, who, platform: a.platform }));
  byAccount.push({ file, title: who + ' · ' + (LABEL[a.platform] || a.platform), items });
  for (const item of items) {
    all.push(item);
    (byPlatform[a.platform] = byPlatform[a.platform] || []).push(item);
  }
}

/* ---------- write ---------- */
function rss(name, title, items, max, prefixWho = true) {
  const seen = new Set();
  const list = items.sort((p, q) => q.date - p.date).filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, max);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${esc(title)}</title>`,
    `<link>https://github.com/${esc(repo)}</link>`,
    `<atom:link href="${esc(base + name)}" rel="self" type="application/rss+xml"/>`,
    `<description>${esc(title)}, built from the accounts in My Routine and refreshed every 15 minutes.</description>`,
    `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    '<ttl>15</ttl>',
  ];
  for (const p of list) {
    const label = LABEL[p.platform] || p.platform;
    out.push('<item>',
      `<title>${esc(prefixWho ? p.who + ': ' + p.title : p.title)}</title>`,
      `<link>${esc(p.link)}</link>`,
      `<guid isPermaLink="false">${esc(p.platform + ':' + p.id)}</guid>`,
      `<pubDate>${new Date(p.date).toUTCString()}</pubDate>`,
      `<dc:creator>${esc(p.who + ' · ' + label)}</dc:creator>`,
      `<category>${esc(label)}</category>`,
      p.image ? `<media:content url="${esc(p.image)}" medium="image"/>` : '',
      `<description>${cdata(p.html || esc(p.title))}</description>`,
      '</item>');
  }
  out.push('</channel>', '</rss>', '');
  fs.mkdirSync(path.dirname(path.join(outDir, name)), { recursive: true });
  fs.writeFileSync(path.join(outDir, name), out.filter(Boolean).join('\n'));
  return list.length;
}
fs.mkdirSync(outDir, { recursive: true });
const links = { all: base + 'all.xml' };
const n = rss('all.xml', 'My social feed', all.slice(), ALL_MAX);
for (const p of Object.keys(LABEL)) {
  if (!accounts.some(a => a.platform === p)) continue;
  rss(p + '.xml', 'My ' + LABEL[p] + ' feed', (byPlatform[p] || []).slice(), PLATFORM_MAX);
  links[p] = base + p + '.xml';
}
for (const a of byAccount) rss(a.file, a.title, a.items, PER_ACCOUNT, false); // one account: no name in every title
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ builtAt: Date.now(), links, accounts: status, videoStats }, null, 1));
const okN = status.filter(s => s.status === 'ok').length;
const freeN = status.filter(s => s.status === 'ok' && BRIDGED.has(s.platform) && !s.backup).length;
const backupN = status.filter(s => s.status === 'ok' && s.backup).length;
const downN = status.filter(s => /^not-reachable/.test(s.status)).length;
console.log(`social feed: ${n} posts from ${okN}/${accounts.length} accounts; Instagram/X/Threads: ${freeN} via a free bridge, ${backupN} via RSS.app backup, ${downN} not reachable`);
