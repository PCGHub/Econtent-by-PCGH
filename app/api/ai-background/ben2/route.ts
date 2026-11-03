import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const model = "fal-ai/ben/v2/video";
const base = "https://queue.fal.run";
function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
async function authorized() {
  const supabase = await serverSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getUser();
  return !error && Boolean(data.user);
}
function key() { return process.env.FAL_KEY?.trim(); }
function previewOnly() { return process.env.VERCEL_ENV === "preview"; }
function validUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const u = new URL(value); return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password; }
  catch { return false; }
}
export async function GET(request: NextRequest) {
  if (!previewOnly()) return jsonError("BEN2 integration is enabled on Preview only.", 403);
  if (!(await authorized())) return jsonError("Sign in before accessing the paid test.", 401);
  if (!key()) return jsonError("FAL_KEY is not configured for this Preview deployment.", 503);
  const requestId = request.nextUrl.searchParams.get("requestId");
  if (!requestId) return NextResponse.json({ configured: true, model, chargingEnabled: true });
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) return jsonError("Invalid request ID.", 400);
  const endpoint = request.nextUrl.searchParams.get("result") === "true" ? `${base}/${model}/requests/${requestId}` : `${base}/${model}/requests/${requestId}/status`;
  const result = await fetch(endpoint, {
    headers: { Authorization: `Key ${key()}` }, cache: "no-store",
  });
  if (!result.ok) return jsonError("fal.ai status request failed.", 502);
  return NextResponse.json(await result.json(), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  if (!previewOnly()) return jsonError("BEN2 paid tests are disabled outside Preview.", 403);
  if (!(await authorized())) return jsonError("Sign in before submitting a paid test.", 401);
  const apiKey = key();
  if (!apiKey) return jsonError("FAL_KEY is not configured for this Preview deployment.", 503);
  let input: { video_url?: unknown; confirmCharge?: unknown; background_color?: unknown };
  try { input = await request.json(); } catch { return jsonError("Invalid JSON.", 400); }
  if (input.confirmCharge !== true) return jsonError("Explicit paid-request confirmation is required.", 400);
  if (!validUrl(input.video_url)) return jsonError("Provide a publicly accessible HTTPS video URL.", 400);
  const color = input.background_color;
  if (color !== undefined && (!Array.isArray(color) || color.length !== 3 || color.some(n => !Number.isInteger(n) || n < 0 || n > 255)))
    return jsonError("Invalid RGB background colour.", 400);
  const response = await fetch(`${base}/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: input.video_url, output_format: "mp4", ...(color ? { background_color: color } : {}) }),
    cache: "no-store",
  });
  if (!response.ok) return jsonError("BEN2 request was rejected by fal.ai. No completed output was returned.", 502);
  const result = await response.json();
  return NextResponse.json({ requestId: result.request_id, status: result.status ?? "IN_QUEUE" }, { headers: { "Cache-Control": "no-store" } });
}
