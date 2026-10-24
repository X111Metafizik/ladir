import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {deserializePlanet} from '../io/bundle.mjs';
import {buildPatch} from '../render/terrain-data.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {sha256} from '../core/math.mjs';
import {updateTerrainBakeSignature} from './terrain-bake-signature.mjs';
// Bake with the current source signature even when invoked before npm run build.
await updateTerrainBakeSignature();
const {coarseBakePatch,packTerrainPatch,terrainBakeKey,TERRAIN_BAKE_VERSION}=await import('../io/terrain-bake-codec.mjs');
const path=process.argv[2]??'fixtures/lumen-v35.planet',world=await deserializePlanet(await readFile(path));
const hash=world.manifest.worldDataHash,dir='assets/terrain-bakes/'+hash,started=performance.now(),sample=createSampleCache((d,o)=>sampleTerrain(world,d,o),80000),catalog={version:TERRAIN_BAKE_VERSION,radiusMeters:world.radiusMeters,faces:[]};
await mkdir(dir,{recursive:true});
let total=0;
for(let face=0;face<6;face++){
 const entries={},chunks=[];let offset=0;
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){const p=coarseBakePatch(face,x,y),bytes=new Uint8Array(packTerrainPatch(buildPatch(world,p,'natural',sample)));entries[terrainBakeKey(world,p)]=[offset,bytes.length];chunks.push(bytes);offset+=bytes.length;}
 const packed=new Uint8Array(offset);let at=0;for(const chunk of chunks){packed.set(chunk,at);at+=chunk.length;}
 const file='face-'+face+'-'+(await sha256(packed)).slice(0,16)+'.bin';await writeFile(dir+'/'+file,packed);catalog.faces.push({file,bytes:packed.length,sha256:await sha256(packed),entries});total+=packed.length;console.log('Baked face',face,'64 tiles',packed.length,'bytes');
}
const report={worldHash:hash,version:TERRAIN_BAKE_VERSION,faces:6,tiles:384,level:3,wholeGlobe:true,nearDetail:'Generated at original LOD quality and persisted on demand',bytes:total,milliseconds:performance.now()-started,samples:sample.stats()};
await writeFile('io/baked-worlds.mjs','// Generated offline. SHA-256 verified face packs; exact geometry input keys.\nexport const BAKED_WORLDS='+JSON.stringify({[hash]:catalog})+';\n');
await writeFile(dir+'/manifest.json',JSON.stringify({report,catalog},null,2));
const evidence=process.env.BAKE_EVIDENCE??'evidence/terrain-bake';await mkdir(evidence,{recursive:true});await writeFile(evidence+'/global-bake.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
