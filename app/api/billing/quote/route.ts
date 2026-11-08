import { NextResponse } from "next/server";
import { billingAccount, billingBody, billingError, BillingApiError } from "@/lib/billing/api";

export async function POST(request: Request) {
  try {
    const { client } = await billingAccount();
    const body = await billingBody(request);
    const durationSeconds = Number(body.durationSeconds);
    const featureKeys = body.featureKeys;
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86_400 ||
      !Array.isArray(featureKeys) || featureKeys.some((key) => typeof key !== "string") || featureKeys.length > 20)
      throw new BillingApiError(400, "Invalid export quote");
    const { data, error } = await client.rpc("quote_export_credits", {
      duration_seconds: durationSeconds,
      feature_keys: featureKeys,
    });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingError(error); }
}

