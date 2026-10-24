import {Fn,If,mix,uniform,uv,vec2,convertToTexture} from 'three/tsl';
export function createBoostBlur(input,bloomTexture=null){
 const amount=uniform(0),source=convertToTexture(input);
 // Addition and linear filtering commute. Sample the two existing targets
 // directly instead of allocating/copying a full-resolution combined target.
 const sample=coord=>bloomTexture?source.sample(coord).add(bloomTexture.sample(coord)):source.sample(coord);
 const node=Fn(()=>{const coord=uv(),radial=coord.sub(vec2(.5,.48)),base=sample(coord),result=base.toVar();
  // Keep the reticle/ship readable and skip the six extra texture fetches in
  // that central region. Only uniforms change when boost starts or ends.
  const strength=radial.length().smoothstep(.25,.62).mul(amount);
  If(strength.greaterThan(.003),()=>{const sum=base.toVar();for(let i=1;i<=6;i++)sum.addAssign(sample(coord.sub(radial.mul(amount).mul(.055*i/6))));result.assign(mix(base,sum.div(7),strength));});return result;
 })();
 return {node,amount,dispose(){if(source!==input)source.dispose?.();}};
}

