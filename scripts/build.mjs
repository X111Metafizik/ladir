import {build} from 'esbuild';
import {updateTerrainBakeSignature} from './terrain-bake-signature.mjs';
await updateTerrainBakeSignature();
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
await mkdir('dist/studio',{recursive:true});await mkdir('dist/workers',{recursive:true});
await build({entryPoints:['studio/main.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/studio/main.mjs',minify:true,sourcemap:true});
await build({entryPoints:['workers/generator.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/workers/generator.mjs',minify:true});
await build({entryPoints:['workers/lod.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/workers/lod.mjs',minify:true});
await build({entryPoints:['workers/patches.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/workers/patches.mjs',minify:true});
await build({entryPoints:['workers/regions.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/workers/regions.mjs',minify:true});
const html=(await readFile('index.html','utf8')).replace(/<script type="importmap">[\s\S]*?<\/script>/,'');
await writeFile('dist/index.html',html);await cp('studio/style.css','dist/studio/style.css');await cp('node_modules/three/LICENSE','dist/THREE-LICENSE.txt');
await cp('assets','dist/assets',{recursive:true});
await cp('docs','dist/docs',{recursive:true});
await cp('studio/flight.css','dist/studio/flight.css');
await cp('fixtures','dist/fixtures',{recursive:true});
console.log('Bağımsız dağıtım dist/ dizinine oluşturuldu.');

await build({entryPoints:['studio/reference.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/studio/reference.mjs',minify:true,sourcemap:true});
await writeFile('dist/reference.html',(await readFile('reference.html','utf8')).replace(/<script type="importmap">[\s\S]*?<\/script>/,''));

await build({entryPoints:['workers/reference.mjs'],bundle:true,format:'esm',target:'es2022',outfile:'dist/workers/reference.mjs',minify:true});
