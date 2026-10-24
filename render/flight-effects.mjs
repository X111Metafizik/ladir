import * as THREE from 'three/webgpu';
// Fixed pools and preallocated instance colors avoid a shader variant change
// when the first projectile or explosion appears during flight.
export function createWeaponEffects(group,scale,capacity){
 const owned=[],dummy=new THREE.Object3D(),color=new THREE.Color(),axis=new THREE.Vector3(0,0,1),up=new THREE.Vector3(0,1,0);
 function pool(geometry,count,opacity=1){const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}),mesh=new THREE.InstancedMesh(geometry,material,0);mesh.instanceMatrix=new THREE.StorageInstancedBufferAttribute(count,16);mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);mesh.count=count;mesh.setColorAt(0,color.set(0xffffff));mesh.count=0;mesh.frustumCulled=false;mesh.scale.setScalar(scale);group.add(mesh);owned.push(mesh);return mesh;}
 const cylinder=new THREE.CylinderGeometry(1,1,1,6);cylinder.rotateX(Math.PI/2);
 const bolts=pool(cylinder,capacity),glow=pool(cylinder.clone(),capacity,.28),fires=pool(new THREE.IcosahedronGeometry(1,1),16,.85),rings=pool(new THREE.TorusGeometry(1,.035,4,32),16,.65),sparks=pool(cylinder.clone(),192),muzzles=pool(new THREE.IcosahedronGeometry(1,1),2);
 function put(mesh,index,position,direction,size,tint){dummy.position.copy(position);dummy.quaternion.setFromUnitVectors(axis,direction);dummy.scale.copy(size);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);mesh.setColorAt(index,tint);}
 const pos=new THREE.Vector3(),size=new THREE.Vector3(),direction=new THREE.Vector3();
 function update(sim,pose=sim){
  for(const m of owned)m.position.copy(pose.position).multiplyScalar(scale);
  bolts.count=glow.count=sim.projectiles.length;
  for(let i=0;i<sim.projectiles.length;i++){const p=sim.projectiles[i];pos.copy(p.renderPosition??p.position).sub(pose.position).addScaledVector(p.direction,-20);size.set(p.missile?2.6:1.15,p.missile?2.6:1.15,p.missile?42:58);color.set(p.enemy?0xff673b:p.missile?0xffd992:0xb8faff).multiplyScalar(3);put(bolts,i,pos,p.direction,size,color);size.x*=3.5;size.y*=3.5;size.z*=1.2;put(glow,i,pos,p.direction,size,color);}
  fires.count=rings.count=sim.explosions.length;sparks.count=0;
  for(let i=0;i<sim.explosions.length;i++){const e=sim.explosions[i],duration=e.duration??1.2,t=THREE.MathUtils.clamp(1-(e.life+(1-(pose.alpha??1))*(sim.clock?.step??0))/duration,0,1),power=e.impact?9:70,r=power*(.1+Math.sqrt(t)),fade=(1-t)**1.4;pos.copy(e.position).sub(pose.position);direction.copy(e.position).normalize();size.setScalar(r);color.setRGB(3*fade,Math.max(0,1-t*1.5)*2*fade,.3*fade);put(fires,i,pos,direction,size,color);size.setScalar(power*(.2+t*2.8));color.setRGB(2.3*fade,1.25*fade,.45*fade);put(rings,i,pos,direction,size,color);
   for(let j=0;j<12;j++){const a=j*2.39996+(e.id??i),z=1-2*(j+.5)/12,b=Math.sqrt(1-z*z);direction.set(Math.cos(a)*b,Math.sin(a)*b,z);pos.copy(e.position).sub(pose.position).addScaledVector(direction,power*(1-Math.exp(-t*2))*2);const width=(e.impact?.65:1.4)*(1-t);size.set(width,width,width*(3+5*(1-t)));color.setRGB(4*fade,2.3*fade,.55*fade);put(sparks,sparks.count++,pos,direction,size,color);}
  }
  muzzles.count=sim.gunKick>.1&&sim.state==='flying'?1:0;
  if(muzzles.count){pos.copy(pose.forward).multiplyScalar(52.8).addScaledVector(pose.right,((sim.shots-1)%2?1:-1)*17);size.setScalar(5+sim.gunKick*5);color.setRGB(3,5,5);put(muzzles,0,pos,pose.forward,size,color);}
  for(const m of owned)if(m.count){m.instanceMatrix.clearUpdateRanges();m.instanceMatrix.addUpdateRange(0,m.count*16);m.instanceMatrix.needsUpdate=true;m.instanceColor.clearUpdateRanges();m.instanceColor.addUpdateRange(0,m.count*3);m.instanceColor.needsUpdate=true;}
 }
 return {update,async prewarm(renderer,camera,scene,target){const previous=renderer.getRenderTarget(),counts=owned.map(m=>m.count);for(const m of owned){m.count=1;dummy.position.set(0,0,0);dummy.quaternion.identity();dummy.scale.setScalar(.001);dummy.updateMatrix();m.setMatrixAt(0,dummy.matrix);}renderer.setRenderTarget(target);try{await renderer.compileAsync(group,camera,scene);}finally{owned.forEach((m,i)=>m.count=counts[i]);renderer.setRenderTarget(previous);}},dispose(){for(const m of owned){m.removeFromParent();m.dispose();m.geometry.dispose();m.material.dispose();}}};
}
