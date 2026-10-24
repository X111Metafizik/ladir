# Terrain readiness, v1.26.0

This change addresses the interval between the first coarse flight surface and
the completed near terrain. Opening the cockpit is measured separately from
finishing geometry; an earlier loading-overlay dismissal is not a full-detail
speedup.

## Findings and implementation

- An IndexedDB open that took more than 250 ms used to disable the mesh cache
  for the entire worker lifetime. A late successful connection is now retained.
  The foreground still falls back to generation rather than waiting indefinitely.
- Near 8-cell previews were excluded from persistent caching. They now share
  the 128 MiB disk budget with detailed meshes. Distant parents still stay out
  of this cache. Background write batches increased from 6 to 24 records within
  the existing 2 MiB per-worker queue; overflow, timeout and quota fallback remain.
- LOD planning now reuses a bounded 80,000-entry sample cache. Tests compare the
  resulting patch descriptors exactly with the original sampler. This changes
  computation reuse, not terrain height, material, resolution or view distance.
- Patch workers check exact mesh hits before reading regional source tiles.
  Regional reconstruction is still required on misses. Radius, world hash,
  generator/build identity, surface profile, grid and edge knots all participate
  in identity checks.
- Optional startup packs contain exact meshes, compressed in chunks of at most
  2 MiB raw. The matching world downloads its signed index lazily; unrelated
  worlds do not parse that large index in their worker bundle. Retained decoded
  packs are capped at 4 MiB per patch worker. Failed signatures or fetches fall
  back to the existing generator.
- Geometry preparation and transition commits share a 2.5 ms CPU deadline.
  Cheap measured uploads can use the existing 288 KiB maximum when the GPU
  queue has room. Queue pressure restores throttling. One connected seam
  transaction cannot be interrupted; overruns are recorded rather than hiding
  cracks behind an incomplete replacement.
- Startup stage timings distinguish the first stitched surface, full detail,
  shader compilation and the first submitted render. Cache flush telemetry
  continues after the geometry worker finishes.

The existing shared GPU grids, transferable worker results, warp preloading,
physical scale, collision sampling and quality defaults are retained. No DPR,
tree density, effect, near-detail or visibility reduction is included.

## Controlled loading measurement

NVIDIA GTX 1660 Ti / Chrome, 1440 x 1000, DPR 1, same saved world and geographic
camera (59.43 N, -126.7 E, heading 207). The world's radius is 4,000,000 m.
The original v1.25.0 production build was preserved before rebuilding.
The interactive game tab was temporarily stopped so it did not compete for the
GPU. One cold/warm pair per build is a diagnostic comparison, not a confidence
interval or a promise for other computers.

| Measurement | v1.25.0 | v1.26.0 |
| --- | ---: | ---: |
| Editor ready, cold navigation | 10.148 s | 9.622 s |
| Editor ready, warm navigation | 8.507 s | 8.990 s |
| Cockpit ready after flight click, cold | 5.048 s | 4.662 s |
| Full terrain after flight click, cold | 16.182 s | 12.295 s |
| Cockpit ready after flight click, warm | 4.588 s | 2.210 s |
| Full terrain after flight click, warm | 14.497 s | 10.806 s |

Full-detail waiting fell by approximately 24% cold and 25% warm in this pair.
Warm editor navigation did not improve. The old build recorded zero mesh hits
in both visits; the updated warm visit recorded 1,423 hits, with 36 read timeouts
falling back to generation. Both builds finished with 1,386 active terrain
patches. Final tracked terrain CPU buffers were approximately 142.4 vs 142.7 MB;
this is neither total process RAM nor total VRAM.

Raw loading records and before/after screenshots are under
[`evidence/v41/user-before`](../evidence/v41/user-before/) and
[`evidence/v41/user-final`](../evidence/v41/user-final/). The actual saved world
used for this pair remains a local test input; its full identity is recorded
in those JSON files. The checked-in fixture is a different world and must not
be substituted as if it were the user's world.

The separate fixture run verified 2,427 static mesh hits with no cache errors.
Its ready times are not an A/B speedup: it has a different region and camera.
The packs do not cover the entire planet or all viewport/stitch combinations.

## Bake and reproduce

```sh
npm run bake:startup
npm run build
npm run dev
npm run benchmark:loading
```

