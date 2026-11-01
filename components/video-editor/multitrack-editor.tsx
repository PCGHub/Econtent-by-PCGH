'use client'

import {useEffect,useRef,useState,useCallback} from 'react'
import {FFmpegTransport} from '@/lib/video/ffmpeg-transport'
import {Film,Music,Image as ImageIcon,Plus,Scissors,Trash2,Download,ArrowLeft,ArrowRight,Play,Pause,SkipBack,SkipForward,ZoomIn,ZoomOut} from 'lucide-react'

type Kind='video'|'image'|'audio'
type Clip={id:string;file:File;kind:Kind;url:string;duration:number;start:number;end:number}
const classify=(f:File):Kind|null=>{const ext=f.name.split('.').pop()?.toLowerCase()||'';if(f.type.startsWith('audio/')||/^(mp3|wav|m4a|aac|ogg|oga|flac|opus|aiff|wma)$/.test(ext))return 'audio';if(f.type.startsWith('image/')||/^(png|jpg|jpeg|webp|gif|bmp)$/.test(ext))return 'image';if(f.type.startsWith('video/')||/^(mp4|mov|mkv|webm|avi|m4v|3gp)$/.test(ext))return 'video';return null}
const fmt=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`
const id=()=>crypto.randomUUID()
async function durationOf(file:File,kind:Kind,url:string):Promise<number>{
  if(kind==='image')return 5
  return new Promise(resolve=>{const el=document.createElement(kind==='audio'?'audio':'video');const timer=setTimeout(()=>resolve(10),8000);el.preload='metadata';el.onloadedmetadata=()=>{clearTimeout(timer);resolve(Number.isFinite(el.duration)?Math.max(.1,el.duration):10)};el.onerror=()=>{clearTimeout(timer);resolve(10)};el.src=url})
}
export function MultitrackEditor(){
  const [clips,setClips]=useState<Clip[]>([])
  const [selected,setSelected]=useState<string|null>(null)
  const [title,setTitle]=useState('')
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  const [download,setDownload]=useState<string|null>(null)
  const [progress,setProgress]=useState(0)
  const [playhead,setPlayhead]=useState(0)
  const [playing,setPlaying]=useState(false)
  const [zoom,setZoom]=useState(22)
  const [videoVolume,setVideoVolume]=useState(1)
  const [musicVolume,setMusicVolume]=useState(.65)
  const [videoMuted,setVideoMuted]=useState(false)
  const [musicMuted,setMusicMuted]=useState(false)
  const audioPreview=useRef<HTMLAudioElement>(null)
  const clock=useRef(0)
  const frame=useRef<number>(0)
  const dragId=useRef<string|null>(null)
  const gesture=useRef<{kind:'seek'|'trim-start'|'trim-end';id?:string;originX:number;start:number;end:number;duration:number;zoom:number;rectLeft?:number}|null>(null)
  const [dragging,setDragging]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  const preview=useRef<HTMLVideoElement>(null)
  const worker=useRef<FFmpegTransport|null>(null)
  const clipsRef=useRef<Clip[]>([])
  useEffect(()=>{clipsRef.current=clips},[clips])
  useEffect(()=>()=>{for(const c of clipsRef.current)URL.revokeObjectURL(c.url);worker.current?.terminate()},[])
  const visuals=clips.filter(c=>c.kind!=='audio')
  const audio=clips.filter(c=>c.kind==='audio')
  const total=visuals.reduce((a,c)=>a+c.end-c.start,0)
  const current=clips.find(c=>c.id===selected)
  let elapsed=0
  const active=visuals.find(c=>{const inside=playhead>=elapsed&&playhead<elapsed+c.end-c.start;elapsed+=c.end-c.start;return inside})||visuals.at(-1)
  const activeStart=visuals.slice(0,Math.max(0,visuals.findIndex(c=>c.id===active?.id))).reduce((n,c)=>n+c.end-c.start,0)
  const localTime=active?Math.min(active.end,active.start+Math.max(0,playhead-activeStart)):0
  const music=audio[0]
  const seek=useCallback((time:number)=>{setPlayhead(Math.max(0,Math.min(total,time)))},[total])
  useEffect(()=>{if(!playing)return;clock.current=performance.now();const tick=(now:number)=>{const delta=Math.min((now-clock.current)/1000,.25);clock.current=now;setPlayhead(t=>{const next=t+delta;if(next>=total){setPlaying(false);return total}return next});frame.current=requestAnimationFrame(tick)};frame.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame.current)},[playing,total])
  useEffect(()=>{const el=preview.current;if(!el||!active||active.kind!=='video')return;el.muted=videoMuted;el.volume=videoVolume;if(Math.abs(el.currentTime-localTime)>(playing?.3:.035))el.currentTime=localTime;if(playing){void el.play().catch(()=>setPlaying(false))}else el.pause()},[active,localTime,playing,videoMuted,videoVolume])
  useEffect(()=>{const el=audioPreview.current;if(!el||!music)return;el.muted=musicMuted;el.volume=musicVolume;const time=music.start+(playhead%(Math.max(.1,music.end-music.start)));if(Math.abs(el.currentTime-time)>.3)el.currentTime=time;if(playing){void el.play().catch(()=>{})}else el.pause()},[music,playhead,playing,musicMuted,musicVolume])
  useEffect(()=>{if(playhead>total)setPlayhead(total)},[playhead,total])
  async function add(files:FileList|null){
    if(!files)return
    const additions:Clip[]=[]
    for(const file of Array.from(files)){
      const kind=classify(file)
      if(!kind){setStatus('Unsupported file: '+file.name);continue}
      const url=URL.createObjectURL(file)
      const duration=await durationOf(file,kind,url)
      additions.push({id:id(),file,kind,url,duration,start:0,end:duration})
    }
    setClips(old=>[...old,...additions]);setSelected(old=>old||additions[0]?.id||null)
  }
  function change(id:string,update:Partial<Clip>){setClips(old=>old.map(c=>c.id===id?{...c,...update}:c))}
  function remove(id:string){setPlaying(false);setClips(old=>old.filter(c=>c.id!==id));if(selected===id)setSelected(null)}
  function move(id:string,delta:number){setPlaying(false);setClips(old=>{const a=[...old];const i=a.findIndex(c=>c.id===id);const j=i+delta;if(i<0||j<0||j>=a.length||a[j].kind==='audio'&&a[i].kind!=='audio'||j>=a.length||a[i].kind==='audio'&&a[j].kind!=='audio')return old;[a[i],a[j]]=[a[j],a[i]];return a})}
  function dropOn(target:string){const source=dragId.current;dragId.current=null;if(!source||source===target)return;setPlaying(false);setClips(old=>{const a=[...old],i=a.findIndex(c=>c.id===source),j=a.findIndex(c=>c.id===target);if(i<0||j<0||a[i].kind==='audio'||a[j].kind==='audio')return old;const [clip]=a.splice(i,1);a.splice(j,0,clip);return a})}
  function dropOnAudio(){const source=dragId.current;dragId.current=null;if(!source)return;const c=clips.find(x=>x.id===source);if(c?.kind!=='audio')setStatus('Only audio files can be placed on the Music track.');else setSelected(source)}
  function startTrim(e:React.PointerEvent<HTMLSpanElement>,c:Clip,edge:'trim-start'|'trim-end'){e.preventDefault();e.stopPropagation();setPlaying(false);setSelected(c.id);gesture.current={kind:edge,id:c.id,originX:e.clientX,start:c.start,end:c.end,duration:c.duration,zoom};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true)}
  function moveTrim(e:React.PointerEvent<HTMLSpanElement>){const g=gesture.current;if(!g||g.kind==='seek')return;const delta=(e.clientX-g.originX)/g.zoom;const value=Math.round((g.kind==='trim-start'?g.start+delta:g.end+delta)*24)/24;const bounded=g.kind==='trim-start'?Math.max(0,Math.min(g.end-.125,value)):Math.max(g.start+.125,Math.min(g.duration,value));setClips(old=>old.map(c=>c.id===g.id?{...c,[g.kind==='trim-start'?'start':'end']:bounded}:c))}
  function endGesture(){gesture.current=null;setDragging(false)}
  function split(){if(!active||active.kind==='audio')return;const mid=active.start+(playhead-activeStart);if(mid<=active.start+.1||mid>=active.end-.1){setStatus('Move the playhead inside a clip to split it.');return}setPlaying(false);setClips(old=>old.flatMap(c=>c.id===active.id?[{...c,end:mid},{...c,id:id(),start:mid}]:[c]));setStatus('Split at '+fmt(playhead))}
  async function exportMp4(){
    if(busy||!visuals.length)return
    if(total>90){setStatus('For this first release, export projects up to 90 seconds.');return}
    if(clips.reduce((n,c)=>n+c.file.size,0)>80*1024*1024){setStatus('For this first release, keep imported media under 80 MB total.');return}
    setPlaying(false);setBusy(true);setProgress(0);setStatus('Initializing FFmpeg…')
    const ff=new FFmpegTransport(p=>setStatus(p.label||p.phase));worker.current=ff
    try{
      await ff.load({coreURL:'',wasmURL:''})
      const args=['-hide_banner','-y']
      for(let i=0;i<visuals.length;i++){
        const c=visuals[i];const ext=c.file.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'mp4'
        const name=`source${i}.${ext}`;setStatus(`Importing ${c.file.name}…`)
        await ff.writeFile(name,new Uint8Array(await c.file.arrayBuffer()))
        if(c.kind==='image')args.push('-loop','1','-framerate','24','-t',String(c.end-c.start),'-i',name)
        else args.push('-ss',String(c.start),'-t',String(c.end-c.start),'-i',name)
      }
      if(music&&!musicMuted&&musicVolume>0){await ff.writeFile('music.'+(music.file.name.split('.').pop()||'mp3'),new Uint8Array(await music.file.arrayBuffer()));args.push('-stream_loop','-1','-ss',String(music.start),'-i','music.'+(music.file.name.split('.').pop()||'mp3'))}
      const filters=visuals.map((c,i)=>`[${i}:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`)
      filters.push(visuals.map((_,i)=>`[v${i}]`).join('')+`concat=n=${visuals.length}:v=1:a=0[vout]`)
      args.push('-filter_complex',filters.join(';'),'-map','[vout]')
      const musicEnabled=Boolean(music&&!musicMuted&&musicVolume>0)
      const originalEnabled=visuals.length===1&&visuals[0].kind==='video'&&!videoMuted&&videoVolume>0
      if(musicEnabled&&originalEnabled){filters.push(`[0:a]volume=${videoVolume}[original]`,`[${visuals.length}:a]volume=${musicVolume}[music]`,`[original][music]amix=inputs=2:duration=longest:dropout_transition=0[aout]`);args.splice(args.indexOf('-filter_complex')+1,1,filters.join(';'));args.push('-map','[aout]','-t',String(total),'-c:a','aac','-b:a','128k')}
      else if(musicEnabled){args.push('-map',`${visuals.length}:a:0`,'-af',`volume=${musicVolume}`,'-t',String(total),'-c:a','aac','-b:a','128k')}
      else if(originalEnabled){args.push('-map','0:a:0?','-af',`volume=${videoVolume}`,'-c:a','aac','-b:a','128k')}
      else args.push('-an')
      if(visuals.length>1&&!videoMuted)setStatus('Multi-clip export currently uses music only; original clip audio mixing needs a separate rendering pass.')
      args.push('-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','export.mp4')
      ff.on('progress',(p:{progress:number;time:number})=>setProgress(Math.min(99,Math.round((p.time/1000000)/Math.max(total,.1)*100))))
      setStatus('Encoding MP4…')
      const code=await ff.exec(args)
      if(code!==0)throw Error('FFmpeg returned exit code '+code+'. Check source codecs and try shorter MP4 clips.')
      const bytes=await ff.readFile('export.mp4')
      if(typeof bytes==='string'||bytes.length<1000)throw Error('MP4 output was empty')
      if(download)URL.revokeObjectURL(download)
      setDownload(URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/mp4'})))
      setProgress(100);setStatus('MP4 export complete — ready to download.')
    }catch(error){setStatus('Export failed: '+(error instanceof Error?error.message:String(error)))}
    finally{ff.terminate();worker.current=null;setBusy(false)}
  }
  return <main className="min-h-screen bg-[#0b1220] p-3 text-slate-100 sm:p-5">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Video Editor <span className="text-sm font-normal text-blue-400">Beta</span></h1><p className="text-sm text-slate-400">Arrange video, images and music into an MP4.</p></div><div className="flex gap-2"><button className="rounded-lg bg-slate-700 px-3 py-2" onClick={()=>input.current?.click()}><Plus className="mr-1 inline size-4"/>Import media</button><button disabled={busy||!visuals.length} onClick={()=>void exportMp4()} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold disabled:opacity-40"><Download className="mr-1 inline size-4"/>Export MP4</button></div></header>
    <input ref={input} className="hidden" type="file" accept="video/*,audio/*,image/*" multiple onChange={e=>{void add(e.target.files);e.target.value=''}}/>
    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_230px]">
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-3"><h2 className="mb-3 font-semibold">Media library</h2>{clips.length===0?<p className="text-sm text-slate-400">Import videos, images or music to begin.</p>:clips.map(c=><button key={c.id} onClick={()=>setSelected(c.id)} className={`mb-2 flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs ${selected===c.id?'bg-blue-900':'bg-slate-800'}`}>{c.kind==='video'?<Film size={17}/>:c.kind==='audio'?<Music size={17}/>:<ImageIcon size={17}/>}<span className="min-w-0 flex-1 truncate">{c.file.name}</span></button>)}</section>
      <section className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3"><h2 className="mb-2 font-semibold">Preview</h2><div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black">{active?.kind==='image'?<img src={active.url} alt="Current project frame" className="max-h-full max-w-full object-contain"/>:active?<video key={active.id} ref={preview} src={active.url} playsInline preload="auto" className="h-full w-full object-contain"/>:<p className="text-slate-500">Import media to preview your project</p>}</div><audio ref={audioPreview} src={music?.url} preload="auto"/><div className="mt-3 flex flex-wrap items-center justify-center gap-3"><button aria-label="Go to start" onClick={()=>{setPlaying(false);seek(0)}} className="rounded-lg bg-slate-800 p-2"><SkipBack size={18}/></button><button aria-label={playing?'Pause project':'Play project'} disabled={!visuals.length} onClick={()=>{if(playhead>=total)seek(0);setPlaying(v=>!v)}} className="rounded-lg bg-blue-600 p-3 disabled:opacity-40">{playing?<Pause size={22}/>:<Play size={22}/>}</button><button aria-label="Next frame" onClick={()=>{setPlaying(false);seek(playhead+1/24)}} className="rounded-lg bg-slate-800 p-2"><SkipForward size={18}/></button><button onClick={split} disabled={!active} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40"><Scissors size={16}/>Split at cursor</button><span className="font-mono text-sm">{fmt(playhead)} / {fmt(total)}</span></div><input aria-label="Scrub full project timeline" type="range" min="0" max={Math.max(total,.1)} step=".04" value={Math.min(playhead,total)} onChange={e=>{setPlaying(false);seek(Number(e.target.value))}} className="mt-3 w-full accent-blue-500"/><p className="mt-2 text-xs text-slate-400">Full-project preview follows the playhead across videos and images. Background music plays alongside the sequence.</p></section>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-3"><h2 className="mb-3 font-semibold">Clip inspector</h2>{current?<div className="space-y-3 text-sm"><p className="break-all text-slate-300">{current.file.name}</p>{(['start','end'] as const).map(k=><label key={k} className="block capitalize">{k} (seconds)<input type="number" min={k==='start'?0:current.start+.1} max={k==='end'?current.duration:current.end-.1} step=".1" value={Number(current[k].toFixed(2))} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v<=current.duration&&(k==='start'?v<current.end:v>current.start))change(current.id,{[k]:v})}} className="mt-1 w-full rounded bg-slate-800 p-2"/></label>)}<div className="flex gap-2"><button onClick={()=>move(current.id,-1)} className="rounded bg-slate-700 p-2" aria-label="Move clip left"><ArrowLeft size={17}/></button><button onClick={()=>move(current.id,1)} className="rounded bg-slate-700 p-2" aria-label="Move clip right"><ArrowRight size={17}/></button><button onClick={split} className="rounded bg-slate-700 p-2" aria-label="Split clip"><Scissors size={17}/></button><button onClick={()=>remove(current.id)} className="rounded bg-red-900 p-2" aria-label="Remove clip"><Trash2 size={17}/></button></div></div>:<p className="text-sm text-slate-400">Select a clip to trim or rearrange.</p>}<div className="mt-5 space-y-3 border-t border-slate-700 pt-3 text-sm"><h3 className="font-semibold">Sound mixer</h3><label className="block">Video sound {Math.round(videoVolume*100)}%<input aria-label="Video sound volume" className="w-full" type="range" min="0" max="1" step=".05" value={videoVolume} onChange={e=>setVideoVolume(Number(e.target.value))}/></label><label className="flex gap-2"><input type="checkbox" checked={videoMuted} onChange={e=>setVideoMuted(e.target.checked)}/>Mute original video</label><label className="block">Music {Math.round(musicVolume*100)}%<input aria-label="Music volume" className="w-full" type="range" min="0" max="1" step=".05" value={musicVolume} onChange={e=>setMusicVolume(Number(e.target.value))}/></label><label className="flex gap-2"><input type="checkbox" checked={musicMuted} onChange={e=>setMusicMuted(e.target.checked)}/>Mute music</label></div><label className="mt-5 block text-sm text-slate-400">Project title (draft)<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="My video" className="mt-1 w-full rounded bg-slate-800 p-2 text-white"/></label></section>
    </div>
    <section className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Timeline <span className="text-xs font-normal text-slate-400">Drag clips to reorder; drag the ruler to seek</span></h2><div className="flex items-center gap-2"><button aria-label="Zoom out timeline" onClick={()=>setZoom(z=>Math.max(8,z-6))} className="rounded bg-slate-800 p-2"><ZoomOut size={16}/></button><span className="text-xs">{zoom}px/s</span><button aria-label="Zoom in timeline" onClick={()=>setZoom(z=>Math.min(90,z+6))} className="rounded bg-slate-800 p-2"><ZoomIn size={16}/></button></div></div><div className="overflow-x-auto"><div style={{width:Math.max(600,total*zoom+85)}} className="relative"><div className="ml-[84px] flex h-9 cursor-crosshair touch-none select-none items-end border-b border-slate-600 text-xs text-slate-400" onPointerDown={e=>{if(e.button!==0)return;setPlaying(false);const r=e.currentTarget.getBoundingClientRect();gesture.current={kind:"seek",originX:e.clientX,start:0,end:0,duration:0,zoom,rectLeft:r.left};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);seek((e.clientX-r.left)/zoom)}} onPointerMove={e=>{const g=gesture.current;if(g?.kind==="seek")seek((e.clientX-(g.rectLeft??0))/g.zoom)}} onPointerUp={endGesture} onPointerCancel={endGesture}>{Array.from({length:Math.ceil(total/5)+1},(_,i)=><span key={i} className="absolute bottom-auto border-l border-slate-500 pl-1" style={{left:84+i*5*zoom}}>{fmt(i*5)}</span>)}</div><div className="relative mt-2 flex min-h-20 items-stretch gap-0 rounded bg-slate-950"><span className="flex w-[84px] shrink-0 items-center px-2 text-xs text-slate-400">Video / Image</span>{visuals.map(c=><div key={c.id} draggable={!dragging} onDragStart={()=>dragId.current=c.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();dropOn(c.id)}} onClick={()=>setSelected(c.id)} style={{width:Math.max(24,(c.end-c.start)*zoom)}} className={`group relative flex shrink-0 cursor-grab flex-col justify-center overflow-hidden border-2 px-2 text-xs ${selected===c.id?'border-white':'border-slate-950'} ${c.kind==='video'?'bg-blue-800':'bg-violet-800'}`}><span className="truncate">{c.file.name}</span><span>{(c.end-c.start).toFixed(1)}s</span><span role="slider" aria-label={`Trim start of ${c.file.name}`} aria-valuemin={0} aria-valuemax={c.end} aria-valuenow={c.start} tabIndex={0} onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();change(c.id,{start:Math.max(0,Math.min(c.end-.125,c.start+(e.key==="ArrowRight"?.25:-.25)))})}}} onPointerDown={e=>startTrim(e,c,"trim-start")} onPointerMove={moveTrim} onPointerUp={endGesture} onPointerCancel={endGesture} className="absolute bottom-0 left-0 top-0 z-20 w-3 cursor-ew-resize touch-none rounded-l border-r-2 border-white bg-white/30" title="Drag to trim clip start"/><span role="slider" aria-label={`Trim end of ${c.file.name}`} aria-valuemin={c.start} aria-valuemax={c.duration} aria-valuenow={c.end} tabIndex={0} onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();change(c.id,{end:Math.max(c.start+.125,Math.min(c.duration,c.end+(e.key==="ArrowRight"?.25:-.25)))})}}} onPointerDown={e=>startTrim(e,c,"trim-end")} onPointerMove={moveTrim} onPointerUp={endGesture} onPointerCancel={endGesture} className="absolute bottom-0 right-0 top-0 z-20 w-3 cursor-ew-resize touch-none rounded-r border-l-2 border-white bg-white/30" title="Drag to trim clip end"/></div>)}</div><div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();dropOnAudio()}} className="mt-2 flex min-h-14 items-stretch rounded bg-slate-950"><span className="flex w-[84px] shrink-0 items-center px-2 text-xs text-slate-400">Music</span>{music&&<button onClick={()=>setSelected(music.id)} style={{width:Math.max(24,total*zoom)}} draggable onDragStart={()=>dragId.current=music.id} className="overflow-hidden rounded bg-emerald-800 px-3 text-left text-xs"><span className="block truncate">{music.file.name}</span><span>Background track</span></button>}</div><div className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-2 border-red-400" style={{left:84+Math.min(playhead,total)*zoom}}><span className="absolute -top-1 -left-[5px] h-3 w-3 rotate-45 bg-red-400"/></div></div></div><p className="mt-2 text-xs text-slate-400">Drag the ruler to scrub live. Drag either white clip edge to trim; use Split to cut at the red playhead. Drag the clip body to reorder.</p></section>
    <div aria-live="polite" className="mt-3 rounded-xl bg-slate-900 p-3 text-sm"><p>{status||'Ready to edit. This first beta supports sequence editing and one background music track.'}</p>{busy&&<div className="mt-2 h-2 overflow-hidden rounded bg-slate-700"><div className="h-full bg-blue-500" style={{width:progress+'%'}}/></div>}{download&&<a className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 font-semibold" href={download} download="econtent-video-editor.mp4">Download exported MP4</a>}</div>
  </main>
}
