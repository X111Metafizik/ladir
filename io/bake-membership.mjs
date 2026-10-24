// 64 KiB Bloom filter. False positives cost one disk read; never accept cached
// geometry without checking its full world/seam key. Evictions need no mutation.
export class BakeMembership{
 constructor(){this.bits=new Uint32Array(16384);}
 hashes(key){let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);const step=(Math.imul(h^(h>>>16),0x85ebca6b)|1);return [h&524287,(h+step)&524287,(h+2*step)&524287];}
 add(key){for(const n of this.hashes(key))this.bits[n>>>5]|=1<<(n&31);}
 has(key){for(const n of this.hashes(key))if(!(this.bits[n>>>5]&(1<<(n&31))))return false;return true;}
}
