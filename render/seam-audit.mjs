import {faceDirection,directionFace,projectToFace} from '../core/cube.mjs';
// Offline/browser QA only. Compare displayed vertices with the neighboring
// displayed triangle, including cube-face changes and mixed resolutions.
export function auditMeshSeams(meshes,radiusMeters){
 const lookup=new Map(meshes.map(m=>{const p=m.userData.patch;return [`${p.face}/${p.level}/${p.x}/${p.y}`,m];})),maxLevel=Math.max(...meshes.map(m=>m.userData.patch.level));
 const find=d=>{const [f,u,v]=directionFace(d);for(let l=maxLevel;l>=3;l--){const n=2**l,m=lookup.get(`${f}/${l}/${Math.min(n-1,Math.max(0,Math.floor((u+1)*n/2)))}/${Math.min(n-1,Math.max(0,Math.floor((v+1)*n/2)))}`);if(m)return m;}};
 const point=(m,d)=>{const p=m.userData.patch,n=p.resolution??16,[,u,v]=projectToFace(d,p.face),x=Math.max(0,Math.min(n-1e-7,(u-p.u)/p.size*n)),y=Math.max(0,Math.min(n-1e-7,(v-p.v)/p.size*n)),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=iy*(n+1)+ix,b=a+1,c=a+n+1,e=c+1,ids=fx+fy<=1?[a,b,c]:[b,e,c],weights=fx+fy<=1?[1-fx-fy,fx,fy]:[1-fy,fx+fy-1,1-fx],vertices=m.geometry.attributes.position.array;
  return [0,1,2].map(k=>m.position.getComponent(k)+ids.reduce((s,id,i)=>s+vertices[id*3+k]*weights[i],0));};
 let checks=0,maxGapMeters=0,overCentimeter=0,overMeter=0,worst=null;
 for(const m of meshes){const p=m.userData.patch,n=p.resolution??16;if(p.level<8)continue;
  for(let side=0;side<4;side++)for(let j=0;j<=n;j++){
   const x=side===1?n:side===3?0:j,y=side===0?0:side===2?n:j,u=p.u+x/n*p.size,v=p.v+y/n*p.size,e=p.size*1e-5,d=faceDirection(p.face,u,v),other=find(faceDirection(p.face,u+(side===1?e:side===3?-e:0),v+(side===0?-e:side===2?e:0)));
   if(!other||other===m)continue;const a=point(m,d),b=point(other,d),gap=Math.hypot(...a.map((v,k)=>v-b[k]))*radiusMeters/1000;checks++;if(gap>.01)overCentimeter++;if(gap>1)overMeter++;if(gap>maxGapMeters){maxGapMeters=gap;worst={from:p.key,to:other.userData.patch.key,side,j,gap};}
  }
 }
 return {checks,maxGapMeters,overCentimeter,overMeter,worst};
}
