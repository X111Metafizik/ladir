import {stableStringify} from '../core/math.mjs';
import {GENERATOR_BUILD_HASH} from '../core/build-id.mjs';
import {serializePlanet,deserializePlanet} from './bundle.mjs';
export const worldCacheKey=config=>GENERATOR_BUILD_HASH+'/'+stableStringify(config);
// This module runs in the generation worker. Hash verification, serialization
// and IndexedDB cloning never compete with rendering on the UI thread.
async function database(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('atlas-worlds',1);
  let expired=false;const timer=setTimeout(()=>{expired=true;reject(Error('Cache timeout'));},1800);
  request.onupgradeneeded=()=>request.result.createObjectStore('worlds',{keyPath:'key'});
  request.onsuccess=()=>{clearTimeout(timer);if(expired)request.result.close();else resolve(request.result);};
  request.onerror=()=>{clearTimeout(timer);reject(request.error);};
 });
}
async function entries(mode,run){
 const db=await database();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('worlds',mode),store=tx.objectStore('worlds');let result;
  run(store,value=>result=value);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
export async function readCachedWorld(config){
 try{
  const record=await entries('readonly',(store,done)=>{store.get(worldCacheKey(config)).onsuccess=e=>done(e.target.result);});
  if(!record)return null;
  const world=await deserializePlanet(record.bytes);
  if(worldCacheKey(world.generationConfig)!==worldCacheKey(config))return null;
  return world;
 }catch{return null;}
}
export async function saveCachedWorld(world){
 try{
  const bytes=serializePlanet(world);if(bytes.byteLength>64*1024*1024)return false;
  await entries('readwrite',store=>{
   store.put({key:worldCacheKey(world.generationConfig),saved:Date.now(),size:bytes.byteLength,bytes});
   store.getAll().onsuccess=e=>{const records=e.target.result.sort((a,b)=>b.saved-a.saved);let size=0;for(let i=0;i<records.length;i++){size+=records[i].size;if(i>=3||size>72*1024*1024)store.delete(records[i].key);}};
  });return true;
 }catch{return false;}
}
