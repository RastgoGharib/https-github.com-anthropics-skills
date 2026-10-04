const fs=require("fs");
const n=process.argv[2];
const j=JSON.parse(fs.readFileSync("t"+n+".json","utf8"));
const w=j.words.filter(x=>x.type==="word");
const out=[];let cur=null;
for(let i=0;i<w.length;i++){const x=w[i]; if(!cur){cur={s:x.start,t:[],i0:i};out.push(cur)} cur.t.push(x.text); cur.e=x.end; cur.i1=i; if(/[.؟?!]$/.test(x.text)||(i<w.length-1&&w[i+1].start-x.end>1.0)){cur=null}}
out.forEach((p,k)=>console.log(k+" w"+p.i0+"-"+p.i1+" ["+p.s.toFixed(2)+"-"+p.e.toFixed(2)+"] "+p.t.join(" ")));
