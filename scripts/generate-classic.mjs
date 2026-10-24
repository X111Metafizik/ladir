import {generatePlanet,DEFAULT_CONFIG} from '../core/world.mjs';
import {serializePlanet} from '../io/bundle.mjs';
import {writeFile} from 'node:fs/promises';
const start=performance.now(),world=await generatePlanet({...DEFAULT_CONFIG,radiusMeters:6_000_000,terrainModel:'legacy-1.6'});
if(world.radiusMeters!==6_000_000||world.landforms||world.generationConfig.terrainModel!=='legacy-1.6')throw Error('Classic 12000 km world configuration mismatch');
await writeFile('fixtures/classic-current.planet',new Uint8Array(serializePlanet(world)));
console.log(JSON.stringify({milliseconds:performance.now()-start,manifest:world.manifest,report:world.generationReport},null,2));
