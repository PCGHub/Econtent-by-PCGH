import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FFMPEG_RELEASE_PATH} from '../../lib/video/ffmpeg-assets-generated';

test('immutable versioned assets load once and a new worker uses the browser cache after reload',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-http-cache-'));const source=join(dir,'source.mp4');
 try {
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','8','-c:v','libx264','-g','24','-pix_fmt','yuv420p',source]);
  const response=await page.request.get(FFMPEG_RELEASE_PATH+'/core/ffmpeg-core.wasm');
  expect(response.headers()['content-encoding']).toBe('br');expect(response.headers()['cache-control']).toContain('immutable');
  expect((await response.body()).length).toBe(32232419);
  // APIRequestContext's independent cache does not warm Chromium's HTTP cache.
  for(const warm of [false,true]){
   await page.goto('/editor');await page.getByLabel('Choose video',{exact:true}).setInputFiles(source);
   await expect(page.getByText(/8.000 seconds/)).toBeVisible();await page.getByLabel('End (seconds)',{exact:false}).fill('4');
   await page.getByRole('button',{name:'Process video',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
   await expect(page.getByTestId('startup-metrics')).toContainText(warm?'Asset source: browser cache':'Asset source: network');
   if(warm)await expect(page.getByTestId('startup-metrics')).toContainText('Network body: 0 bytes');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a verified cached binary avoids a blocked network, and corrupt cache is discarded before explicit retry',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-cache-integrity-'));const source=join(dir,'source.mp4');
 try{
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','8','-c:v','libx264','-g','24','-pix_fmt','yuv420p',source]);
  const run=async()=>{await page.goto('/editor');await page.getByLabel('Choose video',{exact:true}).setInputFiles(source);await expect(page.getByText(/8.000 seconds/)).toBeVisible();await page.getByLabel('End (seconds)',{exact:false}).fill('4');await page.getByRole('button',{name:'Process video',exact:true}).click();};
  await run();await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
  let attempts=0;await page.route('**/core/ffmpeg-core.wasm',route=>{attempts++;return route.abort();});
  await run();await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});expect(attempts).toBe(0);
  await page.evaluate(async()=>{const cache=await caches.open('econtent-ffmpeg-verified-v1');const key=(await cache.keys())[0];const old=await cache.match(key);await cache.put(key,new Response('damaged-cache',{headers:{'Content-Type':'application/wasm','x-econtent-sha256':old!.headers.get('x-econtent-sha256')!}}));});
  await run();await expect(page.getByRole('heading',{name:'Failed',exact:true})).toBeVisible();await expect(page.locator('p[role="alert"]')).toContainText('Invalid FFmpeg WASM magic');
  expect(attempts).toBe(0);await page.unroute('**/core/ffmpeg-core.wasm');
  await page.getByRole('button',{name:'Retry FFmpeg download',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
