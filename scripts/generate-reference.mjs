import {generatePlanet} from '../core/world.mjs';
import {serializePlanet} from '../io/bundle.mjs';
import {writeFile} from 'node:fs/promises';
const start=performance.now(),world=await generatePlanet({seed:'LUMEN-742',radiusMeters:4_000_000,terrainModel:'watershed-2'});
await writeFile('fixtures/lumen-v32.planet',new Uint8Array(serializePlanet(world)));
console.log(JSON.stringify({milliseconds:performance.now()-start,manifest:world.manifest,report:world.generationReport},null,2));
