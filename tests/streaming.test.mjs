import test from 'node:test';import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {transitionGroups,createSampleCache} from '../render/stream-plan.mjs';
import {StreamingTerrain} from '../render/terrain-stream.mjs';
import {faceDirection} from '../core/cube.mjs';
import {PATCH} from '../render/terrain-data.mjs';
const p=(level,x,y,variant='s0')=>({face:0,level,x,y,key:`0/${level}/${x}/${y}/${variant}`});
test('frame uploads remain below 128 KiB and leave excess ready records queued',()=>{
 const records=Array.from({length:20},()=>({mesh:{geometry:{attributes:{position:{count:289}}}},prepared:false}));let uploaded=0,scheduled=0;
 const ctx={warmQueue:records.slice(),gridMode:true,batches:{prepare(){uploaded+=289*64;}},prepareMeshes(){},stats:{},schedule(){scheduled++;}};
 StreamingTerrain.prototype.warm.call(ctx);assert.ok(uploaded>0&&uploaded<=128*1024);assert.ok(ctx.warmQueue.length>=13);assert.equal(records.filter(r=>r.prepared).length,20-ctx.warmQueue.length);assert.equal(scheduled,1);
});

test('a frame admits two dense surface tiles while the third waits below the 144 KiB ceiling',()=>{
 const records=Array.from({length:4},()=>({mesh:{geometry:{attributes:{position:{count:1089}}}},prepared:false}));let uploaded=0;
 const ctx={warmQueue:records,gridMode:true,batches:{prepare(){uploaded+=1089*64;}},prepareMeshes(){},stats:{},schedule(){}};
 StreamingTerrain.prototype.warm.call(ctx);assert.equal(uploaded,1089*64*2);assert.ok(uploaded<=144*1024);assert.equal(ctx.warmQueue.length,2);
});
test('streamed children replace a parent only as a complete footprint',()=>{const old=p(3,2,3),wanted=[p(4,4,6),p(4,5,6),p(4,4,7),p(4,5,7)],groups=transitionGroups([old],wanted);assert.equal(groups.length,1);assert.deepEqual(groups[0].remove,[old.key]);assert.deepEqual(new Set(groups[0].add),new Set(wanted.map(p=>p.key)));});
test('coarsening, refinement and stitch changes partition replacements without duplicates',()=>{const old=[p(4,4,6),p(4,5,6),p(4,4,7),p(4,5,7),p(3,3,3),p(3,4,3)],wanted=[p(3,2,3),p(4,6,6),p(4,7,6),p(4,6,7),p(4,7,7),p(3,4,3,'s1')],groups=transitionGroups(old,wanted);assert.equal(groups.length,1,'adjacent stitch changes commit together');assert.deepEqual(new Set(groups.flatMap(g=>g.remove)),new Set(old.map(p=>p.key)));assert.deepEqual(new Set(groups.flatMap(g=>g.add)),new Set(wanted.map(p=>p.key)));assert.equal(groups.flatMap(g=>g.add).length,wanted.length);});
test('an unfinished neighboring grid blocks a refinement from exposing an edge',()=>{
 const old=[p(3,2,3),p(3,3,3)],children=[p(4,4,6),p(4,5,6),p(4,4,7),p(4,5,7)],neighbor=p(3,3,3,'stitched'),groups=transitionGroups(old,[...children,neighbor]);
 const ready=new Set(children.map(p=>p.key));assert.equal(groups.filter(g=>g.add.every(k=>ready.has(k))).length,0);
 ready.add(neighbor.key);assert.equal(groups.filter(g=>g.add.every(k=>ready.has(k))).length,1);
 // At the edge of the previously visible area, new tiles also depend on the
 // replacement next to them. A completely new area may still fill progressively.
 const edge=transitionGroups([old[0]],[...children,neighbor]);assert.equal(edge.length,1);
 const initial=transitionGroups([],children);assert.equal(initial.length,4);
});
test('sample cache reuses exact terrain samples and remains bounded',()=>{let calls=0;const sample=createSampleCache(d=>({elevationMeters:d[0]*20,id:++calls}),4096);const a=sample([.125,.25,.75]),b=sample([.125,.25,.75]);assert.strictEqual(a,b);assert.equal(calls,1);for(let i=0;i<9000;i++)sample([i/10000,.4,.6]);assert.ok(sample.stats().size<=4096);assert.equal(sample.stats().hits,1);});
test('coarse filtered samples cannot overwrite full close-range terrain samples',()=>{
 const sample=createSampleCache((d,o)=>({height:o?.micro===false?100:107})),d=[.2,.4,.6];
 assert.equal(sample(d).height,107);assert.equal(sample(d,{micro:false}).height,100);assert.equal(sample(d,{micro:true}).height,107);assert.equal(sample.stats().misses,2);assert.equal(sample.stats().hits,1);
});
test('a replacement remains atomic until every new geometry has finished GPU preparation',()=>{
 const old=p(3,2,3),a=p(4,4,6),b=p(4,5,6),mesh=q=>({userData:{patch:q}}),oldMesh=mesh(old),ra={mesh:mesh(a),prepared:true},rb={mesh:mesh(b),prepared:false},noop=()=>{};
 const ctx={transitions:[{remove:[old.key],add:[a.key,b.key]}],active:new Map([[old.key,oldMesh]]),ready:new Map([[a.key,ra],[b.key,rb]]),cache:new Map(),water:new Map(),lookup:new Map(),batches:{add:noop,remove:noop},shadows:{add:noop,remove:noop},group:{add:noop,remove:noop},stats:{nearVisibleMilliseconds:null,cacheHits:0},started:performance.now(),revision:0};
 StreamingTerrain.prototype.commit.call(ctx);assert.equal(ctx.active.size,1);assert.ok(ctx.active.has(old.key));assert.equal(ctx.transitions.length,1);
 rb.prepared=true;StreamingTerrain.prototype.commit.call(ctx);assert.deepEqual(new Set(ctx.active.keys()),new Set([a.key,b.key]));assert.equal(ctx.transitions.length,0);assert.equal(ctx.cache.get(old.key).mesh,oldMesh);assert.equal(ctx.cache.get(old.key).prepared,true);
 ctx.transitions=[{remove:[a.key,b.key],add:[old.key]}];StreamingTerrain.prototype.commit.call(ctx);assert.equal(ctx.transitions.length,0);assert.equal(ctx.active.get(old.key),oldMesh);
});
test('tree ground sampler uses the visible triangle rather than hidden procedural relief',()=>{const positions=new Float32Array((PATCH+1)**2*3),level=18,size=2/2**level,x=131072,y=131072,u=0,v=0,center=new Vector3(1000,0,0);for(let j=0;j<=PATCH;j++)for(let i=0;i<=PATCH;i++){const d=faceDirection(0,u+i/PATCH*size,v+j/PATCH*size),height=100+i*2+j*3;for(let k=0;k<3;k++)positions[(j*(PATCH+1)+i)*3+k]=d[k]*(1000+height/12000)-center.getComponent(k);}
 const mesh={position:center,geometry:{attributes:{position:{array:positions}}},userData:{patch:{u,v,size}}},context={stats:{maxLevel:level},lookup:new Map([[`0/${level}/${x}/${y}`,mesh]]),world:{radiusMeters:12000000}},d=faceDirection(0,7.3/PATCH*size,6.2/PATCH*size),height=StreamingTerrain.prototype.surfaceAt.call(context,d);assert.ok(Math.abs(height-(100+7.3*2+6.2*3))<.002,`${height}`);
});

