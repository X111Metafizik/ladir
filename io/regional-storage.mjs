// Compressed regional files only. One shared byte ledger across every seed,
// radius and version; transactions update records and accounting atomically.
export class RegionDisk{
 constructor({indexedDB=globalThis.indexedDB,maxBytes=96*1024*1024}={}){this.idb=indexedDB;this.maxBytes=maxBytes;this.stats={cacheHits:0,cacheMisses:0,cacheReadMs:0,cacheWriteMs:0,diskBytes:0,storageErrors:0,quotaErrors:0,cacheEvictions:0};this.backoff=0;}
 async db(){if(!this.idb)return null;this.opening??=new Promise(resolve=>{let done=false;const finish=db=>{if(done){db?.close();return;}done=true;clearTimeout(timer);resolve(db);};const timer=setTimeout(()=>finish(null),300);try{const r=this.idb.open('atlas-regions-v1',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('files',{keyPath:'key'});const m=d.createObjectStore('meta',{keyPath:'key'});m.createIndex('time','time');d.createObjectStore('state');};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();this.opening=null;};finish(r.result);};r.onerror=r.onblocked=()=>finish(null);}catch{finish(null);}});return this.opening;}
 async read(key){const db=await this.db();if(!db)return null;const start=performance.now();return new Promise(resolve=>{let settled=false;const end=value=>{if(settled)return;settled=true;clearTimeout(timer);this.stats.cacheReadMs+=performance.now()-start;this.stats[value?'cacheHits':'cacheMisses']++;resolve(value);};const timer=setTimeout(()=>end(null),80);try{const tx=db.transaction(['files','state'],'readonly'),r=tx.objectStore('files').get(key),b=tx.objectStore('state').get('bytes');b.onsuccess=()=>{this.stats.diskBytes=b.result??0;};r.onsuccess=()=>end(r.result?.buffer??null);r.onerror=()=>end(null);}catch{end(null);}});}
 async remove(key){const db=await this.db();if(!db)return;return new Promise(resolve=>{try{const tx=db.transaction(['files','meta','state'],'readwrite'),files=tx.objectStore('files'),meta=tx.objectStore('meta'),state=tx.objectStore('state'),r=meta.get(key);r.onsuccess=()=>{const n=r.result?.size??0;files.delete(key);meta.delete(key);const s=state.get('bytes');s.onsuccess=()=>state.put(Math.max(0,(s.result??0)-n),'bytes');};tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();}catch{resolve();}});}
 async write(key,buffer){
  if(Date.now()<this.backoff||buffer.byteLength>this.maxBytes)return;
  const db=await this.db();if(!db)return;const start=performance.now();let committedBytes=this.stats.diskBytes;
  await new Promise(resolve=>{try{
   const tx=db.transaction(['files','meta','state'],'readwrite',{durability:'relaxed'}),files=tx.objectStore('files'),meta=tx.objectStore('meta'),state=tx.objectStore('state');
   const r=meta.get(key);r.onsuccess=()=>{const old=r.result?.size??0,s=state.get('bytes');s.onsuccess=()=>{let total=(s.result??0)-old+buffer.byteLength;const put=()=>{files.put({key,buffer});meta.put({key,size:buffer.byteLength,time:Date.now()});state.put(total,'bytes');committedBytes=total;};if(total<=this.maxBytes){put();return;}const c=meta.index('time').openCursor();c.onsuccess=()=>{const cursor=c.result;if(!cursor){put();return;}if(cursor.value.key!==key){total-=cursor.value.size;files.delete(cursor.value.key);cursor.delete();this.stats.cacheEvictions++;}if(total>this.maxBytes)cursor.continue();else put();};};};
   const timer=setTimeout(()=>{try{tx.abort();}catch{}},1000);
   tx.oncomplete=()=>{clearTimeout(timer);this.stats.diskBytes=committedBytes;this.stats.cacheWriteMs+=performance.now()-start;resolve();};
   tx.onerror=tx.onabort=()=>{clearTimeout(timer);this.stats.storageErrors++;if(tx.error?.name==='QuotaExceededError')this.stats.quotaErrors++;this.backoff=Date.now()+5000;resolve();};
  }catch{this.stats.storageErrors++;this.opening=null;resolve();}});
 }
 close(){this.opening?.then(db=>db?.close());this.opening=null;}
}
