import {parentPort} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {sampleTerrain} from '../../core/terrain.mjs';
import {referenceDirection} from '../../core/landforms.mjs';
import {buildPatch} from '../../render/terrain-data.mjs';
import {postWorkerWorld, receiveWorkerWorld, workerWorldStats} from '../../io/worker-world.mjs';
parentPort.on('message', message => {
  const {id, probe = false, relay = false, worldTransport} = message;
  const world = receiveWorkerWorld(message);
  try {
    const shared = Object.values(world.buffers).every(v => v.buffer instanceof SharedArrayBuffer);
    let payload = {id, shared, bytes: Object.values(world.buffers).reduce((sum, v) => sum + v.byteLength, 0)};
    if (probe) {
      const points = [[-12000,9000],[-6000,6000],[0,0],[4000,-6000],[11000,-12000]];
      payload.samples = points.map(([x,y]) => sampleTerrain(world, referenceDirection(world,x,y)));
      const n=2**14, patch=buildPatch(world,{face:4,level:14,x:8200,y:8150,u:-1+8200*2/n,v:-1+8150*2/n,size:2/n,resolution:8,key:'transport-probe'},'natural');
      const hash=createHash('sha256');
      for(const value of Object.values(patch))if(ArrayBuffer.isView(value))hash.update(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
      payload.patchHash=hash.digest('hex');
      // This is the existing mesh-result contract: ownership moves, it is not shared.
      const result=patch.positions;
      parentPort.postMessage({...payload,result},[result.buffer]);
      parentPort.postMessage({id,detached:result.byteLength===0});
      return;
    }
    if(relay) {
      let forwarded;
      postWorkerWorld({postMessage:message=>forwarded=message},{world},{shared:worldTransport.shared});
      payload.nestedShared=Object.values(forwarded.world.buffers).every(v=>v.buffer instanceof SharedArrayBuffer);
      payload.nestedPreparation=workerWorldStats(world);
    }
    parentPort.postMessage(payload);
  } catch(error) { parentPort.postMessage({id,error:error.stack}); }
});
parentPort.postMessage({ready:true});
