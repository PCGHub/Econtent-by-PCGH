/** Experimental local speech recognition with bounded stages and actionable errors.
 * Timeouts stop waiting, but cannot forcibly interrupt an in-flight WASM operation.
 */
export type SpeechResult = {text: string; elapsedSeconds: number}
export type SpeechStage = 'runtime' | 'model' | 'inference'
export class SpeechRecognitionFailure extends Error {
  constructor(public readonly stage: SpeechStage, public readonly code: string, message: string, public readonly recommendation: string, public readonly detail: string) {
    super(message)
    this.name = 'SpeechRecognitionFailure'
  }
}
type Pipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{text?: string}>
let modelPromise: Promise<Pipeline> | null = null
let progressListener: ((message: string) => void) | null = null
let lastProgressAt = 0
function reportProgress(event: {status?: string; file?: string; progress?: number; loaded?: number; total?: number}) {
  lastProgressAt = Date.now()
  const file = event.file?.split('/').pop() || 'model asset'
  const percent = typeof event.progress === 'number' ? ` (${Math.round(event.progress)}%)` : event.total && event.loaded ? ` (${Math.round(event.loaded/event.total*100)}%)` : ''
  progressListener?.(`AI model: ${event.status || 'loading'} ${file}${percent}`)
}
function messageOf(error: unknown): string {return error instanceof Error ? error.message : String(error)}
function classify(stage: SpeechStage, error: unknown): SpeechRecognitionFailure {
  if(error instanceof SpeechRecognitionFailure)return error
  const detail = messageOf(error).slice(0, 500)
  const network = /fetch|network|failed to load|cdn|http|cors|offline|blocked/i.test(detail)
  const memory = /memory|allocation|out of memory|wasm/i.test(detail)
  const recommendation = network ? 'Check internet access and whether browser extensions or network policies block esm.sh or Hugging Face model downloads. Retry on a stable connection.' : memory ? 'Close other tabs, use a desktop browser with more available memory, or try a shorter recording.' : stage === 'runtime' ? 'Verify that the browser permits third-party JavaScript modules, then retry with an updated Chrome or Edge browser.' : stage === 'model' ? 'Verify access to model files from Hugging Face and retry on a stable connection. A model-hosting or browser compatibility fix may be needed.' : 'Try a short clear English recording in Chrome or Edge. If the failure repeats, inspect the technical detail below.'
  return new SpeechRecognitionFailure(stage, network ? 'NETWORK_OR_DOWNLOAD' : memory ? 'BROWSER_MEMORY_OR_WASM' : 'ENGINE_ERROR', 'Speech recognition failed during '+stage+'.', recommendation, detail)
}
async function bounded<T>(work: Promise<T>, ms: number, stage: SpeechStage): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_,reject) => {
      timer = setTimeout(()=>reject(new SpeechRecognitionFailure(stage,'TIMEOUT','Speech recognition timed out during '+stage+'.',stage==='model' ? 'The model download or initialization is stalled. Check your connection and browser network restrictions, then retry. If this repeats, we need to replace the model-loading integration.' : 'Try a shorter recording or a faster desktop browser. If this repeats, the recognition engine needs performance or compatibility work.','No completion within '+Math.round(ms/1000)+' seconds.')),ms)
    })])
  } finally {if(timer)clearTimeout(timer)}
}
export async function transcribeLocalEnglish(samples: Float32Array, onStatus: (message: string) => void): Promise<SpeechResult> {
  if(!samples.length)throw new SpeechRecognitionFailure('inference','EMPTY_AUDIO','Audio contains no samples.','Upload a recording with audible speech.','Audio buffer was empty.')
  progressListener = onStatus
  if(!modelPromise) {
    modelPromise = (async()=>{
      onStatus('Loading speech recognition runtime…')
      let mod: {pipeline: (task:string,model:string,opts:Record<string,unknown>)=>Promise<Pipeline>}
      try {
        const moduleUrl = 'https://esm.sh/@huggingface/transformers@3.7.6?bundle&target=es2022'
        mod = await bounded(import(/* webpackIgnore: true */ moduleUrl) as Promise<{pipeline: (task:string,model:string,opts:Record<string,unknown>)=>Promise<Pipeline>}>,30000,'runtime')
      } catch(e) {throw classify('runtime',e)}
      onStatus('Downloading and initializing English speech model…')
      lastProgressAt = Date.now()
      try {
        const loading = mod.pipeline('automatic-speech-recognition','onnx-community/whisper-tiny.en',{device:'wasm',dtype:'q8',progress_callback:reportProgress})
        const stallCheck = new Promise<never>((_, reject) => {
          const id = setInterval(() => {
            if (Date.now() - lastProgressAt > 60000) {
              clearInterval(id)
              reject(new SpeechRecognitionFailure('model','DOWNLOAD_STALLED','No AI model download progress for 60 seconds.','Check whether huggingface.co and cdn-lfs.huggingface.co are accessible. Try a different network or browser; if blocked, the app needs first-party model hosting.','Model progress callback was silent for 60 seconds.'))
            }
          }, 3000)
          void loading.finally(() => clearInterval(id)).catch(() => {})
        })
        return await bounded(Promise.race([loading,stallCheck]),180000,'model')
      }
      catch(e) {throw classify('model',e)}
    })().catch(error=>{modelPromise=null;throw error})
  } else onStatus('Reusing cached English speech model…')
  const model = await modelPromise
  onStatus('Recognizing English speech (up to 2 minutes)…')
  const start=performance.now()
  try {
    const output=await bounded(model(samples,{return_timestamps:false}),120000,'inference')
    if(!output.text?.trim())throw new SpeechRecognitionFailure('inference','NO_SPEECH','The model returned no recognizable speech.','Confirm the recording contains clear English speech and try a short sample.','Empty transcript returned by model.')
    return {text:output.text.trim(),elapsedSeconds:(performance.now()-start)/1000}
  } catch(e) {throw classify('inference',e)}
}
