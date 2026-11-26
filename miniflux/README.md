# Miniflux setup (optional)

[Miniflux](https://github.com/miniflux/v2) is a self-hosted feed reader. **Evolve doesn't need it.**
The GitHub job (`.github/workflows/refresh-feeds-loop.yml`) already fetches every source, makes
free Instagram / X / Threads feeds with RSS-Bridge and RSSHub, and publishes them every 15 minutes.
Run Miniflux only if you also want everything in Miniflux's own web reader, or in a Fever or Google
Reader app such as Reeder, NetNewsWire or ReadKit.

## What's in the box

| Service   | Port | What it does |
|-----------|------|--------------|
| miniflux  | 8080 | The reader (web UI + API) |
| db        | –    | PostgreSQL, which Miniflux requires |
| rssbridge | 3000 | Free Instagram / X / Threads feeds from *this* machine's internet connection |

## Run it

Use any always-on machine with Docker: a free cloud VM (Oracle Cloud "Always Free",
Google Cloud e2-micro), a Raspberry Pi, or a home computer.

```bash
cd miniflux
cp .env.example .env      # then edit the passwords
docker compose up -d
```

Open `http://<machine>:8080` and sign in with `MINIFLUX_ADMIN` / `MINIFLUX_PASSWORD`. To reach it
from your phone outside home, put it behind HTTPS (Caddy, Cloudflare Tunnel or Tailscale).

## Fill it with your Evolve sources automatically

1. In Miniflux, go to **Settings → API Keys → Create a new API key** and copy the key.
2. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `MINIFLUX_URL`: the address of your Miniflux, e.g. `https://reader.example.com`
     (GitHub's servers must be able to reach it)
   - `MINIFLUX_TOKEN`: the API key

From then on, each pass of the 15-minute job runs `scripts/miniflux-sync.mjs`. It adds every source
in My Routine that Miniflux doesn't have yet, sorted into categories: YouTube, Substack, Instagram,
X, Telegram, Web… It only adds feeds and never deletes one. Instagram, X, Threads and Telegram are
added as the per-account feeds the job publishes (`social-feed/accounts/*.xml`), so Miniflux gets
the same free bridge and RSS.app backup the app uses.

You can also run it by hand:

```bash
MINIFLUX_URL=https://reader.example.com MINIFLUX_TOKEN=xxxx \
  node scripts/miniflux-sync.mjs routine-sources.json social-index.json
```

(`social-index.json` is `index.json` from the `social-feed` branch.)

## Use the home RSS-Bridge in Miniflux

Instagram blocks data-centre addresses (GitHub, cloud VMs) far more often than home connections.
If Miniflux runs at home:

1. In Miniflux, go to **Settings → Integrations → RSS-Bridge**, set the URL to `http://rssbridge`
   and save.
2. Add an Instagram or X profile link (e.g. `https://www.instagram.com/natgeo/`) as a new feed.
   Miniflux asks RSS-Bridge for a feed for it.

Optional: put your Instagram `sessionid` and `ds_user_id` cookies into `.env` (`IG_SESSION_ID`,
`IG_DS_USER_ID`) to make the Instagram bridge more reliable. That uses your account, so use a
spare one.
