// Tiny CORS proxy for the app's feed fetching (YouTube / Telegram / RSS).
// Deploy on Cloudflare Workers (free): dash.cloudflare.com -> Workers & Pages -> Create -> paste this -> Deploy.
// Then in the app: Settings -> Behavior -> Feed proxy, paste  https://<your-worker>.workers.dev/?url=
const ALLOWED = ['youtube.com', 't.me', 'telegram.me']; // add any RSS hosts you follow; use ['*'] to allow all

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });
    const target = new URL(request.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch (e) { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return new Response('bad scheme', { status: 400, headers: cors });
    const host = u.hostname.replace(/^www\./, '');
    if (!ALLOWED.includes('*') && !ALLOWED.some(d => host === d || host.endsWith('.' + d))) {
      return new Response('host not allowed', { status: 403, headers: cors });
    }
    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RoutineFeedProxy/1.0)', Accept: '*/*' },
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    const out = new Response(res.body, res);
    for (const k in cors) out.headers.set(k, cors[k]);
    return out;
  },
};
