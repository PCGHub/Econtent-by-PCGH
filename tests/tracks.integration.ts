import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {DEFAULT_COMPOSITION} from '../lib/composition/model';import {EMPTY_TRACKS} from '../lib/composition/tracks';import {compositionArgs} from '../lib/composition/command';
test('timed raster overlays and music produce measured frames, silent gaps and limited audio',()=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-phase2-native-'));const run=(args:string[])=>execFileSync('ffmpeg',['-v','error','-y',...args],{cwd:dir,maxBuffer:16*1048576});
 try{
 run(['-f','lavfi','-i','color=black:size=160x90:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-c:a','aac','main.mp4']);
 for(const [name,color]of [['photo','black'],['textA','white'],['textB','red']])run(['-f','lavfi','-i',`color=${color}:size=80x40`,'-frames:v','1',name+'.png']);
 run(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','3','song.wav']);
 const texts=[{id:'A',text:'A',start:1,end:2,fontSize:32,color:'#ffffff',x:0,y:0,bold:true,italic:false},{id:'B',text:'B',start:3,end:4,fontSize:32,color:'#ff0000',x:0,y:0,bold:true,italic:false}];
 const music=[{id:'musicA',sourceId:'song',start:1,end:2,sourceStart:0,volume:1,muted:false},{id:'musicB',sourceId:'song',start:3,end:4,sourceStart:0,volume:1,muted:false}];
 const c={...DEFAULT_COMPOSITION,trimEnd:6,overlayEnd:6,layout:'full' as const,tracks:{...EMPTY_TRACKS,text:texts,audio:music,muteMain:true,muteSecondary:true}};
 run(compositionArgs(c,{duration:6,hasAudio:true},undefined,true,'main.mp4','photo.png',128*1048576,{text:texts.map((clip,i)=>({clip,path:i?'textB.png':'textA.png',x:0,y:0,width:80,height:40})),audio:music.map(clip=>({clip,path:'song.wav',source:{duration:3,hasAudio:true}}))}));
 for(const [time,color]of [[.5,'black'],[1.5,'white'],[2.5,'black'],[3.5,'red'],[4.5,'black']] as const){const pixels=run(['-ss',String(time),'-i','output.mp4','-vf','crop=2:2:10:10,format=rgb24','-frames:v','1','-f','rawvideo','-']);if(color==='black')assert.ok(Math.max(...pixels)<15);else if(color==='white')assert.ok(Math.min(...pixels)>210);else assert.ok(pixels[0]>210&&pixels[1]<25);}
 for(const [time,active]of [[.3,false],[1.3,true],[2.3,false],[3.3,true],[4.3,false]] as const){const pcm=run(['-ss',String(time),'-i','output.mp4','-t','0.2','-map','0:a','-ar','48000','-ac','1','-f','f32le','-']);let sum=0,peak=0;for(let i=0;i<pcm.length;i+=4){const value=pcm.readFloatLE(i);sum+=value*value;peak=Math.max(peak,Math.abs(value));}const rms=Math.sqrt(sum/(pcm.length/4));assert.ok(active?rms>.03:rms<.001,`audio ${time}: ${rms}`);assert.ok(peak<1,'Audio must not clip');}
 run(['-xerror','-i','output.mp4','-f','null','-']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
