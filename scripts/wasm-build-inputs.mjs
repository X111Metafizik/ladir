import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const RUST_VERSION='1.90.0';
export const WASM_FLAGS='-C link-arg=-zstack-size=65536 -C link-arg=--initial-memory=589824 -C link-arg=--max-memory=589824';
export const BUILD_INPUTS=['wasm/terrain-kernel/src/lib.rs','wasm/terrain-kernel/Cargo.toml','wasm/terrain-kernel/Cargo.lock','wasm/terrain-kernel/rust-toolchain.toml','scripts/build-wasm.mjs','scripts/wasm-build-inputs.mjs'];
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export async function wasmBuildIdentity(root=new URL('../',import.meta.url)){
 const inputs={};for(const name of BUILD_INPUTS)inputs[name]=sha256(await readFile(new URL(name,root)));
 return {sourceSha256:inputs[BUILD_INPUTS[0]],buildInputsSha256:sha256(JSON.stringify({rust:RUST_VERSION,flags:WASM_FLAGS,inputs}))};
}
