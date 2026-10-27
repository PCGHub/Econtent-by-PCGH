import type { TimeRange } from './types'

export function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite positive number`)
}

export function assertValidRange(range: TimeRange, sourceDuration: number): void {
  assertFinitePositive(sourceDuration, 'Source duration')
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new RangeError('Start and end times must be finite')
  }
  if (range.start < 0 || range.end <= range.start || range.end > sourceDuration) {
    throw new RangeError('Selected range must be within the video and have positive duration')
  }
}
