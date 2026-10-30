'use client';
import type {LocalAudio} from '@/lib/composition/tracks';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAccount} from '@/components/account/provider';
import {fingerprint} from '@/lib/projects/fingerprint';
import {parseProjectDraft,projectSignature,type Project,type ProjectDraft,type ProjectStatus} from '@/lib/projects/model';
import {projectRequest,saveProject} from '@/lib/projects/client';
import {SaveQueue} from '@/lib/projects/autosave';
import type {Composition,LocalMedia} from '@/lib/composition/model';
export function useCompositionDraft(project:Project|undefined,main:LocalMedia|undefined,layer:LocalMedia|undefined,settings:Composition,title:string,status:ProjectStatus,music:LocalAudio[]=[]){
 const [retryTick,setRetryTick]=useState(0);
 const account=useAccount(),[message,setMessage]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[savedId,setSavedId]=useState(project?.id);
 const queue=useRef<SaveQueue|null>(null),savedSignature=useRef(project?projectSignature(project):''),operation=useRef<AbortController|null>(null),latest=useRef({main,layer,settings,title,status,music});
 useEffect(()=>{latest.current={main,layer,settings,title,status,music};},[main,layer,settings,title,status,music]);
 const accept=useCallback((value:Project)=>{savedSignature.current=projectSignature(value);setMessage('Saved settings · source files remain local');},[]);
 useEffect(()=>{if(project&&!queue.current)queue.current=new SaveQueue(project,(revision,value)=>saveProject(project.id,revision,value),accept);},[project,accept]);
 useEffect(()=>()=>operation.current?.abort(),[]);
 const save=useCallback(async(manual=true)=>{
  if(!account.user){setError('Sign in to save cloud drafts. Guest preview and export remain available.');return;}
  const value=latest.current;
  if(!value.main||!value.layer){if(manual)setError('Reconnect both original files before saving this composition.');return;}
  if(operation.current&&!operation.current.signal.aborted)return;
  const controller=new AbortController();operation.current=controller;setSaving(true);setError('');
  try{
   const [mainHash,layerHash]=await Promise.all([fingerprint(value.main.file,controller.signal),fingerprint(value.layer.file,controller.signal)]);controller.signal.throwIfAborted();
   const meta=(media:LocalMedia,sha256:string)=>({name:media.file.name,sizeBytes:media.file.size,durationSeconds:media.duration,width:media.width,height:media.height,mimeType:media.file.type||'application/octet-stream',sha256});
   const {tracks,...compositionSettings}=value.settings;const sources=[];for(const id of new Set(tracks?.audio.map(a=>a.sourceId)??[])){const audio=value.music.find(m=>m.id===id);if(!audio)throw Error('Reconnect all music files before saving');sources.push({id,name:audio.file.name,sizeBytes:audio.file.size,durationSeconds:audio.duration,mimeType:audio.file.type||'application/octet-stream',sha256:await fingerprint(audio.file,controller.signal)});}
   const draft:ProjectDraft=parseProjectDraft({title:value.title,status:value.status,source:meta(value.main,mainHash),settings:{mode:'manual-trim',range:{start:value.settings.trimStart,end:value.settings.trimEnd},clipDuration:30,keepRemainder:true,compression:'off',cutStrategy:'precision'},studioTracks:tracks?{settings:tracks,sources}:null,composition:{settings:compositionSettings,layer:{kind:value.layer.kind,...meta(value.layer,layerHash)}}});
   if(projectSignature(draft)===savedSignature.current){setMessage('Saved settings · source files remain local');return;}
   setMessage('Saving metadata…');
   if(!queue.current){const result=await projectRequest('',{method:'POST',body:JSON.stringify(draft)});const created=result.project as Project;queue.current=new SaveQueue(created,(revision,next)=>saveProject(created.id,revision,next),accept);setSavedId(created.id);accept(created);}
   else {queue.current.enqueue(draft);await queue.current.flush();}
  }catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'Draft not saved');setMessage('Changes not saved');}}
  finally{if(operation.current===controller){operation.current=null;setSaving(false);if(latest.current!==value)setRetryTick(n=>n+1);}}
 },[account.user,accept]);
 useEffect(()=>{if(!savedId||!main||!layer||!account.user)return;const timer=setTimeout(()=>void save(false),1200);return()=>clearTimeout(timer);},[savedId,main,layer,settings,title,status,music,save,account.user,retryTick]);
 // Warn on unload whenever the current state has not been acknowledged by the server.
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(!savedId)return;const current=latest.current;let dirty=saving||!!error;try{const last=JSON.parse(savedSignature.current);dirty ||= current.title!==last.title||JSON.stringify(current.settings)!==JSON.stringify({...last.composition?.settings,...(last.studio_tracks?{tracks:last.studio_tracks.settings}:{})})||current.status!==last.status;}catch{dirty=true;}if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[savedId,saving,error]);
 return {account,message,error,saving,savedId,save:()=>void save(true)};
}
