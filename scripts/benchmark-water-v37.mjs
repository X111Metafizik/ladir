import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {deserializePlanet} from '../io/bundle.mjs';
import {buildPatch} from '../render/terrain-data.mjs';
import {buildPatch as previousPatch} from '../evidence/v37/terrain-data-v36.mjs';
import {createSampleCache} from '../render/stream-plan.mjs';
import {sampleTerrain,lakeShoreRadius} from '../core/terrain.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {directionFace} from '../core/cube.mjs';
const w=await deserializePlanet(await readFile('fixtures/lumen-v35.planet')),lake=w.hydrology.lakes.find(l=>l.regional),sample=createSampleCache((d,o)=>sampleTerrain(w,d,o),100000),report={worldHash:w.manifest.worldDataHash,terrainEqual:true,cases:[]};
const seen=new Set();
for(let i=0;i<40;i++){
 const angle=i/40*Math.PI*2,r=lakeShoreRadius(w,lake,angle),d=referenceDirection(w,800+Math.cos(angle)*r,-3500+Math.sin(angle)*r),[face,u,v]=directionFace(d),level=14,n=2**level,x=Math.floor((u+1)*n/2),y=Math.floor((v+1)*n/2),size=2/n,p={face,level,x,y,u:x*size-1,v:y*size-1,size,resolution:16,key:`${face}/${level}/${x}/${y}`};
 if(seen.has(p.key))continue;seen.add(p.key);const before=previousPatch(w,p,'natural',sample),after=buildPatch(w,p,'natural',sample);assert.deepEqual(before.positions,after.positions);assert.deepEqual(before.normals,after.normals);
 const bytes=p=>p.waterPositions.byteLength+p.waterNormals.byteLength+p.shallows.byteLength+p.waterIndices.byteLength;
 report.cases.push({key:p.key,before:{vertices:before.waterPositions.length/3,triangles:before.waterIndices.length/3,bytes:bytes(before)},after:{vertices:after.waterPositions.length/3,triangles:after.waterIndices.length/3,bytes:bytes(after)}});
}
for(const mode of ['before','after'])report[mode]=report.cases.reduce((a,p)=>({vertices:a.vertices+p[mode].vertices,triangles:a.triangles+p[mode].triangles,bytes:a.bytes+p[mode].bytes}),{vertices:0,triangles:0,bytes:0});
await writeFile('evidence/v37/water.json',JSON.stringify(report,null,2));console.log(JSON.stringify({patches:report.cases.length,before:report.before,after:report.after,terrainEqual:report.terrainEqual}));
