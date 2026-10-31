/** Encode mono 16 kHz PCM as WAV for server transcription. */
export function pcm16ToWav(samples:Float32Array):Blob {
  const bytes=44+samples.length*2
  const buffer=new ArrayBuffer(bytes)
  const view=new DataView(buffer)
  const ascii=(at:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i))}
  ascii(0,'RIFF');view.setUint32(4,bytes-8,true);ascii(8,'WAVE');ascii(12,'fmt ')
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true)
  view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true)
  ascii(36,'data');view.setUint32(40,samples.length*2,true)
  for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(v<0?v*32768:v*32767),true)}
  return new Blob([buffer],{type:'audio/wav'})
}
