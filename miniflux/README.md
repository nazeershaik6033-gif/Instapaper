# Miniflux setup (optional)

[Miniflux](https://github.com/miniflux/v2) is a self-hosted feed reader. **Evolve doesn't need it.**
The GitHub job (`.github/workflows/refresh-feeds-loop.yml`) already fetches every source, makes
free Instagram / X / Threads feeds with RSS-Bridge and RSSHub, and publishes them every 15 minutes.
Run Miniflux only if you also want everything in Miniflux's own web reader, or in a Fever or Google
Reader app such as Reeder, NetNewsWire or ReadKit.

## Self-host it free (about 15 minutes, once)

Miniflux needs a computer that's always on. **Oracle Cloud's "Always Free" server** costs nothing, forever.
Oracle asks for a card to verify you're a person, but doesn't charge it for Always Free resources.

### 1. Create the free server
1. Sign up at <https://signup.cloud.oracle.com>. Choose a **Home Region** near you (e.g. India South / Mumbai).
   You can't change it later, and free servers only run in your home region.
2. In the Oracle console, go to **☰ → Compute → Instances → Create instance**:
   - **Image**: *Canonical Ubuntu* (24.04)
   - **Shape**: *Ampere A1* (1 OCPU, 6 GB, "Always Free-eligible"). If it says out of capacity, use *VM.Standard.E2.1.Micro* (AMD, also free)
   - **Add SSH keys**: *Generate a key pair for me* → **Save private key** (keep the file)
   - **Create**. Wait until it says *Running*, then copy its **Public IP address**.
3. Open the web ports: on the instance page click the **Subnet** link → **Security Lists** → *Default Security List* →
   **Add Ingress Rules**: Source CIDR `0.0.0.0/0`, IP Protocol *TCP*, Destination Port Range `80,443` → **Add**.

### 2. Install Miniflux (one command)
Connect to the server. The easiest way is **Cloud Shell** (the `>_` icon at the top of the Oracle console) or the
instance page's **Console connection**. From a Mac terminal: `ssh -i <saved-key-file> ubuntu@<public-ip>` (run
`chmod 600 <saved-key-file>` first). Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/nazeershaik6033-gif/Instapaper/main/miniflux/install.sh | sudo bash
```

It installs Docker, starts Miniflux + PostgreSQL + RSS-Bridge, opens the firewall, gets a free HTTPS certificate,
and ends by printing:
- your address, `https://<your-ip-with-dashes>.sslip.io` ([sslip.io](https://sslip.io) maps it to your IP, so no domain is needed;
  with your own domain run `… | sudo DOMAIN=reader.example.com bash`)
- the **admin password** (also saved in `/opt/miniflux/.env`)
- a link that opens the app's **Settings → Miniflux** with the address filled in

Run the same command any time to update; it keeps your data and passwords.

### 3. Connect the app
1. On your phone, open the address, sign in as `admin`, then **Settings → API Keys → Create a new API key** → copy it.
2. Open the link the script printed (or type the address into the app's **Settings → Miniflux**), paste the key,
   tap **Connect & add my sources**. Done: every source is in Miniflux, and new ones follow by themselves.

**Something not working?** If the script says HTTPS isn't answering, the ports in step 1.3 aren't open yet: add the
rule and run the script again. Logs: `cd /opt/miniflux && sudo docker compose -f docker-compose.yml -f docker-compose.https.yml logs`.

### Other machines
The same script works on any Ubuntu/Debian server with a public IP (Google Cloud's free e2-micro, a Raspberry Pi
with ports 80/443 forwarded on your router). On a computer at home without port forwarding, run
`docker compose up -d` in this folder and give it an https address with Cloudflare Tunnel or Tailscale Funnel. Note
that a Mac or PC only serves feeds while it's awake.

| Service   | Port | What it does |
|-----------|------|--------------|
| caddy     | 80, 443 | HTTPS with a free automatic certificate (`docker-compose.https.yml`) |
| miniflux  | 8080 | The reader (web UI + API) |
| db        | –    | PostgreSQL, which Miniflux requires |
| rssbridge | 3000 | Free Instagram / X / Threads feeds from *this* machine's internet connection |

## Fill it with your Evolve sources automatically

**From the app (easiest):** go to **Settings → Miniflux**, paste your Miniflux address (it must be `https://`) and an
API key (in Miniflux: **Settings → API Keys → Create a new API key**), then tap **Connect & add my sources**. The app adds
every My Routine source and blog straight away, and new ones a few seconds after you add them (*Keep Miniflux in sync*).

**From GitHub (also works when your phone is off):**

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
