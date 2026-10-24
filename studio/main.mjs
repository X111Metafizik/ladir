import {requestedTerrainKernel} from '../wasm/runtime.mjs';
import {stableStringify} from '../core/math.mjs';
import {stampDiagnostics} from '../core/terrain-stamps.mjs';
import {createFlightUI} from './flight-ui.mjs';
import {DEFAULT_CONFIG,DEFAULT_APPEARANCE,DEFAULT_RENDER,canonicalConfig} from '../core/world.mjs';
import {serializePlanet,deserializePlanet} from '../io/bundle.mjs';
import {createPlanetView} from '../render/view.mjs';
import {sampleTerrain,BIOMES} from '../core/terrain.mjs';
import {queryStaticNavigation} from '../core/navigation.mjs';
import {WORLD_TYPES,typeAppearance} from '../core/ecology.mjs';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
let config={...DEFAULT_CONFIG},appearance={...DEFAULT_APPEARANCE},settings={...DEFAULT_RENDER},world=null,view=null,worker=null,generationId=0,selected=null,toastTimer=0;
let worldCacheStatus=null;
const numberFormats=[0,1,2].map(d=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:d}));
const number=(value,digits=0)=>numberFormats[digits].format(value);
const controlDefinitions=[
 ['landBalance','Kıta / deniz dengesi',0,1,.01,'Okyanus','Kıta','generation-controls'],
 ['mountains','Dağ karakteri',0,1,.01,'Yumuşak','Sarp','generation-controls'],
 ['terrainStamps','GLB arazi etkisi',0,1,.05,'Kapalı','Tam ayrıntı','generation-controls'],
 ['plains','Ova genişliği',0,1,.01,'Dar','Geniş','generation-controls'],
 ['forestDensity','Orman yoğunluğu',0,1,.01,'Seyrek','Yoğun','generation-controls'],
 ['erosion','Aşınma',0,1,.01,'Genç arazi','Aşınmış','climate-controls'],
 ['rainfall','Yağış',0,1,.01,'Kurak','Nemli','climate-controls'],
 ['temperature','Ekvator sıcaklığı',0,50,1,'0 °C','50 °C','climate-controls'],
 ['seaLevel','Deniz seviyesi farkı',-300,500,10,'−300 m','500 m','climate-controls'],
 ['regionCount','Siyasi bölge sayısı',8,128,1,'8','128','climate-controls'],
 ['sunAzimuth','Güneş yönü',-180,180,1,'Batı','Doğu','appearance-controls'],
 ['sunElevation','Güneş yüksekliği',-30,90,1,'Gece','Öğle','appearance-controls'],
 ['exposure','Pozlama',.4,2.8,.05,'Loş','Aydınlık','appearance-controls'],
 ['atmosphere','Atmosfer yoğunluğu',0,2,.05,'İnce','Yoğun','appearance-controls'],
 ['clouds','Bulut örtüsü',0,1,.01,'Açık','Kapalı','appearance-controls'],
 ['fog','Vadi sisi',0,1,.01,'Berrak','Sisli','appearance-controls'],
 ['water','Dalga kuvveti',0,2,.05,'Sakin','Dalgalı','appearance-controls'],
 ['tintOpacity','Bölgesel renk saydamlığı',0,.75,.01,'Hafif','Belirgin','appearance-controls'],
 ['wind','Rüzgâr',0,2,.05,'Durgun','Güçlü','appearance-controls'],
 ['detail','Arazi ayrıntısı',.5,3,.25,'Temel','Çok ayrıntılı','render-controls'],
 ['volumeSteps','Hacim örnekleri',16,96,8,'16','96','render-controls'],
 ['pixelRatio','Piksel örnekleme',.75,2,.25,'0,75×','2×','render-controls']
];
function configFor(key){return key in appearance?appearance:key in settings?settings:config;}
function renderControls(){
  for(const [key,label,min,max,step,left,right,container] of controlDefinitions){
    const element=document.createElement('div');element.className='control';element.innerHTML=`<label for="${key}">${label}<output id="${key}-value"></output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}"><div class="range-ends"><span>${left}</span><span>${right}</span></div>`;
    $('#'+container).append(element);
    $('#'+key).addEventListener('input',e=>{configFor(key)[key]=Number(e.target.value);syncControl(key);if(key in appearance)view?.setAppearance(appearance);else if(key in config)$('#generation-note').textContent='Ayarlar değişti. Uygulamak için gezegen oluştur.';});
    if(key in settings)$('#'+key).addEventListener('change',()=>view?.setRenderSettings(settings));
    syncControl(key);
  }
}
function syncControl(key){const el=$('#'+key),value=configFor(key)[key];el.value=value;el.style.setProperty('--fill',`${(value-Number(el.min))/(Number(el.max)-Number(el.min))*100}%`);$('#'+key+'-value').value=number(value,2)+(key==='sunAzimuth'||key==='sunElevation'?'°':key==='temperature'?' °C':key==='seaLevel'?' m':'');}
function syncAll(){for(const [key] of controlDefinitions)syncControl(key);$('#seed').value=config.seed;$('#tint-mode').value=appearance.tintMode??0;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function error(message){$('#error-message').textContent=message;$('#error').hidden=false;$('#loading').hidden=true;$('#status-text').textContent='İşlem tamamlanamadı';console.error(message);}
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function safeSeed(){return String(world?.manifest.normalizedSeed??config.seed).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);}
function setProgress(label,value){$('#loading').hidden=false;$('#progress-label').textContent=label;$('#progress').value=value;}
function cancel(){generationId++;worker?.terminate();worker=null;$('#loading').hidden=true;$('#generate').disabled=false;$('#status-text').textContent=world?'Mevcut gezegen korunuyor':'Üretim iptal edildi';}
async function generate(options={}){
  worker?.terminate();const id=++generationId;config.seed=$('#seed').value.trim()||'LUMEN-742';
  try{config=canonicalConfig(config);}catch(e){error(e.message);return;}
  $('#error').hidden=true;$('#generate').disabled=true;setProgress('Üretim başlıyor',0);
  worker=new Worker(new URL('../workers/generator.mjs',import.meta.url),{type:'module'});
  worker.onerror=e=>{if(id===generationId){error(e.message);$('#generate').disabled=false;}};
  worker.onmessage=async({data})=>{
    if(data.generationId!==generationId)return;
    if(data.type==='progress')setProgress(data.label,data.value*.83);
    if(data.type==='error'){error(data.message);$('#generate').disabled=false;worker?.terminate();worker=null;}
    if(data.type==='complete'){
      worker.terminate();worker=null;worldCacheStatus=data.cache;await activate(data.world,id);if(id===generationId)$('#generate').disabled=false;
    }
  };
  worker.postMessage({terrainKernel:requestedTerrainKernel(),generationId:id,config,reuseCache:options.reuseCache===true});
}
async function activate(next,id=generationId){
  flightUI.exit();
  if(id!==generationId)return;
  setProgress('Arazi ve grafik kaynakları hazırlanıyor',.86);
  const oldCanvas=$('#planet'),candidate=document.createElement('canvas');candidate.id='planet';candidate.tabIndex=0;candidate.setAttribute('aria-label',oldCanvas.getAttribute('aria-label'));candidate.style.visibility='hidden';candidate.style.position='absolute';candidate.style.inset='0';oldCanvas.after(candidate);
  let newView=null;
  const viewName=new URLSearchParams(location.search).get('view');const initialCamera=viewName==='reference'?next.landmarks.find(f=>f.id==='reference'):viewName==='stamps'?next.landmarks.find(f=>f.id==='stamp-1'):null;
  try{newView=await createPlanetView({world:next,canvas:candidate,appearanceConfig:initialCamera?{...appearance,lightAnchor:initialCamera.direction}:appearance,renderSettings:settings,onCamera:updateCameraUI,onError:error,onFlightMessage:toast,initialCamera});}
  catch(e){candidate.remove();if(id!==generationId)return;if(!view){world=next;config={...next.generationConfig};syncAll();updateWorldUI();$('#backend').textContent='VERİ MODU';}error(e.message);return;}
  if(id!==generationId){newView.dispose();candidate.remove();return;}
  view?.dispose();oldCanvas.remove();candidate.style.visibility='';candidate.style.position='';candidate.style.inset='';view=newView;world=next;selected=world.hydrology.lakes[0]??world.landmarks[0];config={...DEFAULT_CONFIG,...world.generationConfig,terrainModel:world.generationConfig.terrainModel??'legacy-1.6',terrainStamps:world.generationConfig.terrainStamps??0,stampModel:world.generationConfig.stampModel??'legacy-1'};$('#preset').value=config.worldType??'terran';syncAll();bindCanvas(candidate);updateWorldUI();
  $('#loading').hidden=true;$('#error').hidden=true;$('#status-text').textContent='Keşfe hazır · coğrafya doğrulandı';$('#generation-note').textContent='Gezegen hazır. Aynı seed ile tekrar üretebilirsin.';
  $('#backend').textContent='WEBGPU AKTİF';$('#diagnostics').textContent=JSON.stringify({...view.diagnostics,worldHash:world.manifest.worldDataHash,validation:world.generationReport},null,2);
  localStorage.setItem('atlas-config-v35',JSON.stringify(config));
  window.planetStudio={get world(){return world;},get view(){return view;},get worldCacheStatus(){return worldCacheStatus;},get stampDiagnostics(){return stampDiagnostics(world);},generate,visit,setCamera:mode=>view.setCamera(mode),serialize:()=>serializePlanet(world,appearance),setAppearance:next=>{appearance={...appearance,...next};view.setAppearance(appearance);syncAll();},queryStaticNavigation:q=>queryStaticNavigation(world,q),get settings(){return settings;}};
  if(initialCamera){appearance.lightAnchor=initialCamera.direction;view.setAppearance(appearance);selectFeature(view.features.find(f=>f.id===initialCamera.id)??initialCamera);}
}
function updateWorldUI(){
  const seed=world.manifest.normalizedSeed,parts=seed.split(/[- ]/);$('#project-seed').textContent=seed;
  $('#world-title').replaceChildren(document.createTextNode(parts[0].charAt(0).toUpperCase()+parts[0].slice(1).toLowerCase()+' '));const em=document.createElement('em');em.textContent=parts.slice(1).join(' ');$('#world-title').append(em);
  const r=world.generationReport;$('#world-summary').textContent=`${number(world.radiusMeters*2/1000)} km çap · ${number(world.radiusMeters/1000)} km yarıçap · %${number(r.waterFraction*100)} su · ${r.riverCount} akarsu`;
  $('#hash-label').textContent='DÜNYA KİMLİĞİ / '+world.manifest.worldDataHash.slice(0,16).toUpperCase();$('#export').disabled=false;
  $('#world-stats').innerHTML=[['SU ORANI','%'+number(r.waterFraction*100)],['AĞAÇ',number(r.treeCount)],['NEHİR',r.riverCount],['GÖL',r.lakeCount],['GEÇİT',r.crossingCount],['BOĞAZ',r.straitCount]].map(([a,b])=>`<div><small>${a}</small><strong>${b}</strong></div>`).join('');
  $('.caption-index').textContent=WORLD_TYPES[world.generationConfig.worldType];
  $('#route-preview').disabled=!world.crossings.length;
  $('#explore').replaceChildren();for(const f of view?.features??[])$('#explore').add(new Option(f.name,f.id));
  const destinations=$('.destinations');destinations.replaceChildren();
  const label=document.createElement('div');label.className='destinations-label';label.textContent='KEŞFEDİLECEK YERLER ↗';destinations.append(label);
  const firstIds=['stamp-1','stamp-0','stamp-3','stamp-2','caldera','canyon','crater','ridges','rift','valleys','forest','biome-9','biome-14','biome-15','biome-16'];
  const picks=firstIds.flatMap(id=>world.landmarks.filter(f=>f.id===id));
  for(const f of [...picks,...world.landmarks.filter(f=>f.id.startsWith('visit-')),...(view?.features??[])].filter((f,i,a)=>a.findIndex(v=>v.id===f.id)===i).slice(0,3)){
    const b=document.createElement('button');b.dataset.visit=f.id;const icon=document.createElement('span');icon.className='destination-icon';icon.textContent='◈';const title=document.createElement('span');title.textContent=f.name;b.append(icon,title);b.addEventListener('click',()=>visit(f.id));destinations.append(b);
  }
  $('#markers').replaceChildren();
  for(const feature of view?.features??[]){const button=document.createElement('button');button.className='map-marker';button.textContent=feature.name;button.dataset.feature=feature.id;button.addEventListener('click',()=>visit(feature.id));$('#markers').append(button);}
}
function updateCameraUI(mode){
  document.body.dataset.camera=mode;
  all('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===mode));
  $('#controls-hint').innerHTML='<span>Sol sürükle · yerküreyi kaydır</span><span>Tekerlek · imlece yaklaş</span><span>Sağ sürükle · eğ / döndür · N · kuzey</span>';
}
function selectFeature(feature){
  selected=feature;const d=feature.direction,s=sampleTerrain(world,d);
  $('#selection-info').replaceChildren();
  const strong=document.createElement('strong');strong.textContent=feature.name??'Seçili yüzey';$('#selection-info').append(strong);
  const rows=[['Zemin',number(s.elevationMeters,1)+' m'],['Su derinliği',number(s.waterDepthMeters,1)+' m'],['Biyom',BIOMES[s.biome]],['Sıcaklık',number(s.temperature,1)+' °C']];
  const regionId=view?.routes.adapter.regionAt(d);
  if(regionId!=null){view.routes.adapter.selectRegion(regionId);rows.push(['Bölge kimliği',String(regionId)]);}
  if(feature.widthMeters)rows.push(['Genişlik',number(feature.widthMeters)+' m']);
  if(feature.minimumWidthMeters)rows.push(['En dar açıklık',number(feature.minimumWidthMeters)+' m']);
  if(feature.recipientId)rows.push(['Su alıcısı',feature.recipientId]);
  for(const [label,value]of rows){const row=document.createElement('div');row.className='datum';const a=document.createElement('span'),b=document.createElement('span');a.textContent=label;b.textContent=value;row.append(a,b);$('#selection-info').append(row);}
}
function visit(id){
  if(!view)return;const feature=view.features.find(f=>f.id===id);if(!feature)return;
  selectFeature(feature);appearance.lightAnchor=feature.direction;view.setAppearance(appearance);const ready=view.setCamera('region',feature.direction,{rangeMeters:feature.rangeMeters,tilt:feature.tilt});toast(feature.name+' · 3 tuşuyla yüzeye inebilirsin.');return ready;
}
function bindCanvas(canvas){
  let down;
  canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
  canvas.addEventListener('pointerup',e=>{if(view?.flight.active)return;if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;const p=view.pick(e.clientX,e.clientY);if(p)selectFeature({...p.feature,direction:p.direction,name:p.feature?.name??'Seçili yüzey'});});
}
async function photo(){
  if(!view)return;toast('Yüksek çözünürlüklü görüntü hazırlanıyor…');try{const blob=await view.capture(2);download(blob,`${safeSeed()}-${view.controls.mode}.png`);toast('Görüntü kaydedildi.');}catch(e){error(e.message);}
}
const flightUI=createFlightUI({getView:()=>view,toast});
renderControls();
$('#layer').add(new Option('Siyasi bölge sınırları','political'));
all('[data-tab]').forEach(button=>button.addEventListener('click',()=>{all('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));all('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==button.dataset.tab);}));
all('[data-camera]').forEach(b=>b.addEventListener('click',()=>view?.setCamera(b.dataset.camera)));
all('[data-visit]').forEach(b=>b.addEventListener('click',()=>visit(b.dataset.visit)));
$('#generate').addEventListener('click',generate);$('#cancel').addEventListener('click',cancel);
$('#random-seed').addEventListener('click',()=>{$('#seed').value='NOVA-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();});
$('#copy-seed').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#seed').value);toast('Seed kopyalandı.');}catch{toast('Kopyalama engellendi; seed alanındaki metni seçerek kopyalayabilirsin.');}});
$('#preset').addEventListener('change',e=>{
 const presets={terran:DEFAULT_CONFIG,continental:{worldType:'terran',landBalance:.70,mountains:.50,plains:.72,forestDensity:.72},coastal:{worldType:'terran',landBalance:.27,mountains:.52,plains:.60,forestDensity:.48},alpine:{worldType:'terran',landBalance:.53,mountains:1,plains:.15,forestDensity:.54,temperature:16},desert:{worldType:'desert',rainfall:.08,forestDensity:0,temperature:42},volcanic:{worldType:'volcanic',forestDensity:0},mars:{worldType:'mars',forestDensity:0},moon:{worldType:'moon',forestDensity:0},alien:{worldType:'alien',rainfall:.65,forestDensity:.55}};
 const seed=$('#seed').value;config={...DEFAULT_CONFIG,...presets[e.target.value],seed};appearance={...appearance,...typeAppearance(config.worldType),tintMode:0};syncAll();$('#generation-note').textContent='Karakter seçildi. Gezegen oluştur ile uygula.';
});
$('#explore-go').addEventListener('click',()=>visit($('#explore').value));
$('#tint-mode').addEventListener('change',e=>{appearance.tintMode=Number(e.target.value);view?.setAppearance(appearance);});
$('#save-settings').addEventListener('click',()=>download(new Blob([JSON.stringify({generationConfig:{...config,seed:$('#seed').value},appearanceConfig:appearance,renderSettings:settings},null,2)],{type:'application/json'}),'ladir-ayarlar.json'));
$('#load-settings').addEventListener('click',()=>$('#settings-input').click());
$('#settings-input').addEventListener('change',async e=>{
  if(!e.target.files[0])return;
  try{
    const obj=JSON.parse(await e.target.files[0].text());config=canonicalConfig(obj.generationConfig);
    for(const [key,,min,max] of controlDefinitions){
      const source=key in appearance?obj.appearanceConfig:key in settings?obj.renderSettings:null;
      if(Number.isFinite(source?.[key]))configFor(key)[key]=Math.max(min,Math.min(max,source[key]));
    }
    if(Number.isInteger(obj.appearanceConfig?.tintMode)&&obj.appearanceConfig.tintMode>=0&&obj.appearanceConfig.tintMode<=4)appearance.tintMode=obj.appearanceConfig.tintMode;
    if(typeof obj.appearanceConfig?.paused==='boolean')appearance.paused=obj.appearanceConfig.paused;
    syncAll();view?.setAppearance(appearance);view?.setRenderSettings(settings);
    toast('Ayarlar yüklendi. Coğrafyayı uygulamak için gezegen oluştur.');
  }catch(err){error(err.message);}e.target.value='';
});
$('#export').addEventListener('click',()=>{if(world)download(new Blob([serializePlanet(world,appearance)],{type:'application/octet-stream'}),`${safeSeed()}.planet`);});
$('#open-package').addEventListener('click',()=>$('#package-input').click());
$('#package-input').addEventListener('change',async e=>{if(!e.target.files[0])return;cancel();const id=++generationId;setProgress('Paket ve dünya imzası doğrulanıyor',.15);try{const imported=await deserializePlanet(await e.target.files[0].arrayBuffer());appearance={...DEFAULT_APPEARANCE,...imported.appearanceConfig};await activate(imported,id);}catch(err){error(err.message);}e.target.value='';});
$('#layer').addEventListener('change',e=>view?.setLayer(e.target.value));$('#show-markers').addEventListener('change',e=>$('#markers').hidden=!e.target.checked);
$('#walk-selected').addEventListener('click',()=>view?.setCamera('surface',selected?.anchors?.[0]??selected?.direction));
$('#route-preview').addEventListener('click',()=>{
  if(!world)return;const c=selected?.id?.startsWith('strait')?world.straits.find(s=>s.id===selected.id):world.crossings[0];
  if(!c)return;const query=c.portalId?{from:c.anchors[0],to:c.anchors[1],portalId:c.portalId,mode:'land'}:{from:c.entrance,to:c.exit,mode:'water',draftMeters:5};
  const result=view.previewRoute(query);
  if(result.passable){view.setCamera('region',c.direction);view.controls.setRangeMeters(c.portalId?1600:100000);}
  toast(result.passable?`Geçiş açık · ${number(result.lengthMeters)} m · rota canlandırılıyor`:`Geçiş kapalı: ${result.reason}`);
});
$('#sunset').addEventListener('click',()=>{appearance.sunElevation=5;appearance.sunAzimuth=-70;view?.setAppearance(appearance);syncAll();});
$('#daylight').addEventListener('click',()=>{appearance.lightAnchor=view?.controls.focus.toArray();appearance.sunElevation=42;appearance.sunAzimuth=35;view?.setAppearance(appearance);syncAll();});
$('#pause').addEventListener('click',()=>{appearance.paused=!appearance.paused;view?.setAppearance(appearance);$('#pause').textContent=appearance.paused?'▷':'Ⅱ';$('#pause').setAttribute('aria-label',appearance.paused?'Zamanı devam ettir':'Zamanı dondur');});
$('#shot').addEventListener('click',photo);$('#photo').addEventListener('click',photo);
$('#fullscreen').addEventListener('click',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
$('#hide-ui').addEventListener('click',()=>document.body.classList.toggle('clean'));
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());all('.close-dialog').forEach(b=>b.addEventListener('click',()=>$('#help-dialog').close()));
$('#dismiss-error').addEventListener('click',()=>$('#error').hidden=true);$('#restart').addEventListener('click',()=>world?activate(world,++generationId):generate());
window.addEventListener('keydown',e=>{if(view?.flight.active)return;if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(['1','2','3','4'].includes(e.key))view?.setCamera({1:'orbit',2:'region',3:'surface',4:'map'}[e.key]);if(e.key.toLowerCase()==='h')document.body.classList.toggle('clean');});
setInterval(()=>{if(!document.hidden)flightUI.update();},50);
let lastUI=0;
function animateUI(now=0){
  if(now-lastUI<100){requestAnimationFrame(animateUI);return;}lastUI=now;
  if(view){$('#tactical-badge').hidden=!view.tactical.active;document.body.classList.toggle('tactical-map',view.tactical.active);}
  if(view&&world&&!view.flight.active){
    const cameraMode=view.tactical.active?'map':view.controls.mode;all('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===cameraMode));
    const p=view.controls.absolute,altitude=(p.length()-1000)*world.radiusMeters/1000,dir=p.clone().normalize();
    $('#altitude').textContent=altitude>1000?number(altitude/1000,1)+' km':number(altitude)+' m';$('#coordinates').textContent=`${number(Math.asin(dir.y)*180/Math.PI,2)}° K / ${number(Math.atan2(dir.x,dir.z)*180/Math.PI,2)}° D`;
    if(!$('#markers').hidden)all('.map-marker').forEach(b=>{const f=view.features.find(f=>f.id===b.dataset.feature),p=view.featurePosition(f);if(b.hidden===p.visible)b.hidden=!p.visible;if(p.visible){const left=p.x+'px',top=p.y+'px';if(b.style.left!==left)b.style.left=left;if(b.style.top!==top)b.style.top=top;}});
  }
  requestAnimationFrame(animateUI);
}
try{const saved=localStorage.getItem('atlas-config-v35');if(saved)config=canonicalConfig(JSON.parse(saved));}catch{}
appearance={...appearance,...typeAppearance(config.worldType)};$('#preset').value=config.worldType;syncAll();animateUI();
const explicitWorld=new URLSearchParams(location.search).get('world');
const defaultBaked=!explicitWorld&&stableStringify(config)===stableStringify(DEFAULT_CONFIG);
const savedWorld=explicitWorld||(defaultBaked?'fixtures/lumen-v35.planet':null);
if(savedWorld){const url=new URL(savedWorld,location.href);if(url.origin!==location.origin)error('Dünya kaydı aynı sunucuda olmalı.');else {setProgress('Kayıtlı dünya doğrulanıyor',.1);fetch(url).then(r=>{if(!r.ok)throw Error('Dünya kaydı bulunamadı');return r.arrayBuffer();}).then(deserializePlanet).then(w=>activate(w)).catch(e=>defaultBaked?generate({reuseCache:true}):error(e.message));}}
else generate({reuseCache:true});
