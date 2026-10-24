import {receiveWorkerWorld} from '../io/worker-world.mjs';
import {analyzeReference} from '../render/reference-analysis.mjs';
self.onmessage=({data})=>{try{const start=performance.now(),result=analyzeReference(receiveWorkerWorld(data));self.postMessage({...result,milliseconds:performance.now()-start},Object.values(result).filter(ArrayBuffer.isView).map(v=>v.buffer));}catch(e){self.postMessage({error:e.message});}};
