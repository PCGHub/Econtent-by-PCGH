'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserVideoEngine } from '@/lib/video/ffmpeg-browser'
import { createCutPlan } from '@/lib/video/planner'
import { downloadBlob } from '@/lib/video/download'
import { zipClips } from '@/lib/video/zip'
import { CUT_PRESETS_SECONDS } from '@/lib/video/types'
import type { CompressionPreset, EditMode, ProcessedClip, ProcessingProgress } from '@/lib/video/types'

function ClipCard({ clip, selected, onSelect }: { clip: ProcessedClip; selected: boolean; onSelect: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(clip.blob)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize an external Blob URL with its lifetime.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [clip.blob])
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <label className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={onSelect} />{clip.name}</label>
    <video className="my-3 aspect-video w-full rounded-lg bg-slate-900" src={url} controls preload="metadata" aria-label={`Preview ${clip.name}`} />
    <p className="text-sm text-slate-500">{clip.range.start.toFixed(3)}–{clip.range.end.toFixed(3)} seconds · {(clip.blob.size / 1048576).toFixed(2)} MB</p>
    <button className="mt-3 font-semibold text-blue-600" onClick={() => downloadBlob(clip.blob, clip.name)}>Download MP4</button>
  </article>
}

export default function VideoEditor() {
  const [source, setSource] = useState<File>()
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState({ duration: 0, width: 0, height: 0 })
  const [mode, setMode] = useState<EditMode>('manual-trim')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [seconds, setSeconds] = useState(30)
  const [keep, setKeep] = useState(true)
  const [compression, setCompression] = useState<CompressionPreset>('off')
  const [clips, setClips] = useState<ProcessedClip[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<ProcessingProgress>({ status: 'idle' })
  const engine = useRef<BrowserVideoEngine | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const player = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort(); void engine.current?.dispose() }
  }, [])
  useEffect(() => {
    if (!source) return
    const next = URL.createObjectURL(source)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize an external Blob URL with its lifetime.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [source])

  function choose(file?: File) {
    if (!file || busy) return
    setError('')
    if (!file.size || (!file.type.startsWith('video/') && !/\.mp4$/i.test(file.name))) { setError('Choose a non-empty video file. H.264/AAC MP4 is the initial target.'); return }
    // Conservative safety guard, not a measured compatibility claim.
    if (file.size > 256 * 1048576) { setError('This preview limits source files to 256 MB to reduce browser memory failures.'); return }
    setMetadata({ duration: 0, width: 0, height: 0 }); setClips([]); setSelected([]); setSource(file); setStart(0); setEnd(0)
  }
  let plan: ReturnType<typeof createCutPlan> = []
  let planError = ''
  if (metadata.duration) {
    try { plan = createCutPlan({ mode, sourceDuration: metadata.duration, selectedRange: { start, end }, clipDuration: seconds, keepRemainder: keep }) }
    catch (cause) { planError = cause instanceof Error ? cause.message : 'Invalid settings' }
  }

  async function process() {
    if (!source || !plan.length || busy || planError) return
    const abort = new AbortController()
    controller.current = abort
    const worker = new BrowserVideoEngine()
    engine.current = worker
    setBusy(true); setError(''); setClips([]); setSelected([])
    try {
      await worker.initialize(p => { if (mounted.current && !abort.signal.aborted) setProgress(p) })
      let outputBytes = 0
      for (const range of plan) {
        abort.signal.throwIfAborted()
        const clip = await worker.process(source, { range, compression, outputName: `econtent-${String(range.index).padStart(3, '0')}.mp4` }, abort.signal)
        outputBytes += clip.blob.size
        if (outputBytes > 512 * 1048576) throw new Error('Output memory safety limit reached. Export fewer clips per job.')
        if (mounted.current) { setClips(previous => [...previous, clip]); setSelected(previous => [...previous, clip.id]) }
      }
      if (mounted.current) setProgress({ status: 'completed', message: 'MP4 exports ready. Preview before downloading.' })
    } catch (cause) {
      if (mounted.current) {
        setProgress({ status: abort.signal.aborted ? 'cancelled' : 'failed' })
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Processing failed. Try a smaller H.264/AAC MP4 file.')
      }
    } finally {
      await worker.dispose()
      if (mounted.current) setBusy(false)
      engine.current = null
    }
  }
  async function downloadZip(all: boolean) {
    setZipping(true); setError('')
    try { downloadBlob(await zipClips(all ? clips : clips.filter(clip => selected.includes(clip.id))), 'econtent-clips.zip') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ZIP creation failed. Download individual clips instead.') }
    finally { if (mounted.current) setZipping(false) }
  }
  const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 disabled:opacity-50'
  const action = 'rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50'
  return <section className="mx-auto max-w-6xl space-y-6 px-5 py-8 text-slate-900">
    <div><h1 className="text-3xl font-bold">Your local video workspace</h1><p className="mt-2 text-slate-500">Cut, compress, preview and download. Video files stay on your device. No watermark.</p></div>
    <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(event.dataTransfer.files[0]) }} className="block cursor-pointer rounded-2xl border-2 border-dashed border-blue-200 bg-white p-6 focus-within:ring-2 focus-within:ring-blue-500">
      <span className="font-semibold text-blue-600">Choose or drop a video</span><input aria-label="Choose video" className="mt-3 block w-full" type="file" accept="video/*,.mp4" disabled={busy} onChange={event => choose(event.target.files?.[0])} />
      <p className="mt-2 text-sm text-slate-500">Initial target: H.264/AAC MP4. 256 MB safety cap; actual capacity depends on your device. Other formats may fail to preview or encode.</p>
    </label>
    {source && <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 break-all font-semibold">{source.name}</h2>
      <video ref={player} src={url} className="aspect-video w-full rounded-xl bg-slate-900" controls preload="metadata" aria-label="Original video" onLoadedMetadata={event => {
        const video = event.currentTarget
        if (!Number.isFinite(video.duration) || video.duration <= 0) { setError('Cannot read a valid video duration'); return }
        setMetadata({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); setEnd(video.duration)
      }} onError={() => { setMetadata({ duration: 0, width: 0, height: 0 }); setError('Your browser cannot preview this video. Try an H.264/AAC MP4.') }} />
      <p className="mt-3 text-sm text-slate-500">{(source.size / 1048576).toFixed(2)} MB · {metadata.duration.toFixed(3)} seconds · {metadata.width}×{metadata.height}</p>
      <p className="mt-3 text-sm text-slate-500">Accurate cuts re-encode video, including with compression Off (CRF 18). Other presets use CRF 20/25/30. Audio is AAC 128 kbps. Output may be larger than the original.</p>
    </div><fieldset disabled={busy} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><legend className="font-bold">Edit settings</legend>
      <label className="block">Mode<select className={field} value={mode} onChange={event => setMode(event.target.value as EditMode)}><option value="manual-trim">Manual trim</option><option value="full-split">Split entire video</option><option value="section-split">Split selected section</option><option value="compress-only">Whole video / compression only</option></select></label>
      {(mode === 'manual-trim' || mode === 'section-split') && <div className="grid grid-cols-2 gap-3"><label>Start (seconds)<input className={field} type="number" min="0" step="0.001" value={Number.isFinite(start) ? start : ''} onChange={event => setStart(event.target.valueAsNumber)} /><button type="button" className="mt-1 text-sm text-blue-600" onClick={() => setStart(player.current?.currentTime ?? 0)}>Use playhead as start</button></label><label>End (seconds)<input className={field} type="number" min="0" max={metadata.duration} step="0.001" value={Number.isFinite(end) ? end : ''} onChange={event => setEnd(event.target.valueAsNumber)} /><button type="button" className="mt-1 text-sm text-blue-600" onClick={() => setEnd(player.current?.currentTime ?? metadata.duration)}>Use playhead as end</button></label></div>}
      {(mode === 'full-split' || mode === 'section-split') && <><label className="block">Clip length (seconds)<input className={field} type="number" min="0.001" step="0.001" list="durations" value={Number.isFinite(seconds) ? seconds : ''} onChange={event => setSeconds(event.target.valueAsNumber)} /><datalist id="durations">{CUT_PRESETS_SECONDS.map(value => <option key={value} value={value} />)}</datalist></label><label className="flex items-center gap-2"><input type="checkbox" checked={keep} onChange={event => setKeep(event.target.checked)} />Keep final shorter clip</label></>}
      <label className="block">Compression<select className={field} value={compression} onChange={event => setCompression(event.target.value as CompressionPreset)}><option value="off">Off — prioritize quality</option><option value="high">High quality</option><option value="balanced">Balanced</option><option value="small">Smaller file</option></select></label>
      <p className="text-sm text-slate-500">{planError || `${plan.length} clip(s) planned`}{metadata.duration > 0 && !planError && !plan.length ? '. Enable Keep or reduce the clip length.' : ''}</p>
      <button type="button" className={action} disabled={!plan.length || !!planError || !metadata.duration} onClick={() => void process()}>Process video</button>
    </fieldset></div>}
    <div role="status" aria-live="polite" className="text-sm text-slate-600">{progress.message ?? progress.status}{busy && progress.fraction !== undefined && <progress aria-label="Encoding progress" className="mx-3" max={1} value={progress.fraction} />}{busy && <button className="ml-4 font-semibold text-blue-600" onClick={() => { controller.current?.abort(); void engine.current?.dispose() }}>Cancel processing</button>}</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {!!clips.length && <section className="space-y-4"><h2 className="text-xl font-bold">Processed clips</h2><div className="flex flex-wrap gap-3"><button className={action} disabled={busy || zipping || !selected.length} onClick={() => void downloadZip(false)}>Download selected ZIP ({selected.length})</button><button className={action} disabled={busy || zipping} onClick={() => void downloadZip(true)}>Download all ZIP</button><button disabled={busy || zipping} className="text-blue-600" onClick={() => { setClips([]); setSelected([]) }}>Clear outputs</button></div>{zipping && <p role="status">Preparing ZIP…</p>}<div className="grid gap-4 md:grid-cols-2">{clips.map(clip => <ClipCard key={clip.id} clip={clip} selected={selected.includes(clip.id)} onSelect={() => setSelected(previous => previous.includes(clip.id) ? previous.filter(id => id !== clip.id) : [...previous, clip.id])} />)}</div></section>}
    <p className="text-xs text-slate-500">Browser-local processing uses substantial memory and can be slow. Close other tabs and use short files for this preview. Desktop Chromium is the first verification target; mobile, Safari and Firefox are not yet verified.</p>
  </section>
}
