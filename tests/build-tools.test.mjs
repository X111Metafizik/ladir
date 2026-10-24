import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BUILD_INPUTS} from '../scripts/wasm-build-inputs.mjs';
import {verifyWasmArtifact} from '../scripts/verify-wasm-artifact.mjs';
async function fixture(run){
 const dir=await mkdtemp(path.join(os.tmpdir(),'ladir-build-'));
 try{
  for(const file of [...BUILD_INPUTS,'assets/wasm/terrain-kernel.json','assets/wasm/terrain-kernel.wasm']){
   const dest=path.join(dir,file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(new URL('../'+file,import.meta.url),dest);
  }
  await run(dir,pathToFileURL(dir+path.sep));
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('ladir-build-'));await rm(dir,{recursive:true,force:true});}
}
test('artifact verification accepts a portable copy of the complete committed build recipe',()=>fixture(async(dir,root)=>{
 const meta=await verifyWasmArtifact({root});assert.equal(meta.rust,'1.90.0');assert.equal(meta.bytes,1908);assert.equal(meta.memoryBytes,589824);
}));
test('changed Cargo settings are rejected before a stale WASM artifact can be distributed',()=>fixture(async(dir,root)=>{
 const file=path.join(dir,'wasm/terrain-kernel/Cargo.toml');await writeFile(file,(await readFile(file,'utf8')).replace('opt-level = 3','opt-level = 2'));
 await assert.rejects(verifyWasmArtifact({root}),/Stale WASM artifact or build recipe/);
}));
test('changed linker recipe is rejected even when Rust source is unchanged',()=>fixture(async(dir,root)=>{
 const file=path.join(dir,'scripts/wasm-build-inputs.mjs');await writeFile(file,(await readFile(file,'utf8')).replace('--max-memory=589824','--max-memory=655360'));
 await assert.rejects(verifyWasmArtifact({root}),/Stale WASM artifact or build recipe/);
}));
test('corrupt binary cannot pass the release artifact check',()=>fixture(async(dir,root)=>{
 const file=path.join(dir,'assets/wasm/terrain-kernel.wasm'),data=await readFile(file);data[data.length-1]^=1;await writeFile(file,data);
 await assert.rejects(verifyWasmArtifact({root}),/Stale WASM artifact or build recipe/);
}));
