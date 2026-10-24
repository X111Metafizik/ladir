import {generatePlanet,DEFAULT_CONFIG} from '../core/world.mjs';
import {serializePlanet} from '../io/bundle.mjs';
import {writeFile} from 'node:fs/promises';
const start=performance.now(),world=await generatePlanet(DEFAULT_CONFIG);
if(world.radiusMeters!==4_000_000||!world.landforms)throw Error('V34 world identity mismatch');
await writeFile('fixtures/lumen-v34.planet',new Uint8Array(serializePlanet(world)));
console.log(JSON.stringify({milliseconds:performance.now()-start,manifest:world.manifest,report:world.generationReport},null,2));
