import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024
const ACCEPTED = /^(audio\/|video\/)/
const LANGUAGES: Record<string,string> = {English:'en',Igbo:'ig',Hausa:'ha',Yoruba:'yo',French:'fr',Spanish:'es',Portuguese:'pt',Arabic:'ar',German:'de',Italian:'it',Hindi:'hi',Russian:'ru',Japanese:'ja',Korean:'ko'}

export async function GET() {
  return NextResponse.json({available: Boolean(process.env.OPENAI_API_KEY),maxBytes:MAX_BYTES,provider:'OpenAI',message:process.env.OPENAI_API_KEY?'Server transcription is configured.':'Server transcription is not configured. Set OPENAI_API_KEY in the Vercel Preview environment.'})
}

export async function POST(request:NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({code:'PROVIDER_NOT_CONFIGURED',stage:'server configuration',error:'Server transcription is not configured.',recommendation:'The project owner must configure OPENAI_API_KEY in the Vercel Preview environment. No key should be entered in the browser.'},{status:503})
  const length=Number(request.headers.get('content-length')||0)
  if(length>MAX_BYTES+65536)return NextResponse.json({code:'FILE_TOO_LARGE',error:'Audio exceeds the 25 MB server transcription limit.'},{status:413})
  let form:FormData
  try {form=await request.formData()} catch {return NextResponse.json({code:'BAD_UPLOAD',error:'Invalid multipart upload.'},{status:400})}
  const file=form.get('file')
  if(!(file instanceof File)||!ACCEPTED.test(file.type)||file.size===0||file.size>MAX_BYTES)return NextResponse.json({code:'INVALID_FILE',error:'Provide a supported audio/video file up to 25 MB.'},{status:400})
  const language=String(form.get('language')||'English')
  const upstream=new FormData()
  upstream.append('file',file,file.name)
  upstream.append('model','gpt-4o-mini-transcribe')
  upstream.append('response_format','json')
  if(LANGUAGES[language])upstream.append('language',LANGUAGES[language])
  try {
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),52000)
    let response:Response
    try {response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:upstream,signal:controller.signal,cache:'no-store'})}
    finally {clearTimeout(timer)}
    if(!response.ok){
      const detail=await response.text()
      return NextResponse.json({code:'PROVIDER_ERROR',stage:'provider',error:`Speech provider returned HTTP ${response.status}.`,recommendation:response.status===401?'Check the server-side API credential.':response.status===429?'Check API rate limits, billing and quota.':'Check supported media encoding and provider availability.',detail:detail.slice(0,300)},{status:502})
    }
    const result=await response.json() as {text?:string}
    if(!result.text?.trim())return NextResponse.json({code:'EMPTY_TRANSCRIPT',error:'The speech provider returned no recognized text.'},{status:422})
    return NextResponse.json({text:result.text.trim(),language,provider:'OpenAI',timestamps:'none'})
  } catch(error){
    return NextResponse.json({code:'PROVIDER_UNREACHABLE',stage:'provider',error:'Server transcription failed or timed out.',recommendation:'Check the provider connection and try a shorter recording.',detail:error instanceof Error?error.message:'Unknown error'},{status:504})
  }
}
