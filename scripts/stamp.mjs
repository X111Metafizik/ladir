import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {updateTerrainBakeSignature} from './terrain-bake-signature.mjs';
await updateTerrainBakeSignature();
const hash=createHash('sha256');
for(const name of (await readdir('core')).filter(n=>n.endsWith('.mjs')&&n!=='build-id.mjs').sort()){
  hash.update(name);hash.update(await readFile(`core/${name}`));
}
const buildHash=hash.digest('hex');await writeFile('core/build-id.mjs',`export const GENERATOR_BUILD_HASH='${buildHash}';\n`);
console.log('Core build SHA-256:',buildHash);
