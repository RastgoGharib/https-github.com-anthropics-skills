"""Shared helpers: STYLE.md settings, text normalization, ffprobe."""
import json
import re
import subprocess
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
STYLE_PATH = SKILL_DIR / "STYLE.md"
FONTS_DIR = SKILL_DIR / "fonts"

# Defaults; STYLE.md's ```settings block overrides any of these.
DEFAULTS = {
    # transcription
    "language": "auto",          # ISO code passed to ElevenLabs, e.g. ckb; "auto" = detect
    "stt_model": "scribe_v2",
    # cut detection
    "min_silence": 0.6,          # gaps between words longer than this get cut (s)
    "keep_pad": 0.15,            # breathing room kept on each side of a cut (s)
    "trim_head_tail": True,
    "retake_min_words": 2,       # shortest repeated phrase treated as a retake
    "retake_window": 8,          # max words between the two takes
    "low_confidence": -1.2,      # word logprob below this is flagged
    "fillers": "um, uh, erm, ئە, ئا, ئێ, هم, ام",
    # captions
    "caption_mode": "karaoke",   # karaoke | word | plain | off
    "font": "Vazirmatn",
    "font_size": 64,             # at 1080px-wide reference; scaled to the video
    "text_color": "#FFFFFF",
    "highlight_color": "#FFD400",
    "outline_color": "#000000",
    "outline": 4,
    "shadow": 1,
    "position": "lower",         # lower | middle | upper
    "margin_v": 260,             # at 1920px-tall reference
    "max_words": 4,
    "max_chars": 28,
    "pop_in": True,
    # render
    "crf": 18,
    "preset": "medium",
    "audio_fade_ms": 12,
}


def _coerce(value):
    v = value.strip()
    if v.lower() in ("true", "yes", "on"):
        return True
    if v.lower() in ("false", "no", "off"):
        return False
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    return v.strip('"').strip("'")


def load_style(path=STYLE_PATH):
    """Read `key: value` lines from the first ```settings block of STYLE.md."""
    style = dict(DEFAULTS)
    p = Path(path)
    if not p.exists():
        return style
    m = re.search(r"```settings\n(.*?)```", p.read_text(encoding="utf-8"), re.S)
    if not m:
        return style
    for line in m.group(1).splitlines():
        line = line.split("  #")[0].strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, val = line.split(":", 1)
        style[key.strip()] = _coerce(val)
    return style


# Arabic-script normalization so "the same word" compares equal across takes.
_DIACRITICS = re.compile(r"[ً-ٰٟۖ-ۭـ]")  # harakat + tatweel
_PUNCT = re.compile(r"[\s\.,!?؟،؛:;\"'«»()\[\]\-–—…]+")
_CHAR_MAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "‌": "", "‍": ""})


def norm(word):
    w = _DIACRITICS.sub("", word).translate(_CHAR_MAP)
    return _PUNCT.sub("", w).lower()


def is_rtl(text):
    return any("֐" <= ch <= "ࣿ" for ch in text)


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    w, h = (int(v["width"]), int(v["height"])) if v else (0, 0)
    rot = 0
    if v:
        for sd in v.get("side_data_list", []):
            if "rotation" in sd:
                rot = int(sd["rotation"])
        rot = int(v.get("tags", {}).get("rotate", rot))
    if abs(rot) % 180 == 90:
        w, h = h, w  # ffmpeg autorotates, so captions must target the displayed size
    return {
        "duration": float(info["format"]["duration"]),
        "width": w,
        "height": h,
        "has_audio": any(s["codec_type"] == "audio" for s in info["streams"]),
    }


def words_only(transcript):
    return [w for w in transcript["words"] if w.get("type") == "word"]


def fmt_t(t):
    m, s = divmod(t, 60)
    return f"{int(m)}:{s:05.2f}"
