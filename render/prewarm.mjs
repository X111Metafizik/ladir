import {ShadowNode} from 'three/webgpu';
// compileAsync's beauty pass does not compile the shadow override. Build that
// variant before flight as well, while the view's animation loop is suspended.
export async function prewarmShadow(renderer,objects,scene,light){
 if(!light.shadow.map)return;
 const target=renderer.getRenderTarget(),override=scene.overrideMaterial;
 try{scene.overrideMaterial=new ShadowNode(light).getShadowMaterial();renderer.setRenderTarget(light.shadow.map);await renderer.compileAsync(objects,light.shadow.camera,scene);}
 finally{scene.overrideMaterial=override;renderer.setRenderTarget(target);}
}
export async function fitScalarTextures(materials,maxSize=1024){
 const protectedSources=new Set(),scalar=new Set();
 for(const m of materials){for(const key of ['map','normalMap','emissiveMap'])if(m[key])protectedSources.add(m[key].source);for(const key of ['roughnessMap','metalnessMap'])if(m[key])scalar.add(m[key]);}
 const resized=new Map();let savedBytes=0;
 for(const texture of scalar){
  const image=texture.image,largest=Math.max(image?.width??0,image?.height??0);
  if(largest<=maxSize||protectedSources.has(texture.source))continue;
  let bitmap=resized.get(image);
  if(!bitmap){const ratio=maxSize/largest;bitmap=await createImageBitmap(image,{resizeWidth:Math.max(1,Math.round(image.width*ratio)),resizeHeight:Math.max(1,Math.round(image.height*ratio)),resizeQuality:'high'});resized.set(image,bitmap);savedBytes+=(image.width*image.height-bitmap.width*bitmap.height)*4*4/3;}
  texture.image=bitmap;texture.needsUpdate=true;
 }
 for(const image of resized.keys())image.close?.();
 return {scalarTextureLimit:maxSize,savedTextureBytes:Math.round(savedBytes),colorAndNormalPreserved:true};
}
