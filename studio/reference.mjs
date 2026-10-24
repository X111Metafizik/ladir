import * as THREE from 'three/webgpu';
import {createPlanetView} from '../render/view.mjs';
import {deserializePlanet} from '../io/bundle.mjs';
import {DEFAULT_APPEARANCE,DEFAULT_RENDER} from '../core/world.mjs';
import {referenceDirection,referenceCoordinates} from '../core/landforms.mjs';
import {faceDirection} from '../core/cube.mjs';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),old=params.get('world')==='old';$('#world').value=old?'old':'new';
const response=await fetch(new URL(old?'../fixtures/legacy-lumen-v31.planet':'../fixtures/lumen-v35.planet',import.meta.url));
if(!response.ok)throw Error('Referans dünya paketi bulunamadı.');
const world=await deserializePlanet(await response.arrayBuffer()),focus=referenceDirection(world,0,0),appearance={...DEFAULT_APPEARANCE,paused:true,lightAnchor:focus};
const view=await createPlanetView({world,canvas:$('#planet'),appearanceConfig:appearance,renderSettings:{...DEFAULT_RENDER},initialCamera:{direction:focus,rangeMeters:27000,tilt:.65},onError:m=>$('#error').textContent=m});
view.controls.targetElevationMeters=1200;
const overlays=new THREE.Group();overlays.visible=false;view.terrain.group.add(overlays);
const origin=new THREE.Vector3(...focus).multiplyScalar(1000),scale=1000/world.radiusMeters;overlays.position.copy(origin);
for(const river of world.hydrology.rivers){
 const points=river.points.filter(p=>{const [x,y,z]=referenceCoordinates(world,p.direction);return z>.9&&Math.abs(x)<20500&&Math.abs(y)<20500;});if(points.length<2)continue;
 const coordinates=points.flatMap(p=>p.direction.map((v,k)=>v*(1000+(p.waterLevelMeters+35)*scale)-origin.getComponent(k)));
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));const mat=new THREE.LineBasicNodeMaterial({color:river.regional?0x43e8f4:0xf0cc68,depthTest:false});overlays.add(new THREE.Line(g,mat));
 for(let i=4;i<points.length;i+=12){const a=points[i-1],b=points[i],p=new THREE.Vector3(...b.direction).multiplyScalar(1000+(b.waterLevelMeters+40)*scale).sub(origin),dir=new THREE.Vector3(...b.direction).sub(new THREE.Vector3(...a.direction)).normalize();overlays.add(new THREE.ArrowHelper(dir,p,340*scale,0x43e8f4,130*scale,90*scale));}
}
let mode='gray',dense=false,loading=false,analysis=null;
const basinCanvas=document.createElement('canvas');basinCanvas.width=basinCanvas.height=257;Object.assign(basinCanvas.style,{position:'absolute',right:'16px',bottom:'16px',width:'280px',height:'280px',border:'1px solid #77959a',display:'none'});$('#stage').append(basinCanvas);
const analysisWorker=new Worker(new URL('../workers/reference.mjs',import.meta.url),{type:'module'});
analysisWorker.onmessage=({data})=>{if(data.error){$('#error').textContent=data.error;return;}analysis=data;const ctx=basinCanvas.getContext('2d'),image=ctx.createImageData(257,257),maximum=data.summary.maxAccumulation;
 for(let y=0;y<257;y++)for(let x=0;x<257;x++){const j=y*257+x,k=((256-y)*257+x)*4,id=data.basin[j],h=data.heights[j],flow=Math.log1p(data.accumulation[j])/Math.log1p(maximum);image.data[k]=40+(id*17%45)+Math.min(70,h/60);image.data[k+1]=60+(id*31%45)+flow*65;image.data[k+2]=70+(id*11%45)+flow*85;image.data[k+3]=255;}ctx.putImageData(image,0,0);ctx.strokeStyle='#d8ffff';ctx.lineWidth=.7;
 for(let y=4;y<253;y+=12)for(let x=4;x<253;x+=12){const i=y*257+x,r=data.receiver[i];if(r<0)continue;const dx=r%257-x,dy=Math.floor(r/257)-y;ctx.beginPath();ctx.moveTo(x,256-y);ctx.lineTo(x+dx*4,256-y-dy*4);ctx.stroke();}analysisWorker.terminate();};
