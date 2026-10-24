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

- [Architecture and worker transport](docs/ARCHITECTURE.md)

- [Performance report](output/reports/ATLAS_V37_Rapor.md) / [PDF](output/pdf/ATLAS_V37_Sonuc.pdf)
- [Benchmark results](evidence/v37/results.json)
- [Development history and bake instructions](docs/history/PROJECT_HISTORY_TR.md)
- [Third-party credits and licenses](THIRD_PARTY_NOTICES.md)

Historical reports and development notes are in Turkish and retain the former ATLAS name.
