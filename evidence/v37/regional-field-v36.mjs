import {sampleProceduralTerrain} from '../../core/terrain.mjs';
import {referenceDirection,referenceCoordinates} from '../../core/landforms.mjs';
import {smooth,mix} from '../../core/math.mjs';
import {FIELD_COUNT} from '../../io/regional-format.mjs';
// The SAME reconstruction is used with disk samples and on-demand generator
// samples. Residency never changes geography. Node values are rounded once to
// Float32 on both paths. This is a distinct, versioned runtime surface profile.
export function generateRegionNode(world,manifest,gx,gy,out=new Float32Array(FIELD_COUNT)){
 const g=manifest.grid,d=referenceDirection(world,g.minX+gx*g.stepMeters,g.minY+gy*g.stepMeters);
 const a=sampleProceduralTerrain(world,d,{micro:false}),b=sampleProceduralTerrain(world,d);
 out.set([a.elevationMeters,b.elevationMeters,a.waterSurfaceMeters,a.temperature,a.moisture,a.biome,b.biome,a.protectedFeatureMask,manifest.featureIds.indexOf(a.featureId),a.flow,a.lava,a.albedo,a.snow,b.snow,a.snowLineMeters,a.forest,b.forest,0,0,0]);return out;
}
const cubic=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
export class RegionField{
 constructor(world,manifest,{maxBytes=24*1024*1024,nodeBytes=2*1024*1024}={}){
  this.world=world;this.manifest=manifest;this.maxBytes=maxBytes;this.nodeLimit=Math.floor(nodeBytes/FIELD_COUNT/4);this.tiles=new Map();this.nodes=new Map();this.bytes=0;
  this.stats={samples:0,bakedSamples:0,proceduralSamples:0,hydrologyFallbacks:0,generationMs:0,ramBytes:0,peakRamBytes:0,nodeBytes:0,evictions:0};
 }
 key(x,y){return x+'/'+y;}
 coordinates(d){const [x,y,z]=referenceCoordinates(this.world,d),g=this.manifest.grid;return z>.9&&x>=g.minX&&y>=g.minY&&x<g.minX+g.tilesX*g.tileMeters&&y<g.minY+g.tilesY*g.tileMeters?[x,y]:null;}
 tileAt(d){const p=this.coordinates(d);if(!p)return null;const g=this.manifest.grid;return this.key(Math.floor((p[0]-g.minX)/g.tileMeters),Math.floor((p[1]-g.minY)/g.tileMeters));}
 install(tile){const key=this.key(tile.x,tile.y),old=this.tiles.get(key);if(old)this.bytes-=old.bytes;this.tiles.delete(key);this.tiles.set(key,tile);this.bytes+=tile.bytes;while(this.bytes>this.maxBytes&&this.tiles.size){const [k,v]=this.tiles.entries().next().value;this.tiles.delete(k);this.bytes-=v.bytes;this.stats.evictions++;}this.stats.ramBytes=this.bytes;this.stats.peakRamBytes=Math.max(this.stats.peakRamBytes,this.bytes);}
 getNode(gx,gy){const key=gx+','+gy;let a=this.nodes.get(key);if(!a){const start=performance.now();a=generateRegionNode(this.world,this.manifest,gx,gy);this.stats.generationMs+=performance.now()-start;this.nodes.set(key,a);while(this.nodes.size>this.nodeLimit)this.nodes.delete(this.nodes.keys().next().value);this.stats.nodeBytes=this.nodes.size*FIELD_COUNT*4;}return a;}
 sample(d,options={}){
  const p=this.coordinates(d);if(!p)return sampleProceduralTerrain(this.world,d,options);
  const g=this.manifest.grid,fx=(p[0]-g.minX)/g.stepMeters,fy=(p[1]-g.minY)/g.stepMeters,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
  const xx=Math.min(g.tilesX-1,Math.floor(ix/g.cells)),yy=Math.min(g.tilesY-1,Math.floor(iy/g.cells)),key=this.key(xx,yy),tile=this.tiles.get(key);
  if(tile){this.tiles.delete(key);this.tiles.set(key,tile);}
  const nodes=[];for(let y=-1;y<=2;y++)for(let x=-1;x<=2;x++){const gx=ix+x,gy=iy+y;nodes.push(tile?tile.data.subarray(((gy-yy*g.cells+1)*tile.side+gx-xx*g.cells+1)*FIELD_COUNT,((gy-yy*g.cells+1)*tile.side+gx-xx*g.cells+2)*FIELD_COUNT):this.getNode(gx,gy));}
  this.stats.samples++;this.stats[tile?'bakedSamples':'proceduralSamples']++;
  // Discontinuous wet/dry, feature and biome decisions are analytical. A
  // filtered mask must not bridge a bank or invent a second lake water level.
  let sharp=false;for(let j=0;j<4;j++)for(let i=1;i<3;i++){if(Math.abs(nodes[j*4+i-1][1]-2*nodes[j*4+i][1]+nodes[j*4+i+1][1])>1.5||Math.abs(nodes[(i-1)*4+j][1]-2*nodes[i*4+j][1]+nodes[(i+1)*4+j][1])>1.5)sharp=true;}
  const corners=[nodes[5],nodes[6],nodes[9],nodes[10]],first=corners[0];
  if(sharp||nodes.some(n=>n[8]!==first[8]||n[5]!==first[5]||n[6]!==first[6]||(n[0]<=n[2])!==(first[0]<=first[2]))){this.stats.hydrologyFallbacks++;return sampleProceduralTerrain(this.world,d,options);}
  const interp=k=>{const r=[];for(let j=0;j<4;j++)r.push(cubic(nodes[j*4][k],nodes[j*4+1][k],nodes[j*4+2][k],nodes[j*4+3][k],tx));return cubic(...r,ty);};
  const linear=k=>mix(mix(nodes[5][k],nodes[6][k],tx),mix(nodes[9][k],nodes[10][k],tx),ty);
  const w=options.micro===false?0:options.microWeight??1,base=interp(0),full=interp(1),height=mix(base,full,w),water=linear(2),biome=w>0?first[6]:first[5];
  const result={elevationMeters:height,waterSurfaceMeters:water,waterDepthMeters:Math.max(0,water-height),temperature:linear(3),moisture:linear(4),biome,protectedFeatureMask:linear(7),featureId:this.manifest.featureIds[first[8]]??null,flow:linear(9),lava:linear(10),albedo:linear(11),snow:mix(linear(12),linear(13),w),snowLineMeters:linear(14),forest:mix(linear(15),linear(16),w)};
  // A collar of the original field makes the finite prototype join the planet.
  const edge=Math.min(p[0]-g.minX,p[1]-g.minY,g.minX+32000-p[0],g.minY+32000-p[1]),blend=smooth(0,g.stepMeters*2,edge);
  if(blend<1){const original=sampleProceduralTerrain(this.world,d,options);for(const k of ['elevationMeters','temperature','moisture','protectedFeatureMask','snow','forest'])result[k]=mix(original[k],result[k],blend);result.waterDepthMeters=Math.max(0,water-result.elevationMeters);}
  return result;
 }
 clear(){this.tiles.clear();this.nodes.clear();this.bytes=0;this.stats.ramBytes=this.stats.nodeBytes=0;}
}
