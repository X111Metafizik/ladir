import {REVISION} from 'three/webgpu';
// WebGPU guarantees zero initialized buffers. Empty resident slots need no
// mapped-at-creation 4 MiB CPU copy. Register the allocation with Three's own
// accounting, then let its normal partial-update/disposal path manage it.
// This adapter is intentionally pinned, with the ordinary manager fallback.
export function allocateResidentStorage(renderer,attribute,revision=REVISION){
 const backend=renderer?.backend,manager=renderer?._attributes;
 if(revision!=='186'||!backend?.isWebGPUBackend||attribute.itemSize!==4||!manager?.get)return false;
 const data=backend.get(attribute);if(data.buffer)return true;
 data.buffer=backend.device.createBuffer({label:'ATLAS resident terrain bank',size:attribute.array.byteLength,usage:128|32|4|8,mappedAtCreation:false});
 renderer.info.createAttribute(attribute);manager.get(attribute).version=attribute.version;return true;
}
// Isolated adapter for pinned Three r186. Pre-upload through its attribute
// manager so normal drawing reuses the same buffers and accounting. Unlike
// concurrent compileAsync, this cannot mutate lighting/shadow render state.
export function createTerrainUploader(renderer,revision=REVISION){
 const manager=revision==='186'?renderer._attributes:null,seen=new WeakSet();
 const stats={geometries:0,bytes:0,milliseconds:0,maxGeometryMilliseconds:0,supported:!!manager?.update};
 function prepare(mesh){
  const g=mesh.geometry;if(!stats.supported||seen.has(g))return;const started=performance.now();
  const attributes=Object.values(g.attributes);for(const a of attributes){manager.update(a,1);stats.bytes+=a.array.byteLength;}
  if(g.index){manager.update(g.index,2);stats.bytes+=g.index.array.byteLength;}
  seen.add(g);stats.geometries++;
  const elapsed=performance.now()-started;stats.milliseconds+=elapsed;stats.maxGeometryMilliseconds=Math.max(stats.maxGeometryMilliseconds,elapsed);
  // Some prepared geometry can be cancelled before its first render. Register
  // disposal now; deletion by Three's later geometry listener is idempotent.
  const dispose=()=>{for(const a of attributes)manager.delete(a);if(g.index)manager.delete(g.index);g.removeEventListener('dispose',dispose);};
  g.addEventListener('dispose',dispose);
 }
 return {prepare,stats};
}
