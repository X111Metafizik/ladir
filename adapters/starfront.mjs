import {normalize} from '../core/math.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {queryStaticNavigation,nearestRegion} from '../core/navigation.mjs';
// Verified against spherical.mjs geometryVersion 3 on 2026-10-20.
export function cellDirection(cell,body){
  const lon=(cell.cx??cell.x+.5)/body.cols*2*Math.PI-Math.PI,y=2*(cell.cy??cell.y+.5)/body.rows-1,r=Math.sqrt(Math.max(0,1-y*y));
  return [r*Math.sin(lon),y,r*Math.cos(lon)];
}
export function importStarfrontLayout(body){
  if(!body?.cells||!Number.isFinite(body.cols)||!Number.isFinite(body.rows))throw Error('Starfront body sözleşmesi: cells, cols, rows gerekli.');
  return {bodyId:body.id,frame:{northAxis:[0,1,0],handedness:'right'},cells:body.cells.map((c,i)=>({id:c.id,direction:cellDirection(c,body),polygon:body.polygons?.[i]??[]})),protectedSamples:body.cells.filter(c=>typeof c.water==='boolean').map(c=>({id:c.id,direction:cellDirection(c,body),water:c.water}))};
}
export function createStarfrontAdapter({world,hostBindings={}}){
  return {
    worldId:world.manifest.worldDataHash,
    sample(direction){return sampleTerrain(world,normalize(direction));},
    regionAt(direction){return nearestRegion(world,normalize(direction));},
    anchor(direction,offsetMeters=0){const d=normalize(direction),s=sampleTerrain(world,d),r=1+(Math.max(s.elevationMeters,s.waterSurfaceMeters)+offsetMeters)/world.radiusMeters;return d.map(v=>v*r);},
    queryNavigation(query){return queryStaticNavigation(world,query);},
    applyMovementSegment(query){const result=queryStaticNavigation(world,query);if(!result.passable)return result;hostBindings.applyValidatedSegment?.(query,result);return result;},
    selectRegion(id){if(!world.regionBindings.some(r=>r.id===id))return false;if(hostBindings.isVisible&&!hostBindings.isVisible(id))return false;hostBindings.onSelect?.(id);return true;},
    exportVisibleBindings(){return world.regionBindings.filter(r=>!hostBindings.isVisible||hostBindings.isVisible(r.id));},
    dispose(){hostBindings={};}
  };
}
