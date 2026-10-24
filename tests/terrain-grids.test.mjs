import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,BufferAttribute,Mesh,MeshBasicNodeMaterial,Group,PerspectiveCamera,Vector3} from 'three/webgpu';
import {writeGridSlot,createTerrainGrids,shadowGridIndex} from '../render/terrain-grids.mjs';
function patch(x=0){const g=new BufferGeometry();for(const [name,size]of [['position',3],['normal',3],['color',3],['surface',4],['climate',2]])g.setAttribute(name,new BufferAttribute(Float32Array.from({length:3*size},(_,i)=>(i+1)/100),size));g.setIndex([0,1,2]);g.computeBoundingSphere();const m=new Mesh(g);m.position.set(1000+x,0,0);m.userData.patch={level:18};return m;}
test('resident grid samples preserve every stitched vertex and material channel exactly',()=>{
 const m=patch(),output=new Float32Array(64);writeGridSlot(output,16,m.geometry);
 for(let i=0;i<3;i++){const p=output.slice(16+i*16,32+i*16);assert.deepEqual([...p.slice(0,3)],[...m.geometry.attributes.position.array.slice(i*3,i*3+3)]);assert.deepEqual([p[3],p[4],p[5]],[...m.geometry.attributes.normal.array.slice(i*3,i*3+3)]);assert.deepEqual([p[6],p[7],p[8]],[...m.geometry.attributes.color.array.slice(i*3,i*3+3)]);assert.deepEqual([p[9],p[10],p[11],p[12]],[...m.geometry.attributes.surface.array.slice(i*4,i*4+4)]);assert.deepEqual([p[13],p[14]],[...m.geometry.attributes.climate.array.slice(i*2,i*2+2)]);}
 assert.ok(output.slice(0,16).every(x=>x===0));
});
test('GPU slots survive visibility changes and reuse disposed slots without rebuilding geometry',()=>{
 const group=new Group(),pool=createTerrainGrids(group,()=>new MeshBasicNodeMaterial(),{capacity:2}),a=patch(),b=patch(.01),c=patch(.02),writes=[];pool.attachRenderer({_attributes:{update(a){writes.push(a.updateRanges.map(r=>({...r})));a.clearUpdateRanges();},delete(){}}});
 pool.prepare(a);pool.add(a);pool.prepare(b);pool.add(b);assert.equal(pool.stats.gridAllocations,1);assert.equal(a.visible,false);const geometry=group.children[0].geometry;
 pool.remove(a);pool.add(a);assert.equal(pool.stats.uploadedBytes,2*3*64);pool.remove(a);a.geometry.dispose();pool.prepare(c);pool.add(c);assert.equal(pool.stats.gridAllocations,1);assert.equal(pool.stats.residentSlots,2);assert.equal(group.children[0].geometry,geometry);assert.equal(writes.at(-1)[0].count,3*16);pool.dispose();assert.equal(group.children.length,0);
});

test('dense surface grids allocate bounded banks and upload only one tile at a time',()=>{
 const group=new Group(),pool=createTerrainGrids(group,()=>new MeshBasicNodeMaterial()),m=patch(),count=33*33;
 for(const [name,size]of [['position',3],['normal',3],['color',3],['surface',4],['climate',2]])m.geometry.setAttribute(name,new BufferAttribute(new Float32Array(count*size),size));
 const writes=[];pool.attachRenderer({_attributes:{update(a){writes.push(a.updateRanges.map(r=>({...r})));a.clearUpdateRanges();},delete(){}}});
 pool.prepare(m);assert.ok(pool.stats.allocatedBytes<=8*1024*1024);assert.ok(pool.stats.allocatedBytes>=count*64);
 assert.equal(pool.stats.frameUploadBytes,count*64);assert.ok(pool.stats.frameUploadBytes<128*1024);assert.deepEqual(writes.at(-1),[{start:0,count:count*16}]);
 pool.dispose();m.geometry.dispose();m.material.dispose();
});

test('shadow casters keep the exact relief and stitched topology of the visible terrain',()=>{
 const m=patch();m.geometry.setAttribute('position',new BufferAttribute(new Float32Array(33*33*3),3));m.geometry.setIndex([0,1,33,1,34,33]);const index=shadowGridIndex(m.geometry,32);
 assert.notEqual(index,m.geometry.index);assert.deepEqual([...index.array],[...m.geometry.index.array]);
 m.geometry.dispose();m.material.dispose();
});

test('unused GPU banks are released while one empty bank remains ready for reuse',()=>{
 const group=new Group(),pool=createTerrainGrids(group,()=>new MeshBasicNodeMaterial(),{capacity:1}),a=patch(),b=patch(.1);pool.prepare(a);pool.prepare(b);const peak=pool.stats.allocatedBytes;assert.equal(pool.stats.batches,2);
 a.geometry.dispose();assert.equal(pool.stats.batches,2);b.geometry.dispose();assert.equal(pool.stats.batches,1);assert.equal(pool.stats.allocatedBytes,peak/2);assert.equal(pool.stats.residentSlots,0);assert.equal(group.children.length,2);
 const c=patch(.2);pool.prepare(c);assert.equal(pool.stats.gridAllocations,2,'the remaining empty bank is reused');pool.dispose();for(const m of [a,b,c]){m.geometry.dispose();m.material.dispose();}
});

test('camera movement inside a floating-origin cell does not rewrite unchanged instance offsets',()=>{
 const group=new Group(),pool=createTerrainGrids(group,()=>new MeshBasicNodeMaterial()),m=patch(),camera=new PerspectiveCamera(60,1,.01,100);
 m.position.set(0,0,0);pool.add(m);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();const origin=new Vector3();
 pool.update(camera,camera.position,origin);const geometry=group.children[0].geometry,offset=geometry.getAttribute('patchOffset'),version=offset.version;
 assert.equal(geometry.instanceCount,1);camera.position.x=.001;camera.updateMatrixWorld();pool.update(camera,camera.position,origin);assert.equal(offset.version,version);
 origin.x=.25;pool.update(camera,camera.position,origin);assert.ok(offset.version>version);assert.equal(offset.array[0],-.25);pool.dispose();m.geometry.dispose();m.material.dispose();
});
