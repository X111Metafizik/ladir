import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {deserializePlanet} from '../io/bundle.mjs';
import {REGIONAL_CATALOG} from '../io/regional-catalog.mjs';
import {validateRegion,unpackRegionTile,manifestDigest} from '../io/regional-format.mjs';
import {RegionField} from '../io/regional-field.mjs';
import {RegionLoader} from '../io/regional-loader.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {sampleProceduralTerrain,sampleTerrain} from '../core/terrain.mjs';
import {initRegional} from '../io/regional-runtime.mjs';
let w;const world=async()=>w??=await deserializePlanet(await readFile('fixtures/lumen-v35.planet'));
const tile=async(c,t)=>{const a=gunzipSync(await readFile(c.base+t.file));return unpackRegionTile(a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength),t,c.manifest.grid);};
test('regional identity validates seed, generator, radius, field version and immutable manifest',async()=>{
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],m=c.manifest;assert.ok(validateRegion(m,w));assert.equal(w.radiusMeters,4000000);assert.equal(await manifestDigest(m),c.manifestSha256);
 for(const patch of [{radiusMeters:6000000},{seed:'other'},{generatorVersion:'old'},{worldHash:'other'}])assert.throws(()=>validateRegion({...m,identity:{...m.identity,...patch}},w));
 assert.throws(()=>validateRegion({...m,fieldVersion:'old'},w));
});
test('cold canonical fallback and baked samples match exactly at mixed micro bands and tile edges',async()=>{
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],a=new RegionField(w,c.manifest),b=new RegionField(w,c.manifest);
 for(const key of ['6/6','7/6','6/7','7/7'])a.install(await tile(c,c.manifest.tiles.find(t=>t.key===key)));
 for(let i=0;i<160;i++){const x=-4000+(i*127%4000),y=-4000+(i*239%4000),d=referenceDirection(w,x,y);for(const o of [{},{micro:false},{microWeight:.4}])assert.deepEqual(a.sample(d,o),b.sample(d,o));}
 a.clear();assert.equal(a.stats.ramBytes,0);
});
test('regional source stays finite at exact bounds and joins original planet at outer boundary',async()=>{
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],f=new RegionField(w,c.manifest);
 for(const [x,y]of [[-16000,0],[16000,0],[0,16000],[0,-16000],[15999.999,15999.999],[-16001,0]]){const d=referenceDirection(w,x,y),s=f.sample(d);assert.ok(Number.isFinite(s.elevationMeters));if(Math.abs(x)>=16000||Math.abs(y)>=16000)assert.ok(Math.abs(s.elevationMeters-sampleProceduralTerrain(w,d).elevationMeters)<1e-8);}
});
test('regional runtime source is shared by original public terrain API and removable without changing world identity',async()=>{
 const w=await world(),d=referenceDirection(w,-5000,8000),hash=w.manifest.worldDataHash,old=sampleProceduralTerrain(w,d),r=initRegional(w,{mode:'procedural'});assert.deepEqual(sampleTerrain(w,d),r.field.sample(d));assert.equal(w.manifest.worldDataHash,hash);r.dispose();assert.deepEqual(sampleTerrain(w,d),old);
});
test('regional RAM tiles and node samples obey payload byte limits',async()=>{
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],t=await tile(c,c.manifest.tiles[0]),f=new RegionField(w,c.manifest,{maxBytes:t.bytes*2,nodeBytes:20*4*100});
 for(let i=0;i<12;i++)f.install({...t,x:i});assert.equal(f.tiles.size,2);assert.ok(f.stats.ramBytes<=t.bytes*2);assert.equal(f.stats.evictions,10);
 for(let i=0;i<400;i++)f.getNode(i,i);assert.ok(f.stats.nodeBytes<=8000);
});
test('corrupt or missing tiles fail soft, aborted preloads do not install data',async()=>{
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],t=c.manifest.tiles[0],broken=new RegionLoader(w,c,{disk:false,fetchFn:async()=>new Response(new Uint8Array(t.bytes))});
 assert.equal(await broken.load(t),null);assert.equal(broken.stats.missingTiles,1);
 const controller=new AbortController();controller.abort();assert.equal(await broken.load(t,controller.signal),null);
 const missing=new RegionLoader(w,c,{disk:false,fetchFn:async()=>new Response('',{status:404})});assert.equal(await missing.load(t),null);
});
test('real regional tile loader verifies compressed and raw signatures without extra GPU data allocation',async()=>{
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],t=c.manifest.tiles[10],data=await readFile(c.base+t.file),l=new RegionLoader(w,c,{disk:false,fetchFn:async()=>new Response(data)}),loaded=await l.load(t);assert.ok(loaded);assert.equal(loaded.bytes,t.rawBytes);assert.equal(l.stats.tilesLoaded,1);assert.equal(l.stats.inflightBytes,0);
 const raw=gunzipSync(data);assert.throws(()=>unpackRegionTile(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength-4),t,c.manifest.grid));
});

