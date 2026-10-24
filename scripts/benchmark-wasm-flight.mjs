import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:4399';
const out='evidence/v39';await mkdir(out,{recursive:true});
const results={date:new Date().toISOString(),scope:'One fresh browser context per backend, 60-second cold and warm replay each; exploratory, not a hardware-independent FPS claim.',modes:{}};
for(const [mode,query] of [['js','js'],['wasm','auto']]){
 const env={...process.env,BENCH_URL:base+'/dist/?world=fixtures/lumen-v35.planet&view=reference&region=baked&v=39&terrainKernel='+query,BENCH_OUT:out+'/flight-'+mode,BENCH_ROUTE:out+'/route.json',BENCH_REPEATS:'1'};
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/benchmark-endurance.mjs'],{env,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(mode+' flight benchmark failed: '+code)));});
 const report=JSON.parse(await readFile(out+'/flight-'+mode+'/benchmark.json'));
 assert.equal(report.errors.length,0);assert.equal(report.runs.length,2);
 results.modes[mode]=report.runs.map(r=>{assert.equal(r.environment.kernel.mode,mode);return {cache:r.cache,startupMs:r.startupMs,flightStartupMs:r.flightStartupMs,worldHash:r.environment.world.worldDataHash,route:r.environment.route,settings:r.environment.settings,radius:r.environment.radius,kernel:r.environment.kernel,summary:r.summary,renderFps:r.renderFps,hardware:report.hardware,gpuTimestampAvailable:r.gpuTimestampAvailable,heapPeak:Math.max(...r.samples.map(s=>s.heap??0)),gpuBufferPeak:Math.max(...r.samples.map(s=>s.buffers?.peak??0)),longTasks:r.longTasks.length,scenarios:r.scenarios};});
 await writeFile(out+'/flight-comparison.json',JSON.stringify(results,null,2)+'\n');
}
const a=results.modes.js[0],b=results.modes.wasm[0];assert.equal(a.worldHash,b.worldHash);assert.equal(a.radius,b.radius);assert.deepEqual(a.route,b.route);assert.deepEqual(a.settings,b.settings);
console.log(JSON.stringify(Object.fromEntries(Object.entries(results.modes).map(([mode,runs])=>[mode,runs.map(r=>({cache:r.cache,fps:r.renderFps,cpu:r.summary.cpu,gpu:r.summary.gpuRender,frame:r.summary.frame,over50:r.summary.over50}))])),null,2));
