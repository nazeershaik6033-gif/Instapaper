// Builds your own RSS feeds from the social accounts in My Routine (Telegram, Instagram, X, …).
// Reads routine-sources.json ("accounts", written by the app's "Update sources on GitHub" button)
// and the feeds.json that refresh-feeds.mjs just fetched, and writes into <outDir>:
//   all.xml          every account, newest first
//   <platform>.xml   one per platform (telegram.xml, instagram.xml, x.xml, …)
//   index.json       the links and each account's status, read by the app (Settings → Behavior)
// Telegram channels are read straight from their public t.me/s/<handle> page. Instagram and X
// have no public feed, so each account needs a feed link from RSS.app pasted into My Routine.
// Run by .github/workflows/refresh-feeds-loop.yml:
//   node scripts/build-social-feed.mjs routine-sources.json feeds.json out/social
import fs from 'node:fs';
import path from 'node:path';

const [,, srcPath = 'routine-sources.json', feedsPath = 'feeds.json', outDir = 'out/social'] = process.argv;
const LABEL = { telegram: 'Telegram', instagram: 'Instagram', x: 'X', threads: 'Threads', bluesky: 'Bluesky', mastodon: 'Mastodon', reddit: 'Reddit' };
const PER_ACCOUNT = 30, ALL_MAX = 300, PLATFORM_MAX = 150;

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const accounts = (Array.isArray(src.accounts) ? src.accounts : []).filter(a => a && a.platform && (a.handle || a.feed));
let feeds = {};
try { feeds = JSON.parse(fs.readFileSync(feedsPath, 'utf8')).feeds || {}; } catch { /* nothing fetched */ }

/* ---------- small text helpers (no DOM in Node) ---------- */
const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = html => decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = s => '<![CDATA[' + String(s || '').replace(/\]\]>/g, ']]&gt;') + ']]>';
const titleOf = text => { const t = String(text || '').split('\n')[0].trim(); return t.length > 110 ? t.slice(0, 107).replace(/\s+\S*$/, '') + '…' : t; };
const tag = (xml, name) => { const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(xml); return m ? m[1] : ''; };

/* ---------- parsers ---------- */
function parseTelegram(html, handle) {
  return html.split(/<div class="tgme_widget_message_wrap/).slice(1).map(block => {
    const post = (/data-post="([^"]+)"/.exec(block) || [])[1] || '';
    const when = Date.parse((/<time[^>]*datetime="([^"]+)"/.exec(block) || [])[1] || '') || 0;
    const textHtml = (/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block) || [])[1] || '';
    const img = (/tgme_widget_message_(?:photo_wrap|video_thumb)[^>]*background-image:url\('([^']+)'\)/.exec(block) || [])[1] || '';
    const text = strip(textHtml);
    const link = post ? 'https://t.me/' + post : 'https://t.me/' + handle;
    let body = textHtml;
    if (img) body = '<p><img src="' + esc(img) + '"/></p>' + body;
    return { id: link, title: titleOf(text) || (img ? '📷 Photo' : 'Post'), link, date: when, html: body, image: img };
  }).filter(p => p.date);
}
function parseRss(xml) {
  const isAtom = !/<item[\s>]/i.test(xml);
  const blocks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  return blocks.map(b => {
    let link = decode(tag(b, 'link')).trim();
    if (!link) link = (/<link[^>]*href="([^"]+)"/i.exec(b) || [])[1] || decode(tag(b, 'guid')).trim();
    const body = decode(tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary'));
    const text = strip(body);
    const t = strip(tag(b, 'title'));
    const date = Date.parse(decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')).trim()) || 0;
    const image = (/<media:content[^>]*url="([^"]+)"/i.exec(b) || /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i.exec(b) || /<img[^>]+src=["']([^"']+)/i.exec(body) || [])[1] || '';
    return { id: decode(tag(b, 'guid')).trim() || link, title: titleOf(t || text) || 'Post', link, date, html: body, image: decode(image) };
  }).filter(p => p.link && p.date);
}

/* ---------- collect ---------- */
const status = [], all = [], byPlatform = {};
for (const a of accounts) {
  const url = a.platform === 'telegram' && a.handle ? 'https://t.me/s/' + encodeURIComponent(a.handle) : (a.feed || '');
  const who = (a.name || (a.handle ? '@' + a.handle : 'Account')).replace(/\s*·\s*\w+$/, '');
  const st = { platform: a.platform, name: who, handle: a.handle || '', profile: a.profile || '', feed: url, status: 'ok', posts: 0 };
  if (!url) { st.status = 'needs-feed-link'; status.push(st); continue; }
  const got = feeds[url];
  if (!got || !got.body) { st.status = 'not-fetched'; status.push(st); continue; }
  let posts = [];
  try { posts = a.platform === 'telegram' ? parseTelegram(got.body, a.handle) : parseRss(got.body); } catch { posts = []; }
  posts = posts.sort((p, q) => q.date - p.date).slice(0, PER_ACCOUNT);
  if (!posts.length) st.status = 'empty';
  st.posts = posts.length; st.latest = posts[0] ? posts[0].date : 0; st.fetchedAt = got.at || 0;
  status.push(st);
  for (const p of posts) {
    const item = { ...p, who, platform: a.platform };
    all.push(item);
    (byPlatform[a.platform] = byPlatform[a.platform] || []).push(item);
  }
}

/* ---------- write ---------- */
const repo = process.env.GITHUB_REPOSITORY || 'nazeershaik6033-gif/Instapaper';
const base = `https://raw.githubusercontent.com/${repo}/social-feed/`;
function rss(name, title, items, max) {
  const seen = new Set();
  const list = items.sort((p, q) => q.date - p.date).filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, max);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${esc(title)}</title>`,
    `<link>https://github.com/${esc(repo)}</link>`,
    `<atom:link href="${esc(base + name)}" rel="self" type="application/rss+xml"/>`,
    `<description>${esc(title)} — built from the accounts in My Routine, refreshed every 15 minutes.</description>`,
    `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    '<ttl>15</ttl>',
  ];
  for (const p of list) {
    const label = LABEL[p.platform] || p.platform;
    out.push('<item>',
      `<title>${esc(p.who + ': ' + p.title)}</title>`,
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
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ builtAt: Date.now(), links, accounts: status }, null, 1));
console.log(`social feed: ${n} posts from ${status.filter(s => s.status === 'ok').length}/${accounts.length} accounts; ` +
  `${status.filter(s => s.status === 'needs-feed-link').length} need an RSS.app link`);
