import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='evidence/v36/report';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),report={errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
try{
 const response=await page.goto('http://127.0.0.1:4399/output/reports/ATLAS_Regional_Bake_V36.html');report.status=response.status();
 report.layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,tables:document.querySelectorAll('table').length,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,title:document.title,text:document.body.innerText.includes('180 regresyon testi geçti')}));
 await page.screenshot({path:out+'/mobile.png'});
 let wait=page.waitForEvent('download');await page.getByRole('button',{name:'Raporu çevrimdışı indir'}).click();await(await wait).saveAs(out+'/download.html');
 wait=page.waitForEvent('download');await page.getByRole('link',{name:'Tüm ölçümleri CSV indir'}).click();await(await wait).saveAs(out+'/download.csv');
 const zip=await page.request.get('http://127.0.0.1:4399/output/regions/ATLAS_Reference_32km_V36.zip');report.packageStatus=zip.status();report.packageBytes=(await zip.body()).byteLength;
 report.passed=report.status===200&&report.packageStatus===200&&report.layout.width<=report.layout.viewport&&!report.layout.brokenImages&&report.layout.text&&!report.errors.length;if(!report.passed)throw Error('Report verification failed');
}catch(e){report.failure=e.stack;process.exitCode=1;}
finally{await writeFile(out+'/qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
