export class FlightOrbit {
 constructor(){this.active=false;this.pointerId=null;this.yaw=0;this.pitch=Math.atan(.31);this.x=0;this.y=0;}
 begin(event){if(event.button!==2||!event.ctrlKey)return false;this.active=true;this.pointerId=event.pointerId;this.x=event.clientX;this.y=event.clientY;this.yaw=0;this.pitch=Math.atan(.31);return true;}
 move(event){if(!this.active||event.pointerId!==this.pointerId)return false;this.yaw-=(event.clientX-this.x)*.006;this.pitch=Math.max(-1.15,Math.min(1.35,this.pitch+(event.clientY-this.y)*.006));this.x=event.clientX;this.y=event.clientY;return true;}
 end(){this.active=false;this.pointerId=null;}
}
