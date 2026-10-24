import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {noise3JS,fbmJS} from '../core/noise-js.mjs';
import {noise3,fbm} from '../core/math.mjs';
import {initTerrainKernel,loadTerrainKernel,terrainKernelStats} from '../wasm/runtime.mjs';
import {deserializePlanet,serializePlanet} from '../io/bundle.mjs';
import {generatePlanet} from '../core/world.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {faceDirection,directionFace} from '../core/cube.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {buildPatch,selectPatches} from '../render/terrain-data.mjs';
import {postWorkerWorld} from '../io/worker-world.mjs';
const asset=new URL('../assets/wasm/terrain-kernel.wasm',import.meta.url);
let saved;const world=async()=>saved??=await deserializePlanet(await readFile(new URL('../fixtures/lumen-v35.planet',import.meta.url)));
const fingerprint=w=>createHash('sha256').update(new Uint8Array(serializePlanet(w))).digest('hex');

test('checked-in Rust binary matches its source and has bounded independent memory',async()=>{
 const bytes=await readFile(asset),meta=JSON.parse(await readFile(new URL('../assets/wasm/terrain-kernel.json',import.meta.url))),source=await readFile(new URL('../wasm/terrain-kernel/src/lib.rs',import.meta.url));
 const digest=v=>createHash('sha256').update(v).digest('hex');assert.equal(digest(bytes),meta.binarySha256);assert.equal(digest(source),meta.sourceSha256);
 const {kernel:k}=await loadTerrainKernel();assert.equal(k.memory.buffer.byteLength,589824);assert.equal(k.cache_bytes(),458752);
 assert.throws(()=>k.memory.grow(1),RangeError);assert.equal(k.cache_capacity(),8192);assert.equal(k.cache_used(),0);
 assert.deepEqual(WebAssembly.Module.imports(await WebAssembly.compile(bytes)),[]);
});

test('Rust f64 noise matches JS at negative, high, boundary and seeded coordinates exactly',async()=>{
 const {kernel:k}=await loadTerrainKernel();let r=1234567;const rand=()=>{r=(Math.imul(r,1664525)+1013904223)>>>0;return r/4294967296;};
 for(let i=0;i<12000;i++){
  const p=i<4?[[0,0,0],[1,-1,1],[-4294967296.25,4294967296.75,17],[.000001,-.000001,.5]][i]:[rand()*20-10,rand()*20-10,rand()*20-10];
  const seed=(rand()*4294967296)>>>0,f=rand()*10000,oct=i%7;
  assert.equal(k.noise3(...p,seed),noise3JS(...p,seed));const expected=fbmJS(p,f,seed,oct);
  assert.equal(k.fbm(...p,f,seed,oct),expected);assert.equal(k.fbm(...p,f,seed,oct),expected);
 }
 assert.ok(k.cache_hits()>10000);assert.ok(k.cache_used()<=8192);
});

test('fixed Rust cache survives eviction and repeated flight-sized workloads without memory growth',async()=>{
 const {kernel:k}=await loadTerrainKernel(),buffer=k.memory.buffer;
 for(let pass=0;pass<4;pass++)for(let i=0;i<50000;i++)k.fbm(i*.000003,pass*.2,-.35,1200,0xabcdef,3);
 assert.equal(k.memory.buffer,buffer);assert.equal(buffer.byteLength,589824);assert.equal(k.cache_used(),8192);
 k.reset_cache();assert.equal(k.cache_used(),0);assert.equal(k.cache_hits(),0);assert.equal(k.cache_misses(),0);assert.equal(k.memory.buffer,buffer);
});

test('missing, corrupt and timed-out kernels preserve the JavaScript path and cancel reading',async()=>{
 await assert.rejects(loadTerrainKernel({read:async()=>new Uint8Array([1,2,3])}),WebAssembly.CompileError);
 let aborted=false;await assert.rejects(loadTerrainKernel({timeoutMs:5,read:(_url,signal)=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))}),/timeout/);assert.ok(aborted);
 await initTerrainKernel({mode:'js'});const stats=await initTerrainKernel({read:async()=>{throw Error('missing asset');},mode:'auto'});
 assert.equal(stats.mode,'js');assert.match(stats.reason,/missing asset/);assert.equal(fbm([.2,.4,-.7],1200,7,5),fbmJS([.2,.4,-.7],1200,7,5));
 await initTerrainKernel({mode:'js'});
});

test('concurrent initialization activates one kernel and explicit JS choice wins an in-flight load',async()=>{
 await initTerrainKernel({mode:'js'});const a=initTerrainKernel({mode:'auto'}),b=initTerrainKernel({mode:'auto'});assert.equal(a,b);assert.equal((await a).mode,'wasm');
 await initTerrainKernel({mode:'js'});let release;const pending=initTerrainKernel({mode:'auto',read:()=>new Promise(resolve=>{release=resolve;})});
 await initTerrainKernel({mode:'js'});release(new Uint8Array(await readFile(asset)));await pending;assert.equal(terrainKernelStats().mode,'js');
});

