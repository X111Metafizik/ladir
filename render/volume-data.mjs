import {Data3DTexture,DataTexture,RGBAFormat,UnsignedByteType,HalfFloatType,LinearFilter,RepeatWrapping,DataUtils} from 'three/webgpu';
import {randomAt,mix} from '../core/math.mjs';
export function volumeData(radius=12000){
  const N=64,data=new Uint8Array(N*N*N*4);
  const smooth=t=>t*t*(3-2*t);
  function tileNoise(x,y,z,period){
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),u=smooth(x-ix),v=smooth(y-iy),w=smooth(z-iz);
    const at=(a,b,c)=>{let h=Math.imul((a%period+period)%period,374761393)^Math.imul((b%period+period)%period,668265263)^Math.imul((c%period+period)%period,2147483647)^8913;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
    return mix(mix(mix(at(ix,iy,iz),at(ix+1,iy,iz),u),mix(at(ix,iy+1,iz),at(ix+1,iy+1,iz),u),v),mix(mix(at(ix,iy,iz+1),at(ix+1,iy,iz+1),u),mix(at(ix,iy+1,iz+1),at(ix+1,iy+1,iz+1),u),v),w);
  }
  for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=(z*N*N+y*N+x)*4,coarse=tileNoise(x/16,y/16,z/16,4),medium=tileNoise(x/8,y/8,z/8,8),fine=tileNoise(x/4,y/4,z/4,16);
    data[i]=Math.round((coarse*.60+medium*.28+fine*.12)*255);data[i+1]=Math.round(medium*255);data[i+2]=Math.round(fine*255);data[i+3]=255;
  }
  const noise=new Data3DTexture(data,N,N,N);noise.format=RGBAFormat;noise.type=UnsignedByteType;noise.minFilter=noise.magFilter=LinearFilter;noise.wrapS=noise.wrapT=noise.wrapR=RepeatWrapping;noise.unpackAlignment=1;noise.needsUpdate=true;
  const W=256,H=64,transData=new Uint16Array(W*H*4),beta=[.0036,.008,.018];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const h=(y+.5)/H*100,r=radius+h,mu=(x+.5)/W*2-1,b=r*mu,outer=-b+Math.sqrt(b*b+(radius+100)**2-r*r),groundDiscriminant=b*b-r*r+radius*radius;
    const blocked=groundDiscriminant>0&&-b-Math.sqrt(groundDiscriminant)>0;
    let ray=0,mie=0;const step=outer/48;
    if(!blocked)for(let j=0;j<48;j++){const t=(j+.5)*step,alt=Math.max(0,Math.sqrt(r*r+t*t+2*r*mu*t)-radius);ray+=Math.exp(-alt/8)*step;mie+=Math.exp(-alt/1.2)*step;}
    for(let c=0;c<3;c++)transData[(y*W+x)*4+c]=DataUtils.toHalfFloat(blocked?0:Math.exp(-beta[c]*ray-.008*mie));transData[(y*W+x)*4+3]=DataUtils.toHalfFloat(1);
  }
  const transmittance=new DataTexture(transData,W,H,RGBAFormat,HalfFloatType);transmittance.minFilter=transmittance.magFilter=LinearFilter;transmittance.needsUpdate=true;
  return {noise,transmittance,dispose(){noise.dispose();transmittance.dispose();}};
}
