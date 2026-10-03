# Editing style

My preferences for every edit. The scripts read the `settings` block below; the prose is for Claude.
Change a value here once instead of repeating it in every request.

## How I like my videos

<!-- Starter guesses from the first test clip. Rewrite these in your own words. -->

- Talking-head shorts, mostly in **Kurdish (Sorani)**, vertical 9:16.
- Tight pacing, but don't make it breathless: keep a little air around each cut.
- Never cut doubled words like «زۆر زۆر» automatically: in Sorani that's usually emphasis, not a stutter.
- Captions in the lower third, short phrases, active word highlighted in yellow.
- Most clips have background music. Cuts make the music jump, so warn me if a cut lands mid-phrase in the music.
- Fix misheard words in the captions before rendering (English loanwords and names are the usual suspects).

## Settings

```settings
# --- transcription ---
language: ckb            # Sorani Kurdish; use auto to detect
stt_model: scribe_v2

# --- cuts ---
min_silence: 0.6         # cut pauses longer than this (seconds)
keep_pad: 0.15           # air kept either side of a cut
trim_head_tail: true
retake_min_words: 2      # shortest repeated phrase treated as a retake
retake_window: 8         # max words between the two takes
low_confidence: -1.2     # flag words below this log-probability for caption review
fillers: um, uh, erm, ئە, ئا, ئێ, هم, ام

# --- captions ---
caption_mode: karaoke    # karaoke | word | plain | off
font: Vazirmatn          # bundled in fonts/; supports all Sorani letters (ڕ ڵ ۆ ێ ە ڤ)
font_size: 64            # at 1080px width; scaled to the actual video
text_color: #FFFFFF
highlight_color: #FFD400
outline_color: #000000
outline: 4
shadow: 1
position: lower          # lower | middle | upper
margin_v: 260            # distance from the edge, at 1920px height
max_words: 4
max_chars: 28
pop_in: true

# --- render ---
crf: 18
preset: medium
audio_fade_ms: 12        # micro-fade at each cut to avoid clicks
```
