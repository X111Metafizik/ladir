import {readFile,writeFile} from 'node:fs/promises';
import {deserializePlanet} from '../io/bundle.mjs';
import {buildPatch} from '../render/terrain-data.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {directionFace} from '../core/cube.mjs';
import {setStampMemo,stampBand,stampDiagnostics} from '../core/terrain-stamps.mjs';
import {packTerrainPatch,unpackTerrainPatch,coarseBakePatch} from '../io/terrain-bake-codec.mjs';
const w=await deserializePlanet(await readFile('fixtures/lumen-v35.planet')),stats=a=>{a.sort((x,y)=>x-y);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
const result={worldHash:w.manifest.worldDataHash,scope:'CPU build and binary decode only; not GPU or presentation FPS',routes:[]};
const sites=w.landmarks.filter(p=>/^stamp-[0-3]$/.test(p.id));
for(const site of sites){
 const [face,u,v]=directionFace(site.direction),level=15,size=2/2**level,tx=Math.floor((u+1)/size),ty=Math.floor((v+1)/size),sample=createSampleCache((d,o)=>sampleTerrain(w,d,o),80000),build=[],decode=[],encoded=[];let bytes=0;
 for(let j=-2;j<2;j++)for(let i=-2;i<2;i++){const x=tx+i,y=ty+j,p={...coarseBakePatch(face,0,0),level,x,y,u:x*size-1,v:y*size-1,size,resolution:32,stitchResolution:[32,32,32,32],key:face+'/'+level+'/'+x+'/'+y};const t=performance.now(),patch=buildPatch(w,p,'natural',sample);build.push(performance.now()-t);const buffer=packTerrainPatch(patch);encoded.push({p,buffer});bytes+=buffer.byteLength;}
 for(let repeat=0;repeat<3;repeat++)for(const {p,buffer} of encoded){const t=performance.now();unpackTerrainPatch(buffer,p);decode.push(performance.now()-t);}
 result.routes.push({id:site.id,direction:site.direction,level,resolution:32,nominalMetersPerCell:size*w.radiusMeters/32,tiles:encoded.length,bytes,buildMs:stats(build),decodeMs:stats(decode),sample:sample.stats()});
}
const directions=Array.from({length:1000},(_,i)=>{const y=1-2*(i+.5)/1000,a=i*2.3999632297;return [Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)];});
for(const enabled of [false,true]){setStampMemo(w,enabled);const t=performance.now();for(let round=0;round<10;round++)for(const d of directions)for(let band=0;band<3;band++)stampBand(w,d,band);result[enabled?'memoMs':'rawMs']=performance.now()-t;}
result.stamps=stampDiagnostics(w);await writeFile('evidence/v35/cpu-benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
