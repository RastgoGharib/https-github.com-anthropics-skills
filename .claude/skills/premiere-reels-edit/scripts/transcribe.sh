#!/usr/bin/env bash
# Usage: ELEVENLABS_API_KEY=... ./transcribe.sh /path/to/video.MOV  -> writes t<name>.json (word timestamps, Kurdish 'ckb' auto-detected)
set -e
f="$1"; n=$(basename "${f%.*}")
ffmpeg -y -v error -i "$f" -vn -ac 1 -ar 16000 -c:a libmp3lame -b:a 48k "a_$n.mp3"
curl -s -m 550 -X POST https://api.elevenlabs.io/v1/speech-to-text -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F model_id=scribe_v1 -F "file=@a_$n.mp3" -F timestamps_granularity=word -F tag_audio_events=false -o "t_$n.json" -w "$n http=%{http_code}\n"
