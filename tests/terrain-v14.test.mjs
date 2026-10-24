import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlanet} from '../core/world.mjs';
import {mountainRelief} from '../core/relief.mjs';
import {sampleTerrain,snowElevation} from '../core/terrain.mjs';
import {selectPatches,PATCH} from '../render/terrain-data.mjs';
import {localDirection,normalize,cross,distance,hash32} from '../core/math.mjs';
let world;const get=async()=>world??=await generatePlanet({analysisResolution:16});

test('mountain profiles do not form sub-100 m needles across seeds and directions',()=>{
 for(const seed of ['LUMEN-742','ALPINA-509','PANGEA-311','NEEDLE-REGRESSION']){
  const w={radiusMeters:12000000,terrainSeed:hash32(seed),generationConfig:{erosion:1}};
  for(let i=0;i<2500;i++){
   const y=1-2*(i+.5)/2500,a=i*2.3999632297,d=[Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)],t=normalize(cross(d,[0,1,0]));
   const H=m=>mountainRelief(w,normalize(d.map((v,k)=>v+t[k]*m/w.radiusMeters)));
   const h=H(0),left=H(-100),right=H(100);
   assert.ok(Math.max(Math.abs(h-left),Math.abs(right-h))<180,'100 m rise is bounded');
   assert.ok(Math.abs(h-(left+right)/2)<30,'no isolated spike between neighboring samples');
  }
 }
});
test('balanced climate has a continuous, altitude-dependent snow transition',async()=>{
 const w=await get(),line=snowElevation(w,w.frame.center);assert.ok(line>2100&&line<2600);
 const samples=[];
 for(let y=-120000;y<=120000;y+=4000)for(let x=-120000;x<=120000;x+=4000)samples.push(sampleTerrain(w,localDirection(w,x/w.radiusMeters,y/w.radiusMeters)));
 assert.ok(samples.some(s=>s.snow>.9),'high peaks retain snow');
 assert.ok(samples.some(s=>s.snow>.05&&s.snow<.95),'snowline blends over an elevation band');
 assert.ok(samples.some(s=>s.waterDepthMeters===0&&s.snow===0),'lowlands remain snow free');
 for(const s of samples.filter(s=>s.waterDepthMeters===0)){if(s.elevationMeters<s.snowLineMeters-140)assert.equal(s.snow,0);if(s.elevationMeters>s.snowLineMeters+260)assert.equal(s.snow,1);}
});
test('deep rift is a traversable-width valley roughly 1–2 km below its plateau',async()=>{
 const w=await get(),height=y=>sampleTerrain(w,localDirection(w,-70000/w.radiusMeters,y/w.radiusMeters));
 const floor=height(20000),rim=height(8000);assert.ok(floor.waterDepthMeters===0);
 const depth=rim.elevationMeters-floor.elevationMeters;assert.ok(depth>1200&&depth<2600,'depth '+depth);
 const nearFloor=height(20200);assert.ok(Math.abs(nearFloor.elevationMeters-floor.elevationMeters)<200,'floor has a real width');
 assert.ok(w.landmarks.some(l=>l.id==='rift'));
});
test('long rivers form repeated meanders instead of nearly straight graph edges',async()=>{
 const w=await get(),rivers=w.hydrology.rivers.filter(r=>r.network&&!r.stream&&r.points.length>40);
 let curved=0;
 for(const r of rivers){
  const pts=r.points.slice(Math.floor(r.points.length*.2),Math.floor(r.points.length*.8));
  const length=pts.slice(1).reduce((sum,p,i)=>sum+distance(p.direction,pts[i].direction),0),chord=distance(pts[0].direction,pts.at(-1).direction);
  if(length/chord>1.14)curved++;
  for(let i=1;i<r.points.length;i++)assert.ok(r.points[i].waterLevelMeters<=r.points[i-1].waterLevelMeters+1e-6);
 }
 assert.ok(curved/rivers.length>.8,curved+'/'+rivers.length+' meandering reaches');
});
test('170 km view retains sub-kilometer mountain geometry with a bounded mesh',async()=>{
 const w=await get(),d=w.frame.center,view={forward:d.map(v=>-v),up:w.frame.north,right:w.frame.east,tanY:Math.tan(Math.PI/7.5),tanX:Math.tan(Math.PI/7.5)*1.6};
 const p=selectPatches(w,d.map(v=>v*(1000+170000*1000/w.radiusMeters)),1,view);
 assert.ok(p.length<1200,'patches '+p.length);
 const center=p.filter(p=>p.size*w.radiusMeters/(p.resolution??PATCH)<650);assert.ok(center.length>50);
 assert.ok(Math.min(...p.map(p=>p.size*w.radiusMeters/(p.resolution??PATCH)))<650);
});

