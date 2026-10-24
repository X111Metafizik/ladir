import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {deserializePlanet} from '../io/bundle.mjs';
import {postWorkerWorld,workerWorldStats} from '../io/worker-world.mjs';
const world=await deserializePlanet(await readFile('fixtures/lumen-v35.planet'));
const worker=new Worker(new URL('../tests/support/world-probe.mjs',import.meta.url));
const receive=()=>new Promise((resolve,reject)=>{const done=data=>{worker.off('error',fail);data.error?reject(Error(data.error)):resolve(data);};const fail=error=>{worker.off('message',done);reject(error);};worker.once('message',done);worker.once('error',fail);});
const rows={copy:[],shared:[]};
try{
  await receive();
  for(let i=-4;i<24;i++)for(const shared of (i%2?[true,false]:[false,true])){
    const reply=receive(),start=performance.now();
    postWorkerWorld(worker,{world,id:i},{shared});
    const postMs=performance.now()-start,result=await reply,roundTripMs=performance.now()-start;
    if(result.shared!==shared)throw Error('Unexpected transport mode');
    if(i>=0)rows[shared?'shared':'copy'].push({postMs,roundTripMs});
  }
  const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
  const summary=Object.fromEntries(Object.entries(rows).map(([mode,values])=>[mode,{runs:values.length,postMedianMs:percentile(values.map(v=>v.postMs),.5),postP95Ms:percentile(values.map(v=>v.postMs),.95),roundTripMedianMs:percentile(values.map(v=>v.roundTripMs),.5),roundTripP95Ms:percentile(values.map(v=>v.roundTripMs),.95)}]));
  const report={worldHash:world.manifest.worldDataHash,scope:'Worker initialization transport only; not FPS, total process memory or full flight loading.',summary,transport:workerWorldStats(world),samples:rows};
  await mkdir('evidence/v38',{recursive:true});await writeFile('evidence/v38/worker-world-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary,transport:report.transport}));
}finally{await worker.terminate();}
