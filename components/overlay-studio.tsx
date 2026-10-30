'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Layers3,Upload,Video,Image as ImageIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CompositionPreview} from '@/components/overlay/preview';
import {DEFAULT_COMPOSITION,geometry,type Composition,type LocalMedia} from '@/lib/composition/model';
import {readLocalMedia} from '@/lib/composition/media';
import {VIDEO_FILE_ACCEPT} from '@/lib/video/types';
const inputClass='mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm';
export function OverlayStudio(){
  const [main,setMain]=useState<LocalMedia>(),[secondary,setSecondary]=useState<LocalMedia>();
  const [settings,setSettings]=useState<Composition>({...DEFAULT_COMPOSITION});
  const [error,setError]=useState(''),[importing,setImporting]=useState(false);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>{if(main)URL.revokeObjectURL(main.url);},[main]);
  useEffect(()=>()=>{if(secondary)URL.revokeObjectURL(secondary.url);},[secondary]);
  useEffect(()=>()=>abort.current?.abort(),[]);
  const update=<K extends keyof Composition>(key:K,value:Composition[K])=>setSettings(previous=>({...previous,[key]:value}));
  const upload=async(file:File,role:'main'|'secondary',kind:'video'|'image')=>{
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setImporting(true);setError('');
    try{
      const media=await readLocalMedia(file,kind,controller.signal);
      if(controller.signal.aborted){URL.revokeObjectURL(media.url);return;}
      const other=role==='main'?secondary:main;
      if(file.size+(other?.file.size??0)>256*1048576){URL.revokeObjectURL(media.url);throw Error('Combined source size exceeds the 256 MiB composition safety limit. Use smaller local files.');}
      if(role==='main'){
        setMain(media);setSettings(s=>({...s,trimStart:0,trimEnd:media.duration,overlayStart:0,overlayEnd:Math.min(media.duration,secondary?.kind==='video'?secondary.duration:media.duration),secondaryStart:0}));
      }else{
        setSecondary(media);setSettings(s=>({...s,overlayStart:0,overlayEnd:Math.min(s.trimEnd-s.trimStart||media.duration||1,kind==='video'?media.duration:31536000),secondaryStart:0}));
      }
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Import failed');}
    finally{if(abort.current===controller)setImporting(false);}
  };
  const number=(label:string,key:keyof Composition,min=0,max=31536000,step=.01)=><label className="block text-xs font-semibold text-slate-600">{label}<input className={inputClass} type="number" aria-label={label} min={min} max={max} step={step} value={settings[key] as number} onChange={e=>update(key,Number(e.target.value))}/></label>;
  const percent=(label:string,key:keyof Composition,min=0,max=1)=><label className="block text-xs font-semibold text-slate-600">{label} · {Math.round(Number(settings[key])*100)}%<input className="mt-2 w-full accent-blue-600" aria-label={label} type="range" min={min} max={max} step=".01" value={settings[key] as number} onChange={e=>{
    const value=Number(e.target.value);setSettings(s=>{const next={...s,[key]:value};if(key==='x'||key==='width'){next.x=Math.min(next.x,1-next.width);}if(key==='y'||key==='height'){next.y=Math.min(next.y,1-next.height);}return next;});
  }}/></label>;
  const mediaCard=(title:string,role:'main'|'secondary',kind:'video'|'image',Icon:typeof Video)=><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold hover:border-blue-400 hover:bg-blue-50"><Icon className="size-6 shrink-0 text-blue-600"/><span>{title}<input type="file" aria-label={title} className="mt-2 block w-full text-xs font-normal" disabled={importing} accept={kind==='image'?'.jpg,.jpeg,.png,.webp':VIDEO_FILE_ACCEPT} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file,role,kind);}}/></span><Upload className="ml-auto size-4 shrink-0 text-slate-400"/></label>;
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6"><Link href="/" className="flex items-center gap-2 font-bold"><Video className="size-9 rounded-xl bg-blue-600 p-2 text-white"/> econtent <span className="text-xs text-slate-500">by PCGH</span></Link><nav className="flex flex-wrap gap-4 text-sm font-semibold text-blue-600"><Link href="/editor">Video Cutter</Link><Link href="/projects">My projects</Link><Link href="/dashboard">Workspace</Link></nav></header>
    <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6"><h1 className="text-2xl font-bold md:text-3xl">Video Overlay Studio</h1><p className="mt-2 text-sm text-slate-500">Combine one main video and one photo or video layer. Source files stay on your device.</p>
      {error&&<p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {importing&&<div role="status" className="my-3 flex items-center justify-between rounded-lg bg-blue-50 p-3 text-sm">Reading local media… <Button variant="outline" size="sm" onClick={()=>{abort.current?.abort();setImporting(false);}}>Cancel import</Button></div>}
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-4 font-bold">Media library</h2><div className="space-y-3">{mediaCard('Upload main video','main','video',Video)}{mediaCard('Upload overlay video','secondary','video',Layers3)}{mediaCard('Upload photo','secondary','image',ImageIcon)}</div><div className="mt-4 space-y-3 break-words text-xs text-slate-600">{[main,secondary].map((media,i)=><p key={i}>{i===0?'Main':'Layer'}: {media?`${media.file.name} · ${media.width}×${media.height} · ${(media.file.size/1048576).toFixed(1)} MiB${media.kind==='video'?` · ${media.duration.toFixed(2)} s`:''}`:'Reconnect a local file'}</p>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">Only media this browser can preview is accepted here. For other formats, explicitly convert to H.264/AAC using <Link href="/editor" className="text-blue-600 underline">Video Cutter</Link>, then import the local MP4. Replacing the layer removes the previous photo/video.</p></aside>
        <CompositionPreview key={`${main?.url}-${settings.trimStart}-${settings.trimEnd}`} main={main} secondary={secondary} settings={settings}/>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-4 font-bold">Editing controls</h2><div className="space-y-4">
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
          <p className="text-xs leading-5 text-slate-500">Canvas {geometry(settings).w}×{geometry(settings).h}. Composition exports require video encoding; Fast Cut speed does not apply.</p>
        </div></aside>
      </div>
    </div>
  </main>;
}
