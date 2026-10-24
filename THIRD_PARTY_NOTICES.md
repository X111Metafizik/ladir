# Kaynaklar, sürümler ve lisanslar

- **Three.js 0.186.1**, MIT. Core, WebGPU, TSL ve bütün addon importları aynı kilitli sürümdendir.
  Tam lisans `dist/THREE-LICENSE.txt` içinde dağıtılır.
  [WebGPU renderer](https://threejs.org/manual/pages/webgpurenderer),
  [node görüntü hattı](https://threejs.org/manual/pages/webgpu-postprocessing.html),
  [kaynak kod](https://github.com/mrdoob/three.js).
- **esbuild 0.28.2**, MIT; yalnızca geliştirme/derleme bağımlılığıdır.
  [Proje](https://github.com/evanw/esbuild).
- **Node.js 24+**, ayrı kurulu çalışma ortamıdır; Node ikilisi bu pakette dağıtılmaz.
- Bitki geometrileri, gürültü ve bazı dokular kodla üretilmiştir. Kullanıcı tarafından sağlanan
  `Meshy_AI_Starlight_Voyager_1020235536_texture.glb` modeli `assets/starlight-voyager.glb`
  olarak bulunur. Kullanıcının sağladığı arazi GLB dosyalarından türetilen stamp verileri
  `assets/terrain-stamps/` içindedir. Bu varlıklar üçüncü taraf/kullanıcı kaynaklıdır;
  bu depo onlara MIT veya başka bir yeni lisans vermez.

Algoritma kavramları için plandaki kaynaklar esas alındı. Aşağıdaki eserlerin tam
referans uygulamalarının bu pakette bulunduğu iddia edilmez:

- Barnes, Lehman, Mulla — [Priority-Flood](https://richard.science/sci/2014_depressions.pdf).
- Steven Wittens — [Spheres and cubes](https://acko.net/blog/making-worlds-1-of-spheres-and-cubes/).
- Jerry Tessendorf — [Simulating Ocean Water](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf).
- Sébastien Hillaire — [Atmosphere reference](https://github.com/sebh/UnrealEngineSkyAtmosphere).
- [WebGPU standardı](https://www.w3.org/TR/webgpu/).

Kapsam farkları `docs/history/TESLIM_RAPORU.md` içinde açıkça belirtilir.

V1.3 arazi araştırması ve kullanılan kavramlar [ARAZI_V13.md](docs/history/ARAZI_V13.md) içinde kaynaklarıyla açıklanır. Kaya dokusu yerel olarak üretilir. Three.Terrain veya üçüncü taraf erozyon eklentisi pakete dahil edilmemiştir.
