import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadStampHeights} from '../core/stamp-library.mjs';
import {STAMP_CATALOG} from '../core/stamp-catalog.mjs';
import {sampleStamp,stampWeight,stampedRelief,stampSites,stampBand,stampDetail} from '../core/terrain-stamps.mjs';
import {generatePlanet} from '../core/world.mjs';
import {serializePlanet,deserializePlanet} from '../io/bundle.mjs';
import {normalize,cross} from '../core/math.mjs';
import {buildPatch,selectPatches} from '../render/terrain-data.mjs';
import {PlanetCamera} from '../render/camera.mjs';
import {PerspectiveCamera,Vector3} from 'three';
let w;const get=async()=>w??=await generatePlanet({analysisResolution:16});
test('four GLB-derived height maps have verified, independent, lossless runtime buffers',async()=>{
 const a=await loadStampHeights(),b=await loadStampHeights();assert.equal(a.byteLength,3670016);assert.notEqual(a.buffer,b.buffer);assert.deepEqual(a,b);assert.equal(STAMP_CATALOG.length,4);
 const data=new Uint16Array(a.buffer);for(let i=0;i<4;i++){const samples=Array.from({length:1024},(_,j)=>sampleStamp(data,i,(j%32)/31,Math.floor(j/32)/31));assert.ok(Math.max(...samples)-Math.min(...samples)>.5);assert.ok(samples.every(x=>x>=0&&x<=1));}
 a[0]^=255;assert.notDeepEqual(a,b);
});
test('cubic reconstruction has continuous gradients and circular edges have zero slope',async()=>{
 const data=new Uint16Array((await loadStampHeights()).buffer),eps=1e-7;
 for(let m=0;m<4;m++)for(let i=4;i<500;i+=19){const u=i/(STAMP_CATALOG[m].width-1),v=.2317;const f=x=>sampleStamp(data,m,x,v),a=(f(u)-f(u-eps))/eps,b=(f(u+eps)-f(u))/eps;assert.ok(Math.abs(a-b)<.015);}
 assert.equal(stampWeight(1),0);assert.equal(stampWeight(1.1),0);assert.equal(stampWeight(0),1);assert.ok(stampWeight(1-1e-4)/1e-4<1e-5);
});
test('stamps stay deterministic and continuous across spatial cells and globe face directions',async()=>{
 const world=await get(),f=world.radiusMeters/42000;let changed=0;
 for(let i=0;i<120;i++){const x=(i-60)/f,a=i*2.39996,d=[x,Math.sqrt(1-x*x)*Math.cos(a),Math.sqrt(1-x*x)*Math.sin(a)],t=normalize(cross(d,[0,1,0]));const H=m=>stampedRelief(world,normalize(d.map((v,k)=>v+t[k]*m/world.radiusMeters)),1100),center=H(0);assert.equal(H(0),center);assert.ok(Math.abs(H(.01)-H(-.01))<.1);if(Math.abs(center-1100)>1)changed++;}
 assert.ok(changed>15,'global placement is active away from hero stamps');
 for(const site of stampSites(world)){const d=site.direction;assert.ok(Number.isFinite(stampedRelief(world,d,1100)));}
 assert.equal(stampedRelief({...world,generationConfig:{...world.generationConfig,terrainStamps:0}},world.frame.center,1100),1100);
});
test('stitched terrain matches coarse height, shading and surface channels on every edge vertex',async()=>{
 const world=await get(),make=(x,y,level,resolution,stitch)=>({face:4,x,y,level,u:x*2/2**level-1,v:y*2/2**level-1,size:2/2**level,key:`4/${level}/${x}/${y}`,resolution,stitch,stitchResolution:[8,16,16,16]});
 const a=buildPatch(world,make(8192,8192,14,16,[13,0,0,0])),b=buildPatch(world,make(4096,4095,13,8,[0,0,0,0]));
 for(let x=0;x<=16;x++){const j=Math.floor(x/4),t=x/4-j;for(const [key,width,tolerance]of [['positions',3,.004],['normals',3,2e-6],['colors',3,2e-6],['surface',4,.001],['climate',2,2e-6]])for(let k=0;k<width;k++){
  const actual=a[key][x*width+k]+(key==='positions'?a.center[k]:0),p=b[key][(8*9+j)*width+k]+(key==='positions'?b.center[k]:0),q=b[key][(8*9+j+1)*width+k]+(key==='positions'?b.center[k]:0),error=Math.abs(actual-(p+(q-p)*t))*(key==='positions'?world.radiusMeters/1000:1);assert.ok(error<tolerance,`${key} edge ${x}/${k}: ${error}`);
 }}
});
test('intermediate stamp views resolve ridges without an unbounded terrain mesh',async()=>{
 const world=await get(),d=world.frame.center,view={forward:d.map(v=>-v),up:world.frame.north,right:world.frame.east,tanY:Math.tan(Math.PI/7.5),tanX:Math.tan(Math.PI/7.5)*1.6};
 for(const altitude of [15000,33400]){
  const patches=selectPatches(world,d.map(v=>v*(1000+altitude*1000/world.radiusMeters)),1,view);
  assert.ok(patches.length<1800,`${altitude}: ${patches.length} patches`);
  assert.ok(patches.filter(p=>p.priority<altitude*1.6).some(p=>p.size*world.radiusMeters/p.resolution<400),'visible ridges have sub-400 m geometry');
 }
});

