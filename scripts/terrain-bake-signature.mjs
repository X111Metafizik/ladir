import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function updateTerrainBakeSignature(){
 const hash=createHash('sha256');
 for(const path of ['render/terrain-data.mjs','render/water-clip.mjs','render/terrain-budget.mjs','io/regional-field.mjs','io/regional-format.mjs','io/regional-catalog.mjs']){hash.update(path);hash.update(await readFile(path));}
 const value=hash.digest('hex'),source="export const TERRAIN_GEOMETRY_HASH='"+value+"';\n";
 await writeFile('io/terrain-bake-build.mjs',source);return value;
}
