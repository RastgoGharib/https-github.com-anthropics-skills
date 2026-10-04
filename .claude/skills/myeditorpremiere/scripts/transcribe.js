// ElevenLabs Scribe transcription with word timestamps (Kurdish Sorani and any other language).
// Usage: node transcribe.js <video> [--lang ckb|en|ar|...] [--start S] [--dur D] [--out DIR] [--model scribe_v1]
// Writes <out>/t<name>.json (ElevenLabs response: .words[] with text/start/end/type, .language_code).
// Word times are in seconds of the SOURCE FILE (the --start offset is added back).
// The key comes from ELEVENLABS_API_KEY (process env, else the Windows user-level variable). It is never printed.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const video = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!video) { console.error("usage: node transcribe.js <video> [--lang ckb] [--start S] [--dur D] [--out DIR]"); process.exit(1); }

let key = process.env.ELEVENLABS_API_KEY;
if (!key && process.platform === "win32") {
  try {
    key = execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "[Environment]::GetEnvironmentVariable('ELEVENLABS_API_KEY','User')"], { encoding: "utf8" }).trim();
  } catch { /* handled below */ }
}
if (!key) { console.error("ELEVENLABS_API_KEY is not set (process env or Windows user env)."); process.exit(2); }

const name = path.basename(video, path.extname(video));
const out = opt("out", process.cwd());
const start = +opt("start", 0);
const dur = opt("dur");
const lang = opt("lang");            // omit = auto-detect (Sorani is detected as ckb, ~0.97)
const model = opt("model", "scribe_v1");
fs.mkdirSync(out, { recursive: true });

const mp3 = path.join(out, `a_${name}.mp3`);
const ff = ["-y", "-v", "error"];
if (start) ff.push("-ss", String(start));
if (dur) ff.push("-t", String(dur));
ff.push("-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", mp3);
execFileSync("ffmpeg", ff, { stdio: "inherit" });

(async () => {
  const form = new FormData();
  form.append("model_id", model);
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  if (lang) form.append("language_code", lang);
  form.append("file", new Blob([fs.readFileSync(mp3)], { type: "audio/mpeg" }), path.basename(mp3));
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
  const body = await res.text();
  if (!res.ok) { console.error(`ElevenLabs HTTP ${res.status}: ${body.slice(0, 300)}`); process.exit(3); }
  const j = JSON.parse(body);
  if (start) for (const w of j.words || []) { w.start += start; w.end += start; }
  const file = path.join(out, `t${name}.json`);
  fs.writeFileSync(file, JSON.stringify(j));
  fs.unlinkSync(mp3);
  const words = (j.words || []).filter(w => w.type === "word");
  console.log(`${name}: ${words.length} words, language ${j.language_code} (${(+j.language_probability || 0).toFixed(2)}) -> ${file}`);
})();
