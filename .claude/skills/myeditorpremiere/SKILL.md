---
name: myeditorpremiere
description: Rastgo's full Premiere Pro edit for vertical talking-head Reels (Kurdish Sorani or any language) through the premiere-pro MCP - connect (UXP), place raw clips on an empty sequence, rotate/scale to 1080x1920, transcribe with ElevenLabs Scribe, pick the clean takes with the user's approval, apply the "Sound 2" audio chain, razor + ripple-delete to the kept takes, one adjustment layer with Lumetri + the N-Log LUT, and verify. Subtitles are NOT part of this skill (use SubtitlesrastgoGharib after it). Use when the user says "/myeditorpremiere", "edit this video", "cut these clips in Premiere", or gives raw clips + a sequence to edit.
---

# myeditorpremiere - Reels edit in Premiere (no subtitles)

Verified end to end on 2026-09-29: Windows 11, Premiere 26.3, premiere-pro-mcp 1.18.6 (npm global), project
`amozhgary 12` -> 18 pieces, 92.626 s, V1 = A1 = adjustment layer end. Reply to the user in **English**, briefly:
results + what needs their decision. Do the steps IN ORDER. Do not retry anything in "Dead ends".
Scripts are in `<SKILL>/scripts` (`<SKILL>` = this folder). Project-12 data for a re-run: `reference/project12_keep.json`.

## 0. Connect (every session)
1. **Exactly one Claude session** may use Premiere. Each session starts its own `premiere-pro-mcp`; the first one takes
   port 7777 and the UXP panel connects to *that* one. Check: `Get-NetTCPConnection -LocalPort 7777` - the owner must be
   this session's node process. Several `premiere-pro-mcp` node processes = tell the user to close the other sessions.
2. `verify_premiere_connection` with `backend:"uxp"` and with `backend:"cep"`. Both must be `ready` (project + active
   sequence open). "No project / no sequence" = ask the user to open the .prproj and double-click the sequence.
3. Check that the UXP tools are in this session's tool list (`manage_clip_effects_uxp`, `automate_effect_parameters_uxp`).
   They are registered only if the server was connected when the session started. If they are missing: Sound 2 and the
   LUT become manual steps for the user (sections 5, 7) - say so up front. A server that failed to bind 7777 can be
   restarted by stopping this session's own `premiere-pro-mcp` node process (Claude Code respawns it, it then takes the
   port), but the UXP tools still stay missing until a new session.
4. Panel token = `PREMIERE_UXP_TOKEN` on the `premiere-pro` entry of `~/.claude.json` (user pastes it in
   Window > UXP Plugins > MCP for Adobe Premiere Pro, host 127.0.0.1, port 7777). The tool prefix is `mcp__premiere-pro__`.

## 1. Inspect and clear
- `get_active_sequence` (expect 1080x1920, 29.97). If it has clips and the user wants a fresh edit:
  `select_all_clips` + `remove_selected_clips`.
- `find_project_item_by_name` for every raw clip (ids change between sessions - never trust old ids) and for
  `Adjustment Layer` (it cannot be created by API; it must exist in the project).
- `clear_item_in_out` on every raw clip BEFORE placing (placing with old marks or `set_item_in_out` first fails).
- Ask the user which clips are used. Clips with only false starts / repeats of a line are NOT placed at all.

## 2. Place
- `add_to_timeline_batch` on the EMPTY sequence (it is an insert edit): clip k at the sum of the previous clip lengths,
  `track_index 0`, `audio_track_index 0`. Read back with `get_track_info` video 0 -> the clip offsets.
- Per video clip, BEFORE any cut (pieces inherit it): `set_clip_scale 50` + `set_clip_rotation -90`
  (3840x2160 landscape -> fills 1080x1920). Other source sizes: compute the scale. No colour effect on clips.

## 3. Transcribe (ElevenLabs Scribe)
- Key: `ELEVENLABS_API_KEY` is a Windows **user** environment variable (set 2026-09-30, `sk_...` key with the
  speech_to_text permission). `transcribe.js` reads it from the process env or directly from the Windows user env, so it
  works even in a session opened before the key was set. Never print, log or save the key.
  If it is missing: ask the user; save what they paste with
  `[Environment]::SetEnvironmentVariable('ELEVENLABS_API_KEY',$k,'User')` and never echo it back.
- Per used clip: `node <SKILL>/scripts/transcribe.js "<clip path>" --out "<job folder>"` -> `t<name>.json`.
  Auto-detects the language (Sorani -> `ckb`); force with `--lang ckb|en|ar|...`. `--start/--dur` transcribe only a range
  (cheaper for long clips or re-checks); word times stay in source-file seconds. Model `scribe_v1` (`--model` to change).
- `node sentences.js t<name>.json` = one line per sentence/take with word indices and times;
  `node words.js t<name>.json <i> <j>` = exact word times for a cut point.