analysisWorker.postMessage({world});
async function reset(){await view.setCamera('region',focus,{rangeMeters:27000,tilt:.65});view.controls.yaw=0;}
async function setMode(value){loading=true;mode=value;$('#status').textContent='Karşılaştırma hazırlanıyor…';overlays.visible=value==='flow';basinCanvas.style.display=value==='flow'?'block':'none';view.setAppearance({...appearance,sunElevation:value==='final'?42:20,sunAzimuth:value==='final'?35:-65,atmosphere:value==='final'?.45:0,clouds:0,fog:value==='final'?.10:0});await view.setLayer(value==='final'?'natural':value==='flow'?'basin':'gray');loading=false;}
function metrics(){const samples=[];for(const m of view.terrain.active.values()){const p=m.userData.patch,d=faceDirection(p.face,p.u+p.size/2,p.v+p.size/2),[x,y,z]=referenceCoordinates(world,d);if(z>.9&&Math.abs(x)<16000&&Math.abs(y)<16000)samples.push({lod:p.level,cells:p.resolution,metersPerCell:p.size*world.radiusMeters/(p.resolution??16)/Math.sqrt(1+(p.u+p.size/2)**2+(p.v+p.size/2)**2)});}samples.sort((a,b)=>a.metersPerCell-b.metersPerCell);return {seed:world.generationConfig.seed,worldHash:world.manifest.worldDataHash,generator:world.manifest.generatorVersion,radiusMeters:world.radiusMeters,diameterMeters:2*world.radiusMeters,regionMeters:32000,mode,dense,altitudeMeters:(view.controls.absolute.length()-1000)/scale,fov:view.camera.fov,camera:{positionMeters:view.controls.absolute.toArray().map(v=>v/scale),targetDirection:focus,rangeMeters:27000,tilt:.65,targetElevationMeters:1200},spacing:{min:samples[0]?.metersPerCell,median:samples[Math.floor(samples.length/2)]?.metersPerCell,max:samples.at(-1)?.metersPerCell},levels:[...new Set(samples.map(s=>s.lod))].sort((a,b)=>a-b),samples,analysis:analysis?.summary,terrain:{...view.terrain.stats}};}
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>setMode(b.dataset.mode);
$('#dense').onclick=async()=>{loading=true;dense=!dense;$('#dense').setAttribute('aria-pressed',String(dense));view.terrain.referenceResolution=dense?64:undefined;await view.terrain.update(view.controls.absolute,1,true);loading=false;};
$('#reset').onclick=reset;$('#world').onchange=e=>location.href='?world='+e.target.value;$('#save').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(metrics(),null,2)],{type:'application/json'}));a.download='NADIR-havza-kamera-grid.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
window.referenceStudio={world,view,metrics,setMode,reset,get ready(){return !loading&&!!analysis;}};
await reset();await setMode(params.get('mode')??'gray');
setInterval(()=>{if(loading)return;const m=metrics(),f=x=>Number(x??0).toFixed(1),lake=world.hydrology.lakes.find(l=>l.regional),hydro=lake?`Turkuaz: ortak havza akarsuları ve akış yönü\nGöl ${f(lake.waterLevelMeters)} m · taşma ${f(lake.spillLevelMeters)} m`:'Sarı: korunmuş V31 akarsuları · sağ altta ölçülen havza ve akış yönü';$('#status').textContent=`${old?'V31 KORUNMUŞ İÇERİK':'YENİ HAVZA'} · ${world.generationConfig.seed}\n${m.diameterMeters/1000} km çap / ${m.radiusMeters/1000} km yarıçap\nKamera ${f(m.altitudeMeters/1000)} km · FOV ${m.fov}° · LOD ${m.levels.join(' / ')}\nGrid m/hücre: ${f(m.spacing.min)} — ${f(m.spacing.median)} — ${f(m.spacing.max)}\n${mode==='flow'?hydro:'Göl, sırt, ova, vadi ve kanyon aynı metre yüzeyini kullanır.'}`;},500);
