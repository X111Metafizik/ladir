# Project history

This English overview records the active architecture and verified milestones.
It supplements the [original Turkish history](history/PROJECT_HISTORY_TR.md),
which remains unchanged as historical evidence. Older measurements and names
belong to their respective releases; they are not current performance promises.

| Milestone | Change |
| --- | --- |
| ATLAS / V31 | Terrain and flight profiling baseline; older saved worlds retained. |
| V32-V34 | Explicit radius/model identities, connected reference landforms, persistent GPU terrain grids and budgeted transfers. The current reference world has an 8,000 km diameter. |
| V36 | Versioned regional terrain packages, canonical sampling, persistent cache and procedural fallback. |
| v1.22.1 / V37 | Streaming, water, worker-delivery and warp-arrival improvements with recorded cold/warm route comparisons. |
| v1.22.3 | Project renamed NADIR; saved-world/cache identities retained. |
| v1.22.4 | Project renamed LADIR and published under the current repository name. |
| v1.23.0 | Immutable shared worker snapshots, copy fallback, historical document archive and preserved report redirects. |
| v1.24.0 | Numerically equivalent Rust/WASM noise/fBm, bounded numeric sample cache, JS fallback and hardware measurements. |
| v1.25.0 | Reproducible-build checks, Windows/Linux CI, production WebGPU smoke and current English contributor documentation. |

The physics world uses metres; the renderer uses a camera-relative origin.
The saved reference planet remains 4,000,000 metres in radius. Ship scale,
700/1,800 km/h cruise/boost, terrain geometry, water and saved-world identities
are unchanged by v1.25.0. The noise kernel binary is unchanged; its build recipe
is now included in artifact validation.

The current runtime is described in [Architecture](ARCHITECTURE.md),
[WASM implementation](WASM.md) and [Development](DEVELOPMENT.md).
Historical terrain/flight evidence remains in
[V37 results](../evidence/v37/results.json),
[V38 transport evidence](../evidence/v38/validation.json) and
[V39 WASM evidence](../evidence/v39/validation.json).

Tests establish their tested contracts. A passing CI build does not establish
100 FPS, zero garbage collection or the absence of long frames on every GPU.
