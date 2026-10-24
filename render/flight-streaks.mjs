import {BufferGeometry,BufferAttribute,LineSegments,LineBasicMaterial,AdditiveBlending,DynamicDrawUsage,Vector3} from 'three/webgpu';
// One draw, one fixed buffer: no objects are born or retired during boost.
export function createFlightStreaks(group,scale,count=112){
 const positions=new Float32Array(count*6),geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3).setUsage(DynamicDrawUsage));
 const material=new LineBasicMaterial({color:0xa7dce5,transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending}),mesh=new LineSegments(geometry,material);mesh.frustumCulled=false;mesh.scale.setScalar(scale);group.add(mesh);
 const start=new Vector3(),end=new Vector3();let travel=0,lastTime=null;
 function update(sim,pose){
  const time=sim.time-(1-(pose.alpha??1))*(sim.clock?.step??0),dt=lastTime===null||time<lastTime?0:Math.min(.1,time-lastTime);lastTime=time;if(!sim.paused)travel+=sim.speed*dt;
  const speed=Math.max(0,Math.min(1,(sim.speed-45)/455));mesh.visible=sim.state==='flying'&&speed>.01;material.opacity=.055+speed*.19;if(!mesh.visible)return;
  mesh.position.copy(pose.position).multiplyScalar(scale);const length=1.8+speed*18;
  for(let i=0;i<count;i++){
   const angle=i*2.399963,radial=85+((i*73)%149),z=((i*127.43-travel)%950+950)%950-400;
   start.copy(pose.right).multiplyScalar(Math.cos(angle)*radial).addScaledVector(pose.up,Math.sin(angle)*radial).addScaledVector(pose.forward,z);
   end.copy(start).addScaledVector(pose.forward,-length);start.toArray(positions,i*6);end.toArray(positions,i*6+3);
  }
  geometry.attributes.position.needsUpdate=true;
 }
 return {mesh,update,stats:{capacity:count,drawCalls:1,bufferBytes:positions.byteLength},dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
