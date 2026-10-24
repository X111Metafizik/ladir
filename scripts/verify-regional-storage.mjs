import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
await mkdir('evidence/v36',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),cdp=await page.context().newCDPSession(page),report={errors:[]};
try{
 await page.goto('http://127.0.0.1:4399/assets/terrain-stamps/sources.html');
 report.storage=await page.evaluate(async()=>{
  const [{deserializePlanet},{REGIONAL_CATALOG},{RegionLoader},{RegionDisk}]=await Promise.all([import('/io/bundle.mjs'),import('/io/regional-catalog.mjs'),import('/io/regional-loader.mjs'),import('/io/regional-storage.mjs')]);
  const world=await deserializePlanet(await(await fetch('/fixtures/lumen-v35.planet')).arrayBuffer()),c=REGIONAL_CATALOG[world.manifest.worldDataHash],t=c.manifest.tiles[136],options={baseURL:new URL('/',location.href)},cold=new RegionLoader(world,c,options);
  const a=await cold.load(t);await cold.lastWrite;if(!a)throw Error('Cold package failed '+JSON.stringify(cold.snapshot()));
  const warm=new RegionLoader(world,c,options),b=await warm.load(t);if(!b||warm.stats.networkBytes!==0||warm.disk.stats.cacheHits!==1)throw Error('Warm cache missed');
  if(!a.data.every((v,i)=>v===b.data[i]))throw Error('Warm bytes changed');
  const db=await warm.disk.db(),key=warm.key(t);
  await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite'),store=tx.objectStore('files'),r=store.get(key);r.onsuccess=()=>{const v=r.result;new Uint8Array(v.buffer)[40]^=255;store.put(v);};tx.oncomplete=resolve;tx.onerror=reject;});
  const corrupt=new RegionLoader(world,c,options),fixed=await corrupt.load(t);await corrupt.lastWrite;if(!fixed||corrupt.stats.corruptTiles!==1||!corrupt.stats.networkBytes)throw Error('Corruption recovery failed');
  await corrupt.disk.remove(key);const erased=new RegionLoader(world,c,options),afterErase=await erased.load(t);await erased.lastWrite;if(!afterErase||!erased.stats.networkBytes)throw Error('Deleted cache recovery failed');
  const bounded=new RegionLoader(world,c,{...options,maxDiskBytes:300000});
  for(const item of c.manifest.tiles.slice(0,5)){await bounded.load(item);await bounded.lastWrite;}
  const ledger=await new Promise(resolve=>{const tx=db.transaction(['state','meta'],'readonly'),r=tx.objectStore('state').get('bytes'),q=tx.objectStore('meta').getAll();tx.oncomplete=()=>resolve({bytes:r.result,recordSum:q.result.reduce((n,r)=>n+r.size,0),records:q.result.length});});
  if(ledger.bytes>300000||ledger.bytes!==ledger.recordSum)throw Error('Disk byte budget failed');
  const badCatalog={...c,manifest:{...c.manifest,identity:{...c.manifest.identity,radiusMeters:6000000}}};let identityRejected=false;try{new RegionLoader(world,badCatalog,options);}catch{identityRejected=true;}if(!identityRejected)throw Error('Radius cache mixing');
  window.__quotaDisk=new RegionDisk({maxBytes:10*1024*1024});
  for(const l of [cold,warm,corrupt,erased,bounded])l.dispose();
  return {cold:cold.snapshot(),warm:warm.snapshot(),corruptionRecovered:corrupt.stats.corruptTiles===1,deletionRecovered:!!afterErase,ledger,identityRejected};
 });
 try{
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:'http://127.0.0.1:4399',quotaSize:1});
  report.quota=await page.evaluate(async()=>{await __quotaDisk.write('quota-test',new Uint8Array(1024*1024).buffer);const s={...__quotaDisk.stats};__quotaDisk.close();return s;});
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:'http://127.0.0.1:4399'});
 }catch(e){report.quotaUnavailable=e.message;}
 report.passed=report.storage.corruptionRecovered&&report.storage.deletionRecovered&&report.storage.identityRejected;
}catch(e){report.errors.push(e.stack);process.exitCode=1;}finally{await writeFile('evidence/v36/storage-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
