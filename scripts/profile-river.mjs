// Run against a local server. Optional PLAYWRIGHT_MODULE points to an installed
// Playwright ESM entry; no production dependency or user's browser is required.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BENCH_URL||'http://127.0.0.1:4399/';
const out=path.resolve(process.env.BENCH_OUT||'evidence/benchmark');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[],report={date:new Date().toISOString(),url:base,viewport:[1440,1000],scenarios:[]};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{window.__loads=[];const W=Worker;window.Worker=class extends W{constructor(...args){super(...args);this.addEventListener('message',({data:d})=>{if(d.type?.endsWith('-done'))__loads.push({time:performance.now(),type:d.type,ms:d.milliseconds,generated:d.generated,samples:d.samples});});}};window.__long=[];new PerformanceObserver(l=>__long.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});});
const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});await page.bringToFront();
await cdp.send('Performance.enable');
const browserSession=await browser.newBrowserCDPSession();report.hardware=(await browserSession.send('SystemInfo.getInfo')).gpu.devices;
await page.addInitScript(()=>{
 const allocation=new Map(),ids=new WeakMap();let id=0;window.__gpu={allocation,writes:0,writeBytes:0,pipelines:0};
 const create=GPUDevice.prototype.createTexture,destroy=GPUTexture.prototype.destroy,buffer=GPUDevice.prototype.createBuffer,bdestroy=GPUBuffer.prototype.destroy,write=GPUQueue.prototype.writeBuffer;
 GPUDevice.prototype.createTexture=function(d){const t=create.call(this,d),s=d.size,w=s.width??s[0],h=s.height??s[1]??1,z=s.depthOrArrayLayers??s[2]??1,format=d.format;const bpp=({r8unorm:1,rg8unorm:2,rgba8unorm:4,'rgba8unorm-srgb':4,bgra8unorm:4,'bgra8unorm-srgb':4,r16float:2,rg16float:4,rgba16float:8,r32float:4,rg32float:8,rgba32float:16,depth16unorm:2,depth24plus:4,'depth24plus-stencil8':4,depth32float:4})[format];let bytes=0;for(let m=0;m<(d.mipLevelCount??1);m++)bytes+=Math.max(1,w>>m)*Math.max(1,h>>m)*(d.dimension==='3d'?Math.max(1,z>>m):z)*(bpp??4)*(d.sampleCount??1);ids.set(t,++id);allocation.set(id,{kind:'texture',label:d.label,width:w,height:h,depth:z,mips:d.mipLevelCount??1,samples:d.sampleCount??1,format,bytes,estimated:!bpp||format.startsWith('depth24')});return t;};
 GPUTexture.prototype.destroy=function(){allocation.delete(ids.get(this));return destroy.call(this);};
 GPUDevice.prototype.createBuffer=function(d){const b=buffer.call(this,d);ids.set(b,++id);allocation.set(id,{kind:'buffer',label:d.label,bytes:d.size,usage:d.usage});return b;};GPUBuffer.prototype.destroy=function(){allocation.delete(ids.get(this));return bdestroy.call(this);};
 GPUQueue.prototype.writeBuffer=function(b,o,data,offset=0,size){__gpu.writes++;__gpu.writeBytes+=(size??(ArrayBuffer.isView(data)?data.length-offset:data.byteLength-offset))*(data.BYTES_PER_ELEMENT??1);return write.call(this,b,o,data,offset,size);};
 for(const key of ['createRenderPipeline','createRenderPipelineAsync','createComputePipeline','createComputePipelineAsync']){const original=GPUDevice.prototype[key];GPUDevice.prototype[key]=function(...args){__gpu.pipelines++;return original.apply(this,args);};}
});
async function measure(name,ms=6000){
 console.log('MEASURE '+name);
 const metricsBefore=await cdp.send('Performance.getMetrics');
 await page.evaluate(()=>{__bench.frames=[];__bench.raf=[];__bench.last=0;__bench.start=performance.now();__bench.record=true;__bench.pipelineStart=__gpu.pipelines;});
 await page.waitForTimeout(ms);
 const metricsAfter=await cdp.send('Performance.getMetrics');
 const result=await page.evaluate(name=>{
  const b=__bench;b.record=false;const duration=performance.now()-b.start,v=planetStudio.view;
  const stats=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);const q=p=>a[Math.min(a.length-1,Math.floor(a.length*p))]??0;return {n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),mean:a.reduce((s,x)=>s+x,0)/Math.max(1,a.length)};};
  const intervals=b.frames.slice(1).map((f,i)=>f.time-b.frames[i].time),byGroup={};
  const bytes=g=>Object.values(g.attributes).reduce((n,a)=>n+(a.array?.byteLength??a.data?.array.byteLength??0),g.index?.array.byteLength??0);
  const inventory=(name,objects)=>{const geometry=new Set(),textures=new Set(),materials=new Set(),buffers=new Set();let meshes=0,triangles=0,vertices=0,instanceCapacity=0,instances=0,instanceBytes=0;
   for(const root of objects)root.traverse(o=>{if(!o.geometry)return;meshes++;geometry.add(o.geometry);const count=o.isInstancedMesh?o.count:1;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3*count;vertices+=(o.geometry.attributes.position?.count??0)*count;if(o.instanceMatrix){instances+=count;instanceCapacity+=o.instanceMatrix.count;if(!buffers.has(o.instanceMatrix)){buffers.add(o.instanceMatrix);instanceBytes+=o.instanceMatrix.array.byteLength;}}for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;materials.add(m);for(const x of Object.values(m))if(x?.isTexture)textures.add(x);}});
   byGroup[name]={meshes,uniqueGeometries:geometry.size,triangles,vertices,instances,instanceCapacity,geometryBytes:[...geometry].reduce((s,g)=>s+bytes(g),0),instanceBytes,materials:materials.size,textures:[...textures].map(t=>({width:t.image?.width,height:t.image?.height,depth:t.image?.depth,bytes:v.renderer.info._getTextureMemorySize(t),mipmaps:t.generateMipmaps}))};
  };
  inventory('terrainActive',[...v.terrain.active.values()]);inventory('waterActive',[...v.terrain.water.values()]);inventory('terrainCached',[...v.terrain.cache.values()].flatMap(p=>[p.mesh,...(p.water?[p.water]:[])]));inventory('forest',[v.vegetation.group]);inventory('terrainShadowBatches',v.terrain.group.children.filter(m=>m.userData.shadowBatch));inventory('wholeScene',[v.scene]);
  return {name,duration,visibility:document.visibilityState,renderedFrames:b.frames.length,renderFps:b.frames.length*1000/duration,frameMs:stats(intervals),over33:intervals.filter(x=>x>34).length,over50:intervals.filter(x=>x>50).length,over100:intervals.filter(x=>x>100).length,cpuMs:stats(b.frames.map(f=>f.cpu)),drawCalls:stats(b.frames.map(f=>f.draws)),triangles:stats(b.frames.map(f=>f.triangles)),passes:stats(b.frames.map(f=>f.passes)),computePasses:stats(b.frames.map(f=>f.compute)),gpuRenderMs:stats(b.frames.map(f=>f.gpuRender)),gpuComputeMs:stats(b.frames.map(f=>f.gpuCompute)),gpuTimestampAvailable:v.renderer.backend.device.features.has('timestamp-query'),frames:b.frames,memory:{...v.renderer.info.memory},jsHeap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,inventory:byGroup,terrain:{...v.terrain.stats,cache:v.terrain.cache.size,ready:v.terrain.ready.size,inbox:v.terrain.inbox.length},forest:{...v.vegetation.stats},worldBufferBytes:Object.values(planetStudio.world.buffers).reduce((s,a)=>s+a.byteLength,0),longTasks:__long.filter(x=>x.start>=b.start),loads:__loads.filter(x=>x.time>=b.start),flight:v.flight.active?{state:v.flight.sim.state,agl:v.flight.sim.agl,speed:v.flight.sim.speed,projectiles:v.flight.sim.projectiles.length,enemies:v.flight.sim.enemies.length}:null};
 },name);
 if(result.renderedFrames<ms/1000*8||result.visibility!=='visible')throw Error('Invalid/throttled benchmark: '+name);
 result.gpuAllocations=await page.evaluate(()=>({resources:[...__gpu.allocation.values()],pipelineCount:__gpu.pipelines,newPipelines:__gpu.pipelines-__bench.pipelineStart,uploads:{calls:__bench.frames.reduce((s,f)=>s+(f.writes??0),0),bytes:__bench.frames.reduce((s,f)=>s+(f.writeBytes??0),0)}}));
 result.cpuTotals=Object.fromEntries(metricsAfter.metrics.filter(m=>/Duration|Count/.test(m.name)).map(m=>[m.name,m.value-(metricsBefore.metrics.find(b=>b.name===m.name)?.value??0)]));
 result.scheduling=await page.evaluate(()=>({view:planetStudio.view.performanceStats??null,shadows:planetStudio.view.terrain.shadows?.stats??null}));
 report.scenarios.push(result);await writeFile(out+'/benchmark.json',JSON.stringify({...report,errors},null,2));
 console.log(JSON.stringify({name,fps:result.renderFps,frame:result.frameMs,cpu:result.cpuMs.p95,draws:result.drawCalls.p50,triangles:result.triangles.p50,gpu:result.gpuRenderMs.p50,memoryMB:result.memory.total/1048576}));
 return result;
}
async function altitude(m){await page.evaluate(async m=>{const v=planetStudio.view;v.controls.setAltitudeMeters(m);await v.terrain.update(v.controls.absolute,1,true);await v.vegetation.update(v.controls.absolute);},m);await page.waitForTimeout(1800);}

