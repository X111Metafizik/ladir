import {faceDirection,directionFace} from '../core/cube.mjs';
export const tileId=p=>`${p.face}/${p.level}/${p.x}/${p.y}`;
// Finish the nearest publishable footprint, including its distant seam
// dependencies, before spending production time on unrelated distant tiles.
export function prioritizeTransitions(missing,transitions,layer='natural'){
 const priority=new Map(missing.map(p=>[p.key+'/'+layer,p.priority])),rank=new Map();
 for(const g of transitions??[]){let nearest=Infinity;for(const key of g.add)nearest=Math.min(nearest,priority.get(key)??Infinity);for(const key of g.add)rank.set(key,nearest);}
 return missing.sort((a,b)=>(rank.get(a.key+'/'+layer)??a.priority)-(rank.get(b.key+'/'+layer)??b.priority)||a.priority-b.priority);
}
// Describe the actual stitched edge lattice, including corner overrides from
// the other sides. Equal contracts imply equal XYZ, normal and material samples;
// the neighboring transaction may commit independently without a crack.
export function edgeContract(p,side){
 if(!p?.resolution||!p.stitch)return null;
 const N=p.resolution,band=(x,y,step)=>Math.max(step,p.boundaryBands?.[x+','+y]===undefined?1:2**(p.level+Math.log2(N)-p.boundaryBands[x+','+y]));
 const result=[];
 for(let j=0;j<=N;j++){
  const x=side===1?N:side===3?0:j,y=side===0?0:side===2?N:j;
  let token=[x,y,band(x,y,1)];
  for(let s=0;s<4;s++)if(p.stitch[s]&&[y===0,x===N,y===N,x===0][s]){
   const horizontal=s===0||s===2,offset=(horizontal?p.x:p.y)*N,k=horizontal?x:y,step=2**(p.level-p.stitch[s])*N/(p.stitchResolution?.[s]??N),a=Math.floor((offset+k)/step)*step-offset,t=(k-a)/step;
   const ax=horizontal?a:x,ay=horizontal?y:a,bx=horizontal?a+step:x,by=horizontal?y:a+step;
   token=[ax,ay,band(ax,ay,step),bx,by,band(bx,by,step),t];
  }
  result.push(token);
 }
 return JSON.stringify(result);
}
// Each group replaces an entire covered footprint, so a streamed child never
// leaves a hole or overlaps its old parent while its siblings are still loading.
export function transitionGroups(previous,wanted){
 const old=new Map(previous.map(p=>[p.key,p])),desired=new Map(wanted.map(p=>[p.key,p])),byTile=new Map(wanted.map(p=>[tileId(p),p])),desc=new Map(),groups=new Map(),assigned=new Set();
 for(const p of wanted)if(!old.has(p.key))for(let l=3;l<=p.level;l++){const f=2**(p.level-l),id=`${p.face}/${l}/${Math.floor(p.x/f)}/${Math.floor(p.y/f)}`;if(!desc.has(id))desc.set(id,[]);desc.get(id).push(p.key);}
 for(const p of previous){if(desired.has(p.key))continue;let parent;
  for(let l=p.level;l>=3;l--){const f=2**(p.level-l);parent=byTile.get(`${p.face}/${l}/${Math.floor(p.x/f)}/${Math.floor(p.y/f)}`);if(parent)break;}
  const additions=parent?[parent.key]:desc.get(tileId(p))??[],id=parent?'to/'+parent.key:'from/'+p.key;
  if(!groups.has(id))groups.set(id,{remove:[],add:additions});groups.get(id).remove.push(p.key);for(const key of additions)assigned.add(key);
 }
 for(const p of wanted)if(!old.has(p.key)&&!assigned.has(p.key))groups.set('new/'+p.key,{remove:[],add:[p.key]});
 // Stitch coordinates refer to the desired neighbors. Adjacent replacements
 // must commit together, including preview 8 -> final 16 vertex grids. Keeping
 // only siblings atomic leaves exposed edges while a neighbor is still old.
 const oldTiles=new Map(previous.map(p=>[tileId(p),p])),contracts=new WeakMap();
 const unchanged=(p,side)=>{const before=oldTiles.get(tileId(p));if(!before||before.resolution!==p.resolution)return false;
  const get=q=>{let c=contracts.get(q);if(!c)contracts.set(q,c=[]);return c[side]??(c[side]=edgeContract(q,side));};
  const a=get(before),b=get(p);return a!==null&&a===b;
 };
 const list=[...groups.values()],owner=new Map(),parent=list.map((_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 list.forEach((g,i)=>g.add.forEach(key=>owner.set(key,i)));
 for(const p of wanted){const a=owner.get(p.key);if(a===undefined)continue;const size=2/2**p.level,u=p.x*size-1,v=p.y*size-1,e=size*.00001;
  for(const [side,[x,y]]of [[u+size/2,v-e],[u+size+e,v+size/2],[u+size/2,v+size+e],[u-e,v+size/2]].entries()){
   const [f,s,t]=directionFace(faceDirection(p.face,x,y));
   for(let l=p.level;l>=3;l--){const n=2**l,q=byTile.get(`${f}/${l}/${Math.min(n-1,Math.max(0,Math.floor((s+1)*n/2)))}/${Math.min(n-1,Math.max(0,Math.floor((t+1)*n/2)))}`);if(!q)continue;
    const b=owner.get(q.key);if(b!==undefined&&root(a)!==root(b)&&(list[a].remove.length||list[b].remove.length)){
     // Across cube faces use the original conservative transaction. On the
     // same face an unchanged edge on either side proves mixed commits safe.
     if(p.face!==q.face||(!unchanged(p,side)&&!unchanged(q,(side+2)%4)))parent[root(b)]=root(a);
    }break;
   }
  }
 }
 const merged=new Map();list.forEach((g,i)=>{const key=root(i);if(!merged.has(key))merged.set(key,{remove:[],add:[]});const target=merged.get(key);target.remove.push(...g.remove);target.add.push(...g.add);});return [...merged.values()];
}
export {createNumericSampleCache as createSampleCache} from './sample-cache.mjs';
