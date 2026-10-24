import {createFlightAudio} from './flight-audio.mjs';
import {createWeaponEffects} from './flight-effects.mjs';
import {createFlightStreaks} from './flight-streaks.mjs';
import {createShipEffects} from './ship-effects.mjs';
import {createWarpEffects} from './warp-effects.mjs';
import {FlightOrbit} from './flight-orbit.mjs';
import {fitScalarTextures} from './prewarm.mjs';
import * as THREE from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {sampleTerrain} from '../core/terrain.mjs';
import {FlightSimulation,FLIGHT,tangentFrame} from '../simulation/flight.mjs';
import {WARP_DISTANCES} from '../simulation/skills.mjs';
const V=()=>new THREE.Vector3();
export function createFlightController({world,root,camera,canvas,editor,onMessage=()=>{},onWarpPrepare=()=>{},onWarpCancel=()=>{}}){
  const scale=1000/world.radiusMeters,visualScale=FLIGHT.length/32,group=new THREE.Group();root.add(group);group.visible=false;
  const absolute=V(),target=V(),cameraMeters=V(),originRef=V(),listeners=[],keys=new Set(),lastTap={},pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
  const desiredCamera=V(),cameraUp=V(),look=V(),aim=V(),aimPointer=new THREE.Vector2(),orbitCamera=V(),orbit=new FlightOrbit();
  const orientRight=V(),orientUp=V(),orientBack=V(),enemyUp=V(),axisUp=new THREE.Vector3(0,1,0);
  let active=false,sim=null,model=null,loadPromise=null,disposed=false,player=null,enemyMeshes=[],shipEffects=null,gear=[],cockpit=false,cameraDistance=250,savedFov=48,lastGearTick=-1,boostAmount=0,orbitWeight=0,sensitivity=1;
  const previousPose=V();let hasPreviousPose=false,wasWarping=false,warmed=false,warpPrepareTimer=null,wheelTime=-Infinity,wheelPixels=0;
  let screenWidth=canvas.clientWidth,screenHeight=canvas.clientHeight;const viewportObserver=new ResizeObserver(([entry])=>{screenWidth=entry.contentRect.width;screenHeight=entry.contentRect.height;});viewportObserver.observe(canvas);
  const resources=new Set(),geometries=new Set(),textures=new Set(),textureStats={};
  const material=(color,extra={})=>{const m=new THREE.MeshBasicMaterial({color,...extra});resources.add(m);return m;};
  const effects=createWeaponEffects(group,scale,FLIGHT.maxProjectiles),streaks=createFlightStreaks(group,scale),warpEffects=createWarpEffects(group,scale),audio=createFlightAudio();
  const pad=new THREE.Group(),ringGeo=new THREE.TorusGeometry(23,.35,5,64),padMat=material(0x74eadc);geometries.add(ringGeo);const ring=new THREE.Mesh(ringGeo,padMat);ring.rotation.x=Math.PI/2;pad.add(ring);
  const lineGeo=new THREE.BoxGeometry(1,.3,17);geometries.add(lineGeo);for(const x of [-6,6]){const m=new THREE.Mesh(lineGeo,padMat);m.position.x=x;pad.add(m);}const cross=new THREE.Mesh(lineGeo,padMat);cross.rotation.y=Math.PI/2;cross.scale.z=.7;pad.add(cross);pad.scale.setScalar(scale*visualScale);group.add(pad);
  const dummy=new THREE.Object3D(),matrix=new THREE.Matrix4(),color=new THREE.Color();
  async function load(){
    if(loadPromise)return loadPromise;
    loadPromise=Promise.all([new GLTFLoader().loadAsync(new URL('../assets/starlight-voyager.glb',import.meta.url).href),new THREE.TextureLoader().loadAsync(new URL('../assets/fx/ion-thruster-v24.png',import.meta.url).href)]).then(async ([gltf,plumeTexture])=>{
      textures.add(plumeTexture);
      model=gltf.scene;model.rotation.y=-Math.PI/2;model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(V()),center=box.getCenter(V()),factor=32/size.z;
      // The supplied Meshy model points along -X. Convert its nose to -Z.
      model.position.copy(center).multiplyScalar(-factor);model.scale.setScalar(factor);
      model.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);o.castShadow=true;o.layers.enable(1);o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const value of Object.values(m))if(value?.isTexture){textures.add(value);value.anisotropy=4;}m.roughness=Math.max(.48,m.roughness);m.metalness*=.4;m.emissive.set(0xffffff);m.emissiveMap=m.map;m.emissiveIntensity=.055;}});
      Object.assign(textureStats,await fitScalarTextures(resources));
      if(disposed){release();return;}
      player=new THREE.Group();player.add(model);player.scale.setScalar(scale*visualScale);group.add(player);
      if(disposed)return;shipEffects=createShipEffects(player,plumeTexture);
      const strutGeo=new THREE.CylinderGeometry(.28,.4,1,8),footGeo=new THREE.BoxGeometry(2,.4,3),gearMat=new THREE.MeshStandardMaterial({color:0x87989f,metalness:.35,roughness:.7});geometries.add(strutGeo);geometries.add(footGeo);resources.add(gearMat);
      for(const [x,z]of [[-5,7],[5,7],[-3,-9],[3,-9]]){const leg=new THREE.Group(),strut=new THREE.Mesh(strutGeo,gearMat),foot=new THREE.Mesh(footGeo,gearMat);strut.castShadow=foot.castShadow=true;strut.layers.enable(1);foot.layers.enable(1);leg.position.set(x,-1.8,z);leg.add(strut,foot);player.add(leg);gear.push({leg,strut,foot,x,z});}
      // Shared geometry and textures: six opponents add no duplicate GLB loads.
      for(let i=0;i<FLIGHT.enemyCount;i++){const vessel=new THREE.Group(),clone=model.clone(true);clone.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set(0xc87668);resources.add(o.material);o.castShadow=false;}});vessel.add(clone);vessel.scale.setScalar(scale*.86*visualScale);group.add(vessel);enemyMeshes.push(vessel);}
    }).catch(e=>{loadPromise=null;throw Error('Gemi modeli yüklenemedi: '+e.message);});return loadPromise;
  }
  function bind(object,name,fn,opts){object.addEventListener(name,fn,opts);listeners.push(()=>object.removeEventListener(name,fn,opts));}
  function endOrbit(){const id=orbit.pointerId;orbit.end();pointer.set(0,0);if(sim)sim.input.right=false;if(id!=null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  function clearInput(){endOrbit();keys.clear();pointer.set(0,0);if(sim)Object.assign(sim.input,{x:0,y:0,left:false,right:false,boost:false,brake:false,strafe:0});}
  function pause(value=!sim?.paused){if(!active)return;sim.paused=value;clearInput();}
  function cancelWarpPreparation(){clearTimeout(warpPrepareTimer);warpPrepareTimer=null;onWarpCancel();}
  function activateSkill(slot){if(!active||!sim.activateSkill(slot))return false;if(slot===1){wheelPixels=0;onWarpPrepare(sim.warpDestination());}return true;}
  function selectWarpDistance(distance){
    if(!active||!sim.skills.selectWarpDistance(distance))return false;
    // Rapid wheel events discard only the staging route, never the surface
    // under the ship. Start the last requested prefetch after the wheel rests.
    cancelWarpPreparation();warpPrepareTimer=setTimeout(()=>{warpPrepareTimer=null;if(active&&sim.skills.warp.phase==='charging')onWarpPrepare(sim.warpDestination());},180);return true;
  }
  bind(canvas,'pointermove',e=>{if(!active||sim.paused)return;if(orbit.move(e)){e.preventDefault();return;}const r=canvas.getBoundingClientRect();pointer.set(THREE.MathUtils.clamp((e.clientX-r.left)/r.width*2-1,-1,1),THREE.MathUtils.clamp((e.clientY-r.top)/r.height*2-1,-1,1));});
  bind(canvas,'pointerleave',()=>{if(!orbit.active)clearInput();});
  bind(canvas,'pointercancel',clearInput);bind(canvas,'lostpointercapture',()=>{if(orbit.active)clearInput();});
  bind(canvas,'contextmenu',e=>{if(active)e.preventDefault();});
  bind(canvas,'pointerdown',e=>{audio.unlock();if(!active||sim.paused)return;e.preventDefault();canvas.focus();if(orbit.begin(e)){pointer.set(0,0);sim.input.left=sim.input.right=false;canvas.setPointerCapture(e.pointerId);return;}if(orbit.active)return;if(e.button===0)sim.input.left=true;if(e.button===2)sim.input.right=true;});
  bind(window,'pointerup',e=>{if(!sim)return;if(e.button===0)sim.input.left=false;if(e.button===2){sim.input.right=false;endOrbit();}});
  bind(window,'wheel',e=>{
    if(!active||(e.target!==canvas&&sim.skills.warp.phase!=='charging'))return;e.preventDefault();if(sim.paused)return;
    if(sim.skills.warp.phase==='charging'){
      const now=performance.now();if(now-wheelTime>250)wheelPixels=0;wheelTime=now;
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?screenHeight:1);if(Math.sign(wheelPixels)!==Math.sign(pixels))wheelPixels=0;wheelPixels+=pixels;
      if(Math.abs(wheelPixels)>=40){const i=WARP_DISTANCES.indexOf(sim.skills.warp.targetDistance),next=THREE.MathUtils.clamp(i-Math.sign(wheelPixels),0,WARP_DISTANCES.length-1);wheelPixels=0;selectWarpDistance(WARP_DISTANCES[next]);}
      return;
    }
    cameraDistance=THREE.MathUtils.clamp(cameraDistance*Math.exp(e.deltaY*.001),160,460);
  },{passive:false});
  bind(window,'keydown',e=>{
    if(!active||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    const known=['KeyW','KeyA','KeyS','KeyD','KeyB','KeyC','Space','ShiftLeft','ShiftRight','Delete','Escape','Digit1','Digit2','Numpad1','Numpad2'];if(!known.includes(e.code))return;e.preventDefault();
    if(e.code==='Escape'){if(!e.repeat)pause();return;}if(sim.paused)return;
    keys.add(e.code);if(e.repeat)return;
    if(e.code==='Digit1'||e.code==='Numpad1')activateSkill(1);if(e.code==='Digit2'||e.code==='Numpad2')activateSkill(2);
    if(e.code==='KeyC')sim.requestLanding();if(e.code==='KeyB')sim.hover();if(e.code==='KeyW')sim.cruise();if(e.code.startsWith('Shift'))sim.cycleTarget();if(e.code==='Delete')cockpit=!cockpit;
    if(e.code==='KeyA'||e.code==='KeyD'){const now=performance.now();if(now-(lastTap[e.code]??-1000)<300)sim.roll(e.code==='KeyA'?1:-1);lastTap[e.code]=now;}
  });
  bind(window,'keyup',e=>{keys.delete(e.code);if(e.code==='ControlLeft'||e.code==='ControlRight')endOrbit();});bind(window,'blur',()=>{if(active)pause(true);});bind(document,'visibilitychange',()=>{if(document.hidden&&active)pause(true);});
  function orient(object,forward,up,roll=0){orientRight.crossVectors(forward,up).normalize();orientUp.crossVectors(orientRight,forward).normalize();matrix.makeBasis(orientRight,orientUp,orientBack.copy(forward).negate());object.quaternion.setFromRotationMatrix(matrix);if(roll)object.rotateZ(roll);}
  function syncGeometry(pose){
    player.position.copy(pose.position).multiplyScalar(scale);orient(player,pose.forward,pose.up,pose.bank+pose.roll);player.visible=(!cockpit||orbitWeight>.02)&&sim.state!=='crashed';
    shipEffects.update(sim);
    const gearVisible=['landing','landed','taking-off'].includes(sim.state)&&sim.agl<60;
    for(const g of gear){g.leg.visible=gearVisible;if(gearVisible&&lastGearTick!==sim.tick){const point=new THREE.Vector3(g.x,0,g.z).multiplyScalar(visualScale).applyQuaternion(player.quaternion).add(sim.position),d=point.clone().normalize(),ground=sim.ground(d).height,depth=sim.state==='landed'?Math.max(2,(sim.altitude-ground)/visualScale-1.8):3.2;g.strut.scale.y=depth;g.strut.position.y=-depth*.5;g.foot.position.y=-depth+.15;}}lastGearTick=sim.tick;
    for(const e of sim.enemies){const m=enemyMeshes[e.id];m.visible=e.health>0;m.position.copy(e.renderPosition).multiplyScalar(scale);orient(m,e.renderForward,enemyUp.copy(e.renderPosition).normalize(),Math.sin(sim.time*.4+e.phase)*.24);}
    effects.update(sim,pose);streaks.update(sim,pose);warpEffects.update(sim,pose,player.quaternion);
    const site=sim.landing??sim.home;pad.visible=!!site;if(site){pad.position.copy(site.direction).multiplyScalar(1000+(site.height+.7)*scale);pad.quaternion.setFromUnitVectors(axisUp,site.direction);}
  }
  function update(dt,origin){
    if(!active||!sim||!player)return;
    originRef.copy(origin);const dead=v=>Math.sign(v)*Math.pow(Math.max(0,(Math.abs(v)-.025)/.975),.85)*sensitivity;
    Object.assign(sim.input,{x:orbit.active?0:dead(pointer.x),y:orbit.active?0:dead(pointer.y),strafe:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),boost:keys.has('Space'),brake:keys.has('KeyS')});
    // Aim from the image under the current pointer before advancing weapons.
    // This removes the previous extra rendered-frame delay on mouse fire.
    raycaster.setFromCamera(aimPointer.set(pointer.x,-pointer.y),camera);aim.copy(raycaster.ray.origin).add(origin).multiplyScalar(1/scale).addScaledVector(raycaster.ray.direction,1800).sub(sim.position).normalize();sim.input.aim=aim;
    const charging=sim.skills.warp.remaining>0;sim.step(dt);
    if(charging&&!sim.skills.warp.remaining){if(sim.state==='warping')onWarpPrepare({position:sim.warpPath.to,from:sim.warpPath.from,forward:sim.warpPath.forward,distance:sim.warpPath.distance},true);else cancelWarpPreparation();}
    audio.update(sim);const pose=sim.present(),visualDt=sim.paused?0:Math.min(dt,.1);
    boostAmount=THREE.MathUtils.damp(boostAmount,sim.boosting?1:0,sim.boosting?6:4,visualDt);
    orbitWeight=THREE.MathUtils.damp(orbitWeight,orbit.active?1:0,10,visualDt);
    desiredCamera.copy(pose.position).addScaledVector(pose.forward,cockpit?13*visualScale:-cameraDistance).addScaledVector(pose.up,cockpit?2.5*visualScale:cameraDistance*.31);
    orbitCamera.copy(pose.position).addScaledVector(pose.forward,-Math.cos(orbit.yaw)*Math.cos(orbit.pitch)*cameraDistance).addScaledVector(pose.right,Math.sin(orbit.yaw)*Math.cos(orbit.pitch)*cameraDistance).addScaledVector(pose.up,Math.sin(orbit.pitch)*cameraDistance);
    desiredCamera.lerp(orbitCamera,orbitWeight);
    // Translate with the interpolated ship, then smooth only the camera offset.
    // World-position damping at warp speed would leave the camera kilometres behind.
    const warping=sim.state==='warping';
    if(hasPreviousPose&&(warping||wasWarping))cameraMeters.add(pose.position).sub(previousPose);
    cameraMeters.lerp(desiredCamera,1-Math.exp(-visualDt*10));
    previousPose.copy(pose.position);hasPreviousPose=true;wasWarping=warping;
    if(cameraMeters.length()-world.radiusMeters<60000){const d=cameraUp.copy(cameraMeters).normalize(),displayed=editor.displayedSurface?.(d.toArray()),ground=Math.max(sim.ground(d).height,Number.isFinite(displayed)?displayed:-Infinity),minimum=world.radiusMeters+ground+4;if(cameraMeters.length()<minimum)cameraMeters.copy(d).multiplyScalar(minimum);}
    absolute.copy(cameraMeters).multiplyScalar(scale);target.copy(pose.position).multiplyScalar(scale);
    origin.copy(absolute).divideScalar(1000*scale).round().multiplyScalar(1000*scale);originRef.copy(origin);
    const visualTime=Math.max(0,sim.time-sim.clock.step*(1-pose.alpha)),shake=sim.impactEnergy;
    camera.position.copy(absolute).sub(origin).addScaledVector(pose.up,(Math.sin(visualTime*100)*sim.gunKick*.6+Math.sin(visualTime*47)*shake*.8)*scale).addScaledVector(pose.right,Math.sin(visualTime*65)*shake*1.5*scale);camera.up.copy(pose.up);camera.near=.3*scale;camera.far=15000;
    const warpLens=warping?Math.min(1,sim.speed/1_000_000)*(1-THREE.MathUtils.smoothstep(sim.skills.warp.progress,.75,1)):0;
    camera.fov=THREE.MathUtils.damp(camera.fov,64+boostAmount*9+warpLens*13,4,visualDt);camera.updateProjectionMatrix();
    look.copy(pose.position).addScaledVector(pose.forward,(cockpit?700:450)*(1-orbitWeight)).addScaledVector(pose.up,(cockpit?2.5*visualScale:55)*(1-orbitWeight)).multiplyScalar(scale).sub(origin);camera.lookAt(look);camera.updateMatrixWorld();
    syncGeometry(pose);
  }
  async function prewarm(renderer,camera,scene,target){
    if(warmed)return;
    const visible=streaks.mesh.visible,groupVisible=group.visible,restoreWarp=warpEffects.warm(),previous=renderer.getRenderTarget(),culling=[];streaks.mesh.visible=true;group.visible=true;
    group.traverse(o=>{if(o.isMesh){culling.push([o,o.frustumCulled]);o.frustumCulled=false;}});
    if(!active){player.position.copy(editor.absolute).addScaledVector(camera.getWorldDirection(V()),250*scale);warpEffects.root.position.copy(player.position);for(const enemy of enemyMeshes)enemy.position.copy(player.position);}
    try{
      await effects.prewarm(renderer,camera,scene,target);
      // Compile alone leaves first-use GPU resources lazy. Draw the wave and
      // tunnel once offscreen while flight is still loading, before the 3s charge.
      renderer.setRenderTarget(target);renderer.render(scene,camera);await renderer.backend.device.queue.onSubmittedWorkDone();warmed=true;
    }finally{renderer.setRenderTarget(previous);group.visible=groupVisible;streaks.mesh.visible=visible;restoreWarp();for(const [object,culled]of culling)object.frustumCulled=culled;}
  }
  const projected=V();
  function project(position){const p=projected.copy(position).multiplyScalar(scale).sub(originRef),m=camera.matrixWorld.elements,visible=(p.x-camera.position.x)*m[8]+(p.y-camera.position.y)*m[9]+(p.z-camera.position.z)*m[10]<0;p.project(camera);return {x:(p.x*.5+.5)*screenWidth,y:(-.5*p.y+.5)*screenHeight,visible:visible&&Math.abs(p.x)<.98&&Math.abs(p.y)<.96};}
  async function start(){
    audio.unlock();await load();if(disposed)throw Error('Gezegen görünümü kapatıldı.');if(active)return;
    const direction=editor.focus.clone();let ground=sampleTerrain(world,direction.toArray(),{micro:false});
    // Orbit can point at open sea. Prefer the nearest known land destination.
    if(ground.waterDepthMeters>1){const land=(world.landmarks??[]).filter(f=>sampleTerrain(world,f.direction,{micro:false}).waterDepthMeters<.5).sort((a,b)=>direction.dot(new THREE.Vector3(...b.direction))-direction.dot(new THREE.Vector3(...a.direction)))[0];if(land)direction.set(...land.direction);}
    sim=new FlightSimulation({radius:world.radiusMeters,terrain:d=>{const s=sampleTerrain(world,d),displayed=editor.displayedSurface?.(d);if(Number.isFinite(displayed))s.elevationMeters=Math.max(s.elevationMeters,displayed);return s;},direction:direction.toArray(),heading:editor.heading(),onMessage});
    sim.paused=true;active=true;group.visible=true;editor.enabled=false;editor.keys.clear();editor.drag=null;savedFov=camera.fov;cameraDistance=250;boostAmount=0;orbitWeight=0;cockpit=false;hasPreviousPose=false;wasWarping=false;clearInput();
    cameraMeters.copy(sim.position).addScaledVector(sim.forward,-cameraDistance).addScaledVector(sim.up,30);update(1/60,editor.origin);
  }
  function stop(){active=false;group.visible=false;clearInput();cancelWarpPreparation();editor.enabled=true;camera.fov=savedFov;camera.updateProjectionMatrix();editor.update(0,editor.origin);}
  function release(){for(const g of geometries)g.dispose();for(const m of resources)m.dispose();const images=new Set();for(const t of textures){images.add(t.image);t.dispose();}for(const image of images)image?.close?.();}
  function dispose(){disposed=true;clearTimeout(warpPrepareTimer);viewportObserver.disconnect();for(const unbind of listeners)unbind();group.removeFromParent();shipEffects?.dispose();effects.dispose();streaks.dispose();warpEffects.dispose();audio.dispose();release();}
  return {group,orbit,activateSkill,selectWarpDistance,preload:load,get boostAmount(){return boostAmount;},get sensitivity(){return sensitivity;},set sensitivity(v){sensitivity=THREE.MathUtils.clamp(Number(v)||1,.5,2);},get active(){return active;},get sim(){return sim;},get pointer(){return pointer;},get cockpit(){return cockpit;},get rangeMeters(){return cameraDistance;},absolute,target,start,stop,update,audio,prewarm,project,pause,dispose,clearInput,landing:()=>{if(active&&!sim.paused)sim.requestLanding();},async restart(){stop();await start();sim.paused=false;},diagnostics:{warp:warpEffects.stats,textures:textureStats,asset:'Meshy Starlight Voyager',triangles:6458,lengthMeters:FLIGHT.length,enemyCount:FLIGHT.enemyCount,coordinates:'Double precision metres + camera-relative rendering'}};
}