test('regional mesh positions, stitched normals, materials and water are identical with and without a resident tile',async()=>{
 const {buildPatch}=await import('../render/terrain-data.mjs'),{directionFace}=await import('../core/cube.mjs');
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],a=new RegionField(w,c.manifest),b=new RegionField(w,c.manifest);
 a.install(await tile(c,c.manifest.tiles.find(t=>t.key==='6/6')));
 const [face,u,v]=directionFace(referenceDirection(w,-3000,-3000));
 for(const level of [14,16,18]){const size=2/2**level,x=Math.floor((u+1)/size),y=Math.floor((v+1)/size),p={face,level,x,y,u:x*size-1,v:y*size-1,size,resolution:32,stitch:[0,level-1,0,0],stitchResolution:[32,16,32,32],key:'regional-test'},left=buildPatch(w,p,'natural',(d,o)=>a.sample(d,o)),right=buildPatch(w,p,'natural',(d,o)=>b.sample(d,o));
  for(const name of ['positions','normals','colors','surface','climate','waterPositions','waterNormals','waterIndices','indices','shallows'])assert.deepEqual(left[name],right[name],name);
 }
});
test('warp sweep hits the same surface and impact normal before and after package residency',async()=>{
 const {Vector3}=await import('three'),{sweepGround,collisionScratch}=await import('../simulation/ground-collision.mjs');
 const w=await world(),c=REGIONAL_CATALOG[w.manifest.worldDataHash],a=new RegionField(w,c.manifest),b=new RegionField(w,c.manifest);a.install(await tile(c,c.manifest.tiles.find(t=>t.key==='6/6')));
 const d=new Vector3(...referenceDirection(w,-3000,-3000)),from=d.clone().multiplyScalar(w.radiusMeters+30000),to=d.clone().multiplyScalar(w.radiusMeters-1000),p=collisionScratch(),q=collisionScratch(),ground=f=>d=>{const s=f.sample(d.toArray());return {height:Math.max(s.elevationMeters,s.waterSurfaceMeters)};};
 assert.equal(sweepGround(from,to,w.radiusMeters,ground(a),17.2,p),true);assert.equal(sweepGround(from,to,w.radiusMeters,ground(b),17.2,q),true);assert.deepEqual(p.point.toArray(),q.point.toArray());assert.deepEqual(p.normal.toArray(),q.normal.toArray());
});
test('quota transaction failure backs off and does not publish uncommitted disk byte counts',async()=>{
 const {RegionDisk}=await import('../io/regional-storage.mjs');const d=new RegionDisk();
 d.db=async()=>({transaction(){const t={error:new DOMException('quota','QuotaExceededError'),objectStore(){return {get(){return {};}}},abort(){}};setTimeout(()=>t.onabort?.(),0);return t;}});
 await d.write('quota',new Uint8Array(128).buffer);assert.equal(d.stats.quotaErrors,1);assert.equal(d.stats.diskBytes,0);assert.ok(d.backoff>Date.now());
});
