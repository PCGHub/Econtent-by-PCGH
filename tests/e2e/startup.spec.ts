import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function source(page: import('@playwright/test').Page, file:string) {
 await page.goto('/editor');await page.getByLabel('Choose video',{exact:true}).setInputFiles(file);
 await expect(page.getByText(/8.000 seconds/)).toBeVisible();await page.getByLabel('End (seconds)',{exact:false}).fill('4');
}
test('startup identifies HTTP/protection, MIME, damaged WASM and compilation failures before encoding',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-startup-'));const file=join(dir,'input.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','8','-c:v','libx264','-g','24','-pix_fmt','yuv420p',file]);
 try {
  for(const kind of ['http','redirect','html','magic','compile'] as const) {
   await source(page,file);
   const bytes=Buffer.from([0,97,115,109,1,0,0,0,255,255,255,255,255,255,255,255]);
   await page.route('**/ffmpeg/core/ffmpeg-core.wasm',route=>route.fulfill({
    status:kind==='http'?401:kind==='redirect'?302:200,headers:kind==='redirect'?{location:'/login'}:undefined,contentType:kind==='html'?'text/html':'application/wasm',
    body:kind==='html'?'<html>Authentication required</html>':kind==='magic'?Buffer.from('not a wasm file!'):bytes,
   }));
   if(kind==='compile')await page.route('**/ffmpeg/asset-manifest.json',route=>route.fulfill({json:{coreVersion:'0.12.10',wrapperVersion:'0.12.15',wasmBytes:bytes.length}}));
   await page.getByRole('button',{name:'Process video',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Failed',exact:true})).toBeVisible({timeout:30000});
   await expect(page.locator('p[role="alert"]')).toContainText(kind==='http'?'HTTP 401':kind==='redirect'?'request failed or redirected':kind==='html'?'unexpected Content-Type':kind==='magic'?'Invalid FFmpeg WASM magic':'startup failed');
   await expect(page.locator('article')).toHaveCount(0);
   await page.unroute('**/ffmpeg/core/ffmpeg-core.wasm');await page.unroute('**/ffmpeg/asset-manifest.json');
  }
  // Exercise the buffered compatibility branch when streaming compilation is unavailable.
  await page.route('**/ffmpeg/core-loader.js',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:'WebAssembly.compileStreaming = undefined;\n'+await response.text()});
  });
  await source(page,file);await page.getByRole('button',{name:'Process video',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('WASM download stall has its own deadline and cancel/retry creates a fresh worker',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-startup-cancel-'));const file=join(dir,'input.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','8','-c:v','libx264','-g','24','-pix_fmt','yuv420p',file]);
 try{
  await source(page,file);await page.clock.install();let requested=0;const held: import('@playwright/test').Route[]=[];
  await page.route('**/ffmpeg/core/ffmpeg-core.wasm',route=>{requested++;held.push(route);});
  await page.getByRole('button',{name:'Process video',exact:true}).click();
  await expect.poll(()=>requested).toBe(1);
  await expect(page.getByTestId('processing-operation')).toContainText('Download FFmpeg WASM');
  await expect(page.getByTestId('startup-download')).toContainText('0.0 MB');
  await expect(page.getByRole('button',{name:'Cancel processing',exact:true})).toBeVisible();
  await page.clock.fastForward(30_001);
  await expect(page.getByRole('heading',{name:'Failed',exact:true})).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toContainText('no new download bytes');
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button',{name:'Process video',exact:true}).click();
  await expect.poll(()=>requested).toBe(2);
  await page.getByRole('button',{name:'Cancel processing',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible();
  await Promise.all(held.map(route=>route.abort().catch(()=>{})));
  await page.unroute('**/ffmpeg/core/ffmpeg-core.wasm');await page.clock.resume();
  await page.getByRole('button',{name:'Process video',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
