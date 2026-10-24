import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {FlightSimulation,FLIGHT} from '../simulation/flight.mjs';
import {warpMotion} from '../simulation/warp.mjs';
import {WARP_DISTANCES,warpDuration} from '../simulation/skills.mjs';
const create=()=>{const s=new FlightSimulation({radius:12000000,direction:[0,0,1],terrain:()=>({elevationMeters:240,waterSurfaceMeters:0,forest:0})});s.enemies.length=0;return s;};
const advance=(s,seconds,dt=1/60)=>{for(let t=0;t<seconds-1e-8;t+=dt)s.step(Math.min(dt,seconds-t));};
test('warp charges for three seconds, then visibly travels 12,000 km over twelve seconds',()=>{
 const s=create();assert.equal(s.activateSkill(1),true);assert.equal(s.activateSkill(1),false);advance(s,2.95);assert.equal(s.state,'flying');advance(s,.05);assert.equal(s.state,'warping');assert.equal(s.warpRevision,0);
 const from=s.position.clone();advance(s,6);assert.ok(s.position.distanceTo(from)>4_000_000);assert.ok(s.position.distanceTo(from)<10_000_000);assert.equal(s.skills.warp.cooldown,0);
 advance(s,6);assert.equal(s.warpRevision,1);const to=new Vector3(...s.warpEvent.to);assert.ok(Math.abs(from.distanceTo(to)-12_000_000)<.01);assert.equal(s.warpEvent.duration,12);
 assert.ok(s.agl>4_000_000);assert.equal(s.state,'flying');assert.ok(s.present().position.length()>s.radius);assert.ok(s.previous.position.distanceTo(s.position)<5);assert.ok(Math.abs(s.speed-FLIGHT.cruise)<1e-8);
 assert.equal(s.skills.warp.cooldown,20);assert.equal(s.activateSkill(1),false);advance(s,19.95);assert.equal(s.activateSkill(1),false);advance(s,.05);assert.equal(s.activateSkill(1),true);
});
test('warp charging holds the heading, preserves pooled effects and releases pursuing enemies',()=>{
 const s=create();s.spawnProjectile(s.position,s.forward,{life:10,speed:100,damage:1});s.explode(s.position);const allocated=s.projectilePool.stats.created;s.activateSkill(1);s.input.x=1;s.input.y=1;
 advance(s,3);assert.equal(s.state,'warping');assert.equal(s.projectiles.length,0);assert.equal(s.explosions.length,0);assert.equal(s.projectilePool.stats.created,allocated);assert.equal(s.pitch,0);assert.equal(s.targetId,null);
});
test('repair restores exactly 50 points over five seconds; its 30-second cooldown starts on activation',()=>{
 const s=create();s.health=20;assert.equal(s.activateSkill(2),true);assert.equal(s.activateSkill(2),false);advance(s,2.5);assert.ok(Math.abs(s.health-45)<1e-6);advance(s,2.5);assert.ok(Math.abs(s.health-70)<1e-6);assert.equal(s.skills.repair.remaining,0);assert.ok(Math.abs(s.skills.repair.cooldown-25)<1e-6);
 advance(s,24.95);assert.equal(s.activateSkill(2),false);advance(s,.05);assert.equal(s.activateSkill(2),true);advance(s,5);assert.equal(s.health,100);
});
test('skills freeze during pause, cannot revive a destroyed ship, and unused slots are inert',()=>{
 const s=create();assert.equal(s.activateSkill(2),false);for(let i=3;i<=8;i++)assert.equal(s.activateSkill(i),false);
 s.health=30;s.activateSkill(2);s.activateSkill(1);s.paused=true;const before=JSON.stringify(s);advance(s,10);assert.equal(JSON.stringify(s),before);assert.equal(s.activateSkill(1),false);
 s.paused=false;s.hurt(100);advance(s,5);assert.equal(s.health,0);assert.equal(s.warpRevision,0);assert.equal(s.skills.repair.remaining,0);assert.equal(s.activateSkill(2),false);
});
test('landing cancels an unfinished warp without consuming its cooldown',()=>{
 const s=create();s.activateSkill(1);advance(s,1);s.requestLanding();advance(s,.1);assert.equal(s.skills.warp.remaining,0);assert.equal(s.skills.warp.cooldown,0);assert.equal(s.warpRevision,0);
});
test('skill timing and destination agree at 20, 60 and 144 rendered frames per second',()=>{
 const ships=[20,60,144].map(fps=>{const s=create();s.health=20;s.activateSkill(1);s.activateSkill(2);advance(s,16,1/fps);return s;});
 for(const s of ships){assert.equal(s.warpRevision,1);assert.ok(Math.abs(s.health-70)<.2);assert.ok(s.position.distanceTo(ships[1].position)<4);assert.ok(Math.abs(s.skills.warp.cooldown-19)<.02);}
});

test('full pitch is retained for an outward space jump and steering cannot bend the tunnel',()=>{
 const s=create();s.pitch=1.2;advance(s,.1);s.activateSkill(1);advance(s,3);const forward=s.forward.clone(),from=s.position.clone();s.input.x=1;s.input.y=1;
 assert.equal(s.requestLanding(),false);assert.equal(s.shoot(),false);advance(s,12);
 assert.ok(s.position.clone().sub(from).normalize().dot(forward)>1-1e-10);assert.ok(s.altitude>11_000_000);assert.equal(s.warpEvent.interrupted,false);
});

