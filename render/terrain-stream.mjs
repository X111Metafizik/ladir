import {postWorkerWorld} from '../io/worker-world.mjs';
import {regionalOptions} from '../io/regional-runtime.mjs';
import {TERRAIN_BUDGET,geometryBytes,recordBytes,patchBytes,uploadAllowance,terrainMemorySnapshot} from './terrain-budget.mjs';
import * as THREE from 'three/webgpu';
import {createShadowBatches} from './shadow-batches.mjs';
import {createTerrainBatches} from './terrain-batches.mjs';
import {createTerrainGrids} from './terrain-grids.mjs';
import {createWaterBatches} from './water-batches.mjs';
import {directionFace} from '../core/cube.mjs';
import {PATCH} from './terrain-data.mjs';
import {transitionGroups,tileId} from './stream-plan.mjs';
export class StreamingTerrain{
 constructor(world,material,group,waterMaterial,viewCamera,createGridMaterial){
  Object.assign(this,{world,material,group,waterMaterial,viewCamera});this.active=new Map();this.water=new Map();this.cache=new Map();this.ready=new Map();this.lookup=new Map();this.layer='natural';this.lastPosition=new THREE.Vector3(1e9,0,0);this.lastForward=new THREE.Vector3();this.building=false;this.id=0;this.revision=0;this.history=[];this.inbox=[];this.transitions=[];this.stats={patches:0,workerMilliseconds:0,maxLevel:0,cacheHits:0};
  this.gridMode=!!createGridMaterial;
  this.warmQueue=[];
  this.retiring=[];
  this.batches=createGridMaterial?createTerrainGrids(group,createGridMaterial):createTerrainBatches(group,material);
  this.waterBatches=createWaterBatches(group,waterMaterial);
  this.shadows=this.gridMode?{stats:this.batches.stats,add(){},remove(){},update(){},dispose(){}}:createShadowBatches(group,material);
  this.worker=new Worker(new URL('../workers/lod.mjs',import.meta.url),{type:'module'});postWorkerWorld(this.worker,{type:'init',world,regionalOptions:regionalOptions()});
  this.worker.onerror=e=>this.fail(Error(e.message));
  this.worker.onmessage=({data})=>{if(this.disposed||data.id!==this.id)return;try{
   if(data.type==='error')return this.fail(Error(data.message));
   if(data.type==='terrain-cache'){this.stats.bake=data.bake;if(this.done)this.done.bake=data.bake;return;}
   if(data.type==='terrain-plan'){this.transitions=data.transitions??transitionGroups([...this.active].map(([key,m])=>({...m.userData.patch,key})),data.patches);this.schedule();}
   if(data.type==='terrain-chunk'){this.inbox.push(...data.patches);this.schedule();}
   if(data.type==='terrain-done'){this.done=data;this.schedule();}
  }catch(e){this.fail(e);}};
 }
 fail(error){this.initialReady?.reject(error);this.initialReady=null;this.flightReady?.reject(error);this.flightReady=null;this.building=false;this.pending?.reject(error);this.pending=null;this.queued?.reject?.(error);this.queued=null;}
 retireReady(){
  const discarded=new Set();
  for(const [key,p]of this.ready){if(p.prepared)this.cache.set(key,p);else{discarded.add(p);this.stats.discardedBytes=(this.stats.discardedBytes??0)+recordBytes(p);this.retire(p);}}
  this.ready.clear();if(discarded.size)this.warmQueue=this.warmQueue.filter(p=>!discarded.has(p));
 }
 cancelRequest(){
  this.worker.postMessage({type:'cancel-terrain'});
  this.initialReady?.resolve({cancelled:true});this.initialReady=null;
  this.flightReady?.resolve();this.flightReady=null;this.flightRefining=false;
  ++this.id;clearTimeout(this.timer);this.timer=null;this.inbox=[];this.done=null;this.transitions=[];
  this.retireReady();this.pending?.resolve();this.pending=null;this.queued?.resolve?.();this.queued=null;this.building=false;
 }
 prepareInitial(camera,detail=1){
  // Publish a complete, stitched first footprint, then refine with the exact
  // same selector and sample density as normal streaming. No hole is exposed
  // while the dense footprint is still in the worker/upload queue.
  this.cancelRequest();
  if((camera.length()-1000)*this.world.radiusMeters/1000>=8000){
   // A high orbit already uses a small screen-error-selected mesh. Forcing
   // an 8-cell preview there creates MORE tiles than the final 20-cell grid.
   const detailReady=this.update(camera,detail,true);return {surface:detailReady.then(result=>({cancelled:!result?.complete})),detail:detailReady};
  }
  const ready={};ready.promise=new Promise((resolve,reject)=>Object.assign(ready,{resolve,reject}));this.initialReady=ready;
  this.previewNext=true;const complete=this.update(camera,detail,true);
  complete.catch(error=>this.fail(error));
  return {surface:ready.promise,detail:complete};
 }
 prepareFlight(camera,detail=1){
  // Start from a complete stitched footprint, without blocking the cockpit on
  // the final dense worker job. Keep existing close-up geometry when available.
  const reference={},direction=camera.clone().normalize().toArray();this.surfaceAt(direction,reference);
  const reuse=this.layer==='natural'&&reference.mesh?.userData.patch.level>=12;
  this.cancelRequest();this.layer='natural';this.flightRefining=true;this.stats.flightReusedSurface=!!reuse;
  if(reuse){this.stats.flightReadyMilliseconds=0;return Promise.resolve();}
  const ready={};ready.promise=new Promise((resolve,reject)=>Object.assign(ready,{resolve,reject}));this.flightReady=ready;
  this.previewNext=true;this.update(camera,detail,true).catch(e=>this.fail(e));return ready.promise;
 }
 prepareArrivalWorker(){if(this.arrivalWorker||this.disposed)return;this.arrivalWorker=new Worker(new URL('../workers/lod.mjs',import.meta.url),{type:'module'});postWorkerWorld(this.arrivalWorker,{type:'init',world:this.world,workerCount:2,regionalOptions:regionalOptions()});}
 prepareArrival(camera,detail=1,view=null){
  this.cancelArrival();if(this.disposed)return;
  // The current complete surface stays visible. Stop jobs for fleeting warp
  // positions so the destination gets the worker and transfer budget.
  this.cancelRequest();this.prepareArrivalWorker();const a=this.arrival={id:this.arrivalId=(this.arrivalId??0)+1,camera:camera.clone(),detail,view,inbox:[],records:new Map(),plan:[],done:false,ready:false,arrived:false,started:performance.now()};
  Object.assign(this.stats,{arrivalReadyBeforeJump:false,arrivalDetailReadyBeforeJump:false,arrivalPreparedMilliseconds:null,arrivalDetailMilliseconds:null,arrivalWaitMilliseconds:null});
  const worker=a.worker=this.arrivalWorker;
  worker.onmessage=({data})=>{const stage=a.refinement??a;if(this.arrival!==a||this.disposed||data.id!==stage.id)return;
   if(data.type==='error'){worker.onerror({message:data.message});return;}
   if(data.type==='terrain-plan'){stage.plan=data.patches;this.stats.arrivalPlanMilliseconds=performance.now()-a.started;}
   if(data.type==='terrain-chunk'){stage.inbox.push(...data.patches);if(!a.firstChunk){a.firstChunk=true;this.stats.arrivalFirstChunkMilliseconds=performance.now()-a.started;}}
   if(data.type==='terrain-done'){stage.done=true;this.stats.arrivalWorkerMilliseconds=data.milliseconds;if(stage===a)this.startArrivalRefinement(a);}
   this.schedule();
  };
  worker.onerror=e=>{if(this.arrival!==a)return;this.stats.arrivalError=e.message;const resume=a.arrived;this.cancelArrival();worker.postMessage({type:'dispose'});this.arrivalWorker=null;if(resume){this.previewNext=true;this.update(a.camera,a.detail,true).catch(error=>this.fail(error));}};
  worker.postMessage({type:'terrain',id:a.id,camera:camera.toArray(),view:null,detail,layer:this.layer,preview:true,arrival:true,known:[...this.active.keys(),...this.cache.keys()]});
 }
 releaseArrival(a){const records=new Set([...a.records.values(),...(a.refinement?.records.values()??[])]);this.warmQueue=this.warmQueue.filter(r=>!records.has(r));const retained=new Set([...this.active.values(),...[...this.cache.values(),...this.ready.values()].map(r=>r.mesh)]);for(const r of records)if(!retained.has(r.mesh))this.retire(r);}
 cancelArrival(){const a=this.arrival;if(!a)return;this.arrival=null;a.worker?.postMessage({type:'cancel-terrain'});this.releaseArrival(a);this.lastPosition.set(1e9,0,0);}
 arrivalRecord(a,stage,key){return stage.records.get(key)??a.records.get(key)??this.cache.get(key)??this.ready.get(key)??(this.active.has(key)?{mesh:this.active.get(key),water:this.water.get(key),prepared:true}:null);}
 arrive(camera,detail=1){
  this.cancelRequest();const a=this.arrival;
  if(!a){this.previewNext=true;return this.update(camera,detail,true);}
  a.camera.copy(camera);a.detail=detail;a.readyAtJump=a.ready;a.detailAtJump=!!a.refinement?.ready;a.arrived=true;a.arrivedAt=performance.now();this.finishArrival();return Promise.resolve();
 }
 startArrivalRefinement(a){
  if(a.refinement||!a.done||!a.plan.length)return;
  const fine=a.refinement={id:++this.arrivalId,inbox:[],records:new Map(),plan:[],done:false,ready:false};
  // The preview worker is finished, but its GPU upload may still be queued.
  // Reuse that same pool immediately; do not serialize CPU work behind upload.
  // Coarse inbox records remain known and are drained before fine records.
  this.stats.arrivalFineStartedMilliseconds=performance.now()-a.started;
  a.worker.postMessage({type:'terrain',id:fine.id,camera:a.camera.toArray(),view:a.view,detail:a.detail,layer:this.layer,preview:false,arrival:true,known:[...this.active.keys(),...this.cache.keys(),...a.records.keys(),...a.inbox.map(p=>p.key)]});
 }
 finishArrival(){
  const a=this.arrival;if(!a)return;
  for(const stage of [a,a.refinement].filter(Boolean))if(!stage.ready&&stage.done&&!stage.inbox.length&&stage.plan.length&&stage.plan.every(p=>this.arrivalRecord(a,stage,p.key)?.prepared)){
   stage.ready=true;this.stats[stage===a?'arrivalPreparedMilliseconds':'arrivalDetailMilliseconds']=performance.now()-a.started;
   if(stage===a){
    this.stats.arrivalPatches=a.plan.length;
    this.startArrivalRefinement(a);
   }
  }
  if(!a.arrived)return;
  const selected=a.refinement?.ready?a.refinement:a.ready&&!a.previewCommitted?a:null;if(!selected)return;
  for(const p of selected.plan){const r=this.arrivalRecord(a,selected,p.key);if(!this.active.has(p.key))this.cache.set(p.key,r);}
  const keys=new Set(selected.plan.map(p=>p.key));
  this.started=performance.now();this.transitions=[{remove:[...this.active.keys()].filter(k=>!keys.has(k)),add:[...keys].filter(k=>!this.active.has(k))}];this.commit();
  this.stats.arrivalSwapMilliseconds=performance.now()-this.started;
  if(!a.previewCommitted){this.arrivalRevision=(this.arrivalRevision??0)+1;this.stats.arrivalWaitMilliseconds=performance.now()-a.arrivedAt;}
  a.previewCommitted=true;this.stats.arrivalReadyBeforeJump=a.readyAtJump;this.stats.arrivalDetailReadyBeforeJump=a.detailAtJump;
  if(selected!==a){this.stats.arrivalDetailWaitMilliseconds=performance.now()-a.arrivedAt;this.arrival=null;this.releaseArrival(a);this.update(a.camera,a.detail,true).catch(error=>this.fail(error));}
 }
 geometry(positions,normals,indices,bounds){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('normal',new THREE.BufferAttribute(normals,3));g.setIndex(new THREE.BufferAttribute(indices,1));if(bounds)g.boundingSphere=new THREE.Sphere(new THREE.Vector3(...bounds.center),bounds.radius);else g.computeBoundingSphere();return g;}
 schedule(){if(this.disposed)return;this.needsDrain=true;if(this.frameDriven||this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.needsDrain=false;this.drain();},0);}
 setFrameDriven(value){this.frameDriven=value;if(value){clearTimeout(this.timer);this.timer=null;}else if(this.needsDrain)this.schedule();}
 flushFrame(){this.stats.framePlannedUploadBytes=0;if(this.needsDrain){this.needsDrain=false;this.drain();}this.reap();if(performance.now()-(this.memoryTime??0)>500){this.measureMemory();this.memoryTime=performance.now();if(this.stats.cacheBytes>TERRAIN_BUDGET.cacheBytes)this.trim();}}
 retire(record){this.retiring.push(record);if(!this.frameDriven&&!this.reapTimer)this.reapTimer=setTimeout(()=>{this.reapTimer=null;this.reap();},16);}
 reap(){const start=performance.now();let count=0;while(this.retiring.length&&count++<8){const r=this.retiring.shift();r.mesh.geometry.dispose();r.water?.geometry.dispose();if(performance.now()-start>.7)break;}this.stats.cleanupMilliseconds=(this.stats.cleanupMilliseconds??0)+performance.now()-start;if(this.retiring.length&&!this.frameDriven&&!this.reapTimer)this.reapTimer=setTimeout(()=>{this.reapTimer=null;this.reap();},16);}
 drain(){if(this.disposed)return;try{const start=performance.now(),deadline=start+2.5;let count=0;this.batches.beginFrame?.();
  const stage=this.arrival?.inbox.length?this.arrival:this.arrival?.refinement??this.arrival;
  while((this.inbox.length||stage?.inbox.length)&&count++<8&&performance.now()-start<1.25){const arrival=!!stage?.inbox.length,p=arrival?stage.inbox.shift():this.inbox.shift(),g=this.geometry(p.positions,p.normals,p.indices,p.bounds);g.setAttribute('color',new THREE.BufferAttribute(p.colors,3));g.setAttribute('surface',new THREE.BufferAttribute(p.surface,4));g.setAttribute('climate',new THREE.BufferAttribute(p.climate,2));const mesh=new THREE.Mesh(g,this.material);mesh.position.set(...p.center);mesh.updateMatrix();mesh.matrixAutoUpdate=false;mesh.receiveShadow=true;mesh.castShadow=false;mesh.userData.patch=p.patch;let water=null;
   if(p.waterIndices.length){const w=this.geometry(p.waterPositions,p.waterNormals,p.waterIndices,p.waterBounds);w.setAttribute('shallows',new THREE.BufferAttribute(p.shallows,1));water=new THREE.Mesh(w,this.waterMaterial);water.position.set(...p.center);water.updateMatrix();water.matrixAutoUpdate=false;water.userData.patch=p.patch;}const record={mesh,water,prepared:!this.prepareMeshes,delivery:{worker:arrival?this.arrivalWorker:this.worker,id:arrival?stage.id:this.id,bytes:patchBytes(p)}};if(record.prepared)record.delivery.worker?.postMessage({type:"terrain-consumed",id:record.delivery.id,bytes:record.delivery.bytes});(arrival?stage.records:this.ready).set(p.key,record);if(!record.prepared)this.warmQueue.push(record);
  }
  this.warm(deadline);this.commit(deadline);this.finishArrival();if(this.transitions.length||this.inbox.length||this.arrival?.inbox.length||this.arrival?.refinement?.inbox.length)this.schedule();else if(this.done&&!this.transitions.length&&!this.warmQueue.length)this.finish();
  this.stats.drainMaxMilliseconds=Math.max(this.stats.drainMaxMilliseconds??0,performance.now()-start);
 }catch(e){this.fail(e);}}
 warm(deadline=Infinity){
  if(this.disposed||!this.warmQueue.length)return;
  const start=performance.now();let count=0,bytes=0;
  // A slow total frame is not proof that a 70 KiB buffer upload is expensive.
  // Use measured preparation cost + GPU completion pressure before throttling
  // a growing queue. The original maximum byte cap and CPU deadline still apply.
  const cheapUpload=this.uploadCpuAverage!==undefined&&this.uploadCpuAverage<.6&&(this.cpuAverage??4)<9&&(this.queueWaitMs??0)<25;
  const allowance=cheapUpload?TERRAIN_BUDGET.maxUploadBytes:uploadAllowance(this.cpuAverage);
  this.stats.uploadAllowanceBytes=allowance;
  while(this.warmQueue.length&&count<8&&performance.now()-start<1.25&&performance.now()<deadline){
   const next=this.warmQueue[0],nextBytes=next.mesh.geometry.attributes.position.count*64+(next.water?geometryBytes(next.water.geometry):0);
   if(this.gridMode&&this.batches.canPrepare&&!this.batches.canPrepare(next.mesh))break;
   // Two dense 33x33 tiles total 136 KiB. A 144 KiB ceiling admits both
   // instead of wasting almost half of a frame's transfer allowance.
   if(count&&bytes+nextBytes>allowance)break;bytes+=nextBytes;count++;
   const r=this.warmQueue.shift();if(this.gridMode)this.batches.prepare(r.mesh);
   this.prepareMeshes?.(this.gridMode?(r.water?[r.water]:[]):(r.water?[r.mesh,r.water]:[r.mesh]));
   this.stats.framePlannedUploadBytes=bytes;this.stats.maxPlannedUploadBytes=Math.max(this.stats.maxPlannedUploadBytes??0,bytes);
   r.prepared=true;if(r.delivery){r.delivery.worker?.postMessage({type:"terrain-consumed",id:r.delivery.id,bytes:r.delivery.bytes});delete r.delivery;}this.stats.preparedMeshes=(this.stats.preparedMeshes??0)+1;
  }
  if(count){const elapsed=performance.now()-start;this.uploadCpuAverage=(this.uploadCpuAverage??elapsed)*.8+elapsed*.2;this.stats.uploadCpuAverageMilliseconds=this.uploadCpuAverage;this.stats.uploadCpuMaxMilliseconds=Math.max(this.stats.uploadCpuMaxMilliseconds??0,elapsed);}
  if(this.warmQueue.length)this.schedule();
 }

 commit(deadline=Infinity){const started=performance.now();let changed=false,groups=0;this.transitions=this.transitions.filter(t=>{
  // A connected seam/stitch transaction is indivisible. Yield only BETWEEN
  // groups; record unavoidable single-group overruns instead of exposing holes.
  if(groups&&performance.now()>=deadline)return true;
  if(!t.add.every(k=>this.active.has(k)||(this.ready.get(k)??this.cache.get(k))?.prepared))return true;
  groups++;
  for(const k of t.remove){const mesh=this.active.get(k),water=this.water.get(k);if(mesh){this.batches.remove(mesh);this.shadows.remove(mesh);this.group.remove(mesh);if(water){this.waterBatches?.remove(water);this.group.remove(water);}this.active.delete(k);this.lookup.delete(tileId(mesh.userData.patch));this.water.delete(k);this.cache.set(k,{mesh,water,prepared:true});changed=true;}}
  for(const k of t.add){if(this.active.has(k))continue;const p=this.ready.get(k)??this.cache.get(k);if(this.cache.has(k))this.stats.cacheHits++;this.ready.delete(k);this.cache.delete(k);this.batches.add(p.mesh);this.shadows.add(p.mesh);this.active.set(k,p.mesh);this.lookup.set(tileId(p.mesh.userData.patch),p.mesh);this.group.add(p.mesh);if(this.stats.nearVisibleMilliseconds===null&&p.mesh.userData.patch.level>=17&&p.mesh.userData.patch.priority<1500)this.stats.nearVisibleMilliseconds=performance.now()-this.started;if(p.water){this.water.set(k,p.water);this.group.add(p.water);this.waterBatches?.add(p.water);}changed=true;}return false;
 });if(changed){this.revision++;this.stats.patches=this.active.size;let maxLevel=3;for(const mesh of this.active.values())maxLevel=Math.max(maxLevel,mesh.userData.patch.level);this.stats.maxLevel=maxLevel;if(!this.firstVisible){this.firstVisible=true;this.stats.firstVisibleMilliseconds=performance.now()-this.started;}}
  const elapsed=performance.now()-started;this.stats.commitMaxMilliseconds=Math.max(this.stats.commitMaxMilliseconds??0,elapsed);if(groups&&performance.now()>deadline)this.stats.commitBudgetOverruns=(this.stats.commitBudgetOverruns??0)+1;
 }
 finish(){this.stats.workerMilliseconds=this.done.milliseconds;this.stats.samples=this.done.samples;this.stats.bake=this.done.bake;this.stats.planningMs=this.done.planningMs;this.stats.plannerSamples=this.done.plannerSamples;this.stats.production=this.done.production;this.stats.kernels=this.done.kernels;this.stats.plannerKernel=this.done.plannerKernel;this.stats.regions=this.done.regions;this.stats.plannerRegion=this.done.plannerRegion;this.stats.workers=this.done.workers;this.stats.totalMilliseconds=performance.now()-this.started;this.done=null;this.history.push({...this.stats,preview:!!this.preview});if(this.history.length>24)this.history.shift();
  if(this.preview){this.preview=false;if(this.initialReady){this.stats.initialSurfaceMilliseconds=performance.now()-this.started;this.initialReady.resolve({cancelled:false});this.initialReady=null;}if(this.flightReady){this.stats.flightReadyMilliseconds=performance.now()-this.started;this.flightReady.resolve();this.flightReady=null;}this.request();return;}
  this.flightRefining=false;this.building=false;this.pending?.resolve({complete:true});this.pending=null;this.trim();const q=this.queued;this.queued=null;if(q)this.update(q.camera,q.detail,q.force).then(q.resolve??(()=>{}),q.reject??(()=>{}));
 }
 measureMemory(){
  Object.assign(this.stats,terrainMemorySnapshot(this));
 }
 noteFrameCost(ms){this.cpuAverage=(this.cpuAverage??ms)*.9+ms*.1;}
 trim(){
  if(this.disposed)return;this.measureMemory();
  const pinned=new Set(this.transitions.flatMap(t=>t.add));for(const p of this.arrival?.plan??[])pinned.add(p.key);for(const p of this.arrival?.refinement?.plan??[])pinned.add(p.key);
  const start=performance.now();let reclaimed=0;
  for(const [k,p]of this.cache){if(this.cache.size<=200&&this.stats.cacheBytes-reclaimed<=TERRAIN_BUDGET.cacheBytes)break;if(!p.prepared||pinned.has(k))continue;
   reclaimed+=recordBytes(p);this.retire(p);this.cache.delete(k);if(performance.now()-start>1.2)break;
  }
  this.stats.cacheBytes-=reclaimed;
  if(this.cache.size>200||this.stats.cacheBytes>TERRAIN_BUDGET.cacheBytes){clearTimeout(this.trimTimer);this.trimTimer=setTimeout(()=>this.trim(),40);}
 }

 request(){this.worker.postMessage({type:'terrain',id:++this.id,camera:this.lastPosition.toArray(),view:this.view,detail:this.detail,layer:this.layer,referenceResolution:this.referenceResolution,preview:this.preview,known:[...this.active.keys(),...this.cache.keys()],previous:[...this.active].map(([key,m])=>({...m.userData.patch,key}))});}
 update(camera,detail=1,force=false){
  if(this.disposed||this.arrival)return Promise.resolve();const scale=1000/this.world.radiusMeters,forward=this.viewCamera.getWorldDirection(new THREE.Vector3()),travel=camera.distanceTo(this.lastPosition)/scale,altitude=(camera.length()-1000)/scale;
  const now=performance.now();this.observedMotion??=new THREE.Vector3();
  if(this.observedCamera){const dt=(now-this.observedTime)/1000,travel=camera.distanceTo(this.observedCamera)/scale;
   // Use actual camera translation for descent/zoom, not just engine speed.
   // Ignore teleports, long pauses and synthetic back-to-back updates.
   if(dt>=.016){if(dt<.75&&travel<4000)this.observedMotion.lerp(camera.clone().sub(this.observedCamera).multiplyScalar(1/dt),.55);else this.observedMotion.set(0,0,0);this.observedCamera.copy(camera);this.observedTime=now;}
  }else{this.observedCamera=camera.clone();this.observedTime=now;}
  if(this.building){
   // Let the first dense footprint finish during normal cruise. Cancelling it
   // every 700 m can starve refinement forever when its cold job takes >3.6 s.
   // Motion along the forecast corridor is expected, not obsolete work.
   // Cancelling it on radial descent discarded the very tiles prepared ahead.
   let uncovered=travel;
   if(this.view?.predict){const delta=new THREE.Vector3(...this.view.predict).sub(this.lastPosition),length=delta.lengthSq();if(length>1e-12){const t=Math.max(0,Math.min(1,camera.clone().sub(this.lastPosition).dot(delta)/length));uncovered=camera.distanceTo(delta.multiplyScalar(t).add(this.lastPosition))/scale;}}
   const obsolete=(uncovered>Math.max(this.flightRefining?2500:700,Math.abs(altitude)*.3)||forward.dot(this.lastForward)<.65)&&performance.now()-(this.retargeted??0)>250;
   if(obsolete){
    // Reuse completed buffers, retain the visible watertight mesh, and let the
    // worker abandon its old view at the next yield instead of queuing seconds
    // of work for a location the camera has already left.
    this.worker.postMessage({type:"cancel-terrain"});this.stats.cancelledJobs=(this.stats.cancelledJobs??0)+1;
    ++this.id;clearTimeout(this.timer);this.timer=null;this.inbox=[];this.done=null;this.transitions=[];
    this.retireReady();this.pending?.resolve();this.pending=null;this.queued?.resolve?.();this.queued=null;this.building=false;this.retargeted=performance.now();
    return this.update(camera,detail,true);
   }
   if(this.queued?.force&&!force){this.queued.camera.copy(camera);return this.pending?.promise??Promise.resolve();}if(force||travel>55||forward.dot(this.lastForward)<.99){this.queued?.resolve?.();const q={camera:camera.clone(),detail,force};this.queued=q;if(force)return new Promise((resolve,reject)=>Object.assign(q,{resolve,reject}));}return this.pending?.promise??Promise.resolve();
  }
  if(!force&&travel<Math.max(45,altitude>60000?altitude*.05:45)&&forward.dot(this.lastForward)>.997)return Promise.resolve();
  this.lastPosition.copy(camera);this.lastForward.copy(forward);this.detail=detail;this.preview=!!this.previewNext;this.previewNext=false;this.started=performance.now();this.firstVisible=false;this.stats.nearVisibleMilliseconds=null;this.building=true;
  const right=new THREE.Vector3().setFromMatrixColumn(this.viewCamera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.viewCamera.matrixWorld,1),tanY=Math.tan(Math.max(this.minimumFov??0,this.viewCamera.fov)*Math.PI/360);
  const measuredDescent=this.observedMotion.dot(camera)/camera.length()/scale<-40,motion=measuredDescent?this.observedMotion:this.motion;
  const descending=motion&&motion.dot(camera)/camera.length()/scale<-40;
  const predict=motion?camera.clone().addScaledVector(motion,Math.min(descending?6:2.4,(descending?4000:1500)/Math.max(1,motion.length()/scale))).toArray():null;
  this.view={viewportHeight:this.viewCamera.userData.viewportHeight??1000,predict,descending:!!descending,forward:forward.toArray(),right:right.toArray(),up:up.toArray(),tanY,tanX:tanY*this.viewCamera.aspect};const p={};p.promise=new Promise((resolve,reject)=>Object.assign(p,{resolve,reject}));this.pending=p;this.request();return p.promise;
 }
 // Interpolate the displayed triangle, including stitched boundaries. Tree
 // roots follow the mesh the player actually sees, not an unrendered heightfield.
 surfaceAt(direction,reference=null){const [face,u,v]=directionFace(direction);for(let level=this.stats.maxLevel;level>=3;level--){const n=2**level,x=Math.min(n-1,Math.max(0,Math.floor((u+1)*n/2))),y=Math.min(n-1,Math.max(0,Math.floor((v+1)*n/2))),m=this.lookup.get(`${face}/${level}/${x}/${y}`);if(!m)continue;if(reference)reference.mesh=m;const p=m.userData.patch,N=p.resolution??PATCH,gx=Math.max(0,Math.min(N-1e-7,(u-p.u)/p.size*N)),gy=Math.max(0,Math.min(N-1e-7,(v-p.v)/p.size*N)),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,a=iy*(N+1)+ix,b=a+1,c=a+N+1,d=c+1,ids=fx+fy<=1?[a,b,c]:[b,d,c],weights=fx+fy<=1?[1-fx-fy,fx,fy]:[1-fy,fx+fy-1,1-fx],pos=m.geometry.attributes.position.array;let radius=0;for(let k=0;k<3;k++){let coordinate=m.position.getComponent(k);for(let j=0;j<3;j++)coordinate+=pos[ids[j]*3+k]*weights[j];radius+=coordinate*direction[k];}return (radius-1000)*this.world.radiusMeters/1000;}if(reference)reference.mesh=null;return null;}
 setLayer(layer,camera,detail){this.layer=layer;return this.update(camera,detail,true);}
 dispose(){this.disposed=true;this.initialReady?.resolve({cancelled:true});this.initialReady=null;this.flightReady?.resolve();this.flightReady=null;this.cancelArrival();this.arrivalWorker?.postMessage({type:'dispose'});this.arrivalWorker=null;this.warmQueue.length=0;this.waterBatches?.dispose();this.batches.dispose();this.shadows.dispose();clearTimeout(this.timer);clearTimeout(this.trimTimer);clearTimeout(this.reapTimer);for(const r of this.retiring){r.mesh.geometry.dispose();r.water?.geometry.dispose();}this.retiring.length=0;this.worker.terminate();this.pending?.resolve();this.queued?.resolve?.();const all=[...[...this.active].map(([k,mesh])=>({mesh,water:this.water.get(k)})),...this.cache.values(),...this.ready.values()];for(const {mesh,water}of all){mesh.removeFromParent();mesh.geometry.dispose();water?.removeFromParent();water?.geometry.dispose();}this.active.clear();this.water.clear();this.cache.clear();this.ready.clear();}
}



