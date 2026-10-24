import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deserializePlanet} from '../io/bundle.mjs';
import {buildPatch} from '../render/terrain-data.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {stampBand,stampDiagnostics,setStampMemo} from '../core/terrain-stamps.mjs';
import {coarseBakePatch,packTerrainPatch,unpackTerrainPatch,terrainBakeKey,bakeChecksum,BAKE_FIELDS} from '../io/terrain-bake-codec.mjs';
import {BAKED_WORLDS} from '../io/baked-worlds.mjs';
import {TerrainBakeCache,persistentBakeEligible} from '../io/terrain-bake-cache.mjs';
import {sha256} from '../core/math.mjs';
import {BakeMembership} from '../io/bake-membership.mjs';
import {STARTUP_BAKES} from '../io/startup-bakes.mjs';
import {selectPatches} from '../render/terrain-data.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {initRegional} from '../io/regional-runtime.mjs';
test('a late IndexedDB open remains usable after the foreground wait budget expires',async()=>{
 const w=await world();let request,closed=false;const db={close(){closed=true;},transaction(){throw Error('skip test index');}};
 const cache=new TerrainBakeCache(w,{staticPacks:false,openTimeoutMs:5,indexedDB:{open(){request={};return request;}}});
 try{assert.equal(await cache.database(),null);assert.equal(cache.disabled,false);request.result=db;request.onsuccess();assert.equal(await cache.database(),db);assert.equal(closed,false);assert.equal(cache.stats.bakeOpenTimeouts,1);db.onversionchange();assert.equal(closed,true);assert.equal(await cache.database(),null);}finally{cache.channel?.close();}
});
test('cached LOD planning returns exactly the same geometry inputs and reuses samples',async()=>{
 const w=await world(),sample=createSampleCache((d,o)=>sampleTerrain(w,d,o),80000),camera=w.frame.center.map(x=>x*1005);
 const expected=selectPatches(w,camera,1,null,{maxLevel:12}),actual=selectPatches(w,camera,1,null,{maxLevel:12,sample});assert.deepEqual(actual,expected);
 const misses=sample.stats().misses;assert.deepEqual(selectPatches(w,camera,1,null,{maxLevel:12,sample}),expected);assert.equal(sample.stats().misses,misses);assert.ok(sample.stats().hits>0);
});
test('compressed startup meshes match the canonical regional surface and reject other identities',async()=>{
 const w=await world(),region=initRegional(w,{mode:'procedural'}),profile=region.catalog.manifest.id,descriptor=STARTUP_BAKES[w.manifest.worldDataHash][profile],catalog=JSON.parse(await readFile('assets/terrain-bakes/'+w.manifest.worldDataHash+'/'+descriptor.index.file)),fetchFn=async url=>new Response(await readFile(url));
 const cache=new TerrainBakeCache(w,{indexedDB:null,profile,fetchFn});
 try{assert.ok(cache.catalog);for(const info of [catalog.packs[0],catalog.packs.at(-1)]){const id=Object.keys(info.entries)[0],p={...JSON.parse(id.slice(id.indexOf('/{')+1,id.lastIndexOf('/profile/'))),key:'test'};const [loaded]=await cache.read([p],'natural');assert.ok(loaded);const fresh=buildPatch(w,p,'natural');for(const field of Object.keys(BAKE_FIELDS))assert.deepEqual(loaded[field],fresh[field],field);}
  assert.ok(cache.packBytes<=4*1024*1024);assert.equal(new TerrainBakeCache(w,{indexedDB:null,profile:profile+'-old'}).catalog,null);assert.equal(new TerrainBakeCache({...w,radiusMeters:6000000},{indexedDB:null,profile}).catalog,null);
  const broken=new TerrainBakeCache(w,{indexedDB:null,profile,fetchFn:async()=>new Response(new Uint8Array(8))}),p=coarseBakePatch(0,0,0);assert.equal(await broken.staticRead(p,'natural'),null);assert.ok(broken.stats.bakeErrors>0);
 }finally{region.dispose();}
});
test('bounded bake membership has no false negatives for recorded keys',()=>{
 const index=new BakeMembership();for(let i=0;i<12000;i++)index.add('world/grid/stitch/'+i);
 for(let i=0;i<12000;i++)assert.ok(index.has('world/grid/stitch/'+i));
 let falsePositive=0;for(let i=12000;i<24000;i++)falsePositive+=Number(index.has('world/grid/stitch/'+i));assert.ok(falsePositive<120);assert.equal(index.bits.byteLength,65536);
});
let saved;const world=async()=>saved??=await deserializePlanet(await readFile(new URL('../fixtures/lumen-v35.planet',import.meta.url)));
test('signed V34 world preserves the exact original surface at 384 global coordinates',async()=>{
 const old=await deserializePlanet(await readFile(new URL('../fixtures/lumen-v34.planet',import.meta.url))),record=JSON.parse(await readFile(new URL('../fixtures/regressions/v34-surface.json',import.meta.url)));
 assert.equal(old.manifest.worldDataHash,record.worldHash);
 for(const s of record.samples){assert.equal(sampleTerrain(old,s.d).elevationMeters,s.height);for(let i=0;i<3;i++)assert.equal(stampBand(old,s.d,i).value,s.bands[i]);}
});
test('new physical stamp bands cover all faces at unchanged metre scales',async()=>{
 const w=await world();assert.deepEqual(stampDiagnostics(w).bands.map(b=>b.spacingMeters),[220000,22000,700]);
 const range=[[],[],[]];
 for(let i=0;i<600;i++){const y=1-2*(i+.5)/600,a=i*2.3999632297,d=[Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)];
  for(let j=0;j<3;j++){const sample=stampBand(w,d,j);assert.ok(sample.weight>.001);assert.ok(Number.isFinite(sample.value));range[j].push(sample.value);}
 }
 for(const values of range)assert.ok(Math.max(...values)-Math.min(...values)>.2);
 const stats=stampDiagnostics(w);assert.ok(stats.bands.reduce((n,b)=>n+b.memoBytes,0)<1024*1024);
});
test('stamp memo never changes height and avoids repeated field reconstruction',async()=>{
 const w=await world(),d=w.frame.center;
 setStampMemo(w,false);const expected=[0,1,2].map(i=>stampBand(w,d,i));
 setStampMemo(w,true);for(let n=0;n<20;n++)for(let i=0;i<3;i++)assert.deepEqual(stampBand(w,d,i),expected[i]);
 assert.ok(stampDiagnostics(w).bands.every(b=>b.hits>=19));
});
test('baked patches preserve every geometry, water, normal and material byte',async()=>{
 const w=await world();
 for(const face of [0,2,4]){const p=coarseBakePatch(face,4,3),source=buildPatch(w,p),buffer=packTerrainPatch(source),result=unpackTerrainPatch(buffer,{...p,priority:42});
  for(const key of Object.keys(BAKE_FIELDS)){assert.deepEqual(result[key],source[key]);assert.notEqual(result[key].buffer,buffer);}
  assert.equal(result.patch.priority,42);assert.deepEqual(result.bounds,source.bounds);assert.deepEqual(result.waterBounds,source.waterBounds);
  assert.throws(()=>unpackTerrainPatch(buffer.slice(0,buffer.byteLength-8),p));const corrupt=buffer.slice(0);new Uint8Array(corrupt)[corrupt.byteLength-1]^=1;assert.notEqual(bakeChecksum(corrupt),bakeChecksum(buffer));
 }
});
test('terrain bake keys reject stale worlds, layers, resolutions, seams and boundary knots',async()=>{
 const w=await world(),p=coarseBakePatch(0,0,0),key=terrainBakeKey(w,p);
 assert.equal(terrainBakeKey(w,{...p,priority:42,key:'cosmetic name'}),key);
 for(const q of [{...p,resolution:16},{...p,stitch:[2,0,0,0]},{...p,stitchResolution:[4,8,8,8]},{...p,boundaryBands:{'0,0':4}},{...p,x:1}])assert.notEqual(terrainBakeKey(w,q),key);
 assert.notEqual(terrainBakeKey(w,p,'gray'),key);assert.notEqual(terrainBakeKey({...w,radiusMeters:6000000},p),key);assert.notEqual(terrainBakeKey({...w,manifest:{worldDataHash:'different'}},p),key);
});
test('offline bake covers all six faces with signed exact base meshes',async()=>{
 const w=await world(),catalog=BAKED_WORLDS[w.manifest.worldDataHash];assert.equal(catalog.faces.length,6);let count=0;
 for(let face=0;face<6;face++){const info=catalog.faces[face],bytes=await readFile(new URL('../assets/terrain-bakes/'+w.manifest.worldDataHash+'/'+info.file,import.meta.url));assert.equal(await sha256(bytes),info.sha256);assert.equal(Object.keys(info.entries).length,64);count+=Object.keys(info.entries).length;
  const p=coarseBakePatch(face,2,3),[offset,length]=info.entries[terrainBakeKey(w,p)],buffer=bytes.buffer.slice(bytes.byteOffset+offset,bytes.byteOffset+offset+length),baked=unpackTerrainPatch(buffer,p),fresh=buildPatch(w,p);
  for(const key of Object.keys(BAKE_FIELDS))assert.deepEqual(baked[key],fresh[key]);
 }
 assert.equal(count,384);
});
test('persistent bake retains near flight previews and detail but skips distant parents',()=>{
 assert.equal(persistentBakeEligible(coarseBakePatch(0,0,0)),false);
 assert.equal(persistentBakeEligible({level:14,resolution:8}),true);
 assert.equal(persistentBakeEligible({level:9,resolution:32}),false);
 assert.equal(persistentBakeEligible({level:10,resolution:16}),true);
 assert.equal(persistentBakeEligible({level:18,resolution:32}),true);
});
test('missing browser storage falls back to procedural production without errors',async()=>{
 const w=await world(),cache=new TerrainBakeCache(w,{indexedDB:null,staticPacks:false}),p=coarseBakePatch(0,0,0);
 assert.deepEqual(await cache.read([p],'natural'),[null]);cache.enqueue([buildPatch(w,p)],'natural');await cache.settled();assert.equal(cache.stats.bakeErrors,0);assert.equal(cache.stats.bakeQueuedBytes,0);
});
