import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlanet,worldHash} from '../core/world.mjs';
import {sampleTerrain,baseTerrain} from '../core/terrain.mjs';
import {isDry,typeAppearance,forestCover} from '../core/ecology.mjs';
import {directionFace} from '../core/cube.mjs';
import {normalize,cross,localDirection} from '../core/math.mjs';
import {serializePlanet,deserializePlanet} from '../io/bundle.mjs';
let wet;const get=async()=>wet??=await generatePlanet({analysisResolution:24});
test('global river reaches span multiple cube faces and have visible land tributaries',async()=>{
 const w=await get(),rivers=w.hydrology.rivers.filter(r=>r.network&&!r.stream),streams=w.hydrology.rivers.filter(r=>r.stream);
 assert.ok(rivers.length>30);assert.ok(new Set(rivers.map(r=>directionFace(r.points[0].direction)[0])).size>=4);assert.ok(streams.length>5);
 for(const r of streams){assert.ok(r.points[0].widthMeters<30);for(const p of r.points){const s=sampleTerrain(w,p.direction);assert.ok(s.waterDepthMeters>0);assert.ok(baseTerrain(w,p.direction)>w.generationConfig.seaLevel+100);}}
});
test('regional canopy has dense stands and true clearings, shoreline canopy is suppressed',async()=>{
 const w=await get(),d=w.landmarks.find(l=>l.id==='forest').direction,s=sampleTerrain(w,d);assert.ok(s.forest>.5);
 assert.equal(forestCover(w,d,{...s,elevationMeters:w.generationConfig.seaLevel+25}),0);
 assert.equal(forestCover(w,d,{...s,waterDepthMeters:1}),0);
 const samples=Array.from({length:60},(_,i)=>sampleTerrain(w,localDirection(w,(i-30)*.0007,0)).forest);assert.ok(samples.some(x=>x===0));
});
for(const worldType of ['desert','volcanic','mars','moon'])test(`${worldType}: dry geological world has no phantom ocean or forests and roundtrips`,async()=>{
 const w=await generatePlanet({worldType,analysisResolution:16});assert.ok(isDry(w));assert.equal(w.generationReport.waterFraction,0);assert.equal(w.generationReport.treeCount,0);assert.equal(w.hydrology.rivers.length,0);assert.ok(w.generationReport.valid);assert.ok(w.landmarks.length);
 assert.equal((await deserializePlanet(serializePlanet(w))).manifest.worldDataHash,w.manifest.worldDataHash);
 assert.ok([...w.buffers.terrainHeightMeters].every(Number.isFinite));
 if(worldType==='moon'){assert.equal(typeAppearance(worldType).atmosphere,0);const center=baseTerrain(w,w.frame.center),rim=baseTerrain(w,localDirection(w,7500/w.radiusMeters,0));assert.ok(rim>center+150);}
 if(worldType==='volcanic')assert.ok(sampleTerrain(w,w.frame.center).lava>.9);
});
test('alien surface contains purple and turquoise biomes; landmarks are signed data',async()=>{
 const w=await generatePlanet({worldType:'alien',analysisResolution:16});assert.ok(w.buffers.biome.includes(15));assert.ok(w.buffers.biome.includes(16));assert.notEqual(await worldHash({...w,landmarks:[]}),w.manifest.worldDataHash);
});
