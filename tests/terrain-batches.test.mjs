import test from 'node:test';import assert from 'node:assert/strict';
import {BufferGeometry,BufferAttribute,Mesh,MeshBasicMaterial,Group} from 'three';
import {beginTerrainBatch,appendTerrainPatch,createTerrainBatches} from '../render/terrain-batches.mjs';
function patch(x){const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array([.001,0,0,.006,0,0,.001,.003,0]),3));g.setAttribute('normal',new BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));g.setAttribute('color',new BufferAttribute(new Float32Array([.2,.4,.6,.3,.5,.7,.4,.6,.8]),3));g.setAttribute('surface',new BufferAttribute(new Float32Array([3,.2,0,100,3,.3,0,110,6,.1,0,120]),4));g.setIndex([0,1,2]);const m=new Mesh(g,new MeshBasicMaterial());m.position.set(1000+x*.002,200,100);m.userData.patch={face:0,level:18,x,y:131072};return m;}
test('visible batching preserves triangles, physical positions and every material channel',()=>{
 const meshes=[patch(131072),patch(131073)],job=beginTerrainBatch(meshes);while(!appendTerrainPatch(job)){}
 assert.deepEqual([...job.indices],[0,1,2,3,4,5]);let offset=0;for(const m of meshes){for(const [name,a]of Object.entries(m.geometry.attributes))for(let i=0;i<a.array.length;i++){const value=job.attributes[name].array[offset*a.itemSize+i];if(name==='position'){const k=i%3;assert.ok(Math.abs(value+job.center.getComponent(k)-a.array[i]-m.position.getComponent(k))*12000<.002);}else assert.equal(value,a.array[i]);}offset+=3;}
});
test('batch replacement keeps full individual coverage until a current batch is ready',()=>{
 const group=new Group(),material=new MeshBasicMaterial(),batch=createTerrainBatches(group,material),a=patch(131072),b=patch(131073),c=patch(131074);group.add(a,b,c);batch.add(a);batch.add(b);batch.update(100);assert.equal(a.visible,false);assert.equal(b.visible,false);assert.equal(group.children.filter(m=>m.userData.terrainBatch).length,1);
 batch.add(c);assert.equal(c.visible,true);batch.update(100);assert.equal(c.visible,false);batch.remove(a);group.remove(a);assert.equal(b.visible,true);assert.equal(c.visible,true);assert.equal(group.children.filter(m=>m.userData.terrainBatch).length,0);
 batch.update(100);assert.equal(b.visible,false);batch.dispose();assert.equal(b.visible,true);assert.equal(c.visible,true);assert.equal(group.children.filter(m=>m.userData.terrainBatch).length,0);
});
