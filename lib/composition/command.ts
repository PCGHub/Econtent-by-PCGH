import type {TextClip,AudioClip} from './tracks';
import {geometry,parseComposition,type Composition} from './model';
export interface CompositionInput {
  duration:number;
  hasAudio:boolean;
  videoDecoder?:string;
  audioDecoder?:string;
  timelineStart?:number;
  audioTimelineStart?:number;
}
export interface TextInput {clip:TextClip;path:string;x:number;y:number;width:number;height:number}
export interface MusicInput {clip:AudioClip;path:string;source:CompositionInput}
export interface TrackInputs {text:TextInput[];audio:MusicInput[]}
const n=(value:number)=>String(Number(value.toFixed(6)));
export function compositionArgs(raw:Composition,main:CompositionInput,secondary:CompositionInput|undefined,image:boolean,input='/source/input',layer='/overlay/input',maxBytes=128*1048576,extra:TrackInputs={text:[],audio:[]}):string[]{
 const c=parseComposition(raw),duration=c.trimEnd-c.trimStart,active=c.overlayEnd-c.overlayStart,g=geometry(c);
 if(c.trimEnd>main.duration+.001||(!image&&(!secondary||c.secondaryStart+active>secondary.duration+.001)))throw Error('Selected composition range exceeds local source duration');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>512*1048576)throw Error('Invalid composition output memory budget');
 if((c.audio==='secondary'||c.audio==='mix')&&(image||!secondary?.hasAudio))throw Error('The secondary layer has no selectable audio. Choose main audio or mute all.');
 const seek=(source:CompositionInput,start:number,path:string,length:number)=>['-seek_timestamp','1','-ss',n(start+(source.timelineStart??0)),'-t',n(length),...(source.videoDecoder?['-c:v',source.videoDecoder]:[]),...(source.audioDecoder?['-c:a',source.audioDecoder]:[]),'-i',path];
 const args=['-hide_banner',...seek(main,c.trimStart,input,duration),...(image?['-loop','1','-framerate',String(c.fps),'-t',n(active),'-i',layer]:seek(secondary!,c.secondaryStart,layer,active))];
 if((c.tracks?.text.length??0)!==extra.text.length||(c.tracks?.audio.length??0)!==extra.audio.length)throw Error('Reconnect all timed tracks before rendering');
 for(const text of extra.text)args.push('-loop','1','-framerate',String(c.fps),'-t',n(text.clip.end-text.clip.start),'-i',text.path);
 for(const music of extra.audio){if(music.clip.sourceStart+music.clip.end-music.clip.start>music.source.duration+.001)throw Error('Music selection exceeds local audio duration');args.push('-ss',n(music.clip.sourceStart),'-t',n(music.clip.end-music.clip.start),...(music.source.audioDecoder?['-c:a',music.source.audioDecoder]:[]),'-i',music.path);}
 const filters:string[]=[];
 const fit=(source:string,r:typeof g.main,mode:'cover'|'contain',x:number,y:number,output:string,offset=0,opacity=1)=>{
  filters.push(`[${source}]setpts=PTS-STARTPTS,fps=${c.fps},scale=${r.w}:${r.h}:force_original_aspect_ratio=${mode==='cover'?'increase':'decrease'}:force_divisible_by=2,setsar=1,${mode==='cover'?`crop=${r.w}:${r.h}:(iw-${r.w})*${n(x)}:(ih-${r.h})*${n(y)}`:`pad=${r.w}:${r.h}:(ow-iw)/2:(oh-ih)/2:color=black`},format=rgba,colorchannelmixer=aa=${n(opacity)},setpts=PTS+${n(offset)}/TB[${output}]`);
 };
 fit('0:v:0',g.main,c.mainFit,c.mainCropX,c.mainCropY,'main');
 fit('1:v:0',g.overlay,c.overlayFit,c.cropX,c.cropY,'layer',c.overlayStart,c.opacity);
 filters.push(`color=c=black:s=${g.w}x${g.h}:r=${c.fps}:d=${n(duration)},format=rgba[canvas]`);
 filters.push(`[canvas][main]overlay=x=${g.main.x}:y=${g.main.y}:eof_action=pass:repeatlast=0:format=auto[base]`);
 filters.push(`[base][layer]overlay=x=${g.overlay.x}:y=${g.overlay.y}:eof_action=pass:repeatlast=0:format=auto:enable='gte(t,${n(c.overlayStart)})*lt(t,${n(c.overlayEnd)})'[composed]`);
 let previous='composed';
 for(const [i,text] of extra.text.entries()){
  if(!Number.isFinite(text.x)||!Number.isFinite(text.y)||text.x<0||text.y<0||text.x+text.width>g.w||text.y+text.height>g.h)throw Error('Invalid rasterized text geometry');
  filters.push(`[${2+i}:v:0]setpts=PTS-STARTPTS+${n(text.clip.start)}/TB,format=rgba[text${i}]`);
  filters.push(`[${previous}][text${i}]overlay=x=${text.x}:y=${text.y}:eof_action=pass:repeatlast=0:format=auto:enable='gte(t,${n(text.clip.start)})*lt(t,${n(text.clip.end)})'[textout${i}]`);previous='textout'+i;
 }
 filters.push(`[${previous}]format=yuv420p[vout]`);
 const audio:string[]=[];
 const addAudio=(index:number,source:CompositionInput,start:number,offset:number,length:number,volume:number)=>{
  const delay=offset+Math.max(0,(source.audioTimelineStart??source.timelineStart??0)-((source.timelineStart??0)+start));
  const tag='audio'+index;
  filters.push(`[${index}:a:0]asetpts=PTS-STARTPTS,atrim=duration=${n(length)},volume=${n(volume)},adelay=${Math.round(delay*1000)}:all=1,apad,atrim=duration=${n(duration)}[${tag}]`);audio.push(tag);
 };
 if((c.audio==='main'||c.audio==='mix')&&main.hasAudio&&!c.tracks?.muteMain)addAudio(0,main,c.trimStart,0,duration,c.mainVolume);
 if((c.audio==='secondary'||c.audio==='mix')&&secondary?.hasAudio&&!c.tracks?.muteSecondary)addAudio(1,secondary,c.secondaryStart,c.overlayStart,active,c.secondaryVolume);
 for(const [i,music]of extra.audio.entries())if(!music.clip.muted)addAudio(2+extra.text.length+i,music.source,music.clip.sourceStart,music.clip.start,music.clip.end-music.clip.start,music.clip.volume);
 if(audio.length)filters.push(audio.length===1?`[${audio[0]}]anull[aout]`:`${audio.map(tag=>'['+tag+']').join('')}amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.8:level=false:latency=true[aout]`);
 return [...args,'-filter_complex',filters.join(';'),'-map','[vout]',...(audio.length?['-map','[aout]','-c:a','aac','-b:a','128k']:['-an']),'-t',n(duration),'-fs',String(maxBytes),'-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-progress','pipe:1','-nostats','-y','output.mp4'];
}
