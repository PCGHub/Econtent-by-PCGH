import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DEFAULT_COMPOSITION,geometry} from '../lib/composition/model';
import {compositionArgs} from '../lib/composition/command';
test('real compositions match layout, crop/opacity, timing and selected audio in validated MP4s',()=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-composition-native-'));
 const run=(args:string[])=>execFileSync('ffmpeg',['-v','error','-y',...args],{cwd:dir,maxBuffer:16*1048576});
 const pixel=(time:number,x:number,y:number)=>{const bytes=run(['-ss',String(time),'-i','output.mp4','-vf',`crop=2:2:${Math.floor(x/2)*2}:${Math.floor(y/2)*2},format=rgb24`,'-frames:v','1','-f','rawvideo','-']);return Array.from(bytes.subarray(0,3));};
 try{
  for(const [name,color,freq]of [['main','red',440],['layer','blue',880]])run(['-f','lavfi','-i',`color=${color}:size=320x180:rate=24`,'-f','lavfi','-i',`sine=frequency=${freq}:sample_rate=48000`,'-t','8','-c:v','libx264','-c:a','aac',name+'.mp4']);
  run(['-f','lavfi','-i','color=blue:size=160x160','-frames:v','1','photo.png']);
  for(const layout of ['stack','pip','full'] as const)for(const image of [true,false]){
   const c={...DEFAULT_COMPOSITION,trimStart:2,trimEnd:6,overlayStart:1,overlayEnd:3,layout,audio:image?'main' as const:'secondary' as const,ratio:layout==='full'?'16:9' as const:'9:16' as const};
   const info={duration:8,hasAudio:true};run(compositionArgs(c,info,info,image,'main.mp4',image?'photo.png':'layer.mp4'));
   const p=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json','output.mp4'],{cwd:dir,encoding:'utf8'})),g=geometry(c);
   assert.equal(p.streams[0].codec_name,'h264');assert.equal(p.streams[1].codec_name,'aac');assert.equal(p.streams[0].width,g.w);assert.equal(p.streams[0].height,g.h);assert.ok(Math.abs(Number(p.format.duration)-4)<.1);assert.ok(Math.abs(Number(p.streams[0].start_time)-Number(p.streams[1].start_time))<.05);
   const center={x:g.overlay.x+g.overlay.w/2,y:g.overlay.y+g.overlay.h/2};
   const before=pixel(.5,center.x,center.y),during=pixel(1.5,center.x,center.y),after=pixel(3.5,center.x,center.y);
   assert.ok(during[2]>200&&during[0]<30,`active layer must be blue: ${during}`);
   if(layout==='stack'){assert.ok(Math.max(...before)<20);assert.ok(Math.max(...after)<20);}else{assert.ok(before[0]>200);assert.ok(after[0]>200);}
   if(!image){const pcm=run(['-ss','0.2','-i','output.mp4','-t','0.3','-map','0:a','-ar','48000','-ac','1','-f','s16le','-']);let energy=0;for(let i=0;i<pcm.length;i+=2)energy+=pcm.readInt16LE(i)**2;assert.ok(Math.sqrt(energy/(pcm.length/2))<5,'secondary-only audio must be silent before layer');}
   run(['-xerror','-i','output.mp4','-f','null','-']);
   console.log(JSON.stringify({layout,image,duration:p.format.duration,width:g.w,height:g.h,before,during,after,audio:c.audio}));
  }
  run(['-f','lavfi','-i','color=red:size=320x160,drawbox=x=160:y=0:w=160:h=160:color=blue:t=fill','-frames:v','1','crop.png']);
  for(const cropX of [0,1]){const c={...DEFAULT_COMPOSITION,trimEnd:1,overlayStart:0,overlayEnd:1,layout:'full' as const,cropX,audio:'none' as const};run(compositionArgs(c,{duration:8,hasAudio:true},undefined,true,'main.mp4','crop.png'));const rgb=pixel(.5,180,320);assert.ok(cropX===0?rgb[0]>200&&rgb[2]<30:rgb[2]>200&&rgb[0]<30,'Crop focal point must select the requested side');}
  const c={...DEFAULT_COMPOSITION,trimEnd:4,overlayStart:0,overlayEnd:4,layout:'full' as const,opacity:.5,audio:'none' as const};run(compositionArgs(c,{duration:8,hasAudio:true},undefined,true,'main.mp4','photo.png'));const rgba=pixel(1,100,100);assert.ok(rgba[0]>95&&rgba[2]>95);const p=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json','output.mp4'],{cwd:dir,encoding:'utf8'}));assert.equal(p.streams.length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
