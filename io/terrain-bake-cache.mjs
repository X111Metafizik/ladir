import {TERRAIN_BAKE_VERSION,terrainBakeKey,packTerrainPatch,unpackTerrainPatch,bakeChecksum} from './terrain-bake-codec.mjs';
import {BAKED_WORLDS} from './baked-worlds.mjs';
import {STARTUP_BAKES} from './startup-bakes.mjs';
import {sha256} from '../core/math.mjs';
import {BakeMembership} from './bake-membership.mjs';
const MiB=1024*1024;
// Flight previews are expensive too: excluding 8-cell near tiles made every
// warm visit repeat its whole first-surface job. Distant parents stay in RAM;
// near previews share the same bounded disk/encoding budgets as dense meshes.
export const persistentBakeEligible=p=>p.level>=10&&(p.resolution??16)>=8;
export const BAKE_DISK_BYTES=128*MiB,BAKE_QUEUE_BYTES=2*MiB,BAKE_PACK_BYTES=4*MiB;
async function decodePack(buffer,info){
 if(info.encoding!=='gzip')return buffer;
 if(!Number.isInteger(info.rawBytes)||info.rawBytes<=0||info.rawBytes>BAKE_PACK_BYTES)throw Error('Invalid decoded pack size');
 const reader=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>info.rawBytes)throw Error('Decoded pack overflow');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 if(length!==info.rawBytes)throw Error('Truncated decoded pack');
 const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result.buffer;
}
// All disk IO/encoding runs inside patch workers, never in the rendering loop.
export class TerrainBakeCache{
 constructor(world,{enabled=true,indexedDB=globalThis.indexedDB,staticPacks=true,maxBytes=BAKE_DISK_BYTES,profile='',fetchFn=globalThis.fetch?.bind(globalThis),openTimeoutMs=250,onStatus=null}={}){
  this.profile=profile;this.key=(p,layer)=>terrainBakeKey(world,p,layer)+(profile?'/profile/'+profile:'');
  this.world=world;this.enabled=enabled;this.idb=indexedDB;this.maxBytes=maxBytes;this.packs=new Map();this.packBytes=0;this.queue=[];this.queueBytes=0;this.writing=false;this.disabled=false;this.serial=0;this.writeAfter=0;this.readAfter=0;
  const candidate=STARTUP_BAKES[world.manifest.worldDataHash]?.[profile]??(!profile?BAKED_WORLDS[world.manifest.worldDataHash]:null);
  this.catalog=enabled&&staticPacks&&candidate?.version===TERRAIN_BAKE_VERSION&&candidate.radiusMeters===world.radiusMeters&&(candidate.profile??'')===profile?candidate:null;
  this.fetchFn=fetchFn;this.openTimeoutMs=openTimeoutMs;this.onStatus=onStatus;this.staticEntries=new Map();
  for(const pack of this.catalog?.packs??this.catalog?.faces??[])for(const [key,range]of Object.entries(pack.entries))this.staticEntries.set(key,{pack,range});
  this.prefix=TERRAIN_BAKE_VERSION+'/'+world.manifest.worldDataHash+'/'+world.radiusMeters+'/';this.known=new BakeMembership();this.knownReady=false;
  this.channel=enabled&&this.idb&&typeof BroadcastChannel==='function'?new BroadcastChannel('atlas-terrain-bake-presence'):null;
  if(this.channel)this.channel.onmessage=({data})=>{if(Array.isArray(data?.keys))for(const key of data.keys)if(typeof key==='string'&&key.startsWith(this.prefix))this.known.add(key);};
  this.stats={bakeIndexBytes:this.known.bits.byteLength,bakeIndexMisses:0,bakeHits:0,bakeStaticHits:0,bakeMisses:0,bakeWrites:0,bakeErrors:0,bakeReadTimeouts:0,bakeWriteTimeouts:0,bakeReadMs:0,bakeWriteMs:0,bakeSkipped:0,bakeQueuedBytes:0,bakePackBytes:0,bakeDiskBytes:0};
 }
 async staticIndex(){
  const index=this.catalog?.index;if(!index)return;
  this.indexReady??=(async()=>{try{
   if(index.bytes>8*MiB)throw Error('Oversized bake index');
   const response=await this.fetchFn(new URL('../assets/terrain-bakes/'+this.world.manifest.worldDataHash+'/'+index.file,import.meta.url),{signal:AbortSignal.timeout(1500),cache:'force-cache'});
   if(!response.ok)throw Error('Missing bake index');const bytes=await response.arrayBuffer();
   if(bytes.byteLength!==index.bytes||await sha256(new Uint8Array(bytes))!==index.sha256)throw Error('Bake index signature');
   const catalog=JSON.parse(new TextDecoder().decode(bytes));
   if(catalog.version!==TERRAIN_BAKE_VERSION||catalog.radiusMeters!==this.world.radiusMeters||catalog.profile!==this.profile)throw Error('Bake index identity');
   for(const pack of catalog.packs)for(const [key,range]of Object.entries(pack.entries))this.staticEntries.set(key,{pack,range});
   this.stats.bakeStaticIndexBytes=bytes.byteLength;
  }catch{this.stats.bakeErrors++;this.staticEntries.clear();}})();await this.indexReady;
 }
 primeIndex(db){
  // Subscribe before taking the index snapshot, so commits made by other
  // workers during this read cannot introduce a false negative.
  if(!this.channel)return;
  try{const tx=db.transaction('meta','readonly'),r=tx.objectStore('meta').getAllKeys(IDBKeyRange.bound(this.prefix,this.prefix+'\uffff'));r.onsuccess=()=>{for(const key of r.result)this.known.add(key);this.knownReady=true;};}catch{this.knownReady=false;}
 }
 markSaved(batch){const keys=batch.map(p=>p.key);for(const key of keys)this.known.add(key);this.channel?.postMessage({keys});}
 async database(){
  if(!this.enabled||this.disabled||!this.idb)return null;
  if(this.db)return this.db;
  this.opening??=new Promise(resolve=>{let done=false;const finish=db=>{if(done)return;done=true;clearTimeout(timer);resolve(db);};
   // A busy first load can delay IDB's success event beyond the read budget.
   // Continue procedurally now, but retain the late connection for later
   // writes/visits instead of permanently disabling the cache this session.
   const timer=setTimeout(()=>{this.stats.bakeOpenTimeouts=(this.stats.bakeOpenTimeouts??0)+1;finish(null);},this.openTimeoutMs);
   try{const r=this.idb.open('atlas-terrain-bake',1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('tiles',{keyPath:'key'});const m=db.createObjectStore('meta',{keyPath:'key'});m.createIndex('time','time');db.createObjectStore('state');};r.onsuccess=()=>{this.db=r.result;r.result.onversionchange=()=>{r.result.close();this.db=null;this.disabled=true;};this.primeIndex(r.result);finish(r.result);};r.onerror=()=>{this.stats.bakeOpenErrors=(this.stats.bakeOpenErrors??0)+1;this.disabled=true;finish(null);};r.onblocked=()=>{this.stats.bakeOpenBlocked=(this.stats.bakeOpenBlocked??0)+1;finish(null);};}catch{this.stats.bakeOpenErrors=(this.stats.bakeOpenErrors??0)+1;this.disabled=true;finish(null);}
  });return this.opening;
 }
 async staticRead(p,layer){
  if(!this.catalog||layer!=='natural')return null;
  await this.staticIndex();
  const found=this.staticEntries.get(this.key(p,layer));if(!found)return null;
  const {pack:face,range:entry}=found,id=face.file;
  let pack=this.packs.get(id);
  if(!pack){pack={bytes:0};this.packs.set(id,pack);pack.promise=(async()=>{try{if(face.bytes>BAKE_PACK_BYTES)throw Error('Oversized bake pack');const response=await this.fetchFn(new URL('../assets/terrain-bakes/'+this.world.manifest.worldDataHash+'/'+face.file,import.meta.url),{signal:AbortSignal.timeout(500),cache:'force-cache'});if(!response.ok)throw Error('Missing bake pack');const wire=await response.arrayBuffer();if(wire.byteLength!==face.bytes||await sha256(new Uint8Array(wire))!==face.sha256)throw Error('Bake signature');const buffer=await decodePack(wire,face);pack.bytes=buffer.byteLength;this.packBytes+=pack.bytes;this.stats.bakePackBytes=this.packBytes;return buffer;}catch{this.stats.bakeErrors++;return null;}})();}
  const buffer=await pack.promise;if(!buffer)return null;
  // Bound retained packs by bytes. Returned typed arrays own their buffers.
  for(const [oldId,old] of this.packs){if(this.packBytes<=BAKE_PACK_BYTES)break;if(oldId!==id&&old.bytes){this.packs.delete(oldId);this.packBytes-=old.bytes;}}
  this.stats.bakePackBytes=this.packBytes;
  try{const result=unpackTerrainPatch(buffer.slice(entry[0],entry[0]+entry[1]),p,layer);this.stats.bakeStaticHits++;return result;}catch{this.stats.bakeErrors++;return null;}
 }
 async read(patches,layer){
  const started=performance.now(),keys=patches.map(p=>this.key(p,layer)),out=patches.map(()=>null);
  if(!this.enabled)return out;
  await Promise.all(patches.map(async(p,i)=>{out[i]=await this.staticRead(p,layer);}));
  const wanted=patches.map((p,i)=>!out[i]&&persistentBakeEligible(p));
  const db=wanted.some(Boolean)?await this.database():null;
  if(this.knownReady)for(let i=0;i<wanted.length;i++)if(wanted[i]&&!this.known.has(keys[i])){wanted[i]=false;this.stats.bakeIndexMisses++;}
  if(db&&wanted.some(Boolean)&&performance.now()>=this.readAfter)await new Promise(resolve=>{
   let tx,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};
   const timer=setTimeout(()=>{try{tx?.abort();}catch{}this.stats.bakeReadTimeouts++;this.readAfter=performance.now()+250;finish();},patches.some(p=>(p.resolution??16)>=16)?100:35);
   try{tx=db.transaction('tiles','readonly');tx.oncomplete=finish;tx.onerror=tx.onabort=finish;
    for(let i=0;i<keys.length;i++)if(wanted[i]){const r=tx.objectStore('tiles').get(keys[i]);r.onsuccess=()=>{const item=r.result;if(!item)return;try{if(item.checksum!==bakeChecksum(item.buffer))throw Error('Corrupt tile');out[i]=unpackTerrainPatch(item.buffer,patches[i],layer);this.stats.bakeHits++;}catch{this.stats.bakeErrors++;}};}
   }catch{finish();}
  });
  this.stats.bakeMisses+=out.filter(x=>!x).length;this.stats.bakeReadMs+=performance.now()-started;return out;
 }
 enqueue(patches,layer){
  if(!this.enabled||this.disabled||!this.idb)return;
  if(performance.now()<this.writeAfter){this.stats.bakeSkipped+=patches.length;return;}
  for(const p of patches){if(!persistentBakeEligible(p.patch)){this.stats.bakeSkipped++;continue;}const bytes=Object.values(p).filter(ArrayBuffer.isView).reduce((n,a)=>n+a.byteLength,0)+2048;if(this.queueBytes+bytes>BAKE_QUEUE_BYTES){this.stats.bakeSkipped++;continue;}
   const buffer=packTerrainPatch(p),item={key:this.key(p.patch,layer),buffer,checksum:bakeChecksum(buffer),size:buffer.byteLength,time:Date.now()+this.serial++/1e6};
   if(item.size>this.maxBytes){this.stats.bakeSkipped++;continue;}this.queue.push(item);this.queueBytes+=item.size;
  }
  this.stats.bakeQueuedBytes=this.queueBytes;if(!this.writing){this.writing=true;setTimeout(()=>this.flush(),0);}
 }
 async flush(){
  const db=await this.database();if(!db){this.queue=[];this.queueBytes=0;this.stats.bakeQueuedBytes=0;this.writing=false;this.onStatus?.(this.stats);return;}
  // Amortize IDB commit/metadata overhead. The existing 2 MiB per-worker queue
  // caps the batch's bytes; no larger render-thread transfer is introduced.
  while(this.queue.length&&!this.disabled){const batch=this.queue.splice(0,24),start=performance.now();try{await new Promise((resolve,reject)=>{
   const tx=db.transaction(['tiles','meta','state'],'readwrite',{durability:'relaxed'}),tiles=tx.objectStore('tiles'),meta=tx.objectStore('meta'),state=tx.objectStore('state');
   const timer=setTimeout(()=>{this.stats.bakeWriteTimeouts++;try{tx.abort();}catch{}},1500);
   tx.oncomplete=()=>{clearTimeout(timer);resolve();};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error??Error('Bake write aborted'));};
   const r=state.get('bytes');r.onsuccess=()=>{let size=r.result??0,pending=batch.length;
    const prune=()=>{const cursor=meta.index('time').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(size>this.maxBytes&&c){size-=c.value.size;tiles.delete(c.value.key);c.delete();c.continue();}else{state.put(size,'bytes');this.stats.bakeDiskBytes=size;}};};
    for(const item of batch){const old=meta.get(item.key);old.onsuccess=()=>{size+=item.size-(old.result?.size??0);tiles.put(item);meta.put({key:item.key,size:item.size,time:item.time});if(!--pending)prune();};}
   };
  });this.markSaved(batch);this.stats.bakeWrites+=batch.length;}catch(error){this.stats.bakeErrors++;this.writeAfter=performance.now()+(error?.name==='QuotaExceededError'?60000:1000);}
   for(const p of batch)this.queueBytes-=p.size;this.stats.bakeQueuedBytes=this.queueBytes;this.stats.bakeWriteMs+=performance.now()-start;
   if(performance.now()<this.writeAfter)break;
   await new Promise(r=>setTimeout(r,32));
  }
  if(this.disabled||performance.now()<this.writeAfter){this.queue=[];this.queueBytes=0;this.stats.bakeQueuedBytes=0;}this.writing=false;this.onStatus?.(this.stats);
 }
 async settled(){while(this.writing)await new Promise(r=>setTimeout(r,5));}
}
