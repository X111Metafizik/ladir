import * as THREE from 'three/webgpu';
import {createStarfrontAdapter} from '../adapters/starfront.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {normalize} from '../core/math.mjs';

/** Independent host preview. Every applied segment passes the shared navigation guard. */
export function createRoutePreview(world){
  const group=new THREE.Group(),scale=1000/world.radiusMeters;
  const unit=new THREE.Mesh(new THREE.ConeGeometry(1,3,5),new THREE.MeshStandardNodeMaterial({color:0xffd695,emissive:0x9b6319,emissiveIntensity:.3,roughness:.45}));
  unit.visible=false;group.add(unit);let line=null,active=null;
  const state={active:false,mode:null,appliedSegments:0,selectedRegion:null,lastDirection:null};
  const adapter=createStarfrontAdapter({world,hostBindings:{
    onSelect:id=>state.selectedRegion=id,
    applyValidatedSegment:query=>{state.appliedSegments++;state.lastDirection=query.to;}
  }});
  function position(d,mode,offset=8){
    const s=sampleTerrain(world,d),h=mode==='water'?s.waterSurfaceMeters:s.elevationMeters;
    return new THREE.Vector3(...d).multiplyScalar(1000+(h+offset)*scale);
  }
  function preview(query){
    const result=adapter.queryNavigation(query);if(!result.passable)return result;
    if(line){group.remove(line);line.geometry.dispose();line.material.dispose();}
    group.position.copy(position(result.route[0],query.mode,0));
    const points=result.route.map(d=>position(d,query.mode,18).sub(group.position));
    line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicNodeMaterial({color:0xffd48b,depthTest:true}));
    group.add(line);active={query,route:result.route,time:0,previous:query.from};state.active=true;state.mode=query.mode;state.appliedSegments=0;
    unit.scale.setScalar((query.mode==='water'?65:15)*scale);unit.visible=true;unit.position.copy(points[0]);
    return result;
  }
  function update(dt){
    if(!active)return;
    active.time=Math.min(18,active.time+dt);
    const index=active.time/18*(active.route.length-1),i=Math.min(active.route.length-2,Math.floor(index)),t=index-i;
    const d=normalize(active.route[i].map((v,k)=>v*(1-t)+active.route[i+1][k]*t));
    const result=adapter.applyMovementSegment({...active.query,from:active.previous,to:d});
    if(!result.passable){active=null;state.active=false;return;}
    active.previous=d;unit.position.copy(position(d,state.mode,state.mode==='water'?40:15)).sub(group.position);
    unit.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...d));
    if(active.time>=18){active=null;state.active=false;}
  }
  return {group,adapter,state,preview,update,dispose(){adapter.dispose();unit.geometry.dispose();unit.material.dispose();if(line){line.geometry.dispose();line.material.dispose();}}};
}
