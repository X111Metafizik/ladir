import * as THREE from 'three/webgpu';
import {Fn,If,storage,instanceIndex,uint,float,vec2,vec3,vec4,sin,cos,uniform,positionLocal,positionView,positionWorld,normalWorld,normalView,cameraPosition,mix,attribute,bumpMap,reflectVector} from 'three/tsl';
import {randomStream,localDirection,normalize} from '../core/math.mjs';
import {fractalNoise,cloudShadowAt} from './atmosphere.mjs';
import {lakeShoreRadius} from '../core/terrain.mjs';
// Tessendorf spectrum, bit-reversed initialization and two separable radix-2 inverse FFTs.
export function createOceanFFT(seed,clock){
  const N=64,count=N*N,random=randomStream(`${seed}/ocean-spectrum`),h0=new Float32Array(count*2),omega=new Float32Array(count),L=640;
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random());
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=y*N+x,kx=2*Math.PI*(x<N/2?x:x-N)/L,ky=2*Math.PI*(y<N/2?y:y-N)/L,k=Math.hypot(kx,ky);
    const ph=k===0?0:Math.exp(-1/(k*k*180*180))/(k**4)*((kx*.86+ky*.50)/k)**2*Math.exp(-k*k*.4);
    const amplitude=Math.sqrt(ph/2)*.004;
    h0[id*2]=gaussian()*amplitude;h0[id*2+1]=gaussian()*amplitude;omega[id]=Math.sqrt(9.81*k);
  }
  const reverse=i=>{let o=0;for(let b=0;b<6;b++){o=o*2+(i&1);i>>=1;}return o;};
  const packed=new Float32Array(count*4),frequencies=new Float32Array(count);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,j=reverse(y)*N+reverse(x),neg=((N-reverse(y))%N)*N+(N-reverse(x))%N;
    packed.set([h0[j*2],h0[j*2+1],h0[neg*2],-h0[neg*2+1]],i*4);frequencies[i]=omega[j];
  }
  const spectrum=storage(new THREE.StorageBufferAttribute(packed,4),'vec4',count).toReadOnly(),frequency=storage(new THREE.StorageBufferAttribute(frequencies,1),'float',count).toReadOnly();
  const a=storage(new THREE.StorageBufferAttribute(count,2),'vec2',count),b=storage(new THREE.StorageBufferAttribute(count,2),'vec2',count);
  const initial=Fn(()=>{
    const i=instanceIndex,p=spectrum.element(i),angle=frequency.element(i).mul(clock),c=cos(angle),s=sin(angle);
    a.element(i).assign(vec2(p.x.mul(c).sub(p.y.mul(s)).add(p.z.mul(c)).add(p.w.mul(s)),p.x.mul(s).add(p.y.mul(c)).sub(p.z.mul(s)).add(p.w.mul(c))));
  })().compute(count);
  const passes=[initial];let src=a,dst=b;
  for(let axis=0;axis<2;axis++)for(let stage=1;stage<=6;stage++){
    const length=2**stage,half=length/2,input=src,output=dst;
    const pass=Fn(()=>{
      const i=instanceIndex,x=i.mod(N),y=i.div(N),q=axis===0?x:y,other=axis===0?y:x;
      const k=q.mod(half),start=q.div(length).mul(length),first=start.add(k);
      const i0=axis===0?other.mul(N).add(first):first.mul(N).add(other);
      const i1=axis===0?i0.add(half):i0.add(half*N);
      const v0=input.element(i0),v1=input.element(i1),angle=float(k).mul(2*Math.PI/length),c=cos(angle),s=sin(angle),twiddle=vec2(v1.x.mul(c).sub(v1.y.mul(s)),v1.x.mul(s).add(v1.y.mul(c)));
      output.element(i).assign(q.mod(length).lessThan(half).select(v0.add(twiddle),v0.sub(twiddle)));
    })().compute(count);
    passes.push(pass);[src,dst]=[dst,src];
  }
  const result=storage(src.value,'vec2',count).toReadOnly();
  const sample=uv=>{
    const q=uv.fract().mul(N),x=uint(q.x).mod(N),y=uint(q.y).mod(N),tx=q.x.fract(),ty=q.y.fract();
    const at=(x,y)=>result.element(y.mod(N).mul(N).add(x.mod(N))).x.div(N*N).mul(22);
    return mix(mix(at(x,y),at(x.add(1),y),tx),mix(at(x,y.add(1)),at(x.add(1),y.add(1)),tx),ty);
  };
  return {passes,sample,size:N,update(renderer){renderer.compute(passes);},dispose(){for(const p of passes)p.dispose();}};
}
export function waterMaterial(world,shared,fft,kind='ocean'){
  const scale=1000/world.radiusMeters,m=new THREE.MeshStandardNodeMaterial({roughness:kind==='lake'?.19:.27,metalness:.32});
  const p=positionLocal,meters=positionWorld.mul(1/scale).add(shared.waveOrigin);
  // Three fixed planet-coordinate projections overlap smoothly; the origin never affects phase.
  const weights=normalWorld.abs().pow(4),sum=weights.x.add(weights.y).add(weights.z);
  const distance=positionView.length().mul(1/scale);
  // Outside the existing fade range these expressions already contributed
  // zero. Branch before the expensive noise and twelve storage-buffer reads.
  const wave=Fn(()=>{const value=float(0).toVar();If(distance.lessThan(2500).and(shared.water.greaterThan(0)),()=>{value.assign(fft.sample(meters.yz.div(640)).mul(weights.x).add(fft.sample(meters.zx.div(640)).mul(weights.y)).add(fft.sample(meters.xy.div(640)).mul(weights.z)).div(sum));});return value;})();
  const gain=shared.water.mul(distance.smoothstep(250,2500).oneMinus());
  const small=Fn(()=>{const value=float(.5).toVar();If(distance.lessThan(3000),()=>{value.assign(fractalNoise(meters.mul(.025).add(vec3(shared.clock.mul(.45),0,shared.clock.mul(.18)))).sub(.5).mul(distance.smoothstep(400,3000).oneMinus()).add(.5));});return value;})();
  // No displaced sea surface: the depth field and shore mesh stay coincident.
  m.normalNode=bumpMap(wave.mul(.045).add(small.mul(.2)).mul(gain),1);
  const shallow=kind==='ocean'?attribute('shallows','float'):float(kind==='river'?.8:.5);
  const deep=vec3(.008,.047,.074),coast=vec3(.024,.25,.25),foam=small.sub(.72).max(0).mul(shallow).mul(1.2);
  m.colorNode=mix(deep,coast,shallow).add(vec3(foam)).mul(cloudShadowAt(positionWorld.add(shared.origin),shared));
  m.envNode=mix(vec3(.04,.10,.17),vec3(.38,.59,.79),reflectVector.y.mul(.5).add(.5)).mul(.55);
  m.roughnessNode=float(kind==='lake'?.12:.20).add(small.mul(.15)).add(foam);
  m.userData.kind=kind;return m;
}
export function createWaterGeometry(world,material,sampleTerrain){
  const geometry=new THREE.SphereGeometry(1000+world.generationConfig.seaLevel*1000/world.radiusMeters,192,128),position=geometry.attributes.position,shallows=new Float32Array(position.count);
  for(let i=0;i<position.count;i++){const d=normalize([position.getX(i),position.getY(i),position.getZ(i)]),s=sampleTerrain(world,d);shallows[i]=Math.exp(-Math.max(0,s.waterDepthMeters)/350);}
  geometry.setAttribute('shallows',new THREE.BufferAttribute(shallows,1));
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;
}
export function riverMesh(world,river,material){
  const positions=[],uv=[],indices=[],scale=1000/world.radiusMeters;
  river.points.forEach((p,i)=>{
    for(const side of [-1,1]){const d=localDirection(world,p.x+side*p.widthMeters/world.radiusMeters*.49,p.y);positions.push(...d.map(v=>v*(1000+(p.waterLevelMeters+.05)*scale)));uv.push(side*.5+.5,i/8);}
    if(i<river.points.length-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  });
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  material.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(g,material);mesh.userData.feature=river;return mesh;
}
export function lakeMesh(world,lake,material){
  const p=[],idx=[],scale=1000/world.radiusMeters,segments=128,rings=12;
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
    const theta=i/segments*Math.PI*2,r=j/rings*lakeShoreRadius(world,lake,theta)*1.55/world.radiusMeters,d=localDirection(world,lake.x+Math.cos(theta)*r,lake.y+Math.sin(theta)*r);
    p.push(...d.map(v=>v*(1000+lake.waterLevelMeters*scale)));
  }
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();material.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(g,material);mesh.userData.feature=lake;return mesh;
}
