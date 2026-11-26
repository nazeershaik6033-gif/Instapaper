#!/usr/bin/env bash
# One-command Miniflux for a fresh Linux server (Oracle Cloud "Always Free", Google Cloud e2-micro, a Raspberry Pi…):
# Docker, Miniflux + PostgreSQL + RSS-Bridge, and HTTPS with a free certificate. No domain needed: the address is
# https://<your-ip-with-dashes>.sslip.io unless you set DOMAIN. Safe to run again (it updates and keeps your data
# and passwords). Run on the server:
#   curl -fsSL https://raw.githubusercontent.com/nazeershaik6033-gif/Instapaper/main/miniflux/install.sh | sudo bash
#   (own domain: … | sudo DOMAIN=reader.example.com bash)
set -euo pipefail

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/nazeershaik6033-gif/Instapaper/main/miniflux}"
APP_URL="${APP_URL:-https://nazeershaik6033-gif.github.io/Instapaper/}"
DIR="${DIR:-/opt/miniflux}"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Please run with sudo:  curl -fsSL $REPO_RAW/install.sh | sudo bash"; exit 1; }

say "1/6 Docker"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || { echo "Docker Compose is missing; install the docker-compose-plugin package and run this again."; exit 1; }

say "2/6 Memory"
# free servers have ~1 GB RAM; a swap file keeps PostgreSQL + Miniflux + RSS-Bridge comfortable
if [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 1600000 ] && [ -z "$(swapon --show 2>/dev/null)" ]; then
  fallocate -l 1G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "added a 1 GB swap file"
else echo "ok"; fi

say "3/6 Files and passwords"
mkdir -p "$DIR" && cd "$DIR"
for f in docker-compose.yml docker-compose.https.yml; do curl -fsSL "$REPO_RAW/$f" -o "$f"; done
IP="$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me)"
if [ -f .env ]; then
  echo "keeping your existing .env (passwords unchanged)"
  # shellcheck disable=SC1091
  . ./.env
  [ -n "${DOMAIN:-}" ] || { DOMAIN="$(echo "$IP" | tr . -).sslip.io"; echo "DOMAIN=$DOMAIN" >> .env; }
else
  DOMAIN="${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
  # (no `tr </dev/urandom | head` here: with pipefail its SIGPIPE would stop the script)
  rnd() { local r; r="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 600 /dev/urandom))"; printf '%s' "${r:0:$1}"; }
  MINIFLUX_PASSWORD="$(rnd 20)"
  cat > .env <<EOF
POSTGRES_PASSWORD=$(rnd 32)
MINIFLUX_ADMIN=admin
MINIFLUX_PASSWORD=$MINIFLUX_PASSWORD
MINIFLUX_BASE_URL=https://$DOMAIN
DOMAIN=$DOMAIN
BIND=127.0.0.1
IG_SESSION_ID=
IG_DS_USER_ID=
EOF
  chmod 600 .env
fi
echo "address: https://$DOMAIN"

say "4/6 Firewall (ports 80 and 443)"
if command -v ufw >/dev/null 2>&1 && grep -q 'Status: active' <<<"$(ufw status 2>/dev/null)"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; echo "ufw: opened"; fi
# Oracle Cloud's Ubuntu images block everything but SSH in iptables
if command -v iptables >/dev/null 2>&1 && grep -q -- '-j REJECT' <<<"$(iptables -S INPUT 2>/dev/null)"; then
  for p in 80 443; do
    rule=(INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT)
    iptables -C "${rule[@]}" 2>/dev/null || iptables -I "${rule[@]:0:1}" 1 "${rule[@]:1}"
  done
  command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
  echo "iptables: opened"
else echo "ok"; fi

say "5/6 Starting Miniflux (first time takes a minute or two)"
docker compose -f docker-compose.yml -f docker-compose.https.yml pull -q
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --remove-orphans

say "6/6 Waiting for HTTPS"
ok=""
for _ in $(seq 1 40); do
  if curl -fsS --max-time 5 -o /dev/null "https://$DOMAIN/healthcheck" 2>/dev/null; then ok=1; break; fi
  sleep 5
done

LINK="${APP_URL}?miniflux=https://$DOMAIN"
echo
if [ -n "$ok" ]; then
  echo "✅ Miniflux is running at  https://$DOMAIN"
else
  echo "⚠️  Miniflux started, but https://$DOMAIN isn't answering yet."
  echo "   Most often the cloud firewall still blocks ports 80 and 443. On Oracle Cloud: Networking →"
  echo "   Virtual cloud networks → your VCN → Security Lists → Default → Add Ingress Rules:"
  echo "   source 0.0.0.0/0, TCP, destination ports 80,443. Then run this script again."
  echo "   Logs:  cd $DIR && sudo docker compose -f docker-compose.yml -f docker-compose.https.yml logs caddy"
fi
echo
if [ -n "${MINIFLUX_PASSWORD:-}" ]; then
  echo "   Sign in:  user ${MINIFLUX_ADMIN:-admin}   password $MINIFLUX_PASSWORD"
  echo "   (also saved in $DIR/.env; change it in Miniflux → Settings once you're in)"
fi
echo
echo "Next, on your phone:"
echo "  1. Open https://$DOMAIN, sign in, go to Settings → API Keys → Create a new API key, and copy it."
echo "  2. Open this link. It fills in Settings → Miniflux in the app; paste the key and tap Connect:"
echo "     $LINK"
