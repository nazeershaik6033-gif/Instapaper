// Tiny CORS proxy for the app's feed fetching (YouTube / Telegram / RSS).
// Deploy on Cloudflare Workers (free): dash.cloudflare.com -> Workers & Pages -> Create -> paste this -> Deploy.
// Then in the app: Settings -> Behavior -> Feed proxy, paste  https://<your-worker>.workers.dev/?url=
const ALLOWED = ['youtube.com', 't.me', 'telegram.me', 'eenadu.net']; // add any RSS hosts you follow; use ['*'] to allow all

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

  // Optional: an on-time trigger for the GitHub "Refresh feeds" job.
  // GitHub's own cron is best-effort — on a quiet repo it fires a few times a day at
  // random times, so My Routine's server copy can be hours old at your routine time.
  // Cloudflare Cron Triggers do fire on schedule, so let this worker kick the job off:
  //   1. GitHub → Settings → Developer settings → Fine-grained tokens → new token for this
  //      repo only, permission "Actions: Read and write".
  //   2. Worker → Settings → Variables → add secret GH_TOKEN = that token
  //      (optional: GH_REPO = owner/repo if you forked it).
  //   3. Worker → Settings → Triggers → Cron Triggers → add  45 * * * *
  //      (hourly at :45, i.e. 15 minutes before any routine time on the hour).
  // Without GH_TOKEN this does nothing.
  async scheduled(event, env, ctx) {
    if (!env.GH_TOKEN) return;
    const repo = env.GH_REPO || 'nazeershaik6033-gif/Instapaper';
    const gh = (path, init) => fetch('https://api.github.com/repos/' + repo + path, {
      ...init,
      headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'routine-feed-cron', ...(init && init.headers) },
    });
    ctx.waitUntil((async () => {
      // scheduled workflows live on the default branch, so dispatch it there
      const info = await gh('');
      if (!info.ok) { console.log('repo lookup failed', info.status); return; }
      const ref = (await info.json()).default_branch;
      const r = await gh('/actions/workflows/' + (env.GH_WORKFLOW || 'refresh-feeds-schedule.yml') + '/dispatches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }),
      });
      console.log('dispatch', ref, r.status);
    })());
  },
};
