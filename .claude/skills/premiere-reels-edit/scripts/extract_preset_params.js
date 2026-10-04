const fs=require("fs");
const s=fs.readFileSync("Effect Presets and Custom Items.prfpset","utf8");
function blockById(id){ const k='ObjectID="'+id+'"'; const i=s.indexOf(k); if(i<0) return null; const st=s.lastIndexOf('<',i); const tag=s.slice(st+1,s.indexOf(' ',st)); const en=s.indexOf('</'+tag+'>',i); return {tag,txt:s.slice(st,en+tag.length+3)}; }
function params(fp){ const b=blockById(fp); const c=(b.txt.match(/<Component ObjectRef="(\d+)"/)||[])[1]; const cb=blockById(c);
 const refs=[...cb.txt.matchAll(/<Param Index="(\d+)" ObjectRef="(\d+)"/g)].map(m=>[+m[1],+m[2]]);
 return refs.map(([i,r])=>{ const pb=blockById(r).txt; const nm=(pb.match(/<Name>(.*?)<\/Name>/)||[])[1]||""; let v=(pb.match(/<CurrentValue>(.*?)<\/CurrentValue>/)||[])[1]; const sk=(pb.match(/<StartKeyframe>(.*?)<\/StartKeyframe>/)||[])[1]; const tv=(pb.match(/<IsTimeVarying>(.*?)</)||[])[1]; const nk=(pb.match(/<Keyframes>([\s\S]*?)<\/Keyframes>/)||[])[1]; let sv=sk?sk.split(",")[1]:undefined; return {i,nm,cv:v,sv,tv,hasKF:!!(nk&&nk.trim())}; }); }
const out={dyn:params(1577),eq:params(1433),mb:params(1112)};
fs.writeFileSync(process.argv[2],JSON.stringify(out));
for(const k in out){ console.log("==",k,out[k].length); console.log(out[k].map(p=>p.i+"|"+p.nm+"|"+(p.cv!==undefined?p.cv:"sk="+p.sv)+(p.hasKF?"|KF":"")).join("\n")); }
