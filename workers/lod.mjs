import {initRegional} from '../io/regional-runtime.mjs';
import {TERRAIN_BUDGET,patchBytes} from '../render/terrain-budget.mjs';
import {selectPatches} from '../render/terrain-data.mjs';
import {PatchPool} from '../render/patch-pool.mjs';
import {transitionGroups} from '../render/stream-plan.mjs';
import {vegetationTile} from '../core/vegetation.mjs';
import {faceDirection,directionFace} from '../core/cube.mjs';
import {sampleTerrain,nearestRiver} from '../core/terrain.mjs';
let planningController,region,regionOptions,world,pool,workerCount,terrainRequest=0,inflightBytes=0,deliveryId=0;const vegetationCache=new Map(),yieldWork=()=>new Promise(r=>setTimeout(r,0));
function ensurePool(){return pool??=new PatchPool(()=>{const w=new Worker(new URL('./patches.mjs',import.meta.url),{type:'module'});w.postMessage({type:'init',world,warm:!!workerCount,regionalOptions:regionOptions,bake:regionOptions?.meshBake!==false});return w;},workerCount??Math.min(3,Math.max(1,Math.floor((navigator.hardwareConcurrency??4)/2))));}
self.onmessage=async({data})=>{
 if(data.type==='init'){world=data.world;regionOptions=data.regionalOptions;region=initRegional(world,regionOptions);workerCount=data.workerCount;pool?.dispose();pool=null;vegetationCache.clear();if(workerCount){ensurePool();sampleTerrain(world,world.frame.center);nearestRiver(world,world.frame.center);}return;}
 if(data.type==='terrain-consumed'){if(data.id===deliveryId){inflightBytes=Math.max(0,inflightBytes-data.bytes);pool?.setPaused(inflightBytes>TERRAIN_BUDGET.inflightBytes);}return;}
 if(data.type==='dispose'){pool?.dispose();self.close();return;}
 if(data.type==='cancel-terrain'){planningController?.abort();terrainRequest++;pool?.run([],'natural',()=>{});return;}
 try{
  const start=performance.now();
  if(data.type==='terrain'){
   planningController?.abort();const planJob=new AbortController();planningController=planJob;
   const request=++terrainRequest;deliveryId=data.id;inflightBytes=0;
   const coarseArrival=data.arrival&&data.preview;
   const dirs=[data.camera,data.view?.predict].filter(Boolean).map(p=>{const l=Math.hypot(...p);return p.map(x=>x/l);});
   if(region){await region.ensure(region.keysForDirections(dirs,2000),{limit:9,signal:planJob.signal});if(request!==terrainRequest)return;}
   const planStarted=performance.now();
   const leaves=selectPatches(world,data.camera,coarseArrival?.25:data.detail,data.view,{arrival:!!coarseArrival,maxLevel:coarseArrival?17:data.preview?15:30,resolution:data.preview?8:undefined,previous:data.previous,referenceResolution:data.referenceResolution}),known=new Set(data.known),missing=leaves.filter(p=>!known.has(p.key+'/'+data.layer)).sort((a,b)=>a.priority-b.priority);
   const patches=leaves.map(p=>({...p,key:p.key+'/'+data.layer}));
   // Neighbor/stitch grouping can cost hundreds of milliseconds during fast
   // travel. It is deterministic planning, so keep it off the render thread.
   const transitions=data.previous?transitionGroups(data.previous,patches):undefined;
   self.postMessage({id:data.id,type:'terrain-plan',patches,transitions});
   const planningMs=performance.now()-planStarted;ensurePool();
   const result=await pool.run(missing,data.layer,patches=>{inflightBytes+=patches.reduce((n,p)=>n+patchBytes(p),0);pool.setPaused(inflightBytes>TERRAIN_BUDGET.inflightBytes);self.postMessage({id:data.id,type:'terrain-chunk',patches},patches.flatMap(p=>Object.values(p).filter(ArrayBuffer.isView).map(v=>v.buffer)));});
   if(result&&request===terrainRequest)self.postMessage({id:data.id,type:'terrain-done',milliseconds:performance.now()-start,...result,planningMs,plannerRegion:region?.snapshot()});
  }else if(data.type==='vegetation'){
   if(region)await region.ensure(region.keysForDirections([data.direction],2000),{limit:9});
   const [face,u,v]=directionFace(data.direction),level=Math.ceil(Math.log2(2*world.radiusMeters/2800)),n=2**level,span=2*world.radiusMeters/n,tx=Math.min(n-1,Math.floor((u+1)*n/2)),ty=Math.min(n-1,Math.floor((v+1)*n/2)),tiles=[],seen=new Set(),radius=3000,ring=Math.ceil(radius/span)+1,known=new Set(data.known??[]);
   for(let y=-ring;y<=ring;y++)for(let x=-ring;x<=ring;x++){
    const d=faceDirection(face,-1+(tx+x+.5)*2/n,-1+(ty+y+.5)*2/n),distance=Math.hypot(...d.map((v,k)=>v-data.direction[k]))*world.radiusMeters;if(distance>radius+span*.72)continue;
    const [f,a,b]=directionFace(d),xx=Math.min(n-1,Math.floor((a+1)*n/2)),yy=Math.min(n-1,Math.floor((b+1)*n/2)),key=`${f}/${level}/${xx}/${yy}`;
    if(seen.has(key))continue;seen.add(key);tiles.push({key,center:d.map(v=>v*1000),distance,f,x:xx,y:yy});
   }
   tiles.sort((a,b)=>a.distance-b.distance);self.postMessage({id:data.id,type:'vegetation-plan',keys:tiles.map(t=>t.key)});
   for(const t of tiles){if(known.has(t.key))continue;let items=vegetationCache.get(t.key);if(!items){items=vegetationTile(world,t.f,t.x,t.y,level);vegetationCache.set(t.key,items);}self.postMessage({id:data.id,type:'vegetation-tile',tile:{key:t.key,center:t.center,items}});await yieldWork();}
   while(vegetationCache.size>160)vegetationCache.delete(vegetationCache.keys().next().value);
   self.postMessage({id:data.id,type:'vegetation-done',milliseconds:performance.now()-start,regional:region?.snapshot()});
  }
 }catch(error){self.postMessage({id:data.id,type:'error',message:error.message});}
};


