// Turns the approved keep list into razor requests and the expected result.
// Usage: node razor_plan.js <keep.json>
// keep.json: { "offsets": { "6552": 0, "6553": 41.3413 },          // timeline start of each placed clip
//              "keep": [ ["6552", 31.80, 37.95, "intro"], ["6553", 30.32, 35.38, "1"] ] }  // source seconds, padding included
// Prints: cut list in DESCENDING order with the requested time (target x 1.001, razor_all_tracks cuts at requested/1.001),
//         the kept timeline ranges, piece count and expected total length.
const fs = require("fs");
const { offsets, keep } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const cuts = new Set(); let total = 0;
const ranges = keep.map(([clip, a, b, label]) => {
  if (!(clip in offsets)) throw new Error("no offset for clip " + clip);
  const s = +(offsets[clip] + a).toFixed(4), e = +(offsets[clip] + b).toFixed(4);
  cuts.add(s); cuts.add(e); total += b - a;
  return { label: label ?? "", clip, s, e };
});
const list = [...cuts].sort((x, y) => y - x).map(t => ({ target: t, request: +(t * 1.001).toFixed(4) }));
console.log("KEEP (timeline, before ripple):");
ranges.forEach(r => console.log(`  ${r.label.padEnd(6)} ${r.clip}  ${r.s.toFixed(3)} - ${r.e.toFixed(3)}`));
console.log(`pieces ${ranges.length}, expected total ~${total.toFixed(3)} s (frame snapping moves it by about a frame)`);
console.log("RAZOR (descending, pass `request` to razor_all_tracks):");
console.log(JSON.stringify(list));
