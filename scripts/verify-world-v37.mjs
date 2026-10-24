import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='evidence/v37/world';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-features=CalculateNativeWinOcclusion','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[],result={};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>localStorage.setItem('atlas-config-v33',JSON.stringify({radiusMeters:6000000,terrainModel:'legacy-1.6',seed:'LUMEN-742'})));
const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
const ready=()=>page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden&&!planetStudio.view.terrain.building,null,{timeout:180000});
const snapshot=()=>page.evaluate(()=>{const p=planetStudio,v=p.view;return {radius:p.world.radiusMeters,diameter:p.world.radiusMeters*2,model:p.world.generationConfig.terrainModel,hash:p.world.manifest.worldDataHash,reference:!!p.world.landforms,summary:document.querySelector('#world-summary').textContent,settings:p.settings,camera:{altitude:(v.controls.absolute.length()-1000)/v.controls.scale,fov:v.camera.fov,near:v.camera.near,far:v.camera.far},terrain:{patches:v.terrain.active.size,maxLevel:v.terrain.stats.maxLevel},previousConfig:JSON.parse(localStorage.getItem('atlas-config-v33'))}});
try{
 await page.goto('http://127.0.0.1:4399/dist/?view=stamps&v=37');await ready();result.default=await snapshot();
 assert.equal(result.default.radius,4_000_000);assert.equal(result.default.model,'watershed-2');assert.equal(result.default.reference,true);assert.equal(result.default.previousConfig.radiusMeters,6_000_000);
 await page.goto('http://127.0.0.1:4399/dist/?world=fixtures/lumen-v35.planet&view=stamps&v=37');await ready();await page.waitForTimeout(1000);result.saved=await snapshot();
 assert.equal(result.saved.diameter,8_000_000);assert.ok(result.saved.summary.includes('8.000 km çap'));assert.ok(result.saved.summary.includes('4.000 km yarıçap'));assert.equal(result.saved.reference,true);
 await page.screenshot({path:out+'/connected-8000km.png'});
 await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:120000});
 const box=await page.locator('#planet').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.evaluate(()=>{const s=planetStudio.view.flight.sim;s.cruising=false;s.boosting=false;s.position.setLength(s.radius+s.groundHeight+500);s.pitch=0;s.health=100;for(const e of s.enemies)e.fire=1e6;s.snapshot();s.refreshGround();});await page.waitForTimeout(2500);
 result.flight=await page.evaluate(()=>{const v=planetStudio.view,s=v.flight.sim;return {radius:s.radius,agl:s.agl,altitude:s.position.length()-s.radius,state:s.state,tactical:v.tactical.active,layer:v.terrain.layer};});
 assert.equal(result.flight.radius,4_000_000);assert.equal(result.flight.state,'flying');assert.equal(result.flight.tactical,false);assert.equal(result.flight.layer,'natural');assert.ok(result.flight.agl>400&&result.flight.agl<650);
 await page.screenshot({path:out+'/flight-500m.png'});await page.locator('#editor-mode').click();
 await page.evaluate(()=>planetStudio.view.setCamera('orbit'));await ready();result.orbit=await snapshot();assert.ok(result.orbit.camera.altitude>6_000_000);assert.ok(result.orbit.camera.far>result.orbit.camera.near);await page.screenshot({path:out+'/orbit.png'});
 await page.goto('http://127.0.0.1:4399/dist/?world=fixtures/legacy-lumen-v31.planet&view=stamps&v=37');await ready();result.previous=await snapshot();assert.equal(result.previous.radius,12_000_000);await page.screenshot({path:out+'/previous-classic.png'});
 await page.goto('http://127.0.0.1:4399/dist/?world=fixtures/lumen-v33.planet&view=stamps&v=37');await ready();result.classic=await snapshot();assert.equal(result.classic.diameter,12_000_000);assert.equal(result.classic.reference,false);
 assert.equal(errors.length,0);result.passed=true;console.log(JSON.stringify({passed:true,default:result.default,saved:result.saved,flight:result.flight}));
}catch(e){result.failure=e.stack;await page.screenshot({path:out+'/failure.png'});throw e;}finally{
 result.errors=errors;result.hashes={};for(const file of ['dist/studio/main.mjs','dist/workers/generator.mjs','dist/fixtures/lumen-v35.planet'])result.hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');await writeFile(out+'/qa.json',JSON.stringify(result,null,2));await browser.close();
}
