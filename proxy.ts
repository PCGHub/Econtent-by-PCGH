import type {Database} from "./lib/supabase/database.types";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./lib/supabase/config";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  const config = supabaseConfig();
  if (!config) return response;
  const client = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        const next = NextResponse.next({ request });
        response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
        response.headers.forEach((value, key) => next.headers.set(key, value));
        values.forEach(({ name, value, options }) =>
          next.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          next.headers.set(key, value),
        );
        response = next;
      },
    },
  });
  await client.auth.getClaims();
  return response;
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/api/projects/:path*",
    "/auth/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
