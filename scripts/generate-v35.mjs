import {generatePlanet,DEFAULT_APPEARANCE} from '../core/world.mjs';
import {serializePlanet} from '../io/bundle.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const started=performance.now(),world=await generatePlanet({}, {onProgress:p=>console.log(p.label)});
await writeFile('fixtures/lumen-v35.planet',new Uint8Array(serializePlanet(world,DEFAULT_APPEARANCE)));
await mkdir('evidence/v35',{recursive:true});await writeFile('evidence/v35/world.json',JSON.stringify({hash:world.manifest.worldDataHash,radiusMeters:world.radiusMeters,model:world.generationConfig.stampModel,validation:world.generationReport,milliseconds:performance.now()-started},null,2));
console.log(world.manifest.worldDataHash);
