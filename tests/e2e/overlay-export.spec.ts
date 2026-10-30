import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('real browser composition exports image/video layouts, audio, cancellation and recovery',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-overlay-export-'));
 try{
  for(const [name,color]of [['main','red'],['layer','blue']])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:size=320x180:rate=24`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-c:a','aac',join(dir,name+'.mp4')]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:size=160x160','-frames:v','1',join(dir,'photo.png')]);
  for(const ext of ['jpg','webp'])execFileSync('ffmpeg',['-v','error','-i',join(dir,'photo.png'),'-frames:v','1',join(dir,'photo.'+ext)]);
  await page.goto('/overlay-studio');await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'));await page.getByLabel('Upload photo',{exact:true}).setInputFiles(join(dir,'photo.png'));
  await page.getByLabel('Main trim start',{exact:true}).fill('2');await page.getByLabel('Main trim end',{exact:true}).fill('6');await page.getByLabel('Layer appears at',{exact:true}).fill('1');await page.getByLabel('Layer ends at / image duration end',{exact:true}).fill('3');
  await page.getByText('Audio',{exact:true}).click();
  for(const [layout,video]of [['stack',false],['stack',true],['pip',true],['pip',false],['full',false],['full',true]] as const){
   if(video)await page.getByLabel('Upload overlay video',{exact:true}).setInputFiles(join(dir,'layer.mp4'));
   else await page.getByLabel('Upload photo',{exact:true}).setInputFiles(join(dir,'photo.'+(layout==='stack'?'jpg':layout==='pip'?'webp':'png')));
   await page.getByLabel('Layer appears at',{exact:true}).fill('1');await page.getByLabel('Layer ends at / image duration end',{exact:true}).fill('3');
   const audio=!video&&layout==='pip'?'none':video&&layout==='stack'?'secondary':video&&layout==='pip'?'mix':'main';await page.getByLabel('Audio source',{exact:true}).selectOption(audio);
   await page.getByLabel('Composition layout',{exact:true}).selectOption(layout);await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Export MP4',exact:true}).click();
   await expect(page.getByLabel('Preview paused',{exact:true})).toBeVisible();await expect(page.getByLabel('Main composition video',{exact:true})).toHaveCount(0);
   await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:120000});await expect(page.getByTestId('overall-percentage')).toHaveText('100%');
   const preview=page.getByLabel('Exported composition preview');await preview.evaluate((v:HTMLVideoElement)=>{v.muted=true;v.load();});await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(1);await preview.evaluate((v:HTMLVideoElement)=>v.play());await expect.poll(()=>preview.evaluate((v:HTMLVideoElement)=>v.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);await preview.evaluate((v:HTMLVideoElement)=>v.pause());
   const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download composition MP4',exact:true}).click();const out=join(dir,layout+'.mp4');await(await pending).saveAs(out);
   const p=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',out],{encoding:'utf8'}));expect(p.streams[0].codec_name).toBe('h264');if(audio==='none')expect(p.streams).toHaveLength(1);else expect(p.streams[1].codec_name).toBe('aac');expect(Math.abs(Number(p.format.duration)-4)).toBeLessThan(.15);if(audio!=='none')expect(Math.abs(Number(p.streams[0].start_time)-Number(p.streams[1].start_time))).toBeLessThan(.1);
   const frame=execFileSync('ffmpeg',['-v','error','-ss','1.5','-i',out,'-vf',`crop=2:2:${layout==='pip'?280:180}:${layout==='pip'?450:500},format=rgb24`,'-frames:v','1','-f','rawvideo','-']);expect(frame[2]).toBeGreaterThan(200);expect(frame[0]).toBeLessThan(30);
   execFileSync('ffmpeg',['-v','error','-xerror','-i',out,'-f','null','-']);
  }
  // Delay the encoding command, then cancel; the worker must terminate and the next job must recover.
  await page.addInitScript(()=>{const Original=window.Worker;window.Worker=class extends Original{postMessage(message:unknown,options?:StructuredSerializeOptions|Transferable[]){const data=message as {type?:string;data?:{args?:string[]}};const send=()=>super.postMessage(message,Array.isArray(options)?options:options?.transfer??[]);if(data?.type==='EXEC'&&data.data?.args?.includes('-filter_complex'))setTimeout(()=>{try{send();}catch{}},1000);else send();}};});
  await page.reload();await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'));await page.getByLabel('Upload photo',{exact:true}).setInputFiles(join(dir,'photo.png'));await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Export MP4',exact:true}).click();await expect(page.getByTestId('processing-operation')).toContainText('Encode');await page.getByRole('button',{name:'Cancel processing',exact:true}).click();await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Download composition MP4',exact:true})).toHaveCount(0);
  await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Export MP4',exact:true}).click();await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:120000});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
