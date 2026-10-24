import {analyzeReference} from '../render/reference-analysis.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generatePlanet,GENERATOR_VERSION} from '../core/world.mjs';
import {deserializePlanet,serializePlanet} from '../io/bundle.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {referenceDirection,referenceHeight,REFERENCE} from '../core/landforms.mjs';
import {projectToFace,faceDirection} from '../core/cube.mjs';
import {worldCacheKey} from '../io/world-cache.mjs';
import {boundsOf,uploadAllowance,TERRAIN_BUDGET} from '../render/terrain-budget.mjs';
import {PatchPool} from '../render/patch-pool.mjs';
import {FLIGHT,FlightSimulation} from '../simulation/flight.mjs';
let world;const get=async()=>world??=await generatePlanet({analysisResolution:16,radiusMeters:4e6,terrainModel:'watershed-2'});
test('8000 km diameter is signed separately from generator and legacy world identity',async()=>{
 const w=await get();assert.equal(w.radiusMeters*2,8e6);assert.equal(w.manifest.generatorVersion,GENERATOR_VERSION);assert.equal(w.manifest.radiusMeters,4e6);
 assert.notEqual(worldCacheKey(w.generationConfig),worldCacheKey({...w.generationConfig,radiusMeters:12e6}));assert.notEqual(worldCacheKey(w.generationConfig),worldCacheKey({...w.generationConfig,terrainModel:'legacy-1.6'}));
 const copy=await deserializePlanet(serializePlanet(w));assert.equal(copy.manifest.worldDataHash,w.manifest.worldDataHash);assert.deepEqual(copy.landforms,w.landforms);
 const legacy=await deserializePlanet(await readFile('fixtures/legacy-lumen-v31.planet'));assert.equal(legacy.radiusMeters,12e6);assert.equal(legacy.manifest.generatorVersion,'1.6.0');assert.equal(legacy.generationConfig.terrainModel,undefined);
});
test('reference region has connected relief, a broad plain and a distinct wide canyon',async()=>{
 const w=await get(),height=(x,y)=>sampleTerrain(w,referenceDirection(w,x,y)).elevationMeters;
 assert.equal(REFERENCE.sizeMeters,32000);assert.ok(height(-11000,10000)-height(-6000,-11000)>1800);
 const plain=[];for(let x=-13000;x<=-5000;x+=1000)plain.push(height(x,-11500));assert.ok(Math.max(...plain)-Math.min(...plain)<160,'plain suppresses high-frequency relief');
 const y=-6500,axis=8400+1100*Math.sin(y/3900)+400*Math.sin(y/1450),floor=height(axis,y),rim=height(axis+1500,y);
 assert.ok(rim-floor>650&&rim-floor<1100);assert.ok(Math.abs(height(axis+80,y)-floor)<55,'canyon floor is a width, not a singular spike');
});
test('shared reference drainage has wet beds, monotone levels and exact lake spill connections',async()=>{
 const w=await get(),rivers=w.hydrology.rivers.filter(r=>r.regional),lake=w.hydrology.lakes.find(l=>l.regional);
 assert.equal(lake.waterLevelMeters,lake.spillLevelMeters);assert.equal(lake.closedBasin,false);assert.ok(sampleTerrain(w,lake.direction).elevationMeters<lake.waterLevelMeters-50);
 for(const r of rivers){assert.ok(r.points[0].valleyWidthMeters>r.points[0].widthMeters*8);for(let i=0;i<r.points.length;i++){const p=r.points[i],s=sampleTerrain(w,p.direction);assert.ok(s.elevationMeters<=s.waterSurfaceMeters+.1,`${r.id}/${i} dry`);if(i)assert.ok(p.waterLevelMeters<=r.points[i-1].waterLevelMeters);}}
 assert.equal(rivers.find(r=>r.id===lake.outletId).points[0].waterLevelMeters,lake.waterLevelMeters);
 const outlet=rivers.find(r=>r.id===lake.outletId),recipient=w.hydrology.rivers.find(r=>r.id===outlet.recipientId);assert.equal(outlet.points.at(-1).waterLevelMeters,recipient.points[0].waterLevelMeters);
});

test('a ridge bend has continuous peak height across its nearest-segment bisector',async()=>{
 const w=await get(),h=(x,y)=>referenceHeight(w,referenceDirection(w,x,y),0);
 for(let y=6500;y<=14500;y+=137)for(let x=5000;x<=15500;x+=139){const a=h(x,y);assert.ok(Math.abs(h(x+2,y)-a)<8,`${x}/${y} east cliff`);assert.ok(Math.abs(h(x,y+2)-a)<8,`${x}/${y} north cliff`);}
});
test('same geography survives revisits and serialization independently of camera order',async()=>{
 const w=await get(),points=Array.from({length:100},(_,i)=>referenceDirection(w,-15000+i*300,Math.sin(i)*14000)),a=points.map(d=>sampleTerrain(w,d)),copy=await deserializePlanet(serializePlanet(w));
 for(let i=points.length-1;i>=0;i--)assert.deepEqual(sampleTerrain(copy,points[i]),a[i]);
});
test('ribbons project continuously across a cube-face seam',()=>{
 const d=faceDirection(4,1,.25),a=projectToFace(d,4),b=projectToFace(d,0);assert.ok(a&&b);for(let i=0;i<3;i++)assert.ok(Math.abs(faceDirection(...a)[i]-faceDirection(...b)[i])<1e-12);
});
test('worker backpressure bounds deliveries and resumes without dropping the requested geometry',async()=>{
 const workers=[],pool=new PatchPool(()=>{const w={postMessage(task){this.task=task;},complete(){const task=this.task;delete this.task;this.onmessage({data:{task:task.task,patches:task.patches}});},terminate(){}};workers.push(w);return w;},1),seen=[];
 const done=pool.run(Array.from({length:9},(_,key)=>({key})),'natural',p=>{seen.push(...p);pool.setPaused(true);});workers[0].complete();assert.equal(workers[0].task,undefined);assert.equal(seen.length,3);pool.setPaused(false);workers[0].complete();pool.setPaused(false);workers[0].complete();assert.equal((await done).generated,9);pool.dispose();
});
test('upload cost responds to CPU headroom without modifying visual quality; worker bounds contain every vertex',()=>{
 assert.ok(uploadAllowance(9)<uploadAllowance(4));assert.ok(uploadAllowance(2)<=TERRAIN_BUDGET.maxUploadBytes);const p=Float32Array.of(-4,2,3,8,-10,2,5,7,-12),b=boundsOf(p);for(let i=0;i<p.length;i+=3)assert.ok(Math.hypot(p[i]-b.center[0],p[i+1]-b.center[1],p[i+2]-b.center[2])<=b.radius+1e-9);
});
test('ship size, cruise and boost remain physical metres on the new radius',()=>{assert.equal(FLIGHT.length,110);assert.equal(FLIGHT.cruise,700/3.6);assert.equal(FLIGHT.boost,1800/3.6);});

test('post-detail regional drainage is acyclic and conserves accumulated rainfall at its shared open boundary',async()=>{const a=analyzeReference(await get(),64);assert.equal(a.summary.downhillErrors,0);assert.ok(a.summary.massError<1e-10);assert.equal(a.summary.spacingMeters,500);assert.ok(a.summary.lakes.every(l=>l.level===l.spill&&!l.closed));});
