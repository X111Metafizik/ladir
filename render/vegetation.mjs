import {postWorkerWorld} from '../io/worker-world.mjs';
import {regionalOptions} from '../io/regional-runtime.mjs';
import * as THREE from 'three/webgpu';
import {positionLocal,positionGeometry,positionWorld,sin,vec3} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {sampleTerrain} from '../core/terrain.mjs';
import {isDry} from '../core/ecology.mjs';
import {prewarmShadow} from './prewarm.mjs';
export function createVegetation(world,shared,terrain,camera){
 const group=new THREE.Group(),scale=1000/world.radiusMeters,materials=[],geometries=[],capacity=32768,dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
 group.matrixAutoUpdate=false;
 const fade=positionWorld.sub(shared.forestEye).length().mul(1/scale).smoothstep(1400,3000).oneMinus();
 for(let sp=0;sp<3;sp++){
  const alien=world.generationConfig.worldType==='alien',m=new THREE.MeshStandardNodeMaterial({color:alien?[0x514974,0x456d70,0x766089][sp]:[0x315f42,0x486a31,0x687e46][sp],roughness:.95,alphaToCoverage:true});
  m.opacityNode=fade;const p=positionLocal,sway=sin(shared.clock.mul(1.2).add(p.x.mul(3))).mul(positionGeometry.y.max(0).pow(2)).mul(.35*scale).mul(shared.wind);m.positionNode=p.add(vec3(sway,0,sway.mul(.5)));materials.push(m);
  const parts=[];
  if(sp===0){for(let i=0;i<3;i++){const g=new THREE.ConeGeometry(.25-i*.045,.53-i*.05,9);g.translate(0,.40+i*.20,0);parts.push(g);}}
  else{for(const [x,y,z,r] of [[0,.68,0,.31],[-.19,.52,.08,.23],[.16,.60,.13,.25],[.04,.48,-.19,.23]]){const g=new THREE.IcosahedronGeometry(r,1);g.scale(1,1.12,1);g.translate(x,y,z);parts.push(g);}}
  geometries.push(mergeGeometries(parts));parts.forEach(g=>g.dispose());
 }
 const lowGeometry=new THREE.IcosahedronGeometry(.36,1);lowGeometry.scale(1,1.25,1);lowGeometry.translate(0,.60,0);
 const trunkGeometry=new THREE.CylinderGeometry(.018,.032,.7,6),trunkMaterial=new THREE.MeshStandardNodeMaterial({color:0x514333,roughness:1,alphaToCoverage:true});trunkMaterial.opacityNode=fade;trunkGeometry.translate(0,.35,0);
 // Stable objects prevent per-tile shader compilation. Leaves/trunks share
 // storage transforms; regional tiles remain CPU data with a bounded cache.
 const pools=[];
 if(!isDry(world))for(let lod=0;lod<2;lod++)for(let sp=0;sp<3;sp++){
  const buffer=new THREE.StorageInstancedBufferAttribute(capacity,16);
  // In r186 DynamicDrawUsage forces another full upload on every binding,
  // including the trunk and shadow pass. Versioned updates preserve ranges.
  buffer.setUsage(THREE.StaticDrawUsage);
  const leaves=new THREE.InstancedMesh(lod?lowGeometry:geometries[sp],materials[sp],0),trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,0);
  for(const mesh of [leaves,trunks]){mesh.instanceMatrix=buffer;mesh.count=0;mesh.receiveShadow=true;mesh.castShadow=lod===0;mesh.layers.enable(1);mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;group.add(mesh);}
  leaves.userData.species=sp;trunks.userData.trunk=true;pools.push({leaves,trunks,buffer,count:0});
 }
 const dry=isDry(world),worker=dry?{postMessage(){},terminate(){}}:new Worker(new URL('../workers/lod.mjs',import.meta.url),{type:'module'});if(!dry)postWorkerWorld(worker,{type:'init',world,regionalOptions:regionalOptions()});
 const cache=new Map(),active=new Map(),inbox=[],eye=new THREE.Vector3(),last=new THREE.Vector3(1e9,0,0),packedEye=last.clone(),packedForward=new THREE.Vector3(),forward=new THREE.Vector3(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),sphere=new THREE.Sphere();
 let building=false,disposed=false,pending=null,queued=null,wanted=new Set(),id=0,done=null,timer=null,started=0,settleCursor=0,dirty=true,packedFov=0,packedAspect=0;
 const stats={tiles:0,instances:0,renderedInstances:0,cachedTiles:0,lod:'none',fadeMeters:[1400,3000],workerMilliseconds:0,rootOffsetMeters:-.25,revision:0,rootQueries:0,rootUpdates:0,poolMeshes:pools.length*2,poolRebuilds:0,poolOverflow:0};
 function settle(tile){
  for(const binding of tile.bindings){
   if(binding.surface.mesh?.parent===terrain.group)continue;
   const {item,direction}=binding;stats.rootQueries++;
   const ground=terrain.surfaceAt(item.direction,binding.surface)??item.elevationMeters;
   if(binding.ground!==undefined&&Math.abs(binding.ground-ground)<.002)continue;
   binding.ground=ground;stats.rootUpdates++;binding.position.copy(direction).multiplyScalar(1000+(ground-.25)*scale);dirty=true;
  }tile.revision=terrain.revision;
 }
 function build(t){
  const tile={bindings:[],revision:-1,items:t.items};
  for(const item of t.items){const direction=new THREE.Vector3(...item.direction);dummy.position.set(0,0,0);dummy.quaternion.setFromUnitVectors(up,direction);dummy.rotateY(item.rotation);dummy.scale.setScalar(item.heightMeters*scale);dummy.updateMatrix();tile.bindings.push({item,direction,position:new THREE.Vector3(),matrix:Float32Array.from(dummy.matrix.elements),surface:{mesh:null}});}
  settle(tile);return tile;
 }
 function pack(){
  if(!group.visible||!pools.length)return;
  eye.copy(shared.forestEye.value).add(shared.origin.value);camera.getWorldDirection(forward);
  if(!dirty&&eye.distanceToSquared(packedEye)<(45*scale)**2&&forward.dot(packedForward)>.999&&Math.abs(camera.fov-packedFov)<2&&camera.aspect===packedAspect)return;
  dirty=false;packedEye.copy(eye);packedForward.copy(forward);packedFov=camera.fov;packedAspect=camera.aspect;
  // Subtract the anchor in doubles before storing Float32 instance positions.
  group.position.copy(eye);group.updateMatrix();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth);
  for(const pool of pools)pool.count=0;
  for(const tile of active.values())for(const b of tile.bindings){
   const distance=b.position.distanceTo(eye)/scale;if(distance>3150)continue;
   sphere.center.copy(b.position).sub(shared.origin.value);sphere.radius=(b.item.heightMeters+180)*scale;
   if(distance>1050&&!frustum.intersectsSphere(sphere))continue;
   const pool=pools[(distance<1500?0:3)+b.item.species];
   if(pool.count>=capacity){stats.poolOverflow++;continue;}
   const offset=pool.count++*16,a=pool.buffer.array;a.set(b.matrix,offset);a[offset+12]=b.position.x-group.position.x;a[offset+13]=b.position.y-group.position.y;a[offset+14]=b.position.z-group.position.z;
  }
  stats.renderedInstances=0;
  for(const pool of pools){pool.leaves.count=pool.trunks.count=pool.count;stats.renderedInstances+=pool.count;if(pool.count){pool.buffer.clearUpdateRanges();pool.buffer.addUpdateRange(0,pool.count*16);pool.buffer.needsUpdate=true;}}
  stats.poolRebuilds++;stats.revision++;
 }
 function counts(){stats.tiles=active.size;stats.instances=[...active.values()].reduce((n,t)=>n+t.items.length,0);stats.cachedTiles=cache.size;dirty=true;}
 function schedule(){if(timer||disposed)return;timer=setTimeout(()=>{timer=null;if(disposed)return;try{
  const start=performance.now();do{const t=inbox.shift();if(!t)break;const tile=build(t);cache.set(t.key,tile);if(wanted.has(t.key))active.set(t.key,tile);if(!stats.firstVisibleMilliseconds)stats.firstVisibleMilliseconds=performance.now()-started;}while(inbox.length&&performance.now()-start<2);
  counts();if(inbox.length)schedule();else if(done){stats.workerMilliseconds=done.milliseconds;stats.regional=done.regional;stats.totalMilliseconds=performance.now()-started;done=null;building=false;pending?.resolve();pending=null;for(const k of cache.keys()){if(cache.size<=80)break;if(!active.has(k))cache.delete(k);}if(queued){const q=queued;queued=null;update(q).catch(()=>{});}}
 }catch(e){building=false;pending?.reject(e);pending=null;}},0);}
 worker.onerror=e=>{building=false;pending?.reject(Error(e.message));pending=null;};
 worker.onmessage=({data})=>{if(disposed||data.id!==id)return;if(data.type==='error'){building=false;pending?.reject(Error(data.message));pending=null;return;}
  if(data.type==='vegetation-plan'){wanted=new Set(data.keys);for(const k of active.keys())if(!wanted.has(k))active.delete(k);for(const k of wanted){const t=cache.get(k);if(t&&!active.has(k)){active.set(k,t);t.revision=-1;}}counts();}
  if(data.type==='vegetation-tile'){inbox.push(data.tile);schedule();}if(data.type==='vegetation-done'){done=data;schedule();}
 };
 function update(absolute){
  // Vegetation cannot reach the space camera. Avoid building unseen river /
  // stamp indexes on the main thread for every position crossed by a warp.
  const seaAltitude=(absolute.length()-1000)/scale;
  if(seaAltitude>=60000||isDry(world)){group.visible=false;stats.lod='none';return Promise.resolve();}
  const direction=absolute.clone().normalize().toArray(),altitude=seaAltitude-sampleTerrain(world,direction,{micro:false}).elevationMeters;
  group.visible=!isDry(world)&&altitude<2800;stats.lod=group.visible?(altitude<700?'near':'canopy'):'none';if(!group.visible||disposed)return Promise.resolve();
  const travel=absolute.distanceTo(last)/scale;if(building){if(travel>350)queued=absolute.clone();return pending?.promise??Promise.resolve();}if(travel<350)return Promise.resolve();
  last.copy(absolute);building=true;started=performance.now();stats.firstVisibleMilliseconds=0;const wait={};wait.promise=new Promise((resolve,reject)=>Object.assign(wait,{resolve,reject}));pending=wait;worker.postMessage({type:'vegetation',id:++id,direction,known:[...cache.keys()]});return wait.promise;
 }
 function settleTerrain(){if(!group.visible||disposed)return;const start=performance.now(),tiles=[...active.values()];for(let i=0;i<tiles.length;i++){const t=tiles[settleCursor++%tiles.length];if(t.revision!==terrain.revision)settle(t);if(performance.now()-start>1.2)break;}pack();}
 async function prewarm(renderer,camera,scene,target,light){
  if(!pools.length)return;const previous=renderer.getRenderTarget(),visible=group.visible;group.visible=true;
  for(const pool of pools){pool.leaves.count=pool.trunks.count=1;pool.leaves.setMatrixAt(0,new THREE.Matrix4());}
  try{renderer.setRenderTarget(target);await renderer.compileAsync(group,camera,scene);if(light)await prewarmShadow(renderer,group,scene,light);}
  finally{for(const pool of pools)pool.leaves.count=pool.trunks.count=0;group.visible=visible;renderer.setRenderTarget(previous);dirty=true;}
 }
 return {group,update,stats,prewarm,settleTerrain,dispose(){disposed=true;clearTimeout(timer);worker.terminate();pending?.resolve();for(const pool of pools){pool.leaves.dispose();pool.trunks.dispose();}cache.clear();active.clear();group.removeFromParent();[...geometries,lowGeometry,trunkGeometry].forEach(g=>g.dispose());[...materials,trunkMaterial].forEach(m=>m.dispose());}};
}
