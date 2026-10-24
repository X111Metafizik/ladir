import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
const v34=process.argv.includes('--v34'),current=process.argv.includes('--v32');
const root=new URL(v34?'../output/v34/':current?'../output/v32/':'../output/mobile-report/',import.meta.url),port=v34?4403:current?4402:4401;
// V34 is local-only. Transfer the downloaded PDF/standalone HTML to the phone;
// this server does not expose the report to other devices on the network.
const host=v34?'127.0.0.1':'0.0.0.0';
const pdf=v34?'ATLAS_Terrain_Ucus_Performans_V34.pdf':'ATLAS_Terrain_Ucus_Performans_V31.pdf';
const documentName=v34?'ATLAS_V34_Sonuc.html':current?'ATLAS_V32_Sonuc.html':'ATLAS_Mobil_Rapor_V31.html';
const allowed=v34?['index.html',documentName,pdf]:current?['index.html',documentName]:['index.html',pdf];
// A report-only endpoint for the phone. No project files or directory listing.
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['GET','HEAD'].includes(req.method)||!allowed.includes(name)){res.writeHead(404);res.end();return;}
 try{const bytes=await readFile(new URL(name,root)),headers={'Content-Type':name===pdf?'application/pdf':'text/html; charset=utf-8','Content-Length':bytes.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
  if(name===pdf||url.searchParams.has('download'))headers['Content-Disposition']=`attachment; filename="${name===pdf?pdf:documentName}"`;
  res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('Rapor bulunamadi.');}
});
server.listen(port,host,()=>{
 console.log(`ORVANTA report: http://127.0.0.1:${port}/`);
 if(host==='0.0.0.0')for(const addresses of Object.values(networkInterfaces()))for(const a of addresses??[])if(a.family==='IPv4'&&!a.internal)console.log(`LAN: http://${a.address}:${port}/`);
});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
