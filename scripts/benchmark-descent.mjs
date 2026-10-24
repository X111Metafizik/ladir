// Saved-world shore and vertical approach regression. Presentation is 60 Hz;
// CPU submit cost, visible cell spacing and completion time are separate.
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.BENCH_OUT??'evidence/v42/release',url=process.env.BENCH_URL??'http://127.0.0.1:4399/dist/?world=fixtures/river-v42.planet';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage(),report={url,errors:[],runs:[],method:'Same saved world and vertical camera route: 8500 to 450 m ASL at 650 m/s. Cold route then same-context warm RAM/disk revisit. Default quality. Full footprint completion is separate from first visible detail. No screenshots during timing unless BENCH_SHOTS=1. GPU timings are not measured; frame presentation may be refresh capped. Other applications are not controlled.'};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
try{
 await page.goto(url);await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden,null,{timeout:180000});
 await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:180000});
 await page.evaluate(()=>{
  const v=planetStudio.view,s=v.flight.sim,w=v.world;
  const reach=w.hydrology.rivers.find(r=>r.id==='drain-10361'),p=reach.points[242],next=reach.points[243];
  window.__approach={direction:p.direction,heading:next.direction.map((x,i)=>x-p.direction[i])};
  window.__place=h=>{v.flight.clearInput();s.up.fromArray(__approach.direction).normalize();s.position.copy(s.up).multiplyScalar(w.radiusMeters+h);
   s.heading.fromArray(__approach.heading).addScaledVector(s.up,-s.heading.dot(s.up)).normalize();s.pitch=-.24;s.forward.copy(s.heading).multiplyScalar(Math.cos(s.pitch)).addScaledVector(s.up,Math.sin(s.pitch));s.right.crossVectors(s.forward,s.up).normalize();
   Object.assign(s,{state:'flying',health:100,paused:false,cruising:false,boosting:false,speed:0,fallSpeed:0});s.velocity.set(0,0,0);s.snapshot();s.refreshGround();
   for(const e of s.enemies){e.mode='return';e.cooldown=99999;e.visibleToPlayer=false;}
  };
  v.setAppearance(w.appearanceConfig);window.__height=8500;window.__frames=[];window.__samples=[];window.__record=false;
  const r=v.renderer;r.info.autoReset=false;
  r.setAnimationLoop(t=>{__place(__height);r.info.reset();const start=performance.now();v.update(t);const cpu=performance.now()-start;
   if(__record&&r.info.render.frameCalls)__frames.push({time:t,cpu,draws:r.info.render.drawCalls});
  });
  window.__sample=()=>{const t=v.terrain,ref={};t.surfaceAt(__approach.direction,ref);t.measureMemory();const p=ref.mesh?.userData.patch;return {ms:performance.now()-__start,height:__height,level:p?.level,resolution:p?.resolution,cellMeters:p?p.size*w.radiusMeters/p.resolution:null,building:t.building,inbox:t.inbox.length,ready:t.ready.size,warm:t.warmQueue.length,groups:t.transitions.length,largestGroup:Math.max(0,...t.transitions.map(g=>g.add.length)),terrain:{...t.stats},performance:{...v.performanceStats},heap:performance.memory?.usedJSHeapSize};};
 });
 for(const cache of ['cold','warm']){
  await page.evaluate(()=>{__height=8500;planetStudio.view.terrain.lastPosition.set(1e9,0,0);});
  await page.waitForTimeout(1500);await page.waitForFunction(()=>!planetStudio.view.terrain.building,null,{timeout:180000});
  await page.screenshot({path:`${out}/${cache}-high.png`});
  const start=Date.now();await page.evaluate(()=>{__start=performance.now();__record=true;__frames=[];__samples=[];window.__timer=setInterval(()=>{__height=Math.max(450,8500-(performance.now()-__start)*.65);__samples.push(__sample());},100);});
  await page.waitForTimeout(12500);if(process.env.BENCH_SHOTS==='1')await page.screenshot({path:`${out}/${cache}-arrival.png`});
  await page.waitForFunction(()=>!planetStudio.view.terrain.building&&planetStudio.view.terrain.warmQueue.length===0,null,{timeout:180000});
  const settledMs=Date.now()-start;
  const data=await page.evaluate(()=>{clearInterval(__timer);__record=false;const quant=a=>{a.sort((a,b)=>a-b);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};},intervals=__frames.slice(1).map((f,i)=>f.time-__frames[i].time);return {samples:__samples,frames:__frames,summary:{cpu:quant(__frames.map(f=>f.cpu)),interval:quant(intervals),over50:intervals.filter(x=>x>50).length,over100:intervals.filter(x=>x>100).length},route:__approach,world:planetStudio.world.manifest.worldDataHash,settings:planetStudio.settings,hardware:planetStudio.view.diagnostics.adapter,camera:planetStudio.view.flight.absolute.toArray(),fov:planetStudio.view.camera.fov};});
  await page.screenshot({path:`${out}/${cache}-detailed.png`});
  report.runs.push({cache,settledMs,...data});await writeFile(`${out}/descent.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({cache,settledMs,summary:data.summary,last:data.samples.at(-1)?.cellMeters}));
 }
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.stack);}finally{await writeFile(`${out}/descent.json`,JSON.stringify(report,null,2));await browser.close();}
