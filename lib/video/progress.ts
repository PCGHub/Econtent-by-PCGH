import type { JobProgress, ProcessingProgress, ProcessingStatus } from './types'

const terminal = (status: ProcessingStatus) => ['completed', 'cancelled', 'failed'].includes(status)
const bounded = (value: number) => Math.max(0, Math.min(1, value))

/** Duration-weighted work, with no invented percentages for loading or filesystem operations. */
export class JobProgressTracker {
  private status: ProcessingStatus = 'idle'
  private message?: string
  private index = 0
  private done = 0
  private clipFraction?: number
  private stageFraction?: number
  private started: number
  private ended?: number
  private lastEvent = 0
  private samples: { at: number; work: number }[] = []
  private lastOverall = 0
  private durations: number[]
  private now: () => number
  constructor(durations: number[], now: () => number = () => performance.now()) {
    if (durations.some(duration => !Number.isFinite(duration) || duration <= 0)) throw new RangeError('Clip durations must be finite and positive')
    this.durations = [...durations]; this.now = now; this.started = now()
  }
  update(index: number, progress: ProcessingProgress): JobProgress {
    if (terminal(this.status) || index < this.index) return this.snapshot()
    if (index !== this.index) { this.clipFraction = undefined; this.samples = []; this.index = index }
    const previousStatus = this.status
    this.status = progress.status; this.message = progress.message
    if (previousStatus !== this.status) this.samples = []
    if (this.status === 'packaging') this.stageFraction = Number.isFinite(progress.fraction) && progress.fraction! >= 0 && progress.fraction! <= 1 ? progress.fraction : undefined
    else if (this.status === 'processing') {
      if (Number.isFinite(progress.fraction) && progress.fraction! >= 0 && progress.fraction! <= 1) {
        this.clipFraction = Math.max(this.clipFraction ?? 0, progress.fraction!)
        this.lastEvent = this.now()
        const work = this.completedDuration() + this.clipFraction * (this.durations[index] ?? 0)
        const previous = this.samples.at(-1)
        if (!previous || (this.lastEvent - previous.at >= 200 && work > previous.work)) this.samples.push({ at: this.lastEvent, work })
        this.samples = this.samples.slice(-16)
      } else { this.lastEvent = 0; this.samples = [] }
    }
    return this.snapshot()
  }
  finishClip(index: number): JobProgress {
    if (terminal(this.status)) return this.snapshot()
    if (index !== this.done) throw new Error('Clips must finish in sequence')
    this.done++; this.clipFraction = 1; this.samples = []
    return this.snapshot()
  }
  finish(status: 'completed' | 'failed' | 'cancelled', message?: string): JobProgress {
    if (status === 'completed' && this.durations.length && this.done !== this.durations.length) throw new Error('Cannot complete before all outputs are finalized')
    this.status = status; this.message = message; this.ended = this.now(); this.samples = []
    return this.snapshot()
  }
  private completedDuration() { return this.durations.slice(0, this.done).reduce((a, b) => a + b, 0) }
  snapshot(): JobProgress {
    const at = this.ended ?? this.now()
    const total = this.durations.reduce((a, b) => a + b, 0)
    const fresh = this.lastEvent > 0 && at - this.lastEvent < 4000
    const current = this.done > this.index ? 0 : (this.clipFraction ?? 0) * (this.durations[this.index] ?? 0)
    const measured = this.status === 'packaging' || (!total && this.stageFraction !== undefined) ? this.stageFraction ?? 0 : total ? (this.completedDuration() + current) / total : 0
    // 100% is reserved for verified output Blob(s), never FFmpeg's last progress event.
    this.lastOverall = this.status === 'completed' ? 1 : Math.max(this.lastOverall, Math.min(0.99, measured))
    let etaSeconds: number | undefined
    if (this.status === 'processing' && fresh && this.samples.length >= 6) {
      const first = this.samples[0], last = this.samples.at(-1)!
      const seconds = (last.at - first.at) / 1000
      const rates = this.samples.slice(1).map((s, i) => (s.work - this.samples[i].work) / ((s.at - this.samples[i].at) / 1000))
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length
      const deviation = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length)
      if (seconds >= 5 && mean > 0 && deviation / mean < 0.35) etaSeconds = Math.max(0, (total - last.work) / ((last.work - first.work) / seconds))
    }
    const indeterminate = !terminal(this.status) && (this.status === 'processing' ? !fresh || this.clipFraction === undefined : this.status === 'packaging' ? this.stageFraction === undefined : true)
    return { status: this.status, message: this.message, overallFraction: this.lastOverall, clipFraction: this.clipFraction,
      clipIndex: this.durations.length ? Math.min(this.index + 1, this.durations.length) : undefined,
      clipCount: this.durations.length || undefined, completedClips: this.done, elapsedSeconds: Math.max(0, (at - this.started) / 1000), etaSeconds, indeterminate,
      fraction: this.status === 'packaging' ? this.stageFraction : this.clipFraction }
  }
}

/** FFmpeg `time`/out_time_us uses microseconds. Raw progress ratios are not trim-safe. */
export function mediaFraction(timeMicroseconds: number, duration: number): number | undefined {
  if (!Number.isFinite(timeMicroseconds) || timeMicroseconds < 0 || !(duration > 0)) return undefined
  const seconds = timeMicroseconds / 1e6
  if (seconds > duration + 0.5) return undefined
  return bounded(seconds / duration)
}
