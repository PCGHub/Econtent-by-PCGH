import { NextResponse } from "next/server";
import { billingAccount, billingBody, billingError, BillingApiError } from "@/lib/billing/api";
import { exportBillingEnabled } from "@/lib/billing/server";

export async function POST(request: Request) {
  try {
    if (!exportBillingEnabled()) throw new BillingApiError(503, "Paid exports are not activated");
    const { client } = await billingAccount();
    const body = await billingBody(request);
    if (typeof body.clientRequestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.clientRequestId) ||
      !Number.isInteger(body.durationSeconds) || typeof body.durationSeconds !== "number" ||
      body.durationSeconds < 1 || body.durationSeconds > 86_400 ||
      (body.projectId !== undefined && (typeof body.projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.projectId))) ||
      (body.featureKeys !== undefined && (!Array.isArray(body.featureKeys) || body.featureKeys.some((key) => typeof key !== "string"))))
      throw new BillingApiError(400, "Invalid export reservation");
    const { data, error } = await client.rpc("reserve_export_credits", {
      client_request_id: body.clientRequestId,
      duration_seconds: body.durationSeconds,
      feature_keys: body.featureKeys ?? ["basic_export"],
      project_id: body.projectId ?? null,
    });
    if (error) throw error;
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingError(error); }
}

