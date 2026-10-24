import http from 'node:http';
import {historyRedirect} from './history-routes.mjs';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL(process.argv.includes('--dist')?'../dist/':'../',import.meta.url))),port=Number(process.env.PORT??4399);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.planet':'application/octet-stream','.woff2':'font/woff2'};
// All runtime assets are same-origin. Other hosts retain the copy fallback.
const isolation=process.env.WORLD_SHARED_MEMORY==='0'?{}:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),redirect=historyRedirect(pathname);
    if(redirect){res.writeHead(308,{...isolation,Location:redirect+url.search});res.end();return;}
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end();return;}
    const info=await stat(target),file=info.isDirectory()?path.join(target,'index.html'):target;
    res.writeHead(200,{...isolation,'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Dosya bulunamadi.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`LADİR / Planet Studio: http://127.0.0.1:${server.address().port}`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
