/** Experimental browser-local Whisper transcription. Model downloads on first use.
 * This is deliberately opt-in; accuracy and browser compatibility vary.
 */
export type SpeechResult = {text: string; elapsedSeconds: number}
type Pipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{text?: string}>
let modelPromise: Promise<Pipeline> | null = null
export async function transcribeLocalEnglish(samples: Float32Array, onStatus: (message: string) => void): Promise<SpeechResult> {
  if (!samples.length) throw new Error('Audio contains no samples')
  onStatus('Loading speech model (first download may be large)…')
  if (!modelPromise) {
    modelPromise = (async () => {
      // Load from a pinned ESM CDN URL without adding a new build dependency.
      // Browser compatibility and network access are required.
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6'
      const mod = await import(/* webpackIgnore: true */ moduleUrl) as {pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<Pipeline>}
      return mod.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {device: 'wasm', dtype: 'q8'})
    })().catch(error => {modelPromise = null;throw error})
  }
  const model = await modelPromise
  onStatus('Recognizing English speech on this device…')
  const start = performance.now()
  const output = await model(samples, {return_timestamps: false})
  if (!output.text?.trim()) throw new Error('The model returned no recognizable speech')
  return {text: output.text.trim(), elapsedSeconds: (performance.now() - start) / 1000}
}
