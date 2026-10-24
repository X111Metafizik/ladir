import {cross,dot,normalize} from '../core/math.mjs';
const riverBanks=new WeakMap();
// Adjacent river segments share their bank vertices even around a bend.
// A bounded miter avoids the gaps between separately offset rectangles.
export function riverBankOffsets(river){
 let banks=riverBanks.get(river);if(banks)return banks;
 banks=new Map();const points=river.points;
 for(let i=0;i<points.length;i++){
  const prev=i?normalize(cross(points[i-1].direction,points[i].direction)):null,next=i+1<points.length?normalize(cross(points[i].direction,points[i+1].direction)):null;
  let bank=prev&&next?normalize(prev.map((v,k)=>v+next[k])):prev??next??[0,0,0];
  if(prev&&next){const gain=Math.min(1.5,1/Math.max(.1,dot(bank,next)));bank=bank.map(v=>v*gain);}
  banks.set(points[i],bank);
 }
 riverBanks.set(river,banks);return banks;
}
// Clip against the sampled terrain bed at one water body's own level. The
// geometry remains an interpolation of the authoritative terrain samples.
// Foreign lake/river corners cannot slope an unrelated water surface upward.
export function clipWaterTriangle(ids, heights, levels, bodies, body, level){
 const depth=i=>{
  const d=level-heights[i];
  return bodies[i]!==body&&levels[i]>heights[i]?Math.min(-.0001,-Math.abs(d)):d;
 };
 const result=[];
 for(let j=0;j<3;j++){
  const a=ids[j],b=ids[(j+1)%3],da=depth(a),db=depth(b),inside=da>=0,next=db>=0;
  if(inside)result.push({a,b:a,t:0});
  if(inside!==next)result.push({a,b,t:da/(da-db)});
 }
 return result;
}

// Ocean mouths are a single surface. Cutting the river label out of the sea
// and then covering it with a narrower ribbon leaves triangular shoreline gaps.
export function waterBody(sample,seaLevel=0){
 return Math.abs(sample.waterSurfaceMeters-seaLevel)<1e-5?'ocean':sample.featureId??'ocean';
}

// Clip the full width, not just the river's centre line. Each neighbouring
// tile clips the same global polygon, so its bank cannot stick into the next
// tile or leave a duplicate strip above a different terrain LOD.
export function clipWaterPolygon(polygon,u,v,size){
 let result=polygon;
 for(const [axis,edge,sign]of [[0,u,1],[0,u+size,-1],[1,v,1],[1,v+size,-1]]){
  const input=result;result=[];
  for(let i=0;i<input.length;i++){
   const a=input[i],b=input[(i+1)%input.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;
   if(da>=0)result.push(a);
   if((da>=0)!==(db>=0)){const t=da/(da-db),q=a.map((n,k)=>n+(b[k]-n)*t);q[axis]=edge;result.push(q);}
  }
 }
 return result;
}
