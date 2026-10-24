import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlanet,DEFAULT_CONFIG,canonicalConfig} from '../core/world.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {selectPatches,buildPatch,PATCH} from '../render/terrain-data.mjs';
import {faceDirection,directionFace} from '../core/cube.mjs';
import {distance,dot,cross,normalize} from '../core/math.mjs';
import {vegetationTile} from '../core/vegetation.mjs';
let world;const get=async()=>world??=await generatePlanet({analysisResolution:16});

test('4,000 km radius preserves physical lake, river, ford and strait dimensions',async()=>{
 const w=await get();assert.equal(DEFAULT_CONFIG.radiusMeters,4000000);assert.equal(w.radiusMeters,4000000);assert.equal(canonicalConfig({radiusMeters:12000000}).radiusMeters,12000000);
 assert.equal(w.hydrology.lakes[0].radiusMeters,2450);assert.equal(w.straits[0].minimumWidthMeters,5760);
 const river=w.hydrology.rivers[0],length=river.points.slice(1).reduce((sum,p,i)=>sum+distance(p.direction,river.points[i].direction)*w.radiusMeters,0);assert.ok(length>100000&&length<150000);
 assert.ok(Math.max(...w.buffers.terrainHeightMeters)<6500);
});
test('terrain LOD remains bounded through former 33.4 km freeze threshold and surface',async()=>{
 const w=await get(),d=w.frame.center,ground=sampleTerrain(w,d).elevationMeters,levels=[];
 for(const altitude of [100000,40000,33400,30000,20000,5000,ground+3]){
   const patches=selectPatches(w,d.map(v=>v*(1000+altitude*1000/w.radiusMeters)),1);assert.ok(patches.length>0&&patches.length<1200,`${altitude}: ${patches.length}`);
   assert.equal(new Set(patches.map(p=>p.key)).size,patches.length);levels.push(Math.max(...patches.map(p=>p.level)));
 }
 assert.ok(levels.at(-1)>levels[0]+5);
});
test('near patch buffers retain millimeter accuracy at planetary radius',async()=>{
 const w=await get(),camera=w.frame.center.map(v=>v*(1000+(sampleTerrain(w,w.frame.center).elevationMeters+20)*1000/w.radiusMeters)),p=selectPatches(w,camera).sort((a,b)=>b.level-a.level)[0],data=buildPatch(w,p),N=p.resolution??PATCH;
 assert.ok(p.level>=16);let maxError=0;
 for(let y=0;y<=N;y++)for(let x=0;x<=N;x++){
   // Coarse-neighbor edge vertices intentionally interpolate the coarser chord;
   // their continuity is verified separately in relief.test.mjs.
   if((y===0&&p.stitch?.[0])||(x===N&&p.stitch?.[1])||(y===N&&p.stitch?.[2])||(x===0&&p.stitch?.[3]))continue;
   const i=y*(N+1)+x,d=faceDirection(p.face,p.u+x/N*p.size,p.v+y/N*p.size),s=sampleTerrain(w,d);
   for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(data.center[k]+data.positions[i*3+k]-d[k]*(1000+s.elevationMeters*1000/w.radiusMeters))*w.radiusMeters/1000);
 }
 assert.ok(maxError<.005,`${maxError} m`);assert.ok([...data.normals].every(Number.isFinite));
});

test('0–4000 m surface footprint keeps dense geometry above elevated terrain within bounded budgets',async()=>{
 const w=await get(),d=w.frame.center,ground=sampleTerrain(w,d).elevationMeters,scale=1000/w.radiusMeters;
 const view={forward:d.map(v=>-v),up:w.frame.north,right:w.frame.east,tanX:.64,tanY:.445};
 for(const [agl,limit] of [[3,1],[20,1],[200,1.5],[1000,6],[2000,12],[4000,12]]){
  const p=selectPatches(w,d.map(v=>v*(1000+(ground+agl)*scale)),1,view);
  const under=p.filter(p=>distance(faceDirection(p.face,p.u+p.size/2,p.v+p.size/2),d)*w.radiusMeters<Math.max(30,agl*.5));
  assert.ok(under.length>0);assert.ok(under.every(p=>p.size*w.radiusMeters/p.resolution<=limit),`${agl} m surface resolution`);
  assert.ok(p.length<1600,'refinement stays confined to the near footprint');
  assert.ok(p.every(p=>(p.resolution+1)**2*64<=128*1024),'one dense patch fits the existing upload budget');
  for(const q of p)for(let side=0;side<4;side++)if(q.stitch[side]){const step=2**(q.level-q.stitch[side])*q.resolution/q.stitchResolution[side];assert.ok(Number.isInteger(step)&&step>=1,'every coarse vertex is shared by the fine lattice');}
 }
});
test('forest tile default has a physical lattice at 4,000 km',async()=>{
 const w=await get(),level=Math.ceil(Math.log2(2*w.radiusMeters/1400));assert.ok(2*w.radiusMeters/2**level<=1400);
 const a=vegetationTile(w,0,Math.floor(2**level/2),Math.floor(2**level/2));assert.ok(a.length<=1600);assert.ok(a.every(p=>p.id.startsWith(`0/${level}/`)));
});

