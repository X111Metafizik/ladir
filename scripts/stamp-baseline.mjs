import {readFile,writeFile} from 'node:fs/promises';
import {deserializePlanet} from '../io/bundle.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {stampBand} from '../core/terrain-stamps.mjs';
const world=await deserializePlanet(await readFile('fixtures/lumen-v34.planet'));
const points=Array.from({length:384},(_,i)=>{const y=1-2*(i+.5)/384,a=i*2.3999632297;return [Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)];});
const t=performance.now(),samples=points.map(d=>({d,height:sampleTerrain(world,d).elevationMeters,bands:[0,1,2].map(b=>stampBand(world,d,b).value)}));
await writeFile('evidence/v35/old-surface.json',JSON.stringify({worldHash:world.manifest.worldDataHash,milliseconds:performance.now()-t,samples}));
console.log('Recorded original V34 surface at',points.length,'global points');

