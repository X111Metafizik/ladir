export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const normalize=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
export const distance=(a,b)=>Math.acos(clamp(dot(a,b),-1,1));
export function hash32(text) {
  let h=2166136261;
  for(const byte of new TextEncoder().encode(String(text).normalize('NFC'))){h=Math.imul(h^byte,16777619);}
  h^=h>>>16; h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);
  return (h^(h>>>16))>>>0;
}
export function randomStream(seed) {
  let s=hash32(seed)||1;
  return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
}
export const randomAt=(seed,id)=>hash32(`${seed}/${id}`)/4294967296;
function lattice(x,y,z,seed){
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;
  h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/2147483647.5-1;
}
export function noise3(x,y,z,seed){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;
  const f=t=>t*t*t*(t*(t*6-15)+10),u=f(fx),v=f(fy),w=f(fz);
  return mix(mix(mix(lattice(ix,iy,iz,seed),lattice(ix+1,iy,iz,seed),u),mix(lattice(ix,iy+1,iz,seed),lattice(ix+1,iy+1,iz,seed),u),v),
    mix(mix(lattice(ix,iy,iz+1,seed),lattice(ix+1,iy,iz+1,seed),u),mix(lattice(ix,iy+1,iz+1,seed),lattice(ix+1,iy+1,iz+1,seed),u),v),w);
}
export function fbm(p,frequency,seed,octaves=5){
  let sum=0,amp=.5;
  for(let i=0;i<octaves;i++){sum+=amp*noise3(p[0]*frequency,p[1]*frequency,p[2]*frequency,seed+i*1013);frequency*=2.03;amp*=.49;}
  return sum;
}
export const localDirection=(world,x,y)=>normalize(world.frame.center.map((v,i)=>v+world.frame.east[i]*x+world.frame.north[i]*y));
export function localCoordinates(world,d){
  const z=dot(d,world.frame.center);
  return z>.01?[dot(d,world.frame.east)/z,dot(d,world.frame.north)/z,z]:[20,20,z];
}
export function stableStringify(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
}
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
