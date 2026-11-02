import { NextRequest, NextResponse } from "next/server";
import { account, apiError, ApiError, body } from "@/lib/projects/api";
export const runtime = "nodejs";
const voices = ["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer"] as const;
export async function POST(request: NextRequest) {
 try {
  const { client } = await account(request);
  const input = await body(request);
  const script = typeof input.script === "string" ? input.script.trim() : "";
  const voice = typeof input.voice === "string" ? input.voice : "coral";
  if (!script || script.length > 600) throw new ApiError(400,"Enter 1–600 characters for AI narration.");
  if (!voices.some(v=>v===voice)) throw new ApiError(400,"Choose a supported AI voice.");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ApiError(503,"Speech generation is not configured.");
  // Atomic quota reservation also imposes a global daily service limit.
  const { error: quotaError } = await client.rpc("reserve_ai_voiceover", { p_characters: script.length });
  if (quotaError) throw new ApiError(429,quotaError.message.includes("limit")||quotaError.message.includes("capacity")?quotaError.message:"Unable to reserve today's voice quota.");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  let response:Response;
  try {
   response=await fetch("https://api.openai.com/v1/audio/speech",{
    method:"POST",signal:controller.signal,
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model:"gpt-4o-mini-tts",voice,input:script,response_format:"mp3"})
   });
  }catch{throw new ApiError(502,"Speech provider is unavailable. Please try again later.");}
  finally{clearTimeout(timeout);}
  if(!response.ok)throw new ApiError(502,"Speech generation failed. Please try again later.");
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength===0||bytes.byteLength>8_000_000)throw new ApiError(502,"Speech provider returned an invalid audio file.");
  return new NextResponse(bytes,{status:200,headers:{"Content-Type":"audio/mpeg","Content-Disposition":"attachment; filename=\"econtent-ai-voiceover.mp3\"","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){return apiError(error);}
}
export async function GET(){return NextResponse.json({available:!!process.env.OPENAI_API_KEY,dailyLimit:3,maxCharacters:600},{headers:{"Cache-Control":"private, no-store"}});}
