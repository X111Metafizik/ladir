import {RTTNode,Vector2,Matrix4,Vector3} from 'three/webgpu';
import {texture,uniform,nodeObject,wgslFn} from 'three/tsl';

// History contains radiance/transmittance and linear geometry distance + age.
// A five-phase interleave refreshes 20% of valid pixels. Newly exposed pixels,
// silhouettes, stale history, cuts and fast flashes always run a fresh march.
export const reprojectVolume=wgslFn(`
fn ps_reproject_volume(ro:vec3<f32>,ray:vec3<f32>,distance:f32,radius:f32,pixel:vec2<f32>,phase:i32,valid:f32,delta:vec3<f32>,previousVP:mat4x4<f32>,historyData:texture_2d<f32>,smp:sampler,clock:f32)->vec4<f32>{
 let b=dot(ro,ray);let discriminant=b*b-dot(ro,ro)+(radius+5.5)*(radius+5.5);
 var reference=min(distance,500.0);
 if(discriminant>0.0){let root=sqrt(discriminant);let near=-b-root;let far=-b+root;let shell=select(far,near,near>0.0);if(shell>0.0){reference=min(reference,shell);}}
 let relative=ray*reference+delta;let clip=previousVP*vec4<f32>(relative,1);
 let uv=clip.xy/max(.000001,clip.w)*vec2<f32>(.5,-.5)+.5;
 if(valid<.5||clip.w<=0.0||any(uv<=vec2<f32>(0))||any(uv>=vec2<f32>(1))){return vec4<f32>(uv,0,0);}
 let old=textureSampleLevel(historyData,smp,uv,0.0);
 let expected=min(60000.0,length(ray*min(distance,60000.0)+delta));
 let sameDepth=abs(old.x-expected)<=max(.002,expected*.015);
 // Coherent 8x8 tiles let whole GPU execution groups skip the expensive march.
 // A per-pixel checkerboard left every group executing the raymarch anyway.
 let selected=(i32(pixel.x)/8+(i32(pixel.y)/8)*2)%5==phase;
 let canReuse=sameDepth&&!selected&&old.y<4.0;
 return vec4<f32>(uv,select(0.0,1.0,canReuse),select(0.0,old.y+1.0,canReuse));
}`);

export class TemporalVolumeNode extends RTTNode {
 constructor(build,camera,shared){
  super(null,null,null,{resolutionScale:.5,depthBuffer:false,count:2});
  this.other=this.renderTarget.clone();this.historyColor=texture(this.other.textures[0]);this.historyMeta=texture(this.other.textures[1]);
  this.valid=uniform(0);this.phase=uniform(0,'int');this.delta=uniform(new Vector3());this.previousVP=uniform(new Matrix4());
  this.size=new Vector2();this.previousAbsolute=new Vector3();this.previousRotation=new Matrix4();this.camera=camera;this.shared=shared;
  this.currentAbsolute=new Vector3();this.currentVP=new Matrix4();this.previousOrigin=new Vector3();this.frames=0;this.cut=true;this.previousFov=camera.fov;
  this.stats={frames:0,resets:0,historyMaxAge:4,refreshFraction:.2,resolutionScale:.5};
  this.node=build(this);
 }
 reset(){this.cut=true;}
 updateCamera(absolute){
  this.currentAbsolute.copy(absolute);this.delta.value.copy(absolute).sub(this.previousAbsolute).multiplyScalar(this.shared.kmPerUnit.value);
  this.currentVP.copy(this.camera.matrixWorldInverse);this.currentVP.setPosition(0,0,0);this.currentVP.premultiply(this.camera.projectionMatrix);
  if(this.delta.value.length()>1.5||Math.abs(this.camera.fov-this.previousFov)>1||!this.previousOrigin.equals(this.shared.origin.value))this.cut=true;
  this.previousFov=this.camera.fov;this.previousOrigin.copy(this.shared.origin.value);
 }
 updateBefore(frame){
  const size=frame.renderer.getDrawingBufferSize(this.size),w=Math.max(1,Math.floor(size.x*.5)),h=Math.max(1,Math.floor(size.y*.5));
  if(this.renderTarget.width!==w||this.renderTarget.height!==h){this.renderTarget.setSize(w,h);this.other.setSize(w,h);this.cut=true;}
  const previous=this.renderTarget;this.renderTarget=this.other;this.other=previous;
  this.historyColor.value=previous.textures[0];this.historyMeta.value=previous.textures[1];
  this.valid.value=this.cut||!this.frames?0:1;this.phase.value=this.frames%5;
  if(this.valid.value===0)this.stats.resets++;
  super.updateBefore(frame);
  this.previousAbsolute.copy(this.currentAbsolute);this.previousVP.value.copy(this.currentVP);this.frames++;this.stats.frames=this.frames;this.cut=false;
 }
 dispose(){this.other.dispose();super.dispose();}
}
export const temporalVolume=(build,camera,shared)=>nodeObject(new TemporalVolumeNode(build,camera,shared));