- Job folder: next to the media (e.g. `<media folder>\<project>_edit\`), not a temp folder.

## 4. Pick the takes (user approval required)
- For every spoken point keep the LAST complete clean take. Join two takes only at a natural boundary. Drop stutters,
  false starts, repeated phrases, pauses > ~1 s. Duplicate call-to-action attempts in other clips: keep one.
- Padding: 0.12 s before the first and after the last word of each kept range.
- Write `keep.json` (format in `razor_plan.js`, example in `reference/project12_keep.json`), then SHOW the user a table:
  label, clip, source range, the Kurdish/original text of the kept take. List words the ASR probably got wrong.
  **Wait for OK before cutting.** For a re-run of project 12 the list is fixed: confirm once.

## 5. Sound 2 (before cutting, so all pieces inherit it)
- Preset = Dynamics + Parametric Equalizer ("Vocal Enhancer") + Multiband Compressor ("Broadcast"), in
  Effects > Presets > My Effects > **Sound 2**. Values: `scripts/sound2.json`.
- With UXP tools: on each raw A1 clip `manage_clip_effects_uxp add` the three effects in order (components 2,3,4), then
  every value in sound2.json with `automate_effect_parameters_uxp action:add_keyframe time_seconds:0` (audio params are
  keyframe-type; `set_value` is refused).
- Without UXP tools (fastest, ~10 s for the user): ask the user to select the raw A1 clips and drag Sound 2 onto them.
- Verify either way with `list_clip_effects` on each A1 clip: components Dynamics / Parametric Equalizer / Multiband
  Compressor, Dyn p8 = 0.0741, p11 = 0.4346 (matches sound2.json).
- If the preset file changes: `node extract_preset_params.js "<...\Effect Presets and Custom Items.prfpset>" out.json`.

## 6. Cut
- `node razor_plan.js keep.json` -> cut list in descending order with `request = target x 1.001`
  (`razor_all_tracks` cuts at requested / 1.001; without the correction cuts drift up to 0.5 s at 10 min).
- `razor_all_tracks time_seconds:<request>` for every cut, highest time first (one call cuts V1 + A1; independent calls
  may run in parallel).
- `get_track_info` video 0: every boundary must be within one frame (0.033 s) of its target. Map pieces to keep/delete.
- `ripple_delete node_id:<video piece> range_content:"delete"` for every unwanted piece, **LAST piece first**, one call at
  a time (the linked audio goes with it and later clips shift, so earlier ids/times stay valid).
- `get_active_sequence`: piece count, total = expected (+- 1 frame), V1 end = A1 end, and each piece's inPoint/outPoint
  equals its keep range within a frame. Keep this read-back: the subtitle skill needs start/inPoint/outPoint per piece.

## 7. Colour: one adjustment layer
- `overwrite_clip item_id:"Adjustment Layer" track_index:1 start_seconds:0 audio_track_index:<an empty audio track>`
  (overwrite, NEVER insert: an insert ripples V1 and desyncs audio). Read its node id with `get_track_info` video 1.
- `set_clip_duration node_id:<it> end_seconds:<sequence end>`, then `apply_effect "Lumetri Color"` on it.
- LUT, with UXP tools: `automate_effect_parameters_uxp set_value` on the adjustment layer, component 2 (Lumetri),
  param 34 (Look) = **15** = `N-Log Undone LUT LC`, only on a FRESH Lumetri (Look = 0; the indices shift by one while any
  Look is selected). List from None: 0 None, 1 [Custom], 2 Browse, 3 CineSpace, ..., 15 N-Log Undone LUT LC.
  Readback of a UI-chosen LUT is always 1, so confirm by a frame and by asking the user to look.
- Without UXP tools: the user picks Lumetri > Creative > Look > N-Log Undone LUT LC (the LUT file is
  `D:\F\N-Log Undone LUT LC.cube`, also in `%APPDATA%\Adobe\Common\LUTs\Creative`).

## 8. Final checks (report with read-backs)
- `get_timeline_summary`: V1 coverage 100 %, exactly one Lumetri (the adjustment layer), no effects on clips besides
  Motion/Opacity. V1 end = A1 end = adjustment layer end = expected length.
- If something else (e.g. an old caption track) makes the sequence longer: `set_sequence_in_out_points 0 -> <V1 end>`
  and tell the user what overhangs.
- Look at 3 frames (start / middle / end) with `export_frame` to the scratchpad, each at a NEW time (frames are cached
  per time), downscale with ffmpeg and view them: vertical fill, upright, graded.
- Report exactly what was not verified and what the user must do by hand. Then offer the subtitle skill
  (**SubtitlesrastgoGharib**) as the next step.

## Dead ends - do NOT try
- LUT by path or name, `apply_lut`, Browse ("Illegal Parameter type"); guessing the LUT number from frames; setting Look
  from a non-zero state.
- `apply_audio_effect "Sound 2"` (says applied, adds nothing); `paste_clip_attributes` for audio; `set_value` on audio
  params; CEP `set_effect_property` on audio or Lumetri.
- `add_adjustment_layer` (unsupported). Adding a clip to V2/V3 with an insert edit after cutting.
- Razor without the x1.001 correction. Re-exporting a frame at the same time. `set_item_in_out` before `clear_item_in_out`.
- `add_track` (QE fallback) puts the new track at the BOTTOM (index 0) and shifts every track index up - re-read track
  indices after it, or avoid it. `delete_track` is blocked by the safety classifier: the user deletes tracks by hand.
- `import_mogrt` with Premiere-authored templates: text is NOT written ("no MGT component"). No API makes editable
  text layers. Captions/subtitles belong to the subtitle skill.
- Classifier "no verdict" errors: retry once, then wait. No extra tests the user did not ask for.

## What the user does by hand (list it at the end, only what applies)
- Sound 2 / LUT when the UXP tools were missing; confirm the LUT name in Lumetri.
- Delete empty tracks or stray caption tracks (API cannot).
