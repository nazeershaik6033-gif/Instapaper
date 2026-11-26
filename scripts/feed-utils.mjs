// Small helpers shared by the feed scripts (no DOM in Node, no dependencies).
export const LABEL = {
  telegram: 'Telegram', instagram: 'Instagram', x: 'X', threads: 'Threads', bluesky: 'Bluesky',
  mastodon: 'Mastodon', reddit: 'Reddit', substack: 'Substack',
};
// platforms with no public feed: the feed job makes one with a free bridge (scripts/bridge-social.mjs)
export const BRIDGED = new Set(['instagram', 'x', 'threads']);

const slug = h => String(h || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9._-]+/g, '_').slice(0, 80);
// file name of one account's own feed on the social-feed branch: accounts/<key>.xml
export const accountKey = (platform, handle) => platform + '-' + slug(handle);
// where a bridged account's posts sit in feeds.json (the app reads the same key; see app.js bridgedSnapKey)
export const snapKey = (platform, handle) => 'social:' + platform + ':' + slug(handle);

export const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
export const strip = html => decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
export const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const cdata = s => '<![CDATA[' + String(s || '').replace(/\]\]>/g, ']]&gt;') + ']]>';
export const titleOf = text => { const t = String(text || '').split('\n')[0].trim(); return t.length > 110 ? t.slice(0, 107).replace(/\s+\S*$/, '') + '…' : t; };
const tag = (xml, name) => { const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(xml); return m ? m[1] : ''; };

export function parseTelegram(html, handle) {
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

export function parseRss(xml) {
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
    return { id: decode(tag(b, 'guid')).trim() || link, title: titleOf(t || text) || 'Post', link: decode(link), date, html: body, image: decode(image) };
  }).filter(p => p.link && p.date);
}

// a bridge that failed still answers with a feed: one item saying so. Those are not posts.
const ERROR_POST = /^(bridge returned error|rss-?bridge|error|rate.?limit|login required|instance has been rate limited|this account('|’)?s tweets are protected)/i;
export const realPosts = xml => {
  if (!/<(?:item|entry)[\s>]/i.test(xml || '')) return [];
  try { return parseRss(xml).filter(p => !ERROR_POST.test(p.title)); } catch { return []; }
};
