import * as THREE from 'three/webgpu';
import {normalize} from '../core/math.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
export function regionOverlay(world){
  const b=world.buffers,positions=[],scale=1000/world.radiusMeters;
  const point=d=>{const s=sampleTerrain(world,d);return d.map(v=>v*(1000+(Math.max(s.elevationMeters,s.waterSurfaceMeters)+10)*scale));};
  for(let k=0;k<b.indices.length;k+=3){
    const ids=Array.from(b.indices.subarray(k,k+3)),crossings=[];
    for(let j=0;j<3;j++){
      const a=ids[j],c=ids[(j+1)%3];if(b.regionIndex[a]===b.regionIndex[c])continue;
      crossings.push(normalize([0,1,2].map(v=>b.directions[a*3+v]+b.directions[c*3+v])));
    }
    if(crossings.length===2)positions.push(...point(crossings[0]),...point(crossings[1]));
    if(crossings.length===3){const center=normalize([0,1,2].map(v=>crossings.reduce((s,d)=>s+d[v],0)));for(const d of crossings)positions.push(...point(center),...point(d));}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.LineBasicNodeMaterial({color:0xe9c384,transparent:true,opacity:.85,depthWrite:false}),mesh=new THREE.LineSegments(geometry,material);mesh.visible=false;
  return {mesh,dispose(){geometry.dispose();material.dispose();}};
}
