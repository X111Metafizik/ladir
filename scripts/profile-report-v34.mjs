import {readFile,writeFile} from 'node:fs/promises';
import {SourceMap} from 'node:module';
const results=[];
for(const variant of ['before','after']){
 const map=new SourceMap(JSON.parse(await readFile(variant==='before'?'evidence/v34/baseline-dist/studio/main.mjs.map':'dist/studio/main.mjs.map','utf8')));
 for(const scene of ['forest','lake','canyon'])for(const phase of ['load','steady']){
  const path=`evidence/v34/probe-${variant}/${scene}${phase==='load'?'-load':''}-cpu.json`,profile=JSON.parse(await readFile(path,'utf8')),byId=new Map(profile.nodes.map(n=>[n.id,n])),weights=new Map();
  for(let i=0;i<(profile.samples?.length??0);i++){const id=profile.samples[i];weights.set(id,(weights.get(id)??0)+(profile.timeDeltas[i]??0)/1000);}
  const rows=[...weights].map(([id,milliseconds])=>{const f=byId.get(id).callFrame,entry=f.url.includes('/studio/main.mjs')?map.findEntry(f.lineNumber,f.columnNumber):null;return {milliseconds,function:entry?.name||f.functionName,file:entry?.originalSource||f.url,line:(entry?.originalLine??f.lineNumber)+1};}).sort((a,b)=>b.milliseconds-a.milliseconds);
  results.push({variant,scene,phase,sampledMilliseconds:[...weights.values()].reduce((a,b)=>a+b,0),top:rows.slice(0,22),application:rows.filter(r=>/\/(render|core|simulation|studio)\//.test(r.file)).slice(0,18)});
 }
}
await writeFile('evidence/v34/profiles.json',JSON.stringify(results,null,2));
for(const r of results)console.log(JSON.stringify({variant:r.variant,scene:r.scene,phase:r.phase,top:r.top.slice(0,5),application:r.application.slice(0,5)}));
