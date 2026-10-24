# Architecture and worker transport

For the v1.24.0 Rust/WASM kernel and bounded numeric sample keys, see
[WASM implementation and measurements](WASM.md).

LADIR uses Three.js/WebGPU for rendering and Web Workers for terrain planning,
mesh generation, vegetation and regional package loading. Physics uses meters;
rendering uses a camera-relative origin. The reference planet remains 8,000 km
in diameter. Saved world and terrain-bake identities are unchanged in v1.23.0.

## Changes in v1.23.0

`io/worker-world.mjs` prepares one immutable worker snapshot per loaded world.
Numeric arrays share backing memory, preserving view types, offsets and aliases.
The large river/lake graph is encoded once; each worker decodes it locally.
Chrome requires an owned temporary byte view while decoding; this copy stays
inside the receiving worker. Nested terrain workers forward the same shared package. The main-thread world
remains owned and unchanged for physics, editing and `.planet` export.

Generated terrain meshes and decoded region tiles continue to transfer ownership
with transfer lists. SharedArrayBuffers never enter a transfer list. World data
must not be mutated after publication; generate/load a new world for edits.

The local server enables cross-origin isolation. Unsupported hosts or denied
sharing fall back to the existing copy path. Use `?workerMemory=copy` for a
comparison in the same browser; its choice propagates to nested workers.
`WORLD_SHARED_MEMORY=0` disables isolation headers for host-compatibility tests.
Diagnostics are available through `planetStudio.view.workerTransport`.

Historical documents live in [history/](history/README.md). Relative document
links were updated. The local server redirects old report URLs, preserving query
parameters. Turkish history keeps its `_TR` filename; renaming a file does not
translate its contents.

## What was already implemented

- Transferable terrain/region results, bounded worker queues and delivery acknowledgements.
- A 60 Hz fixed-step simulation with bounded catch-up and presentation interpolation.
- Camera-relative floating origin in both flight and editor cameras.
- Worker-side horizon/view refinement, terrain baking, sample caches and material LOD.
- Seed, worker/core, saved-world, drainage and LOD seam regression tests.

These systems were retained. A maximum delta clamp is not a fixed-step clock.
The reported large-world precision concern is primarily GPU float32 coordinates;
JavaScript Number precision at this planet scale was not the missing mechanism.

## Proposals not applied blindly

GPU compute culling and storage-texture terrain generation require a separate
measured prototype: GPU work/readback can add cost and must keep collision, water
and shadow geometry consistent. The existing CPU planner already prunes hidden
terrain before mesh generation. OffscreenCanvas alone does not execute CPU
terrain algorithms on the GPU. No detail, tree density, DPR or effects were reduced.

## Reproduce checks

```sh
npm test
npm run build
node scripts/benchmark-worker-world.mjs
```

The worker benchmark uses the same saved world, alternates both paths and records
24 measured samples each after warm-up. It measures sender blocking and worker
round-trip time, not FPS, full application loading time or total process memory.
One-time snapshot encoding/allocation and per-worker decode remain real costs.
Results are in [worker-world-benchmark.json](../evidence/v38/worker-world-benchmark.json).

Browser smoke checks and test/build evidence are recorded in `evidence/v38/`.
A successful transport refactor does not establish a 100 FPS result.

API references: [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
and [cross-origin isolation](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated).

## Verified results

- Full regression suite: **194 passed, 0 failed**.
- Final targeted compatibility/transport/hosting checks: **10 passed**.
- Production build passed. Chrome/WebGPU opening, flight, boost release and
  warp-destination preparation passed in both isolated/shared and non-isolated/copy modes,
  with no page or console errors.
- Canonical world, terrain geometry and bake-signature source bytes are unchanged.

| Worker transport, 24 samples per path | Copy | Shared package |
| --- | ---: | ---: |
| Sender blocking, median | 23.33 ms | 0.053 ms |
| Sender blocking, p95 | 29.05 ms | 0.104 ms |
| Worker round trip, median | 62.81 ms | 39.37 ms |

One-time snapshot preparation took **89.98 ms** in this Node benchmark.
The shared snapshot contains 5,939,480 numeric-array bytes and
7,700,009 metadata bytes. Worker-local decoding and temporary decode
storage remain; these are not eliminated by shared memory. Browser diagnostics
confirmed that entering flight/warp did not rebuild the snapshot.

These timings are **not an FPS claim or a total RAM reduction measurement**.
The renderer, terrain generation, GPU uploads and full startup still have their
own costs. See [validation](../evidence/v38/validation.json) and
[browser results](../evidence/v38/browser.json) for the recorded checks.
