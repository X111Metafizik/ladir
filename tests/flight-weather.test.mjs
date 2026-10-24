import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Texture,Vector3,Vector4} from 'three/webgpu';
import {FlightOrbit} from '../render/flight-orbit.mjs';
import {cloudVisibility,tacticalActive} from '../render/tactical.mjs';
import {createStormField,cloudDensityAt} from '../render/storms.mjs';
import {createShipEffects} from '../render/ship-effects.mjs';
import {createFlightAudio} from '../render/flight-audio.mjs';
test('tactical boundary has hysteresis, reversible cloud fading and no boundary oscillation',()=>{
 let state=false;for(const [height,expected] of [[37990,false],[38010,true],[37990,true],[36500,true],[35990,false],[37900,false]]){state=tacticalActive(height,state);assert.equal(state,expected);}
 const up=[200,30000,34000,38000,100000].map(cloudVisibility);assert.equal(up[0],1);assert.equal(up[1],1);assert.equal(up[3],0);assert.equal(up[4],0);assert.ok(up.every((v,i)=>i===0||v<=up[i-1]));assert.equal(cloudVisibility(30000),1);
});
test('orbital drag is exclusive to Ctrl + right mouse and ignores other pointers',()=>{
 const orbit=new FlightOrbit(),e={button:2,ctrlKey:true,pointerId:4,clientX:200,clientY:250};assert.equal(orbit.begin({...e,ctrlKey:false}),false);assert.equal(orbit.begin({...e,button:0}),false);assert.equal(orbit.begin(e),true);assert.equal(orbit.move({...e,pointerId:5,clientX:400}),false);assert.equal(orbit.yaw,0);orbit.move({...e,clientX:400,clientY:10000});assert.ok(orbit.yaw<0);assert.ok(orbit.pitch<Math.PI/2);orbit.end();assert.equal(orbit.move(e),false);assert.equal(orbit.pointerId,null);
});
function fieldData(value){const data=new Uint8Array(8*4);for(let i=0;i<8;i++){data[i*4]=value;data[i*4+1]=value;data[i*4+2]=0;data[i*4+3]=255;}return {image:{data,width:2}};}
test('storm sources require dense cloud and are disabled as clouds disperse',()=>{
 const shared={clock:{value:0},clouds:{value:1},radiusKm:{value:12000},kmPerUnit:{value:12},volumeResources:{noise:fieldData(255)}};for(let i=0;i<4;i++)shared['storm'+i]={value:new Vector4()};const field=createStormField(shared),eye=new Vector3(0,0,1000.1);field.update(eye);assert.ok(field.stats.active>0);let peak=0;for(let i=0;i<1300;i++){shared.clock.value=i*.01;field.update(eye);peak=Math.max(peak,field.stats.energy);}assert.ok(peak>.1);
 shared.clouds.value=0;field.update(eye);assert.equal(field.stats.active,0);assert.equal(field.reactive,false);for(let i=0;i<4;i++)assert.equal(shared['storm'+i].value.w,0);
 assert.equal(cloudDensityAt({x:0,y:0,z:12006},1,0,12000,fieldData(0)),0);assert.equal(cloudDensityAt({x:0,y:0,z:12001},1,0,12000,fieldData(255)),0);
});
test('thrusters reuse six instances, mount small lights on the hull and switch off on landing',()=>{
 const player=new Group(),hull=new Mesh(new BoxGeometry(26,5,32),new MeshBasicMaterial());player.add(hull);const fx=createShipEffects(player,new Texture()),buffer=fx.plumes.instanceMatrix.array;assert.equal(fx.lights.count,12);
 const sim={state:'flying',time:0,speed:194,boosting:false};for(let i=0;i<600;i++){sim.time=i/60;sim.boosting=i>300;fx.update(sim);}assert.equal(fx.plumes.instanceMatrix.array,buffer);assert.equal(fx.plumes.count,6);assert.ok(buffer.every(Number.isFinite));
 fx.plumes.geometry.computeBoundingBox();const size=fx.plumes.geometry.boundingBox.getSize(new Vector3());assert.equal(size.x,7*.25);assert.equal(size.z,23*.25);for(let i=0;i<6;i++)assert.ok(buffer[i*16+14]>16,'shortened plumes originate outside the rear hull');
 for(let i=0;i<fx.lights.count;i++)assert.ok(Math.abs(fx.lights.instanceMatrix.array[i*16+13]-2.59)<.001);
 sim.state='landed';fx.update(sim);assert.equal(fx.plumes.visible,false);assert.equal(fx.lights.visible,true);sim.state='crashed';fx.update(sim);assert.equal(fx.lights.visible,false);fx.dispose();assert.equal(player.children.length,1);hull.geometry.dispose();hull.material.dispose();
});
test('weather rumble loops the reusable noise, respects mute and limits overlapping sounds',()=>{
 const saved=globalThis.AudioContext,sources=[];let context,buffers=0;
 const parameter=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}}),node=()=>({gain:parameter(),frequency:parameter(),connect(){return this;},disconnect(){},start(){},stop(){}});
 globalThis.AudioContext=class {constructor(){context=this;this.currentTime=0;this.sampleRate=120;this.state='running';}createGain(){return node();}createBuffer(){buffers++;return {getChannelData:()=>new Float32Array(120)};}createBufferSource(){const s=node();sources.push(s);return s;}createBiquadFilter(){return node();}createOscillator(){return node();}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
 const audio=createFlightAudio();try{audio.unlock();audio.thunder(.9,3000);assert.equal(sources.length,1);assert.equal(sources[0].loop,true);audio.thunder(.8,6000);assert.equal(sources.length,1);context.currentTime=3;audio.enabled=false;audio.thunder(.9,5000);assert.equal(sources.length,1);audio.enabled=true;audio.thunder(.9,5000);assert.equal(sources.length,2);assert.equal(buffers,1);}finally{audio.dispose();globalThis.AudioContext=saved;}
});
