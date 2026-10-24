export const TERRAIN_BUDGET={cacheBytes:48*1024*1024,inflightBytes:8*1024*1024,activeBytes:192*1024*1024,readyBytes:96*1024*1024,transitionBytes:192*1024*1024,prefetchBytes:160*1024*1024,bankBytes:4*1024*1024,emptyGridCacheBytes:16*1024*1024,minUploadBytes:72*1024,maxUploadBytes:288*1024};
export function geometryBytes(g){return (g.index?.array.byteLength??0)+Object.values(g.attributes).reduce((n,a)=>n+(a.array?.byteLength??0),0);}
export function recordBytes(r){return geometryBytes(r.mesh.geometry)+(r.water?geometryBytes(r.water.geometry):0);}
export function patchBytes(p){return Object.values(p).reduce((n,a)=>n+(ArrayBuffer.isView(a)?a.byteLength:0),0);}
export function uploadAllowance(cpuAverage=4){return cpuAverage>7?TERRAIN_BUDGET.minUploadBytes:cpuAverage<3?TERRAIN_BUDGET.maxUploadBytes:144*1024;}
export function terrainMemorySnapshot(terrain){
 const seen=new Set(),out={activeBytes:0,readyBytes:0,transitionBytes:0,prefetchBytes:0,cacheBytes:0,inboxBytes:0,retiringBytes:0};
 const add=(category,r)=>{if(!r||seen.has(r.mesh))return;seen.add(r.mesh);out[category]+=recordBytes(r);};
 for(const [key,mesh]of terrain.active)add('activeBytes',{mesh,water:terrain.water.get(key)});
 for(const t of terrain.transitions)for(const k of t.add)add('transitionBytes',terrain.ready.get(k)??terrain.cache.get(k));
 const a=terrain.arrival;if(a)for(const stage of [a,a.refinement].filter(Boolean)){for(const r of stage.records.values())add('prefetchBytes',r);for(const p of stage.plan)add('prefetchBytes',terrain.ready.get(p.key)??terrain.cache.get(p.key));for(const p of stage.inbox)out.inboxBytes+=patchBytes(p);}
 for(const r of terrain.ready.values())add('readyBytes',r);for(const r of terrain.cache.values())add('cacheBytes',r);
 for(const r of terrain.retiring??[])add('retiringBytes',r);for(const p of terrain.inbox)out.inboxBytes+=patchBytes(p);
 out.cpuBufferBytes=Object.values(out).reduce((a,b)=>a+b,0);out.arrivalBytes=out.prefetchBytes;
 out.cpuGridBytes=terrain.batches.stats.allocatedBytes??0;out.cpuWaterBatchBytes=terrain.waterBatches?.stats.allocatedBytes??0;out.cpuTotalBufferBytes=out.cpuBufferBytes+out.cpuGridBytes+out.cpuWaterBatchBytes;
 out.activeBudgetExceeded=out.activeBytes>TERRAIN_BUDGET.activeBytes;out.readyBudgetExceeded=out.readyBytes>TERRAIN_BUDGET.readyBytes;out.transitionBudgetExceeded=out.transitionBytes>TERRAIN_BUDGET.transitionBytes;out.prefetchBudgetExceeded=out.prefetchBytes>TERRAIN_BUDGET.prefetchBytes;
 return out;
}
export function boundsOf(positions){let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;for(let i=0;i<positions.length;i+=3){minX=Math.min(minX,positions[i]);maxX=Math.max(maxX,positions[i]);minY=Math.min(minY,positions[i+1]);maxY=Math.max(maxY,positions[i+1]);minZ=Math.min(minZ,positions[i+2]);maxZ=Math.max(maxZ,positions[i+2]);}if(!positions.length)return {center:[0,0,0],radius:0};const center=[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2];let r=0;for(let i=0;i<positions.length;i+=3)r=Math.max(r,(positions[i]-center[0])**2+(positions[i+1]-center[1])**2+(positions[i+2]-center[2])**2);return {center,radius:Math.sqrt(r)};}
