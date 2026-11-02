"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {saveHighlights,type HighlightRange} from "@/lib/ai/highlights-transfer";
import {sampleAudioEnergy} from "@/lib/ai/highlight-audio";
type Suggestion=HighlightRange & {score:number;selected:boolean};
const fmt=(s:number)=>`${Math.floor(s/60).toString().padStart(2,"0")}:${Math.floor(s%60).toString().padStart(2,"0")}`;
export function HighlightsStudio(){
 const router=useRouter();
 const [file,setFile]=useState<File|null>(null);
 const [url,setUrl]=useState("");
 const [duration,setDuration]=useState(0);
 const [target,setTarget]=useState(15);
 const [count,setCount]=useState(3);
 const [mode,setMode]=useState<"balanced"|"action"|"dialogue">("balanced");
 const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState(0);
 const [message,setMessage]=useState("");
 const video=useRef<HTMLVideoElement>(null);
 const previewEnd=useRef<number|null>(null);
 const cancel=useRef(false);
 useEffect(()=>{if(!file){setUrl("");return;}const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u)},[file]);
 useEffect(()=>()=>{cancel.current=true},[]);
 async function analyze(){
  if(!file||!url||!duration||busy)return;
  cancel.current=false;setBusy(true);setMessage("");setProgress(0);setSuggestions([]);
  const el=document.createElement("video");
  el.preload="auto";el.muted=true;el.playsInline=true;el.src=url;
  const canvas=document.createElement("canvas");canvas.width=64;canvas.height=36;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx){setBusy(false);setMessage("Video analysis is not supported in this browser.");return;}
  try{
   await new Promise<void>((resolve,reject)=>{if(el.readyState>=1)return resolve();el.onloadedmetadata=()=>resolve();el.onerror=()=>reject(Error("Unable to decode this video."));setTimeout(()=>reject(Error("Video metadata timed out.")),12000)});
   const step=Math.max(1.5,duration/90),samples:number[]=[];
   let previous:Uint8ClampedArray|null=null;
   for(let t=0;t<duration;t+=step){
    if(cancel.current)throw Error("Analysis cancelled.");
    const time=Math.min(duration-.05,Math.max(.05,t));
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Video seek timed out.")),9000);el.onseeked=()=>{clearTimeout(timer);resolve()};el.onerror=()=>{clearTimeout(timer);reject(Error("Video frame could not be decoded."))};el.currentTime=time});
    ctx.drawImage(el,0,0,64,36);
    const frame=ctx.getImageData(0,0,64,36).data;
    let difference=0;
    if(previous){for(let i=0;i<frame.length;i+=16){difference+=Math.abs(frame[i]-previous[i])+Math.abs(frame[i+1]-previous[i+1])+Math.abs(frame[i+2]-previous[i+2]);}difference/=frame.length/4;}
    samples.push(difference);previous=new Uint8ClampedArray(frame);
    setProgress(Math.min(100,Math.round((time/duration)*100)));
   }
   if(cancel.current)throw Error("Analysis cancelled.");
   setMessage("Checking audio activity when supported…");
   const audioEnergy=mode==="action"?null:await sampleAudioEnergy(file,duration);
   if(cancel.current)throw Error("Analysis cancelled.");
   const windowSize=Math.min(target,duration),candidates:Suggestion[]=[];
   const stride=Math.max(step,windowSize/3);
   for(let start=0;start<duration;start+=stride){
    const end=Math.min(duration,start+windowSize);
    if(end-start<Math.min(3,windowSize*.7))continue;
    let score=0;for(let i=0;i<samples.length;i++){const t=i*step;if(t>=start&&t<end)score+=samples[i];}
    const visualScore=score/Math.max(1,(end-start)/step);
    const audioScore=audioEnergy?audioEnergy(start,end)*70:0;
    const combined=mode==="action"?visualScore:mode==="dialogue"&&audioEnergy?visualScore*.2+audioScore*.8:audioEnergy?visualScore*.65+audioScore*.35:visualScore;
    candidates.push({start,end,score:combined,selected:true});
   }
   const picks:Suggestion[]=[];
   for(const candidate of candidates.sort((a,b)=>b.score-a.score)){
    if(picks.length>=count)break;
    if(picks.some(p=>Math.max(0,Math.min(p.end,candidate.end)-Math.max(p.start,candidate.start))>1))continue;
    picks.push(candidate);
   }
   setSuggestions(picks.sort((a,b)=>a.start-b.start));
   setProgress(100);
   setMessage(picks.length?(audioEnergy?"Suggestions combine visual changes and audio loudness. Loudness is not speech recognition. Review every clip.":"Suggestions use visual changes only; audio decoding was unavailable for this file/browser. Review every clip."):"No suitable highlights were detected.");
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to analyze this file. Try MP4 or WebM.");}
  finally{el.removeAttribute("src");el.load();setBusy(false);}
 }
 function playRange(range:HighlightRange){if(!video.current)return;previewEnd.current=range.end;video.current.currentTime=range.start;void video.current.play().catch(()=>{});}
 function updateRange(index:number,field:"start"|"end",value:number){
  if(!Number.isFinite(value))return;
  setSuggestions(old=>old.map((s,i)=>{
   if(i!==index)return s;
   const start=field==="start"?Math.max(0,Math.min(duration-.1,value)):s.start;
   const end=field==="end"?Math.min(duration,Math.max(.1,value)):s.end;
   return {...s,start,end};
  }));
 }
 async function addToEditor(){
  if(!file)return;
  const ranges=suggestions.filter(s=>s.selected&&s.end>s.start).map(({start,end})=>({start,end}));
  if(!ranges.length)return;
  try{await saveHighlights(file,ranges);router.push("/video-editor");}
  catch{setMessage("Could not transfer clips automatically. Try a smaller video or use Video Editor manually.");}
 }
 return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
  <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio / Automatic Highlights</p>
  <h1 className="mt-2 text-3xl font-semibold text-slate-900">Automatic Highlights</h1>
  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Find visually active moments in your video, review suggestions, and add selected segments to the Video Editor. This first version runs on your device using visual scene changes and, where supported, audio activity. It does not yet understand spoken words, emotion, or story importance.</p>
  <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <label htmlFor="highlight-file" className="block text-sm font-semibold">Upload a video</label>
   <input id="highlight-file" type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className="mt-3 block w-full text-sm" onChange={e=>{const next=e.target.files?.[0]||null;cancel.current=true;setFile(next);previewEnd.current=null;setDuration(0);setSuggestions([]);setMessage("");}}/>
   {url&&<video ref={video} controls src={url} onTimeUpdate={e=>{if(previewEnd.current!==null&&e.currentTarget.currentTime>=previewEnd.current){e.currentTarget.pause();previewEnd.current=null;}}} onSeeked={e=>{if(previewEnd.current!==null&&e.currentTarget.currentTime>previewEnd.current)previewEnd.current=null;}} className="mt-5 max-h-80 w-full rounded-xl bg-black" onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)}/>}
   {duration>0&&<p className="mt-2 text-xs text-slate-500">Duration: {fmt(duration)} · Processing stays in your browser</p>}
   <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-medium">Highlight length<select value={target} onChange={e=>setTarget(Number(e.target.value))} className="mt-2 block w-full rounded-lg border border-slate-200 p-3">{[10,15,30,45,60].map(n=><option key={n} value={n}>{n} seconds</option>)}</select></label>
    <label className="text-sm font-medium">Number of highlights<select value={count} onChange={e=>setCount(Number(e.target.value))} className="mt-2 block w-full rounded-lg border border-slate-200 p-3">{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} clips</option>)}</select></label>
   </div>
   <label className="mt-4 block text-sm font-medium">Detection style<select value={mode} onChange={e=>setMode(e.target.value as "balanced"|"action"|"dialogue")} className="mt-2 block w-full rounded-lg border border-slate-200 p-3"><option value="balanced">Balanced · motion + available audio</option><option value="action">Action · visual changes</option><option value="dialogue">Audio activity · speech or music energy (experimental)</option></select></label>
   <p className="mt-2 text-xs text-slate-500">Audio analysis is optional and may be unavailable for large files or unsupported video codecs. It does not transcribe speech or identify important dialogue.</p>
   <div className="mt-5 flex gap-3"><button type="button" disabled={!duration||busy} onClick={analyze} className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Analyzing video…":"Find highlights"}</button>{busy&&<button type="button" onClick={()=>{cancel.current=true}} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold">Cancel</button>}</div>
   {busy&&<div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-blue-500" style={{width:progress+"%"}}/></div>}
   {message&&<p role="status" className="mt-4 text-sm text-slate-600">{message}</p>}
  </section>
  {suggestions.length>0&&<section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
   <h2 className="text-lg font-semibold">Suggested highlights</h2>
   <p className="mt-1 text-xs text-slate-500">Preview plays only the selected range. Adjust start and end times before approving each clip.</p>
   <div className="mt-4 space-y-3">{suggestions.map((s,i)=><div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" aria-label={`Include highlight ${i+1}`} checked={s.selected} onChange={e=>setSuggestions(old=>old.map((v,j)=>j===i?{...v,selected:e.target.checked}:v))}/><div className="min-w-[160px] flex-1 text-sm"><strong>Highlight {i+1}</strong><p className="text-slate-500">{fmt(s.start)} – {fmt(s.end)} · {(s.end-s.start).toFixed(1)} sec</p><div className="mt-2 flex flex-wrap gap-2"><label className="text-xs text-slate-600">Start (sec)<input aria-label={`Highlight ${i+1} start seconds`} type="number" min="0" max={duration} step="0.1" value={Number(s.start.toFixed(1))} onChange={e=>updateRange(i,"start",Number(e.target.value))} className="mt-1 block w-24 rounded border border-slate-200 p-2"/></label><label className="text-xs text-slate-600">End (sec)<input aria-label={`Highlight ${i+1} end seconds`} type="number" min="0" max={duration} step="0.1" value={Number(s.end.toFixed(1))} onChange={e=>updateRange(i,"end",Number(e.target.value))} className="mt-1 block w-24 rounded border border-slate-200 p-2"/></label></div>{s.end<=s.start&&<p className="mt-1 text-xs text-red-600">End must be after start.</p>}</div><button type="button" onClick={()=>playRange(s)} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Preview</button></div>)}</div>
   <button type="button" disabled={!suggestions.some(s=>s.selected&&s.end>s.start)} onClick={addToEditor} className="mt-5 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Add selected clips to Video Editor</button>
  </section>}
 </main>;
}
