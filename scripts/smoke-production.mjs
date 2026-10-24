// Functional production/shader validation. Software GPU results are never FPS evidence.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.SMOKE_OUT||'test-results/browser');await mkdir(out,{recursive:true});
const report={scope:'Production editor/flight and generated shader validation; not a performance benchmark',softwareGpu:process.env.BROWSER_SOFTWARE_GPU==='1',viewport:[960,640],errors:[],consoleErrors:[]};
const server=spawn(process.execPath,['scripts/serve.mjs','--dist'],{env:{...process.env,PORT:'0',WORLD_SHARED_MEMORY:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let browser,serverLog='';server.stderr.on('data',b=>{serverLog+=b;});
try{
 const base=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Production server startup timed out')),20000);let stdout='';
  server.stdout.on('data',b=>{stdout+=b;serverLog+=b;const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  server.once('error',error=>{clearTimeout(timer);reject(error);});server.once('exit',code=>{clearTimeout(timer);reject(Error('Production server exited: '+code));});
 });
 const args=['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding'];
 if(report.softwareGpu)args.push('--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface');
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true,args});
 const context=await browser.newContext({viewport:{width:960,height:640},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  const state=window.__gpuValidation={modules:0,pending:0,errors:[],lost:[]};
  if(!globalThis.GPUDevice)return;
  const original=GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule=function(descriptor){
   const module=original.call(this,descriptor);state.modules++;state.pending++;
   module.getCompilationInfo().then(info=>{for(const m of info.messages)if(m.type==='error')state.errors.push({label:descriptor.label??'',message:m.message,line:m.lineNum});},error=>state.errors.push({message:String(error)})).finally(()=>state.pending--);
   return module;
  };
  const request=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){
   const device=await request.apply(this,args);
   device.addEventListener('uncapturederror',event=>state.errors.push({message:event.error.message}));
   device.lost.then(info=>{if(info.reason!=='destroyed')state.lost.push({reason:info.reason,message:info.message});});
   return device;
  };
 });
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
 page.setDefaultTimeout(30000);
 const started=Date.now();await page.goto(base+'/?world=fixtures/lumen-v35.planet&view=reference&region=baked');
 await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden||!document.querySelector('#error').hidden,null,{timeout:300000});
 if(await page.locator('#error').isVisible())throw Error(await page.locator('#error-message').innerText());
 report.editor=await page.evaluate(()=>{const v=planetStudio.view;return {radius:v.world.radiusMeters,worldHash:v.world.manifest.worldDataHash,kernel:v.terrainKernel,backend:v.diagnostics.backend,adapter:v.diagnostics.adapter,patches:v.terrain.active.size,isolated:crossOriginIsolated};});
 report.editor.observedReadyMs=Date.now()-started;
 assert.equal(report.editor.worldHash,'595aee80687ce1d3acf102bfd9e8bb925f9b5ee4a3bca2bdc3fca5f58b2b463d');assert.equal(report.editor.radius,4000000);assert.equal(report.editor.backend,'WebGPU');assert.equal(report.editor.kernel.mode,'wasm');assert.ok(report.editor.isolated&&report.editor.patches>0);
 await page.screenshot({path:path.join(out,'editor.png')});
 await page.locator('#flight-mode').click();
 await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:180000});
 await page.waitForFunction(()=>planetStudio.view.renderer.info.render.drawCalls>0&&__gpuValidation.modules>0&&__gpuValidation.pending===0,null,{timeout:60000});
 report.flight=await page.evaluate(()=>{const v=planetStudio.view;return {state:v.flight.sim.state,health:v.flight.sim.health,patches:v.terrain.active.size,draws:v.renderer.info.render.drawCalls,skills:Object.keys(v.flight.sim.skills)};});
 assert.ok(report.flight.patches>0&&report.flight.draws>0);assert.ok(report.flight.skills.includes('warp'));
 await page.screenshot({path:path.join(out,'flight.png')});
 await page.locator('#editor-mode').click();await page.waitForFunction(()=>!planetStudio.view.flight.active);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>__gpuValidation.pending===0);
 report.gpu=await page.evaluate(()=>__gpuValidation);
 assert.equal(report.gpu.errors.length,0,JSON.stringify(report.gpu.errors));assert.equal(report.gpu.lost.length,0,JSON.stringify(report.gpu.lost));
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.consoleErrors.length,0,JSON.stringify(report.consoleErrors));
 report.passed=true;console.log(JSON.stringify({passed:true,shaderModules:report.gpu.modules,editor:report.editor,flight:report.flight}));
}catch(error){report.passed=false;report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 if(browser)await browser.close();server.kill();
 await writeFile(path.join(out,'smoke.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,'server.txt'),serverLog);
}
