// Tiny CORS proxy for the app's feed fetching (YouTube / Telegram / RSS).
// Deploy on Cloudflare Workers (free): dash.cloudflare.com -> Workers & Pages -> Create -> paste this -> Deploy.
// Then in the app: Settings -> Behavior -> Feed proxy, paste  https://<your-worker>.workers.dev/?url=
const ALLOWED = ['youtube.com', 't.me', 'telegram.me']; // add any RSS hosts you follow; use ['*'] to allow all

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; RoutineFeedProxy/1.0)', Accept: '*/*' };
const allowed = host => ALLOWED.includes('*') || ALLOWED.some(d => host === d || host.endsWith('.' + d));

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });
    const params = new URL(request.url).searchParams;

    // Batch: ?u=<url>&u=<url>... -> {results:[{url,ok,status,body}]}, fetched in parallel.
    const many = params.getAll('u');
    if (many.length) {
      const one = async (target) => {
        try {
          const u = new URL(target);
          const host = u.hostname.replace(/^www\./, '');
          if (!['http:', 'https:'].includes(u.protocol) || !allowed(host)) return { url: target, ok: false, status: 403, body: '' };
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(u.toString(), { headers: UA, signal: ctrl.signal, cf: { cacheTtl: 120, cacheEverything: true } });
          clearTimeout(timer);
          return { url: target, ok: res.ok, status: res.status, body: res.ok ? await res.text() : '' };
        } catch (e) { return { url: target, ok: false, status: 0, body: '' }; }
      };
      const results = await Promise.all(many.slice(0, 40).map(one));
      return new Response(JSON.stringify({ results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const target = params.get('url');
    let u;
    try { u = new URL(target); } catch (e) { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return new Response('bad scheme', { status: 400, headers: cors });
    const host = u.hostname.replace(/^www\./, '');
    if (!allowed(host)) return new Response('host not allowed', { status: 403, headers: cors });
    const res = await fetch(u.toString(), {
      headers: UA,
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    const out = new Response(res.body, res);
    for (const k in cors) out.headers.set(k, cors[k]);
    return out;
  },
};
