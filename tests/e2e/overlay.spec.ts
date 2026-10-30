import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('local video/photo imports, synchronized preview, layouts and responsive controls',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-overlay-preview-'));
 try{
  for(const [name,color]of [['main','red'],['layer','blue']])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:size=320x180:rate=24`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-c:a','aac',join(dir,name+'.mp4')]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:size=160x160','-frames:v','1',join(dir,'photo.png')]);
  await page.goto('/overlay-studio');await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'));await page.getByLabel('Upload overlay video',{exact:true}).setInputFiles(join(dir,'layer.mp4'));
  await expect(page.getByLabel('Main composition video')).toBeVisible();await page.getByLabel('Main trim start',{exact:true}).fill('1');await page.getByLabel('Main trim end',{exact:true}).fill('6');await page.getByLabel('Layer appears at',{exact:true}).fill('1');await page.getByLabel('Layer ends at / image duration end',{exact:true}).fill('4');
  await page.getByLabel('Timeline position',{exact:true}).fill('2');
  await expect.poll(()=>page.getByLabel('Main composition video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(3,1);
  await expect.poll(()=>page.getByLabel('Secondary composition video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(1,1);
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await expect.poll(()=>page.getByLabel('Main composition video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(3.2);
  const delta=await page.evaluate(()=>{const a=document.querySelector('[aria-label="Main composition video"]') as HTMLVideoElement,b=document.querySelector('[aria-label="Secondary composition video"]') as HTMLVideoElement;return Math.abs(a.currentTime-1-1-b.currentTime);});expect(delta).toBeLessThan(.2);
  await page.getByRole('button',{name:'Pause preview',exact:true}).click();
  await page.getByLabel('Composition layout',{exact:true}).selectOption('pip');await page.getByLabel('Layer width',{exact:true}).fill('0.4');await page.getByLabel('Layer horizontal position',{exact:true}).fill('0.1');
  await expect(page.getByTestId('preview-overlay')).toHaveCSS('opacity','1');await page.getByLabel('Layer opacity',{exact:true}).fill('0.5');await expect(page.getByTestId('preview-overlay')).toHaveCSS('opacity','0.5');
  await page.getByLabel('Composition layout',{exact:true}).selectOption('full');await page.getByLabel('Upload photo',{exact:true}).setInputFiles(join(dir,'photo.png'));await page.getByLabel('Timeline position',{exact:true}).fill('2');await expect(page.getByAltText('Photo overlay')).toBeVisible();
  for(const ratio of ['9:16','16:9','1:1','4:5']){await page.getByLabel('Aspect ratio',{exact:true}).selectOption(ratio);const [w,h]=ratio.split(':').map(Number);const box=await page.getByTestId('composition-canvas').boundingBox();expect(Math.abs(box!.width/box!.height-w/h)).toBeLessThan(.01);}
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByLabel('Upload photo',{exact:true})).toBeVisible();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
