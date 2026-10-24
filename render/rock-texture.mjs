import * as THREE from 'three/webgpu';
let resource;
// Packed, tileable mineral albedo / height / cracks. Generated locally once;
// no satellite-image requests, external image assets, or UV stretching.
export function rockTexture(){
 if(resource)return resource;
 const N=512,data=new Uint8Array(N*N*4);
 const hash=(x,y)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
 function noise(x,y,period){const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),h=(a,b)=>hash((a%period+period)%period,(b%period+period)%period);return (h(i,j)*(1-u)+h(i+1,j)*u)*(1-v)+(h(i,j+1)*(1-u)+h(i+1,j+1)*u)*v;}
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const u=x/N,v=y/N;let value=0,amp=.54;
  for(let f=4;f<=256;f*=2){value+=(noise(u*f,v*f,f)-.5)*amp;amp*=.54;}
  const px=u*12,py=v*12,ix=Math.floor(px),iy=Math.floor(py);let first=1e9,second=1e9;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
   const a=ix+i,b=iy+j,aa=(a%12+12)%12,bb=(b%12+12)%12;
   const dx=px-a-.2-hash(aa,bb)*.6,dy=py-b-.2-hash(aa+71,bb+23)*.6,r=dx*dx+dy*dy;
   if(r<first){second=first;first=r;}else if(r<second)second=r;
  }
  const crack=Math.exp(-(Math.sqrt(second)-Math.sqrt(first))*70),stratum=Math.sin(v*Math.PI*64+noise(u*8,v*8,8)*5)*.025;
  const height=Math.max(0,Math.min(1,.52+value+stratum-crack*.24)),i=(y*N+x)*4;
  data[i]=Math.round(Math.max(.1,Math.min(1,.56+value*1.3-crack*.32))*255);data[i+1]=Math.round(height*255);data[i+2]=Math.round(crack*255);data[i+3]=255;
 }
 resource=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);resource.wrapS=resource.wrapT=THREE.RepeatWrapping;resource.generateMipmaps=true;resource.minFilter=THREE.LinearMipmapLinearFilter;resource.magFilter=THREE.LinearFilter;resource.anisotropy=8;resource.needsUpdate=true;return resource;
}
