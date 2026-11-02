import { NextResponse } from "next/server";

// Generation stays disabled until authenticated usage accounting and spending
// limits are deployed. Do not send requests to a paid provider from this route.
export async function GET() {
  return NextResponse.json(
    { available: false, message: "AI audio generation is coming soon. Browser voice preview is available." },
    { headers: { "Cache-Control": "no-store" } }
  );
}
