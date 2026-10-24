// Fixed storage with a stable active array. Generation IDs distinguish separate
// events even when audio and rendering see the same reused JavaScript object.
export class EffectPool {
  constructor(capacity,factory){
    this.capacity=capacity;this.items=Array.from({length:capacity},factory);
    this.free=[...this.items];this.active=[];this.members=new Set(this.items);
    this.sequence=0;this.stats={capacity,created:capacity,acquired:0,recycled:0,overflow:0,peak:0};
  }
  acquire(replaceOldest=false){
    if(this.active.length>=this.capacity||!this.free.length){
      this.stats.overflow++;
      if(!replaceOldest)return null;
      this.release(this.active.shift());
    }
    const item=this.free.pop();item.id=++this.sequence;this.active.push(item);
    this.stats.acquired++;this.stats.peak=Math.max(this.stats.peak,this.active.length);return item;
  }
  release(item){if(this.members.has(item)){this.free.push(item);this.stats.recycled++;}}
  compact(){
    let write=0;
    for(let read=0;read<this.active.length;read++){
      const item=this.active[read];
      if(item.life>0)this.active[write++]=item;else this.release(item);
    }
    this.active.length=write;
  }
}
