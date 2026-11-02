"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveVoiceover } from "@/lib/ai/voiceover-transfer";
const aiVoices=["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer"];
export function VoiceoverStudio(){
 const router=useRouter();
 const [script,setScript]=useState("");
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
 const [browserVoice,setBrowserVoice]=useState("");
 const [aiVoice,setAiVoice]=useState("coral");
 const [rate,setRate]=useState(1);
 const [speaking,setSpeaking]=useState(false);
 const [supported,setSupported]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [audio,setAudio]=useState<Blob|null>(null);
 const [audioUrl,setAudioUrl]=useState("");
 useEffect(()=>{try{setScript((localStorage.getItem("econtent-voiceover-draft")||"").slice(0,5000))}catch{}},[]);
 useEffect(()=>{try{if(script)localStorage.setItem("econtent-voiceover-draft",script)}catch{}},[script]);
 useEffect(()=>{
  if(!("speechSynthesis" in window))return;
  const synth=window.speechSynthesis;
  const update=()=>setVoices(synth.getVoices());
  setSupported(true);update();synth.addEventListener("voiceschanged",update);
  return()=>{synth.cancel();synth.removeEventListener("voiceschanged",update)};
 },[]);
 useEffect(()=>{if(!audio){setAudioUrl("");return;}const url=URL.createObjectURL(audio);setAudioUrl(url);return()=>URL.revokeObjectURL(url)},[audio]);
 function stop(){window.speechSynthesis.cancel();setSpeaking(false)}
 function preview(){
  if(!script.trim()||!supported)return;
  stop();const utterance=new SpeechSynthesisUtterance(script.trim());utterance.rate=rate;
  const voice=voices.find(v=>v.voiceURI===browserVoice);if(voice)utterance.voice=voice;
  utterance.onend=()=>setSpeaking(false);utterance.onerror=()=>setSpeaking(false);
  setSpeaking(true);window.speechSynthesis.speak(utterance);
 }
 async function generate(){
  if(busy)return;
  setBusy(true);setError("");setAudio(null);
  try{
   const response=await fetch("/api/ai/voiceover",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:script.trim(),voice:aiVoice})});
   if(!response.ok){const payload=await response.json().catch(()=>({}));throw Error(payload.error||"AI generation failed. Please try again.");}
   const blob=await response.blob();
   if(!blob.size||!blob.type.includes("audio"))throw Error("The speech service returned invalid audio.");
   setAudio(blob);
  }catch(e){setError(e instanceof Error?e.message:"Could not generate narration.");}
  finally{setBusy(false);}
 }
 function downloadAudio(){if(!audioUrl)return;const a=document.createElement("a");a.href=audioUrl;a.download="econtent-ai-voiceover.mp3";a.click();}
 async function insertIntoEditor(){
  if(!audio)return;
  try{await saveVoiceover(new File([audio],"econtent-ai-voiceover.mp3",{type:"audio/mpeg"}));router.push("/video-editor");}
  catch{setError("Automatic transfer is unavailable on this device. Download the MP3 and import it manually in Video Editor.");}
 }
 function downloadScript(){if(!script.trim())return;const url=URL.createObjectURL(new Blob([script],{type:"text/plain"}));const a=document.createElement("a");a.href=url;a.download="econtent-voiceover-script.txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
  <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio / Voice-over</p>
  <h1 className="mt-2 text-3xl font-semibold text-slate-900">Voice-over Studio</h1>
  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Write narration, preview it for free, or generate an MP3 with AI. Signed-in accounts can generate up to three short narrations per day while this Preview is being tested.</p>
  <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
   <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <label htmlFor="voice-script" className="text-sm font-semibold">Narration script</label>
    <textarea id="voice-script" value={script} maxLength={5000} onChange={e=>{setScript(e.target.value);setAudio(null);}} placeholder="Write or paste your narration..." rows={11} className="mt-3 w-full resize-y rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span>Draft saved on this device</span><span>{script.length} / 5,000</span></div>
    <button type="button" onClick={downloadScript} disabled={!script.trim()} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">Download script</button>
   </section>
   <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-sm font-semibold">AI narration (MP3)</h2>
    <label htmlFor="ai-voice" className="mt-4 block text-xs font-medium text-slate-600">AI voice</label>
    <select id="ai-voice" value={aiVoice} onChange={e=>{setAiVoice(e.target.value);setAudio(null);}} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm">{aiVoices.map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}</select>
    <p className="mt-3 text-xs leading-5 text-slate-500">Maximum 600 characters per generation. Three generations per account per UTC day, subject to shared Preview capacity. Failed provider requests may still count toward the limit.</p>
    <button type="button" disabled={busy||!script.trim()||script.trim().length>600} onClick={generate} className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Generating narration…":"Generate AI voice-over"}</button>
    {script.trim().length>600&&<p className="mt-2 text-xs text-amber-700">Shorten your script to 600 characters to generate AI audio. Browser preview can read longer scripts.</p>}
    {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {audioUrl&&<div className="mt-5 space-y-3"><p role="status" className="text-sm font-semibold text-emerald-700">Narration ready</p><audio controls src={audioUrl} className="w-full"/><button type="button" onClick={downloadAudio} className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Download MP3</button><button type="button" onClick={insertIntoEditor} className="w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-semibold text-white">Add to Video Editor</button></div>}
   </section>
  </div>
  <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
   <h2 className="text-sm font-semibold">Free browser voice preview</h2>
   <p className="mt-1 text-xs text-slate-500">Uses installed device voices. Does not generate a downloadable file or consume AI generation quota.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
    <select aria-label="Browser voice" value={browserVoice} onChange={e=>setBrowserVoice(e.target.value)} disabled={!supported} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-sm"><option value="">System default</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select>
    <label className="text-xs text-slate-600">Speed: {rate.toFixed(1)}×<input type="range" min=".6" max="1.5" step=".1" value={rate} onChange={e=>setRate(Number(e.target.value))} className="mt-3 w-full accent-blue-600"/></label>
   </div>
   <div className="mt-4 flex gap-2"><button type="button" disabled={!supported||!script.trim()} onClick={preview} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-40">Preview voice</button><button type="button" disabled={!speaking} onClick={stop} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">Stop</button></div>
  </section>
  <p className="mt-6 text-sm text-slate-600">Already have an audio file? <Link href="/video-editor" className="font-semibold text-blue-700 underline">Open Video Editor</Link> and import it directly.</p>
 </div>;
}
