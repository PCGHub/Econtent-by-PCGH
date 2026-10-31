/** Browser-local audio preparation for future on-device ASR. No uploads or model downloads. */
export type PreparedAudio = {samples: Float32Array; sampleRate: 16000; durationSeconds: number}
const MAX_SECONDS = 120

export async function prepareSpeechAudio(file: File, signal?: AbortSignal): Promise<PreparedAudio> {
  if (signal?.aborted) throw new Error('Audio preparation cancelled')
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
    throw new Error('Select an audio or video file')
  }
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) throw new Error('Web Audio is unavailable in this browser')
  const context = new AudioContextClass()
  try {
    const data = await file.arrayBuffer()
    if (signal?.aborted) throw new Error('Audio preparation cancelled')
    let decoded: AudioBuffer
    try {
      decoded = await context.decodeAudioData(data)
    } catch {
      throw new Error('This file cannot be decoded by Web Audio. Video audio extraction needs the FFmpeg integration.')
    }
    if (decoded.duration > MAX_SECONDS) throw new Error('Start with a recording of 2 minutes or less')
    if (decoded.numberOfChannels < 1 || decoded.length < 1) throw new Error('No audio track found')
    const length = Math.max(1, Math.round(decoded.duration * 16000))
    const mono = new Float32Array(length)
    // Linear resampling is sufficient for initial speech-engine benchmarking.
    const ratio = decoded.sampleRate / 16000
    const channels = Array.from({length: decoded.numberOfChannels}, (_, i) => decoded.getChannelData(i))
    for (let i = 0; i < length; i++) {
      if ((i & 65535) === 0 && signal?.aborted) throw new Error('Audio preparation cancelled')
      const position = i * ratio
      const left = Math.min(Math.floor(position), decoded.length - 1)
      const right = Math.min(left + 1, decoded.length - 1)
      const blend = position - left
      let sum = 0
      for (const channel of channels) sum += channel[left] * (1 - blend) + channel[right] * blend
      mono[i] = Math.max(-1, Math.min(1, sum / channels.length))
    }
    return {samples: mono, sampleRate: 16000, durationSeconds: decoded.duration}
  } finally {
    await context.close()
  }
}
