import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {deserializePlanet} from '../io/bundle.mjs';
import {REGIONAL_CATALOG} from '../io/regional-catalog.mjs';
import {unpackRegionTile,FIELD_COUNT,manifestDigest,validateRegion} from '../io/regional-format.mjs';
import {RegionField} from '../io/regional-field.mjs';
import {referenceDirection,referenceCoordinates} from '../core/landforms.mjs';
import {sampleProceduralTerrain} from '../core/terrain.mjs';
import {sha256} from '../core/math.mjs';
const w=await deserializePlanet(await readFile('fixtures/lumen-v35.planet')),catalog=REGIONAL_CATALOG[w.manifest.worldDataHash],m=catalog.manifest,field=new RegionField(w,m),procedural=new RegionField(w,m),errors=[],samples=process.argv.includes('--quick')?8:40;
validateRegion(m,w);let edgeChecks=0,exactChecks=0;const previousRow=new Map();let left;
for(const t of m.tiles){
 const compressed=await readFile(catalog.base+t.file);assert.equal(await sha256(compressed),t.sha256);
 const raw=gunzipSync(compressed),buf=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);assert.equal(await sha256(buf),t.rawSha256);
 const tile=unpackRegionTile(buf,t,m.grid);field.install(tile);const N=m.grid.cells,S=N+3,C=FIELD_COUNT,at=(a,x,y)=>a.data.subarray((y*S+x)*C,(y*S+x+1)*C);
 if(t.x>0)for(let j=0;j<S;j++){assert.deepEqual(at(left,N+1,j),at(tile,1,j));edgeChecks++;}
 if(t.y>0){const up=previousRow.get(t.x);for(let i=0;i<S;i++){assert.deepEqual(at(up,i,N+1),at(tile,i,1));edgeChecks++;}}
 previousRow.set(t.x,tile);left=tile;
 for(let k=0;k<samples;k++){
  const x=-16000+(t.x+((k*37+19)%101)/101)*2000,y=-16000+(t.y+((k*43+23)%103)/103)*2000,d=referenceDirection(w,x,y),s=field.sample(d),original=sampleProceduralTerrain(w,d);
  errors.push(Math.abs(s.elevationMeters-original.elevationMeters));
  if(k<3){for(const options of [{micro:false},{microWeight:.4},{}]){assert.deepEqual(field.sample(d,options),procedural.sample(d,options));exactChecks++;}}
 }
}
let hydroChecks=0;for(const r of w.hydrology.rivers.filter(r=>r.regional))for(const p of r.points){const a=field.sample(p.direction),b=procedural.sample(p.direction);assert.deepEqual(a,b);assert.ok(a.elevationMeters<a.waterSurfaceMeters+.1);hydroChecks++;}
errors.sort((a,b)=>a-b);const error={samples:errors.length,p50:errors[Math.floor(errors.length*.5)],p95:errors[Math.floor(errors.length*.95)],p99:errors[Math.floor(errors.length*.99)],max:errors.at(-1)};
const inside=d=>{const [x,y,z]=referenceCoordinates(w,d);return z>.9&&Math.abs(x)<18500&&Math.abs(y)<18500;};
const hydro={rivers:w.hydrology.rivers.filter(r=>r.points.some(p=>inside(p.direction))),lakes:w.hydrology.lakes.filter(l=>inside(l.direction)),boundaryRecipients:[],analysis:{note:'Existing coarse planet drainage graph samples only; no dense regional hydrology was generated.',nodes:[]}};
for(const r of hydro.rivers)if(!hydro.rivers.some(v=>v.id===r.recipientId)&&!hydro.lakes.some(v=>v.id===r.recipientId))hydro.boundaryRecipients.push({from:r.id,to:r.recipientId});
for(let i=0;i<w.buffers.directions.length/3;i++){const d=Array.from(w.buffers.directions.subarray(i*3,i*3+3));if(inside(d))hydro.analysis.nodes.push({node:i,direction:d,basin:w.buffers.basin?.[i],downstream:w.buffers.downstream?.[i],accumulation:w.buffers.accumulation?.[i]});}
const bytes=new TextEncoder().encode(JSON.stringify(hydro));await writeFile(catalog.base+'hydrology.json',bytes);
m.hydrology.bytes=bytes.byteLength;m.hydrology.sha256=await sha256(bytes);m.hydrology.boundaryRecipients=hydro.boundaryRecipients;
m.validation={...m.validation,samples:errors.length,heightErrorMeters:{p50:error.p50,p95:error.p95,p99:error.p99,max:error.max},edgeChecks,canonicalEqualityChecks:exactChecks,hydrologyChecks:hydroChecks,sharpFeatures:'Original generator retained where the 4x4 height stencil has >1.5 m second difference.'};
m.disk.downloadBytes=m.tiles.reduce((n,t)=>n+t.bytes,0)+bytes.byteLength;
catalog.manifestSha256=await manifestDigest(m);await writeFile(catalog.base+'manifest.json',JSON.stringify(m,null,2));
await writeFile('io/regional-catalog.mjs','// Generated regional package, validated shared edges and source identity.\nexport const REGIONAL_CATALOG='+JSON.stringify({[w.manifest.worldDataHash]:catalog})+';\n');
await writeFile('evidence/v36/region-validation.json',JSON.stringify({error,edgeChecks,exactChecks,hydroChecks,limits:field.stats,hydrologyBytes:bytes.byteLength,sourceWorldHash:w.manifest.worldDataHash},null,2));
console.log(JSON.stringify({error,edgeChecks,exactChecks,hydroChecks,hydrologyBytes:bytes.byteLength}));
