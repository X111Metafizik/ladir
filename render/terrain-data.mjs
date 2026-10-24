import {clipWaterTriangle} from './water-clip.mjs';
import {referenceWeight,referenceCoordinates,modernTerrain} from '../core/landforms.mjs';
import {boundsOf} from './terrain-budget.mjs';
import {faceDirection,directionFace,projectToFace} from '../core/cube.mjs';
import {sampleTerrain,biomeColor,surfaceNormal,nearestRiver} from '../core/terrain.mjs';
import {segmentsForPatch,sampleNetwork} from '../core/river-network.mjs';
import {dot,cross,normalize,mix,clamp,smooth} from '../core/math.mjs';
export const PATCH=16;
const descriptor=(face,x,y,level)=>{const size=2/2**level;return {face,x,y,level,u:x*size-1,v:y*size-1,size,key:`${face}/${level}/${x}/${y}`};};
export function selectPatches(world,camera,detail=1,view=null,options={}){
  const sample=options.sample??((d,o)=>sampleTerrain(world,d,o));
  const leaves=[],length=Math.hypot(...camera),up=camera.map(v=>v/length),scale=1000/world.radiusMeters;
  const altitude=(length-1000)/scale,stamped=!!world.buffers?.stampHeights&&(world.generationConfig.terrainStamps??0)>0;
  const under=sample(up),clearance=altitude-Math.max(under.elevationMeters,under.waterSurfaceMeters);
  const intermediate=stamped&&altitude<=60000&&clearance>8000;
  // Spend the dense grid on the expanded visible footprint, keeping reusable
  // background geometry lighter. Stitching below also handles 16/32 neighbors
  // at the same quadtree level, so neither a crack nor a skirt is needed.
  const resolutionFor=(level,visible=true,meters=0)=>options.resolution??(options.referenceResolution&&level>=10&&visible?options.referenceResolution:altitude>60000?20:level>=14?(visible&&meters<16000?32:PATCH):level<(intermediate?11:14)?8:PATCH);
  const surfaceView=!!view&&clearance<8000;
  const transition=clamp((clearance-4000)/4000,0,1),surfaceSpacing=.0045+.0205*transition*transition*(3-2*transition);
  const maxLevel=Math.min(options.maxLevel??30,Math.max(Math.ceil(Math.log2(2*world.radiusMeters/(3/detail*PATCH))),surfaceView?Math.ceil(Math.log2(2*world.radiusMeters/(.75*32))):0));
  const previousBranches=new Set();for(const p of options.previous??[])for(let level=3;level<p.level;level++){const f=2**(p.level-level);previousBranches.add(`${p.face}/${level}/${Math.floor(p.x/f)}/${Math.floor(p.y/f)}`);}
  function visit(p){
    const d=faceDirection(p.face,p.u+p.size/2,p.v+p.size/2),extent=p.size*1000;
    if(p.level>=3&&dot(d,up)+p.size*1.5<1000/length-Math.sqrt(12000/world.radiusMeters))return;
    const h=p.level>(options.arrival?9:4)?sample(d,{micro:false}).elevationMeters:0;
    const distance=Math.hypot(...d.map((v,i)=>v*(1000+h*scale)-camera[i]));
    // Refinement covers the current camera and the bounded travel corridor.
    // A single union tree is stitched, so preloading cannot open LOD seams.
    const predicted=view?.predict?Math.hypot(...d.map((v,i)=>v*(1000+h*scale)-view.predict[i])):distance;
    const detailDistance=Math.min(distance,predicted*1.15+100*scale);
    const riverRange=Math.min(65000,Math.max(6000,(length-1000)/scale*2.2));
    const nearRiver=!options.arrival&&p.level>=9&&p.level<maxLevel&&distance/scale<riverRange?nearestRiver(world,d):null;
    const riverPixels=nearRiver?nearRiver.widthMeters*(view?.viewportHeight??1000)/(2*(view?.tanY??.5)*Math.max(1,distance/scale)):0;
    const riverVisible=nearRiver&&(distance/scale<4200||(view?riverPixels>1:nearRiver.widthMeters/(distance/scale)>.002));
    // A visible channel needs several actual vertices across its bed; a water
    // ribbon alone cannot stop a coarse terrain triangle covering the stream.
    const riverSpacing=nearRiver?(view?Math.max(6,Math.min(160,nearRiver.widthMeters/4)):Math.max(8,Math.min(160,nearRiver.widthMeters/3),distance/scale*.0018)):0;
    let refineRiver=riverVisible&&p.size*world.radiusMeters/PATCH>riverSpacing&&nearRiver.distanceMeters<extent/scale*.75+nearRiver.widthMeters/2+100;
    const delta=d.map((v,i)=>v*(1000+h*scale)-camera[i]),forward=view?dot(delta,view.forward):0,margin=extent*1.2;
    const visible=!view||(forward+margin>0&&Math.abs(dot(delta,view.right))<forward*view.tanX*1.25+margin&&Math.abs(dot(delta,view.up))<forward*view.tanY*1.25+margin);
    refineRiver &&= visible||distance/scale<1400;
    const geology=options.arrival?.6:detailDistance/scale<1800?3.05:detailDistance/scale<5000?2.3:detailDistance/scale<60000?1.8:1.35;
    const nearbyDetail=visible||distance/scale<1400||p.level<10;
    // Preserve the visible mountain silhouette at regional/orbital heights.
    // Only the view footprint receives the extra subdivisions; the offscreen
    // globe retains the bounded background quadtree.
    let regional=false;
    // Maximum surface quality through 4 km AGL, including high mountain tops.
    // A 4–8 km approach band prepares it early. Refine only the visible and
    // predicted footprint, then relax the distant horizon to bound GPU work.
    if(surfaceView&&p.level>=10&&detailDistance/scale<16000){
      const meters=detailDistance/scale,fade=clamp((meters-4000)/12000,0,1);
      // Near the horizon the footprint collapses along one axis. Avoid
      // spending full overhead-view tessellation on subpixel triangles.
      const incidence=Math.max(.2,Math.abs(dot(d,delta))/Math.max(distance,1e-8));
      const grazing=clamp((meters-500)/1500,0,1),screenArea=1+(1/Math.sqrt(incidence)-1)*grazing*grazing*(3-2*grazing);
      // Keep the near ground at the 2 km geometric density as the camera
      // rises to 4 km; don't just extend texture contrast over coarse facets.
      const lift=clamp((clearance-2000)/2000,0,1),detailMeters=meters-Math.min(2000,meters*.5)*lift;
      const targetSpacing=Math.max(.75,detailMeters*surfaceSpacing*(1+4*fade*fade*(3-2*fade))*screenArea);
      // Cube UV metres overestimate real ground distance near face edges.
      // Use the projection's maximum tangent stretch to avoid subdividing
      // those areas twice as finely as the same scene at a face center.
      const u=p.u+p.size/2,v=p.v+p.size/2,projection=1/Math.sqrt(1+u*u+v*v);
      regional=visible&&p.size*world.radiusMeters*projection/resolutionFor(p.level)>targetSpacing;
    }
    // Resolve the imported ridges before reaching flight height. Restrict this
    // intermediate band to the visible footprint and a physical pixel budget.
    if(intermediate&&view&&distance/scale<85000&&p.level>=9){
      const targetSpacing=clamp(distance/scale*.009,32,765)/detail;
      regional=visible&&p.size*world.radiusMeters/resolutionFor(p.level)>targetSpacing;
    }
    if(view&&altitude>60000&&p.level>=3){
      const margin=extent*.85;
      const inView=forward+margin>0&&Math.abs(dot(delta,view.right))<forward*view.tanX+margin&&Math.abs(dot(delta,view.up))<forward*view.tanY+margin;
      // There is no physical range at which relief disappears. A 480 km
      // cutoff put coarse cells next to detailed ridges in the same image.
      // Keep a bounded projected grid across the whole visible footprint;
      // grazing terrain spends fewer vertices per square kilometre.
      const incidence=Math.max(.25,Math.abs(dot(d,delta))/Math.max(distance,1e-8));
      const projection=1/Math.sqrt(1+(p.u+p.size/2)**2+(p.v+p.size/2)**2);
      const targetSpacing=Math.max(150,distance/scale*.0036)/detail/Math.sqrt(incidence);
      regional=inView&&p.size*world.radiusMeters*projection/resolutionFor(p.level)>targetSpacing;
    }
    let shoreRefine=false;
    if(view&&visible&&p.level>=8&&distance/scale<85000){
      const spacing=p.size*world.radiusMeters/resolutionFor(p.level),limit=Math.max(8,distance/scale*.0017)/detail;
      if(spacing>limit)for(const lake of world.hydrology.lakes){const r=Math.hypot(...d.map((v,k)=>v-lake.direction[k]))*world.radiusMeters;if(Math.abs(r-lake.radiusMeters)<lake.radiusMeters*.28+p.size*world.radiusMeters*.8){shoreRefine=true;break;}}
    }
    let geometric=false;
    if(view&&visible&&p.level>=8&&p.level<maxLevel&&distance/scale<200000&&!regional){
      const cell=p.size/resolutionFor(p.level),x=p.u+p.size/2,y=p.v+p.size/2;
      const sampleH=(u,v)=>sample(faceDirection(p.face,u,v),{micro:false}).elevationMeters;
      const error=Math.abs(h-(sampleH(x-cell,y-cell)+sampleH(x+cell,y-cell)+sampleH(x-cell,y+cell)+sampleH(x+cell,y+cell))*.25);
      const pixelsPerMeter=(view.viewportHeight??1000)/(2*view.tanY*Math.max(1,distance/scale));
      const retained=previousBranches.has(p.key);
      geometric=error*pixelsPerMeter>(retained?2.0:2.5);
      p.errorPixels=error*pixelsPerMeter;
      if(referenceWeight(world,d)>.5){const [rx,ry]=referenceCoordinates(world,d),axis=8400+1100*Math.sin(ry/3900)+400*Math.sin(ry/1450);
        if(Math.abs(rx-axis)<1800+p.size*world.radiusMeters&&300*pixelsPerMeter>2)geometric ||= cell*world.radiusMeters>75;
      }
    }
    if(p.level<3||(p.level<maxLevel&&((nearbyDetail&&detailDistance<extent*(geology+detail*.35))||refineRiver||regional||geometric||shoreRefine))){
      for(let y=0;y<2;y++)for(let x=0;x<2;x++)visit(descriptor(p.face,p.x*2+x,p.y*2+y,p.level+1));
    }else {p.priority=distance/scale*(visible?1:5);p.resolution=resolutionFor(p.level,visible,detailDistance/scale);leaves.push(p);}
  }
  for(let f=0;f<6;f++)visit(descriptor(f,0,0,0));
  const lookup=new Map(leaves.map(p=>[p.key,p]));
  for(const p of leaves){
    const e=p.size*.0001,midU=p.u+p.size/2,midV=p.v+p.size/2;
    p.stitchResolution=[];p.stitch=[[midU,p.v-e],[p.u+p.size+e,midV],[midU,p.v+p.size+e],[p.u-e,midV]].map(([u,v])=>{
      const [face,a,b]=directionFace(faceDirection(p.face,u,v));
      for(let level=p.level;level>=3;level--){const n=2**level,x=Math.min(n-1,Math.max(0,Math.floor((a+1)*n/2))),y=Math.min(n-1,Math.max(0,Math.floor((b+1)*n/2)));const neighbor=lookup.get(`${face}/${level}/${x}/${y}`);if(neighbor){const coarser=level<p.level||neighbor.resolution<p.resolution;p.stitchResolution.push(coarser?neighbor.resolution:p.resolution);return coarser?level:0;}}
      p.stitchResolution.push(p.resolution);return 0;
    });
  }
  // Four tiles can meet at a vertex even when the midpoints of their edges
  // have different neighbors. Share the coarsest frequency band at those
  // knots too; per-edge stitching alone left corner holes in stamped relief.
  const bandCache=new Map(),bandAt=(face,u,v)=>{
    const cacheKey=face+'/'+u+'/'+v;if(bandCache.has(cacheKey))return bandCache.get(cacheKey);
    let band=Infinity;const epsilon=2**(-maxLevel-8);
    for(const dx of [-epsilon,epsilon])for(const dy of [-epsilon,epsilon]){
      const [f,a,b]=directionFace(faceDirection(face,u+dx,v+dy));
      for(let level=maxLevel;level>=3;level--){const n=2**level,x=Math.min(n-1,Math.max(0,Math.floor((a+1)*n/2))),y=Math.min(n-1,Math.max(0,Math.floor((b+1)*n/2))),neighbor=lookup.get(`${f}/${level}/${x}/${y}`);if(neighbor){band=Math.min(band,level+Math.log2(neighbor.resolution));break;}}
    }
    bandCache.set(cacheKey,band);return band;
  };
  for(const p of leaves){
    const N=p.resolution,own=p.level+Math.log2(N),knots=new Map(),put=(x,y)=>{const band=bandAt(p.face,p.u+x/N*p.size,p.v+y/N*p.size);if(band<own)knots.set(x+','+y,band);};
    for(const [x,y]of [[0,0],[N,0],[N,N],[0,N]])put(x,y);
    for(let side=0;side<4;side++)if(p.stitch[side]){const step=2**(p.level-p.stitch[side])*N/p.stitchResolution[side],horizontal=side===0||side===2,offset=(horizontal?p.x:p.y)*N,start=Math.floor(offset/step)*step-offset;
      for(let j=start;j<=N+step;j+=step)put(horizontal?j:side===1?N:0,horizontal?(side===0?0:N):j);
    }
    p.boundaryBands=Object.fromEntries(knots);p.key+='/s'+p.stitch.join('.')+'/r'+N+'/n'+p.stitchResolution.join('.')+'/b'+[...knots].map(([key,value])=>key+':'+value).join(';');
  }
  return leaves;
}
export function buildPatch(world,p,layer='natural',sample=(d,options)=>sampleTerrain(world,d,options)){
  const N=p.resolution??PATCH,scale=1000/world.radiusMeters,center=faceDirection(p.face,p.u+p.size/2,p.v+p.size/2).map(v=>v*1000);
  const capacity=(N+1)**2+(p.level<8?4*(N+1):0);
  const fixed=(Type,length)=>{const a=new Type(length);a.used=0;a.push=(...values)=>{a.set(values,a.used);a.used+=values.length;};return a;};
  const positions=fixed(Float32Array,capacity*3),colors=fixed(Float32Array,capacity*3),surface=fixed(Float32Array,capacity*4),climate=fixed(Float32Array,capacity*2),normals=fixed(Float32Array,capacity*3),waterPositions=[],waterNormals=[],shallows=[],wet=[],indices=fixed(Uint16Array,(N*N+(p.level<8?4*N:0))*6),waterIndices=[],waterLevels=new Float64Array((N+1)**2),terrainHeights=new Float64Array((N+1)**2),waterBodies=new Array((N+1)**2);
  function colorOf(s,d){
    let color=biomeColor(layer==='natural'?{...s,snow:0}:s);
    if(layer==='gray')color=[.42,.42,.42];
    if(layer==='height'){const h=Math.max(0,Math.min(1,(s.elevationMeters+2000)/6500));color=[h*.85,.2+(1-Math.abs(h-.5)*2)*.5,(1-h)*.75];}
    if(layer==='biome')color=biomeColor({...s,elevationMeters:0}).map(v=>v*1.5);
    if(layer==='water')color=s.waterDepthMeters>0?[.02,.28,.7]:[.16,.25,.08];
    if(layer==='protected')color=s.protectedFeatureMask>.2?[.65,.25,.08]:color.map(v=>v*.6);
    if(layer==='basin'||layer==='flow'){
      const [f,u,v]=directionFace(d),r=world.generationConfig.analysisResolution,i=world.buffers.faceNodeIds[f*(r+1)**2+Math.round((v+1)*r/2)*(r+1)+Math.round((u+1)*r/2)];
      const id=world.buffers.basin[i],a=Math.log10(1+world.buffers.accumulation[i])/14;
      color=layer==='basin'?[.13+(id%17)/28,.13+(id%29)/42,.15+(id%41)/57]:[.04,a*.6,a*.9];
    }
    return color;
  }
  // Sub-grid 700 m stamps and metre-scale noise are band-limited on coarse
  // grids. Large and regional stamps remain exact. At an edge the fine tile
  // samples the coarse tile's band as well as its chord and normal spacing.
  const spacing=p.size*world.radiusMeters/N;
  const bandStep=(x,y,step=1)=>Math.max(step,p.boundaryBands?.[x+','+y]===undefined?1:2**(p.level+Math.log2(N)-p.boundaryBands[x+','+y]));
  const halo=new Map(),pointAt=(x,y,step=1)=>{step=bandStep(x,y,step);const microWeight=modernTerrain(world)?1-smooth(128,384,spacing*step):Number(spacing*step<=128),micro=microWeight>0,key=x+','+y+','+microWeight;let item=halo.get(key);if(!item){const d=faceDirection(p.face,p.u+x/N*p.size,p.v+y/N*p.size),s=sample(d,{micro,microWeight});item={d,sample:s,point:d.map((v,i)=>v*(1000+s.elevationMeters*scale)-center[i])};halo.set(key,item);}return item;};
  for(let y=0;y<=N;y++)for(let x=0;x<=N;x++){
    const {d,sample:s,point}=pointAt(x,y);
    positions.push(...point);
    const wi=y*(N+1)+x;waterLevels[wi]=s.waterSurfaceMeters;terrainHeights[wi]=s.elevationMeters;waterBodies[wi]=s.featureId??'ocean';
    waterPositions.push(...d.map((v,i)=>v*(1000+(s.waterSurfaceMeters+.03)*scale)-center[i]));
    waterNormals.push(...d);wet.push(s.waterDepthMeters>0&&(!s.featureId||s.featureId.startsWith('lake')));shallows.push(Math.exp(-s.waterDepthMeters/350));
    if(p.level<8)normals.push(...d);else{const step=bandStep(x,y),e=pointAt(x+step,y,step).point,w=pointAt(x-step,y,step).point,n=pointAt(x,y+step,step).point,south=pointAt(x,y-step,step).point;const ax=e[0]-w[0],ay=e[1]-w[1],az=e[2]-w[2],bx=n[0]-south[0],by=n[1]-south[1],bz=n[2]-south[2],nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,k=(nx*d[0]+ny*d[1]+nz*d[2]<0?-1:1)/(Math.hypot(nx,ny,nz)||1);normals.push(nx*k,ny*k,nz*k);}
    const color=colorOf(s,d);
    colors.push(...color);surface.push(layer==='natural'?s.biome:-1,s.forest??0,s.lava??0,s.elevationMeters);climate.push(s.snow??0,s.moisture??0);
  }
  const point=i=>positions.slice(i*3,i*3+3),delta=(a,b)=>a.map((v,i)=>v-b[i]);
  function triangle(a,b,c,list){const i=a*3,j=b*3,k=c*3,x=positions[j]-positions[i],y=positions[j+1]-positions[i+1],z=positions[j+2]-positions[i+2],u=positions[k]-positions[i],v=positions[k+1]-positions[i+1],w=positions[k+2]-positions[i+2];if((y*w-z*v)*center[0]+(z*u-x*w)*center[1]+(x*v-y*u)*center[2]<0)list.push(a,c,b);else list.push(a,b,c);}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const a=y*(N+1)+x,b=a+1,c=a+N+1,d=c+1;
    triangle(a,b,c,indices);triangle(b,d,c,indices);
    if(p.level<8&&(wet[a]||wet[b]||wet[c]))triangle(a,b,c,waterIndices);
    if(p.level<8&&(wet[b]||wet[d]||wet[c]))triangle(b,d,c,waterIndices);
  }
  // Match a coarse neighbor's actual chord, including across cube faces.
  // Deep skirts alone leave a dotted ledge wherever fine relief rises above it.
  const edgeNormals=new Map();
  function normalAt(x,y,step){step=bandStep(x,y,step);const key=x+','+y+','+step;if(edgeNormals.has(key))return edgeNormals.get(key);const a=pointAt(x+step,y,step).point,b=pointAt(x-step,y,step).point,c=pointAt(x,y+step,step).point,d=pointAt(x,y-step,step).point;let n=normalize(cross(delta(a,b),delta(c,d)));if(dot(n,center)<0)n=n.map(v=>-v);edgeNormals.set(key,n);return n;}
  for(let side=0;side<4;side++){
    if(!p.stitch?.[side])continue;
    const step=2**(p.level-p.stitch[side])*(N/(p.stitchResolution?.[side]??N)),horizontal=side===0||side===2,offset=(horizontal?p.x:p.y)*N;
    for(let j=0;j<=N;j++){
      const start=Math.floor((offset+j)/step)*step-offset,t=(j-start)/step;
      const x=horizontal?j:side===1?N:0,y=horizontal?(side===0?0:N):j,i=y*(N+1)+x;
      const ax=horizontal?start:x,ay=horizontal?y:start,bx=horizontal?start+step:x,by=horizontal?y:start+step;
      const a=pointAt(ax,ay,step),b=pointAt(bx,by,step),na=normalAt(ax,ay,step),nb=normalAt(bx,by,step);
      const ca=colorOf(a.sample,a.d),cb=colorOf(b.sample,b.d),sa=a.sample,sb=b.sample;
      for(let k=0;k<3;k++){positions[i*3+k]=mix(a.point[k],b.point[k],t);normals[i*3+k]=mix(na[k],nb[k],t);colors[i*3+k]=mix(ca[k],cb[k],t);}
      surface[i*4]=layer==='natural'?mix(sa.biome,sb.biome,t):-1;
      surface[i*4+1]=mix(sa.forest??0,sb.forest??0,t);surface[i*4+2]=mix(sa.lava??0,sb.lava??0,t);surface[i*4+3]=mix(sa.elevationMeters,sb.elevationMeters,t);
      climate[i*2]=mix(sa.snow??0,sb.snow??0,t);climate[i*2+1]=mix(sa.moisture??0,sb.moisture??0,t);
    }
  }
  // Shore triangles are clipped after stitching. A wet corner no longer
  // draws a whole triangle whose other corners use sea level or another lake.
  if(p.level>=8&&wet.some(Boolean)){
   const edgeCache=new Map();
   for(let i=0;i<terrainHeights.length;i++)terrainHeights[i]=(Math.hypot(positions[i*3]+center[0],positions[i*3+1]+center[1],positions[i*3+2]+center[2])-1000)/scale;
   for(let i=0;i<indices.used;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2];if(!wet[a]&&!wet[b]&&!wet[c])continue;
    if(wet[a]&&wet[b]&&wet[c]&&waterBodies[a]===waterBodies[b]&&waterBodies[a]===waterBodies[c]&&waterLevels[a]===waterLevels[b]&&waterLevels[a]===waterLevels[c]){waterIndices.push(a,b,c);continue;}
    const ids=[a,b,c],wetIds=ids.filter(id=>wet[id]);
    const done=new Set();
    for(const wi of wetIds){
     const body=waterBodies[wi],level=waterLevels[wi];if(done.has(body))continue;done.add(body);
     const polygon=clipWaterTriangle(ids,terrainHeights,waterLevels,waterBodies,body,level),vertices=[];
     for(const v of polygon){
      if(v.a===v.b&&waterLevels[v.a]===level){vertices.push(v.a);continue;}
      const a=Math.min(v.a,v.b),b=Math.max(v.a,v.b),t=v.a===a?v.t:1-v.t,key=body+'/'+level+'/'+a+'/'+b;
      let index=edgeCache.get(key);
      if(index===undefined){
       const q=[0,1,2].map(k=>mix(waterNormals[a*3+k],waterNormals[b*3+k],t)),length=Math.hypot(...q);for(let k=0;k<3;k++)q[k]/=length;
       index=waterPositions.length/3;waterPositions.push(...q.map((d,k)=>d*(1000+(level+.03)*scale)-center[k]));waterNormals.push(...q);shallows.push(mix(shallows[a],shallows[b],t));edgeCache.set(key,index);
      }
      vertices.push(index);
     }
     for(let j=1;j+1<vertices.length;j++)waterIndices.push(vertices[0],vertices[j],vertices[j+1]);
    }
   }
  }
  const depth=Math.max(12,Math.min(4000,p.size*world.radiusMeters/N*.8))*scale;
  const edges=[Array.from({length:N+1},(_,i)=>i),Array.from({length:N+1},(_,i)=>i*(N+1)+N),Array.from({length:N+1},(_,i)=>N*(N+1)+N-i),Array.from({length:N+1},(_,i)=>(N-i)*(N+1))];
  for(const edge of (p.level<8?edges:[])){const start=positions.used/3;for(const i of edge){const n=waterNormals.slice(i*3,i*3+3);positions.push(...point(i).map((v,k)=>v-n[k]*(p.level>=8?2*scale:depth)));normals.push(...normals.slice(i*3,i*3+3));colors.push(...colors.slice(i*3,i*3+3));surface.push(...surface.slice(i*4,i*4+4));climate.push(...climate.slice(i*2,i*2+2));}for(let j=0;j<N;j++){const a=edge[j],b=edge[j+1],c=start+j,d=c+1;triangle(a,b,c,indices);triangle(b,d,c,indices);}}
  if(!waterIndices.length){waterPositions.length=waterNormals.length=shallows.length=0;}
  for(const edge of (waterIndices.length?edges:[])){const start=waterPositions.length/3;for(const i of edge){const n=waterNormals.slice(i*3,i*3+3);waterPositions.push(...waterPositions.slice(i*3,i*3+3).map((v,k)=>v-n[k]*depth));waterNormals.push(...n);shallows.push(shallows[i]);}for(let j=0;j<N;j++)if(wet[edge[j]]&&wet[edge[j+1]]&&waterBodies[edge[j]]===waterBodies[edge[j+1]]&&waterLevels[edge[j]]===waterLevels[edge[j+1]]){const a=edge[j],b=edge[j+1],c=start+j,d=c+1;waterIndices.push(a,b,c,b,d,c,a,c,b,b,c,d);}}
  // Narrow watercourses survive a terrain grid coarser than the channel width.
  if(p.level>=9)for(const {a,b} of segmentsForPatch(world,p)){
    const A=projectToFace(a.direction,p.face),B=projectToFace(b.direction,p.face);if(!A||!B)continue;
    let lo=0,hi=1;const du=B[1]-A[1],dv=B[2]-A[2];
    for(const [start,delta,min,max] of [[A[1],du,p.u,p.u+p.size],[A[2],dv,p.v,p.v+p.size]]){
      if(Math.abs(delta)<1e-14){if(start<min||start>max){hi=-1;break;}}else{const t1=(min-start)/delta,t2=(max-start)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
    }
    if(lo>=hi)continue;
    const length=Math.hypot(...b.direction.map((v,i)=>v-a.direction[i]))*world.radiusMeters,steps=Math.max(1,Math.ceil(length*(hi-lo)/Math.max(80,Math.min(1200,p.size*world.radiusMeters/N)))),side=normalize(cross(a.direction,b.direction)),start=waterPositions.length/3;
    for(let j=0;j<=steps;j++){
      const t=mix(lo,hi,j/steps),d=normalize(a.direction.map((v,i)=>mix(v,b.direction[i],t))),half=mix(a.widthMeters,b.widthMeters,t)*.48/world.radiusMeters,level=mix(a.waterLevelMeters,b.waterLevelMeters,t);
      for(const sign of [-1,1]){const q=normalize(d.map((v,i)=>v+sign*side[i]*half));waterPositions.push(...q.map((v,i)=>v*(1000+(level+.09)*scale)-center[i]));waterNormals.push(...q);shallows.push(.8);}
      if(j<steps){const k=start+j*2;waterIndices.push(k,k+1,k+2,k+1,k+3,k+2,k,k+2,k+1,k+1,k+2,k+3);}
    }
  }
  for(const a of [positions,normals,colors,surface,climate,indices]){delete a.push;delete a.used;}
  const remap=new Int32Array(waterPositions.length/3).fill(-1),wp=[],wn=[],ws=[];
  for(let i=0;i<waterIndices.length;i++){const source=waterIndices[i];let target=remap[source];if(target<0){target=remap[source]=ws.length;wp.push(waterPositions[source*3],waterPositions[source*3+1],waterPositions[source*3+2]);wn.push(waterNormals[source*3],waterNormals[source*3+1],waterNormals[source*3+2]);ws.push(shallows[source]);}waterIndices[i]=target;}
  return {bounds:boundsOf(positions),waterBounds:boundsOf(wp),key:p.key+'/'+layer,patch:p,center,positions,normals,colors,surface,climate,indices,waterPositions:Float32Array.from(wp),waterNormals:Float32Array.from(wn),shallows:Float32Array.from(ws),waterIndices:Uint32Array.from(waterIndices)};
}



