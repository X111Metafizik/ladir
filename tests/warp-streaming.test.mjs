import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,MeshBasicNodeMaterial,PerspectiveCamera,Vector3} from 'three/webgpu';
import {StreamingTerrain} from '../render/terrain-stream.mjs';
class FakeWorker {static all=[];constructor(){this.sent=[];FakeWorker.all.push(this);}postMessage(data){this.sent.push(data);}terminate(){}emit(data){this.onmessage({data});}}
test('initial editor readiness waits for all preview buffers, but not the full-resolution job',async()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:4000000},material,new Group(),material,camera);t.setFrameDriven(true);t.prepareMeshes=()=>{};
  const job=t.prepareInitial(new Vector3(0,0,1001));let detailed=false;job.detail.then(()=>detailed=true);
  deliver(t.worker,packet(0),t.id);assert.equal(t.active.size,0);t.flushFrame();assert.deepEqual(await job.surface,{cancelled:false});assert.equal(detailed,false);assert.equal(t.worker.sent.at(-1).preview,false);
  const fine={...packet(0),key:'0/3/4/4/full/natural'};deliver(t.worker,fine,t.id);t.flushFrame();assert.deepEqual(await job.detail,{complete:true});assert.ok(t.active.has(fine.key));
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});
test('cancelled and failed initial loading releases both readiness promises without reporting full detail',async()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:4000000},material,new Group(),material,camera);t.setFrameDriven(true);
  const job=t.prepareInitial(new Vector3(0,0,1001));t.cancelRequest();assert.deepEqual(await job.surface,{cancelled:true});assert.equal(await job.detail,undefined);
  const broken=t.prepareInitial(new Vector3(0,0,1001));const a=assert.rejects(broken.surface,/test failure/),b=assert.rejects(broken.detail,/test failure/);t.fail(Error('test failure'));await Promise.all([a,b]);
  const closing=t.prepareInitial(new Vector3(0,0,1001));t.dispose();assert.deepEqual(await closing.surface,{cancelled:true});await closing.detail;t=null;
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});
function packet(face){const patch={face,level:3,x:4,y:4,u:0,v:0,size:.25,resolution:8,priority:100},key=`${face}/3/4/4/test/natural`;
 return {key,patch,center:[0,0,1000],positions:new Float32Array([0,0,0,.01,0,0,0,.01,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),indices:new Uint16Array([0,1,2]),colors:new Float32Array(9),surface:new Float32Array(12),climate:new Float32Array(6),waterIndices:new Uint16Array(),waterPositions:new Float32Array(),waterNormals:new Float32Array(),shallows:new Float32Array()};}
function deliver(worker,p,id=0){worker.emit({id,type:'terrain-plan',patches:[{...p.patch,key:p.key}]});worker.emit({id,type:'terrain-chunk',patches:[p]});worker.emit({id,type:'terrain-done',milliseconds:1,samples:3,workers:1});}
test('cache telemetry remains current when disk completes before a delayed GPU commit',()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:4000000},material,new Group(),material,camera);t.setFrameDriven(true);
  deliver(t.worker,packet(0));t.done.bake={bakeQueuedBytes:4096};t.worker.emit({type:'terrain-cache',id:0,bake:{bakeQueuedBytes:0,bakeWrites:24}});t.flushFrame();
  assert.equal(t.stats.bake.bakeQueuedBytes,0);assert.equal(t.stats.bake.bakeWrites,24);
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});
test('warp preloading leaves the visible terrain intact, then swaps a prepared footprint atomically',()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{
  const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);t.prepareMeshes=()=>{};
  const before=packet(0);deliver(t.worker,before);t.flushFrame();assert.equal(t.active.size,1);assert.ok(t.active.has(before.key));
  t.prepareArrival(new Vector3(0,1000,0));const a=t.arrival,arrival=packet(2);deliver(a.worker,arrival,1);assert.ok(a.refinement,'fine CPU work starts while preview upload is pending');assert.equal(a.ready,false);t.flushFrame();assert.equal(a.ready,true);assert.ok(t.active.has(before.key));assert.ok(!t.active.has(arrival.key));assert.equal(t.ready.size,0);
  assert.equal(a.worker.sent.findLast(m=>m.type==='terrain').preview,false,'full LOD must begin before arrival');
  const detailed={...packet(2),key:'2/3/4/4/detailed/natural'};deliver(a.worker,detailed,a.refinement.id);t.flushFrame();assert.ok(a.refinement.ready);assert.ok(t.active.has(before.key));
  t.arrive(new Vector3(0,1000,0));assert.equal(t.active.size,1);assert.ok(t.active.has(detailed.key));assert.ok(t.cache.has(before.key));assert.equal(t.arrival,null);assert.equal(t.stats.arrivalReadyBeforeJump,true);assert.equal(t.stats.arrivalDetailReadyBeforeJump,true);assert.equal(t.arrivalRevision,1);
  assert.equal(t.worker.sent.at(-1).preview,false,'normal streaming resumes with the already detailed footprint');
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('a short warp shows its prepared preview immediately while detail finishes without a loading gate',async()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);
  t.prepareArrival(new Vector3(0,1000,0));const a=t.arrival,preview=packet(2);deliver(a.worker,preview,a.id);t.flushFrame();const fine=a.refinement;
  await t.arrive(new Vector3(0,1000,0));assert.ok(t.active.has(preview.key));assert.equal(t.stats.arrivalDetailReadyBeforeJump,false);assert.ok(t.arrival);
  let disposed=false;t.active.get(preview.key).geometry.addEventListener('dispose',()=>disposed=true);
  const detailed={...packet(2),key:'2/3/4/4/detailed/natural'};deliver(a.worker,detailed,fine.id);t.flushFrame();assert.ok(t.active.has(detailed.key));assert.equal(t.arrival,null);assert.equal(disposed,false,'preview is a retained cache record, not an orphan');
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('staged cache dependencies stay resident and cancellation preserves the active preview',()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);
  t.prepareArrival(new Vector3(0,1000,0));const a=t.arrival,p=packet(2);deliver(a.worker,p,a.id);t.flushFrame();t.arrive(new Vector3(0,1000,0));let disposed=false;t.active.get(p.key).geometry.addEventListener('dispose',()=>disposed=true);
  t.cancelArrival();assert.equal(disposed,false);assert.ok(t.active.has(p.key));assert.equal(t.arrival,null);
  t.update(new Vector3(0,1000,0));assert.equal(t.building,true,'cancellation must restore ordinary streaming');
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});
test('cancelling a charge releases staged meshes and their pending uploads',()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);t.prepareMeshes=()=>{};t.prepareArrival(new Vector3(0,1000,0));const worker=t.arrival.worker;deliver(worker,packet(2),1);t.flushFrame();const record=[...t.arrival.records.values()][0];let disposed=false;record.mesh.geometry.addEventListener('dispose',()=>disposed=true);t.cancelArrival();assert.equal(t.arrival,null);assert.equal(t.warmQueue.length,0);assert.equal(disposed,false);t.flushFrame();assert.equal(disposed,true);assert.equal(t.active.size,0);}finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('a new charge reuses its workers and rejects late buffers from a cancelled route',()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);t.prepareArrival(new Vector3(0,1000,0));const worker=t.arrival.worker,oldId=t.arrival.id;t.prepareArrival(new Vector3(1000,0,0));assert.equal(t.arrival.worker,worker);deliver(worker,packet(2),oldId);assert.equal(t.arrival.plan.length,0);assert.equal(t.arrival.inbox.length,0);deliver(worker,packet(3),t.arrival.id);t.flushFrame();assert.equal(t.arrival.ready,true);assert.equal(t.arrival.plan[0].face,3);}finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('flight becomes ready after a stitched first surface while maximum detail continues in the worker',async()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{
  const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);
  let ready=false;const wait=t.prepareFlight(new Vector3(0,0,1000.1)).then(()=>{ready=true;});const preview=t.worker.sent.at(-1);assert.equal(preview.preview,true);assert.equal(ready,false);
  deliver(t.worker,packet(0),preview.id);t.flushFrame();await wait;assert.equal(ready,true);assert.equal(t.active.size,1);assert.equal(t.building,true);assert.equal(t.worker.sent.at(-1).preview,false);assert.ok(t.stats.flightReadyMilliseconds>=0);
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('closing or cancelling a pending flight surface releases the readiness waiter',async()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);
  const wait=t.prepareFlight(new Vector3(0,0,1000.1));t.cancelRequest();await wait;assert.equal(t.flightReady,null);assert.equal(t.building,false);
  const closing=t.prepareFlight(new Vector3(0,0,1000.1));t.dispose();await closing;t=null;
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('the first dense flight footprint can finish while cruise advances one kilometre',async()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:12000000},material,new Group(),material,camera);t.setFrameDriven(true);
  const first=t.prepareFlight(new Vector3(0,0,1000.1));deliver(t.worker,packet(0),t.id);t.flushFrame();await first;const detailedId=t.id;
  t.update(new Vector3(1000/12000,0,1000.1));assert.equal(t.id,detailedId,'cruise must not repeatedly cancel the first detailed job');assert.equal(t.flightRefining,true);
  const next={...packet(0),key:'0/3/4/4/dense/natural'};deliver(t.worker,next,detailedId);t.flushFrame();assert.equal(t.flightRefining,false);assert.ok(t.active.has(next.key));
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});

test('descent along the prepared corridor does not cancel its pending surface',()=>{
 const original=globalThis.Worker;globalThis.Worker=FakeWorker;let t,material;
 try{const camera=new PerspectiveCamera();camera.updateMatrixWorld();material=new MeshBasicNodeMaterial();t=new StreamingTerrain({radiusMeters:4000000},material,new Group(),material,camera);t.setFrameDriven(true);
  t.motion=new Vector3(0,0,-.15);t.update(new Vector3(0,0,1002),1,true);const id=t.id;
  assert.ok(t.view.predict[2]<1001.2,'vertical velocity predicts several seconds ahead');
  t.update(new Vector3(0,0,1001.2));assert.equal(t.id,id,'expected descent does not throw away the arriving grid');assert.equal(t.stats.cancelledJobs??0,0);
  t.update(new Vector3(2,0,1001.2));assert.ok(t.id>id,'leaving the forecast corridor still cancels stale work');
 }finally{t?.dispose();material?.dispose();globalThis.Worker=original;}
});
