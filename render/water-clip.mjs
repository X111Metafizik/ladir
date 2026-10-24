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
