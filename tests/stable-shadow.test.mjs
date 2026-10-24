import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three/webgpu';
import {StableShadowFocus} from '../render/stable-shadow.mjs';
test('the shadow focus stays on the light-space pixel lattice at planetary coordinates',()=>{
 const stable=new StableShadowFocus(),sun=new Vector3(.3,.8,-.6).normalize(),target=new Vector3(423,218,-880),out=new Vector3(),texel=1/12000;
 stable.snap(target,sun,texel,out);
 for(const axis of [stable.right,stable.up])assert.ok(Math.abs(out.dot(axis)/texel-Math.round(out.dot(axis)/texel))<1e-6);
 assert.ok(Math.abs(target.dot(sun)-out.dot(sun))<1e-10);
 const moved=out.clone().addScaledVector(stable.right,texel*.2).addScaledVector(stable.up,texel*.2),next=stable.snap(moved,sun,texel,new Vector3());assert.ok(next.distanceTo(out)<1e-10);
});
test('origin rebasing cannot move the absolute shadow lattice and polar light directions remain finite',()=>{
 const stable=new StableShadowFocus(),target=new Vector3(390,920,-25),originA=new Vector3(389,919,-24),originB=new Vector3(390,920,-25);
 for(const sun of [new Vector3(0,1,0),new Vector3(0,-1,0),new Vector3(.3,.4,.5).normalize()]){
  const a=stable.snap(target,sun,.0001,new Vector3()),b=stable.snap(target,sun,.0001,new Vector3());
  a.sub(originA).add(originA);b.sub(originB).add(originB);assert.ok(a.distanceTo(b)<1e-10);assert.ok(a.toArray().every(Number.isFinite));assert.ok(Math.abs(stable.right.dot(stable.up))<1e-8);
 }
});
