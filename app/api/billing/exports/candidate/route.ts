import { NextResponse } from "next/server";
import { billingAccount, billingBody, billingError, BillingApiError } from "@/lib/billing/api";

export async function POST(request: Request) {
  try {
    const { client } = await billingAccount();
    const body = await billingBody(request);
    if (typeof body.exportId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.exportId) ||
      typeof body.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(body.sha256) ||
      !Number.isSafeInteger(body.sizeBytes) || Number(body.sizeBytes) < 1 ||
      !Number.isInteger(body.durationMs) || Number(body.durationMs) < 1)
      throw new BillingApiError(400, "Invalid export candidate");
    const { data, error } = await client.rpc("submit_export_candidate", {
      export_id: body.exportId,
      sha256: body.sha256,
      size_bytes: Number(body.sizeBytes),
      duration_ms: Number(body.durationMs),
    });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingError(error); }
}

