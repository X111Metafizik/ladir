import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {deserializePlanet} from '../io/bundle.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {faceDirection,directionFace} from '../core/cube.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {buildPatch,selectPatches} from '../render/terrain-data.mjs';
import {initTerrainKernel,loadTerrainKernel,terrainKernelStats} from '../wasm/runtime.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {fbmJS} from '../core/noise-js.mjs';
const out=process.env.BENCH_OUT||'evidence/v39';await mkdir(out,{recursive:true});
const world=await deserializePlanet(await readFile('fixtures/lumen-v35.planet'));
const points=Array.from({length:1200},(_,i)=>i<600?faceDirection(i%6,-.95+(i*37%190)/100,-.95+(i*73%190)/100):referenceDirection(world,-15500+(i*971)%31000,-15500+(i*3347)%31000));
const patches=points.filter((_,i)=>i%100===0).map((d,i)=>{const [face,u,v]=directionFace(d),level=13+i%5,size=2/2**level,x=Math.floor((u+1)/size),y=Math.floor((v+1)/size);return {face,level,x,y,u:x*size-1,v:y*size-1,size,resolution:32,key:'bench/'+i};});
function legacyCache(sample,limit=80000){
 const cache=new Map();let hits=0,misses=0;
 const get=(d,options)=>{const key=Math.round(d[0]*4398046511104)+'/'+Math.round(d[1]*4398046511104)+'/'+Math.round(d[2]*4398046511104)+'/'+(options?.micro!==false)+'/'+(options?.microWeight??1);let s=cache.get(key);if(s){hits++;return s;}misses++;s=sample(d,options);cache.set(key,s);if(cache.size>limit){const keys=cache.keys();for(let i=0;i<2048;i++)cache.delete(keys.next().value);}return s;};
 get.stats=()=>({hits,misses,size:cache.size});return get;
}
const q=(a,p)=>a.toSorted((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];
const stats=a=>({n:a.length,median:q(a,.5),p95:q(a,.95),max:q(a,1)});
const report={date:new Date().toISOString(),node:process.version,worldHash:world.manifest.worldDataHash,quality:'Same 32-cell patches, globe and reference-basin coordinates. No quality overrides.',scope:'CPU kernel and generation benchmark; not FPS, GPU time or total browser RAM.',rounds:[],noise:{}};
await initTerrainKernel({mode:'js'});const reference=points.map(d=>sampleTerrain(world,d));
for(let round=-1;round<6;round++)for(const mode of round%2?['auto','js','jsLegacy']:['jsLegacy','js','auto']){
 const init=await initTerrainKernel({mode:mode==='auto'?'auto':'js'});if(mode==='auto')assert.equal(init.mode,'wasm');
 const sample=(mode==='jsLegacy'?legacyCache:createSampleCache)((d,o)=>sampleTerrain(world,d,o),80000);
 const sampleStart=performance.now();let checksum=0;
 for(let i=0;i<points.length;i++){const s=sample(points[i]);assert.deepEqual(s,reference[i]);checksum+=s.elevationMeters;}
 const samplingMs=performance.now()-sampleStart,patchMs=[],buffers=[];
 for(const p of patches){const t=performance.now(),mesh=buildPatch(world,p,'natural',sample);patchMs.push(performance.now()-t);buffers.push(mesh.positions.byteLength);}
 const start=performance.now(),lod=selectPatches(world,world.frame.center.map(v=>v*1150),1,null,{maxLevel:9}),planningMs=performance.now()-start;
 if(round>=0)report.rounds.push({round,mode:mode==='auto'?'wasm':mode,samplingMs,checksum,patchMs,patch:stats(patchMs),planningMs,leaves:lod.length,outputPositionBytes:buffers.reduce((a,b)=>a+b,0),sampleCache:sample.stats(),kernel:terrainKernelStats()});
}
const {kernel:k}=await loadTerrainKernel(),calls=60000;
for(const [name,fn] of [['js',(p,f,s,o)=>fbmJS(p,f,s,o)],['wasmUncached',(p,f,s,o)=>k.fbm_uncached(...p,f,s,o)],['wasmCached',(p,f,s,o)=>k.fbm(...p,f,s,o)]]){
 const timings=[];let checksum;
 for(let round=-1;round<6;round++){k.reset_cache();const start=performance.now();checksum=0;for(let i=0;i<calls;i++){const p=points[i%points.length];checksum+=fn(p,1200,12345,5);}if(round>=0)timings.push(performance.now()-start);}
 report.noise[name]={calls,checksum,milliseconds:stats(timings),samples:timings};
}
assert.equal(report.noise.js.checksum,report.noise.wasmUncached.checksum);assert.equal(report.noise.js.checksum,report.noise.wasmCached.checksum);
report.summary=Object.fromEntries(['jsLegacy','js','wasm'].map(mode=>{const r=report.rounds.filter(r=>r.mode===mode);return [mode,{samplingMs:stats(r.map(r=>r.samplingMs)),patchMs:stats(r.flatMap(r=>r.patchMs)),planningMs:stats(r.map(r=>r.planningMs))}];}));
report.memory={wasmLinearBytes:k.memory.buffer.byteLength,wasmCacheBytes:k.cache_bytes(),cacheCapacity:k.cache_capacity(),ownership:'One fixed arena per worker/realm; mesh ArrayBuffers still transfer ownership. No WASM memory is transferred or freed per tile.'};
await writeFile(out+'/wasm-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,noise:report.noise,memory:report.memory},null,2));
