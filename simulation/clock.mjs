// Bound catch-up work after a stalled/background frame. Only whole, identical
// physics ticks run; the remainder is used exclusively for presentation.
export class FixedStepClock {
  constructor(step=1/60,maxSteps=6){
    this.step=step;this.maxSteps=maxSteps;this.remainder=0;this.alpha=0;
    this.stats={steps:0,lastSteps:0,droppedSeconds:0,limitedFrames:0};
  }
  advance(delta,update){
    if(!Number.isFinite(delta)||delta<=0){this.stats.lastSteps=0;return;}
    this.remainder+=delta;
    const available=Math.floor((this.remainder+1e-10)/this.step),count=Math.min(available,this.maxSteps);
    if(available>count){this.stats.droppedSeconds+=(available-count)*this.step;this.stats.limitedFrames++;}
    this.remainder=Math.max(0,this.remainder-available*this.step);
    for(let i=0;i<count;i++)update(this.step);
    this.stats.steps+=count;this.stats.lastSteps=count;this.alpha=this.remainder/this.step;
  }
}
