#!/bin/bash
# Miniflux on your Mac, free, no card anywhere, PRIVATE:
#   Homebrew → PostgreSQL + Miniflux (no Docker), started by itself whenever you log in to the Mac,
#   and a free https address from Tailscale Serve that only YOUR devices (signed in to your Tailscale) can open.
#   Nothing is published on the internet: strangers can't even see the login page.
#   On your phone: install the free Tailscale app, sign in with the same account, keep it on when using Miniflux.
# Run in Terminal (not with sudo; it asks for your Mac password when it needs it):
#   curl -fsSL https://raw.githubusercontent.com/nazeershaik6033-gif/Instapaper/main/miniflux/install-mac.sh | bash
# Safe to run again: it updates and keeps your data and password.
# Miniflux only runs while the Mac is on and awake. Your app's feeds come from GitHub and work either way.
set -euo pipefail

# everything runs inside main() so `curl … | bash` reads the whole script before running any of it
main() {
APP_URL="${APP_URL:-https://nazeershaik6033-gif.github.io/Instapaper/}"
DIR="$HOME/.miniflux"
CONF="$DIR/miniflux.conf"
PLIST="$HOME/Library/LaunchAgents/app.miniflux.plist"
PG=postgresql@17
# interactive steps (Homebrew, Tailscale sign-in) read the keyboard, not the piped script
IN=/dev/stdin; if ( : </dev/tty ) 2>/dev/null; then IN=/dev/tty; fi
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*"; exit 1; }

[ "$(uname -s)" = Darwin ] || die "This script is for macOS. On a Linux server use install.sh."
[ "$(id -u)" != 0 ] || die "Run it without sudo (Homebrew refuses to run as root)."

say "1/6 Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Installing Homebrew (it asks for your Mac password)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" <"$IN"
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
command -v brew >/dev/null 2>&1 || die "Homebrew didn't install. Install it from https://brew.sh and run this again."
BREW="$(brew --prefix)"

say "2/6 PostgreSQL and Miniflux"
brew install -q "$PG" miniflux
brew services start "$PG" >/dev/null 2>&1 || brew services restart "$PG" >/dev/null
PGBIN="$BREW/opt/$PG/bin"
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q -h localhost && break; sleep 1; done
"$PGBIN/pg_isready" -q -h localhost || die "PostgreSQL didn't start. Try: brew services restart $PG"

mkdir -p "$DIR" && chmod 700 "$DIR"
# passwords are made once and kept (no `tr </dev/urandom | head`: with pipefail its SIGPIPE would stop the script)
rnd() { local r; r="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 600 /dev/urandom))"; printf '%s' "${r:0:$1}"; }
if [ -f "$DIR/secrets" ]; then . "$DIR/secrets"; else
  DB_PASSWORD="$(rnd 32)"; ADMIN_PASSWORD="$(rnd 20)"
  printf 'DB_PASSWORD=%s\nADMIN_PASSWORD=%s\n' "$DB_PASSWORD" "$ADMIN_PASSWORD" > "$DIR/secrets"; chmod 600 "$DIR/secrets"
fi
PSQL=("$PGBIN/psql" -h localhost -d postgres -tAq)
if [ "$("${PSQL[@]}" -c "SELECT 1 FROM pg_roles WHERE rolname='miniflux'")" != 1 ]; then
  "${PSQL[@]}" -c "CREATE ROLE miniflux LOGIN PASSWORD '$DB_PASSWORD'"
fi
if [ "$("${PSQL[@]}" -c "SELECT 1 FROM pg_database WHERE datname='miniflux'")" != 1 ]; then
  "${PSQL[@]}" -c "CREATE DATABASE miniflux OWNER miniflux"
fi

say "3/6 Tailscale (free https address)"
TS=""
for t in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do command -v "$t" >/dev/null 2>&1 && { TS="$t"; break; }; [ -x "$t" ] && { TS="$t"; break; }; done
if [ -z "$TS" ]; then
  brew install -q tailscale
  TS="$BREW/bin/tailscale"
  echo "Starting Tailscale's background service (asks for your Mac password)…"
  sudo --preserve-env=HOME "$BREW/bin/brew" services start tailscale <"$IN" >/dev/null
  sleep 3
fi
if ! "$TS" status >/dev/null 2>&1; then
  echo "Sign in to Tailscale (free, no card): a link opens. Use Google, Apple, GitHub or Microsoft."
  "$TS" up <"$IN" || die "Tailscale sign-in didn't finish. Run this script again."
fi
HOST="$("$TS" status --json | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/\1/p' | head -1)"
[ -n "$HOST" ] || die "Couldn't read this Mac's Tailscale name. Check that Tailscale is signed in, then run again."
echo "address: https://$HOST"

say "4/6 Miniflux settings"
cat > "$CONF" <<EOF
LISTEN_ADDR=127.0.0.1:8080
DATABASE_URL=postgres://miniflux:$DB_PASSWORD@localhost/miniflux?sslmode=disable
RUN_MIGRATIONS=1
CREATE_ADMIN=1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
BASE_URL=https://$HOST
POLLING_FREQUENCY=15
EOF
chmod 600 "$CONF"

# An earlier version of this script created the hstore extension as you, and Miniflux's database setup later
# removes it, which only the owner can do ("must be owner of extension hstore"). If it's there and not Miniflux's,
# give the miniflux role superuser rights just for one setup run, then take them back. No data is touched.
HS_OWNER="$("$PGBIN/psql" -h localhost -d miniflux -tAq -c "SELECT r.rolname FROM pg_extension e JOIN pg_roles r ON r.oid=e.extowner WHERE e.extname='hstore'" 2>/dev/null || true)"
if [ -n "$HS_OWNER" ] && [ "$HS_OWNER" != miniflux ]; then
  echo "fixing the database set up by an earlier version of this script…"
  launchctl bootout "gui/$(id -u)/app.miniflux" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "ALTER ROLE miniflux SUPERUSER"
  mig=0; "$BREW/opt/miniflux/bin/miniflux" -c "$CONF" -migrate >>"$DIR/miniflux.log" 2>&1 || mig=$?
  "${PSQL[@]}" -c "ALTER ROLE miniflux NOSUPERUSER"
  [ "$mig" = 0 ] || die "Miniflux's database setup failed. The last lines of $DIR/miniflux.log say why."
fi

say "5/6 Start Miniflux whenever you log in"
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.miniflux</string>
  <key>ProgramArguments</key><array><string>$BREW/opt/miniflux/bin/miniflux</string><string>-c</string><string>$CONF</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/miniflux.log</string>
  <key>StandardErrorPath</key><string>$DIR/miniflux.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/app.miniflux" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
for _ in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:8080/healthcheck 2>/dev/null && break; sleep 1; done
curl -fsS -o /dev/null http://127.0.0.1:8080/healthcheck || die "Miniflux didn't start. Its log: $DIR/miniflux.log"

say "6/6 Private https address (Tailscale Serve: your devices only)"
# An earlier version of this script used Funnel (public): clear any old serve/funnel setup. (`serve reset` never
# prompts; `funnel … off` waits silently for Funnel to be enabled on the account, which hung the script.)
"$TS" serve reset </dev/null >/dev/null 2>&1 || true
echo "If Tailscale asks you to turn on HTTPS certificates for your account, open the link it shows, allow it, and wait here."
"$TS" serve --bg 8080 <"$IN" || die "Tailscale Serve didn't turn on. Open https://login.tailscale.com/admin/dns, enable HTTPS Certificates, then run this again."
ok=""
for _ in $(seq 1 30); do curl -fsS --max-time 5 -o /dev/null "https://$HOST/healthcheck" 2>/dev/null && { ok=1; break; }; sleep 3; done

LINK="${APP_URL}?miniflux=https://$HOST"
echo
[ -n "$ok" ] && echo "✅ Miniflux is running at  https://$HOST" || echo "⚠️  Miniflux runs on this Mac; https://$HOST can take a minute or two to start answering the first time."
echo "   Sign in:  user admin   password $ADMIN_PASSWORD   (saved in $DIR/secrets)"
echo
echo "🔒 Private: only devices signed in to your Tailscale account can open it. Nothing is public."
echo
echo "Next, on your phone:"
echo "  1. Install the free Tailscale app (App Store / Play Store), sign in with the SAME account, and switch it on."
echo "  2. Open https://$HOST, sign in, go to Settings → API Keys → Create a new API key, and copy it."
echo "  3. Open this link. It fills in Settings → Miniflux in the app; paste the key and tap Connect:"
echo "     $LINK"
echo
echo "Keep Tailscale on on the phone whenever you use Miniflux (the app's own feeds don't need it)."
echo "Miniflux starts by itself when you log in to this Mac and catches up on feeds after sleep."
echo "To remove it:  launchctl bootout gui/\$(id -u)/app.miniflux; $TS serve reset; brew uninstall miniflux"
}
main "$@"
