import {Vector3,Quaternion,MathUtils} from 'three';
import {FixedStepClock} from './clock.mjs';
import {EffectPool} from './pool.mjs';
import {ShipSkills,SKILLS} from './skills.mjs';
import {warpMotion} from './warp.mjs';
import {collisionScratch,sweepGround} from './ground-collision.mjs';
const {clamp,damp,smoothstep}=MathUtils;
const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
export const FLIGHT={length:110,cruise:700/3.6,brake:32,boost:1800/3.6,clearance:17.2,enemyCount:6,maxProjectiles:128,maxExplosions:16};
export const ENEMY_AI={acquire:1800,lose:3200,leash:4500,pursuitSeconds:22,lostSeconds:4,cooldownSeconds:18};
export function tangentFrame(up){let north=V(0,1,0).addScaledVector(up,-up.y);if(north.lengthSq()<1e-8)north=V(0,0,1).addScaledVector(up,-up.z);north.normalize();return {north,right:V().crossVectors(north,up).normalize()};}
export function segmentDistance(point,a,b){const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,t=clamp(((point.x-a.x)*x+(point.y-a.y)*y+(point.z-a.z)*z)/Math.max(1e-9,x*x+y*y+z*z),0,1);return Math.hypot(point.x-a.x-x*t,point.y-a.y-y*t,point.z-a.z-z*t);}

