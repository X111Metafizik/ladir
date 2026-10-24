// A bounded queue: a changed view discards queued work immediately. A worker
// finishes at most one small obsolete batch before taking the latest view.
export class PatchPool {
 constructor(factory,count=3){
  this.serial=0;this.job=null;this.paused=false;
  this.slots=Array.from({length:count},()=>{const worker=factory(),slot={worker,busy:null,samples:null};
   worker.onmessage=({data})=>{
    if(data.type==='cache-status'){slot.bake=data.bake;this.onCacheStatus?.(this.bakeStats());return;}
    const task=slot.busy;if(!task||data.task!==task.id)return;
    slot.busy=null;slot.samples=data.samples;slot.bake=data.bake;slot.region=data.region;slot.production=data.production;slot.kernel=data.kernel;
    if(task.job===this.job){
     if(data.error){this.job.reject(Error(data.error));this.job=null;}
     else{task.job.completed+=data.patches.length;task.job.onChunk(data.patches);this.finish();}
    }
    this.pump(slot);
   };
   worker.onerror=e=>{this.job?.reject(Error(e.message));this.job=null;};return slot;
  });
 }
 bakeStats(){const bake={};for(const slot of this.slots)for(const [key,value]of Object.entries(slot.bake??{}))bake[key]=key==='bakeDiskBytes'?Math.max(bake[key]??0,value):(bake[key]??0)+value;return bake;}
 run(patches,layer,onChunk){
  this.job?.resolve(null);for(const slot of this.slots)if(slot.busy)slot.worker.postMessage({type:'cancel-build'});this.paused=false;
  return new Promise((resolve,reject)=>{
   this.job={patches,layer,onChunk,resolve,reject,cursor:0,completed:0};
   this.finish();for(const slot of this.slots)this.pump(slot);
  });
 }
 pump(slot){
  const job=this.job;if(this.paused||slot.busy||!job||job.cursor>=job.patches.length)return;
  const patches=job.patches.slice(job.cursor,job.cursor+3);job.cursor+=patches.length;
  slot.busy={id:++this.serial,job};slot.worker.postMessage({type:'build',task:this.serial,patches,layer:job.layer});
 }
 finish(){
  const job=this.job;if(!job||job.completed!==job.patches.length)return;
  const samples={hits:0,misses:0,size:0,keyBytes:0,referenceSlots:0,evictions:0};for(const slot of this.slots)for(const key of Object.keys(samples))samples[key]+=slot.samples?.[key]??0;
  const bake={};for(const slot of this.slots)for(const [key,value] of Object.entries(slot.bake??{}))bake[key]=key==='bakeDiskBytes'?Math.max(bake[key]??0,value):(bake[key]??0)+value;
  const production={samplingMs:0,buildMs:0,patches:0,maxBuildMs:0};for(const s of this.slots)for(const k of Object.keys(production))production[k]=k==='maxBuildMs'?Math.max(production[k],s.production?.[k]??0):production[k]+(s.production?.[k]??0);
  this.job=null;job.resolve({kernels:this.slots.map(s=>s.kernel).filter(Boolean),production,generated:job.completed,workers:this.slots.length,samples,bake,regions:this.slots.map(s=>s.region).filter(Boolean)});
 }
 setPaused(value){this.paused=value;if(!value)for(const slot of this.slots)this.pump(slot);}
 dispose(){this.job?.resolve(null);this.job=null;for(const slot of this.slots)slot.worker.terminate();}
}
