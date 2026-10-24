import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three/webgpu';
import {createFlightStreaks} from '../render/flight-streaks.mjs';
const pose={position:new Vector3(0,0,12000000),right:new Vector3(1,0,0),up:new Vector3(0,0,1),forward:new Vector3(0,1,0)};
test('flight streaks reuse one bounded buffer and flow backwards',()=>{
 const group=new Group(),effect=createFlightStreaks(group,1),a=effect.mesh.geometry.attributes.position.array,sim={time:0,speed:200,state:'flying',paused:false};
 effect.update(sim,pose);const first=a[7];sim.time=.01;effect.update(sim,pose);assert.ok(Math.abs((a[7]-first)+2)<.001);
 for(let i=0;i<10000;i++){sim.time+=.01;effect.update(sim,pose);}
 assert.equal(effect.mesh.geometry.attributes.position.array,a);assert.equal(group.children.length,1);assert.equal(a.length,112*6);assert.ok(a.every(Number.isFinite));effect.dispose();assert.equal(group.children.length,0);
});
test('streaks freeze during pause and disappear on landing or stop',()=>{
 const effect=createFlightStreaks(new Group(),1),sim={time:2,speed:500,state:'flying',paused:false};effect.update(sim,pose);const before=[...effect.mesh.geometry.attributes.position.array];sim.paused=true;sim.time=3;effect.update(sim,pose);assert.deepEqual([...effect.mesh.geometry.attributes.position.array],before);
 sim.state='landed';effect.update(sim,pose);assert.equal(effect.mesh.visible,false);sim.state='flying';sim.speed=0;effect.update(sim,pose);assert.equal(effect.mesh.visible,false);effect.dispose();
});