const route={seed:'LUMEN-742',referenceOffset:[-19200,48000],version:1,scenarios:[['mountain',-11000,10000,6500,.75],['plain',-9000,-10000,1500,.8],['lake',800,-3500,1800,.6],['river-low-flight',-1400,2000,200,.5],['canyon-turn',8400,-5000,500,.7],['boost-release',-9000,-10000,550,.7],['combat',-9000,-10000,600,.7]]};
async function visit(x,y,range,tilt){return page.evaluate(async({x,y,range,tilt})=>{const w=planetStudio.world,v=planetStudio.view,d=w.frame.center.map((a,k)=>a+w.frame.east[k]*(x-19200)/w.radiusMeters+w.frame.north[k]*(y+48000)/w.radiusMeters),length=Math.hypot(...d);for(let i=0;i<3;i++)d[i]/=length;const t=performance.now();await v.setCamera('region',d,{rangeMeters:range,tilt});await v.terrain.update(v.controls.absolute,1,true);return {milliseconds:performance.now()-t,direction:d,terrain:{...v.terrain.stats}};},{x,y,range,tilt});}
async function flying(x,y,agl){
 if(await page.evaluate(()=>planetStudio.view.flight.active))await page.locator('#editor-mode').click();
 await visit(x,y,500,.6);await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:120000});
 const box=await page.locator('#planet').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.evaluate(agl=>{const f=planetStudio.view.flight,s=f.sim;s.position.setLength(s.radius+s.groundHeight+agl);s.pitch=0;s.health=100;s.cruising=false;s.boosting=false;s.snapshot();s.refreshGround();},agl);
 await page.waitForTimeout(1000);
}
try{
 const start=Date.now();await page.goto(base);await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden,null,{timeout:180000});report.startupMs=Date.now()-start;report.route=route;
 report.environment=await page.evaluate(()=>({diagnostics:planetStudio.view.diagnostics,settings:planetStudio.settings,userAgent:navigator.userAgent,worldHash:planetStudio.world.manifest.worldDataHash,radius:planetStudio.world.radiusMeters,generator:planetStudio.world.manifest.generatorVersion}));
 await page.evaluate(()=>{const v=planetStudio.view,r=v.renderer;window.__bench={record:false,frames:[],raf:[],last:0};r.info.autoReset=false;r.backend.trackTimestamp=r.backend.device.features.has('timestamp-query');let reading=false;
  r.setAnimationLoop(t=>{const b=__bench;r.info.reset();__gpu.writes=0;__gpu.writeBytes=0;const start=performance.now();v.update(t);const cpu=performance.now()-start;if(!r.info.render.frameCalls)return;const f={time:t,cpu,draws:r.info.render.drawCalls,triangles:r.info.render.triangles,passes:r.info.render.frameCalls,compute:r.info.compute.frameCalls,writes:__gpu.writes,writeBytes:__gpu.writeBytes};if(b.record)b.frames.push(f);
   if(r.backend.trackTimestamp&&!reading){reading=true;Promise.all(['render','compute'].map(async type=>{await r.resolveTimestampsAsync(type);const times=[...(r.backend.timestampQueryPool[type]?.timestamps?.entries()??[])],frames=new Set(times.map(([key])=>key.match(/:f(\d+)$/)?.[1]));f[type==='render'?'gpuRender':'gpuCompute']=times.reduce((s,[,x])=>s+x,0)/Math.max(1,frames.size);})).finally(()=>reading=false);}
  });
 });
 await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 await flying(-1400,2000,200);await page.keyboard.press('KeyW');await measure('river-profile',16000);
 const {profile}=await cdp.send('Profiler.stop');await writeFile(out+'/cpu.json',JSON.stringify(profile));
 report.final=await page.evaluate(()=>({terrain:planetStudio.view.terrain.stats,flight:planetStudio.view.startupStats}));
}catch(e){report.failure=e.stack;throw e;}finally{report.errors=errors;await writeFile(out+'/benchmark.json',JSON.stringify(report,null,2));await browser.close();}
