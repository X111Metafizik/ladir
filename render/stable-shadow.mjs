import {Vector3} from 'three/webgpu';

// Quantize in the light's XY plane, in absolute planet coordinates. Snapping
// world XYZ lets the projected texel lattice slide as the camera moves.
export class StableShadowFocus {
 constructor(){this.right=new Vector3();this.up=new Vector3();this.z=new Vector3();this.axis=new Vector3(0,1,0);}
 snap(target,sun,texel,out){
  this.z.copy(sun).normalize();this.axis.set(0,Math.abs(this.z.y)>.999?0:1,Math.abs(this.z.y)>.999?1:0);
  this.right.crossVectors(this.axis,this.z).normalize();this.up.crossVectors(this.z,this.right);
  const x=Math.round(target.dot(this.right)/texel)*texel,y=Math.round(target.dot(this.up)/texel)*texel;
  return out.copy(this.right).multiplyScalar(x).addScaledVector(this.up,y).addScaledVector(this.z,target.dot(this.z));
 }
}
