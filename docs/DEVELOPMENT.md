# Development and release workflow

Use Node.js 24.18.0 from `.node-version`, npm, and a WebGPU-capable browser.
The ordinary application build uses the committed WASM binary. Rust is only
needed when changing or independently rebuilding that kernel.

## Install, validate, run

```sh
npm ci
npm run check
npm test
npm run build
npm start
```

`npm ci` uses the committed `package-lock.json` and replaces `node_modules`
itself. Keep the lockfile; deleting it before `npm ci` breaks reproducibility
and causes that command to fail. There is no routine cache-clearing step.
Three.js and esbuild versions remain pinned. Playwright is a development-only
dependency; it is not bundled into the game.

Open `http://127.0.0.1:4399/`. To load the reference saved world, append
`?world=fixtures/lumen-v35.planet&view=reference&region=baked`.
`npm run dev` serves source files; `npm start` serves the production `dist/`.
The server binds to loopback and supplies the isolation headers used by workers.
Existing prebaked assets are included; startup does not require rebaking.

## Rust/WASM

```sh
rustup toolchain install 1.90.0 --profile minimal --target wasm32-unknown-unknown
npm run build:wasm
npm run build:wasm -- --check
npm run verify:wasm
npm run test:wasm
```

The crate is `wasm/terrain-kernel`, compiled by Cargo in release mode with
`--locked --offline`. It has no external Rust dependencies. This project exports
a small direct WASM ABI and does not use wasm-bindgen or wasm-pack.
The compiler version, linker flags, Cargo files, source, build scripts and binary
are checked. `--check` rebuilds into ignored target files and compares the result
without replacing committed assets. A normal build rejects a stale artifact.
Keep the binary and its metadata in the same commit as a kernel/recipe change.

Source bytes participate in terrain identities and WASM hashes. `.gitattributes`
preserves them; do not normalize source line endings as an unrelated cleanup.
No terrain generator stamp or bake is changed by the CI/documentation release.

## Tests and browser checks

`npm run check` validates dependency-lock consistency, current documentation
links, the root archive policy and the WASM build identity. `npm run test:ci`
runs the same unit tests as `npm test` and writes `test-results/unit.xml`.

```sh
npx playwright install chromium
npm run build
npm run test:smoke
```

The smoke script starts and stops its own production server on a free port,
loads the saved reference world, enters/exits flight and checks actual generated
WebGPU shader compilation and validation errors. It saves screenshots and JSON
under `test-results/browser`. Set `BROWSER_CHANNEL=chrome` to use installed
Chrome. Linux CI sets `BROWSER_SOFTWARE_GPU=1` to use SwiftShader; this is a
functional check with Vulkan/Mesa runtime dependencies and the GPU watchdog
disabled for slow software compilation, never a GPU-performance measurement or a 100 FPS result.
The 960 x 640 smoke viewport does not change application quality defaults.

Hardware flight profiling remains separate:
`node scripts/benchmark-wasm-flight.mjs <isolated-url>`. See
[WASM measurements](WASM.md) for the recorded methodology and limitations.

## Continuous integration

[LADIR CI](https://github.com/X111Metafizik/ladir/actions/workflows/ci.yml) runs on
pushes to `main`, pull requests targeting `main`, and manual dispatch:

- Node 24 on Ubuntu 24.04 and Windows: clean install, repository checks, full
  tests, production build and a check for unintended tracked-file changes.
- Ubuntu: pinned Rust release rebuild, byte-for-byte WASM comparison and parity
  tests. A generated artifact cannot silently drift from its sources.
- Chromium/SwiftShader: production editor/flight and generated shader smoke.

Actions are pinned to reviewed commit IDs, jobs have explicit timeouts and
read-only repository permissions, and superseded runs are cancelled. npm's
package cache is reused; installed `node_modules` is not cached. Test results,
browser diagnostics and the Linux production distribution are retained as
Actions artifacts for seven days. This workflow does not deploy a public site
or publish an npm package. Runtime smoothness still requires hardware profiling.

## Repository and historical material

`core/` owns generation, `io/` persistence and baking, `render/` graphics and
streaming, `flight/` simulation, `studio/` UI and `workers/` background tasks.
`assets/` and `fixtures/` contain versioned runtime data. Current English guides
live in `docs/`; earlier Turkish notes and HTML reports remain in
[docs/history](history/README.md) with their original content. Old report URLs
continue to redirect. Build outputs, dependency installations, toolchains and
local test output are ignored by Git. Selected measured evidence stays versioned.

When deliberately changing canonical terrain, validate saved-world compatibility
and regenerate affected packages, rather than invalidating them during housekeeping:

```sh
npm run bake:region -- fixtures/lumen-v35.planet --cells=64
npm run bake:terrain -- fixtures/lumen-v35.planet
npm run build
npm test
```

These are generation commands, not routine CI steps. Review their source changes
and package identities before committing. Preserve raw measurements and identify
which release, hardware, route and quality settings they describe.

References: [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/),
[Playwright CI](https://playwright.dev/docs/ci),
[Chromium SwiftShader](https://github.com/chromium/chromium/blob/main/docs/gpu/swiftshader.md).
