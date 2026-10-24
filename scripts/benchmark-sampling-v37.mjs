import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {deserializePlanet} from '../io/bundle.mjs';
import {REGIONAL_CATALOG} from '../io/regional-catalog.mjs';
import {RegionField} from '../io/regional-field.mjs';
import {RegionField as PreviousField} from '../evidence/v37/regional-field-v36.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {unpackRegionTile} from '../io/regional-format.mjs';
const w=await deserializePlanet(await readFile('fixtures/lumen-v35.planet')),c=REGIONAL_CATALOG[w.manifest.worldDataHash],t=c.manifest.tiles.find(t=>t.key==='3/3'),raw=gunzipSync(await readFile(c.base+t.file)),tile=unpackRegionTile(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),t,c.manifest.grid);
const before=new PreviousField(w,c.manifest),after=new RegionField(w,c.manifest);before.install(tile);after.install(tile);
const points=Array.from({length:12000},(_,i)=>referenceDirection(w,-9900+(i*71%1500),-9900+(i*53%1500))),result={worldHash:w.manifest.worldDataHash,queries:points.length,before:[],after:[],equal:true};
for(let i=0;i<300;i++)if(JSON.stringify(before.sample(points[i]))!==JSON.stringify(after.sample(points[i])))throw Error('Changed canonical terrain');
for(let repeat=0;repeat<5;repeat++)for(const [name,field]of repeat%2?[['after',after],['before',before]]:[['before',before],['after',after]]){const start=performance.now();let checksum=0;for(const d of points)checksum+=field.sample(d).elevationMeters;result[name].push({ms:performance.now()-start,checksum});}
result.stencilTypedArrayViewsPerQuery={before:16,after:0};await writeFile('evidence/v37/sampling.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
