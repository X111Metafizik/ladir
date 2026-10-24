import {BufferGeometry,BufferAttribute,Mesh,Sphere,Vector3,Frustum,Matrix4} from 'three/webgpu';

// Opaque water only. Keep the exact clipped triangles, normals and per-vertex
// shallows/lake levels. CPU picking and collision keep the original meshes.
export const waterBatchKey=p=>`${p.face}/${p.level}/${Math.floor(p.x/2)}/${Math.floor(p.y/2)}`;
export function copyWaterPatch(job,mesh){
 const g=mesh.geometry,offset=job.vertex,dx=mesh.position.x-job.center.x,dy=mesh.position.y-job.center.y,dz=mesh.position.z-job.center.z;
 const p=g.attributes.position.array,n=g.attributes.normal.array,h=g.attributes.shallows.array;
 for(let i=0;i<p.length;i+=3){const j=offset*3+i;job.geometry.attributes.position.array[j]=p[i]+dx;job.geometry.attributes.position.array[j+1]=p[i+1]+dy;job.geometry.attributes.position.array[j+2]=p[i+2]+dz;}
 job.geometry.attributes.normal.array.set(n,offset*3);job.geometry.attributes.shallows.array.set(h,offset);
 const indices=g.index.array;for(let i=0;i<indices.length;i++)job.geometry.index.array[job.index+i]=indices[i]+offset;
 const sphere=g.boundingSphere.clone();sphere.center.add(mesh.position).sub(job.center);if(!job.vertex)job.bounds.copy(sphere);else job.bounds.union(sphere);
 job.vertex+=g.attributes.position.count;job.index+=g.index.count;
}
const power=n=>2**Math.ceil(Math.log2(Math.max(1,n)));
export function createWaterBatches(group,material,{maxBytes=24*1024*1024,poolBytes=4*1024*1024,maxBatchBytes=512*1024}={}){
 const buckets=new Map(),dirty=new Set(),pool=[],frustum=new Frustum(),matrix=new Matrix4(),sphere=new Sphere();let manager=null,building=null,disposed=false;
 const stats={batches:0,pending:0,visiblePending:0,members:0,allocatedBytes:0,poolBytes:0,allocations:0,reused:0,copiedBytes:0,uploadedBytes:0,buildMilliseconds:0,maxUpdateMilliseconds:0,frameUploadBytes:0,drawsSaved:0};
 const bytes=g=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index.array.byteLength);
 function destroy(g){stats.allocatedBytes-=bytes(g);g.dispose();}
 function release(g){const size=bytes(g);if(stats.poolBytes+size<=poolBytes){pool.push(g);stats.poolBytes+=size;}else destroy(g);}
 function acquire(vertices,indices){
  const vi=power(vertices),ix=power(indices),size=vi*28+ix*4;if(size>maxBatchBytes)return null;
  const index=pool.findIndex(g=>g.attributes.position.count>=vertices&&g.index.count>=indices);
  if(index>=0){const g=pool.splice(index,1)[0];stats.poolBytes-=bytes(g);stats.reused++;return g;}
  while(pool.length&&stats.allocatedBytes+size>maxBytes){const g=pool.pop();stats.poolBytes-=bytes(g);destroy(g);}if(stats.allocatedBytes+size>maxBytes)return null;
  const g=new BufferGeometry();for(const [name,count]of [['position',3],['normal',3],['shallows',1]])g.setAttribute(name,new BufferAttribute(new Float32Array(vi*count),count));g.setIndex(new BufferAttribute(new Uint32Array(ix),1));
  g.addEventListener('dispose',()=>{if(manager){for(const a of Object.values(g.attributes))manager.delete(a);manager.delete(g.index);}});
  stats.allocatedBytes+=size;stats.allocations++;return g;
 }
 function invalidate(b){if(b.mesh){b.mesh.removeFromParent();release(b.mesh.geometry);b.mesh=null;stats.batches--;}for(const m of b.members)m.visible=true;}
 function change(mesh,add){if(material.transparent||!mesh.userData.patch)return;const key=waterBatchKey(mesh.userData.patch);let b=buckets.get(key);if(!b){if(!add)return;b={members:new Set(),version:0,mesh:null};buckets.set(key,b);}invalidate(b);if(add)b.members.add(mesh);else{b.members.delete(mesh);mesh.visible=true;}b.version++;dirty.add(key);stats.members+=add?1:-1;}
 function abort(){if(building){release(building.geometry);building=null;}}
 function update(camera,origin,{milliseconds=.65,uploadBytes=144*1024}={}){
  if(disposed)return;const start=performance.now();stats.frameUploadBytes=0;
  matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix,camera.coordinateSystem,camera.reversedDepth);
  do{
   if(building&&building.version!==building.bucket.version)abort();
   if(!building){
    let next=null;for(const key of dirty){const b=buckets.get(key);if(!b?.members.size){dirty.delete(key);buckets.delete(key);continue;}if(b.members.size<2){dirty.delete(key);continue;}
     let visible=false;for(const m of b.members){sphere.copy(m.geometry.boundingSphere);sphere.center.add(m.position).sub(origin);if(frustum.intersectsSphere(sphere)){visible=true;break;}}if(visible){next={key,b};break;}}
    if(!next){stats.visiblePending=0;break;}stats.visiblePending=1;const {key,b}=next;dirty.delete(key);const members=[...b.members],vertices=members.reduce((n,m)=>n+m.geometry.attributes.position.count,0),indices=members.reduce((n,m)=>n+m.geometry.index.count,0),geometry=acquire(vertices,indices);if(!geometry)continue;
    building={key,bucket:b,version:b.version,members,geometry,center:members[0].position.clone(),bounds:new Sphere(),cursor:0,vertex:0,index:0,upload:null};
   }
   const j=building;
   if(j.cursor<j.members.length){const m=j.members[j.cursor++];copyWaterPatch(j,m);stats.copiedBytes+=m.geometry.attributes.position.count*28+m.geometry.index.count*4;}
   else{
    if(!j.upload){j.geometry.boundingSphere=j.bounds;j.geometry.setDrawRange(0,j.index);j.upload=[...Object.values(j.geometry.attributes).map(a=>({a,type:1,count:j.vertex*a.itemSize})),{a:j.geometry.index,type:2,count:j.index}];}
    const entry=j.upload[0];if(entry){const size=entry.a.array.byteLength;if(!uploadBytes||stats.frameUploadBytes&&stats.frameUploadBytes+size>uploadBytes)break;
     entry.a.clearUpdateRanges();entry.a.addUpdateRange(0,entry.count);entry.a.needsUpdate=true;manager?.update(entry.a,entry.type);stats.frameUploadBytes+=size;stats.uploadedBytes+=size;j.upload.shift();if(stats.frameUploadBytes>=uploadBytes)break;
    }else{
     const m=new Mesh(j.geometry,material);m.position.copy(j.center);m.updateMatrix();m.matrixAutoUpdate=false;m.userData.waterBatch=true;group.add(m);j.bucket.mesh=m;for(const original of j.members)original.visible=false;stats.batches++;building=null;
    }
   }
  }while(performance.now()-start<milliseconds);
  stats.pending=dirty.size+Number(!!building);stats.drawsSaved=0;for(const b of buckets.values())if(b.mesh)stats.drawsSaved+=b.members.size-1;
  const ms=performance.now()-start;stats.buildMilliseconds+=ms;stats.maxUpdateMilliseconds=Math.max(stats.maxUpdateMilliseconds,ms);
 }
 return {stats,add:m=>change(m,true),remove:m=>change(m,false),update,attachRenderer:r=>{manager=r._attributes;},dispose(){disposed=true;abort();for(const b of buckets.values())invalidate(b);for(const g of pool)destroy(g);pool.length=0;stats.poolBytes=0;buckets.clear();dirty.clear();}};
}
