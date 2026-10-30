'use client';
import {restoreSpatial,spatialSignature} from '@/lib/composition/spatial';
import {StudioTimeline} from './overlay/timeline';
import {TrackTools} from './overlay/track-tools';
import {readLocalAudio} from '@/lib/composition/audio';
import {rasterizeText} from '@/lib/composition/text';
import {EMPTY_TRACKS,type LocalAudio} from '@/lib/composition/tracks';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Layers3,Upload,Video,Image as ImageIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CompositionPreview} from '@/components/overlay/preview';
import {DEFAULT_COMPOSITION,geometry,type Composition,type LocalMedia} from '@/lib/composition/model';
import {readLocalMedia} from '@/lib/composition/media';
import {useCompositionDraft} from '@/components/overlay/use-draft';
import {BrowserVideoEngine} from '@/lib/video/ffmpeg-browser';
import {JobProgressTracker} from '@/lib/video/progress';
import ProcessingStatus from '@/components/editor/processing-status';
import {downloadBlob} from '@/lib/video/download';
import {deviceProfile,outputBudget} from '@/lib/video/workload';
import {fingerprint} from '@/lib/projects/fingerprint';
import type {Project} from '@/lib/projects/model';
import {parseComposition} from '@/lib/composition/model';
import {VIDEO_FILE_ACCEPT} from '@/lib/video/types';
const inputClass='mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm';
export function OverlayStudio({project}:{project?:Project}){
  const [main,setMain]=useState<LocalMedia>(),[secondary,setSecondary]=useState<LocalMedia>();
  const [settings,setSettings]=useState<Composition>(project?.composition?{...project.composition.settings,...(project.studioTracks?{tracks:project.studioTracks.settings}:{})}:{...DEFAULT_COMPOSITION});
  const [past,setPast]=useState<{before:Composition;after:Composition}[]>([]),[future,setFuture]=useState<{before:Composition;after:Composition}[]>([]);
  const record=(next:Composition)=>{if(spatialSignature(next)!==spatialSignature(restoreSpatial(next,settings))){setPast(items=>[...items.slice(-39),{before:settings,after:next}]);setFuture([]);}setSettings(next);};
  const undo=()=>{const item=past.at(-1);if(!item)return;setSettings(current=>restoreSpatial(current,item.before));setPast(past.slice(0,-1));setFuture([...future,item]);};
  const redo=()=>{const item=future.at(-1);if(!item)return;setSettings(current=>restoreSpatial(current,item.after));setFuture(future.slice(0,-1));setPast([...past,item]);};
  const [music,setMusic]=useState<LocalAudio[]>([]);const musicRef=useRef<LocalAudio[]>([]),audioAbort=useRef<AbortController|null>(null);
  const [seekTo,setSeekTo]=useState<{time:number;serial:number}>();const [timelineTime,setTimelineTime]=useState(0);
  const tracks=settings.tracks??EMPTY_TRACKS;
  useEffect(()=>()=>{audioAbort.current?.abort();for(const m of musicRef.current)URL.revokeObjectURL(m.url);},[]);
  const [error,setError]=useState(''),[importing,setImporting]=useState(false);
  const [title,setTitle]=useState(project?.title??'Untitled composition');
  const [busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
  const [output,setOutput]=useState<{url:string;blob:Blob;signature:string;main:File;secondary:File;music:File[]}>();
  const [progress,setProgress]=useState(()=>new JobProgressTracker([]).snapshot());
  const engine=useRef<BrowserVideoEngine|null>(null),tracker=useRef<JobProgressTracker|null>(null),renderAbort=useRef<AbortController|null>(null);
  const jobStatus=busy?'processing':['completed','cancelled','failed'].includes(progress.status)?progress.status as 'completed'|'cancelled'|'failed':project?.status??'draft';
  const cloud=useCompositionDraft(project,main,secondary,settings,title,jobStatus,music);
  useEffect(()=>{if(!busy)return;const timer=setInterval(()=>{if(tracker.current)setProgress(tracker.current.snapshot());},250);return()=>clearInterval(timer);},[busy]);
  useEffect(()=>()=>{renderAbort.current?.abort();void engine.current?.dispose();},[]);
  useEffect(()=>()=>{if(output)URL.revokeObjectURL(output.url);},[output]);
  const imports=useRef<{main:AbortController|null;secondary:AbortController|null}>({main:null,secondary:null});
  const connected=useRef<{main?:LocalMedia;secondary?:LocalMedia}>({});
  useEffect(()=>()=>{if(main)URL.revokeObjectURL(main.url);},[main]);
  useEffect(()=>()=>{if(secondary)URL.revokeObjectURL(secondary.url);},[secondary]);
  useEffect(()=>()=>{imports.current.main?.abort();imports.current.secondary?.abort();},[]);
  const update=<K extends keyof Composition>(key:K,value:Composition[K])=>record({...settings,[key]:value});
  const updateTracks=(next:typeof tracks)=>{const ids=new Set(next.audio.map(a=>a.sourceId));const kept=musicRef.current.filter(m=>ids.has(m.id));for(const m of musicRef.current)if(!ids.has(m.id))URL.revokeObjectURL(m.url);if(kept.length!==musicRef.current.length){musicRef.current=kept;setMusic(kept);}update('tracks',next);};
  const upload=async(file:File,role:'main'|'secondary',kind:'video'|'image')=>{
    imports.current[role]?.abort();const controller=new AbortController();imports.current[role]=controller;setImporting(true);setError('');
    try{
      if(busy)throw Error('Cancel export before changing source media');
      const media=await readLocalMedia(file,kind,controller.signal);
      if(controller.signal.aborted){URL.revokeObjectURL(media.url);return;}
      const expected=role==='main'?project?.source:project?.composition?.layer;
      if(expected){
        try{if(file.size!==expected.sizeBytes||await fingerprint(file,controller.signal)!==expected.sha256||(role==='secondary'&&kind!==project!.composition!.layer.kind))throw Error('This is a different original file. Saved composition settings have not been applied to it.');}
        catch(error){URL.revokeObjectURL(media.url);throw error;}
      }
      const other=connected.current[role==='main'?'secondary':'main'];
      if(file.size+(other?.file.size??0)>256*1048576){URL.revokeObjectURL(media.url);throw Error('Combined source size exceeds the 256 MiB composition safety limit. Use smaller local files.');}
      connected.current[role]=media;
      if(role==='main'){
        setMain(media);if(!project?.composition)setSettings(s=>({...s,trimStart:0,trimEnd:media.duration,overlayStart:0,overlayEnd:Math.min(media.duration,secondary?.kind==='video'?secondary.duration:media.duration),secondaryStart:0}));
      }else{
        setSecondary(media);if(!project?.composition)setSettings(s=>({...s,overlayStart:0,overlayEnd:Math.min(s.trimEnd-s.trimStart||media.duration||1,kind==='video'?media.duration:31536000),secondaryStart:0}));
      }
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Import failed');}
    finally{if(imports.current[role]===controller){imports.current[role]=null;setImporting(!!imports.current.main||!!imports.current.secondary);}}
  };
  const uploadAudio=async(file:File,id?:string)=>{
    if(busy)return;audioAbort.current?.abort();const controller=new AbortController();audioAbort.current=controller;setImporting(true);setError('');
    try{const sourceId=id??crypto.randomUUID();const local=await readLocalAudio(file,sourceId,controller.signal);const expected=project?.studioTracks?.sources.find(s=>s.id===sourceId);if(expected&&(file.size!==expected.sizeBytes||await fingerprint(file,controller.signal)!==expected.sha256)){URL.revokeObjectURL(local.url);throw Error('This is a different music file. Reconnect the exact original.');}
      if((main?.file.size??0)+(secondary?.file.size??0)+musicRef.current.filter(m=>m.id!==sourceId).reduce((n,m)=>n+m.file.size,0)+file.size>256*1048576){URL.revokeObjectURL(local.url);throw Error('Combined local sources exceed the 256 MiB safety limit');}
      const previous=musicRef.current.find(m=>m.id===sourceId);if(previous)URL.revokeObjectURL(previous.url);musicRef.current=[...musicRef.current.filter(m=>m.id!==sourceId),local];setMusic(musicRef.current);
      if(!id)setSettings(s=>({...s,tracks:{...(s.tracks??EMPTY_TRACKS),audio:[...(s.tracks?.audio??[]),{id:crypto.randomUUID(),sourceId,start:0,end:Math.min(local.duration,s.trimEnd-s.trimStart),sourceStart:0,volume:.7,muted:false}]}}));
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Audio import failed');}finally{if(audioAbort.current===controller)setImporting(false);}
  };
  const validOutput=!!output&&output.signature===JSON.stringify(settings)&&output.main===main?.file&&output.secondary===secondary?.file&&output.music.length===music.length&&output.music.every((file,i)=>file===music[i].file);
  const exportVideo=async()=>{
    if(!main||!secondary||busy)return;
    if(validOutput)return;
    const controller=new AbortController();renderAbort.current=controller;
    const job=new JobProgressTracker([Math.max(.001,settings.trimEnd-settings.trimStart)]);tracker.current=job;
    setBusy(true);setError('');setConsent(false);setOutput(undefined);
    try{
      const parsed=parseComposition(settings);
      setProgress(job.update(0,{status:'preparing',message:'Rasterizing timed text locally…'}));const g=geometry(parsed);const text=[];for(const clip of parsed.tracks?.text??[]){controller.signal.throwIfAborted();text.push(await rasterizeText(clip,g.w,g.h));}
      const worker=engine.current??new BrowserVideoEngine();engine.current=worker;
      await worker.initialize(p=>setProgress(job.update(0,p)),controller.signal);
      const clip=await worker.compose(main.file,secondary.file,secondary.kind==='image',parsed,outputBudget(deviceProfile(navigator)),controller.signal,{text,audio:music.map(m=>({id:m.id,file:m.file}))});
      controller.signal.throwIfAborted();setOutput({url:URL.createObjectURL(clip.blob),blob:clip.blob,signature:JSON.stringify(settings),main:main.file,secondary:secondary.file,music:music.map(m=>m.file)});
      job.finishClip(0);setProgress(job.finish('completed','Verified composition MP4 ready.'));
    }catch(cause){await engine.current?.dispose();engine.current=null;setProgress(job.finish(controller.signal.aborted?'cancelled':'failed',controller.signal.aborted?'Export cancelled; partial output discarded.':'Composition export failed.'));
      if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Export failed; retry loads a fresh worker');
    }finally{setBusy(false);}
  };
  const configurationError=(()=>{if(!main||!secondary)return '';try{parseComposition(settings);if(main.file.size+secondary.file.size+music.reduce((n,m)=>n+m.file.size,0)>256*1048576)throw Error('Combined local sources exceed the 256 MiB safety limit');for(const clip of tracks.audio){const source=music.find(m=>m.id===clip.sourceId);if(!source)throw Error('Reconnect all music files before rendering.');if(clip.sourceStart+clip.end-clip.start>source.duration+.001)throw Error('A music clip extends beyond its original audio source.');}if(settings.trimEnd>main.duration+.001)throw Error('Main trim exceeds the source duration.');if(secondary.kind==='video'&&settings.secondaryStart+settings.overlayEnd-settings.overlayStart>secondary.duration+.001)throw Error('The secondary video is shorter than the selected layer interval.');if(secondary.kind==='image'&&['secondary','mix'].includes(settings.audio))throw Error('A photo has no audio. Choose main video audio or mute all.');return '';}catch(error){return error instanceof Error?error.message:'Invalid composition';}})();
  const number=(label:string,key:keyof Composition,min=0,max=31536000,step=.01)=><label className="block text-xs font-semibold text-slate-600">{label}<input className={inputClass} type="number" aria-label={label} min={min} max={max} step={step} value={settings[key] as number} onChange={e=>update(key,Number(e.target.value))}/></label>;
  const percent=(label:string,key:keyof Composition,min=0,max=1)=><label className="block text-xs font-semibold text-slate-600">{label} · {Math.round(Number(settings[key])*100)}%<input className="mt-2 w-full accent-blue-600" aria-label={label} type="range" min={min} max={max} step=".01" value={settings[key] as number} onChange={e=>{
    const value=Number(e.target.value);const next={...settings,[key]:value};if(key==='x'||key==='width'){next.x=Math.min(next.x,1-next.width);}if(key==='y'||key==='height'){next.y=Math.min(next.y,1-next.height);}record(next);
  }}/></label>;
  const mediaCard=(title:string,role:'main'|'secondary',kind:'video'|'image',Icon:typeof Video)=><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold hover:border-blue-400 hover:bg-blue-50"><Icon className="size-6 shrink-0 text-blue-600"/><span>{title}<input type="file" aria-label={title} className="mt-2 block w-full text-xs font-normal" disabled={importing||busy} accept={kind==='image'?'.jpg,.jpeg,.png,.webp':VIDEO_FILE_ACCEPT} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file,role,kind);}}/></span><Upload className="ml-auto size-4 shrink-0 text-slate-400"/></label>;
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6"><Link href="/" className="flex items-center gap-2 font-bold"><Video className="size-9 rounded-xl bg-blue-600 p-2 text-white"/> econtent <span className="text-xs text-slate-500">by PCGH</span></Link><nav className="flex flex-wrap gap-4 text-sm font-semibold text-blue-600"><Link href="/editor">Video Cutter</Link><Link href="/projects">My projects</Link><Link href="/dashboard">Workspace</Link></nav></header>
    {busy&&<Button className="fixed bottom-4 right-4 z-50 shadow-lg" onClick={()=>renderAbort.current?.abort()}>Cancel composition export</Button>}
    <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6"><h1 className="text-2xl font-bold md:text-3xl">Video Overlay Studio</h1><p className="mt-2 text-sm text-slate-500">Combine one main video and one photo or video layer. Source files stay on your device.</p>
      {configurationError&&<p role="alert" className="my-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{configurationError}</p>}
      {error&&<p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {importing&&<div role="status" className="my-3 flex items-center justify-between rounded-lg bg-blue-50 p-3 text-sm">Reading local media… <Button variant="outline" size="sm" onClick={()=>{imports.current.main?.abort();imports.current.secondary?.abort();audioAbort.current?.abort();setImporting(false);}}>Cancel import</Button></div>}
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Project title<input aria-label="Composition project title" maxLength={120} className={inputClass} value={title} onChange={e=>setTitle(e.target.value)}/></label><Button variant="outline" disabled={busy||importing||cloud.saving||cloud.account.loading||!main||!secondary} onClick={cloud.save}>Save draft</Button>{!cloud.account.user&&<Link href="/login?next=%2Foverlay-studio" className="text-sm text-blue-600">Sign in for cloud drafts</Link>}{cloud.savedId&&<Link href={'/projects/'+cloud.savedId} className="text-sm text-blue-600 underline">Open saved project</Link>}</div>
      {project?.composition&&<p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Reconnect both original local files to resume. Only metadata was saved; media and exports are not stored in your account.</p>}
      {cloud.message&&<p role="status" className="mt-2 text-sm text-slate-600">{cloud.message}</p>}{cloud.error&&<p role="alert" className="mt-2 text-sm text-red-700">{cloud.error}</p>}
      {progress.status!=='idle'&&(busy||validOutput||['failed','cancelled'].includes(progress.status))&&<div className={busy?'sticky top-2 z-30 mt-4':'mt-4'}><ProcessingStatus progress={progress} active={busy} onCancel={()=>renderAbort.current?.abort()}/></div>}
      <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" disabled={busy||!past.length} onClick={undo}>Undo layout change</Button><Button size="sm" variant="outline" disabled={busy||!future.length} onClick={redo}>Redo layout change</Button></div>
      <nav aria-label="Studio tools" className="mt-4 flex flex-wrap gap-2">{['Media','Text','Audio','Timeline','Export'].map(tab=><Button key={tab} size="sm" variant="outline" onClick={()=>document.getElementById('studio-'+tab.toLowerCase())?.scrollIntoView({behavior:'smooth',block:'start'})}>{tab}</Button>)}</nav>
      <div id="studio-media" className="mt-5 grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-4 font-bold">Media library</h2><div className="space-y-3">{mediaCard('Upload main video','main','video',Video)}{mediaCard('Upload overlay video','secondary','video',Layers3)}{mediaCard('Upload photo','secondary','image',ImageIcon)}</div><div className="mt-4 space-y-3 break-words text-xs text-slate-600">{[main,secondary].map((media,i)=><p key={i}>{i===0?'Main':'Layer'}: {media?`${media.file.name} · ${media.width}×${media.height} · ${(media.file.size/1048576).toFixed(1)} MiB${media.kind==='video'?` · ${media.duration.toFixed(2)} s`:''}`:'Reconnect a local file'}</p>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">Only media this browser can preview is accepted here. For other formats, explicitly convert to H.264/AAC using <Link href="/editor" className="text-blue-600 underline">Video Cutter</Link>, then import the local MP4. Replacing the layer removes the previous photo/video.</p></aside>
        {busy?<section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-800" aria-label="Preview paused">Live preview is paused during export to release the video decoders. Progress and Cancel remain available above.</section>:<CompositionPreview key={`${main?.url}-${settings.trimStart}-${settings.trimEnd}-${busy}`} disabled={busy} main={main} secondary={secondary} settings={settings} music={music} onEdit={record} seekTo={seekTo} onTime={setTimelineTime}/>}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-4 font-bold">Editing controls</h2><fieldset disabled={busy} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">Composition layout<select aria-label="Composition layout" className={inputClass} value={settings.layout} onChange={e=>update('layout',e.target.value as Composition['layout'])}><option value="stack">Top &amp; Bottom</option><option value="pip">Picture-in-Picture</option><option value="full">Full Overlay</option></select></label>
          <label className="block text-xs font-semibold text-slate-600">Aspect ratio<select aria-label="Aspect ratio" className={inputClass} value={settings.ratio} onChange={e=>update('ratio',e.target.value as Composition['ratio'])}>{['9:16','16:9','1:1','4:5'].map(r=><option key={r}>{r}</option>)}</select></label>
          {settings.layout==='stack'&&percent('Main height','split',.1,.9)}
          {settings.layout==='pip'&&<>{percent('Layer width','width',.05,1)}{percent('Layer height','height',.05,1)}{percent('Layer horizontal position','x')}{percent('Layer vertical position','y')}</>}
          {percent('Layer opacity','opacity')}
          {(['mainFit','overlayFit'] as const).map((key,i)=><label key={key} className="block text-xs font-semibold text-slate-600">{i?'Layer':'Main'} crop<select aria-label={i?'Layer crop':'Main crop'} className={inputClass} value={settings[key]} onChange={e=>update(key,e.target.value as 'cover'|'contain')}><option value="cover">Fill and crop</option><option value="contain">Fit with black bars</option></select></label>)}
          {settings.overlayFit==='cover'&&<>{percent('Layer crop horizontal','cropX')}{percent('Layer crop vertical','cropY')}</>}
          {settings.mainFit==='cover'&&<>{percent('Main crop horizontal','mainCropX')}{percent('Main crop vertical','mainCropY')}</>}
          <details open><summary className="text-sm font-bold">Timeline</summary><div className="mt-3 space-y-3">{number('Main trim start','trimStart')}{number('Main trim end','trimEnd')}{number('Layer appears at','overlayStart')}{number('Layer ends at / image duration end','overlayEnd')}{secondary?.kind==='video'&&number('Secondary video source start','secondaryStart')}</div></details>
          <details><summary className="text-sm font-bold">Audio</summary><label className="mt-3 block text-xs font-semibold text-slate-600">Audio source<select aria-label="Audio source" className={inputClass} value={settings.audio} onChange={e=>update('audio',e.target.value as Composition['audio'])}><option value="main">Main video</option><option value="secondary" disabled={secondary?.kind!=='video'}>Secondary video</option><option value="mix" disabled={secondary?.kind!=='video'}>Mix both (may clip at high volume)</option><option value="none">Mute all</option></select></label>{percent('Main volume','mainVolume')}{percent('Secondary volume','secondaryVolume')}</details>
          <details id="studio-export" open><summary className="text-sm font-bold">Export MP4</summary>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Output size<select aria-label="Output size" className={inputClass} value={settings.resolution} onChange={e=>update('resolution',Number(e.target.value) as 360|720)}><option value="360">360 px short edge · lighter workload</option><option value="720">720 px short edge · more encoding work</option></select></label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Output frame rate<select aria-label="Output frame rate" className={inputClass} value={settings.fps} onChange={e=>update('fps',Number(e.target.value) as 24|30)}><option value="24">24 fps</option><option value="30">30 fps</option></select></label>
            <label className="mt-3 flex gap-2 text-xs leading-5 text-slate-600"><input aria-label="Approve local composition encoding" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Encode this selected composition as H.264/AAC locally. It may be slow on mobile; no fixed completion time is promised.</label>
            <Button className="mt-3 w-full" disabled={!main||!secondary||importing||busy||(!consent&&!validOutput)||!!configurationError} onClick={()=>void exportVideo()}>{progress.status==='failed'?'Retry export with fresh worker':'Export MP4'}</Button>
            <Button className="mt-2 w-full" variant="outline" disabled={!main||!secondary||importing||busy||(!consent&&!validOutput)||!!configurationError} onClick={()=>void exportVideo()}>Render Preview</Button>
          </details>
          <p className="text-xs leading-5 text-slate-500">Canvas {geometry(settings).w}×{geometry(settings).h}. Composition exports require video encoding; Fast Cut speed does not apply.</p>
        </fieldset></aside>
      </div>
      <TrackTools tracks={tracks} duration={Math.max(0,settings.trimEnd-settings.trimStart)} music={music} onChange={updateTracks} onUpload={(file,id)=>void uploadAudio(file,id)} disabled={busy||importing} expected={(project?.studioTracks?.sources??[]).filter(s=>tracks.audio.some(a=>a.sourceId===s.id))}/>
      <div id="studio-timeline"><StudioTimeline tracks={tracks} duration={Math.max(0,settings.trimEnd-settings.trimStart)} sourceDurations={Object.fromEntries([...tracks.audio.map(a=>[a.id,music.find(m=>m.id===a.sourceId)?.duration??31536000]),...(secondary?.kind==='video'?[['layer',secondary.duration]]:[])])} overlay={{start:settings.overlayStart,end:settings.overlayEnd,...(secondary?.kind==='video'?{sourceStart:settings.secondaryStart}:{})}} onOverlay={(start,end,sourceStart)=>setSettings(s=>({...s,overlayStart:start,overlayEnd:end,...(sourceStart===undefined?{}:{secondaryStart:sourceStart})}))} onChange={updateTracks} onSeek={time=>setSeekTo({time,serial:performance.now()})} disabled={busy}/><p className="mt-2 text-xs text-slate-500">Playhead {timelineTime.toFixed(2)} s</p></div>
      {output&&<section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-bold">{validOutput?'Rendered preview ready':'Rendered preview outdated'}</h2><video aria-label="Exported composition preview" src={output.url} playsInline controls className="mt-3 max-h-[530px] w-full bg-black"/>
        {!validOutput&&<p className="mt-2 text-sm text-amber-700">Settings changed. This download is the previous render; export again to apply edits.</p>}
        <Button className="mt-3" disabled={!validOutput} onClick={()=>downloadBlob(output.blob,'econtent-composition.mp4')}>Download composition MP4</Button><p className="mt-2 text-xs text-slate-500">{(output.blob.size/1048576).toFixed(2)} MiB · H.264 video{settings.audio==='none'?'':' with selected AAC audio where present'}</p></section>}
    </div>
  </main>;
}
