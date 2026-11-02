"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function VoiceoverStudio() {
 const [script,setScript]=useState("");
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
 const [selected,setSelected]=useState("");
 const [rate,setRate]=useState(1);
 const [speaking,setSpeaking]=useState(false);
 const [supported,setSupported]=useState(false);
 useEffect(()=>{
  if (!("speechSynthesis" in window)) return;
  const synth=window.speechSynthesis;
  const update=()=>setVoices(synth.getVoices());
  setSupported(true); update(); synth.addEventListener("voiceschanged",update);
  return ()=>{synth.cancel();synth.removeEventListener("voiceschanged",update)};
 },[]);
 function stop(){window.speechSynthesis.cancel();setSpeaking(false)}
 function preview(){
  if(!script.trim()||!supported)return;
  stop();
  const utterance=new SpeechSynthesisUtterance(script.trim());
  utterance.rate=rate;
  const voice=voices.find(v=>v.voiceURI===selected);
  if(voice)utterance.voice=voice;
  utterance.onend=()=>setSpeaking(false);
  utterance.onerror=()=>setSpeaking(false);
  setSpeaking(true);
  window.speechSynthesis.speak(utterance);
 }
 return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
  <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">AI Studio / Voice-over</p>
  <h1 className="mt-2 text-3xl font-semibold text-slate-900">Voice-over Studio</h1>
  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Write narration and listen to a voice preview using voices installed in your browser. This is the first-stage preview; downloadable AI narration and timeline insertion require a speech-generation provider and are not active yet.</p>
  <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
   <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <label htmlFor="voice-script" className="text-sm font-semibold">Narration script</label>
    <textarea id="voice-script" value={script} maxLength={5000} onChange={e=>setScript(e.target.value)} placeholder="Write or paste the words you want narrated..." rows={11} className="mt-3 w-full resize-y rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
    <p className="mt-2 text-right text-xs text-slate-500">{script.length} / 5,000 characters</p>
   </section>
   <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-sm font-semibold">Voice settings</h2>
    <label htmlFor="voice-choice" className="mt-5 block text-xs font-medium text-slate-600">Available browser voice</label>
    <select id="voice-choice" value={selected} onChange={e=>setSelected(e.target.value)} disabled={!supported} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm"><option value="">System default</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select>
    <label htmlFor="voice-rate" className="mt-5 block text-xs font-medium text-slate-600">Speaking speed: {rate.toFixed(1)}×</label>
    <input id="voice-rate" type="range" min="0.6" max="1.5" step="0.1" value={rate} onChange={e=>setRate(Number(e.target.value))} className="mt-3 w-full accent-blue-600"/>
    <div className="mt-6 flex flex-wrap gap-2">
     <button type="button" disabled={!supported||!script.trim()} onClick={preview} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Preview voice</button>
     <button type="button" disabled={!speaking} onClick={stop} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-40">Stop</button>
    </div>
    {!supported&&<p role="status" className="mt-4 text-xs text-amber-700">Speech preview is unavailable in this browser.</p>}
    <p className="mt-5 text-xs leading-5 text-slate-500">Preview uses your device's speech engine. It does not create an audio file, consume credits, or upload your script.</p>
   </section>
  </div>
  <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-900"><strong>Coming next:</strong> Generate downloadable narration, add it to the Video Editor timeline, and manage generation limits. <Link href="/video-editor" className="font-semibold underline">Open Video Editor</Link></div>
 </div>;
}
