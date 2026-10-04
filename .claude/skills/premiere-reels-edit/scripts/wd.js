const fs=require("fs");
const [n,a,b]=[process.argv[2],+process.argv[3],+process.argv[4]];
const j=JSON.parse(fs.readFileSync("t"+n+".json","utf8"));
const w=j.words.filter(x=>x.type==="word");
console.log(w.slice(a,b+1).map((x,i)=>(a+i)+":"+x.text+"("+x.start.toFixed(2)+"-"+x.end.toFixed(2)+")").join("  "));
