import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {deserializePlanet} from '../io/bundle.mjs';
import {regionIdentity,REGION_FORMAT,FIELD_VERSION,FIELD_COUNT,CHANNELS,packRegionTile,manifestDigest} from '../io/regional-format.mjs';
import {RegionField,generateRegionNode} from '../io/regional-field.mjs';
import {referenceDirection} from '../core/landforms.mjs';
import {sampleProceduralTerrain} from '../core/terrain.mjs';
import {sha256,cross,normalize} from '../core/math.mjs';
const args=process.argv.slice(2),cells=Number(args.find(a=>a.startsWith('--cells='))?.split('=')[1]??64),fixture=args.find(a=>a.endsWith('.planet'))??'fixtures/lumen-v35.planet';
if(![64,128].includes(cells))throw Error('Supported --cells=64 or 128');
const world=await deserializePlanet(await readFile(fixture)),identity=regionIdentity(world),id=identity.worldHash+'-'+FIELD_VERSION+'-'+cells,dir='assets/regions/'+id;
await mkdir(dir,{recursive:true});await mkdir('evidence/v36',{recursive:true});
const m={format:REGION_FORMAT,fieldVersion:FIELD_VERSION,id,identity,coordinates:{type:'gnomonic-tangent-metres',frame:world.frame,referenceOrigin:{x:-19200,y:48000},units:'metres',normalSpace:'planet-world-unit-vector',heightDatum:'sea-level-radius',heightScale:1},grid:{minX:-16000,minY:-16000,tilesX:16,tilesY:16,tileMeters:2000,cells,stepMeters:2000/cells,haloSamples:1},channels:CHANNELS,featureIds:[null,...world.hydrology.lakes.map(l=>l.id),...world.hydrology.rivers.map(r=>r.id)],lod:{storedHeightLevels:[0],meshLOD:'existing spherical quadtree; independent of raster resolution',interpolation:'Catmull-Rom 4x4; analytical bank/category boundaries; procedural 2-cell region collar',normalStepMeters:2000/cells,baseAndFinalMicro:true},hydrology:{available:true,source:'existing world hydrology only',regionalRivers:world.hydrology.rivers.filter(r=>r.regional).map(r=>r.id),regionalLakes:world.hydrology.lakes.filter(l=>l.regional).map(l=>l.id),denseFlowDirectionAvailable:false,denseAccumulationAvailable:false,analysisResolution:world.generationConfig.analysisResolution},tiles:[]};
const nodes=new Map(),get=(x,y)=>{const k=x+','+y;let n=nodes.get(k);if(!n){n=generateRegionNode(world,m,x,y);nodes.set(k,n);if(nodes.size>100000)nodes.delete(nodes.keys().next().value);}return n;};
const errors=[],started=performance.now();let rawBytes=0,downloadBytes=0;
function point(x,y){const h=get(x,y)[1],d=referenceDirection(world,m.grid.minX+x*m.grid.stepMeters,m.grid.minY+y*m.grid.stepMeters);return d.map(v=>v*(world.radiusMeters+h));}
for(let y=0;y<16;y++){
 for(let x=0;x<16;x++){
  const side=cells+3,data=new Float32Array(side*side*FIELD_COUNT);
  for(let j=-1;j<=cells+1;j++)for(let i=-1;i<=cells+1;i++){
   const gx=x*cells+i,gy=y*cells+j,offset=((j+1)*side+i+1)*FIELD_COUNT;
   data.set(get(gx,gy),offset);
   const a=point(gx+1,gy),b=point(gx-1,gy),c=point(gx,gy+1),d=point(gx,gy-1);
   let n=normalize(cross(a.map((v,k)=>v-b[k]),c.map((v,k)=>v-d[k]))),radial=referenceDirection(world,m.grid.minX+gx*m.grid.stepMeters,m.grid.minY+gy*m.grid.stepMeters);
   if(n.reduce((s,v,k)=>s+v*radial[k],0)<0)n=n.map(v=>-v);data.set(n,offset+17);
  }
  const buffer=packRegionTile(x,y,cells,data),compressed=gzipSync(new Uint8Array(buffer),{level:4}),digest=await sha256(compressed),file='tile-'+x+'-'+y+'-'+digest.slice(0,16)+'.bin.gz';
  await writeFile(dir+'/'+file,compressed);
  m.tiles.push({key:x+'/'+y,x,y,file,sha256:digest,rawSha256:await sha256(buffer),bytes:compressed.byteLength,rawBytes:buffer.byteLength,bounds:{minX:-16000+x*2000,minY:-16000+y*2000,maxX:-14000+x*2000,maxY:-14000+y*2000},lod:0});
  rawBytes+=buffer.byteLength;downloadBytes+=compressed.byteLength;
  const field=new RegionField(world,m);field.install({x,y,side,data,bytes:buffer.byteLength});
  for(let k=0;k<20;k++){
   const rx=-16000+(x+((k*37+19)%101)/101)*2000,ry=-16000+(y+((k*43+23)%103)/103)*2000,d=referenceDirection(world,rx,ry),s=field.sample(d),a=sampleProceduralTerrain(world,d);
   errors.push(Math.abs(s.elevationMeters-a.elevationMeters));
  }
 }
 console.log('Baked row '+(y+1)+'/16; '+(downloadBytes/1048576).toFixed(1)+' MiB');
}
const hydro={...world.hydrology,analysis:{note:'These are the existing coarse planet graph nodes inside the region, not a new dense drainage solution.',nodes:[]}};
for(let i=0;i<world.buffers.directions.length/3;i++){const d=Array.from(world.buffers.directions.subarray(i*3,i*3+3)),f=new RegionField(world,m);if(f.coordinates(d))hydro.analysis.nodes.push({node:i,direction:d,basin:world.buffers.basin?.[i],downstream:world.buffers.flowTo?.[i],accumulation:world.buffers.accumulation?.[i]});}
const hb=new TextEncoder().encode(JSON.stringify(hydro));await writeFile(dir+'/hydrology.json',hb);m.hydrology.file='hydrology.json';m.hydrology.sha256=await sha256(hb);m.hydrology.bytes=hb.byteLength;
errors.sort((a,b)=>a-b);m.validation={samples:errors.length,heightErrorMeters:{p50:errors[Math.floor(errors.length*.5)],p95:errors[Math.floor(errors.length*.95)],p99:errors[Math.floor(errors.length*.99)],max:errors.at(-1)},note:'Compared to original continuous generator. This fixed sampling profile is identical between procedural and packaged runtime paths; it is not mathematically lossless versus the continuous function.'};
m.disk={rawBytes,downloadBytes:downloadBytes+hb.byteLength};const digest=await manifestDigest(m);
await writeFile(dir+'/manifest.json',JSON.stringify(m,null,2));
await writeFile('io/regional-catalog.mjs','// Generated by npm run bake:region. Immutable versioned regional package.\nexport const REGIONAL_CATALOG='+JSON.stringify({[identity.worldHash]:{manifest:m,manifestSha256:digest,base:'assets/regions/'+id+'/'}})+';\n');
await writeFile('evidence/v36/region-bake.json',JSON.stringify({fixture,dir,manifestSha256:digest,ms:performance.now()-started,identity,disk:m.disk,validation:m.validation},null,2));
console.log(JSON.stringify({dir,ms:performance.now()-started,disk:m.disk,validation:m.validation}));
await import('./validate-region.mjs');
