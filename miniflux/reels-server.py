#!/usr/bin/env python3
"""Evolve reels helper — plays Instagram reels inside the app while your Mac is on.

Instagram never gives other apps a reel's video, but yt-dlp can download public reels from a home internet
connection. This tiny server (installed and started at login by install-mac.sh) downloads them and serves them to
the app through your private Tailscale address:  https://<your-mac>.ts.net/reels/<code>.mp4
  * on demand: the first time the app asks for a reel it is downloaded (a few seconds), then kept
  * ahead of time: every 15 minutes it fetches the reels in your social feed, so most are instant
  * kept 10 days, then removed; a reel that fails isn't retried for 6 hours
It listens on 127.0.0.1 only; Tailscale Serve makes it reachable to your own devices, nobody else.
"""
import os, re, sys, time, threading, subprocess, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

DIR = os.path.expanduser(os.environ.get('REELS_DIR', '~/.miniflux/reels'))
YTDLP = os.environ.get('YTDLP', 'yt-dlp')
FEED = os.environ.get('REELS_FEED', '')          # raw link of social-feed/instagram.xml
PORT = int(os.environ.get('REELS_PORT', '8081'))
KEEP_DAYS, FAIL_HOURS, PER_PASS = 10, 6, 12
CODE = re.compile(r'^[\w-]{5,40}$')
os.makedirs(DIR, exist_ok=True)
_locks, _glock = {}, threading.Lock()


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def fetch(code):
    """Path of the reel's mp4, downloading it first if needed; None if Instagram refused."""
    path = os.path.join(DIR, code + '.mp4')
    fail = os.path.join(DIR, code + '.fail')
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return path
    if os.path.exists(fail) and time.time() - os.path.getmtime(fail) < FAIL_HOURS * 3600:
        return None
    with _glock:
        lock = _locks.setdefault(code, threading.Lock())
    with lock:
        if os.path.exists(path) and os.path.getsize(path) > 10000:
            return path
        part = os.path.join(DIR, code + '.part.mp4')
        try:
            subprocess.run([YTDLP, '-q', '--no-warnings', '--no-playlist', '-f', 'b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4',
                            '-o', part, 'https://www.instagram.com/reel/' + code + '/'], timeout=150, check=True, capture_output=True)
            if os.path.exists(part) and os.path.getsize(part) > 10000:
                os.replace(part, path)
                log('downloaded', code)
                return path
        except subprocess.CalledProcessError as e:
            log('refused', code, (e.stderr or b'').decode(errors='ignore').strip().splitlines()[-1:])
        except Exception as e:
            log('failed', code, e)
        for p in (part,):
            if os.path.exists(p):
                os.remove(p)
        open(fail, 'w').close()
        return None


def prefetch_loop():
    while True:
        try:
            if FEED:
                xml = urllib.request.urlopen(FEED + '?t=' + str(int(time.time() // 600)), timeout=30).read().decode('utf8', 'ignore')
                codes = []
                for item in xml.split('<item>')[1:]:
                    title = (re.search(r'<title>(.*?)</title>', item, re.S) or [None, ''])[1]
                    m = re.search(r'instagram\.com/(?:p|reel|reels|tv)/([\w-]+)', item)
                    if m and ('▶' in title or '<video' in item or '&lt;video' in item) and m.group(1) not in codes:
                        codes.append(m.group(1))
                for c in codes[:PER_PASS]:
                    fetch(c)
            cut = time.time() - KEEP_DAYS * 86400
            for f in os.listdir(DIR):
                p = os.path.join(DIR, f)
                if os.path.getmtime(p) < cut:
                    os.remove(p)
        except Exception as e:
            log('prefetch:', e)
        time.sleep(15 * 60)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def head(self, code, ctype='application/json', length=0, extra=None):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(length))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def do_OPTIONS(self):
        self.head(204, extra={'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Range'})

    def do_HEAD(self):
        self.do_GET(body=False)

    def do_GET(self, body=True):
        p = self.path.split('?')[0]
        if p.startswith('/reels'):
            p = p[len('/reels'):] or '/'
        if p in ('/', '/health'):
            b = b'{"ok":true}'
            self.head(200, length=len(b))
            if body:
                self.wfile.write(b)
            return
        m = re.match(r'^/([\w-]+)\.mp4$', p)
        if not m or not CODE.match(m.group(1)):
            return self.head(404)
        path = fetch(m.group(1))
        if not path:
            return self.head(404)
        size = os.path.getsize(path)
        start, end = 0, size - 1
        rng = re.match(r'bytes=(\d*)-(\d*)', self.headers.get('Range', ''))
        status = 200
        if rng and (rng.group(1) or rng.group(2)):   # iPhone plays video only with byte ranges
            if rng.group(1):
                start = int(rng.group(1))
                end = int(rng.group(2)) if rng.group(2) else size - 1
            else:
                start = max(0, size - int(rng.group(2)))
            end = min(end, size - 1)
            status = 206
        extra = {'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400'}
        if status == 206:
            extra['Content-Range'] = 'bytes %d-%d/%d' % (start, end, size)
        self.head(status, 'video/mp4', end - start + 1, extra)
        if not body:
            return
        with open(path, 'rb') as f:
            f.seek(start)
            left = end - start + 1
            try:
                while left > 0:
                    chunk = f.read(min(256 * 1024, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass


if __name__ == '__main__':
    threading.Thread(target=prefetch_loop, daemon=True).start()
    log('reels helper on 127.0.0.1:%d, files in %s' % (PORT, DIR))
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
