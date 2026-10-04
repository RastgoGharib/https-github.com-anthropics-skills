# Skills in this repo - cloud compatibility report

Written 2026-10-04. Cloud sessions run on Linux with **no Adobe apps installed**, so anything that drives
Premiere Pro / After Effects cannot run there. The portable parts can be reused, or ported, in the cloud.

No secrets are stored in this repo. Keys are read from environment variables:
`ELEVENLABS_API_KEY` (ElevenLabs Scribe) and `PREMIERE_UXP_TOKEN` (local Premiere UXP panel pairing, local machine only).
In a cloud session set `ELEVENLABS_API_KEY` as an environment secret.
Not committed (see `.gitignore`): media (.mp4/.mov/.wav...), .prproj/.aep/.ccx, `.env`. No file was over 50 MB.

| Skill | Runs in cloud? |
|---|---|
| `video-editor` (already in the repo, ffmpeg/Python based) | Yes, mostly - this is the cloud-native pipeline |
| `myeditorpremiere` | Only the planning parts. Execution needs Premiere |
| `premiere-reels-edit` | Only transcription + SRT/segment logic. Execution needs Premiere |
| `SubtitlesrastgoGharib` | Only transcription + cue planning + `style.json`. Rendering needs After Effects |

## myeditorpremiere (Reels edit, no subtitles)
**Needs Premiere installed (cannot run in cloud):** the whole of SKILL.md sections 0-2 and 5-8. It calls the
`premiere-pro` MCP (UXP/CEP bridge on 127.0.0.1:7777): placing clips, scale/rotate, "Sound 2" audio chain
(Dynamics, Parametric EQ, Multiband Compressor), razor + ripple delete, Adjustment Layer + Lumetri + N-Log LUT.
`scripts/extract_preset_params.js` reads a Premiere `.prfpset` file.

**Portable:**
- The edit rules: which take to keep (last complete clean take), 0.12 s padding, drop pauses > ~1 s, approval table before cutting.
- `scripts/transcribe.js` (ElevenLabs Scribe, Node, uses `fetch`), `sentences.js`, `words.js` (pure JSON processing).
- `scripts/razor_plan.js` (computes the cut list, including the x1.001 correction for Premiere's razor), `reference/project12_keep.json`, `scripts/sound2.json` (preset values as data).
- Cut logic can be reused with ffmpeg to produce a rough cut in the cloud.

**Hard-coded Windows paths / host assumptions:**
- `D:\F\N-Log Undone LUT LC.cube` (SKILL.md section 7) and `%APPDATA%\Adobe\Common\LUTs\Creative`.
- `scripts/transcribe.js` falls back to reading the Windows *user* env var through `powershell.exe` when `ELEVENLABS_API_KEY` is not in the process env (harmless on Linux, the fallback just fails; set the env var instead).
- Mentions `~/.claude.json` for the `PREMIERE_UXP_TOKEN` and `Get-NetTCPConnection` (PowerShell) for the port check.

## premiere-reels-edit (older all-in-one version, includes subtitles)
**Needs Premiere installed:** placing clips, Sound 2 chain, razor/ripple, adjustment layer + N-Log LUT, subtitles in Premiere.

**Portable:** `scripts/transcribe.sh` (curl + ElevenLabs, works on Linux with `ELEVENLABS_API_KEY`), `scripts/map.js`,
`seg2.js`, `srt.js`, `wd.js` (word/segment mapping and SRT generation from the transcript JSON), take-selection rules.

**Hard-coded paths:** none in the scripts. SKILL.md refers to `~/.claude.json`, the npm package `uxp-plugin` build step, and port 7777.
`myeditorpremiere` supersedes this skill for the video edit; the subtitles part is superseded by `SubtitlesrastgoGharib`.

## SubtitlesrastgoGharib (Rastgo's subtitle style, Kurdish Sorani)
**Needs After Effects + Premiere installed:** `scripts/build_comp.jsx`, `scripts/animate.jsx` (ExtendScript, run inside AE),
`scripts/run_ae.ps1` (launches `AfterFX.exe -s`), Dynamic Link import into Premiere. Also needs the **Doran Regular** font
installed (it is not bundled in this repo).

**Portable:**
- `style.json` (font, colours #FFAE00 key words, box, shadow, underline, animation timing). This is the source of truth for the look.
- `scripts/make_cues.js` (turns `plan.json` + `words.txt` into cues; pure Node).
- The cue rules: 2-6 words per line, 1 key word per line, never break across a pause > 0.6 s.
- `scripts/transcribe.ps1` is PowerShell + `curl.exe` and reads a Windows user env var; on Linux use `premiere-reels-edit/scripts/transcribe.sh` or `myeditorpremiere/scripts/transcribe.js` instead (same ElevenLabs call).
- `.jsx` files are plain text; they can be read and edited in the cloud, but not executed.

**Hard-coded paths:** `C:\Program Files\Adobe\Adobe After Effects *\Support Files\AfterFX.exe` in `run_ae.ps1`;
Windows user env var `ELEVENLABS_API_KEY` in `transcribe.ps1`; `Documents\ae-mcp-bridge` mentioned in SKILL.md;
backslash paths (`<SKILL>\scripts\...`) in the SKILL.md commands.

## Honest summary
In a cloud session Claude can: read the style rules, transcribe audio, plan takes and subtitle cues, produce SRT files, and
(with ffmpeg) make a rough cut. It cannot touch Premiere or After Effects. For the real edit, run these skills locally on the Windows machine.
