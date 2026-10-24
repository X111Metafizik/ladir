import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlanet,validatePlanet,worldHash,DEFAULT_CONFIG} from '../core/world.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {queryStaticNavigation} from '../core/navigation.mjs';
import {localDirection,stableStringify} from '../core/math.mjs';
import {cubeGraph,faceDirection} from '../core/cube.mjs';
import {serializePlanet,deserializePlanet} from '../io/bundle.mjs';
import {cellDirection,importStarfrontLayout,createStarfrontAdapter} from '../adapters/starfront.mjs';
import {vegetationTile} from '../core/vegetation.mjs';
import {directionFace} from '../core/cube.mjs';
import {generatePlanetInWorker} from '../workers/node.mjs';
let world;const get=async()=>world??=await generatePlanet({analysisResolution:24});
test('NFC seed canonicalization and repeated generation have identical hashes',async()=>{
  const a=await generatePlanet({seed:'I\u0307RIS',analysisResolution:16}),b=await generatePlanet({seed:'İRİS'.replace('Rİ','RI'),analysisResolution:16});
  assert.equal(a.manifest.normalizedSeed,b.manifest.normalizedSeed);assert.equal(a.manifest.worldDataHash,b.manifest.worldDataHash);
});
test('decorative density does not move continents, lakes or rivers',async()=>{
  const a=await get(),b=await generatePlanet({...a.generationConfig,forestDensity:.1});
  assert.deepEqual(a.buffers.terrainHeightMeters,b.buffers.terrainHeightMeters);assert.deepEqual(a.hydrology,b.hydrology);assert.deepEqual(a.crossings,b.crossings);
  assert.notEqual(a.buffers.vegetation.length,b.buffers.vegetation.length);
});
test('binary roundtrip is exact and corrupted/truncated packages are rejected',async()=>{
  const a=await get(),bytes=serializePlanet(a,{sunElevation:4}),b=await deserializePlanet(bytes);
  assert.equal(a.manifest.worldDataHash,b.manifest.worldDataHash);assert.deepEqual(a.buffers,b.buffers);
  await assert.rejects(()=>deserializePlanet(bytes.slice(0,bytes.byteLength-8)),/alan|imza/);
  const bad=bytes.slice(0);new Uint8Array(bad)[bad.byteLength-20]^=0x40;
  await assert.rejects(()=>deserializePlanet(bad),/imza/);
});
test('appearance settings do not enter authoritative world identity',async()=>{
  const a=await get(),sunset=await deserializePlanet(serializePlanet(a,{sunElevation:2,clouds:.8})),day=await deserializePlanet(serializePlanet(a,{sunElevation:65,clouds:.2}));
  assert.equal(sunset.manifest.worldDataHash,day.manifest.worldDataHash);
});
test('cube-sphere graph is welded, spherical area sums correctly and adjacency is symmetric',()=>{
  const n=16,r=120000,g=cubeGraph(n,r);assert.equal(g.areas.length,6*n*n+2);assert.ok(Math.abs(g.areas.reduce((a,b)=>a+b,0)/(4*Math.PI*r*r)-1)<1e-10);
  for(let i=0;i<g.areas.length;i++)for(let k=g.offsets[i];k<g.offsets[i+1];k++){const j=g.neighbors[k];assert.ok(g.neighbors.subarray(g.offsets[j],g.offsets[j+1]).includes(i));}
});
test('drainage is acyclic and rainfall-area mass reaches ocean outlets',async()=>{
  const w=await get(),b=w.buffers,rank=new Int32Array(b.receiver.length);b.floodOrder.forEach((id,i)=>rank[id]=i);
  let rain=0,out=0;for(let i=0;i<b.receiver.length;i++){rain+=b.rainfall[i]*b.areas[i];if(b.receiver[i]>=0)assert.ok(rank[b.receiver[i]]<rank[i]);else out+=b.accumulation[i];}
  assert.ok(Math.abs(rain-out)/rain<1e-8);assert.ok(validatePlanet(w).valid);
});
test('natural ford connects both banks and deep river cannot be crossed',async()=>{
  const w=await get(),c=w.crossings[0];
  assert.ok(queryStaticNavigation(w,{from:c.anchors[0],to:c.anchors[1],portalId:c.portalId}).passable);
  assert.equal(queryStaticNavigation(w,{from:c.anchors[0],to:c.anchors[1]}).passable,false);
  const p=w.hydrology.rivers[0].points[45],dx=p.widthMeters/w.radiusMeters;
  const q={from:localDirection(w,p.x-dx,p.y),to:localDirection(w,p.x+dx,p.y),portalId:c.portalId};
  assert.equal(queryStaticNavigation(w,q).passable,false);
});
test('strait has broad wet entrances and navigable channel',async()=>{
  const w=await get(),s=w.straits[0];for(const d of s.centerline)assert.ok(sampleTerrain(w,d).waterDepthMeters>20);
  assert.ok(queryStaticNavigation(w,{from:s.entrance,to:s.exit,mode:'water',draftMeters:5}).passable);
});
test('forest roots avoid water and protected river and ford surfaces',async()=>{
  const w=await get(),v=w.buffers.vegetation;
  for(let i=0;i<v.length;i+=4){const d=Array.from(v.subarray(i,i+3)),length=Math.hypot(...d),s=sampleTerrain(w,d.map(x=>x/length));assert.ok(s.waterDepthMeters<=0);assert.ok(s.protectedFeatureMask<=.16);}
});
test('Starfront geometryVersion 3 frame and stable IDs are preserved',async()=>{
  const body={id:7,cols:4,rows:2,cells:[{id:73,x:1,y:0},{id:98,x:2,y:1}],polygons:[[[1,0],[2,0]],[[2,1],[3,1]]]},layout=importStarfrontLayout(body);
  assert.deepEqual(layout.cells.map(c=>c.id),[73,98]);assert.ok(Math.abs(Math.hypot(...cellDirection(body.cells[0],body))-1)<1e-12);
  const w=await generatePlanet({analysisResolution:16,mode:'existing-layout'},{importedLayout:layout});assert.deepEqual(w.regionBindings.map(r=>r.id),[73,98]);
  let selected=null;const adapter=createStarfrontAdapter({world:w,hostBindings:{isVisible:id=>id===73,onSelect:id=>selected=id}});
  assert.equal(adapter.selectRegion(98),false);assert.equal(adapter.selectRegion(73),true);assert.equal(selected,73);assert.deepEqual(adapter.exportVisibleBindings().map(r=>r.id),[73]);
});
test('server-side adapter refuses forbidden movement before invoking host',async()=>{
  const w=await get(),c=w.crossings[0];let calls=0;const adapter=createStarfrontAdapter({world:w,hostBindings:{applyValidatedSegment:()=>calls++}});
  assert.equal(adapter.applyMovementSegment({from:c.anchors[0],to:c.anchors[1]}).passable,false);assert.equal(calls,0);
  assert.ok(adapter.applyMovementSegment({from:c.anchors[0],to:c.anchors[1],portalId:c.portalId}).passable);assert.equal(calls,1);
});
test('sea level changes water coverage without rebasing physical terrain',async()=>{
  const a=await get(),b=await generatePlanet({...a.generationConfig,seaLevel:100});assert.ok(b.generationReport.waterFraction>a.generationReport.waterFraction);
});
test('near forest tiles are deterministic and respect protected banks',async()=>{
  const w=await get(),[face,u,v]=directionFace(w.landmarks.find(f=>f.id==='forest').direction),n=2**Math.ceil(Math.log2(2*w.radiusMeters/1400)),x=Math.floor((u+1)*n/2),y=Math.floor((v+1)*n/2);
  const a=vegetationTile(w,face,x,y),b=vegetationTile(w,face,x,y);assert.deepEqual(a,b);assert.ok(a.length>0);
  for(const p of a){const s=sampleTerrain(w,p.direction);assert.ok(s.waterDepthMeters===0&&s.protectedFeatureMask<=.12);}
});
test('zero-draft water navigation still rejects dry land',async()=>{
  const w=await get(),c=w.crossings[0];assert.equal(queryStaticNavigation(w,{from:c.anchors[0],to:c.anchors[0],mode:'water'}).passable,false);
});

