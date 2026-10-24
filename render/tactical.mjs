const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export const TACTICAL_ALTITUDE=38000;
// Two kilometre hysteresis prevents a camera tilt/zoom near the boundary from
// switching repeatedly. Clouds have completely dispersed by entry altitude.
export const tacticalActive=(altitude,previous=false)=>altitude>=(previous?36000:TACTICAL_ALTITUDE);
export const tacticalMix=altitude=>smooth(36000,TACTICAL_ALTITUDE,altitude);
export const cloudVisibility=altitude=>1-smooth(30000,TACTICAL_ALTITUDE,altitude);
