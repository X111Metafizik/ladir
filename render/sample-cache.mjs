// Bounded numeric keys eliminate the old per-query coordinate strings and
// Map nodes. Values remain immutable sample objects: halo/geometry consumers
// may retain them, so overwriting a reusable result object would corrupt tiles.
export function createNumericSampleCache(sample,limit=120000,{keyByteBudget=4*1024*1024}={}){
 if(!Number.isFinite(limit)||limit<4||!Number.isFinite(keyByteBudget)||keyByteBudget<165)throw RangeError('Sample cache budget too small');
 const ways=4,capacity=Math.max(4,Math.floor(Math.min(limit,keyByteBudget/41.25)/ways)*ways),sets=capacity/ways;
 const keys=new Float64Array(capacity*5),valid=new Uint8Array(capacity),cursor=new Uint8Array(sets),values=new Array(capacity);
 const keyBytes=keys.byteLength+valid.byteLength+cursor.byteLength;
 let hits=0,misses=0,size=0,evictions=0;
 const get=(d,options)=>{
  const x=Math.round(d[0]*4398046511104),y=Math.round(d[1]*4398046511104),z=Math.round(d[2]*4398046511104),micro=Number(options?.micro!==false),weight=options?.microWeight??1;
  // Keep all 43 quantization bits. Low-32-only keys repeat every 3125
  // samples on common linear routes, regardless of the final hash mixer.
  const hx=(x|0)^Math.imul(Math.floor(x/4294967296),0x9e3779b1),hy=(y|0)^Math.imul(Math.floor(y/4294967296),0x9e3779b1),hz=(z|0)^Math.imul(Math.floor(z/4294967296),0x9e3779b1);
  let hash=Math.imul(hx,73856093)^Math.imul(hy,19349663)^Math.imul(hz,83492791)^Math.imul(Math.round(weight*1048576),1013)^micro;
  // Final avalanche is necessary for long straight flight/grid coordinates.
  // Without it, truncating 43-bit quantized coordinates clusters low bits.
  hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;hash=Math.imul(hash,0x846ca68b);hash^=hash>>>16;const set=(hash>>>0)%sets,start=set*ways;let vacant=-1;
  for(let slot=start;slot<start+ways;slot++){
   if(!valid[slot]){if(vacant<0)vacant=slot;continue;}const i=slot*5;
   if(keys[i]===x&&keys[i+1]===y&&keys[i+2]===z&&keys[i+3]===micro&&keys[i+4]===weight){hits++;return values[slot];}
  }
  misses++;const value=sample(d,options),slot=vacant>=0?vacant:start+cursor[set],i=slot*5;
  if(valid[slot])evictions++;else size++;
  cursor[set]=(slot-start+1)%ways;keys[i]=x;keys[i+1]=y;keys[i+2]=z;keys[i+3]=micro;keys[i+4]=weight;valid[slot]=1;values[slot]=value;
  return value;
 };
 get.stats=()=>({hits,misses,size,capacity,keyBytes,referenceSlots:capacity,evictions});return get;
}
