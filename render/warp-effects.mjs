import * as THREE from 'three/webgpu';
import {uniform,uv,vec3,float,sin,smoothstep,mix,normalView,positionView,abs} from 'three/tsl';
import {SKILLS} from '../simulation/skills.mjs';

// Four bounded draws, no sprites, downloads, per-frame mesh creation or lights.
// An open tube retains the world behind it; end fades avoid visible cut planes.
export function createWarpEffects(parent,scale){
 const root=new THREE.Group();root.name='warp-field';root.scale.setScalar(scale);root.visible=false;parent.add(root);
 const clock=uniform(0),energy=uniform(0),charge=uniform(0),tex=uv();
 const transparent={transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,forceSinglePass:true};
 const tubeGeo=new THREE.CylinderGeometry(900,220,6500,64,32,true);tubeGeo.rotateX(-Math.PI/2);tubeGeo.translate(0,0,-2200);
 const tubeMat=new THREE.MeshBasicNodeMaterial(transparent),phase=tex.x.mul(Math.PI*6).add(tex.y.mul(19)).sub(clock.mul(1.7));
 const ribbon=smoothstep(.15,.95,sin(phase).mul(.5).add(.5));
 const filament=smoothstep(.88,.998,sin(phase.mul(3).add(tex.y.mul(23)).sub(clock.mul(2.8))).mul(.5).add(.5));
 const fade=smoothstep(0,.14,tex.y).mul(float(1).sub(smoothstep(.8,1,tex.y)));
 // Angular colour repeats once around the tube; a fractional repeat leaves
 // a hard colour seam where its UV endpoints meet.
 tubeMat.colorNode=mix(vec3(.12,.52,.88),vec3(.58,.23,1.05),sin(tex.x.mul(Math.PI*2).add(tex.y.mul(7.6)).sub(clock.mul(.68))).mul(.5).add(.5)).add(filament.mul(.32));
 tubeMat.opacityNode=fade.mul(ribbon.mul(.12).add(filament.mul(.15)).add(.025)).mul(energy);
 const tube=new THREE.Mesh(tubeGeo,tubeMat);tube.name='transparent-wormhole';tube.frustumCulled=false;root.add(tube);
 const shellMat=new THREE.MeshBasicNodeMaterial(transparent),rim=float(1).sub(abs(normalView.dot(positionView.normalize()))).pow(3);
 shellMat.colorNode=vec3(.3,1,1.5);shellMat.opacityNode=rim.mul(.38).mul(charge);
 const shell=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),shellMat);shell.name='warp-charge-wave';shell.frustumCulled=false;root.add(shell);
 const ringMat=new THREE.MeshBasicNodeMaterial({...transparent,color:0xffffff});
 ringMat.opacityNode=sin(uv().y.mul(Math.PI)).pow(2).mul(.32);
 const rings=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.008,6,160),ringMat,7);
 rings.name='warp-wavefronts';rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);rings.frustumCulled=false;root.add(rings);
 const dummy=new THREE.Object3D(),color=new THREE.Color();for(let i=0;i<7;i++){dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);rings.setColorAt(i,color.setRGB(0,0,0));}
 const count=96,positions=new Float32Array(count*6),linesGeo=new THREE.BufferGeometry();linesGeo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
 const linesMat=new THREE.LineBasicMaterial({color:0x9fdbff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}),lines=new THREE.LineSegments(linesGeo,linesMat);lines.frustumCulled=false;root.add(lines);
 const meshes=[tube,shell,rings,lines];
 function update(sim,pose,quaternion){
  const w=sim.skills.warp,charging=w.phase==='charging',travelling=sim.state==='warping';root.visible=charging||travelling;if(!root.visible)return;
  const time=sim.time-(1-(pose.alpha??1))*(sim.clock?.step??0),c=charging?1-w.remaining/SKILLS.warp.charge:0;
  const duration=w.duration??SKILLS.warp.duration;
  const strength=travelling?THREE.MathUtils.smoothstep(w.elapsed,0,Math.min(.5,duration/6))*(1-THREE.MathUtils.smoothstep(w.elapsed/duration,.767,1)):0;
  root.position.copy(pose.position).multiplyScalar(scale);root.quaternion.copy(quaternion);clock.value=time;energy.value=strength;charge.value=charging?(.2+c*.8):0;
  tube.visible=lines.visible=travelling;shell.visible=charging;shell.scale.setScalar(55+90*c);linesMat.opacity=strength*.38;rings.count=charging?4:7;
  for(let i=0;i<7;i++){
   const cycle=charging?(c*1.5+i/4)%1:(time*.6+i/7)%1,radius=charging?30+cycle*130:210+cycle*410;
   dummy.position.set(0,0,charging?Math.sin(i*2.4)*25:900-cycle*4800);dummy.rotation.set(charging?Math.sin(i*1.7)*.48:0,charging?Math.cos(i*1.7)*.48:0,time*.1+i);
   dummy.scale.setScalar(radius);dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);
   const brightness=charging?Math.sin(cycle*Math.PI)*(.25+c*.45):Math.sin(cycle*Math.PI)*strength*.4;
   color.setRGB(.3*brightness,.85*brightness,1.5*brightness);rings.setColorAt(i,color);
  }
  rings.instanceMatrix.needsUpdate=true;rings.instanceColor.needsUpdate=true;
  if(travelling)for(let i=0;i<count;i++){
   const angle=i*2.399963,radial=190+(i*47%260),z=((i*71.73+time*1900)%5300)-4400,j=i*6;
   positions[j]=positions[j+3]=Math.cos(angle)*radial;positions[j+1]=positions[j+4]=Math.sin(angle)*radial;positions[j+2]=z;positions[j+5]=z+180+strength*340;
  }
  if(travelling)linesGeo.attributes.position.needsUpdate=true;
 }
 return {root,update,stats:{drawCalls:4,ringCapacity:7,streakCapacity:count,bufferBytes:positions.byteLength},
  warm(){const visible=[root.visible,...meshes.map(m=>m.visible)];root.visible=true;meshes.forEach(m=>m.visible=true);return ()=>{root.visible=visible[0];meshes.forEach((m,i)=>m.visible=visible[i+1]);};},
  dispose(){root.removeFromParent();for(const mesh of meshes){mesh.dispose?.();mesh.geometry.dispose();mesh.material.dispose();}}
 };
}
