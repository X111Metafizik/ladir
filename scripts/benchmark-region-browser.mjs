import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.BENCH_OUT??'evidence/v36/browser',origin='http://127.0.0.1:4399';
await mkdir(out,{recursive:true});
const route=[
 {name:'mountain',x:-11000,y:10000,range:2000,tilt:.65},
 {name:'plain',x:-9000,y:-11000,range:1400,tilt:.68},
 {name:'lake',x:800,y:-3500,range:2400,tilt:.62},
 {name:'river',x:1200,y:-9000,range:1500,tilt:.66},
 {name:'canyon',x:8400,y:-3500,range:1900,tilt:.65}
];
await writeFile(out+'/camera-route.json',JSON.stringify({seed:'LUMEN-742',radiusMeters:4000000,fov:48,viewport:[1440,1000],route},null,2));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion']});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const report={started:new Date().toISOString(),errors:[],conditions:[],route,notes:['CPU/GPU timings are overlapping; never added.','RAF scheduling is approximately 60 Hz here, so this run cannot certify 100 FPS.','legacy is the unchanged continuous generator; procedural uses the same canonical sampling as cold/warm. All maintain renderer quality.','GPU upload ms measures CPU submission; GPU frame timestamps include rendering, not isolated DMA.']};
const modes=process.env.REGION_MODES?.split(',')??['legacy','procedural','cold','warm'];
try{
 for(const mode of modes){
  const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  page.on('pageerror',e=>report.errors.push({mode,error:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({mode,error:m.text()});});
  if(mode==='cold'){await page.goto(origin+'/assets/terrain-stamps/sources.html');await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.deleteDatabase('atlas-regions-v1');r.onsuccess=r.onerror=r.onblocked=()=>resolve();}));}
  const start=Date.now(),url=origin+'/dist/?world=fixtures/lumen-v35.planet&view=reference&v=36&region='+(['cold','warm'].includes(mode)?'baked':mode)+'&meshBake=off';
  console.log('START '+mode);await page.goto(url);
  await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden,null,{timeout:240000});
  const condition={mode,url,startupMs:Date.now()-start,scenes:[],world:await page.evaluate(()=>({identity:planetStudio.world.manifest,radius:planetStudio.world.radiusMeters,settings:planetStudio.settings,adapter:planetStudio.view.diagnostics.adapter}))};
  await page.evaluate(()=>{
   const v=planetStudio.view,r=v.renderer;window.__route={frames:[],times:new Map(),record:false,longTasks:[],peakHeap:0};
   new PerformanceObserver(list=>{if(__route.record)for(const e of list.getEntries())__route.longTasks.push({start:e.startTime,ms:e.duration});}).observe({entryTypes:['longtask']});
   r.info.autoReset=false;r.backend.trackTimestamp=r.backend.device.features.has('timestamp-query');let reading=false;
   r.setAnimationLoop(t=>{r.info.reset();const s=performance.now();v.update(t);if(__route.record&&r.info.render.frameCalls){__route.frames.push({id:r.info.frame,time:t,cpu:performance.now()-s,draws:r.info.render.drawCalls,triangles:r.info.render.triangles});__route.peakHeap=Math.max(__route.peakHeap,performance.memory?.usedJSHeapSize??0);}
    if(!reading&&r.backend.trackTimestamp){reading=true;r.resolveTimestampsAsync('render').then(()=>{const sums=new Map();for(const [k,n]of r.backend.timestampQueryPool.render?.timestamps??[]){const id=Number(k.match(/:f(\d+)$/)?.[1]);if(Number.isFinite(id))sums.set(id,(sums.get(id)??0)+n);}for(const [id,n]of sums)__route.times.set(id,n);}).finally(()=>reading=false);}
   });
   window.__begin=()=>{__route.frames=[];__route.longTasks=[];__route.peakHeap=0;__route.record=true;};
   window.__collect=()=>{__route.record=false;const v=planetStudio.view,t=v.terrain;t.measureMemory();const frames=__route.frames.map(f=>({...f,gpu:__route.times.get(f.id)})),intervals=frames.slice(1).map((f,i)=>f.time-frames[i].time),q=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);const at=p=>a[Math.min(a.length-1,Math.floor(p*a.length))];return {n:a.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
    return {frames:frames.length,fps:frames.length>1?(frames.length-1)*1000/(frames.at(-1).time-frames[0].time):0,frame:q(intervals),cpu:q(frames.map(f=>f.cpu)),gpu:q(frames.map(f=>f.gpu)),longFrames50:intervals.filter(n=>n>50).length,longFrames100:intervals.filter(n=>n>100).length,longTasks:__route.longTasks,peakMainHeap:__route.peakHeap,terrain:{...t.stats},grids:{...t.batches.stats},water:{...t.waterBatches.stats},vegetation:{...v.vegetation.stats},region:v.regional?.snapshot(),gpuMemory:r.info.memory,geometryKeys:[...t.active.keys()].sort(),camera:{position:v.controls.absolute.toArray(),target:v.controls.focus.toArray(),fov:v.camera.fov},errors:document.querySelector('#error').hidden?null:document.querySelector('#error-message').textContent};
   };
  });
  for(const scene of route){
   console.log(mode+' '+scene.name);
   const before=await page.evaluate(()=>({grids:{...planetStudio.view.terrain.batches.stats},production:{...planetStudio.view.terrain.stats.production},regions:planetStudio.view.terrain.stats.regions,regional:planetStudio.view.regional?.snapshot()}));
   await page.evaluate(()=>__begin());const started=Date.now();
   await page.evaluate(async scene=>{
    const v=planetStudio.view,w=planetStudio.world,{referenceDirection}=await import('/core/landforms.mjs');
    const d=referenceDirection(w,scene.x,scene.y);v.setAppearance({paused:true,lightAnchor:d});await v.setCamera('region',d,{rangeMeters:scene.range,tilt:scene.tilt});
   },scene);
   await page.waitForFunction(()=>!planetStudio.view.terrain.building&&!planetStudio.view.terrain.warmQueue.length,null,{timeout:180000});
   const fullDetailMs=Date.now()-started,loading=await page.evaluate(()=>__collect());
   await page.waitForTimeout(1000);await page.evaluate(()=>__begin());await page.waitForTimeout(4000);const steady=await page.evaluate(()=>__collect());
   const result={...scene,fullDetailMs,loading,steady,before};condition.scenes.push(result);
   await page.screenshot({path:out+'/'+mode+'-'+scene.name+'.png'});
   console.log(JSON.stringify({mode,scene:scene.name,fullDetailMs,firstSurfaceMs:loading.terrain.firstVisibleMilliseconds,fps:steady.fps,p99:loading.frame.p99,gpu:steady.gpu.p50,region:steady.region?.tilesLoaded}));
   await writeFile(out+'/comparison.json',JSON.stringify({...report,conditions:[...report.conditions,condition]},null,2));
  }
  report.conditions.push(condition);await page.close();await writeFile(out+'/comparison.json',JSON.stringify(report,null,2));
 }
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.stack);}finally{await writeFile(out+'/comparison.json',JSON.stringify(report,null,2));await browser.close();}
