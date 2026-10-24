import {Worker} from 'node:worker_threads';
export function generatePlanetInWorker(config,{signal,onProgress=()=>{},importedLayout=null}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Üretim iptal edildi','AbortError'));return;}
    const worker=new Worker(new URL('./node-entry.mjs',import.meta.url),{workerData:{config,importedLayout}});let finished=false;
    const cleanup=()=>{finished=true;signal?.removeEventListener('abort',abort);worker.terminate();};
    const abort=()=>{cleanup();reject(new DOMException('Üretim iptal edildi','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    worker.on('message',data=>{if(finished)return;if(data.type==='progress')onProgress(data);if(data.type==='complete'){cleanup();resolve(data.world);}if(data.type==='error'){cleanup();reject(Error(data.message));}});
    worker.on('error',error=>{if(!finished){cleanup();reject(error);}});
    worker.on('exit',code=>{if(!finished){cleanup();reject(Error(`Üretim Worker'ı sonuç vermeden kapandı (${code}).`));}});
  });
}
