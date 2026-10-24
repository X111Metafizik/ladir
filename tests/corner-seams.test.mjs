import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deserializePlanet} from '../io/bundle.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {normalize,cross} from '../core/math.mjs';
import {selectPatches,buildPatch} from '../render/terrain-data.mjs';
import {auditMeshSeams} from '../render/seam-audit.mjs';
test('actual quadtree corners weld across three LOD levels with band-limited stamp detail',async()=>{
 const w=await deserializePlanet(await readFile('fixtures/lumen-v32.planet')),d=referenceDirection(w,0,0),scale=1000/w.radiusMeters,north=normalize([0,1,0].map((q,k)=>q-d[k]*d[1])),h=sampleTerrain(w,d).elevationMeters;
 const target=d.map(q=>q*(1000+h*scale)),camera=d.map((q,k)=>target[k]+q*27000*scale*Math.cos(.65)-north[k]*27000*scale*Math.sin(.65)),forward=normalize(target.map((q,k)=>q-camera[k])),right=normalize(cross(forward,north)),up=cross(right,forward),tanY=Math.tan(48*Math.PI/360);
 const patches=selectPatches(w,camera,1,{forward,right,up,tanY,tanX:tanY*1440/892,viewportHeight:1000}).filter(p=>p.face===4&&p.level>=8&&p.level<=12);
 const meshes=patches.map(p=>{const b=buildPatch(w,p);return {userData:{patch:p},geometry:{attributes:{position:{array:b.positions}}},position:{getComponent:k=>b.center[k]}};});
 const seams=auditMeshSeams(meshes,w.radiusMeters);assert.ok(seams.checks>1000);assert.ok(seams.maxGapMeters<.01,JSON.stringify(seams));
});
