import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {RUST_VERSION,WASM_FLAGS,sha256,wasmBuildIdentity} from './wasm-build-inputs.mjs';
const root=path.resolve('wasm/terrain-kernel'),check=process.argv.includes('--check');
const env={...process.env,RUSTUP_TOOLCHAIN:RUST_VERSION,RUSTFLAGS:WASM_FLAGS,CARGO_TARGET_DIR:path.join(root,'target')};
const version=spawnSync(process.env.RUSTC||'rustc',['--version'],{cwd:root,env,encoding:'utf8',windowsHide:true});
if(version.error)throw version.error;
if(version.status!==0||!version.stdout.startsWith(`rustc ${RUST_VERSION} `))throw Error(`Rust ${RUST_VERSION} is required; got ${version.stdout||version.stderr}`);
const args=['build','--manifest-path',path.join(root,'Cargo.toml'),'--target','wasm32-unknown-unknown','--release','--locked','--offline'];
const run=spawnSync(process.env.CARGO||'cargo',args,{cwd:root,env,stdio:'inherit',windowsHide:true});
if(run.error)throw run.error;if(run.status!==0)process.exit(run.status??1);
const bytes=await readFile(path.join(root,'target/wasm32-unknown-unknown/release/ladir_terrain_kernel.wasm'));
const module=await WebAssembly.compile(bytes),instance=await WebAssembly.instantiate(module);
if(WebAssembly.Module.imports(module).length)throw Error('Kernel must have no host imports');
if(instance.exports.kernel_version()!==1)throw Error('Wrong kernel ABI');
const meta={abi:1,rust:RUST_VERSION,binarySha256:sha256(bytes),...await wasmBuildIdentity(),bytes:bytes.length,memoryBytes:instance.exports.memory.buffer.byteLength,cacheBytes:instance.exports.cache_bytes(),cacheEntries:instance.exports.cache_capacity()};
if(check){
 assert.deepEqual(bytes,await readFile('assets/wasm/terrain-kernel.wasm'),'Rebuilt WASM differs from the committed binary');
 assert.deepEqual(meta,JSON.parse(await readFile('assets/wasm/terrain-kernel.json')),'Rebuilt WASM metadata differs');
 console.log('Pinned Rust release build reproduces the committed WASM artifact.');
}else{
 await mkdir('assets/wasm',{recursive:true});await writeFile('assets/wasm/terrain-kernel.wasm',bytes);
 await writeFile('assets/wasm/terrain-kernel.json',JSON.stringify(meta,null,2)+'\n');console.log(JSON.stringify(meta));
}
