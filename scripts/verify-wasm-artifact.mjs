import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {RUST_VERSION,sha256,wasmBuildIdentity} from './wasm-build-inputs.mjs';
export async function verifyWasmArtifact({root=new URL('../',import.meta.url)}={}){
 const meta=JSON.parse(await readFile(new URL('assets/wasm/terrain-kernel.json',root))),binary=await readFile(new URL('assets/wasm/terrain-kernel.wasm',root));
 const identity=await wasmBuildIdentity(root);
 if(meta.rust!==RUST_VERSION||identity.sourceSha256!==meta.sourceSha256||identity.buildInputsSha256!==meta.buildInputsSha256||sha256(binary)!==meta.binarySha256||binary.length!==meta.bytes)throw Error('Stale WASM artifact or build recipe: run npm run build:wasm');
 const module=await WebAssembly.compile(binary);if(WebAssembly.Module.imports(module).length)throw Error('Unexpected WASM host imports');
 const {exports:k}=await WebAssembly.instantiate(module);
 if(k.kernel_version()!==meta.abi||k.memory.buffer.byteLength!==meta.memoryBytes||k.cache_bytes()!==meta.cacheBytes||k.cache_capacity()!==meta.cacheEntries)throw Error('WASM ABI mismatch');
 return meta;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log(JSON.stringify(await verifyWasmArtifact(),null,2));
