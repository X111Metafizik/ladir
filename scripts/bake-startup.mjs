// Exact mesh packages for the saved opening views. Other seeds/cameras/LOD
// boundaries keep using on-demand generation and the bounded persistent cache.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {PerspectiveCamera,Vector3} from 'three/webgpu';
import {PlanetCamera} from '../render/camera.mjs';
import {deserializePlanet} from '../io/bundle.mjs';
import {initRegional} from '../io/regional-runtime.mjs';
import {unpackRegionTile} from '../io/regional-format.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {buildPatch,selectPatches} from '../render/terrain-data.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {sha256} from '../core/math.mjs';
import {updateTerrainBakeSignature} from './terrain-bake-signature.mjs';
await updateTerrainBakeSignature();
const {terrainBakeKey,coarseBakePatch,packTerrainPatch,TERRAIN_BAKE_VERSION}=await import('../io/terrain-bake-codec.mjs');
const world=await deserializePlanet(await readFile(process.argv[2]??'fixtures/lumen-v35.planet'));
const regional=initRegional(world,{mode:'procedural'});
if(!regional)throw Error('A validated regional surface profile is required');
// Offline only: resident source tiles speed the bake but never change its
// canonical reconstruction. Runtime remains at its existing RAM limit.
regional.field.maxBytes=128*1024*1024;
for(const tile of regional.catalog.manifest.tiles){const raw=gunzipSync(await readFile(regional.catalog.base+tile.file));regional.field.install(unpackRegionTile(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),tile,regional.catalog.manifest.grid));}
const hash=world.manifest.worldDataHash,profile=regional.catalog.manifest.id,dir='assets/terrain-bakes/'+hash;
const key=p=>terrainBakeKey(world,p)+'/profile/'+profile,patches=new Map(),views=[];
for(let f=0;f<6;f++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){const p=coarseBakePatch(f,x,y);patches.set(key(p),p);}
// Use the production camera math with inert input targets, not a second copy
// of the orbit/height/FOV formula. This is a command-line process only.
globalThis.window=new EventTarget();
const canvas=Object.assign(new EventTarget(),{clientWidth:1440,clientHeight:1000});
for(const id of ['orbit','reference']){
 const camera=new PerspectiveCamera(48,1440/892,.008,15000),controls=new PlanetCamera(canvas,camera,world),origin=new Vector3();
 const feature=world.landmarks.find(f=>f.id===id);
 if(feature){controls.setMode('region',feature.direction);controls.tilt=feature.tilt;controls.setRangeMeters(feature.rangeMeters);}
 controls.update(0,origin);
 const tanY=Math.tan(camera.fov*Math.PI/360),view={viewportHeight:1000,forward:camera.getWorldDirection(new Vector3()).toArray(),right:new Vector3().setFromMatrixColumn(camera.matrixWorld,0).toArray(),up:new Vector3().setFromMatrixColumn(camera.matrixWorld,1).toArray(),tanY,tanX:tanY*camera.aspect};
 for(const preview of [true,false]){const selected=selectPatches(world,controls.absolute.toArray(),1,view,{maxLevel:preview?15:30,resolution:preview?8:undefined});for(const p of selected)patches.set(key(p),p);views.push({id,preview,camera:controls.absolute.toArray(),view,patches:selected.length});}
 controls.dispose();
}
await mkdir(dir,{recursive:true});
const catalog={version:TERRAIN_BAKE_VERSION,radiusMeters:world.radiusMeters,profile,packs:[]},sample=createSampleCache((d,o)=>sampleTerrain(world,d,o),80000),start=performance.now();
let chunks=[],entries={},bytes=0,totalRaw=0,totalDisk=0,completed=0;
async function flush(){if(!bytes)return;const raw=Buffer.concat(chunks),packed=gzipSync(raw,{level:6}),digest=await sha256(packed),file='startup-'+digest.slice(0,20)+'.bin.gz';await writeFile(dir+'/'+file,packed);catalog.packs.push({file,encoding:'gzip',bytes:packed.length,rawBytes:raw.length,sha256:digest,entries});totalRaw+=raw.length;totalDisk+=packed.length;chunks=[];entries={};bytes=0;}
for(const [id,p]of [...patches].sort((a,b)=>(a[1].priority??1e9)-(b[1].priority??1e9))){
 const packed=Buffer.from(packTerrainPatch(buildPatch(world,p,'natural',sample)));
 if(bytes+packed.length>2*1024*1024)await flush();entries[id]=[bytes,packed.length];chunks.push(packed);bytes+=packed.length;
 if(++completed%500===0)console.log(`Baked ${completed}/${patches.size} exact patches`);
}
await flush();regional.dispose();
const report={worldHash:hash,profile,version:TERRAIN_BAKE_VERSION,radiusMeters:world.radiusMeters,views,patches:patches.size,packs:catalog.packs.length,diskBytes:totalDisk,rawBytes:totalRaw,buildMs:performance.now()-start};
const indexBytes=Buffer.from(JSON.stringify(catalog)),indexHash=await sha256(indexBytes),indexFile='startup-index-'+indexHash.slice(0,20)+'.json';
await writeFile(dir+'/'+indexFile,indexBytes);
const descriptor={version:catalog.version,radiusMeters:world.radiusMeters,profile,index:{file:indexFile,sha256:indexHash,bytes:indexBytes.length}};
await writeFile('io/startup-bakes.mjs','// Generated by npm run bake:startup. Large indices load only in matching patch workers.\nexport const STARTUP_BAKES='+JSON.stringify({[hash]:{[profile]:descriptor}})+';\n');
await writeFile(dir+'/startup-manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
