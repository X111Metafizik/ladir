import {parentPort} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {initTerrainKernel,terrainKernelStats} from '../../wasm/runtime.mjs';
import {receiveWorkerWorld} from '../../io/worker-world.mjs';
import {buildPatch} from '../../render/terrain-data.mjs';
parentPort.on('message',async message=>{try{
 await initTerrainKernel({mode:message.terrainKernel});const world=receiveWorkerWorld(message),size=2/2**14;
 const patch=buildPatch(world,{face:4,level:14,x:8200,y:8150,u:8200*size-1,v:8150*size-1,size,resolution:16,key:'probe'});
 const hash=createHash('sha256');for(const a of Object.values(patch))if(ArrayBuffer.isView(a))hash.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
 parentPort.postMessage({positions:patch.positions,hash:hash.digest('hex'),kernel:terrainKernelStats()},[patch.positions.buffer]);
}catch(e){parentPort.postMessage({error:e.stack});}});parentPort.postMessage({ready:true});