test('velocity accelerates smoothly, brakes for the last four seconds and exits at cruise',()=>{
 let previousDistance=-1,previousSpeed=Infinity;
 for(let t=0;t<=12;t+=.01){const p=warpMotion(t);assert.ok(p.distance>=previousDistance);assert.ok(Number.isFinite(p.speed)&&p.speed>=0);previousDistance=p.distance;if(t>=8){assert.ok(p.speed<=previousSpeed+1e-6);previousSpeed=p.speed;}}
 assert.equal(warpMotion(0).speed,0);assert.equal(warpMotion(12).distance,12_000_000);assert.ok(Math.abs(warpMotion(12).speed-FLIGHT.cruise)<1e-8);
 assert.ok(Math.abs(warpMotion(8-1e-6).speed-warpMotion(8+1e-6).speed)<1e-4);assert.ok(warpMotion(11.95).speed<900);
});

test('an unsafe route can charge and depart but a swept terrain impact destroys the ship',()=>{
 const s=create();s.position.setLength(s.radius+100000);s.pitch=-.4;advance(s,.1);
 assert.ok(s.warpDestination().position.length()>s.radius,'both route endpoints are outside the planet');
 assert.equal(s.activateSkill(1),true);advance(s,3);assert.equal(s.state,'warping');
 advance(s,6);assert.equal(s.warpEvent.interrupted,true);assert.ok(s.warpEvent.distance>1000&&s.warpEvent.distance<1_000_000);assert.equal(s.state,'crashed');assert.equal(s.health,0);assert.ok(s.lastImpact.speed>75);assert.ok(s.skills.warp.cooldown>0);assert.ok(s.agl>=FLIGHT.clearance-.01);
});

test('pause freezes travel, repair and the presentation clock; resuming completes the route',()=>{
 const s=create();s.health=25;s.activateSkill(1);advance(s,3.5);s.activateSkill(2);advance(s,1);s.paused=true;const frozen=JSON.stringify(s);advance(s,10);assert.equal(JSON.stringify(s),frozen);
 s.paused=false;advance(s,10.5);assert.equal(s.warpRevision,1);assert.ok(Math.abs(s.health-75)<1e-7);
});

test('space travel avoids procedural ground queries until the ship returns below 60 km',()=>{
 const s=create();s.position.setLength(s.radius+1000000);s.forward.copy(s.up);s.pitch=1.55;let samples=0;s.terrain=()=>{samples++;return {elevationMeters:240};};s.refreshGround();assert.equal(s.groundResolved,false);assert.equal(samples,0);
 assert.equal(s.beginWarp(),true);advance(s,13);assert.equal(samples,0);assert.equal(s.requestLanding(),false);
 s.position.setLength(s.radius+4000);s.refreshGround();assert.equal(s.groundResolved,true);assert.equal(samples,1);assert.ok(Math.abs(s.agl-3760)<1e-6);
});

test('all five selectable distances reach their endpoint and cruise speed at different render rates',()=>{
 assert.deepEqual(WARP_DISTANCES.map(d=>d/1000),[1000,3000,6000,9000,12000]);
 for(const distance of WARP_DISTANCES)for(const fps of [20,60,144]){
  const s=create();s.pitch=.7;advance(s,.1);s.activateSkill(1);if(distance!==12_000_000)assert.equal(s.skills.selectWarpDistance(distance),true);
  assert.equal(s.skills.warp.duration,warpDuration(distance));advance(s,3+warpDuration(distance),1/fps);
  assert.equal(s.warpEvent.distance,distance);assert.equal(s.warpEvent.duration,warpDuration(distance));assert.equal(s.warpEvent.interrupted,false);
  assert.ok(Math.abs(new Vector3(...s.warpEvent.from).distanceTo(new Vector3(...s.warpEvent.to))-distance)<1e-6);assert.ok(Math.abs(s.speed-FLIGHT.cruise)<1e-8);assert.equal(s.skills.warp.cooldown,20);
 }
});

test('distance changes reset the charge only while selectable, remember the last choice and preserve cooldown',()=>{
 const s=create();assert.equal(s.skills.selectWarpDistance(3_000_000),false);s.activateSkill(1);advance(s,2.5);
 assert.equal(s.skills.selectWarpDistance(6_000_000),true);assert.equal(s.skills.warp.remaining,3);assert.equal(s.skills.selectWarpDistance(6_000_000),false);assert.equal(s.skills.selectWarpDistance(4_000_000),false);assert.equal(s.skills.selectWarpDistance(6000),false);
 s.paused=true;assert.equal(s.skills.selectWarpDistance(9_000_000),false);s.paused=false;advance(s,2.99);assert.equal(s.state,'flying');advance(s,.02);assert.equal(s.state,'warping');assert.equal(s.skills.selectWarpDistance(12_000_000),false);
 advance(s,6);assert.equal(s.skills.warp.targetDistance,6_000_000);assert.ok(s.skills.warp.cooldown>19.9);assert.equal(s.skills.selectWarpDistance(3_000_000),false);advance(s,20);assert.equal(s.activateSkill(1),true);assert.equal(s.skills.warp.targetDistance,6_000_000);
});

test('the short warp envelope remains faster than boost and decelerates smoothly from every entry speed',()=>{
 for(const distance of WARP_DISTANCES)for(const entrySpeed of [0,FLIGHT.cruise,FLIGHT.boost]){
  const options={distance,duration:warpDuration(distance),entrySpeed,exitSpeed:FLIGHT.cruise};let last=-1;
  for(let i=0;i<=120;i++){const m=warpMotion(i/120*options.duration,options);assert.ok(m.distance>=last);last=m.distance;assert.ok(m.peak>FLIGHT.boost);assert.ok(m.speed>=0);}
  const end=warpMotion(options.duration,options);assert.equal(end.distance,distance);assert.ok(Math.abs(end.speed-FLIGHT.cruise)<1e-8);
 }
});
