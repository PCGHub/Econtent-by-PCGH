'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {geometry,type Composition,type LocalMedia} from '@/lib/composition/model';
import {CropReposition} from './crop-reposition';
import {DirectBox} from './direct-box';
import {TextLayer} from './text-layer';
import type {LocalAudio} from '@/lib/composition/tracks';
import {Button} from '@/components/ui/button';
function MusicNode({id,source,nodes}:{id:string;source:LocalAudio;nodes:RefObject<Map<string,HTMLAudioElement>>}){
 const element=useRef<HTMLAudioElement>(null);
 useEffect(()=>{const node=element.current;if(!node)return;const map=nodes.current;map.set(id,node);return()=>{node.pause();node.removeAttribute('src');node.load();map.delete(id);};},[id,nodes]);
 return <audio ref={element} src={source.url} preload="metadata" aria-label={'Music preview '+id}/>;
}
export function CompositionPreview({main,secondary,settings:original,disabled=false,music=[],seekTo,onTime,onEdit}:{main?:LocalMedia;secondary?:LocalMedia;settings:Composition;disabled?:boolean;music?:LocalAudio[];seekTo?:{time:number;serial:number};onTime?:(time:number)=>void;onEdit?:(next:Composition)=>void}){
  const [draft,setDraft]=useState<Composition>();const pending=useRef<Composition|undefined>(undefined);const [selected,setSelected]=useState('');const [safe,setSafe]=useState(true);const [reposition,setReposition]=useState<'main'|'layer'|''>('');
  const settings=draft??original;
  const change=(next:Composition)=>{pending.current=next;setDraft(next);};
  const finish=(cancel:boolean)=>{if(!cancel&&pending.current)onEdit?.(pending.current);pending.current=undefined;setDraft(undefined);};
  const primary=useRef<HTMLVideoElement>(null),layer=useRef<HTMLVideoElement>(null),audioNodes=useRef(new Map<string,HTMLAudioElement>()),canvas=useRef<HTMLDivElement>(null);
  const [previewMuted,setPreviewMuted]=useState(false);const lastSeek=useRef(-1);
  useEffect(()=>{const nodes=audioNodes.current;return()=>{for(const node of nodes.values()){node.pause();node.removeAttribute('src');node.load();}};},[]);
  const [playing,setPlaying]=useState(false),[time,setTime]=useState(0),[error,setError]=useState('');
  const pauseForEdit=()=>{primary.current?.pause();layer.current?.pause();for(const node of audioNodes.current.values())node.pause();setPlaying(false);};
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
      {secondary&&secondaryVisible&&onEdit&&!reposition&&<DirectBox label="Secondary layer" box={{x:g.overlay.x/g.w,y:g.overlay.y/g.h,width:g.overlay.w/g.w,height:g.overlay.h/g.h}} selected={selected==='layer'} resizable={settings.layout==='pip'} onSelect={()=>{setSelected('layer');pauseForEdit();}} onMove={(x,y)=>{if(settings.layout==='pip')change({...settings,x:Math.max(0,Math.min(x,1-settings.width)),y:Math.max(0,Math.min(y,1-settings.height))});}} onResize={(sx,sy)=>change({...settings,width:Math.max(.05,Math.min(1-settings.x,settings.width*sx)),height:Math.max(.05,Math.min(1-settings.y,settings.height*sy))})} onFinish={finish}/>}
      {settings.tracks?.text.filter(clip=>time>=clip.start&&time<clip.end).map(clip=><TextLayer key={clip.id} clip={clip} width={g.w} height={g.h} selected={selected===clip.id} onSelect={()=>{setSelected(clip.id);pauseForEdit();}} onEdit={onEdit?patch=>change({...settings,tracks:{...settings.tracks!,text:settings.tracks!.text.map(t=>t.id===clip.id?{...t,...patch}:t)}}):undefined} onFinish={finish}/>)}
      {safe&&<div aria-label="Canvas safe area" className="pointer-events-none absolute inset-[5%] border border-dashed border-white/50"/>}
      {selected&&<><div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-blue-300/40"/><div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-blue-300/40"/></>}
      {reposition&&(reposition==='main'?settings.mainFit:settings.overlayFit)==='cover'&&((reposition==='main'&&main)||(reposition==='layer'&&secondary))&&<CropReposition role={reposition} media={(reposition==='main'?main:secondary)!} settings={settings} onChange={change} onFinish={finish} onSelect={pauseForEdit}/>}
    </div>
    {onEdit&&<div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><label><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/> Safe area (5%)</label><Button size="sm" variant="outline" onClick={()=>{setReposition('');onEdit({...original,layout:'pip'});}}>Free layer positioning</Button>{(['main','layer'] as const).map(role=><Button size="sm" variant="outline" key={role} disabled={reposition!==role&&(role==='main'?settings.mainFit:settings.overlayFit)!=='cover'} title="Choose Fill and crop to reposition the visible portion" onClick={()=>{setReposition(reposition===role?'':role);}}>{reposition===role?'Done repositioning':'Reposition '+role}</Button>)}<span>Drag text or the layer; corner handle resizes. Arrow keys nudge. Fill can crop content; Fit shows the whole frame with black bars. Reposition adjusts a Fill crop. Free positioning enables layer resizing.</span></div>}
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
