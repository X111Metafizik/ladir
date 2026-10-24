import {initTerrainKernel,terrainKernelStats} from '../wasm/runtime.mjs';
let initialization=Promise.resolve(),cancelVersion=0;
import {receiveWorkerWorld} from '../io/worker-world.mjs';
import {buildPatch} from '../render/terrain-data.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {directionFace} from '../core/cube.mjs';
import {TerrainBakeCache} from '../io/terrain-bake-cache.mjs';
import {initRegional} from '../io/regional-runtime.mjs';
let world,sample,bake,region,controller;const production={samplingMs:0,buildMs:0,patches:0,maxBuildMs:0};
self.onmessage=async({data})=>{
 if(data.type==='cancel-build'){cancelVersion++;controller?.abort();return;}
 if(data.type==='init'){initialization=(async()=>{await initTerrainKernel({mode:data.terrainKernel});world=receiveWorkerWorld(data);region=initRegional(world,data.regionalOptions);sample=createSampleCache((d,options)=>{const t=performance.now(),s=sampleTerrain(world,d,options);production.samplingMs+=performance.now()-t;return s;},80000);bake=new TerrainBakeCache(world,{enabled:data.bake!==false,staticPacks:!region,profile:region?.catalog.manifest.id??''});bake.database();if(data.warm){const [face,u,v]=directionFace(world.frame.center),level=12,n=2**level,x=Math.floor((u+1)*n/2),y=Math.floor((v+1)*n/2),size=2/n;buildPatch(world,{face,level,x,y,u:x*size-1,v:y*size-1,size,resolution:8,key:'warm'},'natural',sample);}})();return;}
 const version=cancelVersion;await initialization;
 if(version!==cancelVersion){self.postMessage({task:data.task,patches:[]});return;}
 const job=new AbortController();controller=job;
 try{
  if(region)await region.ensure(region.keysForPatches(data.patches),{signal:job.signal,limit:12});
  if(job.signal.aborted){self.postMessage({task:data.task,patches:[],region:region?.snapshot()});return;}
  const cached=await bake.read(data.patches,data.layer),fresh=[];
  if(job.signal.aborted){self.postMessage({task:data.task,patches:[]});return;}
  const patches=data.patches.map((p,i)=>{if(cached[i])return cached[i];const t=performance.now(),result=buildPatch(world,p,data.layer,sample),ms=performance.now()-t;production.buildMs+=ms;production.maxBuildMs=Math.max(production.maxBuildMs,ms);production.patches++;fresh.push(result);return result;});
  bake.enqueue(fresh,data.layer);
  self.postMessage({task:data.task,patches,samples:sample.stats(),bake:{...bake.stats},production:{...production},kernel:terrainKernelStats(),region:region?.snapshot()},patches.flatMap(p=>Object.values(p).filter(ArrayBuffer.isView).map(v=>v.buffer)));
 }catch(error){self.postMessage({task:data.task,error:error.message});}
};
