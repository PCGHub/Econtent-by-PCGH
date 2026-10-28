import type { CutPlanInput, PlannedClip, TimeRange } from './types'
import { assertFinitePositive, assertValidRange } from './validation'

/** Pure interval planner; does not process or export media. */
export function createCutPlan(input: CutPlanInput): PlannedClip[] {
  const { mode, sourceDuration } = input
  assertFinitePositive(sourceDuration, 'Source duration')
  const full: TimeRange = { start: 0, end: sourceDuration }
  const range = mode === 'full-split' || mode === 'compress-only' ? full : input.selectedRange
  if (!range) throw new RangeError('Selected range is required')
  assertValidRange(range, sourceDuration)

  if (mode === 'manual-trim' || mode === 'compress-only') {
    return [{ index: 1, start: range.start, end: range.end, duration: range.end - range.start }]
  }
  const step = input.clipDuration
  if (step === undefined) throw new RangeError('Clip duration is required')
  assertFinitePositive(step, 'Clip duration')
  const keep = input.keepRemainder ?? true
  const clips: PlannedClip[] = []
  // Use count-based boundaries to avoid accumulated floating-point drift.
  const length = range.end - range.start
  const fullCount = Math.floor(length / step)
  if (Math.ceil(length / step) > 500) throw new RangeError('Limit exports to 500 clips per job; increase clip duration')
  for (let i = 0; i < fullCount; i++) {
    const start = range.start + i * step
    const end = i === fullCount - 1 && Math.abs(range.end - (start + step)) < 1e-9
      ? range.end : Math.min(range.end, range.start + (i + 1) * step)
    clips.push({ index: clips.length + 1, start, end, duration: end - start })
  }
  const remainderStart = range.start + fullCount * step
  if (keep && range.end - remainderStart > 1e-9) {
    clips.push({ index: clips.length + 1, start: remainderStart, end: range.end, duration: range.end - remainderStart })
  }
  return clips
}
