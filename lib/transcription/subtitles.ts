/** Pure subtitle serialization. No speech-recognition claims or network calls. */
export type SubtitleSegment = { start: number; end: number; text: string }

export function validateSubtitleSegments(segments: SubtitleSegment[]): SubtitleSegment[] {
  if (!Array.isArray(segments)) throw new Error('Invalid subtitle segments')
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  for (const segment of sorted) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) ||
        segment.start < 0 || segment.end <= segment.start ||
        typeof segment.text !== 'string') {
      throw new Error('Invalid subtitle timing or text')
    }
  }
  return sorted.filter((segment) => segment.text.trim().length > 0)
}

function timestamp(seconds: number, separator: ',' | '.'): string {
  const ms = Math.round(seconds * 1000)
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return [hours, minutes, secs].map((n) => String(n).padStart(2, '0')).join(':') +
    separator + String(millis).padStart(3, '0')
}

export function serializeSubtitles(segments: SubtitleSegment[], format: 'txt' | 'srt' | 'vtt'): string {
  const items = validateSubtitleSegments(segments)
  if (format === 'txt') return items.map((item) => item.text.trim()).join('\n')
  const cues = items.map((item, index) => {
    const start = timestamp(item.start, format === 'srt' ? ',' : '.')
    const end = timestamp(item.end, format === 'srt' ? ',' : '.')
    return (format === 'srt' ? String(index + 1) + '\n' : '') +
      start + ' --> ' + end + '\n' + item.text.trim()
  })
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.join('\n\n') + (cues.length ? '\n' : '')
}