test('dense 32-cell tiles weld to 8 and 32-cell neighbors with matching surface channels',async()=>{
 const world=await get(),N=32,make=(x,y,level,resolution,stitch,stitchResolution)=>({face:4,x,y,level,u:x*2/2**level-1,v:y*2/2**level-1,size:2/2**level,resolution,stitch,stitchResolution});
 for(const coarseN of [8,32]){
  const a=buildPatch(world,make(8192,8192,14,N,[13,0,0,0],[coarseN,N,N,N])),b=buildPatch(world,make(4096,4095,13,coarseN,[0,0,0,0]));
  for(let x=0;x<=N;x++){const along=x*coarseN/(2*N),j=Math.floor(along),t=along-j;
   for(const [key,width,tolerance]of [['positions',3,.004],['normals',3,2e-6],['colors',3,2e-6],['surface',4,.001],['climate',2,2e-6]])for(let k=0;k<width;k++){
    const actual=a[key][x*width+k]+(key==='positions'?a.center[k]:0),p=b[key][(coarseN*(coarseN+1)+j)*width+k]+(key==='positions'?b.center[k]:0),q=b[key][(coarseN*(coarseN+1)+j+1)*width+k]+(key==='positions'?b.center[k]:0);
    assert.ok(Math.abs(actual-(p+(q-p)*t))*(key==='positions'?world.radiusMeters/1000:1)<tolerance,`${N}/${coarseN} ${key} at ${x}`);
   }
  }
 }
});

