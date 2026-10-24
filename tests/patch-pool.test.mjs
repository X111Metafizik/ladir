import test from 'node:test';import assert from 'node:assert/strict';
import {PatchPool} from '../render/patch-pool.mjs';
import {worldCacheKey} from '../io/world-cache.mjs';
const fixture=()=>{const workers=[],pool=new PatchPool(()=>{const w={pending:[],cancels:0,postMessage(d){if(d.type==='cancel-build'){this.cancels++;return;}this.pending.push(d);},complete(){const d=this.pending.shift();this.onmessage({data:{task:d.task,patches:d.patches,samples:{hits:10,misses:20,size:20}}});},terminate(){this.closed=true;}};workers.push(w);return w;},3);return {pool,workers};};
test('patch production is bounded and completes every patch exactly once',async()=>{
 const {pool,workers}=fixture(),seen=[],patches=Array.from({length:41},(_,key)=>({key})),done=pool.run(patches,'natural',p=>seen.push(...p));
 assert.equal(workers.filter(w=>w.pending.length===1).length,3);
 while(workers.some(w=>w.pending.length))for(const w of workers)if(w.pending.length){assert.equal(w.pending.length,1);assert.ok(w.pending[0].patches.length<=6);w.complete();}
 const result=await done;assert.equal(result.generated,41);assert.equal(new Set(seen.map(p=>p.key)).size,41);assert.equal(result.workers,3);assert.equal(result.samples.size,60);
});
test('retargeting drops all queued obsolete work and does not publish stale chunks',async()=>{
 const {pool,workers}=fixture(),stale=[],seen=[];
 const old=pool.run(Array.from({length:100},(_,key)=>({key})),'natural',p=>stale.push(...p));
 const latest=pool.run([{key:'latest'}],'height',p=>seen.push(...p));assert.equal(await old,null);
 assert.ok(workers.every(w=>w.cancels===1));for(const w of workers)w.complete();assert.equal(stale.length,0);
 assert.equal(workers.flatMap(w=>w.pending).length,1);workers.find(w=>w.pending.length).complete();
 assert.equal((await latest).generated,1);assert.deepEqual(seen,[{key:'latest'}]);pool.dispose();assert.ok(workers.every(w=>w.closed));
});
test('empty plans complete and worker errors reject instead of leaving loading pending',async()=>{
 const {pool,workers}=fixture();assert.equal((await pool.run([],'natural',()=>{})).generated,0);
 const pending=pool.run([{key:1}],'natural',()=>{}),task=workers[0].pending[0].task;
 workers[0].onmessage({data:{task,error:'build failed'}});await assert.rejects(pending,/build failed/);
});
test('world cache keys separate every generation setting and ignore object key order',()=>{
 assert.equal(worldCacheKey({seed:'A',mountains:.5}),worldCacheKey({mountains:.5,seed:'A'}));
 assert.notEqual(worldCacheKey({seed:'A'}),worldCacheKey({seed:'B'}));
 assert.notEqual(worldCacheKey({seed:'A',terrainStamps:1}),worldCacheKey({seed:'A',terrainStamps:0}));
});
test('background cache completion updates telemetry without consuming an active geometry task',async()=>{
 const {pool,workers}=fixture(),seen=[],status=[];pool.onCacheStatus=s=>status.push(s);
 const pending=pool.run([{key:'terrain'}],'natural',p=>seen.push(...p)),task=pool.slots[0].busy;
 workers[0].onmessage({data:{type:'cache-status',bake:{bakeWrites:24,bakeQueuedBytes:0,bakeDiskBytes:500}}});
 workers[1].onmessage({data:{type:'cache-status',bake:{bakeWrites:12,bakeQueuedBytes:200,bakeDiskBytes:700}}});
 assert.equal(pool.slots[0].busy,task);assert.deepEqual(seen,[]);
 assert.deepEqual(status.at(-1),{bakeWrites:36,bakeQueuedBytes:200,bakeDiskBytes:700});
 workers[0].complete();assert.equal((await pending).generated,1);assert.deepEqual(seen,[{key:'terrain'}]);pool.dispose();
});
