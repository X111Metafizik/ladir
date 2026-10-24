import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
async function start(shared) {
  const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0',WORLD_SHARED_MEMORY:shared?'1':'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Server did not start'));},10000);
    child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code));});
  });
  return {url,async stop(){const exited=once(child,'exit');child.kill();await exited;}};
}
test('server isolates both document and worker responses, and preserves archived URLs',async()=>{
  const server=await start(true);
  try{
    for(const path of ['/', '/workers/lod.mjs']){
      const response=await fetch(server.url+path);assert.equal(response.status,200);
      assert.equal(response.headers.get('Cross-Origin-Opener-Policy'),'same-origin');
      assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
      await response.arrayBuffer();
    }
    const redirect=await fetch(server.url+'/ARAZI_V18.html?download=1',{redirect:'manual'});
    assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/docs/history/ARAZI_V18.html?download=1');
    const archived=await fetch(server.url+redirect.headers.get('location'));assert.equal(archived.status,200);
    const html=await archived.text();assert.ok(html.includes('../../assets/terrain-stamps/sources.html'));
    const sources=await fetch(new URL('../../assets/terrain-stamps/sources.html',archived.url));assert.equal(sources.status,200);await sources.arrayBuffer();
  }finally{await server.stop();}
});
test('non-isolated hosting remains supported for the ordinary worker-copy path',async()=>{
  const server=await start(false);
  try{
    const response=await fetch(server.url+'/');assert.equal(response.status,200);
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'),null);
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),null);await response.arrayBuffer();
  }finally{await server.stop();}
});
