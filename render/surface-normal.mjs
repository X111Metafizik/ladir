import {Fn,normalView,positionView,faceDirection} from 'three/tsl';
// Screen-space surface gradients reuse the already filtered height samples.
// BumpMap's forward differences re-evaluate both triplanar layers three times.
export const surfaceNormal=Fn(([height,strength,base=normalView])=>{
 const dx=positionView.dFdx().normalize(),dy=positionView.dFdy().normalize();
 const r1=dy.cross(base),r2=base.cross(dx),det=dx.dot(r1).mul(faceDirection);
 const gradient=r1.mul(height.dFdx()).add(r2.mul(height.dFdy())).mul(det.sign()).mul(strength);
 return base.mul(det.abs().max(1e-5)).sub(gradient).normalize();
});
