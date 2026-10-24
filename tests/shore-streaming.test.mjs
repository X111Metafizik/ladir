import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPatch,selectPatches} from '../render/terrain-data.mjs';
import {waterBody,clipWaterPolygon,riverBankOffsets} from '../render/water-clip.mjs';
import {edgeContract,transitionGroups,prioritizeTransitions} from '../render/stream-plan.mjs';
import {faceDirection,projectToFace} from '../core/cube.mjs';
import {normalize} from '../core/math.mjs';
const R=4000000,world={radiusMeters:R,generationConfig:{terrainModel:'watershed-2',seaLevel:0},hydrology:{rivers:[],lakes:[]}};
const patch=(level,x,y,resolution=8)=>{const size=2/2**level;return {face:4,level,x,y,u:x*size-1,v:y*size-1,size,resolution,key:`4/${level}/${x}/${y}`,stitch:[0,0,0,0],stitchResolution:[resolution,resolution,resolution,resolution],boundaryBands:{}};};
const sample=(d,featureId=null)=>({elevationMeters:-10,waterSurfaceMeters:0,waterDepthMeters:10,featureId,biome:8,moisture:.5});
test('a sea-level river has the same continuous surface as the ocean',()=>{
 const p=patch(15,16384,16384),ocean=buildPatch(world,p,'gray',d=>sample(d)),mouth=buildPatch(world,p,'gray',d=>sample(d,d[0]*R<120?'drain-test':null));
 assert.deepEqual(mouth.waterPositions,ocean.waterPositions);assert.deepEqual(mouth.waterIndices,ocean.waterIndices);
 assert.equal(waterBody({waterSurfaceMeters:0,featureId:'drain-test'},0),'ocean');
 assert.equal(waterBody({waterSurfaceMeters:50,featureId:'drain-test'},0),'drain-test');
});
test('river clipping includes a bank even when its centre line is outside the tile',()=>{
 const p=patch(15,16384,16384),a={direction:faceDirection(4,-10/R,-100/R),widthMeters:200,waterLevelMeters:100},b={direction:faceDirection(4,-10/R,400/R),widthMeters:200,waterLevelMeters:90};
 const w={...world,hydrology:{rivers:[{points:[a,b]}]}},mesh=buildPatch(w,p,'gray',d=>({...sample(d),elevationMeters:200,waterDepthMeters:0}));
 assert.ok(mesh.waterIndices.length>0,'the bank reaches into the tile');
 for(let i=0;i<mesh.waterPositions.length;i+=3){const uv=projectToFace([0,1,2].map(k=>mesh.waterPositions[i+k]+mesh.center[k]),4);assert.ok(uv[1]>=p.u-1e-10&&uv[1]<=p.u+p.size+1e-10&&uv[2]>=p.v-1e-10&&uv[2]<=p.v+p.size+1e-10);}
});
test('both sides of a sloping river use the same tile intersection and level',()=>{
 const polygon=[[-1,-.5,120],[1,-.4,115],[1,.6,90],[-1,.5,95]],a=clipWaterPolygon(polygon,-1,-1,1),b=clipWaterPolygon(polygon,0,-1,1);
 const edge=q=>q.filter(p=>p[0]===0).sort((a,b)=>a[1]-b[1]);assert.deepEqual(edge(a),edge(b));assert.ok(edge(a).length>=2);
});
test('river bends share bounded mitered bank vertices',()=>{
 const r={points:[[0,0,1],[.001,0,1],[.001,.001,1]].map(d=>({direction:normalize(d)}))},offsets=riverBankOffsets(r);
 assert.strictEqual(offsets,riverBankOffsets(r));assert.equal(offsets.size,3);
 const corner=offsets.get(r.points[1]);assert.ok(Math.hypot(...corner)>1.4&&Math.hypot(...corner)<=1.5);
 assert.ok(Math.abs(corner[0])>.9&&Math.abs(corner[1])>.9,'both segments meet at the same bank corner');
});
test('a sloping river crossing cube faces agrees at both shared bank vertices',()=>{
 const a={direction:normalize([.996,.0006,1]),widthMeters:300,waterLevelMeters:400},b={direction:normalize([1.004,.0006,1]),widthMeters:300,waterLevelMeters:100};
 const w={...world,hydrology:{rivers:[{points:[a,b]}]}},dry=d=>({...sample(d),elevationMeters:900,waterDepthMeters:0});
 const p=patch(10,1023,512),q={...patch(10,0,512),face:0},left=buildPatch(w,p,'gray',dry),right=buildPatch(w,q,'gray',dry);
 const boundary=m=>{const out=[];for(let i=0;i<m.waterPositions.length;i+=3){const v=[0,1,2].map(k=>m.waterPositions[i+k]+m.center[k]);if(Math.abs(v[0]-v[2])<1e-6)out.push(v);}return out.sort((a,b)=>a[1]-b[1]);};
 const A=boundary(left),B=boundary(right);assert.equal(A.length,2);assert.equal(B.length,2);
 for(let i=0;i<2;i++)assert.ok(Math.hypot(...A[i].map((x,k)=>x-B[i][k]))*R/1000<.01,'cube-edge water mismatch stays below 1 cm');
});
test('unmodified edge lattices do not wait for unrelated neighbouring changes',()=>{
 const a=patch(4,4,6),b=patch(4,5,6),c={...a,key:a.key+'/new',stitch:[0,0,0,3]},d={...b,key:b.key+'/new',stitch:[0,3,0,0]};
 assert.equal(edgeContract(a,1),edgeContract(c,1));assert.equal(edgeContract(b,3),edgeContract(d,3));
 const groups=transitionGroups([a,b],[c,d]);assert.equal(groups.length,2,'independent outer edges may publish separately');
 const changed={...c,stitch:[0,3,0,3]};assert.notEqual(edgeContract(a,1),edgeContract(changed,1));
 const changedNeighbor={...d,stitch:[0,3,0,3]};assert.equal(transitionGroups([a,b],[changed,changedNeighbor]).length,1,'a changed common edge remains atomic');
});
test('independent commits preserve the actual shared terrain vertices',()=>{
 const a=patch(14,8192,8192),b=patch(14,8193,8192),c={...a,key:a.key+'/new',stitch:[0,0,0,13]},d={...b,key:b.key+'/new',stitch:[0,13,0,0]};
 const terrain=n=>({...sample(n),elevationMeters:Math.sin(n[0]*R/70)*90+Math.cos(n[1]*R/110)*35,waterDepthMeters:0});
 const old=buildPatch(world,a,'gray',terrain),next=buildPatch(world,d,'gray',terrain);
 assert.equal(transitionGroups([a,b],[c,d]).length,2);
 for(let j=0;j<=8;j++)for(let k=0;k<3;k++)assert.ok(Math.abs(old.positions[(j*9+8)*3+k]+old.center[k]-next.positions[j*9*3+k]-next.center[k])*R/1000<.002);
});
test('near surface dependencies are produced before unrelated horizon work',()=>{
 const a={key:'near',priority:20},b={key:'far-seam',priority:900},c={key:'horizon',priority:300};
 const groups=[{add:['near/natural','far-seam/natural']},{add:['horizon/natural']}];
 assert.deepEqual(prioritizeTransitions([a,c,b],groups).map(p=>p.key),['near','far-seam','horizon']);
 assert.deepEqual(prioritizeTransitions([c,b,a],null).map(p=>p.key),['near','horizon','far-seam']);
});
