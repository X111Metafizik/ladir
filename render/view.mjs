import {workerWorldStats} from '../io/worker-world.mjs';
import {initRegional,regionalOptions} from '../io/regional-runtime.mjs';
import {prewarmShadow} from './prewarm.mjs';
import {createTerrainUploader} from './terrain-upload.mjs';
import {uploadAllowance} from './terrain-budget.mjs';
import {createBoostBlur} from './boost-blur.mjs';
import * as THREE from 'three/webgpu';
import {uniform,vec3,pass,vec4,convertToTexture} from 'three/tsl';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';

import {sampleTerrain} from '../core/terrain.mjs';
import {randomStream,localDirection} from '../core/math.mjs';
import {terrainMaterial,TerrainQuadtree} from './terrain.mjs';
import {createAtmosphere} from './atmosphere.mjs';
import {createOceanFFT,waterMaterial,createWaterGeometry,riverMesh,lakeMesh} from './water.mjs';
import {createVegetation} from './vegetation.mjs';
import {createFlightController} from './flight.mjs';
import {warpArrivalCamera} from './warp-arrival.mjs';
import {PlanetCamera} from './camera.mjs';
import {regionOverlay} from './regions.mjs';
import {volumeData} from './volume-data.mjs';
import {createRoutePreview} from './routes.mjs';
import {tacticalMix,cloudVisibility} from './tactical.mjs';
import {createStormField} from './storms.mjs';
import {StableShadowFocus} from './stable-shadow.mjs';
export async function createPlanetView({world,canvas,appearanceConfig,renderSettings,onCamera=()=>{},onError=()=>{},onFlightMessage=()=>{},hostLoop=false,initialCamera=null}){
  if(!navigator.gpu)throw Error('Bu tarayıcı WebGPU sunmuyor. Gezegen üretimi ve paket kaydı kullanılabilir; 3B görünüm için güncel Chrome veya Edge ile localhost adresini aç.');
  const regional=initRegional(world,{...regionalOptions(),main:true});regional?.prefetch([initialCamera?.direction??world.frame.center],2000);
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('WebGPU aygıtı bulunamadı. Üretim ve paket dışa aktarma kullanılabilir.');
  const renderer=new THREE.WebGPURenderer({canvas,antialias:true,reversedDepthBuffer:true,powerPreference:'high-performance'});
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend){renderer.dispose();throw Error('Tam görünüm WebGPU gerektiriyor; WebGL uyumluluk görünümü açılmadı.');}
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=appearanceConfig.exposure;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const device=renderer.backend.device;device?.lost.then(info=>{if(!disposed)onError(`GPU bağlantısı kesildi (${info.reason}). “Görünümü yeniden başlat” ile devam et.`);});
  let gpuErrorReported=false;
  const onGPUError=event=>{if(!gpuErrorReported&&!disposed){gpuErrorReported=true;onError('WebGPU çizim hatası: '+event.error.message.slice(0,240));}};
  device?.addEventListener('uncapturederror',onGPUError);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,.008,15000),root=new THREE.Group(),origin=new THREE.Vector3(),originUniform=uniform(origin);
  camera.coordinateSystem=THREE.WebGPUCoordinateSystem;camera._reversedDepth=true;camera.updateProjectionMatrix();
  scene.updateMatrix();scene.matrixAutoUpdate=false;root.updateMatrix();root.matrixAutoUpdate=false;
  scene.background=new THREE.Color(0x03080e);scene.add(root);
  const shared={tintMode:uniform(appearanceConfig.tintMode??0),tintOpacity:uniform(appearanceConfig.tintOpacity??.28),forestEye:uniform(new THREE.Vector3()),sun:uniform(new THREE.Vector3()),clock:uniform(0),clouds:uniform(appearanceConfig.clouds),atmosphere:uniform(appearanceConfig.atmosphere),fog:uniform(appearanceConfig.fog),water:uniform(appearanceConfig.water),wind:uniform(appearanceConfig.wind),steps:uniform(renderSettings.volumeSteps,'int')};
  shared.radiusKm=uniform(world.radiusMeters/1000);shared.kmPerUnit=uniform(world.radiusMeters/1000000);shared.metersPerUnit=uniform(world.radiusMeters/1000);shared.origin=originUniform;shared.noiseOrigin=uniform(new THREE.Vector3());shared.waveOrigin=uniform(new THREE.Vector3());
  shared.terrainShadow=uniform(1);
  shared.tactical=uniform(0);shared.stormReactive=uniform(0);
  for(let i=0;i<4;i++)shared['storm'+i]=uniform(new THREE.Vector4());
  shared.volumeResources=volumeData(world.radiusMeters/1000);
  const sun=new THREE.DirectionalLight(0xfff3df,3.4);sun.castShadow=true;sun.shadow.camera.layers.set(1);sun.shadow.mapSize.set(renderSettings.shadowResolution,renderSettings.shadowResolution);sun.shadow.bias=-.00005;sun.shadow.normalBias=.3*1000/world.radiusMeters;sun.shadow.camera.near=.1*1000/world.radiusMeters;sun.shadow.camera.far=20000*1000/world.radiusMeters;
  scene.add(sun,sun.target);scene.add(new THREE.HemisphereLight(0x8cbbd9,0x292b21,.72));
  const terrainGroup=new THREE.Group();root.add(terrainGroup);terrainGroup.matrixAutoUpdate=false;
  const fft=createOceanFFT(world.terrainSeed,shared.clock),oceanMaterial=waterMaterial(world,shared,fft),groundMaterial=terrainMaterial(shared),terrain=new TerrainQuadtree(world,groundMaterial,terrainGroup,oceanMaterial,camera,fields=>terrainMaterial(shared,fields));
  const vegetation=createVegetation(world,shared,terrain,camera);root.add(vegetation.group);
  const regions=regionOverlay(world);root.add(regions.mesh);
  const routes=createRoutePreview(world);root.add(routes.group);
  const starGeometry=new THREE.BufferGeometry(),starPositions=[],starColors=[],rng=randomStream('planet-studio-stars');
  for(let i=0;i<3500;i++){const d=new THREE.Vector3(rng()*2-1,rng()*2-1,rng()*2-1).normalize().multiplyScalar(7000);starPositions.push(...d.toArray());const b=.25+rng()*.75;starColors.push(b*.83,b*.90,b);}
  starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));starGeometry.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
  const starMaterial=new THREE.PointsNodeMaterial({size:1.3,sizeAttenuation:false,vertexColors:true,depthWrite:false}),stars=new THREE.Points(starGeometry,starMaterial);root.add(stars);
  const scenePass=pass(scene,camera,{samples:4});
  const terrainUploader=createTerrainUploader(renderer);
  terrain.uploadStats=terrainUploader.stats;terrain.batches.attachRenderer?.(renderer);terrain.waterBatches.attachRenderer(renderer);
  // Arrival water must be GPU-ready even while outside the departure camera.
  // These small patch buffers already consume the streaming upload allowance.
  terrain.prepareMeshes=meshes=>{for(const mesh of meshes)terrainUploader.prepare(mesh);};
  const atmosphere=createAtmosphere(scenePass,camera,originUniform,shared);
  const atmosphereTexture=convertToTexture(atmosphere.node);
  const pipeline=new THREE.RenderPipeline(renderer),bloomNode=bloom(atmosphereTexture,.075,.3,1.25);
  const boostBlur=createBoostBlur(atmosphereTexture,bloomNode.getTextureNode());pipeline.outputNode=boostBlur.node;
  const controls=new PlanetCamera(canvas,camera,world,mode=>{resetHistory();onCamera(mode);});
  controls.displayedSurface=d=>terrain.surfaceAt(d);
  const flight=createFlightController({world,root,camera,canvas,editor:controls,onMessage:onFlightMessage,onWarpPrepare:(arrival,departing)=>{
    const target=warpArrivalCamera(arrival,world.radiusMeters,camera.aspect,flight.rangeMeters),a=terrain.arrival,scale=1000/world.radiusMeters;
    // The charge advances the ship slightly. Keep a complete prepared view
    // when that shift is smaller than its footprint; re-target close landings.
    if(departing&&a&&a.camera.distanceTo(target.camera)/scale<Math.max(250,(target.camera.length()-1000)/scale*.02))return;
    regional?.prefetch([target.camera.clone().normalize().toArray()],4000);
    terrain.prepareArrival(target.camera,settings.detail,target.view);
  },onWarpCancel:()=>terrain.cancelArrival()});
  const storms=createStormField(shared,(strength,distance)=>flight.audio.thunder(strength,distance));
  const tactical={active:false,blend:0,altitude:0,cloudVisibility:1};let selectedLayer='natural',lastCloudVisibility=1;
  let appearance={...appearanceConfig},settings={...renderSettings},disposed=false,frame=0,last=performance.now(),errorReported=false,rendering=false,warming=false,gpuFrames=0;
  const performanceStats={frames:0,backpressureSkips:0,shadowUpdates:0,fftUpdates:0,maxQueuedFrames:2};
  const startupStats={entries:0,stages:{},totalMilliseconds:0,assetsReady:false};let flightShadersReady=false;
  const flightAssets=flight.preload().then(()=>{startupStats.assetsReady=true;return true;},e=>{startupStats.preloadError=e.message;return false;});
  const shadowOrigin=new THREE.Vector3(1e9,0,0),shadowFocus=new THREE.Vector3(1e9,0,0),shadowSun=new THREE.Vector3();
  const stableShadow=new StableShadowFocus(),lightFocus=new THREE.Vector3();
  const waterFrustum=new THREE.Frustum(),waterMatrix=new THREE.Matrix4(),waterSphere=new THREE.Sphere(),featureCache=new WeakMap();
  let shadowTime=-1e9,shadowRevision=-1,forestRevision=-1;
  let lastWarpRevision=0;
  const markerFeatures=[...world.hydrology.lakes,...world.hydrology.rivers.filter(r=>!r.network).map(r=>({...r,direction:r.points[Math.floor(r.points.length*.47)].direction})),...world.crossings,...world.straits,...(world.landmarks??[])];
  let selectedFeature=null,fftReady=false;
  function resetHistory(){atmosphere.reset();}
  function setAppearance(next){
    appearance={...appearance,...next};
    const az=appearance.sunAzimuth*Math.PI/180,el=appearance.sunElevation*Math.PI/180,c=new THREE.Vector3(...(appearance.lightAnchor??world.frame.center)),e=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),c).normalize(),n=new THREE.Vector3().crossVectors(c,e).normalize();
    shared.sun.value.copy(c).multiplyScalar(Math.sin(el)).addScaledVector(e,Math.cos(el)*Math.sin(az)).addScaledVector(n,Math.cos(el)*Math.cos(az)).normalize();
    for(const name of ['clouds','atmosphere','fog','water','wind','tintMode','tintOpacity'])shared[name].value=appearance[name];
    renderer.toneMappingExposure=appearance.exposure;resetHistory();
  }
  function resize(){
    const rect=canvas.parentElement.getBoundingClientRect();renderer.setPixelRatio(devicePixelRatio*settings.pixelRatio);renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.clearViewOffset();camera.updateProjectionMatrix();resetHistory();
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas.parentElement);
  function update(now=performance.now()){
    if(disposed||rendering||warming||document.hidden){last=now;return;}
    if(flight.active&&flight.sim?.paused&&now-last<100)return;
    // Keep CPU/GPU overlap without letting the queue or input latency grow unbounded.
    if(gpuFrames>=2){performanceStats.backpressureSkips++;return;}
    rendering=true;const frameStarted=performance.now();
    try{
      const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.08,elapsed);last=now;if(!appearance.paused)shared.clock.value+=dt;
      terrain.flushFrame();
      const activeControls=flight.active?flight:controls;activeControls.update(flight.active?elapsed:dt,origin);
      if(flight.active&&flight.sim.warpRevision===0)lastWarpRevision=0;
      if(flight.active&&flight.sim.warpRevision!==lastWarpRevision){lastWarpRevision=flight.sim.warpRevision;resetHistory();if(flight.sim.warpEvent?.interrupted){terrain.cancelArrival();terrain.update(flight.absolute,settings.detail,true).catch(e=>onError(e.message));}else terrain.arrive(flight.absolute,settings.detail).catch(e=>onError(e.message));}
      if(!flight.active)lastWarpRevision=0;
      if(root.position.x!==-origin.x||root.position.y!==-origin.y||root.position.z!==-origin.z){root.position.copy(origin).negate();root.updateMatrix();}
      if(frame%12===0&&regional&&!terrain.arrival){const points=[activeControls.absolute.clone().normalize().toArray(),activeControls.target.clone().normalize().toArray()];if(terrain.motion)points.push(activeControls.absolute.clone().addScaledVector(terrain.motion,3).normalize().toArray());regional.prefetch(points,2000);}
      const altitude=(activeControls.absolute.length()-1000)*world.radiusMeters/1000;
      tactical.altitude=altitude;tactical.active=!flight.active&&controls.tactical;tactical.blend=flight.active?0:tacticalMix(altitude);tactical.cloudVisibility=cloudVisibility(altitude);
      shared.tactical.value=tactical.blend;
      shared.terrainShadow.value=1-THREE.MathUtils.smoothstep(activeControls.rangeMeters,6000,16000);
      shared.clouds.value=appearance.clouds*tactical.cloudVisibility;
      shared.atmosphere.value=appearance.atmosphere*(1-tactical.blend);shared.fog.value=appearance.fog*(1-tactical.blend);
      if(Math.abs(tactical.cloudVisibility-lastCloudVisibility)>.035||(tactical.cloudVisibility===0&&lastCloudVisibility!==0)){resetHistory();lastCloudVisibility=tactical.cloudVisibility;}
      regions.mesh.visible=!flight.active&&(selectedLayer==='political'||tactical.active);regions.mesh.material.opacity=selectedLayer==='political'?.85:.72*tactical.blend;
      storms.update(activeControls.absolute);shared.stormReactive.value=storms.reactive?1:0;
      shared.noiseOrigin.value.copy(origin).multiplyScalar(world.radiusMeters/1000);
      shared.waveOrigin.value.copy(shared.noiseOrigin.value);for(const axis of ['x','y','z']){shared.waveOrigin.value[axis]=((shared.waveOrigin.value[axis]%640)+640)%640;shared.noiseOrigin.value[axis]=((shared.noiseOrigin.value[axis]%65536)+65536)%65536;}
      if(!appearance.paused)routes.update(dt);
      shared.forestEye.value.copy(activeControls.absolute).sub(origin);
      stars.visible=altitude>100000||activeControls.absolute.clone().normalize().dot(shared.sun.value)<-.12;
      const focus=activeControls.target.clone(),scale=1000/world.radiusMeters,extent=Math.max(1000,Math.min(20000,activeControls.rangeMeters*.8))*scale;
      sun.shadow.autoUpdate=false;
      // Match the visible terrain footprint. Terrain now shades its valleys as
      // well as receiving tree shadows; moving frames refresh the same frustum.
      const texel=extent*2/settings.shadowResolution;stableShadow.snap(focus,shared.sun.value,texel,lightFocus);focus.copy(lightFocus);sun.shadow.camera.up.copy(stableShadow.axis);
      const dynamicShadow=flight.active||(vegetation.group.visible&&appearance.wind>0&&!appearance.paused);
      const changed=shadowRevision!==terrain.shadows.stats.revision||forestRevision!==vegetation.stats.revision||!focus.equals(shadowFocus);
      const urgent=!origin.equals(shadowOrigin)||!shared.sun.value.equals(shadowSun)||sun.shadow.camera.right!==extent;
      sun.shadow.needsUpdate=frame===0||(shared.terrainShadow.value>.001&&(urgent||(flight.active&&!flight.sim.paused)||((changed||dynamicShadow)&&now-shadowTime>=50)));
      if(sun.shadow.needsUpdate){
        sun.shadow.normalBias=Math.max(.3*scale,texel*.7);
        sun.shadow.bias=-Math.max(2.5,Math.min(40,activeControls.rangeMeters*.005))/20000;
        sun.position.copy(focus).addScaledVector(shared.sun.value,10000*scale).sub(origin);sun.target.position.copy(focus).sub(origin);
        if(sun.shadow.camera.right!==extent){Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent});sun.shadow.camera.updateProjectionMatrix();}
        shadowOrigin.copy(origin);shadowFocus.copy(focus);shadowSun.copy(shared.sun.value);shadowTime=now;shadowRevision=terrain.shadows.stats.revision;forestRevision=vegetation.stats.revision;performanceStats.shadowUpdates++;
      }else if(shared.terrainShadow.value<=.001){sun.position.copy(focus).addScaledVector(shared.sun.value,10000*scale).sub(origin);sun.target.position.copy(focus).sub(origin);}
      if(flight.active){terrain.motion??=new THREE.Vector3();terrain.motion.copy(flight.sim.forward).multiplyScalar(flight.sim.speed*scale);}else terrain.motion=null;
      terrain.minimumFov=flight.active?78:0;if(frame%4===0)terrain.update(activeControls.absolute,settings.detail).catch(e=>onError(e.message));
      if(frame%6===0)vegetation.update(activeControls.absolute).catch(e=>onError(e.message));vegetation.settleTerrain();
      sun.updateMatrixWorld();sun.target.updateMatrixWorld();sun.shadow.updateMatrices(sun);
      terrain.batches.update(camera,activeControls.absolute,origin,sun.shadow.camera);terrain.shadows.update();
      terrain.waterBatches.update(camera,origin,{uploadBytes:Math.max(0,uploadAllowance(terrain.cpuAverage)-(terrain.stats.framePlannedUploadBytes??0))});
      let nearWater=false;
      if(altitude<8000&&shared.water.value>0&&terrain.water.size){
        waterMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);waterFrustum.setFromProjectionMatrix(waterMatrix,camera.coordinateSystem,camera.reversedDepth);
        for(const mesh of terrain.water.values()){waterSphere.copy(mesh.geometry.boundingSphere);waterSphere.center.add(mesh.position).sub(origin);if(waterSphere.distanceToPoint(camera.position)/scale<3200&&waterFrustum.intersectsSphere(waterSphere)){nearWater=true;break;}}
      }
      if(!fftReady||(nearWater&&!appearance.paused)){fft.update(renderer);fftReady=true;performanceStats.fftUpdates++;}
      boostBlur.amount.value=flight.active?flight.boostAmount:0;atmosphere.update(activeControls.absolute);pipeline.render();frame++;
      terrain.noteFrameCost(performance.now()-frameStarted);performanceStats.frames++;gpuFrames++;rendering=false;
      device.queue.onSubmittedWorkDone().catch(()=>{}).finally(()=>{gpuFrames--;});
    }catch(error){rendering=false;if(!errorReported){errorReported=true;onError(error.message);console.error(error);}}
  }
  function pick(clientX,clientY){
    const rect=canvas.getBoundingClientRect(),mouse=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),raycaster=new THREE.Raycaster();raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects([...terrain.active.values(),...terrain.water.values()],false);
    if(!hits.length)return null;const d=hits[0].point.add(origin).normalize().toArray();return {direction:d,sample:sampleTerrain(world,d),feature:hits[0].object.userData.feature};
  }
  const onDoubleClick=e=>{if(flight.active)return;const picked=pick(e.clientX,e.clientY);if(picked){controls.focus.set(...picked.direction);controls.setRangeMeters(controls.rangeMeters*.5);controls.mode=controls.rangeMeters>300000?'orbit':controls.rangeMeters>1200?'region':'surface';onCamera(controls.mode);}};canvas.addEventListener('dblclick',onDoubleClick);
  async function prewarmSpace(){
    const objects=new THREE.Group(),counts=[],waterGeometry=new THREE.PlaneGeometry(1,1);
    waterGeometry.setAttribute('shallows',new THREE.BufferAttribute(new Float32Array(4),1));
    const water=new THREE.Mesh(waterGeometry,oceanMaterial);water.receiveShadow=true;water.frustumCulled=false;objects.add(water);
    for(const mesh of [stars,regions.mesh,...terrainGroup.children.filter(m=>m.userData.terrainGrid&&!m.castShadow)]){
      if(mesh.geometry.isInstancedBufferGeometry){counts.push([mesh.geometry,mesh.geometry.instanceCount]);mesh.geometry.instanceCount=Math.max(1,mesh.geometry.instanceCount);}
      const copy=mesh.clone();copy.visible=true;copy.frustumCulled=false;objects.add(copy);
    }
    const previous=renderer.getRenderTarget();renderer.setRenderTarget(scenePass.renderTarget);
    try{await renderer.compileAsync(objects,camera,scene);}
    finally{for(const [geometry,count]of counts)geometry.instanceCount=count;renderer.setRenderTarget(previous);waterGeometry.dispose();objects.clear();}
  }
  async function startFlight(){
    const started=performance.now();startupStats.entries++;startupStats.stages={};
    const stage=async(name,fn)=>{const t=performance.now();try{return await fn();}finally{startupStats.stages[name]=performance.now()-t;}};
    warming=true;terrain.setFrameDriven(false);terrain.prepareArrivalWorker();
    try{
      await device.queue.onSubmittedWorkDone();await stage('ship',()=>flight.start());
      tactical.active=false;tactical.blend=shared.tactical.value=0;regions.mesh.visible=false;resetHistory();
      // Worker generation overlaps shader preparation. Only the complete first
      // surface gates flight; the unchanged maximum detail streams afterwards.
      terrain.minimumFov=78;
      const surface=stage('firstSurface',()=>terrain.prepareFlight(flight.absolute,settings.detail));
      surface.catch(()=>{});vegetation.update(flight.absolute).catch(e=>onError(e.message));
      if(!flightShadersReady){
        await stage('flightShaders',()=>flight.prewarm(renderer,camera,scene,scenePass.renderTarget));
        const casters=new THREE.Group();flight.group.traverse(o=>{if(o.isMesh&&o.castShadow&&o.parent){const copy=o.clone();copy.frustumCulled=false;casters.add(copy);}});
        await stage('shipShadows',()=>prewarmShadow(renderer,casters,scene,sun));casters.clear();
      }
      await surface;
      flightShadersReady=true;
      if(terrain.stats.flightReusedSurface)terrain.update(flight.absolute,settings.detail,true).catch(e=>onError(e.message));
      lastWarpRevision=flight.sim.warpRevision;last=performance.now();flight.pause(false);
    }finally{startupStats.totalMilliseconds=performance.now()-started;warming=false;terrain.setFrameDriven(true);}
  }
  function stopFlight(){flight.stop();terrain.setLayer(selectedLayer==='political'?'natural':selectedLayer,controls.absolute,settings.detail).catch(e=>onError(e.message));}
  async function setCamera(mode,direction,options={}){if(flight.active)return;controls.setMode(mode,direction);if(options.tilt!=null)controls.renderTilt=controls.tilt=options.tilt;if(options.rangeMeters)controls.setRangeMeters(options.rangeMeters);controls.update(0,origin);resetHistory();await Promise.all([terrain.update(controls.absolute,settings.detail,true),vegetation.update(controls.absolute)]);}
  const markerPoint=new THREE.Vector3();
  function featurePosition(feature){
    if(controls.rangeMeters>=200000)return {x:0,y:0,visible:false};
    let cached=featureCache.get(feature);if(!cached){const d=new THREE.Vector3(...feature.direction),s=sampleTerrain(world,feature.direction);cached={d,p:d.clone().multiplyScalar(1000+(Math.max(s.elevationMeters,s.waterSurfaceMeters)+70)*1000/world.radiusMeters)};featureCache.set(feature,cached);}
    const d=cached.d,p=markerPoint.copy(cached.p);
    const eye=controls.absolute,m=camera.matrixWorld.elements,visible=d.dot(eye)>1000&&(p.x-eye.x)*m[8]+(p.y-eye.y)*m[9]+(p.z-eye.z)*m[10]<0;
    p.sub(origin).project(camera);return {x:(p.x*.5+.5)*canvas.clientWidth,y:(-.5*p.y+.5)*canvas.clientHeight,visible:visible&&controls.rangeMeters<200000&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};
  }
  async function capture(multiplier=2){
    const size=new THREE.Vector2();renderer.getSize(size);const ratio=renderer.getPixelRatio();
    renderer.setAnimationLoop(null);
    const previouslyPaused=appearance.paused,flightPaused=flight.sim?.paused;appearance.paused=true;if(flight.active)flight.pause(true);
    try{await device.queue.onSubmittedWorkDone();rendering=false;renderer.setPixelRatio(ratio*multiplier);resetHistory();for(let i=0;i<8;i++){update();await device.queue.onSubmittedWorkDone();rendering=false;}return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Görüntü kaydedilemedi.')),'image/png'));}
    finally{appearance.paused=previouslyPaused;if(flight.active)flight.pause(flightPaused);renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);if(!hostLoop)renderer.setAnimationLoop(update);}
  }
  function dispose(){regional?.dispose();
    disposed=true;renderer.setAnimationLoop(null);device?.removeEventListener('uncapturederror',onGPUError);resizeObserver.disconnect();canvas.removeEventListener('dblclick',onDoubleClick);flight.dispose();controls.dispose();terrain.dispose();groundMaterial.dispose();vegetation.dispose();fft.dispose();
    oceanMaterial.dispose();for(const mesh of [stars]){mesh.geometry.dispose();mesh.material.dispose();}
    sun.shadow.dispose();regions.dispose();routes.dispose();atmosphere.dispose();scenePass.dispose();atmosphereTexture.dispose();bloomNode.dispose();boostBlur.dispose();pipeline.dispose();renderer.dispose();
  }
  setAppearance(appearance);resize();if(initialCamera){controls.setMode('region',initialCamera.direction);controls.tilt=initialCamera.tilt;controls.setRangeMeters(initialCamera.rangeMeters);}controls.update(0,origin);root.position.copy(origin).negate();root.updateMatrix();
  const initialTerrain=terrain.update(controls.absolute,settings.detail,true);
  // Workers generate the planet while the otherwise idle GPU prepares the
  // flight assets. No animation or other compile pass runs concurrently.
  const initialFlight=flightAssets.then(async loaded=>{if(!loaded)return;const t=performance.now();try{await flight.prewarm(renderer,camera,scene,scenePass.renderTarget);startupStats.flightPreparedBeforeEditor=true;}catch(e){startupStats.preloadError=e.message;}startupStats.initialFlightMilliseconds=performance.now()-t;});
  await Promise.all([initialTerrain,initialFlight]);
  while(terrain.shadows.stats.pending||terrain.shadows.stats.batches===0){terrain.shadows.update(4);if(!terrain.shadows.stats.pending)break;await new Promise(r=>setTimeout(r,0));}
  await vegetation.prewarm(renderer,camera,scene,scenePass.renderTarget,sun);await renderer.compileComputeAsync(fft.passes);
  await prewarmSpace();
  terrain.setFrameDriven(true);
  if(!hostLoop)renderer.setAnimationLoop(update);
  return {world,get workerTransport(){return workerWorldStats(world);},regional,renderer,scene,camera,performanceStats,startupStats,tactical,stormStats:storms.stats,volumeStats:atmosphere.light.stats,controls,flight,startFlight,stopFlight,terrain,vegetation,shared,routes,previewRoute(query){resetHistory();return routes.preview(query);},features:markerFeatures,pick,featurePosition,setCamera,setAppearance,update,capture,dispose,setLayer:layer=>{resetHistory();selectedLayer=layer;regions.mesh.visible=!flight.active&&(layer==='political'||tactical.active);return flight.active?Promise.resolve():terrain.setLayer(layer==='political'?'natural':layer,controls.absolute,settings.detail);},setRenderSettings(next){settings={...settings,...next};shared.steps.value=settings.volumeSteps;sun.shadow.mapSize.set(settings.shadowResolution,settings.shadowResolution);sun.shadow.map?.dispose();sun.shadow.map=null;shadowRevision=-1;shadowOrigin.set(Infinity,Infinity,Infinity);resize();terrain.update(controls.absolute,settings.detail,true);},diagnostics:{backend:'WebGPU',three:THREE.REVISION,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description},features:[...adapter.features],limits:{maxTextureDimension2D:adapter.limits.maxTextureDimension2D,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize},fft:'64 × 64 radix-2 inverse FFT, 12 butterfly passes',temporal:'MSAA 4x scene; half-resolution volume with depth-rejected five-phase history and camera reprojection',lod:'Worker terrain and water patches; horizon culling; regional forests, camera-distance fade 1400–3000 m, stable tree pools; persistent instanced terrain grids and partial storage updates; 2.4 s travel prefetch; half-resolution volumetrics with five-phase depth-rejected history and intracloud lightning'}};
}




