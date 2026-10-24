import test from 'node:test';import assert from 'node:assert/strict';
import {FlightSimulation,FLIGHT,ENEMY_AI} from '../simulation/flight.mjs';
const create=()=>new FlightSimulation({radius:12000000,direction:[0,0,1],terrain:()=>({elevationMeters:240,waterSurfaceMeters:0,waterDepthMeters:0})});
const advance=(s,t)=>{for(let i=0;i<Math.ceil(t*60);i++)s.step(1/60);};
test('cruise is 700 km/h and boost converges to 1800 km/h',()=>{
 const s=create();assert.equal(FLIGHT.cruise*3.6,700);assert.equal(FLIGHT.boost*3.6,1800);
 advance(s,2);assert.ok(Math.abs(s.speed*3.6-700)<.01);
 s.input.boost=true;advance(s,4);assert.ok(Math.abs(s.speed*3.6-1800)<2);assert.equal(s.boosting,true);
 s.input.boost=false;advance(s,5);assert.ok(Math.abs(s.speed*3.6-700)<1);
});
test('a visible nearby enemy abandons pursuit after the time budget and rests',()=>{
 const s=create(),e=s.enemies[0];s.enemies=[e];s.hover();e.speed=0;e.fire=1e9;advance(s,.1);assert.equal(e.mode,'pursue');
 advance(s,ENEMY_AI.pursuitSeconds+1);assert.notEqual(e.mode,'pursue');assert.ok(e.cooldown>10);assert.equal(s.enemyShots,0);
 advance(s,5);assert.notEqual(e.mode,'pursue','no immediate reacquisition');
});
test('range, home leash and obstructed sight independently end pursuit',()=>{
 for(const reason of ['range','home','sight']){
  const s=create(),e=s.enemies[0];s.enemies=[e];e.mode='pursue';e.sightTimer=99;e.visibleToPlayer=true;
  if(reason==='range')s.position.addScaledVector(s.right,6000);
  if(reason==='home')e.home.addScaledVector(s.right,6000);
  if(reason==='sight'){e.visibleToPlayer=false;e.lost=ENEMY_AI.lostSeconds;}
  s.updateEnemies(.1);assert.notEqual(e.mode,'pursue',reason);assert.ok(e.cooldown>0,reason);
 }
});
test('escaped enemies patrol and respawn at their original home instead of teleporting to us',()=>{
 const s=create(),e=s.enemies[0],home=e.home.clone();s.enemies=[e];s.position.addScaledVector(s.right,30000);
 s.updateEnemies(.1);assert.ok(e.position.distanceTo(home)<30);assert.notEqual(e.mode,'pursue');
 e.health=0;e.respawn=.01;s.updateEnemies(.1);assert.ok(e.home.distanceTo(home)<.0001);assert.ok(e.position.distanceTo(home)<.0001);assert.equal(e.mode,'patrol');
});
test('an enemy behind terrain cannot acquire or fire at the player',()=>{
 const s=create(),e=s.enemies[0];s.enemies=[e];s.terrain=()=>({elevationMeters:10000});s.updateEnemies(.1);
 assert.equal(e.visibleToPlayer,false);assert.equal(e.mode,'patrol');assert.equal(s.enemyShots,0);
});
