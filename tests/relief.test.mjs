import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlanet} from '../core/world.mjs';
import {baseTerrain,sampleTerrain} from '../core/terrain.mjs';
import {noiseGradient} from '../core/relief.mjs';
import {localDirection,distance} from '../core/math.mjs';
import {buildPatch,PATCH,selectPatches} from '../render/terrain-data.mjs';

test('analytic terrain derivatives agree with centered numerical differences',()=>{
 for(const p of [[.21,.57,-.39],[29.07,-51.66,140.32],[-.0003,.9997,2.001]]){
  const n=noiseGradient(...p,718);
  for(let i=0;i<3;i++){const a=p.slice(),b=p.slice();a[i]-=1e-5;b[i]+=1e-5;const derivative=(noiseGradient(...b,718)[0]-noiseGradient(...a,718)[0])/2e-5;assert.ok(Math.abs(n[i+1]-derivative)<1e-6);}
 }
});
test('lava floor is below the rim and the surrounding volcanic province',async()=>{
 const w=await generatePlanet({worldType:'volcanic',analysisResolution:16}),floor=sampleTerrain(w,w.frame.center);
 assert.ok(floor.lava>.9);const rims=[],outer=[];
 for(let i=0;i<24;i++){const a=i*Math.PI/12;for(const [r,list]of [[5000,rims],[30000,outer]])list.push(baseTerrain(w,localDirection(w,Math.cos(a)*r/w.radiusMeters,Math.sin(a)*r/w.radiusMeters)));}
 assert.ok(Math.min(...rims)>floor.elevationMeters+650,'all rim sectors rise above the lava floor');
 assert.ok(outer.reduce((a,b)=>a+b)/outer.length>floor.elevationMeters+1000,'the volcanic area occupies a basin');
 assert.ok(Math.max(...rims)-Math.min(...rims)>200,'the crater rim is irregular');
});
test('mountain and valley visits identify distinct dry terrain with physical relief',async()=>{
 const w=await generatePlanet({analysisResolution:16,mountains:1,plains:.15,temperature:16}),peak=w.landmarks.find(p=>p.id==='ridges'),valley=w.landmarks.find(p=>p.id==='valleys');
 assert.ok(peak&&valley);const a=sampleTerrain(w,peak.direction),b=sampleTerrain(w,valley.direction);
 assert.equal(a.waterDepthMeters,0);assert.equal(b.waterDepthMeters,0);assert.ok(a.elevationMeters-b.elevationMeters>300);
 const span=distance(peak.direction,valley.direction)*w.radiusMeters;assert.ok(span>5500&&span<6500);
 assert.ok(Math.max(...w.buffers.terrainHeightMeters)<6500);assert.ok(w.buffers.biome.includes(6));
});
test('fine LOD edge follows the actual coarser chord instead of exposing a skirt',async()=>{
 const w=await generatePlanet({worldType:'desert',analysisResolution:16});
 const make=(x,y,level,stitch)=>({face:4,x,y,level,u:x*2/2**level-1,v:y*2/2**level-1,size:2/2**level,key:`4/${level}/${x}/${y}`,stitch});
 const a=buildPatch(w,make(8192,8192,14,[13,0,0,0])),b=buildPatch(w,make(4096,4095,13,[0,0,0,0]));
 for(let x=0;x<=PATCH;x++){
  const j=Math.floor(x/2),t=x/2-j;
  for(let k=0;k<3;k++){const p=b.center[k]+b.positions[(PATCH*(PATCH+1)+j)*3+k],q=b.center[k]+b.positions[(PATCH*(PATCH+1)+j+1)*3+k],actual=a.center[k]+a.positions[x*3+k];assert.ok(Math.abs(actual-(p+(q-p)*t))*w.radiusMeters/1000<.004);}
 }
 const fine=buildPatch(w,{...make(8192,8192,14,[13,0,0,0]),resolution:16,stitchResolution:[8,16,16,16]}),coarse=buildPatch(w,{...make(4096,4095,13,[0,0,0,0]),resolution:8});
 for(let x=0;x<=16;x++){const j=Math.floor(x/4),t=x/4-j;for(let k=0;k<3;k++){const p=coarse.center[k]+coarse.positions[(8*9+j)*3+k],q=coarse.center[k]+coarse.positions[(8*9+j+1)*3+k],actual=fine.center[k]+fine.positions[x*3+k];assert.ok(Math.abs(actual-(p+(q-p)*t))*w.radiusMeters/1000<.004,'mixed 8/16 grids remain welded');}}
 assert.equal(a.positions.length,(PATCH+1)**2*3,'near terrain no longer needs deep overlapping skirts');
 assert.ok([...a.normals].every(Number.isFinite));
 const patches=selectPatches(w,w.frame.center.map(v=>v*(1000+12000*1000/w.radiusMeters)));
 assert.ok(patches.some(p=>p.stitch.some(Boolean)));assert.ok(patches.length<1200);
});
