// Word-level times for a range of word indices (to place a cut exactly at a word boundary).
// Usage: node words.js <tNAME.json> <firstIndex> <lastIndex>
const fs = require("fs");
const [file, a, b] = [process.argv[2], +process.argv[3], +process.argv[4]];
const w = JSON.parse(fs.readFileSync(file, "utf8")).words.filter(x => x.type === "word");
console.log(w.slice(a, b + 1).map((x, i) => `${a + i}:${x.text}(${x.start.toFixed(2)}-${x.end.toFixed(2)})`).join("  "));
