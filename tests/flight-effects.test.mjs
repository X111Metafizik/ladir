import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {FlightSimulation} from '../simulation/flight.mjs';
import {createWeaponEffects} from '../render/flight-effects.mjs';

test('removing an older explosion preserves the surviving spark paths and GPU buffers',()=>{
  const s=new FlightSimulation({radius:12000000,direction:[0,0,1],terrain:()=>({elevationMeters:240})}),group=new THREE.Group(),effects=createWeaponEffects(group,1000/s.radius,128);
  try{
    const a=s.explode(s.position),b=s.explode(s.position.clone().addScaledVector(s.forward,200));a.life=b.life=.7;
    effects.update(s,s.present());const sparks=group.children[4],matrix=new THREE.Matrix4();sparks.getMatrixAt(12,matrix);const before=matrix.clone(),buffer=sparks.instanceMatrix;
    a.life=0;s.explosionPool.compact();effects.update(s,s.present());sparks.getMatrixAt(0,matrix);
    assert.deepEqual(matrix.elements,before.elements);assert.equal(sparks.instanceMatrix,buffer);assert.equal(sparks.count,12);
    for(let i=0;i<40;i++)s.explode(s.position);effects.update(s,s.present());assert.equal(sparks.count,192);assert.ok(group.children.every(m=>m.count<=m.instanceMatrix.count));
  }finally{effects.dispose();}
});
test('projectile presentation stays precise at planetary coordinates and depth tests remain enabled',()=>{
  const s=new FlightSimulation({radius:12000000,direction:[.6,.48,.64],terrain:()=>({elevationMeters:240})}),group=new THREE.Group(),scale=1000/s.radius,effects=createWeaponEffects(group,scale,128);
  try{
    s.spawnProjectile(s.position.clone().addScaledVector(s.forward,80),s.forward,{life:1,speed:1350,damage:1});s.step(1/60);s.step(1/120);const pose=s.present();effects.update(s,pose);
    const m=group.children[0],matrix=new THREE.Matrix4();m.getMatrixAt(0,matrix);
    const displayed=new THREE.Vector3().setFromMatrixPosition(matrix).addScaledVector(s.projectiles[0].direction,20).add(pose.position);
    assert.ok(displayed.distanceTo(s.projectiles[0].renderPosition)<.0001);
    assert.ok(group.children.every(m=>m.material.depthTest&&!m.material.depthWrite));
  }finally{effects.dispose();}
});
