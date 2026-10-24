import * as THREE from 'three/webgpu';
import {sampleTerrain} from '../core/terrain.mjs';
import {tacticalActive} from './tactical.mjs';
export class PlanetCamera{
  constructor(canvas,camera,world,onChange=()=>{}){
    Object.assign(this,{canvas,camera,world,onChange});this.scale=1000/world.radiusMeters;this.focus=new THREE.Vector3(...world.frame.center);this.absolute=new THREE.Vector3();this.target=new THREE.Vector3();this.origin=new THREE.Vector3();this.rangeMeters=world.radiusMeters*1.9;this.tilt=0;this.yaw=0;this.mode='orbit';this.keys=new Set();this.listeners=[];this.drag=null;
    this.tactical=false;this.renderTilt=0;
    this.bind(canvas,'pointerdown',e=>{if(e.button!==0&&e.button!==2)return;canvas.focus();canvas.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,rotate:e.button===2||e.shiftKey};});
    this.bind(canvas,'pointermove',e=>{
      if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
      if(this.drag.rotate){this.yaw-=dx*.004;this.tilt=THREE.MathUtils.clamp(this.tilt+dy*.004,0,Math.PI*.475);}
      else {
        const previous=this.surfaceAt(this.drag.x,this.drag.y),current=this.surfaceAt(e.clientX,e.clientY);
        if(previous&&current){const q=new THREE.Quaternion().setFromUnitVectors(current,previous);this.focus.applyQuaternion(q).normalize();}
        else this.pan(-dx,dy);
      }
      this.drag.x=e.clientX;this.drag.y=e.clientY;this.update(0,this.origin);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.bind(canvas,event,()=>this.drag=null);
    this.bind(canvas,'contextmenu',e=>e.preventDefault());
    this.bind(canvas,'wheel',e=>{
      e.preventDefault();const before=this.surfaceAt(e.clientX,e.clientY),pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
      this.rangeMeters=THREE.MathUtils.clamp(this.rangeMeters*Math.exp(THREE.MathUtils.clamp(pixels,-500,500)*.0015),3,world.radiusMeters*7);
      if(this.rangeMeters>300000)this.tilt*=.85;
      this.update(0,this.origin);const after=this.surfaceAt(e.clientX,e.clientY);
      if(before&&after){this.focus.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(after,before)).normalize();this.update(0,this.origin);}
      if(this.mode!=='map')this.mode=this.rangeMeters>300000?'orbit':this.rangeMeters>1200?'region':'surface';this.onChange(this.mode);
    },{passive:false});
    this.bind(window,'keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){this.keys.add(e.code);e.preventDefault();}if(e.code==='KeyN'){this.yaw=0;this.tilt=0;}if(e.code==='Home'){this.setMode('orbit');e.preventDefault();}});
    this.bind(window,'keyup',e=>this.keys.delete(e.code));this.bind(window,'blur',()=>{this.keys.clear();this.drag=null;});this.setMode('orbit');
  }
  bind(target,event,fn,opts){const handler=e=>{if(this.enabled!==false)fn(e);};target.addEventListener(event,handler,opts);this.listeners.push(()=>target.removeEventListener(event,handler,opts));}
  basis(d=this.focus){let north=new THREE.Vector3(0,1,0).addScaledVector(d,-d.y);if(north.lengthSq()<1e-10)north=new THREE.Vector3(0,0,1).addScaledVector(d,-d.z);north.normalize();return {north,east:new THREE.Vector3().crossVectors(north,d).normalize()};}
  heading(){const {north,east}=this.basis();return north.multiplyScalar(Math.cos(this.yaw)).addScaledVector(east,Math.sin(this.yaw));}
  pan(dx,dy){const heading=this.heading(),right=new THREE.Vector3().crossVectors(heading,this.focus).normalize(),metersPerPixel=2*this.rangeMeters*Math.tan(this.camera.fov*Math.PI/360)/Math.max(1,this.canvas.clientHeight);this.focus.addScaledVector(right,dx*metersPerPixel/this.world.radiusMeters).addScaledVector(heading,dy*metersPerPixel/this.world.radiusMeters).normalize();}
  surfaceAt(x,y){
    const rect=this.canvas.getBoundingClientRect(),raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.camera);
    const ro=raycaster.ray.origin.clone().add(this.origin),rd=raycaster.ray.direction,b=ro.dot(rd);let radius=1000;
    for(let i=0;i<3;i++){const discriminant=b*b-ro.lengthSq()+radius*radius;if(discriminant<0)return null;const t=-b-Math.sqrt(discriminant);if(t<0)return null;const d=ro.clone().addScaledVector(rd,t).normalize();if(i===2)return d;const s=sampleTerrain(this.world,d.toArray(),{micro:false});radius=1000+Math.max(s.elevationMeters,s.waterSurfaceMeters)*this.scale;}
  }
  setMode(mode,direction){if(direction)this.focus.set(...direction).normalize();this.mode=mode;this.keys.clear();this.rangeMeters=mode==='orbit'?this.world.radiusMeters*1.9:mode==='region'?25000:mode==='map'?12000:180;this.tilt=(mode==='orbit'||mode==='map')?0:mode==='region'?Math.PI/6:Math.PI*78/180;this.renderTilt=this.tilt;this.tactical=false;this.yaw=0;this.update(0,this.origin);this.onChange(mode);}
  setRangeMeters(meters){this.rangeMeters=THREE.MathUtils.clamp(meters,3,this.world.radiusMeters*7);this.update(0,this.origin);}
  setAltitudeMeters(meters){this.tilt=0;this.renderTilt=0;const s=sampleTerrain(this.world,this.focus.toArray());this.setRangeMeters(Math.max(3,meters-Math.max(s.elevationMeters,s.waterSurfaceMeters)));}
  regionPosition(){this.update(0,this.origin);}
  set regionHeight(units){this.setRangeMeters(units/this.scale/Math.max(.05,Math.cos(this.tilt)));}
  get regionHeight(){return this.rangeMeters*this.scale*Math.cos(this.tilt);}
  update(dt,origin){
    const speed=dt*250*(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?4:1);
    if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))this.pan(0,speed);
    if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))this.pan(0,-speed);
    if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))this.pan(-speed,0);
    if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))this.pan(speed,0);
    if(this.keys.has('KeyE'))this.rangeMeters=Math.min(this.world.radiusMeters*7,this.rangeMeters*Math.exp(dt));
    if(this.keys.has('KeyQ'))this.rangeMeters=Math.max(3,this.rangeMeters*Math.exp(-dt));
    const s=sampleTerrain(this.world,this.focus.toArray()),r=1000+(this.targetElevationMeters??Math.max(s.elevationMeters,s.waterSurfaceMeters))*this.scale,heading=this.heading();
    this.target.copy(this.focus).multiplyScalar(r);
    // Once entered, test the requested overhead height, not the unfinished
    // interpolation. A transient lower camera must not cancel its own tilt.
    const probeTilt=this.tactical?0:this.tilt,probeRange=this.rangeMeters*this.scale;
    const probeAltitude=(Math.sqrt(r*r+probeRange*probeRange+2*r*probeRange*Math.cos(probeTilt))-1000)/this.scale;
    this.tactical=tacticalActive(probeAltitude,this.tactical);
    this.renderTilt=THREE.MathUtils.damp(this.renderTilt,this.tactical?0:this.tilt,6,Math.max(0,dt));
    this.absolute.copy(this.target).addScaledVector(this.focus,this.rangeMeters*this.scale*Math.cos(this.renderTilt)).addScaledVector(heading,-this.rangeMeters*this.scale*Math.sin(this.renderTilt));
    const up=this.absolute.clone().normalize(),under=sampleTerrain(this.world,up.toArray()),displayed=this.displayedSurface?.(up.toArray()),floor=Math.max(under.elevationMeters,under.waterSurfaceMeters,Number.isFinite(displayed)?displayed:-Infinity),minimum=1000+(floor+2.2)*this.scale;
    if(this.absolute.length()<minimum)this.absolute.setLength(minimum);
    // Rebase in CPU doubles. All near meshes carry a local origin and small Float32 vertices.
    const quantum=1000*this.scale;origin.copy(this.absolute).divideScalar(quantum).round().multiplyScalar(quantum);this.origin.copy(origin);
    this.camera.position.copy(this.absolute).sub(origin);this.camera.up.copy(heading);
    // At a grazing angle the camera can be near the ground even with a distant
    // orbit target. A range-derived near plane used to cut open the landscape.
    const clearance=(this.absolute.length()-1000)/this.scale-floor;
    const near=Math.max(.08,Math.min(10000,this.rangeMeters*.001,clearance*.2))*this.scale;
    if(Math.abs(this.camera.near-near)>near*.05){this.camera.near=near;this.camera.updateProjectionMatrix();}
    this.camera.lookAt(this.target.clone().sub(origin));this.camera.updateMatrixWorld();
  }
  dispose(){this.listeners.forEach(fn=>fn());this.keys.clear();}
}
