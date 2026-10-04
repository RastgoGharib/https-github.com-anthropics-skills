// node make_cues.js <jobDir>
// Reads <jobDir>/transcript.json + <jobDir>/plan.json and writes cues.json + cues_preview.txt.
// plan.json: { "rangeEnd": <out-in seconds>, "cues": [[firstWord, lastWord, [keyWordIdx...]], ...],
//              "fix": { "<wordIdx>": "corrected text" } }   (indexes = words.txt)
const fs = require("fs"), path = require("path");
const dir = process.argv[2];
const t = JSON.parse(fs.readFileSync(path.join(dir, "transcript.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
const w = t.words.filter(x => x.type === "word");
const fix = plan.fix || {};
const clean = s => s.replace(/[.،,]+$/u, "");

const cues = plan.cues.map(([a, b, keys]) => {
  const words = [];
  for (let i = a; i <= b; i++) {
    const txt = fix[i] !== undefined ? fix[i] : clean(w[i].text);
    if (txt === "") continue; // "fix": {"12": ""} drops a word
    words.push({ t: txt, key: keys.includes(i), s: w[i].start, e: w[i].end });
  }
  return { s: w[a].start, e: w[b].end, words };
});
// hold each line until the next one (max +0.35 s), min 0.8 s on screen
cues.forEach((c, i) => {
  const next = cues[i + 1] ? cues[i + 1].s : plan.rangeEnd;
  c.e = Math.min(Math.max(c.e + 0.35, c.s + 0.8), next - 0.02);
  c.s = +c.s.toFixed(3); c.e = +c.e.toFixed(3);
});
fs.writeFileSync(path.join(dir, "cues.json"), JSON.stringify(cues, null, 1), "utf8");
let out = "";
cues.forEach((c, i) => out += (i + 1) + "\t" + c.s.toFixed(2) + "-" + c.e.toFixed(2) + "\t" +
  c.words.map(x => x.key ? "[" + x.t + "]" : x.t).join(" ") + "\n");
fs.writeFileSync(path.join(dir, "cues_preview.txt"), out, "utf8");
console.log(cues.length + " cues, last end " + cues[cues.length - 1].e + "  -> cues_preview.txt");
