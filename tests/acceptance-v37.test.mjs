import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {deserializePlanet} from '../io/bundle.mjs';
import {REGIONAL_CATALOG} from '../io/regional-catalog.mjs';
import {RegionField} from '../io/regional-field.mjs';
import {RegionalRuntime} from '../io/regional-runtime.mjs';
import {unpackRegionTile} from '../io/regional-format.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {clipWaterTriangle} from '../render/water-clip.mjs';
import {buildPatch} from '../render/terrain-data.mjs';
let cached;const setup=async()=>{if(!cached){const w=await deserializePlanet(await readFile('fixtures/lumen-v35.planet'));cached={w,c:REGIONAL_CATALOG[w.manifest.worldDataHash]};}return cached;};
const load=async(c,key)=>{const t=c.manifest.tiles.find(t=>t.key===key),raw=gunzipSync(await readFile(c.base+t.file));return unpackRegionTile(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),t,c.manifest.grid);};

test('water shoreline intersections meet the terrain bed at the local lake level',()=>{
 const h=[0,10,20],p=clipWaterTriangle([0,1,2],h,[5,5,5],['A','A','A'],'A',5);
 assert.equal(p.length,3);assert.equal(p[0].a,p[0].b);
 for(const v of p.filter(v=>v.a!==v.b))assert.ok(Math.abs(h[v.a]+(h[v.b]-h[v.a])*v.t-5)<1e-12);
 assert.equal(clipWaterTriangle([0,1,2],[9,10,20],[5,5,5],['A','A','A'],'A',5).length,0);
});
test('two lake levels never create an interpolated upward water ramp',()=>{
 const p=clipWaterTriangle([0,1,2],[900,1900,1100],[1000,2000,1000],['A','B',null],'A',1000);
 assert.ok(p.length>=3);assert.ok(!p.some(v=>v.a===1&&v.b===1));
 const q=clipWaterTriangle([0,1,2],[900,1900,1100],[1000,2000,1000],['A','B',null],'B',2000);
 assert.ok(!q.some(v=>v.a===0&&v.b===0));
});
test('clipped water stays level and all uploaded water vertices are referenced',()=>{
 const world={radiusMeters:4000000,generationConfig:{terrainModel:'watershed-2'},hydrology:{rivers:[]}},size=2/2**15;
 const sample=d=>{const elevationMeters=1000+(d[0]*world.radiusMeters-120)*2;return {elevationMeters,waterSurfaceMeters:1000,waterDepthMeters:Math.max(0,1000-elevationMeters),featureId:elevationMeters<1000?'lake-test':null,biome:2,forest:0,snow:0,moisture:.5};};
 const p=buildPatch(world,{face:4,level:15,x:16384,y:16384,u:0,v:0,size,key:'shore',resolution:8},'gray',sample);
 assert.ok(p.waterIndices.length>0);assert.equal(new Set(p.waterIndices).size,p.waterPositions.length/3);
 let coast=0;for(let i=0;i<p.waterPositions.length;i+=3){const pos=[0,1,2].map(k=>p.waterPositions[i+k]+p.center[k]),height=(Math.hypot(...pos)-1000)*4000;assert.ok(height<1000.04);if(Math.abs(height-1000.03)<.003&&Math.abs(pos[0]/1000*4000000-120)<.1)coast++;}
 assert.ok(coast>0,'clipped shore vertices occur at the bed intersection');
});
test('canonical baked sampling is bit-identical without allocating typed-array stencil views',async()=>{
 const {w,c}=await setup(),a=new RegionField(w,c.manifest),b=new RegionField(w,c.manifest);
 const tile=await load(c,'3/3');a.install(tile);let views=0;const original=tile.data.subarray;tile.data.subarray=function(...args){views++;return original.apply(this,args);};
 for(let i=0;i<96;i++){const d=referenceDirection(w,-9900+(i*71%1500),-9900+(i*53%1500));for(const options of [{},{micro:false},{microWeight:.4}])assert.deepEqual(a.sample(d,options),b.sample(d,options));}
 assert.equal(views,0);assert.equal(a.sampleOffsets.length,16);
});
test('a replacement request does not inherit an aborted pending tile load',async()=>{
 const {w,c}=await setup(),r=new RegionalRuntime(w,c,{mode:'procedural',main:false,disk:false}),pending=[],installed=[];
 r.loader={load(t,signal){return new Promise(resolve=>pending.push({t,signal,resolve}));}};r.field.install=t=>installed.push(t);
 const first=new AbortController(),second=new AbortController(),p=r.ensure(['3/3'],{signal:first.signal});first.abort();const q=r.ensure(['3/3'],{signal:second.signal});
 assert.equal(pending.length,2);pending[0].resolve(null);await p;assert.equal(r.pending.size,1);const tile=await load(c,'3/3');pending[1].resolve(tile);await q;assert.equal(installed.length,1);assert.equal(r.pending.size,0);
});
test('same-view prefetch retries a missing package instead of permanently pinning failure',async()=>{
 const {w,c}=await setup(),r=new RegionalRuntime(w,c,{mode:'procedural',main:false,disk:false});let calls=0;r.mode='baked';r.loader={async load(){calls++;return null;}};
 const directions=[referenceDirection(w,-9000,-9000)];r.prefetch(directions,0);await new Promise(resolve=>setTimeout(resolve,0));r.retryAfter=0;r.prefetch(directions,0);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,2);assert.equal(r.stats.prefetchCancelled,0);
});


test('regional Worker waits for tile consumption and ignores stale acknowledgements', {timeout:15000}, async()=>{
 const {Worker}=await import('node:worker_threads'),{w}=await setup();
 const entry=new URL('../workers/regions.mjs',import.meta.url).href;
 const bootstrap=`import {parentPort} from 'node:worker_threads';import {readFile} from 'node:fs/promises';
 globalThis.fetch=async(url,{signal}={})=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(await readFile(url));};
 const queued=[];globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
 parentPort.on('message',data=>self.onmessage?self.onmessage({data}):queued.push(data));
 await import(${JSON.stringify(entry)});for(const data of queued)self.onmessage({data});`;
 const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(bootstrap)),{type:'module'}),messages=[];
 let failure;worker.on('error',e=>failure=e);worker.on('message',m=>messages.push(m));
 const wait=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){if(failure)throw failure;if(Date.now()>deadline)throw Error('Worker protocol timeout');await new Promise(r=>setTimeout(r,10));}};
 const tiles=()=>messages.filter(m=>m.type==='tile');
 try{
  worker.postMessage({type:'init',world:w,disk:false});worker.postMessage({type:'prefetch',keys:['3/3','4/3'],epoch:1});
  await wait(()=>tiles().length===1);await new Promise(r=>setTimeout(r,100));assert.equal(tiles().length,1,'unconsumed first tile blocks the next transfer');
  worker.postMessage({type:'prefetch',keys:['5/3','6/3'],epoch:2});await wait(()=>tiles().length===2);
  worker.postMessage({type:'consumed',epoch:1,key:'3/3'});await new Promise(r=>setTimeout(r,100));assert.equal(tiles().length,2,'old acknowledgement cannot release new delivery');
  worker.postMessage({type:'consumed',epoch:2,key:'5/3'});await wait(()=>tiles().length===3);
  assert.equal(tiles()[2].tile.x,6);assert.ok(tiles().every(m=>m.stats.deliveryBytes<=2*1024*1024));
  worker.postMessage({type:'consumed',epoch:2,key:'6/3'});await wait(()=>messages.some(m=>m.type==='done'&&m.epoch===2));
 }finally{await worker.terminate();}
});
