# Cuts the in/out range out of the full-sequence WAV and transcribes it with ElevenLabs Scribe (word timestamps).
# Usage: powershell -File transcribe.ps1 -JobDir <job folder> -InSec <in> -OutSec <out>
# Needs JobDir\seq_audio.wav (export_sequence of the WHOLE sequence) and the user env var ELEVENLABS_API_KEY (sk_...).
# Writes range_audio.mp3, transcript.json, words.txt (index, start, end, word - times relative to the IN point).
param([Parameter(Mandatory)][string]$JobDir, [Parameter(Mandatory)][double]$InSec, [Parameter(Mandatory)][double]$OutSec)
$ErrorActionPreference = 'Stop'
$k = [Environment]::GetEnvironmentVariable('ELEVENLABS_API_KEY', 'User')
if (-not $k -or $k -notlike 'sk_*' -or $k.Length -lt 30) { throw "ELEVENLABS_API_KEY missing/invalid (must be the sk_ key, not the key ID)" }
Push-Location $JobDir
try {
    $inv = [Globalization.CultureInfo]::InvariantCulture
    ffmpeg -y -v error -ss $InSec.ToString($inv) -t ($OutSec - $InSec).ToString($inv) -i seq_audio.wav -ac 1 -ar 16000 -c:a libmp3lame -b:a 64k range_audio.mp3
    $code = curl.exe -s -m 550 -X POST https://api.elevenlabs.io/v1/speech-to-text -H "xi-api-key: $k" `
        -F model_id=scribe_v1 -F "file=@range_audio.mp3" -F timestamps_granularity=word -F tag_audio_events=false -o transcript.json -w "%{http_code}"
    if ($code -ne '200') { Get-Content transcript.json -Raw; throw "ElevenLabs http $code" }
    node -e @'
const fs=require("fs");const j=JSON.parse(fs.readFileSync("transcript.json","utf8"));
const w=j.words.filter(x=>x.type==="word");let o=j.language_code+" | "+j.text+"\n\n";
w.forEach((x,i)=>o+=i+"\t"+x.start.toFixed(2)+"\t"+x.end.toFixed(2)+"\t"+x.text+"\n");
fs.writeFileSync("words.txt",o,"utf8");console.log(w.length+" words, lang "+j.language_code);
'@
} finally { Pop-Location }
