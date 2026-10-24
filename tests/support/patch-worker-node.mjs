import {parentPort} from 'node:worker_threads';
globalThis.self=globalThis;
self.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);
await import('../../workers/patches.mjs');
parentPort.on('message',data=>Promise.resolve(self.onmessage({data})).catch(error=>parentPort.postMessage({task:data.task,error:error.stack})));
parentPort.postMessage({ready:true});
