// Functional production/shader validation. Software GPU results are never FPS evidence.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.SMOKE_OUT||'test-results/browser');await mkdir(out,{recursive:true});
const report={scope:'Production editor/flight and generated shader validation; not a performance benchmark',softwareGpu:process.env.BROWSER_SOFTWARE_GPU==='1',viewport:[960,640],errors:[],consoleErrors:[]};
const server=spawn(process.execPath,['scripts/serve.mjs','--dist'],{env:{...process.env,PORT:'0',WORLD_SHARED_MEMORY:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let browser,page,serverLog='';server.stderr.on('data',b=>{serverLog+=b;});
try{
 const base=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Production server startup timed out')),20000);let stdout='';
  server.stdout.on('data',b=>{stdout+=b;serverLog+=b;const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  server.once('error',error=>{clearTimeout(timer);reject(error);});server.once('exit',code=>{clearTimeout(timer);reject(Error('Production server exited: '+code));});
 });
 const args=['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding'];
 const browserEnv={...process.env};
 if(report.softwareGpu){
  if(process.platform!=='linux')throw Error('Software Vulkan CI requires Linux/Mesa; use hardware smoke on other platforms');
  const folder='/usr/share/vulkan/icd.d',driver=(await readdir(folder)).sort().find(n=>/^lvp_icd.*\.json$/.test(n));
  if(!driver)throw Error('Mesa lavapipe ICD is missing; install mesa-vulkan-drivers');
  browserEnv.VK_DRIVER_FILES=path.join(folder,driver);report.vulkanDriver=browserEnv.VK_DRIVER_FILES;
  // Match Three.js upstream CI: Mesa/lavapipe, a virtual display, no SwiftShader override.
  args.push('--enable-features=Vulkan','--disable-vulkan-surface','--ignore-gpu-blocklist','--disable-gpu-driver-bug-workarounds','--disable-gpu-watchdog');
 }
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:process.env.BROWSER_HEADLESS!=='0',env:browserEnv,args});
 const context=await browser.newContext({viewport:{width:960,height:640},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  const state=window.__gpuValidation={modules:0,pending:0,errors:[],lost:[],adapters:[]};
  if(!globalThis.GPUDevice)return;
  const original=GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule=function(descriptor){
   const module=original.call(this,descriptor);state.modules++;state.pending++;
   module.getCompilationInfo().then(info=>{for(const m of info.messages)if(m.type==='error')state.errors.push({label:descriptor.label??'',message:m.message,line:m.lineNum});},error=>state.errors.push({message:String(error)})).finally(()=>state.pending--);
   return module;
  };
  const request=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){
   state.adapters.push({vendor:this.info.vendor,architecture:this.info.architecture,device:this.info.device,description:this.info.description});
   const device=await request.apply(this,args);
   device.addEventListener('uncapturederror',event=>state.errors.push({message:event.error.message}));
   device.lost.then(info=>{if(info.reason!=='destroyed')state.lost.push({reason:info.reason,message:info.message});});
   return device;
  };
 });
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
 page.setDefaultTimeout(30000);
 const started=Date.now();await page.goto(base+'/?world=fixtures/lumen-v35.planet&view=reference&region=baked');
 await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden||!document.querySelector('#error').hidden,null,{timeout:report.softwareGpu?600000:300000});
 if(await page.locator('#error').isVisible())throw Error(await page.locator('#error-message').innerText());
 report.editor=await page.evaluate(()=>{const v=planetStudio.view;return {radius:v.world.radiusMeters,worldHash:v.world.manifest.worldDataHash,kernel:v.terrainKernel,backend:v.diagnostics.backend,adapter:v.diagnostics.adapter,patches:v.terrain.active.size,isolated:crossOriginIsolated};});
 report.editor.observedReadyMs=Date.now()-started;
 assert.equal(report.editor.worldHash,'595aee80687ce1d3acf102bfd9e8bb925f9b5ee4a3bca2bdc3fca5f58b2b463d');assert.equal(report.editor.radius,4000000);assert.equal(report.editor.backend,'WebGPU');assert.equal(report.editor.kernel.mode,'wasm');assert.ok(report.editor.isolated&&report.editor.patches>0);
 await page.screenshot({path:path.join(out,'editor.png')});
 await page.locator('#flight-mode').click();
 await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:report.softwareGpu?300000:180000});
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
}catch(error){if(page)report.gpu=await page.evaluate(()=>window.__gpuValidation).catch(()=>null);report.passed=false;report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 if(browser)await browser.close();server.kill();
 await writeFile(path.join(out,'smoke.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,'server.txt'),serverLog);
}
