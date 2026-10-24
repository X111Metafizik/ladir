import {faceDirection,directionFace} from '../core/cube.mjs';
export const tileId=p=>`${p.face}/${p.level}/${p.x}/${p.y}`;
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
 const list=[...groups.values()],owner=new Map(),parent=list.map((_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 list.forEach((g,i)=>g.add.forEach(key=>owner.set(key,i)));
 for(const p of wanted){const a=owner.get(p.key);if(a===undefined)continue;const size=2/2**p.level,u=p.x*size-1,v=p.y*size-1,e=size*.00001;
  for(const [x,y]of [[u+size/2,v-e],[u+size+e,v+size/2],[u+size/2,v+size+e],[u-e,v+size/2]]){
   const [f,s,t]=directionFace(faceDirection(p.face,x,y));
   for(let l=p.level;l>=3;l--){const n=2**l,q=byTile.get(`${f}/${l}/${Math.min(n-1,Math.max(0,Math.floor((s+1)*n/2)))}/${Math.min(n-1,Math.max(0,Math.floor((t+1)*n/2)))}`);if(!q)continue;
    const b=owner.get(q.key);if(b!==undefined&&(list[a].remove.length||list[b].remove.length))parent[root(b)]=root(a);break;
   }
  }
 }
 const merged=new Map();list.forEach((g,i)=>{const key=root(i);if(!merged.has(key))merged.set(key,{remove:[],add:[]});const target=merged.get(key);target.remove.push(...g.remove);target.add.push(...g.add);});return [...merged.values()];
}
export function createSampleCache(sample,limit=120000){
 const cache=new Map();let hits=0,misses=0;
 const get=(d,options)=>{const key=Math.round(d[0]*4398046511104)+'/'+Math.round(d[1]*4398046511104)+'/'+Math.round(d[2]*4398046511104)+'/'+(options?.micro!==false)+'/'+(options?.microWeight??1);let s=cache.get(key);if(s){hits++;return s;}misses++;s=sample(d,options);cache.set(key,s);if(cache.size>limit){const keys=cache.keys();for(let i=0;i<2048;i++)cache.delete(keys.next().value);}return s;};
 get.stats=()=>({hits,misses,size:cache.size});return get;
}

