---
name: subtitlesrastgogharib
description: Rastgo Gharib's own Instagram-page subtitle style for Kurdish (Sorani) videos - transcribe the in/out range of the active Premiere sequence with ElevenLabs, build animated After Effects subtitles (Doran Regular, key words #FFAE00, rounded dark box with soft shadow, underline that follows the spoken word, rise + word-cascade entrance with motion blur) and Dynamic-Link them onto a new top track in Premiere. Use when the user says "subtitle this video", "add subtitles", "/SubtitlesrastgoGharib", or asks to re-animate / fix the subtitles after editing the text.
---

# Subtitles – Rastgo Gharib style

Premiere (premiere-pro MCP) + After Effects (scripts run through `AfterFX.exe -s`) + ElevenLabs Scribe.
Verified on Premiere 26.3, After Effects 26.2, Windows. Reply to the user in English unless they ask for Kurdish.

Style lives in `style.json` (font, colours, box, shadow, underline, animation). Change it there, not in the scripts.
Scripts: `scripts/` in this skill folder (`<SKILL>` below).

## 0. Preconditions
- Premiere open with the project; the sequence to subtitle is ACTIVE and has IN/OUT points set.
- After Effects open, **no dialog open** (a modal dialog blocks every script - if `run_ae.ps1` says "NO LOG", ask the user to close the dialog).
- `ELEVENLABS_API_KEY` user env var = the `sk_...` key (the 64-hex "key ID" does NOT work). If missing: ask the user; they may paste it - then save it with `[Environment]::SetEnvironmentVariable('ELEVENLABS_API_KEY',$k,'User')`, never echo it back.
- Fonts: Doran must be installed (Latin words like HITEX fall back to another font - Doran has no Latin glyphs).

## 1. Read Premiere
`get_project_info`, `get_sequence_in_out_points`, `get_sequence_settings`.
JOB = `<folder of the .prproj>\<ProjectName>_subtitles\` (create it). Write `JOB\job.json`:
```json
{ "compName": "<ProjectName>_Subtitles", "aepName": "<ProjectName>_Subtitles.aep",
  "width": 1080, "height": 1920, "fps": 29.97, "duration": <out - in> }
```
(fps from videoFrameRate: 0.0333667 s = 29.97.)

## 2. Audio + transcript
- `get_encoder_presets format:"wav"` → `export_sequence` the WHOLE sequence (`work_area_only:false`) to `JOB\seq_audio.wav`.
- `powershell -File <SKILL>\scripts\transcribe.ps1 -JobDir JOB -InSec <in> -OutSec <out>` → `words.txt` (index, start, end, word; times relative to IN).

## 3. Lines + key words (you decide)
Read `words.txt`, write `JOB\plan.json`:
```json
{ "rangeEnd": <out - in>, "cues": [[0,5,[3]], [6,9,[7]], ...], "fix": { "43": "تۆ" } }
```
- A cue = `[firstWordIdx, lastWordIdx, [keyWordIdx...]]`. 2–6 words, break at sentence ends / natural pauses, never across a > 0.6 s pause.
- 1 key word per line (max 2 for a name/phrase): the word that carries the meaning (nouns, the surprising word, the brand).
- `fix` = obvious ASR corrections only (word index → text; `""` drops a word).
- `node <SKILL>\scripts\make_cues.js JOB` → `cues.json`, `cues_preview.txt`.
- **Show the user `cues_preview.txt`** ([brackets] = key word) and list words that look mis-heard. They can correct now (update `fix`, re-run) or later in AE.

## 4. Build in After Effects
```
powershell -File <SKILL>\scripts\run_ae.ps1 -Jsx <SKILL>\scripts\build_comp.jsx -JobDir JOB
powershell -File <SKILL>\scripts\run_ae.ps1 -Jsx <SKILL>\scripts\animate.jsx   -JobDir JOB
```
- build_comp refuses to touch another AE project with unsaved changes (asks user to save).
- Look at `JOB\check_0..2.png` (Read tool): RTL letters joined, key words coloured, underline under a word, box fits.

## 5. Into Premiere
1. `import_ae_comps ae_project_path:JOB\<aepName> comp_names:[compName]`
2. `list_project_items` → the new item is named `<compName>/<aepName>`; use its nodeId (find by name fails).
3. `add_track video` (a NEW top track - subtitles must sit ABOVE adjustment layers, or they get their effects).
4. `overwrite_clip item_id:<nodeId> track_index:<top index> start_seconds:<in>`; check with `get_track_info` (start = in, end = out, no audio added).
5. `export_frame` at 2 NEW times (it caches by time) and look at them. `save_project`.

## 6. User edited the text → re-animate
User fixes words in AE (right-click clip → Edit Original, double-click `SUB NN`). Then:
- copy the .aep to `*_backup_<what>.aep` first,
- run `animate.jsx` again (keeps their text/colours, rebuilds underline + animation, re-measures word positions).
- Lines whose word count changed get evenly spread underline timing - tell the user which lines (listed in the log).

## Editing notes for the user
Layers: `SUB NN` (text), `SUB NN LINE` (underline), `SUB NN BOX`. Box auto-fits the text. Colour a word: select it → Character panel fill → FFAE00. Timing: drag SUB and its BOX/LINE together. Save in AE → Premiere updates (Dynamic Link, no render). Keep file names/folder.

## Gotchas (learned the hard way)
- `AfterFX.exe -r file` does nothing when AE is running; `-s "$.evalFile(...)"` works (that's what run_ae.ps1 does).
- ExtendScript: adding a property to a shape group INVALIDATES references to sibling properties - re-fetch after `addProperty`.
- If a script throws mid-way, AE keeps half the changes in memory: `app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)` + re-open the saved .aep, then fix and re-run.
- Box/anchor expressions sample `sourceRectAtTime` at outPoint − 2 frames, so the word-cascade animator doesn't make the box jump.
- Drop Shadow opacity in scripting is 0–255.
- The AE MCP bridge panel (mcp-bridge-auto.jsx, folder `Documents\ae-mcp-bridge`) only has fixed commands (no eval) - use run_ae.ps1 for anything real.
- Premiere per-word caption colours / animation are impossible via API - that's why this is done in AE.