`bake:startup` currently requires a saved world with a validated regional
surface profile and defaults to `fixtures/lumen-v35.planet`. The positional
argument selects another such saved world. The command writes a catalog for
that world; it does not merge multiple world catalogs automatically.
It samples the same canonical surface as the renderer and collision system.
There are 7,524 exact patches, 49 packs, 46,721,591 compressed payload bytes
plus a 3,915,157-byte index in the included fixture package. The bake command
updates its build signature, so run `npm run bake:terrain` as well when canonical
geometry sources change. Existing mismatched packages are safely ignored.

`benchmark:loading` accepts `BENCH_URL`, `BENCH_OUT`, and optional
`BENCH_FOCUS=latitude,longitude,heading`. It measures cold navigation then a
reload in the same context, stops ship translation after flight entry, captures
the first and completed surface, and separately waits for disk-write settlement.
The process needs installed Chrome and GPU access. Enemy movement and clouds
continue, so screenshots are terrain comparisons, not pixel-identical frames.
The benchmark keeps application quality defaults, including clouds; it does
not recreate every transient UI setting from the supplied screenshots.

## Remaining work, in order

1. **Canonical height tiles independent of camera stitching.** Exact mesh keys
   change with neighboring LOD/stitch choices, causing misses even in a visited
   region. A reusable height/material pyramid plus local edge reconstruction
   can remove more generation than caching every finished mesh variation.
   It must preserve the CPU collision/water/tree surface and signed geography.
2. **Stable transition borders.** One observed connected replacement group had
   846 patches in the user's region. It holds early near pieces until its last
   dependency is ready. Split only after introducing compatible temporary edge
   constraints or a validated morph; splitting the current group directly can
   reintroduce the cracks seen in earlier versions.
3. **Destination and spawn coverage.** Bake the intended spawn region and
   prefetch a bounded forward/warp corridor before it becomes visible. The
   existing warp system already does this; the static fixture catalog is not
   a world-wide substitute.
4. **IDB scheduling and generation profiling.** Warm reads still time out while
   writes contend. Worker production counters are accumulated across workers
   and the whole session, so their sum is not user-visible elapsed time.
   Investigate per-LOD production and separate cache reads from write contention
   before changing budgets again.

The measured 10.8–12.3 seconds to complete flight detail is still too long for
instant arrival. A 1–2 second target and uninterrupted 100 FPS remain unverified.

## Flight regression measurement

A separate saved fixture and the same recorded 60-second route were replayed
cold, then warm, on each build. It includes forest, lake, river, canyon, boost
release, combat, warp, cube seam and pole transitions. Scripted geographic
repositions are included. This is one pair per build, not a statistical claim.

| Route pass | CPU p95 | GPU render p95 | Frame interval p99 | Longest interval | Intervals >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Old cold | 12.24 ms | 7.14 ms | 33.35 ms | 233.25 ms | 1 |
| New cold | 9.33 ms | 5.93 ms | 17.13 ms | 266.51 ms | 3 |
| Old warm | 7.96 ms | 6.80 ms | 17.09 ms | 116.67 ms | 1 |
| New warm | 8.28 ms | 7.93 ms | 17.08 ms | 166.49 ms | 3 |

The cold p99 improved, but worst stalls did not. The new run's longest pause
occurred during initial forest refinement; another was during short warp.
Connected transition commits reached 19.8 ms. These are remaining performance
problems, not passes. GPU timestamps measure render work, not presentation,
queue delay or all browser activity. CPU and GPU quantiles cannot be added as
if they were sequential costs. Render rate stayed around 58–59 FPS in this
60 Hz/headless measurement; it does not validate a 100 Hz presentation target.

Peak observed main-thread JS heap was 415/409 MB old and 461/380 MB new
(cold/warm). Peak tracked GPU buffers were 135 MB old and 120/122 MB new.
Neither metric measures complete worker RAM or texture/driver VRAM; these
short runs do not certify absence of memory leaks.

## Research basis

- [Cesium3DTileset](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html):
  destination preloading, visible-tile priority, progressive resolution and byte
  budgets. These are architectural references; Cesium was not added to LADİR.
- [Three.js Renderer](https://threejs.org/docs/pages/Renderer): explicit async
  shader preparation and texture initialization support first-use preparation.
  LADİR's existing shader prewarming is retained.
- [Optimize long tasks](https://web.dev/articles/optimize-long-tasks): yielding
  work can reduce blocking, but does not remove its computation. Worker reuse,
  precomputation and correct cache hits address the actual work here.

Flight timing, shader validation and their limitations are recorded in
[`evidence/v41`](../evidence/v41/) and the
[Turkish analysis](../output/reports/LADIR_V41_Yukleme_Analizi.md).
