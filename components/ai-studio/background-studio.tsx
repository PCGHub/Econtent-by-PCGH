"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
type SegResult={segmentationMask:CanvasImageSource;image:CanvasImageSource};
type Segmenter={onResults:(cb:(result:SegResult)=>void)=>void;send:(input:{image:HTMLVideoElement})=>Promise<void>;setOptions:(options:{modelSelection:number;selfieMode:boolean})=>void;close:()=>Promise<void>};
declare global{interface Window{SelfieSegmentation?:new(options:{locateFile:(name:string)=>string})=>Segmenter}}
const base="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/";
async function loadSegmenter(){
 if(!window.SelfieSegmentation){
  await new Promise<void>((resolve,reject)=>{const existing=document.querySelector<HTMLScriptElement>('script[data-segmenter="true"]');if(existing){if(window.SelfieSegmentation)return resolve();existing.remove()}const script=document.createElement("script");script.dataset.segmenter="true";script.src=base+"selfie_segmentation.js";script.onload=()=>resolve();script.onerror=()=>reject(Error("AI model could not load. Check your internet connection or content blockers."));document.head.appendChild(script)});
 }
 if(!window.SelfieSegmentation)throw Error("AI segmentation library unavailable.");
 const segmenter=new window.SelfieSegmentation({locateFile:name=>base+name});
 segmenter.setOptions({modelSelection:1,selfieMode:false});
 return segmenter;
}
export function BackgroundStudio(){
 const [file,setFile]=useState<File|null>(null);
 const [background,setBackground]=useState<File|null>(null);
 const [source,setSource]=useState("");
 const [image,setImage]=useState("");
 const [color,setColor]=useState("#2563eb");
 const [mode,setMode]=useState<"person"|"chroma">("person");
 const [key,setKey]=useState("#00ff00");
 const [tolerance,setTolerance]=useState(85);
 const [ready,setReady]=useState(false);
 const [recording,setRecording]=useState(false);
 const [message,setMessage]=useState("");
 const [download,setDownload]=useState("");
 const video=useRef<HTMLVideoElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null);
 const frame=useRef<number>(0);
 const recorder=useRef<MediaRecorder|null>(null);
 const segmenter=useRef<Segmenter|null>(null);
 const busy=useRef(false);
 const latest=useRef<SegResult|null>(null);
 const generation=useRef(0);
 useEffect(()=>{if(!file){setSource("");return;}const url=URL.createObjectURL(file);setSource(url);return()=>URL.revokeObjectURL(url)},[file]);
 useEffect(()=>{if(!background){setImage("");return;}const url=URL.createObjectURL(background);setImage(url);return()=>URL.revokeObjectURL(url)},[background]);
 useEffect(()=>{if(!download)return;return()=>URL.revokeObjectURL(download)},[download]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);if(recorder.current?.state!=="inactive")recorder.current?.stop();void segmenter.current?.close()},[]);
 useEffect(()=>{
  const ticket=++generation.current;setReady(false);latest.current=null;busy.current=false;
  if(mode!=="person"||!source)return;
  setMessage("Loading person detection model…");
  let model:Segmenter|null=null;
  void loadSegmenter().then(s=>{if(generation.current!==ticket){void s.close();return;}model=s;segmenter.current=s;s.onResults(result=>{if(generation.current===ticket)latest.current=result});setReady(true);setMessage("Person detection ready. Play your video to preview the replacement.");}).catch(e=>{if(generation.current===ticket)setMessage(e instanceof Error?e.message:"Unable to load AI model.")});
  return()=>{generation.current++;if(model){void model.close();if(segmenter.current===model)segmenter.current=null;}};
 },[mode,source]);
 useEffect(()=>{
  const el=video.current,c=canvas.current;
  if(!el||!c||!source)return;
  const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)return;
  const back=new Image();if(image)back.src=image;
  const off=document.createElement("canvas"),offCtx=off.getContext("2d",{willReadFrequently:true});
  const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [r,g,b]=rgb(key);
  let active=true;
  const render=()=>{
   if(!active)return;
   const w=el.videoWidth||640,h=el.videoHeight||360;
   const scale=Math.min(1,960/w);
   const width=Math.round(w*scale),height=Math.round(h*scale);
   if(c.width!==width||c.height!==height){c.width=width;c.height=height;off.width=width;off.height=height;}
   if(el.readyState>=2&&offCtx){
    ctx.fillStyle=color;ctx.fillRect(0,0,width,height);
    if(image&&back.complete&&back.naturalWidth)ctx.drawImage(back,0,0,width,height);
    if(mode==="person"){
     const result=latest.current;
     if(result){
      offCtx.clearRect(0,0,width,height);
      offCtx.globalCompositeOperation="source-over";
      offCtx.drawImage(result.segmentationMask,0,0,width,height);
      offCtx.globalCompositeOperation="source-in";
      offCtx.drawImage(result.image,0,0,width,height);
      offCtx.globalCompositeOperation="source-over";
      ctx.drawImage(off,0,0);
     }else if(!ready){ctx.drawImage(el,0,0,width,height);}
     if(ready&&!busy.current&&!el.paused&&!el.ended&&segmenter.current){
      busy.current=true;
      void segmenter.current.send({image:el}).catch(()=>setMessage("AI frame processing failed. Try a shorter video.")).finally(()=>{busy.current=false});
     }
    }else{
     offCtx.drawImage(el,0,0,width,height);
     const pixels=offCtx.getImageData(0,0,width,height),data=pixels.data;
     for(let i=0;i<data.length;i+=4){const dr=data[i]-r,dg=data[i+1]-g,db=data[i+2]-b;const distance=Math.sqrt(dr*dr+dg*dg+db*db);data[i+3]=Math.round(data[i+3]*Math.min(1,Math.max(0,(distance-tolerance)/35)));}
     offCtx.putImageData(pixels,0,0);ctx.drawImage(off,0,0);
    }
   }
   frame.current=requestAnimationFrame(render);
  };
  frame.current=requestAnimationFrame(render);
  return()=>{active=false;cancelAnimationFrame(frame.current)};
 },[source,image,color,key,tolerance,mode,ready]);
 async function exportVideo(){
  const c=canvas.current,el=video.current;
  if(!c||!el||recording)return;
  if(mode==="person"&&!ready){setMessage("Wait for the person detection model to load.");return;}
  if(!c.captureStream||typeof MediaRecorder==="undefined"){setMessage("Video export is not supported in this browser.");return;}
  const type=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type){setMessage("This browser cannot export WebM. Try Chrome or Edge.");return;}
  if(!Number.isFinite(el.duration)||el.duration>180){setMessage("This Preview limits export to videos of 3 minutes or less.");return;}
  setMessage("");setDownload("");setRecording(true);
  let stream:MediaStream|null=null;
  try{
   el.pause();el.currentTime=0;
   await new Promise<void>((resolve,reject)=>{if(Math.abs(el.currentTime)<.05)return resolve();const timer=setTimeout(()=>reject(Error("Video seek timed out.")),8000);el.onseeked=()=>{clearTimeout(timer);resolve()};el.currentTime=0;});
   stream=c.captureStream(24);
   const capture=el as HTMLVideoElement & {captureStream?:()=>MediaStream;mozCaptureStream?:()=>MediaStream};
   const audioSource=capture.captureStream?.()||capture.mozCaptureStream?.();
   audioSource?.getAudioTracks().forEach(track=>stream?.addTrack(track));
   const chunks:Blob[]=[];
   const media=new MediaRecorder(stream,{mimeType:type});
   recorder.current=media;
   media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   media.onerror=()=>setMessage("Recording failed.");
   media.onstop=()=>{stream?.getTracks().forEach(t=>t.stop());setRecording(false);recorder.current=null;if(chunks.length){setDownload(URL.createObjectURL(new Blob(chunks,{type})));setMessage(audioSource?.getAudioTracks().length?"Export complete with captured audio.":"Export complete, but this browser did not expose the original audio track. Check playback before use.")}else setMessage("No video was recorded.")};
   el.onended=()=>{if(media.state!=="inactive")media.stop()};
   media.start(1000);await el.play();
  }catch(e){stream?.getTracks().forEach(t=>t.stop());setRecording(false);setMessage(e instanceof Error?e.message:"Unable to export video.");}
 }
 return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
  <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio / Background</p>
  <h1 className="mt-2 text-3xl font-semibold">Background Remover & Changer</h1>
  <p className="mt-2 text-sm leading-6 text-slate-600">Person detection (beta) isolates a presenter without a green screen. Upload your own background image or choose a colour. The model loads from an external CDN on first use and runs in your browser. Hair, hands and fast movements may have imperfect edges.</p>
  <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
   <label className="block text-sm font-semibold">Upload video<input type="file" accept="video/*" onChange={e=>{setFile(e.target.files?.[0]||null);setDownload("");}} className="mt-2 block w-full text-sm"/></label>
   <label className="mt-4 block text-sm font-medium">Removal method<select className="mt-2 block w-full rounded-lg border p-3" value={mode} onChange={e=>setMode(e.target.value as "person"|"chroma")}><option value="person">AI Person Detection (no green screen)</option><option value="chroma">Green/Blue Screen (chroma key)</option></select></label>
   {source&&<div className="mt-5 grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-sm font-semibold">Original</p><video ref={video} src={source} controls playsInline className="w-full rounded-lg bg-black" onSeeked={()=>{latest.current=null}}/></div><div><p className="mb-2 text-sm font-semibold">Background preview</p><canvas ref={canvas} className="w-full rounded-lg bg-black"/></div></div>}
   <div className="mt-5 grid gap-4 sm:grid-cols-2">
    {mode==="chroma"&&<><label className="text-sm">Screen colour to remove<input type="color" value={key} onChange={e=>setKey(e.target.value)} className="mt-2 block h-10 w-24"/></label><label className="text-sm">Tolerance: {tolerance}<input type="range" min="10" max="200" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))} className="mt-3 block w-full accent-blue-600"/></label></>}
    <label className="text-sm">Replacement colour<input type="color" value={color} onChange={e=>setColor(e.target.value)} className="mt-2 block h-10 w-24"/></label>
    <label className="text-sm">Replacement image<input type="file" accept="image/*" onChange={e=>setBackground(e.target.files?.[0]||null)} className="mt-2 block w-full text-sm"/></label>
   </div>
   <button disabled={!source||recording||(mode==="person"&&!ready)} onClick={exportVideo} className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{recording?"Recording in real time…":"Export short video (WebM)"}</button>
   {download&&<a href={download} download="econtent-background.webm" className="ml-3 inline-block rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700">Download result</a>}
   {message&&<p role="status" className="mt-3 text-sm text-amber-700">{message}</p>}
   <p className="mt-4 text-xs text-slate-500">Beta export: real-time WebM, up to 3 minutes. Audio is included only where the browser supports capturing the source audio track. Check the downloaded file before importing it into <Link href="/video-editor" className="underline">Video Editor</Link>.</p>
  </section>
 </div>;
}
