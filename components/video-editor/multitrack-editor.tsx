'use client'

import {useEffect,useRef,useState} from 'react'
import {FFmpegTransport} from '@/lib/video/ffmpeg-transport'
import {Film,Music,Image as ImageIcon,Plus,Scissors,Trash2,Download,ArrowLeft,ArrowRight} from 'lucide-react'

type Kind='video'|'image'|'audio'
type Clip={id:string;file:File;kind:Kind;url:string;duration:number;start:number;end:number}
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
  async function add(files:FileList|null){
    if(!files)return
    const additions:Clip[]=[]
    for(const file of Array.from(files)){
      const kind:Kind=file.type.startsWith('video/')?'video':file.type.startsWith('image/')?'image':'audio'
      if(!file.type.startsWith('video/')&&!file.type.startsWith('image/')&&!file.type.startsWith('audio/'))continue
      const url=URL.createObjectURL(file)
      const duration=await durationOf(file,kind,url)
      additions.push({id:id(),file,kind,url,duration,start:0,end:duration})
    }
    setClips(old=>[...old,...additions]);setSelected(old=>old||additions[0]?.id||null)
  }
  function change(id:string,update:Partial<Clip>){setClips(old=>old.map(c=>c.id===id?{...c,...update}:c))}
  function remove(id:string){setClips(old=>{const target=old.find(c=>c.id===id);if(target)URL.revokeObjectURL(target.url);return old.filter(c=>c.id!==id)});if(selected===id)setSelected(null)}
  function move(id:string,delta:number){setClips(old=>{const a=[...old];const i=a.findIndex(c=>c.id===id);const j=i+delta;if(i<0||j<0||j>=a.length||a[j].kind!==a[i].kind)return old;[a[i],a[j]]=[a[j],a[i]];return a})}
  function split(){if(!current||current.kind==='audio')return;const mid=(current.start+current.end)/2;if(current.end-current.start<.3)return;setClips(old=>old.flatMap(c=>c.id===current.id?[{...c,end:mid},{...c,id:id(),start:mid}]:[c]))}
  async function exportMp4(){
    if(busy||!visuals.length)return
    if(total>90){setStatus('For this first release, export projects up to 90 seconds.');return}
    if(clips.reduce((n,c)=>n+c.file.size,0)>80*1024*1024){setStatus('For this first release, keep imported media under 80 MB total.');return}
    setBusy(true);setProgress(0);setStatus('Initializing FFmpeg…')
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
      const music=audio[0]
      if(music){await ff.writeFile('music.'+(music.file.name.split('.').pop()||'mp3'),new Uint8Array(await music.file.arrayBuffer()));args.push('-stream_loop','-1','-i','music.'+(music.file.name.split('.').pop()||'mp3'))}
      const filters=visuals.map((c,i)=>`[${i}:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`)
      filters.push(visuals.map((_,i)=>`[v${i}]`).join('')+`concat=n=${visuals.length}:v=1:a=0[vout]`)
      args.push('-filter_complex',filters.join(';'),'-map','[vout]')
      if(music)args.push('-map',`${visuals.length}:a:0`,'-t',String(total),'-c:a','aac','-b:a','128k')
      else args.push('-an')
      args.push('-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','export.mp4')
      ff.on('progress',p=>setProgress(Math.min(99,Math.round((p.time/1000000)/Math.max(total,.1)*100))))
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
      <section className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3"><h2 className="mb-2 font-semibold">Preview</h2><div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black">{active?.kind==='image'?<img src={active.url} alt="Selected timeline image" className="max-h-full max-w-full object-contain"/>:active?<video key={active.id} ref={preview} src={active.url} controls className="h-full w-full object-contain"/>:<p className="text-slate-500">Your video preview appears here</p>}</div><div className="mt-3 flex items-center gap-3"><span className="text-xs">{fmt(playhead)} / {fmt(total)}</span><input aria-label="Timeline playhead" type="range" min="0" max={Math.max(total,.1)} step=".1" value={Math.min(playhead,total)} onChange={e=>setPlayhead(Number(e.target.value))} className="w-full"/></div><p className="mt-2 text-xs text-amber-300">Preview currently shows the selected timeline clip. Final MP4 combines all visual clips and the first music track.</p></section>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-3"><h2 className="mb-3 font-semibold">Clip inspector</h2>{current?<div className="space-y-3 text-sm"><p className="break-all text-slate-300">{current.file.name}</p>{(['start','end'] as const).map(k=><label key={k} className="block capitalize">{k} (seconds)<input type="number" min={k==='start'?0:current.start+.1} max={k==='end'?current.duration:current.end-.1} step=".1" value={Number(current[k].toFixed(2))} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v<=current.duration&&(k==='start'?v<current.end:v>current.start))change(current.id,{[k]:v})}} className="mt-1 w-full rounded bg-slate-800 p-2"/></label>)}<div className="flex gap-2"><button onClick={()=>move(current.id,-1)} className="rounded bg-slate-700 p-2" aria-label="Move clip left"><ArrowLeft size={17}/></button><button onClick={()=>move(current.id,1)} className="rounded bg-slate-700 p-2" aria-label="Move clip right"><ArrowRight size={17}/></button><button onClick={split} className="rounded bg-slate-700 p-2" aria-label="Split clip"><Scissors size={17}/></button><button onClick={()=>remove(current.id)} className="rounded bg-red-900 p-2" aria-label="Remove clip"><Trash2 size={17}/></button></div></div>:<p className="text-sm text-slate-400">Select a clip to trim or rearrange.</p>}<label className="mt-5 block text-sm text-slate-400">Project title (draft)<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="My video" className="mt-1 w-full rounded bg-slate-800 p-2 text-white"/></label></section>
    </div>
    <section className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><h2 className="mb-3 font-semibold">Timeline <span className="text-xs font-normal text-slate-400">Video / images play in sequence; music overlays the full sequence</span></h2>{(['video','image','audio'] as Kind[]).map(kind=><div key={kind} className="mb-2 flex min-h-16 gap-2 overflow-x-auto rounded-lg bg-slate-950 p-2"><span className="w-16 shrink-0 self-center text-xs capitalize text-slate-400">{kind}</span>{clips.filter(c=>c.kind===kind).map(c=><button key={c.id} onClick={()=>setSelected(c.id)} className={`min-w-28 max-w-56 shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${selected===c.id?'border-white':'border-transparent'} ${kind==='video'?'bg-blue-800':kind==='audio'?'bg-emerald-800':'bg-violet-800'}`}><span className="block truncate">{c.file.name}</span><span>{(c.end-c.start).toFixed(1)}s</span></button>)}</div>)}<p className="mt-2 text-xs text-slate-400">Visual order follows import order; select a clip and use arrows to rearrange clips of the same type.</p></section>
    <div aria-live="polite" className="mt-3 rounded-xl bg-slate-900 p-3 text-sm"><p>{status||'Ready to edit. This first beta supports sequence editing and one background music track.'}</p>{busy&&<div className="mt-2 h-2 overflow-hidden rounded bg-slate-700"><div className="h-full bg-blue-500" style={{width:progress+'%'}}/></div>}{download&&<a className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 font-semibold" href={download} download="econtent-video-editor.mp4">Download exported MP4</a>}</div>
  </main>
}