// All simulation positions are double-precision metres. The renderer alone
// converts to planet units and a camera-relative origin.
export class FlightSimulation{
  constructor({radius,terrain,direction,heading,onMessage=()=>{}}){
    Object.assign(this,{radius,terrain,onMessage});this.time=0;this.tick=0;this.state='flying';this.paused=false;this.health=100;this.boostEnergy=100;this.speed=FLIGHT.cruise;this.cruising=true;this.pitch=0;this.bank=0;this.rollTime=0;this.rollSign=1;this.rollAngle=0;this.score=0;this.gunTimer=0;this.missileTimer=0;this.hit=0;this.damageFlash=0;this.lockTime=0;this.targetId=0;this.enemyShots=0;this.shots=0;this.missiles=0;this.boosting=false;this.boostExhausted=false;this.gunKick=0;this.projectiles=[];this.explosions=[];this.input={x:0,y:0,left:false,right:false,boost:false,brake:false,strafe:0};
    const up=V(...direction).normalize();this.heading=heading?.clone()??tangentFrame(up).north;this.heading.addScaledVector(up,-this.heading.dot(up)).normalize();this.forward=this.heading.clone();this.up=up.clone();this.right=V().crossVectors(this.forward,up).normalize();this.position=up.multiplyScalar(radius+this.ground(up).height+320);this.velocity=this.forward.clone().multiplyScalar(this.speed);this.spawnDirection=V(...direction).normalize();this.home=this.findLandingSite(this.spawnDirection,1200);this.landing=null;this.enemies=[];
    for(let i=0;i<FLIGHT.enemyCount;i++)this.enemies.push(this.createEnemy(i));
    this.clock=new FixedStepClock();this.fixedUpdate=dt=>{this.snapshot();this.update(dt);};
    this.previous={position:this.position.clone(),forward:this.forward.clone(),bank:0,roll:0};
    this.presentation={position:this.position.clone(),forward:this.forward.clone(),up:this.up.clone(),right:this.right.clone(),bank:0,roll:0,alpha:0};
    this.projectilePool=new EffectPool(FLIGHT.maxProjectiles,()=>({position:V(),previousPosition:V(),renderPosition:V(),direction:V(),life:0}));
    this.explosionPool=new EffectPool(FLIGHT.maxExplosions,()=>({position:V(),life:0}));
    this.projectiles=this.projectilePool.active;this.explosions=this.explosionPool.active;
    this.beforeProjectile=V();this.projectileDelta=V();this.impactEnergy=0;
    this.skills=new ShipSkills(this);this.warpRevision=0;this.warpEvent=null;this.warpPath=null;this.fallSpeed=0;this.freeFalling=false;
    this.collision=collisionScratch();this.collisionFrom=V();this.collisionGround=d=>this.ground(d);
    this.refreshGround();
  }
  snapshot(){this.previous.position.copy(this.position);this.previous.forward.copy(this.forward);this.previous.bank=this.bank;this.previous.roll=this.rollAngle;}
  activateSkill(slot){return this.skills.activate(slot);}
  warpDestination(distance=this.skills.warp.targetDistance){
    const forward=this.forward.clone().normalize(),position=this.position.clone().addScaledVector(forward,distance);
    return {forward,position,from:this.position.clone(),direction:position.clone().normalize(),distance};
  }
  beginWarp(){
    const arrival=this.warpDestination();
    const right=this.right.clone().addScaledVector(arrival.forward,-this.right.dot(arrival.forward)).normalize();
    const w=this.skills.warp;
    this.warpPath={from:this.position.clone(),to:arrival.position,forward:arrival.forward,up:V().crossVectors(right,arrival.forward).normalize(),entrySpeed:this.speed,exitSpeed:FLIGHT.cruise,duration:w.duration,distance:w.targetDistance,probe:V(),direction:V()};
    this.state='warping';this.boosting=false;this.rollTime=this.rollAngle=0;this.bank=0;this.fallSpeed=0;this.freeFalling=false;
    Object.assign(w,{phase:'accelerating',remaining:0,elapsed:0,travelRemaining:w.duration,distance:0,progress:0});
    this.landing=this.home=null;this.lockTime=0;this.targetId=null;this.impactEnergy=0;this.gunKick=0;
    for(const p of this.projectiles)p.life=0;this.projectilePool.compact();for(const p of this.explosions)p.life=0;this.explosionPool.compact();
    for(const enemy of this.enemies){enemy.mode='return';enemy.visibleToPlayer=false;enemy.cooldown=Math.max(enemy.cooldown,ENEMY_AI.cooldownSeconds);}
    this.onMessage(`Solucan deliği açıldı · ${(w.targetDistance/1000).toLocaleString('tr-TR')} km / ${w.duration} saniye`);return true;
  }
  advanceWarp(dt){
    const w=this.skills.warp,p=this.warpPath;
    w.elapsed=Math.min(p.duration,w.elapsed+dt);if(p.duration-w.elapsed<1e-8)w.elapsed=p.duration;
    const motion=warpMotion(w.elapsed,p),lastDistance=w.distance;
    p.probe.copy(p.from).addScaledVector(p.forward,motion.distance);
    if(sweepGround(this.position,p.probe,this.radius,this.collisionGround,FLIGHT.clearance,this.collision)){
      w.distance=lastDistance+this.collision.distance;w.progress=w.distance/p.distance;
      this.position.copy(this.collision.point);this.forward.copy(p.forward);this.speed=motion.speed;this.velocity.copy(p.forward).multiplyScalar(motion.speed);this.refreshGround();
      this.finishWarp(true);this.groundImpact(this.collision);return;
    }
    w.distance=motion.distance;w.progress=motion.progress;w.travelRemaining=motion.remaining;w.phase=motion.phase;
    this.position.copy(p.from).addScaledVector(p.forward,motion.distance);this.forward.copy(p.forward);this.speed=motion.speed;this.velocity.copy(p.forward).multiplyScalar(this.speed);
    this.refreshGround();this.right.crossVectors(this.forward,p.up).normalize();
    if(!motion.remaining)this.finishWarp(false);
  }
  finishWarp(interrupted=false){
    const w=this.skills.warp,p=this.warpPath;this.state='flying';this.cruising=true;if(!interrupted)this.speed=FLIGHT.cruise;this.velocity.copy(this.forward).multiplyScalar(this.speed);this.fallSpeed=0;this.freeFalling=false;
    this.heading.copy(this.forward).addScaledVector(this.up,-this.forward.dot(this.up)).normalize();
    if(this.heading.lengthSq()<.5)this.heading.copy(tangentFrame(this.up).north);
    this.pitch=Math.asin(clamp(this.forward.dot(this.up),-1,1));this.right.crossVectors(this.forward,p.up).normalize();
    w.phase='idle';w.travelRemaining=0;w.cooldown=SKILLS.warp.cooldown;this.warpRevision++;
    this.warpEvent={from:p.from.toArray(),to:this.position.toArray(),distance:w.distance,time:this.time,duration:w.elapsed,interrupted};
    this.onMessage(interrupted?'Warp kesildi · Zeminle çarpışma':`Warp tamamlandı · ${(w.targetDistance/1000).toLocaleString('tr-TR')} km · Seyir hızına dönüldü · 20 sn bekleme`);
  }
  groundImpact(hit){
    const impact=Math.max(0,-this.velocity.dot(hit.normal));this.position.copy(hit.point);this.fallSpeed=0;this.freeFalling=false;this.pitch=.18;
    this.velocity.addScaledVector(hit.normal,impact*1.15).multiplyScalar(.4);this.speed=this.velocity.length();
    this.lastImpact={speed:impact,time:this.time,position:hit.point.toArray(),normal:hit.normal.toArray()};this.explode(hit.point,true);this.hurt(impact>75?100:Math.max(2,impact*.8));
  }
  present(){
    const p=this.presentation,a=this.clock.alpha;
    p.alpha=a;p.position.lerpVectors(this.previous.position,this.position,a);p.forward.lerpVectors(this.previous.forward,this.forward,a).normalize();p.up.copy(this.state==='warping'?this.warpPath.up:p.position).normalize();p.right.crossVectors(p.forward,p.up).normalize();if(p.right.lengthSq()<.5)p.right.copy(this.right);p.up.crossVectors(p.right,p.forward).normalize();p.bank=MathUtils.lerp(this.previous.bank,this.bank,a);
    // A completed roll resets to zero; interpolate the equivalent nearby angle.
    const turn=Math.atan2(Math.sin(this.rollAngle-this.previous.roll),Math.cos(this.rollAngle-this.previous.roll));p.roll=this.previous.roll+turn*a;
    for(const e of this.enemies){e.renderPosition.lerpVectors(e.previousPosition,e.position,a);e.renderForward.copy(e.velocity.lengthSq()?e.velocity:e.forward).normalize();e.renderForward.lerpVectors(e.previousForward,e.renderForward,a).normalize();}
    for(const shot of this.projectiles)if(shot.renderPosition)shot.renderPosition.lerpVectors(shot.previousPosition,shot.position,a);
    return p;
  }
  spawnProjectile(position,direction,{life,speed,damage,enemy=false,missile=false,targetId=null}){
    const p=this.projectilePool.acquire();if(!p)return null;
    p.position.copy(position);p.previousPosition.copy(position);p.renderPosition.copy(position);p.direction.copy(direction);Object.assign(p,{life,speed,damage,enemy,missile,targetId});return p;
  }
  explode(position,impact=false){
    const e=this.explosionPool.acquire(true);e.position.copy(position);e.impact=impact;e.duration=impact?.28:1.4;e.life=e.duration;
    const distance=position.distanceTo(this.position);this.impactEnergy=Math.min(1,this.impactEnergy+(impact?.12:.8)/(1+distance/300));return e;
  }
  ground(direction){const s=this.terrain(direction.toArray());return {height:Math.max(s.elevationMeters,s.waterSurfaceMeters??-Infinity),land:s.elevationMeters,wet:(s.waterDepthMeters??0)>.5,forest:s.forest??0};}
  refreshGround(){
    this.up.copy(this.position).normalize();this.altitude=this.position.length()-this.radius;
    // In space there is no nearby collision surface. Sampling new drainage /
    // stamp regions at warp speed would build terrain indexes on the UI thread.
    this.groundResolved=this.altitude<60000;
    this.groundHeight=this.groundResolved?this.ground(this.up).height:0;this.agl=this.altitude-this.groundHeight;
  }
  landingSite(direction){
    const d=direction.clone().normalize(),{north,right}=tangentFrame(d),samples=[this.ground(d)];
    for(const [x,y]of [[-45,-45],[-45,45],[45,-45],[45,45]])samples.push(this.ground(d.clone().addScaledVector(north,x/this.radius).addScaledVector(right,y/this.radius).normalize()));
    const lo=Math.min(...samples.map(s=>s.land)),hi=Math.max(...samples.map(s=>s.land)),slope=Math.atan((hi-lo)/90);
    return {direction:d,height:hi,slope,valid:samples.every(s=>!s.wet&&s.forest<.68)&&slope<.25};
  }
  findLandingSite(direction,maxRadius=1200){
    const center=this.landingSite(direction);if(center.valid)return center;const {north,right}=tangentFrame(direction);
    for(const r of [80,200,450,800,1200].filter(r=>r<=maxRadius))for(let i=0;i<12;i++){const a=i*Math.PI/6,d=direction.clone().addScaledVector(north,Math.cos(a)*r/this.radius).addScaledVector(right,Math.sin(a)*r/this.radius).normalize(),s=this.landingSite(d);if(s.valid)return s;}
    return null;
  }
  requestLanding(){
    if(this.state==='crashed'||this.state==='warping')return false;
    if(!this.groundResolved){this.onMessage('İniş için önce yüzeye yaklaş · Geminin burnunu gezegene çevir');return false;}
    if(this.state==='landed'){this.state='taking-off';this.landing=null;this.pitch=0;this.cruising=true;this.onMessage('Kalkış · dikey iticiler devrede');return true;}
    if(this.state==='landing'){this.state='flying';this.landing=null;this.cruising=false;this.onMessage('İniş iptal edildi · havada bekleme');return true;}
    if(this.state==='taking-off')return false;
    const site=this.findLandingSite(this.up);if(!site){this.onMessage('Yakında düz, kuru iniş alanı yok. Kıyıdan / sarp araziden uzaklaş.');return false;}
    this.landing=site;this.state='landing';this.cruising=false;this.pitch=0;this.onMessage('İniş yardımı · güvenli zemine yaklaşılıyor. C: iptal');return true;
  }
  roll(sign){if(this.state==='flying'&&this.rollTime<=0){this.rollTime=.85;this.rollSign=sign;return true;}return false;}
  hover(){if(this.state==='flying'&&!this.skills.warp.remaining){this.cruising=false;this.pitch=0;}}
  cruise(){if(this.state==='flying')this.cruising=true;}
  cycleTarget(){const alive=this.enemies.filter(e=>e.health>0),i=alive.findIndex(e=>e.id===this.targetId);this.targetId=alive.length?alive[(i+1)%alive.length].id:null;this.lockTime=0;}
  createEnemy(id,home=null){
    const {right}=tangentFrame(this.up),angle=(id-2.5)*.22,dist=650+id*330,d=this.up.clone().addScaledVector(this.heading,Math.cos(angle)*dist/this.radius).addScaledVector(right,Math.sin(angle)*dist/this.radius).normalize(),ground=this.ground(home?home.clone().normalize():d).height;
    const position=home?.clone()??d.clone().multiplyScalar(this.radius+Math.max(ground+250,this.position.length()-this.radius+(id%3-1)*65));
    return {id,health:100,position,home:position.clone(),mode:'patrol',pursuit:0,lost:0,cooldown:0,sightTimer:0,visibleToPlayer:false,previousPosition:position.clone(),renderPosition:position.clone(),forward:this.heading.clone(),previousForward:this.heading.clone(),renderForward:this.heading.clone(),velocity:V(),speed:150+id*7,respawn:0,fire:2+id*.75,ground,phase:id*1.7};
  }
  shoot(missile=false){
    if(this.state!=='flying'||this.health<=0||this.projectiles.length>=FLIGHT.maxProjectiles)return false;
    if((missile?this.missileTimer:this.gunTimer)>0)return false;
    const enemy=this.enemies.find(e=>e.id===this.targetId&&e.health>0);
    if(missile&&(!enemy||this.lockTime<.8)){if(this.time>(this.nextLockMessage??0)){this.onMessage('Füze için hedefi önde tut · Shift ile hedef seç');this.nextLockMessage=this.time+3;}return false;}
    let direction=this.input.aim?.clone()??this.forward.clone();
    // Small aiming assistance only inside the reticle, never across the screen.
    if(enemy){const delta=enemy.position.clone().sub(this.position),distance=delta.length();if(missile||delta.normalize().dot(direction)>.992)direction=enemy.position.clone().addScaledVector(enemy.velocity,distance/1350).sub(this.position).normalize();}
    this.spawnProjectile(this.position.clone().addScaledVector(this.forward,FLIGHT.length*.48).addScaledVector(this.right,(this.shots%2?1:-1)*17),direction,{life:missile?5:1.7,speed:missile?620:1350,damage:missile?62:14,missile,targetId:missile?this.targetId:null});
    if(missile){this.missileTimer=1.4;this.missiles++;}else{this.gunTimer=.095;this.gunKick=1;this.shots++;}return true;
  }
  hurt(damage){if(this.health<=0)return;this.health=Math.max(0,this.health-damage);this.damageFlash=.45;this.impactEnergy=Math.min(1,this.impactEnergy+damage/30);if(!this.health){this.state='crashed';this.speed=0;this.velocity.set(0,0,0);this.explode(this.position);this.onMessage('Gemi devre dışı · Yeniden uç ile devam et');}}
  step(delta){if(!this.paused)this.clock.advance(delta,this.fixedUpdate);}
  update(dt){
    this.impactEnergy*=Math.exp(-dt*9);
    this.time+=dt;this.tick++;this.gunTimer=Math.max(0,this.gunTimer-dt);this.missileTimer=Math.max(0,this.missileTimer-dt);this.hit=Math.max(0,this.hit-dt);this.damageFlash=Math.max(0,this.damageFlash-dt);this.gunKick=Math.max(0,this.gunKick-dt*12);
    if(this.state==='warping'){this.skills.update(dt);return;}
    const previousUp=this.up.clone();this.refreshGround();this.heading.applyQuaternion(new Quaternion().setFromUnitVectors(previousUp,this.up)).addScaledVector(this.up,-this.heading.dot(this.up)).normalize();
    if(this.boostEnergy<=1)this.boostExhausted=true;
    if(!this.input.boost&&this.boostEnergy>=12)this.boostExhausted=false;
    this.boosting=this.state==='flying'&&this.input.boost&&!this.boostExhausted&&this.boostEnergy>1;
    this.boostEnergy=clamp(this.boostEnergy+dt*(this.boosting?-21:12),0,100);
    if(this.state==='flying'){
      const charging=this.skills.warp.remaining>0,x=charging?0:clamp(this.input.x,-1,1),y=charging?0:clamp(this.input.y,-1,1);this.heading.applyAxisAngle(this.up,-x*1.8*dt);this.pitch=clamp(this.pitch-y*1.3*dt,-1.55,1.55);
      const desired=this.input.brake?FLIGHT.brake:this.boosting?FLIGHT.boost:this.cruising?FLIGHT.cruise:0,driveSpeed=Math.max(0,this.speed-this.fallSpeed),down=Math.max(0,-Math.sin(this.pitch));
      this.freeFalling=down>.035&&!this.input.brake;
      if(this.freeFalling){const gravity=9.81*(this.radius/Math.max(this.radius,this.position.length()))**2,drag=.00006*Math.exp(-Math.max(0,this.altitude)/18000);this.fallSpeed=(this.fallSpeed+gravity*down*dt)/(1+drag*this.fallSpeed*dt);}
      else this.fallSpeed=damp(this.fallSpeed,0,this.input.brake||!this.cruising?2.8:1.1,dt);
      this.speed=damp(driveSpeed,desired,this.input.brake||!this.cruising?2.8:1.8,dt)+this.fallSpeed;
      this.forward.copy(this.heading).multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up,Math.sin(this.pitch)).normalize();this.right.crossVectors(this.forward,this.up).normalize();
      this.velocity.copy(this.forward).multiplyScalar(this.speed).addScaledVector(this.right,charging?0:this.input.strafe*65);
      this.collisionFrom.copy(this.position);this.position.addScaledVector(this.velocity,dt);this.bank=damp(this.bank,-x*.48-this.input.strafe*.32,6,dt);
      if(this.rollTime>0){this.rollTime=Math.max(0,this.rollTime-dt);this.rollAngle=this.rollSign*Math.PI*2*smoothstep(1-this.rollTime/.85,0,1);}else this.rollAngle=0;
      if(sweepGround(this.collisionFrom,this.position,this.radius,this.collisionGround,FLIGHT.clearance,this.collision))this.groundImpact(this.collision);
    }else if(this.state==='landing'||this.state==='taking-off'){
      this.bank=damp(this.bank,0,8,dt);this.rollAngle=0;this.speed=damp(this.speed,0,4,dt);this.forward.copy(this.heading);this.velocity.set(0,0,0);this.fallSpeed=0;this.freeFalling=false;
      if(this.state==='taking-off'){
        this.position.addScaledVector(this.up,Math.min(42,14+this.agl*.45)*dt);
        if(this.agl>125){this.state='flying';this.speed=45;this.onMessage('Havalandın · fareyle yön ver, Space ile hızlan');}
      }else{
        const target=this.landing.direction.clone().multiplyScalar(this.position.length()),offset=target.sub(this.position),distance=offset.length(),travel=Math.min(distance,75*dt);
        if(distance>1)this.position.addScaledVector(offset,travel/distance);
        const d=this.position.clone().normalize(),g=this.ground(d).height,desired=this.radius+(distance>5?Math.max(g,this.landing.height)+Math.max(55,Math.min(180,distance*.25)):this.landing.height+FLIGHT.clearance),current=this.position.length(),step=clamp(desired-current,-Math.min(55,Math.max(3,(current-desired)*.5))*dt,80*dt);
        this.position.copy(d).multiplyScalar(Math.max(this.radius+g+FLIGHT.clearance,current+step));
        if(distance<1.5&&Math.abs(this.position.length()-desired)<.3){this.position.copy(this.landing.direction).multiplyScalar(desired);this.state='landed';this.home=this.landing;this.speed=0;this.onMessage('İniş tamamlandı · C ile kalkış · kalkan yenileniyor');}
      }
    }else if(this.state==='landed'){if(!this.skills.repair.remaining)this.health=Math.min(100,this.health+dt*8);this.boostEnergy=100;this.velocity.set(0,0,0);}
    this.refreshGround();
    const target=this.enemies.find(e=>e.id===this.targetId&&e.health>0),deltaTarget=target?.position.clone().sub(this.position),canLock=deltaTarget&&deltaTarget.length()<2600&&deltaTarget.normalize().dot(this.forward)>.84;
    this.lockTime=canLock?Math.min(1,this.lockTime+dt):0;
    if(this.input.left)this.shoot();if(this.input.right)this.shoot(true);
    this.updateEnemies(dt);this.updateProjectiles(dt);for(const e of this.explosions)e.life-=dt;this.explosionPool.compact();
    this.skills.update(dt);
  }
  updateEnemies(dt){
    for(const e of this.enemies){
      if(e.health<=0){e.respawn-=dt;if(e.respawn<=0)Object.assign(e,this.createEnemy(e.id,e.home));continue;}
      e.previousPosition.copy(e.position);e.previousForward.copy(e.velocity.lengthSq()?e.velocity:e.forward).normalize();
      const up=e.position.clone().normalize(),delta=this.position.clone().sub(e.position),distance=delta.length(),homeUp=e.home.clone().normalize(),frame=tangentFrame(homeUp),side=frame.right;
      e.cooldown=Math.max(0,e.cooldown-dt);e.sightTimer-=dt;
      if(e.sightTimer<=0){e.sightTimer=.6+e.id*.025;e.visibleToPlayer=distance<ENEMY_AI.lose&&this.state==='flying'&&this.health>0;
        if(e.visibleToPlayer)for(const t of [.25,.5,.75]){const point=e.position.clone().lerp(this.position,t),d=point.clone().normalize();if(point.length()<this.radius+this.ground(d).height+12){e.visibleToPlayer=false;break;}}
      }
      if(e.mode==='patrol'&&e.cooldown<=0&&distance<ENEMY_AI.acquire&&e.visibleToPlayer){e.mode='pursue';e.pursuit=0;e.lost=0;}
      if(e.mode==='pursue'){
        e.pursuit+=dt;e.lost=e.visibleToPlayer?0:e.lost+dt;
        if(e.pursuit>=ENEMY_AI.pursuitSeconds||distance>ENEMY_AI.lose||e.position.distanceTo(e.home)>ENEMY_AI.leash||e.lost>ENEMY_AI.lostSeconds||this.state!=='flying'){
          e.mode='return';e.cooldown=ENEMY_AI.cooldownSeconds;e.fire=Math.max(e.fire,2);
        }
      }
      if(e.mode==='return'&&e.position.distanceTo(e.home)<450){e.mode='patrol';e.cooldown=Math.max(e.cooldown,ENEMY_AI.cooldownSeconds);}
      // Patrols are anchored to the launch region, never to the moving player.
      const goal=e.mode==='pursue'?this.position.clone().addScaledVector(this.heading,distance<230?850:350).addScaledVector(side,Math.sin(this.time*.22+e.phase)*400)
        :e.mode==='return'?e.home.clone():e.home.clone().addScaledVector(frame.north,Math.cos(this.time*.10+e.phase)*650).addScaledVector(side,Math.sin(this.time*.10+e.phase)*650);
      const desired=goal.sub(e.position).normalize();e.forward.lerp(desired,1-Math.exp(-dt*.65)).normalize();
      if(this.tick%12===e.id*2){const ahead=e.position.clone().addScaledVector(e.forward,e.speed*2).normalize();e.ground=Math.max(this.ground(up).height,this.ground(ahead).height);}
      const altitude=e.position.length()-this.radius,wanted=Math.max(e.ground+160,(e.mode==='pursue'?this.altitude:e.home.length()-this.radius)+Math.sin(this.time*.15+e.phase)*100),vertical=clamp((wanted-altitude)*.6,-75,110);
      e.forward.addScaledVector(up,-e.forward.dot(up)).normalize();e.velocity.copy(e.forward).multiplyScalar(e.speed).addScaledVector(up,vertical);e.position.addScaledVector(e.velocity,dt);
      const local=e.position.clone().normalize();if(this.tick%12===e.id*2){const floor=this.radius+this.ground(local).height+40;if(e.position.length()<floor)e.position.copy(local).multiplyScalar(floor);}
      e.fire-=dt;
      if(e.mode==='pursue'&&e.visibleToPlayer&&this.time>12&&this.state==='flying'&&this.health>0&&distance<1250&&distance>140&&e.fire<=0&&e.forward.dot(delta.clone().normalize())>.45&&this.projectiles.length<FLIGHT.maxProjectiles){
        e.fire=1.9+e.id*.15;this.enemyShots++;const aim=this.position.clone().addScaledVector(this.velocity,distance/720*.75).addScaledVector(side,Math.sin(this.time+e.phase)*28);
        this.spawnProjectile(e.position,aim.sub(e.position).normalize(),{life:2.2,speed:720,damage:5,enemy:true});
      }
      // Escaping never teleports the same patrol back in front of the player.
    }
  }
  updateProjectiles(dt){
    for(const p of this.projectiles){
      const before=this.beforeProjectile.copy(p.position);p.previousPosition?.copy(p.position);p.life-=dt;
      if(p.missile){const e=this.enemies.find(e=>e.id===p.targetId&&e.health>0);if(e)p.direction.lerp(this.projectileDelta.copy(e.position).addScaledVector(e.velocity,.2).sub(p.position).normalize(),1-Math.exp(-dt*3.5)).normalize();}
      p.position.addScaledVector(p.direction,p.speed*dt);
      if(p.enemy){if(this.state==='flying'&&segmentDistance(this.position,before,p.position)<40){this.hurt(p.damage);p.life=0;}}
      else for(const e of this.enemies)if(e.health>0&&segmentDistance(e.position,before,p.position)<(p.missile?55:44)){e.health=Math.max(0,e.health-p.damage);p.life=0;this.hit=.2;this.explode(p.position,true);if(!e.health){e.respawn=18;this.score++;this.explode(e.position);this.onMessage('Hedef düşürüldü · '+this.score+' zafer');if(this.targetId===e.id)this.cycleTarget();}break;}
      // Terrain occludes weapons; projectile steps are < 23 m at full speed.
      // Keep the same four-tick collision interval, distribute pool slots across
      // phases instead of evaluating all terrain impacts in one simulation tick.
      if(p.life>0&&this.tick%4===p.id%4){const d=this.projectileDelta.copy(p.position).normalize();if(p.position.length()<this.radius+this.ground(d).height){p.life=0;this.explode(p.position,true);}}
    }
    this.projectilePool.compact();
  }
}
