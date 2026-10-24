import {REGIONAL_CATALOG} from '../io/regional-catalog.mjs';
import {RegionLoader} from '../io/regional-loader.mjs';
let loader,tiles,controller,delivery;
// One transferred tile may await consumption. Timers alone do not bound the
// main-thread message queue while a render or driver call is stalled.
function waitForConsumer(epoch,key,signal){
 return new Promise(resolve=>{const done=()=>{signal.removeEventListener('abort',done);if(delivery?.done===done)delivery=null;resolve();};delivery={epoch,key,done};signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
}
self.onmessage=async({data})=>{
 if(data.type==='consumed'){if(delivery?.epoch===data.epoch&&delivery.key===data.key)delivery.done();return;}
 if(data.type==='init'){loader=new RegionLoader(data.world,REGIONAL_CATALOG[data.world.manifest.worldDataHash],{disk:data.disk,baseURL:new URL('../',import.meta.url)});tiles=new Map(loader.manifest.tiles.map(t=>[t.key,t]));return;}
 if(data.type!=='prefetch')return;controller?.abort();const job=new AbortController();controller=job;
 for(const key of data.keys){
  if(job.signal.aborted)break;const t=tiles.get(key);if(!t)continue;const tile=await loader.load(t,job.signal);
  if(tile&&!job.signal.aborted){loader.stats.deliveryBytes=tile.bytes;loader.stats.maxDeliveryBytes=Math.max(loader.stats.maxDeliveryBytes??0,tile.bytes);const consumed=waitForConsumer(data.epoch,key,job.signal);self.postMessage({type:'tile',tile,epoch:data.epoch,stats:loader.snapshot()},[tile.data.buffer]);await consumed;loader.stats.deliveryBytes=0;}
 }
 self.postMessage({type:'done',epoch:data.epoch,stats:loader.snapshot()});
};
