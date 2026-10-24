import {referenceDirection} from '../core/landforms.mjs';
import {sampleTerrain} from '../core/terrain.mjs';
import {priorityFlood} from '../core/hydrology.mjs';

// Diagnostic drainage is computed from the final surface in a worker. It does
// not replace the authored lake levels or mutate the terrain to fill basins.
// The outer boundary is open: adjacent regions own the continuation.
export function analyzeReference(world,resolution=256){
 const side=resolution+1,count=side*side,spacing=32000/resolution,heights=new Float64Array(count),rain=new Float32Array(count),areas=new Float64Array(count).fill(spacing*spacing),offsets=new Uint32Array(count+1),neighbors=[],outlets=[];
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const id=y*side+x,s=sampleTerrain(world,referenceDirection(world,x*spacing-16000,y*spacing-16000));heights[id]=s.elevationMeters;rain[id]=s.moisture;
  if(!x||!y||x===resolution||y===resolution)outlets.push(id);
  offsets[id]=neighbors.length;
  for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]])if(x+dx>=0&&x+dx<side&&y+dy>=0&&y+dy<side)neighbors.push((y+dy)*side+x+dx);
 }
 offsets[count]=neighbors.length;
 const result=priorityFlood({areas,offsets,neighbors:Uint32Array.from(neighbors)},heights,rain,0,true,outlets);
 const rank=new Uint32Array(count);result.order.forEach((id,i)=>rank[id]=i);let input=0,output=0,errors=0,maxAccumulation=0;
 for(let i=0;i<count;i++){input+=rain[i]*areas[i];maxAccumulation=Math.max(maxAccumulation,result.accumulation[i]);const r=result.receiver[i];if(r<0)output+=result.accumulation[i];else if(rank[r]>=rank[i]||result.drainage[r]>result.drainage[i])errors++;}
 return {resolution,spacing,heights,receiver:result.receiver,basin:result.basin,accumulation:result.accumulation,summary:{spacingMeters:spacing,regionMeters:32000,downhillErrors:errors,rainArea:input,outletArea:output,massError:Math.abs(input-output)/input,maxAccumulation,lakes:world.hydrology.lakes.filter(l=>l.regional).map(l=>({id:l.id,level:l.waterLevelMeters,spill:l.spillLevelMeters,closed:l.closedBasin})),boundary:'Open diagnostic extent; global shared drainage owns continuation'}};
}
