import {REGIONAL_CATALOG} from './regional-catalog.mjs';
import {RegionField} from './regional-field.mjs';
import {RegionLoader,REGION_IO_BUDGET} from './regional-loader.mjs';
import {validateRegion} from './regional-format.mjs';
import {setTerrainSource} from '../core/surface-source.mjs';
import {faceDirection} from '../core/cube.mjs';
const runtimes=new WeakMap();
export function regionalOptions(){const p=new URLSearchParams(globalThis.location?.search??'');return {mode:p.get('region')??'baked',meshBake:p.get('meshBake')!=='off'};}
export function initRegional(world,{mode='baked',main=false,disk=true}={}){
 if(runtimes.has(world))return runtimes.get(world);
 const catalog=REGIONAL_CATALOG[world.manifest.worldDataHash];
 if(!catalog||mode==='off'||mode==='legacy')return null;
 try{validateRegion(catalog.manifest,world);}catch{return null;}
 const r=new RegionalRuntime(world,catalog,{mode,main,disk});runtimes.set(world,r);setTerrainSource(world,(d,o)=>r.field.sample(d,o));return r;
}
export const regionalRuntime=world=>runtimes.get(world);
export class RegionalRuntime{
 constructor(world,catalog,{mode,main,disk}){
  Object.assign(this,{world,catalog,mode,main,disk});this.field=new RegionField(world,catalog.manifest,{maxBytes:REGION_IO_BUDGET.ramBytes});this.stats={installMs:0,maxInstallMs:0,prefetchCancelled:0};this.epoch=0;this.pending=new Map();this.byKey=new Map(catalog.manifest.tiles.map(t=>[t.key,t]));
  if(mode==='baked'){
   if(main){this.worker=new Worker(new URL('../workers/regions.mjs',import.meta.url),{type:'module'});this.worker.postMessage({type:'init',world,disk});this.worker.onmessage=({data})=>{
    if(data.type==='tile'){
     if(data.epoch===this.epoch){const s=performance.now();this.field.install(data.tile);const ms=performance.now()-s;this.stats.installMs+=ms;this.stats.maxInstallMs=Math.max(this.stats.maxInstallMs,ms);}
     this.worker.postMessage({type:'consumed',epoch:data.epoch,key:data.tile.x+'/'+data.tile.y});
    }
    if(data.epoch===this.epoch){if(data.stats)this.ioStats=data.stats;if(data.type==='done')this.loading=false;}
   };}
   else this.loader=new RegionLoader(world,catalog,{disk,baseURL:new URL('../',import.meta.url)});
  }
 }
 keysForDirections(directions,radius=0){const keys=new Set(),g=this.catalog.manifest.grid;for(const d of directions){const p=this.field.coordinates(d);if(!p)continue;const x=Math.floor((p[0]-g.minX)/g.tileMeters),y=Math.floor((p[1]-g.minY)/g.tileMeters),ring=Math.ceil(radius/g.tileMeters);for(let dy=-ring;dy<=ring;dy++)for(let dx=-ring;dx<=ring;dx++)if(x+dx>=0&&x+dx<16&&y+dy>=0&&y+dy<16)keys.add(this.field.key(x+dx,y+dy));}return [...keys];}
 keysForPatches(patches){return this.keysForDirections(patches.flatMap(p=>p.level<8?[]:[[.5,.5],[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>faceDirection(p.face,p.u+p.size*x,p.v+p.size*y))));}
 async ensure(keys,{signal,limit=24}={}){
  if(!this.loader)return;
  for(const key of keys.slice(0,limit)){if(signal?.aborted)break;if(this.field.tiles.has(key))continue;const t=this.byKey.get(key);if(!t)continue;let job=this.pending.get(key);if(!job||job.signal?.aborted){job={signal,promise:this.loader.load(t,signal)};this.pending.set(key,job);}const tile=await job.promise;if(this.pending.get(key)===job)this.pending.delete(key);if(tile&&!signal?.aborted)this.field.install(tile);}
 }
 prefetch(directions,radius=2000){
  if(this.mode!=='baked'||this.disposed)return;
  const keys=this.keysForDirections(directions,radius).slice(0,25),signature=keys.join(';'),missing=keys.filter(k=>!this.field.tiles.has(k)),now=performance.now();
  if(signature===this.signature&&(this.loading||!missing.length||now<(this.retryAfter??0)))return;
  if(this.loading)this.stats.prefetchCancelled++;
  this.signature=signature;this.epoch++;this.controller?.abort();this.controller=new AbortController();this.loading=!!missing.length;this.retryAfter=now+1000;
  if(this.worker)this.worker.postMessage({type:'prefetch',keys:missing,epoch:this.epoch});
  else {const epoch=this.epoch;this.ensure(missing,{signal:this.controller.signal}).catch(()=>{}).finally(()=>{if(this.epoch===epoch)this.loading=false;});}
 }
 snapshot(){return {mode:this.mode,profile:this.catalog.manifest.id,limits:REGION_IO_BUDGET,...this.field.stats,...this.stats,...(this.loader?.snapshot()??this.ioStats??{})};}
 dispose(){this.disposed=true;this.controller?.abort();this.worker?.terminate();this.loader?.dispose();this.field.clear();setTerrainSource(this.world,null);runtimes.delete(this.world);}
}