// Hash collisions and bounded eviction must never substitute another sample.
test('numeric sample keys obey their byte cap and retain exact filtering semantics',()=>{
 const sample=createSampleCache((d,o)=>({height:d[0]+(o?.microWeight??1),micro:o?.micro!==false}),1000000,{keyByteBudget:4096});
 for(let i=0;i<10000;i++){const d=[(i%231)/1000,.7,-.23],o={micro:i%2===0,microWeight:(i%17)/16},value=sample(d,o);assert.equal(value.height,d[0]+o.microWeight);assert.equal(value.micro,o.micro);}
 const stats=sample.stats();assert.ok(stats.keyBytes<=4096);assert.ok(stats.size<=stats.capacity);assert.ok(stats.evictions>0);
 const d=[.22,.4,.7],a=sample(d,{microWeight:.25}),b=sample(d,{microWeight:.75});assert.equal(a.height,.47);assert.equal(b.height,.97);assert.notEqual(a,b);
});

test('linear camera coordinates distribute across the bounded sample cache',()=>{
 const value={elevationMeters:1},sample=createSampleCache(()=>value,80000);
 for(let i=0;i<100000;i++)sample([i/100000,.2,.8]);
 assert.ok(sample.stats().size>68000,JSON.stringify(sample.stats()));assert.ok(sample.stats().keyBytes<=4*1024*1024);
});
