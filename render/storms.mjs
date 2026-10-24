import {Vector3} from 'three/webgpu';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const hash=(x,y,z)=>{let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,2246822519))>>>0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
export function stormPulse(time,seed){const p=((time/13+seed)%1+1)%1;return (Math.exp(-p*320)+.65*Math.exp(-Math.abs(p-.018)*620))*smooth(.44,.72,seed);}
// Mirrors the filtered packed 3D cloud noise. Only 27 nearby cells are sampled
// twice a second; there is no GPU readback or per-frame spatial allocation.
export function cloudDensityAt(p,coverage,clock,radius,noise){
 const h=Math.hypot(p.x,p.y,p.z)-radius,profile=smooth(2,3,h)*(1-smooth(9,12,h));if(profile<.001||coverage<.01)return 0;
 const data=noise.image.data,N=noise.image.width;
 function sample(x,y,z,c){const px=x*N-.5,py=y*N-.5,pz=z*N-.5,ix=Math.floor(px),iy=Math.floor(py),iz=Math.floor(pz),fx=px-ix,fy=py-iy,fz=pz-iz;let value=0;
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=((ix+i)%N+N)%N,yy=((iy+j)%N+N)%N,zz=((iz+k)%N+N)%N;value+=data[((zz*N+yy)*N+xx)*4+c]/255*(i?fx:1-fx)*(j?fy:1-fy)*(k?fz:1-fz);}return value;}
 const weather=sample(p.x*.001+clock*.00001,p.y*.001,p.z*.001+clock*.000006,0),shape=sample(p.x*.022+clock*.0001,p.y*.022,p.z*.022+clock*.00006,0),erosion=sample(p.x*.022+clock*.0001,p.y*.022,p.z*.022+clock*.00006,2);
 return smooth(.68-coverage*.30,.82-coverage*.30,weather*.35+shape*.90-erosion*.12)*profile;
}
export function createStormField(shared,onThunder=()=>{}){
 const storms=Array.from({length:4},()=>({center:new Vector3(),density:0,seed:0,lastCycle:-1})),eye=new Vector3(),candidate=new Vector3(),lastEye=new Vector3(Infinity,0,0);
 let lastRefresh=-Infinity,lastCoverage=-1,reactive=false;const stats={active:0,energy:0,thunders:0,densityMinimum:.48};
 const outputs=[shared.storm0,shared.storm1,shared.storm2,shared.storm3];
 function update(absolute){const time=shared.clock.value,coverage=shared.clouds.value,radius=shared.radiusKm.value;eye.copy(absolute).multiplyScalar(shared.kmPerUnit.value);
  if(coverage<.01){for(const o of outputs)o.value.w=0;stats.active=stats.energy=0;reactive=false;lastCoverage=-1;return;}
  if(time-lastRefresh>.5||Math.abs(coverage-lastCoverage)>.015||eye.distanceToSquared(lastEye)>16){
   lastRefresh=time;lastCoverage=coverage;lastEye.copy(eye);const old=storms.map(s=>({seed:s.seed,cycle:s.lastCycle})),candidates=[];
   const gx=Math.floor(eye.x/32),gy=Math.floor(eye.y/32),gz=Math.floor(eye.z/32);
   for(let z=gz-1;z<=gz+1;z++)for(let y=gy-1;y<=gy+1;y++)for(let x=gx-1;x<=gx+1;x++){
    candidate.set((x+.5)*32,(y+.5)*32,(z+.5)*32).setLength(radius+5.5);const density=cloudDensityAt(candidate,coverage,time,radius,shared.volumeResources.noise),seed=hash(x,y,z);
    if(density>=stats.densityMinimum&&seed>.44)candidates.push({center:candidate.clone(),density,seed,score:candidate.distanceToSquared(eye)});
   }
   candidates.sort((a,b)=>a.score-b.score);for(let i=0;i<4;i++){const c=candidates[i],s=storms[i];s.density=c?.density??0;if(c){s.center.copy(c.center);s.seed=c.seed;s.lastCycle=old.find(o=>o.seed===s.seed)?.cycle??Math.floor(time/13+s.seed);}}
  }
  stats.active=stats.energy=0;
  for(let i=0;i<4;i++){const s=storms[i],o=outputs[i].value,cycle=Math.floor(time/13+s.seed),power=s.density>=stats.densityMinimum?stormPulse(time,s.seed)*smooth(.38,.8,s.density):0;o.set(s.center.x,s.center.y,s.center.z,power);stats.energy=Math.max(stats.energy,power);if(s.density>=stats.densityMinimum)stats.active++;
   if(cycle>s.lastCycle&&s.density>=stats.densityMinimum){const distance=s.center.distanceTo(eye)*1000;if(distance<24000){onThunder(s.density,distance);stats.thunders++;}}s.lastCycle=cycle;
  }
  // Flash changes must never remain frozen in old 8x8 history tiles.
  reactive=stats.energy>.002;
 }
 return {update,stats,get reactive(){return reactive;}};
}