test('warp arrival selection keeps a bounded, stitched initial footprint with near surface geometry',async()=>{
 const w=await get(),d=w.frame.center,ground=sampleTerrain(w,d).elevationMeters,camera=d.map(v=>v*(1000+(ground+320)*1000/w.radiusMeters));
 const patches=selectPatches(w,camera,.25,null,{arrival:true,maxLevel:17,resolution:8});
 assert.ok(patches.length>30&&patches.length<450,`${patches.length} arrival patches`);assert.ok(Math.min(...patches.map(p=>p.size*w.radiusMeters/p.resolution))<100);assert.ok(patches.every(p=>p.resolution===8));
});

test('travel prefetch refines a forward corridor without coarsening the current camera footprint',async()=>{
 const w=await get(),d=w.frame.center,scale=1000/w.radiusMeters,height=sampleTerrain(w,d).elevationMeters,camera=d.map(v=>v*(1000+(height+320)*scale));
 const forward=[d[2],0,-d[0]],length=Math.hypot(...forward);for(let i=0;i<3;i++)forward[i]/=length;
 const right=[d[1]*forward[2]-d[2]*forward[1],d[2]*forward[0]-d[0]*forward[2],d[0]*forward[1]-d[1]*forward[0]],view={forward,right,up:d,tanX:.8,tanY:.6};
 const base=selectPatches(w,camera,1,view),ahead=selectPatches(w,camera,1,{...view,predict:camera.map((v,i)=>v+forward[i]*1200*scale)});
 assert.ok(ahead.length>=base.length);assert.ok(ahead.length<base.length*2,'prediction stays bounded');
 for(const p of base){const descendants=ahead.filter(q=>q.face===p.face&&q.level>=p.level&&Math.floor(q.x/2**(q.level-p.level))===p.x&&Math.floor(q.y/2**(q.level-p.level))===p.y);assert.ok(descendants.length>0,'every current leaf keeps or refines its coverage');}
});

test('orbital relief covers the entire view beyond 480 km without a cliff in detail or unbounded grids',async()=>{
 const w=await get(),lat=11.29*Math.PI/180,lon=57.63*Math.PI/180,d=[Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon)];
 const north=normalize([0,1,0].map((v,i)=>v-d[i]*d[1])),right=normalize(cross(north,d)),forward=normalize(north.map((v,i)=>v*Math.cos(-1.05)+d[i]*Math.sin(-1.05))),up=normalize(cross(right,forward));
 const view={forward,right,up,tanX:Math.tan(39*Math.PI/180)*1.6,tanY:Math.tan(39*Math.PI/180)},scale=1000/w.radiusMeters,counts=[];
 for(const altitude of [400000,446000,479000,481000,520000,800000,2000000]){
  const camera=d.map(v=>v*(1000+altitude*scale)),patches=selectPatches(w,camera,1,view),lookup=new Map(patches.map(p=>[`${p.face}/${p.level}/${p.x}/${p.y}`,p]));
  counts.push(patches.length);assert.ok(patches.length<2600);assert.ok(patches.reduce((n,p)=>n+(p.resolution+1)**2,0)<1_200_000,'orbital geometry remains bounded');
  let inspected=0,beyond=0;
  for(let y=-3;y<=3;y++)for(let x=-4;x<=4;x++){
   const ray=normalize(forward.map((v,i)=>v+right[i]*x/5*view.tanX+up[i]*y/4*view.tanY)),b=dot(camera,ray),disc=b*b-dot(camera,camera)+1000**2;
   if(disc<=0||b>=0)continue;
   const travel=-b-Math.sqrt(disc),direction=normalize(camera.map((v,i)=>v+ray[i]*travel));if(-dot(direction,ray)<.5)continue;
   const [face,u,v]=directionFace(direction);let tile;
   for(let level=20;level>=3;level--){const n=2**level;tile=lookup.get(`${face}/${level}/${Math.min(n-1,Math.floor((u+1)*n/2))}/${Math.min(n-1,Math.floor((v+1)*n/2))}`);if(tile)break;}
   assert.ok(tile,'every visible ray has terrain coverage');const metres=travel/scale,spacing=tile.size*w.radiusMeters/tile.resolution;
   assert.ok(spacing/metres<.0075,`${altitude} m altitude: ${spacing.toFixed(0)} m cells at ${metres.toFixed(0)} m range`);inspected++;if(metres>480000)beyond++;
  }
  assert.ok(inspected>=15&&beyond>=10,'sample the visible surface on both sides of the old cutoff');
 }
 assert.ok(counts[3]/counts[2]>.7,'crossing 480 km cannot discard most of the detailed surface');
});
