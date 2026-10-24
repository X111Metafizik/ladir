import {faceVector,faceDirection} from '../core/cube.mjs';

// Experimental radial displacement on the EXISTING quadtree. Boundary
// corrections retain its stitched chords; they are not replaced by skirts.
// It is deliberately separate from the production renderer until profiling
// justifies the migration of CPU collision and picking buffers.
export function packHeightTile(world,p,data){
 const n=p.resolution,count=(n+1)**2,heights=new Float32Array(count),edges=new Float32Array((4*(n+1)+1)*4),c=faceVector(p.face,p.u+p.size/2,p.v+p.size/2),u=faceVector(p.face,p.u+p.size/2+1,p.v+p.size/2).map((v,k)=>v-c[k]),v=faceVector(p.face,p.u+p.size/2,p.v+p.size/2+1).map((v,k)=>v-c[k]);
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){
  const i=y*(n+1)+x,d=faceDirection(p.face,p.u+x/n*p.size,p.v+y/n*p.size),a=data.positions,radial=d.reduce((s,q,k)=>s+q*(a[i*3+k]+data.center[k]),0),height=radial-1000;heights[i]=height;
  const edge=y===0?x+1:x===n?n+2+y:y===n?2*(n+1)+x+1:x===0?3*(n+1)+y+1:0;
  if(edge)for(let k=0;k<3;k++)edges[edge*4+k]=a[i*3+k]-(d[k]*radial-data.center[k]);
 }
 return {n,count,heights,edges,params:Float32Array.from([...c,n,...u,p.size/n,...v,0]),reference:data.positions,metersPerUnit:world.radiusMeters/1000};
}
export const heightTileWGSL=`
struct Params { c:vec4<f32>, u:vec4<f32>, v:vec4<f32> }
@group(0) @binding(0) var<storage,read> heights:array<f32>;
@group(0) @binding(1) var<storage,read> edges:array<vec4<f32>>;
@group(0) @binding(2) var<uniform> p:Params;
@group(0) @binding(3) var<storage,read_write> positions:array<vec4<f32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) invocation:vec3<u32>){
 let i=invocation.x;let n=u32(p.c.w);if(i>=(n+1u)*(n+1u)){return;}
 let x=i%(n+1u);let y=i/(n+1u);
 let delta=(p.u.xyz*(f32(x)-f32(n)*.5)+p.v.xyz*(f32(y)-f32(n)*.5))*p.u.w;
 let base=length(p.c.xyz);let square=2.0*dot(p.c.xyz,delta)+dot(delta,delta);
 let radius=sqrt(base*base+square);let difference=square/(radius+base);
 // Algebraic difference avoids subtracting two ~1000-unit Float32 points.
 let local=1000.0*(delta/radius-p.c.xyz*(difference/(radius*base)))+(p.c.xyz+delta)/radius*heights[i];
 var edge=0u;if(y==0u){edge=x+1u;}else if(x==n){edge=n+2u+y;}else if(y==n){edge=2u*(n+1u)+x+1u;}else if(x==0u){edge=3u*(n+1u)+y+1u;}
 positions[i]=vec4<f32>(local+edges[edge].xyz,1.0);
}`;
