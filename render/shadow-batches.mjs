import {BufferGeometry,BufferAttribute,Mesh,Vector3} from 'three/webgpu';
// Shadow geometry is identical to the visible triangles. Nearby patches share
// one draw call; no terrain decimation or change to the physical surface.
export function shadowKey(p){const level=Math.min(14,p.level),f=2**(p.level-level);return `${p.face}/${level}/${Math.floor(p.x/f)}/${Math.floor(p.y/f)}`;}
export function beginShadowBatch(members){
 const list=[...members],vertices=list.reduce((n,m)=>n+m.geometry.attributes.position.count,0),indices=list.reduce((n,m)=>n+m.geometry.index.count,0);
 return {list,center:list[0]?.position.clone()??new Vector3(),positions:new Float32Array(vertices*3),normals:new Float32Array(vertices*3),indices:new Uint32Array(indices),cursor:0,vertex:0,index:0};
}
export function appendShadowPatch(job){
 const mesh=job.list[job.cursor++],p=mesh.geometry.attributes.position.array,n=mesh.geometry.attributes.normal.array,idx=mesh.geometry.index.array,offset=job.vertex;
 const dx=mesh.position.x-job.center.x,dy=mesh.position.y-job.center.y,dz=mesh.position.z-job.center.z;
 for(let i=0;i<p.length;i+=3){const j=offset*3+i;job.positions[j]=p[i]+dx;job.positions[j+1]=p[i+1]+dy;job.positions[j+2]=p[i+2]+dz;}
 job.normals.set(n,offset*3);for(let i=0;i<idx.length;i++)job.indices[job.index+i]=idx[i]+offset;
 job.vertex+=p.length/3;job.index+=idx.length;return job.cursor===job.list.length;
}
export function createShadowBatches(group,material){
 const buckets=new Map(),dirty=new Set();let building=null,disposed=false;
 const stats={batches:0,revision:0,pending:0,buildMilliseconds:0};
 function change(mesh,add){const p=mesh.userData.patch;if(p.level<10)return;const key=shadowKey(p);let b=buckets.get(key);if(!b){if(!add)return;b={members:new Set(),mesh:null,version:0};buckets.set(key,b);}if(add)b.members.add(mesh);else b.members.delete(mesh);b.version++;dirty.add(key);}
 function update(budget=1.5){if(disposed)return;const start=performance.now();
  do{
   if(!building){const key=dirty.values().next().value;if(key===undefined)break;dirty.delete(key);const bucket=buckets.get(key);if(!bucket)continue;
    if(!bucket.members.size){bucket.mesh?.removeFromParent();bucket.mesh?.geometry.dispose();buckets.delete(key);stats.revision++;continue;}
    building={key,bucket,version:bucket.version,job:beginShadowBatch(bucket.members)};
   }
   if(appendShadowPatch(building.job)){
    const {key,bucket,job,version}=building,g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(job.positions,3));g.setAttribute('normal',new BufferAttribute(job.normals,3));g.setIndex(new BufferAttribute(job.indices,1));g.computeBoundingSphere();
    const mesh=new Mesh(g,material);mesh.position.copy(job.center);mesh.updateMatrix();mesh.matrixAutoUpdate=false;mesh.layers.set(1);mesh.castShadow=true;mesh.userData.shadowBatch=true;
    bucket.mesh?.removeFromParent();bucket.mesh?.geometry.dispose();bucket.mesh=mesh;group.add(mesh);stats.revision++;building=null;if(bucket.version!==version)dirty.add(key);
   }
  }while(performance.now()-start<budget);
  stats.batches=buckets.size;stats.pending=dirty.size+Number(!!building);stats.buildMilliseconds+=performance.now()-start;
 }
 return {stats,add:mesh=>change(mesh,true),remove:mesh=>change(mesh,false),update,dispose(){disposed=true;for(const b of buckets.values()){b.mesh?.removeFromParent();b.mesh?.geometry.dispose();}buckets.clear();dirty.clear();building=null;}};
}
