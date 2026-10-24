import {parentPort,workerData} from 'node:worker_threads';
import {generatePlanet} from '../core/world.mjs';
try{
  const world=await generatePlanet(workerData.config,{importedLayout:workerData.importedLayout,onProgress:p=>parentPort.postMessage({type:'progress',...p})});
  parentPort.postMessage({type:'complete',world},Object.values(world.buffers).map(v=>v.buffer));
}catch(error){parentPort.postMessage({type:'error',message:error.message});}
