#!/usr/bin/env python3
"""Transcribe a video with ElevenLabs Scribe (word-level timestamps).

Usage: transcribe.py INPUT_VIDEO [--out WORKDIR] [--language ckb] [--force]

Writes WORKDIR/transcript.json (the raw API response plus `source`).
Auth: uses $ELEVENLABS_API_KEY if set; otherwise relies on a proxy that injects it.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from common import load_style  # noqa: E402

API = "https://api.elevenlabs.io/v1/speech-to-text"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", help="work dir (default: <input stem>_edit/ next to the input)")
    ap.add_argument("--language", help="override STYLE.md language (e.g. ckb, en, auto)")
    ap.add_argument("--force", action="store_true", help="re-transcribe even if transcript.json exists")
    a = ap.parse_args()

    src = Path(a.input).resolve()
    work = Path(a.out) if a.out else src.with_name(src.stem + "_edit")
    work.mkdir(parents=True, exist_ok=True)
    dest = work / "transcript.json"
    if dest.exists() and not a.force:
        print(f"exists, skipping (use --force): {dest}")
        return

    style = load_style()
    lang = a.language or style["language"]

    with tempfile.TemporaryDirectory() as td:
        audio = Path(td) / "audio.mp3"
        # 16 kHz mono is all STT needs and keeps the upload small.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000",
                        "-c:a", "libmp3lame", "-b:a", "64k", str(audio)], check=True)
        data = {"model_id": style["stt_model"], "timestamps_granularity": "word",
                "tag_audio_events": "true"}
        if lang and lang != "auto":
            data["language_code"] = lang
        headers = {}
        if os.environ.get("ELEVENLABS_API_KEY"):
            headers["xi-api-key"] = os.environ["ELEVENLABS_API_KEY"]
        with open(audio, "rb") as f:
            r = requests.post(API, data=data, files={"file": ("audio.mp3", f, "audio/mpeg")},
                              headers=headers, timeout=600)
    if r.status_code != 200:
        sys.exit(f"ElevenLabs STT failed: HTTP {r.status_code}: {r.text[:500]}")

    result = r.json()
    result["source"] = str(src)
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(1 for w in result.get("words", []) if w.get("type") == "word")
    print(f"language={result.get('language_code')} (p={result.get('language_probability', 0):.2f}) "
          f"words={n} -> {dest}")


if __name__ == "__main__":
    main()
