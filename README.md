# LADİR

A browser-based procedural planet generator with terrain streaming and flight simulation.

Explore planets, shape terrain in the editor, and fly from the surface into space. Built with Three.js and WebGPU.

## Features

- Procedural mountains, valleys, rivers, lakes, and biomes.
- Terrain LOD, regional baking, and streaming.
- Flight controls with landing, boost, and warp travel.
- Saved worlds with reproducible seeds.

## Run locally

Requires **Node.js 24+**, npm, and a browser with WebGPU support.

```sh
git clone https://github.com/X111Metafizik/ladir.git
cd ladir
npm ci
npm run build
npm start
```

Open [localhost:4399](http://127.0.0.1:4399/). Prebaked terrain assets are included.

Use `npm run dev` for development and `npm test` to run the tests.

## Documentation

- [Development, build and CI guide](docs/DEVELOPMENT.md)
- [Architecture and worker transport](docs/ARCHITECTURE.md)
- [Rust/WASM implementation and measurements](docs/WASM.md)
- [Project history](docs/PROJECT_HISTORY.md)
- [Production-plan review](docs/PRODUCTION_REVIEW.md)
- [Terrain loading measurements and changes](docs/STREAMING_PERFORMANCE.md)
- [Third-party credits and licenses](THIRD_PARTY_NOTICES.md)

[CI status](https://github.com/X111Metafizik/ladir/actions/workflows/ci.yml)
checks Windows/Linux builds, determinism, the Rust artifact and production WebGPU shaders.

Earlier reports and original Turkish notes remain in [the historical archive](docs/history/README.md).
[The V37 report](output/reports/ATLAS_V37_Rapor.md) and [PDF](output/pdf/ATLAS_V37_Sonuc.pdf)
retain their original ATLAS name and measurement context.
