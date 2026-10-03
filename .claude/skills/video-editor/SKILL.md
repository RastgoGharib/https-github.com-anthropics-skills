---
name: video-editor
description: Edit talking-head videos. Transcribes with ElevenLabs (word timestamps), proposes a cut list of silences, retakes and stumbles for the user to approve, then renders with ffmpeg and burns in animated word-highlight captions, including right-to-left Kurdish (Sorani). Use when the user asks to edit, tighten, cut, clean up or caption a video, remove pauses or retakes, or add (Kurdish) subtitles.
---

# Video editor

Pipeline: **transcribe → propose cuts → user approves → render**. Never skip the approval step:
the user decides what gets cut, not you.

Read `STYLE.md` first. It holds the user's standing preferences (prose) and the tunable values
(`settings` block) the scripts read. If the user states a lasting preference ("always put captions
in the middle"), update `STYLE.md` instead of just applying it once.

Requirements: `ffmpeg` built with libass, fribidi and harfbuzz (stock Ubuntu/Homebrew builds are),
Python 3 with `requests`, and ElevenLabs access: `$ELEVENLABS_API_KEY`, or a proxy that injects it.
Never print the key.

Scripts live in `scripts/`. WORKDIR defaults to `<video>_edit/` next to the input; keep it out of git.

## 1. Transcribe

```bash
python3 scripts/transcribe.py INPUT.mov [--out WORKDIR] [--language ckb|en|auto]
```
This uses Scribe (`scribe_v2`) with word timestamps and writes `WORKDIR/transcript.json`. The result
is cached, so pass `--force` to re-run. Each run costs ElevenLabs credits, so don't re-transcribe
casually.

## 2. Propose cuts

```bash
python3 scripts/cutlist.py WORKDIR
```
This writes `cutlist.json` (every cut `approved: null`) and `cutlist.md`, the review sheet:
- **silence**: word gaps longer than `min_silence`, plus dead air at head and tail. It's measured
  from word timestamps, not audio level, so background music doesn't hide pauses.
- **retake**: a phrase of `retake_min_words`+ words said again within `retake_window` words. The
  first take is cut.
- **stumble**: filler words (`suggest: cut`) and doubled words (`suggest: review`, because Sorani
  doubles words for emphasis, e.g. «زۆر زۆر»).
- **caption check**: low-confidence words and Latin letters inside a Kurdish transcript. These
  are not cuts. They're likely misheard words that need a fix before the captions get burned in.

Show the user `cutlist.md` and ask them to decide. Point out anything questionable: a cut
mid-sentence, a retake whose second take is weaker, or audible music jumps if the video has a
music bed. If no cuts are proposed, say so plainly; don't invent cuts.

## 3. Record the user's decisions

```bash
python3 scripts/approve.py WORKDIR --ids 1,2,5 --reject 3,4
python3 scripts/approve.py WORKDIR --all          # only if the user said "approve all"
python3 scripts/approve.py WORKDIR --suggested    # only if the user said "go with your suggestions"
python3 scripts/approve.py WORKDIR --fix 'Spas=سپاس'   # caption correction, exact word match
```
Record only what the user actually said. For Kurdish fixes, ask the user for the correct
spelling rather than guessing.

## 4. Render

```bash
python3 scripts/render.py WORKDIR [--preview 15] [--no-captions] [--out FILE]
```
It refuses to run while any cut is pending. It cuts with trim/concat (with micro audio fades
against clicks), remaps word times onto the new timeline, writes `captions.ass` and burns it in
with the bundled Vazirmatn font. Output: `WORKDIR/<name>_edited.mp4` (H.264/AAC, faststart).

Use `--preview 15` for a quick look before the full render. After rendering, grab a frame or
two (`ffmpeg -ss T -i OUT -frames:v 1 f.png`) and look at the captions yourself before handing
over: check word order, joined letters, and placement.

## RTL / Kurdish notes

- The ASS style uses `Encoding: -1`, which turns on libass's full Unicode bidi. With the default `1`,
  Sorani lines come out scrambled whenever they contain punctuation or a Latin word. Don't change it.
- Each RTL caption line starts with U+200F (RLM), so a line that begins with a Latin word still
  reads right-to-left.
- Active-word highlighting changes colour only, not size, so it doesn't shift the line or break
  letter joining.
- `fonts/Vazirmatn-Bold.ttf` (OFL) covers every Sorani letter (ڕ ڵ ۆ ێ ە ڤ گ چ پ ژ). To use a
  different font, drop the .ttf into `fonts/` and set `font:` in STYLE.md to its family name.
- If the source already has burned-in captions, warn the user: new captions will stack on top of
  them.

## Tests

`python3 -m unittest discover -s .claude/skills/video-editor/tests` runs offline (no API, no ffmpeg).
