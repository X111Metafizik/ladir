import {wgslFn,uniform,vec3,vec4,getViewPosition,screenUV,screenCoordinate,texture,texture3D,sampler,outputStruct} from 'three/tsl';
import {Vector3,Matrix4} from 'three/webgpu';
import {composeVolume} from './volume-upscale.mjs';
import {temporalVolume,reprojectVolume} from './temporal-volume.mjs';
export const hashNoise=wgslFn(`
fn ps_hash(p: vec3<f32>) -> f32 {
  let v=vec3<u32>(vec3<i32>(floor(p))); var h=v.x*374761393u+v.y*668265263u+v.z*2246822519u; h=(h^(h>>13u))*1274126177u; return f32(h^(h>>16u))/4294967295.0;
}`);
export const valueNoise=wgslFn(`
fn ps_noise(p: vec3<f32>) -> f32 {
 let i=floor(p);let f=fract(p);let u=f*f*(3.0-2.0*f);
 return mix(mix(mix(ps_hash(i),ps_hash(i+vec3<f32>(1,0,0)),u.x),
 mix(ps_hash(i+vec3<f32>(0,1,0)),ps_hash(i+vec3<f32>(1,1,0)),u.x),u.y),
 mix(mix(ps_hash(i+vec3<f32>(0,0,1)),ps_hash(i+vec3<f32>(1,0,1)),u.x),
 mix(ps_hash(i+vec3<f32>(0,1,1)),ps_hash(i+vec3<f32>(1,1,1)),u.x),u.y),u.z);
}`,[hashNoise]);
export const fractalNoise=wgslFn(`
fn ps_fbm(p:vec3<f32>)->f32 {
 var v=0.0;var a=0.55;var q=p;
 for(var i=0;i<4;i++){v+=ps_noise(q)*a;q=q*2.03+vec3<f32>(17.3,9.2,4.1);a*=0.49;}
 return v;
}`,[valueNoise]);
export const cloudDensity=wgslFn(`
fn ps_cloud(p:vec3<f32>, coverage:f32, clock:f32)->f32 {
 let h=length(p)-1000.0;
 let profile=smoothstep(17.0,21.0,h)*(1.0-smoothstep(31.0,40.0,h));
 if(profile<0.001||coverage<0.01){return 0.0;}
 let wind=vec3<f32>(clock*0.011,0.0,clock*0.006);
 let weather=ps_fbm(normalize(p)*9.0+wind*.07);
 let shape=ps_fbm(p*.075+wind);
 let erosion=ps_noise(p*.30+wind*1.5);
 return smoothstep(1.02-coverage*.65,1.19-coverage*.50,weather*.63+shape*.62-erosion*.08)*profile;
}`,[fractalNoise,valueNoise]);
const sphere=wgslFn(`
fn ps_sphere(ro:vec3<f32>,rd:vec3<f32>,r:f32)->vec2<f32>{
 let b=dot(ro,rd);let c=dot(ro,ro)-r*r;let h=b*b-c;
 if(h<0.0){return vec2<f32>(1e8,-1e8);}
 return vec2<f32>(-b-sqrt(h),-b+sqrt(h));
}`);
export const cachedCloud=wgslFn(`
fn ps_cached_cloud(p:vec3<f32>,coverage:f32,clock:f32,radius:f32,tex:texture_3d<f32>,smp:sampler)->f32{
 let h=length(p)-radius;
 let profile=smoothstep(2.0,3.0,h)*(1.0-smoothstep(9.0,12.0,h));
 if(profile<.001||coverage<.01){return 0.0;}
 let drift=vec3<f32>(clock*.0001,0.0,clock*.00006);
 let weather=textureSampleLevel(tex,smp,p*.001+drift*.1,0.0).r;
 let shape=textureSampleLevel(tex,smp,p*.022+drift,0.0);
 // Packed fine noise avoids a third density lookup at every ray step.
 return smoothstep(.68-coverage*.30,.82-coverage*.30,weather*.35+shape.r*.90-shape.b*.12)*profile;
}`);
const surfaceCloudShadow=wgslFn(`
fn ps_surface_cloud_shadow(p:vec3<f32>,sun:vec3<f32>,coverage:f32,clock:f32,radius:f32,tex:texture_3d<f32>,smp:sampler)->f32 {
 if(coverage<.001){return 1.0;}
 let b=dot(p,sun);
 let t=-b+sqrt(max(0.0,b*b+(radius+6.0)*(radius+6.0)-dot(p,p)));
 // Broad ground shadow; the full density march belongs in the sky pass.
 let opticalDepth=ps_cached_cloud(p+sun*t,coverage,clock,radius,tex,smp)*1.8;
 return exp(-opticalDepth);
}`,[cachedCloud]);
export function cloudShadowAt(position,shared){
  const tex=texture3D(shared.volumeResources.noise);
  return surfaceCloudShadow(position.mul(shared.kmPerUnit),shared.sun,shared.clouds,shared.clock,shared.radiusKm,tex,sampler(tex));
}
const stormGlow=wgslFn(`
fn ps_storm_glow(p:vec3<f32>,storm:vec4<f32>)->f32{
 if(storm.w<.001){return 0.0;}
 let d=length(p-storm.xyz);
 // Compact continuous support; no hard spatial cell edges or billboard quad.
 return storm.w*(1.0-smoothstep(3.0,13.0,d))*exp(-d*d*.012);
}`);
const volume=wgslFn(`
fn ps_volume(ro:vec3<f32>,rd:vec3<f32>,pixel:vec2<f32>,surfaceDistance:f32,sun:vec3<f32>,strength:f32,coverage:f32,fog:f32,clock:f32,steps:i32,radius:f32,transTex:texture_2d<f32>,transSampler:sampler,noiseTex:texture_3d<f32>,noiseSampler:sampler,reproject:vec4<f32>,history:texture_2d<f32>,historySampler:sampler,storm0:vec4<f32>,storm1:vec4<f32>,storm2:vec4<f32>,storm3:vec4<f32>)->vec4<f32>{
 if(strength<=0.0&&coverage<=0.0&&fog<=0.0){return vec4<f32>(0,0,0,1);}
 if(reproject.z>.5){return textureSampleLevel(history,historySampler,reproject.xy,0.0);}
 let hit=ps_sphere(ro,rd,radius+100.0);
 let entry=max(0.0,hit.x);var exit=min(hit.y,surfaceDistance);
 let ground=ps_sphere(ro,rd,radius-.01);
 if(ground.x>0.0){exit=min(exit,ground.x);}
 if(exit<=entry){return vec4<f32>(0,0,0,1);}
 // Short surface rays cross a nearly constant density field. Use a physical
 // integration interval instead of spending the full orbital sample budget
 // on every pixel a few metres in front of the camera. Clouds keep their own
 // sixteen-sample shell pass, independently of this clear-air integration.
 let airSteps=min(steps,max(6,i32(ceil((exit-entry)/.75))));
 let stepSize=(exit-entry)/f32(airSteps);
 var trans=vec3<f32>(1);var light=vec3<f32>(0);
 let mu=dot(rd,sun);
 let rayPhase=0.0596831*(1.0+mu*mu);
 let g=0.73;
 let miePhase=0.079577*(1.0-g*g)/pow(max(.03,1.0+g*g-2.0*g*mu),1.5);
 if(strength>0.0||fog>0.0){for(var i=0;i<airSteps;i++){
   let p=ro+rd*(entry+(f32(i)+.5)*stepSize);let h=max(0.0,length(p)-radius);
   let rayDensity=exp(-h/8.0)*strength;
   let mieDensity=exp(-h/1.2)*strength;
   let cloud=0.0;
   var mist=0.0;
   if(fog>0.0){mist=exp(-h/2.5)*fog*smoothstep(.48,.70,textureSampleLevel(noiseTex,noiseSampler,p*.0004,0.0).r);}
   let betaR=vec3<f32>(.0036,.0080,.0180)*rayDensity;
   let betaM=vec3<f32>(.008)*mieDensity;
   let extinction=betaR+betaM+vec3<f32>(cloud*.24+mist*.045);
   var sunTrans=pow(textureSampleLevel(transTex,transSampler,vec2<f32>(dot(normalize(p),sun)*.5+.5,clamp(h/100.0,0.0,1.0)),0.0).rgb,vec3<f32>(strength));
   var cloudShadow=0.0;
   if(cloud>.001){
     for(var j=0;j<3;j++){cloudShadow+=ps_cached_cloud(p+sun*(f32(j)+.5)*2.5,coverage,clock,radius,noiseTex,noiseSampler)*1.4;}
   }
   sunTrans*=exp(-cloudShadow);
   let daylight=smoothstep(-.15,.22,dot(normalize(p),sun));
   let ambient=vec3<f32>(.28,.39,.52)*(.03+daylight*.27);
   let scatter=(betaR*rayPhase+betaM*miePhase)*sunTrans*16.0+
     vec3<f32>(cloud*.24)*(sunTrans*(.65+miePhase*.4)+ambient)+
     vec3<f32>(mist*.045)*(sunTrans*.3+ambient)+betaR*ambient*.24;
   let segmentT=exp(-extinction*stepSize);
   light+=trans*scatter*(vec3<f32>(1)-segmentT)/max(extinction,vec3<f32>(.000001));
   trans*=segmentT;
   if(max(trans.x,max(trans.y,trans.z))<.003){break;}
 }
 }
 let sunDisk=pow(max(0.0,mu),12000.0)*12.0;
 let sky=select(vec3<f32>(0),vec3<f32>(1.0,.78,.51)*sunDisk,surfaceDistance>100000.0);
 // Integrate the thin cloud shell separately. A 12,000 km radius must not
 // turn an eight-kilometer cloud layer into sparse samples along the full ray.
 var cloudLight=vec3<f32>(0);var cloudTrans=1.0;
 if(coverage>.001){
   let outer=ps_sphere(ro,rd,radius+12.0);let inner=ps_sphere(ro,rd,radius+2.0);
   var a=max(0.0,outer.x);var b=min(surfaceDistance,outer.y);
   if(inner.x>0.0){b=min(b,inner.x);}
   // From below the cloud base the near intersection is behind the camera.
   // Skip the clear lower shell instead of spending samples in empty air.
   if(length(ro)<radius+2.0){a=max(a,inner.y);}
   b=min(b,exit);
   if(b>a){
     let cloudSteps=24;let ds=(b-a)/f32(cloudSteps);var ct=1.0;var cl=vec3<f32>(0);
     // Stable midpoint quadrature: a fixed screen-space IGN offset survived
     // temporal reuse and became a woven pattern after half-res upscaling.
     let jitter=.5;
     for(var k=0;k<cloudSteps;k++){
       let p=ro+rd*(a+(f32(k)+jitter)*ds);
       let density=ps_cached_cloud(p,coverage,clock,radius,noiseTex,noiseSampler);
       let attenuation=exp(-density*.20*ds);
       let day=smoothstep(-.06,.22,dot(normalize(p),sun));
       let lightShape=textureSampleLevel(noiseTex,noiseSampler,(p+sun*2.5)*.022+vec3<f32>(clock*.0001,0.0,clock*.00006),0.0).r;
       let shadow=smoothstep(.46,.72,lightShape)*density;
       let lightning=(ps_storm_glow(p,storm0)+ps_storm_glow(p,storm1)+ps_storm_glow(p,storm2)+ps_storm_glow(p,storm3))*smoothstep(.28,.62,density);
       let illumination=vec3<f32>(.86,.89,.93)*(.12+day*.88)*exp(-shadow*.6)+vec3<f32>(.72,.84,1.0)*lightning*9.0;
       cl+=ct*(1.0-attenuation)*illumination;ct*=attenuation;
       if(ct<.008){break;}
     }
     cloudLight=cl;cloudTrans=ct;
   }
 }
 // A premultiplied light buffer keeps the beauty image at full resolution.
 // Scalar extinction is the luminance approximation used for reconstruction.
 return vec4<f32>((cloudLight+sky)*trans+light,cloudTrans*dot(trans,vec3<f32>(.2126,.7152,.0722)));
}`,[sphere,cachedCloud,stormGlow]);
export function createAtmosphere(scenePass,camera,originUniform,shared,colorOverride){
  const cameraAbsolute=uniform(new Vector3()),cameraMatrix=uniform(new Matrix4()),inverseProjection=uniform(camera.projectionMatrixInverse);
  const resources=shared.volumeResources,transTexture=texture(resources.transmittance),noiseTexture=texture3D(resources.noise);
  const depth=scenePass.getTextureNode('depth'),color=colorOverride??scenePass.getTextureNode('output');
  const view=getViewPosition(screenUV,depth,inverseProjection),ray=cameraMatrix.mul(vec4(view,0)).xyz.normalize();
  const maxDistance=depth.lessThanEqual(0).select(1e8,view.length().mul(shared.kmPerUnit));
  const light=temporalVolume(history=>{
    const reprojection=reprojectVolume(cameraAbsolute.mul(shared.kmPerUnit),ray,maxDistance,shared.radiusKm,screenCoordinate.xy,history.phase,history.valid.mul(shared.stormReactive.oneMinus()),history.delta,history.previousVP,history.historyMeta,sampler(history.historyMeta),shared.clock);
    const volumeNode=volume(cameraAbsolute.mul(shared.kmPerUnit),ray,screenCoordinate.xy,maxDistance,shared.sun,shared.atmosphere,shared.clouds,shared.fog,shared.clock,shared.steps,shared.radiusKm,transTexture,sampler(transTexture),noiseTexture,sampler(noiseTexture),reprojection,history.historyColor,sampler(history.historyColor),shared.storm0,shared.storm1,shared.storm2,shared.storm3);
    return outputStruct(volumeNode,vec4(maxDistance.min(60000),reprojection.w,0,1));
  },camera,shared);
  const node=composeVolume(color,light,depth);
  return {node,light,reset(){light.reset();},dispose(){light.dispose();resources.dispose();},update(absolute){cameraAbsolute.value.copy(absolute);cameraMatrix.value.copy(camera.matrixWorld);inverseProjection.value.copy(camera.projectionMatrixInverse);light.updateCamera(absolute);}};
}
