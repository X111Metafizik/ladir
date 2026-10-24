// Simulation distances are metres. The shortest cinematic takes three seconds.
export const WARP_DISTANCES=Object.freeze([1_000_000,3_000_000,6_000_000,9_000_000,12_000_000]);
export const SKILLS=Object.freeze({warp:{charge:3,duration:12,distance:12_000_000,distances:WARP_DISTANCES,cooldown:20},repair:{duration:5,health:50,cooldown:30}});
export const warpDuration=distance=>Math.max(3,SKILLS.warp.duration*distance/SKILLS.warp.distance);

export class ShipSkills {
 constructor(ship){Object.defineProperty(this,'ship',{value:ship});this.warp={phase:'idle',remaining:0,cooldown:0,elapsed:0,travelRemaining:0,distance:0,targetDistance:SKILLS.warp.distance,duration:SKILLS.warp.duration,progress:0};this.repair={remaining:0,cooldown:0};}
 selectWarpDistance(distance){
  const s=this.ship,w=this.warp;
  if(s.paused||s.health<=0||s.state!=='flying'||w.phase!=='charging'||!WARP_DISTANCES.includes(distance)||distance===w.targetDistance)return false;
  w.targetDistance=distance;w.duration=warpDuration(distance);w.remaining=SKILLS.warp.charge;
  s.onMessage(`Warp mesafesi ${(distance/1000).toLocaleString('tr-TR')} km · 3 saniye sonra hareket`);return true;
 }
 activate(slot){
  const s=this.ship;if(s.paused||s.health<=0||s.state==='crashed')return false;
  if(slot===1){
   if(s.state!=='flying'||this.warp.remaining>0||this.warp.cooldown>0)return false;
   Object.assign(this.warp,{phase:'charging',remaining:SKILLS.warp.charge,elapsed:0,travelRemaining:0,distance:0,progress:0});
   s.onMessage(`Warp ${(this.warp.targetDistance/1000).toLocaleString('tr-TR')} km · Tekerlek ile mesafe seç · Son seçimden 3 sn sonra hareket`);return true;
  }
  if(slot===2){
   if(s.health>=100||this.repair.remaining>0||this.repair.cooldown>0)return false;
   this.repair.remaining=SKILLS.repair.duration;this.repair.cooldown=SKILLS.repair.cooldown;
   s.onMessage('Onarım başladı · 5 saniyede %50 gövde · 30 sn bekleme');return true;
  }
  return false;
 }
 update(dt){
  const s=this.ship,w=this.warp,r=this.repair;
  w.cooldown=Math.max(0,w.cooldown-dt);r.cooldown=Math.max(0,r.cooldown-dt);
  if(r.cooldown<1e-8)r.cooldown=0;if(w.cooldown<1e-8)w.cooldown=0;
  if(s.health<=0||s.state==='crashed'){w.remaining=w.travelRemaining=r.remaining=0;w.phase='idle';return;}
  if(r.remaining>0){const elapsed=Math.min(dt,r.remaining);s.health=Math.min(100,s.health+SKILLS.repair.health*elapsed/SKILLS.repair.duration);r.remaining=Math.max(0,r.remaining-dt);if(r.remaining<1e-8)r.remaining=0;}
  if(s.state==='warping'){s.advanceWarp(dt);return;}
  if(w.remaining>0){
   if(s.state!=='flying'){w.remaining=0;w.phase='idle';s.onMessage('Warp iptal edildi · serbest uçuş gerekli');return;}
   w.remaining=Math.max(0,w.remaining-dt);
   if(w.remaining<1e-8){w.remaining=0;s.beginWarp();}
  }
 }
}
