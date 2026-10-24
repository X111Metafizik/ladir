import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='evidence/v35/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion']});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage(),report={errors:[],scenes:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
page.on('response',r=>{if(r.status()>=400)(report.failedResources??=[]).push({url:r.url(),status:r.status()});});
const ready=()=>page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden&&!planetStudio.view.terrain.building&&planetStudio.view.terrain.warmQueue.length===0,null,{timeout:180000});
try{
 await page.goto('http://127.0.0.1:4399/assets/terrain-stamps/sources.html');
 report.storage=await page.evaluate(async()=>{
  const [{deserializePlanet},{buildPatch},{directionFace},{TerrainBakeCache,BAKE_DISK_BYTES,BAKE_QUEUE_BYTES},{terrainBakeKey,bakeChecksum,coarseBakePatch}]=await Promise.all([import('/io/bundle.mjs'),import('/render/terrain-data.mjs'),import('/core/cube.mjs'),import('/io/terrain-bake-cache.mjs'),import('/io/terrain-bake-codec.mjs')]);
  const world=await deserializePlanet(await(await fetch('/fixtures/lumen-v35.planet')).arrayBuffer()),d=world.landmarks.find(p=>p.id==='stamp-0').direction,[face,u,v]=directionFace(d),size=2/2**15,tx=Math.floor((u+1)/size),ty=Math.floor((v+1)/size),descriptors=Array.from({length:12},(_,i)=>{const x=tx+i%4,y=ty+Math.floor(i/4);return {...coarseBakePatch(face,0,0),level:15,x,y,u:x*size-1,v:y*size-1,size,resolution:32,stitchResolution:[32,32,32,32],key:face+'/15/'+x+'/'+y};});
  const cold=new TerrainBakeCache(world,{staticPacks:false});const misses=await cold.read(descriptors,'natural');if(misses.some(Boolean))throw Error('Expected empty isolated cache');
  const started=performance.now(),patches=descriptors.map(p=>buildPatch(world,p)),buildMs=performance.now()-started;cold.enqueue(patches,'natural');await cold.settled();
  const warm=new TerrainBakeCache(world,{staticPacks:false}),t=performance.now(),loaded=await warm.read(descriptors,'natural'),readMs=performance.now()-t;
  const channels=['positions','normals','surface','climate','indices','waterPositions','waterNormals','waterIndices','shallows','colors'];
  let equal=loaded.every(Boolean);for(let i=0;i<loaded.length;i++)if(loaded[i])for(const key of channels){const a=loaded[i][key],b=patches[i][key];equal&&=a.length===b.length&&a.every((v,j)=>v===b[j]);}
  const seam={...descriptors[0],boundaryBands:{'0,0':12}},invalidated=(await warm.read([seam],'natural'))[0]===null;
  const db=await cold.database(),key=terrainBakeKey(world,descriptors[0]);await new Promise((resolve,reject)=>{const tx=db.transaction('tiles','readwrite'),store=tx.objectStore('tiles'),r=store.get(key);r.onsuccess=()=>{const v=r.result;new Uint8Array(v.buffer)[40]^=1;store.put(v);};tx.oncomplete=resolve;tx.onerror=reject;});
  const corrupted=(await warm.read([descriptors[0]],'natural'))[0]===null;
  const small=new TerrainBakeCache(world,{staticPacks:false,maxBytes:200*1024});small.enqueue(patches,'natural');await small.settled();
  const bounded=await new Promise(resolve=>{const tx=db.transaction(['state','meta'],'readonly'),a=tx.objectStore('state').get('bytes'),b=tx.objectStore('meta').getAll();tx.oncomplete=()=>resolve({bytes:a.result,records:b.result.length,sum:b.result.reduce((n,r)=>n+r.size,0)});});
  const staticCache=new TerrainBakeCache(world,{indexedDB:null}),staticResults=await staticCache.read([0,1,2,3,4,5].map(face=>coarseBakePatch(face,2,3)),'natural');
  // Production bundled worker must transfer owned buffers, and hit disk in a
  // fresh worker. This catches transfer-list duplicates and lost writes.
  const workerRun=async()=>{const worker=new Worker('/dist/workers/patches.mjs',{type:'module'});worker.postMessage({type:'init',world});const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),20000);worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=reject;worker.postMessage({type:'build',task:1,patches:descriptors.slice(0,3),layer:'natural'});});return {worker,result};};
  const first=await workerRun();await new Promise(r=>setTimeout(r,1000));first.worker.terminate();const second=await workerRun();second.worker.terminate();
  return {buildMs,readMs,tiles:descriptors.length,equal,invalidated,corrupted,cold:cold.stats,warm:warm.stats,bounded,staticHits:staticCache.stats.bakeStaticHits,staticComplete:staticResults.every(Boolean),workerWarm:second.result.bake,limits:{diskBytes:BAKE_DISK_BYTES,queueBytes:BAKE_QUEUE_BYTES}};
 });
 assert.equal(report.storage.equal,true);assert.equal(report.storage.invalidated,true);assert.equal(report.storage.corrupted,true);assert.equal(report.storage.bounded.bytes,report.storage.bounded.sum);assert.ok(report.storage.bounded.bytes<=200*1024);assert.equal(report.storage.staticComplete,true);assert.equal(report.storage.staticHits,6);assert.equal(report.storage.workerWarm.bakeHits,3);
 console.log('Storage verified',JSON.stringify(report.storage));await writeFile(out+'/qa.json',JSON.stringify(report,null,2));
 await page.goto('http://127.0.0.1:4399/dist/?view=stamps&v=35');await ready();
 report.world=await page.evaluate(()=>({hash:planetStudio.world.manifest.worldDataHash,diameter:planetStudio.world.radiusMeters*2,stamps:planetStudio.stampDiagnostics,settings:planetStudio.settings}));
 assert.equal(report.world.stamps.distribution,'global-2');assert.equal(report.world.hash,'595aee80687ce1d3acf102bfd9e8bb925f9b5ee4a3bca2bdc3fca5f58b2b463d');
 for(const [id,range] of [['stamp-0',60000],['stamp-1',15000],['stamp-3',3000]]){
  await page.evaluate(async({id,range})=>{const p=planetStudio,f=p.world.landmarks.find(f=>f.id===id);p.setAppearance({lightAnchor:f.direction,sunElevation:32,clouds:0,fog:0});await p.view.setCamera('region',f.direction,{rangeMeters:range,tilt:.78});}, {id,range});await ready();await page.waitForTimeout(1000);
  const snapshot=await page.evaluate(id=>{const v=planetStudio.view;return {id,hash:planetStudio.world.manifest.worldDataHash,camera:{position:v.controls.absolute.toArray(),altitude:(v.controls.absolute.length()-1000)/v.controls.scale,fov:v.camera.fov},bake:v.terrain.stats.bake,active:v.terrain.active.size,maxLevel:v.terrain.stats.maxLevel};},id);
  snapshot.visualOnly={clouds:0,fog:0};report.scenes.push(snapshot);await page.screenshot({path:out+'/'+id+'.png'});console.log('Visual',id,snapshot.active,'tiles');await writeFile(out+'/qa.json',JSON.stringify(report,null,2));
 }
 await page.evaluate(()=>planetStudio.setAppearance({clouds:.22,fog:.10}));
 await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:180000});
 await page.evaluate(()=>{const v=planetStudio.view,s=v.flight.sim;s.cruising=false;s.position.setLength(s.radius+s.groundHeight+500);s.pitch=0;s.health=100;s.snapshot();s.refreshGround();for(const e of s.enemies)e.fire=1e6;});await page.waitForTimeout(5000);
 report.flight=await page.evaluate(()=>{const v=planetStudio.view;return {state:v.flight.sim.state,agl:v.flight.sim.agl,terrain:v.terrain.stats.bake,pixelRatio:v.renderer.getPixelRatio(),tactical:v.tactical.active};});await page.screenshot({path:out+'/flight.png'});assert.equal(report.flight.state,'flying');assert.equal(report.flight.tactical,false);
 await page.locator('#editor-mode').click();await page.goto('http://127.0.0.1:4399/dist/?world=fixtures/lumen-v34.planet&view=stamps&v=35');await ready();
 report.legacy=await page.evaluate(()=>({hash:planetStudio.world.manifest.worldDataHash,model:planetStudio.stampDiagnostics.distribution}));assert.equal(report.legacy.hash,'c6d3b391b78868ccbd1d0eafbbba2374ca753f428dd767179862f581c9362c64');assert.equal(report.legacy.model,'legacy-1');await page.screenshot({path:out+'/legacy-v34.png'});
 assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;console.error(error);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}finally{await writeFile(out+'/qa.json',JSON.stringify(report,null,2));await browser.close();}
