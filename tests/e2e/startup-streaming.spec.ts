import {test,expect} from '@playwright/test';
import {createServer, type ServerResponse} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname,resolve} from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';

test('advancing WASM download survives over two minutes of test-clock time, then initializes and cuts',async({page})=>{
 const dir=await mkdtemp(join(tmpdir(),'econtent-stream-startup-'));
 let wasmResponse: ServerResponse | undefined;let wasmRequests=0;
 const root=process.cwd();
 execFileSync(process.execPath,['scripts/benchmark-compile.mjs','lib/video',join(dir,'engine')]);
 const server=createServer(async(req,res)=>{
  try {
   const path=new URL(req.url!,'http://localhost').pathname;
   if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<input type="file" id="source">');return;}
   if(path==='/ffmpeg/core/ffmpeg-core.wasm'){
    wasmRequests++;
    res.setHeader('Content-Type','application/wasm');res.flushHeaders();wasmResponse=res;return;
   }
   const base=path.startsWith('/ffmpeg/')?join(root,'public'):dir;
   const target=resolve(base,'.'+path);if(!target.startsWith(base+'/'))throw Error('Invalid path');
   res.setHeader('Content-Type',extname(target)==='.json'?'application/json':'application/javascript');res.end(await readFile(target));
  }catch{res.statusCode=404;res.end();}
 });
 try {
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw Error('No fixture address');
  await page.goto(`http://127.0.0.1:${address.port}`);await page.clock.install();
  await page.evaluate(async()=>{
   const path='/engine/ffmpeg-browser.js';const {BrowserVideoEngine}=await import(/* webpackIgnore:true */path);
   const state=window as unknown as {engine: import('../../lib/video/ffmpeg-browser').BrowserVideoEngine; startupBytes:number; startupPhase:string; initResult:string};
   state.engine=new BrowserVideoEngine();state.startupBytes=0;state.initResult='pending';
   void state.engine.initialize(p=>{if(p.startup){state.startupBytes=p.startup.receivedBytes??0;state.startupPhase=p.startup.phase;}}).then(()=>{state.initResult='ready';},error=>{state.initResult=String(error);});
  });
  await expect.poll(()=>!!wasmResponse).toBe(true);
  const wasm=await readFile('public/ffmpeg/core/ffmpeg-core.wasm');const step=Math.ceil(wasm.length/8);
  for(let i=0;i<8;i++){
   const end=Math.min((i+1)*step,wasm.length);
   if(!wasmResponse!.write(wasm.subarray(i*step,end)))await once(wasmResponse!,'drain');
   if(i===7){wasmResponse!.end();break;}
   await expect.poll(()=>page.evaluate(()=> (window as unknown as {startupBytes:number}).startupBytes),{timeout:30000}).toBeGreaterThanOrEqual(end-131072); // Worker reports at most once per 128 KiB / 250 ms.
   await page.clock.fastForward(18_000);
   expect(await page.evaluate(()=> (window as unknown as {initResult:string}).initResult)).toBe('pending');
  }
  // Seven 18s jumps = 126s, with real bytes between jumps. No real 126s sleep.
  await page.clock.resume();
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {initResult:string}).initResult),{timeout:60000}).toBe('ready');
  const source=join(dir,'input.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','8','-c:v','libx264','-g','24','-pix_fmt','yuv420p',source]);
  await page.locator('#source').setInputFiles(source);
  const bytes=await page.evaluate(async()=>{
   const state=window as unknown as {engine: import('../../lib/video/ffmpeg-browser').BrowserVideoEngine};
   const clip=await state.engine.process(document.querySelector<HTMLInputElement>('#source')!.files![0],{range:{start:0,end:4},compression:'off',cutStrategy:'fast',outputName:'clip.mp4'});
   const size=clip.blob.size;await state.engine.dispose();return size;
  });
  expect(bytes).toBeGreaterThan(1000);expect(wasmRequests).toBe(1);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
