"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
export function BackgroundStudio(){
 const [file,setFile]=useState<File|null>(null);
 const [background,setBackground]=useState<File|null>(null);
 const [source,setSource]=useState("");
 const [image,setImage]=useState("");
 const [color,setColor]=useState("#2563eb");
 const [key,setKey]=useState("#00ff00");
 const [tolerance,setTolerance]=useState(85);
 const [recording,setRecording]=useState(false);
 const [message,setMessage]=useState("");
 const [download,setDownload]=useState("");
 const video=useRef<HTMLVideoElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null);
 const frame=useRef<number>(0);
 const recorder=useRef<MediaRecorder|null>(null);
 useEffect(()=>{if(!file){setSource("");return;}const url=URL.createObjectURL(file);setSource(url);return()=>URL.revokeObjectURL(url)},[file]);
 useEffect(()=>{if(!background){setImage("");return;}const url=URL.createObjectURL(background);setImage(url);return()=>URL.revokeObjectURL(url)},[background]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);recorder.current?.stop();},[]);
 useEffect(()=>{if(!download)return()=>{};return()=>URL.revokeObjectURL(download)},[download]);
 useEffect(()=>{
  const el=video.current,c=canvas.current;
  if(!el||!c||!source)return;
  const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)return;
  const back=new Image();if(image)back.src=image;
  const off=document.createElement("canvas");const offCtx=off.getContext("2d",{willReadFrequently:true});
  const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [r,g,b]=rgb(key);
  const render=()=>{
   const w=el.videoWidth||640,h=el.videoHeight||360;
   if(c.width!==w||c.height!==h){c.width=w;c.height=h;off.width=w;off.height=h;}
   if(offCtx&&el.readyState>=2){
    offCtx.drawImage(el,0,0,w,h);
    const pixels=offCtx.getImageData(0,0,w,h),data=pixels.data;
    for(let i=0;i<data.length;i+=4){
     const dr=data[i]-r,dg=data[i+1]-g,db=data[i+2]-b;
     const distance=Math.sqrt(dr*dr+dg*dg+db*db);
     const softness=35;
     data[i+3]=Math.round(data[i+3]*Math.min(1,Math.max(0,(distance-tolerance)/softness)));
    }
    ctx.fillStyle=color;ctx.fillRect(0,0,w,h);
    if(image&&back.complete&&back.naturalWidth)ctx.drawImage(back,0,0,w,h);
    offCtx.putImageData(pixels,0,0);ctx.drawImage(off,0,0);
   }
   frame.current=requestAnimationFrame(render);
  };
  frame.current=requestAnimationFrame(render);
  return()=>cancelAnimationFrame(frame.current);
 },[source,image,color,key,tolerance]);
 async function exportVideo(){
  const c=canvas.current,el=video.current;
  if(!c||!el||recording)return;
  if(!c.captureStream||typeof MediaRecorder==="undefined"){setMessage("Video export is not supported in this browser.");return;}
  const type=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type){setMessage("This browser cannot export WebM. Try Chrome or Edge.");return;}
  if(!Number.isFinite(el.duration)||el.duration>180){setMessage("This Preview limits export to videos of 3 minutes or less.");return;}
  setMessage("");setDownload("");setRecording(true);
  try{
   el.pause();el.currentTime=0;
   await new Promise<void>((resolve,reject)=>{if(el.readyState>=2&&el.currentTime===0)return resolve();const timer=setTimeout(()=>reject(Error("Video seek timed out.")),8000);el.onseeked=()=>{clearTimeout(timer);resolve()};el.currentTime=0;});
   const stream=c.captureStream(24);
   const chunks:Blob[]=[];
   const media=new MediaRecorder(stream,{mimeType:type});
   recorder.current=media;
   media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   media.onerror=()=>setMessage("Recording failed.");
   media.onstop=()=>{stream.getTracks().forEach(t=>t.stop());setRecording(false);recorder.current=null;if(chunks.length)setDownload(URL.createObjectURL(new Blob(chunks,{type})));else setMessage("No video was recorded.")};
   el.onended=()=>{if(media.state!=="inactive")media.stop()};
   media.start(1000);await el.play();
  }catch(e){setRecording(false);setMessage(e instanceof Error?e.message:"Unable to export video.");}
 }
 return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
  <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio / Background</p>
  <h1 className="mt-2 text-3xl font-semibold">Background Remover & Changer</h1>
  <p className="mt-2 text-sm leading-6 text-slate-600">First working Preview: remove a solid green or blue screen using chroma key, then replace it with a colour or image. This is not AI person segmentation and cannot reliably remove ordinary backgrounds.</p>
  <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
   <label className="block text-sm font-semibold">Upload green-screen video<input type="file" accept="video/*" onChange={e=>{setFile(e.target.files?.[0]||null);setDownload("");}} className="mt-2 block w-full text-sm"/></label>
   {source&&<div className="mt-5 grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-sm font-semibold">Original</p><video ref={video} src={source} controls playsInline className="w-full rounded-lg bg-black"/></div><div><p className="mb-2 text-sm font-semibold">Background preview</p><canvas ref={canvas} className="w-full rounded-lg bg-black"/></div></div>}
   <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="text-sm">Screen colour to remove<input type="color" value={key} onChange={e=>setKey(e.target.value)} className="mt-2 block h-10 w-24"/></label>
    <label className="text-sm">Replacement colour<input type="color" value={color} onChange={e=>setColor(e.target.value)} className="mt-2 block h-10 w-24"/></label>
    <label className="text-sm">Tolerance: {tolerance}<input type="range" min="10" max="200" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))} className="mt-3 block w-full accent-blue-600"/></label>
    <label className="text-sm">Replacement image<input type="file" accept="image/*" onChange={e=>setBackground(e.target.files?.[0]||null)} className="mt-2 block w-full text-sm"/></label>
   </div>
   <button disabled={!source||recording} onClick={exportVideo} className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{recording?"Recording in real time…":"Export short video (WebM)"}</button>
   {download&&<a href={download} download="econtent-background.webm" className="ml-3 inline-block rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700">Download result</a>}
   {message&&<p role="status" className="mt-3 text-sm text-amber-700">{message}</p>}
   <p className="mt-4 text-xs text-slate-500">Preview export is silent, real-time, WebM only, and limited to 3 minutes. For ordinary backgrounds, a separate AI segmentation model is still required. <Link href="/video-editor" className="underline">Open Video Editor</Link> to import the downloaded file.</p>
  </section>
 </div>;
}
