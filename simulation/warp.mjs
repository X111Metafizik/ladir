// Integrate a smooth velocity envelope exactly, so distance and arrival speed
// do not depend on render cadence. The final four seconds are braking.
export function warpMotion(elapsed,{duration=12,distance=12_000_000,entrySpeed=0,exitSpeed=700/3.6}={}){
 const t=Math.max(0,Math.min(duration,elapsed)),acceleration=duration/6,deceleration=duration/3,brakeAt=duration-deceleration;
 const peak=(distance-entrySpeed*acceleration/2-exitSpeed*deceleration/2)/(duration-(acceleration+deceleration)/2);
 const smooth=u=>u*u*(3-2*u),integral=u=>u*u*u*(1-u/2);
 let travelled,speed,phase;
 if(t<acceleration){const u=t/acceleration;travelled=entrySpeed*t+(peak-entrySpeed)*acceleration*integral(u);speed=entrySpeed+(peak-entrySpeed)*smooth(u);phase='accelerating';}
 else if(t<brakeAt){travelled=acceleration*(entrySpeed+peak)/2+peak*(t-acceleration);speed=peak;phase='cruising';}
 else{const local=t-brakeAt,u=local/deceleration;travelled=acceleration*(entrySpeed+peak)/2+peak*(brakeAt-acceleration)+peak*local+(exitSpeed-peak)*deceleration*integral(u);speed=peak+(exitSpeed-peak)*smooth(u);phase='decelerating';}
 return {distance:t===duration?distance:travelled,speed,phase,progress:t/duration,remaining:duration-t,peak};
}
