import {wgslFn,sampler,texture,texture3D} from 'three/tsl';
// Explicit gradients are computed before divergent distance branches. Sampling
// actually stops beyond the LOD boundary; multiplying an expensive lookup by
// zero does not save texture bandwidth. Neutral samples make the fade continuous.
const rockSample=wgslFn(`
fn ps_rock_lod(p:vec3<f32>,n:vec3<f32>,dx:vec3<f32>,dy:vec3<f32>,distance:f32,period:f32,limit:f32,tex:texture_2d<f32>,smp:sampler)->vec4<f32>{
 if(distance>=limit){return vec4<f32>(.5,.5,0,1);}
 let q=p/period;let gx=dx/period;let gy=dy/period;
 let w=abs(n)/max(.00001,dot(abs(n),vec3<f32>(1)));
 return textureSampleGrad(tex,smp,q.yz,gx.yz,gy.yz)*w.x+textureSampleGrad(tex,smp,q.zx,gx.zx,gy.zx)*w.y+textureSampleGrad(tex,smp,q.xy,gx.xy,gy.xy)*w.z;
}`);
const noiseSample=wgslFn(`
fn ps_terrain_noise(p:vec3<f32>,distance:f32,footprint:f32,tex:texture_3d<f32>,smp:sampler)->vec4<f32>{
 var n=vec4<f32>(0);
 if(distance<300000.0){n.x=(textureSampleLevel(tex,smp,p/65536.0,0.0).r-.5)*(1.0-smoothstep(100000.0,300000.0,distance));}
 if(distance<180000.0){n.y=(textureSampleLevel(tex,smp,p/4096.0,0.0).g-.5)*(1.0-smoothstep(80000.0,180000.0,distance));}
 if(distance<10000.0){n.z=(textureSampleLevel(tex,smp,p/1024.0,0.0).b-.5)*(1.0-smoothstep(4000.0,10000.0,distance));}
 if(distance<8000.0 && footprint<2.0){n.w=(textureSampleLevel(tex,smp,p/32.0,0.0).r-.5)*(1.0-smoothstep(4000.0,8000.0,distance));}
 return n;
}`);
export function materialNoise(meters,distance,noise,footprint){const tex=texture3D(noise);return noiseSample(meters,distance,footprint,tex,sampler(tex));}
export function materialRock(meters,normal,distance,period,limit,rock){const tex=texture(rock);return rockSample(meters,normal,meters.dFdx(),meters.dFdy(),distance,period,limit,tex,sampler(tex));}
