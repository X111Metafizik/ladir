import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function verifyWasmArtifact(){
 const meta=JSON.parse(await readFile(new URL('../assets/wasm/terrain-kernel.json',import.meta.url))),binary=await readFile(new URL('../assets/wasm/terrain-kernel.wasm',import.meta.url)),source=await readFile(new URL('../wasm/terrain-kernel/src/lib.rs',import.meta.url));
 const hash=x=>createHash('sha256').update(x).digest('hex');
 if(hash(source)!==meta.sourceSha256||hash(binary)!==meta.binarySha256)throw Error('Stale WASM artifact: run npm run build:wasm');
 const module=await WebAssembly.compile(binary);if(WebAssembly.Module.imports(module).length)throw Error('Unexpected WASM host imports');
 const {exports:k}=await WebAssembly.instantiate(module);
 if(k.kernel_version()!==meta.abi||k.memory.buffer.byteLength!==meta.memoryBytes)throw Error('WASM ABI mismatch');
 return meta;
}
