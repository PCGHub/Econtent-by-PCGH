import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "../supabase/server";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export async function account(request: NextRequest) {
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    throw new ApiError(403, "This request must originate from this workspace.");
  const client = await serverSupabase();
  if (!client)
    throw new ApiError(
      503,
      "Cloud accounts are not configured. Guest editing remains available.",
    );
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at || user.is_anonymous)
    throw new ApiError(
      401,
      "Sign in with a verified email to use saved projects.",
    );
  return { client, user };
}
export async function body(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "Send project settings as JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Missing project settings");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new ApiError(
          413,
          "Project settings exceed the limit. Videos must remain local.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new ApiError(400, "Invalid project JSON");
  }
}
export function apiError(error: unknown) {
  return json(
    {
      error:
        error instanceof ApiError
          ? error.message
          : "Unable to access saved projects. Please try again.",
    },
    error instanceof ApiError ? error.status : 503,
  );
}
export function validation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "Invalid settings",
    );
  }
}
