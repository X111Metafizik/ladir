import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {deserializePlanet,serializePlanet} from '../io/bundle.mjs';
import {canShareWorld,worldForWorker,postWorkerWorld,workerWorldStats} from '../io/worker-world.mjs';
const small=()=>({manifest:{worldDataHash:'fixture'},buffers:{heights:new Float64Array([2,4,8])}});

test('worker sharing requires isolation and supports an explicit copy comparison',()=>{
  assert.equal(canShareWorld({crossOriginIsolated:false,SharedArrayBuffer}),false);
  assert.equal(canShareWorld({crossOriginIsolated:true}),false);
  assert.equal(canShareWorld({crossOriginIsolated:true,SharedArrayBuffer}),true);
  assert.equal(canShareWorld({crossOriginIsolated:true,SharedArrayBuffer,location:{search:'?workerMemory=copy'}}),false);
});
test('shared snapshot preserves aliased views, offsets, types and original ownership',()=>{
  const buffer=new ArrayBuffer(64),heights=new Float64Array(buffer,8,3),mask=new Uint8Array(buffer,8,12);
  heights.set([1.25,5.5,-3]);const world={buffers:{heights,mask,view:new DataView(buffer,12,16)}};
  const snapshot=worldForWorker(world,{shared:true});
  assert.notEqual(snapshot,world);assert.equal(snapshot,worldForWorker(world,{shared:true}));
  assert.ok(snapshot.buffers.heights.buffer instanceof SharedArrayBuffer);
  assert.equal(snapshot.buffers.heights.buffer,snapshot.buffers.mask.buffer);
  assert.equal(snapshot.buffers.heights.byteOffset,8);assert.equal(snapshot.buffers.view.byteOffset,12);
  assert.deepEqual([...snapshot.buffers.heights],[...heights]);assert.equal(buffer.byteLength,64);
  assert.equal(workerWorldStats(world).sharedSnapshotBytes,64);
  snapshot.buffers.heights[0]=9;assert.equal(heights[0],1.25);
  const copied=worldForWorker(snapshot,{shared:false});assert.ok(copied.buffers.heights.buffer instanceof ArrayBuffer);
  assert.equal(copied.buffers.heights.buffer,copied.buffers.mask.buffer);
});
test('unsupported or denied sharing falls back without detaching authoritative data',()=>{
  const world=small(),received=[];
  const worker={postMessage:message=>{if(message.worldTransport.shared)throw new DOMException('Host denied sharing','DataCloneError');received.push(structuredClone(message));}};
  postWorkerWorld(worker,{world},{shared:true});postWorkerWorld(worker,{world},{shared:true});
  assert.equal(received.length,2);assert.deepEqual([...received[0].world.buffers.heights],[2,4,8]);
  assert.equal(world.buffers.heights.byteLength,24);assert.equal(workerWorldStats(world).fallbacks,1);
  assert.equal(workerWorldStats(world).copiedDispatches,2);
  const original=small();assert.equal(worldForWorker(original,{shared:false}),original);
});
test('unrelated postMessage errors are not swallowed or retried',()=>{
  const error=new Error('Worker terminated');let calls=0;
  assert.throws(()=>postWorkerWorld({postMessage(){calls++;throw error;}},{world:small()},{shared:true}),e=>e===error);
  assert.equal(calls,1);
});
test('real workers preserve geography, saved bytes, nested sharing and transferable output', {timeout:30000}, async()=>{
  const world=await deserializePlanet(await readFile('fixtures/lumen-v35.planet'));
  const fingerprint=()=>createHash('sha256').update(new Uint8Array(serializePlanet(world))).digest('hex');
  const before=fingerprint(),worker=new Worker(new URL('./support/world-probe.mjs',import.meta.url));
  const wait=predicate=>new Promise((resolve,reject)=>{
    const onMessage=data=>{if(data.error){cleanup();reject(Error(data.error));}else if(predicate(data)){cleanup();resolve(data);}};
    const cleanup=()=>{worker.off('message',onMessage);worker.off('error',onError);};
    const onError=e=>{cleanup();reject(e);};worker.on('message',onMessage);worker.on('error',onError);
  });
  try{
    await wait(d=>d.ready);
    const samples=[];
    for(const shared of [false,true]){
      const reply=wait(d=>d.result),detached=wait(d=>d.detached!==undefined);
      postWorkerWorld(worker,{world,id:String(shared),probe:true},{shared});
      samples.push(await reply);assert.equal((await detached).detached,true);
    }
    assert.equal(samples[0].shared,false);assert.equal(samples[1].shared,true);
    assert.deepEqual(samples[1].samples,samples[0].samples);assert.equal(samples[1].patchHash,samples[0].patchHash);
    assert.deepEqual(samples[1].result,samples[0].result);assert.equal(fingerprint(),before);
    for(const shared of [false,true]){
      const reply=wait(d=>d.id==='relay');postWorkerWorld(worker,{id:'relay',world,relay:true},{shared});
      const received=await reply;assert.equal(received.nestedShared,shared);assert.equal(received.nestedPreparation.sharedSnapshotBytes,0);
    }
  }finally{await worker.terminate();}
});
