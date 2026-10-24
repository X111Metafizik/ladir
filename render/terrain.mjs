import * as THREE from 'three/webgpu';
import {positionWorld,positionView,normalWorldGeometry,normalView,attribute,texture3D,vec3,mix,sin,Fn,fwidth} from 'three/tsl';
import {cloudShadowAt} from './atmosphere.mjs';
import {rockTexture} from './rock-texture.mjs';
import {surfaceNormal} from './surface-normal.mjs';
import {materialNoise,materialRock} from './material-lod.mjs';
export function terrainMaterial(shared,fields={}){
  const material=new THREE.MeshStandardNodeMaterial({roughness:.93,metalness:0,side:THREE.DoubleSide});
  if(fields.position)material.positionNode=fields.position;
  const normalWorld=fields.normalWorld??normalWorldGeometry;
  // A single local shadow map cannot represent an entire regional view.
  // Fade its contribution before the far-frustum border becomes visible;
  // mesh normals continue to light mountains at every altitude.
  material.receivedShadowNode=Fn(([shadow])=>mix(vec3(1),shadow,shared.terrainShadow));
  const meters=positionWorld.mul(shared.metersPerUnit).add(shared.noiseOrigin);
  const distance=positionView.length().mul(shared.metersPerUnit);
  const footprint=fwidth(meters).length();
  const bands=materialNoise(meters,distance,shared.volumeResources.noise,footprint);
  const coarse=bands.x,medium=bands.y,fine=bands.z,grain=bands.w;
  const geology=fields.surface??attribute('surface','vec4'),biome=geology.x;
  const climate=fields.climate??attribute('climate','vec2');
  const radial=positionWorld.add(shared.origin).normalize();
  const steepness=normalWorld.dot(radial).abs().oneMinus();
  // Full near-field materials through 2 km, with a smooth approach band.
  // Explicit texture gradients retain mip filtering on all triplanar samples.
  const mineral=materialRock(meters,normalWorld,distance,64,8000,rockTexture());
  const detail=materialRock(meters,normalWorld,distance,4,footprint.lessThan(2).select(8000,0),rockTexture());
  const mineralRange=distance.smoothstep(4000,8000).oneMinus();
  const detailRange=distance.smoothstep(4000,8000).oneMinus();
  // Pixel-space filtering preserves fine materials at close range without
  // crawling speckles at grazing angles. All texture periods divide the
  // floating-origin period, so rebasing cannot slide the material underneath us.
  const fineFilter=footprint.smoothstep(.12,2).oneMinus();
  // The cached 3D noise has no mip chain; fade frequencies below a pixel.
  const grainFilter=footprint.smoothstep(.25,2).oneMinus();
  const variation=coarse.mul(.3).add(medium.mul(.28)).add(fine.mul(.36)).add(grain.mul(.28).mul(grainFilter)).add(1);
  const exposed=steepness.add(mineral.g.sub(.5).mul(.065).mul(mineralRange));
  const natural=biome.greaterThan(-.5);
  const rockMask=exposed.smoothstep(.035,.24).mul(geology.z.oneMinus()).mul(biome.greaterThan(1));
  const strata=sin(geology.w.mul(.17).add(medium.mul(6))).mul(.009).mul(distance.smoothstep(1500,6000).oneMinus());
  const sediment=mix(vec3(.245,.225,.185),vec3(.38,.255,.145),biome.greaterThan(8.5).and(biome.lessThan(10.5)).or(biome.greaterThan(12.5).and(biome.lessThan(13.5))));
  const rock=mix(mix(sediment,vec3(.075,.069,.065),biome.greaterThan(10.5).and(biome.lessThan(12.5))),vec3(.29,.29,.28),biome.greaterThan(13.5).and(biome.lessThan(14.5)));
  // Keep mineral contrast in the full-quality range; mipmaps filter subpixel
  // cracks and the outer fade avoids a hard material transition.
  const mineralColor=mineral.r.sub(.5).mul(mineralRange).add(.5);
  const grit=detail.r.sub(.5).mul(detailRange).mul(fineFilter).add(.5);
  const stone=rock.mul(mineralColor.mul(1.25).add(.38)).mul(grit.mul(.4).add(.8)).mul(medium.mul(.85).add(coarse.mul(.3)).add(1)).add(strata);
  const groundTexture=materialRock(meters,normalWorld,distance,16,8000,rockTexture());
  const groundRange=mineralRange;
  const groundGrain=groundTexture.r.sub(.5).mul(.62).add(detail.r.sub(.5).mul(.28).mul(fineFilter).mul(detailRange)).mul(groundRange);
  const groundColor=(fields.color??attribute('color','vec3')).mul(variation).mul(groundGrain.add(1));
  // Snow collects on shelves; exposed cliff faces retain mineral strata. The
  // climate field is shared across stitched edges instead of discrete biomes.
  const snow=climate.x.sub(steepness.smoothstep(.16,.6).mul(.82)).add(medium.mul(.12)).add(groundTexture.g.sub(.5).mul(.16).mul(groundRange)).smoothstep(.08,.85).mul(climate.x.smoothstep(0,.2)).mul(natural);
  const snowGrain=mineral.r.sub(.5).mul(.24).add(groundTexture.r.sub(.5).mul(.2)).mul(groundRange).add(grit.sub(.5).mul(.55));
  const snowColor=vec3(.79,.84,.86).mul(coarse.mul(.1).add(snowGrain).add(1));
  const moisture=climate.y.mul(.10).mul(rockMask.oneMinus()).mul(snow.oneMinus());
  const base=mix(mix(groundColor.mul(moisture.oneMinus()),stone,rockMask),snowColor,snow);
  const bumpStrength=rockMask.mul(.32).add(rockMask.oneMinus().mul(.16)).mul(mineralRange).mul(snow.mul(-.5).add(1));
  // Reuse filtered height samples for screen-space gradients; no repeated
  // triplanar evaluation in three shifted UV contexts.
  material.normalNode=surfaceNormal(mineral.g.add(groundTexture.g.mul(.16)).add(detail.g.mul(.22).mul(fineFilter).mul(detailRange)),bumpStrength.mul(natural),fields.normalView??normalView);
  material.roughnessNode=mix(mix(.97,.84,rockMask),.92,snow);
  material.aoNode=mineral.b.mul(rockMask).mul(mineralRange).mul(-.24).add(1);
  const regional=texture3D(shared.volumeResources.noise,meters.div(65536)).g.smoothstep(.34,.62);
  const purple=vec3(.40,.09,.57),red=vec3(.59,.075,.025),turquoise=vec3(.03,.48,.42);
  const tint=mix(mix(purple,red,shared.tintMode.equal(2)),turquoise,shared.tintMode.equal(3));
  const mixed=mix(purple,turquoise,regional);
  const overlay=mix(tint,mixed,shared.tintMode.equal(4));
  const amount=regional.mul(shared.tintOpacity).mul(shared.tintMode.greaterThan(0));
  const shaded=mix(base,overlay,amount).mul(cloudShadowAt(positionWorld.add(shared.origin),shared));
  const height=geology.w.div(500),lineDistance=height.add(.5).fract().sub(.5).abs(),lineWidth=fwidth(height).mul(1.15).max(.006);
  const contour=lineDistance.smoothstep(lineWidth,lineWidth.mul(2.4)).oneMinus().mul(fwidth(height).smoothstep(.16,.42).oneMinus());
  const topo=mix(mix(base,vec3(.11,.23,.25),.18),vec3(.12,.48,.46),contour.mul(.45));
  material.colorNode=mix(fields.color??attribute('color','vec3'),mix(shaded,topo,shared.tactical),natural);
  material.emissiveNode=vec3(2.8,.24,.015).mul(geology.z.pow(4)).mul(fine.mul(2).add(.5).smoothstep(.18,.55).mul(.68).add(.32)).add(topo.mul(shared.tactical).mul(.3));

  return material;
}
export {StreamingTerrain as TerrainQuadtree} from './terrain-stream.mjs';

