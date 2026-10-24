# Shore continuity and descent streaming, v1.26.1

The `river-v42.planet` fixture reproduces the sea-level river gaps reported in
flight. It preserves the original saved world, its 4,000,000 m radius and its
generator signature. The change updates water meshes and streaming, not the
height field or flight physics.

## Water correction

A sea-level river was removed from the ocean mesh by its feature ID, then drawn
again as a narrower ribbon. That left a strip of uncovered bed between two water
meshes. River mouths now belong to the continuous sea-level surface. Inland
reaches keep their separate, falling water levels.

Inland rivers clip their full polygon width to cube tiles instead of clipping
only the centre line. Adjacent segments share bounded mitered bank vertices.
Perspective-correct water-level interpolation preserves continuity between cube
faces. Tests compare shared edge vertices within 1 cm and reject out-of-tile
water geometry. Collision and vegetation continue to use the existing canonical
and displayed terrain paths.

## Approach streaming

- The selector includes the predicted camera frustum, not just its distance.
  During descent, ground below the current view can therefore prepare early.
- Actual camera translation supplements engine velocity. A descending forecast
  spans at most 6 seconds / 4 km; ordinary travel retains 2.4 seconds / 1.5 km.
  Teleports and long pauses do not create unbounded forecasts.
- Travel inside that corridor does not cancel the pending job. Leaving it or
  turning substantially still retires stale work.
- The 8 km band no longer switches level 11–13 tiles from 16 cells back to 8.
  Visible detail is retained while approaching. Final near quality, DPR,
  vegetation, effects and upload byte limits are preserved.
- A transition can publish independently only if its shared stitched edge has
  an identical sampling contract. Changed edges, connected replacements and cube
  face seams still commit atomically. Existing parents remain visible meanwhile.
- Worker priority completes the nearest transition's seam dependencies together,
  so ready near tiles are not held behind unrelated horizon generation.

Static mesh packages were regenerated under the new geometry signature. Old
cache entries cannot silently reintroduce the previous water meshes; invalid or
missing packages retain procedural fallback.

## Two synchronized cameras

Separate terrain and dynamic-object passes are possible with camera layers, but
they do not compute missing terrain. A moving camera also changes the terrain's
projection every frame. Reusing an old terrain image requires depth-aware
reprojection and disocclusion handling, not merely another camera.

Production retains the shared scene camera/depth and the existing separate
half-resolution atmospheric pass. This avoids introducing a second scene draw or
incorrect ship/cloud occlusion to address a geometry-streaming problem. See the
[Three.js Layers documentation](https://threejs.org/docs/pages/Layers.html),
[Renderer depth controls](https://threejs.org/docs/pages/Renderer.html) and
[RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html).

## Reproduction

```sh
npm run bake:terrain
npm run bake:startup
npm run build
npm test
npm run check
node scripts/serve.mjs
# In another terminal; local server defaults to port 4399:
node scripts/benchmark-descent.mjs
```

`BENCH_URL` and `BENCH_OUT` select another build/output directory. The benchmark
expects the supplied river fixture, descends from 8,500 to 450 m ASL at 650 m/s,
and repeats the same route with warm RAM/disk caches. It measures CPU submission
and frame intervals; it does not measure GPU timestamp cost or prove 100 FPS.
Default screenshots occur outside the timed interval. `BENCH_SHOTS=1` opts into
an arrival screenshot and must not be used for clean performance comparisons.

The [Turkish results report](../output/reports/LADIR_V42_Kiyi_ve_Alcalma.md)
contains the measured comparison, images and remaining limitations.
