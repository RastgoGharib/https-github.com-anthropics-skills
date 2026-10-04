const fs=require("fs");
const pieces=JSON.parse(fs.readFileSync("mapped.json","utf8"));
const cues=[];
for(const ws of pieces){
  let cur=[];
  const flush=()=>{ if(cur.length){cues.push({s:cur[0].s,e:cur[cur.length-1].e,t:cur.map(w=>w.t).join(" ")});cur=[];} };
  for(const w of ws){
    cur.push(w);
    const endsPunct=/[،,.؟?!]$/.test(w.t);
    if(cur.length>=6 || (endsPunct && cur.length>=3)) flush();
  }
  flush();
}
// timing polish: extend end up to 0.25s toward next cue, min 0.9s
for(let i=0;i<cues.length;i++){
  const nxt=cues[i+1]; const maxEnd=nxt?nxt.s-0.03:cues[i].e+0.4;
  cues[i].e=Math.min(cues[i].e+0.25,maxEnd);
  if(cues[i].e-cues[i].s<0.9) cues[i].e=Math.min(cues[i].s+0.9,maxEnd);
  cues[i].t=cues[i].t.replace(/[،,]+$/,"").replace(/\.$/,"");
}
const f=x=>{const ms=Math.round(x*1000);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),r=ms%1000;const p=(n,l=2)=>String(n).padStart(l,"0");return p(h)+":"+p(m)+":"+p(s)+","+p(r,3)};
const srt=cues.map((c,i)=>(i+1)+"\n"+f(c.s)+" --> "+f(c.e)+"\n"+c.t+"\n").join("\n");
fs.writeFileSync("subtitles_ckb.srt","\uFEFF"+srt,"utf8");
console.log(cues.length+" cues, last end "+cues[cues.length-1].e.toFixed(2));
console.log(srt.split("\n\n").slice(0,6).join("\n\n"));
