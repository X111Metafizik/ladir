import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {FixedStepClock} from '../simulation/clock.mjs';
import {FlightSimulation,FLIGHT} from '../simulation/flight.mjs';
import {createFlightAudio} from '../render/flight-audio.mjs';
const create=()=>new FlightSimulation({radius:12000000,direction:[0,0,1],terrain:()=>({elevationMeters:240,waterDepthMeters:0})});
const advance=(s,seconds,fps)=>{for(let i=0;i<Math.round(seconds*fps);i++)s.step(1/fps);};

test('identical inputs produce identical physics, weapons and AI at 20/60/144 fps',()=>{
  const runs=[20,60,144].map(fps=>{const s=create();s.input.x=.32;s.input.y=-.08;s.input.left=true;s.input.boost=true;advance(s,4,fps);return s;});
  for(const s of runs.slice(1)){
    const a=runs[0];assert.equal(s.tick,240);assert.equal(s.shots,a.shots);assert.equal(s.boostEnergy,a.boostEnergy);assert.ok(s.position.distanceTo(a.position)<1e-8);
    assert.equal(s.projectiles.length,a.projectiles.length);
    for(let i=0;i<s.enemies.length;i++)assert.ok(s.enemies[i].position.distanceTo(a.enemies[i].position)<1e-8);
  }
});
test('catch-up is bounded to six fixed ticks and does not accumulate debt',()=>{
  const c=new FixedStepClock(),steps=[];c.advance(.5,dt=>steps.push(dt));
  assert.equal(steps.length,6);assert.ok(steps.every(dt=>dt===1/60));assert.ok(Math.abs(c.stats.droppedSeconds-.4)<1e-9);
  c.advance(1/120,dt=>steps.push(dt));assert.equal(steps.length,6);assert.ok(Math.abs(c.alpha-.5)<1e-9);
  c.advance(1/120,dt=>steps.push(dt));assert.equal(steps.length,7);assert.equal(c.stats.limitedFrames,1);
});
test('presentation moves between physics ticks without mutating the simulation',()=>{
  const s=create();s.step(1/60);const physical=s.position.clone(),a=s.present().position.clone();s.step(1/120);const b=s.present().position.clone();
  assert.deepEqual(s.position,physical);assert.ok(Math.abs(b.distanceTo(a)-FLIGHT.cruise/120)<.001);
  assert.ok(Math.abs(s.present().position.distanceTo(a)-physical.distanceTo(a)*.5)<1e-8);
  s.paused=true;const frozen=s.present().position.clone(),tick=s.tick;s.step(2);assert.equal(s.tick,tick);assert.deepEqual(s.present().position,frozen);
});
test('projectile and explosion storage is reused with fresh identities and bounded overflow',()=>{
  const s=create(),projectiles=s.projectiles,explosions=s.explosions,first=s.explode(s.position),firstId=first.id;
  first.life=0;s.explosionPool.compact();const reused=s.explode(s.position,true);assert.equal(reused,first);assert.ok(reused.id>firstId);assert.equal(reused.duration,.28);
  for(let i=0;i<1000;i++)s.explode(s.position,i%2===0);
  assert.equal(s.explosions.length,FLIGHT.maxExplosions);assert.equal(s.explosionPool.stats.created,16);
  const members=new Set(s.projectilePool.items),pos=s.position.clone().addScaledVector(s.up,10000);
  for(let round=0;round<20;round++){
    for(let i=0;i<128;i++)assert.ok(s.spawnProjectile(pos,s.forward,{life:.001,speed:100,damage:1}));
    assert.equal(s.spawnProjectile(pos,s.forward,{life:1,speed:100,damage:1}),null);
    assert.ok(s.projectiles.every(p=>members.has(p)));
    s.updateProjectiles(1/60);assert.equal(s.projectiles.length,0);
  }
  assert.equal(s.projectilePool.stats.created,128);assert.equal(s.projectilePool.free.length,128);assert.equal(s.projectiles,projectiles);assert.equal(s.explosions,explosions);
});
test('reused missile storage resets homing and enemy state before becoming a cannon round',()=>{
  const s=create(),p=s.spawnProjectile(s.position,s.forward,{life:1,speed:600,damage:62,enemy:true,missile:true,targetId:4});p.life=0;s.projectilePool.compact();
  const q=s.spawnProjectile(s.position,s.right,{life:1,speed:1350,damage:14});assert.equal(p,q);assert.equal(q.enemy,false);assert.equal(q.missile,false);assert.equal(q.targetId,null);assert.ok(q.previousPosition.equals(q.position));
});
test('audio plays each generation of a pooled explosion exactly once',()=>{
  const original=globalThis.AudioContext;let starts=0;
  const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>({connect(){return this;},disconnect(){},start(){starts++;},stop(){},gain:parameter(),frequency:parameter()});
  globalThis.AudioContext=class {constructor(){this.state='running';this.currentTime=0;this.sampleRate=120;this.destination={};}createGain(){return node();}createBuffer(){return {getChannelData:()=>new Float32Array(120)};}createBufferSource(){return node();}createBiquadFilter(){return node();}createOscillator(){return node();}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
  const audio=createFlightAudio();
  try{audio.unlock();const s=create(),e=s.explode(s.position);audio.update(s);assert.equal(starts,2);audio.update(s);assert.equal(starts,2);e.life=0;s.explosionPool.compact();assert.equal(s.explode(s.position),e);audio.update(s);assert.equal(starts,4);}finally{audio.dispose();globalThis.AudioContext=original;}
});
test('completed barrel rolls interpolate the short arc without a full turn backwards',()=>{
  const s=create();s.previous.roll=2*Math.PI-.04;s.rollAngle=0;s.clock.alpha=.5;assert.ok(Math.abs(s.present().roll-(2*Math.PI-.02))<1e-9);
});

test('terrain impact queries are spread over four phases while every projectile is checked',()=>{
 const s=create();s.enemies=[];let queries=0;s.ground=()=>{queries++;return {height:0};};
 for(let i=0;i<128;i++)s.spawnProjectile(s.position,s.forward,{life:10,speed:0,damage:0});
 const counts=[];for(let tick=0;tick<4;tick++){s.tick=tick;queries=0;s.updateProjectiles(1/60);counts.push(queries);}
 assert.deepEqual(counts,[32,32,32,32]);assert.equal(s.projectilePool.stats.created,128);
});
