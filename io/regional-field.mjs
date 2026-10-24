import {sampleProceduralTerrain} from '../core/terrain.mjs';
import {referenceDirection,referenceCoordinates} from '../core/landforms.mjs';
import {smooth,mix} from '../core/math.mjs';
import {FIELD_COUNT} from './regional-format.mjs';
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
  this.world=world;this.manifest=manifest;this.maxBytes=maxBytes;this.nodeLimit=Math.floor(nodeBytes/FIELD_COUNT/4);this.tiles=new Map();this.nodes=new Map();this.bytes=0;this.sampleNodes=new Array(16);this.sampleOffsets=new Uint32Array(16);
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
  // Reuse the 4x4 stencil. Creating sixteen typed-array views and temporary
  // interpolation rows per query put allocation pressure on every consumer.
  // Sampling is synchronous; analytical fallback does not recurse into this field.
  const nodes=this.sampleNodes,offsets=this.sampleOffsets,data=tile?.data;
  for(let y=-1,i=0;y<=2;y++)for(let x=-1;x<=2;x++,i++){
   const gx=ix+x,gy=iy+y;
   if(data)offsets[i]=((gy-yy*g.cells+1)*tile.side+gx-xx*g.cells+1)*FIELD_COUNT;
   else nodes[i]=this.getNode(gx,gy);
  }
  const at=(i,k)=>data?data[offsets[i]+k]:nodes[i][k];
  this.stats.samples++;this.stats[tile?'bakedSamples':'proceduralSamples']++;
  let sharp=false;
  for(let j=0;j<4;j++)for(let i=1;i<3;i++){
   if(Math.abs(at(j*4+i-1,1)-2*at(j*4+i,1)+at(j*4+i+1,1))>1.5||Math.abs(at((i-1)*4+j,1)-2*at(i*4+j,1)+at((i+1)*4+j,1))>1.5)sharp=true;
  }
  const firstFeature=at(5,8),firstBaseBiome=at(5,5),firstBiome=at(5,6),firstWet=at(5,0)<=at(5,2);
  for(let i=0;i<16&&!sharp;i++)if(at(i,8)!==firstFeature||at(i,5)!==firstBaseBiome||at(i,6)!==firstBiome||(at(i,0)<=at(i,2))!==firstWet)sharp=true;
  if(sharp){this.stats.hydrologyFallbacks++;return sampleProceduralTerrain(this.world,d,options);}
  const interp=k=>cubic(cubic(at(0,k),at(1,k),at(2,k),at(3,k),tx),cubic(at(4,k),at(5,k),at(6,k),at(7,k),tx),cubic(at(8,k),at(9,k),at(10,k),at(11,k),tx),cubic(at(12,k),at(13,k),at(14,k),at(15,k),tx),ty);
  const linear=k=>mix(mix(at(5,k),at(6,k),tx),mix(at(9,k),at(10,k),tx),ty);
  const w=options.micro===false?0:options.microWeight??1,base=interp(0),full=interp(1),height=mix(base,full,w),water=linear(2),biome=w>0?firstBiome:firstBaseBiome;
  const result={elevationMeters:height,waterSurfaceMeters:water,waterDepthMeters:Math.max(0,water-height),temperature:linear(3),moisture:linear(4),biome,protectedFeatureMask:linear(7),featureId:this.manifest.featureIds[firstFeature]??null,flow:linear(9),lava:linear(10),albedo:linear(11),snow:mix(linear(12),linear(13),w),snowLineMeters:linear(14),forest:mix(linear(15),linear(16),w)};
  // A collar of the original field makes the finite prototype join the planet.
  const edge=Math.min(p[0]-g.minX,p[1]-g.minY,g.minX+32000-p[0],g.minY+32000-p[1]),blend=smooth(0,g.stepMeters*2,edge);
  if(blend<1){const original=sampleProceduralTerrain(this.world,d,options);for(const k of ['elevationMeters','temperature','moisture','protectedFeatureMask','snow','forest'])result[k]=mix(original[k],result[k],blend);result.waterDepthMeters=Math.max(0,water-result.elevationMeters);}
  return result;
 }
 clear(){this.sampleNodes.fill(null);this.tiles.clear();this.nodes.clear();this.bytes=0;this.stats.ramBytes=this.stats.nodeBytes=0;}
}