test('region count changes only political bindings, not physical geography',async()=>{
  const a=await get(),b=await generatePlanet({...a.generationConfig,regionCount:17});
  assert.deepEqual(a.buffers.terrainHeightMeters,b.buffers.terrainHeightMeters);
  assert.deepEqual(a.hydrology,b.hydrology);assert.deepEqual(a.crossings,b.crossings);
  assert.equal(b.regionBindings.length,17);
  assert.ok(b.regionBindings.every(r=>r.neighbors.every(id=>b.regionBindings[id].neighbors.includes(r.id))));
});

test('Node worker matches core hash and supports immediate cancellation',async()=>{
  const a=await get(),progress=[],b=await generatePlanetInWorker(a.generationConfig,{onProgress:p=>progress.push(p.value)});
  assert.equal(a.manifest.worldDataHash,b.manifest.worldDataHash);
  assert.ok(progress.length>5&&progress.at(-1)===1);
  const controller=new AbortController(),pending=generatePlanetInWorker({analysisResolution:64},{signal:controller.signal});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
});

test('runtime terrain parameters and radius are covered by the package hash',async()=>{
  const a=await get(),bad={...a,generationConfig:{...a.generationConfig,mountains:.01}};
  await assert.rejects(()=>deserializePlanet(serializePlanet(bad)),/imza/);
  await assert.rejects(()=>deserializePlanet(serializePlanet({...a,radiusMeters:a.radiusMeters+1})),/imza/);
});
