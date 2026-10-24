import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='evidence/v37/flight';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']}),page=await browser.newPage({viewport:{width:1440,height:1000}}),report={errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
try{
 await page.goto('http://127.0.0.1:4399/dist/?world=fixtures/lumen-v35.planet&view=reference&region=baked&v=37');
 await page.waitForFunction(()=>window.planetStudio?.view&&document.querySelector('#loading').hidden,null,{timeout:240000});
 await page.evaluate(async()=>{const {referenceDirection}=await import('/core/landforms.mjs');await planetStudio.view.setCamera('region',referenceDirection(planetStudio.world,-9000,-11000),{rangeMeters:1000,tilt:.62});});
 const start=Date.now();await page.locator('#flight-mode').click();await page.waitForFunction(()=>planetStudio.view.flight.active&&!planetStudio.view.flight.sim.paused,null,{timeout:120000});report.flightEntryMs=Date.now()-start;
 await page.keyboard.down('Space');await page.waitForTimeout(2000);report.boost=await page.evaluate(()=>({speed:planetStudio.view.flight.sim.speed,state:planetStudio.view.flight.sim.state,boosting:planetStudio.view.flight.sim.boosting,agl:planetStudio.view.flight.sim.agl}));await page.keyboard.up('Space');await page.waitForTimeout(3000);
 report.release=await page.evaluate(()=>({speed:planetStudio.view.flight.sim.speed,state:planetStudio.view.flight.sim.state,health:planetStudio.view.flight.sim.health,agl:planetStudio.view.flight.sim.agl,terrain:planetStudio.view.terrain.stats,region:planetStudio.view.regional?.snapshot()}));
 await page.screenshot({path:out+'/flight.png'});
 // Existing arrival machinery is exercised without changing the player's
 // destination/trajectory: prepare a second footprint, then cancel it.
 await page.evaluate(()=>{const v=planetStudio.view;v.terrain.prepareArrival(v.flight.absolute.clone(),1);});
 await page.waitForFunction(()=>planetStudio.view.terrain.arrival?.ready,null,{timeout:120000});
 report.arrival=await page.evaluate(()=>{const t=planetStudio.view.terrain,result={ready:t.arrival.ready,records:t.arrival.records.size,active:t.active.size,firstMs:t.stats.arrivalFirstChunkMilliseconds,readyMs:t.stats.arrivalPreparedMilliseconds};t.cancelArrival();result.retained=t.active.size;return result;});
 if(report.arrival.retained===0||!report.boost.boosting||report.release.state!=='flying')throw Error('Flight/arrival state mismatch');
 report.passed=report.errors.length===0;
}catch(e){report.failure=e.stack;process.exitCode=1;await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}
finally{await writeFile(out+'/qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,entry:report.flightEntryMs,boost:report.boost,arrival:report.arrival,failure:report.failure,errors:report.errors}));await browser.close();}
