import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve('evidence/v34/report-qa');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4403/');
 await page.evaluate(async()=>{for(const image of document.images){image.loading='eager';await image.decode();}});
 for(const width of [360,390,768,1280]){
  await page.setViewportSize({width,height:900});
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),tables:document.querySelectorAll('table').length,title:document.querySelector('h1').textContent}));
  assert(layout.scrollWidth<=width,'Document overflow');assert(layout.images);assert.ok(layout.tables>=5);checks.push(layout);
  if(width===390||width===1280)await page.screenshot({path:out+`/report-${width}.png`});
 }
 const download=page.waitForEvent('download');await page.locator('#download').click();
 const file=await download;assert.equal(file.suggestedFilename(),'ATLAS_V34_Sonuc.html');const saved=out+'/'+file.suggestedFilename();await file.saveAs(saved);
 const bytes=await readFile(saved);assert(bytes.length>100000);assert(bytes.toString('utf8').includes('8.000 km'));assert(bytes.toString('utf8').includes('GPU p95'));
 const server=await page.request.get('http://127.0.0.1:4403/?download=1');assert(server.ok());assert(server.headers()['content-disposition'].includes('ATLAS_V34_Sonuc.html'));
 const served=await server.body(),original=await readFile('output/v34/ATLAS_V34_Sonuc.html');assert.equal(createHash('sha256').update(served).digest('hex'),createHash('sha256').update(original).digest('hex'));
 const pdf=await page.request.get('http://127.0.0.1:4403/ATLAS_Terrain_Ucus_Performans_V34.pdf');assert(pdf.ok());assert(pdf.headers()['content-type'].includes('application/pdf'));assert(pdf.headers()['content-disposition'].includes('attachment'));
 assert.equal((await page.request.get('http://127.0.0.1:4403/package.json')).status(),404);
 await page.context().setOffline(true);await page.goto(pathToFileURL(saved).href);
 assert.equal(await page.locator('h1').count(),1);await page.evaluate(async()=>{for(const i of document.images){i.loading='eager';await i.decode();}});
 assert.equal(errors.length,0);await writeFile(out+'/qa.json',JSON.stringify({passed:true,checks,downloadBytes:bytes.length,serverSha256:createHash('sha256').update(served).digest('hex'),offline:true,errors},null,2));
 console.log(JSON.stringify({passed:true,widths:checks.map(c=>c.width),offline:true,downloadBytes:bytes.length}));
}finally{await browser.close();}
