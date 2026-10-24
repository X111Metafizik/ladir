import {RegionDisk} from './regional-storage.mjs';
import {sha256} from '../core/math.mjs';
import {unpackRegionTile,validateRegion} from './regional-format.mjs';
export const REGION_IO_BUDGET={ramBytes:12*1024*1024,diskBytes:96*1024*1024,readConcurrency:1,decodeConcurrency:1,decodeSliceMs:2,maxCompressedTileBytes:1024*1024,maxRawTileBytes:2*1024*1024,mainDeliveryBytes:2*1024*1024};
const pause=()=>new Promise(r=>setTimeout(r,0));
async function decompress(bytes,expected,signal,stats){
 const allocation=performance.now(),out=new Uint8Array(expected);stats.rawAllocationMs=(stats.rawAllocationMs??0)+performance.now()-allocation;
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let offset=0;
 try{for(;;){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const {value,done}=await reader.read();if(done)break;if(offset+value.byteLength>expected)throw Error('Oversized decoded tile');out.set(value,offset);offset+=value.byteLength;}if(offset!==expected)throw Error('Truncated decoded tile');return out.buffer;}finally{await reader.cancel().catch(()=>{});}
}
export class RegionLoader{
 constructor(world,catalog,{disk=true,fetchFn=globalThis.fetch,baseURL=new URL('../',import.meta.url),maxDiskBytes=REGION_IO_BUDGET.diskBytes}={}){
  validateRegion(catalog.manifest,world);this.manifest=catalog.manifest;this.catalog=catalog;this.fetch=fetchFn?.bind(globalThis);this.baseURL=baseURL;this.disk=disk?new RegionDisk({maxBytes:maxDiskBytes}):null;
  this.stats={readMs:0,fetchMs:0,decodeMs:0,verifyMs:0,networkBytes:0,decodedBytes:0,tilesLoaded:0,corruptTiles:0,missingTiles:0,cancelled:0,maxDecodeMs:0,inflightBytes:0,maxInflightBytes:0};this.lastWrite=Promise.resolve();
 }
 key(t){return this.manifest.id+'/'+t.key+'/'+t.sha256;}
 load(t,signal){const run=(this.serial??Promise.resolve()).catch(()=>{}).then(()=>this.loadOne(t,signal));this.serial=run.then(()=>{});return run;}
 async loadOne(t,signal){
  if(signal?.aborted)return null;
  const start=performance.now(),key=this.key(t);let bytes=await this.disk?.read(key),fromDisk=!!bytes;
  if(t.bytes>REGION_IO_BUDGET.maxCompressedTileBytes||t.rawBytes>REGION_IO_BUDGET.maxRawTileBytes)return null;
  const verify=async data=>{const s=performance.now(),ok=data.byteLength===t.bytes&&await sha256(data)===t.sha256;this.stats.verifyMs+=performance.now()-s;return ok;};
  try{
   if(bytes&&!await verify(bytes)){this.stats.corruptTiles++;await this.disk.remove(key);bytes=null;fromDisk=false;}
   if(!bytes){
    const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,1200),s=performance.now();
    try{const response=await this.fetch(new URL(this.catalog.base+t.file,this.baseURL),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Tile HTTP '+response.status);bytes=await response.arrayBuffer();this.stats.networkBytes+=bytes.byteLength;if(!await verify(bytes))throw Error('Tile SHA-256 mismatch');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.stats.fetchMs+=performance.now()-s;}
   }
   this.stats.readMs+=performance.now()-start;
   if(signal?.aborted){this.stats.cancelled++;return null;}
   this.stats.inflightBytes=bytes.byteLength+t.rawBytes;this.stats.maxInflightBytes=Math.max(this.stats.maxInflightBytes,this.stats.inflightBytes);
   await pause();const decode=performance.now(),raw=await decompress(bytes,t.rawBytes,signal,this.stats);
   const elapsed=performance.now()-decode;this.stats.decodeMs+=elapsed;this.stats.maxDecodeMs=Math.max(this.stats.maxDecodeMs,elapsed);
   const vs=performance.now();if(await sha256(raw)!==t.rawSha256)throw Error('Decoded SHA-256 mismatch');this.stats.verifyMs+=performance.now()-vs;
   const unpackStart=performance.now(),tile=unpackRegionTile(raw,t,this.manifest.grid);this.stats.unpackMs=(this.stats.unpackMs??0)+performance.now()-unpackStart;this.stats.tilesLoaded++;this.stats.decodedBytes+=raw.byteLength;
   if(!fromDisk&&this.disk){await this.lastWrite;this.lastWrite=this.disk.write(key,bytes);} // at most one bounded pending compressed write
   if(elapsed>REGION_IO_BUDGET.decodeSliceMs)await pause();
   return tile;
  }catch(e){this.stats.lastError=e.message;if(signal?.aborted||e.name==='AbortError')this.stats.cancelled++;else this.stats.missingTiles++;return null;}
  finally{this.stats.inflightBytes=0;}
 }
 snapshot(){return {...this.stats,...this.disk?.stats};}
 dispose(){this.disk?.close();}
}
