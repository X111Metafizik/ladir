import {readFile,writeFile} from 'node:fs/promises';
const root='',file=process.argv[2]??'evidence/v31/benchmark/cpu.json';
const profile=JSON.parse(await readFile(root+file)),map=JSON.parse(await readFile(root+'dist/studio/main.mjs.map'));
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',lines=[];let source=0,line=0,column=0,name=0;
for(const row of map.mappings.split(';')){let col=0;const segments=[];for(const raw of row.split(',')){if(!raw)continue;const v=[];let n=0,shift=0;for(const c of raw){const d=chars.indexOf(c);n|=(d&31)<<shift;if(d&32)shift+=5;else{v.push(n&1?-(n>>1):n>>1);n=shift=0;}}col+=v[0];if(v.length>=4){source+=v[1];line+=v[2];column+=v[3];if(v.length===5)name+=v[4];segments.push({col,source,line,column,name:v.length===5?name:null});}}lines.push(segments);}
const sourceLines=map.sourcesContent.map(s=>s.split('\n'));
const mapped=n=>{const f=n.callFrame,segs=lines[f.lineNumber]??[],seg=segs.findLast(s=>s.col<=f.columnNumber);return {id:n.id,hits:n.hitCount??0,name:f.functionName,source:seg?map.sources[seg.source]:f.url,line:seg?seg.line+1:f.lineNumber+1,column:seg?.column,text:seg?sourceLines[seg.source][seg.line]?.trim():null};};
const nodes=profile.nodes.filter(n=>n.hitCount).map(mapped),total=nodes.reduce((s,n)=>s+n.hits,0);nodes.sort((a,b)=>b.hits-a.hits);
const result={total,top:nodes.slice(0,45)};await writeFile(root+file.replace('.json','-attributed.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result.top.slice(0,18),null,2));
