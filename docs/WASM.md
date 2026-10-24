# Rust/WASM terrain kernel

LADIR v1.24.0 adds a production Rust/WebAssembly path for the existing f64
value-noise and fBm functions. Terrain production, LOD sampling, vegetation,
generation and flight/collision queries use the same validated kernel.
The JavaScript reference remains available with `?terrainKernel=js`.

This is a measured kernel migration, not a rewrite of the complete terrain engine.
Hydrology, topology, seam stitching, regional baking, GPU grids and transfer queues
remain in their existing implementations. No DPR, mesh density, trees, water,
shadows or flight effects are reduced.

## Memory ownership

Each execution context owns a separate WASM instance with a fixed maximum of
589,824 bytes (nine 64 KiB pages). Its optional 8,192-entry exact-input noise cache occupies
458,752 bytes. Hash collisions evict; they never substitute a different height.
There are no per-chunk Vec allocations, leaked raw pointers or manual free calls.
Cache reset reuses storage. Destroying the worker releases its instance.

Profiling found almost no fBm memo hits on unique terrain samples. Production
therefore uses the uncached Rust function; the bounded memo export remains for
explicit repeated-query workloads and tests. It is not counted as a production
speedup. The existing complete-sample cache now uses a fixed numeric key table
instead of allocating coordinate strings and Map nodes on every query. Its keys
have a 4 MiB byte ceiling (3,300,000 bytes for each 80,000-slot patch-worker cache).
Sample object references remain bounded by slot count; their heap bytes are not
included in the key-byte counter. Immutable sample objects are retained because
mesh halos may still own them.

Linear memory is not posted or transferred to the renderer. Existing generated
mesh ArrayBuffers still transfer ownership through the worker pipeline; shared
world snapshots and regional streaming retain their earlier contracts.
JavaScript objects, mesh output arrays and GPU allocation still exist. This does
not eliminate all GC, bypass browser memory limits, or guarantee 100 FPS.

## Compatibility and startup

The small checked-in binary is loaded once per context before terrain work.
Independent workers initialize independently; build requests wait on their own
initialization barrier. Cancellation also covers requests queued during loading
and cache reads. A four-second read deadline, unsupported WASM, corrupt modules,
ABI mismatch or failed numerical self-check select the JavaScript path.

Every instance checks representative samples against the retained JS producer
before becoming active. Larger tests compare global/reference-region samples,
water, material attributes, stitched meshes, LOD selection and serialized worlds.
Generator identity, metre radius and geometry-bake definitions are preserved;
the numerical producer is unchanged. WASM ABI/binary/source hashes are versioned
separately in `assets/wasm/terrain-kernel.json`.

Diagnostics: `planetStudio.view.terrainKernel`,
`planetStudio.view.terrain.stats.kernels`, and
`planetStudio.view.terrain.stats.plannerKernel` report the selected mode, failure
reason, load time, memory bytes and cache activity. `workerMemory=copy` remains an
independent worker-transport switch.

## Build and verify

Normal installation requires Node 24 and the existing npm dependencies. A normal
`npm run build` verifies that the checked-in binary matches the Rust source and
copies it into the distribution. Rust is needed only to rebuild the kernel:

```sh
rustup toolchain install 1.90.0 --profile minimal --target wasm32-unknown-unknown
npm run build:wasm
npm run test:wasm
npm test
npm run build
npm run benchmark:wasm
node scripts/benchmark-sample-memory.mjs
```

The Rust crate has no external dependencies. Cargo builds offline with a lockfile,
f64 operations and no fast-math relaxation. The linker fixes both initial and
maximum linear memory. The built module must have no host imports.

Browser verification uses the existing bundled Playwright runtime:

