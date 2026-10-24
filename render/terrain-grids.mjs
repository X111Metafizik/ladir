import {TERRAIN_BUDGET} from './terrain-budget.mjs';
import {allocateResidentStorage} from './terrain-upload.mjs';
import {InstancedBufferGeometry,BufferAttribute,InstancedBufferAttribute,StorageBufferAttribute,Mesh,Vector3,Frustum,Matrix4,Sphere,StaticDrawUsage} from 'three/webgpu';
import {storage,attribute,vertexIndex,vec3,vec4,transformNormalToView,normalLocal,Fn} from 'three/tsl';

// Reusable vertex grids with resident, independently updated sample slots.
// Keep the exact stitched XYZ/channels supplied by the terrain worker (a pure
// radial height texture would undo chord stitching at mixed LOD boundaries).
// Collision/picking retains its CPU mesh. No merged geometry is rebuilt.
export const GRID_SLOT_FLOATS=16;
export function shadowGridIndex(geometry,resolution){
 // A decimated caster cuts across the visible relief and stitched borders.
 // Its changing intersections create dark crawling patches on the receiver.
 // Reuse the exact surface topology; the light frustum limits its footprint.
 return geometry.index.clone();
}
export function writeGridSlot(output,start,geometry){
 const a=geometry.attributes,p=a.position.array,n=a.normal.array,c=a.color.array,s=a.surface.array,h=a.climate?.array;
 for(let i=0;i<a.position.count;i++){
  const j=start+i*16,v=i*3,k=i*4;
  output[j]=p[v];output[j+1]=p[v+1];output[j+2]=p[v+2];output[j+3]=n[v];
  output[j+4]=n[v+1];output[j+5]=n[v+2];output[j+6]=c[v];output[j+7]=c[v+1];
  output[j+8]=c[v+2];output[j+9]=s[k];output[j+10]=s[k+1];output[j+11]=s[k+2];
  output[j+12]=s[k+3];output[j+13]=h?.[i*2]??0;output[j+14]=h?.[i*2+1]??0;output[j+15]=0;
 }
}
export function createTerrainGrids(group,createMaterial,{capacity=512}={}){
 const banks=[],slots=new Map(),active=new Set(),frustum=new Frustum(),shadowFrustum=new Frustum(),matrix=new Matrix4(),sphere=new Sphere(),anchor=new Vector3();
 let manager=null,renderer=null,disposed=false;
 const stats={batches:0,pending:0,buildMilliseconds:0,residentSlots:0,visiblePatches:0,allocatedBytes:0,uploadedBytes:0,frameUploadBytes:0,maxFrameUploadBytes:0,gridAllocations:0,initialAllocationBytes:0,initialAllocationMilliseconds:0,maxAllocationMilliseconds:0,uploadMilliseconds:0,maxUploadMilliseconds:0,emptyCacheBytes:0,frameAllocationBytes:0,frameAllocations:0,avoidedInitialCopyBytes:0,revision:0};
 function makeBank(mesh){
  const allocationStart=performance.now();
  const count=mesh.geometry.attributes.position.count,key=`${count}/${mesh.geometry.index.count}`;
  // Dense 33x33 grids must not trigger a 34 MB allocation for the first tile.
  // Grow resident banks in bounded blocks; sample uploads retain their budget.
  const bankCapacity=Math.min(capacity,Math.max(1,Math.floor(TERRAIN_BUDGET.bankBytes/(count*64))));
  const buffer=new StorageBufferAttribute(bankCapacity*count*4,4);buffer.setUsage(StaticDrawUsage);
  const data=storage(buffer,'vec4',bankCapacity*count*4).toReadOnly(),index=attribute('patchSlot','uint').mul(count).add(vertexIndex).mul(4);
  const a=data.element(index),b=data.element(index.add(1)),c=data.element(index.add(2)),d=data.element(index.add(3));
  const normal=vec3(a.w,b.xy);
  const fields={position:Fn(()=>{normalLocal.assign(normal);return a.xyz.add(attribute('patchOffset','vec3'));})(),normalWorld:normal.toVarying().normalize(),normalView:transformNormalToView(normal).toVarying().normalize(),color:vec3(b.zw,c.x).toVarying(),surface:vec4(c.yzw,d.x).toVarying(),climate:d.yz.toVarying()};
  const material=createMaterial(fields);
  function instanceGeometry(shadow){
   const g=new InstancedBufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(count*3),3));g.setAttribute('normal',new BufferAttribute(new Float32Array(count*3),3));g.setIndex(shadow?shadowGridIndex(mesh.geometry,mesh.userData.patch.resolution):mesh.geometry.index.clone());
   const ids=new InstancedBufferAttribute(new Uint32Array(bankCapacity),1),offsets=new InstancedBufferAttribute(new Float32Array(bankCapacity*3),3);
   g.setAttribute('patchSlot',ids);g.setAttribute('patchOffset',offsets);g.instanceCount=0;
   const m=new Mesh(g,material);m.frustumCulled=false;m.matrixAutoUpdate=false;m.userData.terrainGrid=true;m.castShadow=shadow;m.receiveShadow=!shadow;
   if(shadow)m.layers.set(1);group.add(m);return {g,m,ids,offsets};
  }
  const bank={key,count,capacity:bankCapacity,buffer,material,free:Array.from({length:bankCapacity},(_,i)=>bankCapacity-1-i),beauty:instanceGeometry(false),shadow:instanceGeometry(true)};banks.push(bank);
  stats.gridAllocations++;stats.initialAllocationBytes+=buffer.array.byteLength;stats.batches=banks.length;stats.allocatedBytes+=buffer.array.byteLength;
  if(allocateResidentStorage(renderer,buffer))stats.avoidedInitialCopyBytes+=buffer.array.byteLength;else manager?.update(buffer,3);
  const elapsed=performance.now()-allocationStart;stats.initialAllocationMilliseconds+=elapsed;stats.maxAllocationMilliseconds=Math.max(stats.maxAllocationMilliseconds,elapsed);stats.frameAllocationBytes+=buffer.array.byteLength;stats.frameAllocations++;
  return bank;
 }
 function prepare(mesh){
  if(slots.has(mesh))return;
  const start=performance.now(),g=mesh.geometry,count=g.attributes.position.count,key=`${count}/${g.index.count}`;
  const bank=banks.find(b=>b.key===key&&b.free.length)??makeBank(mesh),slot=bank.free.pop(),offset=slot*count*16;
  writeGridSlot(bank.buffer.array,offset,g);bank.buffer.addUpdateRange(offset,count*16);bank.buffer.needsUpdate=true;
  const uploadStart=performance.now();manager?.update(bank.buffer,3);const uploadMs=performance.now()-uploadStart;stats.uploadMilliseconds+=uploadMs;stats.maxUploadMilliseconds=Math.max(stats.maxUploadMilliseconds,uploadMs);
  const bytes=count*64;stats.uploadedBytes+=bytes;stats.frameUploadBytes+=bytes;stats.maxFrameUploadBytes=Math.max(stats.maxFrameUploadBytes,stats.frameUploadBytes);stats.residentSlots++;
  const release=()=>{if(!slots.delete(mesh))return;bank.free.push(slot);active.delete(mesh);stats.residentSlots--;g.removeEventListener('dispose',release);
   // Retain one empty bank per topology for reuse, release additional empty
   // banks after camera changes instead of retaining the historical peak.
   if(bank.free.length===bank.capacity&&banks.some(b=>b!==bank&&b.key===bank.key&&b.free.length===b.capacity)){
    banks.splice(banks.indexOf(bank),1);manager?.delete(bank.buffer);for(const t of [bank.beauty,bank.shadow]){t.m.removeFromParent();t.g.dispose();}bank.material.dispose();stats.batches=banks.length;stats.allocatedBytes-=bank.buffer.array.byteLength;
   }
  };
  slots.set(mesh,{bank,slot,release});g.addEventListener('dispose',release);stats.buildMilliseconds+=performance.now()-start;
 }
 function add(mesh){prepare(mesh);active.add(mesh);mesh.visible=false;stats.revision++;}
 function remove(mesh){active.delete(mesh);mesh.visible=false;stats.revision++;}
 function update(camera,absolute,origin,shadowCamera){
  if(disposed||!camera)return;anchor.copy(origin);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix,camera.coordinateSystem,camera.reversedDepth);
  if(shadowCamera){matrix.multiplyMatrices(shadowCamera.projectionMatrix,shadowCamera.matrixWorldInverse);shadowFrustum.setFromProjectionMatrix(matrix,shadowCamera.coordinateSystem,shadowCamera.reversedDepth);}
  for(const b of banks){b.beauty.g.instanceCount=0;b.shadow.g.instanceCount=0;b.beauty.dirty=b.shadow.dirty=false;}
  function emit(target,m,slot){const i=target.g.instanceCount++,x=Math.fround(m.position.x-anchor.x),y=Math.fround(m.position.y-anchor.y),z=Math.fround(m.position.z-anchor.z),o=target.offsets.array;
   if(target.ids.array[i]!==slot||o[i*3]!==x||o[i*3+1]!==y||o[i*3+2]!==z){target.dirty=true;target.ids.array[i]=slot;o[i*3]=x;o[i*3+1]=y;o[i*3+2]=z;}
  }
  let visible=0;
  for(const m of active){const {bank,slot}=slots.get(m);sphere.copy(m.geometry.boundingSphere);sphere.center.add(m.position).sub(origin);
   if(frustum.intersectsSphere(sphere)){emit(bank.beauty,m,slot);visible++;}
   if(m.userData.patch.level>=10&&(!shadowCamera||shadowFrustum.intersectsSphere(sphere)))emit(bank.shadow,m,slot);
  }
  for(const b of banks)for(const t of [b.beauty,b.shadow]){
   t.m.position.copy(anchor);t.m.updateMatrix();t.m.visible=t.g.instanceCount>0;
   if(t.g.instanceCount&&t.dirty){t.ids.clearUpdateRanges();t.ids.addUpdateRange(0,t.g.instanceCount);t.ids.needsUpdate=true;t.offsets.clearUpdateRanges();t.offsets.addUpdateRange(0,t.g.instanceCount*3);t.offsets.needsUpdate=true;}
  }
  stats.visiblePatches=visible;
 }
 function trimEmpty(){
  let bytes=banks.filter(b=>b.free.length===b.capacity).reduce((s,b)=>s+b.buffer.array.byteLength,0);
  for(const b of [...banks]){if(bytes<=TERRAIN_BUDGET.emptyGridCacheBytes)break;if(b.free.length!==b.capacity)continue;banks.splice(banks.indexOf(b),1);manager?.delete(b.buffer);for(const t of [b.beauty,b.shadow]){t.m.removeFromParent();t.g.dispose();}b.material.dispose();bytes-=b.buffer.array.byteLength;stats.allocatedBytes-=b.buffer.array.byteLength;}
  stats.emptyCacheBytes=bytes;stats.batches=banks.length;
 }
 function canPrepare(mesh){if(slots.has(mesh)||!stats.frameAllocations)return true;const g=mesh.geometry,key=`${g.attributes.position.count}/${g.index.count}`;return banks.some(b=>b.key===key&&b.free.length);}
 return {stats,prepare,canPrepare,add,remove,update,beginFrame(){trimEmpty();stats.frameUploadBytes=stats.frameAllocationBytes=stats.frameAllocations=0;},attachRenderer(value){renderer=value;manager=renderer._attributes;},dispose(){disposed=true;for(const [m,s]of slots)m.geometry.removeEventListener('dispose',s.release);for(const b of banks){manager?.delete(b.buffer);for(const t of [b.beauty,b.shadow]){t.m.removeFromParent();t.g.dispose();}b.material.dispose();}for(const m of active)m.visible=true;slots.clear();active.clear();banks.length=0;}};
}