test('visible 32-cell tiles share every edge channel with 16-cell background at the same level',async()=>{
 const world=await get(),make=(y,n,stitch)=>({face:4,x:8192,y,level:14,u:0,v:y*2/2**14-1,size:2/2**14,resolution:n,stitch,stitchResolution:[16,32,32,32]});
 const a=buildPatch(world,make(8192,32,[14,0,0,0])),b=buildPatch(world,make(8191,16,[0,0,0,0]));
 for(let x=0;x<=32;x++){const j=Math.min(15,Math.floor(x/2)),t=x/2-j;
  for(const [key,width,tolerance]of [['positions',3,.004],['normals',3,2e-6],['colors',3,2e-6],['surface',4,.001],['climate',2,2e-6]])for(let k=0;k<width;k++){
   const actual=a[key][x*width+k]+(key==='positions'?a.center[k]:0),p=b[key][(16*17+j)*width+k]+(key==='positions'?b.center[k]:0),q=b[key][(16*17+j+1)*width+k]+(key==='positions'?b.center[k]:0);
   assert.ok(Math.abs(actual-(p+(q-p)*t))*(key==='positions'?world.radiusMeters/1000:1)<tolerance,`${key} at ${x}`);
  }
 }
});
test('height atlas is signed into planet packages and old unstamped v1.4 packages remain unchanged',async()=>{
 const world=await get(),packed=serializePlanet(world),copy=await deserializePlanet(packed);assert.deepEqual(copy.buffers.stampHeights,world.buffers.stampHeights);assert.equal(copy.manifest.worldDataHash,world.manifest.worldDataHash);
 const old=await deserializePlanet(await readFile(new URL('./fixtures/legacy-v14.planet',import.meta.url)));assert.equal(old.manifest.generatorVersion,'1.4.0');assert.equal(old.buffers.stampHeights,undefined);assert.equal(stampedRelief(old,old.frame.center,1234),1234);
 const single=await deserializePlanet(await readFile(new URL('./fixtures/legacy-v15.planet',import.meta.url)));assert.equal(single.manifest.generatorVersion,'1.5.0');assert.equal(single.generationConfig.stampLayers,undefined);assert.equal(stampDetail(single,single.frame.center),0);
 const corrupt=packed.slice(0),view=new DataView(corrupt),start=view.getUint32(12,true),meta=JSON.parse(new TextDecoder().decode(new Uint8Array(corrupt,16,view.getUint32(8,true)))),stamp=meta.manifest.bufferDescriptors.find(d=>d.name==='stampHeights');new Uint8Array(corrupt)[start+stamp.offset+82]^=1;await assert.rejects(()=>deserializePlanet(corrupt),/imza/);
});
test('all three stamp scales cover the entire sphere, independently of the camera',async()=>{
 const world=await get();
 for(let i=0;i<240;i++){const y=1-2*(i+.5)/240,a=i*2.3999632297,d=[Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)];
  for(let band=0;band<3;band++){const s=stampBand(world,d,band);assert.ok(s.weight>.001,'no empty stamp region');assert.ok(Number.isFinite(s.value));assert.equal(stampBand(world,d,band).value,s.value);}
 }
 const sites=stampSites(world);assert.equal(sites.length,4);for(let i=0;i<sites.length;i++)for(let j=i+1;j<sites.length;j++)assert.ok(sites[i].direction.reduce((s,v,k)=>s+v*sites[j].direction[k],0)<.83,'visits occupy distant regions');
});
test('near stamp relief has metre-scale shape and continuous lattice boundaries',async()=>{
 const world=await get(),d=world.frame.center,t=normalize(cross(d,[0,1,0])),H=x=>stampDetail(world,normalize(d.map((v,k)=>v+t[k]*x/world.radiusMeters))),heights=Array.from({length:100},(_,i)=>H(i*3));
 assert.ok(Math.max(...heights)-Math.min(...heights)>3,'small stamps add physical relief at close range');
 for(let band=0;band<3;band++)for(let i=0;i<24;i++){const spacing=[220000,22000,700][band],x=(i+.5)*spacing/world.radiusMeters,a=i*2.4,d=[x,Math.sqrt(1-x*x)*Math.sin(a),Math.sqrt(1-x*x)*Math.cos(a)],n=normalize(cross(d,[0,1,0]));
  const a1=stampBand(world,normalize(d.map((v,k)=>v+n[k]*.001/world.radiusMeters)),band).value,b1=stampBand(world,normalize(d.map((v,k)=>v-n[k]*.001/world.radiusMeters)),band).value;assert.ok(Math.abs(a1-b1)<.001);
 }
});
test('grazing editor cameras clear the displayed mesh and keep the near plane above ground',async()=>{
 const world=await get(),saved=globalThis.window,stub={addEventListener(){},removeEventListener(){},clientWidth:1440,clientHeight:1000};globalThis.window=stub;
 let controls;try{
  const camera=new PerspectiveCamera(48,1.44,.001,15000);controls=new PlanetCamera(stub,camera,world);controls.displayedSurface=()=>9000;controls.tilt=1.49;controls.setRangeMeters(30000);
  for(let i=0;i<12;i++){controls.yaw=i*.4;controls.pan(15,3);controls.update(.016,new Vector3());const altitude=(controls.absolute.length()-1000)*world.radiusMeters/1000;assert.ok(altitude>=9002.199,'camera cannot enter a still-coarse visible tile');assert.ok(camera.near/controls.scale<(altitude-9000)*.21,'near plane cannot slice the surface');}
 }finally{controls?.dispose();if(saved===undefined)delete globalThis.window;else globalThis.window=saved;}
});
