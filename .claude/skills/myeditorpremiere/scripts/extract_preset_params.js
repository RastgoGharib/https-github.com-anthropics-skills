// Reads the Sound 2 chain out of Premiere's preset file (stereo variant) to refresh sound2.json when the preset changes.
// Usage: node extract_preset_params.js "<path to Effect Presets and Custom Items.prfpset>" out.json
// The ObjectIDs 1577 / 1433 / 1112 are the Dynamics / Parametric EQ / Multiband blocks of the stereo "Sound 2" in the
// 2026-09 file; if the preset is re-saved they change - search the file for the preset name and re-read the three IDs.
const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
function blockById(id) {
  const k = 'ObjectID="' + id + '"'; const i = s.indexOf(k); if (i < 0) return null;
  const st = s.lastIndexOf("<", i); const tag = s.slice(st + 1, s.indexOf(" ", st));
  const en = s.indexOf("</" + tag + ">", i); return { tag, txt: s.slice(st, en + tag.length + 3) };
}
function params(fp) {
  const c = (blockById(fp).txt.match(/<Component ObjectRef="(\d+)"/) || [])[1];
  const refs = [...blockById(c).txt.matchAll(/<Param Index="(\d+)" ObjectRef="(\d+)"/g)].map(m => [+m[1], +m[2]]);
  return refs.map(([i, r]) => {
    const pb = blockById(r).txt;
    const nm = (pb.match(/<Name>(.*?)<\/Name>/) || [])[1] || "";
    const cv = (pb.match(/<CurrentValue>(.*?)<\/CurrentValue>/) || [])[1];
    const sk = (pb.match(/<StartKeyframe>(.*?)<\/StartKeyframe>/) || [])[1];
    return { i, nm, v: cv !== undefined ? cv : sk ? sk.split(",")[1] : undefined };
  });
}
const out = { dynamics: params(1577), eq: params(1433), multiband: params(1112) };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const k in out) console.log(k, out[k].length, "params");
