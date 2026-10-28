import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/navigation";
export async function GET(request: NextRequest) {
  const client = await serverSupabase();
  const code = request.nextUrl.searchParams.get("code");
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  let error = true;
  if (client) {
    if (code) {
      const result = await client.auth.exchangeCodeForSession(code);
      error = !!result.error;
    } else if (token && (type === "email" || type === "recovery")) {
      const result = await client.auth.verifyOtp({ token_hash: token, type });
      error = !!result.error;
    }
  }
  const response = NextResponse.redirect(
    new URL(
      error
        ? "/login?error=expired-link"
        : type === "recovery"
          ? "/reset-password"
          : next,
      request.url,
    ),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const dynamic = "force-dynamic";
