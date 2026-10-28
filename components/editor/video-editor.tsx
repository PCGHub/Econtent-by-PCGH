'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type {EditorSettings,ProjectStatus} from '@/lib/projects/model'
import { BrowserVideoEngine } from '@/lib/video/ffmpeg-browser'
import { createCutPlan } from '@/lib/video/planner'
import { downloadBlob } from '@/lib/video/download'
import { zipClips } from '@/lib/video/zip'
import ProcessingStatus from './processing-status'
import { JobProgressTracker } from '@/lib/video/progress'
import { CUT_PRESETS_SECONDS } from '@/lib/video/types'
import type { CompressionPreset, CutStrategy, EditMode, ProcessedClip, JobProgress } from '@/lib/video/types'

const ClipCard = memo(function ClipCard({ clip, selected, onToggle }: { clip: ProcessedClip; selected: boolean; onToggle: (id: string) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(clip.blob)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize an external Blob URL with its lifetime.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [clip.blob])
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <label className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={() => onToggle(clip.id)} />{clip.name}</label>
    <video className="my-3 aspect-video w-full rounded-lg bg-slate-900" src={url} controls preload="metadata" aria-label={`Preview ${clip.name}`} />
    <p className="text-sm text-slate-500">Requested {clip.range.start.toFixed(3)}–{clip.range.end.toFixed(3)} seconds · {(clip.blob.size / 1048576).toFixed(2)} MB</p>
    {clip.cutStrategy === 'fast' && clip.alignedRange && <p className="mt-1 text-sm text-amber-800">Fast Cut target keyframe range {clip.alignedRange.start.toFixed(3)}–{clip.alignedRange.end.toFixed(3)} seconds. Stream-copy boundaries can include timestamp padding or extra frames.</p>}
    {clip.outputDuration !== undefined && <p className="mt-1 text-sm text-slate-500">Exported duration: {clip.outputDuration.toFixed(3)} seconds · {clip.cutStrategy === 'fast' ? 'Stream copy' : 'Precision encode'}</p>}
    <button className="mt-3 font-semibold text-blue-600" onClick={() => downloadBlob(clip.blob, clip.name)}>Download MP4</button>
  </article>
})

