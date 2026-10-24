import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PerformanceObserver} from 'node:perf_hooks';
import {writeFile,mkdir} from 'node:fs/promises';
import {createSampleCache} from '../render/stream-plan.mjs';
const mode=process.argv[2];
if(!mode){
 const results={scope:'Isolated Node cache workload, synthetic immutable samples, 500000 queries, 80000-slot limit. Includes retained JS heap and ArrayBuffers separately; not browser/whole-app RAM or GC.',cases:{}};
 for(const name of ['legacy','numeric']){const run=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),name],{encoding:'utf8',windowsHide:true});if(run.status!==0)throw Error(run.stderr||run.stdout);results.cases[name]=JSON.parse(run.stdout);}
 assert.equal(results.cases.legacy.checksum,results.cases.numeric.checksum);assert.ok(results.cases.numeric.cache.size>68000);
 await mkdir('evidence/v39',{recursive:true});await writeFile('evidence/v39/sample-cache-memory.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}else{
 if(!globalThis.gc)throw Error('Run with --expose-gc');
 function legacy(sample,limit){const cache=new Map();let hits=0,misses=0;const get=(d,o)=>{const key=Math.round(d[0]*4398046511104)+'/'+Math.round(d[1]*4398046511104)+'/'+Math.round(d[2]*4398046511104)+'/'+(o?.micro!==false)+'/'+(o?.microWeight??1);let s=cache.get(key);if(s){hits++;return s;}misses++;s=sample(d,o);cache.set(key,s);if(cache.size>limit){const keys=cache.keys();for(let i=0;i<2048;i++)cache.delete(keys.next().value);}return s;};get.stats=()=>({hits,misses,size:cache.size});return get;}
 const events=[],observer=new PerformanceObserver(list=>events.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration}))));observer.observe({entryTypes:['gc']});
 globalThis.gc();await new Promise(r=>setImmediate(r));const before=process.memoryUsage(),start=performance.now();
 const sample=d=>({elevationMeters:d[0]*3000,waterSurfaceMeters:0,waterDepthMeters:0,temperature:20,moisture:.5,biome:2,protectedFeatureMask:0,featureId:null,flow:null,lava:0,albedo:1,snow:0,snowLineMeters:2500,forest:.2});
 const cache=(mode==='legacy'?legacy:createSampleCache)(sample,80000);globalThis.__retainedCache=cache;
 let checksum=0;for(let i=0;i<500000;i++){const x=(i%100000)/100000;checksum+=cache([x,.2,.8]).elevationMeters;}
 const end=performance.now();await new Promise(r=>setImmediate(r));globalThis.gc();await new Promise(r=>setImmediate(r));const after=process.memoryUsage(),gc=events.filter(e=>e.start>=start&&e.start<end);observer.disconnect();
 console.log(JSON.stringify({mode,queries:500000,ms:end-start,checksum,cache:cache.stats(),retainedHeapBytes:after.heapUsed-before.heapUsed,retainedArrayBufferBytes:after.arrayBuffers-before.arrayBuffers,gcDuringWork:{count:gc.length,totalMs:gc.reduce((n,e)=>n+e.ms,0),maxMs:Math.max(0,...gc.map(e=>e.ms))}}));
}
