import {BufferGeometry,BufferAttribute,Mesh} from 'three/webgpu';
// Keep CPU collision meshes intact. The visible copy combines nearby patches
// around a local origin, so batching does not quantize planet-sized coordinates.
export function terrainBatchKey(p){const level=Math.min(p.level,p.level>=17?16:p.level>=13?12:9),f=2**(p.level-level);return `${p.face}/${level}/${Math.floor(p.x/f)}/${Math.floor(p.y/f)}`;}
export function beginTerrainBatch(members){
 const list=[...members],vertices=list.reduce((n,m)=>n+m.geometry.attributes.position.count,0),indices=list.reduce((n,m)=>n+m.geometry.index.count,0),attributes={};
 for(const [name,a]of Object.entries(list[0].geometry.attributes))attributes[name]={size:a.itemSize,array:new a.array.constructor(vertices*a.itemSize)};
 return {list,center:list[0].position.clone(),attributes,indices:new Uint32Array(indices),cursor:0,vertex:0,index:0};
}
export function appendTerrainPatch(job){
 const mesh=job.list[job.cursor++],offset=job.vertex,delta=mesh.position.clone().sub(job.center);
 for(const [name,a]of Object.entries(mesh.geometry.attributes)){const out=job.attributes[name].array;out.set(a.array,offset*a.itemSize);if(name==='position')for(let i=0;i<a.array.length;i+=3){const j=offset*3+i;out[j]+=delta.x;out[j+1]+=delta.y;out[j+2]+=delta.z;}}
 const idx=mesh.geometry.index.array;for(let i=0;i<idx.length;i++)job.indices[job.index+i]=idx[i]+offset;
 job.vertex+=mesh.geometry.attributes.position.count;job.index+=idx.length;return job.cursor===job.list.length;
}
export function createTerrainBatches(group,material){
 const buckets=new Map(),dirty=new Set();let building=null,disposed=false;const stats={batches:0,pending:0,buildMilliseconds:0};
 function invalidate(b){if(b.mesh){b.mesh.removeFromParent();b.mesh.geometry.dispose();b.mesh=null;for(const m of b.members)m.visible=true;}}
 function change(mesh,add){const p=mesh.userData.patch;if(p.level<10)return;const key=terrainBatchKey(p);let b=buckets.get(key);if(!b){if(!add)return;b={members:new Set(),mesh:null,version:0};buckets.set(key,b);}
  // Remove the old batch immediately when its footprint changes. Individual
  // active meshes cover the whole replacement while the next batch is built.
  if(!add){invalidate(b);b.members.delete(mesh);mesh.visible=true;}else{b.members.add(mesh);mesh.visible=true;}b.version++;dirty.add(key);
 }
 function update(budget=1){if(disposed)return;const start=performance.now();do{
  if(building&&building.version!==building.bucket.version)building=null;
  if(!building){const key=dirty.values().next().value;if(key===undefined)break;dirty.delete(key);const b=buckets.get(key);if(!b)continue;if(b.members.size<2){invalidate(b);if(!b.members.size)buckets.delete(key);continue;}building={key,bucket:b,version:b.version,job:beginTerrainBatch(b.members)};}
  if(appendTerrainPatch(building.job)){
   const {bucket:b,job}=building,g=new BufferGeometry();for(const [name,a]of Object.entries(job.attributes))g.setAttribute(name,new BufferAttribute(a.array,a.size));g.setIndex(new BufferAttribute(job.indices,1));g.computeBoundingSphere();
   const mesh=new Mesh(g,material);mesh.position.copy(job.center);mesh.updateMatrix();mesh.matrixAutoUpdate=false;mesh.receiveShadow=true;mesh.userData.terrainBatch=true;
   b.mesh?.removeFromParent();b.mesh?.geometry.dispose();b.mesh=mesh;group.add(mesh);for(const m of job.list)m.visible=false;building=null;
  }
 }while(performance.now()-start<budget);stats.batches=[...buckets.values()].filter(b=>b.mesh).length;stats.pending=dirty.size+Number(!!building);stats.buildMilliseconds+=performance.now()-start;}
 return {stats,add:m=>change(m,true),remove:m=>change(m,false),update,dispose(){disposed=true;for(const b of buckets.values())invalidate(b);buckets.clear();dirty.clear();building=null;}};
}
