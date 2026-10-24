// Identical saved world, recorded 60 s route, three cold/warm pairs. Headless
// presentation is NOT a 100 Hz test. No quality or production physics override.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.BENCH_URL||'http://127.0.0.1:4399/dist/?world=fixtures/lumen-v33.planet&view=stamps';
const out=path.resolve(process.env.BENCH_OUT||'evidence/v34/endurance');await mkdir(out,{recursive:true});
const pinnedRoute=process.env.BENCH_ROUTE?JSON.parse(await readFile(process.env.BENCH_ROUTE,'utf8')):null;
const repeats=Number(process.env.BENCH_REPEATS||3),report={date:new Date().toISOString(),url,viewport:[1440,1000],runs:[],errors:[],method:'Three fresh browser contexts; replay in each for warm cache. Recorded geographic repositioning between scenarios is included in timing. Warp cooldown reset between scenarios only. Default quality. GPU timestamps summed by actual animation frame id, never averaged across frames.'};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']});
report.hardware=(await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo')).gpu.devices;
async function save(){await writeFile(path.join(out,'benchmark.json'),JSON.stringify(report,null,2));}
try{for(let repeat=1;repeat<=repeats;repeat++){
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push({repeat,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({repeat,message:m.text()});});
 await page.addInitScript(()=>{
  window.__long=[];new PerformanceObserver(l=>__long.push(...l.getEntries().map(e=>({time:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});
  window.__alloc={live:0,peak:0,created:0,writeBytes:0,createMs:0};const sizes=new WeakMap();
  const create=GPUDevice.prototype.createBuffer,dispose=GPUBuffer.prototype.destroy,write=GPUQueue.prototype.writeBuffer;
  GPUDevice.prototype.createBuffer=function(d){const t=performance.now(),b=create.call(this,d);__alloc.createMs+=performance.now()-t;sizes.set(b,d.size);__alloc.live+=d.size;__alloc.created+=d.size;__alloc.peak=Math.max(__alloc.peak,__alloc.live);return b;};
  GPUBuffer.prototype.destroy=function(){__alloc.live-=sizes.get(this)??0;sizes.delete(this);return dispose.call(this);};
  GPUQueue.prototype.writeBuffer=function(b,o,d,offset=0,size){__alloc.writeBytes+=(size??(ArrayBuffer.isView(d)?d.length-offset:d.byteLength-offset))*(d.BYTES_PER_ELEMENT??1);return write.call(this,b,o,d,offset,size);};
 });
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 const load=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden,null,{timeout:180000});
 const startupMs=Date.now()-load,flightStart=Date.now();await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:180000});
 const flightStartupMs=Date.now()-flightStart;const box=await page.locator('#planet').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.evaluate(()=>{
  const v=planetStudio.view,r=v.renderer,w=v.world,s=v.flight.sim;
  const local=(x,y)=>w.frame.center.map((n,k)=>n+(w.frame.east[k]*x+w.frame.north[k]*y)/w.radiusMeters);
  const mark=id=>w.landmarks.find(l=>l.id===id)?.direction;
  window.__route={forest:mark('forest')??local(-28200,38000),lake:w.hydrology.lakes[0]?.direction??local(-18400,44500),river:w.hydrology.rivers[0]?.points[12]?.direction??local(-20600,50000),canyon:mark('reference-canyon')??mark('rift')??local(-10800,43000),plain:local(-28200,38000),seam:[1-.00004,.02,1],pole:[.00005,1,0]};
  window.__bench={frames:[],events:[],samples:[],record:false,phase:'idle',gpu:new Map(),lastSample:0};
  window.__place=(direction,agl=600,heading=null,pitch=0)=>{
   v.flight.clearInput();v.terrain.cancelArrival();s.state='flying';s.warpPath=null;Object.assign(s.skills.warp,{phase:'idle',remaining:0,cooldown:0,travelRemaining:0});
   s.up.fromArray(direction).normalize();s.position.copy(s.up).multiplyScalar(s.radius+s.ground(s.up).height+agl);
   s.heading.fromArray(heading??[0,1,0]).addScaledVector(s.up,-s.heading.dot(s.up));if(s.heading.lengthSq()<1e-9)s.heading.set(0,0,1).addScaledVector(s.up,-s.up.z);s.heading.normalize();
   s.forward.copy(s.heading).multiplyScalar(Math.cos(pitch)).addScaledVector(s.up,Math.sin(pitch)).normalize();s.right.crossVectors(s.forward,s.up).normalize();
   Object.assign(s,{pitch,speed:700/3.6,health:100,paused:false,cruising:true,boosting:false,boostEnergy:100,boostExhausted:false,fallSpeed:0,bank:0,rollAngle:0});s.velocity.copy(s.forward).multiplyScalar(s.speed);s.snapshot();s.refreshGround();
   for(const enemy of s.enemies){enemy.mode='return';enemy.cooldown=9999;enemy.visibleToPlayer=false;}v.terrain.lastPosition.set(1e9,0,0);
  };
  window.__sample=()=>{const t=v.terrain;t.measureMemory?.();return {time:performance.now()-__bench.start,phase:__bench.phase,state:s.state,health:s.health,agl:s.agl,position:s.position.toArray(),warp:{...s.skills.warp},warpEvent:s.warpEvent,terrain:{...t.stats,active:t.active.size,water:t.water.size,ready:t.ready.size,inbox:t.inbox.length,warm:t.warmQueue.length},grids:{...t.batches.stats},waterBatches:t.waterBatches?.stats,uploads:t.uploadStats,heap:performance.memory?.usedJSHeapSize,buffers:{...__alloc},drawMemory:{...r.info.memory},performance:{...v.performanceStats}};};
  r.info.autoReset=false;r.backend.trackTimestamp=r.backend.device.features.has('timestamp-query');let reading=null;
  window.__resolveGpu=()=>{if(reading)return reading;reading=Promise.all(['render','compute'].map(async type=>{await r.resolveTimestampsAsync(type);const totals=new Map();for(const [key,ms]of r.backend.timestampQueryPool[type]?.timestamps??[]){const id=Number(key.match(/:f(\d+)$/)?.[1]);totals.set(id,(totals.get(id)??0)+ms);}for(const [id,ms]of totals){let x=__bench.gpu.get(id);if(!x)__bench.gpu.set(id,x={});x[type]=ms;}})).finally(()=>reading=null);return reading;};
  r.setAnimationLoop(time=>{r.info.reset();const before={...__alloc},start=performance.now();v.update(time);const cpu=performance.now()-start;
   if(__bench.record&&r.info.render.frameCalls){__bench.frames.push({id:r.info.frame,time:time-__bench.start,phase:__bench.phase,cpu,draws:r.info.render.drawCalls,triangles:r.info.render.triangles,passes:r.info.render.frameCalls,bufferAllocBytes:__alloc.created-before.created,bufferAllocMs:__alloc.createMs-before.createMs,writeBytes:__alloc.writeBytes-before.writeBytes});if(time-__bench.lastSample>500){__bench.lastSample=time;__bench.samples.push(__sample());}}
   if(r.backend.trackTimestamp&&!reading)__resolveGpu();
  });
 });
 if(pinnedRoute)await page.evaluate(route=>window.__route=route,pinnedRoute);
 const environment=await page.evaluate(()=>({settings:planetStudio.settings,world:planetStudio.world.manifest,radius:planetStudio.world.radiusMeters,route:__route,diagnostics:planetStudio.view.diagnostics,userAgent:navigator.userAgent}));
 for(const cache of ['cold','warm']){
  console.log(`START ${repeat} ${cache}`);
  const result=await page.evaluate(async()=>{
   const b=__bench,v=planetStudio.view,s=v.flight.sim;b.frames=[];b.samples=[];b.events=[];b.gpu.clear();b.start=performance.now();b.record=true;
   const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
   const phases=[
    [0,'forest-low',()=>__place(__route.forest,800)],
    [8,'lake',()=>__place(__route.lake,450)],
    [11,'river',()=>__place(__route.river,600)],
    [14,'canyon-turn',()=>{__place(__route.canyon,1000);v.flight.pointer.x=.18;}],
    [18,'boost',()=>{__place(__route.plain,800);key('keydown','Space');}],
    [21,'boost-release',()=>key('keyup','Space')],
    [24,'combat',()=>{for(let i=0;i<s.enemies.length;i++)s.enemies[i]=s.createEnemy(i);s.input.left=s.input.right=true;}],
    [27,'short-warp',()=>{__place(__route.plain,15000);v.flight.activateSkill(1);v.flight.selectWarpDistance(1_000_000);}],
    [34,'long-warp',()=>{__place(__route.plain,15000,null,1.2);v.flight.activateSkill(1);v.flight.selectWarpDistance(12_000_000);}],
    [50,'cube-face',()=>__place(__route.seam,1000,[1,0,-1])],
    [55,'pole',()=>__place(__route.pole,1000,[-1,0,0])]
   ];
   for(const [seconds,name,action]of phases){await new Promise(r=>setTimeout(r,Math.max(0,b.start+seconds*1000-performance.now())));b.samples.push(__sample());b.phase=name;const t=performance.now();action();b.events.push({name,scheduled:seconds*1000,actual:t-b.start,actionMs:performance.now()-t,position:s.position.toArray(),heading:s.heading.toArray(),fov:v.camera.fov});}
   await new Promise(r=>setTimeout(r,Math.max(0,b.start+60000-performance.now())));b.record=false;const duration=performance.now()-b.start;b.samples.push(__sample());v.flight.clearInput();await __resolveGpu();
   for(const f of b.frames)Object.assign(f,{gpu:b.gpu.get(f.id)});
   const stats=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>a[Math.min(a.length-1,Math.floor(a.length*p))]??null;return {n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)};};
   const summarize=frames=>{const intervals=frames.slice(1).map((f,i)=>f.time-frames[i].time);return {frames:frames.length,cpu:stats(frames.map(f=>f.cpu)),gpuRender:stats(frames.map(f=>f.gpu?.render)),gpuCompute:stats(frames.map(f=>f.gpu?.compute)),frame:stats(intervals),over50:intervals.filter(t=>t>50).length,over100:intervals.filter(t=>t>100).length,draws:stats(frames.map(f=>f.draws)),passes:stats(frames.map(f=>f.passes)),bufferAllocation:stats(frames.map(f=>f.bufferAllocBytes)),bufferAllocationMs:stats(frames.map(f=>f.bufferAllocMs)),writeBytes:stats(frames.map(f=>f.writeBytes))};};
   return {duration,renderFps:b.frames.length*1000/duration,summary:summarize(b.frames),scenarios:Object.fromEntries([...new Set(b.frames.map(f=>f.phase))].map(p=>[p,summarize(b.frames.filter(f=>f.phase===p))])),events:b.events,samples:b.samples,frames:b.frames,longTasks:__long.filter(l=>l.time>=b.start&&l.time<b.start+duration),visible:document.visibilityState,gpuTimestampAvailable:v.renderer.backend.trackTimestamp};
  });
  Object.assign(result,{repeat,cache,startupMs,flightStartupMs,environment});report.runs.push(result);await save();
  console.log(JSON.stringify({repeat,cache,fps:result.renderFps,cpu:result.summary.cpu,gpu:result.summary.gpuRender,frame:result.summary.frame}));
  await page.screenshot({path:path.join(out,`end-${repeat}-${cache}.png`)});
 }
 await context.close();
}}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.stack);}finally{await save();await browser.close();}
