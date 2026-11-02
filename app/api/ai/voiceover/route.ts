import { NextRequest, NextResponse } from "next/server";
import { account, apiError, ApiError, body } from "@/lib/projects/api";

// This endpoint deliberately does not call a billable speech provider.
// Enable generation only after persistent per-user quotas and budget controls exist.
export async function POST(request: NextRequest) {
  try {
    await account(request);
    const input = await body(request);
    const script = typeof input.script === "string" ? input.script.trim() : "";
    const voice = typeof input.voice === "string" ? input.voice : "coral";
    if (!script || script.length > 800) throw new ApiError(400, "Enter between 1 and 800 characters.");
    if (!["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"].includes(voice))
      throw new ApiError(400, "Unsupported voice selection.");
    return NextResponse.json({ error: "Audio generation is not enabled until usage limits are configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function GET() {
  return NextResponse.json(
    { available: false, message: "AI audio generation is coming soon. Browser voice preview is available." },
    { headers: { "Cache-Control": "no-store" } }
  );
}
