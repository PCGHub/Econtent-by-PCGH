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

/** Parse common SRT/VTT cue blocks for manual correction. Reject malformed timing. */
export function parseSubtitles(input: string, format: 'srt' | 'vtt'): SubtitleSegment[] {
  const normalized = input.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').trim()
  if (format === 'vtt' && !/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(normalized)) {
    throw new Error('Missing WEBVTT header')
  }
  const body = format === 'vtt' ? normalized.replace(/^WEBVTT[^\n]*\n?/, '').trim() : normalized
  if (!body) return []
  const blocks = body.split(/\n\s*\n/)
  const result: SubtitleSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (format === 'vtt' && /^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue
    const timingIndex = lines.findIndex((line, index) => index <= 1 && line.includes(' --> '))
    if (timingIndex < 0) throw new Error('Malformed subtitle cue')
    const timing = lines[timingIndex].match(/^\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$/)
    if (!timing) throw new Error('Invalid subtitle timestamp')
    const start = parseTimestamp(timing[1])
    const end = parseTimestamp(timing[2])
    const text = lines.slice(timingIndex + 1).join('\n').trim()
    result.push({start, end, text})
  }
  return validateSubtitleSegments(result)
}

function parseTimestamp(value: string): number {
  const chunks = value.replace(',', '.').split(':')
  if (chunks.length !== 2 && chunks.length !== 3) throw new Error('Invalid timestamp')
  const seconds = Number(chunks[chunks.length - 1])
  const minutes = Number(chunks[chunks.length - 2])
  const hours = chunks.length === 3 ? Number(chunks[0]) : 0
  if (![seconds, minutes, hours].every(Number.isFinite) || seconds >= 60 || minutes >= 60) throw new Error('Invalid timestamp')
  return hours * 3600 + minutes * 60 + seconds
}
