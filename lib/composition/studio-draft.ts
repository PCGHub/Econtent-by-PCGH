import {parseTracks,trackId,type StudioTracks} from './tracks';
export interface AudioMetadata {id:string;name:string;sizeBytes:number;durationSeconds:number;mimeType:string;sha256:string}
export interface StudioDraft {settings:StudioTracks;sources:AudioMetadata[]}
export function parseStudioDraft(value:unknown,duration:number):StudioDraft{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid studio draft');const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==2||!('settings'in v)||!Array.isArray(v.sources)||v.sources.length>4)throw Error('Unexpected studio draft fields');
 const settings=parseTracks(v.settings,duration);
 const sources=v.sources.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid audio metadata');const a=value as Record<string,unknown>,allowed=['id','name','sizeBytes','durationSeconds','mimeType','sha256'];if(Object.keys(a).length!==allowed.length||Object.keys(a).some(k=>!allowed.includes(k)))throw Error('Unexpected audio metadata fields');
  for(const [key,max]of [['name',255],['mimeType',100],['sha256',64]] as const)if(typeof a[key]!=='string'||!a[key].trim()||a[key].length>max||/[\u0000-\u001f]/.test(a[key]))throw Error('Invalid audio '+key);
  if(!/^[a-f0-9]{64}$/.test(String(a.sha256))||typeof a.sizeBytes!=='number'||!Number.isSafeInteger(a.sizeBytes)||a.sizeBytes<1||a.sizeBytes>64*1048576||typeof a.durationSeconds!=='number'||!Number.isFinite(a.durationSeconds)||a.durationSeconds<=0||a.durationSeconds>31536000)throw Error('Invalid audio fingerprint, size or duration');
  return {id:trackId(a.id),name:a.name as string,sizeBytes:a.sizeBytes,durationSeconds:a.durationSeconds,mimeType:a.mimeType as string,sha256:a.sha256 as string};
 });
 if(new Set(sources.map(a=>a.id)).size!==sources.length)throw Error('Duplicate audio source');
 for(const clip of settings.audio){const source=sources.find(s=>s.id===clip.sourceId);if(!source||clip.sourceStart+clip.end-clip.start>source.durationSeconds+.001)throw Error('Music range exceeds its saved local source');}
 if(sources.some(s=>!settings.audio.some(a=>a.sourceId===s.id)))throw Error('Unreferenced audio source');
 return {settings,sources};
}
