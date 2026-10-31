'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { transcribeLocalEnglish } from '@/lib/transcription/local-asr'
import { prepareSpeechAudio } from '@/lib/transcription/audio-preparation'
import { parseSubtitles, serializeSubtitles, type SubtitleSegment } from '@/lib/transcription/subtitles'
import {
  AudioLines,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileAudio,
  FileText,
  History,
  Languages,
  MoreHorizontal,
  PanelRight,
  Pause,
  Play,
  Plus,
  Redo2,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Split,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Segment = { id: number; start: string; end: string; speaker: string; text: string }

const initialSegments: Segment[] = []

const waveform = Array.from({ length: 74 }, (_, index) => 12 + ((index * 17) % 33) + (index % 4) * 7)
const captionLanguages = ["English","Igbo","Hausa","Yoruba","Nigerian Pidgin","French","Spanish","Portuguese","Arabic","Swahili","German","Italian","Dutch","Chinese (Mandarin)","Hindi","Bengali","Urdu","Russian","Japanese","Korean","Turkish","Indonesian","Vietnamese","Thai","Persian","Amharic","Zulu","Xhosa","Afrikaans","Ukrainian","Polish","Tamil","Telugu","Punjabi","Malay"]
const subtitlePresets = ['YouTube', 'TikTok', 'Interview', 'Documentary']

function SectionTitle({ icon: Icon, children }: { icon: typeof FileText; children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><Icon className="size-4" />{children}</div>
}

export function TranscriptionStudio() {
  const [segments, setSegments] = useState(initialSegments)
  const [activeId, setActiveId] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState<'transcript' | 'subtitles'>('transcript')
  const [mobilePanel, setMobilePanel] = useState<'media' | 'transcript' | 'style'>('transcript')
  const [query, setQuery] = useState('')
  const [media, setMedia] = useState<{name:string;url:string;type:string;size:number}|null>(null)
  const mediaRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const captionsRef = useRef<HTMLInputElement>(null)
  const [duration,setDuration] = useState(0)
  const [position,setPosition] = useState(0)
  const [error,setError] = useState('')
  const [audioInfo,setAudioInfo] = useState('')
  const [recognizing,setRecognizing] = useState(false)
  const [aiReview,setAiReview] = useState<'none'|'pending'|'approved'>('none')
  const [preparing,setPreparing] = useState(false)
  const [audioStage,setAudioStage] = useState('')
  const selectedFile = useRef<File|null>(null)
  const audioAbort = useRef<AbortController|null>(null)
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url) }, [media])
  const [preset, setPreset] = useState('YouTube')
  const [status, setStatus] = useState<'idle' | 'processing' | 'saved'>('idle')
  const [fontSize,setFontSize] = useState(32)
  const [captionLanguage,setCaptionLanguage] = useState('English')
  const [translationTarget,setTranslationTarget] = useState('English')
  const [draftAvailable,setDraftAvailable] = useState(false)
  useEffect(()=>{try{setDraftAvailable(Boolean(localStorage.getItem('pcgh-transcription-draft-v1')))}catch{}},[])
  function saveDraft(){try{localStorage.setItem('pcgh-transcription-draft-v1',JSON.stringify({segments,preset,fontSize,captionLanguage,translationTarget}));setDraftAvailable(true);setStatus('saved');setError('')}catch{setError('Unable to save draft on this device')}}
  function restoreDraft(){try{const raw=localStorage.getItem('pcgh-transcription-draft-v1');if(!raw)throw new Error('No local draft found');const parsed=JSON.parse(raw) as {segments:Segment[];preset?:string;fontSize?:number;captionLanguage?:string;translationTarget?:string};if(!Array.isArray(parsed.segments)||parsed.segments.some(x=>typeof x.text!=='string'||typeof x.start!=='string'||typeof x.end!=='string'||typeof x.id!=='number'))throw new Error('Saved draft is invalid');snapshot();setSegments(parsed.segments);setActiveId(parsed.segments[0]?.id??0);if(parsed.preset&&subtitlePresets.includes(parsed.preset))setPreset(parsed.preset);if(typeof parsed.fontSize==='number'&&parsed.fontSize>=14&&parsed.fontSize<=56)setFontSize(parsed.fontSize);if(parsed.captionLanguage&&captionLanguages.includes(parsed.captionLanguage))setCaptionLanguage(parsed.captionLanguage);if(parsed.translationTarget&&captionLanguages.includes(parsed.translationTarget))setTranslationTarget(parsed.translationTarget);setError('')}catch(e){setError(e instanceof Error?e.message:'Unable to restore draft')}}
  const [undoStack,setUndoStack] = useState<Segment[][]>([])
  const [redoStack,setRedoStack] = useState<Segment[][]>([])
  function snapshot() {setUndoStack(p=>[...p.slice(-29),segments.map(x=>({...x}))]);setRedoStack([])}
  function undo() {if(!undoStack.length)return;setRedoStack(p=>[...p,segments.map(x=>({...x}))]);setSegments(undoStack[undoStack.length-1]);setUndoStack(p=>p.slice(0,-1))}
  function redo() {if(!redoStack.length)return;setUndoStack(p=>[...p,segments.map(x=>({...x}))]);setSegments(redoStack[redoStack.length-1]);setRedoStack(p=>p.slice(0,-1))}

  const visibleSegments = useMemo(() => query ? segments.filter((segment) => segment.text.toLowerCase().includes(query.toLowerCase()) || segment.speaker.toLowerCase().includes(query.toLowerCase())) : segments, [query, segments])
  const activeSegment = segments.find((segment) => segment.id === activeId) ?? segments[0]
  const currentCaption = segments.find(segment => Number.isFinite(seconds(segment.start)) && seconds(segment.start) <= position && seconds(segment.end) > position && segment.text.trim())

  function updateText(id: number, text: string) {
    setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, text } : segment))
    setStatus('idle')
    if(aiReview==='approved')setAiReview('pending')
  }

  async function benchmarkAudio() {
    if(!selectedFile.current||preparing)return
    const controller=new AbortController();audioAbort.current=controller;setPreparing(true);setAudioInfo('');setError('')
    try {const started=performance.now();const audio=await Promise.race([prepareSpeechAudio(selectedFile.current,controller.signal,setAudioStage),new Promise<never>((_,reject)=>setTimeout(()=>{controller.abort();reject(new Error('Audio preparation timed out after 45 seconds. Try a short WAV or MP3 recording.'))},45000))]);setAudioInfo(`Prepared ${audio.durationSeconds.toFixed(1)}s of mono 16 kHz audio (${audio.samples.length} samples) in ${((performance.now()-started)/1000).toFixed(1)}s. No speech recognition performed.`)}
    catch(e){setError(e instanceof Error?e.message:'Audio preparation failed')}
    finally{setPreparing(false);audioAbort.current=null}
  }
  async function recognizeEnglish() {
    if(!selectedFile.current||recognizing)return
    if(captionLanguage!=='English'){setError('Experimental speech recognition currently supports English only. Other languages remain available for manual captions.');return}
    if(!window.confirm('Experimental English transcription downloads a speech model to your browser and may be slow or fail on mobile. The file stays on your device. Continue?'))return
    setRecognizing(true);setError('');setAudioInfo('Preparing audio…')
    try {
      const audio=await Promise.race([prepareSpeechAudio(selectedFile.current,undefined,setAudioInfo),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Audio decoding took over 45 seconds. Try a short WAV or MP3 audio recording.')),45000))])
      const result=await transcribeLocalEnglish(audio.samples,setAudioInfo)
      snapshot();const id=Date.now();setSegments([{id,start:formatTime(0),end:formatTime(audio.durationSeconds),speaker:'Speaker 1',text:result.text}]);setActiveId(id);setTab('transcript');setMobilePanel('transcript');setAiReview('pending')
      setAudioInfo(`Experimental English transcription completed in ${result.elapsedSeconds.toFixed(1)}s. Review and split the generated caption manually; word-level timestamps are not available.`)
    } catch(e) {setError(e instanceof Error?e.message:'Speech recognition failed')}
    finally {setRecognizing(false)}
  }
  function loadFile(file?:File) {
    if (!file) return
    if (!(file.type.startsWith('video/') || file.type.startsWith('audio/'))) {setError('Select a supported audio or video file');return}
    if (file.size > 2*1024*1024*1024) {setError('File exceeds 2 GB');return}
    audioAbort.current?.abort();selectedFile.current=file;setAiReview('none');setAudioInfo('');setError('');setMedia({name:file.name,url:URL.createObjectURL(file),type:file.type,size:file.size});setDuration(0);setPosition(0);setPlaying(false);setSegments([]);setActiveId(0)
  }
  function seconds(time:string) {const parts=time.split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:NaN}
  function addSegment() {snapshot();const start=Math.max(0,position),end=Math.min(duration||start+3,start+3);const id=Date.now();setSegments(p=>[...p,{id,start:formatTime(start),end:formatTime(Math.max(start+0.1,end)),speaker:'Speaker 1',text:''}]);setActiveId(id)}
  function formatTime(t:number) {if(!Number.isFinite(t)||t<0)t=0;return String(Math.floor(t/60)).padStart(2,'0')+':'+(t%60).toFixed(2).padStart(5,'0')}
  async function importCaptions(file?:File) {
    if(!file)return
    try {const format=file.name.toLowerCase().endsWith('.vtt')?'vtt':file.name.toLowerCase().endsWith('.srt')?'srt':null
      if(!format)throw new Error('Select an SRT or VTT subtitle file')
      if(file.size>2*1024*1024)throw new Error('Subtitle file exceeds 2 MB')
      const parsed=parseSubtitles(await file.text(),format)
      snapshot();setSegments(parsed.map((x,i)=>({id:i+1,start:formatTime(x.start),end:formatTime(x.end),speaker:'Speaker 1',text:x.text})))
      setActiveId(parsed.length?1:0);setError('')
    }catch(e){setError(e instanceof Error?e.message:'Unable to import subtitles')}
  }
  function splitActive() {
    if (!activeSegment) return
    const start=seconds(activeSegment.start),end=seconds(activeSegment.end)
    if (!Number.isFinite(start)||!Number.isFinite(end)||end-start<0.2) {setError('Caption must last at least 0.2 seconds to split');return}
    const mid=(start+end)/2
    const words=activeSegment.text.trim().split(/\s+/).filter(Boolean)
    const pivot=Math.ceil(words.length/2)
    const nextId=Math.max(0,...segments.map(x=>x.id))+1
    snapshot();setSegments(current=>current.flatMap(x=>x.id===activeId?[{...x,end:formatTime(mid),text:words.slice(0,pivot).join(' ')},{...x,id:nextId,start:formatTime(mid),text:words.slice(pivot).join(' ')}]:[x]))
    setActiveId(nextId);setError('')
  }
  function download(format:'txt'|'srt'|'vtt') {
    try {const cues:SubtitleSegment[]=segments.map(x=>({start:seconds(x.start),end:seconds(x.end),text:x.text}));const body=serializeSubtitles(cues,format);if(!body.trim()||body.trim()==='WEBVTT'){setError('Add transcript text before exporting');return}
      const blob=new Blob([body],{type:format==='vtt'?'text/vtt;charset=utf-8':'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='transcript.'+format;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setError('')
    } catch(e) {setError(e instanceof Error?e.message:'Invalid subtitle timing')}
  }
    function removeActive() {
    snapshot();setSegments((current) => current.filter((segment) => segment.id !== activeId))
    setActiveId(segments.find((segment) => segment.id !== activeId)?.id ?? 1)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><AudioLines className="size-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-bold text-slate-950 dark:text-white">Transcription Studio</h1><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Draft</span></div><p className="truncate text-xs text-slate-500">Manual caption editor • drafts saved on this device</p></div></div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={restoreDraft} disabled={!draftAvailable} title="Restore last locally saved caption draft"><History data-icon="inline-start" />Restore draft</Button><Button variant="outline" size="sm" onClick={saveDraft} title="Save captions on this device, not in the cloud"><Check data-icon="inline-start" />{status === 'saved' ? 'Saved locally' : 'Save draft'}</Button><Button size="sm" disabled={!segments.some(x=>x.text.trim())||aiReview==="pending"} onClick={()=>download("srt")}><Download data-icon="inline-start" />Export SRT</Button></div>
      </header>

      {error && <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950 md:hidden"><div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">{([['media', 'Media'], ['transcript', 'Transcript'], ['style', 'Subtitle style']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMobilePanel(value)} className={cn('rounded-lg px-2 py-2 text-xs font-semibold', mobilePanel === value ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500')}>{label}</button>)}</div></div>

      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_330px]">
        <aside className={cn('border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:border-b-0 lg:border-r', mobilePanel !== 'media' && 'hidden lg:block')}>
          <div className="flex flex-col gap-6"><SectionTitle icon={FileAudio}>Media</SectionTitle><div className="rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-4 text-center dark:border-blue-500/40 dark:bg-blue-500/10"><Upload className="mx-auto mb-2 size-7 text-blue-600" /><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Drop media here</p><p className="mt-1 text-xs text-slate-500">Audio/video playback up to 2 GB • audio preparation limited to 40 MB</p><input ref={fileRef} type="file" accept="audio/*,video/*" className="hidden" onChange={e=>loadFile(e.target.files?.[0])} /><Button variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()}><Plus data-icon="inline-start" />{media ? 'Change file' : 'Choose file'}</Button></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><FileAudio className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{media?.name ?? "No file selected"}</p><p className="text-[11px] text-slate-500">{media ? (media.size/1048576).toFixed(1)+" MB" : "Choose audio or video"}</p></div><button type="button" className="text-slate-400" aria-label="Remove media" onClick={()=>{audioAbort.current?.abort();selectedFile.current=null;setMedia(null);setAudioInfo('');setSegments([]);setDuration(0)}}><X className="size-4" /></button></div></div><div><SectionTitle icon={Languages}>Language</SectionTitle><select aria-label="Caption language" value={captionLanguage} onChange={e=>setCaptionLanguage(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">{captionLanguages.map(name=><option key={name} value={name}>{name}</option>)}</select><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Manual caption language. Experimental recognition currently supports English only.</p><label className="mt-3 block text-xs text-slate-600 dark:text-slate-300">Translation target<select aria-label="Translation target language" value={translationTarget} onChange={e=>setTranslationTarget(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">{captionLanguages.map(name=><option key={name} value={name}>{name}</option>)}</select></label><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Translation is not yet connected. Selecting a target does not translate text.</p></div><div><SectionTitle icon={UserRound}>Speakers</SectionTitle><p className="mt-3 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 dark:border-slate-600 dark:text-slate-100">Assign speakers in the Inspector</p></div><div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Transcription status</span><span className="size-2 rounded-full bg-amber-400" /></div><p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{status === 'processing' ? 'Preparing transcription…' : status === 'saved' ? 'Draft saved locally' : 'Manual editing is available. Test audio preparation below; experimental English speech recognition is available for short recordings.'}</p><Button className="mt-3 h-auto min-h-11 w-full whitespace-normal px-3 py-3 text-center leading-snug" size="sm" disabled={!media||recognizing||preparing} onClick={()=>{void recognizeEnglish()}}><WandSparkles data-icon="inline-start" />{recognizing?"Recognizing speech…":"Transcribe English audio"}</Button><p className="mt-2 text-xs leading-5 text-slate-300">Experimental • English • up to 40 MB and ~2 minutes. First use downloads an AI model.</p><Button variant="outline" size="sm" className="mt-2 w-full" disabled={!media||preparing} onClick={()=>{void benchmarkAudio()}}>{preparing?"Preparing audio…":"Check audio compatibility"}</Button>{preparing&&<button type="button" className="mt-2 text-xs text-red-600" onClick={()=>audioAbort.current?.abort()}>Cancel preparation</button>}{(preparing||recognizing)&&<p role="status" className="mt-2 text-xs text-blue-200">{preparing?audioStage:audioInfo||"Starting…"}</p>}{!preparing&&!recognizing&&audioInfo&&<p role="status" className="mt-2 text-xs text-slate-300">{audioInfo}</p>}</div></div>
        </aside>

        <section className={cn('min-w-0 bg-slate-50 p-4 dark:bg-slate-950 sm:p-6', mobilePanel !== 'transcript' && 'hidden lg:block')}>
          <div className="mx-auto flex max-w-4xl flex-col gap-5"><div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm dark:border-slate-800"><div className="flex aspect-[16/6] items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 via-blue-950 to-slate-900">{media ? <div className="relative h-full w-full"><video ref={mediaRef} src={media.url} controls playsInline className="h-full max-h-80 w-full object-contain" onLoadedMetadata={e=>setDuration(e.currentTarget.duration||0)} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} />{currentCaption && <div aria-live="off" className="pointer-events-none absolute inset-x-4 bottom-12 flex justify-center"><span className={cn("max-w-[90%] break-words rounded px-3 py-1 text-center font-bold leading-snug text-white drop-shadow-lg", preset==="TikTok" ? "bg-black/70" : preset==="Interview" ? "bg-blue-950/75" : preset==="Documentary" ? "bg-black/55" : "bg-black/60")} style={{fontSize:`${Math.max(14,Math.round(fontSize*0.65))}px`}}>{currentCaption.text}</span></div>}</div> :<div className="text-center"><button type="button" disabled className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-slate-950 transition-transform hover:scale-105" aria-label={playing ? 'Pause preview' : 'Play preview'}>{playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}</button><p className="mt-3 text-xs text-slate-300">Import media to preview playback</p></div> }</div><div className="mt-4 flex items-center gap-3"><span className="font-mono text-[11px] text-slate-400">{formatTime(position)}</span><div className="relative flex h-8 flex-1 items-center gap-0.5 overflow-hidden">{waveform.map((height, index) => <span key={index} className={cn('w-1 shrink-0 rounded-full', index < 14 ? 'bg-blue-400' : 'bg-slate-600')} style={{ height: `${height}%` }} />)}</div><span className="font-mono text-[11px] text-slate-400">{formatTime(duration)}</span></div><div className="mt-2 flex items-center justify-between text-[11px] text-slate-400"><span>Illustrative waveform (not extracted from audio)</span><span>Click a caption to seek playback</span></div></div>
            {aiReview!=='none'&&<div role="region" aria-label="AI transcript review" className="rounded-xl border-2 border-blue-500 bg-blue-950/40 p-4 text-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-lg">AI transcript ready for review</p><p className="mt-1 text-sm text-slate-200">Play the recording, correct mistakes below, then approve before exporting. Timestamps are approximate for the full recording.</p></div><span className="rounded-full bg-blue-800 px-3 py-1 text-xs">{aiReview==='approved'?'Approved':'Review required'}</span></div><textarea aria-label="Review generated transcript" className="mt-3 min-h-32 w-full rounded-lg border border-slate-500 bg-slate-900 p-3 text-base leading-relaxed text-white" value={segments.find(x=>x.id===activeId)?.text??segments[0]?.text??''} onChange={e=>{const id=segments.some(x=>x.id===activeId)?activeId:segments[0]?.id;if(id!==undefined)updateText(id,e.target.value)}}/><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>{if(mediaRef.current){mediaRef.current.currentTime=0;void mediaRef.current.play().catch(()=>{})}}}>Play from start</Button><Button size="sm" disabled={aiReview==='approved'||!segments.some(x=>x.text.trim())} onClick={()=>setAiReview('approved')}>Approve transcript</Button>{aiReview==='approved'&&<Button size="sm" variant="outline" onClick={()=>download('srt')}>Download reviewed SRT</Button>}</div></div>}
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><SectionTitle icon={FileText}>Transcript</SectionTitle><p className="mt-1 text-xs text-slate-500">Create and edit manual captions with timestamps. Automatic transcription is pending.</p></div><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" className="whitespace-nowrap" onClick={addSegment}><Plus className="size-4"/>Add caption</Button><input ref={captionsRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={e=>{void importCaptions(e.target.files?.[0]);e.target.value=""}}/><Button size="sm" variant="outline" className="whitespace-nowrap" onClick={()=>captionsRef.current?.click()}>Import SRT/VTT</Button><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white" aria-label="Undo" onClick={undo} disabled={!undoStack.length}><Undo2 className="size-4" /></button><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white" aria-label="Redo" onClick={redo} disabled={!redoStack.length}><Redo2 className="size-4" /></button></div></div>
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800"><button type="button" onClick={() => setTab('transcript')} className={cn('border-b-2 px-3 py-2 text-xs font-semibold', tab === 'transcript' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500')}>Transcript</button><button type="button" onClick={() => setTab('subtitles')} className={cn('border-b-2 px-3 py-2 text-xs font-semibold', tab === 'subtitles' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500')}>Subtitle preview</button></div>
            {tab === 'transcript' ? <div className="flex flex-col gap-2">{visibleSegments.length ? visibleSegments.map((segment) => <button type="button" key={segment.id} onClick={() => {setActiveId(segment.id);if(mediaRef.current){mediaRef.current.currentTime=seconds(segment.start)||0}}} className={cn('flex gap-3 rounded-xl border p-3 text-left transition-colors', activeId === segment.id ? 'border-blue-400 bg-blue-50/70 shadow-sm dark:border-blue-500/60 dark:bg-blue-500/10' : 'border-slate-200 bg-white hover:border-blue-200 dark:border-slate-800 dark:bg-slate-900')}><span className="shrink-0 pt-1 font-mono text-[10px] text-slate-400">{segment.start}</span><span className="min-w-0 flex-1"><span className="mb-1 flex items-center gap-2 text-[11px] font-bold text-blue-700 dark:text-blue-300"><UserRound className="size-3" />{segment.speaker}</span><span className="block text-sm leading-6 text-slate-700 dark:text-slate-200">{segment.text}</span></span><MoreHorizontal className="size-4 shrink-0 text-slate-400" /></button>) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No transcript segments yet. Add a caption to begin.</div>}</div> : <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-center text-white"><p className="mb-3 text-xs text-slate-400">Caption preview at {formatTime(position)} • {preset} preset</p><div className="flex min-h-48 items-end justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-5"><p style={{fontSize:fontSize/1.5}} className="max-w-full break-words font-bold leading-tight text-white drop-shadow-lg">{segments.find(x=>seconds(x.start)<=position&&seconds(x.end)>=position)?.text || activeSegment?.text || "Select a caption to preview"}</p></div><p className="mt-3 text-xs text-slate-400">Captions also appear over the video during playback. Exported SRT/VTT contains text and timing only.</p></div>}
          </div>
        </section>

        <aside className={cn('border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:border-t-0 lg:border-l sm:p-5', mobilePanel !== 'style' && 'hidden lg:block')}><div className="flex flex-col gap-5"><div className="flex items-center justify-between"><SectionTitle icon={Settings2}>Inspector</SectionTitle><button type="button" aria-label="Collapse inspector" className="text-slate-400"><PanelRight className="size-4" /></button></div><div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">Caption text and appearance</div><div><label htmlFor="transcript-search" className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Search transcript</label><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700"><Search className="size-4 text-slate-400" /><input id="transcript-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a phrase" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-slate-900 outline-none dark:text-slate-100" /></div></div><div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Selected segment</span><span className="font-mono text-[10px] text-slate-400">{activeSegment?.start}</span></div><label className="mt-2 block text-xs">Speaker<select aria-label="Caption speaker" onFocus={snapshot} value={activeSegment?.speaker??"Speaker 1"} onChange={e=>activeSegment&&setSegments(p=>p.map(x=>x.id===activeId?{...x,speaker:e.target.value}:x))} className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"><option>Speaker 1</option><option>Speaker 2</option><option>Speaker 3</option><option>Speaker 4</option></select></label><textarea value={activeSegment?.text ?? ''} onFocus={snapshot} onChange={(event) => activeSegment && updateText(activeSegment.id, event.target.value)} className="mt-3 min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" aria-label="Edit selected transcript segment" /><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Start<input aria-label="Caption start" onFocus={snapshot} className="w-full rounded border bg-white p-1 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" value={activeSegment?.start??""} onChange={e=>activeSegment&&setSegments(p=>p.map(x=>x.id===activeId?{...x,start:e.target.value}:x))}/></label><label className="text-xs">End<input aria-label="Caption end" onFocus={snapshot} className="w-full rounded border bg-white p-1 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" value={activeSegment?.end??""} onChange={e=>activeSegment&&setSegments(p=>p.map(x=>x.id===activeId?{...x,end:e.target.value}:x))}/></label></div><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={splitActive} disabled={!activeSegment}><Split data-icon="inline-start" />Split</Button><Button variant="outline" size="sm" onClick={removeActive} disabled={!activeSegment}><Trash2 data-icon="inline-start" />Delete</Button></div></div><div><SectionTitle icon={SlidersHorizontal}>Subtitle style</SectionTitle><div className="mt-3 grid grid-cols-2 gap-2">{subtitlePresets.map((item) => <button type="button" key={item} onClick={() => setPreset(item)} className={cn('rounded-xl border px-2 py-2.5 text-xs font-semibold', preset === item ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 text-slate-500 dark:border-slate-800')}>{item}</button>)}</div><div className="mt-3"><label className="text-xs text-slate-500">Font size<input type="range" min="14" max="56" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} className="mt-2 w-full accent-blue-600" /></label></div></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs font-semibold">Export captions</p><div className="mt-2 flex flex-col gap-2 text-xs text-slate-500"><button type="button" disabled={!segments.length} onClick={()=>{try{const content=serializeSubtitles(segments.map(x=>({start:seconds(x.start),end:seconds(x.end),text:x.text})),"txt");void navigator.clipboard.writeText(content).catch(()=>setError("Clipboard unavailable"))}catch{setError("Correct invalid timestamps before copying")}}} className="flex items-center gap-2 text-left hover:text-blue-600"><Clipboard className="size-3.5" />Copy transcript</button><div className="flex flex-wrap gap-2">{(["txt","srt","vtt"] as const).map(fmt=><button key={fmt} type="button" onClick={()=>download(fmt)} className="rounded border px-2 py-1 hover:text-blue-600">Download {fmt.toUpperCase()}</button>)}</div><button type="button" className="flex items-center gap-2 text-left hover:text-blue-600"><WandSparkles className="size-3.5" />Send subtitles to Overlay Studio</button></div></div><p className="text-[11px] leading-5 text-slate-500">Manual subtitle entry and TXT/SRT/VTT downloads are functional. Automatic transcription, burn-in rendering and cloud persistence remain pending.</p></div></aside>
      </div>
    </div>
  )
}
