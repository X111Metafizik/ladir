import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyWasmArtifact} from './verify-wasm-artifact.mjs';
assert.ok(Number(process.versions.node.split('.')[0])>=24,'Node.js 24+ is required');
const pkg=JSON.parse(await readFile('package.json')),lock=JSON.parse(await readFile('package-lock.json'));
assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
for(const key of ['dependencies','devDependencies'])assert.deepEqual(lock.packages[''][key],pkg[key],`Lockfile ${key} mismatch`);
const historical=/^(?:ARAZI_V\d+|UCUS_V\d+|PERFORMANS_V\d+|ATLAS_.*|BIYOMLAR|OPTIMIZASYON)\.(?:html|md)$/i;
for(const name of await readdir('.'))assert.ok(!historical.test(name),`Historical file belongs in docs/history: ${name}`);
const docs=['README.md','THIRD_PARTY_NOTICES.md',...(await readdir('docs')).filter(n=>n.endsWith('.md')).map(n=>'docs/'+n)];
let links=0;
for(const name of docs){
 const text=await readFile(name,'utf8');
 for(const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
  const target=match[1].replace(/^<|>$/g,'');if(/^(?:[a-z]+:|#)/i.test(target))continue;
  const file=decodeURIComponent(target.split(/[?#]/)[0]);if(!file)continue;
  await stat(path.resolve(path.dirname(name),file)).catch(()=>{throw Error(`Broken documentation link: ${name} -> ${target}`);});links++;
 }
}
await verifyWasmArtifact();console.log(`Repository checks passed: ${docs.length} current documents, ${links} local links, lockfile and WASM build identity.`);
