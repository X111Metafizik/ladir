import {stableStringify} from '../core/math.mjs';
import {TERRAIN_GEOMETRY_HASH} from './terrain-bake-build.mjs';
export const TERRAIN_BAKE_VERSION='atlas-terrain-35.1/'+TERRAIN_GEOMETRY_HASH;
export const BAKE_FIELDS={positions:Float32Array,normals:Float32Array,colors:Float32Array,surface:Float32Array,climate:Float32Array,indices:Uint16Array,waterPositions:Float32Array,waterNormals:Float32Array,shallows:Float32Array,waterIndices:Uint32Array};
const encoder=new TextEncoder(),decoder=new TextDecoder();
// Include actual geometry inputs, not just a display tile name or priority.
// Any change to generation, radius, material layer, knots or seams invalidates.
export function terrainBakeKey(world,p,layer='natural'){
 return TERRAIN_BAKE_VERSION+'/'+world.manifest.worldDataHash+'/'+world.radiusMeters+'/'+stableStringify({face:p.face,level:p.level,x:p.x,y:p.y,u:p.u,v:p.v,size:p.size,resolution:p.resolution??16,stitch:p.stitch??[0,0,0,0],stitchResolution:p.stitchResolution??Array(4).fill(p.resolution??16),boundaryBands:p.boundaryBands??{},layer});
}
export function coarseBakePatch(face,x,y){const level=3,N=8,size=.25;return {face,level,x,y,u:x*size-1,v:y*size-1,size,resolution:N,stitch:[0,0,0,0],stitchResolution:[N,N,N,N],boundaryBands:{},key:face+'/3/'+x+'/'+y+'/s0.0.0.0/r8/n8.8.8.8/b'};}
export function packTerrainPatch(p){
 const descriptors=Object.entries(BAKE_FIELDS).map(([name,Type])=>{if(!(p[name] instanceof Type))throw Error('Invalid bake channel '+name);return [name,p[name].length];});
 const meta=encoder.encode(JSON.stringify({descriptors,center:p.center,bounds:p.bounds,waterBounds:p.waterBounds})),start=(16+meta.length+7)&~7;
 const buffer=new ArrayBuffer(start+descriptors.reduce((n,[name])=>n+((p[name].byteLength+7)&~7),0)),view=new DataView(buffer),out=new Uint8Array(buffer);
 view.setUint32(0,0x41544235,true);view.setUint32(4,meta.length,true);view.setUint32(8,start,true);out.set(meta,16);
 let offset=start;for(const [name] of descriptors){const a=p[name];out.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),offset);offset+=(a.byteLength+7)&~7;}
 return buffer;
}
export function unpackTerrainPatch(buffer,p,layer='natural'){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<16||buffer.byteLength>8*1024*1024)throw Error('Invalid terrain bake');
 const v=new DataView(buffer),length=v.getUint32(4,true),start=v.getUint32(8,true);
 if(v.getUint32(0,true)!==0x41544235||start%8||length>start-16||start>buffer.byteLength)throw Error('Invalid bake header');
 const meta=JSON.parse(decoder.decode(new Uint8Array(buffer,16,length))),out={center:meta.center,bounds:meta.bounds,waterBounds:meta.waterBounds,patch:p,key:p.key+'/'+layer};
 if(!Array.isArray(meta.descriptors)||meta.descriptors.length!==Object.keys(BAKE_FIELDS).length||!Array.isArray(out.center)||out.center.length!==3||!out.center.every(Number.isFinite))throw Error('Invalid bake metadata');
 let offset=start;for(let i=0;i<meta.descriptors.length;i++){const [name,n]=meta.descriptors[i],Type=BAKE_FIELDS[name];if(name!==Object.keys(BAKE_FIELDS)[i]||!Type||!Number.isInteger(n)||n<0||offset+n*Type.BYTES_PER_ELEMENT>buffer.byteLength)throw Error('Invalid bake array');out[name]=new Type(buffer,offset,n).slice();offset+=(n*Type.BYTES_PER_ELEMENT+7)&~7;}
 if(offset!==buffer.byteLength||out.positions.length!==out.normals.length||out.positions.length!==out.colors.length||out.surface.length*3!==out.positions.length*4||out.climate.length*3!==out.positions.length*2||out.waterPositions.length!==out.waterNormals.length||out.shallows.length*3!==out.waterPositions.length)throw Error('Invalid bake layout');
 return out;
}
// Fast accidental-corruption check; content-addressed static packs use SHA-256.
export function bakeChecksum(buffer){const a=new Uint8Array(buffer);let h=2166136261;for(let i=0;i<a.length;i++)h=Math.imul(h^a[i],16777619);return h>>>0;}
