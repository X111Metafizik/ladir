import * as THREE from 'three/webgpu';
export function createShipEffects(player,texture){
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const plumeGeo=new THREE.PlaneGeometry(7,23);plumeGeo.rotateX(-Math.PI/2);plumeGeo.translate(0,0,10);
 // Shrink around each nozzle's local origin; engine mounts and hull keep their scale.
 plumeGeo.scale(.25,.25,.25);
 const plumeMat=new THREE.MeshBasicMaterial({map:texture,color:new THREE.Color(3.8,3.8,3.8),transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,forceSinglePass:true});
 const plumes=new THREE.InstancedMesh(plumeGeo,plumeMat,6);plumes.name='ion-thrusters';plumes.frustumCulled=false;plumes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);player.add(plumes);
 const lightGeo=new THREE.SphereGeometry(.16,6,4),lightMat=new THREE.MeshBasicMaterial({color:0xffffff}),lights=new THREE.InstancedMesh(lightGeo,lightMat,12);lights.name='hull-emissive-lights';player.add(lights);
 const dummy=new THREE.Object3D(),color=new THREE.Color(),positions=[[-10,0,-2],[10,0,-2],[-7,1,7],[7,1,7],[-2,2,-5],[2,2,-5],[-6,-.4,9.3],[6,-.4,9.3],[-4,1,1],[4,1,1],[-1.5,1.9,-9],[1.5,1.9,-9]];
 const raycaster=new THREE.Raycaster(),rayOrigin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);player.updateWorldMatrix(true,true);down.transformDirection(player.matrixWorld);let lightCount=0;
 // The old long plume hid an origin inside the imported hull. Find the actual
 // aft surface once so the shortened plume still emerges from each engine.
 const aftRay=new THREE.Vector3(0,0,-1).transformDirection(player.matrixWorld),mounts=[];
 for(const x of [-5.9,5.9]){rayOrigin.set(x,-.5,30).applyMatrix4(player.matrixWorld);raycaster.set(rayOrigin,aftRay);const hit=raycaster.intersectObject(player.children[0],true)[0];mounts.push(new THREE.Vector3(x,-.5,hit?player.worldToLocal(hit.point).z+.25:16.25));}
 for(let i=0;i<positions.length;i++){const [x,,z]=positions[i];rayOrigin.set(x,30,z).applyMatrix4(player.matrixWorld);raycaster.set(rayOrigin,down);const hit=raycaster.intersectObject(player.children[0],true)[0];if(!hit)continue;dummy.position.copy(player.worldToLocal(hit.point)).add(new THREE.Vector3(0,.09,0));dummy.scale.setScalar(i<2?1.5:1);dummy.updateMatrix();lights.setMatrixAt(lightCount,dummy.matrix);lights.setColorAt(lightCount++,color.setRGB(...(i===0?[5,.18,.12]:i===1?[.18,5,1.4]:i<4?[5,2.4,.35]:[.4,4.8,6])));}lights.count=lightCount;lights.instanceMatrix.needsUpdate=true;if(lights.instanceColor)lights.instanceColor.needsUpdate=true;
 let previousTime=-1;
 function update(sim){plumes.visible=sim.state!=='landed'&&sim.state!=='crashed';lights.visible=sim.state!=='crashed';if(sim.time===previousTime)return;previousTime=sim.time;
  const power=sim.boosting?2.15:sim.state==='taking-off'?1.35:.8+Math.min(1,sim.speed/200)*.35,flicker=1+Math.sin(sim.time*41)*.035+Math.sin(sim.time*67)*.02;plumeMat.opacity=sim.boosting?.95:.75;
  for(let i=0;i<6;i++){dummy.position.copy(mounts[i<3?0:1]);dummy.rotation.set(0,0,(i%3)*Math.PI/3);dummy.scale.set(sim.boosting?1.13:1,sim.boosting?1.13:1,power*flicker);dummy.updateMatrix();plumes.setMatrixAt(i,dummy.matrix);}plumes.instanceMatrix.needsUpdate=true;
 }
 return {plumes,lights,update,dispose(){plumes.removeFromParent();lights.removeFromParent();plumes.dispose();lights.dispose();plumeGeo.dispose();lightGeo.dispose();plumeMat.dispose();lightMat.dispose();texture.dispose();}};
}
