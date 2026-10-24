import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,Quaternion} from 'three/webgpu';
import {createWarpEffects} from '../render/warp-effects.mjs';

test('warp waves and tunnel keep fixed buffers and hide cleanly after arrival',()=>{
 const parent=new Group(),fx=createWarpEffects(parent,1),sim={time:0,state:'flying',skills:{warp:{phase:'charging',remaining:3,elapsed:0}}},pose={position:new Vector3(1,2,3)},q=new Quaternion();
 fx.update(sim,pose,q);assert.equal(fx.root.visible,true);const tube=fx.root.getObjectByName('transparent-wormhole'),shell=fx.root.getObjectByName('warp-charge-wave'),rings=fx.root.getObjectByName('warp-wavefronts'),matrix=rings.instanceMatrix.array;
 assert.equal(tube.visible,false);assert.equal(shell.visible,true);sim.skills.warp.remaining=0;sim.skills.warp.phase='accelerating';sim.state='warping';
 for(let i=0;i<720;i++){sim.time=3+i/60;sim.skills.warp.elapsed=i/60;fx.update(sim,pose,q);}
 assert.equal(tube.visible,true);assert.equal(shell.visible,false);assert.equal(rings.instanceMatrix.array,matrix);assert.ok(matrix.every(Number.isFinite));assert.equal(fx.root.children.length,4);assert.equal(tube.material.depthWrite,false);assert.equal(tube.material.transparent,true);
 sim.state='flying';sim.skills.warp.phase='idle';fx.update(sim,pose,q);assert.equal(fx.root.visible,false);const restore=fx.warm();assert.equal(fx.root.visible,true);restore();assert.equal(fx.root.visible,false);fx.dispose();assert.equal(parent.children.length,0);
});
