import test from 'node:test';import assert from 'node:assert/strict';
import {BufferGeometry,BufferAttribute,Mesh} from 'three';
import {createTerrainUploader} from '../render/terrain-upload.mjs';
test('staged terrain buffers upload once and dispose even if a camera retarget cancels them before rendering',()=>{
 const active=new Set(),calls=[],renderer={_attributes:{update(a,type){active.add(a);calls.push(type);},delete(a){active.delete(a);}}},g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(9),3));g.setIndex([0,1,2]);
 const m=new Mesh(g),u=createTerrainUploader(renderer,'186');u.prepare(m);u.prepare(m);assert.deepEqual(calls,[1,2]);assert.equal(u.stats.geometries,1);assert.equal(u.stats.bytes,42);assert.equal(active.size,2);g.dispose();assert.equal(active.size,0);
});
test('the optional upload adapter safely falls back when the Three revision changes',()=>{
 const u=createTerrainUploader({},'187');assert.equal(u.stats.supported,false);u.prepare(new Mesh(new BufferGeometry()));assert.equal(u.stats.geometries,0);
});
