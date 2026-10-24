# Production-plan review - v1.25.0

The supplied three-page production plan was evaluated against v1.24.0 commit
`8d71c08`. This release improves build reproducibility and regression detection;
it does not claim a rendering-performance gain.

| Proposal | Decision and implementation |
| --- | --- |
| Move old root HTML/Markdown files | Already implemented in v1.23.0. Preserve `docs/history`, its links and server redirects; add a root-policy check instead of moving archives again. |
| Standardize documentation in English | Add a current English development guide and project history. Preserve original Turkish historical evidence. Renaming or overwriting a Turkish file with a short note is not translation. |
| Delete package-lock and run npm ci | Reject the destructive sequence. Preserve the lockfile, pin dependencies and use clean `npm ci` installs locally and in CI. |
| wasm-pack release build from wasm/ | Adapt to the actual direct-ABI crate in `wasm/terrain-kernel`. Use pinned Rust 1.90.0, Cargo release/offline/locked and byte-for-byte rebuild checking. No redundant wasm-pack installation. |
| Automatic push/PR checks | Add bounded, read-only GitHub Actions jobs for Windows/Linux validation, Rust reproducibility and production browser/shader checks. |
| Production build implies shader correctness | A JS bundle alone does not compile GPU shaders. Add a separate browser smoke that records WebGPU compilation/validation errors and editor/flight screenshots. |

`npm run check` also detects stale build recipes and broken local links in active
English documentation. WASM metadata includes Cargo, compiler/toolchain and linker
recipe inputs, rather than checking only the Rust source file. Negative tests
reject changed optimization flags, changed memory limits and corrupt binaries.

The CI distribution is an expiring downloadable build artifact. There is no new
public hosting/deployment target, package publication, performance-quality change,
terrain rebake or generator-identity change in this release.

## Validation and impact

Local clean install, **209 tests**, repository checks, production build and
pinned Rust byte-for-byte rebuild passed. actionlint 1.7.12 accepted the workflow.
Chrome/WebGPU rendered the editor and flight, returned to the editor, and
compiled **154 shader modules with no compilation, page or device-loss errors**.
Screenshots were inspected. These are functional checks, not new FPS measurements.

Object-hash comparison confirmed that **379 runtime/data/asset files**, including
the WASM binary, remain identical to v1.24.0. The metadata change adds build-input
validation only. Existing terrain, physical units, saved worlds, visuals and
flight behavior are preserved.

The practical gain is earlier detection of broken installs, stale WASM artifacts,
platform differences and shader regressions. Costs are one development-only
browser dependency and several hosted CI jobs. Seven-day artifact retention and
cancellation of superseded runs limit redundant storage and execution.

[Local validation evidence](../evidence/v40/validation.json) and
[browser diagnostics](../evidence/v40/browser/smoke.json) record the local results.
Hosted Linux/Windows and SwiftShader results are reported separately in the
[GitHub Actions run for the commit](https://github.com/X111Metafizik/ladir/actions/workflows/ci.yml).
A local pass is not presented as a hosted pass. See [Development](DEVELOPMENT.md)
for reproduction commands and the scope of each job.

## Issues exposed by the first hosted run

The clean Linux run found a compatibility test reading an ignored local V35
measurement. Its original 384-point baseline is now versioned in
[fixtures/regressions](../fixtures/regressions/README.md), without recalculating
or weakening the exact comparisons. A development directory containing ignored
data had concealed that missing dependency.

The first Linux software-GPU run lost its WebGPU device during startup. The
browser job now includes Vulkan/Mesa runtime dependencies, retains device and
browser diagnostics, and disables the software GPU watchdog within the existing
job deadline. Device loss remains a failing check; it is not skipped or counted
as a pass. Hosted status remains the authority for this platform check.
