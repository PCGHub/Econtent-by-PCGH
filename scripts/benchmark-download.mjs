// Real HTTP bodies/cache and real WASM. Network shaping is server pacing, not a real phone.
import {chromium,expect as baseExpect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {once} from 'node:events';
const expect=baseExpect.configure({timeout:60000});
const [version='current',bpsArg='200000',latencyArg='150']=process.argv.slice(2);
if(!['base','current'].includes(version))throw Error('Use base or current');
const bps=Number(bpsArg),latency=Number(latencyArg);if(!(bps>=32000&&latency>=0))throw Error('Invalid profile');
const root=process.cwd(),counts=[];let trial='cold';
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<input type="file" id="source">');return;}
  let file;
  if(path.startsWith('/engine/'))file=join(root,'test-results/download-fix',version==='base'?'base/engine':'current-engine',path.slice(8));
  else if(path.startsWith('/ffmpeg/')){
   const saved=join(root,'test-results/download-fix/base/public',path);
   if(version==='base'&&['/ffmpeg/startup-worker.js','/ffmpeg/core-loader.js','/ffmpeg/asset-manifest.json'].includes(path))file=saved;
   else file=resolve(root,'public','.'+path);
  }else throw Error('Unknown path');
  if(!file.startsWith(root+'/'))throw Error('Invalid path');
  const wasm=path.endsWith('.wasm');
  const body=await readFile(wasm&&version==='base'?'/tmp/econtent-base-wire.br':file);
  const etag='"'+createHash('sha256').update(body).digest('hex')+'"';
  const row={trial,path,status:200,bodyBytes:0,expectedBytes:body.length};counts.push(row);
  await delay(latency);if(res.destroyed)return;
  res.setHeader('ETag',etag);res.setHeader('Cache-Control',version==='current'&&path.includes('/releases/')?'public,max-age=31536000,immutable':'public,max-age=0,must-revalidate');
  res.setHeader('Content-Type',wasm?'application/wasm':extname(file)==='.json'?'application/json':'application/javascript');
  if(wasm)res.setHeader('Content-Encoding','br');
  if(req.headers['if-none-match']===etag){row.status=304;res.statusCode=304;res.end();return;}
  res.setHeader('Content-Length',body.length);res.flushHeaders();const start=performance.now();
  for(let i=0;i<body.length;i+=8192){
   if(res.destroyed)return;
   const chunk=body.subarray(i,Math.min(i+8192,body.length));
   if(!res.write(chunk))await Promise.race([once(res,'drain'),once(res,'close')]);
   row.bodyBytes+=chunk.length;await delay(Math.max(0,(row.bodyBytes/bps)*1000-(performance.now()-start)));
  }
  res.end();
 }catch{if(!res.headersSent)res.statusCode=404;res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({executablePath:process.env.ECONTENT_CHROMIUM_PATH??'/usr/bin/chromium'});
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const results=[];
try {
 for(trial of ['cold','warm']){
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#source').setInputFiles('/tmp/econtent-import-fixtures/h264-aac.mp4');
  const report=await page.evaluate(async()=>{
   const path='/engine/ffmpeg-browser.js';const {BrowserVideoEngine}=await import(path);const started=performance.now(),events=[];
   const engine=new BrowserVideoEngine();await engine.initialize(p=>events.push({...p,at:performance.now()-started}));const startupMs=performance.now()-started;
   const cutStarted=performance.now();const clip=await engine.process(document.querySelector('#source').files[0],{range:{start:0,end:4},cutStrategy:'fast',compression:'off',outputName:'clip.mp4'});
   const cuttingMs=performance.now()-cutStarted;window.clip=clip.blob;await engine.dispose();
   const phase=name=>events.find(p=>p.startup?.phase===name)?.at;
   const downloadStart=phase('download'),downloadEnd=phase('compile'),initStart=phase('initialize'),ready=phase('ready');
   return {startupMs,cuttingMs,downloadObservationMs:downloadEnd-downloadStart,compileFinalizeMs:initStart-downloadEnd,runtimeInitializeMs:ready-initStart,metrics:events.findLast(p=>p.startup?.phase==='ready')?.startup,events};
  });
  const pending=page.waitForEvent('download');await page.evaluate(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(window.clip);a.download='clip.mp4';a.click();});
  const dir=`test-results/download-fix/outputs/${version}-${bps}`;await mkdir(dir,{recursive:true});const output=dir+'/'+trial+'.mp4';await(await pending).saveAs(output);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
  if(probe.streams[0].codec_name!=='h264'||probe.streams[1]?.codec_name!=='aac')throw Error('Invalid output codecs');execFileSync('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);
  const current=counts.filter(x=>x.trial===trial);const wasm=current.filter(x=>x.path.endsWith('.wasm'));
  results.push({...report,trial,wireBodyBytes:current.reduce((sum,x)=>sum+x.bodyBytes,0),wasmWireBytes:wasm.reduce((sum,x)=>sum+x.bodyBytes,0),requests:current,output:{duration:Number(probe.format.duration),codecs:['h264','aac'],fullDecode:true}});
  console.log(JSON.stringify({version,bps,trial,startupMs:report.startupMs,cuttingMs:report.cuttingMs,wasmWireBytes:results.at(-1).wasmWireBytes}));
  if(trial==='cold')expect(results.at(-1).wasmWireBytes).toBeGreaterThan(0);
  else if(version==='current')expect(results.at(-1).wasmWireBytes).toBe(0);
 }
 await writeFile(`test-results/download-fix/${version}-${bps}.json`,JSON.stringify({version,bytesPerSecond:bps,latencyMs:latency,environment:'Desktop Chromium; real HTTP server pacing models mobile throughput/latency. No route interception or disabled HTTP cache. Cold browser context; warm reload and fresh worker in same context. Not Android hardware.',results},null,2));
}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
