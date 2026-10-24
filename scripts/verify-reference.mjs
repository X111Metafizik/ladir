import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='evidence/v32/visual';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
try{
 for(const world of ['old','new']){
  await page.goto('http://127.0.0.1:4399/dist/reference.html?world='+world);
  await page.waitForFunction(()=>window.referenceStudio?.ready&&!referenceStudio.view.terrain.building,null,{timeout:180000});await page.waitForTimeout(2500);
  for(const mode of ['gray','flow','final']){
   await page.evaluate(m=>referenceStudio.setMode(m),mode);await page.waitForFunction(()=>referenceStudio.ready&&!referenceStudio.view.terrain.building,null,{timeout:180000});await page.waitForTimeout(2000);
   const m=await page.evaluate(()=>referenceStudio.metrics());results.push({world,...m});await page.screenshot({path:`${out}/${world}-${mode}.png`});console.log(world,mode,m.spacing,m.levels);
  }
  if(world==='new'){
   await page.evaluate(()=>referenceStudio.setMode('gray'));await page.locator('#dense').click();await page.waitForFunction(()=>referenceStudio.ready&&!referenceStudio.view.terrain.building,null,{timeout:180000});await page.waitForTimeout(2000);results.push({world,...await page.evaluate(()=>referenceStudio.metrics())});await page.screenshot({path:out+'/new-gray-dense.png'});
  }
 }
}finally{await writeFile(out+'/cameras.json',JSON.stringify({results,errors},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
