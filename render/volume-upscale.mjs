import {wgslFn,screenUV,sampler,vec4} from 'three/tsl';
// Preserve full-resolution ships and terrain silhouettes when reconstructing
// the half-resolution radiance/transmittance buffer. Never downsample beauty.
const reconstruct=wgslFn(`
fn ps_reconstruct_volume(coord:vec2<f32>,vol:texture_2d<f32>,smp:sampler,depth:texture_depth_multisampled_2d)->vec4<f32>{
 let size=vec2<f32>(textureDimensions(vol));let full=vec2<i32>(textureDimensions(depth));
 let pixel=coord*size-.5;let corner=floor(pixel);let f=fract(pixel);
 let current=textureLoad(depth,clamp(vec2<i32>(coord*vec2<f32>(full)),vec2<i32>(0),full-1),0);
 var sum=vec4<f32>(0);var weights=0.0;var nearest=vec4<f32>(0,0,0,1);var best=1e10;
 for(var y=0;y<2;y++){for(var x=0;x<2;x++){
  let at=(corner+vec2<f32>(f32(x),f32(y))+.5)/size;
  let d=textureLoad(depth,clamp(vec2<i32>(at*vec2<f32>(full)),vec2<i32>(0),full-1),0);
  let delta=abs(d-current)/max(.0000001,abs(current)*.025);
  let value=textureSampleLevel(vol,smp,at,0.0);
  if(delta<best){best=delta;nearest=value;}
  let bilinear=select(1.0-f.x,f.x,x==1)*select(1.0-f.y,f.y,y==1);
  let w=bilinear*exp(-min(80.0,delta));sum+=value*w;weights+=w;
 }}
 if(weights<.0001){return nearest;}return sum/weights;
}`);
export function composeVolume(color,volume,depth){
 const atmosphere=reconstruct(screenUV,volume,sampler(volume),depth);
 return vec4(color.rgb.mul(atmosphere.a).add(atmosphere.rgb),1);
}
