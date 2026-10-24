// World arrays are immutable after generation/loading. Keep a single shared
// snapshot for worker consumers; the authoritative main-thread world stays
// owned and serializable. Generated meshes still use transferable ArrayBuffers.
const records = new WeakMap();
const isShared = buffer => typeof SharedArrayBuffer === 'function' && buffer instanceof SharedArrayBuffer;
export function canShareWorld(scope = globalThis) {
  return scope.crossOriginIsolated === true && typeof scope.SharedArrayBuffer === 'function'
    && new URLSearchParams(scope.location?.search ?? '').get('workerMemory') !== 'copy';
}
function recordFor(world) {
  let record = records.get(world);
  if (!record) {
    const blocks = new Set(Object.values(world.buffers ?? {}).map(view => view.buffer));
    record = {snapshot: null, packed: null, ownedSnapshot: null, disabled: false, stats: {
      mode: 'unused', worldBytes: [...blocks].reduce((sum, block) => sum + block.byteLength, 0),
      sharedSnapshotBytes: 0, metadataBytes: 0, metadataSnapshotBytes: 0,
      preparationMs: 0, metadataPreparationMs: 0, decodeMs: 0, dispatches: 0,
      sharedDispatches: 0, copiedDispatches: 0, avoidedCopyBytes: 0, fallbacks: 0
    }};
    records.set(world, record);
  }
  return record;
}
function copyBuffers(world, shared) {
  const blocks = new Map(), buffers = {};
  let allocatedBytes = 0;
  for (const [name, view] of Object.entries(world.buffers ?? {})) {
    if (!ArrayBuffer.isView(view)) throw new TypeError('World buffers must be typed array views');
    let buffer = blocks.get(view.buffer);
    if (!buffer) {
      if (shared && isShared(view.buffer)) buffer = view.buffer;
      else {
        buffer = shared ? new SharedArrayBuffer(view.buffer.byteLength) : new ArrayBuffer(view.buffer.byteLength);
        new Uint8Array(buffer).set(new Uint8Array(view.buffer));
        allocatedBytes += buffer.byteLength;
      }
      blocks.set(view.buffer, buffer);
    }
    buffers[name] = view instanceof DataView
      ? new DataView(buffer, view.byteOffset, view.byteLength)
      : new view.constructor(buffer, view.byteOffset, view.length);
  }
  return {world: {...world, buffers}, allocatedBytes};
}
export function worldForWorker(world, {shared = canShareWorld()} = {}) {
  const record = recordFor(world);
  if (!shared || typeof SharedArrayBuffer !== 'function' || record.disabled) {
    if (Object.values(world.buffers ?? {}).some(view => isShared(view.buffer))) {
      record.ownedSnapshot ??= copyBuffers(world, false).world;
      return record.ownedSnapshot;
    }
    return world;
  }
  if (!record.snapshot) {
    const start = performance.now();
    try {
      const copy = copyBuffers(world, true);
      record.snapshot = copy.world;
      record.stats.sharedSnapshotBytes = copy.allocatedBytes;
    } catch (error) {
      if (error.name !== 'RangeError' && error.name !== 'SecurityError') throw error;
      record.disabled = true;
      record.stats.fallbacks++;
    } finally { record.stats.preparationMs += performance.now() - start; }
  }
  return record.snapshot ?? world;
}
function packSharedWorld(world, record) {
  if (!record.packed) {
    const start = performance.now();
    // The large river graph is JSON data in .planet files. Encoding once here
    // moves repeated object reconstruction off the render thread, without
    // changing any numbers or removing hydrology fields.
    const bytes = new TextEncoder().encode(JSON.stringify({...world, buffers: undefined}));
    const metadata = new SharedArrayBuffer(bytes.byteLength);
    new Uint8Array(metadata).set(bytes);
    record.packed = {buffers: world.buffers, metadata};
    record.stats.metadataBytes = metadata.byteLength;
    record.stats.metadataSnapshotBytes = metadata.byteLength;
    record.stats.metadataPreparationMs += performance.now() - start;
  }
  return record.packed;
}
export function receiveWorkerWorld(message) {
  if (message.worldTransport?.encoding !== 'shared-json-v1') return message.world;
  const start = performance.now(), {buffers, metadata} = message.world;
  // Chrome TextDecoder rejects shared input. The temporary byte copy stays
  // inside this worker; the sender and nested dispatch still share the package.
  const world = {...JSON.parse(new TextDecoder().decode(new Uint8Array(metadata).slice())), buffers};
  const record = recordFor(world);
  record.snapshot = world;
  record.packed = {buffers, metadata};
  record.stats.metadataBytes = metadata.byteLength;
  record.stats.decodeMs = performance.now() - start;
  return world;
}
export function postWorkerWorld(worker, message, options) {
  const source = message.world, record = recordFor(source);
  let world = worldForWorker(source, options);
  let shared = Object.values(world.buffers ?? {}).some(view => isShared(view.buffer));
  try {
    // Shared buffers are structured-cloned handles, never transfer-list entries.
    worker.postMessage({...message, world: shared ? packSharedWorld(world, record) : world,
      worldTransport: {shared, encoding: shared ? 'shared-json-v1' : 'clone'}});
  } catch (error) {
    if (!shared || !['DataCloneError', 'SecurityError', 'RangeError'].includes(error.name)) throw error;
    // A host can deny sharing despite feature detection. Retry with owned data.
    record.disabled = true; record.snapshot = null; record.packed = null;
    record.stats.sharedSnapshotBytes = 0; record.stats.metadataSnapshotBytes = 0;
    record.stats.fallbacks++;
    world = Object.values(source.buffers ?? {}).some(view => isShared(view.buffer))
      ? copyBuffers(source, false).world : source;
    worker.postMessage({...message, world, worldTransport: {shared: false}});
    shared = false;
  }
  record.stats.dispatches++;
  record.stats.mode = shared ? 'shared' : 'copy';
  if (shared) { record.stats.sharedDispatches++; record.stats.avoidedCopyBytes += record.stats.worldBytes; }
  else record.stats.copiedDispatches++;
}
export function workerWorldStats(world) { return {...recordFor(world).stats}; }