export interface EditorSnapshot {settings:EditorSettings;file?:File;metadata:{duration:number;width:number;height:number}}
export default function VideoEditor({initialSettings,initialSource,validateSource,onSnapshot,onStatus}:{initialSettings?:EditorSettings;initialSource?:File;validateSource?:(file:File,signal:AbortSignal)=>Promise<void>;onSnapshot?:(snapshot:EditorSnapshot)=>void;onStatus?:(status:ProjectStatus)=>void}) {
  const [source, setSource] = useState<File|undefined>(initialSource)
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState({ duration: 0, width: 0, height: 0 })
  const [mode, setMode] = useState<EditMode>(initialSettings?.mode??'manual-trim')
  const [start, setStart] = useState(initialSettings?.range.start??0)
  const [end, setEnd] = useState(initialSettings?.range.end??0)
  const [seconds, setSeconds] = useState(initialSettings?.clipDuration??30)
  const [keep, setKeep] = useState(initialSettings?.keepRemainder??true)
  const [strategy, setStrategy] = useState<CutStrategy>(initialSettings?.cutStrategy??'fast')
  const [compression, setCompression] = useState<CompressionPreset>(initialSettings?.compression??'off')
  const [clips, setClips] = useState<ProcessedClip[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const toggleSelection = useCallback((id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]), [])
  const [busy, setBusy] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<JobProgress>(() => new JobProgressTracker([]).snapshot())
  const tracker = useRef<JobProgressTracker | null>(null)
  const engine = useRef<BrowserVideoEngine | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const verifying = useRef<AbortController|null>(null)
  const [checking,setChecking]=useState(false)
  const restoreRange=useRef(!!initialSource)
  const player = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; verifying.current?.abort(); controller.current?.abort(); void engine.current?.dispose() }
  }, [])
  useEffect(() => {
    if (!source) return
    const next = URL.createObjectURL(source)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize an external Blob URL with its lifetime.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [source])

  useEffect(() => {
    if (!busy && !zipping) return
    const timer = setInterval(() => { if (tracker.current) setProgress(tracker.current.snapshot()) }, 250)
    return () => clearInterval(timer)
  }, [busy, zipping])

  async function choose(file?: File) {
    if (!file || busy || zipping || checking) return
    setError('')
    if (!file.size || (!file.type.startsWith('video/') && !/\.mp4$/i.test(file.name))) { setError('Choose a non-empty video file. H.264/AAC MP4 is the initial target.'); return }
    // Conservative safety guard, not a measured compatibility claim.
    if (file.size > 256 * 1048576) { setError('This preview limits source files to 256 MB to reduce browser memory failures.'); return }
    const abort=new AbortController();verifying.current=abort;setChecking(true)
    try{await validateSource?.(file,abort.signal);abort.signal.throwIfAborted()}catch(cause){if(mounted.current&&!abort.signal.aborted)setError(cause instanceof Error?cause.message:'Video verification failed');return}finally{if(mounted.current)setChecking(false)}
    if(!mounted.current)return
    restoreRange.current=false
    void engine.current?.dispose(); engine.current = null
    tracker.current = null; setProgress(new JobProgressTracker([]).snapshot())
    setMetadata({ duration: 0, width: 0, height: 0 }); setClips([]); setSelected([]); setSource(file); setStart(0); setEnd(0)
  }
  let plan: ReturnType<typeof createCutPlan> = []
  let planError = ''
  if (metadata.duration) {
    try { plan = createCutPlan({ mode, sourceDuration: metadata.duration, selectedRange: { start, end }, clipDuration: seconds, keepRemainder: keep }) }
    catch (cause) { planError = cause instanceof Error ? cause.message : 'Invalid settings' }
  }

  const effectiveStrategy = compression === 'off' ? strategy : 'precision'
  useEffect(()=>{onSnapshot?.({settings:{mode,range:{start,end},clipDuration:seconds,keepRemainder:keep,compression,cutStrategy:effectiveStrategy},file:source,metadata})},[mode,start,end,seconds,keep,compression,effectiveStrategy,source,metadata,onSnapshot])
  async function processVideo() {
    if (!source || !plan.length || busy || zipping || planError) return
    const abort = new AbortController()
    controller.current = abort
    const worker = engine.current ?? new BrowserVideoEngine()
    engine.current = worker
    const job = new JobProgressTracker(plan.map(clip => clip.duration))
    tracker.current = job
    let currentClip = 0
    const publish = (p: Parameters<JobProgressTracker['update']>[1]) => {
      if (mounted.current && !abort.signal.aborted) setProgress(job.update(currentClip, p))
    }
    onStatus?.('processing'); setBusy(true); setError(''); setClips([]); setSelected([])
    setProgress(job.update(0, { status: 'preparing', message: 'Starting video job…' }))
    try {
      await worker.initialize(publish, abort.signal)
      let outputBytes = 0
      for (const [index, range] of plan.entries()) {
        currentClip = index
        abort.signal.throwIfAborted()
        publish({ status: 'preparing', message: `Preparing clip ${index + 1} of ${plan.length}…` })
        const clip = await worker.process(source, { range, compression, cutStrategy: effectiveStrategy, outputName: `econtent-${String(range.index).padStart(3, '0')}.mp4` }, abort.signal)
        outputBytes += clip.blob.size
        if (outputBytes > 512 * 1048576) throw new Error('Output memory safety limit reached. Export fewer clips per job.')
        if (mounted.current) { setClips(previous => [...previous, clip]); setSelected(previous => [...previous, clip.id]); setProgress(job.finishClip(index)) }
      }
      if (mounted.current) {setProgress(job.finish('completed', 'MP4 exports ready. Preview before downloading.'));onStatus?.('completed')}
    } catch (cause) {
      await worker.dispose(); if (engine.current === worker) engine.current = null
      if (mounted.current) {
        setProgress(job.finish(abort.signal.aborted ? 'cancelled' : 'failed', abort.signal.aborted ? 'Processing cancelled. Completed clips are still available.' : 'Video processing failed.'))
        onStatus?.(abort.signal.aborted?'cancelled':'failed')
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Processing failed. Try a smaller H.264/AAC MP4 file.')
      }
    } finally { if (mounted.current) setBusy(false) }
  }
  async function downloadZip(all: boolean) {
    if (busy || zipping) return
    const abort = new AbortController(); controller.current = abort
    const job = new JobProgressTracker([]); tracker.current = job
    setZipping(true); setError(''); setProgress(job.update(0, { status: 'packaging', message: 'Preparing ZIP…' }))
    try {
      const blob = await zipClips(all ? clips : clips.filter(clip => selected.includes(clip.id)), fraction => {
        if (mounted.current && !abort.signal.aborted) setProgress(job.update(0, { status: 'packaging', fraction, message: 'Packaging selected MP4 files…' }))
      }, abort.signal)
      abort.signal.throwIfAborted()
      downloadBlob(blob, 'econtent-clips.zip')
      if (mounted.current) setProgress(job.finish('completed', 'ZIP download ready.'))
    } catch (cause) {
      if (mounted.current) {
        setProgress(job.finish(abort.signal.aborted ? 'cancelled' : 'failed', abort.signal.aborted ? 'ZIP packaging cancelled.' : 'ZIP packaging failed.'))
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'ZIP creation failed. Download individual clips instead.')
      }
    } finally { if (mounted.current) setZipping(false) }
  }
  const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 disabled:opacity-50'
  const action = 'rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50'
  return <section className="mx-auto max-w-6xl space-y-6 px-5 py-8 text-slate-900">
    <div><h1 className="text-3xl font-bold">Your local video workspace</h1><p className="mt-2 text-slate-500">Cut, compress, preview and download. Video files stay on your device. No watermark.</p></div>
    <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void choose(event.dataTransfer.files[0]) }} className="block cursor-pointer rounded-2xl border-2 border-dashed border-blue-200 bg-white p-6 focus-within:ring-2 focus-within:ring-blue-500">
      <span className="font-semibold text-blue-600">Choose or drop a video</span><input aria-label="Choose video" className="mt-3 block w-full" type="file" accept="video/*,.mp4" disabled={busy || zipping || checking} onChange={event => {const file=event.target.files?.[0];event.target.value="";void choose(file)}} />
      <p className="mt-2 text-sm text-slate-500">Initial target: H.264/AAC MP4. 256 MB safety cap; actual capacity depends on your device. Other formats may fail to preview or encode.</p>
    </label>
    {checking&&<div role="status" className="flex flex-wrap gap-4 rounded-xl bg-blue-50 p-4 text-sm"><span>Verifying video identity locally…</span><button onClick={()=>verifying.current?.abort()} className="font-semibold text-blue-700">Cancel verification</button></div>}
    <ProcessingStatus progress={progress} active={busy || zipping} onCancel={() => controller.current?.abort()} />
    {source && <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 break-all font-semibold">{source.name}</h2>
      <video ref={player} src={url} className="aspect-video w-full rounded-xl bg-slate-900" controls preload="metadata" aria-label="Original video" onLoadedMetadata={event => {
        const video = event.currentTarget
        if (!Number.isFinite(video.duration) || video.duration <= 0) { setError('Cannot read a valid video duration'); return }
        setMetadata({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); if(!restoreRange.current)setEnd(video.duration)
      }} onError={() => { setMetadata({ duration: 0, width: 0, height: 0 }); setError('Your browser cannot preview this video. Try an H.264/AAC MP4.') }} />
      <p className="mt-3 text-sm text-slate-500">{(source.size / 1048576).toFixed(2)} MB · {metadata.duration.toFixed(3)} seconds · {metadata.width}×{metadata.height}</p>
      <p className="mt-3 text-sm text-slate-500">Fast Cut copies compatible H.264/AAC MP4 streams without re-encoding. Precision Cut uses CRF 18 with compression Off, or CRF 20/25/30 with compression selected. Precision audio is AAC 128 kbps. Output size may increase.</p>
    </div><fieldset disabled={busy || zipping} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><legend className="font-bold">Edit settings</legend>
      <label className="block">Mode<select aria-label="Mode" className={field} value={mode} onChange={event => setMode(event.target.value as EditMode)}><option value="manual-trim">Manual trim</option><option value="full-split">Split entire video</option><option value="section-split">Split selected section</option><option value="compress-only">Whole video / compression only</option></select></label>
      {(mode === 'manual-trim' || mode === 'section-split') && <div className="grid grid-cols-2 gap-3"><label>Start (seconds)<input className={field} type="number" min="0" step="0.001" value={Number.isFinite(start) ? start : ''} onChange={event => setStart(event.target.valueAsNumber)} /><button type="button" className="mt-1 text-sm text-blue-600" onClick={() => setStart(player.current?.currentTime ?? 0)}>Use playhead as start</button></label><label>End (seconds)<input className={field} type="number" min="0" max={metadata.duration} step="0.001" value={Number.isFinite(end) ? end : ''} onChange={event => setEnd(event.target.valueAsNumber)} /><button type="button" className="mt-1 text-sm text-blue-600" onClick={() => setEnd(player.current?.currentTime ?? metadata.duration)}>Use playhead as end</button></label></div>}
      {(mode === 'full-split' || mode === 'section-split') && <><label className="block">Clip length (seconds)<input className={field} type="number" min="0.001" step="0.001" list="durations" value={Number.isFinite(seconds) ? seconds : ''} onChange={event => setSeconds(event.target.valueAsNumber)} /><datalist id="durations">{CUT_PRESETS_SECONDS.map(value => <option key={value} value={value} />)}</datalist></label><label className="flex items-center gap-2"><input type="checkbox" checked={keep} onChange={event => setKeep(event.target.checked)} />Keep final shorter clip</label></>}
      <label className="block">Cut method<select aria-label="Cut method" className={field} value={effectiveStrategy} disabled={compression !== 'off'} onChange={event => setStrategy(event.target.value as CutStrategy)}><option value="fast">Fast Cut — stream copy</option><option value="precision">Precision Cut — accurate boundaries</option></select></label>
      <p className="text-sm text-slate-500">{compression !== 'off' ? 'Compression uses Precision Cut. Choose Off to enable Fast Cut.' : effectiveStrategy === 'fast' ? 'Fast Cut snaps boundaries to preceding source keyframes. Results may include earlier footage or end earlier than requested; very short ranges may require Precision Cut. Exported ranges are shown below.' : 'Precision Cut re-encodes for frame-accurate boundaries and takes longer. Off prioritizes quality, but is not lossless.'}</p>
      <label className="block">Compression<select aria-label="Compression" className={field} value={compression} onChange={event => setCompression(event.target.value as CompressionPreset)}><option value="off">Off — prioritize quality</option><option value="high">High quality</option><option value="balanced">Balanced</option><option value="small">Smaller file</option></select></label>
      <p className="text-sm text-slate-500">{planError || `${plan.length} clip(s) planned`}{metadata.duration > 0 && !planError && !plan.length ? '. Enable Keep or reduce the clip length.' : ''}</p>
      <button type="button" className={action} disabled={!plan.length || !!planError || !metadata.duration} onClick={() => void processVideo()}>Process video</button>
    </fieldset></div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {!!clips.length && <section className="space-y-4"><h2 className="text-xl font-bold">Processed clips</h2><div className="flex flex-wrap gap-3"><button className={action} disabled={busy || zipping || !selected.length} onClick={() => void downloadZip(false)}>Download selected ZIP ({selected.length})</button><button className={action} disabled={busy || zipping} onClick={() => void downloadZip(true)}>Download all ZIP</button><button disabled={busy || zipping} className="text-blue-600" onClick={() => { setClips([]); setSelected([]) }}>Clear outputs</button></div><div className="grid gap-4 md:grid-cols-2">{clips.map(clip => <ClipCard key={clip.id} clip={clip} selected={selected.includes(clip.id)} onToggle={toggleSelection} />)}</div></section>}
    <p className="text-xs text-slate-500">Browser-local processing uses substantial memory and can be slow. Close other tabs and use short files for this preview. Desktop Chromium is the first verification target; mobile, Safari and Firefox are not yet verified.</p>
  </section>
}
