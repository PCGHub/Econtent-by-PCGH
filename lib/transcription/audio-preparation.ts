/** Browser-local audio preparation for future on-device ASR. No uploads or model downloads. */
export type PreparedAudio = {samples: Float32Array; sampleRate: 16000; durationSeconds: number}
const MAX_SECONDS = 125
const MAX_FILE_BYTES = 40 * 1024 * 1024

/** Downmix and resample decoded PCM; pure helper suitable for automated tests. */
export function toMono16k(channels: readonly Float32Array[], inputSampleRate: number): Float32Array {
  if (!channels.length || !channels[0]?.length || !Number.isFinite(inputSampleRate) || inputSampleRate <= 0) throw new Error('Invalid audio samples')
  const sourceLength = channels[0].length
  if (channels.some(c => c.length !== sourceLength)) throw new Error('Audio channels have inconsistent lengths')
  const length = Math.max(1, Math.round(sourceLength * 16000 / inputSampleRate))
  const mono = new Float32Array(length)
  const ratio = inputSampleRate / 16000
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const left = Math.min(Math.floor(position), sourceLength - 1)
    const right = Math.min(left + 1, sourceLength - 1)
    const blend = position - left
    let sum = 0
    for (const channel of channels) sum += channel[left] * (1 - blend) + channel[right] * blend
    mono[i] = Math.max(-1, Math.min(1, sum / channels.length))
  }
  return mono
}

export async function prepareSpeechAudio(file: File, signal?: AbortSignal, onStage?: (stage: string) => void): Promise<PreparedAudio> {
  if (signal?.aborted) throw new Error('Audio preparation cancelled')
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
    throw new Error('Select an audio or video file')
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('Audio preparation is limited to 40 MB files to protect device memory')
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) throw new Error('Web Audio is unavailable in this browser')
  onStage?.('Reading media file…')
  const context = new AudioContextClass()
  try {
    const data = await file.arrayBuffer()
    if (signal?.aborted) throw new Error('Audio preparation cancelled')
    onStage?.('Decoding audio track…')
    let decoded: AudioBuffer
    try {
      decoded = await context.decodeAudioData(data)
    } catch {
      throw new Error('This file cannot be decoded by Web Audio. Video audio extraction needs the FFmpeg integration.')
    }
    if (decoded.duration > MAX_SECONDS) throw new Error('Start with a recording of 2 minutes or less')
    if (decoded.numberOfChannels < 1 || decoded.length < 1) throw new Error('No audio track found')
    onStage?.('Converting audio to 16 kHz…')
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    const channels = Array.from({length: decoded.numberOfChannels}, (_, i) => decoded.getChannelData(i))
    const mono = toMono16k(channels, decoded.sampleRate)
    onStage?.('Audio prepared successfully')
    if (signal?.aborted) throw new Error('Audio preparation cancelled')
    return {samples: mono, sampleRate: 16000, durationSeconds: decoded.duration}
  } finally {
    await context.close()
  }
}
