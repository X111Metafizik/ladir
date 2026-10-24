import {TERRAIN_BAKE_VERSION,terrainBakeKey,packTerrainPatch,unpackTerrainPatch,bakeChecksum} from './terrain-bake-codec.mjs';
import {BAKED_WORLDS} from './baked-worlds.mjs';
import {sha256} from '../core/math.mjs';
import {BakeMembership} from './bake-membership.mjs';
const MiB=1024*1024;
// Cheap transient parents remain in the existing RAM cache. Spend disk IO on
// the expensive near grids; the entire distant globe already has static packs.
export const persistentBakeEligible=p=>p.level>=10&&(p.resolution??16)>=16;
export const BAKE_DISK_BYTES=128*MiB,BAKE_QUEUE_BYTES=2*MiB,BAKE_PACK_BYTES=4*MiB;
// All disk IO/encoding runs inside patch workers, never in the rendering loop.
export class TerrainBakeCache{
 constructor(world,{enabled=true,indexedDB=globalThis.indexedDB,staticPacks=true,maxBytes=BAKE_DISK_BYTES,profile=''}={}){
  this.profile=profile;this.key=(p,layer)=>terrainBakeKey(world,p,layer)+(profile?'/profile/'+profile:'');
  this.world=world;this.enabled=enabled;this.idb=indexedDB;this.maxBytes=maxBytes;this.packs=new Map();this.packBytes=0;this.queue=[];this.queueBytes=0;this.writing=false;this.disabled=false;this.serial=0;this.writeAfter=0;this.readAfter=0;
  this.catalog=enabled&&staticPacks?BAKED_WORLDS[world.manifest.worldDataHash]:null;
  this.prefix=TERRAIN_BAKE_VERSION+'/'+world.manifest.worldDataHash+'/'+world.radiusMeters+'/';this.known=new BakeMembership();this.knownReady=false;
  this.channel=enabled&&this.idb&&typeof BroadcastChannel==='function'?new BroadcastChannel('atlas-terrain-bake-presence'):null;
  if(this.channel)this.channel.onmessage=({data})=>{if(Array.isArray(data?.keys))for(const key of data.keys)if(typeof key==='string'&&key.startsWith(this.prefix))this.known.add(key);};
  this.stats={bakeIndexBytes:this.known.bits.byteLength,bakeIndexMisses:0,bakeHits:0,bakeStaticHits:0,bakeMisses:0,bakeWrites:0,bakeErrors:0,bakeReadTimeouts:0,bakeWriteTimeouts:0,bakeReadMs:0,bakeWriteMs:0,bakeSkipped:0,bakeQueuedBytes:0,bakePackBytes:0,bakeDiskBytes:0};
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
  this.opening??=new Promise(resolve=>{let done=false;const finish=db=>{if(done){db?.close();return;}done=true;clearTimeout(timer);resolve(db);};
   const timer=setTimeout(()=>{this.disabled=true;finish(null);},250);
   try{const r=this.idb.open('atlas-terrain-bake',1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('tiles',{keyPath:'key'});const m=db.createObjectStore('meta',{keyPath:'key'});m.createIndex('time','time');db.createObjectStore('state');};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();this.disabled=true;};this.primeIndex(r.result);finish(r.result);};r.onerror=()=>{this.disabled=true;finish(null);};r.onblocked=()=>{this.disabled=true;finish(null);};}catch{this.disabled=true;finish(null);}
  });return this.opening;
 }
 async staticRead(p,layer){
  if(!this.catalog||layer!=='natural'||p.level!==3||(p.resolution??16)!==8)return null;
  const key=this.key(p,layer),face=this.catalog.faces[p.face],entry=face?.entries[key];if(!entry)return null;
  let pack=this.packs.get(p.face);
  if(!pack){pack={promise:(async()=>{try{const response=await fetch(new URL('../assets/terrain-bakes/'+this.world.manifest.worldDataHash+'/'+face.file,import.meta.url),{signal:AbortSignal.timeout(500),cache:'force-cache'});if(!response.ok)throw Error('Missing bake pack');const buffer=await response.arrayBuffer();if(await sha256(new Uint8Array(buffer))!==face.sha256)throw Error('Bake signature');pack.bytes=buffer.byteLength;this.packBytes+=pack.bytes;this.stats.bakePackBytes=this.packBytes;return buffer;}catch{this.stats.bakeErrors++;return null;}})(),bytes:0};this.packs.set(p.face,pack);}
  const buffer=await pack.promise;if(!buffer)return null;
  // Bound retained packs by bytes. Returned typed arrays own their buffers.
  for(const [id,old] of this.packs){if(this.packBytes<=BAKE_PACK_BYTES)break;if(id!==p.face&&old.bytes){this.packs.delete(id);this.packBytes-=old.bytes;}}
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
   const timer=setTimeout(()=>{try{tx?.abort();}catch{}this.stats.bakeReadTimeouts++;this.readAfter=performance.now()+250;finish();},35);
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
  const db=await this.database();if(!db){this.queue=[];this.queueBytes=0;this.stats.bakeQueuedBytes=0;this.writing=false;return;}
  while(this.queue.length&&!this.disabled){const batch=this.queue.splice(0,6),start=performance.now();try{await new Promise((resolve,reject)=>{
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
  if(this.disabled||performance.now()<this.writeAfter){this.queue=[];this.queueBytes=0;this.stats.bakeQueuedBytes=0;}this.writing=false;
 }
 async settled(){while(this.writing)await new Promise(r=>setTimeout(r,5));}
}
