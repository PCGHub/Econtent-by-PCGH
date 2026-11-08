import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

export class BillingApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function billingAccount() {
  const client = await serverSupabase();
  if (!client) throw new BillingApiError(503, "Account services are unavailable");
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at) throw new BillingApiError(401, "Verified sign-in required");
  return { client, user };
}

export async function billingBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json"))
    throw new BillingApiError(415, "JSON required");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16_384) throw new BillingApiError(413, "Billing request is too large");
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BillingApiError(400, "Invalid billing request");
  return value as Record<string, unknown>;
}

export function billingError(error: unknown) {
  if (error instanceof BillingApiError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "Billing request failed";
  const insufficient = message.includes("Insufficient credits");
  return NextResponse.json(
    { error: insufficient ? "Insufficient credits" : "Billing request could not be completed" },
    { status: insufficient ? 402 : 400 },
  );
}

