import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {FlightSimulation,FLIGHT} from '../simulation/flight.mjs';
import {collisionScratch,sweepGround} from '../simulation/ground-collision.mjs';
import {warpArrivalCamera} from '../render/warp-arrival.mjs';
const radius=12_000_000,flat=()=>({elevationMeters:0,waterSurfaceMeters:0});
const advance=(s,t,dt=1/60)=>{for(let i=0;i<t-1e-8;i+=dt)s.step(Math.min(dt,t-i));};
function ship(){const s=new FlightSimulation({radius,terrain:flat,direction:[0,0,1]});s.enemies.length=0;s.position.setLength(radius+10000);s.refreshGround();s.pitch=-.8;return s;}

test('descending adds progressive gravity speed; braking and levelling dissipate it',()=>{
 const s=ship();advance(s,2);const first=s.speed;assert.ok(first>FLIGHT.cruise+10);assert.equal(s.freeFalling,true);advance(s,3);assert.ok(s.speed>first+10);
 s.input.brake=true;advance(s,3);assert.equal(s.freeFalling,false);assert.ok(s.speed<FLIGHT.brake+1);
 s.input.brake=false;s.pitch=0;advance(s,5);assert.ok(Math.abs(s.speed-FLIGHT.cruise)<.1);
});
test('free fall is stable across 20, 60 and 144 rendered frames per second',()=>{
 const ships=[20,60,144].map(f=>{const s=ship();advance(s,8,1/f);return s;});
 for(const s of ships){assert.ok(s.position.distanceTo(ships[1].position)<1);assert.ok(Math.abs(s.speed-ships[1].speed)<.05);}
});
test('continuous collision catches a narrow ridge crossed between endpoints and resolves its slope normal',()=>{
 const from=new Vector3(-1000,0,radius+100),to=new Vector3(1000,0,radius+100),hit=collisionScratch();
 const ridge=d=>({height:250*Math.exp(-(((d.x*radius)/110)**2))});
 assert.ok(sweepGround(from,to,radius,ridge,17.2,hit));assert.ok(hit.distance>700&&hit.distance<1000);assert.ok(hit.normal.x<-.3);assert.ok(hit.point.length()>=radius+17.2);
});
test('outside-to-outside sweeps detect a whole planet crossing while space routes avoid terrain queries',()=>{
 const hit=collisionScratch();let samples=0;const ground=()=>{samples++;return {height:0};};
 assert.ok(sweepGround(new Vector3(0,0,radius+100000),new Vector3(0,0,-radius-100000),radius,ground,17.2,hit));assert.ok(Math.abs(hit.distance-(100000-17.2))<.02);
 samples=0;assert.equal(sweepGround(new Vector3(0,0,radius+100000),new Vector3(1000000,0,radius+100000),radius,ground,17.2,hit),false);assert.equal(samples,0);
});
test('loading predicts an impact approach outside the planet without changing the selected warp route',()=>{
 const route={from:new Vector3(0,0,radius+100000),forward:new Vector3(0,0,-1),position:new Vector3(0,0,100000),distance:radius},before=route.position.clone();
 const target=warpArrivalCamera(route,radius,1.6);assert.ok(target.camera.length()>1000);assert.ok(route.position.equals(before));assert.ok(target.view.forward.every(Number.isFinite));
});

