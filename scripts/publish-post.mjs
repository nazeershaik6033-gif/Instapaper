// Turns a "publish: …" issue from the app (Daily / Weekly Transcript → Share → Publish as a public web page)
// into a public post on the `blog-posts` branch, which post.html on your GitHub Pages site displays:
//   posts/<slug>.json   the paper (title, date, stories)
//   index.json          every post, newest first (post.html without ?p= lists them)
//   feed.xml            an RSS feed of your posts
// Usage: node scripts/publish-post.mjs <issue-body.txt> <blog-posts checkout dir>
// Prints the new post's slug. Anything not shaped like the app's payload is rejected (exit 1), and every
// string is stored as plain text (post.html never renders it as HTML), so an issue can't inject a page.
import fs from 'node:fs';
import path from 'node:path';

const [,, bodyPath, dir = 'blog'] = process.argv;
const fail = m => { console.error('rejected: ' + m); process.exit(1); };
const raw = fs.readFileSync(bodyPath, 'utf8');
const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
if (a < 0 || b <= a) fail('no JSON in the issue');
let p; try { p = JSON.parse(raw.slice(a, b + 1)); } catch { fail('not valid JSON'); }
if (!p || p.v !== 1 || !Array.isArray(p.stories) || !p.stories.length) fail('not a paper from the app');
if (p.stories.length > 40) fail('too many stories');
const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
const paper = {
  title: str(p.title, 200) || 'The Daily Transcript', kind: ['day', 'week', 'custom'].includes(p.kind) ? p.kind : 'day',
  at: Number.isFinite(p.at) ? p.at : Date.now(), publishedAt: Date.now(),
  stories: p.stories.map(s => ({
    headline: str(s.headline, 200), standfirst: str(s.standfirst, 400), story: str(s.story, 2500), channel: str(s.channel, 100),
    title: str(s.title, 200), videoId: /^[\w-]{11}$/.test(s.videoId || '') ? s.videoId : '', publishedMs: Number.isFinite(s.publishedMs) ? s.publishedMs : 0,
  })).filter(s => s.headline || s.story),
};
if (!paper.stories.length) fail('no stories');

const day = new Date(paper.at).toISOString().slice(0, 10);
const words = paper.title.toLowerCase().replace(/^the (daily|weekly) transcript\s*[—-]\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
fs.mkdirSync(path.join(dir, 'posts'), { recursive: true });
let slug = day + (words ? '-' + words : ''), n = 2;
while (fs.existsSync(path.join(dir, 'posts', slug + '.json'))) slug = day + (words ? '-' + words : '') + '-' + n++;
fs.writeFileSync(path.join(dir, 'posts', slug + '.json'), JSON.stringify(paper));

const idxPath = path.join(dir, 'index.json');
let idx = []; try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch { /* first post */ }
idx = [{ slug, title: paper.title, at: paper.at, publishedAt: paper.publishedAt, stories: paper.stories.length, kind: paper.kind,
  lead: paper.stories[0].headline, videoId: paper.stories.find(s => s.videoId)?.videoId || '' }, ...idx.filter(x => x.slug !== slug)].slice(0, 500);
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));

const repo = process.env.GITHUB_REPOSITORY || 'nazeershaik6033-gif/Instapaper';
const [owner, name] = repo.split('/');
const site = `https://${owner.toLowerCase()}.github.io/${name}/post.html`;
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
fs.writeFileSync(path.join(dir, 'feed.xml'), ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0"><channel>',
  `<title>The Daily Transcript</title><link>${esc(site)}</link><description>Papers made from the videos I follow.</description>`,
  ...idx.slice(0, 50).map(x => `<item><title>${esc(x.title)}</title><link>${esc(site + '?p=' + x.slug)}</link><guid>${esc(x.slug)}</guid>` +
    `<pubDate>${new Date(x.publishedAt || x.at).toUTCString()}</pubDate><description>${esc(x.lead)}</description></item>`),
  '</channel></rss>', ''].join('\n'));
console.log(slug);
