import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import {uniform} from 'three/tsl';
import {deserializePlanet} from '../io/bundle.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {createVegetation} from '../render/vegetation.mjs';
import {beginShadowBatch,appendShadowPatch,createShadowBatches,shadowKey} from '../render/shadow-batches.mjs';

test('shadow batching preserves every triangle and millimetre local positions',()=>{
 const group=new THREE.Group(),material=new THREE.MeshBasicMaterial(),meshes=[];
 for(let i=0;i<8;i++){const g=new THREE.PlaneGeometry(.03,.03,4,4);const m=new THREE.Mesh(g,material);m.position.set(821+i*.03,314,477);m.userData.patch={face:0,level:17,x:8+i%4,y:8+Math.floor(i/4)};meshes.push(m);}
 const job=beginShadowBatch(meshes);while(job.cursor<job.list.length)appendShadowPatch(job);
 let offset=0,at=0;for(const m of meshes){const p=m.geometry.attributes.position.array;for(let j=0;j<p.length;j++){const axis=j%3,actual=job.positions[offset*3+j]+job.center.getComponent(axis),expected=p[j]+m.position.getComponent(axis);assert.ok(Math.abs(actual-expected)*12000<.002);}for(const index of m.geometry.index.array)assert.equal(job.indices[at++],index+offset);offset+=p.length/3;}
 const batches=createShadowBatches(group,material);for(const m of meshes)batches.add(m);batches.update(100);assert.equal(group.children.length,new Set(meshes.map(m=>shadowKey(m.userData.patch))).size);assert.ok(group.children.every(m=>m.layers.mask===2&&m.castShadow));
 for(const m of meshes)batches.remove(m);batches.update(100);assert.equal(group.children.length,0);batches.dispose();for(const m of meshes)m.geometry.dispose();material.dispose();
});

test('tree pools keep identities, roots and versioned uploads through terrain/origin changes',async()=>{
 const file=await readFile(new URL('../fixtures/pangea.planet',import.meta.url)),world=await deserializePlanet(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));
 const feature=world.landmarks.find(f=>f.id==='forest')??world.landmarks[0],direction=new THREE.Vector3(...feature.direction),scale=1000/world.radiusMeters;
 let height=sampleTerrain(world,feature.direction).elevationMeters;
 const camera=new THREE.PerspectiveCamera(48,1,.00001,15000),origin=direction.clone().multiplyScalar(1000),absolute=direction.clone().multiplyScalar(1000+(height+200)*scale);
 camera.coordinateSystem=THREE.WebGPUCoordinateSystem;camera.position.copy(absolute).sub(origin);camera.lookAt(direction.clone().multiplyScalar(1000+height*scale).sub(origin));camera.updateMatrixWorld();
 const shared={clock:uniform(0),wind:uniform(.6),forestEye:uniform(absolute.clone().sub(origin)),origin:uniform(origin)},groundGroup=new THREE.Group();let surface=new THREE.Mesh();groundGroup.add(surface);
 const terrain={group:groundGroup,revision:1,surfaceAt(d,ref){ref.mesh=surface;return height;}};
 const originalWorker=globalThis.Worker;
 globalThis.Worker=class {postMessage(data){if(data.type!=='vegetation')return;queueMicrotask(()=>{this.onmessage({data:{id:data.id,type:'vegetation-plan',keys:['tile']}});this.onmessage({data:{id:data.id,type:'vegetation-tile',tile:{key:'tile',items:Array.from({length:12},(_,i)=>({direction:feature.direction,heightMeters:20+i,species:i%3,rotation:i,elevationMeters:height}))}}});this.onmessage({data:{id:data.id,type:'vegetation-done',milliseconds:0}});});}terminate(){}};
 let vegetation;
 try{
  vegetation=createVegetation(world,shared,terrain,camera);await vegetation.update(absolute);vegetation.settleTerrain();assert.equal(vegetation.stats.renderedInstances,12);const ids=vegetation.group.children.map(m=>m.uuid),queries=vegetation.stats.rootQueries;
  const verifyRoots=()=>{for(const mesh of vegetation.group.children.filter(m=>m.userData.trunk&&m.count)){assert.equal(mesh.instanceMatrix.usage,THREE.StaticDrawUsage);const matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).add(vegetation.group.position);assert.ok(Math.abs((p.length()-1000)/scale-height+.25)<.002);}}};
  verifyRoots();terrain.revision++;vegetation.settleTerrain();assert.equal(vegetation.stats.rootQueries,queries,'unrelated commits do not resample roots');
  groundGroup.remove(surface);surface=new THREE.Mesh();groundGroup.add(surface);height+=15;terrain.revision++;vegetation.settleTerrain();verifyRoots();
  shared.origin.value.x+=.1;shared.forestEye.value.copy(absolute).sub(shared.origin.value);camera.position.copy(absolute).sub(shared.origin.value);camera.updateMatrixWorld();vegetation.settleTerrain();verifyRoots();assert.deepEqual(vegetation.group.children.map(m=>m.uuid),ids);assert.equal(vegetation.stats.poolOverflow,0);
 }finally{vegetation?.dispose();globalThis.Worker=originalWorker;}
});

test('space flight hides vegetation without accessing or generating any surface data',async()=>{
 const original=globalThis.Worker;globalThis.Worker=class{postMessage(){}terminate(){}};let v;
 try{
  const world={radiusMeters:12000000,generationConfig:{worldType:'terran'}};
  Object.defineProperty(world,'terrainSeed',{get(){throw Error('space must not sample terrain');}});
  const shared={clock:uniform(0),wind:uniform(0),forestEye:uniform(new THREE.Vector3()),origin:uniform(new THREE.Vector3())};
  v=createVegetation(world,shared,{group:new THREE.Group()},new THREE.PerspectiveCamera());
  await v.update(new THREE.Vector3(0,0,1010));assert.equal(v.group.visible,false);assert.equal(v.stats.lod,'none');assert.equal(v.stats.tiles,0);
 }finally{v?.dispose();globalThis.Worker=original;}
});