```sh
node scripts/verify-wasm-browser.mjs <isolated-url> <non-isolated-url>
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright ESM module if necessary.
The browser checks WASM/shared, JS/shared, WASM/copy, and corrupt-WASM fallback
through opening, flight, boost release and warp-arrival preparation.

## Measurement boundaries

CPU comparisons alternate the same saved world, coordinates and patch descriptors.
They separate uncached math, cached math, full terrain sampling, mesh generation
and LOD planning. Fixed WASM bytes are explicit; they are not the entire app's RAM.
Browser frame intervals and GPU timings must be reported separately from CPU
kernel timing. A 60 Hz presentation cadence cannot establish 100 FPS.

Recorded validation and measurements: [evidence/v39](../evidence/v39/).

References: [Rust wasm32 target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html),
[WebAssembly memory](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory).

## Verified CPU and cache measurements

Full regression run: **202 passed**. The final targeted run contains **26 passing
checks**, including new-world identity, actual patch-worker cancellation and a
linear-coordinate occupancy regression added after the full run. Production
build verifies the Rust source/binary hashes. Test logs are checked in.

Six alternating measured rounds, 72 terrain patches per path:

| CPU measurement | Legacy JS cache | Numeric-key JS | Numeric-key + WASM |
| --- | ---: | ---: | ---: |
| Patch median | 18.26 ms | 15.13 ms | 14.79 ms |
| Patch p95 | 27.01 ms | 25.22 ms | 22.22 ms |
| 1,200 terrain samples, median | 41.91 ms | 40.17 ms | 40.66 ms |
| LOD selection, median | 5.37 ms | 5.03 ms | 5.50 ms |

Most of the measured patch gain comes from eliminating string keys. WASM alone
is a smaller incremental gain here; the LOD and general sampling results do not
show a consistent gain. An isolated 60,000-call fBm test measured 25.02 ms for JS
and 19.10 ms for uncached WASM. The optional memo's 9.52 ms result is deliberately
excluded from production claims because real unique terrain queries rarely hit it.

Synthetic cache-only workload, separate Node processes, 500,000 queries with the
same 80,000-slot limit and identical checksum:

| Cache measurement | Legacy Map/string keys | Numeric keys |
| --- | ---: | ---: |
| Retained heap | 44,340,120 bytes | 13,862,296 bytes |
| Retained ArrayBuffers | 0 bytes | 3,300,000 bytes |
| Retained sample count | 78,112 | 71,158 |
| Query hits | 0 | 105,096 |
| GC during workload, total | 75.83 ms | 18.64 ms |
| Longest recorded GC | 27.29 ms | 4.62 ms |

Occupancy and hit counts differ because the eviction policy changed; all
returned sample values match. These are cache-only measurements, not whole-app
RAM reductions or browser GC guarantees. Main-thread sample objects, worker
hydrology graphs, mesh buffers and GPU resources still need memory management.

The coordinate hash includes both halves of the 43-bit quantized coordinate.
A low-32-bit-only prototype clustered straight flight paths into too few buckets;
that version was rejected and a regression now verifies occupancy.

## Browser flight validation

Four production-browser checks passed without page or console errors:
WASM/shared memory, JS/shared memory, WASM/copy transport, and corrupt-WASM
fallback. Each enters flight, boosts/releases and prepares the warp arrival.
World hash and radius stay identical; shared world snapshots are reused.
The screenshots show the same saved terrain at flight entry; animation timing
can differ. Exact numerical/mesh equality is established by tests, not pixels.

[WASM flight](../evidence/v39/browser/wasm-shared-flight.png) ·
[JS flight](../evidence/v39/browser/js-shared-flight.png)

The frame comparison uses one fresh browser context per backend and one cold
route followed by one warm replay, 60 seconds each. Both backends already use
the numeric sample cache. This is not a full old-application/new-application FPS
comparison; the legacy cache is measured separately in the CPU experiment above.
“Cold” refers to the first route in the context, after normal scene startup.

Same saved world, pinned geographic route, 8,000 km diameter, default quality,
1440 × 1000 at DPR 1; NVIDIA GeForce GTX 1660 Ti, Chrome/WebGPU. Route includes
forest, lake, river, canyon turn, boost/release, combat, short/long warp, cube face
and pole. Scripted repositioning is included in frame timing. The headless
presentation cadence is approximately 60 Hz. CPU and GPU work overlap; their
percentiles must not be added to predict FPS.

| Mode / route cache | Presented FPS | CPU p95 / p99 (ms) | GPU render p95 / p99 (ms) | Frame interval p95 / p99 (ms) | Longest interval (ms) | Intervals >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JS / cold | 59.05 | 6.41 / 8.84 | 7.23 / 7.53 | 16.87 / 17.05 | 199.82 | 11 |
| JS / warm | 59.03 | 5.67 / 8.08 | 7.64 / 8.15 | 16.88 / 17.07 | 133.21 | 9 |
| WASM / cold | 58.85 | 6.12 / 8.59 | 6.93 / 7.71 | 16.88 / 17.10 | 216.74 | 10 |
| WASM / warm | 59.03 | 5.92 / 9.08 | 7.46 / 8.98 | 16.88 / 17.07 | 116.68 | 9 |

| Mode / route cache | Peak reported JS heap | Peak tracked GPU buffers |
| --- | ---: | ---: |
| JS / cold | 375.8 MB | 114.9 MB |
| JS / warm | 445.5 MB | 123.3 MB |
| WASM / cold | 454.3 MB | 115.5 MB |
| WASM / warm | 378.4 MB | 123.4 MB |

JS heap is the browser's approximate heap counter, not total process RAM or all
worker/WASM memory. GPU buffers exclude textures, render targets and driver
allocations. The numbers do not demonstrate a whole-application memory win.

| Mode | Initial view ready | Flight entry |
| --- | ---: | ---: |
| JS | 16803 ms | 1518 ms |
| WASM | 17238 ms | 1619 ms |

These startup timings are single observations, not statistically established
loading-speed gains. WASM main-context loading in the independent functional
checks took 8.67–10.70 ms. The tiny kernel is not the dominant startup cost.

Reproduce the flight comparison with the production build served locally:

```sh
node scripts/benchmark-wasm-flight.mjs <isolated-url>
```

Use `PLAYWRIGHT_MODULE` when Playwright is installed outside this project.
Raw frames, GPU timestamps, scenario summaries, queues, memory counters and the
pinned route are included in [evidence/v39](../evidence/v39/).

## Remaining bottlenecks and limits

- Browser FPS is effectively unchanged in this sample. The CPU patch benchmark
  gain is real for that workload, but does not establish a 100 FPS application.
- Warp and geographic/LOD transitions still produce long frames. Even the final
  WASM run contains 216.74 ms cold and 116.68 ms warm frame intervals. Cold has
  10 intervals over 50 ms; warm has 9. No claim of eliminating stutter is made.
- Remaining JavaScript work includes hydrology, normals, mesh assembly, main
  thread scene transitions and physics. A further port needs a call-stack trace
  of the remaining long frames; event correlation alone does not prove GC or
  GPU uploads caused them.
- The GPU render p99 remains 7.71 ms cold and 8.98 ms warm on this machine.
  Shader, atmosphere and render-pass work is outside this noise-kernel change.
- Fixed WASM memory was stress-tested with repeated calls; this is not a
  multi-hour browser memory-leak certification. GC still exists elsewhere.
