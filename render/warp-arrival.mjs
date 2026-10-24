import {Vector3} from 'three';

// Loading prediction only: never alters the route or authorizes a jump.
export function warpArrivalCamera(route,radius,aspect=1,range=250){
 const forward=route.forward.clone().normalize(),point=route.position.clone();
 const b=route.from.dot(forward),disc=b*b-route.from.lengthSq()+radius*radius;
 if(disc>=0){const entry=-b-Math.sqrt(disc);if(entry>=0&&entry<route.distance)point.copy(route.from).addScaledVector(forward,Math.max(0,entry-1200));}
 // A route through the planet must not ask the terrain planner to refine a
 // camera inside its centre. Preload the approach to the impact instead.
 if(point.length()<radius+1200)point.setLength(radius+1200);
 const up=point.clone().normalize(),right=new Vector3().crossVectors(forward,up);
 if(right.lengthSq()<1e-8)right.crossVectors(forward,Math.abs(forward.y)<.9?new Vector3(0,1,0):new Vector3(1,0,0));
 right.normalize();up.crossVectors(right,forward).normalize();
 const camera=point.clone().addScaledVector(forward,-range).addScaledVector(up,range*.31);
 const look=point.clone().addScaledVector(forward,450).addScaledVector(up,55).sub(camera).normalize();
 right.crossVectors(look,up).normalize();up.crossVectors(right,look).normalize();
 const tanY=Math.tan(78*Math.PI/360);
 return {camera:camera.multiplyScalar(1000/radius),view:{forward:look.toArray(),right:right.toArray(),up:up.toArray(),tanY,tanX:tanY*aspect}};
}
