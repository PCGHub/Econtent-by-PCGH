import type {LocalAudio} from './tracks';
export const AUDIO_ACCEPT='audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm';
export async function readLocalAudio(file:File,id:string,signal:AbortSignal):Promise<LocalAudio>{
 if(!file.size||file.size>64*1048576)throw Error('Choose a non-empty audio file up to 64 MiB');
 signal.throwIfAborted();const url=URL.createObjectURL(file),audio=document.createElement('audio');audio.preload='metadata';
 try{const duration=await new Promise<number>((resolve,reject)=>{
  const done=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);audio.onloadedmetadata=null;audio.onerror=null;if(error)reject(error);};
  const abort=()=>done(new DOMException('Cancelled','AbortError'));const timer=setTimeout(()=>done(Error('Audio metadata timed out. Convert this source to WAV or MP3 locally and reconnect it.')),15000);
  signal.addEventListener('abort',abort,{once:true});audio.onerror=()=>done(Error('This browser cannot preview this audio format. Choose WAV, MP3 or another browser-decodable file.'));
  audio.onloadedmetadata=()=>{if(!Number.isFinite(audio.duration)||audio.duration<=0){done(Error('Cannot read a finite audio duration'));return;}resolve(audio.duration);done();};audio.src=url;
 });return {id,file,url,duration};}catch(error){URL.revokeObjectURL(url);throw error;}finally{audio.removeAttribute('src');audio.load();}
}
