'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {geometry,type Composition,type LocalMedia} from '@/lib/composition/model';
import {TextLayer} from './text-layer';
import type {LocalAudio} from '@/lib/composition/tracks';
import {Button} from '@/components/ui/button';
function MusicNode({id,source,nodes}:{id:string;source:LocalAudio;nodes:RefObject<Map<string,HTMLAudioElement>>}){
 const element=useRef<HTMLAudioElement>(null);
 useEffect(()=>{const node=element.current;if(!node)return;const map=nodes.current;map.set(id,node);return()=>{node.pause();node.removeAttribute('src');node.load();map.delete(id);};},[id,nodes]);
 return <audio ref={element} src={source.url} preload="metadata" aria-label={'Music preview '+id}/>;
}
export function CompositionPreview({main,secondary,settings,disabled=false,music=[],seekTo,onTime}:{main?:LocalMedia;secondary?:LocalMedia;settings:Composition;disabled?:boolean;music?:LocalAudio[];seekTo?:{time:number;serial:number};onTime?:(time:number)=>void}){
  const primary=useRef<HTMLVideoElement>(null),layer=useRef<HTMLVideoElement>(null),audioNodes=useRef(new Map<string,HTMLAudioElement>()),canvas=useRef<HTMLDivElement>(null);
  const [previewMuted,setPreviewMuted]=useState(false);const lastSeek=useRef(-1);
  useEffect(()=>{const nodes=audioNodes.current;return()=>{for(const node of nodes.values()){node.pause();node.removeAttribute('src');node.load();}};},[]);
  const [playing,setPlaying]=useState(false),[time,setTime]=useState(0),[error,setError]=useState('');
  const duration=Math.max(0,settings.trimEnd-settings.trimStart),g=geometry(settings);
  useEffect(()=>{const video=primary.current;return()=>{if(video){video.pause();video.removeAttribute('src');video.load();}};},[main?.url]);
  useEffect(()=>{const video=layer.current;return()=>{if(video){video.pause();video.removeAttribute('src');video.load();}};},[secondary?.url]);
  useEffect(()=>{if(primary.current)primary.current.volume=settings.mainVolume;if(layer.current)layer.current.volume=settings.secondaryVolume;},[settings.mainVolume,settings.secondaryVolume]);
  const secondaryVisible=time>=settings.overlayStart&&time<settings.overlayEnd;
  const synchronize=useCallback((at:number,play:boolean)=>{
    for(const clip of settings.tracks?.audio??[]){const node=audioNodes.current.get(clip.id),source=music.find(s=>s.id===clip.sourceId);if(!node||!source)continue;const active=at>=clip.start&&at<clip.end&&!clip.muted;const target=Math.max(0,Math.min(source.duration,clip.sourceStart+at-clip.start));node.volume=clip.volume;node.muted=previewMuted;if(Math.abs(node.currentTime-target)>.08)node.currentTime=target;if(active&&play&&node.paused)void node.play().catch(()=>{setError('Music playback was blocked; pause and retry preview.');});else if(!active||!play)node.pause();}
    const video=layer.current;if(!video||!secondary||secondary.kind!=='video')return;
    const active=at>=settings.overlayStart&&at<settings.overlayEnd;
    const target=Math.max(0,Math.min(secondary.duration,settings.secondaryStart+at-settings.overlayStart));
    if(Math.abs(video.currentTime-target)>.08)video.currentTime=target;
    if(play&&active&&video.paused)void video.play().catch(()=>{setError('The secondary video could not play. Pause and retry; this browser may not support its codec.');primary.current?.pause();setPlaying(false);});
    else if(!play||!active)video.pause();
  },[secondary,settings,music,previewMuted]);
  const seek=useCallback((at:number)=>{
    const value=Math.max(0,Math.min(at,duration));if(primary.current)primary.current.currentTime=settings.trimStart+value;
    setTime(value);onTime?.(value);synchronize(value,playing);
  },[duration,settings.trimStart,synchronize,playing,onTime]);
  useEffect(()=>{if(seekTo&&lastSeek.current!==seekTo.serial){lastSeek.current=seekTo.serial;seek(seekTo.time);}},[seekTo,seek]);
  useEffect(()=>{
    const video=primary.current;if(!video)return;
    let raf:number,last=0;
    const frame=()=>{
      const at=Math.max(0,video.currentTime-settings.trimStart);
      if(at>=duration){video.pause();layer.current?.pause();setPlaying(false);setTime(duration);return;}
      synchronize(at,!video.paused&&video.readyState>=3);
      if(performance.now()-last>80){setTime(at);onTime?.(at);last=performance.now();}
      raf=requestAnimationFrame(frame);
    };
    if(playing)raf=requestAnimationFrame(frame);
    else {video.pause();layer.current?.pause();synchronize(Math.max(0,video.currentTime-settings.trimStart),false);}
    return()=>cancelAnimationFrame(raf);
  },[playing,duration,settings.trimStart,synchronize,onTime]);
  const rect=(r:typeof g.main)=>({left:`${r.x/g.w*100}%`,top:`${r.y/g.h*100}%`,width:`${r.w/g.w*100}%`,height:`${r.h/g.h*100}%`});
  const overlayStyle={...rect(g.overlay),opacity:settings.opacity,visibility:secondaryVisible?'visible' as const:'hidden' as const};
  const play=async()=>{
    const video=primary.current;if(!video||!main)return;
    setError('');if(playing){video.pause();layer.current?.pause();setPlaying(false);return;}
    if(video.currentTime<settings.trimStart||video.currentTime>=settings.trimEnd-.02)seek(0);
    try{await video.play();synchronize(Math.max(0,video.currentTime-settings.trimStart),true);setPlaying(true);}catch{setError('This browser could not play the selected video. Try converting it in Video Cutter first.');}
  };
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Composition preview">
    <div className="mb-3 flex justify-between text-xs font-semibold text-slate-500"><span>Live composition</span><span>{g.w} × {g.h} · {settings.fps} fps export</span></div>
    <div ref={canvas} data-testid="composition-canvas" className="relative mx-auto max-h-[530px] w-full overflow-hidden rounded-xl bg-black" style={{aspectRatio:`${g.w}/${g.h}`,maxWidth:`${Math.min(700,530*g.w/g.h)}px`}}>
      {main?<div className="absolute overflow-hidden bg-black" style={rect(g.main)}><video key={main.url} ref={primary} src={main.url} playsInline preload="auto" aria-label="Main composition video" className="h-full w-full" style={{objectFit:settings.mainFit,objectPosition:`${settings.mainCropX*100}% ${settings.mainCropY*100}%`}}
        muted={previewMuted||settings.tracks?.muteMain||settings.audio==='none'||settings.audio==='secondary'} onLoadedMetadata={event=>{event.currentTarget.volume=settings.mainVolume;event.currentTarget.currentTime=settings.trimStart;setTime(0);setPlaying(false);}}
        onVolumeChange={event=>{if(event.currentTarget.volume!==settings.mainVolume)event.currentTarget.volume=settings.mainVolume;}}
        onError={()=>setError('Main video decoding failed in this browser. Convert to H.264/AAC in Video Cutter and reconnect it.')} onWaiting={()=>{layer.current?.pause();}} onEnded={()=>{setPlaying(false);layer.current?.pause();}}/></div>:<div className="absolute inset-0 flex items-center justify-center text-center text-sm text-slate-400">Upload a main video to preview</div>}
      {secondary&&<div className="absolute overflow-hidden bg-black" data-testid="preview-overlay" style={overlayStyle}>
        {secondary.kind==='image'? /* Local blob image; Next image optimization would upload the URL. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={secondary.url} alt="Photo overlay" className="h-full w-full" style={{objectFit:settings.overlayFit,objectPosition:`${settings.cropX*100}% ${settings.cropY*100}%`}}/>:
          <video key={secondary.url} ref={layer} src={secondary.url} playsInline preload="auto" aria-label="Secondary composition video" className="h-full w-full" style={{objectFit:settings.overlayFit,objectPosition:`${settings.cropX*100}% ${settings.cropY*100}%`}} muted={previewMuted||settings.tracks?.muteSecondary||settings.audio==='none'||settings.audio==='main'} onLoadedMetadata={e=>{e.currentTarget.volume=settings.secondaryVolume;synchronize(time,playing);}} onError={()=>{primary.current?.pause();setPlaying(false);setError('Secondary video decoding failed. Convert it to H.264/AAC in Video Cutter first.');}}/>}
      </div>}
      {settings.tracks?.text.filter(clip=>time>=clip.start&&time<clip.end).map(clip=><TextLayer key={clip.id} clip={clip} width={g.w} height={g.h}/>)}
    </div>
    {(settings.tracks?.audio??[]).map(clip=>{const source=music.find(s=>s.id===clip.sourceId);return source?<MusicNode key={clip.id+source.url} id={clip.id} source={source} nodes={audioNodes}/>:null;})}
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={!main||disabled} onClick={()=>seek(time-1/settings.fps)} aria-label="Previous frame">− frame</Button>
      <Button size="sm" disabled={!main||disabled} onClick={()=>void play()} aria-label={playing?'Pause preview':'Play preview'}>{playing?'Pause':'Play'}</Button>
      <Button variant="outline" size="sm" disabled={!main||disabled} onClick={()=>seek(time+1/settings.fps)} aria-label="Next frame">+ frame</Button>
      <Button variant="outline" size="sm" onClick={()=>setPreviewMuted(v=>!v)}>{previewMuted?'Unmute preview':'Mute preview'}</Button>
      <Button variant="outline" size="sm" onClick={()=>void canvas.current?.requestFullscreen().catch(()=>setError('Fullscreen is unavailable in this browser.'))}>Fullscreen preview</Button>
      <output className="text-xs tabular-nums text-slate-600" data-testid="composition-time">{time.toFixed(2)} / {duration.toFixed(2)} s</output>
    </div>
    <label className="mt-4 block text-xs font-semibold text-slate-600">Timeline position<input aria-label="Timeline position" type="range" className="mt-2 w-full accent-blue-600" min="0" max={duration||1} step="0.01" value={Math.min(time,duration)} disabled={!main||disabled} onChange={e=>seek(Number(e.target.value))}/></label>
    <p className="mt-2 text-xs text-slate-500">Main {settings.trimStart.toFixed(2)}–{settings.trimEnd.toFixed(2)} s · Layer {settings.overlayStart.toFixed(2)}–{settings.overlayEnd.toFixed(2)} s on the output timeline. Seeking follows browser frame availability.</p>
    {error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </section>;
}
