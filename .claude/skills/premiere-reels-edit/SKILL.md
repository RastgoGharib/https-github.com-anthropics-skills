---
name: premiere-reels-edit
description: Edit a talking-head vertical video (Reels/Shorts) in Adobe Premiere Pro through the premiere-pro MCP - place clips, rotate/scale to 1080x1920, keep only the correct takes using an ElevenLabs Kurdish transcript, remove silences, rebuild the user's "Sound 2" audio chain, add one adjustment layer with the N-Log LUT, and make subtitles. Use when the user asks to edit/cut/clean a Premiere sequence from raw clips or to add subtitles.
---

# Premiere reels edit (checklist + hard-won rules)

Everything below was verified on Premiere 26.x (26.3), Windows, premiere-pro-mcp 1.18.6. Do the steps IN ORDER.

## 0. Connect (once per machine)
- CEP bridge works out of the box. UXP bridge is needed for effect parameters: build+install `uxp-plugin` from the npm package (`node scripts/build-uxp-ccx.mjs`, open the .ccx), set env `PREMIERE_UXP_TOKEN` (16+ chars) on the `premiere-pro` entry in ~/.claude.json, restart Claude, paste the same token in Premiere > Window > UXP Plugins > MCP for Adobe Premiere Pro. Only ONE Claude session may run (two sessions = two servers fighting for port 7777).
- Check with `verify_premiere_connection` (backend uxp). Never guess: if a tool says "applied" verify with `manage_clip_effects_uxp inspect` / `list_clip_effects`.
- `mcp__premiere-pro__*` is the correct prefix (typing "premiere-pass" fails silently).

## 1. Assets & sequence
- Sequence 1080x1920. Put the raw clips on V1/A1 with `add_to_timeline_batch` (INSERT edit - only safe on an empty timeline).
- Clear project-item in/out with `clear_item_in_out` before placing full clips.
- Per video clip: `set_clip_scale 50` + `set_clip_rotation -90` (3840x2160 landscape -> fills 1080x1920). Do this BEFORE cutting: razor pieces inherit effects.
- Do NOT grade clips. Do NOT put Lumetri on clips.

## 2. Transcript (ElevenLabs Scribe, language ckb auto-detected)
- Key needs the `speech_to_text` permission. Read key from env var, never print/save it. `scripts/transcribe.sh video.MOV`.
- `scripts/seg2.js` = sentences with timings, `wd.js` = word-level times. Choose per spoken point (e.g. "yek, dwa, ...") the LAST COMPLETE clean take; join two takes only at natural boundaries; drop stutters/false starts. Extra CTA attempts in other clips = duplicates - keep one.
- Keep ranges with ~0.12 s padding each side. Drop pauses > ~1 s.

## 3. Cutting (razor + ripple) - CRITICAL calibration
- `razor_all_tracks` places the cut at requested/1.001 (30 vs 29.97 timebase). To cut at target timeline time T request `T*1.001`. Verify boundaries with `get_track_info` before deleting anything.
- Razor ALL cuts first (descending time order), read `get_track_info` (V1 ids), then `ripple_delete` each unwanted piece with `range_content:"delete"`, LAST piece first, so earlier ids/times stay valid. Audio pieces are removed with the video piece.
- Never add a clip on another track with an insert edit after cutting (it ripples V1 and desyncs audio). Use `overwrite_clip`.
- `remove_selected_clips` after `select_all_clips` clears a timeline in 2 calls.

## 4. Sound 2 (user's audio preset = Dynamics + Parametric EQ (Vocal Enhancer) + Multiband Compressor (Broadcast))
- Presets can NOT be applied by name through any API (apply_audio_effect says applied but adds nothing).
- Rebuild: `manage_clip_effects_uxp add` "Dynamics", "Parametric Equalizer", "Multiband Compressor" (component idx 2,3,4), then set values with `automate_effect_parameters_uxp action:add_keyframe time_seconds:0` (audio params are time-varying; set_value is refused). Values are normalized 0-1 and come from the preset file `Documents/Adobe/Premiere Pro/26.0/Profile-*/Effect Presets and Custom Items.prfpset` (stereo variant = ChannelType 1; run `scripts/extract_preset_params.js`).
- Only ~32 params differ from defaults (Dyn 6,8,11; EQ 1-4,13-15,29,35,38,39,42; MB 2-6,9-13,18,21,34-36,48,49).
- `paste_clip_attributes` cannot copy audio effects. Cheapest for many pieces: build the chain on ONE clip, then in Premiere: Ctrl+C that clip, select all other audio clips, Ctrl+Alt+V (Paste Attributes) - or drag the preset onto the selected clips. Best: apply BEFORE razor so pieces inherit.

## 5. Colour: ONE adjustment layer, never per-clip
- Project already contains an "Adjustment Layer" item. `overwrite_clip` it on V2 at 0, `set_clip_duration end_seconds=<sequence end>`, `apply_effect "Lumetri Color"` on it.
- LUT: Lumetri Look is set by menu position with `automate_effect_parameters_uxp set_value` on component 2 (Lumetri), param 34 ("Look"). Strings/paths are rejected. From a CLEAN state (Look=0, fresh Lumetri) the list is: 0 None, 1 [Custom], 2 Browse, 3 CineSpace, ... and `N-Log Undone LUT LC` = 13th LUT = index 15. ALWAYS reset to 0 before setting (indices shift by one while a Look is selected). Readback of a UI-selected LUT is always 1 - it cannot identify a LUT.
- frame checks: `export_frame` caches by time - use a NEW time for every test.

## 6. Subtitles (Kurdish, Premiere captions)
> **Preferred:** use the `SubtitlesrastgoGharib` skill (animated After Effects subtitles in the user's page style: Doran, #FFAE00 key words, box, underline, motion blur). The Premiere-captions route below is only a fallback.

- `scripts/map.js` maps transcript words to timeline times from the actual pieces (use `get_active_sequence`: start/inPoint/outPoint per piece), `scripts/srt.js` builds an SRT (<=6 words/cue).
- `import_media` the .srt then `create_caption_track import item_id=<name> start_seconds=0`. Style (Doran Regular, white, shadow, box) is set once in Essential Graphics > captions; per-word colour (#FFAE00 for key words) has no API - do it in the text editor or burn-in with ffmpeg/ASS.
- The ASR text has errors: show the Kurdish text to the user for approval.

## 7. Final checks
`get_timeline_summary`: V1 coverage 100%, V1 end == A1 end == adjustment layer end. Look at 3 frames (start/middle/end). Tell the user what could NOT be automated.

## Known limits / gotchas
- Classifier hiccups ("no verdict") are transient: retry once, then pause.
- `set_item_in_out` can fail on items with existing marks: `clear_item_in_out` first.
- CEP `set_effect_property` on audio/Lumetri returns "Illegal Parameter type"; use UXP.
- Adjustment layers cannot be created by API (add_adjustment_layer unsupported); use the existing project item.
