#!/usr/bin/env python3
"""Propose a cut list (silences, retakes, stumbles) from transcript.json.

Usage: cutlist.py WORKDIR

Writes WORKDIR/cutlist.json (machine-readable; every cut starts with approved=null)
and WORKDIR/cutlist.md (the review sheet to show the user). Nothing is cut until
the user approves; see approve.py.

Silences come from gaps between word timestamps, not audio level, so a music bed
under the voice doesn't hide pauses.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import fmt_t, load_style, norm, probe, words_only  # noqa: E402

LATIN = re.compile(r"[A-Za-z]")


def detect_silences(words, duration, s):
    cuts, pad = [], s["keep_pad"]
    if s["trim_head_tail"] and words:
        if words[0]["start"] - pad > 0.3:
            cuts.append(dict(type="silence", start=0.0, end=round(words[0]["start"] - pad, 3),
                             reason="dead air before first word", suggest="cut"))
        if duration - (words[-1]["end"] + pad) > 0.3:
            cuts.append(dict(type="silence", start=round(words[-1]["end"] + pad, 3), end=round(duration, 3),
                             reason="dead air after last word", suggest="cut"))
    for a, b in zip(words, words[1:]):
        gap = b["start"] - a["end"]
        if gap > s["min_silence"]:
            cuts.append(dict(type="silence", start=round(a["end"] + pad, 3), end=round(b["start"] - pad, 3),
                             reason=f"{gap:.2f}s pause", suggest="cut"))
    return cuts


def detect_retakes(words, s):
    """A phrase said, abandoned and said again: cut the first take."""
    toks = [norm(w["text"]) for w in words]
    cuts, i = [], 0
    while i < len(words):
        hit = None
        for n in range(6, s["retake_min_words"] - 1, -1):
            seq = toks[i:i + n]
            if len(seq) < n or not all(seq):
                continue
            for j in range(i + n, min(i + n + s["retake_window"], len(words) - n + 1)):
                if toks[j:j + n] == seq:
                    hit = (n, j)
                    break
            if hit:
                break
        if hit:
            n, j = hit
            first = " ".join(w["text"] for w in words[i:j])
            cuts.append(dict(type="retake", start=words[i]["start"], end=words[j]["start"],
                             text=first, reason=f"phrase repeated ({n} words); keeps the second take",
                             suggest="cut"))
            i = j
        else:
            i += 1
    return cuts


def detect_stumbles(words, s):
    fillers = {norm(f) for f in str(s["fillers"]).split(",") if f.strip()}
    cuts = []
    for k, w in enumerate(words):
        t = norm(w["text"])
        if t in fillers:
            cuts.append(dict(type="stumble", start=w["start"], end=w["end"], text=w["text"],
                             reason="filler word", suggest="cut"))
        elif k + 1 < len(words) and t and t == norm(words[k + 1]["text"]):
            # Doubled word. Often a stutter, but Kurdish uses doubling for emphasis (زۆر زۆر).
            cuts.append(dict(type="stumble", start=w["start"], end=words[k + 1]["start"],
                             text=f"{w['text']} {words[k + 1]['text']}",
                             reason="doubled word: stutter, or intentional emphasis?", suggest="review"))
    return cuts


def detect_flags(transcript, words, s):
    """Not cuts: things the user should eyeball because captions may be wrong."""
    rtl_lang = transcript.get("language_code") in ("ckb", "kur", "ku", "ar", "fa", "ur", "he")
    flags = []
    for i, w in enumerate(words):
        why = []
        if w.get("logprob", 0) < s["low_confidence"]:
            why.append(f"low confidence ({w['logprob']:.2f})")
        if rtl_lang and LATIN.search(w["text"]):
            why.append("Latin letters in a Kurdish/Arabic-script transcript, likely misheard")
        if why:
            ctx = " ".join(x["text"] for x in words[max(0, i - 3):i + 4])
            flags.append(dict(time=w["start"], word=w["text"], why="; ".join(why), context=ctx))
    for e in transcript["words"]:
        if e.get("type") == "audio_event":
            flags.append(dict(time=e["start"], word=e["text"], why="audio event", context=""))
    return flags


def context(words, start, end):
    inside = [w["text"] for w in words if w["start"] >= start - 0.01 and w["end"] <= end + 0.01]
    before = [w["text"] for w in words if w["end"] <= start + 0.01][-3:]
    after = [w["text"] for w in words if w["start"] >= end - 0.01][:3]
    mid = " ".join(inside) if inside else "·"
    return f"{' '.join(before)} [{mid}] {' '.join(after)}".strip()


def write_md(path, data, words):
    L = [f"# Cut list: {Path(data['source']).name}", "",
         f"Duration {fmt_t(data['duration'])} · language `{data['language']}` · "
         f"{len(data['cuts'])} proposed cuts, {sum(c['end'] - c['start'] for c in data['cuts']):.1f}s total",
         "", "Approve with e.g. `approve.py WORKDIR --all` or `--ids 1,3 --reject 2`.", ""]
    if data["cuts"]:
        L += ["| # | type | from → to | length | context ([removed]) | suggest | reason |",
              "|---|---|---|---|---|---|---|"]
        for c in data["cuts"]:
            L.append(f"| {c['id']} | {c['type']} | {fmt_t(c['start'])} → {fmt_t(c['end'])} | "
                     f"{c['end'] - c['start']:.2f}s | {context(words, c['start'], c['end'])} | "
                     f"{c['suggest']} | {c['reason']} |")
    else:
        L.append("_No cuts proposed. The take is already tight at the current STYLE.md thresholds._")
    L += ["", "## Caption check", ""]
    if data["flags"]:
        L += ["These words may be wrong in the captions. Fix with `approve.py WORKDIR --fix 'wrong=right'`.", "",
              "| time | word | why | context |", "|---|---|---|---|"]
        L += [f"| {fmt_t(f['time'])} | {f['word']} | {f['why']} | {f['context']} |" for f in data["flags"]]
    else:
        L.append("_Nothing flagged._")
    Path(path).write_text("\n".join(L) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    work = Path(sys.argv[1])
    transcript = json.loads((work / "transcript.json").read_text(encoding="utf-8"))
    s = load_style()
    words = words_only(transcript)
    duration = probe(transcript["source"])["duration"]

    cuts = detect_silences(words, duration, s) + detect_retakes(words, s) + detect_stumbles(words, s)
    cuts = [c for c in cuts if c["end"] - c["start"] >= 0.05]
    cuts.sort(key=lambda c: c["start"])
    for n, c in enumerate(cuts, 1):
        c["id"] = n
        c["approved"] = None

    out = work / "cutlist.json"
    old = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    data = dict(source=transcript["source"], duration=duration,
                language=transcript.get("language_code"), cuts=cuts,
                flags=detect_flags(transcript, words, s), fixes=old.get("fixes", {}))
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    write_md(work / "cutlist.md", data, words)
    by = {}
    for c in cuts:
        by[c["type"]] = by.get(c["type"], 0) + 1
    print(f"{len(cuts)} cuts {by or ''}, {len(data['flags'])} caption flags -> {work / 'cutlist.md'}")


if __name__ == "__main__":
    main()
