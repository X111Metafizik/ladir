// Measure the user's actual complaint separately: time from flight entry to
// full terrain geometry, not merely disappearance of the loading overlay.
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.BENCH_OUT??'evidence/v41/loading',url=process.env.BENCH_URL??'http://127.0.0.1:4399/dist/?world=fixtures/lumen-v35.planet';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage(),report={url,runs:[],errors:[],method:'Same saved world, camera and default quality; stationary flight isolates mesh readiness from movement. Cold then reload with the same browser cache. First surface and full detail are separate. CPU/GPU competition from other applications is not controlled.'};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
try{for(const cache of ['cold','warm']){
 const load=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden,null,{timeout:180000});
 const editorReadyMs=Date.now()-load,initial=await page.evaluate(()=>({...planetStudio.view.startupStats}));
 if(process.env.BENCH_FOCUS)await page.evaluate(([lat,lon,heading])=>{const c=planetStudio.view.controls,a=lat*Math.PI/180,b=lon*Math.PI/180;c.focus.set(Math.sin(b)*Math.cos(a),Math.sin(a),Math.cos(b)*Math.cos(a));c.yaw=heading*Math.PI/180;},process.env.BENCH_FOCUS.split(',').map(Number));
 const start=Date.now();console.log(JSON.stringify({cache,editorReadyMs,stage:'enter-flight'}));
 await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:180000});
 const cockpitReadyMs=Date.now()-start;console.log(JSON.stringify({cache,cockpitReadyMs,stage:'wait-for-detail'}));
 await page.evaluate(()=>{const v=planetStudio.view,s=v.flight.sim;s.cruising=false;s.speed=0;s.velocity.set(0,0,0);s.clearInput?.();v.flight.clearInput();window.__loadingStart=performance.now();window.__loadingSamples=[];window.__loadingTimer=setInterval(()=>{const t=v.terrain;t.measureMemory();__loadingSamples.push({ms:performance.now()-__loadingStart,building:t.building,preview:t.preview,active:t.active.size,ready:t.ready.size,inbox:t.inbox.length,warm:t.warmQueue.length,groups:t.transitions.length,largestGroup:Math.max(0,...t.transitions.map(g=>g.add.length)),stats:{...t.stats},performance:{...v.performanceStats}});},500);});
 await page.screenshot({path:`${out}/${cache}-first.png`});
 await page.waitForFunction(()=>{const t=planetStudio.view.terrain;return !t.building&&!t.preview&&t.warmQueue.length===0&&!t.inbox.length;},null,{timeout:180000});
 const detailReadyMs=Date.now()-start;
 const data=await page.evaluate(()=>{clearInterval(__loadingTimer);const v=planetStudio.view;return {startup:v.startupStats,terrain:v.terrain.stats,history:v.terrain.history,samples:__loadingSamples,camera:v.flight.absolute.toArray(),fov:v.camera.fov,settings:planetStudio.settings,worldHash:v.world.manifest.worldDataHash,radius:v.world.radiusMeters,kernel:v.terrainKernel,hardware:v.diagnostics.adapter,heap:performance.memory?.usedJSHeapSize};});
 await page.screenshot({path:`${out}/${cache}-detailed.png`});
 const settleStart=Date.now();let cacheSettled=true;try{await page.waitForFunction(()=>(planetStudio.view.terrain.stats.bake?.bakeQueuedBytes??0)===0,null,{timeout:20000});}catch{cacheSettled=false;}
 report.runs.push({cache,editorReadyMs,cockpitReadyMs,detailReadyMs,cacheSettled,cacheSettleMs:Date.now()-settleStart,initial,...data});await writeFile(`${out}/loading.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({cache,editorReadyMs,cockpitReadyMs,detailReadyMs,cacheSettled,bake:data.terrain.bake}));
 }}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.stack);}finally{await writeFile(`${out}/loading.json`,JSON.stringify(report,null,2));await browser.close();}
