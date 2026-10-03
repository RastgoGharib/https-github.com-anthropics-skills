#!/usr/bin/env python3
"""Apply approved cuts and burn in animated captions.

Usage: render.py WORKDIR [--out FILE] [--preview SECONDS] [--no-captions] [--skip-pending]

Refuses to run while any cut is still pending (approved=null): the user decides first.
--skip-pending treats pending cuts as rejected (keeps that footage).
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import FONTS_DIR, is_rtl, load_style, probe, words_only  # noqa: E402

RLM = "‏"
BREAK_AFTER = tuple(".,!?؟،؛:…")


# ---------- timeline ----------

def merge(intervals):
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def keep_segments(removed, duration):
    keep, t = [], 0.0
    for s, e in removed:
        if s - t > 0.04:
            keep.append((t, s))
        t = max(t, e)
    if duration - t > 0.04:
        keep.append((t, duration))
    return keep


def remap(t, keep):
    """Source time -> output time; None if t falls inside removed footage."""
    out = 0.0
    for s, e in keep:
        if t < s:
            return None
        if t <= e:
            return out + (t - s)
        out += e - s
    return None


def retime_words(words, keep, fixes):
    res = []
    for w in words:
        mid = remap((w["start"] + w["end"]) / 2, keep)
        if mid is None:
            continue  # word was cut
        s = remap(w["start"], keep)
        e = remap(w["end"], keep)
        s = mid - 0.02 if s is None else s
        e = mid + 0.02 if e is None else e
        text = fixes.get(w["text"].strip(), w["text"].strip())
        if text:
            res.append(dict(text=text, start=s, end=e))
    return res


# ---------- captions ----------

def ass_color(hex_rgb, alpha="00"):
    h = hex_rgb.lstrip("#")
    return f"&H{alpha}{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def ass_time(t):
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def esc(text):
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def chunk(words, s):
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        chars = len(" ".join(x["text"] for x in cur))
        if (nxt is None or len(cur) >= s["max_words"] or chars >= s["max_chars"]
                or w["text"].endswith(BREAK_AFTER) or nxt["start"] - w["end"] > 0.5
                or chars + 1 + len(nxt["text"]) > s["max_chars"]):
            chunks.append(cur)
            cur = []
    return chunks


def build_ass(words, s, width, height):
    # Encoding -1 makes libass run full Unicode bidi with auto paragraph direction.
    # With the usual 1 it lays out LTR, which scrambles Kurdish word order around
    # punctuation and Latin words.
    scale_x, scale_y = width / 1080, height / 1920
    size = round(s["font_size"] * scale_x)
    margin = round(s["margin_v"] * scale_y)
    align = {"lower": 2, "middle": 5, "upper": 8}[s["position"]]
    base, hi = ass_color(s["text_color"]), ass_color(s["highlight_color"])
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{s['font']},{size},{base},{hi},{ass_color(s['outline_color'])},{ass_color('#000000', '80')},-1,0,0,0,100,100,0,0,1,{s['outline'] * scale_x:.1f},{s['shadow'] * scale_x:.1f},{align},{round(60 * scale_x)},{round(60 * scale_x)},{margin},-1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    pop = r"{\fscx85\fscy85\t(0,110,\fscx100\fscy100)}" if s["pop_in"] else ""
    lines = []
    chunks = chunk(words, s)
    for ci, ch in enumerate(chunks):
        c_start = ch[0]["start"]
        c_end = ch[-1]["end"] + 0.35
        if ci + 1 < len(chunks):
            c_end = min(c_end, chunks[ci + 1][0]["start"])
        rtl = RLM if is_rtl(" ".join(w["text"] for w in ch)) else ""

        if s["caption_mode"] == "plain":
            text = " ".join(esc(w["text"]) for w in ch)
            lines.append((c_start, c_end, pop + r"{\fad(60,60)}" + rtl + text))
        elif s["caption_mode"] == "word":
            for k, w in enumerate(ch):
                end = ch[k + 1]["start"] if k + 1 < len(ch) else c_end
                lines.append((w["start"], end, pop + rtl + esc(w["text"])))
        else:  # karaoke: whole phrase on screen, active word highlighted
            for k, w in enumerate(ch):
                start = c_start if k == 0 else w["start"]
                end = ch[k + 1]["start"] if k + 1 < len(ch) else c_end
                parts = []
                for j, x in enumerate(ch):
                    color = hi if j == k else base
                    parts.append(f"{{\\1c{color}}}{esc(x['text'])}")
                fade_in, fade_out = (60 if k == 0 else 0), (60 if k == len(ch) - 1 else 0)
                anim = (pop if k == 0 else "") + (f"{{\\fad({fade_in},{fade_out})}}" if fade_in or fade_out else "")
                lines.append((start, end, anim + rtl + " ".join(parts)))
    body = "".join(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{t}\n" for a, b, t in lines if b > a)
    return head + body


# ---------- ffmpeg ----------

def filter_escape(path):
    return str(path).replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def build_filter(keep, has_audio, ass_path, fade_ms):
    f, n = [], len(keep)
    fade = fade_ms / 1000
    for i, (s, e) in enumerate(keep):
        f.append(f"[0:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS[v{i}]")
        if has_audio:
            d = e - s
            f.append(f"[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS,"
                     f"afade=t=in:d={fade:.3f},afade=t=out:st={max(0, d - fade):.3f}:d={fade:.3f}[a{i}]")
    ins = "".join(f"[v{i}]" + (f"[a{i}]" if has_audio else "") for i in range(n))
    f.append(f"{ins}concat=n={n}:v=1:a={1 if has_audio else 0}[vc]" + ("[aout]" if has_audio else ""))
    if ass_path:
        f.append(f"[vc]ass=filename='{filter_escape(ass_path)}':fontsdir='{filter_escape(FONTS_DIR)}'[vout]")
    else:
        f.append("[vc]null[vout]")
    return ";\n".join(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work")
    ap.add_argument("--out")
    ap.add_argument("--preview", type=float, help="only render the first N seconds of the output")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--skip-pending", action="store_true")
    a = ap.parse_args()

    work = Path(a.work)
    s = load_style()
    cl = json.loads((work / "cutlist.json").read_text(encoding="utf-8"))
    pending = [c["id"] for c in cl["cuts"] if c["approved"] is None]
    if pending and not a.skip_pending:
        sys.exit(f"Cuts {pending} are still pending. Get the user's decision (approve.py) first.")

    src = cl["source"]
    info = probe(src)
    removed = merge([[c["start"], c["end"]] for c in cl["cuts"] if c["approved"] is True])
    keep = keep_segments(removed, info["duration"])
    transcript = json.loads((work / "transcript.json").read_text(encoding="utf-8"))
    words = retime_words(words_only(transcript), keep, cl.get("fixes", {}))

    ass_path = None
    if not a.no_captions and s["caption_mode"] != "off":
        ass_path = work / "captions.ass"
        ass_path.write_text(build_ass(words, s, info["width"], info["height"]), encoding="utf-8")

    script = work / "filter.txt"
    script.write_text(build_filter(keep, info["has_audio"], ass_path, s["audio_fade_ms"]), encoding="utf-8")
    out = Path(a.out) if a.out else work / (Path(src).stem + ("_preview" if a.preview else "_edited") + ".mp4")
    cmd = ["ffmpeg", "-v", "error", "-stats", "-y", "-i", src, "-filter_complex_script", str(script),
           "-map", "[vout]"]
    if info["has_audio"]:
        cmd += ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-crf", str(s["crf"]), "-preset", s["preset"], "-pix_fmt", "yuv420p",
            "-movflags", "+faststart"]
    if a.preview:
        cmd += ["-t", str(a.preview)]
    subprocess.run(cmd + [str(out)], check=True)

    new_dur = sum(e - b for b, e in keep)
    print(f"{len(removed)} cut regions, {info['duration']:.2f}s -> {new_dur:.2f}s "
          f"(-{info['duration'] - new_dur:.2f}s), {len(words)} caption words -> {out}")


if __name__ == "__main__":
    main()
