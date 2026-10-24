import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_CONFIG} from '../core/world.mjs';
import {deserializePlanet,serializePlanet} from '../io/bundle.mjs';
import {worldCacheKey} from '../io/world-cache.mjs';
let worlds;const get=async()=>worlds??=await Promise.all(['lumen-v33','lumen-v32','legacy-lumen-v31'].map(async name=>deserializePlanet(await readFile(`fixtures/${name}.planet`))));

test('saved classic world retains 12000 km diameter without the regional override',async()=>{
 const [current,,legacy]=await get();
 assert.equal(current.radiusMeters,6_000_000);assert.equal(current.manifest.radiusMeters,6_000_000);
 assert.equal(current.landforms,undefined);assert.ok(!current.landmarks.some(p=>p.id.startsWith('reference')));
 assert.ok(!current.hydrology.rivers.some(r=>r.regional));assert.ok(!current.hydrology.lakes.some(l=>l.regional));
 for(const [key,value]of Object.entries(legacy.generationConfig))if(key!=='radiusMeters')assert.deepEqual(current.generationConfig[key],value,key);
 assert.equal(current.hydrology.lakes[0].radiusMeters,legacy.hydrology.lakes[0].radiusMeters);
 assert.equal(current.straits[0].minimumWidthMeters,legacy.straits[0].minimumWidthMeters);
});

test('V33 export preserves its identity while V31/V32 saves retain their original radius and terrain',async()=>{
 const [current,previous,legacy]=await get(),copy=await deserializePlanet(serializePlanet(current));
 assert.equal(copy.radiusMeters,6_000_000);assert.equal(copy.manifest.worldDataHash,current.manifest.worldDataHash);
 assert.equal(previous.radiusMeters,4_000_000);assert.equal(previous.generationConfig.terrainModel,'watershed-2');assert.ok(previous.landforms);
 assert.equal(legacy.radiusMeters,12_000_000);assert.equal(legacy.manifest.generatorVersion,'1.6.0');
 assert.equal(new Set([current,previous,legacy].map(w=>w.manifest.worldDataHash)).size,3);
 assert.equal(new Set([current,previous,legacy].map(w=>worldCacheKey(w.generationConfig))).size,3);
});

test('V34 default follows the latest 8000 km diameter / connected landforms request',()=>{assert.equal(DEFAULT_CONFIG.radiusMeters*2,8_000_000);assert.equal(DEFAULT_CONFIG.terrainModel,'watershed-2');});
