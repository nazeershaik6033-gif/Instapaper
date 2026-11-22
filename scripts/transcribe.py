#!/usr/bin/env python3
"""Transcribe one YouTube video with Whisper, for the app's "Full transcript".

Adapted from Dicklesworthstone/bulk_transcribe_youtube_videos_from_playlist:
  * audio: pytubefix, first audio-only stream  (yt-dlp is the fallback when
    YouTube refuses pytubefix, which happens on cloud runners)
  * speech-to-text: faster-whisper with vad_filter=True, the repo's settings,
    run on CPU with int8 weights because GitHub's runners have no GPU
  * the repo's clean-up: drop "Subtitles by the Amara.org community" segments

Run by .github/workflows/transcribe.yml. Always writes the --out JSON, also on
failure ({"status": "error", ...}), so the app can show what went wrong.
"""
import argparse
import json
import os
import re
import sys
import tempfile
import time
import traceback

MODELS = ["tiny", "base", "small", "medium", "large-v3"]
UNWANTED = ["Subtitles by the Amara.org community"]
YT_HOSTS = re.compile(r"^https?://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com)/", re.I)


def log(*a):
    print(*a, flush=True)


def video_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/shorts/|/live/|/embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def download_with_pytubefix(url, out_dir):
    from pytubefix import YouTube
    last = None
    # The "WEB" client mints a PO token (needs node), which YouTube now asks for
    # from datacenter IPs; the default client is the repo's original path.
    for client in ("WEB", None):
        try:
            yt = YouTube(url, client) if client else YouTube(url)
            stream = yt.streams.filter(only_audio=True).order_by("abr").desc().first()
            if not stream:
                raise RuntimeError("no audio-only stream")
            path = stream.download(output_path=out_dir, filename="audio.m4a")
            return path, yt.title, yt.length
        except Exception as e:  # try the next client
            last = e
            log(f"pytubefix ({client or 'default'}) failed: {e}")
    raise last


def download_with_ytdlp(url, out_dir):
    import yt_dlp
    opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": os.path.join(out_dir, "audio_ytdlp.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
        "retries": 3,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return ydl.prepare_filename(info), info.get("title"), info.get("duration")


def download_audio(url, out_dir):
    errors = []
    for name, fn in (("pytubefix", download_with_pytubefix), ("yt-dlp", download_with_ytdlp)):
        try:
            t = time.time()
            path, title, length = fn(url, out_dir)
            log(f"downloaded with {name} in {time.time() - t:.0f}s: {title!r}")
            return path, title, length, name
        except Exception as e:
            errors.append(f"{name}: {str(e).splitlines()[0][:200]}")
    raise RuntimeError("Couldn't download the audio from YouTube (" + "; ".join(errors) + ")")


def paragraphs(segments):
    """Readable paragraphs: break on long pauses, or every ~5 sentences."""
    paras, cur, sentences, prev_end = [], [], 0, None
    for s in segments:
        if cur and prev_end is not None and s["start"] - prev_end > 2.5:
            paras.append(" ".join(cur)); cur, sentences = [], 0
        cur.append(s["text"])
        sentences += len(re.findall(r"[.!?।]+(\s|$)", s["text"]))
        prev_end = s["end"]
        if sentences >= 5:
            paras.append(" ".join(cur)); cur, sentences = [], 0
    if cur:
        paras.append(" ".join(cur))
    return "\n\n".join(p.strip() for p in paras if p.strip())


def transcribe(audio_path, model_name):
    from faster_whisper import WhisperModel
    threads = os.cpu_count() or 2
    t = time.time()
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
    log(f"loaded {model_name} in {time.time() - t:.0f}s on {threads} threads")
    segs, info = model.transcribe(audio_path, beam_size=5, vad_filter=True)
    out, t, last_log = [], time.time(), 0
    for s in segs:
        text = s.text.strip()
        if not text or any(u in text for u in UNWANTED):
            continue
        out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": text})
        if s.end - last_log > 120:
            last_log = s.end
            log(f"  {s.end / 60:.1f} of {info.duration / 60:.1f} min transcribed")
    log(f"transcribed {info.duration / 60:.1f} min of audio in {(time.time() - t) / 60:.1f} min")
    return out, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--id", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    result = {"id": a.id, "url": a.url, "model": a.model, "status": "error", "created": int(time.time())}
    code = 1
    try:
        if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", a.id):
            raise ValueError("bad request id")
        if a.model not in MODELS:
            raise ValueError("unknown Whisper model " + a.model)
        if not YT_HOSTS.match(a.url) or not video_id(a.url):
            raise ValueError("not a YouTube video link")
        url = "https://www.youtube.com/watch?v=" + video_id(a.url)
        with tempfile.TemporaryDirectory() as tmp:
            path, title, length, via = download_audio(url, tmp)
            segs, info = transcribe(path, a.model)
        if not segs:
            raise RuntimeError("no speech found in this video")
        result.update({
            "status": "done", "title": title, "duration": round(info.duration),
            "language": info.language, "language_probability": round(info.language_probability, 2),
            "downloader": via, "engine": "faster-whisper",
            "text": paragraphs(segs), "segments": segs,
        })
        code = 0
    except Exception as e:
        traceback.print_exc()
        result["error"] = str(e)[:500] or e.__class__.__name__
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    sys.exit(code)


if __name__ == "__main__":
    main()
