import {faceDirection} from './cube.mjs';
import {randomAt,hash32,fbm} from './math.mjs';
import {sampleTerrain} from './terrain.mjs';
// Stable global tile / lattice addresses. Loading order never enters the seed.
export function vegetationTile(world,face,tx,ty,level=Math.ceil(Math.log2(2*world.radiusMeters/1400))){
  const divisions=2**level,grid=24,size=2/divisions,instances=[],tileSeed=hash32(`${world.vegetationSeed}/${face}/${level}/${tx}/${ty}/stand-v3`);
  for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
    const id=y*grid+x,u=-1+(tx+(x+.15+randomAt(tileSeed,id)*.7)/grid)*size,v=-1+(ty+(y+.15+randomAt(tileSeed+1,id)*.7)/grid)*size,d=faceDirection(face,u,v),s=sampleTerrain(world,d);
    if(s.waterDepthMeters>0||s.protectedFeatureMask>.12||s.elevationMeters>2800||s.temperature<0||s.forest<.04)continue;
    const probability=s.forest;
    if(randomAt(tileSeed+2,id)>probability)continue;
    instances.push({id:`${face}/${level}/${tx}/${ty}/${id}`,direction:d,elevationMeters:s.elevationMeters,heightMeters:12+randomAt(tileSeed+3,id)*19,species:s.biome===4?0:Math.floor(randomAt(tileSeed+4,id)*3),rotation:randomAt(tileSeed+5,id)*6.2831853});
  }
  return instances;
}
