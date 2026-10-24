import {sha256,stableStringify} from '../core/math.mjs';
export const REGION_FORMAT='atlas-region-1',FIELD_VERSION='canonical-cubic-1';
export const FIELD_COUNT=20,HALO=1;
export const CHANNELS=['baseHeight','finalHeight','waterLevel','temperature','moisture','baseBiome','finalBiome','protectedMask','feature','flow','lava','albedo','baseSnow','finalSnow','snowLine','baseForest','finalForest','normalX','normalY','normalZ'];
export function regionIdentity(world){return {worldHash:world.manifest.worldDataHash,seed:world.manifest.normalizedSeed,generatorVersion:world.manifest.generatorVersion,generatorBuildHash:world.manifest.generatorBuildHash,radiusMeters:world.radiusMeters};}
export function validateRegion(manifest,world){
 if(manifest.format!==REGION_FORMAT||manifest.fieldVersion!==FIELD_VERSION)throw Error('Region format/version mismatch');
 for(const [k,v]of Object.entries(regionIdentity(world)))if(manifest.identity[k]!==v)throw Error('Region identity mismatch: '+k);
 const g=manifest.grid;
 if(!Number.isInteger(g.cells)||g.cells<8||g.cells>256||g.tilesX!==16||g.tilesY!==16||g.tileMeters!==2000||g.stepMeters!==g.tileMeters/g.cells)throw Error('Invalid regional grid');
 if(manifest.channels.join('/')!==CHANNELS.join('/'))throw Error('Region channels mismatch');
 if(manifest.tiles.length!==g.tilesX*g.tilesY)throw Error('Missing tile index');
 return true;
}
export function packRegionTile(x,y,cells,values){
 const side=cells+3,expected=side*side*FIELD_COUNT;if(values.length!==expected)throw Error('Invalid region tile samples');
 const out=new ArrayBuffer(32+values.byteLength),v=new DataView(out);
 new Uint8Array(out,0,8).set(new TextEncoder().encode('ATREG001'));v.setUint32(8,x,true);v.setUint32(12,y,true);v.setUint32(16,cells,true);v.setUint32(20,FIELD_COUNT,true);v.setUint32(24,side,true);
 new Float32Array(out,32).set(values);return out;
}
export function unpackRegionTile(buffer,tile,grid){
 if(buffer.byteLength!==32+(grid.cells+3)**2*FIELD_COUNT*4)throw Error('Region tile byte length');
 const v=new DataView(buffer);if(new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='ATREG001'||v.getUint32(8,true)!==tile.x||v.getUint32(12,true)!==tile.y||v.getUint32(16,true)!==grid.cells||v.getUint32(20,true)!==FIELD_COUNT||v.getUint32(24,true)!==grid.cells+3)throw Error('Region tile header');
 const data=new Float32Array(buffer,32);for(let i=0;i<data.length;i++)if(!Number.isFinite(data[i]))throw Error('Nonfinite region sample');
 return {x:tile.x,y:tile.y,side:grid.cells+3,data,bytes:buffer.byteLength};
}
export const manifestDigest=manifest=>sha256(new TextEncoder().encode(stableStringify(JSON.parse(JSON.stringify(manifest)))));
