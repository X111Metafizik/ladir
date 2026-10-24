import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const sharedBase=process.argv[2]||'http://127.0.0.1:4399',copyBase=process.argv[3];
if(!copyBase)throw Error('Usage: node scripts/verify-wasm-browser.mjs <isolated-url> <non-isolated-url>');
const out='evidence/v39/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={scope:'Functional browser smoke, not an FPS comparison',cases:[]};
try{
 for(const [mode,base,isolated,kernelMode] of [['wasm-shared',sharedBase,true,'auto'],['js-shared',sharedBase,true,'js'],['wasm-copy',copyBase,false,'auto'],['blocked-wasm',sharedBase,true,'auto']]){
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await context.newPage(),entry={mode,errors:[],consoleErrors:[]};report.cases.push(entry);
  if(mode==='blocked-wasm')await context.route('**/terrain-kernel.wasm',route=>route.fulfill({status:200,contentType:'application/wasm',body:'invalid-wasm'}));
  page.on('pageerror',e=>{entry.errors.push(e.message);console.log(mode+': page error: '+e.message);});page.on('console',m=>{if(m.type()==='error')entry.consoleErrors.push(m.text());});
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  try{
   console.log(mode+': loading production build');
   await page.goto(base+'/dist/?world=fixtures/lumen-v35.planet&view=reference&region=baked&v=39&terrainKernel='+kernelMode);
   await page.waitForFunction(()=>(window.planetStudio?.view&&document.querySelector('#loading').hidden)||!document.querySelector('#error').hidden,null,{timeout:240000});
   const appError=await page.locator('#error').isVisible();if(appError)throw Error(await page.locator('#error-message').innerText());
   entry.start=await page.evaluate(()=>({isolated:crossOriginIsolated,kernel:planetStudio.view.terrainKernel,transport:planetStudio.view.workerTransport,hash:planetStudio.world.manifest.worldDataHash,radius:planetStudio.world.radiusMeters,activePatches:planetStudio.view.terrain.active.size,backend:planetStudio.view.diagnostics.backend}));
   assert.equal(entry.start.isolated,isolated);assert.equal(entry.start.transport.mode,isolated?'shared':'copy');assert.equal(entry.start.kernel.mode,mode==='js-shared'||mode==='blocked-wasm'?'js':'wasm');assert.equal(entry.start.radius,4000000);assert.ok(entry.start.activePatches>0);
   await page.evaluate(async()=>{const {referenceDirection}=await import('/core/landforms.mjs');await planetStudio.view.setCamera('region',referenceDirection(planetStudio.world,-9000,-11000),{rangeMeters:1000,tilt:.62});});
   console.log(mode+': entering flight');
   await page.locator('#flight-mode').click();
   await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:120000});
   await page.keyboard.down('Space');await page.waitForTimeout(1500);await page.keyboard.up('Space');await page.waitForTimeout(1500);
   await page.waitForFunction(()=>planetStudio.view.terrain.stats.kernels?.length>0,null,{timeout:120000});
   entry.flight=await page.evaluate(()=>{const v=planetStudio.view,s=v.flight.sim;return {state:s.state,health:s.health,speed:s.speed,agl:s.agl,position:s.position.toArray(),activePatches:v.terrain.active.size,transport:v.workerTransport,kernel:v.terrainKernel,workerKernels:v.terrain.stats.kernels,plannerKernel:v.terrain.stats.plannerKernel};});
   for(const k of entry.flight.workerKernels)assert.equal(k.mode,entry.start.kernel.mode);assert.equal(entry.flight.plannerKernel.mode,entry.start.kernel.mode);
   assert.equal(entry.flight.state,'flying');assert.ok(entry.flight.position.every(Number.isFinite));assert.ok(entry.flight.activePatches>0);
   await page.screenshot({path:out+'/'+mode+'-flight.png'});
   console.log(mode+': preparing warp destination worker');
   await page.evaluate(()=>{const v=planetStudio.view;v.flight.pause(true);v.terrain.prepareArrival(v.flight.absolute.clone(),1);});
   await page.waitForFunction(()=>planetStudio.view.terrain.arrival?.ready,null,{timeout:120000});
   entry.arrival=await page.evaluate(()=>{const v=planetStudio.view,t=v.terrain;const result={ready:t.arrival.ready,records:t.arrival.records.size,transport:v.workerTransport};t.cancelArrival();result.retainedPatches=t.active.size;return result;});
   assert.equal(entry.arrival.ready,true);assert.ok(entry.arrival.retainedPatches>0);
   if(isolated){assert.ok(entry.arrival.transport.sharedDispatches>entry.start.transport.sharedDispatches);assert.equal(entry.arrival.transport.metadataPreparationMs,entry.start.transport.metadataPreparationMs);}
   else assert.equal(entry.arrival.transport.sharedDispatches,0);
   assert.equal(entry.errors.length,0);assert.equal(entry.consoleErrors.length,0);entry.passed=true;
   console.log(mode+': passed');
  }catch(error){entry.failure=error.stack;await page.screenshot({path:out+'/'+mode+'-failure.png'}).catch(()=>{});throw error;}
  finally{await writeFile(out+'/browser.json',JSON.stringify(report,null,2)+'\n');await context.close();}
 }
 assert.equal(report.cases[0].start.hash,report.cases[1].start.hash);
 console.log(JSON.stringify({passed:report.cases.map(c=>c.mode),worldHash:report.cases[0].start.hash}));
}finally{await browser.close();}