test('complete terrain, hydrology, stitched meshes, LOD selection and saved world stay identical', {timeout:120000},async()=>{
 const w=await world(),before=fingerprint(w),points=[];
 for(let face=0;face<6;face++)for(let y=0;y<6;y++)for(let x=0;x<6;x++)points.push(faceDirection(face,-.97+x*.38,-.97+y*.38));
 for(let i=0;i<40;i++)points.push(referenceDirection(w,-15500+(i*971)%31000,-15500+(i*3347)%31000));
 const make=d=>{const [face,u,v]=directionFace(d),level=14,size=2/2**level,x=Math.floor((u+1)/size),y=Math.floor((v+1)/size);return {face,level,x,y,u:x*size-1,v:y*size-1,size,resolution:16,stitch:[13,0,0,0],stitchResolution:[8,16,16,16],key:`parity/${face}/${x}/${y}`};};
 const patches=[w.frame.center,referenceDirection(w,8400,-5000),referenceDirection(w,4000,-6000),...w.hydrology.lakes.slice(0,2).map(l=>l.direction)].map(make);
 await initTerrainKernel({mode:'js'});const samples=points.map(d=>sampleTerrain(w,d)),meshes=patches.map(p=>buildPatch(w,p)),camera=w.frame.center.map(v=>v*1150),lod=selectPatches(w,camera,1,null,{maxLevel:7});
 try{
  assert.equal((await initTerrainKernel({mode:'auto'})).mode,'wasm');
  points.forEach((d,i)=>assert.deepEqual(sampleTerrain(w,d),samples[i]));patches.forEach((p,i)=>assert.deepEqual(buildPatch(w,p),meshes[i]));
  assert.deepEqual(selectPatches(w,camera,1,null,{maxLevel:7}),lod);assert.equal(fingerprint(w),before);
  assert.equal(fbm([.2,.3,.4],2,33,2.5),fbmJS([.2,.3,.4],2,33,2.5));assert.equal(noise3(-2.25,.7,10,777),noise3JS(-2.25,.7,10,777));
 }finally{await initTerrainKernel({mode:'js'});}
});

test('real worker transfer preserves canonical geometry and keeps WASM memory owned by the worker', {timeout:30000},async()=>{
 const w=await world(),worker=new Worker(new URL('./support/kernel-probe.mjs',import.meta.url));
 const receive=()=>new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('message',d=>d.error?reject(Error(d.error)):resolve(d));});
 try{
  await receive();const results=[];
  for(const mode of ['js','auto']){const reply=receive();postWorkerWorld(worker,{world:w,terrainKernel:mode},{shared:true});results.push(await reply);}
  assert.equal(results[0].kernel.mode,'js');assert.equal(results[1].kernel.mode,'wasm');assert.equal(results[1].kernel.memoryBytes,589824);
  assert.deepEqual(results[1].positions,results[0].positions);assert.equal(results[1].hash,results[0].hash);assert.equal(w.buffers.terrainHeightMeters.byteLength>0,true);
 }finally{await worker.terminate();}
});


test('newly generated worlds have identical signed bytes on JS and WASM', {timeout:30000},async()=>{
 const config={seed:'WASM-parity-39',worldType:'desert',analysisResolution:16,regionCount:8,terrainStamps:0};
 await initTerrainKernel({mode:'js'});const a=await generatePlanet(config);
 try{await initTerrainKernel({mode:'auto'});const b=await generatePlanet(config);assert.equal(b.manifest.worldDataHash,a.manifest.worldDataHash);assert.equal(fingerprint(b),fingerprint(a));}
 finally{await initTerrainKernel({mode:'js'});}
});

test('production patch worker cancels a build queued during kernel load, then serves the new request', {timeout:30000},async()=>{
 const w=await world(),worker=new Worker(new URL('./support/patch-worker-node.mjs',import.meta.url));
 const receive=()=>new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('message',d=>d.error?reject(Error(d.error)):resolve(d));});
 try{
  await receive();const first=receive(),size=2/2**14,p={face:4,level:14,x:8200,y:8150,u:8200*size-1,v:8150*size-1,size,resolution:16,key:'cancel-probe'};
  postWorkerWorld(worker,{type:'init',world:w,terrainKernel:'auto',regionalOptions:{mode:'off'},bake:false},{shared:true});
  worker.postMessage({type:'build',task:1,patches:[p],layer:'natural'});worker.postMessage({type:'cancel-build'});
  const cancelled=await first;assert.equal(cancelled.task,1);assert.deepEqual(cancelled.patches,[]);
  const next=receive();worker.postMessage({type:'build',task:2,patches:[p],layer:'natural'});const done=await next;
  assert.equal(done.task,2);assert.equal(done.patches.length,1);assert.equal(done.kernel.mode,'wasm');assert.ok(done.samples.keyBytes<=4*1024*1024);assert.deepEqual(done.patches[0],buildPatch(w,p));
 }finally{await worker.terminate();}
});
