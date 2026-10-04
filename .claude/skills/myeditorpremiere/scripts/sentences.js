// Sentence/take list from a transcript: one line per sentence (ends at . ؟ ? ! or a pause > --gap s).
// Usage: node sentences.js <tNAME.json> [--gap 1.0]
// Output: index, word range (for words.js), [start-end] in source seconds, text.
const fs = require("fs");
const file = process.argv[2];
const gi = process.argv.indexOf("--gap");
const gap = gi > 0 ? +process.argv[gi + 1] : 1.0;
const w = JSON.parse(fs.readFileSync(file, "utf8")).words.filter(x => x.type === "word");
const out = []; let cur = null;
w.forEach((x, i) => {
  if (!cur) { cur = { s: x.start, t: [], i0: i }; out.push(cur); }
  cur.t.push(x.text); cur.e = x.end; cur.i1 = i;
  if (/[.؟?!]$/.test(x.text) || (i < w.length - 1 && w[i + 1].start - x.end > gap)) cur = null;
});
out.forEach((p, k) => console.log(`${k} w${p.i0}-${p.i1} [${p.s.toFixed(2)}-${p.e.toFixed(2)}] ${p.t.join(" ")}`));
