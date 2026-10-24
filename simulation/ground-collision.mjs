import {Vector3} from 'three';

export function collisionScratch(){return {point:new Vector3(),normal:new Vector3(),probe:new Vector3(),direction:new Vector3(),tangent:new Vector3(),bitangent:new Vector3(),sample:new Vector3(),distance:0};}

// Clip the sweep to the terrain shell first. Space travel performs no terrain
// queries, including segments whose endpoints straddle the entire planet.
export function sweepGround(from,to,radius,ground,clearance,out){
 const ray=out.direction.copy(to).sub(from),length=ray.length();if(!length)return false;ray.multiplyScalar(1/length);
 const b=from.dot(ray),outer=radius+60000,disc=b*b-from.lengthSq()+outer*outer;if(disc<0)return false;
 const near=Math.max(0,-b-Math.sqrt(disc)),far=Math.min(length,-b+Math.sqrt(disc));if(near>far)return false;
 const gap=travel=>{out.probe.copy(from).addScaledVector(ray,travel);const height=out.probe.length()-radius;return height-ground(out.sample.copy(out.probe).normalize()).height-clearance;};
 let previous=near,at=near,clear=gap(near);
 while(true){
  if(clear<=0){
   let lo=previous,hi=at;
   for(let i=0;i<15&&hi-lo>.005;i++){const mid=(lo+hi)/2;if(gap(mid)>0)lo=mid;else hi=mid;}
   out.distance=hi;out.point.copy(from).addScaledVector(ray,hi);out.normal.copy(out.point).normalize();
   // Estimate the physical face normal only on impact. A horizontal hit on a
   // ridge must carry damage too; radial velocity alone misses that collision.
   out.tangent.set(0,1,0);if(Math.abs(out.normal.y)>.95)out.tangent.set(1,0,0);
   out.tangent.cross(out.normal).normalize();out.bitangent.crossVectors(out.normal,out.tangent).normalize();
   const h=ground(out.normal).height,epsilon=8/radius;
   const e=ground(out.sample.copy(out.normal).addScaledVector(out.tangent,epsilon).normalize()).height;
   const n=ground(out.sample.copy(out.normal).addScaledVector(out.bitangent,epsilon).normalize()).height;
   out.point.copy(out.normal).multiplyScalar(radius+h+clearance);
   out.normal.addScaledVector(out.tangent,-(e-h)/8).addScaledVector(out.bitangent,-(n-h)/8).normalize();return true;
  }
  if(at>=far)return false;
  previous=at;at=Math.min(far,at+Math.max(25,Math.min(125,clear*.25)));clear=gap(at);
 }
}
