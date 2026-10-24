import test from 'node:test';import assert from 'node:assert/strict';
import {BufferGeometry,BufferAttribute,Mesh,Group,MeshBasicMaterial,Vector3,Sphere,PerspectiveCamera,StorageBufferAttribute} from 'three/webgpu';
import {allocateResidentStorage} from '../render/terrain-upload.mjs';
import {copyWaterPatch,createWaterBatches,waterBatchKey} from '../render/water-batches.mjs';
import {terrainMemorySnapshot,recordBytes} from '../render/terrain-budget.mjs';
import {StreamingTerrain} from '../render/terrain-stream.mjs';
function patch(x=0,level=12){const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));g.setAttribute('normal',new BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));g.setAttribute('shallows',new BufferAttribute(new Float32Array([.1,.5,.9]),1));g.setIndex([0,1,2]);g.computeBoundingSphere();const m=new Mesh(g);m.position.x=x;m.userData.patch={face:0,level,x:Math.floor(x),y:0};return m;}
test('resident allocation skips empty-slot copy and keeps Three accounting / revision fallback',()=>{
 const backendData={},attributeData={},calls=[],renderer={backend:{isWebGPUBackend:true,get:()=>backendData,device:{createBuffer:d=>{calls.push(d);return {};}}},_attributes:{get:()=>attributeData},info:{createAttribute:a=>calls.push(a)}};
 const a=new StorageBufferAttribute(4096,4);assert.equal(allocateResidentStorage(renderer,a),true);assert.equal(calls[0].mappedAtCreation,false);assert.equal(calls[0].size,a.array.byteLength);assert.equal(calls[0].usage,172);assert.equal(attributeData.version,a.version);assert.equal(calls.length,2);
 allocateResidentStorage(renderer,a);assert.equal(calls.length,2);assert.equal(allocateResidentStorage(renderer,a,'187'),false);
});
test('water batching preserves positions including separate levels, normals, shore values and triangle indices',()=>{
 const a=patch(),b=patch(1);b.position.y=7;
 const g=new BufferGeometry();for(const [name,n]of [['position',3],['normal',3],['shallows',1]])g.setAttribute(name,new BufferAttribute(new Float32Array(6*n),n));g.setIndex(new BufferAttribute(new Uint32Array(6),1));
 const job={geometry:g,center:a.position.clone(),vertex:0,index:0,bounds:new Sphere()};copyWaterPatch(job,a);copyWaterPatch(job,b);
 assert.deepEqual([...g.index.array],[0,1,2,3,4,5]);assert.deepEqual([...g.attributes.position.array.slice(9)],[1,7,0,2,7,0,1,8,0]);assert.deepEqual([...g.attributes.shallows.array.slice(3)],[...b.geometry.attributes.shallows.array]);
 for(let i=0;i<6;i++)assert.ok(job.bounds.containsPoint(new Vector3().fromBufferAttribute(g.attributes.position,i)));
 assert.equal(waterBatchKey(a.userData.patch),waterBatchKey(b.userData.patch));assert.notEqual(waterBatchKey(a.userData.patch),waterBatchKey({...a.userData.patch,face:1}));
 for(const m of [a,b])m.geometry.dispose();g.dispose();
});
test('water batch replacement is atomic and invalidation immediately restores the original shore meshes',()=>{
 const group=new Group(),mat=new MeshBasicMaterial(),batch=createWaterBatches(group,mat),a=patch(),b=patch(1),camera=new PerspectiveCamera(70,1,.01,100);camera.position.set(1,.5,5);camera.lookAt(1,.5,0);camera.updateMatrixWorld();group.add(a,b);batch.add(a);batch.add(b);
 batch.update(camera,new Vector3(),{milliseconds:100,uploadBytes:0});assert.equal(a.visible,true);assert.equal(b.visible,true);assert.equal(batch.stats.batches,0);
 for(let i=0;i<10&&!batch.stats.batches;i++)batch.update(camera,new Vector3(),{milliseconds:100,uploadBytes:1024});
 assert.equal(batch.stats.batches,1);assert.equal(a.visible,false);assert.equal(b.visible,false);assert.equal(batch.stats.drawsSaved,1);
 batch.remove(b);assert.equal(a.visible,true);assert.equal(batch.stats.batches,0);assert.ok(batch.stats.poolBytes>0);batch.dispose();assert.equal(batch.stats.allocatedBytes,0);a.geometry.dispose();b.geometry.dispose();mat.dispose();
});
test('live byte telemetry counts shared arrival / cache records once and separates transition / retirement',()=>{
 const a={mesh:patch()},b={mesh:patch(1)},c={mesh:patch(2)},d={mesh:patch(3)},e={mesh:patch(4)};
 const t={active:new Map([['a',a.mesh]]),water:new Map(),ready:new Map([['b',b]]),cache:new Map([['c',c],['d',d]]),transitions:[{add:['b']}],arrival:{records:new Map([['a',a],['c',c]]),plan:[],inbox:[]},inbox:[],retiring:[e],batches:{stats:{allocatedBytes:128}},waterBatches:{stats:{allocatedBytes:64}}};
 const s=terrainMemorySnapshot(t),size=recordBytes(a);assert.equal(s.activeBytes,size);assert.equal(s.transitionBytes,size);assert.equal(s.prefetchBytes,size);assert.equal(s.cacheBytes,size);assert.equal(s.retiringBytes,size);assert.equal(s.readyBytes,0);assert.equal(s.cpuBufferBytes,size*5);assert.equal(s.cpuTotalBufferBytes,size*5+192);
 for(const r of [a,b,c,d,e])r.mesh.geometry.dispose();
});
test('obsolete geometry cleanup is spread across frames instead of draining hundreds in a cancellation',()=>{
 let count=0;const records=Array.from({length:32},()=>({mesh:{geometry:{dispose(){count++;}}}}));const ctx={retiring:records,frameDriven:true,stats:{}};
 StreamingTerrain.prototype.reap.call(ctx);assert.equal(count,8);assert.equal(ctx.retiring.length,24);
});
